import { useEffect, useRef } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { AppContent } from '@/components/app-content';
import { AppSidebar } from '@/components/app-sidebar';
import { AppSidebarHeader } from '@/components/app-sidebar-header';
import { PantallaCarga } from '@/components/pantalla-carga';
import { SidebarProvider, useSidebar } from '@/components/ui/sidebar';
import { useAuth } from '@/lib/auth';
import type { BreadcrumbItem } from '@/types';

const TITULOS: Record<string, string> = {
    '/inicio': 'Inicio',
    '/productos': 'Productos',
    '/ventas': 'Ventas',
    '/clientes': 'Clientes',
    '/cuentas-corrientes': 'Cuentas corrientes',
    '/ingresos-egresos': 'Ingresos y egresos',
    '/stock-costos': 'Stock y costos',
    '/configuracion': 'Configuración',
};

/**
 * Retrae el menú cada vez que se cambia de página: en el celular lo
 * oculta y en la compu lo deja como franja de íconos. Se vuelve a
 * desplegar con el botón de hamburguesa.
 */
function RetraerMenuAlNavegar() {
    const { pathname } = useLocation();
    const sidebar = useSidebar();

    // setOpen cambia de identidad cada vez que el menú se abre o cierra;
    // se guarda en un ref para que el efecto dependa solo de la página
    // (si no, abrir el menú lo volvería a cerrar al instante).
    const sidebarRef = useRef(sidebar);

    useEffect(() => {
        sidebarRef.current = sidebar;
    });

    useEffect(() => {
        sidebarRef.current.setOpenMobile(false);
        sidebarRef.current.setOpen(false);
    }, [pathname]);

    return null;
}

/**
 * Layout de las páginas privadas: exige sesión iniciada y muestra la
 * barra lateral. Reemplaza al middleware "auth" de Laravel.
 */
export default function AppLayout() {
    const { session, cargando } = useAuth();
    const { pathname } = useLocation();

    if (cargando) {
        return <PantallaCarga />;
    }

    if (!session) {
        return <Navigate to="/login" replace state={{ desde: pathname }} />;
    }

    const breadcrumbs: BreadcrumbItem[] = TITULOS[pathname]
        ? [{ title: TITULOS[pathname], href: pathname }]
        : [];

    return (
        <SidebarProvider defaultOpen={false}>
            <RetraerMenuAlNavegar />
            <AppSidebar />
            <AppContent variant="sidebar" className="overflow-x-hidden">
                <AppSidebarHeader breadcrumbs={breadcrumbs} />
                <Outlet />
            </AppContent>
        </SidebarProvider>
    );
}
