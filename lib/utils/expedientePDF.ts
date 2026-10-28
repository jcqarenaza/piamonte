// Arma un PDF con los adjuntos de una OS o comprobante (fotos JPG/PNG y la orden firmada, que puede
// ser imagen o PDF). Cada foto va en una hoja A4 con su proporción real; los PDF se copian página a
// página. Pensado para los portales de aseguradoras (Nativa pide PDF, no JPG).
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

export interface AdjuntoExp { url: string; nombre?: string | null; tipo?: string | null; storage_path?: string | null }

const A4 = { w: 595.28, h: 841.89 }
const MARGEN = 28

function extDe(a: AdjuntoExp): string {
  return ((a.storage_path || a.nombre || '').split('.').pop() || '').toLowerCase()
}

async function agregarImagen(pdf: PDFDocument, bytes: ArrayBuffer, ext: string, titulo: string) {
  let img
  try {
    img = ext === 'png' ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes)
  } catch {
    // Si la extensión miente (p.ej. .jpg que es PNG), se prueba el otro formato
    img = ext === 'png' ? await pdf.embedJpg(bytes) : await pdf.embedPng(bytes)
  }
  const page = pdf.addPage([A4.w, A4.h])
  const font = await pdf.embedFont(StandardFonts.HelveticaBold)
  page.drawText(titulo, { x: MARGEN, y: A4.h - MARGEN - 10, size: 11, font, color: rgb(0.2, 0.2, 0.2) })
  const maxW = A4.w - MARGEN * 2, maxH = A4.h - MARGEN * 2 - 24
  const esc = Math.min(maxW / img.width, maxH / img.height, 1.0e9)
  const w = img.width * esc, h = img.height * esc
  page.drawImage(img, { x: (A4.w - w) / 2, y: (A4.h - 24 - MARGEN * 2 - h) / 2 + MARGEN, width: w, height: h })
}

/** Un solo PDF con todos los adjuntos (expediente). Devuelve los bytes.
 *  Si se pasa `portada` (p.ej. el PDF de la factura), va primero en lugar de la carátula. */
export async function armarExpediente(adjuntos: AdjuntoExp[], encabezado: { titulo: string; lineas: string[] }, portada?: ArrayBuffer | Uint8Array): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.HelveticaBold)
  const fontN = await pdf.embedFont(StandardFonts.Helvetica)
  if (portada) {
    const src = await PDFDocument.load(portada, { ignoreEncryption: true })
    const pages = await pdf.copyPages(src, src.getPageIndices())
    pages.forEach(p => pdf.addPage(p))
  } else {
    const car = pdf.addPage([A4.w, A4.h])
    car.drawText(encabezado.titulo, { x: MARGEN, y: A4.h - 70, size: 18, font })
    encabezado.lineas.forEach((l, i) => car.drawText(l, { x: MARGEN, y: A4.h - 100 - i * 18, size: 11, font: fontN }))
    car.drawText(`${adjuntos.length} adjunto(s)`, { x: MARGEN, y: A4.h - 110 - encabezado.lineas.length * 18, size: 10, font: fontN, color: rgb(0.4, 0.4, 0.4) })
  }

  let nFoto = 0
  for (const a of adjuntos) {
    const ext = extDe(a)
    const titulo = a.tipo === 'os_firmada' ? 'Orden de servicio firmada' : `Foto ${++nFoto}${a.nombre ? ' — ' + a.nombre : ''}`
    try {
      const bytes = await (await fetch(a.url)).arrayBuffer()
      if (ext === 'pdf') {
        const src = await PDFDocument.load(bytes, { ignoreEncryption: true })
        const pages = await pdf.copyPages(src, src.getPageIndices())
        pages.forEach(p => pdf.addPage(p))
      } else {
        await agregarImagen(pdf, bytes, ext, titulo)
      }
    } catch (e) {
      const page = pdf.addPage([A4.w, A4.h])
      page.drawText(`${titulo}: no se pudo incluir (${String(e).slice(0, 80)})`, { x: MARGEN, y: A4.h - 60, size: 10, font: fontN, color: rgb(0.8, 0, 0) })
    }
  }
  return pdf.save()
}

/** Un PDF por adjunto. Devuelve [{nombre, bytes}]. Los que ya son PDF se devuelven tal cual. */
export async function adjuntosAPdfIndividuales(adjuntos: AdjuntoExp[], base: string): Promise<{ nombre: string; bytes: Uint8Array }[]> {
  const out: { nombre: string; bytes: Uint8Array }[] = []
  let nFoto = 0
  for (const a of adjuntos) {
    const ext = extDe(a)
    const nombre = a.tipo === 'os_firmada' ? `${base}_firmada.pdf` : `${base}_foto${++nFoto}.pdf`
    try {
      const bytes = await (await fetch(a.url)).arrayBuffer()
      if (ext === 'pdf') { out.push({ nombre, bytes: new Uint8Array(bytes) }); continue }
      const pdf = await PDFDocument.create()
      await agregarImagen(pdf, bytes, ext, a.tipo === 'os_firmada' ? 'Orden de servicio firmada' : `Foto ${nFoto}`)
      out.push({ nombre, bytes: await pdf.save() })
    } catch (e) { console.error('No se pudo convertir', a.nombre, e) }
  }
  return out
}

export function descargarBytes(bytes: Uint8Array, nombre: string) {
  const blob = new Blob([bytes as any], { type: 'application/pdf' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob); link.download = nombre
  document.body.appendChild(link); link.click(); link.remove()
  setTimeout(() => URL.revokeObjectURL(link.href), 1000)
}
