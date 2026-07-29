import { NextRequest, NextResponse } from 'next/server'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'

export const runtime = 'nodejs'

const NEGRO = rgb(0, 0, 0)
const LINEA = rgb(0.333, 0.333, 0.333)
const GRIS  = rgb(0.922, 0.922, 0.922)
const AZUL  = rgb(0, 0.314, 0.627)

const PH = 842  // altura página en pt

// Convierte y desde arriba (como pdfplumber) a y desde abajo (pdf-lib)
const yb = (yTop: number) => PH - yTop

function fmtNum(n: number): string {
  return n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export async function POST(req: NextRequest) {
  try {
    const data = await req.json()
    const { comprobante: c, cuitAseg, dirAseg, razonSocial } = data

    const nroAfip = String(c.nro_cbte_afip ?? c.numero ?? 0).padStart(8, '0')
    const fechaFmt = (c.fecha || '').split('-').reverse().join('/')
    const caeVto = c.cae_vencimiento ? c.cae_vencimiento.split('-').reverse().join('/') : ''
    const tipoLabel = c.categoria === 'nc' ? 'NOTA DE CREDITO' : 'FACTURA'

    const pdfDoc = await PDFDocument.create()
    const fontR = await pdfDoc.embedFont(StandardFonts.Helvetica)
    const fontB = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
    const fontI = await pdfDoc.embedFont(StandardFonts.HelveticaOblique)

    const copias = ['ORIGINAL', 'DUPLICADO', 'TRIPLICADO']

    for (const copia of copias) {
      const page = pdfDoc.addPage([595, 842])

      // Helpers con coordenadas absolutas en pt (origen arriba-izquierda convertido a pdf-lib)
      const txt = (x: number, yTop: number, text: string, sz: number, bold = false) => {
        page.drawText(text, { x, y: yb(yTop) - sz * 0.2, font: bold ? fontB : fontR, size: sz, color: NEGRO })
      }
      const txtR = (xRight: number, yTop: number, text: string, sz: number, bold = false) => {
        const font = bold ? fontB : fontR
        const w = font.widthOfTextAtSize(text, sz)
        page.drawText(text, { x: xRight - w, y: yb(yTop) - sz * 0.2, font, size: sz, color: NEGRO })
      }
      const txtC = (xCenter: number, yTop: number, text: string, sz: number, bold = false) => {
        const font = bold ? fontB : fontR
        const w = font.widthOfTextAtSize(text, sz)
        page.drawText(text, { x: xCenter - w/2, y: yb(yTop) - sz * 0.2, font, size: sz, color: NEGRO })
      }
      const ln = (x1: number, y1: number, x2: number, y2: number, lw = 0.7) => {
        page.drawLine({ start: { x: x1, y: yb(y1) }, end: { x: x2, y: yb(y2) }, thickness: lw, color: LINEA })
      }
      const box = (x: number, yTop: number, w: number, h: number, lw = 0.7) => {
        page.drawRectangle({ x, y: yb(yTop + h), width: w, height: h, borderColor: LINEA, borderWidth: lw, color: rgb(1,1,1) })
      }
      const boxG = (x: number, yTop: number, w: number, h: number, lw = 0.7) => {
        page.drawRectangle({ x, y: yb(yTop + h), width: w, height: h, borderColor: LINEA, borderWidth: lw, color: GRIS })
      }

      // ── COPIA ── rect x=220 y=19 w=156 h=24 (exacto de Arca)
      box(220, 19, 156, 24)
      txtC(298, 25.2, copia, 14, true)

      // ── LÍNEA HORIZONTAL ── y=44.5
      ln(15, 44.5, 581, 44.5)

      // ── RECT LETRA A ── x=275 y=45 w=47 h=41
      box(275, 45, 47, 41)
      // Línea interior bajo la A
      ln(275, 86, 322, 86, 0.5)
      // Línea vertical divisor A / FACTURA
      ln(298.5, 83, 298.5, 163, 0.5)
      // Líneas del rect letra
      ln(275, 44.8, 275, 86.2, 0.7)
      ln(322, 44.8, 322, 86.2, 0.7)

      // EMISOR — coordenadas exactas de pdfplumber
      txt(67, 63.4, 'KNUTH VERONICA ALEJANDRA', 10, true)
      txt(21, 103.5, 'Razón Social:', 9, true); txt(84, 103.5, 'KNUTH VERONICA ALEJANDRA', 9)
      txt(21, 127.5, 'Domicilio Comercial:', 9, true); txt(116, 127.5, 'Calle 102 366 - General Pico, La Pampa', 9)
      txt(21, 152.3, 'Condición frente al IVA:', 9, true); txt(131, 152.3, 'IVA Responsable Inscripto', 9)

      // LETRA A
      txtC(298.5, 48.9, c.tipo || 'A', 24, true)
      txtC(298.5, 73.7, 'COD. 01', 8, true)

      // FACTURA zona derecha — coordenadas exactas
      txt(341, 57.1, tipoLabel, 18, true)
      txt(341, 86.1, 'Punto de Venta:  0006', 9, true)
      txt(461, 86.1, `Comp. Nro:  ${nroAfip}`, 9, true)
      txt(341, 102.3, 'Fecha de Emisión:', 9, true); txt(428, 101.6, fechaFmt, 9)
      txt(341, 125.3, 'CUIT:', 9, true); txt(373, 125.3, '27242657174', 9)
      txt(341, 137.3, 'Ingresos Brutos:', 9, true); txt(419, 137.3, '1919987', 9)
      txt(341, 149.3, 'Fecha de Inicio de Actividades:', 9, true); txt(482, 149.3, '01/09/2007', 9)

      // Línea inferior bloque empresa
      ln(15, 163, 581, 163)

      // ── PERÍODO ── y=163..187 (h≈24)
      ln(15, 163, 15, 187, 0.5); ln(581, 163, 581, 187, 0.5)
      ln(15, 187, 581, 187)
      txt(21, 171.4, 'Período Facturado Desde:', 10, true)
      txt(159, 171.4, fechaFmt, 10)
      txt(232.4, 171.4, `Hasta:${fechaFmt}`, 10, true)
      txt(363.1, 171.4, 'Fecha de Vto. para el pago:', 10, true)
      txt(465.8, 171.4, fechaFmt, 10)

      // ── RECEPTOR ── y=187..240 (3 filas)
      ln(15, 187, 15, 240, 0.5); ln(581, 187, 581, 240, 0.5)
      ln(15, 200, 581, 200, 0.5)
      ln(15, 218, 581, 218, 0.5)
      ln(15, 240, 581, 240)

      txt(21, 191.3, 'CUIT:', 8, true); txt(52, 191.3, (cuitAseg || '').replace(/-/g,''), 8)
      txt(222.3, 191.3, 'Apellido y Nombre / Razón Social:', 8, true)
      txt(325.8, 191.3, (razonSocial || '').slice(0, 50), 8)
      txt(21, 208.3, 'Condición frente al IVA:', 8, true); txt(131, 208.3, 'IVA Responsable Inscripto', 8)
      txt(272.5, 208.3, 'Domicilio Comercial:', 8, true); txt(310.7, 208.3, (dirAseg || '').slice(0, 40), 8)
      txt(21, 225.3, 'Condición de venta:', 8, true); txt(113, 225.3, 'Cuenta Corriente', 8)

      // ── TABLA ── exactamente como en Arca
      // Columnas: x, w en pt (de pdfplumber)
      const cols = [
        { x: 15,  w: 40,  label: 'Código',           align: 'left' },
        { x: 55,  w: 175, label: 'Producto / Servicio', align: 'left' },
        { x: 230, w: 53,  label: 'Cantidad',          align: 'center' },
        { x: 283, w: 39,  label: 'U. medida',         align: 'left' },
        { x: 322, w: 65,  label: 'Precio Unit.',      align: 'right' },
        { x: 387, w: 29,  label: '% Bonif',           align: 'right' },
        { x: 416, w: 65,  label: 'Subtotal',          align: 'right' },
        { x: 481, w: 34,  label: 'Alícuota\nIVA',    align: 'center' },
        { x: 515, w: 66,  label: 'Subtotal c/IVA',   align: 'right' },
      ]
      const TABLE_Y = 277  // exacto de pdfplumber
      const HEADER_H = 18

      // Cabecera gris
      cols.forEach(col => boxG(col.x, TABLE_Y, col.w, HEADER_H))

      // Texto cabecera
      cols.forEach(col => {
        const lines = col.label.split('\n')
        if (lines.length > 1) {
          txtC(col.x + col.w/2, TABLE_Y + 7, lines[0], 7, true)
          txtC(col.x + col.w/2, TABLE_Y + 13, lines[1], 7, true)
        } else if (col.align === 'center') {
          txtC(col.x + col.w/2, TABLE_Y + 10, col.label, 7, true)
        } else if (col.align === 'right') {
          txtR(col.x + col.w - 2, TABLE_Y + 10, col.label, 7, true)
        } else {
          txt(col.x + 3, TABLE_Y + 10, col.label, 7, true)
        }
      })

      // Líneas verticales cabecera
      cols.forEach(col => {
        ln(col.x, TABLE_Y, col.x, TABLE_Y + HEADER_H, 0.5)
      })
      ln(581, TABLE_Y, 581, TABLE_Y + HEADER_H, 0.5)

      // Filas de datos
      let iy = TABLE_Y + HEADER_H
      for (const it of (c.items || [])) {
        const netoUnit = Math.round((it.p || 0) / 1.21 * 100) / 100
        const desc = (it.d || '').slice(0, 55)
        const ROW_H = 18

        // Línea inferior fila
        ln(15, iy + ROW_H, 581, iy + ROW_H, 0.5)

        // Datos
        txt(cols[0].x + 3, iy + 11, (it.codigo || '').slice(0, 10), 8)
        txt(cols[1].x + 3, iy + 11, desc, 8)
        txtC(cols[2].x + cols[2].w/2, iy + 11, `${Number(it.c || 1).toFixed(2).replace('.', ',')}`, 8)
        txt(cols[3].x + 3, iy + 11, 'unidades', 8)
        txtR(cols[4].x + cols[4].w - 2, iy + 11, fmtNum(netoUnit), 8)
        txtR(cols[5].x + cols[5].w - 2, iy + 11, '0,00', 8)
        txtR(cols[6].x + cols[6].w - 2, iy + 11, fmtNum(netoUnit * (it.c || 1)), 8)
        txtC(cols[7].x + cols[7].w/2, iy + 11, '21%', 8)
        txtR(cols[8].x + cols[8].w - 2, iy + 11, fmtNum((it.c || 1) * (it.p || 0)), 8)

        iy += ROW_H

        // Referencia vehículo/patente/siniestro
        if (c.siniestro || c.patente || c.vehiculo) {
          const ref = [c.vehiculo, c.patente ? `Pat: ${c.patente}` : null, c.siniestro ? `Sin: ${c.siniestro}` : null].filter(Boolean).join(' · ')
          page.drawText(ref, { x: cols[1].x + 3, y: yb(iy + 8) - 7 * 0.2, font: fontI, size: 7, color: rgb(0.3, 0.3, 0.3) })
          iy += 10
        }
      }

      // ── ESPACIO EN BLANCO ── totales siempre en posición fija
      // Según pdfplumber: "Importe Otros Tributos" está en y=532.8
      const TOT_Y = 524  // top del recuadro de totales

      // Rect totales — de pdfplumber: y=674 a y=700 (líneas), pero el bloque arranca antes
      box(15, TOT_Y, 566, 150)
      ln(15, TOT_Y + 18, 581, TOT_Y + 18, 0.5)  // separador Importe Otros Tributos

      // "Importe Otros Tributos" centrado izquierda — x=187 de pdfplumber
      txt(187, 532.8, 'Importe Otros Tributos: $', 9); txt(329.5, 532.8, '0,00', 9)

      // Bloque derecho — coordenadas exactas de pdfplumber
      const totRows: [string, string, boolean, number, number][] = [
        ['Importe Neto Gravado: $', fmtNum(c.neto || 0), true, 9, 553.3],
        ['IVA 27%: $', '0,00', false, 9, 566.3],
        ['IVA 21%: $', fmtNum(c.iva || 0), false, 9, 579.3],
        ['IVA 10.5%: $', '0,00', false, 9, 592.3],
        ['IVA 5%: $', '0,00', false, 9, 605.3],
        ['IVA 2.5%: $', '0,00', false, 9, 618.3],
        ['IVA 0%: $', '0,00', false, 9, 631.3],
        ['Importe Otros Tributos: $', '0,00', false, 9, 644.3],
        ['Importe Total: $', fmtNum(c.total || 0), true, 10, 658.4],
      ]
      for (const [lbl, val, bold, sz, yRow] of totRows) {
        // Label alineado a la derecha del bloque (x=498 "$" de pdfplumber)
        const font = bold ? fontB : fontR
        const lW = font.widthOfTextAtSize(lbl, sz)
        page.drawText(lbl, { x: 498 - lW - 5, y: yb(yRow) - sz * 0.2, font, size: sz, color: NEGRO })
        // Valor alineado a la derecha (hasta x=581-4=577)
        const vW = font.widthOfTextAtSize(val, sz)
        page.drawText(val, { x: 577 - vW, y: yb(yRow) - sz * 0.2, font, size: sz, color: NEGRO })
      }

      // ── "PARABRISAS EL PIAMONTE" ── y=682.9 exacto
      if (c.cliente_nombre) {
        txtC(298, 670, c.cliente_nombre.toUpperCase(), 9)
      }
      txtC(298, 682.9, '"PARABRISAS  EL PIAMONTE "', 10)

      // ── LÍNEA SEPARADORA PIE __ y=700 exacto de pdfplumber
      ln(15, 700, 581, 700)

      // ── PIE ──
      // Pág 1/1 — x=277.8 y=711.4
      txt(277.8, 711.4, 'Pág. 1/1', 10)

      // ARCA — izquierda
      page.drawText('ARCA', { x: 115, y: yb(735), font: fontB, size: 14, color: AZUL })
      page.drawText('AGENCIA DE RECAUDACIÓN Y CONTROL ADUANERO', { x: 115, y: yb(748), font: fontR, size: 6, color: rgb(0.3,0.3,0.3) })
      txt(115, 748.5, 'Comprobante Autorizado', 9, true)
      page.drawText('Esta Agencia no se responsabiliza por los datos ingresados en el detalle de la operación', { x: 115, y: yb(768), font: fontI, size: 6, color: rgb(0.3,0.3,0.3) })

      // CAE — derecha, coordenadas exactas
      if (c.cae_emitido) {
        txt(442.6, 716.6, `CAE N°:  ${c.cae_emitido}`, 10, true)
        txt(374.4, 730.6, `Fecha de Vto. de CAE:  ${caeVto}`, 10, true)
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
