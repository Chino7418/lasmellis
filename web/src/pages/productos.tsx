import {
    Check,
    ChevronRight,
    Package,
    Pencil,
    Plus,
    ScanLine,
    Search,
    Trash2,
    X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Campo } from '@/components/campo';
import EscanerCodigoBarras from '@/components/escaner-codigo-barras';
import { EstadoError, EstadoVacio, FilasCargando } from '@/components/estados';
import { Page, PageHeader } from '@/components/page-header';
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
    crearMarca,
    eliminarProducto as eliminarProductoApi,
    ErrorValidacion,
    guardarProducto as guardarProductoApi,
    listarProductos,
    obtenerCatalogos,
} from '@/lib/api';
import { cantidad, dinero } from '@/lib/formato';
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
    precios: Precio[];
    stock: Stock[];
};

type Producto = {
    id: number;
    codigo_interno: string;
    nombre: string;
    descripcion: string | null;
    costo: string | number;
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
    codigo_interno: string;
    nombre: string;
    descripcion: string;
    costo: string;
    activo: boolean;
};

const formVacio: FormData = {
    categoria_id: '',
    marca_id: '',
    codigo_interno: '',
    nombre: '',
    descripcion: '',
    costo: '',
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
    const [escanerFormAbierto, setEscanerFormAbierto] = useState(false);

    // null = selector normal; string = escribiendo una marca nueva.
    const [marcaNueva, setMarcaNueva] = useState<string | null>(null);
    const [creandoMarca, setCreandoMarca] = useState(false);

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
    }, []);

    const toggleProducto = (id: number) => {
        setAbiertos((actuales) =>
            actuales.includes(id)
                ? actuales.filter((item) => item !== id)
                : [...actuales, id],
        );
    };

    const productosFiltrados = useMemo(() => {
        const texto = busqueda.trim().toLowerCase();

        if (!texto) {
            return productos;
        }

        return productos.filter((producto) => {
            const coincideProducto =
                producto.nombre.toLowerCase().includes(texto) ||
                producto.codigo_interno.toLowerCase().includes(texto) ||
                producto.categoria?.nombre.toLowerCase().includes(texto) ||
                producto.marca?.nombre.toLowerCase().includes(texto);

            const coincideVariante = producto.variantes.some((variante) => {
                return (
                    variante.codigo_barras.toLowerCase().includes(texto) ||
                    variante.codigo_interno?.toLowerCase().includes(texto) ||
                    variante.color?.nombre.toLowerCase().includes(texto) ||
                    variante.talle?.nombre.toLowerCase().includes(texto)
                );
            });

            return coincideProducto || coincideVariante;
        });
    }, [productos, busqueda]);

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

    const manejarCodigoEscaneadoForm = (codigo: string) => {
        setEscanerFormAbierto(false);
        setFormData((actual) => ({
            ...actual,
            codigo_interno: codigo.trim(),
        }));
        toast.success('Código escaneado.');
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

    const agregarMarca = async () => {
        if (creandoMarca || marcaNueva === null) {
            return;
        }

        setCreandoMarca(true);

        try {
            const { marca, yaExistia } = await crearMarca(marcaNueva);

            setCatalogos((actual) => ({
                ...actual,
                marcas: yaExistia
                    ? actual.marcas
                    : [...actual.marcas, marca].sort((a, b) =>
                          a.nombre.localeCompare(b.nombre, 'es'),
                      ),
            }));
            setFormData((actual) => ({
                ...actual,
                marca_id: String(marca.id),
            }));
            setMarcaNueva(null);

            toast.success(
                yaExistia
                    ? `La marca "${marca.nombre}" ya existía: quedó seleccionada.`
                    : `Marca "${marca.nombre}" creada.`,
            );
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? error.message
                    : 'No se pudo crear la marca.',
            );
        } finally {
            setCreandoMarca(false);
        }
    };

    const abrirNuevo = () => {
        setEditando(null);
        setFormData(formVacio);
        setErroresForm({});
        setMarcaNueva(null);
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
            codigo_interno: producto.codigo_interno,
            nombre: producto.nombre,
            descripcion: producto.descripcion ?? '',
            costo: String(producto.costo),
            activo: producto.activo,
        });
        setErroresForm({});
        setMarcaNueva(null);
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
            codigo_interno: formData.codigo_interno,
            nombre: formData.nombre,
            descripcion: formData.descripcion || null,
            costo: formData.costo,
            activo: formData.activo,
        };

        try {
            await guardarProductoApi(payload, editando?.id);

            toast.success(
                editando ? 'Producto actualizado.' : 'Producto creado.',
            );
            cerrarForm();
            await cargarProductos();
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
                            placeholder="Buscar o escanear con lector..."
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

                    {!loading && (
                        <span className="text-muted-foreground ml-auto text-sm">
                            {productosFiltrados.length} producto
                            {productosFiltrados.length !== 1 ? 's' : ''}
                        </span>
                    )}
                </div>

                {loading && <FilasCargando />}

                {!loading && !error && productosFiltrados.length === 0 && (
                    <EstadoVacio
                        icon={Package}
                        title={
                            busqueda
                                ? 'No se encontraron productos'
                                : 'Todavía no hay productos'
                        }
                        description={
                            busqueda
                                ? 'Probá con otro nombre, código, marca, color o talle.'
                                : 'Cargá tu primer producto para empezar a vender.'
                        }
                        action={
                            !busqueda && (
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
                                                <p className="flex items-center gap-2 truncate text-sm font-medium">
                                                    <span className="truncate">
                                                        {producto.nombre}
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
                                            <div className="bg-muted/30 border-t px-5 py-4 md:pl-14">
                                                {producto.variantes.length ===
                                                0 ? (
                                                    <p className="text-muted-foreground text-sm">
                                                        Este producto todavía no
                                                        tiene variantes
                                                        cargadas.
                                                    </p>
                                                ) : (
                                                    <div className="bg-card overflow-x-auto rounded-lg border">
                                                        <table className="w-full min-w-[640px] text-sm">
                                                            <thead>
                                                                <tr className="text-muted-foreground border-b text-left text-xs">
                                                                    <th className="px-4 py-2.5 font-medium">
                                                                        Código
                                                                        de
                                                                        barras
                                                                    </th>
                                                                    <th className="px-4 py-2.5 font-medium">
                                                                        Color
                                                                    </th>
                                                                    <th className="px-4 py-2.5 font-medium">
                                                                        Talle
                                                                    </th>
                                                                    <th className="px-4 py-2.5 text-right font-medium">
                                                                        Precio
                                                                    </th>
                                                                    <th className="px-4 py-2.5 text-right font-medium">
                                                                        Stock
                                                                    </th>
                                                                    <th className="px-4 py-2.5 font-medium">
                                                                        Depósito
                                                                    </th>
                                                                </tr>
                                                            </thead>

                                                            <tbody className="divide-y">
                                                                {producto.variantes.map(
                                                                    (
                                                                        variante,
                                                                        i,
                                                                    ) => {
                                                                        const precio =
                                                                            variante.precios.find(
                                                                                (
                                                                                    item,
                                                                                ) =>
                                                                                    item.activo,
                                                                            );
                                                                        const stock =
                                                                            stocks[
                                                                                i
                                                                            ];

                                                                        return (
                                                                            <tr
                                                                                key={
                                                                                    variante.id
                                                                                }
                                                                            >
                                                                                <td className="px-4 py-2.5 font-mono text-xs">
                                                                                    {
                                                                                        variante.codigo_barras
                                                                                    }
                                                                                </td>
                                                                                <td className="px-4 py-2.5">
                                                                                    {variante
                                                                                        .color
                                                                                        ?.nombre ??
                                                                                        '—'}
                                                                                </td>
                                                                                <td className="px-4 py-2.5">
                                                                                    {variante
                                                                                        .talle
                                                                                        ?.nombre ??
                                                                                        '—'}
                                                                                </td>
                                                                                <td className="px-4 py-2.5 text-right font-medium tabular-nums">
                                                                                    {precio
                                                                                        ? dinero(
                                                                                              precio.precio,
                                                                                          )
                                                                                        : '—'}
                                                                                </td>
                                                                                <td className="px-4 py-2.5 text-right">
                                                                                    {stock.bajo ? (
                                                                                        <Badge
                                                                                            variant="warning"
                                                                                            className="tabular-nums"
                                                                                        >
                                                                                            {cantidad(
                                                                                                stock.total,
                                                                                            )}
                                                                                        </Badge>
                                                                                    ) : (
                                                                                        <span className="tabular-nums">
                                                                                            {cantidad(
                                                                                                stock.total,
                                                                                            )}
                                                                                        </span>
                                                                                    )}
                                                                                </td>
                                                                                <td className="text-muted-foreground px-4 py-2.5">
                                                                                    {variante.stock
                                                                                        .map(
                                                                                            (
                                                                                                item,
                                                                                            ) =>
                                                                                                item
                                                                                                    .deposito
                                                                                                    ?.nombre,
                                                                                        )
                                                                                        .filter(
                                                                                            Boolean,
                                                                                        )
                                                                                        .join(
                                                                                            ', ',
                                                                                        ) ||
                                                                                        '—'}
                                                                                </td>
                                                                            </tr>
                                                                        );
                                                                    },
                                                                )}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                )}
                                            </div>
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
                    onEscapeKeyDown={(evento) => {
                        // Escribiendo una marca nueva, Escape cancela solo eso.
                        if (marcaNueva !== null) {
                            evento.preventDefault();
                            setMarcaNueva(null);
                        }
                    }}
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

                        <Campo
                            id="codigo_interno"
                            label="Código interno"
                            error={erroresForm.codigo_interno}
                        >
                            <div className="flex gap-2">
                                <Input
                                    id="codigo_interno"
                                    className="font-mono"
                                    value={formData.codigo_interno}
                                    onChange={(evento) =>
                                        setFormData((actual) => ({
                                            ...actual,
                                            codigo_interno: evento.target.value,
                                        }))
                                    }
                                    placeholder="Escaneá o escribí"
                                    onKeyDown={(evento) => {
                                        // El lector físico manda Enter al final:
                                        // no tiene que guardar el formulario.
                                        if (evento.key === 'Enter') {
                                            evento.preventDefault();
                                        }
                                    }}
                                />
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    className="shrink-0"
                                    onClick={() => setEscanerFormAbierto(true)}
                                    title="Escanear con la cámara"
                                >
                                    <ScanLine />
                                </Button>
                            </div>
                        </Campo>

                        <Campo
                            id="costo"
                            label="Costo"
                            error={erroresForm.costo}
                        >
                            <Input
                                id="costo"
                                type="number"
                                step="0.01"
                                min="0"
                                inputMode="decimal"
                                value={formData.costo}
                                onChange={(evento) =>
                                    setFormData((actual) => ({
                                        ...actual,
                                        costo: evento.target.value,
                                    }))
                                }
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

                        <Campo label="Marca" opcional>
                            {marcaNueva === null ? (
                                <div className="flex gap-2">
                                    <Select
                                        value={formData.marca_id}
                                        onValueChange={(valor) =>
                                            setFormData((actual) => ({
                                                ...actual,
                                                marca_id: valor,
                                            }))
                                        }
                                    >
                                        <SelectTrigger className="w-full min-w-0">
                                            <SelectValue placeholder="Seleccionar" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {catalogos.marcas.map((item) => (
                                                <SelectItem
                                                    key={item.id}
                                                    value={String(item.id)}
                                                >
                                                    {item.nombre}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="icon"
                                        className="shrink-0"
                                        onClick={() => setMarcaNueva('')}
                                        title="Agregar una marca nueva"
                                    >
                                        <Plus />
                                    </Button>
                                </div>
                            ) : (
                                <div className="flex gap-2">
                                    <Input
                                        autoFocus
                                        value={marcaNueva}
                                        placeholder="Nombre de la marca"
                                        onChange={(evento) =>
                                            setMarcaNueva(evento.target.value)
                                        }
                                        onKeyDown={(evento) => {
                                            // Enter crea la marca (sin enviar el
                                            // formulario del producto); Escape cancela.
                                            if (evento.key === 'Enter') {
                                                evento.preventDefault();
                                                void agregarMarca();
                                            }

                                            if (evento.key === 'Escape') {
                                                evento.preventDefault();
                                                evento.stopPropagation();
                                                setMarcaNueva(null);
                                            }
                                        }}
                                        disabled={creandoMarca}
                                    />
                                    <Button
                                        type="button"
                                        size="icon"
                                        className="shrink-0"
                                        onClick={() => void agregarMarca()}
                                        disabled={creandoMarca}
                                        title="Guardar marca"
                                    >
                                        <Check />
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="shrink-0"
                                        onClick={() => setMarcaNueva(null)}
                                        disabled={creandoMarca}
                                        title="Cancelar"
                                    >
                                        <X />
                                    </Button>
                                </div>
                            )}
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

            {/* ESCÁNER (CÁMARA) — FORMULARIO */}
            <EscanerCodigoBarras
                abierto={escanerFormAbierto}
                onCerrar={() => setEscanerFormAbierto(false)}
                onDetectado={manejarCodigoEscaneadoForm}
            />
        </Page>
    );
}
