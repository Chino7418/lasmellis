import { useEffect } from 'react';

/** Reemplaza al <Head title="..."> de Inertia. */
export function useTitulo(titulo?: string) {
    useEffect(() => {
        document.title = titulo ? `${titulo} - Las Mellis` : 'Las Mellis';
    }, [titulo]);
}
