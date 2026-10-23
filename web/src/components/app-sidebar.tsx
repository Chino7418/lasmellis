import {
    ArrowLeftRight,
    BookUser,
    Boxes,
    House,
    Package,
    ShoppingCart,
    Users,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router';
import AppLogo from '@/components/app-logo';
import { NavMain } from '@/components/nav-main';
import { NavUser } from '@/components/nav-user';
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
} from '@/components/ui/sidebar';
import { contarSinStock } from '@/lib/api';
import type { NavItem } from '@/types';

export function AppSidebar() {
    const { pathname } = useLocation();
    const [sinStock, setSinStock] = useState(0);

    // Se actualiza al cambiar de página (por ejemplo, después de vender
    // o de cargar stock).
    useEffect(() => {
        void contarSinStock().then(setSinStock);
    }, [pathname]);

    const mainNavItems: NavItem[] = [
        {
            title: 'Inicio',
            href: '/inicio',
            icon: House,
        },
        {
            title: 'Productos',
            href: '/productos',
            icon: Package,
            badge: sinStock,
            badgeLabel: `${sinStock} sin stock`,
        },
        {
            title: 'Ventas',
            href: '/ventas',
            icon: ShoppingCart,
        },
        {
            title: 'Clientes',
            href: '/clientes',
            icon: Users,
        },
        {
            title: 'Cuentas corrientes',
            href: '/cuentas-corrientes',
            icon: BookUser,
        },
        {
            title: 'Ingresos y egresos',
            href: '/ingresos-egresos',
            icon: ArrowLeftRight,
        },
        {
            title: 'Stock y costos',
            href: '/stock-costos',
            icon: Boxes,
        },
    ];

    return (
        <Sidebar collapsible="icon" variant="inset">
            <SidebarHeader>
                <SidebarMenu>
                    <SidebarMenuItem>
                        <SidebarMenuButton size="lg" asChild>
                            <Link to="/inicio">
                                <AppLogo />
                            </Link>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarHeader>

            <SidebarContent>
                <NavMain items={mainNavItems} />
            </SidebarContent>

            <SidebarFooter>
                <NavUser />
            </SidebarFooter>
        </Sidebar>
    );
}
