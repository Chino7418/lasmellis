import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export type User = {
    id: string;
    name: string;
    email: string;
    avatar?: string;
};

export type BreadcrumbItem = {
    title: string;
    href: string;
};

export type NavItem = {
    title: string;
    href: string;
    icon?: LucideIcon | null;
};

export type AppVariant = 'header' | 'sidebar';

export type AuthLayoutProps = {
    children?: ReactNode;
    title?: string;
    description?: string;
};
