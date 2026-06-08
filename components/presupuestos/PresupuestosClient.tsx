'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Presupuesto, VentaItem } from '@/lib/types/database'
import { Btn, Modal, Field, Input, Select, Empty } from '@/components/ui'
import { moneyARS, PRESU_PRESETS, todayStr } from '@/lib/utils/format'

const IVA_RATE = 0.21

export default function PresupuestosClient({ userId, nombre }: { userId: string; nombre: string }) {
  const [presus, setPresus] = useState<Presupuesto[]>([])
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<VentaItem[]>([])
  const [ivaOn, setIvaOn] = useState(true)
  const [cotiz, setCotiz] = useState<{ blue: number; mep: number } | null>(null)
  const supabase = createClient()
  const router = useRouter()

  const [form, setForm] = useState({ cli: '', tel: '', veh: '', dias: '7' })
  const [item, setItem] = useState({ d: '', c: '1', p: '' })

  useEffect(() => {
    supabase.from('presupuestos').select('*').order('created_at', { ascending: false }).then(({ data }) => setPresus(data ?? []))
    supabase.from('cotizaciones').select('blue,mep').order('fecha', { ascending: false }).limit(1).maybeSingle().then(({ data }) => { if (data) setCotiz(data) })
  }, [supabase])

  const neto = items.reduce((a, it) => a + it.c * it.p, 0)
  const iva = ivaOn ? Math.round(neto * IVA_RATE) : 0
  const total = neto + iva

  function addItem() {
    if (!item.d || !item.p) { alert('Cargá descripción y precio.'); return }
    setItems(prev => [...prev, { d: item.d, c: +item.c || 1, p: +item.p.replace(/[^0-9.]/g, '') }])
    setItem({ d: '', c: '1', p: '' })
  }

  async function save() {
    if (!items.length) { alert('Agregá al menos un ítem.'); return }
    const dias = +form.dias || 7
    const venc = new Date(); venc.setDate(venc.getDate() + dias)
    await supabase.from('presupuestos').insert({
      fecha: todayStr(), vencimiento: venc.toISOString().slice(0, 10),
      cliente: form.cli || null, telefono: form.tel || null, vehiculo: form.veh || null,
      items, neto, iva_pct: IVA_RATE, iva, total,
      dolar_blue: cotiz?.blue ?? null, dolar_mep: cotiz?.mep ?? null, user_id: userId
    })
    setOpen(false); setItems([]); setForm({ cli: '', tel: '', veh: '', dias: '7' })
    const { data } = await supabase.from('presupuestos').select('*').order('created_at', { ascending: false })
    setPresus(data ?? [])
  }

  function printPresu(p: Presupuesto) {
    const rows = p.items.map((it: VentaItem) => `<tr><td>${it.d}</td><td style="text-align:center">${it.c}</td><td style="text-align:right">${moneyARS(it.p)}</td><td style="text-align:right">${moneyARS(it.c * it.p)}</td></tr>`).join('')
    const usdBlue = p.dolar_blue ? 'US$' + Math.round(p.total / p.dolar_blue).toLocaleString('es-AR') + ' (blue)' : ''
    const usdMep = p.dolar_mep ? ' · US$' + Math.round(p.total / p.dolar_mep).toLocaleString('es-AR') + ' (MEP)' : ''
    const w = window.open('', '_blank')!
    w.document.write(`<html><head><title>Presupuesto</title><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;max-width:700px;margin:24px auto;padding:0 20px;color:#0C1810}.hd{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #00A550;padding-bottom:12px;margin-bottom:16px}h1{font-size:18px;margin:0}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{padding:8px;border-bottom:1px solid #ddd;font-size:13px}th{background:#E6F7EF;text-align:left}.sub{text-align:right;font-size:13px;color:#555;margin-top:8px}.tot{text-align:right;font-size:20px;font-weight:bold;margin-top:4px}.usd{text-align:right;color:#4A6655;font-size:12px}</style></head><body><div class="hd"><div><h1>Parabrisas El Piamonte</h1></div><div style="text-align:right"><b>PRESUPUESTO</b><br><span style="font-size:12px;color:#777">${p.fecha.split('-').reverse().join('/')}</span></div></div><p><b>Cliente:</b> ${p.cliente || '—'}${p.vehiculo ? `&nbsp;&nbsp;<b>Vehículo:</b> ${p.vehiculo}` : ''}</p><table><tr><th>Detalle</th><th style="text-align:center">Cant.</th><th style="text-align:right">Unit.</th><th style="text-align:right">Subtotal</th></tr>${rows}</table><div class="sub">Subtotal neto: ${moneyARS(p.neto)}</div>${p.iva ? `<div class="sub">IVA ${Math.round(p.iva_pct * 100)}%: ${moneyARS(p.iva)}</div>` : ''}<div class="tot">TOTAL: ${moneyARS(p.total)}</div>${usdBlue ? `<div class="usd">${usdBlue}${usdMep}</div>` : ''}<p style="font-size:12px;color:#777;margin-top:24px">Válido hasta el ${p.vencimiento.split('-').reverse().join('/')}.</p><script>window.print()<\/script></body></html>`)
    w.document.close()
  }

  function waMsg(p: Presupuesto) {
    const ls = p.items.map((it: VentaItem) => `• ${it.d}${it.c > 1 ? ` (x${it.c})` : ''}: ${moneyARS(it.c * it.p)}`).join('\n')
    const usd = p.dolar_blue ? `\n≈ US$${Math.round(p.total / p.dolar_blue).toLocaleString('es-AR')} (blue)` : ''
    return `*Parabrisas El Piamonte*\nPresupuesto${p.cliente ? ' para ' + p.cliente : ''}\n${p.vehiculo ? `Vehículo: ${p.vehiculo}\n` : ''}\n${ls}\n\nSubtotal: ${moneyARS(p.neto)}${p.iva ? `\nIVA: ${moneyARS(p.iva)}` : ''}\n*TOTAL: ${moneyARS(p.total)}*${usd}\nVálido hasta el ${p.vencimiento.split('-').reverse().join('/')}`
  }

  async function toTurno(p: Presupuesto) {
    router.push(`/turnos?cli=${encodeURIComponent(p.cliente ?? '')}&tel=${encodeURIComponent(p.telefono ?? '')}&veh=${encodeURIComponent(p.vehiculo ?? '')}&tra=${encodeURIComponent(p.items.map((i: VentaItem) => i.d).join(' + '))}&pre=${p.total}`)
  }

  async function del(id: string) {
    if (!confirm('¿Borrar presupuesto?')) return
    await supabase.from('presupuestos').delete().eq('id', id)
    setPresus(prev => prev.filter(p => p.id !== id))
  }

  const today = todayStr()

  return (
    <div>
      <div style={{display:"flex",justifyContent:"flex-end",marginBottom:20}}><button onClick={()=>setOpen(true)} style={{ background:"#00A550", color:"#fff", border:"none", borderRadius:10, padding:"10px 20px", fontWeight:700, fontSize:14, cursor:"pointer" }}>+ Nuevo presupuesto</button></div>

      {presus.length === 0 ? <Empty msg="Sin presupuestos todavía." /> : (
        <div className="flex flex-col gap-4">
          {presus.map(p => {
            const venc = p.vencimiento < today
            const usdBlue = p.dolar_blue ? 'US$' + Math.round(p.total / p.dolar_blue).toLocaleString('es-AR') + ' blue' : ''
            const usdMep = p.dolar_mep ? ' · US$' + Math.round(p.total / p.dolar_mep).toLocaleString('es-AR') + ' MEP' : ''
            return (
              <div key={p.id} className={`bg-white border border-p-line rounded-xl p-4 shadow-sm ${venc ? 'opacity-60' : ''}`}>
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <p className="font-saira font-bold text-p-ink">{p.cliente || '(sin nombre)'}</p>
                    <p className="text-xs text-p-ink2 mt-0.5">{[p.vehiculo, `${p.items.length} ítem(s)`, p.iva ? 'c/IVA' : 's/IVA', `vence ${p.vencimiento.split('-').reverse().join('/')}${venc ? ' — VENCIDO' : ''}`].filter(Boolean).join(' · ')}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-saira font-bold text-xl text-p-ink">{moneyARS(p.total)}</p>
                    {(usdBlue || usdMep) && <p className="font-mono text-xs text-p-dark">{usdBlue}{usdMep}</p>}
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap mt-3 pt-3 border-t border-p-line2">
                  {p.telefono && <a href={`https://wa.me/${(p.telefono ?? '').replace(/[^0-9]/g, '')}?text=${encodeURIComponent(waMsg(p))}`} target="_blank" rel="noopener noreferrer"
                    className="text-xs font-bold bg-[#25d366] text-white px-3 py-1.5 rounded-lg">WhatsApp</a>}
                  <Btn size="sm" variant="secondary" onClick={() => printPresu(p)}>Imprimir</Btn>
                  <Btn size="sm" variant="ghost" onClick={() => toTurno(p)}>→ Turno</Btn>
                  <Btn size="sm" variant="danger" onClick={() => del(p.id)}>Borrar</Btn>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Nuevo presupuesto">
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Cliente"><Input value={form.cli} onChange={e => setForm(p => ({ ...p, cli: e.target.value }))} placeholder="Nombre" /></Field>
            <Field label="WhatsApp"><Input value={form.tel} onChange={e => setForm(p => ({ ...p, tel: e.target.value }))} placeholder="54 9 …" /></Field>
          </div>
          <Field label="Vehículo"><Input value={form.veh} onChange={e => setForm(p => ({ ...p, veh: e.target.value }))} placeholder="VW Gol 2015" /></Field>
          <div className="border-t border-p-line2 pt-3">
            <p className="text-xs font-semibold text-p-ink2 uppercase tracking-wider mb-2">Rubros rápidos</p>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {PRESU_PRESETS.map(r => (
                <button key={r} onClick={() => setItem(p => ({ ...p, d: r }))}
                  className="text-xs border border-p-line rounded-full px-2.5 py-1 hover:bg-p-light text-p-ink2 hover:text-p-dark">+ {r}</button>
              ))}
            </div>
            <div className="grid grid-cols-5 gap-2">
              <div className="col-span-2"><Field label="Ítem"><Input value={item.d} onChange={e => setItem(p => ({ ...p, d: e.target.value }))} placeholder="Descripción" /></Field></div>
              <Field label="Cant."><Input type="number" value={item.c} onChange={e => setItem(p => ({ ...p, c: e.target.value }))} min="1" /></Field>
              <div className="col-span-2"><Field label="Precio neto"><Input value={item.p} onChange={e => setItem(p => ({ ...p, p: e.target.value }))} placeholder="$" /></Field></div>
            </div>
            <Btn size="sm" variant="secondary" className="w-full mt-2" onClick={addItem}>+ Agregar ítem</Btn>
          </div>
          {items.length > 0 && (
            <div className="border-t border-p-line2 pt-2">
              {items.map((it, i) => (
                <div key={i} className="flex items-center justify-between py-1.5 border-b border-p-line2 text-sm">
                  <span className="text-p-ink">{it.d} {it.c > 1 ? `(×${it.c})` : ''}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-p-ink">{moneyARS(it.c * it.p)}</span>
                    <button onClick={() => setItems(prev => prev.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600 text-xs">✕</button>
                  </div>
                </div>
              ))}
              <label className="flex items-center gap-2 mt-2 text-sm cursor-pointer">
                <input type="checkbox" checked={ivaOn} onChange={e => setIvaOn(e.target.checked)} className="accent-p-green" />
                Sumar IVA 21%
              </label>
              <div className="bg-p-light rounded-lg p-3 mt-2 text-sm">
                <div className="flex justify-between text-p-ink2"><span>Subtotal neto</span><span className="font-mono">{moneyARS(neto)}</span></div>
                {ivaOn && <div className="flex justify-between text-p-ink2"><span>IVA 21%</span><span className="font-mono">{moneyARS(iva)}</span></div>}
                <div className="flex justify-between font-saira font-bold text-p-ink text-lg border-t border-p-line mt-1 pt-1"><span>TOTAL</span><span>{moneyARS(total)}</span></div>
                {cotiz?.blue && <p className="font-mono text-xs text-p-dark mt-1 text-right">≈ US${Math.round(total / cotiz.blue).toLocaleString('es-AR')} blue{cotiz?.mep ? ` · US$${Math.round(total / cotiz.mep).toLocaleString('es-AR')} MEP` : ''}</p>}
              </div>
            </div>
          )}
          <div className="flex justify-between items-center pt-1">
            <Field label="Válido por"><div className="flex items-center gap-1"><Input type="number" value={form.dias} onChange={e => setForm(p => ({ ...p, dias: e.target.value }))} className="w-16" min="1" /><span className="text-sm text-p-ink2">días</span></div></Field>
            <div className="flex gap-2">
              <Btn variant="secondary" onClick={() => setOpen(false)}>Cancelar</Btn>
              <Btn onClick={save}>Guardar</Btn>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  )
}
