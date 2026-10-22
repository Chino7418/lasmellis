-- =====================================================================
-- LAS MELLIS — LÓGICA DE NEGOCIO
--
-- Reemplaza a VentaController, CuentaCorrienteController,
-- ClienteController@index y DashboardController de Laravel.
--
-- Todo lo que tiene que ser atómico (descontar stock, registrar pagos,
-- generar deuda) vive acá, en funciones de Postgres, y NUNCA en el
-- navegador. Cada función corre en una sola transacción: si algo falla,
-- no se guarda nada.
--
-- Las funciones son "security invoker": corren con los permisos del
-- usuario logueado, así que respetan las políticas RLS.
-- =====================================================================


-- ---------------------------------------------------------------------
-- Hora actual en UTC sin zona (el formato en que se guardan las fechas)
-- ---------------------------------------------------------------------
create or replace function ahora_utc()
returns timestamp
language sql
stable
as $$
    select (now() at time zone 'utc')::timestamp(0);
$$;


-- ---------------------------------------------------------------------
-- Inicio del día de hoy en Argentina, expresado en UTC sin zona.
-- (Laravel usaba el día UTC, que en Argentina cambia a las 21 hs.)
-- ---------------------------------------------------------------------
create or replace function inicio_hoy_utc()
returns timestamp
language sql
stable
as $$
    select (
        date_trunc('day', now() at time zone 'America/Argentina/Buenos_Aires')
        at time zone 'America/Argentina/Buenos_Aires'
    ) at time zone 'utc';
$$;


-- ---------------------------------------------------------------------
-- CLIENTES CON SALDO DE CUENTA CORRIENTE
-- (ClienteController@index)
-- ---------------------------------------------------------------------
create or replace view clientes_con_saldo
with (security_invoker = true)
as
select
    c.*,
    coalesce((
        select sum(
            case
                when m.tipo = 'debe' then m.importe
                when m.tipo = 'haber' then -m.importe
                else 0
            end
        )
        from movimientos_cuenta_corriente m
        where m.cliente_id = c.id
    ), 0)::numeric(12, 2) as saldo
from clientes c;


-- ---------------------------------------------------------------------
-- REGISTRAR VENTA
-- (VentaController@store + VentaRequest)
--
-- Recibe:
-- {
--   "cliente_id": 1 | null,          -- null = Consumidor Final
--   "deposito_id": 1,
--   "descuento": 0,
--   "observaciones": "..." | null,
--   "detalles": [{ "variante_producto_id", "cantidad", "precio_unitario", "descuento" }],
--   "pagos":    [{ "monto", "medio_pago", "observaciones" }]
-- }
-- ---------------------------------------------------------------------
create or replace function registrar_venta(p_venta jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_cliente_id bigint := nullif(p_venta ->> 'cliente_id', '')::bigint;
    v_deposito_id bigint := nullif(p_venta ->> 'deposito_id', '')::bigint;
    v_descuento numeric(12, 2) := coalesce(nullif(p_venta ->> 'descuento', '')::numeric, 0);
    v_observaciones text := nullif(p_venta ->> 'observaciones', '');
    v_detalles jsonb := coalesce(p_venta -> 'detalles', '[]'::jsonb);
    v_pagos jsonb := coalesce(p_venta -> 'pagos', '[]'::jsonb);

    v_ahora timestamp := ahora_utc();
    v_subtotal numeric(12, 2) := 0;
    v_total numeric(12, 2);
    v_total_pagado numeric(12, 2) := 0;
    v_medios text[];
    v_tipo_pago text;
    v_numero text;
    v_venta ventas;

    v_detalle jsonb;
    v_pago jsonb;
    v_variante_id bigint;
    v_cantidad numeric;
    v_precio numeric;
    v_desc_detalle numeric;
    v_stock stock;
begin
    -- -------------------------------------------------------------
    -- VALIDACIONES
    -- -------------------------------------------------------------
    if v_deposito_id is null then
        raise exception 'Elegí un depósito.';
    end if;

    if not exists (select 1 from depositos where id = v_deposito_id) then
        raise exception 'El depósito seleccionado no existe.';
    end if;

    if v_descuento < 0 then
        raise exception 'El descuento no puede ser negativo.';
    end if;

    if jsonb_typeof(v_detalles) <> 'array' or jsonb_array_length(v_detalles) = 0 then
        raise exception 'La venta tiene que tener al menos un producto.';
    end if;

    if jsonb_typeof(v_pagos) <> 'array' then
        raise exception 'Los pagos tienen un formato inválido.';
    end if;

    for v_detalle in select * from jsonb_array_elements(v_detalles)
    loop
        if coalesce((v_detalle ->> 'cantidad')::numeric, 0) <= 0 then
            raise exception 'La cantidad de cada producto tiene que ser mayor a cero.';
        end if;

        if coalesce((v_detalle ->> 'precio_unitario')::numeric, -1) < 0 then
            raise exception 'El precio unitario no puede ser negativo.';
        end if;

        if coalesce((v_detalle ->> 'descuento')::numeric, 0) < 0 then
            raise exception 'El descuento de un producto no puede ser negativo.';
        end if;
    end loop;

    for v_pago in select * from jsonb_array_elements(v_pagos)
    loop
        if coalesce((v_pago ->> 'monto')::numeric, 0) <= 0 then
            raise exception 'El monto de cada pago tiene que ser mayor a cero.';
        end if;

        if v_pago ->> 'medio_pago' is null
            or v_pago ->> 'medio_pago' not in ('efectivo', 'transferencia', 'tarjeta_debito', 'tarjeta_credito') then
            raise exception 'Medio de pago inválido: %', coalesce(v_pago ->> 'medio_pago', '(vacío)');
        end if;
    end loop;

    -- -------------------------------------------------------------
    -- CLIENTE
    -- Si no se envía cliente_id, usamos "Consumidor Final".
    -- -------------------------------------------------------------
    if v_cliente_id is null then
        select id into v_cliente_id
        from clientes
        where nombre = 'Consumidor' and apellido = 'Final'
        order by id
        limit 1;

        if v_cliente_id is null then
            raise exception 'No existe el cliente Consumidor Final.';
        end if;
    elsif not exists (select 1 from clientes where id = v_cliente_id) then
        raise exception 'El cliente seleccionado no existe.';
    end if;

    -- -------------------------------------------------------------
    -- TOTALES
    -- -------------------------------------------------------------
    select coalesce(sum(
        (d ->> 'cantidad')::numeric * (d ->> 'precio_unitario')::numeric
        - coalesce((d ->> 'descuento')::numeric, 0)
    ), 0)
    into v_subtotal
    from jsonb_array_elements(v_detalles) d;

    v_total := v_subtotal - v_descuento;

    if v_total < 0 then
        raise exception 'El total de la venta no puede ser negativo.';
    end if;

    -- -------------------------------------------------------------
    -- TIPO DE PAGO
    -- -------------------------------------------------------------
    select coalesce(sum((p ->> 'monto')::numeric), 0),
           array_agg(distinct p ->> 'medio_pago')
    into v_total_pagado, v_medios
    from jsonb_array_elements(v_pagos) p;

    if v_total_pagado = 0 then
        v_tipo_pago := 'cuenta_corriente';
    elsif array_length(v_medios, 1) > 1 then
        v_tipo_pago := 'mixto';
    else
        v_tipo_pago := v_medios[1];
    end if;

    -- -------------------------------------------------------------
    -- CREAR VENTA
    -- -------------------------------------------------------------
    v_numero := 'V-' || to_char(v_ahora, 'YYYYMMDDHH24MISS') || '-'
        || upper(substr(md5(random()::text), 1, 4));

    insert into ventas (
        cliente_id, deposito_id, fecha, numero, subtotal, descuento,
        total, tipo_pago, estado, observaciones
    )
    values (
        v_cliente_id, v_deposito_id, v_ahora, v_numero, v_subtotal, v_descuento,
        v_total, v_tipo_pago, 'completada', v_observaciones
    )
    returning * into v_venta;

    -- -------------------------------------------------------------
    -- DETALLES Y STOCK
    -- Se recorren ordenados por variante para bloquear las filas de
    -- stock siempre en el mismo orden (evita deadlocks entre ventas
    -- simultáneas).
    -- -------------------------------------------------------------
    for v_detalle in
        select d
        from jsonb_array_elements(v_detalles) d
        order by (d ->> 'variante_producto_id')::bigint
    loop
        v_variante_id := (v_detalle ->> 'variante_producto_id')::bigint;
        v_cantidad := (v_detalle ->> 'cantidad')::numeric;
        v_precio := (v_detalle ->> 'precio_unitario')::numeric;
        v_desc_detalle := coalesce((v_detalle ->> 'descuento')::numeric, 0);

        -- Bloqueamos el stock para evitar ventas simultáneas.
        select * into v_stock
        from stock
        where variante_producto_id = v_variante_id
          and deposito_id = v_deposito_id
        for update;

        if not found then
            raise exception 'No existe stock para la variante seleccionada (ID %).', v_variante_id;
        end if;

        if v_stock.cantidad < v_cantidad then
            raise exception 'Stock insuficiente para la variante ID % (disponible: %).',
                v_variante_id, v_stock.cantidad;
        end if;

        insert into detalle_ventas (
            venta_id, variante_producto_id, cantidad, precio_unitario, descuento, subtotal
        )
        values (
            v_venta.id, v_variante_id, v_cantidad, v_precio, v_desc_detalle,
            v_cantidad * v_precio - v_desc_detalle
        );

        update stock
        set cantidad = cantidad - v_cantidad
        where id = v_stock.id;

        insert into movimientos_stock (
            variante_producto_id, deposito_id, tipo, cantidad, motivo,
            referencia_id, observaciones
        )
        values (
            v_variante_id, v_deposito_id, 'salida', v_cantidad, 'Venta',
            v_venta.id, 'Salida por venta ' || v_venta.numero
        );
    end loop;

    -- -------------------------------------------------------------
    -- PAGOS
    -- -------------------------------------------------------------
    insert into pagos (cliente_id, venta_id, fecha, monto, medio_pago, observaciones)
    select v_cliente_id, v_venta.id, v_ahora,
           (p ->> 'monto')::numeric, p ->> 'medio_pago', nullif(p ->> 'observaciones', '')
    from jsonb_array_elements(v_pagos) p;

    -- -------------------------------------------------------------
    -- CUENTA CORRIENTE
    -- Si la venta no se pagó completa, se genera deuda para el cliente.
    -- -------------------------------------------------------------
    if v_total - v_total_pagado > 0 then
        insert into movimientos_cuenta_corriente (
            cliente_id, venta_id, pago_id, tipo, importe, fecha, concepto, observaciones
        )
        values (
            v_cliente_id, v_venta.id, null, 'debe', v_total - v_total_pagado,
            v_ahora, 'Venta ' || v_venta.numero, 'Saldo pendiente de venta'
        );
    end if;

    return to_jsonb(v_venta);
end;
$$;


-- ---------------------------------------------------------------------
-- PAGAR CUENTA CORRIENTE
-- (CuentaCorrienteController@pagar)
-- ---------------------------------------------------------------------
create or replace function pagar_cuenta_corriente(
    p_cliente_id bigint,
    p_monto numeric,
    p_medio_pago text,
    p_observaciones text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_ahora timestamp := ahora_utc();
    v_saldo numeric(12, 2);
    v_pago pagos;
    v_movimiento movimientos_cuenta_corriente;
begin
    if p_monto is null or p_monto <= 0 then
        raise exception 'El monto tiene que ser mayor a cero.';
    end if;

    if coalesce(trim(p_medio_pago), '') = '' then
        raise exception 'Elegí un medio de pago.';
    end if;

    -- Bloqueamos al cliente para que dos pagos simultáneos no calculen
    -- el mismo saldo.
    perform 1 from clientes where id = p_cliente_id for update;

    if not found then
        raise exception 'El cliente no existe.';
    end if;

    select coalesce(sum(
        case
            when tipo = 'debe' then importe
            when tipo = 'haber' then -importe
            else 0
        end
    ), 0)
    into v_saldo
    from movimientos_cuenta_corriente
    where cliente_id = p_cliente_id;

    if v_saldo <= 0 then
        raise exception 'El cliente no tiene deuda pendiente.';
    end if;

    if p_monto > v_saldo then
        -- translate() pasa de 1,234.56 a 1.234,56 sin depender del
        -- idioma configurado en el servidor.
        raise exception 'El pago no puede superar el saldo pendiente de $%.',
            translate(to_char(v_saldo, 'FM999,999,990.00'), ',.', '.,');
    end if;

    insert into pagos (cliente_id, venta_id, fecha, monto, medio_pago, observaciones)
    values (
        p_cliente_id, null, v_ahora, p_monto, p_medio_pago,
        coalesce(nullif(p_observaciones, ''), 'Pago de cuenta corriente')
    )
    returning * into v_pago;

    insert into movimientos_cuenta_corriente (
        cliente_id, venta_id, pago_id, tipo, importe, fecha, concepto, observaciones
    )
    values (
        p_cliente_id, null, v_pago.id, 'haber', p_monto, v_ahora,
        'Pago de cuenta corriente', nullif(p_observaciones, '')
    )
    returning * into v_movimiento;

    return jsonb_build_object(
        'pago', to_jsonb(v_pago),
        'movimiento', to_jsonb(v_movimiento),
        'saldo_anterior', v_saldo,
        'saldo_actual', v_saldo - p_monto
    );
end;
$$;


-- ---------------------------------------------------------------------
-- DASHBOARD
-- (DashboardController@index — misma forma de respuesta)
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
    v_cantidad bigint;
    v_total numeric;
    v_cobrado numeric;
    v_stock_bajo jsonb;
    v_deudores jsonb;
    v_total_deuda numeric;
    v_ultimas jsonb;
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

    -- STOCK BAJO
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
            -- Se devuelve con zona horaria para que el navegador la
            -- convierta bien a la hora local.
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
        'fecha', to_char(now() at time zone 'America/Argentina/Buenos_Aires', 'YYYY-MM-DD'),
        'ventas', jsonb_build_object(
            'cantidad', v_cantidad,
            'total', v_total::float8,
            'cobrado', v_cobrado::float8,
            'pendiente', greatest(0, v_total - v_cobrado)::float8
        ),
        'stock', jsonb_build_object(
            'productos_stock_bajo', jsonb_array_length(v_stock_bajo),
            'detalle', v_stock_bajo
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
