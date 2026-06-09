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
    <div style={{ minHeight:'100vh', background:'#F5F0E8' }}>
      <Nav rol={perfil?.rol} />
      <div id="main-content">
        <script dangerouslySetInnerHTML={{__html:`(function(){function m(){var e=document.getElementById('main-content');if(e)e.style.marginLeft=window.innerWidth>=1024?'210px':'0'}m();window.addEventListener('resize',m)})()`}}/>
        <DolarBar />
        <main className="px-4 lg:px-8 py-6" style={{ paddingBottom:80 }}>
          {children}
        </main>
      </div>
    </div>
  )
}
