import type { ReactNode } from 'react';
import InputError from '@/components/input-error';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

/** Etiqueta + control + mensaje de error, para los formularios. */
export function Campo({
    id,
    label,
    error,
    opcional = false,
    className,
    children,
}: {
    id?: string;
    label: string;
    error?: string[];
    opcional?: boolean;
    className?: string;
    children: ReactNode;
}) {
    return (
        <div className={cn('grid gap-2', className)}>
            <Label htmlFor={id}>
                {label}
                {opcional && (
                    <span className="text-muted-foreground font-normal">
                        (opcional)
                    </span>
                )}
            </Label>
            {children}
            <InputError message={error?.[0]} />
        </div>
    );
}
