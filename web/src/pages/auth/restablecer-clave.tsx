import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import InputError from '@/components/input-error';
import PasswordInput from '@/components/password-input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { useTitulo } from '@/hooks/use-titulo';
import AuthLayout from '@/layouts/auth-layout';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

/**
 * Destino del link que llega por email. Supabase inicia sesión
 * automáticamente al abrir el link, y acá se elige la clave nueva.
 */
export default function RestablecerClave() {
    useTitulo('Nueva contraseña');

    const { session, cargando } = useAuth();
    const navigate = useNavigate();

    const [password, setPassword] = useState('');
    const [confirmacion, setConfirmacion] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [procesando, setProcesando] = useState(false);

    const guardar = async (evento: FormEvent) => {
        evento.preventDefault();
        setError(null);

        if (password.length < 8) {
            setError('La contraseña tiene que tener al menos 8 caracteres.');

            return;
        }

        if (password !== confirmacion) {
            setError('Las contraseñas no coinciden.');

            return;
        }

        setProcesando(true);

        const { error } = await supabase.auth.updateUser({ password });

        setProcesando(false);

        if (error) {
            setError('No se pudo cambiar la contraseña. Pedí un link nuevo.');

            return;
        }

        toast.success('Contraseña actualizada.');
        navigate('/inicio', { replace: true });
    };

    return (
        <AuthLayout
            title="Elegí una contraseña nueva"
            description="Escribila dos veces para confirmarla"
        >
            {!cargando && !session ? (
                <p className="text-destructive text-center text-sm">
                    El link no es válido o ya venció. Pedí uno nuevo desde
                    "¿Olvidaste tu contraseña?".
                </p>
            ) : (
                <form onSubmit={guardar} className="grid gap-6">
                    <div className="grid gap-2">
                        <Label htmlFor="password">Contraseña nueva</Label>
                        <PasswordInput
                            id="password"
                            required
                            autoFocus
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
                            required
                            autoComplete="new-password"
                            value={confirmacion}
                            onChange={(evento) =>
                                setConfirmacion(evento.target.value)
                            }
                        />
                        <InputError message={error ?? undefined} />
                    </div>

                    <Button
                        type="submit"
                        className="w-full"
                        disabled={procesando}
                    >
                        {procesando && <Spinner />}
                        Guardar contraseña
                    </Button>
                </form>
            )}
        </AuthLayout>
    );
}
