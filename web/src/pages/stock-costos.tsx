import {
    AlertTriangle,
    Boxes,
    CircleDollarSign,
    Package,
    PiggyBank,
    TrendingUp,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { EstadoError, EstadoVacio, FilasCargando } from '@/components/estados';
import { Page, PageHeader } from '@/components/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { useTitulo } from '@/hooks/use-titulo';
import { listarProductos } from '@/lib/api';
import { cantidad, dinero, tituloProducto } from '@/lib/formato';
import { cn } from '@/lib/utils';

type Variante = {
    id: number;
    costo: string | number;
    precios: { precio: string | number; activo: boolean }[];
    stock: { cantidad: string | number }[];
};

type Producto = {
    id: number;
    nombre: string;
    descripcion: string | null;
    marca?: { id: number; nombre: string } | null;
    variantes: Variante[];
};

/** Unidades, plata a precio de venta y plata a costo. */
type Valores = {
    unidades: number;
    venta: number;
    costo: number;
};

const vacio = (): Valores => ({ unidades: 0, venta: 0, costo: 0 });

function sumar(total: Valores, otro: Valores) {
    total.unidades += otro.unidades;
    total.venta += otro.venta;
    total.costo += otro.costo;
}

function valoresDeVariante(variante: Variante): Valores {
    // Stock negativo (vendido de más) no suma plata.
    const unidades = Math.max(
        variante.stock.reduce((suma, item) => suma + Number(item.cantidad), 0),
        0,
    );
    const precio = variante.precios.find((item) => item.activo);

    return {
        unidades,
        venta: unidades * Number(precio?.precio ?? 0),
        costo: unidades * Number(variante.costo),
    };
}

function margen(valores: Valores): number | null {
    return valores.venta > 0
        ? (valores.venta - valores.costo) / valores.venta
        : null;
}

function porcentaje(valor: number | null): string {
    return valor === null ? '—' : `${Math.round(valor * 100)}%`;
}

export default function StockCostos() {
    useTitulo('Stock y costos');

    const [productos, setProductos] = useState<Producto[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        listarProductos<Producto>()
            .then(setProductos)
            .catch((error) => setError(error.message))
            .finally(() => setLoading(false));
    }, []);

    const { total, porMarca, porProducto, sinCosto } = useMemo(() => {
        const total = vacio();
        const marcas = new Map<string, Valores>();
        const filas: { producto: Producto; valores: Valores }[] = [];
        let sinCosto = 0;

        for (const producto of productos) {
            const valores = vacio();

            for (const variante of producto.variantes) {
                const deVariante = valoresDeVariante(variante);

                if (deVariante.unidades > 0 && !(Number(variante.costo) > 0)) {
                    sinCosto++;
                }

                sumar(valores, deVariante);
            }

            if (valores.unidades === 0) {
                continue;
            }

            sumar(total, valores);
            filas.push({ producto, valores });

            const marca = producto.marca?.nombre ?? 'Sin marca';
            const deMarca = marcas.get(marca) ?? vacio();
            sumar(deMarca, valores);
            marcas.set(marca, deMarca);
        }

        return {
            total,
            porMarca: [...marcas.entries()]
                .map(([marca, valores]) => ({ marca, valores }))
                .sort((a, b) => b.valores.venta - a.valores.venta),
            porProducto: filas.sort(
                (a, b) => b.valores.venta - a.valores.venta,
            ),
            sinCosto,
        };
    }, [productos]);

    return (
        <Page>
            <PageHeader
                title="Stock y costos"
                description="Cuánta plata hay en mercadería: a precio de venta y a lo que costó"
            />

            {error && <EstadoError mensaje={error} />}

            {/* TOTALES */}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Total
                    icon={Boxes}
                    titulo="Unidades en stock"
                    valor={loading ? null : cantidad(total.unidades)}
                />
                <Total
                    icon={CircleDollarSign}
                    titulo="Valor del stock"
                    ayuda="Si vendés todo a precio de venta"
                    valor={loading ? null : dinero(total.venta)}
                />
                <Total
                    icon={PiggyBank}
                    titulo="Costo del stock"
                    ayuda="Lo que te costó esa mercadería"
                    valor={loading ? null : dinero(total.costo)}
                />
                <Total
                    icon={TrendingUp}
                    titulo="Ganancia si vendés todo"
                    ayuda={`Margen ${porcentaje(margen(total))}`}
                    valor={loading ? null : dinero(total.venta - total.costo)}
                    destacado
                />
            </div>

            {!loading && sinCosto > 0 && (
                <div className="border-warning/30 bg-warning-soft flex items-start gap-3 rounded-xl border p-4 text-sm">
                    <AlertTriangle className="text-warning mt-0.5 size-4 shrink-0" />
                    <p>
                        {sinCosto === 1
                            ? 'Hay 1 variante con stock que no tiene costo cargado'
                            : `Hay ${sinCosto} variantes con stock que no tienen costo cargado`}
                        , así que el costo real es mayor y la ganancia, menor.
                        Cargalo desde{' '}
                        <Link
                            to="/productos"
                            className="font-medium underline underline-offset-4"
                        >
                            Productos
                        </Link>
                        , editando cada variante.
                    </p>
                </div>
            )}

            {loading ? (
                <Panel titulo="Por marca">
                    <FilasCargando filas={4} />
                </Panel>
            ) : porProducto.length === 0 ? (
                <Panel titulo="Por marca">
                    <EstadoVacio
                        icon={Package}
                        title="No hay stock"
                        description="Cuando cargues stock en las variantes de tus productos, vas a ver acá cuánto vale."
                    />
                </Panel>
            ) : (
                <>
                    <Panel titulo="Por marca">
                        <Tabla
                            columna="Marca"
                            filas={porMarca.map((item) => ({
                                clave: item.marca,
                                nombre: item.marca,
                                valores: item.valores,
                            }))}
                        />
                    </Panel>

                    <Panel titulo="Por producto">
                        <Tabla
                            columna="Producto"
                            filas={porProducto.map((item) => ({
                                clave: String(item.producto.id),
                                nombre: tituloProducto(item.producto),
                                valores: item.valores,
                            }))}
                        />
                    </Panel>
                </>
            )}
        </Page>
    );
}

function Total({
    icon: Icon,
    titulo,
    ayuda,
    valor,
    destacado = false,
}: {
    icon: LucideIcon;
    titulo: string;
    ayuda?: string;
    valor: string | null;
    destacado?: boolean;
}) {
    return (
        <div
            className={cn(
                'bg-card shadow-xs rounded-xl border p-5',
                destacado && 'border-primary/30',
            )}
        >
            <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground text-sm">{titulo}</span>
                <span className="bg-accent text-accent-foreground flex size-8 shrink-0 items-center justify-center rounded-full">
                    <Icon className="size-4" />
                </span>
            </div>
            {valor === null ? (
                <Skeleton className="mt-2 h-7 w-32" />
            ) : (
                <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">
                    {valor}
                </p>
            )}
            {ayuda && (
                <p className="text-muted-foreground mt-1 text-xs">{ayuda}</p>
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

/** Tabla en la compu; lista compacta en el celu. */
function Tabla({
    columna,
    filas,
}: {
    columna: string;
    filas: { clave: string; nombre: string; valores: Valores }[];
}) {
    return (
        <>
            <ul className="divide-y sm:hidden">
                {filas.map((fila) => (
                    <li key={fila.clave} className="px-5 py-3">
                        <div className="flex items-start justify-between gap-3">
                            <p className="line-clamp-2 text-sm font-medium">
                                {fila.nombre}
                            </p>
                            <p className="shrink-0 text-sm font-semibold tabular-nums">
                                {dinero(fila.valores.venta)}
                            </p>
                        </div>
                        <p className="text-muted-foreground mt-0.5 text-xs tabular-nums">
                            {cantidad(fila.valores.unidades)} u. · costo{' '}
                            {dinero(fila.valores.costo)} · ganancia{' '}
                            {dinero(fila.valores.venta - fila.valores.costo)} (
                            {porcentaje(margen(fila.valores))})
                        </p>
                    </li>
                ))}
            </ul>

            <div className="hidden overflow-x-auto sm:block">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-muted-foreground border-b text-left text-xs">
                            <th className="px-5 py-2.5 font-medium">
                                {columna}
                            </th>
                            <th className="px-3 py-2.5 text-right font-medium">
                                Unidades
                            </th>
                            <th className="px-3 py-2.5 text-right font-medium">
                                Costo
                            </th>
                            <th className="px-3 py-2.5 text-right font-medium">
                                Valor de venta
                            </th>
                            <th className="px-3 py-2.5 text-right font-medium">
                                Ganancia
                            </th>
                            <th className="px-5 py-2.5 text-right font-medium">
                                Margen
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {filas.map((fila) => (
                            <tr key={fila.clave}>
                                <td className="max-w-80 truncate px-5 py-2.5">
                                    {fila.nombre}
                                </td>
                                <td className="px-3 py-2.5 text-right tabular-nums">
                                    {cantidad(fila.valores.unidades)}
                                </td>
                                <td className="text-muted-foreground px-3 py-2.5 text-right tabular-nums">
                                    {dinero(fila.valores.costo)}
                                </td>
                                <td className="px-3 py-2.5 text-right font-medium tabular-nums">
                                    {dinero(fila.valores.venta)}
                                </td>
                                <td className="px-3 py-2.5 text-right tabular-nums">
                                    {dinero(
                                        fila.valores.venta - fila.valores.costo,
                                    )}
                                </td>
                                <td className="text-muted-foreground px-5 py-2.5 text-right tabular-nums">
                                    {porcentaje(margen(fila.valores))}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </>
    );
}
