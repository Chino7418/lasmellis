import { Pencil, Plus, Search, Trash2, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
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
import {
    darDeBajaCliente,
    ErrorValidacion,
    guardarCliente as guardarClienteApi,
    listarClientes,
} from '@/lib/api';
import { dinero, nombreCompleto } from '@/lib/formato';

type Cliente = {
    id: number;
    nombre: string;
    apellido: string | null;
    documento: string | null;
    telefono: string | null;
    email: string | null;
    direccion: string | null;
    observaciones: string | null;
    activo: boolean;
    saldo: number | string;
};

type FormData = {
    nombre: string;
    apellido: string;
    documento: string;
    telefono: string;
    email: string;
    direccion: string;
    observaciones: string;
};

const formVacio: FormData = {
    nombre: '',
    apellido: '',
    documento: '',
    telefono: '',
    email: '',
    direccion: '',
    observaciones: '',
};

const COLUMNAS = 'md:grid-cols-[minmax(0,1fr)_130px_150px_140px_88px]';

export default function Clientes() {
    useTitulo('Clientes');

    const [clientes, setClientes] = useState<Cliente[]>([]);
    const [busqueda, setBusqueda] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [formAbierto, setFormAbierto] = useState(false);
    const [editando, setEditando] = useState<Cliente | null>(null);
    const [formData, setFormData] = useState<FormData>(formVacio);
    const [erroresForm, setErroresForm] = useState<Record<string, string[]>>(
        {},
    );
    const [guardando, setGuardando] = useState(false);

    const cargarClientes = () => {
        return listarClientes<Cliente>()
            .then((resultado) => {
                setClientes(resultado);
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
        void cargarClientes();
    }, []);

    const clientesFiltrados = useMemo(() => {
        const texto = busqueda.trim().toLowerCase();

        if (!texto) {
            return clientes;
        }

        return clientes.filter((cliente) => {
            return (
                cliente.nombre.toLowerCase().includes(texto) ||
                cliente.apellido?.toLowerCase().includes(texto) ||
                cliente.documento?.toLowerCase().includes(texto) ||
                cliente.telefono?.toLowerCase().includes(texto) ||
                cliente.email?.toLowerCase().includes(texto)
            );
        });
    }, [clientes, busqueda]);

    const actualizarCampo = (campo: keyof FormData, valor: string) => {
        setFormData((actual) => ({ ...actual, [campo]: valor }));
    };

    const abrirNuevo = () => {
        setEditando(null);
        setFormData(formVacio);
        setErroresForm({});
        setFormAbierto(true);
    };

    const abrirEditar = (cliente: Cliente) => {
        setEditando(cliente);
        setFormData({
            nombre: cliente.nombre,
            apellido: cliente.apellido ?? '',
            documento: cliente.documento ?? '',
            telefono: cliente.telefono ?? '',
            email: cliente.email ?? '',
            direccion: cliente.direccion ?? '',
            observaciones: cliente.observaciones ?? '',
        });
        setErroresForm({});
        setFormAbierto(true);
    };

    const cerrarForm = () => {
        setFormAbierto(false);
        setEditando(null);
        setErroresForm({});
    };

    const guardarCliente = async () => {
        setGuardando(true);
        setErroresForm({});

        const payload = {
            nombre: formData.nombre,
            apellido: formData.apellido || null,
            documento: formData.documento || null,
            telefono: formData.telefono || null,
            email: formData.email || null,
            direccion: formData.direccion || null,
            observaciones: formData.observaciones || null,
        };

        try {
            await guardarClienteApi(payload, editando?.id);

            toast.success(
                editando ? 'Cliente actualizado.' : 'Cliente creado.',
            );
            cerrarForm();
            await cargarClientes();
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

    const eliminarCliente = async (cliente: Cliente) => {
        const confirmado = window.confirm(
            `¿Dar de baja a "${nombreCompleto(cliente)}"?`,
        );

        if (!confirmado) {
            return;
        }

        try {
            toast.success(await darDeBajaCliente(cliente.id));
            await cargarClientes();
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
                title="Clientes"
                description="Datos de contacto y saldo de cuenta corriente"
                actions={
                    <Button onClick={abrirNuevo}>
                        <Plus />
                        Nuevo cliente
                    </Button>
                }
            />

            {error && <EstadoError mensaje={error} />}

            <section className="bg-card shadow-xs overflow-hidden rounded-xl border">
                {/* BARRA DE BÚSQUEDA */}
                <div className="flex flex-wrap items-center gap-3 border-b p-3">
                    <div className="relative min-w-0 flex-1 sm:max-w-sm">
                        <Search className="text-muted-foreground absolute left-3 top-1/2 size-4 -translate-y-1/2" />
                        <Input
                            value={busqueda}
                            onChange={(event) =>
                                setBusqueda(event.target.value)
                            }
                            placeholder="Buscar por nombre, documento, teléfono..."
                            className="pl-9"
                        />
                    </div>

                    {!loading && (
                        <span className="text-muted-foreground ml-auto text-sm">
                            {clientesFiltrados.length} cliente
                            {clientesFiltrados.length !== 1 ? 's' : ''}
                        </span>
                    )}
                </div>

                {loading && <FilasCargando />}

                {!loading && !error && clientesFiltrados.length === 0 && (
                    <EstadoVacio
                        icon={Users}
                        title={
                            busqueda
                                ? 'No se encontraron clientes'
                                : 'Todavía no hay clientes'
                        }
                        description={
                            busqueda
                                ? 'Probá con otro nombre, documento o teléfono.'
                                : 'Cargá tu primer cliente para venderle a cuenta corriente.'
                        }
                        action={
                            !busqueda && (
                                <Button variant="outline" onClick={abrirNuevo}>
                                    <Plus />
                                    Nuevo cliente
                                </Button>
                            )
                        }
                    />
                )}

                {!loading && clientesFiltrados.length > 0 && (
                    <>
                        {/* CABECERA */}
                        <div
                            className={`bg-muted/50 text-muted-foreground hidden gap-4 border-b px-5 py-2.5 text-xs font-medium md:grid ${COLUMNAS}`}
                        >
                            <div>Cliente</div>
                            <div>Documento</div>
                            <div>Teléfono</div>
                            <div className="text-right">Saldo</div>
                            <div />
                        </div>

                        <ul className="divide-y">
                            {clientesFiltrados.map((cliente) => {
                                const saldo = Number(cliente.saldo);

                                return (
                                    <li
                                        key={cliente.id}
                                        className={`hover:bg-muted/40 group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-5 py-3.5 transition-colors ${COLUMNAS}`}
                                    >
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-medium">
                                                {nombreCompleto(cliente)}
                                            </p>
                                            <p className="text-muted-foreground truncate text-xs">
                                                {[
                                                    cliente.email,
                                                    cliente.direccion,
                                                ]
                                                    .filter(Boolean)
                                                    .join(' · ') ||
                                                    'Sin datos de contacto'}
                                            </p>
                                        </div>

                                        <div className="text-muted-foreground hidden text-sm md:block">
                                            {cliente.documento ?? '—'}
                                        </div>

                                        <div className="text-muted-foreground hidden text-sm md:block">
                                            {cliente.telefono ?? '—'}
                                        </div>

                                        <div className="text-right">
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
                                        </div>

                                        <div className="col-span-2 flex justify-end gap-1 md:col-span-1 md:opacity-0 md:transition-opacity md:focus-within:opacity-100 md:group-hover:opacity-100">
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                className="size-8"
                                                onClick={() =>
                                                    abrirEditar(cliente)
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
                                                onClick={() =>
                                                    eliminarCliente(cliente)
                                                }
                                                title="Dar de baja"
                                            >
                                                <Trash2 />
                                            </Button>
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    </>
                )}
            </section>

            {/* FORMULARIO ALTA / EDICIÓN */}
            <Dialog open={formAbierto} onOpenChange={setFormAbierto}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>
                            {editando ? 'Editar cliente' : 'Nuevo cliente'}
                        </DialogTitle>
                        <DialogDescription>
                            {editando
                                ? 'Modificá los datos del cliente.'
                                : 'Completá los datos para crear un cliente.'}
                        </DialogDescription>
                    </DialogHeader>

                    <form
                        id="form-cliente"
                        className="grid gap-4 sm:grid-cols-2"
                        onSubmit={(evento) => {
                            evento.preventDefault();
                            void guardarCliente();
                        }}
                    >
                        <Campo
                            id="nombre"
                            label="Nombre"
                            error={erroresForm.nombre}
                        >
                            <Input
                                id="nombre"
                                autoFocus
                                value={formData.nombre}
                                onChange={(evento) =>
                                    actualizarCampo(
                                        'nombre',
                                        evento.target.value,
                                    )
                                }
                            />
                        </Campo>

                        <Campo id="apellido" label="Apellido" opcional>
                            <Input
                                id="apellido"
                                value={formData.apellido}
                                onChange={(evento) =>
                                    actualizarCampo(
                                        'apellido',
                                        evento.target.value,
                                    )
                                }
                            />
                        </Campo>

                        <Campo
                            id="documento"
                            label="Documento"
                            opcional
                            error={erroresForm.documento}
                        >
                            <Input
                                id="documento"
                                inputMode="numeric"
                                value={formData.documento}
                                onChange={(evento) =>
                                    actualizarCampo(
                                        'documento',
                                        evento.target.value,
                                    )
                                }
                            />
                        </Campo>

                        <Campo id="telefono" label="Teléfono" opcional>
                            <Input
                                id="telefono"
                                type="tel"
                                value={formData.telefono}
                                onChange={(evento) =>
                                    actualizarCampo(
                                        'telefono',
                                        evento.target.value,
                                    )
                                }
                            />
                        </Campo>

                        <Campo
                            id="email"
                            label="Email"
                            opcional
                            error={erroresForm.email}
                            className="sm:col-span-2"
                        >
                            <Input
                                id="email"
                                type="email"
                                value={formData.email}
                                onChange={(evento) =>
                                    actualizarCampo(
                                        'email',
                                        evento.target.value,
                                    )
                                }
                            />
                        </Campo>

                        <Campo
                            id="direccion"
                            label="Dirección"
                            opcional
                            className="sm:col-span-2"
                        >
                            <Input
                                id="direccion"
                                value={formData.direccion}
                                onChange={(evento) =>
                                    actualizarCampo(
                                        'direccion',
                                        evento.target.value,
                                    )
                                }
                            />
                        </Campo>

                        <Campo
                            id="observaciones"
                            label="Observaciones"
                            opcional
                            className="sm:col-span-2"
                        >
                            <Input
                                id="observaciones"
                                value={formData.observaciones}
                                onChange={(evento) =>
                                    actualizarCampo(
                                        'observaciones',
                                        evento.target.value,
                                    )
                                }
                            />
                        </Campo>
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
                            form="form-cliente"
                            disabled={guardando}
                        >
                            {guardando ? 'Guardando...' : 'Guardar'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Page>
    );
}
