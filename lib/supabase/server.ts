import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://hjzhatercccblhgaukgx.supabase.co'
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhqemhhdGVyY2NjYmxoZ2F1a2d4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3NDQwMjMsImV4cCI6MjA5NjMyMDAyM30.XYoxEnhkvxIB0pAPAT6H3-mn70uxLzwNYqJQIjoKc3o'

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(SUPABASE_URL, SUPABASE_ANON, {
    cookies: {
      getAll() { return cookieStore.getAll() },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        } catch { /* server component */ }
      },
    },
  })
}
