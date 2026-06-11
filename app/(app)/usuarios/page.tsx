export const dynamic = 'force-dynamic'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { NoAcceso } from '@/components/ui'
import UsuariosClient from '@/components/usuarios/UsuariosClient'

export default async function Page() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: p } = await supabase.from('perfiles').select('rol').eq('id', user.id).maybeSingle()
  if (p?.rol !== 'gerencial') return <NoAcceso modulo="Usuarios" />
  return (
    <div>
      <h1 className="font-saira font-bold text-2xl text-p-ink mb-1">Usuarios</h1>
      <p className="text-p-ink2 text-sm mb-5">Gestioná los accesos al sistema.</p>
      <UsuariosClient />
    </div>
  )
}
