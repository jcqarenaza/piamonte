'use client'
import { createBrowserClient } from '@supabase/ssr'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://hjzhatercccblhgaukgx.supabase.co'
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhqemhhdGVyY2NjYmxoZ2F1a2d4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3NDQwMjMsImV4cCI6MjA5NjMyMDAyM30.XYoxEnhkvxIB0pAPAT6H3-mn70uxLzwNYqJQIjoKc3o'

export function createClient() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON)
}
