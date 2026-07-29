import { NextRequest, NextResponse } from 'next/server'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'

export const runtime = 'nodejs'

// Colores
const K    = rgb(0, 0, 0)
const LINE = rgb(0.333, 0.333, 0.333)
const GRAY = rgb(0.922, 0.922, 0.922)
const BLUE = rgb(0, 0.314, 0.627)

const PH = 842  // page height in pt

// In pdf-lib, y=0 is bottom. pdfplumber gives y_top from top.
// Baseline of text ≈ y_top + size (pdfplumber measures from top of glyph)
// So: pdf-lib y = PH - y_top - size
const B = (yTop: number, sz: number) => PH - yTop - sz

function fmt(n: number) {
  return n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export async function POST(req: NextRequest) {
  try {
    const { comprobante: c, cuitAseg, dirAseg, razonSocial } = await req.json()

    const nro = String(c.nro_cbte_afip ?? c.numero ?? 0).padStart(8, '0')
    const fecha = (c.fecha || '').split('-').reverse().join('/')
    const vto = c.cae_vencimiento ? c.cae_vencimiento.split('-').reverse().join('/') : ''
    const tipo = c.categoria === 'nc' ? 'NOTA DE CREDITO' : 'FACTURA'

    const doc = await PDFDocument.create()
    const R = await doc.embedFont(StandardFonts.Helvetica)
    const Bd = await doc.embedFont(StandardFonts.HelveticaBold)
    const It = await doc.embedFont(StandardFonts.HelveticaOblique)

    for (const copia of ['ORIGINAL', 'DUPLICADO', 'TRIPLICADO']) {
      const p = doc.addPage([595, 842])

      // ── text helpers ──
      // x, yTop: exact coordinates from pdfplumber
      const t = (x: number, yTop: number, s: string, sz: number, bold = false, color = K) =>
        p.drawText(s, { x, y: B(yTop, sz), font: bold ? Bd : R, size: sz, color })

      const tR = (xRight: number, yTop: number, s: string, sz: number, bold = false) => {
        const f = bold ? Bd : R
        p.drawText(s, { x: xRight - f.widthOfTextAtSize(s, sz), y: B(yTop, sz), font: f, size: sz, color: K })
      }

      const tC = (xC: number, yTop: number, s: string, sz: number, bold = false) => {
        const f = bold ? Bd : R
        p.drawText(s, { x: xC - f.widthOfTextAtSize(s, sz) / 2, y: B(yTop, sz), font: f, size: sz, color: K })
      }

      // ── line / rect helpers ──
      const ln = (x1: number, y1: number, x2: number, y2: number, lw = 0.7) =>
        p.drawLine({ start: { x: x1, y: PH - y1 }, end: { x: x2, y: PH - y2 }, thickness: lw, color: LINE })

      const bx = (x: number, yTop: number, w: number, h: number, lw = 0.7, fill = rgb(1,1,1)) =>
        p.drawRectangle({ x, y: PH - yTop - h, width: w, height: h, borderColor: LINE, borderWidth: lw, color: fill })

      // ══ BLOQUE 1 — COPIA ══
      // Arca: rect x=220 y=19 w=156 h=24
      bx(220, 19, 156, 24)
      // "ORIGINAL" x=263.8 y_top=25.2 size=14
      tC(298, 25.2, copia, 14, true)

      // ══ BLOQUE 2 — EMPRESA ══
      // Línea horizontal y=44.5
      ln(15, 44.5, 581, 44.5)
      // Rect letra A: x=275 y=45 w=47 h=41
      bx(275, 45, 47, 41)
      // Línea interior bajo A: y=86
      ln(275, 86, 322, 86, 0.5)
      // Divisor vertical A/FACTURA: x=298.5, y=83..163
      ln(298.5, 83, 298.5, 163, 0.5)

      // EMISOR (coordenadas exactas de pdfplumber)
      // "KNUTH VERONICA ALEJANDRA" x=67 y_top=63.4 size=10
      t(67, 63.4, 'KNUTH VERONICA ALEJANDRA', 10, true)
      // Razón Social label: x=21 y=103.5 size=9 bold
      t(21, 103.5, 'Razón Social:', 9, true)
      // Razón Social valor: x=84 y=103.5
      t(84, 103.5, 'KNUTH VERONICA ALEJANDRA', 9)
      // Domicilio
      t(21, 127.5, 'Domicilio Comercial:', 9, true)
      t(116, 127.5, 'Calle 102 366 - General Pico, La Pampa', 9)
      // Condición IVA
      t(21, 152.3, 'Condición frente al IVA:', 9, true)
      t(131, 152.3, 'IVA Responsable Inscripto', 9)

      // Letra A: x=289.8 y=48.9 size=24
      tC(298.5, 48.9, c.tipo || 'A', 24, true)
      // COD.01: x=282.9 y=73.7 size=8
      tC(298.5, 73.7, 'COD. 01', 8, true)

      // FACTURA zona derecha (coordenadas exactas)
      // "FACTURA": x=341 y=57.1 size=18
      t(341, 57.1, tipo, 18, true)
      // Punto de Venta: x=341 y=86.1 size=9
      t(341, 86.1, 'Punto de Venta:  0006', 9, true)
      t(461, 86.1, `Comp. Nro:  ${nro}`, 9, true)
      // Fecha Emisión: x=341 y=102.3 size=9 bold
      t(341, 102.3, 'Fecha de Emisión:', 9, true)
      t(428, 102.3, fecha, 9)
      // CUIT: x=341 y=125.3
      t(341, 125.3, 'CUIT:', 9, true)
      t(373, 125.3, '27242657174', 9)
      // Ingresos Brutos: x=341 y=137.3
      t(341, 137.3, 'Ingresos Brutos:', 9, true)
      t(419, 137.3, '1919987', 9)
      // Fecha Inicio: x=341 y=149.3
      t(341, 149.3, 'Fecha de Inicio de Actividades:', 9, true)
      t(482, 149.3, '01/09/2007', 9)

      // Línea inferior empresa: y=163
      ln(15, 163, 581, 163)

      // ══ BLOQUE 3 — PERÍODO ══ y=163..187
      ln(15, 163, 15, 187, 0.5)
      ln(581, 163, 581, 187, 0.5)
      ln(15, 187, 581, 187)
      // "Período Facturado Desde:" x=21 y=171.4 size=10 bold
      t(21, 171.4, 'Período Facturado Desde:', 10, true)
      t(159, 171.4, fecha, 10)
      t(232.4, 171.4, `Hasta:${fecha}`, 10, true)
      t(363.1, 171.4, 'Fecha de Vto. para el pago:', 10, true)
      // Fecha vto pago alineada a la derecha
      tR(581, 171.4, fecha, 10)

      // ══ BLOQUE 4 — RECEPTOR ══ y=187..240
      ln(15, 187, 15, 240, 0.5)
      ln(581, 187, 581, 240, 0.5)
      ln(15, 200, 581, 200, 0.5)
      ln(15, 218, 581, 218, 0.5)
      ln(15, 240, 581, 240)

      // Fila 1: CUIT y Razón Social
      // "CUIT:" x=21 y=191.3 size=8 bold
      t(21, 191.3, 'CUIT:', 8, true)
      t(52, 191.3, (cuitAseg || '').replace(/-/g, ''), 8)
      t(222.3, 191.3, 'Apellido y Nombre / Razón Social:', 8, true)
      t(325.8, 191.3, (razonSocial || '').slice(0, 52), 8)

      // Fila 2: Condición IVA y Domicilio
      // "Condición frente al IVA:" x=21 y=208.3 size=8 bold
      t(21, 208.3, 'Condición frente al IVA:', 8, true)
      t(131, 208.3, 'IVA Responsable Inscripto', 8)
      t(272.5, 208.3, 'Domicilio Comercial:', 8, true)
      t(340, 208.3, (dirAseg || '').slice(0, 38), 8)

      // Fila 3: Condición venta
      // "Condición de venta:" x=21 y=225.3 size=8 bold
      t(21, 225.3, 'Condición de venta:', 8, true)
      t(113, 225.3, 'Cuenta Corriente', 8)

      // ══ BLOQUE 5 — TABLA ══
      // Header exacto de pdfplumber: y=277, h=18
      // Rects individuales de cada columna (exactos de pdfplumber)
      const cols = [
        { x: 15,  w: 40,  label: 'Código',             lx: 19,  align: 'L' },
        { x: 55,  w: 175, label: 'Producto / Servicio', lx: 59,  align: 'L' },
        { x: 230, w: 53,  label: 'Cantidad',            lx: 256, align: 'C' },
        { x: 283, w: 39,  label: 'U. medida',           lx: 285, align: 'L' },
        { x: 322, w: 65,  label: 'Precio Unit.',        lx: 385, align: 'R' },
        { x: 387, w: 29,  label: '% Bonif',             lx: 414, align: 'R' },
        { x: 416, w: 65,  label: 'Subtotal',            lx: 479, align: 'R' },
        { x: 481, w: 34,  label: 'Alícuota IVA',        lx: 498, align: 'C' },
        { x: 515, w: 66,  label: 'Subtotal c/IVA',      lx: 579, align: 'R' },
      ]
      const TY = 277
      const TH = 18

      // Cabecera gris
      cols.forEach(col => bx(col.x, TY, col.w, TH, 0.7, GRAY))

      // Texto cabecera — y_top=282.7 size=8 (de pdfplumber)
      cols.forEach(col => {
        if (col.align === 'C') tC(col.x + col.w / 2, 282.7, col.label, 7, true)
        else if (col.align === 'R') tR(col.x + col.w - 2, 282.7, col.label, 7, true)
        else t(col.lx, 282.7, col.label, 7, true)
      })

      // Líneas verticales cabecera
      cols.forEach(col => ln(col.x, TY, col.x, TY + TH, 0.5))
      ln(581, TY, 581, TY + TH, 0.5)

      // Filas de datos
      // Primera fila en pdfplumber: y=301.1 size=8
      let iy = TY + TH  // y_top de la primera fila de datos
      for (const it of (c.items || [])) {
        const net = Math.round((it.p || 0) / 1.21 * 100) / 100
        const RH = 18
        // Línea inferior de la fila
        ln(15, iy + RH, 581, iy + RH, 0.5)
        // Textos — yTop = iy + 11 (centrado vertical en RH=18)
        const yt = iy + 11
        t(cols[0].x + 3, yt, (it.codigo || '').slice(0, 10), 8)
        t(cols[1].x + 3, yt, (it.d || '').slice(0, 55), 8)
        tC(cols[2].x + cols[2].w / 2, yt, `${Number(it.c || 1).toFixed(2).replace('.', ',')}`, 8)
        t(cols[3].x + 3, yt, 'unidades', 8)
        tR(cols[4].x + cols[4].w - 2, yt, fmt(net), 8)
        tR(cols[5].x + cols[5].w - 2, yt, '0,00', 8)
        tR(cols[6].x + cols[6].w - 2, yt, fmt(net * (it.c || 1)), 8)
        tC(cols[7].x + cols[7].w / 2, yt, '21%', 8)
        tR(cols[8].x + cols[8].w - 2, yt, fmt((it.c || 1) * (it.p || 0)), 8)
        iy += RH
        // Referencia debajo del ítem
        if (c.siniestro || c.patente || c.vehiculo) {
          const ref = [c.vehiculo, c.patente ? `Pat: ${c.patente}` : null, c.siniestro ? `Sin: ${c.siniestro}` : null].filter(Boolean).join(' · ')
          p.drawText(ref, { x: cols[1].x + 3, y: B(iy + 8, 7), font: It, size: 7, color: rgb(0.3, 0.3, 0.3) })
          iy += 10
        }
      }

      // ══ BLOQUE 6 — TOTALES ══
      // De pdfplumber: rect y=674 h=26 → pero el bloque completo arranca antes
      // "Importe Otros Tributos": x=187 y=532.8 size=9
      // Rect totales completo (estimado): y=524, h=150
      bx(15, 524, 566, 150)
      ln(15, 542, 581, 542, 0.5)  // separador Importe Otros Tributos

      t(187, 532.8, 'Importe Otros Tributos: $', 9)
      t(329.5, 532.8, '0,00', 9)

      // Totales derecha — coordenadas exactas de pdfplumber
      const rows: [string, string, boolean, number, number][] = [
        ['Importe Neto Gravado: $', fmt(c.neto || 0), true,  9,  553.3],
        ['IVA 27%: $',              '0,00',            false, 9,  566.3],
        ['IVA 21%: $',              fmt(c.iva || 0),   false, 9,  579.3],
        ['IVA 10.5%: $',            '0,00',            false, 9,  592.3],
        ['IVA 5%: $',               '0,00',            false, 9,  605.3],
        ['IVA 2.5%: $',             '0,00',            false, 9,  618.3],
        ['IVA 0%: $',               '0,00',            false, 9,  631.3],
        ['Importe Otros Tributos: $','0,00',            false, 9,  644.3],
        ['Importe Total: $',         fmt(c.total || 0), true, 10, 658.4],
      ]
      for (const [lbl, val, bold, sz, yRow] of rows) {
        const f = bold ? Bd : R
        // Label — alineado a la derecha antes del $ (x=498 de pdfplumber)
        p.drawText(lbl, { x: 498 - f.widthOfTextAtSize(lbl, sz) - 4, y: B(yRow, sz), font: f, size: sz, color: K })
        // Valor — alineado a la derecha (hasta x=577)
        p.drawText(val, { x: 577 - f.widthOfTextAtSize(val, sz), y: B(yRow, sz), font: f, size: sz, color: K })
      }

      // ══ OBSERVACIONES ══
      // Nombre asegurado + PARABRISAS
      // "PARABRISAS EL PIAMONTE": x=223.4 y=682.9 size=10
      if (c.cliente_nombre) tC(298, 670, c.cliente_nombre.toUpperCase(), 9)
      tC(298, 682.9, '"PARABRISAS  EL PIAMONTE "', 10)

      // ══ PIE ══
      // Línea: y=700
      ln(15, 700, 581, 700)
      // "Pág. 1/1": x=277.8 y=711.4 size=10
      tC(298, 711.4, 'Pág. 1/1', 10)

      // ARCA izq — "Comprobante Autorizado": x=115 y=748.5 size=9
      t(115, 730, 'ARCA', 14, true, BLUE)
      t(115, 744, 'AGENCIA DE RECAUDACIÓN Y CONTROL ADUANERO', 6, false, rgb(0.3, 0.3, 0.3))
      t(115, 748.5, 'Comprobante Autorizado', 9, true)
      p.drawText(
        'Esta Agencia no se responsabiliza por los datos ingresados en el detalle de la operación',
        { x: 115, y: B(768, 6), font: It, size: 6, color: rgb(0.3, 0.3, 0.3) }
      )

      // CAE derecha — "CAE N°:" x=442.6 y=716.6 size=10
      if (c.cae_emitido) {
        t(442.6, 716.6, `CAE N°:  ${c.cae_emitido}`, 10, true)
        t(374.4, 730.6, `Fecha de Vto. de CAE:  ${vto}`, 10, true)
      }
    }

    const bytes = await doc.save()
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="0006-${String(c.nro_cbte_afip ?? c.numero ?? 0).padStart(8, '0')}.pdf"`,
      },
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
