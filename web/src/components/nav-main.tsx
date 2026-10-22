import { Link, useLocation } from 'react-router';
import {
    SidebarGroup,
    SidebarGroupLabel,
    SidebarMenu,
    SidebarMenuBadge,
    SidebarMenuButton,
    SidebarMenuItem,
} from '@/components/ui/sidebar';
import type { NavItem } from '@/types';

export function NavMain({ items = [] }: { items: NavItem[] }) {
    const { pathname } = useLocation();

    return (
        <SidebarGroup className="px-2 py-0">
            <SidebarGroupLabel>Menú</SidebarGroupLabel>
            <SidebarMenu>
                {items.map((item) => {
                    const aviso = item.badge ? item.badgeLabel : undefined;

                    return (
                        <SidebarMenuItem key={item.title}>
                            <SidebarMenuButton
                                asChild
                                isActive={pathname === item.href}
                                tooltip={{
                                    children: aviso
                                        ? `${item.title} · ${aviso}`
                                        : item.title,
                                }}
                            >
                                <Link to={item.href}>
                                    {item.icon && <item.icon />}
                                    <span>{item.title}</span>
                                    {aviso && (
                                        <span className="sr-only">
                                            ({aviso})
                                        </span>
                                    )}
                                </Link>
                            </SidebarMenuButton>

                            {item.badge ? (
                                <>
                                    {/* Menú abierto: número */}
                                    <SidebarMenuBadge className="bg-destructive rounded-full text-white peer-hover/menu-button:text-white peer-data-[active=true]/menu-button:text-white">
                                        {item.badge}
                                    </SidebarMenuBadge>
                                    {/* Menú retraído: puntito sobre el ícono */}
                                    <span
                                        aria-hidden="true"
                                        className="bg-destructive ring-sidebar pointer-events-none absolute right-1 top-1 hidden size-2 rounded-full ring-2 group-data-[collapsible=icon]:block"
                                    />
                                </>
                            ) : null}
                        </SidebarMenuItem>
                    );
                })}
            </SidebarMenu>
        </SidebarGroup>
    );
}
