import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Nav from '@/components/nav/Nav'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Obtener perfil y rol
  const { data: perfil } = await supabase
    .from('perfiles')
    .select('rol, nombre')
    .eq('id', user.id)
    .single()

  return (
    <div className="min-h-screen">
      <Nav rol={perfil?.rol} />

      {/* Contenido: margen izquierdo en desktop para el sidebar */}
      <main className="lg:ml-56 pt-[88px] lg:pt-0 pb-20 lg:pb-0 px-4 lg:px-8 py-6">
        {children}
      </main>
    </div>
  )
}
