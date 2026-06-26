export const dynamic = 'force-dynamic'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AdasClient from '@/components/adas/AdasClient'

export default async function AdasPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  return (
    <div>
      <div className="flex items-center gap-3 mb-1">
        <span className="text-2xl">🛡</span>
        <h1 className="font-saira font-bold text-2xl text-p-ink">Certificados</h1>
      </div>
      <p className="text-p-ink2 text-sm mb-5">
        Generá el certificado de calibración ADAS con numeración correlativa. 
        Se imprime automáticamente al guardarlo.
      </p>
      <AdasClient userId={user.id} />
    </div>
  )
}
