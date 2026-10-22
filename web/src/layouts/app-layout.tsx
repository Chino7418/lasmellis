import { Navigate, Outlet, useLocation } from 'react-router';
import { AppContent } from '@/components/app-content';
import { AppSidebar } from '@/components/app-sidebar';
import { AppSidebarHeader } from '@/components/app-sidebar-header';
import { SidebarProvider } from '@/components/ui/sidebar';
import { useAuth } from '@/lib/auth';
import type { BreadcrumbItem } from '@/types';

const TITULOS: Record<string, string> = {
    '/dashboard': 'Dashboard',
    '/productos': 'Productos',
    '/ventas': 'Ventas',
    '/clientes': 'Clientes',
    '/configuracion': 'Configuración',
};

function sidebarAbierta(): boolean {
    // El componente Sidebar guarda su estado en esta cookie.
    return !document.cookie.includes('sidebar_state=false');
}

/**
 * Layout de las páginas privadas: exige sesión iniciada y muestra la
 * barra lateral. Reemplaza al middleware "auth" de Laravel.
 */
export default function AppLayout() {
    const { session, cargando } = useAuth();
    const { pathname } = useLocation();

    if (cargando) {
        return null;
    }

    if (!session) {
        return <Navigate to="/login" replace state={{ desde: pathname }} />;
    }

    const breadcrumbs: BreadcrumbItem[] = TITULOS[pathname]
        ? [{ title: TITULOS[pathname], href: pathname }]
        : [];

    return (
        <SidebarProvider defaultOpen={sidebarAbierta()}>
            <AppSidebar />
            <AppContent variant="sidebar" className="overflow-x-hidden">
                <AppSidebarHeader breadcrumbs={breadcrumbs} />
                <Outlet />
            </AppContent>
        </SidebarProvider>
    );
}
