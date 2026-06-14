'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { moneyARS } from '@/lib/utils/format'
import { Empty } from '@/components/ui'

const btn   = { background:'#00A550',color:'#fff',border:'none',borderRadius:10,padding:'10px 20px',fontWeight:700,fontSize:14,cursor:'pointer' } as const
const btnSm = { ...btn, padding:'6px 14px', fontSize:12 } as const

interface ResultVenta {
  _src: 'venta'
  id: string; tipo: string; numero: number|null; fecha: string
  cliente_nombre: string|null; total: number; estado?: string
}
interface ResultCompra {
  _src: 'compra'
  id: string; tipo: string; letra: string|null; numero: string|null; fecha: string
  proveedor_nombre: string|null; total: number; estado: string
}
type Result = ResultVenta | ResultCompra

const TIPOS_VENTA  = ['factura','presupuesto','os','nota_credito','nota_debito','remito','adas']
const TIPOS_COMPRA = ['factura','remito','nc','nd']

export default function BusquedaComprobantesClient() {
  const [q, setQ]             = useState('')
  const [tipo, setTipo]       = useState('')
  const [fuente, setFuente]   = useState<'ambos'|'ventas'|'compras'>('ambos')
  const [desde, setDesde]     = useState('')
  const [hasta, setHasta]     = useState('')
  const [results, setResults] = useState<Result[]>([])
  const [loading, setLoading] = useState(false)
  const [buscado, setBuscado] = useState(false)
  const supabase = createClient()

  async function buscar() {
    setLoading(true); setBuscado(true)
    const ventas: Result[] = []
    const compras: Result[] = []

    if (fuente !== 'compras') {
      let qv = supabase.from('comprobantes').select('id,tipo,numero,fecha,cliente_nombre,total')
      if (q)     qv = qv.or(`cliente_nombre.ilike.%${q}%,numero::text.ilike.%${q}%`)
      if (tipo)  qv = qv.eq('tipo', tipo)
      if (desde) qv = qv.gte('fecha', desde)
      if (hasta) qv = qv.lte('fecha', hasta)
      const { data } = await qv.order('fecha',{ascending:false}).limit(100)
      ;(data??[]).forEach(r => ventas.push({ _src:'venta', ...r }))
    }

    if (fuente !== 'ventas') {
      let qc = supabase.from('comprobantes_compra').select('id,tipo,letra,numero,fecha,proveedor_nombre,total,estado')
      if (q)     qc = qc.or(`proveedor_nombre.ilike.%${q}%,numero.ilike.%${q}%`)
      if (tipo)  qc = qc.eq('tipo', tipo)
      if (desde) qc = qc.gte('fecha', desde)
      if (hasta) qc = qc.lte('fecha', hasta)
      const { data } = await qc.order('fecha',{ascending:false}).limit(100)
      ;(data??[]).forEach(r => compras.push({ _src:'compra', ...r }))
    }

    // Mezclar ordenado por fecha
    const all = [...ventas, ...compras].sort((a,b) => b.fecha.localeCompare(a.fecha))
    setResults(all)
    setLoading(false)
  }

  const fmtFecha = (f:string) => f?.split('-').reverse().join('/')
  const tiposDisp = fuente === 'compras' ? TIPOS_COMPRA : fuente === 'ventas' ? TIPOS_VENTA : [...new Set([...TIPOS_VENTA,...TIPOS_COMPRA])]

  return (
    <div className="flex flex-col gap-5">
      {/* Filtros */}
      <div className="bg-white border border-p-line rounded-2xl p-5 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
          {/* Búsqueda libre */}
          <div className="md:col-span-2">
            <label className="block text-[11px] font-semibold text-p-ink2 uppercase tracking-wider mb-1">
              Cliente / Proveedor / N° comprobante
            </label>
            <input value={q} onChange={e=>setQ(e.target.value)}
              onKeyDown={e=>e.key==='Enter'&&buscar()}
              placeholder="Buscar por nombre o número…"
              className="w-full border border-p-line rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-p-green bg-white"/>
          </div>
          {/* Fuente */}
          <div>
            <label className="block text-[11px] font-semibold text-p-ink2 uppercase tracking-wider mb-1">Fuente</label>
            <select value={fuente} onChange={e=>setFuente(e.target.value as any)}
              className="w-full border border-p-line rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-p-green">
              <option value="ambos">Ventas + Compras</option>
              <option value="ventas">Solo Ventas</option>
              <option value="compras">Solo Compras</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Tipo */}
          <div>
            <label className="block text-[11px] font-semibold text-p-ink2 uppercase tracking-wider mb-1">Tipo</label>
            <select value={tipo} onChange={e=>setTipo(e.target.value)}
              className="w-full border border-p-line rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-p-green">
              <option value="">Todos los tipos</option>
              {tiposDisp.map(t=><option key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1).replace('_',' ')}</option>)}
            </select>
          </div>
          {/* Fechas */}
          <div>
            <label className="block text-[11px] font-semibold text-p-ink2 uppercase tracking-wider mb-1">Desde</label>
            <input type="date" value={desde} onChange={e=>setDesde(e.target.value)}
              className="w-full border border-p-line rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-p-green"/>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-p-ink2 uppercase tracking-wider mb-1">Hasta</label>
            <input type="date" value={hasta} onChange={e=>setHasta(e.target.value)}
              className="w-full border border-p-line rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-p-green"/>
          </div>
        </div>
        <div className="flex items-center gap-3 mt-4">
          <button onClick={buscar} disabled={loading} style={{...btn,opacity:loading?.7:1}}>
            {loading?'Buscando…':'🔍 Buscar'}
          </button>
          <button onClick={()=>{setQ('');setTipo('');setFuente('ambos');setDesde('');setHasta('');setResults([]);setBuscado(false)}}
            style={{...btnSm,background:'#6b7280'}}>
            Limpiar
          </button>
          {buscado && !loading && (
            <span className="text-sm text-p-ink2 ml-2">{results.length} resultado(s)</span>
          )}
        </div>
      </div>

      {/* Resultados */}
      {buscado && !loading && results.length === 0 && (
        <Empty msg="Sin resultados para los filtros aplicados." />
      )}

      {results.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-p-line shadow-sm bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-p-ink2 uppercase tracking-wider">Origen</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-p-ink2 uppercase tracking-wider">Tipo</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-p-ink2 uppercase tracking-wider">N°</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-p-ink2 uppercase tracking-wider">Fecha</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-p-ink2 uppercase tracking-wider">Cliente / Proveedor</th>
                <th className="text-right px-3 py-3 text-xs font-semibold text-p-ink2 uppercase tracking-wider">Total</th>
                <th className="text-center px-3 py-3 text-xs font-semibold text-p-ink2 uppercase tracking-wider">Estado</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r,i) => {
                const esVenta = r._src === 'venta'
                const rv = r as ResultVenta
                const rc = r as ResultCompra
                const numero = esVenta
                  ? (rv.numero ? `N° ${rv.numero}` : 'S/N')
                  : (rc.letra ? `${rc.letra}-${rc.numero||'S/N'}` : rc.numero||'S/N')
                const nombre = esVenta ? rv.cliente_nombre : rc.proveedor_nombre
                const estado = esVenta ? '' : rc.estado

                return (
                  <tr key={r.id} className={`border-t border-p-line2 ${i%2===0?'':'bg-p-light/30'} hover:bg-p-light/50`}>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${esVenta?'bg-blue-100 text-blue-700':'bg-amber-100 text-amber-700'}`}>
                        {esVenta?'💰 Venta':'🛒 Compra'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-semibold text-p-dark capitalize">{r.tipo?.replace('_',' ')}</span>
                    </td>
                    <td className="px-3 py-3 font-mono text-xs text-p-dark font-bold">{numero}</td>
                    <td className="px-3 py-3 text-xs text-p-ink2 font-mono">{fmtFecha(r.fecha)}</td>
                    <td className="px-3 py-3 text-xs text-p-ink max-w-[180px] truncate">{nombre||'—'}</td>
                    <td className="px-3 py-3 text-right font-mono font-bold text-sm text-p-dark">{moneyARS(r.total||0)}</td>
                    <td className="px-3 py-3 text-center">
                      {estado && (
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          estado==='procesado'?'bg-green-100 text-green-700':
                          estado==='anulado'?'bg-gray-100 text-gray-400':'bg-amber-100 text-amber-700'
                        }`}>{estado}</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            {results.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-p-line bg-p-light">
                  <td colSpan={5} className="px-4 py-3 font-bold text-sm text-p-dark">
                    {results.length} resultado(s)
                  </td>
                  <td className="px-3 py-3 text-right font-mono font-bold text-p-dark">
                    {moneyARS(results.reduce((a,r)=>a+(r.total||0),0))}
                  </td>
                  <td/>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  )
}
