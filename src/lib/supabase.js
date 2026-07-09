import { createClient } from '@supabase/supabase-js'

const fallbackSupabaseUrl = 'https://jpvjqmkvtnedpmmrddft.supabase.co'
const fallbackSupabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpwdmpxbWt2dG5lZHBtbXJkZGZ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0MjI2MDUsImV4cCI6MjA5NDk5ODYwNX0.mxY4EOG3MSzUPxlNPXlCBEJryjJF0yYiAFGLgAtCumA'

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || fallbackSupabaseUrl
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || fallbackSupabaseAnonKey

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY environment variables')
}

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey
)
