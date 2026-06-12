export const dynamic = 'force-dynamic'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { NoAcceso } from '@/components/ui'
import AuditoriaClient from '@/components/auditoria/AuditoriaClient'

export default async function Page() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: p } = await supabase.from('perfiles').select('rol').eq('id', user.id).maybeSingle()
  if (p?.rol !== 'gerencial') return <NoAcceso modulo="Auditoría" />
  return (
    <div>
      <h1 className="font-saira font-bold text-2xl text-p-ink mb-1">Auditoría</h1>
      <p className="text-p-ink2 text-sm mb-5">Registro inmutable de eliminaciones. Solo visible para gerencial.</p>
      <AuditoriaClient />
    </div>
  )
}
