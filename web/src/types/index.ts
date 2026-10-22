import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/** Datos personales opcionales, guardados en user_metadata de Supabase. */
export type Perfil = {
    telefono?: string;
    direccion?: string;
    /** AAAA-MM-DD */
    fecha_nacimiento?: string;
    documento?: string;
};

export type User = {
    id: string;
    name: string;
    email: string;
    avatar?: string;
    perfil: Perfil;
};

export type BreadcrumbItem = {
    title: string;
    href: string;
};

export type NavItem = {
    title: string;
    href: string;
    icon?: LucideIcon | null;
    /** Número de aviso (ej. variantes sin stock). 0 o vacío = sin aviso. */
    badge?: number;
    /** Texto del aviso para el tooltip y lectores de pantalla. */
    badgeLabel?: string;
};

export type AppVariant = 'header' | 'sidebar';

export type AuthLayoutProps = {
    children?: ReactNode;
    title?: string;
    description?: string;
};
