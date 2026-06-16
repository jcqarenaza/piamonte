export const dynamic = 'force-dynamic'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ComprobantesClient from '@/components/comprobantes/ComprobantesClient'

export default async function ComprobantesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: perfil } = await supabase.from('perfiles').select('rol').eq('id', user.id).maybeSingle()
  return (
    <div>
      <h1 className="font-saira font-bold text-2xl text-p-ink mb-1">Comprobantes</h1>
      <p className="text-p-ink2 text-sm mb-5">Emití comprobantes, gestioná pagos y enviá por WhatsApp.</p>
      <ComprobantesClient userId={user.id} rol={perfil?.rol ?? 'ventas'} />
    </div>
  )
}
