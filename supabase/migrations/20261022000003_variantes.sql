-- =====================================================================
-- LAS MELLIS — VARIANTES (color / talle / precio / stock)
--
-- Guardar una variante toca cuatro tablas (variantes_productos,
-- precios_productos, stock y movimientos_stock). Se hace en una sola
-- función para que quede todo guardado o nada.
-- =====================================================================


-- ---------------------------------------------------------------------
-- GUARDAR VARIANTE (alta o edición)
--
-- Recibe:
-- {
--   "id": 5 | null,              -- null = variante nueva
--   "producto_id": 1,
--   "color_id": 2 | null,
--   "talle_id": 3 | null,
--   "codigo_barras": "779...",
--   "precio": 15000,
--   "deposito_id": 1,
--   "cantidad": 10,              -- stock real en ese depósito
--   "stock_minimo": 2,
--   "activo": true
-- }
--
-- * Precio: si cambia, el anterior se cierra (fecha_hasta = hoy) y se
--   crea uno nuevo. Así queda el historial de precios.
-- * Stock: si la cantidad cambia, se registra un movimiento de entrada
--   o salida por la diferencia ("Stock inicial" o "Ajuste manual").
-- ---------------------------------------------------------------------
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

    -- Código de barras único en todo el catálogo.
    select p.nombre into v_otro
    from variantes_productos v
    join productos p on p.id = v.producto_id
    where v.codigo_barras = v_codigo
      and v.id is distinct from v_id;

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
        insert into variantes_productos (producto_id, color_id, talle_id, codigo_barras, activo)
        values (v_producto_id, v_color_id, v_talle_id, v_codigo, v_activo)
        returning * into v_variante;
    else
        update variantes_productos
        set color_id = v_color_id,
            talle_id = v_talle_id,
            codigo_barras = v_codigo,
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
-- ELIMINAR VARIANTE
--
-- Si la variante ya se vendió, no se borra (se perdería el historial
-- de ventas): hay que desactivarla. Si nunca se vendió, se borra junto
-- con sus precios, stock y movimientos de stock.
-- ---------------------------------------------------------------------
create or replace function eliminar_variante(p_variante_id bigint)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
    if exists (select 1 from detalle_ventas where variante_producto_id = p_variante_id) then
        raise exception 'Esta variante ya tiene ventas registradas, así que no se puede eliminar. Editala y desmarcá "Activa" para dejar de venderla.';
    end if;

    delete from movimientos_stock where variante_producto_id = p_variante_id;
    delete from variantes_productos where id = p_variante_id;

    if not found then
        raise exception 'La variante no existe.';
    end if;
end;
$$;


-- ---------------------------------------------------------------------
-- ELIMINAR PRODUCTO
--
-- Mismo criterio: si alguna variante se vendió, no se borra (hay que
-- marcar el producto como inactivo). Si no, se borra con sus variantes,
-- precios, stock y movimientos de stock.
-- ---------------------------------------------------------------------
create or replace function eliminar_producto(p_producto_id bigint)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
    if exists (
        select 1
        from detalle_ventas d
        join variantes_productos v on v.id = d.variante_producto_id
        where v.producto_id = p_producto_id
    ) then
        raise exception 'Este producto ya tiene ventas registradas, así que no se puede eliminar. Editalo y desmarcá "Producto activo" para dejar de venderlo.';
    end if;

    delete from movimientos_stock
    where variante_producto_id in (
        select id from variantes_productos where producto_id = p_producto_id
    );

    delete from productos where id = p_producto_id;

    if not found then
        raise exception 'El producto no existe.';
    end if;
end;
$$;


revoke execute on function eliminar_producto(bigint) from public, anon;
grant execute on function eliminar_producto(bigint) to authenticated;
revoke execute on function guardar_variante(jsonb) from public, anon;
revoke execute on function eliminar_variante(bigint) from public, anon;
grant execute on function guardar_variante(jsonb) to authenticated;
grant execute on function eliminar_variante(bigint) to authenticated;
