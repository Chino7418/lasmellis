import {
    CalendarDays,
    CheckCircle2,
    PackageX,
    Plus,
    Receipt,
    ShoppingCart,
    TrendingUp,
    Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { EstadoError, EstadoVacio } from '@/components/estados';
import {
    GraficoVentasMes,
    MESES_EN_CELU,
} from '@/components/grafico-ventas-mes';
import type { VentasMes } from '@/components/grafico-ventas-mes';
import { Page, PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useIsMobile } from '@/hooks/use-mobile';
import { useTitulo } from '@/hooks/use-titulo';
import { obtenerDashboard } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { dinero, fechaHora, nombreCompleto, tipoPago } from '@/lib/formato';
import { cn } from '@/lib/utils';

type Venta = {
    id: number;
    numero: string;
    fecha: string;
    cliente: string | null;
    total: number;
    tipo_pago: string;
};

type SinStock = {
    variante_id: number;
    producto: string;
    color: string | null;
    talle: string | null;
};

type Deudor = {
    id: number;
    nombre: string;
    apellido: string | null;
    saldo: number;
};

type Totales = { cantidad: number; total: number };

type DashboardData = {
    fecha: string;
    ventas: Totales & { cobrado: number; pendiente: number };
    mes_actual: Totales;
    por_mes: VentasMes[];
    total_general: Totales;
    stock: { sin_stock: SinStock[] };
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

const mesActual = new Intl.DateTimeFormat('es-AR', { month: 'long' }).format(
    new Date(),
);

function ventas(cantidad: number): string {
    return `${cantidad} venta${cantidad !== 1 ? 's' : ''}`;
}

export default function Dashboard() {
    useTitulo('Inicio');

    const { user } = useAuth();
    const esCelu = useIsMobile();
    const [data, setData] = useState<DashboardData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        obtenerDashboard<DashboardData>()
            .then(setData)
            .catch((error) => setError(error.message))
            .finally(() => setLoading(false));
    }, []);

    // "Hola, Ana": primer nombre del perfil, o lo que está antes del @.
    const nombre =
        (user?.name && user.name !== user.email
            ? user.name.split(' ')[0]
            : user?.email.split('@')[0]) ?? '';

    return (
        <Page>
            <PageHeader
                title={nombre ? `Hola, ${nombre}` : 'Hola'}
                description={`Así vienen las ventas · ${hoyLargo}`}
                actions={
                    <Button asChild>
                        <Link to="/ventas">
                            <Plus />
                            Nueva venta
                        </Link>
                    </Button>
                }
            />

            {error && <EstadoError mensaje={error} />}

            {/* AVISO: SIN STOCK */}
            {data && data.stock.sin_stock.length > 0 && (
                <AvisoSinStock items={data.stock.sin_stock} />
            )}

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
                            icon={CalendarDays}
                            titulo={`Vendido en ${mesActual}`}
                            valor={dinero(data.mes_actual.total)}
                            detalle={ventas(data.mes_actual.cantidad)}
                        />
                        <Indicador
                            icon={ShoppingCart}
                            titulo="Vendido hoy"
                            valor={dinero(data.ventas.total)}
                            detalle={`${ventas(data.ventas.cantidad)} · cobrado ${dinero(data.ventas.cobrado)}`}
                        />
                        <Indicador
                            icon={TrendingUp}
                            titulo="Total vendido"
                            valor={dinero(data.total_general.total)}
                            detalle={`${ventas(data.total_general.cantidad)} desde el inicio`}
                        />
                        <Indicador
                            icon={Users}
                            titulo="Deuda en cuentas corrientes"
                            valor={dinero(data.cuenta_corriente.total_deuda)}
                            detalle={`${data.cuenta_corriente.clientes_con_deuda} cliente${data.cuenta_corriente.clientes_con_deuda !== 1 ? 's' : ''} con saldo`}
                            destacado={data.cuenta_corriente.total_deuda > 0}
                            href="/cuentas-corrientes"
                        />
                    </>
                )}
            </div>

            {/* VENTAS POR MES */}
            <Panel
                titulo="Ventas por mes"
                subtitulo={`Últimos ${esCelu ? MESES_EN_CELU : 12} meses`}
            >
                <div className="p-5">
                    {loading || !data ? (
                        <Skeleton className="h-56 w-full" />
                    ) : (
                        <GraficoVentasMes datos={data.por_mes} />
                    )}
                </div>
            </Panel>

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

                    {/* CLIENTES CON DEUDA */}
                    <Panel
                        titulo="Clientes con deuda"
                        accion={
                            <Link
                                to="/cuentas-corrientes"
                                className="text-muted-foreground hover:text-foreground text-sm font-medium"
                            >
                                Ver todas
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
            )}
        </Page>
    );
}

function AvisoSinStock({ items }: { items: SinStock[] }) {
    const visibles = items.slice(0, 5);

    return (
        <div className="border-warning/30 bg-warning-soft flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-start">
            <PackageX className="text-warning size-5 shrink-0" />
            <div className="min-w-0 flex-1 text-sm">
                <p className="font-medium">
                    {items.length === 1
                        ? 'Hay 1 producto sin stock'
                        : `Hay ${items.length} productos sin stock`}
                </p>
                <p className="text-muted-foreground mt-0.5">
                    {visibles
                        .map((item) =>
                            [item.producto, item.color, item.talle]
                                .filter(Boolean)
                                .join(' · '),
                        )
                        .join(' — ')}
                    {items.length > visibles.length &&
                        ` y ${items.length - visibles.length} más`}
                </p>
            </div>
            <Link
                to="/productos"
                className="text-foreground shrink-0 text-sm font-medium underline-offset-4 hover:underline"
            >
                Cargar stock
            </Link>
        </div>
    );
}

function Indicador({
    icon: Icon,
    titulo,
    valor,
    detalle,
    destacado = false,
    href,
}: {
    icon: LucideIcon;
    titulo: string;
    valor: string;
    detalle: string;
    destacado?: boolean;
    href?: string;
}) {
    const contenido = (
        <>
            <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground text-sm first-letter:uppercase">
                    {titulo}
                </span>
                <span className="bg-accent text-accent-foreground flex size-8 shrink-0 items-center justify-center rounded-full">
                    <Icon className="size-4" />
                </span>
            </div>
            <p
                className={cn(
                    'mt-2 text-2xl font-semibold tabular-nums tracking-tight',
                    destacado && 'text-destructive',
                )}
            >
                {valor}
            </p>
            <p className="text-muted-foreground mt-1 text-xs">{detalle}</p>
        </>
    );

    const clases = 'bg-card shadow-xs block rounded-xl border p-5';

    return href ? (
        <Link
            to={href}
            className={cn(clases, 'hover:bg-muted/30 transition-colors')}
        >
            {contenido}
        </Link>
    ) : (
        <div className={clases}>{contenido}</div>
    );
}

function Panel({
    titulo,
    subtitulo,
    accion,
    className = '',
    children,
}: {
    titulo: string;
    subtitulo?: string;
    accion?: ReactNode;
    className?: string;
    children: ReactNode;
}) {
    return (
        <section
            className={`bg-card shadow-xs overflow-hidden rounded-xl border ${className}`}
        >
            <div className="flex items-center justify-between border-b px-5 py-3.5">
                <div>
                    <h2 className="font-serif text-base font-medium">
                        {titulo}
                    </h2>
                    {subtitulo && (
                        <p className="text-muted-foreground text-xs">
                            {subtitulo}
                        </p>
                    )}
                </div>
                {accion}
            </div>
            {children}
        </section>
    );
}
