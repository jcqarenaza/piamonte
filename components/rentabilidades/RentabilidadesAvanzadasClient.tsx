'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { moneyARS } from '@/lib/utils/format'
import { useDolar } from '@/components/dolar/DolarBar'

interface VentaMes {
  mes: string; operaciones: number; facturado: number
  neto: number; iva_total: number; tipo_cliente: string|null
}
interface TopPieza { descripcion:string; veces:number; total:number; ganancia:number }

const MESES_LABEL: Record<string,string> = {
  '01':'Ene','02':'Feb','03':'Mar','04':'Abr','05':'May','06':'Jun',
  '07':'Jul','08':'Ago','09':'Sep','10':'Oct','11':'Nov','12':'Dic'
}

function fmtMes(mes:string) {
  const [y,m] = mes.split('-')
  return `${MESES_LABEL[m]||m} ${y}`
}

export default function RentabilidadesAvanzadasClient() {
  const [datos, setDatos]       = useState<VentaMes[]>([])
  const [topPiezas, setTopPiezas] = useState<TopPieza[]>([])
  const [compras, setCompras]   = useState<any[]>([])
  const [ventasCajaPorMes, setVentasCajaPorMes] = useState<Record<string,{operaciones:number;total:number}>>({})
  const [loading, setLoading]   = useState(true)
  const [periodo, setPeriodo]   = useState(6) // meses a mostrar
  const supabase = createClient()
  const { usdStr } = useDolar()
  // Estimación en USD Banco Nación (cotización oficial) — pedido explícito del cliente para
  // todas las pantallas de reportes/rentabilidad/finanzas, no blue ni MEP.
  const usdBNA = (n: number) => usdStr(n, 'oficial')

  useEffect(()=>{
    async function load() {
      setLoading(true)
      const [r1, r2, r3, r4] = await Promise.all([
        supabase.from('vista_rentabilidad_mensual').select('*').limit(100),
        supabase.from('ventas').select('descripcion,precio,costo').not('descripcion','is',null).limit(500),
        supabase.from('comprobantes_compra').select('fecha,total,proveedor_nombre,tipo').eq('tipo','factura').eq('estado','pendiente').order('fecha',{ascending:false}).limit(50),
        // Ventas registradas directo en Caja, sin pasar por un comprobante (no llevan factura).
        // Se excluyen las que sí tienen comprobante_id porque esas ya están contadas en
        // vista_rentabilidad_mensual — sumarlas de nuevo acá duplicaría el total facturado.
        supabase.from('ventas').select('fecha,precio').is('comprobante_id', null).not('fecha','is',null).limit(2000),
      ])
      setDatos(r1.data??[])

      // Agrupar top piezas — se excluyen las filas de devolución por NC (precio negativo,
      // descripción "NC ... — devolución ..."), que no son piezas vendidas.
      const map: Record<string,{veces:number;total:number;ganancia:number}> = {}
      for(const v of r2.data??[]) {
        if (!v.descripcion || v.descripcion.startsWith('NC ')) continue
        const k = v.descripcion
        if(!map[k]) map[k]={veces:0,total:0,ganancia:0}
        map[k].veces++
        map[k].total += v.precio||0
        map[k].ganancia += (v.precio||0)-(v.costo||0)
      }
      const top = Object.entries(map)
        .map(([d,v])=>({descripcion:d,...v}))
        .sort((a,b)=>b.total-a.total).slice(0,10)
      setTopPiezas(top)
      setCompras(r3.data??[])

      // Ventas de Caja agrupadas por mes (YYYY-MM), para sumarlas al Facturado de cada mes
      const cajaMap: Record<string,{operaciones:number;total:number}> = {}
      for(const v of r4.data??[]) {
        const mes = String(v.fecha).slice(0,7)
        if(!cajaMap[mes]) cajaMap[mes] = {operaciones:0,total:0}
        cajaMap[mes].operaciones++
        cajaMap[mes].total += v.precio||0
      }
      setVentasCajaPorMes(cajaMap)
      setLoading(false)
    }
    load()
  },[supabase])

  // Agrupar por mes — se combinan los comprobantes (vista_rentabilidad_mensual) con las
  // ventas registradas directo en Caja sin factura, para que "Facturado" refleje todo lo vendido.
  const meses = [...new Set([...datos.map(d=>d.mes), ...Object.keys(ventasCajaPorMes)])].sort().reverse().slice(0,periodo)
  const porMes = meses.map(m=>{
    const rows = datos.filter(d=>d.mes===m)
    const caja = ventasCajaPorMes[m] ?? {operaciones:0,total:0}
    return {
      mes: m,
      operaciones: rows.reduce((a,r)=>a+r.operaciones,0) + caja.operaciones,
      facturado: rows.reduce((a,r)=>a+r.facturado,0) + caja.total,
      neto: rows.reduce((a,r)=>a+r.neto,0),
    }
  })

  // Por tipo de cliente (mes actual) — se agrega "Caja (sin factura)" como un tipo más,
  // para que las ventas de Caja también se vean en este desglose y no falten del total.
  const meActual = new Date().toISOString().slice(0,7)
  const cajaMesActual = ventasCajaPorMes[meActual]
  const porTipo = [
    ...datos.filter(d=>d.mes===meActual),
    ...(cajaMesActual && cajaMesActual.total > 0
      ? [{ mes:meActual, operaciones:cajaMesActual.operaciones, facturado:cajaMesActual.total, neto:0, iva_total:0, tipo_cliente:'Caja (sin factura)' }]
      : [])
  ]

  // Totales acumulados del período
  const totalFact = porMes.reduce((a,m)=>a+m.facturado,0)
  const totalOps  = porMes.reduce((a,m)=>a+m.operaciones,0)
  const ticketProm = totalOps > 0 ? Math.round(totalFact/totalOps) : 0

  // Compras del período
  const totalCompras = compras.slice(0,periodo*10).reduce((a,c)=>a+c.total,0)
  const margenBruto  = totalFact > 0 ? Math.round(((totalFact-totalCompras)/totalFact)*100) : 0

  if(loading) return <p className="text-sm text-p-gray text-center py-10">Cargando…</p>

  return (
    <div className="flex flex-col gap-6">
      {/* Selector período */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-p-ink2 font-semibold">Período:</span>
        {[3,6,12].map(p=>(
          <button key={p} onClick={()=>setPeriodo(p)}
            style={{background:periodo===p?'#0C1810':'#fff',color:periodo===p?'#fff':'#4A6655',border:'1.5px solid #C2DDD0',borderRadius:20,padding:'5px 16px',fontWeight:700,fontSize:12,cursor:'pointer'}}>
            {p} meses
          </button>
        ))}
      </div>

      {/* KPIs del período */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white border border-p-line rounded-xl p-4 shadow-sm">
          <p className="text-[11px] font-semibold text-p-ink2 uppercase tracking-wider">Facturado</p>
          <p className="font-saira font-bold text-xl text-p-ink mt-1">{moneyARS(totalFact)}</p>
          <p className="text-[10px] text-p-ink2">{usdBNA(totalFact)} · {totalOps} operaciones</p>
        </div>
        <div className="bg-white border border-p-line rounded-xl p-4 shadow-sm">
          <p className="text-[11px] font-semibold text-p-ink2 uppercase tracking-wider">Ticket promedio</p>
          <p className="font-saira font-bold text-xl text-p-ink mt-1">{moneyARS(ticketProm)}</p>
          <p className="text-[10px] text-p-ink2">{usdBNA(ticketProm)}</p>
        </div>
        <div className="bg-white border border-p-line rounded-xl p-4 shadow-sm">
          <p className="text-[11px] font-semibold text-p-ink2 uppercase tracking-wider">Compras (facturas)</p>
          <p className="font-saira font-bold text-xl text-p-ink mt-1">{moneyARS(totalCompras)}</p>
          <p className="text-[10px] text-p-ink2">{usdBNA(totalCompras)}</p>
        </div>
        <div className="bg-white border border-p-line rounded-xl p-4 shadow-sm">
          <p className="text-[11px] font-semibold text-p-ink2 uppercase tracking-wider">Margen estimado</p>
          <p className={`font-saira font-bold text-xl mt-1 ${margenBruto>30?'text-p-green':margenBruto>0?'text-amber-500':'text-red-500'}`}>{margenBruto}%</p>
        </div>
      </div>

      {/* Evolución mensual */}
      <div className="bg-white border border-p-line rounded-xl p-5 shadow-sm">
        <h3 className="font-saira font-bold text-p-ink mb-4">Evolución mensual</h3>
        {porMes.length === 0 ? <p className="text-sm text-p-ink2 text-center py-4">Sin datos</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-p-green">
                  <th className="text-left py-2 font-bold text-p-ink2 text-xs uppercase">Mes</th>
                  <th className="text-right py-2 font-bold text-p-ink2 text-xs uppercase">Operaciones</th>
                  <th className="text-right py-2 font-bold text-p-ink2 text-xs uppercase">Facturado</th>
                  <th className="text-right py-2 font-bold text-p-ink2 text-xs uppercase">USD BNA</th>
                  <th className="text-right py-2 font-bold text-p-ink2 text-xs uppercase">Ticket prom.</th>
                </tr>
              </thead>
              <tbody>
                {porMes.map((m,i)=>{
                  const maxFact = Math.max(...porMes.map(x=>x.facturado))
                  const pct = maxFact > 0 ? (m.facturado/maxFact)*100 : 0
                  return (
                    <tr key={m.mes} className={`border-b border-p-line2 ${i%2===0?'':'bg-p-light/30'}`}>
                      <td className="py-2.5 font-bold text-p-ink">{fmtMes(m.mes)}</td>
                      <td className="py-2.5 text-right text-p-ink2">{m.operaciones}</td>
                      <td className="py-2.5 text-right">
                        <div className="flex items-center gap-2 justify-end">
                          <div className="h-2 rounded-full bg-p-green/20 w-20 overflow-hidden">
                            <div className="h-full bg-p-green rounded-full" style={{width:`${pct}%`}}/>
                          </div>
                          <span className="font-mono font-bold text-p-dark">{moneyARS(m.facturado)}</span>
                        </div>
                      </td>
                      <td className="py-2.5 text-right font-mono text-p-ink2">{usdBNA(m.facturado)}</td>
                      <td className="py-2.5 text-right font-mono text-p-ink2">{moneyARS(m.operaciones>0?Math.round(m.facturado/m.operaciones):0)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Por tipo de cliente */}
        <div className="bg-white border border-p-line rounded-xl p-5 shadow-sm">
          <h3 className="font-saira font-bold text-p-ink mb-4">Por tipo de cliente — mes actual</h3>
          {porTipo.length === 0 ? <p className="text-sm text-p-ink2 text-center py-4">Sin datos este mes</p> : (
            <div className="flex flex-col gap-2">
              {porTipo.sort((a,b)=>b.facturado-a.facturado).map(t=>{
                const maxT = Math.max(...porTipo.map(x=>x.facturado))
                const pct  = maxT > 0 ? (t.facturado/maxT)*100 : 0
                return (
                  <div key={t.tipo_cliente||'sin-tipo'} className="flex items-center gap-3">
                    <span className="text-xs font-semibold text-p-ink w-28 shrink-0 truncate">{t.tipo_cliente||'Sin tipo'}</span>
                    <div className="flex-1 h-3 bg-p-light rounded-full overflow-hidden">
                      <div className="h-full bg-p-green rounded-full" style={{width:`${pct}%`}}/>
                    </div>
                    <span className="font-mono font-bold text-xs text-p-dark w-24 text-right shrink-0">
                      {moneyARS(t.facturado)}<br/><span className="font-normal text-[9px] text-p-ink2">{usdBNA(t.facturado)}</span>
                    </span>
                    <span className="text-[10px] text-p-ink2 w-8 text-right shrink-0">{t.operaciones}op</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Top 10 piezas */}
        <div className="bg-white border border-p-line rounded-xl p-5 shadow-sm">
          <h3 className="font-saira font-bold text-p-ink mb-4">Top 10 piezas más vendidas</h3>
          {topPiezas.length === 0 ? <p className="text-sm text-p-ink2 text-center py-4">Sin datos</p> : (
            <div className="flex flex-col gap-1.5">
              {topPiezas.map((p,i)=>(
                <div key={p.descripcion} className="flex items-center gap-2 py-1 border-b border-p-line2 last:border-0">
                  <span className="text-[10px] font-black text-p-ink2 w-5 shrink-0">#{i+1}</span>
                  <p className="text-xs text-p-ink flex-1 truncate">{p.descripcion}</p>
                  <span className="text-[10px] text-p-ink2 shrink-0">{p.veces}×</span>
                  <span className="font-mono font-bold text-xs text-p-dark shrink-0 text-right">
                    {moneyARS(p.total)}<br/><span className="font-normal text-[9px] text-p-ink2">{usdBNA(p.total)}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
