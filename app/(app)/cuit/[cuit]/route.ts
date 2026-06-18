import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
// Forzar región sa-east-1 (São Paulo) para que AFIP no bloquee
export const preferredRegion = 'sa-east-1'

export async function GET(
  req: NextRequest,
  { params }: { params: { cuit: string } }
) {
  const cuit = params.cuit.replace(/[^0-9]/g, '')

  if (!cuit || cuit.length !== 11) {
    return NextResponse.json({ error: 'CUIT inválido' }, { status: 400 })
  }

  const apis = [
    {
      url: `https://soa.afip.gob.ar/sr-padron/v2/persona/${cuit}`,
      parse: (json: any) => {
        const d = json?.data
        if (!d) return null
        const razon = d.razonSocial || [d.apellido, d.nombre].filter(Boolean).join(', ')
        const condicion = d.categoriasMonotributo?.length
          ? 'monotributo'
          : d.categoriasIva?.some((x: any) => x.idCategoria === 1)
            ? 'responsable_inscripto'
            : 'consumidor_final'
        const dom = d.domicilioFiscal
        const direccion = dom
          ? [dom.direccion, dom.localidad, dom.descripcionProvincia].filter(Boolean).join(', ')
          : ''
        return { razon, condicion, direccion }
      }
    },
    {
      url: `https://api.afip.dev/v1/cuit/${cuit}`,
      parse: (json: any) => {
        const r = json?.razonSocial || json?.nombre
        if (!r) return null
        return {
          razon: r,
          condicion: (json?.tipoContribuyente || '').toLowerCase().includes('mono') ? 'monotributo'
            : (json?.tipoContribuyente || '').toLowerCase().includes('inscripto') ? 'responsable_inscripto'
            : 'consumidor_final',
          direccion: json?.domicilio || ''
        }
      }
    }
  ]

  for (const api of apis) {
    try {
      const resp = await fetch(api.url, {
        headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(5000)
      })
      if (!resp.ok) continue
      const json = await resp.json()
      const parsed = api.parse(json)
      if (parsed?.razon) {
        return NextResponse.json(parsed)
      }
    } catch (e) {
      console.error('Error consultando', api.url, e)
    }
  }

  return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
}
