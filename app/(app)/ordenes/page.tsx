export const dynamic = 'force-dynamic'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import OrdenesClient from '@/components/ordenes/OrdenesClient'

export default async function Page() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: p } = await supabase.from('perfiles').select('rol').eq('id', user.id).maybeSingle()
  return (
    <div>
      <h1 className="font-saira font-bold text-2xl text-p-ink mb-1">Órdenes de Servicio</h1>
      <p className="text-p-ink2 text-sm mb-5">Generá órdenes para aseguradoras con numeración correlativa (OS-0001…) e imprimí con firma.</p>
      <OrdenesClient userId={user.id} rol={p?.rol} />
    </div>
  )
}
