import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router';
import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { useTitulo } from '@/hooks/use-titulo';
import AuthLayout from '@/layouts/auth-layout';
import { supabase } from '@/lib/supabase';

export default function OlvideMiClave() {
    useTitulo('Recuperar contraseña');

    const [email, setEmail] = useState('');
    const [enviado, setEnviado] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [procesando, setProcesando] = useState(false);

    const enviar = async (evento: FormEvent) => {
        evento.preventDefault();
        setProcesando(true);
        setError(null);

        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/restablecer-clave`,
        });

        setProcesando(false);

        if (error) {
            setError('No se pudo enviar el email. Probá de nuevo en un rato.');

            return;
        }

        setEnviado(true);
    };

    return (
        <AuthLayout
            title="¿Olvidaste tu contraseña?"
            description="Escribí tu email y te mandamos un link para crear una nueva"
        >
            {enviado ? (
                <p className="text-success text-center text-sm font-medium">
                    Si el email está registrado, en unos minutos te va a llegar
                    el link para restablecer la contraseña.
                </p>
            ) : (
                <form onSubmit={enviar} className="grid gap-6">
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
                        <InputError message={error ?? undefined} />
                    </div>

                    <Button
                        type="submit"
                        className="w-full"
                        disabled={procesando}
                    >
                        {procesando && <Spinner />}
                        Enviar link
                    </Button>
                </form>
            )}

            <div className="text-muted-foreground text-center text-sm">
                <Link
                    to="/login"
                    className="text-foreground underline decoration-neutral-300 underline-offset-4 hover:decoration-current dark:decoration-neutral-500"
                >
                    Volver a iniciar sesión
                </Link>
            </div>
        </AuthLayout>
    );
}
