'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { StockItem } from '@/lib/types/database'
import { Btn, Modal, Field, Input, Select, Empty, AlarmBar } from '@/components/ui'
import { moneyARS2 as moneyARS, POS_LABEL } from '@/lib/utils/format'

const FAM_MAP: Record<string, string> = {
  PARABRISAS: 'Parabrisas', LUNETA: 'Lunetas',
  PUERTA_DD: 'Puertas', PUERTA_DI: 'Puertas', PUERTA_TD: 'Puertas', PUERTA_TI: 'Puertas',
  CUSTODIA_D: 'Custodias', CUSTODIA_I: 'Custodias',
  ALETA_D: 'Custodias', ALETA_I: 'Custodias', VENTANA_D: 'Custodias', VENTANA_I: 'Custodias',
}
const FAMS = ['Parabrisas', 'Lunetas', 'Puertas', 'Custodias']
const FAM_ICON: Record<string, string> = { Parabrisas: '🟦', Lunetas: '🟫', Puertas: '🚪', Custodias: '🔻' }

export default function StockClient({ isAdmin }: { isAdmin: boolean }) {
  const [items, setItems] = useState<StockItem[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [depFilter, setDepFilter] = useState('')
  const [soloSinCosto, setSoloSinCosto] = useState(false)
  const [open, setOpen] = useState(false)
  const [ajusteOpen, setAjusteOpen] = useState(false)
  const [ajusteForm, setAjusteForm] = useState({ desc:'', cant:'1', costo:'', prov:'', nota:'' })
  const [ajusteSearch, setAjusteSearch] = useState('')
  const [ajusteSugs, setAjusteSugs] = useState<StockItem[]>([])
  const [ajusteStockId, setAjusteStockId] = useState<string|null>(null)
  const [costoEdit, setCostoEdit] = useState<Record<string, string>>({})
  const [editId, setEditId] = useState<string|null>(null)
  const [dolarOficial, setDolarOficial] = useState<number|null>(null)
  const supabase = createClient()

  const [form, setForm] = useState({ desc: '', cod: '', marca: '', pos: '', anio: '', cant: '1', precio: '', costo: '', dep: 'Principal' })

  const load = useCallback(async () => {
    const { data } = await supabase.from('stock').select('*').eq('activo', true).order('descripcion')
    setItems(data ?? [])
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    supabase.from('cotizaciones').select('oficial').order('fecha', { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => { if (data?.oficial) setDolarOficial(data.oficial) })
  }, [supabase])

  const depositos = [...new Set(items.map(s => s.deposito || 'Principal'))].sort()

  // Resumen por familia
  const resumen = FAMS.map(fam => {
    const arr = items.filter(s => FAM_MAP[s.pos ?? ''] === fam)
    const totalU = arr.reduce((a, s) => a + s.cantidad, 0)
    const valCosto = arr.filter(s => s.costo).reduce((a, s) => a + (s.costo ?? 0) * s.cantidad, 0)
    const sinCosto = arr.filter(s => !s.costo && s.cantidad > 0).reduce((a, s) => a + s.cantidad, 0)
    return { fam, items: arr.length, totalU, valCosto, sinCosto }
  })
  const valTotal = resumen.reduce((a, r) => a + r.valCosto, 0)
  // Universo distinto al de costo: la mayoría de las piezas cargadas a mano tienen precio de venta
  // pero no costo (y viceversa). Mostramos cada número con su propio universo, sin forzar una
  // comparación que hoy no existe en los datos — eso sería más confuso que útil.
  const itemsConVenta = items.filter(s => s.precio_venta)
  const valTotalVenta = itemsConVenta.reduce((a, s) => a + (s.precio_venta ?? 0) * s.cantidad, 0)
  const itemsConAmbos = items.filter(s => s.costo && s.precio_venta)
  const uTotal = resumen.reduce((a, r) => a + r.totalU, 0)
  const sinCostoCount = resumen.reduce((a, r) => a + r.sinCosto, 0)
  const sinVentaConCosto = items.filter(s => s.costo && !s.precio_venta).length
  const valTotalUSD = dolarOficial ? valTotal / dolarOficial : null
  const valTotalVentaUSD = dolarOficial ? valTotalVenta / dolarOficial : null

  // Filtros
  let visible = items
  if (depFilter) visible = visible.filter(s => (s.deposito || 'Principal') === depFilter)
  if (q) visible = visible.filter(s => (s.descripcion + ' ' + (s.marca ?? '') + ' ' + (s.codigo ?? '')).toUpperCase().includes(q.toUpperCase()))
  if (soloSinCosto) visible = visible.filter(s => !s.costo && s.cantidad > 0)

  async function chgCant(id: string, delta: number) {
    const s = items.find(x => x.id === id)!
    const cant = Math.max(0, s.cantidad + delta)
    await supabase.from('stock').update({ cantidad: cant, updated_at: new Date().toISOString() }).eq('id', id)
    setItems(prev => prev.map(x => x.id === id ? { ...x, cantidad: cant } : x))
  }

  async function saveCosto(id: string, val: string) {
    const c = +val.replace(/[^0-9.]/g, '')
    if (!c) return
    await supabase.from('stock').update({ costo: c, updated_at: new Date().toISOString() }).eq('id', id)
    setItems(prev => prev.map(x => x.id === id ? { ...x, costo: c } : x))
    setCostoEdit(p => { const n = { ...p }; delete n[id]; return n })
  }

  async function del(id: string) {
    if (!confirm('¿Quitar del stock?')) return
    await supabase.from('stock').update({ activo: false, updated_at: new Date().toISOString() }).eq('id', id)
    setItems(prev => prev.filter(x => x.id !== id))
  }

  // Búsqueda para ajuste
  useEffect(() => {
    if (ajusteSearch.length < 2) { setAjusteSugs([]); return }
    const q = ajusteSearch.toUpperCase()
    setAjusteSugs(items.filter(s => (s.descripcion+' '+(s.marca??'')).toUpperCase().includes(q)).slice(0,6))
  }, [ajusteSearch, items])

  async function saveAjuste() {
    if (!ajusteForm.desc || !ajusteForm.cant) return
    const cant = +ajusteForm.cant || 0
    const costo = ajusteForm.costo ? +ajusteForm.costo.replace(/[^0-9.]/g,'') : null
    // Si hay un stock_id, incrementar cantidad
    if (ajusteStockId) {
      const s = items.find(x => x.id === ajusteStockId)
      if (s) {
        await supabase.from('stock').update({ cantidad: s.cantidad + cant, ...(costo ? {costo} : {}), updated_at: new Date().toISOString() }).eq('id', ajusteStockId)
      }
    } else {
      // Crear nueva entrada de stock
      await supabase.from('stock').insert({
        descripcion: ajusteForm.desc, cantidad: cant, costo,
        deposito: 'Principal', activo: true
      })
    }
    // Registrar ajuste
    await supabase.from('ajustes_stock').insert({
      tipo: 'entrada', stock_id: ajusteStockId || null,
      descripcion: ajusteForm.desc, cantidad: cant,
      costo_unitario: costo, proveedor: ajusteForm.prov || null,
      nota: ajusteForm.nota || null
    })
    setAjusteOpen(false)
    setAjusteForm({ desc:'', cant:'1', costo:'', prov:'', nota:'' })
    setAjusteSearch(''); setAjusteStockId(null)
    load()
  }

  function openNuevo() {
    setForm({ desc: '', cod: '', marca: '', pos: '', anio: '', cant: '1', precio: '', costo: '', dep: 'Principal' })
    setEditId(null)
    setOpen(true)
  }

  function openEditar(s: StockItem) {
    setForm({
      desc: s.descripcion, cod: s.codigo || '', marca: s.marca || '',
      pos: s.pos || '', anio: s.anio || '', cant: String(s.cantidad),
      precio: s.precio_venta ? String(s.precio_venta) : '',
      costo: s.costo ? String(s.costo) : '',
      dep: s.deposito || 'Principal',
    })
    setEditId(s.id)
    setOpen(true)
  }

  async function save() {
    if (!form.desc) { alert('Cargá la descripción.'); return }
    const payload = {
      descripcion: form.desc, codigo: form.cod || null, marca: form.marca || null,
      pos: form.pos || null, anio: form.anio || null, cantidad: +form.cant || 0,
      precio_venta: form.precio ? +form.precio.replace(/[^0-9.]/g, '') : null,
      costo: form.costo ? +form.costo.replace(/[^0-9.]/g, '') : null,
      deposito: form.dep || 'Principal', updated_at: new Date().toISOString(),
    }
    if (editId) {
      await supabase.from('stock').update(payload).eq('id', editId)
    } else {
      await supabase.from('stock').insert(payload)
    }
    setOpen(false)
    setForm({ desc: '', cod: '', marca: '', pos: '', anio: '', cant: '1', precio: '', costo: '', dep: 'Principal' })
    setEditId(null)
    load()
  }

  return (
    <div>
      {/* Resumen por familia */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {resumen.map(r => (
          <div key={r.fam} className="bg-white border border-p-line rounded-xl p-4 shadow-sm">
            <p className="text-xs font-semibold text-p-ink2 uppercase tracking-wider">{FAM_ICON[r.fam]} {r.fam}</p>
            <p className="font-saira font-bold text-2xl text-p-ink mt-1">{r.totalU}<span className="text-sm font-normal text-p-ink2"> u. / {r.items} mod.</span></p>
            <p className="font-mono text-xs text-p-dark mt-1">{r.valCosto > 0 ? moneyARS(r.valCosto) : 'sin costo'}</p>
          </div>
        ))}
      </div>

      {/* Valorizado del stock — costo y venta son universos distintos hoy: la mayoría de las piezas
          cargadas a mano tienen uno u otro dato, no ambos. Se muestran por separado, sin forzar
          una comparación de margen que con los datos actuales no es real. */}
      {isAdmin && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
          <div style={{background:'#EEF1F0', border:'1px solid #D8DEDB'}} className="rounded-xl px-5 py-3.5">
            <p style={{color:'#5B6B66'}} className="text-xs font-semibold uppercase tracking-wider">Valorizado a costo de venta</p>
            <p style={{color:'#1F2B27'}} className="font-saira font-bold text-2xl mt-1">{moneyARS(valTotal)}</p>
            {valTotalUSD != null && <p style={{color:'#5B6B66'}} className="font-mono text-sm mt-0.5">US$ {valTotalUSD.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</p>}
            {sinCostoCount > 0 && <p style={{color:'#8A968F'}} className="font-mono text-xs mt-1">{sinCostoCount} u. sin costo cargado</p>}
            {sinVentaConCosto > 0 && <p style={{color:'#8A968F'}} className="font-mono text-xs mt-0.5">{sinVentaConCosto} mod. con costo pero sin precio de venta</p>}
          </div>
          <div style={{background:'#E6F5EC', border:'1px solid #BFE6CE'}} className="rounded-xl px-5 py-3.5">
            <p style={{color:'#1E8449'}} className="text-xs font-semibold uppercase tracking-wider">Valorizado a venta</p>
            <p style={{color:'#0E5A2C'}} className="font-saira font-bold text-2xl mt-1">{moneyARS(valTotalVenta)}</p>
            {valTotalVentaUSD != null && <p style={{color:'#1E8449'}} className="font-mono text-sm mt-0.5">US$ {valTotalVentaUSD.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</p>}
          </div>
        </div>
      )}
      {isAdmin && itemsConAmbos.length === 0 && (valTotal > 0 || valTotalVenta > 0) && (
        <div style={{background:'#FEF3C7', border:'1px solid #FCD34D'}} className="rounded-xl px-4 py-2.5 mb-3 text-xs" >
          <span style={{color:'#92400E', fontWeight:600}}>⚠ Ningún ítem tiene costo y precio de venta a la vez —</span>
          <span style={{color:'#92400E'}}> los dos números de arriba son universos distintos, no se puede calcular margen real todavía. Completá el costo (o la venta) de cada pieza desde el listado para que coincidan.</span>
        </div>
      )}
      {dolarOficial && isAdmin && (
        <p style={{color:'#6b7280'}} className="text-[11px] mb-3">Dólar oficial: {moneyARS(dolarOficial)}</p>
      )}


      {sinCostoCount > 0 && isAdmin && (
        <AlarmBar count={sinCostoCount} label="en stock sin costo — no suman al valor" onGo={() => setSoloSinCosto(true)} />
      )}

      {/* Controles */}
      <div className="flex items-center gap-2 flex-wrap mb-4">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Filtrar por modelo, marca o código…"
          className="flex-1 min-w-[200px] border border-p-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-p-green" />
        <select value={depFilter} onChange={e => setDepFilter(e.target.value)}
          className="border border-p-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-p-green bg-white">
          <option value="">Todos los depósitos</option>
          {depositos.map(d => <option key={d}>{d}</option>)}
        </select>
        {isAdmin && <button onClick={() => setSoloSinCosto(!soloSinCosto)}
          className={`text-xs font-bold px-3 py-2 rounded-lg border transition-colors ${soloSinCosto ? 'bg-amber-100 text-amber-700 border-amber-300' : 'border-p-line text-p-ink2 hover:bg-p-light'}`}>
          {soloSinCosto ? '✕ Solo sin costo' : '⚠ Solo sin costo'}
        </button>}
        <button onClick={openNuevo} style={{background:"#00A550",color:"#fff",border:"none",borderRadius:8,padding:"7px 14px",fontWeight:700,fontSize:12,cursor:"pointer"}}>+ Agregar</button>
        <button onClick={() => setAjusteOpen(true)}
          style={{background:'#1d4ed8',color:'#fff',border:'none',borderRadius:8,padding:'7px 14px',fontWeight:700,fontSize:12,cursor:'pointer'}}>
          📥 Cargar mercadería
        </button>
      </div>

      <p className="text-xs text-p-ink2 mb-3">{visible.length} ítems · {visible.reduce((a, s) => a + s.cantidad, 0)} u.</p>

      {loading ? <p className="text-sm text-p-gray text-center py-10">Cargando…</p> :
        visible.length === 0 ? <Empty msg="Sin ítems con ese filtro." /> : (
          <div className="flex flex-col gap-2">
            {visible.slice(0, 300).map(s => (
              <div key={s.id} className={`bg-white border rounded-xl px-4 py-3 shadow-sm flex items-center gap-3 flex-wrap ${!s.costo && s.cantidad > 0 ? 'border-l-4 border-l-amber-400 border-p-line' : 'border-p-line'}`}>
                <div className={`font-saira font-bold text-xl min-w-[32px] text-center ${s.cantidad > 0 ? 'text-p-green' : 'text-red-400'}`}>{s.cantidad}</div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-p-ink truncate">{s.descripcion}{s.anio ? ' · ' + s.anio : ''}</p>
                  <p className="text-xs text-p-ink2 truncate">{[s.marca, POS_LABEL[s.pos ?? ''] ?? s.pos, s.codigo ? 'cód ' + s.codigo : null, '📦 ' + (s.deposito || 'Principal')].filter(Boolean).join(' · ')}</p>
                </div>
                <div className="text-right min-w-[80px]">
                  {s.precio_venta && <p className="font-mono font-bold text-sm text-p-ink">{moneyARS(s.precio_venta)}</p>}
                  <p className="text-[10px] text-p-ink2 uppercase">venta</p>
                </div>
                {isAdmin && (
                  <div className="flex items-center gap-1 min-w-[120px]">
                    <input placeholder="costo" title="Costo de venta: costo consumidor final + recargo tarjeta + IVA" value={costoEdit[s.id] ?? (s.costo ? String(Math.round(s.costo)) : '')}
                      onChange={e => setCostoEdit(p => ({ ...p, [s.id]: e.target.value }))}
                      className={`w-24 border rounded px-2 py-1 text-xs font-mono focus:outline-none ${!s.costo ? 'border-amber-300' : 'border-p-line'}`} />
                    <button onClick={() => saveCosto(s.id, costoEdit[s.id] ?? '')}
                      className="text-xs bg-p-light text-p-dark border border-p-line px-2 py-1 rounded">ok</button>
                  </div>
                )}
                <div className="flex items-center gap-1">
                  <button onClick={() => chgCant(s.id, 1)} className="w-7 h-7 border border-p-line rounded-lg text-sm font-bold text-p-ink hover:bg-p-light">+</button>
                  <button onClick={() => chgCant(s.id, -1)} className="w-7 h-7 border border-p-line rounded-lg text-sm font-bold text-p-ink hover:bg-p-light">−</button>
                  <button onClick={() => openEditar(s)} className="w-7 h-7 border border-blue-200 rounded-lg text-sm text-blue-500 hover:text-blue-700 hover:bg-blue-50">✏</button>
                  {isAdmin && <button onClick={() => del(s.id)} className="w-7 h-7 border border-red-200 rounded-lg text-sm text-red-400 hover:text-red-600 hover:bg-red-50">✕</button>}
                </div>
              </div>
            ))}
          </div>
        )}

      <Modal open={open} onClose={() => setOpen(false)} title={editId ? 'Editar artículo' : 'Agregar a stock'}>
        <div className="flex flex-col gap-3">
          <Field label="Descripción *"><Input value={form.desc} onChange={e => setForm(p => ({ ...p, desc: e.target.value }))} placeholder="Ej: Parabrisas VW Gol" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Código proveedor"><Input value={form.cod} onChange={e => setForm(p => ({ ...p, cod: e.target.value }))} /></Field>
            <Field label="Marca / modelo"><Input value={form.marca} onChange={e => setForm(p => ({ ...p, marca: e.target.value }))} placeholder="VW Gol" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Posición"><Input value={form.pos} onChange={e => setForm(p => ({ ...p, pos: e.target.value }))} placeholder="PARABRISAS" /></Field>
            <Field label="Año"><Input value={form.anio} onChange={e => setForm(p => ({ ...p, anio: e.target.value }))} placeholder="2015-2020" /></Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Cantidad"><Input type="number" value={form.cant} onChange={e => setForm(p => ({ ...p, cant: e.target.value }))} min="0" /></Field>
            <Field label="Precio venta"><Input value={form.precio} onChange={e => setForm(p => ({ ...p, precio: e.target.value }))} placeholder="$" /></Field>
            <Field label="Costo de venta"><Input value={form.costo} onChange={e => setForm(p => ({ ...p, costo: e.target.value }))} placeholder="$" /></Field>
          </div>
          <p className="text-[11px] text-p-ink2 -mt-2">
            Costo de venta = costo consumidor final + recargo tarjeta + IVA. Es el valor con el que se valoriza el stock — no el costo neto de lista.
          </p>
          <Field label="Depósito"><Input value={form.dep} onChange={e => setForm(p => ({ ...p, dep: e.target.value }))} placeholder="Principal" /></Field>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => setOpen(false)} style={{background:'#6b7280',color:'#fff',border:'none',borderRadius:8,padding:'9px 20px',fontWeight:700,fontSize:14,cursor:'pointer'}}>Cancelar</button>
            <button onClick={save} style={{background:'#00A550',color:'#fff',border:'none',borderRadius:8,padding:'9px 20px',fontWeight:700,fontSize:14,cursor:'pointer'}}>{editId ? 'Guardar cambios' : 'Agregar'}</button>
          </div>
        </div>
      </Modal>
      {/* Modal carga de mercadería */}
      {ajusteOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onClick={e=>e.target===e.currentTarget&&setAjusteOpen(false)}>
          <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-p-line">
              <h2 className="font-saira font-bold text-lg text-p-ink">📥 Cargar mercadería</h2>
              <button onClick={()=>setAjusteOpen(false)} className="text-p-gray text-xl">✕</button>
            </div>
            <div className="p-5 flex flex-col gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-p-ink2 uppercase tracking-wider mb-1.5">Buscar pieza existente en stock</label>
                <div className="relative">
                  <input value={ajusteSearch} onChange={e=>{setAjusteSearch(e.target.value);setAjusteStockId(null)}}
                    placeholder="Modelo, marca…"
                    className="w-full border border-p-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-p-green"/>
                  {ajusteSugs.length>0&&(
                    <div className="absolute z-10 top-full left-0 right-0 bg-white border border-p-line rounded-lg shadow-lg max-h-40 overflow-y-auto">
                      {ajusteSugs.map(s=>(
                        <button key={s.id} onClick={()=>{setAjusteForm(p=>({...p,desc:s.descripcion,costo:s.costo?String(Math.round(s.costo)):''}));setAjusteStockId(s.id);setAjusteSearch(s.descripcion);setAjusteSugs([])}}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-p-light border-b border-p-line2 last:border-0">
                          <span className="font-medium">{s.descripcion}</span>
                          <span className="text-p-ink2 text-xs ml-2">stock actual: {s.cantidad} u.</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {ajusteStockId&&<p className="text-xs text-p-green font-semibold mt-1">✓ Entrada a pieza existente</p>}
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-p-ink2 uppercase tracking-wider mb-1.5">O descripción nueva</label>
                <input value={ajusteForm.desc} onChange={e=>setAjusteForm(p=>({...p,desc:e.target.value}))}
                  placeholder="Descripción de la pieza"
                  className="w-full border border-p-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-p-green"/>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-p-ink2 uppercase tracking-wider mb-1.5">Unidades</label>
                  <input type="number" min="1" value={ajusteForm.cant} onChange={e=>setAjusteForm(p=>({...p,cant:e.target.value}))}
                    className="w-full border border-p-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-p-green"/>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-p-ink2 uppercase tracking-wider mb-1.5">Costo unit.</label>
                  <input value={ajusteForm.costo} onChange={e=>setAjusteForm(p=>({...p,costo:e.target.value}))} placeholder="$"
                    className="w-full border border-p-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-p-green"/>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-p-ink2 uppercase tracking-wider mb-1.5">Proveedor</label>
                  <input value={ajusteForm.prov} onChange={e=>setAjusteForm(p=>({...p,prov:e.target.value}))} placeholder="GAMMA…"
                    className="w-full border border-p-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-p-green"/>
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-p-ink2 uppercase tracking-wider mb-1.5">Nota</label>
                <input value={ajusteForm.nota} onChange={e=>setAjusteForm(p=>({...p,nota:e.target.value}))} placeholder="Observaciones opcionales"
                  className="w-full border border-p-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-p-green"/>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={()=>setAjusteOpen(false)} style={{background:'#6b7280',color:'#fff',border:'none',borderRadius:8,padding:'8px 18px',fontWeight:700,fontSize:13,cursor:'pointer'}}>Cancelar</button>
                <button onClick={saveAjuste} style={{background:'#00A550',color:'#fff',border:'none',borderRadius:8,padding:'8px 18px',fontWeight:700,fontSize:13,cursor:'pointer'}}>Cargar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
