import {
    ArrowDownLeft,
    ArrowUpRight,
    ChevronLeft,
    ChevronRight,
    Minus,
    Receipt,
    Scale,
    Trash2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { toast } from 'sonner';
import { Campo } from '@/components/campo';
import { EstadoError, EstadoVacio, FilasCargando } from '@/components/estados';
import { Page, PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useTitulo } from '@/hooks/use-titulo';
import {
    ErrorValidacion,
    eliminarMovimientoCaja,
    obtenerInformeCaja,
    registrarEgreso,
} from '@/lib/api';
import type { InformeCaja } from '@/lib/api';
import { dinero } from '@/lib/formato';
import { cn } from '@/lib/utils';

const CATEGORIAS_EGRESO = [
    'Compra de mercadería',
    'Nafta y viáticos',
    'Envíos',
    'Bolsas y packaging',
    'Publicidad',
    'Servicios',
    'Otros',
];

const nombreMes = new Intl.DateTimeFormat('es-AR', {
    month: 'long',
    year: 'numeric',
});

const diaCorto = new Intl.DateTimeFormat('es-AR', {
    day: 'numeric',
    month: 'short',
});

/** Fecha de hoy en Argentina, AAAA-MM-DD. */
function hoyEnArgentina(): string {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Argentina/Buenos_Aires',
    }).format(new Date());
}

function aTexto(fecha: Date): string {
    const mes = String(fecha.getMonth() + 1).padStart(2, '0');
    const dia = String(fecha.getDate()).padStart(2, '0');

    return `${fecha.getFullYear()}-${mes}-${dia}`;
}

/** Primer y último día del mes (AAAA-MM-DD). */
function rangoDelMes(mes: Date): { desde: string; hasta: string } {
    return {
        desde: aTexto(new Date(mes.getFullYear(), mes.getMonth(), 1)),
        hasta: aTexto(new Date(mes.getFullYear(), mes.getMonth() + 1, 0)),
    };
}

/** Un día AAAA-MM-DD como fecha local (sin correrse por la zona). */
function fechaDe(dia: string): Date {
    const [anio, mes, numero] = dia.split('-').map(Number);

    return new Date(anio, mes - 1, numero);
}

export default function Caja() {
    useTitulo('Ingresos y egresos');

    const [mes, setMes] = useState(() => {
        const hoy = fechaDe(hoyEnArgentina());

        return new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    });
    const [informe, setInforme] = useState<InformeCaja | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [egresoAbierto, setEgresoAbierto] = useState(false);

    const esMesActual =
        aTexto(mes).slice(0, 7) === hoyEnArgentina().slice(0, 7);

    const cargar = () => {
        const { desde, hasta } = rangoDelMes(mes);

        setLoading(true);

        return obtenerInformeCaja(desde, hasta)
            .then((resultado) => {
                setInforme(resultado);
                setError(null);
            })
            .catch((error) => setError(error.message))
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        void cargar();
    }, [mes]);

    const moverMes = (cantidad: number) =>
        setMes(
            (actual) =>
                new Date(actual.getFullYear(), actual.getMonth() + cantidad, 1),
        );

    const eliminar = async (id: number, detalle: string) => {
        if (!window.confirm(`¿Eliminar "${detalle}"?`)) {
            return;
        }

        try {
            await eliminarMovimientoCaja(id);
            toast.success('Egreso eliminado.');
            await cargar();
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? error.message
                    : 'No se pudo eliminar el movimiento.',
            );
        }
    };

    const egresosPorCategoria =
        informe?.por_categoria.filter((item) => item.tipo === 'egreso') ?? [];

    return (
        <Page>
            <PageHeader
                title="Ingresos y egresos"
                description="Lo que entró por ventas y cobros, y lo que se gastó"
                actions={
                    <Button onClick={() => setEgresoAbierto(true)}>
                        <Minus />
                        Registrar egreso
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

            {/* TOTALES */}
            <div className="grid gap-4 sm:grid-cols-3">
                <Total
                    icon={ArrowDownLeft}
                    titulo="Ingresos"
                    valor={loading ? null : (informe?.total_ingresos ?? 0)}
                    tono="success"
                />
                <Total
                    icon={ArrowUpRight}
                    titulo="Egresos"
                    valor={loading ? null : (informe?.total_egresos ?? 0)}
                    tono="destructive"
                />
                <Total
                    icon={Scale}
                    titulo="Resultado del mes"
                    valor={loading ? null : (informe?.resultado ?? 0)}
                    tono={
                        (informe?.resultado ?? 0) < 0
                            ? 'destructive'
                            : 'success'
                    }
                    destacado
                />
            </div>

            {informe && !loading && (
                <div className="grid gap-6 lg:grid-cols-2">
                    {/* DETALLE DE INGRESOS */}
                    <Panel titulo="De dónde entró la plata">
                        <ul className="divide-y">
                            <Renglon
                                texto="Ventas cobradas"
                                ayuda="Lo que se pagó al momento de vender"
                                valor={informe.cobrado_ventas}
                            />
                            <Renglon
                                texto="Cobros de cuentas corrientes"
                                ayuda="Pagos de clientes que debían"
                                valor={informe.cobrado_cuentas}
                            />
                            {Number(informe.otros_ingresos) > 0 && (
                                <Renglon
                                    texto="Otros ingresos"
                                    valor={informe.otros_ingresos}
                                />
                            )}
                        </ul>
                        <p className="text-muted-foreground border-t px-5 py-3 text-xs">
                            Se calcula solo con cada venta y cada pago. Las
                            ventas a cuenta corriente suman cuando se cobran.
                        </p>
                    </Panel>

                    {/* DETALLE DE EGRESOS */}
                    <Panel titulo="En qué se gastó">
                        {egresosPorCategoria.length === 0 ? (
                            <p className="text-muted-foreground px-5 py-6 text-sm">
                                No hay egresos cargados este mes.
                            </p>
                        ) : (
                            <ul className="divide-y">
                                {egresosPorCategoria.map((item) => (
                                    <Renglon
                                        key={item.categoria}
                                        texto={item.categoria}
                                        valor={item.total}
                                        porcentaje={
                                            Number(informe.total_egresos) > 0
                                                ? Number(item.total) /
                                                  Number(informe.total_egresos)
                                                : 0
                                        }
                                    />
                                ))}
                            </ul>
                        )}
                    </Panel>
                </div>
            )}

            {/* MOVIMIENTOS CARGADOS A MANO */}
            <Panel titulo="Egresos del mes">
                {loading ? (
                    <FilasCargando filas={3} />
                ) : !informe || informe.movimientos.length === 0 ? (
                    <EstadoVacio
                        icon={Receipt}
                        title="Sin egresos"
                        description="Cargá acá lo que se gasta: mercadería, nafta, envíos, bolsas..."
                        action={
                            <Button
                                variant="outline"
                                onClick={() => setEgresoAbierto(true)}
                            >
                                <Minus />
                                Registrar egreso
                            </Button>
                        }
                    />
                ) : (
                    <ul className="divide-y">
                        {informe.movimientos.map((movimiento) => (
                            <li
                                key={movimiento.id}
                                className="flex items-center gap-3 px-5 py-3"
                            >
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-medium">
                                        {movimiento.categoria}
                                    </p>
                                    <p className="text-muted-foreground truncate text-xs">
                                        {diaCorto.format(
                                            fechaDe(movimiento.fecha),
                                        )}
                                        {movimiento.descripcion &&
                                            ` · ${movimiento.descripcion}`}
                                    </p>
                                </div>
                                <span
                                    className={cn(
                                        'shrink-0 text-sm font-medium tabular-nums',
                                        movimiento.tipo === 'egreso'
                                            ? 'text-destructive'
                                            : 'text-success',
                                    )}
                                >
                                    {movimiento.tipo === 'egreso' ? '−' : '+'}
                                    {dinero(movimiento.monto)}
                                </span>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="text-muted-foreground size-8 shrink-0"
                                    onClick={() =>
                                        eliminar(
                                            movimiento.id,
                                            `${movimiento.categoria} ${dinero(movimiento.monto)}`,
                                        )
                                    }
                                    title="Eliminar"
                                >
                                    <Trash2 />
                                </Button>
                            </li>
                        ))}
                    </ul>
                )}
            </Panel>

            {egresoAbierto && (
                <DialogEgreso
                    onCerrar={() => setEgresoAbierto(false)}
                    onGuardado={(fecha) => {
                        setEgresoAbierto(false);
                        const elegido = fechaDe(fecha);
                        const nuevoMes = new Date(
                            elegido.getFullYear(),
                            elegido.getMonth(),
                            1,
                        );

                        // Si se cargó en otro mes, se va a ese mes.
                        if (nuevoMes.getTime() !== mes.getTime()) {
                            setMes(nuevoMes);
                        } else {
                            void cargar();
                        }
                    }}
                />
            )}
        </Page>
    );
}

function Total({
    icon: Icon,
    titulo,
    valor,
    tono,
    destacado = false,
}: {
    icon: LucideIcon;
    titulo: string;
    valor: number | null;
    tono: 'success' | 'destructive';
    destacado?: boolean;
}) {
    return (
        <div
            className={cn(
                'bg-card shadow-xs rounded-xl border p-5',
                destacado && 'border-primary/30',
            )}
        >
            <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-sm">{titulo}</span>
                <span className="bg-accent text-accent-foreground flex size-8 items-center justify-center rounded-full">
                    <Icon className="size-4" />
                </span>
            </div>
            {valor === null ? (
                <Skeleton className="mt-2 h-7 w-32" />
            ) : (
                <p
                    className={cn(
                        'mt-2 text-2xl font-semibold tabular-nums tracking-tight',
                        tono === 'success'
                            ? 'text-success'
                            : 'text-destructive',
                    )}
                >
                    {dinero(valor)}
                </p>
            )}
        </div>
    );
}

function Panel({
    titulo,
    children,
}: {
    titulo: string;
    children: React.ReactNode;
}) {
    return (
        <section className="bg-card shadow-xs overflow-hidden rounded-xl border">
            <h2 className="border-b px-5 py-3.5 font-serif text-base font-medium">
                {titulo}
            </h2>
            {children}
        </section>
    );
}

function Renglon({
    texto,
    ayuda,
    valor,
    porcentaje,
}: {
    texto: string;
    ayuda?: string;
    valor: number | string;
    /** 0 a 1: barra de cuánto pesa en el total. */
    porcentaje?: number;
}) {
    return (
        <li className="px-5 py-3">
            <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                    <p className="truncate text-sm">{texto}</p>
                    {ayuda && (
                        <p className="text-muted-foreground truncate text-xs">
                            {ayuda}
                        </p>
                    )}
                </div>
                <span className="shrink-0 text-sm font-medium tabular-nums">
                    {dinero(valor)}
                </span>
            </div>
            {porcentaje !== undefined && (
                <div
                    className="bg-muted mt-2 h-1.5 overflow-hidden rounded-full"
                    aria-hidden="true"
                >
                    <div
                        className="bg-chart-2 h-full rounded-full"
                        style={{ width: `${Math.round(porcentaje * 100)}%` }}
                    />
                </div>
            )}
        </li>
    );
}

function DialogEgreso({
    onCerrar,
    onGuardado,
}: {
    onCerrar: () => void;
    onGuardado: (fecha: string) => void;
}) {
    const [form, setForm] = useState({
        fecha: hoyEnArgentina(),
        monto: '',
        categoria: '',
        descripcion: '',
    });
    const [errores, setErrores] = useState<Record<string, string[]>>({});
    const [guardando, setGuardando] = useState(false);

    const cambiar = (cambios: Partial<typeof form>) =>
        setForm((actual) => ({ ...actual, ...cambios }));

    const guardar = async (evento: FormEvent) => {
        evento.preventDefault();
        setErrores({});
        setGuardando(true);

        try {
            await registrarEgreso(form);
            toast.success('Egreso registrado.');
            onGuardado(form.fecha);
        } catch (error) {
            if (error instanceof ErrorValidacion) {
                setErrores(error.errores);
            } else {
                toast.error(
                    error instanceof Error
                        ? error.message
                        : 'No se pudo registrar el egreso.',
                );
            }
        } finally {
            setGuardando(false);
        }
    };

    return (
        <Dialog open onOpenChange={(abierto) => !abierto && onCerrar()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Registrar egreso</DialogTitle>
                    <DialogDescription>
                        Plata que salió: mercadería, nafta, envíos...
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={guardar} className="grid gap-4 sm:grid-cols-2">
                    <Campo id="monto" label="Monto" error={errores.monto}>
                        <Input
                            id="monto"
                            type="number"
                            min="0"
                            step="0.01"
                            inputMode="decimal"
                            value={form.monto}
                            onChange={(evento) =>
                                cambiar({ monto: evento.target.value })
                            }
                            autoFocus
                        />
                    </Campo>

                    <Campo id="fecha" label="Fecha" error={errores.fecha}>
                        <Input
                            id="fecha"
                            type="date"
                            max={hoyEnArgentina()}
                            value={form.fecha}
                            onChange={(evento) =>
                                cambiar({ fecha: evento.target.value })
                            }
                        />
                    </Campo>

                    <Campo
                        label="En qué se gastó"
                        error={errores.categoria}
                        className="sm:col-span-2"
                    >
                        <Select
                            value={form.categoria}
                            onValueChange={(categoria) =>
                                cambiar({ categoria })
                            }
                        >
                            <SelectTrigger className="w-full">
                                <SelectValue placeholder="Elegí una opción" />
                            </SelectTrigger>
                            <SelectContent>
                                {CATEGORIAS_EGRESO.map((categoria) => (
                                    <SelectItem
                                        key={categoria}
                                        value={categoria}
                                    >
                                        {categoria}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </Campo>

                    <Campo
                        id="descripcion"
                        label="Detalle"
                        opcional
                        className="sm:col-span-2"
                    >
                        <Input
                            id="descripcion"
                            value={form.descripcion}
                            onChange={(evento) =>
                                cambiar({ descripcion: evento.target.value })
                            }
                            placeholder="Ej.: viaje a Once a comprar"
                            maxLength={255}
                        />
                    </Campo>

                    <div className="flex justify-end gap-2 sm:col-span-2">
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={onCerrar}
                        >
                            Cancelar
                        </Button>
                        <Button type="submit" disabled={guardando}>
                            {guardando ? 'Guardando...' : 'Registrar egreso'}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
