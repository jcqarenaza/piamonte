export const dynamic = 'force-dynamic'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ProveedoresClient from '@/components/proveedores/ProveedoresClient'

export default async function Page() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: p } = await supabase.from('perfiles').select('rol').eq('id', user.id).single()
  if (p?.rol === 'ventas') redirect('/inicio')
  const { data: { session } } = await supabase.auth.getSession()
  return (
    <div>
      <h1 className="font-saira font-bold text-2xl text-p-ink mb-1">Proveedores</h1>
      <p className="text-p-ink2 text-sm mb-5">Reglas de costo e importador de listas. Subí el Excel o PDF y el catálogo se actualiza solo.</p>
      <ProveedoresClient token={session?.access_token ?? ''} />
    </div>
  )
}
