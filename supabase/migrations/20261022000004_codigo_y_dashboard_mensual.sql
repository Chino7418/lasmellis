-- =====================================================================
-- LAS MELLIS — CÓDIGO INTERNO AUTOMÁTICO Y DASHBOARD MENSUAL
-- =====================================================================


-- ---------------------------------------------------------------------
-- CÓDIGO INTERNO AUTOINCREMENTAL
--
-- Los productos nuevos reciben P00001, P00002, ... automáticamente.
-- ---------------------------------------------------------------------
create sequence if not exists productos_codigo_seq;

-- Si ya hubiera productos con códigos de este formato, la secuencia
-- arranca después del mayor.
select setval(
    'productos_codigo_seq',
    greatest(
        coalesce((
            select max(substring(codigo_interno from 2)::bigint)
            from productos
            where codigo_interno ~ '^P[0-9]+$'
        ), 0),
        1
    ),
    exists (select 1 from productos where codigo_interno ~ '^P[0-9]+$')
);

alter table productos
    alter column codigo_interno
    set default ('P' || lpad(nextval('productos_codigo_seq')::text, 5, '0'));

grant usage, select on sequence productos_codigo_seq to authenticated;


-- ---------------------------------------------------------------------
-- Fecha guardada (UTC sin zona) -> hora de Argentina sin zona.
-- ---------------------------------------------------------------------
create or replace function a_hora_argentina(p_fecha timestamp)
returns timestamp
language sql
immutable
as $$
    select (p_fecha at time zone 'utc') at time zone 'America/Argentina/Buenos_Aires';
$$;


-- ---------------------------------------------------------------------
-- DASHBOARD
--
-- Agrega al resumen anterior:
--   mes_actual    -> ventas y monto del mes en curso
--   por_mes       -> últimos 12 meses (incluye meses sin ventas)
--   total_general -> todo lo vendido desde el principio
--   sin_stock     -> variantes activas con stock 0 (aviso en la app)
-- ---------------------------------------------------------------------
create or replace function dashboard_resumen()
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
    v_hoy timestamp := inicio_hoy_utc();
    v_ahora_ar timestamp := now() at time zone 'America/Argentina/Buenos_Aires';
    v_mes_ar timestamp := date_trunc('month', v_ahora_ar);
    v_cantidad bigint;
    v_total numeric;
    v_cobrado numeric;
    v_stock_bajo jsonb;
    v_sin_stock jsonb;
    v_deudores jsonb;
    v_total_deuda numeric;
    v_ultimas jsonb;
    v_mes_actual jsonb;
    v_por_mes jsonb;
    v_total_general jsonb;
begin
    -- VENTAS DE HOY
    select count(*), coalesce(sum(total), 0)
    into v_cantidad, v_total
    from ventas
    where fecha >= v_hoy and estado = 'completada';

    -- COBRADO (pagos asociados a ventas de hoy)
    select coalesce(sum(p.monto), 0)
    into v_cobrado
    from pagos p
    join ventas v on v.id = p.venta_id
    where v.fecha >= v_hoy and v.estado = 'completada';

    -- MES EN CURSO
    select jsonb_build_object(
        'cantidad', count(*),
        'total', coalesce(sum(total), 0)::float8
    )
    into v_mes_actual
    from ventas
    where estado = 'completada'
      and a_hora_argentina(fecha) >= v_mes_ar;

    -- ÚLTIMOS 12 MESES (con ceros para los meses sin ventas)
    select coalesce(jsonb_agg(jsonb_build_object(
        'mes', to_char(m.mes, 'YYYY-MM'),
        'cantidad', coalesce(t.cantidad, 0),
        'total', coalesce(t.total, 0)::float8
    ) order by m.mes), '[]'::jsonb)
    into v_por_mes
    from generate_series(v_mes_ar - interval '11 months', v_mes_ar, interval '1 month') as m(mes)
    left join (
        select date_trunc('month', a_hora_argentina(fecha)) as mes,
               count(*) as cantidad,
               sum(total) as total
        from ventas
        where estado = 'completada'
        group by 1
    ) t on t.mes = m.mes;

    -- TOTAL HISTÓRICO
    select jsonb_build_object(
        'cantidad', count(*),
        'total', coalesce(sum(total), 0)::float8
    )
    into v_total_general
    from ventas
    where estado = 'completada';

    -- STOCK BAJO (en o por debajo del mínimo)
    select coalesce(jsonb_agg(jsonb_build_object(
        'id', s.id,
        'variante_producto_id', s.variante_producto_id,
        'deposito_id', s.deposito_id,
        'cantidad', s.cantidad,
        'stock_minimo', s.stock_minimo,
        'producto', pr.nombre
    )), '[]'::jsonb)
    into v_stock_bajo
    from stock s
    join variantes_productos vp on vp.id = s.variante_producto_id
    join productos pr on pr.id = vp.producto_id
    where s.cantidad <= s.stock_minimo;

    -- SIN STOCK (variantes activas de productos activos con stock 0)
    select coalesce(jsonb_agg(jsonb_build_object(
        'variante_id', vp.id,
        'producto_id', pr.id,
        'producto', pr.nombre,
        'color', co.nombre,
        'talle', ta.nombre
    ) order by pr.nombre), '[]'::jsonb)
    into v_sin_stock
    from variantes_productos vp
    join productos pr on pr.id = vp.producto_id
    left join colores co on co.id = vp.color_id
    left join talles ta on ta.id = vp.talle_id
    where vp.activo
      and pr.activo
      and coalesce((
          select sum(s.cantidad) from stock s where s.variante_producto_id = vp.id
      ), 0) <= 0;

    -- CLIENTES CON DEUDA
    select coalesce(jsonb_agg(jsonb_build_object(
        'id', c.id,
        'nombre', c.nombre,
        'apellido', c.apellido,
        'saldo', c.saldo
    ) order by c.saldo desc), '[]'::jsonb)
    into v_deudores
    from clientes_con_saldo c
    where c.activo and c.saldo > 0;

    select coalesce(sum(
        case
            when tipo = 'debe' then importe
            when tipo = 'haber' then -importe
            else 0
        end
    ), 0)
    into v_total_deuda
    from movimientos_cuenta_corriente;

    -- ÚLTIMAS VENTAS
    select coalesce(jsonb_agg(u order by u.fecha desc), '[]'::jsonb)
    into v_ultimas
    from (
        select
            v.id,
            v.numero,
            (v.fecha at time zone 'utc') as fecha,
            nullif(trim(coalesce(c.nombre, '') || ' ' || coalesce(c.apellido, '')), '') as cliente,
            v.total::float8 as total,
            v.tipo_pago
        from ventas v
        left join clientes c on c.id = v.cliente_id
        where v.estado = 'completada'
        order by v.fecha desc, v.id desc
        limit 10
    ) u;

    return jsonb_build_object(
        'fecha', to_char(v_ahora_ar, 'YYYY-MM-DD'),
        'ventas', jsonb_build_object(
            'cantidad', v_cantidad,
            'total', v_total::float8,
            'cobrado', v_cobrado::float8,
            'pendiente', greatest(0, v_total - v_cobrado)::float8
        ),
        'mes_actual', v_mes_actual,
        'por_mes', v_por_mes,
        'total_general', v_total_general,
        'stock', jsonb_build_object(
            'productos_stock_bajo', jsonb_array_length(v_stock_bajo),
            'detalle', v_stock_bajo,
            'sin_stock', v_sin_stock
        ),
        'cuenta_corriente', jsonb_build_object(
            'clientes_con_deuda', jsonb_array_length(v_deudores),
            'total_deuda', v_total_deuda::float8,
            'detalle', v_deudores
        ),
        'ultimas_ventas', v_ultimas
    );
end;
$$;


-- ---------------------------------------------------------------------
-- CANTIDAD DE VARIANTES SIN STOCK (para el aviso del menú)
-- ---------------------------------------------------------------------
create or replace function contar_sin_stock()
returns bigint
language sql
stable
security invoker
set search_path = public
as $$
    select count(*)
    from variantes_productos vp
    join productos pr on pr.id = vp.producto_id
    where vp.activo
      and pr.activo
      and coalesce((
          select sum(s.cantidad) from stock s where s.variante_producto_id = vp.id
      ), 0) <= 0;
$$;

revoke execute on function contar_sin_stock() from public, anon;
grant execute on function contar_sin_stock() to authenticated;
revoke execute on function a_hora_argentina(timestamp) from public, anon;
grant execute on function a_hora_argentina(timestamp) to authenticated;
