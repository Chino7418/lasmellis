const formatoDinero = new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
});

const formatoFechaHora = new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
});

const formatoCantidad = new Intl.NumberFormat('es-AR', {
    maximumFractionDigits: 3,
});

export function dinero(valor: number | string): string {
    return formatoDinero.format(Number(valor));
}

export function cantidad(valor: number | string): string {
    return formatoCantidad.format(Number(valor));
}

export function fechaHora(valor: string): string {
    return formatoFechaHora.format(new Date(valor));
}

const TIPOS_PAGO: Record<string, string> = {
    efectivo: 'Efectivo',
    transferencia: 'Transferencia',
    tarjeta_debito: 'Débito',
    tarjeta_credito: 'Crédito',
    mixto: 'Mixto',
    cuenta_corriente: 'Cuenta corriente',
};

export function tipoPago(valor: string): string {
    return TIPOS_PAGO[valor] ?? valor;
}

export function nombreCompleto(persona: {
    nombre: string;
    apellido?: string | null;
}): string {
    return [persona.nombre, persona.apellido].filter(Boolean).join(' ');
}

/** "Marca - Nombre - Descripción", salteando lo que esté vacío. */
export function tituloProducto(producto: {
    nombre: string;
    descripcion?: string | null;
    marca?: { nombre: string } | null;
}): string {
    return [
        producto.marca?.nombre,
        producto.nombre,
        producto.descripcion?.trim(),
    ]
        .filter(Boolean)
        .join(' - ');
}

/** Minúsculas y sin acentos, para comparar búsquedas. */
export function normalizar(texto: string): string {
    return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

type ProductoBuscable = {
    nombre: string;
    descripcion?: string | null;
    codigo_interno?: string | null;
    marca?: { nombre: string } | null;
    categoria?: { nombre: string } | null;
    variantes: {
        codigo_barras?: string | null;
        codigo_interno?: string | null;
        color?: { nombre: string } | null;
        talle?: { nombre: string } | null;
    }[];
};

/**
 * Cada palabra tiene que aparecer en algún dato del producto (marca,
 * nombre, descripción, códigos, categoría, color o talle), sin importar
 * acentos ni mayúsculas: "sweet encaje" encuentra
 * "Sweet Lady - Corpiño - Encaje con aro".
 */
export function coincideBusqueda(
    producto: ProductoBuscable,
    busqueda: string,
): boolean {
    const palabras = normalizar(busqueda).split(/\s+/).filter(Boolean);

    if (palabras.length === 0) {
        return true;
    }

    const datos = normalizar(
        [
            producto.marca?.nombre,
            producto.nombre,
            producto.descripcion,
            producto.codigo_interno,
            producto.categoria?.nombre,
            ...producto.variantes.flatMap((variante) => [
                variante.codigo_barras,
                variante.codigo_interno,
                variante.color?.nombre,
                variante.talle?.nombre,
            ]),
        ]
            .filter(Boolean)
            .join(' '),
    );

    return palabras.every((palabra) => datos.includes(palabra));
}

/** Fecha de hoy en Argentina, AAAA-MM-DD. */
export function hoyEnArgentina(): string {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Argentina/Buenos_Aires',
    }).format(new Date());
}

export function aTexto(fecha: Date): string {
    const mes = String(fecha.getMonth() + 1).padStart(2, '0');
    const dia = String(fecha.getDate()).padStart(2, '0');

    return `${fecha.getFullYear()}-${mes}-${dia}`;
}

/** Primer y último día del mes (AAAA-MM-DD). */
export function rangoDelMes(mes: Date): { desde: string; hasta: string } {
    return {
        desde: aTexto(new Date(mes.getFullYear(), mes.getMonth(), 1)),
        hasta: aTexto(new Date(mes.getFullYear(), mes.getMonth() + 1, 0)),
    };
}

/** Un día AAAA-MM-DD como fecha local (sin correrse por la zona). */
export function fechaDe(dia: string): Date {
    const [anio, mes, numero] = dia.split('-').map(Number);

    return new Date(anio, mes - 1, numero);
}
