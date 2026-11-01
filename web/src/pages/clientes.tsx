import { Pencil, Plus, Search, Trash2, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import ClienteDialog from '@/components/cliente-dialog';
import { EstadoError, EstadoVacio, FilasCargando } from '@/components/estados';
import { Page, PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTitulo } from '@/hooks/use-titulo';
import { darDeBajaCliente, listarClientes } from '@/lib/api';
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

const COLUMNAS = 'md:grid-cols-[minmax(0,1fr)_130px_150px_140px_88px]';

export default function Clientes() {
    useTitulo('Clientes');

    const [clientes, setClientes] = useState<Cliente[]>([]);
    const [busqueda, setBusqueda] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [formAbierto, setFormAbierto] = useState(false);
    const [editando, setEditando] = useState<Cliente | null>(null);

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

    const abrirNuevo = () => {
        setEditando(null);
        setFormAbierto(true);
    };

    const abrirEditar = (cliente: Cliente) => {
        setEditando(cliente);
        setFormAbierto(true);
    };

    const cerrarForm = () => {
        setFormAbierto(false);
        setEditando(null);
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
            {formAbierto && (
                <ClienteDialog
                    key={editando?.id ?? 'nuevo'}
                    abierto
                    cliente={editando}
                    onCerrar={cerrarForm}
                    onGuardado={() => {
                        cerrarForm();
                        void cargarClientes();
                    }}
                />
            )}
        </Page>
    );
}
