// Links publicos (sin login) a PDFs privados de Storage. Devuelve un redirect a un link firmado de 5 min.
//   ?c=<codigo>  -> comprobante enviado por WhatsApp (tabla pdf_links, bucket comprobantes-pdf)
//   ?p=<ref>     -> presupuesto por numero (P-0042 / 42) o por UUID (bucket presupuestos), solo si no vencio
import { createClient } from 'jsr:@supabase/supabase-js@2'

const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))

function pagina(msg, status) {
  // Supabase muestra el HTML como texto plano, por eso se responde texto simple
  return new Response(msg + '\n\nParabrisas El Piamonte', { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}

function ir(url) {
  return new Response(null, { status: 302, headers: { Location: url, 'Cache-Control': 'no-store' } })
}

Deno.serve(async (req) => {
  const q = new URL(req.url).searchParams

  // ---- Presupuesto
  const ref = q.get('p')
  if (ref) {
    if (!/^[A-Za-z0-9-]{1,40}$/.test(ref)) return pagina('Link inválido', 400)
    const esNumero = /^P?-?\d+$/i.test(ref)
    let consulta = supabase.from('presupuestos').select('id, vencimiento')
    consulta = esNumero ? consulta.eq('numero', parseInt(ref.replace(/[^0-9]/g, ''), 10)) : consulta.eq('id', ref)
    const { data: p } = await consulta.maybeSingle()
    if (!p) return pagina('Presupuesto no encontrado', 404)
    if (p.vencimiento && new Date(p.vencimiento + 'T23:59:59') < new Date()) {
      return pagina('Este presupuesto ha vencido. Contactá a El Piamonte para obtener uno nuevo.', 410)
    }
    const { data: sig } = await supabase.storage.from('presupuestos').createSignedUrl('presupuesto-' + p.id + '.pdf', 300)
    if (!sig) return pagina('El archivo no está disponible. Contactá a El Piamonte.', 404)
    return ir(sig.signedUrl)
  }

  // ---- Comprobante
  const code = q.get('c') || ''
  if (!/^[A-Za-z0-9-]{6,50}$/.test(code)) return pagina('Link inválido', 400)
  const { data } = await supabase.from('pdf_links').select('path,nombre,expira_at').eq('code', code).maybeSingle()
  if (!data) return pagina('Link inválido', 404)
  if (new Date(data.expira_at) < new Date()) return pagina('Este link venció. Pedí que te reenvíen el comprobante.', 410)
  const { data: sig, error } = await supabase.storage.from('comprobantes-pdf').createSignedUrl(data.path, 300, { download: data.nombre || true })
  if (error || !sig) return pagina('No se pudo abrir el comprobante', 500)
  return ir(sig.signedUrl)
})
