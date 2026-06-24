export const dynamic = 'force-dynamic'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AseguradorasClient from '@/components/aseguradoras/AseguradorasClient'

export default async function AseguradorasPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: perfil } = await supabase
    .from('perfiles')
    .select('rol')
    .eq('id', user.id)
    .maybeSingle()

  const rol = perfil?.rol ?? 'ventas'

  // Ventas no administra aseguradoras, solo las usa al facturar
  if (rol === 'ventas') redirect('/inicio')

  return (
    <div>
      <h1 className="font-saira font-bold text-2xl text-p-ink mb-1">Aseguradoras</h1>
      <p className="text-p-ink2 text-sm mb-5">Datos fiscales, plazo de pago y facturas pendientes por aseguradora.</p>
      <AseguradorasClient />
    </div>
  )
}
