export const dynamic = 'force-dynamic'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Nav from '@/components/nav/Nav'
import { DolarBar } from '@/components/dolar/DolarBar'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: perfil } = await supabase.from('perfiles').select('rol,nombre').eq('id', user.id).maybeSingle()
  return (
    <div style={{ minHeight:'100vh', background:'#F9FAFB' }}>
      <style>{`@media (min-width: 1024px) { #mc { margin-left: 210px; } }`}</style>
      <Nav rol={perfil?.rol} />
      <div id="mc">
        <DolarBar />
        <main className="px-4 lg:px-8 py-6" style={{ paddingBottom:80 }}>
          {children}
        </main>
      </div>
    </div>
  )
}
