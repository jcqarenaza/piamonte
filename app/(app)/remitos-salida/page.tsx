export const dynamic = 'force-dynamic'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import RemitosSalidaClient from '@/components/remitos-salida/RemitosSalidaClient'

export default async function Page() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  return (
    <div>
      <RemitosSalidaClient userId={user.id} />
    </div>
  )
}
