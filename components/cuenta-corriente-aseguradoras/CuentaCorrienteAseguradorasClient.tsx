'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Modal, Field, Input, Empty } from '@/components/ui'
import { moneyARS2 as moneyARS, todayStr } from '@/lib/utils/format'

const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
const FORMAS = ['Transferencia','Multipay','Cheque','Efectivo','Otro']

interface CuentaBanco { id:string; banco:string; tipo:string; cbu:string|null; nro_cuenta:string|null; alias:string|null }
const RET_KEYS = [
  { key:'ret_ganancias', label:'Ret. Ganancias' },
  { key:'ret_iva',       label:'Ret. IVA' },
  { key:'ret_iibb',      label:'Ret. IIBB' },
  { key:'ret_suss',      label:'Ret. SUSS' },
  { key:'ret_otras',     label:'Otras ret.' },
]

interface Saldo { aseguradora_id:string; nombre:string; total_debe:number; total_haber:number; saldo:number; facturas:number }
interface Mov { id:string; fecha:string; tipo:string; descripcion:string; debe:number; haber:number; notas:string|null; comprobante_id:string|null }
interface FacturaPendiente { id:string; numero:number; fecha:string; total:number; nro_cbte_afip:number|null }
interface Retencion { tipo:string; label:string; monto:string; nro_cert:string; base:string }
interface CobroDetalle { id:string; fecha:string; forma_cobro:string; banco:string|null; referencia:string|null; nro_op:string|null; monto_bruto:number; ret_ganancias:number; ret_iva:number; ret_iibb:number; ret_suss:number; ret_otras:number; monto_neto:number; aseguradora_id:string; aseguradora_nombre?:string; facturas?:any[] }

const btn     = { background:'#00A550',color:'#fff',border:'none',borderRadius:10,padding:'10px 20px',fontWeight:700,fontSize:14,cursor:'pointer' } as const
const btnSm   = { ...btn, padding:'7px 14px', fontSize:12 } as const
const btnGray = { ...btnSm, background:'#6b7280' } as const

function toNum(s:string){ return parseFloat((s||'0').replace(',','.')) || 0 }

export default function CuentaCorrienteAseguradorasClient() {
  const [tab, setTab] = useState<'saldos'|'liquidaciones'|'pendientes'>('saldos')

  // ── TAB PENDIENTES DE COBRO ──
  const [factPendientes, setFactPendientes] = useState<any[]>([])
  const [loadingPend, setLoadingPend] = useState(false)

  const [saldos, setSaldos]       = useState<Saldo[]>([])
  const [sel, setSel]             = useState<Saldo|null>(null)
  const [movs, setMovs]           = useState<Mov[]>([])
  const [cobrosMap, setCobrosMap] = useState<Record<string,CobroDetalle>>({})
  const [expandedMov, setExpandedMov] = useState<string|null>(null)
  const [q, setQ]                 = useState('')
  const [loading, setLoading]     = useState(false)

  // Modal nuevo cobro
  const [cobroModal, setCobroModal]   = useState(false)
  const [cobroLibre, setCobroLibre]   = useState(false) // sin aseguradora preseleccionada
  const [asegLibreId, setAsegLibreId] = useState('')
  const [comentario, setComentario]   = useState('')
  const [esACuenta, setEsACuenta]     = useState(false)
  const [montoACuenta, setMontoACuenta] = useState('')
  const [cuentasBanco, setCuentasBanco] = useState<CuentaBanco[]>([])
  const [cuentaSelId, setCuentaSelId] = useState('')
  const [facturasPend, setFacturasPend] = useState<FacturaPendiente[]>([])
  const [factSel, setFactSel]         = useState<Record<string,boolean>>({})
  const [forma, setForma]             = useState('Transferencia')
  const [banco, setBanco]             = useState('')
  const [cbu, setCbu]                 = useState('')
  const [ref, setRef]                 = useState('')
  const [nroOp, setNroOp]             = useState('')
  const [fechaCobro, setFechaCobro]   = useState(todayStr())
  const [retenciones, setRetenciones] = useState<Retencion[]>([
    { tipo:'ret_ganancias', label:'Ret. Ganancias', monto:'', nro_cert:'', base:'' },
    { tipo:'ret_iva',       label:'Ret. IVA',       monto:'', nro_cert:'', base:'' },
    { tipo:'ret_iibb',      label:'Ret. IIBB',      monto:'', nro_cert:'', base:'' },
    { tipo:'ret_suss',      label:'Ret. SUSS',      monto:'', nro_cert:'', base:'' },
    { tipo:'ret_otras',     label:'Otras ret.',     monto:'', nro_cert:'', base:'' },
  ])
  const [savingCobro, setSavingCobro] = useState(false)

  // Modal editar cobro
  const [editCobro, setEditCobro]   = useState<CobroDetalle|null>(null)
  const [editForm, setEditForm]     = useState<any>({})
  const [savingEdit, setSavingEdit] = useState(false)

  // ── TAB LIQUIDACIONES ──
  const [mes, setMes]           = useState(new Date().toISOString().slice(0,7))
  const [cobros, setCobros]     = useState<CobroDetalle[]>([])
  const [loadingLiq, setLoadingLiq] = useState(false)
  const [expandedLiq, setExpandedLiq] = useState<string|null>(null)

  const supabase = createClient()

  useEffect(() => {
    if (tab !== 'pendientes') return
    setLoadingPend(true)
    // Traer solo facturas con saldo pendiente en CC (debe > haber por comprobante)
    supabase.from('cuenta_corriente_aseguradoras')
      .select('comprobante_id, debe, haber')
      .not('comprobante_id', 'is', null)
      .then(async ({ data: movs }) => {
        const saldoPorComp = new Map<string, number>()
        for (const m of (movs ?? []) as any[]) {
          saldoPorComp.set(m.comprobante_id, (saldoPorComp.get(m.comprobante_id) || 0) + (+m.debe) - (+m.haber))
        }
        const ids = [...saldoPorComp.entries()].filter(([, s]) => s > 0.01).map(([id]) => id)
        if (!ids.length) { setFactPendientes([]); setLoadingPend(false); return }
        const { data } = await supabase.from('comprobantes')
          .select('id,fecha,nro_cbte_afip,aseguradora_nombre,aseguradora_id,cliente_nombre,total,neto,iva')
          .in('id', ids)
          .not('es_negro', 'is', true)
          .neq('categoria', 'nc')
          .order('fecha', { ascending: true })
        setFactPendientes(data ?? [])
        setLoadingPend(false)
      })
  }, [tab])

  useEffect(() => {
    loadSaldos()
    supabase.from('cuentas_banco').select('id,banco,tipo,cbu,nro_cuenta,alias').eq('activo',true).order('banco')
      .then(({data})=>setCuentasBanco(data??[]))
  }, [])
  useEffect(() => { if (tab==='liquidaciones') loadLiquidaciones() }, [tab, mes])

  // Cargar facturas pendientes cuando se selecciona aseguradora en modo libre
  useEffect(() => {
    if (!cobroLibre || !asegLibreId) { setFacturasPend([]); setFactSel({}); return }
    supabase.from('cuenta_corriente_aseguradoras').select('comprobante_id,debe,haber').eq('aseguradora_id', asegLibreId)
      .then(async ({data: movsCc}) => {
        const saldoPorComp = new Map<string,number>()
        for (const m of (movsCc??[]) as any[]) {
          if (!m.comprobante_id) continue
          saldoPorComp.set(m.comprobante_id, (saldoPorComp.get(m.comprobante_id)||0) + (+m.debe) - (+m.haber))
        }
        const ids = [...saldoPorComp.entries()].filter(([,s])=>s>0).map(([id])=>id)
        if (!ids.length) { setFacturasPend([]); setFactSel({}); return }
        const { data: comps } = await supabase.from('comprobantes').select('id,numero,fecha,total,nro_cbte_afip').in('id',ids).order('fecha')
        const pend: FacturaPendiente[] = (comps??[]).map((c:any)=>({...c, total: saldoPorComp.get(c.id)||c.total}))
        setFacturasPend(pend)
        const sel2: Record<string,boolean> = {}
        pend.forEach(f=>sel2[f.id]=true)
        setFactSel(sel2)
      })
  }, [asegLibreId, cobroLibre])

  // ── SALDOS ──
  async function loadSaldos() {
    const [{ data: movsData }, { data: asegRows }] = await Promise.all([
      supabase.from('cuenta_corriente_aseguradoras').select('aseguradora_id,debe,haber,tipo'),
      supabase.from('aseguradoras').select('id,nombre'),
    ])
    if (!movsData) return
    const nombreMap = new Map((asegRows??[]).map((a:any) => [a.id, a.nombre]))
    const map = new Map<string,Saldo>()
    for (const r of movsData as any[]) {
      const id = r.aseguradora_id
      if (!map.has(id)) map.set(id, { aseguradora_id:id, nombre:nombreMap.get(id)||'', total_debe:0, total_haber:0, saldo:0, facturas:0 })
      const s = map.get(id)!
      s.total_debe  += +r.debe
      s.total_haber += +r.haber
      if (r.tipo==='factura') s.facturas++
    }
    setSaldos([...map.values()].map(s=>({...s,saldo:s.total_debe-s.total_haber})).sort((a,b)=>b.saldo-a.saldo))
  }

  async function loadMovs(asegId:string) {
    setLoading(true)
    const [{ data: movsData }, { data: cobrosData }] = await Promise.all([
      supabase.from('cuenta_corriente_aseguradoras').select('*').eq('aseguradora_id',asegId).order('fecha',{ascending:false}).order('created_at',{ascending:false}),
      supabase.from('cobros_aseguradoras').select('*').eq('aseguradora_id',asegId),
    ])
    // Calcular saldo por comprobante_id para ocultar facturas saldadas
    const saldoComp = new Map<string,number>()
    for (const m of (movsData??[]) as any[]) {
      if (!m.comprobante_id) continue
      saldoComp.set(m.comprobante_id, (saldoComp.get(m.comprobante_id)||0) + (+m.debe) - (+m.haber))
    }
    setMovs((movsData??[]).map((m:any) => ({
      ...m,
      _saldo_comp: m.comprobante_id ? (saldoComp.get(m.comprobante_id)??+m.debe) : +m.debe
    })))
    const map: Record<string,CobroDetalle> = {}
    for (const mov of (movsData??[]) as any[]) {
      if (+mov.haber<=0) continue
      const cobro = (cobrosData??[]).find((c:any)=>c.fecha===mov.fecha && Math.abs(+c.monto_bruto - +mov.haber)<1)
      if (cobro) map[mov.id] = cobro
    }
    setCobrosMap(map)
    setLoading(false)
  }

  function seleccionar(s:Saldo) {
    if (sel?.aseguradora_id===s.aseguradora_id) { setSel(null); setMovs([]); return }
    setSel(s); loadMovs(s.aseguradora_id)
  }

  async function abrirCobro() {
    if (!sel) return
    const { data: movsCc } = await supabase.from('cuenta_corriente_aseguradoras').select('comprobante_id,debe,haber').eq('aseguradora_id',sel.aseguradora_id)
    const saldoPorComp = new Map<string,number>()
    for (const m of (movsCc??[]) as any[]) {
      if (!m.comprobante_id) continue
      saldoPorComp.set(m.comprobante_id, (saldoPorComp.get(m.comprobante_id)||0) + (+m.debe) - (+m.haber))
    }
    const ids = [...saldoPorComp.entries()].filter(([,s])=>s>0).map(([id])=>id)
    if (!ids.length) { setFacturasPend([]); setFactSel({}); setCobroModal(true); return }
    const { data: comps } = await supabase.from('comprobantes').select('id,numero,fecha,total,nro_cbte_afip').in('id',ids).order('fecha')
    const pend: FacturaPendiente[] = (comps??[]).map((c:any)=>({...c, total: saldoPorComp.get(c.id)||c.total}))
    setFacturasPend(pend)
    const sel2: Record<string,boolean> = {}
    pend.forEach(f=>sel2[f.id]=true)
    setFactSel(sel2)
    setCobroModal(true)
  }

  function abrirCobroLibre() {
    setCobroLibre(true)
    setAsegLibreId('')
    setComentario('')
    setFacturasPend([])
    setFactSel({})
    setEsACuenta(true) // por defecto a cuenta ya que las facturas están en otro sistema
    setMontoACuenta('')
    setCuentaSelId('')
    setForma('Transferencia')
    setFechaCobro(todayStr())
    setRetenciones(prev=>prev.map(r=>({...r,monto:'',nro_cert:'',base:''})))
    setCobroModal(true)
  }

  const montoFactSel  = facturasPend.filter(f=>factSel[f.id]).reduce((a,f)=>a+f.total,0)
  const totalRet      = retenciones.reduce((a,r)=>a+toNum(r.monto),0)
  const montoNeto     = montoFactSel - totalRet

  function updRet(tipo:string, field:string, value:string) {
    setRetenciones(prev=>prev.map(r=>r.tipo===tipo?{...r,[field]:value}:r))
  }

  async function confirmarCobro() {
    const asegId = cobroLibre ? asegLibreId : sel?.aseguradora_id
    const asegNombre = cobroLibre ? (saldos.find(s=>s.aseguradora_id===asegLibreId)?.nombre || asegLibreId) : sel?.nombre
    if (!asegId || !asegNombre) return
    const factsSel = facturasPend.filter(f=>factSel[f.id])
    // Si no seleccionó facturas → automáticamente a cuenta
    const esACuentaFinal = factsSel.length === 0
    const montoBase = esACuentaFinal ? +montoACuenta.replace(',','.') : montoFactSel
    if (montoBase <= 0) return
    setSavingCobro(true)
    const totalRetLocal = retenciones.reduce((a,r)=>a+toNum(r.monto),0)
    const neto = montoBase - totalRetLocal
    const cuentaSel = cuentasBanco.find(c=>c.id===cuentaSelId)
    const { data: cobro } = await supabase.from('cobros_aseguradoras').insert({
      aseguradora_id: asegId, fecha: fechaCobro,
      forma_cobro: forma,
      banco: cuentaSel?.banco || banco||null,
      cbu: cuentaSel?.cbu || cbu||null,
      referencia: ref||null, nro_op: nroOp||null,
      monto_bruto: montoBase,
      ret_ganancias: toNum(retenciones.find(r=>r.tipo==='ret_ganancias')?.monto||''),
      ret_iva:       toNum(retenciones.find(r=>r.tipo==='ret_iva')?.monto||''),
      ret_iibb:      toNum(retenciones.find(r=>r.tipo==='ret_iibb')?.monto||''),
      ret_suss:      toNum(retenciones.find(r=>r.tipo==='ret_suss')?.monto||''),
      ret_otras:     toNum(retenciones.find(r=>r.tipo==='ret_otras')?.monto||''),
      monto_neto: neto, es_a_cuenta: esACuentaFinal,
      monto_a_cuenta: esACuentaFinal ? montoBase : null, notas: comentario||null,
    }).select('id').single()
    if (!cobro) { setSavingCobro(false); return }
    if (!esACuentaFinal && factsSel.length > 0)
      await supabase.from('cobros_aseguradoras_facturas').insert(factsSel.map(f=>({ cobro_id:cobro.id, comprobante_id:f.id, monto:f.total })))
    const cuentaLabel = cuentaSel ? ` → ${cuentaSel.banco} ···${(cuentaSel.cbu||cuentaSel.nro_cuenta||'').slice(-5)}` : ''
    const desc = esACuentaFinal
      ? `Pago a cuenta — OP ${nroOp||ref||'s/n'}${cuentaLabel}${comentario ? ` · ${comentario}` : ''}`
      : `Cobro OP ${nroOp||ref||'s/n'} — ${factsSel.length} fact.${cuentaLabel}${comentario ? ` · ${comentario}` : ''}`
    // Insertar haber por cada factura cancelada con su comprobante_id para que el saldo por comprobante se cancele correctamente
    if (!esACuentaFinal && factsSel.length > 0) {
      await supabase.from('cuenta_corriente_aseguradoras').insert(
        factsSel.map(f => ({
          aseguradora_id: asegId, fecha: fechaCobro, tipo: 'cobro',
          descripcion: desc, debe: 0, haber: f.total,
          comprobante_id: f.id,
        }))
      )
    } else {
      // Pago a cuenta — sin comprobante
      await supabase.from('cuenta_corriente_aseguradoras').insert({
        aseguradora_id: asegId, fecha: fechaCobro, tipo: 'cobro',
        descripcion: desc, debe: 0, haber: montoBase,
      })
    }
    const retsConMonto = retenciones.filter(r=>toNum(r.monto)>0)
    if (retsConMonto.length) {
      await supabase.from('retenciones_sufridas').insert(retsConMonto.map(r=>({
        cobro_id: cobro.id, aseguradora_id: asegId, fecha: fechaCobro,
        tipo: r.tipo.replace('ret_',''), nro_certificado: r.nro_cert||null, monto: toNum(r.monto), base_imponible: toNum(r.base)||null,
      })))
    }
    if (cuentaSelId && montoBase > 0) {
      await supabase.from('movimientos_banco').insert({
        cuenta_id: cuentaSelId, fecha: fechaCobro, tipo: 'credito',
        concepto: `${esACuentaFinal?'Pago a cuenta':'Cobro'} — ${asegNombre} OP ${nroOp||ref||'s/n'}`,
        monto: neto, conciliado: false, origen_tipo: 'cobro_aseguradora',
        notas: comentario||null,
      })
    }
    setCobroModal(false)
    setCobroLibre(false); setAsegLibreId(''); setComentario('')
    setEsACuenta(false); setMontoACuenta(''); setCuentaSelId('')
    setForma('Transferencia'); setBanco(''); setCbu(''); setRef(''); setNroOp(''); setFechaCobro(todayStr())
    setRetenciones(prev=>prev.map(r=>({...r,monto:'',nro_cert:'',base:''})))
    setSavingCobro(false)
    loadSaldos(); if(sel) loadMovs(sel.aseguradora_id)
  }

  async function abrirEditCobro(mov:Mov) {
    const cobro = cobrosMap[mov.id]
    if (!cobro) return
    setEditCobro(cobro)
    setEditForm({
      ret_ganancias: String(cobro.ret_ganancias||''),
      ret_iva:       String(cobro.ret_iva||''),
      ret_iibb:      String(cobro.ret_iibb||''),
      ret_suss:      String(cobro.ret_suss||''),
      ret_otras:     String(cobro.ret_otras||''),
      monto_neto:    String(cobro.monto_neto||''),
      referencia:    cobro.referencia||'',
      nro_op:        cobro.nro_op||'',
    })
  }

  async function guardarEditCobro() {
    if (!editCobro||!sel) return
    setSavingEdit(true)
    const totalRetEdit = RET_KEYS.reduce((a,r)=>a+toNum(editForm[r.key]||''),0)
    const neto = toNum(editForm.monto_neto) || (editCobro.monto_bruto - totalRetEdit)
    await supabase.from('cobros_aseguradoras').update({
      ret_ganancias: toNum(editForm.ret_ganancias||''),
      ret_iva:       toNum(editForm.ret_iva||''),
      ret_iibb:      toNum(editForm.ret_iibb||''),
      ret_suss:      toNum(editForm.ret_suss||''),
      ret_otras:     toNum(editForm.ret_otras||''),
      monto_neto:    neto,
      referencia:    editForm.referencia||null,
      nro_op:        editForm.nro_op||null,
    }).eq('id',editCobro.id)
    await supabase.from('retenciones_sufridas').delete().eq('cobro_id',editCobro.id)
    const rets = RET_KEYS.filter(r=>toNum(editForm[r.key]||'')>0)
    if (rets.length) {
      await supabase.from('retenciones_sufridas').insert(rets.map(r=>({
        cobro_id: editCobro.id, aseguradora_id: sel.aseguradora_id,
        fecha: editCobro.fecha, tipo: r.key.replace('ret_',''), monto: toNum(editForm[r.key]||''),
      })))
    }
    setEditCobro(null)
    setSavingEdit(false)
    loadMovs(sel.aseguradora_id)
  }

  // ── LIQUIDACIONES ──
  async function loadLiquidaciones() {
    setLoadingLiq(true)
    const mesStart = mes+'-01', mesEnd = mes+'-31'
    const [{ data: cobrosData }, { data: asegRows }, { data: factsData }] = await Promise.all([
      supabase.from('cobros_aseguradoras').select('*').gte('fecha',mesStart).lte('fecha',mesEnd).order('fecha',{ascending:false}),
      supabase.from('aseguradoras').select('id,nombre'),
      supabase.from('cobros_aseguradoras_facturas').select('cobro_id,monto,comprobantes(numero,nro_cbte_afip,aseguradora_nombre,cliente_nombre)'),
    ])
    const nombreMap = new Map((asegRows??[]).map((a:any)=>[a.id,a.nombre]))
    const factsMap = new Map<string,any[]>()
    for (const f of (factsData??[]) as any[]) {
      if (!factsMap.has(f.cobro_id)) factsMap.set(f.cobro_id,[])
      factsMap.get(f.cobro_id)!.push(f)
    }
    setCobros((cobrosData??[]).map((c:any)=>({
      ...c,
      aseguradora_nombre: nombreMap.get(c.aseguradora_id)||'—',
      facturas: factsMap.get(c.id)||[],
    })))
    setLoadingLiq(false)
  }

  const totales = cobros.reduce((a,c)=>({
    bruto:     a.bruto     + +c.monto_bruto,
    ganancias: a.ganancias + +c.ret_ganancias,
    iva:       a.iva       + +c.ret_iva,
    iibb:      a.iibb      + +c.ret_iibb,
    suss:      a.suss      + +c.ret_suss,
    otras:     a.otras     + +c.ret_otras,
    neto:      a.neto      + +c.monto_neto,
  }),{bruto:0,ganancias:0,iva:0,iibb:0,suss:0,otras:0,neto:0})

  const filtrados = saldos.filter(s=>!q||s.nombre.toLowerCase().includes(q.toLowerCase()))
  const totalPendiente = saldos.reduce((a,s)=>a+Math.max(0,s.saldo),0)
  const [y,m2] = mes.split('-')
  const tabStyle = (t:string) => ({
    padding:'8px 20px', fontWeight:700, fontSize:13, cursor:'pointer', border:'none',
    borderBottom: tab===t?'3px solid #00A550':'3px solid transparent',
    background:'none', color: tab===t?'#00A550':'#6b7280',
  })

  return (
    <div>
      {/* Tabs */}
      <div className="flex border-b border-p-line mb-5">
        <button style={tabStyle('saldos')} onClick={()=>setTab('saldos')}>💳 Saldos pendientes</button>
        <button style={tabStyle('liquidaciones')} onClick={()=>setTab('liquidaciones')}>📋 Liquidaciones cobradas</button>
        <button style={tabStyle('pendientes')} onClick={()=>setTab('pendientes')}>🧾 Facturas pendientes de cobro</button>
      </div>

      {/* ── TAB SALDOS ── */}
      {tab==='saldos' && (
        <div style={{display:'grid',gridTemplateColumns:'260px 1fr',gap:16,alignItems:'start'}}>
          {/* Lista compacta aseguradoras */}
          <div style={{display:'flex',flexDirection:'column',gap:6}}>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6,marginBottom:4}}>
              <div className="bg-white border border-p-line rounded-xl p-3">
                <p className="text-[10px] font-semibold text-p-ink2 uppercase tracking-wider">Pendiente cobro</p>
                <p className="font-saira font-bold text-base text-red-500 mt-0.5">{moneyARS(totalPendiente)}</p>
              </div>
              <div className="bg-white border border-p-line rounded-xl p-3">
                <p className="text-[10px] font-semibold text-p-ink2 uppercase tracking-wider">Compañías</p>
                <p className="font-saira font-bold text-base text-p-dark mt-0.5">{saldos.filter(s=>s.saldo>0).length}</p>
              </div>
            </div>

            <div className="flex gap-2 mb-1">
              <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar…"
                className="flex-1 border border-p-line rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-p-green bg-white"/>
              <button onClick={abrirCobroLibre} style={{background:'#00A550',color:'#fff',border:'none',borderRadius:8,padding:'6px 12px',fontWeight:700,fontSize:12,cursor:'pointer',whiteSpace:'nowrap'}}>
                + Liquidación
              </button>
            </div>

            <div className="flex flex-col gap-1.5">
              {filtrados.filter(s=>s.saldo>0).map(s=>(
                <div key={s.aseguradora_id}
                  onClick={()=>seleccionar(s)}
                  className={`bg-white border rounded-lg px-3 py-2.5 cursor-pointer transition-all ${sel?.aseguradora_id===s.aseguradora_id?'border-p-green ring-1 ring-green-200 bg-green-50/20':'border-p-line hover:border-p-green'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-p-ink truncate">{s.nombre}</p>
                      <p className="text-[10px] text-p-ink2">{s.facturas} fact. · {moneyARS(s.total_haber)} cobrado</p>
                    </div>
                    <p className="text-sm font-bold text-red-500 shrink-0">{moneyARS(s.saldo)}</p>
                  </div>
                </div>
              ))}
              {filtrados.filter(s=>s.saldo>0).length===0 && <Empty msg="No hay saldos pendientes."/>}
            </div>
          </div>

          {/* Panel detalle aseguradora */}
          {sel ? (
            <div style={{display:'flex',flexDirection:'column',gap:10}}>
              {/* Header */}
              <div className="bg-white border border-p-line rounded-xl px-4 py-3 flex items-center justify-between gap-3">
                <div>
                  <p className="font-saira font-bold text-p-ink text-base">{sel.nombre}</p>
                  <p className="text-[10px] text-p-ink2">Facturado {moneyARS(sel.total_debe)} · Cobrado {moneyARS(sel.total_haber)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <p className="font-bold text-lg text-red-500">Debe {moneyARS(sel.saldo)}</p>
                  <button onClick={abrirCobro} style={{background:'#00A550',color:'#fff',border:'none',borderRadius:8,padding:'7px 14px',fontWeight:700,fontSize:12,cursor:'pointer',whiteSpace:'nowrap'}}>
                    💵 Cobrar
                  </button>
                  <button onClick={()=>setSel(null)} className="text-p-gray text-lg leading-none">✕</button>
                </div>
              </div>

              {/* Movimientos */}
              <div className="bg-white border border-p-line rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-p-line bg-p-light/50">
                  <span className="text-xs font-semibold text-p-ink">Movimientos</span>
                  <span className="text-[10px] text-p-ink2">{movs.length} registros</span>
                </div>
                {loading ? <p className="text-sm text-p-gray py-4 text-center">Cargando…</p> : (
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-p-ink2 font-semibold border-b border-p-line">
                            <th className="text-left py-1.5 w-24">Fecha</th>
                            <th className="text-left py-1.5">Descripción</th>
                            <th className="text-right py-1.5 text-red-500">Debe</th>
                            <th className="text-right py-1.5 text-green-600">Haber</th>
                          </tr>
                        </thead>
                        <tbody>
                          {movs.filter((m:any) => m._saldo_comp !== 0).map(m=>(
                            <>
                              <tr key={m.id}
                                className={`border-b border-p-line2 ${m.haber>0?'cursor-pointer hover:bg-green-50/40':''}`}
                                onClick={()=>m.haber>0&&setExpandedMov(expandedMov===m.id?null:m.id)}>
                                <td className="py-2 font-mono text-p-ink2 align-top">{m.fecha.split('-').reverse().join('/')}</td>
                                <td className="py-2 text-p-ink align-top">
                                  <div className="flex items-center gap-1.5">
                                    {m.haber>0 && <span className="text-[9px] text-p-ink2">{expandedMov===m.id?'▼':'▶'}</span>}
                                    <span>{m.descripcion}</span>
                                    {(cobrosMap[m.id] as any)?.es_a_cuenta && (
                                      <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full ml-1">a cuenta</span>
                                    )}
                                    {m.haber>0 && cobrosMap[m.id] && (
                                      <button onClick={e=>{e.stopPropagation();abrirEditCobro(m)}}
                                        className="text-[10px] text-blue-400 hover:text-blue-600 ml-1">✏️</button>
                                    )}
                                  </div>
                                </td>
                                <td className="py-2 text-right font-mono text-red-500 align-top">{m.debe>0?moneyARS(m.debe):'—'}</td>
                                <td className="py-2 text-right font-mono text-green-600 align-top">{m.haber>0?moneyARS(m.haber):'—'}</td>
                              </tr>
                              {expandedMov===m.id && cobrosMap[m.id] && (() => {
                                const c = cobrosMap[m.id]
                                const totalRetC = +c.ret_ganancias + +c.ret_iva + +c.ret_iibb + +c.ret_suss + +c.ret_otras
                                return (
                                  <tr key={m.id+'_det'} className="border-b border-p-line2 bg-green-50/30">
                                    <td colSpan={4} className="px-4 py-2">
                                      <div className="flex flex-col gap-1 text-xs">
                                        <div className="flex gap-4 flex-wrap text-p-ink2">
                                          {c.forma_cobro && <span>📤 {c.forma_cobro}</span>}
                                          {c.banco && <span>🏦 {c.banco}</span>}
                                          {c.nro_op && <span>OP: {c.nro_op}</span>}
                                          {c.referencia && <span>Ref: {c.referencia}</span>}
                                        </div>
                                        {totalRetC>0 && (
                                          <div className="flex flex-col gap-0.5 mt-1">
                                            <div className="flex justify-between text-p-ink2"><span>Bruto cobrado</span><span className="font-mono">{moneyARS(c.monto_bruto)}</span></div>
                                            {c.ret_ganancias>0 && <div className="flex justify-between text-red-600"><span>− Ret. Ganancias</span><span className="font-mono">{moneyARS(c.ret_ganancias)}</span></div>}
                                            {c.ret_iva>0       && <div className="flex justify-between text-red-600"><span>− Ret. IVA</span><span className="font-mono">{moneyARS(c.ret_iva)}</span></div>}
                                            {c.ret_iibb>0      && <div className="flex justify-between text-red-600"><span>− Ret. IIBB</span><span className="font-mono">{moneyARS(c.ret_iibb)}</span></div>}
                                            {c.ret_suss>0      && <div className="flex justify-between text-red-600"><span>− Ret. SUSS</span><span className="font-mono">{moneyARS(c.ret_suss)}</span></div>}
                                            {c.ret_otras>0     && <div className="flex justify-between text-red-600"><span>− Otras ret.</span><span className="font-mono">{moneyARS(c.ret_otras)}</span></div>}
                                            <div className="flex justify-between font-bold text-green-700 border-t border-green-200 pt-0.5"><span>Neto acreditado</span><span className="font-mono">{moneyARS(c.monto_neto)}</span></div>
                                          </div>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                )
                              })()}
                            </>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="font-bold border-t border-p-line">
                            <td colSpan={2} className="py-2">Saldo pendiente</td>
                            <td colSpan={2} className="py-2 text-right font-saira text-lg text-red-500">{moneyARS(sel?.saldo||0)}</td>
                          </tr>
                        </tfoot>
                      </table>
                )}
              </div>
            </div>
            ) : (
              <div className="bg-white border border-p-line rounded-xl p-8 flex items-center justify-center">
                <p className="text-sm text-p-ink2">Seleccioná una aseguradora para ver sus movimientos</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB LIQUIDACIONES ── */}
      {tab==='liquidaciones' && (
        <div>
          {/* Selector mes */}
          <div className="flex items-center gap-3 mb-5">
            <button onClick={()=>{const d=new Date(mes+'-15');d.setUTCMonth(d.getUTCMonth()-1);setMes(d.toISOString().slice(0,7))}}
              className="border border-p-line rounded-lg px-3 py-2 hover:bg-p-light">←</button>
            <div className="font-saira font-bold text-lg text-p-ink px-2">{MESES[+m2-1]} {y}</div>
            <button onClick={()=>{const d=new Date(mes+'-15');d.setUTCMonth(d.getUTCMonth()+1);setMes(d.toISOString().slice(0,7))}}
              className="border border-p-line rounded-lg px-3 py-2 hover:bg-p-light">→</button>
            <button onClick={()=>setMes(new Date().toISOString().slice(0,7))} className="text-sm text-p-green font-semibold hover:underline">Este mes</button>
          </div>

          {/* KPIs del mes */}
          {cobros.length>0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
              {[
                {label:'Cobrado bruto',     val:totales.bruto,     color:'text-p-green'},
                {label:'Ret. Ganancias',    val:totales.ganancias, color:'text-red-500'},
                {label:'Ret. IVA',          val:totales.iva,       color:'text-red-500'},
                {label:'Ret. IIBB',         val:totales.iibb,      color:'text-red-500'},
                {label:'Total retenciones', val:totales.ganancias+totales.iva+totales.iibb+totales.suss+totales.otras, color:'text-red-600'},
                {label:'Neto acreditado',   val:totales.neto,      color:'text-p-green'},
              ].map(r=>(
                <div key={r.label} className="bg-white border border-p-line rounded-xl p-3 shadow-sm">
                  <p className="text-[10px] font-semibold text-p-ink2 uppercase tracking-wider">{r.label}</p>
                  <p className={`font-saira font-bold text-lg mt-0.5 ${r.color}`}>{moneyARS(r.val)}</p>
                </div>
              ))}
            </div>
          )}

          {/* Listado cobros */}
          {loadingLiq ? <p className="text-sm text-p-gray text-center py-10">Cargando…</p>
          : cobros.length===0 ? <Empty msg={`Sin liquidaciones en ${MESES[+m2-1]} ${y}`}/>
          : (
            <div className="flex flex-col gap-2">
              {cobros.map(c=>(
                <div key={c.id} className="bg-white border border-p-line rounded-xl shadow-sm overflow-hidden">
                  <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-p-light/30"
                    onClick={()=>setExpandedLiq(expandedLiq===c.id?null:c.id)}>
                    <span className="text-xs text-p-ink2">{expandedLiq===c.id?'▼':'▶'}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-saira font-bold text-p-ink text-sm">{c.aseguradora_nombre}</p>
                      <p className="text-[11px] text-p-ink2">
                        {c.fecha.split('-').reverse().join('/')}
                        {c.nro_op && ` · OP ${c.nro_op}`}
                        {c.forma_cobro && ` · ${c.forma_cobro}`}
                        {c.banco && ` · ${c.banco}`}
                        {c.referencia && ` · ${c.referencia}`}
                        {` · ${(c.facturas||[]).length} factura(s)`}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-mono font-bold text-p-green">{moneyARS(c.monto_neto)}</p>
                      {(+c.ret_ganancias + +c.ret_iva + +c.ret_iibb + +c.ret_suss + +c.ret_otras)>0 && (
                        <p className="text-[10px] text-red-500 font-mono">
                          − {moneyARS(+c.ret_ganancias + +c.ret_iva + +c.ret_iibb + +c.ret_suss + +c.ret_otras)} ret.
                        </p>
                      )}
                    </div>
                  </div>

                  {expandedLiq===c.id && (
                    <div className="border-t border-p-line2 px-4 py-3 bg-p-light/10 flex flex-col gap-3 text-sm">
                      {/* Facturas canceladas */}
                      {(c.facturas||[]).length>0 && (
                        <div>
                          <p className="text-[10px] font-bold text-p-ink2 uppercase tracking-wider mb-1.5">Facturas canceladas</p>
                          {(c.facturas||[]).map((f:any,i:number)=>(
                            <div key={i} className="flex justify-between py-0.5">
                              <span className="font-mono text-p-ink2 text-xs">FA-0006-{String(f.comprobantes?.nro_cbte_afip??f.comprobantes?.numero??'?').padStart(8,'0')}</span>
                              <span className="font-mono font-bold text-xs">{moneyARS(f.monto)}</span>
                            </div>
                          ))}
                          <div className="flex justify-between font-bold border-t border-p-line pt-1 mt-1">
                            <span>Total bruto</span><span className="font-mono">{moneyARS(c.monto_bruto)}</span>
                          </div>
                        </div>
                      )}
                      {/* Retenciones */}
                      {(+c.ret_ganancias + +c.ret_iva + +c.ret_iibb + +c.ret_suss + +c.ret_otras)>0 && (
                        <div className="flex flex-col gap-0.5">
                          <p className="text-[10px] font-bold text-p-ink2 uppercase tracking-wider mb-1">Retenciones</p>
                          {c.ret_ganancias>0 && <div className="flex justify-between text-red-600"><span>Ret. Ganancias</span><span className="font-mono">− {moneyARS(c.ret_ganancias)}</span></div>}
                          {c.ret_iva>0       && <div className="flex justify-between text-red-600"><span>Ret. IVA</span><span className="font-mono">− {moneyARS(c.ret_iva)}</span></div>}
                          {c.ret_iibb>0      && <div className="flex justify-between text-red-600"><span>Ret. IIBB</span><span className="font-mono">− {moneyARS(c.ret_iibb)}</span></div>}
                          {c.ret_suss>0      && <div className="flex justify-between text-red-600"><span>Ret. SUSS</span><span className="font-mono">− {moneyARS(c.ret_suss)}</span></div>}
                          {c.ret_otras>0     && <div className="flex justify-between text-red-600"><span>Otras ret.</span><span className="font-mono">− {moneyARS(c.ret_otras)}</span></div>}
                        </div>
                      )}
                      <div className="flex justify-between font-bold text-p-green border-t border-p-line pt-2">
                        <span>Neto acreditado</span><span className="font-mono font-saira text-lg">{moneyARS(c.monto_neto)}</span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Facturas pendientes de cobro */}
      {tab==='pendientes' && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-p-ink2">Facturas emitidas a aseguradoras sin cobro registrado</p>
            <p className="text-sm font-bold text-red-500">
              Total: {moneyARS(factPendientes.reduce((a,f)=>a+Number(f.total),0))}
            </p>
          </div>
          {loadingPend ? (
            <p className="text-sm text-p-ink2 text-center py-8">Cargando…</p>
          ) : factPendientes.length === 0 ? (
            <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
              <p className="text-green-700 font-bold">✅ Sin facturas pendientes</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-p-line shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-p-dark text-white">
                    <th className="text-left px-4 py-3 text-xs uppercase">Fecha</th>
                    <th className="text-left px-3 py-3 text-xs uppercase">N°</th>
                    <th className="text-left px-3 py-3 text-xs uppercase">Aseguradora</th>
                    <th className="text-left px-3 py-3 text-xs uppercase">Asegurado</th>
                    <th className="text-right px-3 py-3 text-xs uppercase">Neto</th>
                    <th className="text-right px-3 py-3 text-xs uppercase">IVA</th>
                    <th className="text-right px-3 py-3 text-xs uppercase">Total</th>
                    <th className="px-3 py-3 text-xs uppercase"></th>
                  </tr>
                </thead>
                <tbody>
                  {factPendientes.map((f,i)=>(
                    <tr key={f.id} className={`border-t border-p-line2 ${i%2===0?'bg-white':'bg-p-light/30'}`}>
                      <td className="px-4 py-2 font-mono text-xs">{f.fecha?.split('-').reverse().join('/')}</td>
                      <td className="px-3 py-2 font-mono text-xs">
                        <span className="bg-blue-100 text-blue-700 font-bold px-1.5 py-0.5 rounded-full text-[10px]">
                          FA-0006-{String(f.nro_cbte_afip||'').padStart(8,'0')}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs font-medium truncate max-w-[120px]">{f.aseguradora_nombre||'—'}</td>
                      <td className="px-3 py-2 text-xs text-p-ink2 truncate max-w-[120px]">{f.cliente_nombre||'—'}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs">{moneyARS(Number(f.neto)||0)}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-p-ink2">{moneyARS(Number(f.iva)||0)}</td>
                      <td className="px-3 py-2 text-right font-mono font-bold text-xs text-red-600">{moneyARS(Number(f.total)||0)}</td>
                      <td className="px-3 py-2">
                        <button onClick={()=>{
                          const s = saldos.find(s=>s.aseguradora_id===f.aseguradora_id)
                          if(s) { setSel(s); loadMovs(s.aseguradora_id); setTab('saldos') }
                        }} style={{...btnSm,fontSize:10,padding:'4px 10px'}}>Ver CC</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modal nuevo cobro */}
      <Modal open={cobroModal} onClose={()=>{setCobroModal(false);setCobroLibre(false)}} title={cobroLibre ? 'Cargar liquidación' : `Registrar cobro — ${sel?.nombre}`}>
        <div className="flex flex-col gap-4 max-h-[80vh] overflow-y-auto pr-1">

          {/* Selector de aseguradora cuando es libre */}
          {cobroLibre && (
            <Field label="Compañía aseguradora *">
              <select value={asegLibreId} onChange={e=>setAsegLibreId(e.target.value)}
                className="w-full border border-p-line rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-p-green">
                <option value="">Seleccionar aseguradora…</option>
                {saldos.map(s=><option key={s.aseguradora_id} value={s.aseguradora_id}>{s.nombre}</option>)}
              </select>
            </Field>
          )}

          {/* Facturas pendientes — si no selecciona ninguna queda a cuenta */}
          <div>
            <p className="text-[11px] font-bold text-p-ink2 uppercase tracking-wider mb-2">
              Facturas a cancelar <span className="text-p-ink2 font-normal normal-case">(dejá sin tildar para registrar a cuenta)</span>
            </p>
            {facturasPend.length===0 ? (
              <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-700">
                💰 Sin facturas pendientes en el sistema — se registrará como pago a cuenta
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                {facturasPend.map(f=>(
                  <label key={f.id} className={`flex items-center gap-3 border rounded-lg px-3 py-2 cursor-pointer text-sm ${factSel[f.id]?'border-p-green bg-green-50':'border-p-line'}`}>
                    <input type="checkbox" checked={!!factSel[f.id]} onChange={()=>setFactSel(p=>({...p,[f.id]:!p[f.id]}))} className="accent-p-green"/>
                    <span className="font-mono text-xs text-p-ink2">FA-0006-{String(f.nro_cbte_afip??f.numero??'?').padStart(8,'0')}</span>
                    <span className="text-p-ink2 text-xs">{f.fecha.split('-').reverse().join('/')}</span>
                    <span className="ml-auto font-mono font-bold">{moneyARS(f.total)}</span>
                  </label>
                ))}
                {montoFactSel > 0 && (
                  <div className="flex justify-between text-sm font-bold pt-1 border-t border-p-line mt-1">
                    <span>Total seleccionado</span><span className="font-mono">{moneyARS(montoFactSel)}</span>
                  </div>
                )}
                {facturasPend.filter(f=>factSel[f.id]).length === 0 && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-700 mt-1">
                    💰 Sin facturas seleccionadas — se registrará como pago a cuenta
                  </div>
                )}
              </div>
            )}
          </div>
          {/* Monto — solo cuando no hay facturas seleccionadas */}
          {facturasPend.filter(f=>factSel[f.id]).length === 0 && (
            <Field label="Monto ($)">
              <Input value={montoACuenta} onChange={e=>setMontoACuenta(e.target.value)} placeholder="0,00" className="font-mono font-bold text-lg"/>
            </Field>
          )}
          <div>
            <p className="text-[11px] font-bold text-p-ink2 uppercase tracking-wider mb-2">Forma de cobro</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Fecha"><Input type="date" value={fechaCobro} onChange={e=>setFechaCobro(e.target.value)}/></Field>
              <Field label="Forma">
                <select value={forma} onChange={e=>setForma(e.target.value)} className="w-full border border-p-line rounded-lg px-3 py-2 text-sm">
                  {FORMAS.map(f=><option key={f}>{f}</option>)}
                </select>
              </Field>
              <Field label="N° Orden de Pago"><Input value={nroOp} onChange={e=>setNroOp(e.target.value)} placeholder="Ej: 00220576"/></Field>
              <Field label="Referencia"><Input value={ref} onChange={e=>setRef(e.target.value)} placeholder="N° transferencia…"/></Field>
              {forma === 'Transferencia' && (
                <Field label="Cuenta destino">
                  <select value={cuentaSelId} onChange={e=>setCuentaSelId(e.target.value)}
                    className="w-full border border-p-line rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-p-green">
                    <option value="">Seleccionar cuenta…</option>
                    {cuentasBanco.map(c=>(
                      <option key={c.id} value={c.id}>
                        {c.alias||c.banco} ({c.tipo==='Cuenta Corriente'?'CC':'CA'}) ···{(c.cbu||c.nro_cuenta||'').slice(-5)}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              {forma !== 'Transferencia' && (
                <Field label="Banco"><Input value={banco} onChange={e=>setBanco(e.target.value)} placeholder="Banco…"/></Field>
              )}
            </div>
          </div>
          <Field label="Referencia / Facturas del otro sistema (opcional)">
            <Input value={comentario} onChange={e=>setComentario(e.target.value)} placeholder="Ej: FA 0006-00000010 y FA 0006-00000022"/>
          </Field>
          <div>
            <p className="text-[11px] font-bold text-p-ink2 uppercase tracking-wider mb-2">Retenciones sufridas</p>
            <div className="flex flex-col gap-2">
              {retenciones.map(r=>(
                <div key={r.tipo} className="grid grid-cols-3 gap-2 items-end">
                  <Field label={r.label}><Input value={r.monto} onChange={e=>updRet(r.tipo,'monto',e.target.value)} placeholder="$0"/></Field>
                  <Field label="N° Certificado"><Input value={r.nro_cert} onChange={e=>updRet(r.tipo,'nro_cert',e.target.value)} placeholder="Opcional"/></Field>
                  <Field label="Base imponible"><Input value={r.base} onChange={e=>updRet(r.tipo,'base',e.target.value)} placeholder="$0"/></Field>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-p-light rounded-xl p-3 flex flex-col gap-1 text-sm">
            <div className="flex justify-between"><span className="text-p-ink2">Total bruto</span><span className="font-mono">{moneyARS(montoFactSel)}</span></div>
            {retenciones.filter(r=>toNum(r.monto)>0).map(r=>(
              <div key={r.tipo} className="flex justify-between text-red-600">
                <span>− {r.label}</span><span className="font-mono">{moneyARS(toNum(r.monto))}</span>
              </div>
            ))}
            <div className="flex justify-between font-bold text-p-green border-t border-p-line pt-1 mt-1">
              <span>Neto a acreditar</span><span className="font-mono font-saira text-lg">{moneyARS(montoNeto)}</span>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={()=>setCobroModal(false)} style={btnGray}>Cancelar</button>
            <button onClick={confirmarCobro} disabled={savingCobro||montoFactSel<=0}
              style={{...btn,opacity:(savingCobro||montoFactSel<=0)?0.5:1}}>
              {savingCobro?'Guardando…':'✓ Confirmar cobro'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal editar cobro */}
      <Modal open={!!editCobro} onClose={()=>setEditCobro(null)} title="Editar cobro">
        {editCobro && (
          <div className="flex flex-col gap-3">
            <div className="bg-p-light rounded-xl px-4 py-2 text-sm flex gap-4">
              <span><span className="text-p-ink2">Bruto: </span><span className="font-bold font-mono">{moneyARS(editCobro.monto_bruto)}</span></span>
              <span><span className="text-p-ink2">Fecha: </span><span className="font-mono">{editCobro.fecha?.split('-').reverse().join('/')}</span></span>
            </div>
            <p className="text-[11px] font-bold text-p-ink2 uppercase tracking-wider">Retenciones</p>
            <div className="grid grid-cols-2 gap-3">
              {RET_KEYS.map(r=>(
                <Field key={r.key} label={r.label}>
                  <Input value={editForm[r.key]||''} onChange={e=>setEditForm((p:any)=>({...p,[r.key]:e.target.value}))} placeholder="$0"/>
                </Field>
              ))}
              <Field label="Neto acreditado">
                <Input value={editForm.monto_neto||''} onChange={e=>setEditForm((p:any)=>({...p,monto_neto:e.target.value}))} placeholder="Auto"/>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="N° Orden de Pago"><Input value={editForm.nro_op||''} onChange={e=>setEditForm((p:any)=>({...p,nro_op:e.target.value}))}/></Field>
              <Field label="Referencia"><Input value={editForm.referencia||''} onChange={e=>setEditForm((p:any)=>({...p,referencia:e.target.value}))}/></Field>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={()=>setEditCobro(null)} style={btnGray}>Cancelar</button>
              <button onClick={guardarEditCobro} disabled={savingEdit}
                style={{...btn,opacity:savingEdit?0.5:1}}>{savingEdit?'Guardando…':'✓ Guardar'}</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
