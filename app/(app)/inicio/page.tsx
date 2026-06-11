export const dynamic = 'force-dynamic'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import InicioClient from '@/components/inicio/InicioClient'

export default async function Page() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: perfil } = await supabase.from('perfiles').select('nombre,rol').eq('id', user.id).maybeSingle()
  return <InicioClient nombre={perfil?.nombre??''} rol={perfil?.rol??'ventas'} userId={user.id} />
}
