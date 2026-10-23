import {
    ChevronRight,
    Package,
    Pencil,
    Plus,
    ScanLine,
    Search,
    Trash2,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Campo } from '@/components/campo';
import EscanerCodigoBarras from '@/components/escaner-codigo-barras';
import { EstadoError, EstadoVacio, FilasCargando } from '@/components/estados';
import { Page, PageHeader } from '@/components/page-header';
import {
    evitarCierreSiCreando,
    SelectorCatalogo,
} from '@/components/selector-catalogo';
import VarianteDialog from '@/components/variante-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { useTitulo } from '@/hooks/use-titulo';
import {
    buscarProductoPorCodigo,
    eliminarProducto as eliminarProductoApi,
    eliminarVariante as eliminarVarianteApi,
    ErrorValidacion,
    guardarProducto as guardarProductoApi,
    listarDepositos,
    listarProductos,
    obtenerCatalogos,
} from '@/lib/api';
import type { ItemCatalogo, TablaCatalogo } from '@/lib/api';
import { cantidad, dinero, tituloProducto } from '@/lib/formato';
import { cn } from '@/lib/utils';

type Precio = {
    id: number;
    precio: string | number;
    fecha_desde: string | null;
    fecha_hasta: string | null;
    activo: boolean;
};

type Stock = {
    id: number;
    cantidad: string | number;
    stock_minimo: string | number;
    deposito?: {
        id: number;
        nombre: string;
    } | null;
};

type Variante = {
    id: number;
    codigo_barras: string;
    codigo_interno: string | null;
    activo: boolean;
    color?: {
        id: number;
        nombre: string;
    } | null;
    talle?: {
        id: number;
        nombre: string;
    } | null;
    costo: string | number;
    precios: Precio[];
    stock: Stock[];
};

type Producto = {
    id: number;
    codigo_interno: string;
    nombre: string;
    descripcion: string | null;
    activo: boolean;
    categoria?: {
        id: number;
        nombre: string;
    } | null;
    marca?: {
        id: number;
        nombre: string;
    } | null;
    variantes: Variante[];
};

type CatalogoItem = {
    id: number;
    nombre: string;
};

type Catalogos = {
    categorias: CatalogoItem[];
    marcas: CatalogoItem[];
    colores: CatalogoItem[];
    talles: CatalogoItem[];
};

type FormData = {
    categoria_id: string;
    marca_id: string;
    nombre: string;
    descripcion: string;
    activo: boolean;
};

const formVacio: FormData = {
    categoria_id: '',
    marca_id: '',
    nombre: '',
    descripcion: '',
    activo: true,
};

const COLUMNAS = 'md:grid-cols-[20px_minmax(0,1fr)_140px_120px_110px_88px]';

function stockDeVariante(variante: Variante) {
    const total = variante.stock.reduce(
        (suma, item) => suma + Number(item.cantidad),
        0,
    );
    const minimo = variante.stock.reduce(
        (suma, item) => suma + Number(item.stock_minimo),
        0,
    );

    return { total, minimo, bajo: total <= minimo };
}

const TODAS_LAS_MARCAS = 'todas';

/** Minúsculas y sin acentos, para comparar búsquedas. */
function normalizar(texto: string): string {
    return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

export default function Productos() {
    useTitulo('Productos');

    const [productos, setProductos] = useState<Producto[]>([]);
    const [catalogos, setCatalogos] = useState<Catalogos>({
        categorias: [],
        marcas: [],
        colores: [],
        talles: [],
    });
    const [busqueda, setBusqueda] = useState('');
    const [marcaFiltro, setMarcaFiltro] = useState(TODAS_LAS_MARCAS);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [abiertos, setAbiertos] = useState<number[]>([]);

    const [formAbierto, setFormAbierto] = useState(false);
    const [editando, setEditando] = useState<Producto | null>(null);
    const [formData, setFormData] = useState<FormData>(formVacio);
    const [erroresForm, setErroresForm] = useState<Record<string, string[]>>(
        {},
    );
    const [guardando, setGuardando] = useState(false);
    const [escanerAbierto, setEscanerAbierto] = useState(false);

    const [depositos, setDepositos] = useState<ItemCatalogo[]>([]);

    // Variante que se está creando o editando (variante null = nueva).
    const [formVariante, setFormVariante] = useState<{
        producto: { id: number; nombre: string };
        variante: Variante | null;
    } | null>(null);

    const cargarProductos = () => {
        return listarProductos<Producto>()
            .then((resultado) => {
                setProductos(resultado);
                setError(null);
            })
            .catch((error) => {
                setError(error.message);
            })
            .finally(() => {
                setLoading(false);
            });
    };

    useEffect(() => {
        void cargarProductos();

        void obtenerCatalogos()
            .then((resultado: Catalogos) => setCatalogos(resultado))
            .catch(() => {
                toast.error('No se pudieron cargar los catálogos.');
            });

        void listarDepositos()
            .then(setDepositos)
            .catch(() => {
                toast.error('No se pudieron cargar los depósitos.');
            });
    }, []);

    const agregarAlCatalogo = (tabla: TablaCatalogo, item: ItemCatalogo) => {
        setCatalogos((actual) => ({
            ...actual,
            // Los talles se agregan al final (respetan su orden lógico);
            // marcas y colores, en orden alfabético.
            [tabla]:
                tabla === 'talles'
                    ? [...actual.talles, item]
                    : [...actual[tabla], item].sort((a, b) =>
                          a.nombre.localeCompare(b.nombre, 'es'),
                      ),
        }));
    };

    const eliminarVariante = async (variante: Variante) => {
        const nombre =
            [variante.color?.nombre, variante.talle?.nombre]
                .filter(Boolean)
                .join(' / ') || variante.codigo_barras;

        if (!window.confirm(`¿Eliminar la variante "${nombre}"?`)) {
            return;
        }

        try {
            await eliminarVarianteApi(variante.id);
            toast.success('Variante eliminada.');
            await cargarProductos();
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? error.message
                    : 'No se pudo eliminar la variante.',
            );
        }
    };

    const toggleProducto = (id: number) => {
        setAbiertos((actuales) =>
            actuales.includes(id)
                ? actuales.filter((item) => item !== id)
                : [...actuales, id],
        );
    };

    // Cada palabra tiene que aparecer en algún dato del producto (marca,
    // nombre, descripción, códigos, categoría, color o talle), sin
    // importar acentos ni mayúsculas: "sweet encaje" encuentra
    // "Sweet Lady - Corpiño - Encaje con aro".
    const productosFiltrados = useMemo(() => {
        const palabras = normalizar(busqueda).split(/\s+/).filter(Boolean);

        return productos.filter((producto) => {
            if (
                marcaFiltro !== TODAS_LAS_MARCAS &&
                String(producto.marca?.id ?? '') !== marcaFiltro
            ) {
                return false;
            }

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
        });
    }, [productos, busqueda, marcaFiltro]);

    // Lo que hay en total entre los productos que se están viendo.
    const totales = useMemo(() => {
        const variantes = productosFiltrados.flatMap(
            (producto) => producto.variantes,
        );

        let unidades = 0;
        let valorVenta = 0;
        let valorCosto = 0;

        for (const variante of variantes) {
            // Stock negativo (vendido de más) no suma plata.
            const stock = Math.max(stockDeVariante(variante).total, 0);
            const precio = variante.precios.find((item) => item.activo);

            unidades += stock;
            valorVenta += stock * Number(precio?.precio ?? 0);
            valorCosto += stock * Number(variante.costo);
        }

        return {
            productos: productosFiltrados.length,
            variantes: variantes.length,
            unidades,
            valorVenta,
            valorCosto,
        };
    }, [productosFiltrados]);

    const filtrando =
        busqueda.trim() !== '' || marcaFiltro !== TODAS_LAS_MARCAS;

    const buscarPorCodigoExacto = async (codigo: string) => {
        const texto = codigo.trim();

        if (!texto) {
            return;
        }

        try {
            const encontrado = await buscarProductoPorCodigo<Producto>(texto);

            if (!encontrado) {
                toast.error(
                    `No se encontró ningún producto con el código "${texto}".`,
                );

                return;
            }

            setProductos((actuales) => {
                const yaEsta = actuales.some(
                    (item) => item.id === encontrado.id,
                );

                return yaEsta
                    ? actuales.map((item) =>
                          item.id === encontrado.id ? encontrado : item,
                      )
                    : [...actuales, encontrado];
            });

            setBusqueda(encontrado.codigo_interno);
            setAbiertos((actuales) =>
                actuales.includes(encontrado.id)
                    ? actuales
                    : [...actuales, encontrado.id],
            );

            toast.success(`Producto encontrado: ${encontrado.nombre}`);
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? error.message
                    : 'Ocurrió un error al buscar el producto.',
            );
        }
    };

    const manejarCodigoEscaneado = (codigo: string) => {
        setEscanerAbierto(false);
        buscarPorCodigoExacto(codigo);
    };

    const manejarEnterBusqueda = (
        evento: React.KeyboardEvent<HTMLInputElement>,
    ) => {
        // Un lector físico de código de barras "tipea" el código y
        // manda un Enter al final, como si fuera un teclado.
        if (evento.key === 'Enter' && busqueda.trim()) {
            evento.preventDefault();
            buscarPorCodigoExacto(busqueda);
        }
    };

    const abrirNuevo = () => {
        setEditando(null);
        setFormData(formVacio);
        setErroresForm({});
        setFormAbierto(true);
    };

    const abrirEditar = (producto: Producto, evento: React.MouseEvent) => {
        evento.stopPropagation();

        setEditando(producto);
        setFormData({
            categoria_id: producto.categoria?.id
                ? String(producto.categoria.id)
                : '',
            marca_id: producto.marca?.id ? String(producto.marca.id) : '',
            nombre: producto.nombre,
            descripcion: producto.descripcion ?? '',
            activo: producto.activo,
        });
        setErroresForm({});
        setFormAbierto(true);
    };

    const cerrarForm = () => {
        setFormAbierto(false);
        setEditando(null);
        setErroresForm({});
    };

    const guardarProducto = async () => {
        setGuardando(true);
        setErroresForm({});

        const payload = {
            categoria_id: formData.categoria_id
                ? Number(formData.categoria_id)
                : null,
            marca_id: formData.marca_id ? Number(formData.marca_id) : null,
            nombre: formData.nombre,
            descripcion: formData.descripcion || null,
            activo: formData.activo,
        };

        try {
            const id = await guardarProductoApi(payload, editando?.id);
            const esNuevo = !editando;

            toast.success(
                esNuevo ? 'Producto creado.' : 'Producto actualizado.',
            );
            cerrarForm();
            await cargarProductos();

            // Un producto sin variantes no se puede vender: al crearlo se
            // abre directamente el alta de su primera variante.
            if (esNuevo) {
                setAbiertos((actuales) => [...actuales, id]);
                setFormVariante({
                    producto: { id, nombre: payload.nombre.trim() },
                    variante: null,
                });
            }
        } catch (error) {
            if (error instanceof ErrorValidacion) {
                setErroresForm(error.errores);
                toast.error(error.message);

                return;
            }

            toast.error(
                error instanceof Error
                    ? error.message
                    : 'Ocurrió un error inesperado.',
            );
        } finally {
            setGuardando(false);
        }
    };

    const eliminarProducto = async (
        producto: Producto,
        evento: React.MouseEvent,
    ) => {
        evento.stopPropagation();

        const confirmado = window.confirm(
            `¿Eliminar "${producto.nombre}"? Esta acción no se puede deshacer.`,
        );

        if (!confirmado) {
            return;
        }

        try {
            toast.success(await eliminarProductoApi(producto.id));
            await cargarProductos();
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? error.message
                    : 'Ocurrió un error inesperado.',
            );
        }
    };

    return (
        <Page>
            <PageHeader
                title="Productos"
                description="Catálogo, variantes, precios y stock"
                actions={
                    <Button onClick={abrirNuevo}>
                        <Plus />
                        Nuevo producto
                    </Button>
                }
            />

            {error && <EstadoError mensaje={error} />}

            <section className="bg-card shadow-xs overflow-hidden rounded-xl border">
                {/* BARRA DE BÚSQUEDA */}
                <div className="flex flex-wrap items-center gap-2 border-b p-3">
                    <div className="relative min-w-0 flex-1 sm:max-w-sm">
                        <Search className="text-muted-foreground absolute left-3 top-1/2 size-4 -translate-y-1/2" />
                        <Input
                            value={busqueda}
                            onChange={(event) =>
                                setBusqueda(event.target.value)
                            }
                            onKeyDown={manejarEnterBusqueda}
                            placeholder="Marca, nombre, descripción o código..."
                            className="pl-9"
                        />
                    </div>

                    <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => setEscanerAbierto(true)}
                        title="Escanear con la cámara"
                    >
                        <ScanLine />
                    </Button>

                    <Select value={marcaFiltro} onValueChange={setMarcaFiltro}>
                        <SelectTrigger
                            className="w-full sm:w-48"
                            aria-label="Filtrar por marca"
                        >
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value={TODAS_LAS_MARCAS}>
                                Todas las marcas
                            </SelectItem>
                            {catalogos.marcas.map((marca) => (
                                <SelectItem
                                    key={marca.id}
                                    value={String(marca.id)}
                                >
                                    {marca.nombre}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                {/* RESUMEN: lo que hay entre los productos que se ven */}
                {!loading && (
                    <dl className="bg-muted/30 grid grid-cols-3 border-b text-center [&>div:not(:nth-child(3n+1))]:border-l">
                        {[
                            { titulo: 'Productos', valor: totales.productos },
                            { titulo: 'Variantes', valor: totales.variantes },
                            {
                                titulo: 'Unidades en stock',
                                valor: totales.unidades,
                            },
                        ].map((item) => (
                            <div key={item.titulo} className="px-2 py-2.5">
                                <dt className="text-muted-foreground text-xs">
                                    {item.titulo}
                                </dt>
                                <dd className="text-lg font-semibold tabular-nums">
                                    {cantidad(item.valor)}
                                </dd>
                            </div>
                        ))}

                        {/* Plata: lo que vale el stock a precio de venta y lo que costó */}
                        {[
                            {
                                titulo: 'Valor del stock',
                                ayuda: 'a precio de venta',
                                valor: totales.valorVenta,
                            },
                            {
                                titulo: 'Costo del stock',
                                ayuda: 'lo que te costó',
                                valor: totales.valorCosto,
                            },
                            {
                                titulo: 'Ganancia en stock',
                                ayuda: 'si vendés todo',
                                valor: totales.valorVenta - totales.valorCosto,
                            },
                        ].map((item) => (
                            <div
                                key={item.titulo}
                                className="border-t px-2 py-2.5"
                            >
                                <dt className="text-muted-foreground text-xs">
                                    {item.titulo}
                                    <span className="hidden sm:inline">
                                        {' '}
                                        · {item.ayuda}
                                    </span>
                                </dt>
                                <dd className="font-semibold tabular-nums sm:text-lg">
                                    {dinero(item.valor)}
                                </dd>
                            </div>
                        ))}
                    </dl>
                )}

                {loading && <FilasCargando />}

                {!loading && !error && productosFiltrados.length === 0 && (
                    <EstadoVacio
                        icon={Package}
                        title={
                            filtrando
                                ? 'No se encontraron productos'
                                : 'Todavía no hay productos'
                        }
                        description={
                            filtrando
                                ? 'Probá con otra marca, nombre, descripción, código, color o talle.'
                                : 'Cargá tu primer producto para empezar a vender.'
                        }
                        action={
                            filtrando ? (
                                <Button
                                    variant="outline"
                                    onClick={() => {
                                        setBusqueda('');
                                        setMarcaFiltro(TODAS_LAS_MARCAS);
                                    }}
                                >
                                    Limpiar filtros
                                </Button>
                            ) : (
                                <Button variant="outline" onClick={abrirNuevo}>
                                    <Plus />
                                    Nuevo producto
                                </Button>
                            )
                        }
                    />
                )}

                {!loading && productosFiltrados.length > 0 && (
                    <>
                        {/* CABECERA */}
                        <div
                            className={`bg-muted/50 text-muted-foreground hidden gap-4 border-b px-5 py-2.5 text-xs font-medium md:grid ${COLUMNAS}`}
                        >
                            <div />
                            <div>Producto</div>
                            <div>Categoría</div>
                            <div>Marca</div>
                            <div>Stock</div>
                            <div />
                        </div>

                        <ul className="divide-y">
                            {productosFiltrados.map((producto) => {
                                const abierto = abiertos.includes(producto.id);
                                const stocks =
                                    producto.variantes.map(stockDeVariante);
                                const stockTotal = stocks.reduce(
                                    (suma, item) => suma + item.total,
                                    0,
                                );
                                const variantesBajas = stocks.filter(
                                    (item) => item.bajo,
                                ).length;

                                return (
                                    <li key={producto.id}>
                                        {/* PRODUCTO */}
                                        <div
                                            role="button"
                                            tabIndex={0}
                                            aria-expanded={abierto}
                                            onClick={() =>
                                                toggleProducto(producto.id)
                                            }
                                            onKeyDown={(evento) => {
                                                if (
                                                    evento.key === 'Enter' ||
                                                    evento.key === ' '
                                                ) {
                                                    evento.preventDefault();
                                                    toggleProducto(producto.id);
                                                }
                                            }}
                                            className={`hover:bg-muted/40 focus-visible:bg-muted/40 group grid cursor-pointer grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-4 px-5 py-3.5 outline-none transition-colors ${COLUMNAS}`}
                                        >
                                            <ChevronRight
                                                className={cn(
                                                    'text-muted-foreground size-4 transition-transform',
                                                    abierto && 'rotate-90',
                                                )}
                                            />

                                            <div className="min-w-0">
                                                <p className="flex items-center gap-2 text-sm font-medium">
                                                    <span className="line-clamp-2">
                                                        {tituloProducto(
                                                            producto,
                                                        )}
                                                    </span>
                                                    {!producto.activo && (
                                                        <Badge variant="outline">
                                                            Inactivo
                                                        </Badge>
                                                    )}
                                                </p>
                                                <p className="text-muted-foreground truncate text-xs">
                                                    <span className="font-mono">
                                                        {
                                                            producto.codigo_interno
                                                        }
                                                    </span>
                                                    {' · '}
                                                    {
                                                        producto.variantes
                                                            .length
                                                    }{' '}
                                                    variante
                                                    {producto.variantes
                                                        .length !== 1
                                                        ? 's'
                                                        : ''}
                                                    <span className="md:hidden">
                                                        {' · '}
                                                        {cantidad(
                                                            stockTotal,
                                                        )}{' '}
                                                        en stock
                                                    </span>
                                                </p>
                                            </div>

                                            <div className="text-muted-foreground hidden truncate text-sm md:block">
                                                {producto.categoria?.nombre ??
                                                    '—'}
                                            </div>

                                            <div className="text-muted-foreground hidden truncate text-sm md:block">
                                                {producto.marca?.nombre ?? '—'}
                                            </div>

                                            <div className="hidden md:block">
                                                {variantesBajas > 0 ? (
                                                    <Badge
                                                        variant="warning"
                                                        className="tabular-nums"
                                                    >
                                                        {cantidad(stockTotal)} ·
                                                        bajo
                                                    </Badge>
                                                ) : (
                                                    <span className="text-sm tabular-nums">
                                                        {cantidad(stockTotal)}
                                                    </span>
                                                )}
                                            </div>

                                            <div className="flex justify-end gap-1 md:opacity-0 md:transition-opacity md:focus-within:opacity-100 md:group-hover:opacity-100 md:group-focus-visible:opacity-100">
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    className="size-8"
                                                    onClick={(evento) =>
                                                        abrirEditar(
                                                            producto,
                                                            evento,
                                                        )
                                                    }
                                                    title="Editar"
                                                >
                                                    <Pencil />
                                                </Button>

                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    className="text-muted-foreground hover:text-destructive size-8"
                                                    onClick={(evento) =>
                                                        eliminarProducto(
                                                            producto,
                                                            evento,
                                                        )
                                                    }
                                                    title="Eliminar"
                                                >
                                                    <Trash2 />
                                                </Button>
                                            </div>
                                        </div>

                                        {/* VARIANTES */}
                                        {abierto && (
                                            <TablaVariantes
                                                producto={producto}
                                                stocks={stocks}
                                                onAgregar={() =>
                                                    setFormVariante({
                                                        producto,
                                                        variante: null,
                                                    })
                                                }
                                                onEditar={(variante) =>
                                                    setFormVariante({
                                                        producto,
                                                        variante,
                                                    })
                                                }
                                                onEliminar={eliminarVariante}
                                            />
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    </>
                )}
            </section>

            {/* FORMULARIO ALTA / EDICIÓN */}
            <Dialog open={formAbierto} onOpenChange={setFormAbierto}>
                <DialogContent
                    className="sm:max-w-lg"
                    onEscapeKeyDown={evitarCierreSiCreando}
                >
                    <DialogHeader>
                        <DialogTitle>
                            {editando ? 'Editar producto' : 'Nuevo producto'}
                        </DialogTitle>
                        <DialogDescription>
                            {editando
                                ? 'Modificá los datos del producto.'
                                : 'Completá los datos para crear un producto.'}
                        </DialogDescription>
                    </DialogHeader>

                    <form
                        id="form-producto"
                        className="grid gap-4 sm:grid-cols-2"
                        onSubmit={(evento) => {
                            evento.preventDefault();
                            void guardarProducto();
                        }}
                    >
                        <Campo
                            id="nombre"
                            label="Nombre"
                            error={erroresForm.nombre}
                            className="sm:col-span-2"
                        >
                            <Input
                                id="nombre"
                                autoFocus
                                value={formData.nombre}
                                onChange={(evento) =>
                                    setFormData((actual) => ({
                                        ...actual,
                                        nombre: evento.target.value,
                                    }))
                                }
                            />
                        </Campo>

                        {/* El código interno lo asigna la base (P00001, ...). */}
                        <Campo id="codigo_interno" label="Código interno">
                            <Input
                                id="codigo_interno"
                                className="font-mono"
                                value={
                                    editando?.codigo_interno ??
                                    'Se asigna al guardar'
                                }
                                disabled
                            />
                        </Campo>

                        <Campo
                            label="Categoría"
                            error={erroresForm.categoria_id}
                        >
                            <Select
                                value={formData.categoria_id}
                                onValueChange={(valor) =>
                                    setFormData((actual) => ({
                                        ...actual,
                                        categoria_id: valor,
                                    }))
                                }
                            >
                                <SelectTrigger className="w-full">
                                    <SelectValue placeholder="Seleccionar" />
                                </SelectTrigger>
                                <SelectContent>
                                    {catalogos.categorias.map((item) => (
                                        <SelectItem
                                            key={item.id}
                                            value={String(item.id)}
                                        >
                                            {item.nombre}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </Campo>

                        <Campo label="Marca" error={erroresForm.marca_id}>
                            <SelectorCatalogo
                                tabla="marcas"
                                items={catalogos.marcas}
                                valor={formData.marca_id}
                                onCambio={(valor) =>
                                    setFormData((actual) => ({
                                        ...actual,
                                        marca_id: valor,
                                    }))
                                }
                                onCreado={(item) =>
                                    agregarAlCatalogo('marcas', item)
                                }
                            />
                        </Campo>

                        <Campo
                            id="descripcion"
                            label="Descripción"
                            opcional
                            className="sm:col-span-2"
                        >
                            <Input
                                id="descripcion"
                                value={formData.descripcion}
                                onChange={(evento) =>
                                    setFormData((actual) => ({
                                        ...actual,
                                        descripcion: evento.target.value,
                                    }))
                                }
                            />
                        </Campo>

                        <div className="flex items-center gap-2 sm:col-span-2">
                            <Checkbox
                                id="activo"
                                checked={formData.activo}
                                onCheckedChange={(valor) =>
                                    setFormData((actual) => ({
                                        ...actual,
                                        activo: valor === true,
                                    }))
                                }
                            />
                            <Label htmlFor="activo" className="font-normal">
                                Producto activo (disponible para vender)
                            </Label>
                        </div>
                    </form>

                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={cerrarForm}
                            disabled={guardando}
                        >
                            Cancelar
                        </Button>
                        <Button
                            type="submit"
                            form="form-producto"
                            disabled={guardando}
                        >
                            {guardando ? 'Guardando...' : 'Guardar'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ESCÁNER (CÁMARA) — BÚSQUEDA */}
            <EscanerCodigoBarras
                abierto={escanerAbierto}
                onCerrar={() => setEscanerAbierto(false)}
                onDetectado={manejarCodigoEscaneado}
            />

            {/* ALTA / EDICIÓN DE VARIANTE */}
            {formVariante && (
                <VarianteDialog
                    key={`${formVariante.producto.id}-${formVariante.variante?.id ?? 'nueva'}`}
                    abierto
                    onCerrar={() => setFormVariante(null)}
                    onGuardada={() => {
                        setFormVariante(null);
                        void cargarProductos();
                    }}
                    producto={formVariante.producto}
                    variante={formVariante.variante}
                    colores={catalogos.colores}
                    talles={catalogos.talles}
                    depositos={depositos}
                    onCatalogoCreado={agregarAlCatalogo}
                />
            )}
        </Page>
    );
}

function TablaVariantes({
    producto,
    stocks,
    onAgregar,
    onEditar,
    onEliminar,
}: {
    producto: Producto;
    stocks: ReturnType<typeof stockDeVariante>[];
    onAgregar: () => void;
    onEditar: (variante: Variante) => void;
    onEliminar: (variante: Variante) => void;
}) {
    return (
        <div className="bg-muted/30 space-y-3 border-t px-5 py-4 md:pl-14">
            {producto.variantes.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                    Este producto todavía no tiene variantes. Agregá al menos
                    una (color y talle, con su precio y stock) para poder
                    venderlo.
                </p>
            ) : (
                <div className="bg-card overflow-x-auto rounded-lg border">
                    <table className="w-full min-w-[600px] text-sm">
                        <thead>
                            <tr className="text-muted-foreground border-b text-left text-xs">
                                <th className="px-4 py-2.5 font-medium">
                                    Color
                                </th>
                                <th className="px-4 py-2.5 font-medium">
                                    Talle
                                </th>
                                <th className="px-4 py-2.5 font-medium">
                                    Código de barras
                                </th>
                                <th className="px-4 py-2.5 text-right font-medium">
                                    Costo
                                </th>
                                <th className="px-4 py-2.5 text-right font-medium">
                                    Precio
                                </th>
                                <th className="px-4 py-2.5 text-right font-medium">
                                    Stock
                                </th>
                                <th className="w-20 px-2 py-2.5" />
                            </tr>
                        </thead>

                        <tbody className="divide-y">
                            {producto.variantes.map((variante, i) => {
                                const precio = variante.precios.find(
                                    (item) => item.activo,
                                );
                                const stock = stocks[i];

                                return (
                                    <tr
                                        key={variante.id}
                                        className={cn(
                                            !variante.activo &&
                                                'text-muted-foreground',
                                        )}
                                    >
                                        <td className="px-4 py-2">
                                            {variante.color?.nombre ?? '—'}
                                            {!variante.activo && (
                                                <Badge
                                                    variant="outline"
                                                    className="ml-2"
                                                >
                                                    Inactiva
                                                </Badge>
                                            )}
                                        </td>
                                        <td className="px-4 py-2">
                                            {variante.talle?.nombre ?? '—'}
                                        </td>
                                        <td className="px-4 py-2 font-mono text-xs">
                                            {variante.codigo_barras}
                                        </td>
                                        <td className="text-muted-foreground px-4 py-2 text-right tabular-nums">
                                            {Number(variante.costo) > 0
                                                ? dinero(variante.costo)
                                                : '—'}
                                        </td>
                                        <td className="px-4 py-2 text-right font-medium tabular-nums">
                                            {precio
                                                ? dinero(precio.precio)
                                                : '—'}
                                        </td>
                                        <td className="px-4 py-2 text-right">
                                            {stock.bajo ? (
                                                <Badge
                                                    variant="warning"
                                                    className="tabular-nums"
                                                >
                                                    {cantidad(stock.total)}
                                                </Badge>
                                            ) : (
                                                <span className="tabular-nums">
                                                    {cantidad(stock.total)}
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-2 py-1">
                                            <div className="flex justify-end gap-1">
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    className="size-8"
                                                    onClick={() =>
                                                        onEditar(variante)
                                                    }
                                                    title="Editar variante"
                                                >
                                                    <Pencil />
                                                </Button>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    className="text-muted-foreground hover:text-destructive size-8"
                                                    onClick={() =>
                                                        onEliminar(variante)
                                                    }
                                                    title="Eliminar variante"
                                                >
                                                    <Trash2 />
                                                </Button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onAgregar}
            >
                <Plus />
                Agregar variante
            </Button>
        </div>
    );
}
