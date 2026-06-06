export const dynamic = 'force-dynamic'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import CajaClient from '@/components/caja/CajaClient'

export default async function CajaPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: perfil } = await supabase.from('perfiles').select('rol').eq('id', user.id).single()
  return (
    <div>
      <h1 className="font-saira font-bold text-2xl text-p-ink mb-1">Caja del día</h1>
      <p className="text-p-ink2 text-sm mb-5">Registrá las ventas del día, ganancia en tiempo real y descuento automático de stock.</p>
      <CajaClient userId={user.id} perfil={perfil ?? { rol: 'ventas' }} />
    </div>
  )
}
