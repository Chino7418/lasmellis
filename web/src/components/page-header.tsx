import type { ReactNode } from 'react';

export function PageHeader({
    title,
    description,
    actions,
}: {
    title: string;
    description?: string;
    actions?: ReactNode;
}) {
    return (
        <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="space-y-1">
                <h1 className="font-serif text-3xl font-medium tracking-tight">
                    {title}
                </h1>
                {description && (
                    <p className="text-muted-foreground text-sm">
                        {description}
                    </p>
                )}
            </div>

            {actions && (
                <div className="flex items-center gap-2">{actions}</div>
            )}
        </div>
    );
}

/** Contenedor estándar de las páginas privadas. */
export function Page({ children }: { children: ReactNode }) {
    return (
        <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 p-4 md:p-6 lg:p-8">
            {children}
        </div>
    );
}
