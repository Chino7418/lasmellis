-- =====================================================================
-- LAS MELLIS — COSTO POR VARIANTE
--
-- El costo deja de ser del producto y pasa a cada variante (un talle o
-- un color puede costar distinto). Cada variante arranca con el costo
-- que tenía su producto. productos.costo queda sin uso.
-- =====================================================================

alter table variantes_productos
    add column if not exists costo numeric(12, 2) not null default 0;

update variantes_productos v
set costo = p.costo
from productos p
where p.id = v.producto_id
  and v.costo = 0
  and p.costo > 0;

comment on column productos.costo is 'Sin uso: el costo está en variantes_productos.costo.';

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
