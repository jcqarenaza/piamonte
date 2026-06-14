export const dynamic = 'force-dynamic'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { NoAcceso } from '@/components/ui'
import ContabilidadClient from '@/components/contabilidad/ContabilidadClient'
export default async function Page() {
  const supabase = await createClient()
  const { data:{ user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: p } = await supabase.from('perfiles').select('rol').eq('id', user.id).maybeSingle()
  if (p?.rol === 'ventas') return <NoAcceso modulo="Contabilidad" />
  return (
    <div>
      <h1 className="font-saira font-bold text-2xl text-p-ink mb-1">Contabilidad</h1>
      <p className="text-p-ink2 text-sm mb-5">Libro IVA Ventas y Compras + balance mensual para el contador.</p>
      <ContabilidadClient />
    </div>
  )
}
