export const dynamic = 'force-dynamic'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Nav from '@/components/nav/Nav'
import { DolarBar } from '@/components/dolar/DolarBar'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: perfil } = await supabase.from('perfiles').select('rol,nombre').eq('id', user.id).single()
  return (
    <div className="min-h-screen">
      <Nav rol={perfil?.rol} />
      <div className="lg:ml-56">
        <DolarBar />
        <main className="pt-[100px] lg:pt-0 pb-24 lg:pb-0 px-4 lg:px-8 py-6">
          {children}
        </main>
      </div>
    </div>
  )
}
