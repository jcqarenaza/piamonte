import { NextResponse } from 'next/server'

// Estado de ARCA (WSFE producción) para el semáforo de Comprobantes.
// Usa FEDummy: método público del web service de facturación que NO requiere credenciales
// y devuelve el estado de AppServer / DbServer / AuthServer de ARCA.
export const dynamic = 'force-dynamic'
export const maxDuration = 15

const WSFE_URL = 'https://servicios1.afip.gov.ar/wsfev1/service.asmx'
const SOAP =
  '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="http://ar.gov.afip.dif.FEV1/">' +
  '<soapenv:Header/><soapenv:Body><ar:FEDummy/></soapenv:Body></soapenv:Envelope>'

export async function GET() {
  const t0 = Date.now()
  const ctrl = new AbortController()
  const to = setTimeout(() => ctrl.abort(), 8000)
  const noCache = { 'Cache-Control': 'no-store' }
  try {
    const r = await fetch(WSFE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '"http://ar.gov.afip.dif.FEV1/FEDummy"' },
      body: SOAP,
      signal: ctrl.signal,
      cache: 'no-store',
    })
    const xml = await r.text()
    const tag = (t: string) => xml.match(new RegExp(`<${t}>([^<]*)</${t}>`))?.[1] ?? null
    const app = tag('AppServer'), db = tag('DbServer'), auth = tag('AuthServer')
    const ok = r.ok && app === 'OK' && db === 'OK' && auth === 'OK'
    return NextResponse.json({ ok, app, db, auth, http: r.status, ms: Date.now() - t0, checked: new Date().toISOString() }, { headers: noCache })
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.name === 'AbortError' ? 'timeout (ARCA no responde)' : String(e?.message || e), ms: Date.now() - t0, checked: new Date().toISOString() },
      { headers: noCache }
    )
  } finally {
    clearTimeout(to)
  }
}
