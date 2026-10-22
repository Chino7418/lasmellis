import { AlertCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export function EstadoVacio({
    icon: Icon,
    title,
    description,
    action,
    className,
}: {
    icon: LucideIcon;
    title: string;
    description?: string;
    action?: ReactNode;
    className?: string;
}) {
    return (
        <div
            className={cn(
                'flex flex-col items-center justify-center px-6 py-12 text-center',
                className,
            )}
        >
            <div className="bg-accent text-accent-foreground flex size-12 items-center justify-center rounded-full">
                <Icon className="size-5" />
            </div>
            <h3 className="mt-4 text-sm font-semibold">{title}</h3>
            {description && (
                <p className="text-muted-foreground mt-1 max-w-sm text-sm">
                    {description}
                </p>
            )}
            {action && <div className="mt-5">{action}</div>}
        </div>
    );
}

export function EstadoError({ mensaje }: { mensaje: string }) {
    return (
        <div className="border-destructive/20 bg-destructive-soft text-destructive flex items-start gap-3 rounded-xl border p-4 text-sm">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <p>{mensaje}</p>
        </div>
    );
}

export function FilasCargando({ filas = 5 }: { filas?: number }) {
    return (
        <div className="divide-y">
            {Array.from({ length: filas }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 px-5 py-4">
                    <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-1/3" />
                        <Skeleton className="h-3 w-1/5" />
                    </div>
                    <Skeleton className="h-4 w-20" />
                </div>
            ))}
        </div>
    );
}
