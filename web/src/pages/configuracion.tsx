import { useState } from 'react';
import type { FormEvent } from 'react';
import { toast } from 'sonner';
import AppearanceTabs from '@/components/appearance-tabs';
import { Campo } from '@/components/campo';
import Heading from '@/components/heading';
import InputError from '@/components/input-error';
import { Page, PageHeader } from '@/components/page-header';
import PasswordInput from '@/components/password-input';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useTitulo } from '@/hooks/use-titulo';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

/** Edad en años cumplidos a partir de una fecha AAAA-MM-DD. */
function calcularEdad(fecha: string): number | null {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
        return null;
    }

    const [anio, mes, dia] = fecha.split('-').map(Number);
    const hoy = new Date();
    let edad = hoy.getFullYear() - anio;

    if (
        hoy.getMonth() + 1 < mes ||
        (hoy.getMonth() + 1 === mes && hoy.getDate() < dia)
    ) {
        edad--;
    }

    return edad >= 0 && edad < 130 ? edad : null;
}

export default function Configuracion() {
    useTitulo('Configuración');

    const { user } = useAuth();

    const [perfil, setPerfil] = useState({
        nombre: user?.name === user?.email ? '' : (user?.name ?? ''),
        telefono: user?.perfil.telefono ?? '',
        direccion: user?.perfil.direccion ?? '',
        fecha_nacimiento: user?.perfil.fecha_nacimiento ?? '',
        documento: user?.perfil.documento ?? '',
    });
    const [guardandoPerfil, setGuardandoPerfil] = useState(false);

    const cambiarPerfil = (campo: keyof typeof perfil, valor: string) =>
        setPerfil((actual) => ({ ...actual, [campo]: valor }));

    const edad = calcularEdad(perfil.fecha_nacimiento);

    const [password, setPassword] = useState('');
    const [confirmacion, setConfirmacion] = useState('');
    const [errorPassword, setErrorPassword] = useState<string | null>(null);
    const [guardandoPassword, setGuardandoPassword] = useState(false);

    const guardarPerfil = async (evento: FormEvent) => {
        evento.preventDefault();
        setGuardandoPerfil(true);

        const { error } = await supabase.auth.updateUser({
            data: {
                name: perfil.nombre.trim(),
                telefono: perfil.telefono.trim(),
                direccion: perfil.direccion.trim(),
                fecha_nacimiento: perfil.fecha_nacimiento,
                documento: perfil.documento.trim(),
            },
        });

        setGuardandoPerfil(false);

        if (error) {
            toast.error('No se pudo guardar el perfil.');

            return;
        }

        toast.success('Perfil actualizado.');
    };

    const guardarPassword = async (evento: FormEvent) => {
        evento.preventDefault();
        setErrorPassword(null);

        if (password.length < 8) {
            setErrorPassword(
                'La contraseña tiene que tener al menos 8 caracteres.',
            );

            return;
        }

        if (password !== confirmacion) {
            setErrorPassword('Las contraseñas no coinciden.');

            return;
        }

        setGuardandoPassword(true);

        const { error } = await supabase.auth.updateUser({ password });

        setGuardandoPassword(false);

        if (error) {
            setErrorPassword('No se pudo cambiar la contraseña.');

            return;
        }

        setPassword('');
        setConfirmacion('');
        toast.success('Contraseña actualizada.');
    };

    return (
        <Page>
            <PageHeader
                title="Configuración"
                description="Tu perfil, tu contraseña y la apariencia de la app"
            />

            <div className="bg-card shadow-xs flex max-w-xl flex-col gap-8 rounded-xl border p-6">
                {/* PERFIL */}
                <form onSubmit={guardarPerfil} className="space-y-4">
                    <Heading
                        variant="small"
                        title="Perfil"
                        description="Tus datos. El nombre es el que aparece en el saludo y en el menú."
                    />

                    <div className="grid gap-4 sm:grid-cols-2">
                        <Campo
                            id="email"
                            label="Email"
                            className="sm:col-span-2"
                        >
                            <Input
                                id="email"
                                value={user?.email ?? ''}
                                disabled
                            />
                        </Campo>

                        <Campo
                            id="nombre"
                            label="Nombre"
                            className="sm:col-span-2"
                        >
                            <Input
                                id="nombre"
                                value={perfil.nombre}
                                onChange={(evento) =>
                                    cambiarPerfil('nombre', evento.target.value)
                                }
                                autoComplete="name"
                            />
                        </Campo>

                        <Campo id="telefono" label="Teléfono" opcional>
                            <Input
                                id="telefono"
                                type="tel"
                                value={perfil.telefono}
                                onChange={(evento) =>
                                    cambiarPerfil(
                                        'telefono',
                                        evento.target.value,
                                    )
                                }
                                autoComplete="tel"
                            />
                        </Campo>

                        <Campo id="documento" label="DNI" opcional>
                            <Input
                                id="documento"
                                inputMode="numeric"
                                value={perfil.documento}
                                onChange={(evento) =>
                                    cambiarPerfil(
                                        'documento',
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
                                value={perfil.direccion}
                                onChange={(evento) =>
                                    cambiarPerfil(
                                        'direccion',
                                        evento.target.value,
                                    )
                                }
                                autoComplete="street-address"
                            />
                        </Campo>

                        <Campo
                            id="fecha_nacimiento"
                            label="Fecha de nacimiento"
                            opcional
                        >
                            <Input
                                id="fecha_nacimiento"
                                type="date"
                                value={perfil.fecha_nacimiento}
                                onChange={(evento) =>
                                    cambiarPerfil(
                                        'fecha_nacimiento',
                                        evento.target.value,
                                    )
                                }
                                autoComplete="bday"
                            />
                        </Campo>

                        <Campo id="edad" label="Edad">
                            <Input
                                id="edad"
                                value={edad === null ? '—' : `${edad} años`}
                                disabled
                            />
                        </Campo>
                    </div>

                    <Button type="submit" disabled={guardandoPerfil}>
                        {guardandoPerfil ? 'Guardando...' : 'Guardar'}
                    </Button>
                </form>

                <Separator />

                {/* CONTRASEÑA */}
                <form onSubmit={guardarPassword} className="space-y-4">
                    <Heading
                        variant="small"
                        title="Contraseña"
                        description="Usá una contraseña larga y difícil de adivinar"
                    />

                    <div className="grid gap-2">
                        <Label htmlFor="password">Contraseña nueva</Label>
                        <PasswordInput
                            id="password"
                            autoComplete="new-password"
                            value={password}
                            onChange={(evento) =>
                                setPassword(evento.target.value)
                            }
                        />
                    </div>

                    <div className="grid gap-2">
                        <Label htmlFor="confirmacion">Repetir contraseña</Label>
                        <PasswordInput
                            id="confirmacion"
                            autoComplete="new-password"
                            value={confirmacion}
                            onChange={(evento) =>
                                setConfirmacion(evento.target.value)
                            }
                        />
                        <InputError message={errorPassword ?? undefined} />
                    </div>

                    <Button type="submit" disabled={guardandoPassword}>
                        {guardandoPassword
                            ? 'Guardando...'
                            : 'Cambiar contraseña'}
                    </Button>
                </form>

                <Separator />

                {/* APARIENCIA */}
                <div className="space-y-4">
                    <Heading
                        variant="small"
                        title="Apariencia"
                        description="Modo claro, oscuro o el del sistema"
                    />
                    <AppearanceTabs />
                </div>
            </div>
        </Page>
    );
}
