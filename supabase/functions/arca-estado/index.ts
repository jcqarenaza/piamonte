// Estado de ARCA (WSFE produccion) para el semaforo de Comprobantes.
// FEDummy es publico y no requiere credenciales.
const WSFE_URL = 'https://servicios1.afip.gov.ar/wsfev1/service.asmx'
const SOAP = '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="http://ar.gov.afip.dif.FEV1/"><soapenv:Header/><soapenv:Body><ar:FEDummy/></soapenv:Body></soapenv:Envelope>'
const HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info',
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
}

function pick(xml, name) {
  const m = xml.match(new RegExp('<' + name + '>([^<]*)</' + name + '>'))
  return m ? m[1] : null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: HEADERS })
  const t0 = Date.now()
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 8000)
  try {
    const r = await fetch(WSFE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml; charset=utf-8', 'SOAPAction': '"http://ar.gov.afip.dif.FEV1/FEDummy"' },
      body: SOAP,
      signal: ctrl.signal,
    })
    const xml = await r.text()
    const app = pick(xml, 'AppServer')
    const db = pick(xml, 'DbServer')
    const auth = pick(xml, 'AuthServer')
    const ok = r.ok && app === 'OK' && db === 'OK' && auth === 'OK'
    return new Response(JSON.stringify({ ok, app, db, auth, http: r.status, ms: Date.now() - t0, checked: new Date().toISOString() }), { headers: HEADERS })
  } catch (e) {
    const err = e && e.name === 'AbortError' ? 'timeout (ARCA no responde)' : String(e && e.message ? e.message : e)
    return new Response(JSON.stringify({ ok: false, error: err, ms: Date.now() - t0, checked: new Date().toISOString() }), { headers: HEADERS })
  } finally {
    clearTimeout(timer)
  }
})
