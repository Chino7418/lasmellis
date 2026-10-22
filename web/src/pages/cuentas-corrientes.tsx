import {
    BookUser,
    MessageCircle,
    NotebookPen,
    Search,
    Wallet,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
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
    cargarSaldoAnterior,
    estadoDeCuenta,
    listarClientes,
    pagarCuentaCorriente,
} from '@/lib/api';
import type { MovimientoCuenta } from '@/lib/api';
import { dinero, fechaHora, nombreCompleto, tipoPago } from '@/lib/formato';
import { cn } from '@/lib/utils';

type Cliente = {
    id: number;
    nombre: string;
    apellido: string | null;
    documento: string | null;
    telefono: string | null;
    saldo: number | string;
};

const MEDIOS_PAGO = [
    { value: 'efectivo', label: 'Efectivo' },
    { value: 'transferencia', label: 'Transferencia' },
    { value: 'tarjeta_debito', label: 'Tarjeta de débito' },
    { value: 'tarjeta_credito', label: 'Tarjeta de crédito' },
];

/** Fecha de hoy en Argentina, AAAA-MM-DD (para inputs de fecha). */
function hoyEnArgentina(): string {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Argentina/Buenos_Aires',
    }).format(new Date());
}

/** Link de WhatsApp con un recordatorio de saldo (Argentina por defecto). */
function linkRecordatorio(cliente: Cliente, saldo: number): string | null {
    const digitos = (cliente.telefono ?? '').replace(/\D/g, '');

    if (digitos.length < 8) {
        return null;
    }

    const numero = digitos.startsWith('54') ? digitos : `549${digitos}`;
    const texto = `Hola ${cliente.nombre}! Te escribimos de Las Mellis para recordarte que tenés un saldo pendiente de ${dinero(saldo)}. ¡Gracias!`;

    return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
}

export default function CuentasCorrientes() {
    useTitulo('Cuentas corrientes');

    const [clientes, setClientes] = useState<Cliente[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [busqueda, setBusqueda] = useState('');
    const [soloDeudores, setSoloDeudores] = useState(true);
    const [seleccionado, setSeleccionado] = useState<Cliente | null>(null);

    const cargar = () =>
        listarClientes<Cliente>()
            .then((resultado) => {
                setClientes(resultado);
                setError(null);
            })
            .catch((error) => setError(error.message))
            .finally(() => setLoading(false));

    useEffect(() => {
        void cargar();
    }, []);

    const conDeuda = clientes.filter((cliente) => Number(cliente.saldo) > 0);
    const totalDeuda = conDeuda.reduce(
        (total, cliente) => total + Number(cliente.saldo),
        0,
    );

    const visibles = useMemo(() => {
        const texto = busqueda.trim().toLowerCase();

        return clientes
            .filter((cliente) => !soloDeudores || Number(cliente.saldo) > 0)
            .filter(
                (cliente) =>
                    !texto ||
                    nombreCompleto(cliente).toLowerCase().includes(texto) ||
                    cliente.documento?.toLowerCase().includes(texto) ||
                    cliente.telefono?.toLowerCase().includes(texto),
            )
            .sort((a, b) => Number(b.saldo) - Number(a.saldo));
    }, [clientes, busqueda, soloDeudores]);

    return (
        <Page>
            <PageHeader
                title="Cuentas corrientes"
                description="Lo que debe cada cliente y el registro de sus pagos"
            />

            {error && <EstadoError mensaje={error} />}

            {/* RESUMEN */}
            <div className="grid gap-4 sm:grid-cols-2">
                <Resumen
                    titulo="Total adeudado"
                    valor={loading ? null : dinero(totalDeuda)}
                    destacado={totalDeuda > 0}
                />
                <Resumen
                    titulo="Clientes con deuda"
                    valor={loading ? null : String(conDeuda.length)}
                />
            </div>

            <section className="bg-card shadow-xs overflow-hidden rounded-xl border">
                <div className="flex flex-wrap items-center gap-3 border-b p-3">
                    <div className="relative min-w-0 flex-1 sm:max-w-sm">
                        <Search className="text-muted-foreground absolute left-3 top-1/2 size-4 -translate-y-1/2" />
                        <Input
                            value={busqueda}
                            onChange={(evento) =>
                                setBusqueda(evento.target.value)
                            }
                            placeholder="Buscar cliente..."
                            className="pl-9"
                        />
                    </div>

                    <div className="bg-muted flex rounded-full p-1 text-sm">
                        {[
                            { valor: true, texto: 'Con deuda' },
                            { valor: false, texto: 'Todos' },
                        ].map((opcion) => (
                            <button
                                key={opcion.texto}
                                type="button"
                                onClick={() => setSoloDeudores(opcion.valor)}
                                className={cn(
                                    'rounded-full px-3 py-1 transition-colors',
                                    soloDeudores === opcion.valor
                                        ? 'bg-card shadow-xs font-medium'
                                        : 'text-muted-foreground hover:text-foreground',
                                )}
                                aria-pressed={soloDeudores === opcion.valor}
                            >
                                {opcion.texto}
                            </button>
                        ))}
                    </div>
                </div>

                {loading && <FilasCargando />}

                {!loading && !error && visibles.length === 0 && (
                    <EstadoVacio
                        icon={BookUser}
                        title={
                            soloDeudores && !busqueda
                                ? 'Nadie debe nada'
                                : 'No se encontraron clientes'
                        }
                        description={
                            soloDeudores && !busqueda
                                ? 'Cuando una venta quede sin pagar, el cliente va a aparecer acá. Para cargar una deuda que ya traía, entrá en "Todos" y elegí al cliente.'
                                : 'Probá con otro nombre, documento o teléfono.'
                        }
                    />
                )}

                {!loading && visibles.length > 0 && (
                    <ul className="divide-y">
                        {visibles.map((cliente) => {
                            const saldo = Number(cliente.saldo);

                            return (
                                <li key={cliente.id}>
                                    <button
                                        type="button"
                                        onClick={() => setSeleccionado(cliente)}
                                        className="hover:bg-muted/40 flex w-full items-center gap-4 px-5 py-3.5 text-left transition-colors"
                                    >
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-sm font-medium">
                                                {nombreCompleto(cliente)}
                                            </p>
                                            <p className="text-muted-foreground truncate text-xs">
                                                {[
                                                    cliente.telefono,
                                                    cliente.documento,
                                                ]
                                                    .filter(Boolean)
                                                    .join(' · ') ||
                                                    'Sin datos de contacto'}
                                            </p>
                                        </div>

                                        {saldo > 0 ? (
                                            <Badge
                                                variant="danger"
                                                className="tabular-nums"
                                            >
                                                Debe {dinero(saldo)}
                                            </Badge>
                                        ) : (
                                            <span className="text-muted-foreground text-sm">
                                                Al día
                                            </span>
                                        )}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </section>

            {seleccionado && (
                <DetalleCuenta
                    key={seleccionado.id}
                    cliente={seleccionado}
                    onCerrar={() => setSeleccionado(null)}
                    onPago={() => void cargar()}
                />
            )}
        </Page>
    );
}

function Resumen({
    titulo,
    valor,
    destacado = false,
}: {
    titulo: string;
    valor: string | null;
    destacado?: boolean;
}) {
    return (
        <div className="bg-card shadow-xs rounded-xl border p-5">
            <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-sm">{titulo}</span>
                <span className="bg-accent text-accent-foreground flex size-8 items-center justify-center rounded-full">
                    <Wallet className="size-4" />
                </span>
            </div>
            {valor === null ? (
                <Skeleton className="mt-2 h-7 w-32" />
            ) : (
                <p
                    className={cn(
                        'mt-2 text-2xl font-semibold tabular-nums tracking-tight',
                        destacado && 'text-destructive',
                    )}
                >
                    {valor}
                </p>
            )}
        </div>
    );
}

/** Estado de cuenta de un cliente con su historial y el registro de pagos. */
function DetalleCuenta({
    cliente,
    onCerrar,
    onPago,
}: {
    cliente: Cliente;
    onCerrar: () => void;
    onPago: () => void;
}) {
    const [movimientos, setMovimientos] = useState<MovimientoCuenta[]>([]);
    const [saldo, setSaldo] = useState(Number(cliente.saldo));
    const [cargando, setCargando] = useState(true);

    const [monto, setMonto] = useState('');
    const [medio, setMedio] = useState('efectivo');
    const [observaciones, setObservaciones] = useState('');
    const [pagando, setPagando] = useState(false);

    const [conSaldoAnterior, setConSaldoAnterior] = useState(false);
    const [montoAnterior, setMontoAnterior] = useState('');
    const [fechaAnterior, setFechaAnterior] = useState(hoyEnArgentina);
    const [notaAnterior, setNotaAnterior] = useState('');
    const [guardandoAnterior, setGuardandoAnterior] = useState(false);

    const cargar = () =>
        estadoDeCuenta(cliente.id)
            .then((estado) => {
                setMovimientos(estado.movimientos);
                setSaldo(estado.saldo);
                setMonto(
                    estado.saldo > 0
                        ? String(Number(estado.saldo.toFixed(2)))
                        : '',
                );
            })
            .catch((error) =>
                toast.error(
                    error instanceof Error
                        ? error.message
                        : 'No se pudo cargar la cuenta.',
                ),
            )
            .finally(() => setCargando(false));

    useEffect(() => {
        void cargar();
    }, []);

    // Saldo acumulado después de cada movimiento (del más viejo al más
    // nuevo); se muestran del más nuevo al más viejo.
    const filas = useMemo(() => {
        let acumulado = 0;

        return movimientos
            .map((movimiento) => {
                const importe = Number(movimiento.importe);
                acumulado += movimiento.tipo === 'debe' ? importe : -importe;

                return { ...movimiento, importe, acumulado };
            })
            .reverse();
    }, [movimientos]);

    const registrarPago = async (evento: FormEvent) => {
        evento.preventDefault();

        const valor = Number(monto);

        if (!valor || valor <= 0) {
            toast.error('Ingresá un monto mayor a cero.');

            return;
        }

        setPagando(true);

        try {
            const resultado = await pagarCuentaCorriente(
                cliente.id,
                valor,
                medio,
                observaciones || null,
            );

            toast.success(
                `Pago registrado. Saldo: ${dinero(resultado.saldo_actual)}.`,
            );
            setObservaciones('');
            await cargar();
            onPago();
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? error.message
                    : 'No se pudo registrar el pago.',
            );
        } finally {
            setPagando(false);
        }
    };

    const guardarSaldoAnterior = async (evento: FormEvent) => {
        evento.preventDefault();
        setGuardandoAnterior(true);

        try {
            await cargarSaldoAnterior(
                cliente.id,
                Number(montoAnterior),
                fechaAnterior,
                notaAnterior,
            );

            toast.success('Saldo anterior cargado.');
            setConSaldoAnterior(false);
            setMontoAnterior('');
            setNotaAnterior('');
            await cargar();
            onPago();
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? error.message
                    : 'No se pudo cargar el saldo anterior.',
            );
        } finally {
            setGuardandoAnterior(false);
        }
    };

    const whatsapp = saldo > 0 ? linkRecordatorio(cliente, saldo) : null;

    return (
        <Dialog open onOpenChange={(abierto) => !abierto && onCerrar()}>
            <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>{nombreCompleto(cliente)}</DialogTitle>
                    <DialogDescription>
                        Estado de cuenta corriente
                    </DialogDescription>
                </DialogHeader>

                {/* SALDO */}
                <div className="bg-muted/50 flex flex-wrap items-center justify-between gap-3 rounded-lg p-4">
                    <div>
                        <p className="text-muted-foreground text-sm">
                            Saldo actual
                        </p>
                        <p
                            className={cn(
                                'text-2xl font-semibold tabular-nums tracking-tight',
                                saldo > 0 && 'text-destructive',
                            )}
                        >
                            {cargando ? '…' : dinero(saldo)}
                        </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        {!conSaldoAnterior && (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setConSaldoAnterior(true)}
                            >
                                <NotebookPen />
                                Cargar saldo anterior
                            </Button>
                        )}

                        {whatsapp && (
                            <Button asChild variant="outline" size="sm">
                                <a
                                    href={whatsapp}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    <MessageCircle />
                                    Recordar por WhatsApp
                                </a>
                            </Button>
                        )}
                    </div>
                </div>

                {/* SALDO ANTERIOR: deuda que ya traía antes de la app */}
                {conSaldoAnterior && (
                    <form
                        onSubmit={guardarSaldoAnterior}
                        className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2"
                    >
                        <div className="sm:col-span-2">
                            <p className="text-sm font-medium">
                                Saldo anterior
                            </p>
                            <p className="text-muted-foreground text-xs">
                                Lo que ya debía antes de usar la app. Se suma a
                                su saldo; no toca stock ni ventas.
                            </p>
                        </div>

                        <Campo id="monto-anterior" label="Monto que debe">
                            <Input
                                id="monto-anterior"
                                type="number"
                                min="0"
                                step="0.01"
                                inputMode="decimal"
                                value={montoAnterior}
                                onChange={(evento) =>
                                    setMontoAnterior(evento.target.value)
                                }
                                autoFocus
                            />
                        </Campo>

                        <Campo id="fecha-anterior" label="Desde cuándo">
                            <Input
                                id="fecha-anterior"
                                type="date"
                                max={hoyEnArgentina()}
                                value={fechaAnterior}
                                onChange={(evento) =>
                                    setFechaAnterior(evento.target.value)
                                }
                            />
                        </Campo>

                        <Campo
                            id="nota-anterior"
                            label="Nota"
                            opcional
                            className="sm:col-span-2"
                        >
                            <Input
                                id="nota-anterior"
                                value={notaAnterior}
                                onChange={(evento) =>
                                    setNotaAnterior(evento.target.value)
                                }
                                placeholder="Ej.: deuda del cuaderno"
                                maxLength={200}
                            />
                        </Campo>

                        <div className="flex gap-2 sm:col-span-2 sm:justify-end">
                            <Button
                                type="button"
                                variant="ghost"
                                onClick={() => setConSaldoAnterior(false)}
                            >
                                Cancelar
                            </Button>
                            <Button type="submit" disabled={guardandoAnterior}>
                                {guardandoAnterior
                                    ? 'Guardando...'
                                    : 'Cargar saldo'}
                            </Button>
                        </div>
                    </form>
                )}

                {/* REGISTRAR PAGO */}
                {saldo > 0 && (
                    <form
                        onSubmit={registrarPago}
                        className="grid gap-3 rounded-lg border p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
                    >
                        <div className="sm:col-span-3">
                            <p className="text-sm font-medium">
                                Registrar pago
                            </p>
                            <p className="text-muted-foreground text-xs">
                                Si paga todo, el saldo queda en cero.
                            </p>
                        </div>

                        <Campo id="monto-pago" label="Monto">
                            <Input
                                id="monto-pago"
                                type="number"
                                min="0"
                                step="0.01"
                                inputMode="decimal"
                                value={monto}
                                onChange={(evento) =>
                                    setMonto(evento.target.value)
                                }
                            />
                        </Campo>

                        <Campo label="Medio de pago">
                            <Select value={medio} onValueChange={setMedio}>
                                <SelectTrigger className="w-full">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {MEDIOS_PAGO.map((opcion) => (
                                        <SelectItem
                                            key={opcion.value}
                                            value={opcion.value}
                                        >
                                            {opcion.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </Campo>

                        <Button type="submit" disabled={pagando}>
                            {pagando ? 'Registrando...' : 'Confirmar pago'}
                        </Button>

                        <Campo
                            id="observaciones-pago"
                            label="Observaciones"
                            opcional
                            className="sm:col-span-3"
                        >
                            <Input
                                id="observaciones-pago"
                                value={observaciones}
                                onChange={(evento) =>
                                    setObservaciones(evento.target.value)
                                }
                            />
                        </Campo>
                    </form>
                )}

                {/* MOVIMIENTOS */}
                <div>
                    <h3 className="mb-2 font-serif text-base font-medium">
                        Movimientos
                    </h3>

                    {cargando ? (
                        <FilasCargando filas={3} />
                    ) : filas.length === 0 ? (
                        <p className="text-muted-foreground text-sm">
                            Este cliente no tiene movimientos en cuenta
                            corriente.
                        </p>
                    ) : (
                        <div className="overflow-x-auto rounded-lg border">
                            <table className="w-full min-w-[520px] text-sm">
                                <thead>
                                    <tr className="text-muted-foreground border-b text-left text-xs">
                                        <th className="px-3 py-2 font-medium">
                                            Fecha
                                        </th>
                                        <th className="px-3 py-2 font-medium">
                                            Concepto
                                        </th>
                                        <th className="px-3 py-2 text-right font-medium">
                                            Debe
                                        </th>
                                        <th className="px-3 py-2 text-right font-medium">
                                            Pagó
                                        </th>
                                        <th className="px-3 py-2 text-right font-medium">
                                            Saldo
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {filas.map((fila) => (
                                        <tr key={fila.id}>
                                            <td className="text-muted-foreground whitespace-nowrap px-3 py-2 text-xs">
                                                {/* Las fechas se guardan en UTC sin zona. */}
                                                {fechaHora(`${fila.fecha}Z`)}
                                            </td>
                                            <td className="px-3 py-2">
                                                {fila.concepto}
                                                {fila.pago && (
                                                    <span className="text-muted-foreground">
                                                        {' · '}
                                                        {tipoPago(
                                                            fila.pago
                                                                .medio_pago,
                                                        )}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="text-destructive px-3 py-2 text-right tabular-nums">
                                                {fila.tipo === 'debe'
                                                    ? dinero(fila.importe)
                                                    : ''}
                                            </td>
                                            <td className="text-success px-3 py-2 text-right tabular-nums">
                                                {fila.tipo === 'haber'
                                                    ? dinero(fila.importe)
                                                    : ''}
                                            </td>
                                            <td className="px-3 py-2 text-right font-medium tabular-nums">
                                                {dinero(fila.acumulado)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
