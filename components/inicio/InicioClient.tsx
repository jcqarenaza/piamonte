'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { moneyARS } from '@/lib/utils/format'

// IMPORTANTE: toISOString() siempre devuelve la fecha en UTC, no en hora de Argentina.
// Después de las 21:00 hs (00:00 UTC), eso hace que "hoy" salte al día siguiente mientras
// en Argentina sigue siendo el día anterior — desalineando el gráfico de ventas contra las
// fechas reales guardadas en la base (que se guardan en hora local). Por eso acá se construye
// la fecha a partir de las partes locales del Date, igual que en el resto del sistema.
function fechaLocalStr(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
const todayStr = () => fechaLocalStr()

interface KPI { label: string; value: string; sub?: string; color?: string; href?: string }

export default function InicioClient({ nombre, rol, userId }: { nombre: string; rol: string; userId: string }) {
  const [kpis, setKpis]       = useState<KPI[]>([])
  const [turnos, setTurnos]   = useState<any[]>([])
  const [stockBajo, setStockBajo] = useState<any[]>([])
  const [actividad, setActividad] = useState<any[]>([])
  const [chart, setChart]     = useState<{d:string;v:number}[]>([])
  const [dolar, setDolar]     = useState<{blue:number;fecha:string}|null>(null)
  const [loading, setLoading] = useState(true)
  const [saludoStr, setSaludoStr] = useState('')
  const [fechaStr, setFechaStr]   = useState('')
  const supabase = createClient()

  useEffect(() => {
    const hoy = todayStr()
    // Construido a partir de fechaLocalStr restando días en el objeto Date local — nunca con
    // aritmética sobre milisegundos UTC, que es justo lo que generaba el corrimiento de días.
    const hace7Date = new Date()
    hace7Date.setDate(hace7Date.getDate() - 7)
    const hace7 = fechaLocalStr(hace7Date)
    const mes = hoy.slice(0, 7)

    // Calcular saludo y fecha solo en el cliente para evitar hydration mismatch
    const h = new Date().getHours()
    const s = h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches'
    setSaludoStr(`${s}, ${nombre.split(' ')[0]}`)
    setFechaStr(new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }))

    Promise.all([
      // KPIs del día — ventas es la fuente de verdad (caja + comprobantes)
      supabase.from('ventas').select('precio').eq('fecha', hoy),
      supabase.from('ventas').select('precio,costo,pendiente').gte('fecha', `${mes}-01`),
      supabase.from('turnos').select('estado').eq('fecha', hoy),
      supabase.from('ventas').select('precio').gte('fecha', `${mes}-01`),
      // Turnos de hoy
      supabase.from('turnos').select('*').eq('fecha', hoy).order('hora').limit(10),
      // Stock bajo (cantidad < 2)
      supabase.from('stock').select('descripcion,cantidad,codigo,pos').eq('activo', true).lt('cantidad', 2).order('cantidad').limit(6),
      // Actividad reciente
      supabase.from('comprobantes').select('id,numero,cliente_nombre,aseguradora_nombre,total,fecha,tipo,categoria,nro_cbte_afip').order('created_at', { ascending: false }).limit(5),
      // Ventas últimos 7 días para chart
      supabase.from('ventas').select('fecha,precio').gte('fecha', hace7).order('fecha'),
      // Cotización dólar
      supabase.from('cotizaciones').select('blue,fecha').order('fecha', { ascending: false }).limit(1).maybeSingle(),
    ]).then(([compHoy, ventasMes, turnosHoy, compMes, turnosData, stockData, actData, chartData, dolarData]) => {
      const facHoy   = (compHoy.data ?? []).reduce((a: number, c: any) => a + (c.precio || 0), 0)
      const facMes   = (compMes.data ?? []).reduce((a: number, c: any) => a + (c.precio || 0), 0)
      const gananMes = (ventasMes.data ?? []).filter((v: any) => !v.pendiente).reduce((a: number, v: any) => a + ((v.precio || 0) - (v.costo || 0)), 0)
      const pendsMes = (ventasMes.data ?? []).filter((v: any) => v.pendiente).length
      const tConf    = (turnosHoy.data ?? []).filter((t: any) => t.estado === 'confirmado').length
      const tTotal   = (turnosHoy.data ?? []).length

      const kpisList: KPI[] = [
        { label: 'Facturado hoy',    value: moneyARS(facHoy),  href: '/comprobantes' },
        { label: 'Facturado mes',    value: moneyARS(facMes),  href: '/comprobantes' },
        { label: 'Ganancia mes',     value: moneyARS(gananMes), color: '#00A550', sub: pendsMes > 0 ? `${pendsMes} sin costo` : undefined, href: '/informes' },
        { label: 'Turnos hoy',       value: `${tTotal}`, sub: `${tConf} confirmados`, href: '/turnos' },
      ]
      setKpis(kpisList)
      setTurnos(turnosData.data ?? [])
      setStockBajo(stockData.data ?? [])
      setActividad(actData.data ?? [])
      if (dolarData.data) setDolar(dolarData.data)

      // Chart últimos 7 días — generado con fechas locales (no UTC) para que coincidan
      // exactamente con cómo se guardan las fechas de venta, y los días sin venta queden
      // como huecos en su posición correcta en vez de desordenar el orden cronológico.
      const byDay: Record<string, number> = {}
      for (let i = 6; i >= 0; i--) {
        const d = new Date()
        d.setDate(d.getDate() - i)
        byDay[fechaLocalStr(d)] = 0
      }
      for (const v of chartData.data ?? []) {
        if (v.fecha in byDay) byDay[v.fecha] = (byDay[v.fecha] || 0) + v.precio
      }
      setChart(Object.entries(byDay).map(([d, v]) => ({ d, v })))

      setLoading(false)
    })
  }, [supabase])

  const maxChart = Math.max(...chart.map(c => c.v), 1)
  const ESTADO_COLOR: Record<string, string> = { pendiente: '#f59e0b', confirmado: '#00A550', hecho: '#6b7280', ausente: '#ef4444' }

  return (
    <div className="flex flex-col gap-6 pb-8">
      {/* Saludo */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-saira font-black text-2xl text-p-ink">{saludoStr || `Hola, ${nombre.split(' ')[0]}`}</h1>
          <p className="text-sm text-p-ink2 mt-0.5">
            {fechaStr}
            {dolar && <span className="ml-3 font-mono text-p-dark font-bold">💵 Blue ${dolar.blue.toLocaleString('es-AR')}</span>}
          </p>
        </div>
        <Link href="/comprobantes" style={{ background: '#00A550', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 20px', fontWeight: 700, fontSize: 14, textDecoration: 'none', display: 'inline-block' }}>
          + Nuevo comprobante
        </Link>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {loading ? Array(4).fill(0).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-p-line p-4 animate-pulse h-20"/>
        )) : kpis.map((k, i) => (
          <Link key={i} href={k.href || '#'} className="bg-white rounded-xl border border-p-line p-4 shadow-sm hover:shadow-md transition-shadow no-underline block">
            <p className="text-[11px] font-semibold text-p-ink2 uppercase tracking-wider mb-1">{k.label}</p>
            <p className="font-saira font-bold text-xl" style={{ color: k.color || '#0C1810' }}>{k.value}</p>
            {k.sub && <p className={`text-[10px] font-semibold mt-0.5 ${k.sub.startsWith('USD') ? 'text-p-green' : 'text-amber-500'}`}>{k.sub}</p>}
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Chart últimos 7 días */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-p-line p-4 shadow-sm">
          <p className="font-saira font-bold text-sm text-p-ink mb-4">Ventas — últimos 7 días</p>
          {chart.every(c => c.v === 0) ? (
            <p className="text-sm text-p-gray text-center py-8">Sin ventas en los últimos 7 días.</p>
          ) : (
            <div className="flex items-end gap-2 h-32">
              {chart.map(({ d, v }) => {
                const h = Math.max(4, Math.round((v / maxChart) * 112))
                const dd = d.slice(8, 10) + '/' + d.slice(5, 7)
                const isHoy = d === todayStr()
                return (
                  <div key={d} className="flex-1 flex flex-col items-center gap-1">
                    {v > 0 && <span className="text-[9px] font-mono text-p-ink2">{moneyARS(v).replace('$', '')}</span>}
                    <div className="w-full rounded-t-md transition-all"
                      style={{ height: h, background: isHoy ? '#00A550' : '#C2DDD0' }}/>
                    <span className={`text-[10px] font-mono ${isHoy ? 'text-p-green font-bold' : 'text-p-ink2'}`}>{dd}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Turnos hoy */}
        <div className="bg-white rounded-xl border border-p-line shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-p-line2 flex items-center justify-between">
            <p className="font-saira font-bold text-sm text-p-ink">Turnos de hoy</p>
            <Link href="/turnos" className="text-xs text-p-green font-semibold">Ver todos →</Link>
          </div>
          {turnos.length === 0 ? (
            <p className="text-sm text-p-gray text-center py-6">Sin turnos hoy.</p>
          ) : (
            <div className="divide-y divide-p-line2">
              {turnos.slice(0, 6).map((t: any) => (
                <div key={t.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="font-mono text-xs text-p-ink2 shrink-0">{t.hora?.slice(0,5)}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-p-ink truncate">{t.cliente ?? '(sin nombre)'}</p>
                    <p className="text-[10px] text-p-ink2 truncate">{t.trabajo || t.vehiculo || ''}</p>
                  </div>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white shrink-0"
                    style={{ background: ESTADO_COLOR[t.estado] || '#6b7280' }}>
                    {t.estado}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Actividad reciente */}
        <div className="bg-white rounded-xl border border-p-line shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-p-line2 flex items-center justify-between">
            <p className="font-saira font-bold text-sm text-p-ink">Últimos comprobantes</p>
            <Link href="/comprobantes" className="text-xs text-p-green font-semibold">Ver todos →</Link>
          </div>
          {actividad.length === 0 ? (
            <p className="text-sm text-p-gray text-center py-6">Sin comprobantes todavía.</p>
          ) : (
            <div className="divide-y divide-p-line2">
              {actividad.map((c: any) => (
                <div key={c.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className={`font-mono text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${c.categoria==='nc'?'bg-amber-100 text-amber-700':'bg-p-light text-p-dark'}`}>
                    {c.categoria==='nc' ? 'NC' : (c.tipo||'X')}-{String(c.nro_cbte_afip ?? c.numero ?? 0).padStart(4,'0')}
                  </span>
                  <p className="text-sm text-p-ink flex-1 truncate">{c.cliente_nombre||c.aseguradora_nombre||'Consumidor Final'}</p>
                  <p className="font-mono text-sm font-bold text-p-ink shrink-0">{moneyARS(c.total)}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Stock bajo */}
        {stockBajo.length > 0 && (
          <div className="bg-white rounded-xl border-2 border-amber-300 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-amber-100 bg-amber-50 flex items-center justify-between">
              <p className="font-saira font-bold text-sm text-amber-800">⚠ Stock bajo</p>
              <Link href="/stock" className="text-xs text-amber-700 font-semibold">Ver stock →</Link>
            </div>
            <div className="divide-y divide-amber-50">
              {stockBajo.map((s: any, i: number) => (
                <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                  <span className={`font-saira font-black text-lg shrink-0 ${s.cantidad === 0 ? 'text-red-500' : 'text-amber-500'}`}>
                    {s.cantidad}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-p-ink truncate">{s.descripcion}</p>
                    <p className="text-[10px] text-p-ink2 font-mono">{[s.codigo, s.pos].filter(Boolean).join(' · ')}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
