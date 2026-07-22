export const dynamic = 'force-dynamic'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PresupuestosClient from '@/components/presupuestos/PresupuestosClient'

export default async function Page() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  return (
    <div>
      <h1 className="font-saira font-bold text-2xl text-p-ink mb-1">Presupuestos</h1>
      <p className="text-p-ink2 text-sm mb-5">Armá presupuestos con IVA, cotización dólar y enviá por WhatsApp o imprimí.</p>
      <PresupuestosClient userId={user.id} />
    </div>
  )
}
