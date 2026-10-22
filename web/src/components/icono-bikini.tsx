import type { SVGProps } from 'react';
import { cn } from '@/lib/utils';

/**
 * Bikini de dos piezas dibujada con el mismo estilo que los íconos de
 * Lucide (24×24, trazo 2, puntas redondeadas), que no trae uno propio.
 */
export function IconoBikini({ className, ...props }: SVGProps<SVGSVGElement>) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={cn('size-6', className)}
            aria-hidden="true"
            {...props}
        >
            {/* Corpiño: tiritas, dos copas triangulares y la espalda */}
            <path d="M7.5 1.5 8.5 4" />
            <path d="M16.5 1.5 15.5 4" />
            <path d="M3.5 9 8.5 4l3 5Z" />
            <path d="M12.5 9l3-5 5 5Z" />
            <path d="M11.5 9h1" />
            <path d="M3.5 9 2 9.5" />
            <path d="M20.5 9 22 9.5" />
            {/* Bombacha con lazos a los costados */}
            <path d="M4 14h16c-1.6 2.8-3.2 5-4.5 7h-7c-1.3-2-2.9-4.2-4.5-7Z" />
            <path d="M4 14 2.8 15.8" />
            <path d="M20 14l1.2 1.8" />
        </svg>
    );
}
