export const dynamic = 'force-dynamic'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import TurnosClient from '@/components/turnos/TurnosClient'
import { todayStr } from '@/lib/utils/format'

export default async function TurnosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const today = todayStr()
  const { data: turnos } = await supabase.from('turnos').select('*').eq('fecha', today).order('hora', { ascending: true, nullsFirst: true })
  return (
    <div>
      <h1 className="font-saira font-bold text-2xl text-p-ink mb-1">Turnos</h1>
      <p className="text-p-ink2 text-sm mb-5">Agenda de turnos. Navegá por día, agendá, confirmá y enviá recordatorio por WhatsApp.</p>
      <TurnosClient initialTurnos={turnos ?? []} userId={user.id} />
    </div>
  )
}
