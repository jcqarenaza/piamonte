export const dynamic = 'force-dynamic'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PreciosClient from '@/components/precios/PreciosClient'

export default async function Page() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: perfil } = await supabase.from('perfiles').select('rol').eq('id', user.id).maybeSingle()
  return (
    <div>
      <h1 className="font-saira font-bold text-2xl text-p-ink mb-1">Precios</h1>
      <p className="text-p-ink2 text-sm mb-5">Calculá el precio de venta por tipo de cliente y convertilo en presupuesto con un click.</p>
      <PreciosClient rol={perfil?.rol ?? 'ventas'} />
    </div>
  )
}
