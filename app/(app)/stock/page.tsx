export const dynamic = 'force-dynamic'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import StockClient from '@/components/stock/StockClient'

export default async function Page() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: p } = await supabase.from('perfiles').select('rol').eq('id', user.id).single()
  return (
    <div>
      <h1 className="font-saira font-bold text-2xl text-p-ink mb-1">Mi Stock</h1>
      <p className="text-p-ink2 text-sm mb-5">Inventario propio con resumen por tipo, valor a costo y gestión de depósitos.</p>
      <StockClient isAdmin={p?.rol !== 'ventas'} />
    </div>
  )
}
