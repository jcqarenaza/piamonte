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
    <div style={{ minHeight: '100vh' }}>
      <Nav rol={perfil?.rol} />
      {/* Contenido — margen izquierdo en desktop para el sidebar */}
      <div id="main-content" style={{ marginLeft: 0 }}>
        <script dangerouslySetInnerHTML={{__html: `
          (function(){
            function applyMargin(){
              var el = document.getElementById('main-content');
              if(el) el.style.marginLeft = window.innerWidth >= 1024 ? '220px' : '0';
            }
            applyMargin();
            window.addEventListener('resize', applyMargin);
          })();
        `}} />
        <DolarBar />
        <main style={{ paddingTop: 0, paddingBottom: 80 }} className="px-4 lg:px-8 py-6">
          {children}
        </main>
      </div>
    </div>
  )
}
