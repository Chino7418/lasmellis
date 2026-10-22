import { Link } from 'react-router';
import { Wordmark } from '@/components/app-logo';
import type { AuthLayoutProps } from '@/types';

export default function AuthLayout({
    children,
    title,
    description,
}: AuthLayoutProps) {
    return (
        <div className="bg-sidebar flex min-h-svh flex-col items-center justify-center p-6 md:p-10">
            <div className="w-full max-w-sm">
                <div className="flex flex-col items-center gap-6">
                    <Link to="/" aria-label="Las Mellis — inicio">
                        <Wordmark className="h-16" />
                    </Link>

                    <div className="bg-card w-full rounded-xl border p-6 shadow-sm sm:p-8">
                        <div className="mb-6 space-y-1.5 text-center">
                            <h1 className="font-serif text-2xl font-medium tracking-tight">
                                {title}
                            </h1>
                            <p className="text-muted-foreground text-sm">
                                {description}
                            </p>
                        </div>
                        <div className="flex flex-col gap-6">{children}</div>
                    </div>
                </div>
            </div>
        </div>
    );
}
