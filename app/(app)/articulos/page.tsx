export const dynamic = 'force-dynamic'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { NoAcceso } from '@/components/ui'
import ArticulosClient from '@/components/articulos/ArticulosClient'

export default async function Page() {
  const supabase = await createClient()
  const { data:{ user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: p } = await supabase.from('perfiles').select('rol').eq('id', user.id).maybeSingle()
  if (p?.rol === 'ventas') return <NoAcceso modulo="Artículos" />
  return (
    <div>
      <h1 className="font-saira font-bold text-2xl text-p-ink mb-1">Artículos</h1>
      <p className="text-p-ink2 text-sm mb-5">
        Catálogo maestro de artículos con código interno, múltiples proveedores y SKUs. 
        El código interno es el que irá en la etiqueta de código de barras.
      </p>
      <ArticulosClient />
    </div>
  )
}
