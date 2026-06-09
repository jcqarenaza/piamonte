'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { KpiCard } from '@/components/ui'
import { moneyARS } from '@/lib/utils/format'

interface Venta { fecha:string; precio:number; costo:number|null; descripcion:string; pendiente:boolean }
interface Periodo { label:string; desde:string; hasta:string }

function getPeridos(): Periodo[] {
  const now = new Date()
  const mes = now.toISOString().slice(0,7)
  const prev = new Date(now.getFullYear(), now.getMonth()-1, 1).toISOString().slice(0,7)
  const year = now.getFullYear()
  return [
    { label:'Este mes',    desde:`${mes}-01`,    hasta:now.toISOString().slice(0,10) },
    { label:'Mes anterior',desde:`${prev}-01`,   hasta:`${prev}-${new Date(now.getFullYear(),now.getMonth(),0).getDate()}` },
    { label:'Este año',    desde:`${year}-01-01`,hasta:now.toISOString().slice(0,10) },
    { label:'Últimos 7 días', desde:new Date(now.getTime()-7*86400000).toISOString().slice(0,10), hasta:now.toISOString().slice(0,10) },
  ]
}

export default function InformesClient() {
  const [periodos] = useState<Periodo[]>(getPeridos())
  const [periodoIdx, setPeriodoIdx] = useState(0)
  const [ventas, setVentas] = useState<Venta[]>([])
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    const p = periodos[periodoIdx]
    setLoading(true)
    supabase.from('ventas').select('fecha,precio,costo,descripcion,pendiente')
      .gte('fecha', p.desde).lte('fecha', p.hasta).order('fecha', {ascending:false})
      .then(({data}) => { setVentas(data ?? []); setLoading(false) })
  }, [periodoIdx, periodos, supabase])

  const periodo = periodos[periodoIdx]
  const total = ventas.reduce((a,v) => a+v.precio, 0)
  const costo = ventas.filter(v=>!v.pendiente).reduce((a,v) => a+(v.costo??0), 0)
  const ganancia = total - costo
  const pct = total > 0 ? Math.round((ganancia/total)*100) : 0
  const pendientes = ventas.filter(v=>v.pendiente).length
  const ticket = ventas.length > 0 ? Math.round(total/ventas.length) : 0

  // Agrupar por día para gráfico simple
  const byDia = ventas.reduce((acc,v) => {
    acc[v.fecha] = (acc[v.fecha]||0) + v.precio
    return acc
  }, {} as Record<string,number>)
  const dias = Object.entries(byDia).sort((a,b)=>a[0].localeCompare(b[0]))
  const maxDia = Math.max(...dias.map(d=>d[1]), 1)

  // Top piezas
  const byPieza = ventas.reduce((acc,v) => {
    acc[v.descripcion] = (acc[v.descripcion]||0) + v.precio
    return acc
  }, {} as Record<string,number>)
  const topPiezas = Object.entries(byPieza).sort((a,b)=>b[1]-a[1]).slice(0,5)

  return (
    <div>
      {/* Selector de período */}
      <div className="flex gap-2 flex-wrap mb-6">
        {periodos.map((p,i) => (
          <button key={i} onClick={() => setPeriodoIdx(i)}
            style={{ background: periodoIdx===i ? '#00A550' : '#fff', color: periodoIdx===i ? '#fff' : '#4A6655',
              border: `1.5px solid ${periodoIdx===i ? '#00A550' : '#C2DDD0'}`,
              borderRadius:10, padding:'8px 18px', fontWeight:700, fontSize:13, cursor:'pointer' }}>
            {p.label}
          </button>
        ))}
      </div>

      {loading ? <p className="text-sm text-p-gray text-center py-10">Cargando…</p> : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <KpiCard label="Facturado" value={moneyARS(total)} />
            <KpiCard label={`Ganancia${pendientes?' (parcial)':''}`} value={moneyARS(ganancia)} accent sub={`${pct}% margen`} />
            <KpiCard label="Operaciones" value={`${ventas.length}`} sub={pendientes ? `${pendientes} s/costo` : undefined} />
            <KpiCard label="Ticket promedio" value={moneyARS(ticket)} />
          </div>

          {/* Gráfico de barras por día */}
          {dias.length > 0 && (
            <div className="bg-white border border-p-line rounded-xl p-4 mb-6 shadow-sm">
              <p className="font-saira font-bold text-sm text-p-ink mb-4">Ventas por día</p>
              <div className="flex items-end gap-1 h-28 overflow-x-auto pb-1">
                {dias.map(([fecha, monto]) => {
                  const h = Math.max(4, Math.round((monto/maxDia)*96))
                  const dd = fecha.slice(8,10)+'/'+fecha.slice(5,7)
                  return (
                    <div key={fecha} className="flex flex-col items-center gap-1 flex-shrink-0" style={{minWidth:32}}>
                      <div className="w-full rounded-t-md transition-all" style={{height:h,background:'#00A550',minWidth:24}}/>
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
                  {topPiezas.map(([desc, monto], i) => (
                    <div key={i} className="flex items-center gap-3">
                      <span className="font-saira font-bold text-p-green w-5 shrink-0">{i+1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-p-ink truncate">{desc}</p>
                        <div className="mt-1 bg-p-line rounded-full h-1.5 overflow-hidden">
                          <div className="h-full rounded-full bg-p-green" style={{width:`${Math.round((monto/topPiezas[0][1])*100)}%`}}/>
                        </div>
                      </div>
                      <span className="font-mono text-xs font-bold text-p-ink shrink-0">{moneyARS(monto)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Detalle de ventas */}
            <div className="bg-white border border-p-line rounded-xl p-4 shadow-sm">
              <p className="font-saira font-bold text-sm text-p-ink mb-3">
                Últimas ventas <span className="font-normal text-p-ink2 text-xs">{periodo.desde.split('-').reverse().join('/')} — {periodo.hasta.split('-').reverse().join('/')}</span>
              </p>
              {ventas.length === 0 ? (
                <p className="text-sm text-p-gray text-center py-6">Sin ventas en este período.</p>
              ) : (
                <div className="flex flex-col gap-2 max-h-72 overflow-y-auto">
                  {ventas.slice(0,30).map((v,i) => (
                    <div key={i} className={`flex items-center gap-3 py-1.5 border-b border-p-line2 last:border-0 ${v.pendiente?'opacity-60':''}`}>
                      <span className="font-mono text-xs text-p-ink2 shrink-0">{v.fecha.slice(8,10)}/{v.fecha.slice(5,7)}</span>
                      <span className="text-sm text-p-ink flex-1 min-w-0 truncate">{v.descripcion}</span>
                      {v.pendiente && <span className="text-[10px] text-amber-500 shrink-0">s/costo</span>}
                      <span className="font-mono text-xs font-bold text-p-ink shrink-0">{moneyARS(v.precio)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {ventas.length === 0 && !loading && (
            <div className="text-center py-16 text-p-gray">
              <p className="text-4xl mb-2">📊</p>
              <p className="font-saira font-bold text-p-ink">Sin datos en este período</p>
              <p className="text-sm mt-1">Registrá ventas en Caja para ver los informes.</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
