'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Modal, Field, Input, Select, Empty } from '@/components/ui'
import { moneyARS } from '@/lib/utils/format'

const btn   = { background:'#00A550',color:'#fff',border:'none',borderRadius:10,padding:'10px 20px',fontWeight:700,fontSize:14,cursor:'pointer' } as const
const btnSm = { ...btn, padding:'6px 14px', fontSize:12 } as const
const btnGray = { ...btnSm, background:'#6b7280' } as const

interface StockItem {
  id:string; descripcion:string; codigo:string|null; cantidad:number
  precio_venta:number|null; costo:number|null; pos:string|null; activo:boolean
}
interface Movimiento {
  id:string; fecha:string; tipo:string; motivo:string|null; cantidad:number
  costo_unitario:number|null; stock_anterior:number|null; stock_posterior:number|null
  proveedor:string|null; nota:string|null; descripcion:string|null
  codigo:string|null; stock_actual:number; precio_venta:number|null; created_at:string
}

const TIPO_COLOR: Record<string,string> = {
  entrada:'#00A550', salida:'#ef4444', ajuste:'#d97706', devolucion:'#7c3aed', merma:'#6b7280'
}
const MOTIVOS = ['compra','venta','ajuste_manual','devolucion','merma','inventario']

export default function StockAvanzadoClient({ rol }: { rol: string }) {
  const [items, setItems]         = useState<StockItem[]>([])
  const [movimientos, setMovimientos] = useState<Movimiento[]>([])
  const [sel, setSel]             = useState<StockItem|null>(null)
  const [q, setQ]                 = useState('')
  const [filtroTipo, setFiltroTipo] = useState('')
  const [open, setOpen]           = useState(false)
  const [loading, setLoading]     = useState(true)
  const [loadingMov, setLoadingMov] = useState(false)
  const [verComp, setVerComp] = useState<any|null>(null)
  const [tab, setTab]             = useState<'inventario'|'movimientos'>('inventario')
  const [form, setForm]           = useState({ stock_id:'', tipo:'entrada', motivo:'ajuste_manual', cantidad:'', costo_unitario:'', proveedor:'', nota:'' })

  const supabase = createClient()

  const isAdmin = rol === 'gerencial' || rol === 'admin'

  async function abrirComprobante(compId: string) {
    const { data } = await supabase.from('comprobantes_compra')
      .select('*').eq('id', compId).single()
    if (data) setVerComp(data)
  }

  async function loadItems() {
    setLoading(true)
    const { data } = await supabase.from('stock').select('*').eq('activo',true).order('descripcion')
    setItems(data ?? [])
    setLoading(false)
  }

  async function loadMovimientos(stockId?: string) {
    setLoadingMov(true)
    let q2 = supabase.from('vista_movimientos_stock').select('*').limit(200)
    if (stockId) q2 = q2.eq('stock_id', stockId)
    const { data } = await q2
    setMovimientos(data ?? [])
    setLoadingMov(false)
  }

  useEffect(() => { loadItems() }, [supabase])

  useEffect(() => {
    if (tab === 'movimientos') loadMovimientos(sel?.id)
  }, [tab, sel])

  async function registrarAjuste() {
    if (!form.stock_id || !form.cantidad) return
    const item = items.find(i=>i.id===form.stock_id)
    if (!item) return
    const cant = parseInt(form.cantidad)
    const esEntrada = form.tipo === 'entrada' || form.tipo === 'devolucion'
    const delta = esEntrada ? cant : -cant
    const nuevo = (item.cantidad || 0) + delta

    await supabase.from('ajustes_stock').insert({
      fecha: new Date().toISOString().slice(0,10),
      tipo: form.tipo,
      motivo: form.motivo || null,
      stock_id: form.stock_id,
      descripcion: item.descripcion,
      cantidad: cant,
      costo_unitario: form.costo_unitario ? +form.costo_unitario : null,
      proveedor: form.proveedor || null,
      nota: form.nota || null,
      stock_anterior: item.cantidad,
      stock_posterior: nuevo,
    })
    await supabase.from('stock').update({ cantidad: nuevo }).eq('id', form.stock_id)

    setOpen(false)
    setForm({ stock_id:'', tipo:'entrada', motivo:'ajuste_manual', cantidad:'', costo_unitario:'', proveedor:'', nota:'' })
    loadItems()
    if (tab === 'movimientos') loadMovimientos(sel?.id)
  }

  // Valorización del inventario
  const valorTotal = items.reduce((a,i)=>{
    const costo = i.costo ?? 0
    return a + (i.cantidad * costo)
  }, 0)
  const valorVenta = items.reduce((a,i)=>{
    const pv = i.precio_venta ?? 0
    return a + (i.cantidad * pv)
  }, 0)
  const itemsBajoMinimo = items.filter(i=>i.cantidad<=0).length
  const itemsStockBajo = items.filter(i=>i.cantidad>0&&i.cantidad<=2).length

  const filtrados = items.filter(i =>
    !q || i.descripcion.toLowerCase().includes(q.toLowerCase()) ||
    (i.codigo||'').toLowerCase().includes(q.toLowerCase())
  )

  // Al buscar por código exacto → ir directo a movimientos
  function handleSearch(val: string) {
    setQ(val)
    const exacto = items.find(i =>
      i.codigo?.toLowerCase() === val.toLowerCase().trim()
    )
    if (exacto) { setSel(exacto); setTab('movimientos') }
  }

  const movFiltrados = movimientos.filter(m=>!filtroTipo||m.tipo===filtroTipo)

  const tabStyle = (t:string) => ({
    padding:'8px 20px', fontWeight:700, fontSize:13, cursor:'pointer', border:'none',
    borderBottom: tab===t ? '3px solid #00A550' : '3px solid transparent',
    background:'none', color: tab===t ? '#00A550' : '#6b7280'
  })

  return (
    <div>
      {/* KPIs */}
      {isAdmin && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          <div className="bg-white border border-p-line rounded-xl p-4 shadow-sm">
            <p className="text-[11px] font-semibold text-p-ink2 uppercase tracking-wider">Valor inventario (costo)</p>
            <p className="font-saira font-bold text-xl text-p-ink mt-1">{moneyARS(valorTotal)}</p>
          </div>
          <div className="bg-white border border-p-line rounded-xl p-4 shadow-sm">
            <p className="text-[11px] font-semibold text-p-ink2 uppercase tracking-wider">Valor a precio venta</p>
            <p className="font-saira font-bold text-xl text-p-green mt-1">{moneyARS(valorVenta)}</p>
          </div>
          <div className="bg-white border border-p-line rounded-xl p-4 shadow-sm">
            <p className="text-[11px] font-semibold text-p-ink2 uppercase tracking-wider">Sin stock</p>
            <p className="font-saira font-bold text-xl text-red-500 mt-1">{itemsBajoMinimo}</p>
          </div>
          <div className="bg-white border border-p-line rounded-xl p-4 shadow-sm">
            <p className="text-[11px] font-semibold text-p-ink2 uppercase tracking-wider">Stock bajo (≤2)</p>
            <p className="font-saira font-bold text-xl text-amber-500 mt-1">{itemsStockBajo}</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-p-line mb-4">
        <button style={tabStyle('inventario')} onClick={()=>setTab('inventario')}>📦 Inventario</button>
        <button style={tabStyle('movimientos')} onClick={()=>setTab('movimientos')}>
          📊 Movimientos {sel?`— ${sel.descripcion.slice(0,20)}…`:''}
        </button>
      </div>

      {/* Tab Inventario */}
      {tab === 'inventario' && (
        <>
          <div className="flex gap-3 mb-4 flex-wrap">
            <input value={q} onChange={e=>handleSearch(e.target.value)}
              placeholder="Descripción o código de barras… (código exacto → ver movimientos)"
              className="flex-1 min-w-[180px] border border-p-line rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-p-green bg-white shadow-sm"/>
            {isAdmin && <button onClick={()=>setOpen(true)} style={btn}>+ Registrar movimiento</button>}
          </div>

          {loading ? <p className="text-sm text-p-gray text-center py-10">Cargando…</p> : (
            <div className="overflow-x-auto rounded-xl border border-p-line shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-p-dark text-white">
                    <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wider">Artículo</th>
                    <th className="text-center px-3 py-3 font-semibold text-xs uppercase tracking-wider">Código</th>
                    <th className="text-center px-3 py-3 font-semibold text-xs uppercase tracking-wider">Stock</th>
                    {isAdmin && <th className="text-right px-3 py-3 font-semibold text-xs uppercase tracking-wider">Costo unit.</th>}
                    {isAdmin && <th className="text-right px-3 py-3 font-semibold text-xs uppercase tracking-wider">Valor total</th>}
                    <th className="text-right px-3 py-3 font-semibold text-xs uppercase tracking-wider">P. Venta</th>
                    <th className="text-center px-3 py-3 text-xs uppercase tracking-wider">Historial</th>
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map((i,idx)=>(
                    <tr key={i.id} className={`border-t border-p-line2 ${idx%2===0?'bg-white':'bg-p-light/40'} ${i.cantidad<=0?'bg-red-50':i.cantidad<=2?'bg-amber-50':''}`}>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-p-ink">{i.descripcion}</p>
                        {i.pos && <p className="text-[10px] text-p-ink2">{i.pos}</p>}
                      </td>
                      <td className="px-3 py-3 text-center">
                        {i.codigo ? <span className="font-mono text-xs bg-p-light px-2 py-0.5 rounded text-p-dark">{i.codigo}</span> : <span className="text-p-ink2">—</span>}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className={`font-black text-base ${i.cantidad<=0?'text-red-500':i.cantidad<=2?'text-amber-500':'text-p-dark'}`}>
                          {i.cantidad}
                        </span>
                      </td>
                      {isAdmin && <td className="px-3 py-3 text-right text-p-ink2 font-mono text-xs">{i.costo?moneyARS(i.costo):'—'}</td>}
                      {isAdmin && <td className="px-3 py-3 text-right font-mono font-bold text-xs">{i.costo?moneyARS(i.cantidad*(i.costo||0)):'—'}</td>}
                      <td className="px-3 py-3 text-right font-mono text-xs">{i.precio_venta?moneyARS(i.precio_venta):'—'}</td>
                      <td className="px-3 py-3 text-center">
                        <button onClick={()=>{ setSel(i); setTab('movimientos') }}
                          style={{...btnSm,padding:'4px 10px',fontSize:11,background:'#1d4ed8'}}>
                          📊 Ver
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                {isAdmin && (
                  <tfoot>
                    <tr className="bg-p-dark text-white border-t-2 border-p-green">
                      <td className="px-4 py-3 font-bold text-sm" colSpan={4}>TOTAL INVENTARIO</td>
                      <td className="px-3 py-3 text-right font-bold font-mono">{moneyARS(valorTotal)}</td>
                      <td className="px-3 py-3 text-right font-bold font-mono text-p-green">{moneyARS(valorVenta)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </>
      )}

      {/* Tab Movimientos */}
      {tab === 'movimientos' && (
        <>
          <div className="flex gap-3 mb-4 flex-wrap items-center">
            {sel && (
              <div className="bg-white border border-p-line rounded-xl px-4 py-2 flex items-center gap-2">
                <span className="text-sm font-bold text-p-ink">{sel.descripcion}</span>
                <button onClick={()=>setSel(null)} className="text-p-gray text-xs hover:text-red-500">✕ Todos</button>
              </div>
            )}
            <select value={filtroTipo} onChange={e=>setFiltroTipo(e.target.value)}
              className="border border-p-line rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none shadow-sm">
              <option value="">Todos los tipos</option>
              {['entrada','salida','ajuste','devolucion','merma'].map(t=><option key={t} value={t}>{t}</option>)}
            </select>
            <button onClick={()=>loadMovimientos(sel?.id)} style={{...btnGray,padding:'8px 14px'}}>🔄 Actualizar</button>
          </div>

          {loadingMov ? <p className="text-sm text-p-gray text-center py-10">Cargando…</p> :
           movFiltrados.length===0 ? <Empty msg="Sin movimientos registrados." /> : (
            <div className="overflow-x-auto rounded-xl border border-p-line shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-p-dark text-white">
                    <th className="text-left px-4 py-3 text-xs uppercase tracking-wider">Fecha</th>
                    <th className="text-left px-4 py-3 text-xs uppercase tracking-wider">Artículo</th>
                    <th className="text-center px-3 py-3 text-xs uppercase tracking-wider">Tipo</th>
                    <th className="text-center px-3 py-3 text-xs uppercase tracking-wider">Cant.</th>
                    <th className="text-center px-3 py-3 text-xs uppercase tracking-wider">Stock ant.</th>
                    <th className="text-center px-3 py-3 text-xs uppercase tracking-wider">Stock post.</th>
                    {isAdmin && <th className="text-right px-3 py-3 text-xs uppercase tracking-wider">Costo</th>}
                    <th className="text-left px-4 py-3 text-xs uppercase tracking-wider">Nota</th>
                  </tr>
                </thead>
                <tbody>
                  {movFiltrados.map((m,idx)=>(
                    <tr key={m.id} 
                    className={`border-t border-p-line2 ${idx%2===0?'bg-white':'bg-p-light/40'} ${(m as any).comprobante_compra_id?'cursor-pointer hover:bg-blue-50/30':''}`}
                    onDoubleClick={()=>{ if((m as any).comprobante_compra_id) abrirComprobante((m as any).comprobante_compra_id) }}
                    title={(m as any).comprobante_compra_id?'Doble click para ver la factura':''}>
                      <td className="px-4 py-3 text-p-ink2 text-xs font-mono">{m.fecha}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-p-ink text-xs">{m.descripcion}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {m.codigo&&<span className="font-mono text-[10px] bg-p-light text-p-ink2 px-1.5 py-0.5 rounded">{m.codigo}</span>}
                          {m.proveedor&&<span className="text-[10px] text-p-ink2">{m.proveedor}</span>}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white"
                          style={{background:TIPO_COLOR[m.tipo]||'#6b7280'}}>
                          {m.tipo}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center font-black text-p-dark">
                        {['entrada','devolucion'].includes(m.tipo)?'+':'-'}{m.cantidad}
                      </td>
                      <td className="px-3 py-3 text-center text-p-ink2 text-xs">{m.stock_anterior??'—'}</td>
                      <td className="px-3 py-3 text-center font-bold text-p-dark text-xs">{m.stock_posterior??'—'}</td>
                      {isAdmin && <td className="px-3 py-3 text-right text-xs font-mono">{m.costo_unitario?moneyARS(m.costo_unitario):'—'}</td>}
                      <td className="px-4 py-3 text-xs max-w-[180px] truncate" title={m.nota||m.motivo||''}>
                        {(m as any).comprobante_compra_id
                          ? <span className="text-blue-600 font-semibold">🧾 {m.nota||'—'}</span>
                          : <span className="text-p-ink2">{m.nota||m.motivo||'—'}</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Modal ajuste manual */}
      <Modal open={open} onClose={()=>setOpen(false)} title="Registrar movimiento de stock">
        <div className="flex flex-col gap-3">
          {/* Tipo */}
          <div className="flex gap-2 flex-wrap">
            {['entrada','salida','ajuste','devolucion','merma'].map(t=>(
              <button key={t} onClick={()=>setForm(p=>({...p,tipo:t}))}
                style={{background:form.tipo===t?TIPO_COLOR[t]||'#6b7280':'#fff',color:form.tipo===t?'#fff':'#4A6655',border:`1.5px solid ${form.tipo===t?TIPO_COLOR[t]||'#6b7280':'#C2DDD0'}`,borderRadius:8,padding:'6px 14px',fontWeight:700,fontSize:12,cursor:'pointer'}}>
                {t}
              </button>
            ))}
          </div>
          <Field label="Artículo *">
            <Select value={form.stock_id} onChange={e=>setForm(p=>({...p,stock_id:e.target.value}))}>
              <option value="">Seleccionar…</option>
              {items.map(i=><option key={i.id} value={i.id}>{i.descripcion} (stock: {i.cantidad})</option>)}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Cantidad *">
              <Input type="number" value={form.cantidad} onChange={e=>setForm(p=>({...p,cantidad:e.target.value}))} placeholder="1"/>
            </Field>
            <Field label="Motivo">
              <Select value={form.motivo} onChange={e=>setForm(p=>({...p,motivo:e.target.value}))}>
                {MOTIVOS.map(m=><option key={m} value={m}>{m}</option>)}
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Costo unitario">
              <Input value={form.costo_unitario} onChange={e=>setForm(p=>({...p,costo_unitario:e.target.value}))} placeholder="0"/>
            </Field>
            <Field label="Proveedor">
              <Input value={form.proveedor} onChange={e=>setForm(p=>({...p,proveedor:e.target.value}))} placeholder="GAMMA…"/>
            </Field>
          </div>
          <Field label="Nota">
            <Input value={form.nota} onChange={e=>setForm(p=>({...p,nota:e.target.value}))} placeholder="Observación del movimiento…"/>
          </Field>
          {form.stock_id && form.cantidad && (
            <div className="bg-p-light rounded-lg p-3 text-sm">
              <p className="text-p-ink2">Stock actual: <strong>{items.find(i=>i.id===form.stock_id)?.cantidad ?? 0}</strong></p>
              <p className="text-p-ink2">Stock resultante: <strong className="text-p-green">
                {['entrada','devolucion'].includes(form.tipo)
                  ? (items.find(i=>i.id===form.stock_id)?.cantidad??0)+(+form.cantidad||0)
                  : (items.find(i=>i.id===form.stock_id)?.cantidad??0)-(+form.cantidad||0)
                }
              </strong></p>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={()=>setOpen(false)} style={btnGray}>Cancelar</button>
            <button onClick={registrarAjuste} disabled={!form.stock_id||!form.cantidad}
              style={{...btn,opacity:!form.stock_id||!form.cantidad?.5:1}}>
              ✓ Registrar
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal detalle comprobante de compra */}
      {verComp && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={e=>{if(e.target===e.currentTarget)setVerComp(null)}}>
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col">
          <div className="flex items-center justify-between p-4 border-b border-p-line">
            <div>
              <p className="font-saira font-bold text-p-ink">Factura {verComp.numero}</p>
              <p className="text-xs text-p-ink2">{verComp.proveedor_nombre} · {verComp.fecha?.split('-').reverse().join('/')}</p>
            </div>
            <button onClick={()=>setVerComp(null)} className="text-p-gray hover:text-p-ink text-2xl leading-none">✕</button>
          </div>
          <div className="overflow-y-auto flex-1 p-4 flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              {(verComp.items||[]).map((it:any,i:number)=>(
                <div key={i} className="flex items-center justify-between text-sm border-b border-p-line2 py-1.5 gap-2">
                  <div className="flex-1 min-w-0">
                    {it.codigo && <span className="text-[10px] font-mono bg-p-light text-p-ink2 px-1.5 py-0.5 rounded mr-1.5">{it.codigo}</span>}
                    <span className="text-p-ink">{it.d}</span>
                  </div>
                  <span className="text-p-ink2 shrink-0 text-xs">x{it.c}</span>
                  <span className="font-mono text-xs shrink-0">${Math.round(it.p*it.c).toLocaleString('es-AR')}</span>
                </div>
              ))}
            </div>
            <div className="bg-p-light rounded-xl p-3 text-sm flex flex-col gap-1">
              <div className="flex justify-between"><span className="text-p-ink2">Neto</span><span className="font-mono">${Math.round(verComp.neto||0).toLocaleString('es-AR')}</span></div>
              <div className="flex justify-between"><span className="text-p-ink2">IVA</span><span className="font-mono">${Math.round(verComp.iva||0).toLocaleString('es-AR')}</span></div>
              <div className="flex justify-between font-bold border-t border-p-line pt-1 mt-1 font-saira text-base">
                <span>TOTAL</span><span>${Math.round(verComp.total||0).toLocaleString('es-AR')}</span>
              </div>
            </div>
            {verComp.cae && <p className="text-xs text-green-700 bg-green-50 rounded-lg px-3 py-2">✓ CAE {verComp.cae}</p>}
          </div>
        </div>
      )}
    </div>
  )
}
