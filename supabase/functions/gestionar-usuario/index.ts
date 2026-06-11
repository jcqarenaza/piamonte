import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const { accion, id, email, password, nombre, rol } = await req.json()

  try {
    if (accion === 'crear') {
      const { data, error } = await supabase.auth.admin.createUser({
        email, password, email_confirm: true,
        user_metadata: { nombre, rol }
      })
      if (error) throw error
      await supabase.from('perfiles').upsert({ id: data.user.id, nombre, rol })
      return new Response(JSON.stringify({ ok: true, id: data.user.id }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    if (accion === 'editar') {
      if (password) await supabase.auth.admin.updateUserById(id, { password })
      await supabase.from('perfiles').update({ nombre, rol }).eq('id', id)
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    if (accion === 'eliminar') {
      await supabase.auth.admin.deleteUser(id)
      await supabase.from('perfiles').delete().eq('id', id)
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    throw new Error('Acción no válida')
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
