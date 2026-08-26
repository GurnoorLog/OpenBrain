import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Single-tenant prototype: Supabase URL + anon/publishable key come from the
// environment. If either is missing the app runs without a backend (the
// studio still works, auth screens show a friendly "not configured" state).
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase: SupabaseClient | null =
  supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null
