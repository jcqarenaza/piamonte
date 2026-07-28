import { NextRequest, NextResponse } from 'next/server'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'

export const runtime = 'nodejs'

// Colores según especificación
const NEGRO  = rgb(0, 0, 0)
const LINEA  = rgb(0.333, 0.333, 0.333) // #555555
const GRIS   = rgb(0.843, 0.843, 0.843) // #D7D7D7
const AZUL   = rgb(0, 0.314, 0.627)     // ARCA azul

// Grosores
const BRD = 0.7
const SEP = 0.5

// A4 en puntos (1mm = 2.8346 pt)
const MM = 2.8346
const PAGE_W = 210 * MM  // 595.3
const PAGE_H = 297 * MM  // 841.9

// Convertir mm a pt Y (pdf-lib tiene origen abajo-izquierda)
const y = (mm: number) => PAGE_H - mm * MM

function fmtNum(n: number): string {
  return n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function mm(v: number) { return v * MM }

export async function POST(req: NextRequest) {
  try {
    const data = await req.json()
    const { comprobante: c, cuitAseg, dirAseg, razonSocial } = data

    const nroAfip = String(c.nro_cbte_afip ?? c.numero ?? 0).padStart(8, '0')
    const fechaFmt = c.fecha.split('-').reverse().join('/')
    const caeVto = c.cae_vencimiento ? c.cae_vencimiento.split('-').reverse().join('/') : ''
    const tipoLabel = c.categoria === 'nc' ? 'NOTA DE CREDITO' : 'FACTURA'

    const pdfDoc = await PDFDocument.create()
    const fontR = await pdfDoc.embedFont(StandardFonts.Helvetica)
    const fontB = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
    const fontI = await pdfDoc.embedFont(StandardFonts.HelveticaOblique)

    const copias = ['ORIGINAL', 'DUPLICADO', 'TRIPLICADO']

    for (const copia of copias) {
      const page = pdfDoc.addPage([PAGE_W, PAGE_H])

      // Helper: dibujar texto
      const txt = (xMm: number, yMm: number, text: string, sizePt: number, bold = false, align: 'left'|'right'|'center' = 'left') => {
        const font = bold ? fontB : fontR
        const w = font.widthOfTextAtSize(text, sizePt)
        let xPt = mm(xMm)
        if (align === 'right')  xPt = mm(xMm) - w
        if (align === 'center') xPt = mm(xMm) - w / 2
        page.drawText(text, { x: xPt, y: y(yMm), font, size: sizePt, color: NEGRO })
      }

      // Helper: línea
      const ln = (x1: number, y1: number, x2: number, y2: number, lw = BRD) => {
        page.drawLine({ start: { x: mm(x1), y: y(y1) }, end: { x: mm(x2), y: y(y2) }, thickness: lw, color: LINEA })
      }

      // Helper: rect solo borde
      const box = (xMm: number, yMm: number, wMm: number, hMm: number, lw = BRD) => {
        page.drawRectangle({ x: mm(xMm), y: y(yMm + hMm), width: mm(wMm), height: mm(hMm), borderColor: LINEA, borderWidth: lw, color: rgb(1,1,1) })
      }

      // Helper: rect con fondo gris
      const boxGris = (xMm: number, yMm: number, wMm: number, hMm: number, lw = BRD) => {
        page.drawRectangle({ x: mm(xMm), y: y(yMm + hMm), width: mm(wMm), height: mm(hMm), borderColor: LINEA, borderWidth: lw, color: GRIS })
      }

      // ── BLOQUE 1: COPIA ── y=5..14.5
      box(5, 5, 200, 9.5)
      const copiaW = fontB.widthOfTextAtSize(copia, 22)
      page.drawText(copia, { x: PAGE_W/2 - copiaW/2, y: y(12.8), font: fontB, size: 22, color: NEGRO })

      // ── BLOQUE 2: DATOS EMPRESA ── y=15.7..57.5
      ln(5, 15.7, 205, 15.7)
      ln(5, 57.5, 205, 57.5)
      ln(5, 15.7, 5, 57.5)
      ln(205, 15.7, 205, 57.5)
      ln(97, 15.7, 97, 57.5, SEP)
      box(97, 15.9, 16.6, 14.5)
      ln(113.6, 30.4, 113.6, 57.5, SEP)

      // Emisor
      txt(23.7, 22.4, 'KNUTH VERONICA ALEJANDRA', 11, true)
      txt(7, 36.5, 'Razón Social:', 10, true);  txt(30, 36.5, 'KNUTH VERONICA ALEJANDRA', 10)
      txt(7, 45.0, 'Domicilio Comercial:', 10, true); txt(41, 45.0, 'Calle 102 366 - General Pico, La Pampa', 10)
      txt(7, 53.7, 'Condición frente al IVA:', 10, true); txt(46.5, 53.7, 'IVA Responsable Inscripto', 10)

      // Letra A
      const aW = fontB.widthOfTextAtSize(c.tipo || 'A', 34)
      page.drawText(c.tipo || 'A', { x: mm(105.3) - aW/2, y: y(27), font: fontB, size: 34, color: NEGRO })
      const codW = fontB.widthOfTextAtSize('COD. 01', 10)
      page.drawText('COD. 01', { x: mm(105.3) - codW/2, y: y(29.5), font: fontB, size: 10, color: NEGRO })

      // FACTURA zona derecha
      txt(120.3, 20.1, tipoLabel, 28, true)
      txt(120.3, 30.4, 'Punto de Venta:  0006', 11, true)
      txt(162.6, 30.4, `Comp. Nro:  ${nroAfip}`, 11, true)
      txt(120.3, 36.1, 'Fecha de Emisión:', 10, true);  txt(152, 36.1, fechaFmt, 10)
      txt(120.3, 44.2, 'CUIT:', 10, true);              txt(131.6, 44.2, '27242657174', 10)
      txt(120.3, 48.4, 'Ingresos Brutos:', 10, true);   txt(148, 48.4, '1919987', 10)
      txt(120.3, 52.7, 'Fecha de Inicio de Actividades:', 10, true); txt(170, 52.7, '01/09/2007', 10)

      // ── BLOQUE 3: PERÍODO ── y=57.5..67.5
      ln(5, 67.5, 205, 67.5)
      ln(5, 57.5, 5, 67.5, SEP); ln(205, 57.5, 205, 67.5, SEP)
      ln(105, 57.5, 105, 67.5, SEP)
      txt(7, 62.0, 'Período Facturado Desde:', 11, true)
      txt(56.1, 62.0, fechaFmt, 10)
      txt(82.0, 62.0, '  Hasta:', 11, true); txt(94, 62.0, fechaFmt, 10)
      txt(109, 62.0, 'Fecha de Vto. para el pago:', 11, true)
      txt(204, 62.0, fechaFmt, 10, false, 'right')

      // ── BLOQUE 4: DATOS CLIENTE ── y=67.5..95.5
      ln(5, 95.5, 205, 95.5)
      ln(5, 67.5, 5, 95.5, SEP); ln(205, 67.5, 205, 95.5, SEP)
      ln(5, 75.5, 205, 75.5, SEP)
      ln(5, 83.5, 205, 83.5, SEP)

      txt(7, 72.0, 'CUIT:', 10, true); txt(18.3, 72.0, (cuitAseg || '').replace(/-/g,''), 10)
      txt(78.4, 72.0, 'Apellido y Nombre / Razón Social:', 10, true)
      txt(115, 72.0, (razonSocial || '').slice(0, 58), 10)
      txt(7, 79.5, 'Condición frente al IVA:', 10, true); txt(46.5, 79.5, 'IVA Responsable Inscripto', 10)
      txt(96, 79.5, 'Domicilio Comercial:', 10, true); txt(122, 79.5, (dirAseg || '').slice(0, 45), 10)
      txt(7, 91.0, 'Condición de venta:', 10, true); txt(40, 91.0, 'Cuenta Corriente', 10)

      // ── BLOQUE 5: TABLA ── y=95.5..135.5
      const colX = [5, 19.4, 81.1, 99.8, 113.6, 136.5, 146.8, 169.7, 181.7]
      const colW = [14.4, 61.7, 18.7, 13.8, 22.9, 10.2, 22.9, 12.0, 23.3]
      const heads = ['Código','Producto / Servicio','Cantidad','U. medida','Precio Unit.','% Bonif','Subtotal','Alícuota IVA','Subtotal c/IVA']
      const tY = 95.5

      colX.forEach((x, i) => boxGris(x, tY, colW[i], 8))
      heads.forEach((h, i) => {
        page.drawText(h, { x: mm(colX[i]) + mm(0.8), y: y(tY + 5.5), font: fontB, size: 9, color: NEGRO })
      })

      let iy = tY + 8
      for (const it of (c.items || [])) {
        const netoUnit = Math.round((it.p || 0) / 1.21 * 100) / 100
        const desc = (it.d || '').slice(0, 55)
        const rowH = 9

        ln(5, iy + rowH, 205, iy + rowH, SEP)

        page.drawText((it.codigo || '').slice(0, 12), { x: mm(colX[0]) + mm(0.8), y: y(iy + 6), font: fontR, size: 9, color: NEGRO })
        page.drawText(desc, { x: mm(colX[1]) + mm(0.8), y: y(iy + 6), font: fontR, size: 9, color: NEGRO })
        page.drawText(`${Number(it.c || 1).toFixed(2).replace('.', ',')}`, { x: mm(colX[2]) + mm(0.8), y: y(iy + 6), font: fontR, size: 9, color: NEGRO })
        page.drawText('unidades', { x: mm(colX[3]) + mm(0.8), y: y(iy + 6), font: fontR, size: 9, color: NEGRO })

        const pW = fontR.widthOfTextAtSize(fmtNum(netoUnit), 9)
        page.drawText(fmtNum(netoUnit), { x: mm(colX[4] + colW[4]) - pW - mm(0.8), y: y(iy + 6), font: fontR, size: 9, color: NEGRO })
        page.drawText('0,00', { x: mm(colX[5]) + mm(0.8), y: y(iy + 6), font: fontR, size: 9, color: NEGRO })

        const sW = fontR.widthOfTextAtSize(fmtNum(netoUnit * (it.c || 1)), 9)
        page.drawText(fmtNum(netoUnit * (it.c || 1)), { x: mm(colX[6] + colW[6]) - sW - mm(0.8), y: y(iy + 6), font: fontR, size: 9, color: NEGRO })
        page.drawText('21%', { x: mm(colX[7]) + mm(0.8), y: y(iy + 6), font: fontR, size: 9, color: NEGRO })

        const tcW = fontR.widthOfTextAtSize(fmtNum((it.c || 1) * (it.p || 0)), 9)
        page.drawText(fmtNum((it.c || 1) * (it.p || 0)), { x: mm(colX[8] + colW[8]) - tcW - mm(0.8), y: y(iy + 6), font: fontR, size: 9, color: NEGRO })

        iy += rowH

        if (c.siniestro || c.patente || c.vehiculo) {
          const ref = [c.vehiculo, c.patente ? `Pat: ${c.patente}` : null, c.siniestro ? `Sin: ${c.siniestro}` : null].filter(Boolean).join(' · ')
          page.drawText(ref, { x: mm(colX[1]) + mm(0.8), y: y(iy + 4), font: fontI, size: 8, color: rgb(0.3, 0.3, 0.3) })
          iy += 5
        }
      }

      // ── TOTALES ── posición fija y=237.8
      const TOTALES_Y = 237.8
      box(5, TOTALES_Y, 200, 58)
      ln(5, TOTALES_Y + 9, 205, TOTALES_Y + 9, SEP)

      txt(66, TOTALES_Y + 6.5, 'Importe Otros Tributos: $', 10)
      txt(116.2, TOTALES_Y + 6.5, '0,00', 10)

      const totRows: [string, string, boolean, number][] = [
        ['Importe Neto Gravado: $', fmtNum(c.neto || 0), true, 11],
        ['IVA 27%: $', '0,00', false, 10],
        ['IVA 21%: $', fmtNum(c.iva || 0), false, 10],
        ['IVA 10.5%: $', '0,00', false, 10],
        ['IVA 5%: $', '0,00', false, 10],
        ['IVA 2.5%: $', '0,00', false, 10],
        ['IVA 0%: $', '0,00', false, 10],
        ['Importe Otros Tributos: $', '0,00', false, 10],
        ['Importe Total: $', fmtNum(c.total || 0), true, 14],
      ]
      let ry = TOTALES_Y + 14
      for (const [lbl, val, bold, sz] of totRows) {
        const font = bold ? fontB : fontR
        txt(139.2, ry, lbl, sz, bold)
        const vW = font.widthOfTextAtSize(val, sz)
        page.drawText(val, { x: mm(204) - vW, y: y(ry), font, size: sz, color: NEGRO })
        ry += 5.2
      }

      // ── OBSERVACIONES ── y=295.8, h=10
      const OBS_Y = TOTALES_Y + 58
      box(5, OBS_Y, 200, 10)
      if (c.cliente_nombre) {
        const obsW = fontR.widthOfTextAtSize(c.cliente_nombre.toUpperCase(), 10)
        page.drawText(c.cliente_nombre.toUpperCase(), { x: PAGE_W/2 - obsW/2, y: y(OBS_Y + 6.5), font: fontR, size: 10, color: NEGRO })
      }

      // ── PIE ──
      const PIE_Y = OBS_Y + 11
      ln(5, PIE_Y, 205, PIE_Y, SEP)

      // ARCA azul
      page.drawText('ARCA', { x: mm(55), y: y(PIE_Y + 8), font: fontB, size: 14, color: AZUL })
      page.drawText('AGENCIA DE RECAUDACIÓN Y CONTROL ADUANERO', { x: mm(55), y: y(PIE_Y + 12), font: fontR, size: 6, color: rgb(0.24, 0.24, 0.24) })
      page.drawText('Comprobante Autorizado', { x: mm(55), y: y(PIE_Y + 17), font: fontB, size: 8, color: NEGRO })
      page.drawText('Esta Agencia no se responsabiliza por los datos ingresados en el detalle de la operación', { x: mm(55), y: y(PIE_Y + 22), font: fontI, size: 6, color: rgb(0.3, 0.3, 0.3) })

      // Pág 1/1 centro
      const pagW = fontR.widthOfTextAtSize('Pág. 1/1', 9)
      page.drawText('Pág. 1/1', { x: PAGE_W/2 - pagW/2, y: y(PIE_Y + 6), font: fontR, size: 9, color: NEGRO })

      // CAE derecha
      if (c.cae_emitido) {
        const caeStr = `CAE N°:  ${c.cae_emitido}`
        const caeW = fontB.widthOfTextAtSize(caeStr, 10)
        page.drawText(caeStr, { x: mm(204) - caeW, y: y(PIE_Y + 8), font: fontB, size: 10, color: NEGRO })
        const vtoStr = `Fecha de Vto. de CAE:  ${caeVto}`
        const vtoW = fontB.widthOfTextAtSize(vtoStr, 10)
        page.drawText(vtoStr, { x: mm(204) - vtoW, y: y(PIE_Y + 13), font: fontB, size: 10, color: NEGRO })
      }
    }

    const pdfBytes = await pdfDoc.save()
    const buffer = Buffer.from(pdfBytes)
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="0006-${String(c.nro_cbte_afip ?? c.numero ?? 0).padStart(8,'0')}.pdf"`,
      },
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
