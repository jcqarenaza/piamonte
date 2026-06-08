export const dynamic = 'force-dynamic'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ClientesClient from '@/components/clientes/ClientesClient'

export default async function Page() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  return (
    <div>
      <h1 className="font-saira font-bold text-2xl text-p-ink mb-1">Clientes</h1>
      <p className="text-p-ink2 text-sm mb-5">Agenda de clientes con historial de turnos, presupuestos y órdenes de servicio.</p>
      <ClientesClient userId={user.id} />
    </div>
  )
}
