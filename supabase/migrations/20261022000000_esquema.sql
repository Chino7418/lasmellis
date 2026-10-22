-- =====================================================================
-- LAS MELLIS — ESQUEMA
--
-- Equivale a las migraciones de Laravel (database/migrations).
-- Es idempotente: si las tablas ya existen (porque las creó Laravel)
-- no hace nada, así que se puede correr sin miedo.
--
-- Nota: las columnas "fecha" son timestamp SIN zona horaria y guardan
-- la hora en UTC (así lo hacía Laravel con timezone = UTC).
-- =====================================================================

create table if not exists categorias (
    id bigserial primary key,
    nombre varchar(100) not null unique,
    descripcion text,
    activo boolean not null default true,
    created_at timestamp(0),
    updated_at timestamp(0)
);

create table if not exists marcas (
    id bigserial primary key,
    nombre varchar(100) not null unique,
    descripcion text,
    activo boolean not null default true,
    created_at timestamp(0),
    updated_at timestamp(0)
);

create table if not exists colores (
    id bigserial primary key,
    nombre varchar(50) not null unique,
    codigo_hex varchar(7),
    activo boolean not null default true,
    created_at timestamp(0),
    updated_at timestamp(0)
);

create table if not exists talles (
    id bigserial primary key,
    nombre varchar(20) not null unique,
    orden integer not null default 0,
    activo boolean not null default true,
    created_at timestamp(0),
    updated_at timestamp(0)
);

create table if not exists productos (
    id bigserial primary key,
    categoria_id bigint not null references categorias (id) on delete restrict,
    marca_id bigint references marcas (id) on delete set null,
    codigo_interno varchar(50) not null unique,
    nombre varchar(150) not null,
    descripcion text,
    costo numeric(12, 2) not null default 0,
    activo boolean not null default true,
    created_at timestamp(0),
    updated_at timestamp(0)
);

create table if not exists variantes_productos (
    id bigserial primary key,
    producto_id bigint not null references productos (id) on delete cascade,
    color_id bigint references colores (id) on delete set null,
    talle_id bigint references talles (id) on delete set null,
    codigo_barras varchar(50) not null unique,
    codigo_interno varchar(50) unique,
    activo boolean not null default true,
    created_at timestamp(0),
    updated_at timestamp(0),
    unique (producto_id, color_id, talle_id)
);

create table if not exists precios_productos (
    id bigserial primary key,
    variante_producto_id bigint not null references variantes_productos (id) on delete cascade,
    precio numeric(12, 2) not null,
    fecha_desde date,
    fecha_hasta date,
    activo boolean not null default true,
    created_at timestamp(0),
    updated_at timestamp(0)
);

create table if not exists depositos (
    id bigserial primary key,
    nombre varchar(100) not null,
    descripcion text,
    direccion varchar(255),
    activo boolean not null default true,
    created_at timestamp(0),
    updated_at timestamp(0)
);

create table if not exists stock (
    id bigserial primary key,
    variante_producto_id bigint not null references variantes_productos (id) on delete cascade,
    deposito_id bigint not null references depositos (id) on delete cascade,
    cantidad numeric(12, 3) not null default 0,
    stock_minimo numeric(12, 3) not null default 0,
    created_at timestamp(0),
    updated_at timestamp(0),
    unique (variante_producto_id, deposito_id)
);

create table if not exists movimientos_stock (
    id bigserial primary key,
    variante_producto_id bigint not null references variantes_productos (id) on delete restrict,
    deposito_id bigint not null references depositos (id) on delete restrict,
    tipo varchar(30) not null,
    cantidad numeric(12, 3) not null,
    motivo varchar(255),
    referencia_id bigint,
    observaciones text,
    created_at timestamp(0),
    updated_at timestamp(0)
);
create index if not exists movimientos_stock_tipo_index on movimientos_stock (tipo);
create index if not exists movimientos_stock_referencia_id_index on movimientos_stock (referencia_id);

create table if not exists clientes (
    id bigserial primary key,
    nombre varchar(100) not null,
    apellido varchar(100),
    documento varchar(20) unique,
    telefono varchar(30),
    email varchar(150),
    direccion varchar(255),
    observaciones text,
    activo boolean not null default true,
    created_at timestamp(0),
    updated_at timestamp(0)
);

create table if not exists ventas (
    id bigserial primary key,
    cliente_id bigint references clientes (id) on delete set null,
    deposito_id bigint not null references depositos (id) on delete restrict,
    fecha timestamp(0) not null,
    numero varchar(30) not null unique,
    subtotal numeric(12, 2) not null default 0,
    descuento numeric(12, 2) not null default 0,
    total numeric(12, 2) not null,
    tipo_pago varchar(30) not null,
    estado varchar(30) not null default 'completada',
    observaciones text,
    created_at timestamp(0),
    updated_at timestamp(0)
);
create index if not exists ventas_fecha_index on ventas (fecha);
create index if not exists ventas_tipo_pago_index on ventas (tipo_pago);
create index if not exists ventas_estado_index on ventas (estado);

create table if not exists detalle_ventas (
    id bigserial primary key,
    venta_id bigint not null references ventas (id) on delete cascade,
    variante_producto_id bigint not null references variantes_productos (id) on delete restrict,
    cantidad numeric(12, 3) not null,
    precio_unitario numeric(12, 2) not null,
    descuento numeric(12, 2) not null default 0,
    subtotal numeric(12, 2) not null,
    created_at timestamp(0),
    updated_at timestamp(0)
);
create index if not exists detalle_ventas_variante_producto_id_index on detalle_ventas (variante_producto_id);

create table if not exists pagos (
    id bigserial primary key,
    cliente_id bigint not null references clientes (id) on delete restrict,
    venta_id bigint references ventas (id) on delete set null,
    fecha timestamp(0) not null,
    monto numeric(12, 2) not null,
    medio_pago varchar(30) not null,
    observaciones text,
    created_at timestamp(0),
    updated_at timestamp(0)
);
create index if not exists pagos_fecha_index on pagos (fecha);

create table if not exists movimientos_cuenta_corriente (
    id bigserial primary key,
    cliente_id bigint not null references clientes (id) on delete restrict,
    venta_id bigint references ventas (id) on delete set null,
    pago_id bigint references pagos (id) on delete set null,
    tipo varchar(30) not null,
    importe numeric(12, 2) not null,
    fecha timestamp(0) not null,
    concepto varchar(255) not null,
    observaciones text,
    created_at timestamp(0),
    updated_at timestamp(0)
);
create index if not exists movimientos_cuenta_corriente_fecha_index on movimientos_cuenta_corriente (fecha);
create index if not exists movimientos_cuenta_corriente_tipo_index on movimientos_cuenta_corriente (tipo);
create index if not exists movimientos_cuenta_corriente_cliente_id_index on movimientos_cuenta_corriente (cliente_id);


-- =====================================================================
-- TIMESTAMPS AUTOMÁTICOS
--
-- Laravel completaba created_at / updated_at solo. Ahora lo hace la base.
-- =====================================================================

create or replace function set_timestamps()
returns trigger
language plpgsql
set search_path = public
as $$
begin
    if tg_op = 'INSERT' then
        new.created_at := coalesce(new.created_at, now() at time zone 'utc');
    end if;

    new.updated_at := now() at time zone 'utc';

    return new;
end;
$$;

do $$
declare
    tabla text;
begin
    foreach tabla in array array[
        'categorias', 'marcas', 'colores', 'talles', 'productos',
        'variantes_productos', 'precios_productos', 'depositos', 'stock',
        'movimientos_stock', 'clientes', 'ventas', 'detalle_ventas',
        'pagos', 'movimientos_cuenta_corriente'
    ]
    loop
        execute format('drop trigger if exists set_timestamps on %I', tabla);
        execute format(
            'create trigger set_timestamps before insert or update on %I
             for each row execute function set_timestamps()',
            tabla
        );
    end loop;
end;
$$;


-- =====================================================================
-- DATOS INICIALES (equivale a DatosInicialesSeeder)
-- =====================================================================

insert into categorias (nombre)
values ('Ropa Interior'), ('Camisetas'), ('Medias'), ('Pijamas'), ('Ropa'), ('Accesorios')
on conflict (nombre) do nothing;

-- Las Mellis revende marcas de terceros: no hay marca propia. Las
-- marcas se agregan desde el formulario de productos.
insert into marcas (nombre)
values ('Genérica')
on conflict (nombre) do nothing;

insert into colores (nombre, codigo_hex)
values
    ('Negro', '#000000'), ('Blanco', '#FFFFFF'), ('Rojo', '#FF0000'),
    ('Azul', '#0000FF'), ('Rosa', '#FFC0CB'), ('Gris', '#808080')
on conflict (nombre) do nothing;

insert into talles (nombre, orden)
values ('XS', 1), ('S', 2), ('M', 3), ('L', 4), ('XL', 5), ('XXL', 6), ('Único', 7)
on conflict (nombre) do nothing;

insert into depositos (nombre, descripcion, activo)
select 'Local Principal', 'Depósito principal de Las Mellis', true
where not exists (select 1 from depositos where nombre = 'Local Principal');

-- Cliente predeterminado para ventas de mostrador
insert into clientes (nombre, apellido, activo)
select 'Consumidor', 'Final', true
where not exists (
    select 1 from clientes where nombre = 'Consumidor' and apellido = 'Final'
);
