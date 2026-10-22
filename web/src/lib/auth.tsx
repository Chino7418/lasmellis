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

    return {
        id: user.id,
        email,
        name: (user.user_metadata?.name as string | undefined) || email,
        avatar: user.user_metadata?.avatar_url as string | undefined,
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
