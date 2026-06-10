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
  const [tab, setTab] = useState<'general'|'rentabilidad'>('general')
  const supabase = createClient()

  useEffect(() => {
    const p = periodos[pIdx]
    setLoading(true)
    supabase.from('ventas').select('fecha,precio,costo,descripcion,pendiente,tipo_cliente_nombre')
      .gte('fecha', p.desde).lte('fecha', p.hasta).order('fecha',{ascending:false})
      .then(({data}) => { setVentas(data??[]); setLoading(false) })
  }, [pIdx, periodos, supabase])

  const periodo = periodos[pIdx]
  const total    = ventas.reduce((a,v)=>a+v.precio, 0)
  const costo    = ventas.filter(v=>!v.pendiente).reduce((a,v)=>a+(v.costo??0), 0)
  const ganancia = total - costo
  const margen   = total > 0 ? Math.round((ganancia/total)*100) : 0
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

  const tabBtn = (t:'general'|'rentabilidad', label:string) => (
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
            <KpiCard label="Facturado"    value={moneyARS(total)} />
            <KpiCard label={`Ganancia${pendientes?' (parcial)':''}`} value={moneyARS(ganancia)} accent sub={`${margen}% margen`} />
            <KpiCard label="Operaciones"  value={`${ventas.length}`} sub={pendientes?`${pendientes} s/costo`:undefined} />
            <KpiCard label="Ticket prom." value={moneyARS(ticket)} />
          </div>

          {/* Tabs */}
          <div className="flex gap-2 mb-5">
            {tabBtn('general','📊 General')}
            {tabBtn('rentabilidad','💹 Rentabilidad por tipo')}
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

          {ventas.length === 0 && !loading && (
            <div className="text-center py-16 text-p-gray">
              <p className="text-4xl mb-2">📊</p>
              <p className="font-saira font-bold text-p-ink">Sin ventas en este período</p>
              <p className="text-sm mt-1">Registrá ventas en Caja para ver los informes.</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
