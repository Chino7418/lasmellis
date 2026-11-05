import {
    Boxes,
    CheckCircle2,
    FileDown,
    FileSpreadsheet,
    Layers,
    PackageX,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { EstadoError, EstadoVacio, FilasCargando } from '@/components/estados';
import { Page, PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useTitulo } from '@/hooks/use-titulo';
import { listarProductos } from '@/lib/api';
import { cantidad, tituloProducto } from '@/lib/formato';
import { descargarCsv, descargarPdf, fechaArchivo } from '@/lib/informes';
import { cn } from '@/lib/utils';

type Variante = {
    id: number;
    activo: boolean;
    codigo_barras: string;
    color?: { nombre: string } | null;
    talle?: { nombre: string } | null;
    stock: { cantidad: string | number; stock_minimo: string | number }[];
};

type Producto = {
    id: number;
    activo: boolean;
    nombre: string;
    descripcion: string | null;
    marca?: { nombre: string } | null;
    variantes: Variante[];
};

type Faltante = {
    id: number;
    marca: string;
    producto: string;
    color: string;
    talle: string;
    codigo: string;
    stock: number;
    minimo: number;
    sinStock: boolean;
};

export default function Stock() {
    useTitulo('Stock');

    const [productos, setProductos] = useState<Producto[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [descargando, setDescargando] = useState(false);

    useEffect(() => {
        listarProductos<Producto>()
            .then(setProductos)
            .catch((error) => setError(error.message))
            .finally(() => setLoading(false));
    }, []);

    // Solo cuenta lo que está a la venta (producto y variante activos).
    const { unidades, variantes, faltantes } = useMemo(() => {
        let unidades = 0;
        let variantes = 0;
        const faltantes: Faltante[] = [];

        for (const producto of productos) {
            if (!producto.activo) {
                continue;
            }

            for (const variante of producto.variantes) {
                if (!variante.activo) {
                    continue;
                }

                const stock = variante.stock.reduce(
                    (suma, item) => suma + Number(item.cantidad),
                    0,
                );
                const minimo = variante.stock.reduce(
                    (suma, item) => suma + Number(item.stock_minimo),
                    0,
                );

                variantes++;
                unidades += Math.max(stock, 0);

                if (stock <= minimo) {
                    faltantes.push({
                        id: variante.id,
                        marca: producto.marca?.nombre ?? '',
                        producto: tituloProducto({
                            nombre: producto.nombre,
                            descripcion: producto.descripcion,
                        }),
                        color: variante.color?.nombre ?? '',
                        talle: variante.talle?.nombre ?? '',
                        codigo: variante.codigo_barras,
                        stock,
                        minimo,
                        sinStock: stock <= 0,
                    });
                }
            }
        }

        faltantes.sort(
            (a, b) =>
                a.marca.localeCompare(b.marca, 'es') ||
                a.producto.localeCompare(b.producto, 'es') ||
                a.color.localeCompare(b.color, 'es') ||
                a.talle.localeCompare(b.talle, 'es', { numeric: true }),
        );

        return { unidades, variantes, faltantes };
    }, [productos]);

    const sinStock = faltantes.filter((item) => item.sinStock).length;

    const descargarPedidoPdf = async () => {
        setDescargando(true);

        try {
            await descargarPdf({
                archivo: `pedido-stock-faltante-${fechaArchivo()}`,
                titulo: 'Stock faltante para pedido',
                subtitulo: `${faltantes.length} variante${faltantes.length !== 1 ? 's' : ''} sin stock o por debajo del mínimo`,
                apaisado: true,
                columnas: [
                    { titulo: 'Marca', ancho: 35 },
                    { titulo: 'Producto' },
                    { titulo: 'Color', ancho: 28 },
                    { titulo: 'Talle', ancho: 18, alinear: 'center' },
                    { titulo: 'Código', ancho: 34 },
                    { titulo: 'Stock', ancho: 16, alinear: 'right' },
                    { titulo: 'Mínimo', ancho: 16, alinear: 'right' },
                    { titulo: 'A pedir', ancho: 22, alinear: 'center' },
                ],
                // "A pedir" queda en blanco para anotarlo a mano.
                filas: faltantes.map((item) => [
                    item.marca || '—',
                    item.producto,
                    item.color || '—',
                    item.talle || '—',
                    item.codigo,
                    cantidad(item.stock),
                    cantidad(item.minimo),
                    '',
                ]),
            });
        } catch {
            toast.error('No se pudo generar el PDF.');
        } finally {
            setDescargando(false);
        }
    };

    const descargarPedidoCsv = () =>
        descargarCsv(
            `pedido-stock-faltante-${fechaArchivo()}`,
            [
                'Marca',
                'Producto',
                'Color',
                'Talle',
                'Código de barras',
                'Stock',
                'Mínimo',
                'A pedir',
            ],
            faltantes.map((item) => [
                item.marca,
                item.producto,
                item.color,
                item.talle,
                item.codigo,
                item.stock,
                item.minimo,
                '',
            ]),
        );

    return (
        <Page>
            <PageHeader
                title="Stock"
                description="Cuánto tenés y qué falta pedir"
            />

            {error && <EstadoError mensaje={error} />}

            {/* TOTALES */}
            <div className="grid gap-4 sm:grid-cols-3">
                <Total
                    icon={Boxes}
                    titulo="Unidades en stock"
                    valor={loading ? null : cantidad(unidades)}
                />
                <Total
                    icon={Layers}
                    titulo="Variantes a la venta"
                    ayuda="Cada combinación de color y talle"
                    valor={loading ? null : cantidad(variantes)}
                />
                <Total
                    icon={PackageX}
                    titulo="Faltantes"
                    ayuda={
                        loading
                            ? undefined
                            : `${sinStock} sin stock · ${faltantes.length - sinStock} bajo el mínimo`
                    }
                    valor={loading ? null : cantidad(faltantes.length)}
                    alerta={faltantes.length > 0}
                />
            </div>

            {/* STOCK FALTANTE */}
            <section className="bg-card shadow-xs overflow-hidden rounded-xl border">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3.5">
                    <div>
                        <h2 className="font-serif text-base font-medium">
                            Stock faltante
                        </h2>
                        <p className="text-muted-foreground text-xs">
                            Sin stock o con el mínimo o menos. Descargalo para
                            armar el pedido.
                        </p>
                    </div>

                    {faltantes.length > 0 && (
                        <div className="flex gap-2">
                            <Button
                                size="sm"
                                onClick={descargarPedidoPdf}
                                disabled={descargando}
                            >
                                <FileDown />
                                {descargando ? 'Generando...' : 'PDF'}
                            </Button>
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={descargarPedidoCsv}
                            >
                                <FileSpreadsheet />
                                Excel
                            </Button>
                        </div>
                    )}
                </div>

                {loading ? (
                    <FilasCargando filas={4} />
                ) : faltantes.length === 0 ? (
                    <EstadoVacio
                        icon={CheckCircle2}
                        title="No falta nada"
                        description="Todas las variantes a la venta tienen stock por encima del mínimo."
                    />
                ) : (
                    <>
                        {/* Celu: lista */}
                        <ul className="divide-y sm:hidden">
                            {faltantes.map((item) => (
                                <li
                                    key={item.id}
                                    className="flex items-start justify-between gap-3 px-5 py-3"
                                >
                                    <div className="min-w-0">
                                        <p className="line-clamp-2 text-sm font-medium">
                                            {[item.marca, item.producto]
                                                .filter(Boolean)
                                                .join(' - ')}
                                        </p>
                                        <p className="text-muted-foreground text-xs">
                                            {[item.color, item.talle]
                                                .filter(Boolean)
                                                .join(' / ') ||
                                                'Sin color ni talle'}
                                            {' · mín. '}
                                            {cantidad(item.minimo)}
                                        </p>
                                    </div>
                                    <EstadoStock item={item} />
                                </li>
                            ))}
                        </ul>

                        {/* Compu: tabla */}
                        <div className="hidden overflow-x-auto sm:block">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-muted-foreground border-b text-left text-xs">
                                        <th className="px-5 py-2.5 font-medium">
                                            Marca
                                        </th>
                                        <th className="px-3 py-2.5 font-medium">
                                            Producto
                                        </th>
                                        <th className="px-3 py-2.5 font-medium">
                                            Color
                                        </th>
                                        <th className="px-3 py-2.5 font-medium">
                                            Talle
                                        </th>
                                        <th className="px-3 py-2.5 text-right font-medium">
                                            Mínimo
                                        </th>
                                        <th className="px-5 py-2.5 text-right font-medium">
                                            Stock
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {faltantes.map((item) => (
                                        <tr key={item.id}>
                                            <td className="text-muted-foreground px-5 py-2.5">
                                                {item.marca || '—'}
                                            </td>
                                            <td className="max-w-72 truncate px-3 py-2.5">
                                                {item.producto}
                                            </td>
                                            <td className="px-3 py-2.5">
                                                {item.color || '—'}
                                            </td>
                                            <td className="px-3 py-2.5">
                                                {item.talle || '—'}
                                            </td>
                                            <td className="text-muted-foreground px-3 py-2.5 text-right tabular-nums">
                                                {cantidad(item.minimo)}
                                            </td>
                                            <td className="px-5 py-2.5 text-right">
                                                <EstadoStock item={item} />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
            </section>
        </Page>
    );
}

function EstadoStock({ item }: { item: Faltante }) {
    return (
        <Badge
            variant={item.sinStock ? 'danger' : 'warning'}
            className="shrink-0 tabular-nums"
        >
            {item.sinStock ? 'Sin stock' : `Quedan ${cantidad(item.stock)}`}
        </Badge>
    );
}

function Total({
    icon: Icon,
    titulo,
    ayuda,
    valor,
    alerta = false,
}: {
    icon: LucideIcon;
    titulo: string;
    ayuda?: string;
    valor: string | null;
    alerta?: boolean;
}) {
    return (
        <div className="bg-card shadow-xs rounded-xl border p-5">
            <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground text-sm">{titulo}</span>
                <span className="bg-accent text-accent-foreground flex size-8 shrink-0 items-center justify-center rounded-full">
                    <Icon className="size-4" />
                </span>
            </div>
            {valor === null ? (
                <Skeleton className="mt-2 h-7 w-32" />
            ) : (
                <p
                    className={cn(
                        'mt-2 text-2xl font-semibold tabular-nums tracking-tight',
                        alerta && 'text-warning',
                    )}
                >
                    {valor}
                </p>
            )}
            {ayuda && (
                <p className="text-muted-foreground mt-1 text-xs">{ayuda}</p>
            )}
        </div>
    );
}
