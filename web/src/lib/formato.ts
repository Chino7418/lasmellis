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
