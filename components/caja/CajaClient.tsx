'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Venta, StockItem } from '@/lib/types/database'
import { Btn, Modal, Field, Input, Select, KpiCard, Empty, AlarmBar } from '@/components/ui'
import { moneyARS, todayStr } from '@/lib/utils/format'

const PAGOS = ['Efectivo', 'Transferencia', 'Tarjeta', 'Cuenta corriente']

export default function CajaClient({ userId, perfil }: { userId: string; perfil: { rol: string } }) {
  const [fecha, setFecha] = useState(todayStr())
  const [ventas, setVentas] = useState<Venta[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [stockItems, setStockItems] = useState<StockItem[]>([])
  const [stockQ, setStockQ] = useState('')
  const [stockSug, setStockSug] = useState<StockItem[]>([])
  const [editCosto, setEditCosto] = useState<Record<string, string>>({})
  const [editId, setEditId]     = useState<string|null>(null)
  const [editForm, setEditForm] = useState({ codigo:'', descripcion:'', costo:'', precio:'', cliente:'', pago:'', comprobante:'' })
  const [editStockQ, setEditStockQ]   = useState('')
  const [editStockSug, setEditStockSug] = useState<StockItem[]>([])
  const supabase = createClient()
  const [blueRate, setBlueRate] = useState<number|null>(null)
  const isAdmin = perfil.rol === 'admin' || perfil.rol === 'gerencial'

  const [form, setForm] = useState({
    descripcion: '', costo: '', precio: '', cliente: '', comprobante: '',
    pago: 'Efectivo', origen: 'compra' as 'stock' | 'compra',
    stock_id: null as string | null,
    tipo_id: '', tipo_nombre: ''
  })
  const [tipos, setTipos] = useState<{id:string;nombre:string}[]>([])
  const [tab, setTab] = useState<'ventas'|'gastos'>('ventas')
  const [gastos, setGastos] = useState<any[]>([])
  const [gastoOpen, setGastoOpen] = useState(false)
  const [gastoForm, setGastoForm] = useState({ categoria:'', descripcion:'', monto:'', forma_pago:'Efectivo', comprobante:'' })

const CATEGORIAS_GASTO = ['Sueldos','Alquiler','Servicios','Insumos','Publicidad','Impuestos','Mantenimiento','Otros']

  const loadVentas = useCallback(async () => {
    setLoading(true)
    const [ventasRes, gastosRes] = await Promise.all([
      supabase.from('ventas').select('*').eq('fecha', fecha).order('created_at', { ascending: false }),
      supabase.from('gastos').select('*').eq('fecha', fecha).order('created_at', { ascending: false }),
    ])
    setVentas(ventasRes.data ?? [])
    setGastos(gastosRes.data ?? [])
    setLoading(false)
  }, [fecha, supabase])

  useEffect(() => { loadVentas() }, [loadVentas])

  useEffect(() => {
    supabase.from('cotizaciones').select('blue').order('fecha',{ascending:false}).limit(1).maybeSingle()
      .then(({data})=>setBlueRate(data?.blue??null))
    supabase.from('tipos_cliente').select('id,nombre').order('nombre').then(({data})=>setTipos(data??[]))
  }, [supabase])

  useEffect(() => {
    supabase.from("stock").select("id,descripcion,codigo,marca,pos,precio_venta,costo,cantidad").gt("cantidad",0).then(({ data }) => setStockItems((data as unknown as StockItem[]) ?? []))
  }, [supabase])

  // Sugerir stock en modal edición
  useEffect(() => {
    if (editStockQ.length < 2) { setEditStockSug([]); return }
    const q = editStockQ.toUpperCase()
    setEditStockSug(stockItems.filter(s => (s.descripcion + ' ' + (s.marca??'') + ' ' + (s.codigo??'')).toUpperCase().includes(q)).slice(0, 6))
  }, [editStockQ, stockItems])

  function pickEditStock(s: StockItem) {
    setEditForm(p => ({
      ...p,
      codigo: s.codigo ?? '',
      descripcion: s.descripcion,
      costo: s.costo ? String(Math.round(s.costo)) : p.costo,
      precio: s.precio_venta ? String(Math.round(s.precio_venta)) : p.precio,
    }))
    setEditStockQ(''); setEditStockSug([])
  }

  // Sugerir stock
  useEffect(() => {
    if (stockQ.length < 2) { setStockSug([]); return }
    const q = stockQ.toUpperCase()
    setStockSug(stockItems.filter(s => (s.descripcion + ' ' + s.marca + ' ' + (s.codigo ?? '')).toUpperCase().includes(q)).slice(0, 8))
  }, [stockQ, stockItems])

  function pickStock(s: StockItem) {
    setForm(p => ({
      ...p, descripcion: (s.codigo ? `[${s.codigo}] ` : '') + s.descripcion, costo: s.costo ? String(Math.round(s.costo)) : '',
      precio: s.precio_venta ? String(Math.round(s.precio_venta)) : '', origen: 'stock', stock_id: s.id
    }))
    setStockQ(''); setStockSug([])
  }

  const toUsd = (n: number) => blueRate ? ' · USD ' + Math.round(n/blueRate).toLocaleString('es-AR') : ''

  // Rentabilidad real (sin IVA, con flete 1.5%)
  function calcRentabilidad(precio: number, costo: number | null) {
    if (!costo) return null
    const precioNeto = precio / 1.21
    const costoNeto  = costo / 1.21 / 1.015
    const ganancia   = precioNeto - costoNeto
    const margen     = Math.round((ganancia / precioNeto) * 100)
    return { precioNeto: Math.round(precioNeto), costoNeto: Math.round(costoNeto), ganancia: Math.round(ganancia), margen }
  }

  const gan = () => {
    const c = +form.costo.replace(/[^0-9.]/g, ''), p = +form.precio.replace(/[^0-9.]/g, '')
    return c && p ? p - c : null
  }

  async function save() {
    if (!form.descripcion || !form.precio) { alert('Cargá descripción y precio.'); return }
    const c = +form.costo.replace(/[^0-9.]/g, '') || null
    const p = +form.precio.replace(/[^0-9.]/g, '')
    await supabase.from('ventas').insert({
      fecha, descripcion: form.descripcion, costo: c, precio: p,
      cliente: form.cliente || null, comprobante: form.comprobante || null,
      pago: form.pago, origen: form.origen, pendiente: !c,
      stock_id: form.stock_id, user_id: userId,
      tipo_cliente_id: form.tipo_id||null,
      tipo_cliente_nombre: form.tipo_nombre||null
    })
    // Descontar stock
    if (form.origen === 'stock' && form.stock_id) {
      const s = stockItems.find(x => x.id === form.stock_id)
      if (s && s.cantidad > 0) {
        await supabase.from('stock').update({ cantidad: s.cantidad - 1, updated_at: new Date().toISOString() }).eq('id', s.id)
        setStockItems(prev => prev.map(x => x.id === form.stock_id ? { ...x, cantidad: x.cantidad - 1 } : x))
      }
    }
    setOpen(false)
    setForm({ descripcion: '', costo: '', precio: '', cliente: '', comprobante: '', pago: 'Efectivo', origen: 'compra', stock_id: null, tipo_id: '', tipo_nombre: '' })
    loadVentas()
  }

  async function delVenta(v: Venta) {
    if (!confirm('¿Borrar venta?')) return
    if (v.origen === 'stock' && v.stock_id) {
      const s = stockItems.find(x => x.id === v.stock_id)
      if (s) await supabase.from('stock').update({ cantidad: s.cantidad + 1, updated_at: new Date().toISOString() }).eq('id', s.id)
    }
    await supabase.from('ventas').delete().eq('id', v.id)
    loadVentas()
  }

  async function updateCosto(v: Venta, costo: string) {
    const c = +costo.replace(/[^0-9.]/g, '')
    if (!c) return
    await supabase.from('ventas').update({ costo: c, pendiente: false }).eq('id', v.id)
    setVentas(prev => prev.map(x => x.id === v.id ? { ...x, costo: c, pendiente: false } : x))
    setEditCosto(p => { const n = { ...p }; delete n[v.id]; return n })
  }

  async function registrarAuditoria(ventaId: string, accion: string, campo: string, anterior: string, nuevo: string) {
    await supabase.from('auditoria_ventas').insert({
      venta_id: ventaId, accion, campo,
      valor_anterior: String(anterior),
      valor_nuevo: String(nuevo),
      user_id: userId,
    })
  }

  function abrirEditar(v: Venta) {
    setEditId(v.id)
    const m = v.descripcion?.match(/^\[([^\]]+)\]\s*(.+)$/)
    setEditForm({
      codigo: m ? m[1] : '',
      descripcion: m ? m[2] : (v.descripcion ?? ''),
      costo: v.costo ? String(Math.round(v.costo)) : '',
      precio: String(Math.round(v.precio)),
      cliente: v.cliente ?? '',
      pago: v.pago ?? 'Efectivo',
      comprobante: v.comprobante ?? '',
    })
  }

  async function guardarEdicion(v: Venta) {
    const campos: Array<[string, string, string]> = []
    const upd: Record<string, any> = {}
    const descConCodigo = editForm.codigo ? `[${editForm.codigo}] ${editForm.descripcion}` : editForm.descripcion
    if (descConCodigo !== v.descripcion) { campos.push(['descripcion', v.descripcion ?? '', descConCodigo]); upd.descripcion = descConCodigo }
    const newCosto = +editForm.costo.replace(/[^0-9.]/g, '') || null
    if (newCosto !== v.costo) { campos.push(['costo', String(v.costo ?? ''), String(newCosto ?? '')]); upd.costo = newCosto; upd.pendiente = !newCosto }
    const newPrecio = +editForm.precio.replace(/[^0-9.]/g, '')
    if (newPrecio !== v.precio) { campos.push(['precio', String(v.precio), String(newPrecio)]); upd.precio = newPrecio }
    if (editForm.cliente !== (v.cliente ?? '')) { campos.push(['cliente', v.cliente ?? '', editForm.cliente]); upd.cliente = editForm.cliente || null }
    if (editForm.pago !== v.pago) { campos.push(['pago', v.pago ?? '', editForm.pago]); upd.pago = editForm.pago }
    if (editForm.comprobante !== (v.comprobante ?? '')) { campos.push(['comprobante', v.comprobante ?? '', editForm.comprobante]); upd.comprobante = editForm.comprobante || null }
    if (Object.keys(upd).length === 0) { setEditId(null); return }
    await supabase.from('ventas').update(upd).eq('id', v.id)
    for (const [campo, ant, nvo] of campos) await registrarAuditoria(v.id, 'editar', campo, ant, nvo)
    setEditId(null)
    loadVentas()
  }

  async function delVentaAudit(v: Venta) {
    if (!confirm('¿Borrar venta?')) return
    await registrarAuditoria(v.id, 'eliminar', 'venta', JSON.stringify({ descripcion: v.descripcion, precio: v.precio, cliente: v.cliente }), '')
    if (v.origen === 'stock' && v.stock_id) {
      const s = stockItems.find(x => x.id === v.stock_id)
      if (s) await supabase.from('stock').update({ cantidad: s.cantidad + 1, updated_at: new Date().toISOString() }).eq('id', s.id)
    }
    await supabase.from('ventas').delete().eq('id', v.id)
    loadVentas()
  }

  async function guardarGasto() {
    if (!gastoForm.categoria || !gastoForm.descripcion || !gastoForm.monto) return
    await supabase.from('gastos').insert({
      fecha,
      categoria: gastoForm.categoria,
      descripcion: gastoForm.descripcion,
      monto: +gastoForm.monto.replace(/[^0-9.]/g, ''),
      forma_pago: gastoForm.forma_pago,
      comprobante: gastoForm.comprobante || null,
      user_id: userId,
    })
    setGastoOpen(false)
    setGastoForm({ categoria:'', descripcion:'', monto:'', forma_pago:'Efectivo', comprobante:'' })
    loadVentas()
  }

  async function delGasto(id: string) {
    if (!confirm('¿Borrar gasto?')) return
    await supabase.from('gastos').delete().eq('id', id)
    loadVentas()
  }

  function changeDay(d: number) {
    const dt = new Date(fecha + 'T12:00:00'); dt.setDate(dt.getDate() + d)
    setFecha(dt.toISOString().slice(0, 10))
  }

  // KPIs
  const fact = ventas.reduce((a, v) => a + v.precio, 0)
  const costo = ventas.filter(v => !v.pendiente).reduce((a, v) => a + (v.costo ?? 0), 0)
  const gan2 = fact - costo
  const pend = ventas.filter(v => v.pendiente).length

  return (
    <div>
      {/* Fecha */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <button onClick={() => changeDay(-1)} className="p-1.5 rounded-lg border border-p-line hover:bg-p-light">←</button>
          <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
            className="border border-p-line rounded-lg px-3 py-1.5 text-sm font-mono" />
          <button onClick={() => changeDay(1)} className="p-1.5 rounded-lg border border-p-line hover:bg-p-light">→</button>
          <button onClick={() => setFecha(todayStr())} className="text-xs text-p-ink2 hover:text-p-ink underline">Hoy</button>
        </div>
        <button onClick={() => setOpen(true)} style={{ background:"#00A550", color:"#fff", border:"none", borderRadius:10, padding:"10px 20px", fontWeight:700, fontSize:14, cursor:"pointer" }}>+ Registrar venta</button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <KpiCard label="Facturado" value={moneyARS(fact)} sub={blueRate ? 'USD ' + Math.round(fact/blueRate).toLocaleString('es-AR') : undefined} />
        {isAdmin && <KpiCard label="Costo de lo vendido" value={moneyARS(costo)} sub={blueRate ? 'USD ' + Math.round(costo/blueRate).toLocaleString('es-AR') : undefined} />}
        {isAdmin && <KpiCard label={`Ganancia${pend ? ' (parcial)' : ''}`} value={moneyARS(gan2)} accent sub={blueRate ? 'USD ' + Math.round(gan2/blueRate).toLocaleString('es-AR') : undefined} />}
        <KpiCard label="Operaciones" value={`${ventas.length}`} sub={pend ? `${pend} s/costo` : undefined} />
        {isAdmin && <KpiCard label="Gastos del día" value={moneyARS(gastos.reduce((a,g)=>a+g.monto,0))} />}
      </div>

      {pend > 0 && <AlarmBar count={pend} label="venta(s) sin costo — ganancia incompleta" />}

      {/* Tabs ventas / gastos */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
        <div style={{display:'flex',gap:8}}>
          <button onClick={()=>setTab('ventas')}
            style={{background:tab==='ventas'?'#00A550':'#e5e7eb',color:tab==='ventas'?'#fff':'#374151',border:'none',borderRadius:8,padding:'6px 16px',fontWeight:700,fontSize:13,cursor:'pointer'}}>
            💰 Ventas ({ventas.length})
          </button>
          <button onClick={()=>setTab('gastos')}
            style={{background:tab==='gastos'?'#ef4444':'#e5e7eb',color:tab==='gastos'?'#fff':'#374151',border:'none',borderRadius:8,padding:'6px 16px',fontWeight:700,fontSize:13,cursor:'pointer'}}>
            💸 Gastos ({gastos.length})
          </button>
        </div>
        {tab==='gastos' && (
          <button onClick={()=>setGastoOpen(true)}
            style={{background:'#ef4444',color:'#fff',border:'none',borderRadius:8,padding:'7px 16px',fontWeight:700,fontSize:13,cursor:'pointer'}}>
            + Registrar gasto
          </button>
        )}
      </div>

      {/* Lista */}
      <div className="tsec font-saira font-bold text-sm text-p-ink uppercase tracking-wider mb-3">
        Ventas del día <span className="font-mono text-xs bg-p-light text-p-dark px-2 py-0.5 rounded-full ml-2">{ventas.length}</span>
      </div>

      {tab === 'gastos' ? (
        loading ? <p className="text-sm text-p-gray py-8 text-center">Cargando…</p> :
        gastos.length === 0 ? <Empty msg="Sin gastos en este día." /> : (
          <div className="flex flex-col gap-3">
            {gastos.map(g => (
              <div key={g.id} className="bg-white border border-p-line rounded-xl p-4 shadow-sm flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span style={{background:'#fee2e2',color:'#dc2626',borderRadius:6,padding:'2px 8px',fontSize:11,fontWeight:700}}>{g.categoria}</span>
                    <p className="font-saira font-bold text-p-ink">{g.descripcion}</p>
                  </div>
                  <p className="text-xs text-p-ink2 mt-0.5">
                    {[g.forma_pago, g.comprobante ? 'Comp. '+g.comprobante : null].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-mono font-bold text-red-500">- {moneyARS(g.monto)}</p>
                </div>
                <button onClick={()=>delGasto(g.id)} className="text-red-400 hover:text-red-600 text-sm">✕</button>
              </div>
            ))}
          </div>
        )
      ) : (
      <>{loading ? <p className="text-sm text-p-gray py-8 text-center">Cargando…</p> :
        ventas.length === 0 ? <Empty msg="Sin ventas en este día. Registrá una con + Registrar venta." /> :
          <div className="flex flex-col gap-3">
            {ventas.map(v => (
              <div key={v.id} className={`bg-white border rounded-xl p-4 shadow-sm flex items-center gap-3 flex-wrap ${v.pendiente ? 'border-l-4 border-l-amber-400 border-p-line' : 'border-p-line'}`}>
                <div className="flex-1 min-w-0">
                  {(() => {
                const m = v.descripcion?.match(/^\[([^\]]+)\]\s*(.+)$/)
                return m
                  ? <p className="font-saira font-bold text-p-ink"><span className="font-mono text-xs text-p-ink2 mr-2 bg-p-light px-1.5 py-0.5 rounded">{m[1]}</span>{m[2]}</p>
                  : <p className="font-saira font-bold text-p-ink">{v.descripcion}</p>
              })()}
                  <p className="text-xs text-p-ink2 mt-0.5">
                    {[v.comprobante ? 'Comp. ' + v.comprobante : null, v.cliente, v.pago, v.origen === 'stock' ? 'de stock' : 'comprada'].filter(Boolean).join(' · ')}
                  </p>
                </div>
                {/* Costo editable (solo admin) */}
                {isAdmin && v.pendiente && (
                  <div className="flex items-center gap-1">
                    <input placeholder="costo" value={editCosto[v.id] ?? ''}
                      onChange={e => setEditCosto(p => ({ ...p, [v.id]: e.target.value }))}
                      className="w-24 border border-amber-300 rounded px-2 py-1 text-xs font-mono" />
                    <button onClick={() => updateCosto(v, editCosto[v.id] ?? '')}
                      className="text-xs bg-amber-100 text-amber-700 border border-amber-300 px-2 py-1 rounded">ok</button>
                  </div>
                )}
                <div className="text-right">
                  <p className="font-mono font-bold text-p-ink">{moneyARS(v.precio)}</p>
                  {isAdmin && !v.pendiente && (() => {
                    const r = calcRentabilidad(v.precio, v.costo)
                    return r ? (
                      <div className="text-right">
                        <p className={`text-xs font-mono font-bold ${r.ganancia >= 0 ? 'text-green-600' : 'text-red-500'}`}>{moneyARS(r.ganancia)} <span className="text-[10px] opacity-70">({r.margen}%)</span></p>
                        <p className="text-[10px] text-p-ink2">neto s/IVA+flete</p>
                      </div>
                    ) : null
                  })()}
                  {v.pendiente && <p className="text-xs text-amber-500 font-mono">s/costo</p>}
                </div>
                <div className="flex flex-col gap-1">
                  {isAdmin && <button onClick={() => abrirEditar(v)} style={{background:'#2563eb',color:'#fff',border:'none',borderRadius:6,padding:'4px 10px',fontSize:11,fontWeight:700,cursor:'pointer'}}>✏ Editar</button>}
                  <button onClick={() => isAdmin ? delVentaAudit(v) : delVenta(v)} className="text-red-400 hover:text-red-600 text-sm">✕</button>
                </div>
              </div>
            ))}
          </div>
      }

      </>
      )}

      {/* Modal gasto */}
      <Modal open={gastoOpen} onClose={()=>setGastoOpen(false)} title="Registrar gasto">
        <div className="flex flex-col gap-3">
          <Field label="Categoría">
            <Select value={gastoForm.categoria} onChange={e=>setGastoForm(p=>({...p,categoria:e.target.value}))}>
              <option value="">Seleccioná una categoría</option>
              {CATEGORIAS_GASTO.map(cat=><option key={cat}>{cat}</option>)}
            </Select>
          </Field>
          <Field label="Descripción"><Input value={gastoForm.descripcion} onChange={e=>setGastoForm(p=>({...p,descripcion:e.target.value}))} placeholder="Ej: Sueldo Juan, Alquiler junio…" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Monto"><Input value={gastoForm.monto} onChange={e=>setGastoForm(p=>({...p,monto:e.target.value}))} placeholder="$" /></Field>
            <Field label="Forma de pago">
              <Select value={gastoForm.forma_pago} onChange={e=>setGastoForm(p=>({...p,forma_pago:e.target.value}))}>
                {PAGOS.map(p=><option key={p}>{p}</option>)}
              </Select>
            </Field>
          </div>
          <Field label="N° comprobante (opcional)"><Input value={gastoForm.comprobante} onChange={e=>setGastoForm(p=>({...p,comprobante:e.target.value}))} placeholder="Factura / ticket" /></Field>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={()=>setGastoOpen(false)} style={{background:'#6b7280',color:'#fff',border:'none',borderRadius:8,padding:'9px 20px',fontWeight:700,fontSize:14,cursor:'pointer'}}>Cancelar</button>
            <button onClick={guardarGasto} style={{background:'#ef4444',color:'#fff',border:'none',borderRadius:8,padding:'9px 20px',fontWeight:700,fontSize:14,cursor:'pointer'}}>Registrar gasto</button>
          </div>
        </div>
      </Modal>

      {/* Modal venta */}
      <Modal open={open} onClose={() => setOpen(false)} title="Registrar venta">
        <div className="flex flex-col gap-3">
          {/* Buscar en stock */}
          <Field label="Buscar pieza en mi stock">
            <div className="relative">
              <Input value={stockQ} onChange={e => setStockQ(e.target.value)} placeholder="Escribí modelo, marca o código…" />
              {stockSug.length > 0 && (
                <div className="absolute z-10 top-full left-0 right-0 bg-white border border-p-line rounded-lg shadow-lg max-h-40 overflow-y-auto">
                  {stockSug.map(s => (
                    <button key={s.id} onClick={() => pickStock(s)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-p-light border-b border-p-line2 last:border-0">
                      <span className="font-medium">{s.descripcion}</span>
                      <span className="text-p-ink2 text-xs ml-2">{s.codigo && <span className="font-mono mr-1 text-p-dark">{s.codigo}</span>}{s.marca} · stock {s.cantidad}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </Field>
          <Field label="Pieza / descripción *"><Input value={form.descripcion} onChange={e => setForm(p => ({ ...p, descripcion: e.target.value }))} placeholder="Ej: Parabrisas VW Gol" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Costo">
              <Input value={form.costo} onChange={e => setForm(p => ({ ...p, costo: e.target.value }))} placeholder="$" />
              {!form.costo && <p className="text-[10px] text-amber-500 mt-0.5">Sin costo → venta queda pendiente</p>}
            </Field>
            <Field label="Precio de venta *"><Input value={form.precio} onChange={e => setForm(p => ({ ...p, precio: e.target.value }))} placeholder="$" /></Field>
          </div>
          {gan() !== null && (() => {
            const precio = +form.precio.replace(/[^0-9.]/g,'')
            const costo  = +form.costo.replace(/[^0-9.]/g,'')
            const r = calcRentabilidad(precio, costo)
            return r ? (
              <div style={{background:'#f9fafb',border:'1px solid #e5e7eb',borderRadius:10,padding:'10px 14px',fontSize:12}}>
                <p style={{fontWeight:700,color:'#374151',marginBottom:4}}>📊 Rentabilidad real</p>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:3}}>
                  <span style={{color:'#6b7280'}}>Precio neto:</span><span style={{fontFamily:'monospace',fontWeight:600}}>{moneyARS(r.precioNeto)}</span>
                  <span style={{color:'#6b7280'}}>Costo neto:</span><span style={{fontFamily:'monospace',fontWeight:600}}>{moneyARS(r.costoNeto)}</span>
                  <span style={{color:'#6b7280',fontWeight:700}}>Ganancia:</span>
                  <span style={{fontFamily:'monospace',fontWeight:800,color:r.ganancia>=0?'#00A550':'#ef4444'}}>{moneyARS(r.ganancia)} ({r.margen}%)</span>
                </div>
              </div>
            ) : null
          })()}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tipo de cliente">
              <select value={form.tipo_id} onChange={e=>{const t=tipos.find(t=>t.id===e.target.value);setForm(p=>({...p,tipo_id:e.target.value,tipo_nombre:t?.nombre||''}))}}
                style={{width:'100%',border:'1.5px solid #C2DDD0',borderRadius:10,padding:'9px 12px',fontSize:13,color:'#0C1810',background:'#fff',outline:'none'}}>
                <option value="">Sin tipo</option>
                {tipos.map(t=><option key={t.id} value={t.id}>{t.nombre}</option>)}
              </select>
            </Field>
            <Field label="Cliente"><Input value={form.cliente} onChange={e => setForm(p => ({ ...p, cliente: e.target.value }))} placeholder="Nombre" /></Field>
            <Field label="N° comprobante"><Input value={form.comprobante} onChange={e => setForm(p => ({ ...p, comprobante: e.target.value }))} placeholder="Factura / remito" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Origen">
              <Select value={form.origen} onChange={e => setForm(p => ({ ...p, origen: e.target.value as 'stock' | 'compra' }))}>
                <option value="stock">De mi stock (descuenta)</option>
                <option value="compra">Comprada para la venta</option>
              </Select>
            </Field>
            <Field label="Forma de pago">
              <Select value={form.pago} onChange={e => setForm(p => ({ ...p, pago: e.target.value }))}>
                {PAGOS.map(p => <option key={p}>{p}</option>)}
              </Select>
            </Field>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setOpen(false)} style={{background:'#6b7280',color:'#fff',border:'none',borderRadius:8,padding:'9px 20px',fontWeight:700,fontSize:14,cursor:'pointer'}}>Cancelar</button>
            <button onClick={save} style={{background:"#00A550",color:"#fff",border:"none",borderRadius:8,padding:"9px 20px",fontWeight:700,fontSize:14,cursor:"pointer"}}>Registrar</button>
          </div>
        </div>
      </Modal>
      {/* Modal edición (solo admin) */}
      {editId && (() => {
        const v = ventas.find(x => x.id === editId)
        if (!v) return null
        return (
          <Modal open={!!editId} onClose={() => setEditId(null)} title="Editar venta">
            <div className="flex flex-col gap-3">
              {/* Buscador de stock para edición */}
              <Field label="Buscar pieza en stock (opcional)">
                <div className="relative">
                  <Input value={editStockQ} onChange={e => setEditStockQ(e.target.value)} placeholder="Escribí para buscar y autocompletar…" />
                  {editStockSug.length > 0 && (
                    <div className="absolute z-10 top-full left-0 right-0 bg-white border border-p-line rounded-lg shadow-lg max-h-40 overflow-y-auto">
                      {editStockSug.map(s => (
                        <button key={s.id} onClick={() => pickEditStock(s)}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-p-light border-b border-p-line2 last:border-0">
                          <span className="font-medium">{s.descripcion}</span>
                          <span className="text-p-ink2 text-xs ml-2">{s.codigo && <span className="font-mono mr-1">{s.codigo}</span>}{s.marca}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </Field>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Código pieza">
                  <Input value={editForm.codigo} onChange={e => setEditForm(p => ({ ...p, codigo: e.target.value }))} placeholder="Ej: ABC123" />
                </Field>
                <div className="col-span-2">
                  <Field label="Descripción"><Input value={editForm.descripcion} onChange={e => setEditForm(p => ({ ...p, descripcion: e.target.value }))} /></Field>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Costo"><Input value={editForm.costo} onChange={e => setEditForm(p => ({ ...p, costo: e.target.value }))} placeholder="$" /></Field>
                <Field label="Precio"><Input value={editForm.precio} onChange={e => setEditForm(p => ({ ...p, precio: e.target.value }))} placeholder="$" /></Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Cliente"><Input value={editForm.cliente} onChange={e => setEditForm(p => ({ ...p, cliente: e.target.value }))} /></Field>
                <Field label="N° comprobante"><Input value={editForm.comprobante} onChange={e => setEditForm(p => ({ ...p, comprobante: e.target.value }))} /></Field>
              </div>
              <Field label="Forma de pago">
                <Select value={editForm.pago} onChange={e => setEditForm(p => ({ ...p, pago: e.target.value }))}>
                  {PAGOS.map(p => <option key={p}>{p}</option>)}
                </Select>
              </Field>
              {/* Desglose rentabilidad real */}
              {(() => {
                const precio = +editForm.precio.replace(/[^0-9.]/g,'')
                const costo  = +editForm.costo.replace(/[^0-9.]/g,'')
                const r = precio && costo ? calcRentabilidad(precio, costo) : null
                return r ? (
                  <div style={{background:'#f9fafb',border:'1px solid #e5e7eb',borderRadius:10,padding:'10px 14px',fontSize:12}}>
                    <p style={{fontWeight:700,color:'#374151',marginBottom:6}}>📊 Rentabilidad real (sin IVA + flete 1.5%)</p>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:4}}>
                      <span style={{color:'#6b7280'}}>Precio neto:</span><span style={{fontFamily:'monospace',fontWeight:600}}>{moneyARS(r.precioNeto)}</span>
                      <span style={{color:'#6b7280'}}>Costo neto:</span><span style={{fontFamily:'monospace',fontWeight:600}}>{moneyARS(r.costoNeto)}</span>
                      <span style={{color:'#6b7280',fontWeight:700}}>Ganancia:</span>
                      <span style={{fontFamily:'monospace',fontWeight:800,color:r.ganancia>=0?'#00A550':'#ef4444'}}>{moneyARS(r.ganancia)} ({r.margen}%)</span>
                    </div>
                  </div>
                ) : null
              })()}
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setEditId(null)} style={{background:'#6b7280',color:'#fff',border:'none',borderRadius:8,padding:'9px 20px',fontWeight:700,fontSize:14,cursor:'pointer'}}>Cancelar</button>
                <button onClick={() => guardarEdicion(v)} style={{background:'#00A550',color:'#fff',border:'none',borderRadius:8,padding:'9px 20px',fontWeight:700,fontSize:14,cursor:'pointer'}}>Guardar</button>
              </div>
            </div>
          </Modal>
        )
      })()}
    </div>
  )
}
