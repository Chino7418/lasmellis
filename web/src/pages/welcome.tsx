import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router';
import { Wordmark } from '@/components/app-logo';
import { Button } from '@/components/ui/button';
import { useTitulo } from '@/hooks/use-titulo';
import { useAuth } from '@/lib/auth';

export default function Welcome() {
    useTitulo();

    const { session } = useAuth();

    return (
        <div className="bg-sidebar flex min-h-dvh flex-col">
            <main className="flex flex-1 items-center justify-center px-6 py-12">
                <div className="flex w-full max-w-md flex-col items-center text-center">
                    <Wordmark className="h-24 sm:h-28" />

                    <p className="text-muted-foreground mt-8 text-sm leading-relaxed sm:text-base">
                        Productos, ventas, clientes y cuenta corriente, todo en
                        un mismo lugar.
                    </p>

                    <Button asChild size="lg" className="mt-8">
                        <Link to={session ? '/dashboard' : '/login'}>
                            {session ? 'Ir al panel' : 'Iniciar sesión'}
                            <ArrowRight />
                        </Link>
                    </Button>
                </div>
            </main>

            <footer className="px-6 py-6 text-center">
                <p className="text-muted-foreground text-xs">
                    © {new Date().getFullYear()} Las Mellis
                </p>
            </footer>
        </div>
    );
}
