import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/** True, wenn beide Supabase-Env-Variablen gesetzt sind. */
export const supabaseKonfiguriert = Boolean(url && anonKey)

/**
 * Zentraler Supabase-Client. Zugriffsschutz passiert ausschliesslich über
 * Row Level Security in Postgres (siehe planung/techstack.md), nicht hier im Client.
 */
export const supabase = createClient(url ?? '', anonKey ?? '', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
