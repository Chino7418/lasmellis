import { useState } from 'react';
import { toast } from 'sonner';
import { Campo } from '@/components/campo';
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
import { ErrorValidacion, guardarCliente } from '@/lib/api';
import type { ClienteGuardado } from '@/lib/api';

export type ClienteEditable = {
    id: number;
    nombre: string;
    apellido: string | null;
    documento: string | null;
    telefono: string | null;
    email: string | null;
    direccion: string | null;
    observaciones: string | null;
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

function formularioInicial(
    cliente: ClienteEditable | null,
    nombreInicial: string,
): FormData {
    return {
        nombre: cliente?.nombre ?? nombreInicial,
        apellido: cliente?.apellido ?? '',
        documento: cliente?.documento ?? '',
        telefono: cliente?.telefono ?? '',
        email: cliente?.email ?? '',
        direccion: cliente?.direccion ?? '',
        observaciones: cliente?.observaciones ?? '',
    };
}

/**
 * Alta / edición de un cliente. Se monta con una key distinta por
 * cliente, así el formulario arranca limpio cada vez.
 */
export default function ClienteDialog({
    abierto,
    onCerrar,
    onGuardado,
    cliente,
    nombreInicial = '',
}: {
    abierto: boolean;
    onCerrar: () => void;
    onGuardado: (cliente: ClienteGuardado) => void;
    /** null = cliente nuevo. */
    cliente: ClienteEditable | null;
    /** Para un cliente nuevo: lo que ya se escribió al buscarlo. */
    nombreInicial?: string;
}) {
    const [formData, setFormData] = useState<FormData>(() =>
        formularioInicial(cliente, nombreInicial),
    );
    const [erroresForm, setErroresForm] = useState<Record<string, string[]>>(
        {},
    );
    const [guardando, setGuardando] = useState(false);

    const actualizarCampo = (campo: keyof FormData, valor: string) => {
        setFormData((actual) => ({ ...actual, [campo]: valor }));
    };

    const guardar = async () => {
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
            const guardado = await guardarCliente(payload, cliente?.id);

            toast.success(cliente ? 'Cliente actualizado.' : 'Cliente creado.');
            onGuardado(guardado);
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

    return (
        <Dialog open={abierto} onOpenChange={(valor) => !valor && onCerrar()}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>
                        {cliente ? 'Editar cliente' : 'Nuevo cliente'}
                    </DialogTitle>
                    <DialogDescription>
                        {cliente
                            ? 'Modificá los datos del cliente.'
                            : 'Completá los datos para crear un cliente.'}
                    </DialogDescription>
                </DialogHeader>

                <form
                    id="form-cliente"
                    className="grid gap-4 sm:grid-cols-2"
                    onSubmit={(evento) => {
                        evento.preventDefault();
                        // Si el formulario se abrió desde otro (la venta),
                        // que no envíe también ese.
                        evento.stopPropagation();
                        void guardar();
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
                                actualizarCampo('nombre', evento.target.value)
                            }
                        />
                    </Campo>

                    <Campo id="apellido" label="Apellido" opcional>
                        <Input
                            id="apellido"
                            value={formData.apellido}
                            onChange={(evento) =>
                                actualizarCampo('apellido', evento.target.value)
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
                                actualizarCampo('telefono', evento.target.value)
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
                                actualizarCampo('email', evento.target.value)
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
                        onClick={onCerrar}
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
    );
}
