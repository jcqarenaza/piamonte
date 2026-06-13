export const dynamic = 'force-dynamic'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import StockClient from '@/components/stock/StockClient'
import StockAvanzadoClient from '@/components/stock-avanzado/StockAvanzadoClient'

export default async function Page({ searchParams }: { searchParams: { tab?: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: p } = await supabase.from('perfiles').select('rol').eq('id', user.id).single()
  const rol = p?.rol || 'ventas'
  const tab = searchParams?.tab || 'inventario'

  return (
    <div>
      <h1 className="font-saira font-bold text-2xl text-p-ink mb-1">Stock</h1>
      <p className="text-p-ink2 text-sm mb-4">Inventario, movimientos y valorización.</p>

      {/* Tabs de navegación */}
      <div className="flex border-b border-p-line mb-5">
        <a href="/stock?tab=inventario"
          className="px-5 py-2.5 font-bold text-sm transition-colors"
          style={{borderBottom: tab==='inventario'?'3px solid #00A550':'3px solid transparent', color: tab==='inventario'?'#00A550':'#6b7280'}}>
          📦 Inventario
        </a>
        <a href="/stock?tab=movimientos"
          className="px-5 py-2.5 font-bold text-sm transition-colors"
          style={{borderBottom: tab==='movimientos'?'3px solid #00A550':'3px solid transparent', color: tab==='movimientos'?'#00A550':'#6b7280'}}>
          📊 Movimientos
        </a>
      </div>

      {tab === 'inventario' && <StockClient isAdmin={rol !== 'ventas'} />}
      {tab === 'movimientos' && <StockAvanzadoClient rol={rol} />}
    </div>
  )
}
