import { useState } from 'react';
import type { FormEvent } from 'react';
import { toast } from 'sonner';
import AppearanceTabs from '@/components/appearance-tabs';
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

export default function Configuracion() {
    useTitulo('Configuración');

    const { user } = useAuth();

    const [nombre, setNombre] = useState(
        user?.name === user?.email ? '' : (user?.name ?? ''),
    );
    const [guardandoPerfil, setGuardandoPerfil] = useState(false);

    const [password, setPassword] = useState('');
    const [confirmacion, setConfirmacion] = useState('');
    const [errorPassword, setErrorPassword] = useState<string | null>(null);
    const [guardandoPassword, setGuardandoPassword] = useState(false);

    const guardarPerfil = async (evento: FormEvent) => {
        evento.preventDefault();
        setGuardandoPerfil(true);

        const { error } = await supabase.auth.updateUser({
            data: { name: nombre.trim() },
        });

        setGuardandoPerfil(false);

        if (error) {
            toast.error('No se pudo guardar el nombre.');

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
                        description="El nombre que se muestra en el menú"
                    />

                    <div className="grid gap-2">
                        <Label htmlFor="email">Email</Label>
                        <Input id="email" value={user?.email ?? ''} disabled />
                    </div>

                    <div className="grid gap-2">
                        <Label htmlFor="nombre">Nombre</Label>
                        <Input
                            id="nombre"
                            value={nombre}
                            onChange={(evento) =>
                                setNombre(evento.target.value)
                            }
                            autoComplete="name"
                        />
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
