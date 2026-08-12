'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { KpiCard } from '@/components/ui'
import { moneyARS } from '@/lib/utils/format'

interface Venta {
  fecha:string; precio:number; costo:number|null
  descripcion:string; pendiente:boolean
  tipo_cliente_nombre:string|null
}

interface Periodo { label:string; desde:string; hasta:string }

function getPeriodos(): Periodo[] {
  const now = new Date()
  const mes  = now.toISOString().slice(0,7)
  const prev = new Date(now.getFullYear(), now.getMonth()-1, 1).toISOString().slice(0,7)
  const year = now.getFullYear()
  const diaHace7 = new Date(now.getTime()-7*86400000).toISOString().slice(0,10)
  return [
    { label:'Este mes',      desde:`${mes}-01`,     hasta:now.toISOString().slice(0,10) },
    { label:'Mes anterior',  desde:`${prev}-01`,    hasta:`${prev}-${new Date(now.getFullYear(),now.getMonth(),0).getDate()}` },
    { label:'Últimos 7 días',desde:diaHace7,        hasta:now.toISOString().slice(0,10) },
    { label:'Este año',      desde:`${year}-01-01`, hasta:now.toISOString().slice(0,10) },
  ]
}

const TIPO_COLORS: Record<string,string> = {
  'Particular': '#2563eb', 'Chapita': '#d97706', 'Compañías': '#7c3aed',
}
function tipoColor(nombre:string|null){ return TIPO_COLORS[nombre||''] || '#6b7280' }

export default function InformesClient() {
  const [periodos]      = useState<Periodo[]>(getPeriodos())
  const [pIdx, setPIdx] = useState(0)
  const [ventas, setVentas] = useState<Venta[]>([])
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState<'general'|'rentabilidad'|'aseguradoras'|'resultado'|'colaboradores'|'reclamos'>('general')
  const supabase = createClient()
  const [oficialRate, setOficialRate] = useState<number|null>(null)

  // Tab Colaboradores
  interface ColabRow { colaborador_id:string|null; nombre:string; cantidad:number; total:number; externos:number }
  const [colabData, setColabData] = useState<ColabRow[]>([])
  const [colabLoading, setColabLoading] = useState(false)

  // Tab Reclamos
  interface OSBusq { id:string; numero:string; cliente:string; colaborador_nombre:string|null; fecha:string; total:number }
  interface Reclamo { id:string; os_numero:string; cliente_nombre:string; colaborador_nombre:string|null; fecha:string; descripcion:string; estado:string; resolucion:string|null; created_at:string }
  const [osQuery, setOsQuery] = useState('')
  const [osBusqResults, setOsBusqResults] = useState<OSBusq[]>([])
  const [osSelReclamo, setOsSelReclamo] = useState<OSBusq|null>(null)
  const [formReclamo, setFormReclamo] = useState({ descripcion:'', estado:'pendiente' })
  const [reclamos, setReclamos] = useState<Reclamo[]>([])
  const [reclamosLoading, setReclamosLoading] = useState(false)
  const [savingReclamo, setSavingReclamo] = useState(false)

  // Tab Resultado
  interface GastoRow { id:string; fecha:string; categoria:string; descripcion:string; monto:number; forma_pago:string|null }
  interface CompraRow { id:string; fecha:string; proveedor_nombre:string; total:number; tipo:string }
  const [gastos, setGastos] = useState<GastoRow[]>([])
  const [compras, setCompras] = useState<CompraRow[]>([])
  const [resLoading, setResLoading] = useState(false)
  const [drillCat, setDrillCat] = useState<string|null>(null)

  // Datos aseguradoras
  interface AsegStats { os_creadas:number; os_pendientes:number; facturadas:number; fc_importe:number }
  const [asegData, setAsegData] = useState<Record<string,AsegStats>>({})
  const [asegLoading, setAsegLoading] = useState(false)

  useEffect(() => {
    supabase.from('cotizaciones').select('oficial').order('fecha',{ascending:false}).limit(1).maybeSingle()
      .then(({data})=>setOficialRate(data?.oficial??null))
  }, [supabase])

  useEffect(() => {
    const p = periodos[pIdx]
    setLoading(true)
    supabase.from('ventas').select('fecha,precio,costo,descripcion,pendiente,tipo_cliente_nombre')
      .gte('fecha', p.desde).lte('fecha', p.hasta).order('fecha',{ascending:false})
      .then(({data}) => { setVentas(data??[]); setLoading(false) })
  }, [pIdx, periodos, supabase])

  // ── Ventas por origen del cristal (salidas de stock del período + origen PLK) ──
  const [porOrigen, setPorOrigen] = useState<{origen:string; unidades:number; monto:number}[]>([])
  useEffect(() => {
    const p = periodos[pIdx]
    ;(async () => {
      const { data: movs } = await supabase.from('stock_movimientos')
        .select('stock_id,cantidad,precio_venta_unitario,tipo,fecha')
        .eq('tipo','salida').gte('fecha', p.desde).lte('fecha', p.hasta).limit(2000)
      if (!movs?.length) { setPorOrigen([]); return }
      const ids = Array.from(new Set(movs.map((m:any)=>m.stock_id).filter(Boolean)))
      const { data: stk } = await supabase.from('stock').select('id,codigo').in('id', ids)
      const codigoDe: Record<string,string> = {}
      for (const s of stk??[]) codigoDe[(s as any).id] = ((s as any).codigo||'').toUpperCase()
      const codigos = Array.from(new Set(Object.values(codigoDe).filter(c=>/^\d{6}/.test(c))))
      const origenDe: Record<string,string> = {}
      if (codigos.length) {
        const { data: pk } = await supabase.from('pilkington_import').select('codigo,origen').in('codigo', codigos)
        for (const r of pk??[]) origenDe[((r as any).codigo||'').toUpperCase()] = (r as any).origen || 'Sin origen'
      }
      const acc: Record<string,{unidades:number; monto:number}> = {}
      for (const m of movs as any[]) {
        const cod = codigoDe[m.stock_id] || ''
        const org = origenDe[cod] || (/^\d{6}/.test(cod) ? 'Otros PLK' : 'Otros artículos')
        if (!acc[org]) acc[org] = { unidades:0, monto:0 }
        acc[org].unidades += Number(m.cantidad)||0
        acc[org].monto += (Number(m.cantidad)||0) * (Number(m.precio_venta_unitario)||0)
      }
      setPorOrigen(Object.entries(acc).map(([origen,v])=>({origen,...v})).sort((a,b)=>b.unidades-a.unidades))
    })()
  }, [pIdx, periodos, supabase])

  // Cargar datos resultado cuando cambia período o se selecciona el tab
  useEffect(() => {
    if(tab !== 'resultado') return
    const p = periodos[pIdx]
    setResLoading(true)
    Promise.all([
      supabase.from('gastos').select('id,fecha,categoria,descripcion,monto,forma_pago')
        .gte('fecha', p.desde).lte('fecha', p.hasta).order('fecha',{ascending:false}),
      supabase.from('comprobantes_compra').select('id,fecha,proveedor_nombre,total,tipo')
        .eq('tipo','factura').gte('fecha', p.desde).lte('fecha', p.hasta).order('fecha',{ascending:false}),
    ]).then(([gRes, cRes]) => {
      setGastos(gRes.data??[])
      setCompras(cRes.data??[])
      setResLoading(false)
    })
  }, [tab, pIdx, periodos, supabase])

  // Cargar datos aseguradoras cuando cambia período o se selecciona el tab
  useEffect(() => {
    if(tab !== 'aseguradoras') return
    const p = periodos[pIdx]
    setAsegLoading(true)
    Promise.all([
      supabase.from('ordenes_servicio').select('aseguradora,estado')
        .not('aseguradora','is',null).gte('fecha', p.desde).lte('fecha', p.hasta),
      supabase.from('comprobantes').select('aseguradora_nombre,total')
        .not('aseguradora_nombre','is',null).gte('fecha', p.desde).lte('fecha', p.hasta),
    ]).then(([osRes, compRes]) => {
      const stats: Record<string,AsegStats> = {}
      for (const o of (osRes.data??[])) {
        const k = o.aseguradora
        if(!stats[k]) stats[k] = { os_creadas:0, os_pendientes:0, facturadas:0, fc_importe:0 }
        stats[k].os_creadas++
        if(o.estado === 'pendiente') stats[k].os_pendientes++
      }
      for (const c of (compRes.data??[])) {
        const k = c.aseguradora_nombre
        if(!stats[k]) stats[k] = { os_creadas:0, os_pendientes:0, facturadas:0, fc_importe:0 }
        stats[k].facturadas++
        stats[k].fc_importe += +(c.total||0)
      }
      setAsegData(stats)
      setAsegLoading(false)
    })
  }, [tab, pIdx, periodos, supabase])

  const periodo = periodos[pIdx]
  const total    = ventas.reduce((a,v)=>a+v.precio, 0)
  const costo    = ventas.filter(v=>!v.pendiente).reduce((a,v)=>a+(v.costo??0), 0)
  const ganancia = total - costo
  const margen   = total > 0 ? Math.round((ganancia/total)*100) : 0
  const toUsd    = (n: number) => oficialRate ? 'USD ' + Math.round(n/oficialRate).toLocaleString('es-AR') : null
  const pendientes = ventas.filter(v=>v.pendiente).length
  const ticket   = ventas.length > 0 ? Math.round(total/ventas.length) : 0

  // Agrupación por día (gráfico)
  const byDia = ventas.reduce((acc,v)=>{ acc[v.fecha]=(acc[v.fecha]||0)+v.precio; return acc }, {} as Record<string,number>)
  const dias = Object.entries(byDia).sort((a,b)=>a[0].localeCompare(b[0]))
  const maxDia = Math.max(...dias.map(d=>d[1]), 1)

  // Top piezas
  const byPieza = ventas.reduce((acc,v)=>{ acc[v.descripcion]=(acc[v.descripcion]||0)+v.precio; return acc }, {} as Record<string,number>)
  const topPiezas = Object.entries(byPieza).sort((a,b)=>b[1]-a[1]).slice(0,5)

  // ── Rentabilidad por tipo de cliente ──────────────────────────────────────
  interface TipoStats { facturado:number; costo:number; ganancia:number; operaciones:number; pendientes:number }
  const byTipo = ventas.reduce((acc,v) => {
    const k = v.tipo_cliente_nombre || 'Sin tipo'
    if(!acc[k]) acc[k] = { facturado:0, costo:0, ganancia:0, operaciones:0, pendientes:0 }
    acc[k].facturado += v.precio
    acc[k].operaciones++
    if(v.pendiente) acc[k].pendientes++
    else { acc[k].costo += v.costo??0; acc[k].ganancia += v.precio-(v.costo??0) }
    return acc
  }, {} as Record<string,TipoStats>)

  const tipoEntries = Object.entries(byTipo).sort((a,b)=>b[1].facturado-a[1].facturado)

  // Cargar datos colaboradores
  useEffect(()=>{
    if(tab !== 'colaboradores') return
    setColabLoading(true)
    const p = periodos[pIdx]
    supabase.from('ordenes_servicio')
      .select('colaborador_id, total, stock_via_remito, colaboradores(nombre)')
      .eq('cristal_colocado', true)
      .gte('fecha', p.desde).lte('fecha', p.hasta)
      .then(({data})=>{
        const map = new Map<string, ColabRow>()
        ;(data??[]).forEach((os:any)=>{
          const key = os.colaborador_id || '__sin__'
          const nombre = os.colaboradores?.nombre || 'Sin asignar'
          if(!map.has(key)) map.set(key,{colaborador_id:os.colaborador_id,nombre,cantidad:0,total:0,externos:0})
          const r = map.get(key)!
          r.cantidad++
          r.total += +(os.total||0)
          if(os.stock_via_remito) r.externos++
        })
        setColabData([...map.values()].sort((a,b)=>b.total-a.total))
        setColabLoading(false)
      })
  },[tab, pIdx, periodos, supabase])

  // Cargar reclamos
  useEffect(()=>{
    if(tab !== 'reclamos') return
    setReclamosLoading(true)
    supabase.from('reclamos_colocacion').select('*').order('created_at',{ascending:false}).limit(100)
      .then(({data})=>{ setReclamos(data??[]); setReclamosLoading(false) })
  },[tab, supabase])

  // Buscar OS para reclamo
  useEffect(()=>{
    if(osQuery.length < 2){ setOsBusqResults([]); return }
    supabase.from('ordenes_servicio')
      .select('id, numero, cliente, colaborador_id, fecha, total, colaboradores(nombre)')
      .or(`cliente.ilike.%${osQuery}%,numero.ilike.%${osQuery}%`)
      .eq('cristal_colocado', true)
      .order('fecha',{ascending:false}).limit(10)
      .then(({data})=>{
        setOsBusqResults((data??[]).map((o:any)=>({
          id:o.id, numero:o.numero||o.id.slice(0,8),
          cliente:o.cliente||'', colaborador_nombre:o.colaboradores?.nombre||null,
          fecha:o.fecha, total:+(o.total||0)
        })))
      })
  },[osQuery, supabase])

  async function guardarReclamo() {
    if(!osSelReclamo || !formReclamo.descripcion) return
    setSavingReclamo(true)
    await supabase.from('reclamos_colocacion').insert({
      os_id: osSelReclamo.id,
      os_numero: osSelReclamo.numero,
      cliente_nombre: osSelReclamo.cliente,
      colaborador_id: null,
      colaborador_nombre: osSelReclamo.colaborador_nombre,
      fecha: new Date().toISOString().slice(0,10),
      descripcion: formReclamo.descripcion,
      estado: formReclamo.estado,
    })
    setOsSelReclamo(null); setOsQuery(''); setOsBusqResults([])
    setFormReclamo({descripcion:'',estado:'pendiente'})
    setSavingReclamo(false)
    // Recargar reclamos
    const {data} = await supabase.from('reclamos_colocacion').select('*').order('created_at',{ascending:false}).limit(100)
    setReclamos(data??[])
  }

  const tabBtn = (t:'general'|'rentabilidad'|'aseguradoras'|'resultado'|'colaboradores'|'reclamos', label:string) => (
    <button onClick={()=>setTab(t)}
      style={{background:tab===t?'#00A550':'#fff', color:tab===t?'#fff':'#4A6655',
        border:`1.5px solid ${tab===t?'#00A550':'#C2DDD0'}`,
        borderRadius:8, padding:'8px 18px', fontWeight:700, fontSize:13, cursor:'pointer'}}>
      {label}
    </button>
  )

  return (
    <div>
      {/* Selector de período */}
      <div className="flex gap-2 flex-wrap mb-5">
        {periodos.map((p,i)=>(
          <button key={i} onClick={()=>setPIdx(i)}
            style={{background:pIdx===i?'#00A550':'#fff', color:pIdx===i?'#fff':'#4A6655',
              border:`1.5px solid ${pIdx===i?'#00A550':'#C2DDD0'}`,
              borderRadius:10, padding:'8px 18px', fontWeight:700, fontSize:13, cursor:'pointer'}}>
            {p.label}
          </button>
        ))}
      </div>

      {loading ? <p className="text-sm text-p-gray text-center py-10">Cargando…</p> : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
            <KpiCard label="Facturado"    value={moneyARS(total)} sub={toUsd(total)??undefined} />
            <KpiCard label={`Ganancia${pendientes?' (parcial)':''}`} value={moneyARS(ganancia)} accent sub={toUsd(ganancia) ?? `${margen}% margen`} />
            <KpiCard label="Operaciones"  value={`${ventas.length}`} sub={pendientes?`${pendientes} s/costo`:undefined} />
            <KpiCard label="Ticket prom." value={moneyARS(ticket)} />
          </div>

          {/* Tabs */}
          <div className="flex gap-2 mb-5">
            {tabBtn('general','📊 General')}
            {tabBtn('rentabilidad','💹 Rentabilidad por tipo')}
            {tabBtn('aseguradoras','🏢 Aseguradoras')}
            {tabBtn('resultado','📋 Resultado')}
            {tabBtn('colaboradores','👷 Por colaborador')}
            {tabBtn('reclamos','⚠ Reclamos')}
          </div>

          {tab === 'general' && (
            <div className="flex flex-col gap-4">
              {/* Gráfico por día */}
              {dias.length > 0 && (
                <div className="bg-white border border-p-line rounded-xl p-4 shadow-sm">
                  <p className="font-saira font-bold text-sm text-p-ink mb-4">Ventas por día</p>
                  <div className="flex items-end gap-1 h-28 overflow-x-auto pb-1">
                    {dias.map(([fecha,monto])=>{
                      const h = Math.max(4,Math.round((monto/maxDia)*96))
                      const dd = fecha.slice(8,10)+'/'+fecha.slice(5,7)
                      return (
                        <div key={fecha} className="flex flex-col items-center gap-1 flex-shrink-0" style={{minWidth:32}}>
                          <div className="w-full rounded-t-md" style={{height:h,background:'#00A550',minWidth:24}}/>
                          <span className="text-[9px] text-p-ink2 font-mono">{dd}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Gráfico por origen del cristal */}
              {porOrigen.length > 0 && (
                <div className="bg-white border border-p-line rounded-xl p-4 shadow-sm">
                  <p className="font-saira font-bold text-sm text-p-ink mb-1">Ventas por origen del cristal</p>
                  <p className="text-[11px] text-p-ink2 mb-3">Salidas de stock del período, según origen de la lista Pilkington</p>
                  <div className="flex flex-col gap-2.5">
                    {porOrigen.map((o)=>{
                      const maxU = porOrigen[0].unidades || 1
                      return (
                        <div key={o.origen} className="flex items-center gap-3">
                          <span className="text-sm text-p-ink w-32 md:w-40 shrink-0 truncate">{o.origen}</span>
                          <div className="flex-1 bg-p-line rounded-full h-3 overflow-hidden">
                            <div className="h-full rounded-full" style={{width:`${Math.max(3,Math.round((o.unidades/maxU)*100))}%`,background:'#1565C0'}}/>
                          </div>
                          <span className="font-mono text-xs font-bold text-p-ink shrink-0 w-14 text-right">{o.unidades} u.</span>
                          <span className="font-mono text-[11px] text-p-ink2 shrink-0 w-24 text-right hidden md:inline">{o.monto>0?moneyARS(o.monto):'—'}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Top piezas */}
                {topPiezas.length > 0 && (
                  <div className="bg-white border border-p-line rounded-xl p-4 shadow-sm">
                    <p className="font-saira font-bold text-sm text-p-ink mb-3">Top piezas vendidas</p>
                    <div className="flex flex-col gap-2">
                      {topPiezas.map(([desc,monto],i)=>(
                        <div key={i} className="flex items-center gap-3">
                          <span className="font-saira font-bold text-p-green w-5">{i+1}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-p-ink truncate">{desc}</p>
                            <div className="mt-1 bg-p-line rounded-full h-1.5 overflow-hidden">
                              <div className="h-full bg-p-green rounded-full" style={{width:`${Math.round((monto/topPiezas[0][1])*100)}%`}}/>
                            </div>
                          </div>
                          <span className="font-mono text-xs font-bold text-p-ink shrink-0">{moneyARS(monto)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Últimas ventas */}
                <div className="bg-white border border-p-line rounded-xl p-4 shadow-sm">
                  <p className="font-saira font-bold text-sm text-p-ink mb-3">
                    Últimas ventas
                    <span className="font-normal text-p-ink2 text-xs ml-2">{periodo.desde.split('-').reverse().join('/')} — {periodo.hasta.split('-').reverse().join('/')}</span>
                  </p>
                  {ventas.length === 0
                    ? <p className="text-sm text-p-gray text-center py-6">Sin ventas en este período.</p>
                    : (
                      <div className="flex flex-col gap-1 max-h-72 overflow-y-auto">
                        {ventas.slice(0,30).map((v,i)=>(
                          <div key={i} className={`flex items-center gap-2 py-1.5 border-b border-p-line2 last:border-0 ${v.pendiente?'opacity-60':''}`}>
                            <span className="font-mono text-xs text-p-ink2 shrink-0">{v.fecha.slice(8,10)}/{v.fecha.slice(5,7)}</span>
                            {v.tipo_cliente_nombre && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full text-white shrink-0"
                                style={{background:tipoColor(v.tipo_cliente_nombre)}}>
                                {v.tipo_cliente_nombre.slice(0,3).toUpperCase()}
                              </span>
                            )}
                            <span className="text-sm text-p-ink flex-1 min-w-0 truncate">{v.descripcion}</span>
                            {v.pendiente && <span className="text-[10px] text-amber-500 shrink-0">s/costo</span>}
                            <span className="font-mono text-xs font-bold text-p-ink shrink-0">{moneyARS(v.precio)}</span>
                          </div>
                        ))}
                      </div>
                    )
                  }
                </div>
              </div>
            </div>
          )}

          {tab === 'rentabilidad' && (
            <div className="flex flex-col gap-4">
              {tipoEntries.length === 0 ? (
                <div className="bg-white border border-p-line rounded-xl p-8 text-center">
                  <p className="text-3xl mb-2">💹</p>
                  <p className="font-saira font-bold text-p-ink">Sin datos de tipo de cliente</p>
                  <p className="text-sm text-p-ink2 mt-1">Asigná tipos a tus clientes y registrá ventas con tipo para ver la rentabilidad.</p>
                </div>
              ) : (
                <>
                  {/* Gráfico de torta simple */}
                  <div className="bg-white border border-p-line rounded-xl p-4 shadow-sm">
                    <p className="font-saira font-bold text-sm text-p-ink mb-4">Facturación por tipo de cliente</p>
                    <div className="flex flex-col gap-3">
                      {tipoEntries.map(([tipo, stats])=>{
                        const pct = total > 0 ? Math.round((stats.facturado/total)*100) : 0
                        const margenTipo = stats.facturado > 0 ? Math.round((stats.ganancia/stats.facturado)*100) : 0
                        return (
                          <div key={tipo}>
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full" style={{background:tipoColor(tipo)}}/>
                                <span className="text-sm font-semibold text-p-ink">{tipo}</span>
                                <span className="text-xs text-p-ink2">{stats.operaciones} op.</span>
                              </div>
                              <div className="text-right">
                                <span className="font-mono font-bold text-sm text-p-ink">{moneyARS(stats.facturado)}</span>
                                <span className="text-xs text-p-ink2 ml-2">{pct}%</span>
                              </div>
                            </div>
                            <div className="bg-p-line rounded-full h-3 overflow-hidden">
                              <div className="h-full rounded-full transition-all" style={{width:`${pct}%`,background:tipoColor(tipo)}}/>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* Tabla detallada */}
                  <div className="bg-white border border-p-line rounded-xl overflow-hidden shadow-sm">
                    <div className="px-4 py-2.5 bg-p-light border-b border-p-line2">
                      <p className="font-saira font-bold text-sm text-p-ink">Detalle de rentabilidad</p>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-p-line2">
                            <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-p-ink2 uppercase tracking-wider">Tipo</th>
                            <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-p-ink2 uppercase tracking-wider">Facturado</th>
                            <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-p-ink2 uppercase tracking-wider">Ganancia</th>
                            <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-p-ink2 uppercase tracking-wider">Margen</th>
                            <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-p-ink2 uppercase tracking-wider">Ticket prom.</th>
                          </tr>
                        </thead>
                        <tbody>
                          {tipoEntries.map(([tipo, stats])=>{
                            const margenTipo = stats.facturado > 0 ? Math.round((stats.ganancia/stats.facturado)*100) : 0
                            const ticketTipo = stats.operaciones > 0 ? Math.round(stats.facturado/stats.operaciones) : 0
                            return (
                              <tr key={tipo} className="border-b border-p-line2 last:border-0 hover:bg-p-light/50">
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-2">
                                    <div className="w-2.5 h-2.5 rounded-full" style={{background:tipoColor(tipo)}}/>
                                    <span className="font-semibold text-p-ink">{tipo}</span>
                                    {stats.pendientes>0&&<span className="text-[10px] text-amber-500">{stats.pendientes} s/costo</span>}
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-right font-mono font-bold text-p-ink">{moneyARS(stats.facturado)}</td>
                                <td className="px-4 py-3 text-right font-mono font-bold" style={{color:stats.ganancia>=0?'#00A550':'#ef4444'}}>{moneyARS(stats.ganancia)}</td>
                                <td className="px-4 py-3 text-right">
                                  <span className={`font-bold text-sm px-2 py-0.5 rounded-full ${margenTipo>=40?'bg-green-100 text-green-700':margenTipo>=25?'bg-yellow-100 text-yellow-700':'bg-red-100 text-red-600'}`}>
                                    {margenTipo}%
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-right font-mono text-p-ink2">{moneyARS(ticketTipo)}</td>
                              </tr>
                            )
                          })}
                          {/* Total */}
                          <tr className="bg-p-light border-t-2 border-p-line">
                            <td className="px-4 py-3 font-saira font-bold text-p-ink">TOTAL</td>
                            <td className="px-4 py-3 text-right font-saira font-bold text-p-ink">{moneyARS(total)}</td>
                            <td className="px-4 py-3 text-right font-saira font-bold" style={{color:ganancia>=0?'#00A550':'#ef4444'}}>{moneyARS(ganancia)}</td>
                            <td className="px-4 py-3 text-right">
                              <span className={`font-bold text-sm px-2 py-0.5 rounded-full ${margen>=40?'bg-green-100 text-green-700':margen>=25?'bg-yellow-100 text-yellow-700':'bg-red-100 text-red-600'}`}>
                                {margen}%
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-p-ink">{moneyARS(ticket)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {tab === 'resultado' && (
            resLoading ? <p className="text-sm text-center py-8 text-p-gray">Cargando…</p> : (() => {
              // Ingresos: ventas del período
              const totalIngresos = ventas.reduce((a,v)=>a+v.precio, 0)

              // Egresos: gastos agrupados por categoría + compras
              const gastosPorCat = gastos.reduce((acc,g) => {
                const cat = g.categoria || 'Sin categoría'
                if (!acc[cat]) acc[cat] = []
                acc[cat].push(g)
                return acc
              }, {} as Record<string, GastoRow[]>)

              const totalGastos = gastos.reduce((a,g)=>a+g.monto, 0)
              const totalCompras = compras.reduce((a,c)=>a+(+c.total||0), 0)
              const totalEgresos = totalGastos + totalCompras
              const resultado = totalIngresos - totalEgresos

              return (
                <div className="flex flex-col gap-4">
                  {/* KPIs */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <KpiCard label="Ingresos" value={moneyARS(totalIngresos)} accent/>
                    <KpiCard label="Egresos" value={moneyARS(totalEgresos)}/>
                    <KpiCard label="Compras" value={moneyARS(totalCompras)}/>
                    <KpiCard label={resultado>=0?"Resultado":"Déficit"} value={moneyARS(Math.abs(resultado))} accent={resultado>=0}/>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    {/* INGRESOS */}
                    <div className="bg-white border border-p-line rounded-2xl p-4">
                      <p className="font-saira font-bold text-sm text-p-ink mb-3">📈 Ingresos — {moneyARS(totalIngresos)}</p>
                      {ventas.length === 0 ? <p className="text-xs text-p-ink2">Sin ventas en el período</p> : (
                        <div className="flex flex-col gap-1 max-h-64 overflow-y-auto">
                          {ventas.map((v,i) => (
                            <div key={i} className="flex justify-between items-center py-1 border-b border-p-line last:border-0">
                              <div>
                                <p className="text-xs text-p-ink truncate max-w-[200px]">{v.descripcion}</p>
                                <p className="text-[10px] text-p-ink2">{v.fecha.split('-').reverse().join('/')}</p>
                              </div>
                              <span className="font-mono text-xs font-semibold text-p-dark">{moneyARS(v.precio)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* EGRESOS */}
                    <div className="bg-white border border-p-line rounded-2xl p-4">
                      <p className="font-saira font-bold text-sm text-p-ink mb-3">📉 Gastos — {moneyARS(totalGastos)}</p>
                      {Object.keys(gastosPorCat).length === 0 ? <p className="text-xs text-p-ink2">Sin gastos en el período</p> : (
                        <div className="flex flex-col gap-1">
                          {Object.entries(gastosPorCat).sort((a,b)=>
                            b[1].reduce((s,g)=>s+g.monto,0)-a[1].reduce((s,g)=>s+g.monto,0)
                          ).map(([cat, gs]) => {
                            const subtotal = gs.reduce((s,g)=>s+g.monto,0)
                            const isOpen = drillCat === cat
                            return (
                              <div key={cat}>
                                <div
                                  className="flex justify-between items-center py-1.5 border-b border-p-line cursor-pointer hover:bg-p-light px-1 rounded"
                                  onDoubleClick={()=>setDrillCat(isOpen ? null : cat)}
                                  onClick={()=>setDrillCat(isOpen ? null : cat)}
                                >
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[10px] text-p-ink2">{isOpen?'▼':'▶'}</span>
                                    <span className="text-xs font-semibold text-p-ink">{cat}</span>
                                    <span className="text-[10px] text-p-ink2">({gs.length})</span>
                                  </div>
                                  <span className="font-mono text-xs font-semibold text-red-600">{moneyARS(subtotal)}</span>
                                </div>
                                {isOpen && (
                                  <div className="ml-4 flex flex-col gap-0.5 py-1">
                                    {gs.map(g=>(
                                      <div key={g.id} className="flex justify-between items-center py-0.5">
                                        <div>
                                          <p className="text-[11px] text-p-ink">{g.descripcion}</p>
                                          <p className="text-[10px] text-p-ink2">{g.fecha.split('-').reverse().join('/')} · {g.forma_pago||''}</p>
                                        </div>
                                        <span className="font-mono text-[11px] text-red-500">{moneyARS(g.monto)}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* COMPRAS */}
                  <div className="bg-white border border-p-line rounded-2xl p-4">
                    <p className="font-saira font-bold text-sm text-p-ink mb-3">🛒 Compras — {moneyARS(totalCompras)}</p>
                    {compras.length === 0 ? <p className="text-xs text-p-ink2">Sin compras en el período</p> : (
                      <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
                        {compras.map(c=>(
                          <div key={c.id} className="flex justify-between items-center py-1 border-b border-p-line last:border-0">
                            <div>
                              <p className="text-xs text-p-ink">{c.proveedor_nombre}</p>
                              <p className="text-[10px] text-p-ink2">{c.fecha.split('-').reverse().join('/')}</p>
                            </div>
                            <span className="font-mono text-xs font-semibold text-red-600">{moneyARS(+c.total||0)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )
            })()
          )}

          {tab === 'aseguradoras' && (
            <div className="flex flex-col gap-4">
              {asegLoading ? <p className="text-sm text-p-gray text-center py-10">Cargando datos de aseguradoras…</p> : Object.keys(asegData).length === 0 ? (
                <div className="bg-white border border-p-line rounded-xl p-8 text-center">
                  <p className="text-3xl mb-2">🏢</p>
                  <p className="font-saira font-bold text-p-ink">Sin actividad de aseguradoras</p>
                  <p className="text-sm text-p-ink2 mt-1">No hay OS ni facturas de compañías en este período.</p>
                </div>
              ) : (<>
                {/* KPIs aseguradoras */}
                {(() => {
                  const entries = Object.entries(asegData).sort((a,b)=>b[1].fc_importe-a[1].fc_importe)
                  const totalOS = entries.reduce((a,e)=>a+e[1].os_creadas,0)
                  const totalFC = entries.reduce((a,e)=>a+e[1].facturadas,0)
                  const totalImporte = entries.reduce((a,e)=>a+e[1].fc_importe,0)
                  const totalPendientes = entries.reduce((a,e)=>a+e[1].os_pendientes,0)
                  return (<>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <KpiCard label="Compañías activas" value={String(entries.length)} />
                      <KpiCard label="OS creadas" value={String(totalOS)} sub={totalPendientes>0?`${totalPendientes} pendientes`:undefined} />
                      <KpiCard label="Facturadas" value={String(totalFC)} accent />
                      <KpiCard label="Importe facturado" value={moneyARS(totalImporte)} sub={toUsd(totalImporte)??undefined} />
                    </div>

                    {/* Tabla por compañía */}
                    <div className="bg-white border border-p-line rounded-xl overflow-hidden shadow-sm">
                      <div className="px-4 py-2.5 bg-purple-50 border-b border-purple-200">
                        <p className="font-saira font-bold text-sm text-purple-800">Detalle por compañía — {periodos[pIdx].label.toLowerCase()}</p>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-p-line2">
                              <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-p-ink2 uppercase tracking-wider">Compañía</th>
                              <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-p-ink2 uppercase tracking-wider">OS creadas</th>
                              <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-p-ink2 uppercase tracking-wider">Pendientes</th>
                              <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-p-ink2 uppercase tracking-wider">Facturadas</th>
                              <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-p-ink2 uppercase tracking-wider">Importe</th>
                              <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-p-ink2 uppercase tracking-wider">USD oficial</th>
                            </tr>
                          </thead>
                          <tbody>
                            {entries.map(([nombre, s]) => (
                              <tr key={nombre} className="border-b border-p-line2 last:border-0 hover:bg-purple-50/30">
                                <td className="px-4 py-3 font-semibold text-p-ink">{nombre}</td>
                                <td className="px-4 py-3 text-right font-mono">{s.os_creadas}</td>
                                <td className="px-4 py-3 text-right">
                                  {s.os_pendientes > 0
                                    ? <span className="font-mono font-bold text-amber-600">{s.os_pendientes}</span>
                                    : <span className="text-p-ink2">—</span>}
                                </td>
                                <td className="px-4 py-3 text-right font-mono font-bold text-p-green">{s.facturadas}</td>
                                <td className="px-4 py-3 text-right font-mono font-bold text-p-ink">{moneyARS(s.fc_importe)}</td>
                                <td className="px-4 py-3 text-right font-mono text-p-ink2">{toUsd(s.fc_importe) || '—'}</td>
                              </tr>
                            ))}
                            <tr className="bg-purple-50 border-t-2 border-purple-200">
                              <td className="px-4 py-3 font-saira font-bold text-purple-800">TOTAL</td>
                              <td className="px-4 py-3 text-right font-saira font-bold">{totalOS}</td>
                              <td className="px-4 py-3 text-right font-mono font-bold text-amber-600">{totalPendientes || '—'}</td>
                              <td className="px-4 py-3 text-right font-saira font-bold text-p-green">{totalFC}</td>
                              <td className="px-4 py-3 text-right font-saira font-bold text-p-ink">{moneyARS(totalImporte)}</td>
                              <td className="px-4 py-3 text-right font-mono font-bold text-p-ink">{toUsd(totalImporte) || '—'}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>)
                })()}
              </>)}
            </div>
          )}

          {ventas.length === 0 && !loading && tab !== 'aseguradoras' && tab !== 'colaboradores' && tab !== 'reclamos' && (
            <div className="text-center py-16 text-p-gray">
              <p className="text-4xl mb-2">📊</p>
              <p className="font-saira font-bold text-p-ink">Sin ventas en este período</p>
              <p className="text-sm mt-1">Registrá ventas en Caja para ver los informes.</p>
            </div>
          )}

          {/* TAB COLABORADORES */}
          {tab === 'colaboradores' && (
            <div className="flex flex-col gap-4">
              {colabLoading ? <p className="text-center text-p-ink2 py-8">Cargando…</p> : colabData.length === 0 ? (
                <p className="text-center text-p-ink2 py-8">Sin OS colocadas en este período.</p>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-p-line shadow-sm">
                  <table className="w-full text-sm">
                    <thead className="bg-p-light text-p-ink2 text-xs uppercase tracking-wider">
                      <tr>
                        <th className="px-4 py-3 text-left">Colaborador</th>
                        <th className="px-4 py-3 text-right">OS colocadas</th>
                        <th className="px-4 py-3 text-right">Vía remito</th>
                        <th className="px-4 py-3 text-right">Total ARS</th>
                        <th className="px-4 py-3 text-right">Total USD</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-p-line">
                      {colabData.map((r,i)=>(
                        <tr key={i} className="hover:bg-p-light/50">
                          <td className="px-4 py-3 font-semibold text-p-ink">{r.nombre}</td>
                          <td className="px-4 py-3 text-right font-mono">{r.cantidad}</td>
                          <td className="px-4 py-3 text-right font-mono text-p-ink2">{r.externos}</td>
                          <td className="px-4 py-3 text-right font-mono font-bold text-p-dark">{moneyARS(r.total)}</td>
                          <td className="px-4 py-3 text-right font-mono text-p-ink2">
                            {oficialRate ? `US$ ${Math.round(r.total/oficialRate).toLocaleString('es-AR')}` : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-p-light font-bold border-t-2 border-p-line">
                      <tr>
                        <td className="px-4 py-3">TOTAL</td>
                        <td className="px-4 py-3 text-right font-mono">{colabData.reduce((a,r)=>a+r.cantidad,0)}</td>
                        <td className="px-4 py-3 text-right font-mono">{colabData.reduce((a,r)=>a+r.externos,0)}</td>
                        <td className="px-4 py-3 text-right font-mono">{moneyARS(colabData.reduce((a,r)=>a+r.total,0))}</td>
                        <td className="px-4 py-3 text-right font-mono">
                          {oficialRate ? `US$ ${Math.round(colabData.reduce((a,r)=>a+r.total,0)/oficialRate).toLocaleString('es-AR')}` : '—'}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB RECLAMOS */}
          {tab === 'reclamos' && (
            <div className="flex flex-col gap-5">
              {/* Nuevo reclamo */}
              <div className="bg-white border border-p-line rounded-2xl p-4 shadow-sm">
                <p className="font-saira font-bold text-p-ink mb-3">Registrar reclamo de colocación</p>
                {/* Buscador OS */}
                <div className="relative mb-3">
                  <input value={osQuery} onChange={e=>{setOsQuery(e.target.value);setOsSelReclamo(null)}}
                    placeholder="Buscar OS por cliente o número…"
                    className="w-full border border-p-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-p-green bg-white"/>
                  {osBusqResults.length>0 && !osSelReclamo && (
                    <div className="absolute z-20 top-full left-0 right-0 bg-white border border-p-line rounded-xl shadow-xl max-h-52 overflow-y-auto mt-1">
                      {osBusqResults.map(o=>(
                        <button key={o.id} onClick={()=>{setOsSelReclamo(o);setOsQuery(o.cliente);setOsBusqResults([])}}
                          className="w-full text-left px-3 py-2.5 hover:bg-p-light border-b border-p-line last:border-0">
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <p className="text-sm font-semibold text-p-ink">{o.cliente}</p>
                              <p className="text-xs text-p-ink2">OS #{o.numero} · {o.fecha?.split('-').reverse().join('/')} · {o.colaborador_nombre||'Sin colocador'}</p>
                            </div>
                            <span className="font-mono text-xs text-p-dark shrink-0">{moneyARS(o.total)}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {osSelReclamo && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3 text-xs text-amber-800">
                    OS #{osSelReclamo.numero} — <strong>{osSelReclamo.cliente}</strong> · Colocador: {osSelReclamo.colaborador_nombre||'Sin asignar'}
                  </div>
                )}
                <textarea value={formReclamo.descripcion} onChange={e=>setFormReclamo(p=>({...p,descripcion:e.target.value}))}
                  rows={3} placeholder="Describí el reclamo (defecto de colocación, vidrio roto, filtraciones…)"
                  className="w-full border border-p-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-p-green resize-none mb-3"/>
                <div className="flex items-center justify-between gap-3">
                  <select value={formReclamo.estado} onChange={e=>setFormReclamo(p=>({...p,estado:e.target.value}))}
                    className="border border-p-line rounded-lg px-3 py-2 text-sm bg-white">
                    <option value="pendiente">Pendiente</option>
                    <option value="en_proceso">En proceso</option>
                    <option value="resuelto">Resuelto</option>
                  </select>
                  <button onClick={guardarReclamo} disabled={savingReclamo||!osSelReclamo||!formReclamo.descripcion}
                    style={{background:'#00A550',color:'#fff',border:'none',borderRadius:10,padding:'8px 20px',fontWeight:700,fontSize:13,cursor:'pointer',
                      opacity:(savingReclamo||!osSelReclamo||!formReclamo.descripcion)?0.5:1}}>
                    {savingReclamo?'Guardando…':'Registrar reclamo'}
                  </button>
                </div>
              </div>

              {/* Lista reclamos */}
              {reclamosLoading ? <p className="text-center text-p-ink2 py-4">Cargando…</p> : reclamos.length === 0 ? (
                <p className="text-center text-p-ink2 py-4">Sin reclamos registrados.</p>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-p-line shadow-sm">
                  <table className="w-full text-sm">
                    <thead className="bg-p-light text-p-ink2 text-xs uppercase tracking-wider">
                      <tr>
                        <th className="px-4 py-3 text-left">Fecha</th>
                        <th className="px-4 py-3 text-left">OS / Cliente</th>
                        <th className="px-4 py-3 text-left">Colocador</th>
                        <th className="px-4 py-3 text-left">Descripción</th>
                        <th className="px-4 py-3 text-left">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-p-line">
                      {reclamos.map(r=>(
                        <tr key={r.id} className="hover:bg-p-light/50">
                          <td className="px-4 py-3 font-mono text-xs text-p-ink2 whitespace-nowrap">{r.fecha?.split('-').reverse().join('/')}</td>
                          <td className="px-4 py-3">
                            <p className="font-semibold text-p-ink">{r.cliente_nombre}</p>
                            <p className="text-xs text-p-ink2">OS #{r.os_numero}</p>
                          </td>
                          <td className="px-4 py-3 text-p-ink2">{r.colaborador_nombre||'—'}</td>
                          <td className="px-4 py-3 text-p-ink max-w-xs truncate">{r.descripcion}</td>
                          <td className="px-4 py-3">
                            <span className={`text-[11px] font-bold px-2 py-1 rounded-full ${r.estado==='resuelto'?'bg-green-100 text-green-700':r.estado==='en_proceso'?'bg-blue-100 text-blue-700':'bg-amber-100 text-amber-700'}`}>
                              {r.estado==='resuelto'?'Resuelto':r.estado==='en_proceso'?'En proceso':'Pendiente'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
