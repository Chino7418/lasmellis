/*
 * CAPA DE DATOS
 *
 * Reemplaza a los controladores de Laravel. Cada función devuelve los
 * datos con la misma forma que devolvía la API anterior, así las páginas
 * casi no cambiaron.
 *
 * Lo simple (listar, crear, editar) va directo contra las tablas.
 * Lo que tiene que ser atómico (ventas, pagos, dashboard) llama a las
 * funciones de Postgres definidas en supabase/migrations.
 */
import type { PostgrestError } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

/* ------------------------------------------------------------------ */
/* ERRORES                                                            */
/* ------------------------------------------------------------------ */

/**
 * Error de validación con mensajes por campo, igual que el 422 de
 * Laravel: { campo: ['mensaje'] }.
 */
export class ErrorValidacion extends Error {
    errores: Record<string, string[]>;

    constructor(errores: Record<string, string[]>) {
        super('Revisá los datos del formulario.');
        this.errores = errores;
    }
}

function fallar(error: PostgrestError, mensajePorDefecto: string): never {
    // Las funciones de Postgres lanzan mensajes en español pensados
    // para mostrarse tal cual (código P0001 = RAISE EXCEPTION).
    if (error.code === 'P0001' && error.message) {
        throw new Error(error.message);
    }

    throw new Error(mensajePorDefecto);
}

function validar(errores: Record<string, string[]>) {
    if (Object.keys(errores).length > 0) {
        throw new ErrorValidacion(errores);
    }
}

/**
 * Arma un patrón para filtros .or() de PostgREST. Las comillas permiten
 * buscar textos con comas o paréntesis sin romper el filtro.
 */
function patron(texto: string): string {
    return `"%${texto.replace(/["\\]/g, '\\$&')}%"`;
}

/* ------------------------------------------------------------------ */
/* PRODUCTOS                                                          */
/* ------------------------------------------------------------------ */

const PRODUCTO_SELECT = `
    *,
    categoria:categorias ( id, nombre ),
    marca:marcas ( id, nombre ),
    variantes:variantes_productos (
        *,
        color:colores ( id, nombre ),
        talle:talles ( id, nombre ),
        precios:precios_productos ( * ),
        stock ( *, deposito:depositos ( id, nombre ) )
    )
`;

export async function listarProductos<T>(): Promise<T[]> {
    const { data, error } = await supabase
        .from('productos')
        .select(PRODUCTO_SELECT)
        .order('id');

    if (error) {
        fallar(error, 'No se pudieron obtener los productos.');
    }

    return data as T[];
}

export async function buscarProductos<T>(texto: string): Promise<T[]> {
    const { data, error } = await supabase
        .from('productos')
        .select(PRODUCTO_SELECT)
        .or(
            `nombre.ilike.${patron(texto)},descripcion.ilike.${patron(texto)},codigo_interno.ilike.${patron(texto)}`,
        )
        .order('nombre');

    if (error) {
        fallar(error, 'No se pudo buscar el producto.');
    }

    return data as T[];
}

/**
 * Busca un producto por su código interno o por el código de barras de
 * alguna de sus variantes. Devuelve null si no existe.
 */
export async function buscarProductoPorCodigo<T>(
    codigo: string,
): Promise<T | null> {
    const porCodigoInterno = await supabase
        .from('productos')
        .select(PRODUCTO_SELECT)
        .eq('codigo_interno', codigo)
        .maybeSingle();

    if (porCodigoInterno.error) {
        fallar(porCodigoInterno.error, 'No se pudo buscar el producto.');
    }

    if (porCodigoInterno.data) {
        return porCodigoInterno.data as T;
    }

    const variante = await supabase
        .from('variantes_productos')
        .select('producto_id')
        .eq('codigo_barras', codigo)
        .maybeSingle();

    if (variante.error) {
        fallar(variante.error, 'No se pudo buscar el producto.');
    }

    if (!variante.data) {
        return null;
    }

    const { data, error } = await supabase
        .from('productos')
        .select(PRODUCTO_SELECT)
        .eq('id', variante.data.producto_id)
        .maybeSingle();

    if (error) {
        fallar(error, 'No se pudo buscar el producto.');
    }

    return data as T | null;
}

export type ItemCatalogo = { id: number; nombre: string };

export async function obtenerCatalogos(): Promise<{
    categorias: ItemCatalogo[];
    marcas: ItemCatalogo[];
    colores: ItemCatalogo[];
    talles: ItemCatalogo[];
}> {
    const [categorias, marcas, colores, talles] = await Promise.all([
        supabase.from('categorias').select('id, nombre').order('nombre'),
        supabase.from('marcas').select('id, nombre').order('nombre'),
        supabase.from('colores').select('id, nombre').order('nombre'),
        // Los talles van en su orden lógico (XS, S, M...), no alfabético.
        supabase
            .from('talles')
            .select('id, nombre')
            .order('orden')
            .order('nombre'),
    ]);

    for (const resultado of [categorias, marcas, colores, talles]) {
        if (resultado.error) {
            fallar(resultado.error, 'No se pudieron cargar los catálogos.');
        }
    }

    return {
        categorias: categorias.data ?? [],
        marcas: marcas.data ?? [],
        colores: colores.data ?? [],
        talles: talles.data ?? [],
    };
}

export type TablaCatalogo = 'marcas' | 'colores' | 'talles';

const CATALOGOS: Record<TablaCatalogo, { nombre: string; largo: number }> = {
    marcas: { nombre: 'la marca', largo: 100 },
    colores: { nombre: 'el color', largo: 50 },
    talles: { nombre: 'el talle', largo: 20 },
};

/**
 * Agrega una marca, un color o un talle y lo devuelve. Si ya existe uno
 * con el mismo nombre (sin importar mayúsculas), devuelve ese en lugar
 * de duplicarlo.
 */
export async function crearItemCatalogo(
    tabla: TablaCatalogo,
    nombre: string,
): Promise<{ item: ItemCatalogo; yaExistia: boolean }> {
    const { nombre: queEs, largo } = CATALOGOS[tabla];
    const limpio = nombre.trim().replace(/\s+/g, ' ');

    if (!limpio) {
        throw new Error(`Escribí el nombre de ${queEs}.`);
    }

    if (limpio.length > largo) {
        throw new Error(`El nombre admite hasta ${largo} caracteres.`);
    }

    // ilike sin comodines = comparación exacta sin distinguir mayúsculas.
    const existente = await supabase
        .from(tabla)
        .select('id, nombre')
        .ilike('nombre', limpio.replace(/[%_\\]/g, '\\$&'))
        .limit(1)
        .maybeSingle();

    if (existente.error) {
        fallar(existente.error, `No se pudo agregar ${queEs}.`);
    }

    if (existente.data) {
        return { item: existente.data, yaExistia: true };
    }

    const { data, error } = await supabase
        .from(tabla)
        .insert({ nombre: limpio })
        .select('id, nombre')
        .single();

    if (error?.code === '23505') {
        throw new Error(`"${limpio}" ya existe.`);
    }

    if (error) {
        fallar(error, `No se pudo agregar ${queEs}.`);
    }

    return { item: data, yaExistia: false };
}

/* ------------------------------------------------------------------ */
/* VARIANTES                                                          */
/* ------------------------------------------------------------------ */

export type DatosVariante = {
    id?: number;
    producto_id: number;
    color_id: number | null;
    talle_id: number | null;
    codigo_barras: string;
    precio: number;
    deposito_id: number;
    cantidad: number;
    stock_minimo: number;
    activo: boolean;
};

/**
 * Alta o edición de una variante con su precio y stock, todo junto
 * (ver la función guardar_variante en supabase/migrations).
 */
export async function guardarVariante(datos: DatosVariante): Promise<void> {
    const { error } = await supabase.rpc('guardar_variante', {
        p_variante: datos,
    });

    if (error) {
        fallar(error, 'No se pudo guardar la variante.');
    }
}

export async function eliminarVariante(id: number): Promise<void> {
    const { error } = await supabase.rpc('eliminar_variante', {
        p_variante_id: id,
    });

    if (error) {
        fallar(error, 'No se pudo eliminar la variante.');
    }
}

/**
 * Código EAN-13 para prendas que no traen código de barras. Empieza con
 * "2", el rango reservado para uso interno de cada comercio, así nunca
 * choca con el código de un producto de marca.
 */
export function generarCodigoInterno(): string {
    const digitos = [2];

    for (let i = 0; i < 11; i++) {
        digitos.push(Math.floor(Math.random() * 10));
    }

    const suma = digitos.reduce(
        (total, digito, i) => total + digito * (i % 2 === 0 ? 1 : 3),
        0,
    );

    return digitos.join('') + ((10 - (suma % 10)) % 10);
}

/*
 * El código interno no se envía: lo asigna la base al crear el
 * producto (P00001, P00002, ...) y después no cambia.
 */
export type DatosProducto = {
    categoria_id: number | null;
    marca_id: number | null;
    nombre: string;
    descripcion: string | null;
    costo: string;
    activo: boolean;
};

/** Alta o edición de un producto. Devuelve su id. */
export async function guardarProducto(
    datos: DatosProducto,
    id?: number,
): Promise<number> {
    const nombre = datos.nombre.trim();
    const costo = Number(datos.costo);
    const errores: Record<string, string[]> = {};

    if (!datos.categoria_id) {
        errores.categoria_id = ['Elegí una categoría.'];
    }

    if (!nombre) {
        errores.nombre = ['El nombre es obligatorio.'];
    } else if (nombre.length > 150) {
        errores.nombre = ['El nombre admite hasta 150 caracteres.'];
    }

    if (datos.costo.trim() === '' || Number.isNaN(costo) || costo < 0) {
        errores.costo = ['Ingresá un costo válido (cero o mayor).'];
    }

    validar(errores);

    const fila = {
        categoria_id: datos.categoria_id,
        marca_id: datos.marca_id,
        nombre,
        descripcion: datos.descripcion,
        costo,
        activo: datos.activo,
    };

    const { data, error } = id
        ? await supabase
              .from('productos')
              .update(fila)
              .eq('id', id)
              .select('id')
              .single()
        : await supabase.from('productos').insert(fila).select('id').single();

    if (error) {
        fallar(error, 'No se pudo guardar el producto.');
    }

    return data.id;
}

/**
 * Elimina un producto con sus variantes, precios, stock y movimientos.
 * Si ya se vendió, la base no deja borrarlo (para no perder el
 * historial): hay que marcarlo como inactivo.
 */
export async function eliminarProducto(id: number): Promise<string> {
    const { count } = await supabase
        .from('variantes_productos')
        .select('id', { count: 'exact', head: true })
        .eq('producto_id', id);

    const { error } = await supabase.rpc('eliminar_producto', {
        p_producto_id: id,
    });

    if (error) {
        fallar(error, 'No se pudo eliminar el producto.');
    }

    return count
        ? 'Producto eliminado junto con sus variantes, precios y stock asociado.'
        : 'Producto eliminado.';
}

/* ------------------------------------------------------------------ */
/* CLIENTES                                                           */
/* ------------------------------------------------------------------ */

/** Clientes activos con su saldo de cuenta corriente. */
export async function listarClientes<T>(buscar?: string): Promise<T[]> {
    let consulta = supabase
        .from('clientes_con_saldo')
        .select('*')
        .eq('activo', true)
        .order('nombre')
        .order('apellido');

    if (buscar) {
        const p = patron(buscar);
        consulta = consulta.or(
            `nombre.ilike.${p},apellido.ilike.${p},documento.ilike.${p},telefono.ilike.${p}`,
        );
    }

    const { data, error } = await consulta;

    if (error) {
        fallar(error, 'No se pudieron obtener los clientes.');
    }

    return data as T[];
}

export type DatosCliente = {
    nombre: string;
    apellido: string | null;
    documento: string | null;
    telefono: string | null;
    email: string | null;
    direccion: string | null;
    observaciones: string | null;
};

export async function guardarCliente(
    datos: DatosCliente,
    id?: number,
): Promise<void> {
    const errores: Record<string, string[]> = {};

    if (!datos.nombre.trim()) {
        errores.nombre = ['El nombre es obligatorio.'];
    }

    if (datos.documento && datos.documento.length > 20) {
        errores.documento = ['El documento admite hasta 20 caracteres.'];
    }

    if (datos.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(datos.email)) {
        errores.email = ['El email no es válido.'];
    }

    validar(errores);

    const fila = { ...datos, nombre: datos.nombre.trim() };

    const { error } = id
        ? await supabase.from('clientes').update(fila).eq('id', id)
        : await supabase.from('clientes').insert({ ...fila, activo: true });

    if (error?.code === '23505') {
        throw new ErrorValidacion({
            documento: ['Ya existe un cliente con ese documento.'],
        });
    }

    if (error) {
        fallar(error, 'No se pudo guardar el cliente.');
    }
}

/**
 * Baja lógica: no se borra de la base porque puede tener ventas, pagos
 * o movimientos de cuenta corriente asociados.
 */
export async function darDeBajaCliente(id: number): Promise<string> {
    const { error } = await supabase
        .from('clientes')
        .update({ activo: false })
        .eq('id', id);

    if (error) {
        fallar(error, 'No se pudo dar de baja al cliente.');
    }

    return 'Cliente dado de baja.';
}

/* ------------------------------------------------------------------ */
/* CUENTA CORRIENTE                                                   */
/* ------------------------------------------------------------------ */

export type MovimientoCuenta = {
    id: number;
    tipo: 'debe' | 'haber';
    importe: number;
    fecha: string;
    concepto: string;
    observaciones: string | null;
    venta: { numero: string } | null;
    pago: { medio_pago: string } | null;
};

/** Movimientos de la cuenta corriente de un cliente, del más viejo al más nuevo. */
export async function estadoDeCuenta(clienteId: number): Promise<{
    debe: number;
    haber: number;
    saldo: number;
    movimientos: MovimientoCuenta[];
}> {
    const { data, error } = await supabase
        .from('movimientos_cuenta_corriente')
        .select(
            'id, tipo, importe, fecha, concepto, observaciones, venta:ventas ( numero ), pago:pagos ( medio_pago )',
        )
        .eq('cliente_id', clienteId)
        .order('fecha')
        .order('id')
        .returns<MovimientoCuenta[]>();

    if (error) {
        fallar(error, 'No se pudo obtener la cuenta corriente.');
    }

    const debe = data
        .filter((m) => m.tipo === 'debe')
        .reduce((total, m) => total + Number(m.importe), 0);

    const haber = data
        .filter((m) => m.tipo === 'haber')
        .reduce((total, m) => total + Number(m.importe), 0);

    return { debe, haber, saldo: debe - haber, movimientos: data };
}

export async function pagarCuentaCorriente(
    clienteId: number,
    monto: number,
    medioPago: string,
    observaciones?: string | null,
) {
    const { data, error } = await supabase.rpc('pagar_cuenta_corriente', {
        p_cliente_id: clienteId,
        p_monto: monto,
        p_medio_pago: medioPago,
        p_observaciones: observaciones ?? null,
    });

    if (error) {
        fallar(error, 'No se pudo registrar el pago.');
    }

    return data as {
        saldo_anterior: number;
        saldo_actual: number;
    };
}

/**
 * Deuda que el cliente ya traía antes de usar la app (el cuaderno).
 * Es un movimiento "debe" sin venta: no toca stock ni las ventas.
 * La fecha (AAAA-MM-DD) se guarda al mediodía de Argentina, en UTC.
 */
export async function cargarSaldoAnterior(
    clienteId: number,
    monto: number,
    fecha: string,
    nota?: string | null,
) {
    if (!(monto > 0) || monto >= 10_000_000_000) {
        throw new Error('Ingresá un monto mayor a cero.');
    }

    const ahora = new Date().toISOString().slice(0, 19);
    const notaLimpia = nota?.trim().slice(0, 200) || null;

    const { error } = await supabase
        .from('movimientos_cuenta_corriente')
        .insert({
            cliente_id: clienteId,
            tipo: 'debe',
            importe: Math.round(monto * 100) / 100,
            fecha: /^\d{4}-\d{2}-\d{2}$/.test(fecha)
                ? `${fecha}T15:00:00`
                : ahora,
            concepto: notaLimpia
                ? `Saldo anterior · ${notaLimpia}`
                : 'Saldo anterior',
            created_at: ahora,
            updated_at: ahora,
        });

    if (error) {
        fallar(error, 'No se pudo cargar el saldo anterior.');
    }
}

/* ------------------------------------------------------------------ */
/* DEPÓSITOS                                                          */
/* ------------------------------------------------------------------ */

export async function listarDepositos(): Promise<
    { id: number; nombre: string }[]
> {
    const { data, error } = await supabase
        .from('depositos')
        .select('id, nombre')
        .eq('activo', true)
        .order('nombre');

    if (error) {
        fallar(error, 'No se pudieron cargar los depósitos.');
    }

    return data;
}

/* ------------------------------------------------------------------ */
/* VENTAS                                                             */
/* ------------------------------------------------------------------ */

export type NuevaVenta = {
    cliente_id: number | null;
    deposito_id: number;
    descuento: number;
    observaciones: string | null;
    detalles: {
        variante_producto_id: number;
        cantidad: number;
        precio_unitario: number;
        descuento: number;
    }[];
    pagos: {
        monto: number;
        medio_pago: string;
    }[];
};

/**
 * Registra la venta de forma atómica: crea la venta, descuenta stock,
 * registra pagos y genera la deuda en cuenta corriente si corresponde.
 */
export async function registrarVenta(
    venta: NuevaVenta,
): Promise<{ id: number; numero: string }> {
    const { data, error } = await supabase.rpc('registrar_venta', {
        p_venta: venta,
    });

    if (error) {
        fallar(error, 'No se pudo registrar la venta.');
    }

    return data;
}

/* ------------------------------------------------------------------ */
/* DASHBOARD                                                          */
/* ------------------------------------------------------------------ */

/** Cuántas variantes a la venta se quedaron sin stock (aviso del menú). */
export async function contarSinStock(): Promise<number> {
    const { data, error } = await supabase.rpc('contar_sin_stock');

    if (error) {
        return 0;
    }

    return Number(data) || 0;
}

export async function obtenerDashboard<T>(): Promise<T> {
    const { data, error } = await supabase.rpc('dashboard_resumen');

    if (error) {
        fallar(error, 'No se pudo obtener el dashboard.');
    }

    return data as T;
}
