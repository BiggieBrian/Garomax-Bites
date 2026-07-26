import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

if (!isSupabaseConfigured) {
  console.warn(
    '[Garomax] Supabase env vars missing — running in local-only mode. ' +
      'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env to enable cross-device sync.'
  );
}

// When not configured, we still create a client pointed at placeholder values so imports
// don't crash; isSupabaseConfigured gates every actual call site in sync.ts.
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key'
);