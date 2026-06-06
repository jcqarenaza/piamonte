'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { StockItem } from '@/lib/types/database'
import { Btn, Modal, Field, Input, Select, Empty, AlarmBar } from '@/components/ui'
import { moneyARS, POS_LABEL } from '@/lib/utils/format'

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
  const [costoEdit, setCostoEdit] = useState<Record<string, string>>({})
  const supabase = createClient()

  const [form, setForm] = useState({ desc: '', cod: '', marca: '', pos: '', anio: '', cant: '1', precio: '', costo: '', dep: 'Principal' })

  const load = useCallback(async () => {
    const { data } = await supabase.from('stock').select('*').eq('activo', true).order('descripcion')
    setItems(data ?? [])
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

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
  const uTotal = resumen.reduce((a, r) => a + r.totalU, 0)
  const sinCostoCount = resumen.reduce((a, r) => a + r.sinCosto, 0)

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

  async function addStock() {
    if (!form.desc) { alert('Cargá la descripción.'); return }
    await supabase.from('stock').insert({
      descripcion: form.desc, codigo: form.cod || null, marca: form.marca || null,
      pos: form.pos || null, anio: form.anio || null, cantidad: +form.cant || 0,
      precio_venta: form.precio ? +form.precio.replace(/[^0-9.]/g, '') : null,
      costo: form.costo ? +form.costo.replace(/[^0-9.]/g, '') : null,
      deposito: form.dep || 'Principal',
    })
    setOpen(false)
    setForm({ desc: '', cod: '', marca: '', pos: '', anio: '', cant: '1', precio: '', costo: '', dep: 'Principal' })
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

      {/* Total */}
      <div className="bg-p-ink text-white rounded-xl px-5 py-3.5 flex justify-between items-center mb-4 flex-wrap gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider opacity-70">Valor total del stock a costo</p>
          {sinCostoCount > 0 && <p className="font-mono text-xs opacity-60 mt-0.5">{sinCostoCount} u. todavía sin costo cargado</p>}
        </div>
        <p className="font-saira font-bold text-2xl">{moneyARS(valTotal)}</p>
      </div>

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
        <Btn size="sm" onClick={() => setOpen(true)}>+ Agregar</Btn>
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
                    <input placeholder="costo" value={costoEdit[s.id] ?? (s.costo ? String(Math.round(s.costo)) : '')}
                      onChange={e => setCostoEdit(p => ({ ...p, [s.id]: e.target.value }))}
                      className={`w-24 border rounded px-2 py-1 text-xs font-mono focus:outline-none ${!s.costo ? 'border-amber-300' : 'border-p-line'}`} />
                    <button onClick={() => saveCosto(s.id, costoEdit[s.id] ?? '')}
                      className="text-xs bg-p-light text-p-dark border border-p-line px-2 py-1 rounded">ok</button>
                  </div>
                )}
                <div className="flex items-center gap-1">
                  <button onClick={() => chgCant(s.id, 1)} className="w-7 h-7 border border-p-line rounded-lg text-sm font-bold text-p-ink hover:bg-p-light">+</button>
                  <button onClick={() => chgCant(s.id, -1)} className="w-7 h-7 border border-p-line rounded-lg text-sm font-bold text-p-ink hover:bg-p-light">−</button>
                  {isAdmin && <button onClick={() => del(s.id)} className="w-7 h-7 border border-red-200 rounded-lg text-sm text-red-400 hover:text-red-600 hover:bg-red-50">✕</button>}
                </div>
              </div>
            ))}
          </div>
        )}

      <Modal open={open} onClose={() => setOpen(false)} title="Agregar a stock">
        <div className="flex flex-col gap-3">
          <Field label="Descripción *"><Input value={form.desc} onChange={e => setForm(p => ({ ...p, desc: e.target.value }))} placeholder="Ej: Parabrisas VW Gol" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Código proveedor"><Input value={form.cod} onChange={e => setForm(p => ({ ...p, cod: e.target.value }))} /></Field>
            <Field label="Marca / modelo"><Input value={form.marca} onChange={e => setForm(p => ({ ...p, marca: e.target.value }))} placeholder="VW Gol" /></Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Cantidad"><Input type="number" value={form.cant} onChange={e => setForm(p => ({ ...p, cant: e.target.value }))} min="0" /></Field>
            <Field label="Precio venta"><Input value={form.precio} onChange={e => setForm(p => ({ ...p, precio: e.target.value }))} placeholder="$" /></Field>
            <Field label="Costo"><Input value={form.costo} onChange={e => setForm(p => ({ ...p, costo: e.target.value }))} placeholder="$" /></Field>
          </div>
          <Field label="Depósito"><Input value={form.dep} onChange={e => setForm(p => ({ ...p, dep: e.target.value }))} placeholder="Principal" /></Field>
          <div className="flex justify-end gap-2 pt-1">
            <Btn variant="secondary" onClick={() => setOpen(false)}>Cancelar</Btn>
            <Btn onClick={addStock}>Agregar</Btn>
          </div>
        </div>
      </Modal>
    </div>
  )
}
