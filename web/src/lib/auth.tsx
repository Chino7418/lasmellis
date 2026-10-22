import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import type { User } from '@/types';

type AuthContextValue = {
    session: Session | null;
    user: User | null;
    cargando: boolean;
};

const AuthContext = createContext<AuthContextValue>({
    session: null,
    user: null,
    cargando: true,
});

function usuarioDesdeSesion(session: Session | null): User | null {
    if (!session) {
        return null;
    }

    const { user } = session;
    const email = user.email ?? '';
    const datos = user.user_metadata ?? {};

    return {
        id: user.id,
        email,
        name: (datos.name as string | undefined) || email,
        avatar: datos.avatar_url as string | undefined,
        perfil: {
            telefono: datos.telefono,
            direccion: datos.direccion,
            fecha_nacimiento: datos.fecha_nacimiento,
            documento: datos.documento,
        },
    };
}

export function AuthProvider({ children }: { children: ReactNode }) {
    const [session, setSession] = useState<Session | null>(null);
    const [cargando, setCargando] = useState(true);

    useEffect(() => {
        supabase.auth.getSession().then(({ data }) => {
            setSession(data.session);
            setCargando(false);
        });

        const { data } = supabase.auth.onAuthStateChange((_evento, nueva) => {
            setSession(nueva);
        });

        return () => data.subscription.unsubscribe();
    }, []);

    return (
        <AuthContext.Provider
            value={{ session, user: usuarioDesdeSesion(session), cargando }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    return useContext(AuthContext);
}
