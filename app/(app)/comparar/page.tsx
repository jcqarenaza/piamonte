export const dynamic = 'force-dynamic'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import CompararClient from '@/components/comparar/CompararClient'

export default async function Page() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  return (
    <div>
      <h1 className="font-saira font-bold text-2xl text-p-ink mb-5">Comparar precios</h1>
      <CompararClient />
    </div>
  )
}
