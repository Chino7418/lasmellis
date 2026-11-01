-- =====================================================================
-- LAS MELLIS — HISTORIAL Y ANULACIÓN DE VENTAS
--
-- Una venta no se borra: se marca como "anulada" para no perder el
-- historial. Al anularla:
--
--   * El stock vuelve al depósito (con su movimiento de entrada).
--   * Si había quedado deuda en la cuenta corriente, se cancela con un
--     movimiento "haber" por el mismo importe.
--   * Lo que se cobró al vender se considera devuelto: deja de sumar en
--     el informe de ingresos y egresos.
--
-- El dashboard ya cuenta solo las ventas "completada", así que las
-- anuladas desaparecen de los totales sin tocar nada más.
-- =====================================================================

alter table ventas add column if not exists anulada_at timestamp(0);
alter table ventas add column if not exists motivo_anulacion varchar(255);


-- ---------------------------------------------------------------------
-- LISTAR VENTAS
--
-- Las ventas entre dos días (inclusive, hora argentina), de la más
-- nueva a la más vieja, con sus productos y pagos.
-- ---------------------------------------------------------------------
create or replace function listar_ventas(p_desde date, p_hasta date)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
    select coalesce(jsonb_agg(v order by v.fecha desc, v.id desc), '[]'::jsonb)
    from (
        select
            ve.id,
            ve.numero,
            -- Con zona horaria, para que el navegador la muestre en hora local.
            (ve.fecha at time zone 'utc') as fecha,
            ve.total::float8 as total,
            ve.descuento::float8 as descuento,
            ve.tipo_pago,
            ve.estado,
            ve.observaciones,
            (ve.anulada_at at time zone 'utc') as anulada_at,
            ve.motivo_anulacion,
            nullif(trim(coalesce(c.nombre, '') || ' ' || coalesce(c.apellido, '')), '') as cliente,
            coalesce((
                select jsonb_agg(jsonb_build_object(
                    'id', d.id,
                    'producto', concat_ws(' - ', m.nombre, pr.nombre, nullif(trim(pr.descripcion), '')),
                    'variante', nullif(concat_ws(' / ', co.nombre, ta.nombre), ''),
                    'cantidad', d.cantidad::float8,
                    'precio_unitario', d.precio_unitario::float8,
                    'subtotal', d.subtotal::float8
                ) order by d.id)
                from detalle_ventas d
                join variantes_productos vp on vp.id = d.variante_producto_id
                join productos pr on pr.id = vp.producto_id
                left join marcas m on m.id = pr.marca_id
                left join colores co on co.id = vp.color_id
                left join talles ta on ta.id = vp.talle_id
                where d.venta_id = ve.id
            ), '[]'::jsonb) as detalles,
            coalesce((
                select jsonb_agg(jsonb_build_object(
                    'medio_pago', p.medio_pago,
                    'monto', p.monto::float8
                ) order by p.id)
                from pagos p
                where p.venta_id = ve.id
            ), '[]'::jsonb) as pagos
        from ventas ve
        left join clientes c on c.id = ve.cliente_id
        where a_hora_argentina(ve.fecha)::date between p_desde and p_hasta
    ) v;
$$;

revoke execute on function listar_ventas(date, date) from public, anon;
grant execute on function listar_ventas(date, date) to authenticated;


-- ---------------------------------------------------------------------
-- ANULAR VENTA
-- ---------------------------------------------------------------------
create or replace function anular_venta(p_venta_id bigint, p_motivo text default null)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_ahora timestamp := ahora_utc();
    v_motivo text := nullif(left(trim(coalesce(p_motivo, '')), 255), '');
    v_venta ventas;
    v_detalle detalle_ventas;
    v_deuda numeric(12, 2);
begin
    -- Bloqueamos la venta para que no se anule dos veces a la vez.
    select * into v_venta
    from ventas
    where id = p_venta_id
    for update;

    if not found then
        raise exception 'La venta no existe.';
    end if;

    if v_venta.estado = 'anulada' then
        raise exception 'La venta % ya estaba anulada.', v_venta.numero;
    end if;

    -- -------------------------------------------------------------
    -- STOCK: vuelve todo al depósito de la venta.
    -- Ordenado por variante, igual que registrar_venta (evita deadlocks).
    -- -------------------------------------------------------------
    for v_detalle in
        select *
        from detalle_ventas
        where venta_id = v_venta.id
        order by variante_producto_id
    loop
        insert into stock (variante_producto_id, deposito_id, cantidad)
        values (v_detalle.variante_producto_id, v_venta.deposito_id, v_detalle.cantidad)
        on conflict (variante_producto_id, deposito_id)
        do update set cantidad = stock.cantidad + excluded.cantidad;

        insert into movimientos_stock (
            variante_producto_id, deposito_id, tipo, cantidad, motivo,
            referencia_id, observaciones
        )
        values (
            v_detalle.variante_producto_id, v_venta.deposito_id, 'entrada',
            v_detalle.cantidad, 'Anulación de venta', v_venta.id,
            'Entrada por anulación de la venta ' || v_venta.numero
        );
    end loop;

    -- -------------------------------------------------------------
    -- CUENTA CORRIENTE: se cancela la deuda que generó la venta.
    -- -------------------------------------------------------------
    select coalesce(sum(
        case
            when tipo = 'debe' then importe
            when tipo = 'haber' then -importe
            else 0
        end
    ), 0)
    into v_deuda
    from movimientos_cuenta_corriente
    where venta_id = v_venta.id;

    if v_deuda > 0 then
        insert into movimientos_cuenta_corriente (
            cliente_id, venta_id, pago_id, tipo, importe, fecha, concepto, observaciones
        )
        values (
            v_venta.cliente_id, v_venta.id, null, 'haber', v_deuda, v_ahora,
            'Anulación venta ' || v_venta.numero, v_motivo
        );
    end if;

    update ventas
    set estado = 'anulada',
        anulada_at = v_ahora,
        motivo_anulacion = v_motivo
    where id = v_venta.id
    returning * into v_venta;

    return to_jsonb(v_venta);
end;
$$;

revoke execute on function anular_venta(bigint, text) from public, anon;
grant execute on function anular_venta(bigint, text) to authenticated;


-- ---------------------------------------------------------------------
-- INFORME DE CAJA: lo cobrado en ventas anuladas no cuenta.
-- (Igual al de 20261023000006_caja.sql salvo por ese filtro.)
-- ---------------------------------------------------------------------
create or replace function informe_caja(p_desde date, p_hasta date)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
    v_cobrado_ventas numeric;
    v_cobrado_cuentas numeric;
    v_otros_ingresos numeric;
    v_egresos numeric;
begin
    if p_desde is null or p_hasta is null or p_desde > p_hasta then
        raise exception 'Elegí un período válido.';
    end if;

    select
        coalesce(sum(p.monto) filter (where p.venta_id is not null), 0),
        coalesce(sum(p.monto) filter (where p.venta_id is null), 0)
    into v_cobrado_ventas, v_cobrado_cuentas
    from pagos p
    left join ventas v on v.id = p.venta_id
    where a_hora_argentina(p.fecha)::date between p_desde and p_hasta
      and (v.id is null or v.estado <> 'anulada');

    select
        coalesce(sum(monto) filter (where tipo = 'ingreso'), 0),
        coalesce(sum(monto) filter (where tipo = 'egreso'), 0)
    into v_otros_ingresos, v_egresos
    from movimientos_caja
    where fecha between p_desde and p_hasta;

    return jsonb_build_object(
        'cobrado_ventas', v_cobrado_ventas,
        'cobrado_cuentas', v_cobrado_cuentas,
        'otros_ingresos', v_otros_ingresos,
        'total_ingresos', v_cobrado_ventas + v_cobrado_cuentas + v_otros_ingresos,
        'total_egresos', v_egresos,
        'resultado', v_cobrado_ventas + v_cobrado_cuentas + v_otros_ingresos - v_egresos,
        'por_categoria', coalesce((
            select jsonb_agg(jsonb_build_object(
                'tipo', tipo, 'categoria', categoria, 'total', total
            ) order by tipo, total desc)
            from (
                select tipo, categoria, sum(monto) as total
                from movimientos_caja
                where fecha between p_desde and p_hasta
                group by tipo, categoria
            ) c
        ), '[]'::jsonb),
        'movimientos', coalesce((
            select jsonb_agg(to_jsonb(m) order by m.fecha desc, m.id desc)
            from movimientos_caja m
            where m.fecha between p_desde and p_hasta
        ), '[]'::jsonb)
    );
end;
$$;

revoke execute on function informe_caja(date, date) from public, anon;
grant execute on function informe_caja(date, date) to authenticated;
