import {
    Minus,
    Plus,
    ScanLine,
    Search,
    ShoppingCart,
    Trash2,
    User,
    X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { toast } from 'sonner';
import EscanerCodigoBarras from '@/components/escaner-codigo-barras';
import { EstadoVacio } from '@/components/estados';
import { Page, PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { useTitulo } from '@/hooks/use-titulo';
import {
    buscarProductoPorCodigo,
    buscarProductos,
    listarClientes,
    listarDepositos,
    registrarVenta,
} from '@/lib/api';
import type { NuevaVenta } from '@/lib/api';
import {
    cantidad,
    dinero,
    nombreCompleto,
    tituloProducto,
} from '@/lib/formato';
import { cn } from '@/lib/utils';

type Precio = {
    id: number;
    precio: string | number;
    activo: boolean;
};

type StockVariante = {
    cantidad: string | number;
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
    color?: { id: number; nombre: string } | null;
    talle?: { id: number; nombre: string } | null;
    precios: Precio[];
    stock: StockVariante[];
};

type Producto = {
    id: number;
    nombre: string;
    descripcion: string | null;
    marca?: { id: number; nombre: string } | null;
    codigo_interno: string;
    activo: boolean;
    variantes: Variante[];
};

type Cliente = {
    id: number;
    nombre: string;
    apellido: string | null;
    documento: string | null;
};

type Deposito = {
    id: number;
    nombre: string;
};

type ItemCarrito = {
    varianteId: number;
    productoNombre: string;
    color: string;
    talle: string;
    codigo: string;
    cantidad: number;
    precioUnitario: number;
    descuento: number;
};

type MedioPago =
    'efectivo' | 'transferencia' | 'tarjeta_debito' | 'tarjeta_credito';

type Pago = {
    medioPago: MedioPago;
    monto: string;
};

const MEDIOS_PAGO: { value: MedioPago; label: string }[] = [
    { value: 'efectivo', label: 'Efectivo' },
    { value: 'transferencia', label: 'Transferencia' },
    { value: 'tarjeta_debito', label: 'Tarjeta de débito' },
    { value: 'tarjeta_credito', label: 'Tarjeta de crédito' },
];

function precioActivo(variante: Variante): number {
    const precio = variante.precios.find((item) => item.activo);

    return precio ? Number(precio.precio) : 0;
}

function stockEnDeposito(variante: Variante, depositoId: string): number {
    if (!depositoId) {
        return 0;
    }

    const stock = variante.stock.find(
        (item) => String(item.deposito?.id) === depositoId,
    );

    return stock ? Number(stock.cantidad) : 0;
}

function descripcionVariante(color: string, talle: string): string {
    return [color, talle].filter((valor) => valor && valor !== '-').join(' / ');
}

export default function Ventas() {
    useTitulo('Ventas');

    const [depositoId, setDepositoId] = useState('');

    const [busquedaCliente, setBusquedaCliente] = useState('');
    const [resultadosCliente, setResultadosCliente] = useState<Cliente[]>([]);
    const [clienteSeleccionado, setClienteSeleccionado] =
        useState<Cliente | null>(null);
    const [buscandoCliente, setBuscandoCliente] = useState(false);

    const [busquedaProducto, setBusquedaProducto] = useState('');
    const [resultadosProducto, setResultadosProducto] = useState<Producto[]>(
        [],
    );
    const [buscandoProducto, setBuscandoProducto] = useState(false);
    const [escanerAbierto, setEscanerAbierto] = useState(false);

    const [carrito, setCarrito] = useState<ItemCarrito[]>([]);
    const [descuentoGeneral, setDescuentoGeneral] = useState('0');
    const [observaciones, setObservaciones] = useState('');

    const [pagos, setPagos] = useState<Pago[]>([]);
    const [procesando, setProcesando] = useState(false);

    useEffect(() => {
        // El negocio no distingue depósitos: se usa siempre el primero
        // (normalmente el único) sin mostrarlo.
        listarDepositos()
            .then((resultado: Deposito[]) => {
                if (resultado.length > 0) {
                    setDepositoId(String(resultado[0].id));
                }
            })
            .catch(() => {
                toast.error('No se pudieron cargar los depósitos.');
            });
    }, []);

    // BÚSQUEDA DE CLIENTE (con debounce)
    useEffect(() => {
        const texto = busquedaCliente.trim();

        const timeout = setTimeout(() => {
            if (texto.length < 2) {
                setResultadosCliente([]);

                return;
            }

            setBuscandoCliente(true);

            listarClientes<Cliente>(texto)
                .then((resultado) => setResultadosCliente(resultado))
                .catch(() => {
                    toast.error('No se pudo buscar el cliente.');
                })
                .finally(() => setBuscandoCliente(false));
        }, 350);

        return () => clearTimeout(timeout);
    }, [busquedaCliente]);

    // BÚSQUEDA DE PRODUCTO (con debounce)
    useEffect(() => {
        const texto = busquedaProducto.trim();

        const timeout = setTimeout(() => {
            if (texto.length < 2) {
                setResultadosProducto([]);

                return;
            }

            setBuscandoProducto(true);

            buscarProductos<Producto>(texto)
                .then((resultado) => setResultadosProducto(resultado))
                .catch(() => {
                    toast.error('No se pudo buscar el producto.');
                })
                .finally(() => setBuscandoProducto(false));
        }, 350);

        return () => clearTimeout(timeout);
    }, [busquedaProducto]);

    const agregarAlCarrito = (producto: Producto, variante: Variante) => {
        setCarrito((actual) => {
            const existente = actual.find(
                (item) => item.varianteId === variante.id,
            );

            if (existente) {
                return actual.map((item) =>
                    item.varianteId === variante.id
                        ? { ...item, cantidad: item.cantidad + 1 }
                        : item,
                );
            }

            return [
                ...actual,
                {
                    varianteId: variante.id,
                    productoNombre: tituloProducto(producto),
                    color: variante.color?.nombre ?? '-',
                    talle: variante.talle?.nombre ?? '-',
                    codigo: variante.codigo_barras,
                    cantidad: 1,
                    precioUnitario: precioActivo(variante),
                    descuento: 0,
                },
            ];
        });

        toast.success(`${tituloProducto(producto)} agregado al carrito.`);
    };

    const manejarCodigoEscaneado = async (codigo: string) => {
        setEscanerAbierto(false);

        try {
            const producto = await buscarProductoPorCodigo<Producto>(codigo);

            if (!producto) {
                toast.error(
                    `No se encontró ningún producto con el código "${codigo}".`,
                );

                return;
            }

            const variante =
                producto.variantes.find(
                    (item) => item.codigo_barras === codigo,
                ) ?? producto.variantes[0];

            if (!variante) {
                toast.error('El producto no tiene variantes cargadas todavía.');

                return;
            }

            if (!producto.activo || !variante.activo) {
                toast.error(
                    `"${producto.nombre}" está marcado como inactivo: no está a la venta.`,
                );

                return;
            }

            agregarAlCarrito(producto, variante);
        } catch {
            toast.error('Ocurrió un error al buscar el producto.');
        }
    };

    const manejarEnterProducto = (
        evento: React.KeyboardEvent<HTMLInputElement>,
    ) => {
        // Un lector físico "tipea" el código y manda Enter al final:
        // se busca por código exacto y se agrega directo al carrito.
        const codigo = busquedaProducto.trim();

        if (evento.key === 'Enter' && codigo) {
            evento.preventDefault();
            setBusquedaProducto('');
            void manejarCodigoEscaneado(codigo);
        }
    };

    const actualizarItem = (
        varianteId: number,
        cambios: Partial<ItemCarrito>,
    ) => {
        setCarrito((actual) =>
            actual.map((item) =>
                item.varianteId === varianteId ? { ...item, ...cambios } : item,
            ),
        );
    };

    const quitarDelCarrito = (varianteId: number) => {
        setCarrito((actual) =>
            actual.filter((item) => item.varianteId !== varianteId),
        );
    };

    const subtotal = carrito.reduce(
        (total, item) =>
            total + item.cantidad * item.precioUnitario - item.descuento,
        0,
    );

    const total = Math.max(subtotal - (Number(descuentoGeneral) || 0), 0);

    const totalPagado = pagos.reduce(
        (total, pago) => total + (Number(pago.monto) || 0),
        0,
    );

    const restante = Math.max(total - totalPagado, 0);

    const agregarPago = () => {
        // El monto arranca con lo que falta cobrar.
        setPagos((actual) => [
            ...actual,
            {
                medioPago: 'efectivo',
                monto: restante > 0 ? String(Number(restante.toFixed(2))) : '',
            },
        ]);
    };

    const actualizarPago = (index: number, cambios: Partial<Pago>) => {
        setPagos((actual) =>
            actual.map((pago, i) =>
                i === index ? { ...pago, ...cambios } : pago,
            ),
        );
    };

    const quitarPago = (index: number) => {
        setPagos((actual) => actual.filter((_, i) => i !== index));
    };

    const reiniciarVenta = () => {
        setCarrito([]);
        setPagos([]);
        setDescuentoGeneral('0');
        setObservaciones('');
        setClienteSeleccionado(null);
        setBusquedaCliente('');
    };

    const confirmarVenta = async () => {
        if (!depositoId) {
            toast.error(
                'Todavía no se cargó el stock. Esperá un segundo y volvé a intentar.',
            );

            return;
        }

        if (carrito.length === 0) {
            toast.error('Agregá al menos un producto al carrito.');

            return;
        }

        setProcesando(true);

        const payload: NuevaVenta = {
            cliente_id: clienteSeleccionado?.id ?? null,
            deposito_id: Number(depositoId),
            descuento: Number(descuentoGeneral) || 0,
            observaciones: observaciones || null,
            detalles: carrito.map((item) => ({
                variante_producto_id: item.varianteId,
                cantidad: item.cantidad,
                precio_unitario: item.precioUnitario,
                descuento: item.descuento,
            })),
            pagos: pagos
                .filter((pago) => Number(pago.monto) > 0)
                .map((pago) => ({
                    monto: Number(pago.monto),
                    medio_pago: pago.medioPago,
                })),
        };

        try {
            const venta = await registrarVenta(payload);

            toast.success(`Venta ${venta.numero} registrada.`);
            reiniciarVenta();
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? error.message
                    : 'Ocurrió un error al registrar la venta.',
            );
        } finally {
            setProcesando(false);
        }
    };

    const unidades = carrito.reduce((suma, item) => suma + item.cantidad, 0);

    return (
        <Page>
            <PageHeader
                title="Nueva venta"
                description="Agregá productos, elegí el cliente y cobrá"
            />

            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
                {/* COLUMNA IZQUIERDA */}
                <div className="flex min-w-0 flex-col gap-6">
                    {/* CLIENTE */}
                    <Tarjeta>
                        <div className="p-5">
                            <div className="grid gap-2 sm:max-w-md">
                                <Label htmlFor="cliente">Cliente</Label>

                                {clienteSeleccionado ? (
                                    <div className="bg-muted/40 flex h-9 items-center justify-between gap-2 rounded-md border pl-3 pr-1 text-sm">
                                        <span className="flex min-w-0 items-center gap-2">
                                            <User className="text-muted-foreground size-4 shrink-0" />
                                            <span className="truncate">
                                                {nombreCompleto(
                                                    clienteSeleccionado,
                                                )}
                                            </span>
                                        </span>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="size-7"
                                            onClick={() =>
                                                setClienteSeleccionado(null)
                                            }
                                            title="Quitar cliente"
                                        >
                                            <X />
                                        </Button>
                                    </div>
                                ) : (
                                    <div className="relative">
                                        <Input
                                            id="cliente"
                                            value={busquedaCliente}
                                            onChange={(evento) =>
                                                setBusquedaCliente(
                                                    evento.target.value,
                                                )
                                            }
                                            placeholder="Consumidor Final"
                                            autoComplete="off"
                                        />

                                        {(resultadosCliente.length > 0 ||
                                            buscandoCliente) && (
                                            <div className="bg-popover absolute z-20 mt-1 w-full overflow-hidden rounded-md border shadow-md">
                                                {buscandoCliente ? (
                                                    <p className="text-muted-foreground px-3 py-2 text-sm">
                                                        Buscando...
                                                    </p>
                                                ) : (
                                                    resultadosCliente.map(
                                                        (cliente) => (
                                                            <button
                                                                key={cliente.id}
                                                                type="button"
                                                                onClick={() => {
                                                                    setClienteSeleccionado(
                                                                        cliente,
                                                                    );
                                                                    setResultadosCliente(
                                                                        [],
                                                                    );
                                                                }}
                                                                className="hover:bg-accent flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm"
                                                            >
                                                                <span className="truncate">
                                                                    {nombreCompleto(
                                                                        cliente,
                                                                    )}
                                                                </span>
                                                                {cliente.documento && (
                                                                    <span className="text-muted-foreground shrink-0 text-xs">
                                                                        {
                                                                            cliente.documento
                                                                        }
                                                                    </span>
                                                                )}
                                                            </button>
                                                        ),
                                                    )
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </Tarjeta>

                    {/* BÚSQUEDA DE PRODUCTO */}
                    <Tarjeta>
                        <div className="flex items-center gap-2 p-3">
                            <div className="relative flex-1">
                                <Search className="text-muted-foreground absolute left-3 top-1/2 size-4 -translate-y-1/2" />
                                <Input
                                    value={busquedaProducto}
                                    onChange={(evento) =>
                                        setBusquedaProducto(evento.target.value)
                                    }
                                    onKeyDown={manejarEnterProducto}
                                    placeholder="Buscar producto o escanear con lector..."
                                    className="pl-9"
                                    autoComplete="off"
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
                        </div>

                        {buscandoProducto && (
                            <p className="text-muted-foreground border-t px-5 py-3 text-sm">
                                Buscando...
                            </p>
                        )}

                        {!buscandoProducto && resultadosProducto.length > 0 && (
                            <ul className="max-h-80 divide-y overflow-y-auto border-t">
                                {resultadosProducto.map((producto) =>
                                    // Solo lo que está a la venta.
                                    (producto.activo
                                        ? producto.variantes.filter(
                                              (variante) => variante.activo,
                                          )
                                        : []
                                    ).map((variante) => {
                                        const stock = stockEnDeposito(
                                            variante,
                                            depositoId,
                                        );
                                        const detalle = descripcionVariante(
                                            variante.color?.nombre ?? '',
                                            variante.talle?.nombre ?? '',
                                        );

                                        return (
                                            <li key={variante.id}>
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        agregarAlCarrito(
                                                            producto,
                                                            variante,
                                                        )
                                                    }
                                                    className="hover:bg-muted/50 group flex w-full items-center gap-3 px-5 py-2.5 text-left transition-colors"
                                                >
                                                    <span className="min-w-0 flex-1">
                                                        <span className="line-clamp-2 text-sm font-medium">
                                                            {tituloProducto(
                                                                producto,
                                                            )}
                                                        </span>
                                                        {detalle && (
                                                            <span className="text-muted-foreground block truncate text-xs">
                                                                {detalle}
                                                            </span>
                                                        )}
                                                    </span>

                                                    <Badge
                                                        variant={
                                                            stock > 0
                                                                ? 'secondary'
                                                                : 'danger'
                                                        }
                                                        className="tabular-nums"
                                                    >
                                                        {stock > 0
                                                            ? `${cantidad(stock)} en stock`
                                                            : 'Sin stock'}
                                                    </Badge>

                                                    <span className="w-24 text-right text-sm font-medium tabular-nums">
                                                        {dinero(
                                                            precioActivo(
                                                                variante,
                                                            ),
                                                        )}
                                                    </span>

                                                    <Plus className="text-muted-foreground group-hover:text-foreground size-4" />
                                                </button>
                                            </li>
                                        );
                                    }),
                                )}
                            </ul>
                        )}
                    </Tarjeta>

                    {/* CARRITO */}
                    <Tarjeta>
                        <div className="flex items-center justify-between border-b px-5 py-3.5">
                            <h2 className="flex items-center gap-2 font-serif text-base font-medium">
                                <ShoppingCart className="size-4" />
                                Carrito
                            </h2>
                            {carrito.length > 0 && (
                                <span className="text-muted-foreground text-sm">
                                    {unidades} unidad
                                    {unidades !== 1 ? 'es' : ''}
                                </span>
                            )}
                        </div>

                        {carrito.length === 0 ? (
                            <EstadoVacio
                                icon={ShoppingCart}
                                title="El carrito está vacío"
                                description="Buscá un producto arriba o escaneá su código de barras."
                            />
                        ) : (
                            <ul className="divide-y">
                                {carrito.map((item) => (
                                    <li
                                        key={item.varianteId}
                                        className="flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-3.5"
                                    >
                                        <div className="min-w-[160px] flex-1">
                                            <p className="line-clamp-2 text-sm font-medium">
                                                {item.productoNombre}
                                            </p>
                                            <p className="text-muted-foreground truncate text-xs">
                                                {[
                                                    descripcionVariante(
                                                        item.color,
                                                        item.talle,
                                                    ),
                                                    item.codigo,
                                                ]
                                                    .filter(Boolean)
                                                    .join(' · ')}
                                            </p>
                                        </div>

                                        {/* CANTIDAD */}
                                        <div className="flex items-center rounded-full border">
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                className="size-8 rounded-r-none"
                                                onClick={() =>
                                                    actualizarItem(
                                                        item.varianteId,
                                                        {
                                                            cantidad: Math.max(
                                                                1,
                                                                item.cantidad -
                                                                    1,
                                                            ),
                                                        },
                                                    )
                                                }
                                                title="Restar uno"
                                            >
                                                <Minus />
                                            </Button>

                                            <input
                                                type="number"
                                                min="1"
                                                value={item.cantidad}
                                                onChange={(evento) =>
                                                    actualizarItem(
                                                        item.varianteId,
                                                        {
                                                            cantidad: Math.max(
                                                                1,
                                                                Number(
                                                                    evento
                                                                        .target
                                                                        .value,
                                                                ) || 1,
                                                            ),
                                                        },
                                                    )
                                                }
                                                className="h-8 w-10 bg-transparent text-center text-sm tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                                                aria-label="Cantidad"
                                            />

                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                className="size-8 rounded-l-none"
                                                onClick={() =>
                                                    actualizarItem(
                                                        item.varianteId,
                                                        {
                                                            cantidad:
                                                                item.cantidad +
                                                                1,
                                                        },
                                                    )
                                                }
                                                title="Sumar uno"
                                            >
                                                <Plus />
                                            </Button>
                                        </div>

                                        {/* PRECIO UNITARIO */}
                                        <div className="relative">
                                            <span className="text-muted-foreground pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs">
                                                $
                                            </span>
                                            <Input
                                                type="number"
                                                min="0"
                                                step="0.01"
                                                inputMode="decimal"
                                                value={item.precioUnitario}
                                                onChange={(evento) =>
                                                    actualizarItem(
                                                        item.varianteId,
                                                        {
                                                            precioUnitario:
                                                                Number(
                                                                    evento
                                                                        .target
                                                                        .value,
                                                                ) || 0,
                                                        },
                                                    )
                                                }
                                                className="h-8 w-28 pl-6 tabular-nums"
                                                title="Precio unitario"
                                            />
                                        </div>

                                        <span className="w-24 text-right text-sm font-semibold tabular-nums">
                                            {dinero(
                                                item.cantidad *
                                                    item.precioUnitario -
                                                    item.descuento,
                                            )}
                                        </span>

                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="text-muted-foreground hover:text-destructive size-8"
                                            onClick={() =>
                                                quitarDelCarrito(
                                                    item.varianteId,
                                                )
                                            }
                                            title="Quitar del carrito"
                                        >
                                            <Trash2 />
                                        </Button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Tarjeta>
                </div>

                {/* COLUMNA DERECHA: RESUMEN Y PAGO */}
                <Tarjeta className="lg:sticky lg:top-4">
                    <div className="border-b px-5 py-3.5">
                        <h2 className="font-serif text-base font-medium">
                            Resumen
                        </h2>
                    </div>

                    <div className="flex flex-col gap-4 p-5">
                        <Fila etiqueta="Subtotal" valor={dinero(subtotal)} />

                        <div className="flex items-center justify-between gap-4">
                            <Label
                                htmlFor="descuento-general"
                                className="text-muted-foreground font-normal"
                            >
                                Descuento
                            </Label>
                            <div className="relative">
                                <span className="text-muted-foreground pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs">
                                    $
                                </span>
                                <Input
                                    id="descuento-general"
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    inputMode="decimal"
                                    value={descuentoGeneral}
                                    onChange={(evento) =>
                                        setDescuentoGeneral(evento.target.value)
                                    }
                                    className="h-8 w-32 pl-6 text-right tabular-nums"
                                />
                            </div>
                        </div>

                        <Separator />

                        <div className="flex items-baseline justify-between">
                            <span className="text-sm font-medium">Total</span>
                            <span className="text-2xl font-semibold tabular-nums tracking-tight">
                                {dinero(total)}
                            </span>
                        </div>

                        <Separator />

                        {/* PAGOS */}
                        <div className="flex flex-col gap-3">
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-medium">
                                    Pagos
                                </span>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={agregarPago}
                                >
                                    <Plus />
                                    Agregar pago
                                </Button>
                            </div>

                            {pagos.length === 0 && (
                                <p className="bg-muted/60 text-muted-foreground rounded-md px-3 py-2 text-xs">
                                    Sin pagos cargados: el total queda a cuenta
                                    corriente del cliente.
                                </p>
                            )}

                            {pagos.map((pago, index) => (
                                <div
                                    key={index}
                                    className="flex items-center gap-2"
                                >
                                    <Select
                                        value={pago.medioPago}
                                        onValueChange={(valor) =>
                                            actualizarPago(index, {
                                                medioPago: valor as MedioPago,
                                            })
                                        }
                                    >
                                        <SelectTrigger className="h-8 min-w-0 flex-1">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {MEDIOS_PAGO.map((medio) => (
                                                <SelectItem
                                                    key={medio.value}
                                                    value={medio.value}
                                                >
                                                    {medio.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>

                                    <Input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        inputMode="decimal"
                                        value={pago.monto}
                                        onChange={(evento) =>
                                            actualizarPago(index, {
                                                monto: evento.target.value,
                                            })
                                        }
                                        placeholder="Monto"
                                        className="h-8 w-28 text-right tabular-nums"
                                    />

                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="text-muted-foreground hover:text-destructive size-8 shrink-0"
                                        onClick={() => quitarPago(index)}
                                        title="Quitar pago"
                                    >
                                        <Trash2 />
                                    </Button>
                                </div>
                            ))}

                            <div className="flex flex-col gap-1.5 pt-1">
                                <Fila
                                    etiqueta="Pagado"
                                    valor={dinero(totalPagado)}
                                />
                                <Fila
                                    etiqueta="A cuenta corriente"
                                    valor={dinero(restante)}
                                    className={cn(
                                        restante > 0 &&
                                            'text-destructive font-medium',
                                    )}
                                />
                            </div>
                        </div>

                        <div className="grid gap-2">
                            <Label
                                htmlFor="observaciones"
                                className="text-muted-foreground font-normal"
                            >
                                Observaciones
                            </Label>
                            <Input
                                id="observaciones"
                                value={observaciones}
                                onChange={(evento) =>
                                    setObservaciones(evento.target.value)
                                }
                            />
                        </div>

                        <Button
                            type="button"
                            className="w-full"
                            size="lg"
                            disabled={procesando || carrito.length === 0}
                            onClick={confirmarVenta}
                        >
                            {procesando
                                ? 'Procesando...'
                                : `Confirmar venta · ${dinero(total)}`}
                        </Button>
                    </div>
                </Tarjeta>
            </div>

            <EscanerCodigoBarras
                abierto={escanerAbierto}
                onCerrar={() => setEscanerAbierto(false)}
                onDetectado={manejarCodigoEscaneado}
            />
        </Page>
    );
}

function Tarjeta({
    className,
    children,
}: {
    className?: string;
    children: ReactNode;
}) {
    return (
        <section
            className={cn('bg-card shadow-xs rounded-xl border', className)}
        >
            {children}
        </section>
    );
}

function Fila({
    etiqueta,
    valor,
    className,
}: {
    etiqueta: string;
    valor: string;
    className?: string;
}) {
    return (
        <div
            className={cn(
                'flex items-center justify-between text-sm',
                className,
            )}
        >
            <span className="text-muted-foreground">{etiqueta}</span>
            <span className="tabular-nums">{valor}</span>
        </div>
    );
}
