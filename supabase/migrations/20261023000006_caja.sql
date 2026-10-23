-- =====================================================================
-- LAS MELLIS — INGRESOS Y EGRESOS (CAJA)
--
-- Movimientos de plata que no salen de una venta: lo que se gasta
-- (mercadería, nafta, envíos, bolsas...) y algún ingreso extra. El
-- informe los junta con lo cobrado (pagos de ventas y de cuentas
-- corrientes), que se suma solo.
--
-- La fecha es un día (sin hora): es lo que se elige en el formulario.
-- =====================================================================

create table if not exists movimientos_caja (
    id bigserial primary key,
    tipo varchar(10) not null check (tipo in ('ingreso', 'egreso')),
    fecha date not null,
    monto numeric(12, 2) not null check (monto > 0),
    categoria varchar(50) not null,
    descripcion varchar(255),
    created_at timestamp(0) not null default (now() at time zone 'utc'),
    updated_at timestamp(0)
);
create index if not exists movimientos_caja_fecha_index on movimientos_caja (fecha);

alter table movimientos_caja enable row level security;
drop policy if exists "usuarios logueados" on movimientos_caja;
create policy "usuarios logueados" on movimientos_caja
    for all to authenticated
    using (true) with check (true);
grant select, insert, update, delete on movimientos_caja to authenticated;
grant usage, select on sequence movimientos_caja_id_seq to authenticated;
revoke all on movimientos_caja from anon;


-- ---------------------------------------------------------------------
-- INFORME
--
-- Entre dos días (inclusive, hora argentina):
--   cobrado_ventas      pagos hechos al momento de vender
--   cobrado_cuentas     pagos de cuentas corrientes
--   ingresos / egresos  cargados a mano, agrupados por categoría
--   movimientos         los cargados a mano, del más nuevo al más viejo
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
        coalesce(sum(monto) filter (where venta_id is not null), 0),
        coalesce(sum(monto) filter (where venta_id is null), 0)
    into v_cobrado_ventas, v_cobrado_cuentas
    from pagos
    where a_hora_argentina(fecha)::date between p_desde and p_hasta;

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
