import { useEffect, useState } from 'react';
import {
  isSupabaseConfigured,
  supabase,
  type AuthSessionState,
} from './supabaseClient';

const INITIAL_AUTH_STATE: AuthSessionState = {
  session: null,
  status: isSupabaseConfigured ? 'loading' : 'configured-out',
  user: null,
};

export function useAuthSession() {
  const [authState, setAuthState] =
    useState<AuthSessionState>(INITIAL_AUTH_STATE);

  useEffect(() => {
    if (!supabase) {
      setAuthState({
        session: null,
        status: 'configured-out',
        user: null,
      });
      return;
    }

    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) {
        return;
      }

      setAuthState({
        session: data.session,
        status: data.session ? 'signed-in' : 'signed-out',
        user: data.session?.user ?? null,
      });
    });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthState({
        session,
        status: session ? 'signed-in' : 'signed-out',
        user: session?.user ?? null,
      });
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  async function signOut() {
    if (!supabase) {
      return;
    }

    await supabase.auth.signOut();
  }

  return {
    ...authState,
    isConfigured: isSupabaseConfigured,
    signOut,
    supabase,
  };
}
