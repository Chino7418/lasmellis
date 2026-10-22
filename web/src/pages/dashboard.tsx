import {
    CheckCircle2,
    Clock,
    PackageX,
    Receipt,
    ShoppingCart,
    Users,
    Wallet,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { EstadoError, EstadoVacio } from '@/components/estados';
import { Page, PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useTitulo } from '@/hooks/use-titulo';
import { obtenerDashboard } from '@/lib/api';
import {
    cantidad,
    dinero,
    fechaHora,
    nombreCompleto,
    tipoPago,
} from '@/lib/formato';

type Venta = {
    id: number;
    numero: string;
    fecha: string;
    cliente: string | null;
    total: number;
    tipo_pago: string;
};

type StockBajo = {
    id: number;
    producto: string;
    cantidad: number;
    stock_minimo: number;
};

type Deudor = {
    id: number;
    nombre: string;
    apellido: string | null;
    saldo: number;
};

type DashboardData = {
    fecha: string;
    ventas: {
        cantidad: number;
        total: number;
        cobrado: number;
        pendiente: number;
    };
    stock: {
        productos_stock_bajo: number;
        detalle: StockBajo[];
    };
    cuenta_corriente: {
        clientes_con_deuda: number;
        total_deuda: number;
        detalle: Deudor[];
    };
    ultimas_ventas: Venta[];
};

const hoyLargo = new Intl.DateTimeFormat('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
}).format(new Date());

export default function Dashboard() {
    useTitulo('Dashboard');

    const [data, setData] = useState<DashboardData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        obtenerDashboard<DashboardData>()
            .then((resultado) => {
                setData(resultado);
            })
            .catch((error) => {
                setError(error.message);
            })
            .finally(() => {
                setLoading(false);
            });
    }, []);

    return (
        <Page>
            <PageHeader
                title="Dashboard"
                description={`Resumen de hoy, ${hoyLargo}`}
            />

            {error && <EstadoError mensaje={error} />}

            {/* INDICADORES */}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {loading || !data ? (
                    Array.from({ length: 4 }).map((_, i) => (
                        <div
                            key={i}
                            className="bg-card space-y-3 rounded-xl border p-5"
                        >
                            <Skeleton className="h-4 w-24" />
                            <Skeleton className="h-7 w-32" />
                            <Skeleton className="h-3 w-20" />
                        </div>
                    ))
                ) : (
                    <>
                        <Indicador
                            icon={ShoppingCart}
                            titulo="Vendido hoy"
                            valor={dinero(data.ventas.total)}
                            detalle={`${data.ventas.cantidad} venta${data.ventas.cantidad !== 1 ? 's' : ''}`}
                        />
                        <Indicador
                            icon={Wallet}
                            titulo="Cobrado hoy"
                            valor={dinero(data.ventas.cobrado)}
                            detalle="De las ventas de hoy"
                        />
                        <Indicador
                            icon={Clock}
                            titulo="Pendiente de cobro"
                            valor={dinero(data.ventas.pendiente)}
                            detalle="Ventas de hoy a cuenta corriente"
                            destacado={data.ventas.pendiente > 0}
                        />
                        <Indicador
                            icon={Users}
                            titulo="Deuda total"
                            valor={dinero(data.cuenta_corriente.total_deuda)}
                            detalle={`${data.cuenta_corriente.clientes_con_deuda} cliente${data.cuenta_corriente.clientes_con_deuda !== 1 ? 's' : ''} con saldo`}
                            destacado={data.cuenta_corriente.total_deuda > 0}
                        />
                    </>
                )}
            </div>

            {data && (
                <div className="grid gap-6 lg:grid-cols-3">
                    {/* ÚLTIMAS VENTAS */}
                    <Panel
                        titulo="Últimas ventas"
                        accion={
                            <Link
                                to="/ventas"
                                className="text-muted-foreground hover:text-foreground text-sm font-medium"
                            >
                                Nueva venta
                            </Link>
                        }
                        className="lg:col-span-2"
                    >
                        {data.ultimas_ventas.length === 0 ? (
                            <EstadoVacio
                                icon={Receipt}
                                title="Todavía no hay ventas"
                                description="Las ventas que registres van a aparecer acá."
                            />
                        ) : (
                            <ul className="divide-y">
                                {data.ultimas_ventas.map((venta) => (
                                    <li
                                        key={venta.id}
                                        className="flex items-center gap-4 px-5 py-3.5"
                                    >
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-sm font-medium">
                                                {venta.cliente ?? 'Sin cliente'}
                                            </p>
                                            <p className="text-muted-foreground truncate text-xs">
                                                {fechaHora(venta.fecha)} ·{' '}
                                                <span className="font-mono">
                                                    {venta.numero}
                                                </span>
                                            </p>
                                        </div>

                                        <Badge
                                            variant={
                                                venta.tipo_pago ===
                                                'cuenta_corriente'
                                                    ? 'warning'
                                                    : 'secondary'
                                            }
                                            className="hidden sm:inline-flex"
                                        >
                                            {tipoPago(venta.tipo_pago)}
                                        </Badge>

                                        <p className="w-28 text-right text-sm font-semibold tabular-nums">
                                            {dinero(venta.total)}
                                        </p>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Panel>

                    <div className="flex flex-col gap-6">
                        {/* STOCK BAJO */}
                        <Panel
                            titulo="Stock bajo"
                            accion={
                                data.stock.productos_stock_bajo > 0 && (
                                    <Badge variant="warning">
                                        {data.stock.productos_stock_bajo}
                                    </Badge>
                                )
                            }
                        >
                            {data.stock.detalle.length === 0 ? (
                                <EstadoVacio
                                    icon={CheckCircle2}
                                    title="Todo en orden"
                                    description="Ningún producto está por debajo del mínimo."
                                    className="py-8"
                                />
                            ) : (
                                <ul className="divide-y">
                                    {data.stock.detalle
                                        .slice(0, 6)
                                        .map((item) => (
                                            <li
                                                key={item.id}
                                                className="flex items-center justify-between gap-3 px-5 py-3"
                                            >
                                                <span className="flex min-w-0 items-center gap-2 text-sm">
                                                    <PackageX className="text-warning size-4 shrink-0" />
                                                    <span className="truncate">
                                                        {item.producto}
                                                    </span>
                                                </span>
                                                <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                                                    {cantidad(item.cantidad)} /
                                                    mín.{' '}
                                                    {cantidad(
                                                        item.stock_minimo,
                                                    )}
                                                </span>
                                            </li>
                                        ))}
                                </ul>
                            )}
                        </Panel>

                        {/* CLIENTES CON DEUDA */}
                        <Panel
                            titulo="Clientes con deuda"
                            accion={
                                <Link
                                    to="/clientes"
                                    className="text-muted-foreground hover:text-foreground text-sm font-medium"
                                >
                                    Ver todos
                                </Link>
                            }
                        >
                            {data.cuenta_corriente.detalle.length === 0 ? (
                                <EstadoVacio
                                    icon={CheckCircle2}
                                    title="Nadie debe nada"
                                    description="No hay saldos pendientes en cuenta corriente."
                                    className="py-8"
                                />
                            ) : (
                                <ul className="divide-y">
                                    {data.cuenta_corriente.detalle
                                        .slice(0, 6)
                                        .map((cliente) => (
                                            <li
                                                key={cliente.id}
                                                className="flex items-center justify-between gap-3 px-5 py-3"
                                            >
                                                <span className="truncate text-sm">
                                                    {nombreCompleto(cliente)}
                                                </span>
                                                <span className="text-destructive shrink-0 text-sm font-medium tabular-nums">
                                                    {dinero(cliente.saldo)}
                                                </span>
                                            </li>
                                        ))}
                                </ul>
                            )}
                        </Panel>
                    </div>
                </div>
            )}
        </Page>
    );
}

function Indicador({
    icon: Icon,
    titulo,
    valor,
    detalle,
    destacado = false,
}: {
    icon: LucideIcon;
    titulo: string;
    valor: string;
    detalle: string;
    destacado?: boolean;
}) {
    return (
        <div className="bg-card shadow-xs rounded-xl border p-5">
            <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-sm">{titulo}</span>
                <span className="bg-accent text-accent-foreground flex size-8 items-center justify-center rounded-full">
                    <Icon className="size-4" />
                </span>
            </div>
            <p
                className={`mt-2 text-2xl font-semibold tabular-nums tracking-tight ${destacado ? 'text-destructive' : ''}`}
            >
                {valor}
            </p>
            <p className="text-muted-foreground mt-1 text-xs">{detalle}</p>
        </div>
    );
}

function Panel({
    titulo,
    accion,
    className = '',
    children,
}: {
    titulo: string;
    accion?: ReactNode;
    className?: string;
    children: ReactNode;
}) {
    return (
        <section
            className={`bg-card shadow-xs overflow-hidden rounded-xl border ${className}`}
        >
            <div className="flex items-center justify-between border-b px-5 py-3.5">
                <h2 className="font-serif text-base font-medium">{titulo}</h2>
                {accion}
            </div>
            {children}
        </section>
    );
}
