// Redirige un codigo corto (?c=xxxx) a un link firmado (5 min) del PDF en Storage.
// Se usa desde el boton WhatsApp de Comprobantes para que el link del mensaje sea corto.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))

function pagina(msg, status) {
  // Supabase muestra el HTML como texto plano, por eso se responde texto simple
  return new Response(msg + '\n\nParabrisas El Piamonte', { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}

Deno.serve(async (req) => {
  const code = new URL(req.url).searchParams.get('c') || ''
  if (!/^[a-z0-9]{6,20}$/.test(code)) return pagina('Link inválido', 400)
  const { data } = await supabase.from('pdf_links').select('path,nombre,expira_at').eq('code', code).maybeSingle()
  if (!data) return pagina('Link inválido', 404)
  if (new Date(data.expira_at) < new Date()) return pagina('Este link venció. Pedí que te reenvíen el comprobante.', 410)
  const { data: sig, error } = await supabase.storage.from('comprobantes-pdf').createSignedUrl(data.path, 300, { download: data.nombre || true })
  if (error || !sig) return pagina('No se pudo abrir el comprobante', 500)
  return new Response(null, { status: 302, headers: { Location: sig.signedUrl, 'Cache-Control': 'no-store' } })
})
