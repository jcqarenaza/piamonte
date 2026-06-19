export const dynamic = 'force-dynamic'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ProveedoresClient from '@/components/proveedores-compra/ProveedoresClient'

export default async function ProveedoresCompraPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: perfil } = await supabase
    .from('perfiles')
    .select('rol')
    .eq('id', user.id)
    .maybeSingle()

  const rol = perfil?.rol ?? 'ventas'

  // Ventas no tiene acceso a proveedores de compra
  if (rol === 'ventas') redirect('/inicio')

  return (
    <div>
      <h1 className="font-saira font-bold text-2xl text-p-ink mb-1">Proveedores</h1>
      <p className="text-p-ink2 text-sm mb-5">Gestioná tus proveedores de compra: datos fiscales, contacto e historial.</p>
      <ProveedoresClient />
    </div>
  )
}
