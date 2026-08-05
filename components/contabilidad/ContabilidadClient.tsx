'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { moneyARS2 as moneyARS } from '@/lib/utils/format'

const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

export default function ContabilidadClient() {
  const [tab, setTab]     = useState<'iva_ventas'|'iva_compras'|'retenciones'|'balance'>('iva_ventas')
  const [mes, setMes]     = useState(new Date().toISOString().slice(0,7))
  const [ivaVentas, setIvaVentas]   = useState<any[]>([])
  const [ivaCompras, setIvaCompras] = useState<any[]>([])
  const [retenciones, setRetenciones] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  function copiarTexto(texto: string) {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(texto).catch(() => copiarFallback(texto))
    } else {
      copiarFallback(texto)
    }
  }
  function copiarFallback(texto: string) {
    const ta = document.createElement('textarea')
    ta.value = texto
    ta.style.position = 'fixed'; ta.style.opacity = '0'
    document.body.appendChild(ta); ta.focus(); ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
  }

  useEffect(() => {
  async function load() {
      setLoading(true)
      const mesStart = mes + '-01'
      const mesEnd   = mes + '-31'
      const [v, c, r] = await Promise.all([
        supabase.from('vista_libro_iva_ventas').select('*').gte('fecha', mesStart).lte('fecha', mesEnd),
        supabase.from('vista_libro_iva_compras').select('*').gte('fecha', mesStart).lte('fecha', mesEnd),
        supabase.from('retenciones_sufridas')
          .select('*, aseguradoras(nombre)')
          .gte('fecha', mesStart).lte('fecha', mesEnd)
          .order('fecha', { ascending: false }),
      ])
      setIvaVentas(v.data ?? [])
      setIvaCompras(c.data ?? [])
      setRetenciones(r.data ?? [])
      setLoading(false)
    }
    load()
  }, [mes])

  const totVentas  = ivaVentas.reduce((a,r) => ({ neto: a.neto+Number(r.neto), iva: a.iva+Number(r.iva), total: a.total+Number(r.total) }), { neto:0, iva:0, total:0 })
  const totCompras = ivaCompras.reduce((a,r) => ({ neto: a.neto+Number(r.neto), iva: a.iva+Number(r.iva), total: a.total+Number(r.total) }), { neto:0, iva:0, total:0 })

  // Retenciones agrupadas por tipo
  const totRet = retenciones.reduce((a,r) => {
    const t = r.tipo as string
    a[t] = (a[t] || 0) + Number(r.monto)
    return a
  }, {} as Record<string,number>) as Record<string,number>

  // IVA: débito - crédito compras - ret.IVA sufrida = saldo real a pagar
  const totalRetenciones: number = Object.values(totRet).reduce((a: number, v) => a + (v as number), 0)
  const retIva   = totRet['iva']   || 0
  const saldoIva = totVentas.iva - totCompras.iva - retIva

  const [y, m] = mes.split('-')

  async function generarPDFContador() {
    const { default: jsPDF } = await import('jspdf')
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const W = 210, pad = 14
    let y2 = 15

    function addHeader() {
      doc.setFillColor(0, 165, 80)
      doc.rect(0, 0, W, 18, 'F')
      doc.setTextColor(255,255,255)
      doc.setFont('helvetica','bold')
      doc.setFontSize(13)
      doc.text('EL PIAMONTE — Informe Mensual Contable', pad, 11)
      doc.setFontSize(9)
      doc.text(`Período: ${MESES[+m-1]} ${y}`, W-pad, 11, {align:'right'})
      doc.setTextColor(30,30,30)
    }
    addHeader()
    y2 = 26

    function checkPage(needed = 10) {
      if (y2 + needed > 278) { doc.addPage(); addHeader(); y2 = 26 }
    }

    function seccionTitulo(titulo: string) {
      checkPage(12)
      doc.setFont('helvetica','bold'); doc.setFontSize(9)
      doc.setFillColor(240,240,240)
      doc.rect(pad, y2-4, W-pad*2, 6, 'F')
      doc.text(titulo, pad+1, y2)
      y2 += 7
    }

    // Anchos fijos para tablas de 7 columnas (ventas/compras)
    const COL7 = [22, 12, 18, 48, 34, 26, 28] // Fecha Tipo N° Nombre Neto IVA Total
    const xOf7 = COL7.reduce((acc: number[], w, i) => { acc.push((acc[i-1]||pad) + (i===0?0:COL7[i-1])); return acc }, [] as number[])

    function cabecera7(cols: string[]) {
      doc.setFontSize(7); doc.setFont('helvetica','bold')
      cols.forEach((c,i) => doc.text(c, xOf7[i] + (i>=4?COL7[i]:0), y2, {align: i>=4?'right':'left'}))
      y2 += 3
      doc.setLineWidth(0.2); doc.setDrawColor(180,180,180)
      doc.line(pad, y2, W-pad, y2); y2 += 3
    }

    function fila7(cells: string[], bold = false) {
      checkPage(5)
      doc.setFont('helvetica', bold?'bold':'normal'); doc.setFontSize(6.5)
      cells.forEach((c,i) => doc.text(c, xOf7[i] + (i>=4?COL7[i]:0), y2, {align: i>=4?'right':'left'}))
      y2 += 4
    }

    // ─── SECCIÓN 1: POSICIÓN IVA (destacada al inicio) ───
    seccionTitulo('POSICIÓN IVA')
    const retIvaTotal = totRet['iva'] || 0
    const saldoIvaFinal = totVentas.iva - totCompras.iva - retIvaTotal

    const posItems = [
      { label: 'Débito fiscal (IVA ventas)', val: moneyARS(totVentas.iva), signo: '' },
      { label: 'Crédito fiscal (IVA compras)', val: moneyARS(totCompras.iva), signo: '−' },
    ]
    if (retIvaTotal > 0) posItems.push({ label: 'Ret. IVA sufrida (aseguradoras)', val: moneyARS(retIvaTotal), signo: '−' })

    doc.setFont('helvetica','normal'); doc.setFontSize(8.5)
    posItems.forEach(item => {
      checkPage(7)
      doc.text(item.label, pad+2, y2)
      doc.text(item.signo ? `- ${item.val}` : item.val, W-pad, y2, {align:'right'})
      y2 += 6
    })
    doc.setLineWidth(0.4); doc.setDrawColor(0,165,80)
    doc.line(pad, y2-1, W-pad, y2-1)
    doc.setFont('helvetica','bold'); doc.setFontSize(11)
    const saldoLabel = saldoIvaFinal >= 0 ? 'SALDO IVA A PAGAR' : 'SALDO IVA A FAVOR'
    doc.setTextColor(saldoIvaFinal >= 0 ? 180 : 0, saldoIvaFinal >= 0 ? 0 : 150, 0)
    doc.text(saldoLabel, pad+2, y2+5)
    doc.text(moneyARS(Math.abs(saldoIvaFinal)), W-pad, y2+5, {align:'right'})
    doc.setTextColor(30,30,30)
    y2 += 12

    // ─── SECCIÓN 2: RESUMEN RETENCIONES POR TIPO ───
    if (retenciones.length > 0) {
      seccionTitulo('RETENCIONES SUFRIDAS — Resumen por tipo')
      const RET_ORDEN: [string, string][] = [
        ['iva',       'Ret. IVA'],
        ['iibb',      'Ret. IIBB'],
        ['ganancias', 'Ret. Ganancias'],
        ['suss',      'Ret. SUSS'],
        ['otras',     'Otras retenciones'],
      ]
      doc.setFont('helvetica','normal'); doc.setFontSize(8.5)
      RET_ORDEN.forEach(([tipo, label]) => {
        const monto = totRet[tipo] || 0
        if (monto <= 0) return
        checkPage(7)
        doc.text(label, pad+2, y2)
        doc.text(moneyARS(monto), W-pad, y2, {align:'right'})
        y2 += 6
      })
      doc.setLineWidth(0.2); doc.setDrawColor(200,200,200)
      doc.line(pad, y2-1, W-pad, y2-1)
      doc.setFont('helvetica','bold')
      doc.text('Total retenciones sufridas', pad+2, y2+4)
      doc.text(moneyARS(totalRetenciones), W-pad, y2+4, {align:'right'})
      y2 += 10
    }

    // ─── SECCIÓN 3: TOTALES DEL MES ───
    seccionTitulo('TOTALES DEL MES')
    doc.setFont('helvetica','normal'); doc.setFontSize(8.5)
    const totItems = [
      { label: 'Ventas netas (sin IVA)', val: moneyARS(totVentas.neto) },
      { label: 'IVA débito (ventas)',     val: moneyARS(totVentas.iva) },
      { label: 'Total ventas',            val: moneyARS(totVentas.total), bold: true },
      { label: 'Compras netas (sin IVA)', val: moneyARS(totCompras.neto) },
      { label: 'IVA crédito (compras)',   val: moneyARS(totCompras.iva) },
      { label: 'Total compras',           val: moneyARS(totCompras.total), bold: true },
    ]
    totItems.forEach(item => {
      checkPage(7)
      doc.setFont('helvetica', item.bold ? 'bold' : 'normal')
      doc.text(item.label, pad+2, y2)
      doc.text(item.val, W-pad, y2, {align:'right'})
      y2 += item.bold ? 7 : 5.5
    })
    y2 += 4

    // ─── SECCIÓN 4: LIBRO IVA VENTAS (ordenado por fecha) ───
    const ventasOrdenadas = [...ivaVentas].sort((a,b) => (a.fecha||'').localeCompare(b.fecha||'') || (a.numero||0)-(b.numero||0))
    seccionTitulo('LIBRO IVA VENTAS')
    cabecera7(['Fecha','Tipo','N°','Cliente','Neto','IVA','Total'])
    ventasOrdenadas.forEach(r => {
      fila7([
        r.fecha?.split('-').reverse().join('/') || '',
        r.tipo || '',
        String(r.numero || ''),
        (r.cliente_nombre || r.aseguradora_nombre || 'CF').slice(0,26),
        moneyARS(Number(r.neto)||0),
        moneyARS(Number(r.iva)||0),
        moneyARS(Number(r.total)||0),
      ])
    })
    checkPage(6)
    doc.setLineWidth(0.2); doc.setDrawColor(180,180,180)
    doc.line(pad, y2-1, W-pad, y2-1)
    fila7(['TOTAL','','','',moneyARS(totVentas.neto),moneyARS(totVentas.iva),moneyARS(totVentas.total)], true)
    y2 += 4

    // ─── SECCIÓN 5: LIBRO IVA COMPRAS (ordenado por fecha) ───
    const comprasOrdenadas = [...ivaCompras].sort((a,b) => (a.fecha||'').localeCompare(b.fecha||''))
    seccionTitulo('LIBRO IVA COMPRAS')
    cabecera7(['Fecha','Tipo','N°','Proveedor','Neto','IVA','Total'])
    comprasOrdenadas.forEach(r => {
      fila7([
        r.fecha?.split('-').reverse().join('/') || '',
        r.tipo || '',
        String(r.numero || ''),
        (r.proveedor_nombre || '').slice(0,26),
        moneyARS(Number(r.neto)||0),
        moneyARS(Number(r.iva)||0),
        moneyARS(Number(r.total)||0),
      ])
    })
    checkPage(6)
    doc.setLineWidth(0.2); doc.setDrawColor(180,180,180)
    doc.line(pad, y2-1, W-pad, y2-1)
    fila7(['TOTAL','','','',moneyARS(totCompras.neto),moneyARS(totCompras.iva),moneyARS(totCompras.total)], true)
    y2 += 4

    // ─── SECCIÓN 6: DETALLE RETENCIONES POR TIPO ───
    if (retenciones.length > 0) {
      const RET_ORDEN_DET: [string, string][] = [
        ['iva',       'RETENCIONES IVA'],
        ['iibb',      'RETENCIONES IIBB'],
        ['ganancias', 'RETENCIONES GANANCIAS'],
        ['suss',      'RETENCIONES SUSS'],
        ['otras',     'OTRAS RETENCIONES'],
      ]
      // Anchos fijos: Fecha | Aseguradora | N° Certificado | Monto
      const COLR = [22, 80, 50, 30]
      const xOfR = COLR.reduce((acc: number[], w, i) => { acc.push((acc[i-1]||pad) + (i===0?0:COLR[i-1])); return acc }, [] as number[])

      RET_ORDEN_DET.forEach(([tipo, tituloGrupo]) => {
        const grupo = retenciones.filter(r => r.tipo === tipo).sort((a,b)=>(a.fecha||'').localeCompare(b.fecha||''))
        if (grupo.length === 0) return
        const subtotal = grupo.reduce((s,r) => s + Number(r.monto), 0)

        seccionTitulo(tituloGrupo)
        // Cabecera
        doc.setFontSize(7); doc.setFont('helvetica','bold')
        doc.text('Fecha',         xOfR[0], y2)
        doc.text('Aseguradora',   xOfR[1], y2)
        doc.text('N° Certificado',xOfR[2], y2)
        doc.text('Monto',         xOfR[3]+COLR[3], y2, {align:'right'})
        y2 += 3
        doc.setLineWidth(0.2); doc.setDrawColor(180,180,180)
        doc.line(pad, y2, W-pad, y2); y2 += 3

        grupo.forEach(r => {
          checkPage(5)
          doc.setFont('helvetica','normal'); doc.setFontSize(6.5)
          doc.text(r.fecha?.split('-').reverse().join('/') || '', xOfR[0], y2)
          doc.text(((r as any).aseguradoras?.nombre || '').slice(0,38), xOfR[1], y2)
          doc.text(r.nro_certificado || '—', xOfR[2], y2)
          doc.text(moneyARS(Number(r.monto)), xOfR[3]+COLR[3], y2, {align:'right'})
          y2 += 4
        })
        checkPage(6)
        doc.setLineWidth(0.2); doc.setDrawColor(180,180,180)
        doc.line(pad, y2-1, W-pad, y2-1)
        doc.setFont('helvetica','bold'); doc.setFontSize(7)
        doc.text('Subtotal', xOfR[2], y2+3)
        doc.text(moneyARS(subtotal), xOfR[3]+COLR[3], y2+3, {align:'right'})
        y2 += 8
      })

      // Total general retenciones
      checkPage(8)
      doc.setLineWidth(0.4); doc.setDrawColor(0,165,80)
      doc.line(pad, y2-1, W-pad, y2-1)
      doc.setFont('helvetica','bold'); doc.setFontSize(9)
      doc.text('TOTAL RETENCIONES SUFRIDAS', pad+2, y2+4)
      doc.text(moneyARS(totalRetenciones), W-pad, y2+4, {align:'right'})
      y2 += 10
    }

    // Footer en todas las páginas
    const pages = (doc as any).internal.getNumberOfPages()
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i)
      doc.setFont('helvetica','normal'); doc.setFontSize(7); doc.setTextColor(150,150,150)
      doc.text(`Página ${i} de ${pages}`, W/2, 290, {align:'center'})
      doc.text(`Generado: ${new Date().toLocaleDateString('es-AR')}`, pad, 290)
    }

    doc.save(`informe-contador-${mes}.pdf`)
  }
  const [periodoCerrado, setPeriodoCerrado] = useState(false)
  const [cerrando, setCerrando] = useState(false)

  useEffect(() => {
    supabase.from('periodos_fiscales').select('cerrado').eq('periodo', mes).maybeSingle()
      .then(({ data }) => setPeriodoCerrado(data?.cerrado ?? false))
  }, [mes])

  async function cerrarMes() {
    if (!confirm(`¿Cerrar el período ${MESES[+m-1]} ${y}? No se podrán editar ni eliminar comprobantes de compra de este mes.`)) return
    setCerrando(true)
    await supabase.from('periodos_fiscales').upsert({ periodo: mes, cerrado: true, cerrado_at: new Date().toISOString() }, { onConflict: 'periodo' })
    setPeriodoCerrado(true)
    setCerrando(false)
  }

  async function reabrirMes() {
    if (!confirm(`¿Reabrir el período ${MESES[+m-1]} ${y}? Se podrán editar comprobantes nuevamente.`)) return
    await supabase.from('periodos_fiscales').upsert({ periodo: mes, cerrado: false }, { onConflict: 'periodo' })
    setPeriodoCerrado(false)
  }

  const tabStyle = (t: string) => ({
    padding:'8px 20px', fontWeight:700, fontSize:13, cursor:'pointer', border:'none',
    borderBottom: tab===t ? '3px solid #00A550' : '3px solid transparent',
    background:'none', color: tab===t ? '#00A550' : '#6b7280',
  })

  const RET_LABELS: Record<string,string> = {
    ganancias: 'Ret. Ganancias',
    iva:       'Ret. IVA',
    iibb:      'Ret. IIBB',
    suss:      'Ret. SUSS',
    otras:     'Otras ret.',
  }

  return (
    <div>
      {/* Selector mes */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <button onClick={()=>{const d=new Date(mes+'-15');d.setUTCMonth(d.getUTCMonth()-1);setMes(d.toISOString().slice(0,7))}}
          className="border border-p-line rounded-lg px-3 py-2 hover:bg-p-light">←</button>
        <div className="font-saira font-bold text-lg text-p-ink px-3">{MESES[+m-1]} {y}</div>
        <button onClick={()=>{const d=new Date(mes+'-15');d.setUTCMonth(d.getUTCMonth()+1);setMes(d.toISOString().slice(0,7))}}
          className="border border-p-line rounded-lg px-3 py-2 hover:bg-p-light">→</button>
        <button onClick={()=>setMes(new Date().toISOString().slice(0,7))} className="text-sm text-p-green font-semibold hover:underline">Este mes</button>
        <div className="ml-auto flex items-center gap-2">
          {periodoCerrado ? (
            <>
              <span className="text-xs font-bold bg-amber-100 text-amber-700 border border-amber-200 px-3 py-1.5 rounded-lg">🔒 Período cerrado</span>
              <button onClick={reabrirMes}
                className="text-xs font-bold border border-p-line px-3 py-1.5 rounded-lg hover:bg-p-light">
                Reabrir
              </button>
            </>
          ) : (
            <button onClick={cerrarMes} disabled={cerrando}
              style={{background:'#dc2626',color:'#fff',border:'none',borderRadius:8,padding:'7px 16px',fontWeight:700,fontSize:12,cursor:'pointer',opacity:cerrando?.7:1}}>
              {cerrando ? 'Cerrando…' : `🔒 Cerrar ${MESES[+m-1]} ${y}`}
            </button>
          )}
        </div>
      </div>

      {/* KPIs IVA */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <div className="bg-white border border-p-line rounded-xl p-4 shadow-sm">
          <p className="text-[11px] font-semibold text-p-ink2 uppercase tracking-wider">IVA Débito (ventas)</p>
          <p className="font-saira font-bold text-xl text-p-ink mt-1">{moneyARS(totVentas.iva)}</p>
          <p className="text-[10px] text-p-ink2">sobre {moneyARS(totVentas.neto)} neto</p>
        </div>
        <div className="bg-white border border-p-line rounded-xl p-4 shadow-sm">
          <p className="text-[11px] font-semibold text-p-ink2 uppercase tracking-wider">IVA Crédito (compras)</p>
          <p className="font-saira font-bold text-xl text-p-ink mt-1">{moneyARS(totCompras.iva)}</p>
          <p className="text-[10px] text-p-ink2">sobre {moneyARS(totCompras.neto)} neto</p>
        </div>
        <div className="bg-white border border-p-line rounded-xl p-4 shadow-sm">
          <p className="text-[11px] font-semibold text-p-ink2 uppercase tracking-wider">Ret. IVA sufrida</p>
          <p className="font-saira font-bold text-xl text-p-green mt-1">{moneyARS(retIva)}</p>
          <p className="text-[10px] text-p-ink2">crédito adicional</p>
        </div>
        <div className={`border rounded-xl p-4 shadow-sm ${saldoIva>=0?'bg-red-50 border-red-200':'bg-green-50 border-green-200'}`}>
          <p className="text-[11px] font-semibold text-p-ink2 uppercase tracking-wider">Saldo IVA neto</p>
          <p className={`font-saira font-bold text-xl mt-1 ${saldoIva>=0?'text-red-600':'text-green-600'}`}>{moneyARS(Math.abs(saldoIva))}</p>
          <p className="text-[10px] text-p-ink2">{saldoIva>=0?'A pagar':'A favor'} · inc. ret. IVA</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-p-line mb-4 flex-wrap">
        <button style={tabStyle('iva_ventas')}  onClick={()=>setTab('iva_ventas')}>📋 Libro IVA Ventas</button>
        <button style={tabStyle('iva_compras')} onClick={()=>setTab('iva_compras')}>📋 Libro IVA Compras</button>
        <button style={tabStyle('retenciones')} onClick={()=>setTab('retenciones')}>🔖 Retenciones sufridas</button>
        <button style={tabStyle('balance')}     onClick={()=>setTab('balance')}>📊 Balance</button>
      </div>

      {loading ? <p className="text-sm text-p-gray text-center py-10">Cargando…</p> : (
        <>
          {/* Libro IVA Ventas */}
          {tab==='iva_ventas' && (
            <div className="overflow-x-auto rounded-xl border border-p-line shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-p-dark text-white">
                    <th className="text-left px-4 py-3 text-xs uppercase">Fecha</th>
                    <th className="text-left px-3 py-3 text-xs uppercase">Tipo</th>
                    <th className="text-left px-3 py-3 text-xs uppercase">N°</th>
                    <th className="text-left px-3 py-3 text-xs uppercase">Cliente / Aseguradora</th>
                    <th className="text-left px-3 py-3 text-xs uppercase">CUIT</th>
                    <th className="text-right px-3 py-3 text-xs uppercase">Neto</th>
                    <th className="text-right px-3 py-3 text-xs uppercase">IVA</th>
                    <th className="text-right px-3 py-3 text-xs uppercase">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {ivaVentas.map((r,i)=>(
                    <tr key={r.comprobante_id} className={`border-t border-p-line2 ${i%2===0?'bg-white':'bg-p-light/30'}`}>
                      <td className="px-4 py-2 font-mono text-xs">{r.fecha?.split('-').reverse().join('/')}</td>
                      <td className="px-3 py-2">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${r.tipo==='NC'?'bg-orange-100 text-orange-700':'bg-blue-100 text-blue-700'}`}>
                          {r.tipo?.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{r.numero||'—'}</td>
                      <td className="px-3 py-2 text-xs truncate max-w-[140px]">{r.cliente_nombre||'—'}</td>
                      <td className="px-3 py-2 font-mono text-xs">{r.cliente_cuit||'—'}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs">{moneyARS(Number(r.neto)||0)}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-p-ink2">{moneyARS(Number(r.iva)||0)}</td>
                      <td className="px-3 py-2 text-right font-mono font-bold text-xs">{moneyARS(Number(r.total)||0)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-p-dark text-white">
                    <td colSpan={5} className="px-4 py-3 font-bold">TOTALES</td>
                    <td className="px-3 py-3 text-right font-mono font-bold">{moneyARS(totVentas.neto)}</td>
                    <td className="px-3 py-3 text-right font-mono font-bold text-p-green">{moneyARS(totVentas.iva)}</td>
                    <td className="px-3 py-3 text-right font-mono font-bold">{moneyARS(totVentas.total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* Libro IVA Compras */}
          {tab==='iva_compras' && (
            <div className="overflow-x-auto rounded-xl border border-p-line shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-p-dark text-white">
                    <th className="text-left px-4 py-3 text-xs uppercase">Fecha</th>
                    <th className="text-left px-3 py-3 text-xs uppercase">Tipo</th>
                    <th className="text-left px-3 py-3 text-xs uppercase">N°</th>
                    <th className="text-left px-3 py-3 text-xs uppercase">Proveedor</th>
                    <th className="text-left px-3 py-3 text-xs uppercase">CUIT</th>
                    <th className="text-right px-3 py-3 text-xs uppercase">Neto</th>
                    <th className="text-right px-3 py-3 text-xs uppercase">IVA</th>
                    <th className="text-right px-3 py-3 text-xs uppercase">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {ivaCompras.map((r,i)=>(
                    <tr key={r.comprobante_compra_id} className={`border-t border-p-line2 ${i%2===0?'bg-white':'bg-p-light/30'}`}>
                      <td className="px-4 py-2 font-mono text-xs">{r.fecha?.split('-').reverse().join('/')}</td>
                      <td className="px-3 py-2"><span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">{r.letra||''}{r.punto_venta?`-${r.punto_venta}`:''}</span></td>
                      <td className="px-3 py-2 font-mono text-xs">{r.numero||'—'}</td>
                      <td className="px-3 py-2 text-xs truncate max-w-[140px]">{r.proveedor_nombre||'—'}</td>
                      <td className="px-3 py-2 font-mono text-xs">{r.proveedor_cuit||'—'}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs">{moneyARS(Number(r.neto)||0)}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-p-ink2">{moneyARS(Number(r.iva)||0)}</td>
                      <td className="px-3 py-2 text-right font-mono font-bold text-xs">{moneyARS(Number(r.total)||0)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-p-dark text-white">
                    <td colSpan={5} className="px-4 py-3 font-bold">TOTALES</td>
                    <td className="px-3 py-3 text-right font-mono font-bold">{moneyARS(totCompras.neto)}</td>
                    <td className="px-3 py-3 text-right font-mono font-bold text-p-green">{moneyARS(totCompras.iva)}</td>
                    <td className="px-3 py-3 text-right font-mono font-bold">{moneyARS(totCompras.total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* Retenciones sufridas */}
          {tab==='retenciones' && (
            <div className="flex flex-col gap-5">
              {/* Resumen por tipo */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {Object.entries(RET_LABELS).map(([tipo, label])=>(
                  <div key={tipo} className="bg-white border border-p-line rounded-xl p-3 shadow-sm">
                    <p className="text-[10px] font-semibold text-p-ink2 uppercase tracking-wider">{label}</p>
                    <p className={`font-saira font-bold text-lg mt-0.5 ${totRet[tipo]>0?'text-red-600':'text-p-ink2'}`}>
                      {moneyARS(totRet[tipo]||0)}
                    </p>
                  </div>
                ))}
              </div>

              {/* Tabla detalle */}
              {retenciones.length===0
                ? <p className="text-sm text-p-gray text-center py-8">Sin retenciones en {MESES[+m-1]} {y}</p>
                : (
                  <div className="overflow-x-auto rounded-xl border border-p-line shadow-sm">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-p-dark text-white">
                          <th className="text-left px-4 py-3 text-xs uppercase">Fecha</th>
                          <th className="text-left px-3 py-3 text-xs uppercase">Aseguradora</th>
                          <th className="text-left px-3 py-3 text-xs uppercase">Tipo</th>
                          <th className="text-left px-3 py-3 text-xs uppercase">N° Certificado</th>
                          <th className="text-right px-3 py-3 text-xs uppercase">Base imponible</th>
                          <th className="text-right px-3 py-3 text-xs uppercase">Monto retenido</th>
                        </tr>
                      </thead>
                      <tbody>
                        {retenciones.map((r,i)=>(
                          <tr key={r.id} className={`border-t border-p-line2 ${i%2===0?'bg-white':'bg-p-light/30'}`}>
                            <td className="px-4 py-2 font-mono text-xs">{r.fecha?.split('-').reverse().join('/')}</td>
                            <td className="px-3 py-2 text-xs truncate max-w-[160px]">{(r.aseguradoras as any)?.nombre||'—'}</td>
                            <td className="px-3 py-2">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                r.tipo==='iva'       ? 'bg-blue-100 text-blue-700' :
                                r.tipo==='ganancias' ? 'bg-purple-100 text-purple-700' :
                                r.tipo==='iibb'      ? 'bg-amber-100 text-amber-700' :
                                'bg-gray-100 text-gray-600'
                              }`}>
                                {RET_LABELS[r.tipo] || r.tipo}
                              </span>
                            </td>
                            <td className="px-3 py-2 font-mono text-xs">{r.nro_certificado||'—'}</td>
                            <td className="px-3 py-2 text-right font-mono text-xs text-p-ink2">{r.base_imponible?moneyARS(Number(r.base_imponible)):'—'}</td>
                            <td className="px-3 py-2 text-right font-mono font-bold text-xs text-red-600">{moneyARS(Number(r.monto))}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-p-dark text-white">
                          <td colSpan={5} className="px-4 py-3 font-bold">TOTAL RETENIDO</td>
                          <td className="px-3 py-3 text-right font-mono font-bold text-red-300">
                            {moneyARS(totalRetenciones)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )
              }

              {/* Para el contador */}
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
                <h3 className="font-saira font-bold text-amber-800 mb-3">📋 Para el contador — {MESES[+m-1]} {y}</h3>
                <div className="bg-white rounded-lg p-3 font-mono text-xs space-y-1 text-p-dark">
                  <p>Período: {MESES[+m-1]} {y}</p>
                  {Object.entries(RET_LABELS).map(([tipo, label])=>
                    (totRet[tipo]||0)>0 ? <p key={tipo}>{label}: {moneyARS(totRet[tipo])}</p> : null
                  )}
                  <p className="font-bold border-t pt-1 mt-1">Total retenciones: {moneyARS(totalRetenciones)}</p>
                </div>
                <button onClick={()=>{
                  const lines = [`RETENCIONES SUFRIDAS — ${MESES[+m-1]} ${y}`]
                  Object.entries(RET_LABELS).forEach(([tipo,label])=>{ if((totRet[tipo]||0)>0) lines.push(`${label}: ${moneyARS(totRet[tipo])}`) })
                  lines.push(`TOTAL: ${moneyARS(totalRetenciones)}`)
                  copiarTexto(lines.join('\n'))
                }} style={{marginTop:12,background:'#92400e',color:'#fff',border:'none',borderRadius:8,padding:'8px 16px',fontWeight:700,fontSize:12,cursor:'pointer',width:'100%'}}>
                  📋 Copiar resumen retenciones
                </button>
              </div>
            </div>
          )}

          {/* Balance */}
          {tab==='balance' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="bg-white border border-p-line rounded-xl p-5 shadow-sm">
                <h3 className="font-saira font-bold text-p-ink mb-4">Resumen del mes</h3>
                <div className="flex flex-col gap-3">
                  {[
                    {label:'Ventas brutas',      val:totVentas.total,   color:'text-p-green'},
                    {label:'IVA Débito fiscal',  val:totVentas.iva,     color:'text-red-500'},
                    {label:'Ventas netas',        val:totVentas.neto,    color:'text-p-dark'},
                    {label:'Compras brutas',      val:totCompras.total,  color:'text-amber-600'},
                    {label:'IVA Crédito fiscal',  val:totCompras.iva,    color:'text-p-green'},
                    {label:'Ret. IVA sufrida',    val:retIva,            color:'text-p-green'},
                    {label:'Compras netas',       val:totCompras.neto,   color:'text-p-dark'},
                  ].map(r=>(
                    <div key={r.label} className="flex justify-between items-center py-2 border-b border-p-line2">
                      <span className="text-sm text-p-ink">{r.label}</span>
                      <span className={`font-mono font-bold ${r.color}`}>{moneyARS(r.val)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between items-center pt-2 border-t-2 border-p-dark">
                    <span className="font-bold text-p-dark">Resultado bruto</span>
                    <span className={`font-mono font-bold text-xl ${totVentas.neto-totCompras.neto>=0?'text-p-green':'text-red-500'}`}>
                      {moneyARS(totVentas.neto - totCompras.neto)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-p-ink2">Saldo IVA neto ({saldoIva>=0?'a pagar':'a favor'})</span>
                    <span className={`font-mono font-bold ${saldoIva>=0?'text-red-500':'text-p-green'}`}>{moneyARS(Math.abs(saldoIva))}</span>
                  </div>
                  {(totRet['ganancias']||0)>0 && (
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-p-ink2">Ret. Ganancias sufrida</span>
                      <span className="font-mono font-bold text-purple-600">{moneyARS(totRet['ganancias'])}</span>
                    </div>
                  )}
                  {(totRet['iibb']||0)>0 && (
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-p-ink2">Ret. IIBB sufrida</span>
                      <span className="font-mono font-bold text-amber-600">{moneyARS(totRet['iibb'])}</span>
                    </div>
                  )}
                </div>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
                <h3 className="font-saira font-bold text-amber-800 mb-3">📋 Para el contador</h3>
                <div className="bg-white rounded-lg p-3 font-mono text-xs space-y-1 text-p-dark">
                  <p>Período: {MESES[+m-1]} {y}</p>
                  <p>Ventas totales: {moneyARS(totVentas.total)}</p>
                  <p>IVA débito: {moneyARS(totVentas.iva)}</p>
                  <p>Compras totales: {moneyARS(totCompras.total)}</p>
                  <p>IVA crédito compras: {moneyARS(totCompras.iva)}</p>
                  {retIva>0 && <p>Ret. IVA sufrida: {moneyARS(retIva)}</p>}
                  <p className="font-bold">Saldo IVA neto: {moneyARS(saldoIva)} ({saldoIva>=0?'A PAGAR':'A FAVOR'})</p>
                  {(totRet['ganancias']||0)>0 && <p>Ret. Ganancias: {moneyARS(totRet['ganancias'])}</p>}
                  {(totRet['iibb']||0)>0     && <p>Ret. IIBB: {moneyARS(totRet['iibb'])}</p>}
                </div>
                <button onClick={()=>{
                  const lines = [
                    `PERÍODO: ${MESES[+m-1]} ${y}`,
                    `VENTAS: ${moneyARS(totVentas.total)} (IVA débito: ${moneyARS(totVentas.iva)})`,
                    `COMPRAS: ${moneyARS(totCompras.total)} (IVA crédito: ${moneyARS(totCompras.iva)})`,
                    retIva>0 ? `RET. IVA SUFRIDA: ${moneyARS(retIva)}` : '',
                    `SALDO IVA NETO: ${moneyARS(saldoIva)} (${saldoIva>=0?'A PAGAR':'A FAVOR'})`,
                    (totRet['ganancias']||0)>0 ? `RET. GANANCIAS: ${moneyARS(totRet['ganancias'])}` : '',
                    (totRet['iibb']||0)>0      ? `RET. IIBB: ${moneyARS(totRet['iibb'])}` : '',
                  ].filter(Boolean)
                  copiarTexto(lines.join('\n'))
                }} style={{marginTop:12,background:'#92400e',color:'#fff',border:'none',borderRadius:8,padding:'8px 16px',fontWeight:700,fontSize:12,cursor:'pointer',width:'100%'}}>
                  📋 Copiar resumen completo
                </button>
                <button onClick={generarPDFContador} style={{marginTop:8,background:'#1d4ed8',color:'#fff',border:'none',borderRadius:8,padding:'8px 16px',fontWeight:700,fontSize:12,cursor:'pointer',width:'100%'}}>
                  ⬇ Descargar PDF Contador
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
