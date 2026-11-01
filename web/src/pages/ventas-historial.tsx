import {
    ChevronLeft,
    ChevronRight,
    Plus,
    Receipt,
    Search,
    Undo2,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Campo } from '@/components/campo';
import { EstadoError, EstadoVacio, FilasCargando } from '@/components/estados';
import { Page, PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useTitulo } from '@/hooks/use-titulo';
import { anularVenta, listarVentas } from '@/lib/api';
import type { VentaHistorial } from '@/lib/api';
import {
    aTexto,
    cantidad,
    dinero,
    fechaDe,
    fechaHora,
    hoyEnArgentina,
    normalizar,
    rangoDelMes,
    tipoPago,
} from '@/lib/formato';
import { cn } from '@/lib/utils';

const nombreMes = new Intl.DateTimeFormat('es-AR', {
    month: 'long',
    year: 'numeric',
});

function cobrado(venta: VentaHistorial): number {
    return venta.pagos.reduce((total, pago) => total + pago.monto, 0);
}

export default function VentasHistorial() {
    useTitulo('Historial de ventas');

    const [mes, setMes] = useState(() => {
        const hoy = fechaDe(hoyEnArgentina());

        return new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    });
    const [ventas, setVentas] = useState<VentaHistorial[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [busqueda, setBusqueda] = useState('');
    const [abiertas, setAbiertas] = useState<number[]>([]);
    const [anulando, setAnulando] = useState<VentaHistorial | null>(null);

    const esMesActual =
        aTexto(mes).slice(0, 7) === hoyEnArgentina().slice(0, 7);

    const cargar = () => {
        const { desde, hasta } = rangoDelMes(mes);

        return listarVentas(desde, hasta)
            .then((resultado) => {
                setVentas(resultado);
                setError(null);
            })
            .catch((error) => setError(error.message))
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        void cargar();
    }, [mes]);

    const moverMes = (cantidadMeses: number) => {
        setLoading(true);
        setMes(
            (actual) =>
                new Date(
                    actual.getFullYear(),
                    actual.getMonth() + cantidadMeses,
                    1,
                ),
        );
    };

    // Por número, cliente o producto, sin importar acentos.
    const ventasFiltradas = useMemo(() => {
        const palabras = normalizar(busqueda).split(/\s+/).filter(Boolean);

        if (palabras.length === 0) {
            return ventas;
        }

        return ventas.filter((venta) => {
            const datos = normalizar(
                [
                    venta.numero,
                    venta.cliente,
                    ...venta.detalles.flatMap((detalle) => [
                        detalle.producto,
                        detalle.variante,
                    ]),
                ]
                    .filter(Boolean)
                    .join(' '),
            );

            return palabras.every((palabra) => datos.includes(palabra));
        });
    }, [ventas, busqueda]);

    const completadas = ventasFiltradas.filter(
        (venta) => venta.estado === 'completada',
    );
    const totalMes = completadas.reduce(
        (total, venta) => total + venta.total,
        0,
    );

    const toggleVenta = (id: number) =>
        setAbiertas((actuales) =>
            actuales.includes(id)
                ? actuales.filter((item) => item !== id)
                : [...actuales, id],
        );

    return (
        <Page>
            <PageHeader
                title="Historial de ventas"
                description="Lo vendido en el mes, con la opción de anular una venta"
                actions={
                    <Button asChild>
                        <Link to="/ventas">
                            <Plus />
                            Nueva venta
                        </Link>
                    </Button>
                }
            />

            {/* MES */}
            <div className="flex items-center justify-center gap-2 sm:justify-start">
                <Button
                    variant="outline"
                    size="icon"
                    onClick={() => moverMes(-1)}
                    title="Mes anterior"
                >
                    <ChevronLeft />
                </Button>
                <span className="min-w-40 text-center font-serif text-lg font-medium capitalize">
                    {nombreMes.format(mes)}
                </span>
                <Button
                    variant="outline"
                    size="icon"
                    onClick={() => moverMes(1)}
                    disabled={esMesActual}
                    title="Mes siguiente"
                >
                    <ChevronRight />
                </Button>
            </div>

            {error && <EstadoError mensaje={error} />}

            <section className="bg-card shadow-xs overflow-hidden rounded-xl border">
                {/* BÚSQUEDA */}
                <div className="flex flex-wrap items-center gap-3 border-b p-3">
                    <div className="relative min-w-0 flex-1 sm:max-w-sm">
                        <Search className="text-muted-foreground absolute left-3 top-1/2 size-4 -translate-y-1/2" />
                        <Input
                            value={busqueda}
                            onChange={(evento) =>
                                setBusqueda(evento.target.value)
                            }
                            placeholder="Número, cliente o producto..."
                            className="pl-9"
                        />
                    </div>

                    {!loading && (
                        <span className="text-muted-foreground ml-auto text-sm tabular-nums">
                            {completadas.length} venta
                            {completadas.length !== 1 ? 's' : ''} ·{' '}
                            {dinero(totalMes)}
                        </span>
                    )}
                </div>

                {loading && <FilasCargando />}

                {!loading && !error && ventasFiltradas.length === 0 && (
                    <EstadoVacio
                        icon={Receipt}
                        title={
                            busqueda
                                ? 'No se encontraron ventas'
                                : 'No hay ventas este mes'
                        }
                        description={
                            busqueda
                                ? 'Probá con otro número, cliente o producto.'
                                : 'Las ventas que registres van a aparecer acá.'
                        }
                    />
                )}

                {!loading && ventasFiltradas.length > 0 && (
                    <ul className="divide-y">
                        {ventasFiltradas.map((venta) => {
                            const abierta = abiertas.includes(venta.id);
                            const anulada = venta.estado === 'anulada';

                            return (
                                <li key={venta.id}>
                                    <button
                                        type="button"
                                        aria-expanded={abierta}
                                        onClick={() => toggleVenta(venta.id)}
                                        className="hover:bg-muted/40 flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors"
                                    >
                                        <ChevronRight
                                            className={cn(
                                                'text-muted-foreground size-4 shrink-0 transition-transform',
                                                abierta && 'rotate-90',
                                            )}
                                        />

                                        <span className="min-w-0 flex-1">
                                            <span className="flex items-center gap-2 text-sm font-medium">
                                                <span className="truncate">
                                                    {venta.cliente ??
                                                        'Sin cliente'}
                                                </span>
                                                {anulada && (
                                                    <Badge variant="danger">
                                                        Anulada
                                                    </Badge>
                                                )}
                                            </span>
                                            <span className="text-muted-foreground block truncate text-xs">
                                                {fechaHora(venta.fecha)} ·{' '}
                                                <span className="font-mono">
                                                    {venta.numero}
                                                </span>
                                            </span>
                                        </span>

                                        <Badge
                                            variant="secondary"
                                            className="hidden sm:inline-flex"
                                        >
                                            {tipoPago(venta.tipo_pago)}
                                        </Badge>

                                        <span
                                            className={cn(
                                                'w-28 text-right text-sm font-semibold tabular-nums',
                                                anulada &&
                                                    'text-muted-foreground line-through',
                                            )}
                                        >
                                            {dinero(venta.total)}
                                        </span>
                                    </button>

                                    {abierta && (
                                        <DetalleVenta
                                            venta={venta}
                                            onAnular={() => setAnulando(venta)}
                                        />
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                )}
            </section>

            {anulando && (
                <DialogAnular
                    venta={anulando}
                    onCerrar={() => setAnulando(null)}
                    onAnulada={() => {
                        setAnulando(null);
                        void cargar();
                    }}
                />
            )}
        </Page>
    );
}

function DetalleVenta({
    venta,
    onAnular,
}: {
    venta: VentaHistorial;
    onAnular: () => void;
}) {
    const pendiente = Math.max(venta.total - cobrado(venta), 0);

    return (
        <div className="bg-muted/20 flex flex-col gap-4 border-t px-5 py-4 sm:pl-12">
            <ul className="flex flex-col gap-2">
                {venta.detalles.map((detalle) => (
                    <li
                        key={detalle.id}
                        className="flex items-start justify-between gap-4 text-sm"
                    >
                        <span className="min-w-0">
                            <span className="line-clamp-2">
                                {cantidad(detalle.cantidad)} ×{' '}
                                {detalle.producto}
                            </span>
                            {detalle.variante && (
                                <span className="text-muted-foreground block text-xs">
                                    {detalle.variante}
                                </span>
                            )}
                        </span>
                        <span className="shrink-0 tabular-nums">
                            {dinero(detalle.subtotal)}
                        </span>
                    </li>
                ))}
            </ul>

            <div className="text-muted-foreground flex flex-col gap-1 border-t pt-3 text-sm">
                {venta.descuento > 0 && (
                    <Fila
                        etiqueta="Descuento"
                        valor={`− ${dinero(venta.descuento)}`}
                    />
                )}
                {venta.pagos.map((pago, i) => (
                    <Fila
                        key={i}
                        etiqueta={tipoPago(pago.medio_pago)}
                        valor={dinero(pago.monto)}
                    />
                ))}
                {pendiente > 0 && (
                    <Fila
                        etiqueta="A cuenta corriente"
                        valor={dinero(pendiente)}
                    />
                )}
                {venta.observaciones && (
                    <p className="pt-1">{venta.observaciones}</p>
                )}
            </div>

            {venta.estado === 'anulada' ? (
                <p className="bg-destructive/5 text-destructive rounded-md px-3 py-2 text-sm">
                    Anulada
                    {venta.anulada_at && ` el ${fechaHora(venta.anulada_at)}`}
                    {venta.motivo_anulacion && `: ${venta.motivo_anulacion}`}
                </p>
            ) : (
                <div className="flex justify-end">
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={onAnular}
                    >
                        <Undo2 />
                        Anular venta
                    </Button>
                </div>
            )}
        </div>
    );
}

function DialogAnular({
    venta,
    onCerrar,
    onAnulada,
}: {
    venta: VentaHistorial;
    onCerrar: () => void;
    onAnulada: () => void;
}) {
    const [motivo, setMotivo] = useState('');
    const [procesando, setProcesando] = useState(false);

    const unidades = venta.detalles.reduce(
        (total, detalle) => total + detalle.cantidad,
        0,
    );
    const pagado = cobrado(venta);
    const pendiente = Math.max(venta.total - pagado, 0);

    const confirmar = async () => {
        setProcesando(true);

        try {
            await anularVenta(venta.id, motivo);
            toast.success(`Venta ${venta.numero} anulada.`);
            onAnulada();
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? error.message
                    : 'No se pudo anular la venta.',
            );
        } finally {
            setProcesando(false);
        }
    };

    return (
        <Dialog open onOpenChange={(valor) => !valor && onCerrar()}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Anular venta</DialogTitle>
                    <DialogDescription>
                        {venta.numero} · {venta.cliente ?? 'Sin cliente'} ·{' '}
                        {dinero(venta.total)}
                    </DialogDescription>
                </DialogHeader>

                <ul className="text-muted-foreground list-disc space-y-1 pl-5 text-sm">
                    <li>
                        Vuelven al stock {cantidad(unidades)} unidad
                        {unidades !== 1 ? 'es' : ''}.
                    </li>
                    {pagado > 0 && (
                        <li>
                            Lo cobrado ({dinero(pagado)}) se toma como devuelto
                            al cliente y deja de sumar en ingresos.
                        </li>
                    )}
                    {pendiente > 0 && (
                        <li>
                            Se cancela la deuda de {dinero(pendiente)} en su
                            cuenta corriente.
                        </li>
                    )}
                    <li>
                        La venta queda en el historial, marcada como anulada.
                    </li>
                </ul>

                <form
                    id="form-anular"
                    onSubmit={(evento) => {
                        evento.preventDefault();
                        void confirmar();
                    }}
                >
                    <Campo id="motivo" label="Motivo" opcional>
                        <Input
                            id="motivo"
                            autoFocus
                            maxLength={255}
                            value={motivo}
                            placeholder="Ej.: cambio de talle, se cargó mal"
                            onChange={(evento) =>
                                setMotivo(evento.target.value)
                            }
                        />
                    </Campo>
                </form>

                <DialogFooter>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={onCerrar}
                        disabled={procesando}
                    >
                        Cancelar
                    </Button>
                    <Button
                        type="submit"
                        form="form-anular"
                        variant="destructive"
                        disabled={procesando}
                    >
                        {procesando ? 'Anulando...' : 'Anular venta'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function Fila({ etiqueta, valor }: { etiqueta: string; valor: string }) {
    return (
        <div className="flex items-center justify-between gap-4">
            <span>{etiqueta}</span>
            <span className="tabular-nums">{valor}</span>
        </div>
    );
}
