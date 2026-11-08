-- =====================================================================
-- LAS MELLIS — CÓDIGO COMPARTIDO ENTRE COLORES Y "SUMAR STOCK"
--
-- 1. Algunas marcas usan el mismo código de barras para todos los
--    colores (o talles) de una prenda. Ahora el código puede repetirse
--    entre variantes del MISMO producto; entre productos distintos se
--    sigue rechazando. Al vender, si un código es de varias variantes,
--    la app pregunta cuál.
--
-- 2. sumar_stock: ingreso de mercadería a una variante que ya existe
--    (suma unidades, con su movimiento), y de paso actualiza costo y
--    precio si cambiaron.
-- =====================================================================

-- El "unique" de la columna se creó sin nombre: se busca y se borra.
do $$
declare
    v_nombre text;
begin
    select c.conname into v_nombre
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
    where c.conrelid = 'variantes_productos'::regclass
      and c.contype = 'u'
      and a.attname = 'codigo_barras'
      and array_length(c.conkey, 1) = 1;

    if v_nombre is not null then
        execute format('alter table variantes_productos drop constraint %I', v_nombre);
    end if;
end;
$$;

create index if not exists variantes_productos_codigo_barras_index
    on variantes_productos (codigo_barras);


create or replace function guardar_variante(p_variante jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_id bigint := nullif(p_variante ->> 'id', '')::bigint;
    v_producto_id bigint := nullif(p_variante ->> 'producto_id', '')::bigint;
    v_color_id bigint := nullif(p_variante ->> 'color_id', '')::bigint;
    v_talle_id bigint := nullif(p_variante ->> 'talle_id', '')::bigint;
    v_codigo text := nullif(trim(p_variante ->> 'codigo_barras'), '');
    v_precio numeric := nullif(p_variante ->> 'precio', '')::numeric;
    -- Sin costo en el pedido: al crear queda en 0, al editar no se toca.
    v_costo numeric := nullif(p_variante ->> 'costo', '')::numeric;
    v_deposito_id bigint := nullif(p_variante ->> 'deposito_id', '')::bigint;
    v_cantidad numeric := coalesce(nullif(p_variante ->> 'cantidad', '')::numeric, 0);
    v_minimo numeric := coalesce(nullif(p_variante ->> 'stock_minimo', '')::numeric, 0);
    v_activo boolean := coalesce((p_variante ->> 'activo')::boolean, true);

    v_hoy date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
    v_variante variantes_productos;
    v_precio_actual numeric;
    v_stock stock;
    v_diferencia numeric;
    v_otro text;
begin
    -- -------------------------------------------------------------
    -- VALIDACIONES
    -- -------------------------------------------------------------
    if v_producto_id is null
        or not exists (select 1 from productos where id = v_producto_id) then
        raise exception 'El producto no existe.';
    end if;

    if v_codigo is null then
        raise exception 'El código de barras es obligatorio.';
    end if;

    if length(v_codigo) > 50 then
        raise exception 'El código de barras admite hasta 50 caracteres.';
    end if;

    if v_precio is null or v_precio < 0 then
        raise exception 'Ingresá un precio válido (cero o mayor).';
    end if;

    if v_costo < 0 then
        raise exception 'Ingresá un costo válido (cero o mayor).';
    end if;

    if v_cantidad < 0 then
        raise exception 'El stock no puede ser negativo.';
    end if;

    if v_minimo < 0 then
        raise exception 'El stock mínimo no puede ser negativo.';
    end if;

    if v_deposito_id is null
        or not exists (select 1 from depositos where id = v_deposito_id) then
        raise exception 'Elegí un depósito.';
    end if;

    -- El código no puede estar en OTRO producto (en otro color o talle
    -- del mismo producto, sí).
    select p.nombre into v_otro
    from variantes_productos v
    join productos p on p.id = v.producto_id
    where v.codigo_barras = v_codigo
      and v.producto_id <> v_producto_id
    limit 1;

    if found then
        raise exception 'El código de barras % ya está usado en "%".', v_codigo, v_otro;
    end if;

    -- Una sola variante por combinación de color y talle en el producto.
    if exists (
        select 1 from variantes_productos
        where producto_id = v_producto_id
          and color_id is not distinct from v_color_id
          and talle_id is not distinct from v_talle_id
          and id is distinct from v_id
    ) then
        raise exception 'Este producto ya tiene una variante con ese color y talle.';
    end if;

    -- -------------------------------------------------------------
    -- VARIANTE
    -- -------------------------------------------------------------
    if v_id is null then
        insert into variantes_productos (producto_id, color_id, talle_id, codigo_barras, costo, activo)
        values (v_producto_id, v_color_id, v_talle_id, v_codigo, coalesce(v_costo, 0), v_activo)
        returning * into v_variante;
    else
        update variantes_productos
        set color_id = v_color_id,
            talle_id = v_talle_id,
            codigo_barras = v_codigo,
            costo = coalesce(v_costo, costo),
            activo = v_activo
        where id = v_id and producto_id = v_producto_id
        returning * into v_variante;

        if not found then
            raise exception 'La variante no existe.';
        end if;
    end if;

    -- -------------------------------------------------------------
    -- PRECIO (con historial)
    -- -------------------------------------------------------------
    select precio into v_precio_actual
    from precios_productos
    where variante_producto_id = v_variante.id and activo
    order by id desc
    limit 1;

    if v_precio_actual is distinct from v_precio then
        update precios_productos
        set activo = false, fecha_hasta = v_hoy
        where variante_producto_id = v_variante.id and activo;

        insert into precios_productos (variante_producto_id, precio, fecha_desde, activo)
        values (v_variante.id, v_precio, v_hoy, true);
    end if;

    -- -------------------------------------------------------------
    -- STOCK (con movimiento por la diferencia)
    -- -------------------------------------------------------------
    select * into v_stock
    from stock
    where variante_producto_id = v_variante.id and deposito_id = v_deposito_id
    for update;

    if not found then
        insert into stock (variante_producto_id, deposito_id, cantidad, stock_minimo)
        values (v_variante.id, v_deposito_id, v_cantidad, v_minimo);

        v_diferencia := v_cantidad;
    else
        v_diferencia := v_cantidad - v_stock.cantidad;

        update stock
        set cantidad = v_cantidad, stock_minimo = v_minimo
        where id = v_stock.id;
    end if;

    if v_diferencia <> 0 then
        insert into movimientos_stock (
            variante_producto_id, deposito_id, tipo, cantidad, motivo, observaciones
        )
        values (
            v_variante.id,
            v_deposito_id,
            case when v_diferencia > 0 then 'entrada' else 'salida' end,
            abs(v_diferencia),
            case when v_stock.id is null then 'Stock inicial' else 'Ajuste manual' end,
            'Cargado desde el formulario de variantes'
        );
    end if;

    return to_jsonb(v_variante);
end;
$$;


-- ---------------------------------------------------------------------
-- SUMAR STOCK
--
-- Llegó mercadería de una variante que ya existe: suma las unidades
-- (con su movimiento de entrada) y, si se indican, actualiza el costo
-- y el precio (con historial). Devuelve el stock nuevo.
-- ---------------------------------------------------------------------
create or replace function sumar_stock(
    p_variante_id bigint,
    p_cantidad numeric,
    p_costo numeric default null,
    p_precio numeric default null
)
returns numeric
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_hoy date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
    v_variante variantes_productos;
    v_stock stock;
    v_deposito_id bigint;
    v_precio_actual numeric;
begin
    if p_cantidad is null or p_cantidad <= 0 or p_cantidad <> trunc(p_cantidad) then
        raise exception 'Ingresá cuántas unidades llegaron (un número entero mayor a cero).';
    end if;

    if p_costo is not null and p_costo < 0 then
        raise exception 'Ingresá un costo válido (cero o mayor).';
    end if;

    if p_precio is not null and p_precio < 0 then
        raise exception 'Ingresá un precio válido (cero o mayor).';
    end if;

    select * into v_variante
    from variantes_productos
    where id = p_variante_id
    for update;

    if not found then
        raise exception 'La variante no existe.';
    end if;

    -- El stock vive en el depósito que ya tenga la variante, o en el
    -- primero (el negocio no distingue depósitos).
    select * into v_stock
    from stock
    where variante_producto_id = v_variante.id
    order by deposito_id
    limit 1
    for update;

    if found then
        v_deposito_id := v_stock.deposito_id;

        update stock
        set cantidad = cantidad + p_cantidad, updated_at = ahora_utc()
        where id = v_stock.id
        returning * into v_stock;
    else
        select id into v_deposito_id from depositos order by id limit 1;

        if v_deposito_id is null then
            raise exception 'No hay ningún depósito cargado.';
        end if;

        insert into stock (variante_producto_id, deposito_id, cantidad, stock_minimo, created_at, updated_at)
        values (v_variante.id, v_deposito_id, p_cantidad, 0, ahora_utc(), ahora_utc())
        returning * into v_stock;
    end if;

    insert into movimientos_stock (
        variante_producto_id, deposito_id, tipo, cantidad, motivo, observaciones,
        created_at, updated_at
    )
    values (
        v_variante.id, v_deposito_id, 'entrada', p_cantidad,
        'Ingreso de mercadería', 'Sumado desde "Sumar stock"',
        ahora_utc(), ahora_utc()
    );

    if p_costo is not null and p_costo is distinct from v_variante.costo then
        update variantes_productos set costo = p_costo where id = v_variante.id;
    end if;

    if p_precio is not null then
        select precio into v_precio_actual
        from precios_productos
        where variante_producto_id = v_variante.id and activo
        order by id desc
        limit 1;

        if v_precio_actual is distinct from p_precio then
            update precios_productos
            set activo = false, fecha_hasta = v_hoy
            where variante_producto_id = v_variante.id and activo;

            insert into precios_productos (variante_producto_id, precio, fecha_desde, activo)
            values (v_variante.id, p_precio, v_hoy, true);
        end if;
    end if;

    return v_stock.cantidad;
end;
$$;

revoke execute on function sumar_stock(bigint, numeric, numeric, numeric) from public, anon;
grant execute on function sumar_stock(bigint, numeric, numeric, numeric) to authenticated;
