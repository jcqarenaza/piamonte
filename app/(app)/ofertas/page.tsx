export const dynamic = 'force-dynamic'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import OfertasClient from '@/components/ofertas/OfertasClient'

export default async function Page() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  return (
    <div>
      <h1 className="font-saira font-bold text-2xl text-p-ink mb-1">Ofertas</h1>
      <p className="text-p-ink2 text-sm mb-5">Piezas en promoción importadas del catálogo de proveedores.</p>
      <OfertasClient />
    </div>
  )
}
