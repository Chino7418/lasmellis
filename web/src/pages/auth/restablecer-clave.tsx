import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
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
 * Destino de los links que llegan por email:
 *
 *  - "Olvidé mi contraseña": Supabase inicia sesión solo al abrir el link.
 *  - Invitación: el template manda ?token_hash=...&type=invite, y acá se
 *    canjea por una sesión (así un antivirus que "abre" el link para
 *    revisarlo no lo gasta).
 *
 * En los dos casos, después se elige la contraseña.
 */
export default function RestablecerClave() {
    useTitulo('Nueva contraseña');

    const { session, cargando } = useAuth();
    const navigate = useNavigate();
    const [parametros] = useSearchParams();

    const tokenHash = parametros.get('token_hash');
    const tipo = parametros.get('type');
    const esInvitacion = tipo === 'invite';

    const [verificando, setVerificando] = useState(Boolean(tokenHash));
    const [linkInvalido, setLinkInvalido] = useState(false);
    // El token sirve una sola vez: no canjearlo de nuevo si el efecto se
    // repite (StrictMode).
    const canjeado = useRef(false);

    useEffect(() => {
        if (!tokenHash || (tipo !== 'invite' && tipo !== 'recovery')) {
            setVerificando(false);

            return;
        }

        if (canjeado.current) {
            return;
        }

        canjeado.current = true;

        void supabase.auth
            .verifyOtp({ token_hash: tokenHash, type: tipo })
            .then(({ error }) => {
                setLinkInvalido(Boolean(error));
                setVerificando(false);
            });
    }, [tokenHash, tipo]);

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

        toast.success(
            esInvitacion
                ? '¡Listo! Ya podés usar Las Mellis.'
                : 'Contraseña actualizada.',
        );
        navigate('/inicio', { replace: true });
    };

    return (
        <AuthLayout
            title={
                esInvitacion
                    ? 'Te damos la bienvenida a Las Mellis'
                    : 'Elegí una contraseña nueva'
            }
            description={
                esInvitacion
                    ? 'Elegí tu contraseña para entrar a la app'
                    : 'Escribila dos veces para confirmarla'
            }
        >
            {cargando || verificando ? (
                <div className="flex justify-center py-6">
                    <Spinner />
                </div>
            ) : linkInvalido || !session ? (
                <p className="text-destructive text-center text-sm">
                    {esInvitacion
                        ? 'El link de invitación no es válido o ya venció. Pedí que te manden una invitación nueva.'
                        : 'El link no es válido o ya venció. Pedí uno nuevo desde "¿Olvidaste tu contraseña?".'}
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
