import { createClient, type Session, type User } from '@supabase/supabase-js';

const DEFAULT_SUPABASE_URL = 'https://zfqlevubgoedfzzgedok.supabase.co';
const DEFAULT_SUPABASE_PUBLISHABLE_KEY =
  'sb_publishable_C84VQoIRT-X_rEE9wpMPAg_Gw2AmmhB';

export type AuthSessionStatus = 'configured-out' | 'loading' | 'signed-in' | 'signed-out';

export interface AuthSessionState {
  session: Session | null;
  status: AuthSessionStatus;
  user: User | null;
}

function getOptionalEnvValue(value: string | undefined) {
  return value?.trim() || undefined;
}

export const SUPABASE_URL =
  getOptionalEnvValue(import.meta.env.VITE_SUPABASE_URL) ??
  DEFAULT_SUPABASE_URL;
export const SUPABASE_PUBLISHABLE_KEY =
  getOptionalEnvValue(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY) ??
  DEFAULT_SUPABASE_PUBLISHABLE_KEY;

export const isSupabaseConfigured = Boolean(
  SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY,
);

export const supabase = isSupabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true,
      },
    })
  : null;
