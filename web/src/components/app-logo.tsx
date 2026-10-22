import { cn } from '@/lib/utils';

/** Wordmark "Las Mellis". En modo oscuro se invierte a blanco. */
export function Wordmark({ className }: { className?: string }) {
    return (
        <img
            src="/images/logo-wordmark.png"
            alt="Las Mellis"
            className={cn('w-auto select-none dark:invert', className)}
            draggable={false}
        />
    );
}

/** Logo de la barra lateral: wordmark abierta, monograma colapsada. */
export default function AppLogo() {
    return (
        <>
            <Wordmark className="h-9 group-data-[collapsible=icon]:hidden" />
            <span className="bg-primary text-primary-foreground hidden size-8 items-center justify-center rounded-md font-serif text-xs font-medium group-data-[collapsible=icon]:flex">
                LM
            </span>
        </>
    );
}
