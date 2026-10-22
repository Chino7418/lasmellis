import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { initializeTheme } from '@/hooks/use-appearance';
import AppLayout from '@/layouts/app-layout';
import { AuthProvider } from '@/lib/auth';
import Login from '@/pages/auth/login';
import OlvideMiClave from '@/pages/auth/olvide-mi-clave';
import RestablecerClave from '@/pages/auth/restablecer-clave';
import Clientes from '@/pages/clientes';
import Configuracion from '@/pages/configuracion';
import CuentasCorrientes from '@/pages/cuentas-corrientes';
import Dashboard from '@/pages/dashboard';
import Productos from '@/pages/productos';
import Ventas from '@/pages/ventas';
import Welcome from '@/pages/welcome';
import './app.css';

const router = createBrowserRouter([
    { path: '/', element: <Welcome /> },
    { path: '/login', element: <Login /> },
    { path: '/olvide-mi-clave', element: <OlvideMiClave /> },
    { path: '/restablecer-clave', element: <RestablecerClave /> },
    {
        // Páginas privadas: requieren sesión iniciada.
        element: <AppLayout />,
        children: [
            { path: '/dashboard', element: <Dashboard /> },
            { path: '/productos', element: <Productos /> },
            { path: '/ventas', element: <Ventas /> },
            { path: '/clientes', element: <Clientes /> },
            { path: '/cuentas-corrientes', element: <CuentasCorrientes /> },
            { path: '/configuracion', element: <Configuracion /> },
        ],
    },
    { path: '*', element: <Navigate to="/" replace /> },
]);

initializeTheme();

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <AuthProvider>
            <TooltipProvider delayDuration={0}>
                <RouterProvider router={router} />
                <Toaster />
            </TooltipProvider>
        </AuthProvider>
    </StrictMode>,
);
