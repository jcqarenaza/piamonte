import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://hjzhatercccblhgaukgx.supabase.co'
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhqemhhdGVyY2NjYmxoZ2F1a2d4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3NDQwMjMsImV4cCI6MjA5NjMyMDAyM30.XYoxEnhkvxIB0pAPAT6H3-mn70uxLzwNYqJQIjoKc3o'

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON, {
    cookies: {
      getAll() { return request.cookies.getAll() },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        supabaseResponse = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        )
      },
    },
  })

  const pathname = request.nextUrl.pathname
  let user = null

  try {
    const { data } = await supabase.auth.getUser()
    user = data.user
  } catch (err) {
    // El refresh token quedó inválido o vencido (ej: "Invalid Refresh Token: Refresh
    // Token Not Found"). Se trata como sesión cerrada: se limpian las cookies de auth
    // y se redirige a /login, en vez de dejar que el error rompa el middleware.
    const response = pathname.startsWith('/login')
      ? supabaseResponse
      : NextResponse.redirect(new URL('/login', request.url))
    request.cookies.getAll().forEach(({ name }) => {
      if (name.startsWith('sb-')) response.cookies.delete(name)
    })
    return response
  }

  if (pathname.startsWith('/login')) {
    if (user) return NextResponse.redirect(new URL('/inicio', request.url))
    return supabaseResponse
  }
  if (pathname === '/') {
    return NextResponse.redirect(new URL(user ? '/inicio' : '/login', request.url))
  }
  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }
  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
