'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { moneyARS2 as moneyARS } from '@/lib/utils/format'
import { Empty } from '@/components/ui'

const btn   = { background:'#00A550',color:'#fff',border:'none',borderRadius:10,padding:'10px 20px',fontWeight:700,fontSize:14,cursor:'pointer' } as const
const btnSm = { ...btn, padding:'6px 14px', fontSize:12 } as const

type Fuente = 'ventas'|'compras'|'ops'|'stock'

interface Row {
  _src: Fuente
  id: string
  tipo?: string
  numero?: string|number|null
  fecha: string
  contraparte?: string|null
  total?: number|null
  estado?: string|null
  descripcion?: string|null
}

export default function BusquedaComprobantesClient() {
  const [q, setQ]           = useState('')
  const [fuente, setFuente] = useState<'todos'|Fuente>('todos')
  const [desde, setDesde]   = useState('')
  const [hasta, setHasta]   = useState('')
  const [results, setResults] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  const [buscado, setBuscado] = useState(false)
  const supabase = createClient()

  async function buscar() {
    setLoading(true); setBuscado(true)
    const all: Row[] = []

    // 1. Comprobantes de venta (facturas, NC, ND — no presupuestos/OS/adas/remitos)
    if (fuente === 'todos' || fuente === 'ventas') {
      const { data } = await supabase.from('comprobantes')
        .select('id,tipo,numero,nro_cbte_afip,fecha,cliente_nombre,aseguradora_nombre,total,categoria')
        .in('tipo', ['A','B','C'])
        .in('categoria', ['factura','nc','nd'])
        .gte('fecha', desde || '2000-01-01')
        .lte('fecha', hasta || '2099-12-31')
        .or(q ? `cliente_nombre.ilike.%${q}%,aseguradora_nombre.ilike.%${q}%,numero::text.ilike.%${q}%` : 'id.neq.00000000-0000-0000-0000-000000000000')
        .order('fecha', { ascending: false }).limit(100)
      for (const r of data??[]) {
        const nro = r.nro_cbte_afip || r.numero
        const tipoLabel = r.categoria === 'nc' ? 'NC' : r.categoria === 'nd' ? 'ND' : 'FC'
        all.push({
          _src: 'ventas', id: r.id,
          tipo: `${tipoLabel} ${r.tipo}`,
          numero: nro ? `0006-${String(nro).padStart(8,'0')}` : 'S/N',
          fecha: r.fecha,
          contraparte: r.cliente_nombre || r.aseguradora_nombre,
          total: r.total,
        })
      }
    }

    // 2. Comprobantes de compra
    if (fuente === 'todos' || fuente === 'compras') {
      const { data } = await supabase.from('comprobantes_compra')
        .select('id,tipo,letra,punto_venta,numero,nro_cbte_afip,fecha,proveedor_nombre,total,estado')
        .gte('fecha', desde || '2000-01-01')
        .lte('fecha', hasta || '2099-12-31')
        .or(q ? `proveedor_nombre.ilike.%${q}%,numero.ilike.%${q}%` : 'id.neq.00000000-0000-0000-0000-000000000000')
        .order('fecha', { ascending: false }).limit(100)
      for (const r of data??[]) {
        const tipoLabel = r.tipo === 'nc' ? 'NC' : r.tipo === 'nd' ? 'ND' : 'FC'
        all.push({
          _src: 'compras', id: r.id,
          tipo: `${tipoLabel} ${r.letra||''}`,
          numero: `${r.punto_venta||''}-${r.numero||'S/N'}`,
          fecha: r.fecha,
          contraparte: r.proveedor_nombre,
          total: r.total,
          estado: r.estado,
        })
      }
    }

    // 3. Órdenes de pago
    if (fuente === 'todos' || fuente === 'ops') {
      const { data } = await supabase.from('ordenes_pago')
        .select('id,numero,fecha,proveedor_nombre,total_pagado,anulada')
        .gte('fecha', desde || '2000-01-01')
        .lte('fecha', hasta || '2099-12-31')
        .or(q ? `proveedor_nombre.ilike.%${q}%,numero.ilike.%${q}%` : 'id.neq.00000000-0000-0000-0000-000000000000')
        .order('fecha', { ascending: false }).limit(100)
      for (const r of data??[]) {
        all.push({
          _src: 'ops', id: r.id,
          tipo: 'OP',
          numero: r.numero,
          fecha: r.fecha,
          contraparte: r.proveedor_nombre,
          total: r.total_pagado,
          estado: r.anulada ? 'anulada' : 'emitida',
        })
      }
    }

    // 4. Movimientos de stock
    if (fuente === 'todos' || fuente === 'stock') {
      const { data } = await supabase.from('stock_movimientos')
        .select('id,tipo,cantidad,fecha,descripcion,stock:stock_id(codigo,descripcion)')
        .gte('fecha', desde || '2000-01-01')
        .lte('fecha', hasta || '2099-12-31')
        .or(q ? `descripcion.ilike.%${q}%` : 'id.neq.00000000-0000-0000-0000-000000000000')
        .order('fecha', { ascending: false }).limit(100)
      for (const r of data??[]) {
        const st = (r as any).stock
        all.push({
          _src: 'stock', id: r.id,
          tipo: r.tipo === 'entrada' ? '📥 Entrada' : '📤 Salida',
          numero: st?.codigo || '—',
          fecha: r.fecha,
          contraparte: st?.descripcion || r.descripcion,
          total: r.cantidad,
          descripcion: r.descripcion,
        })
      }
    }

    // Ordenar por fecha desc
    all.sort((a,b) => b.fecha.localeCompare(a.fecha))
    setResults(all)
    setLoading(false)
  }

  const fmtFecha = (f:string) => f?.split('-').reverse().join('/')

  const srcLabel: Record<Fuente, string> = {
    ventas: '💰 Venta',
    compras: '🛒 Compra',
    ops: '💳 OP',
    stock: '📦 Stock',
  }
  const srcColor: Record<Fuente, string> = {
    ventas: 'bg-blue-100 text-blue-700',
    compras: 'bg-amber-100 text-amber-700',
    ops: 'bg-purple-100 text-purple-700',
    stock: 'bg-green-100 text-green-700',
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="bg-white border border-p-line rounded-2xl p-5 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
          <div className="md:col-span-2">
            <label className="block text-[11px] font-semibold text-p-ink2 uppercase tracking-wider mb-1">
              Cliente / Proveedor / N° / Descripción
            </label>
            <input value={q} onChange={e=>setQ(e.target.value)}
              onKeyDown={e=>e.key==='Enter'&&buscar()}
              placeholder="Buscar…"
              className="w-full border border-p-line rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-p-green bg-white"/>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-p-ink2 uppercase tracking-wider mb-1">Tipo</label>
            <select value={fuente} onChange={e=>setFuente(e.target.value as any)}
              className="w-full border border-p-line rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-p-green">
              <option value="todos">Todos</option>
              <option value="ventas">Comprobantes venta</option>
              <option value="compras">Comprobantes compra</option>
              <option value="ops">Órdenes de pago</option>
              <option value="stock">Movimientos stock</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
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
          <button onClick={buscar} disabled={loading} style={{...btn,opacity:loading?0.7:1}}>
            {loading?'Buscando…':'🔍 Buscar'}
          </button>
          <button onClick={()=>{setQ('');setFuente('todos');setDesde('');setHasta('');setResults([]);setBuscado(false)}}
            style={{...btnSm,background:'#6b7280'}}>
            Limpiar
          </button>
          {buscado && !loading && <span className="text-sm text-p-ink2 ml-2">{results.length} resultado(s)</span>}
        </div>
      </div>

      {buscado && !loading && results.length === 0 && <Empty msg="Sin resultados." />}

      {results.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-p-line shadow-sm bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-p-light">
                <th className="text-left px-4 py-3 text-xs font-semibold text-p-ink2 uppercase tracking-wider">Origen</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-p-ink2 uppercase tracking-wider">Tipo</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-p-ink2 uppercase tracking-wider">N° / Código</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-p-ink2 uppercase tracking-wider">Fecha</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-p-ink2 uppercase tracking-wider">Cliente / Proveedor / Descripción</th>
                <th className="text-right px-3 py-3 text-xs font-semibold text-p-ink2 uppercase tracking-wider">Total / Cant.</th>
                <th className="text-center px-3 py-3 text-xs font-semibold text-p-ink2 uppercase tracking-wider">Estado</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r,i)=>(
                <tr key={r.id+i} className={`border-t border-p-line2 ${i%2===0?'':'bg-p-light/30'} hover:bg-p-light/50`}>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${srcColor[r._src]}`}>
                      {srcLabel[r._src]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs font-semibold text-p-dark">{r.tipo}</td>
                  <td className="px-3 py-3 font-mono text-xs text-p-dark font-bold">{r.numero}</td>
                  <td className="px-3 py-3 text-xs text-p-ink2 font-mono">{fmtFecha(r.fecha)}</td>
                  <td className="px-3 py-3 text-xs text-p-ink max-w-[220px] truncate" title={r.contraparte||''}>
                    {r.contraparte||'—'}
                    {r._src==='stock' && r.descripcion && <p className="text-[10px] text-p-ink2 truncate">{r.descripcion}</p>}
                  </td>
                  <td className="px-3 py-3 text-right font-mono font-bold text-sm text-p-dark">
                    {r._src==='stock' ? `×${r.total}` : moneyARS(r.total||0)}
                  </td>
                  <td className="px-3 py-3 text-center">
                    {r.estado && (
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        r.estado==='procesado'||r.estado==='emitida'?'bg-green-100 text-green-700':
                        r.estado==='anulada'?'bg-gray-100 text-gray-500':'bg-amber-100 text-amber-700'
                      }`}>{r.estado}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-p-line bg-p-light">
                <td colSpan={5} className="px-4 py-3 font-bold text-sm text-p-dark">{results.length} resultado(s)</td>
                <td className="px-3 py-3 text-right font-mono font-bold text-p-dark">
                  {moneyARS(results.filter(r=>r._src!=='stock').reduce((a,r)=>a+(r.total||0),0))}
                </td>
                <td/>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
