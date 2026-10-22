import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import InputError from '@/components/input-error';
import PasswordInput from '@/components/password-input';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { useTitulo } from '@/hooks/use-titulo';
import AuthLayout from '@/layouts/auth-layout';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export default function Login() {
    useTitulo('Iniciar sesión');

    const { session } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const destino =
        (location.state as { desde?: string } | null)?.desde ?? '/dashboard';

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [procesando, setProcesando] = useState(false);

    if (session) {
        return <Navigate to={destino} replace />;
    }

    const iniciarSesion = async (evento: FormEvent) => {
        evento.preventDefault();
        setProcesando(true);
        setError(null);

        const { error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        setProcesando(false);

        if (error) {
            setError(
                error.message === 'Invalid login credentials'
                    ? 'El email o la contraseña son incorrectos.'
                    : 'No se pudo iniciar sesión. Probá de nuevo.',
            );
            setPassword('');

            return;
        }

        navigate(destino, { replace: true });
    };

    return (
        <AuthLayout
            title="Ingresá con tu cuenta"
            description="Escribí tu email y contraseña para iniciar sesión"
        >
            <form onSubmit={iniciarSesion} className="flex flex-col gap-6">
                <div className="grid gap-6">
                    <div className="grid gap-2">
                        <Label htmlFor="email">Email</Label>
                        <Input
                            id="email"
                            type="email"
                            required
                            autoFocus
                            autoComplete="email"
                            placeholder="email@ejemplo.com"
                            value={email}
                            onChange={(evento) => setEmail(evento.target.value)}
                        />
                    </div>

                    <div className="grid gap-2">
                        <div className="flex items-center">
                            <Label htmlFor="password">Contraseña</Label>
                            <Link
                                to="/olvide-mi-clave"
                                className="text-foreground ml-auto text-sm underline decoration-neutral-300 underline-offset-4 hover:decoration-current dark:decoration-neutral-500"
                            >
                                ¿Olvidaste tu contraseña?
                            </Link>
                        </div>
                        <PasswordInput
                            id="password"
                            required
                            autoComplete="current-password"
                            placeholder="Contraseña"
                            value={password}
                            onChange={(evento) =>
                                setPassword(evento.target.value)
                            }
                        />
                        <InputError message={error ?? undefined} />
                    </div>

                    <Button
                        type="submit"
                        className="mt-4 w-full"
                        disabled={procesando}
                    >
                        {procesando && <Spinner />}
                        Ingresar
                    </Button>
                </div>
            </form>
        </AuthLayout>
    );
}
