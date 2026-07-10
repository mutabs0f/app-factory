import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';
import { supabase } from '@/lib/supabase';

type AuthState = {
  session: Session | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

// SessionProvider — the single source of auth state for the whole app. Wraps the
// root layout. Supabase owns the tokens/refresh; we just mirror the session into
// React state and expose signOut.
export function SessionProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (mounted) setSession(data.session);
      })
      .catch(() => {
        // A corrupted/unreadable stored session (e.g. Keychain error) must not
        // strand the app on the loading spinner — treat it as signed out.
        if (mounted) setSession(null);
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, isLoading, signOut }}>{children}</AuthContext.Provider>
  );
}

export function useSession(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useSession must be used within a SessionProvider');
  return ctx;
}
