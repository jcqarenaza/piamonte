'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

// Evitar prerendering estático (necesita variables de entorno en runtime)
export const dynamic = 'force-dynamic'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const supabase = createClient()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError('Email o contraseña incorrectos')
      setLoading(false)
    } else {
      router.push('/inicio')
      router.refresh()
    }
  }

  return (
    <div className="w-full max-w-sm">
      <div className="flex flex-col items-center mb-8">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="Parabrisas El Piamonte" className="h-24 w-auto mb-4" />
        <p className="font-mono text-xs tracking-widest uppercase text-p-ink2">
          Gestión de Comercio
        </p>
      </div>

      <div className="bg-white rounded-2xl shadow-md border border-p-line p-8">
        <h1 className="font-saira font-bold text-2xl text-p-ink mb-6 text-center">
          Iniciar sesión
        </h1>
        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          <div>
            <label className="block text-xs font-semibold text-p-ink2 uppercase tracking-wider mb-1">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
              placeholder="usuario@elpiamonte.com"
              className="w-full border border-p-line rounded-lg px-3 py-2.5 text-sm text-p-ink focus:outline-none focus:border-p-green focus:ring-1 focus:ring-p-green" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-p-ink2 uppercase tracking-wider mb-1">Contraseña</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
              className="w-full border border-p-line rounded-lg px-3 py-2.5 text-sm text-p-ink focus:outline-none focus:border-p-green focus:ring-1 focus:ring-p-green" />
          </div>
          {error && <p className="text-sm text-red-600 text-center">{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full bg-p-green hover:bg-p-dark text-white font-saira font-bold text-base py-3 rounded-lg transition-colors disabled:opacity-60">
            {loading ? 'Ingresando…' : 'Ingresar'}
          </button>
        </form>
      </div>
      <p className="text-center text-xs text-p-gray mt-6">Parabrisas El Piamonte · Sistema interno</p>
    </div>
  )
}
