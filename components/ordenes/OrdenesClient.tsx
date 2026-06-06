'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { OrdenServicio, VentaItem } from '@/lib/types/database'
import { Btn, Modal, Field, Input, Select, Empty } from '@/components/ui'
import { moneyARS, PRESU_PRESETS, ASEGURADORAS, todayStr } from '@/lib/utils/format'

const IVA_RATE = 0.21

export default function OrdenesClient({ userId }: { userId: string }) {
  const [ordenes, setOrdenes] = useState<OrdenServicio[]>([])
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<VentaItem[]>([])
  const [ivaOn, setIvaOn] = useState(true)
  const supabase = createClient()

  const [form, setForm] = useState({ aseg: '', sin: '', pol: '', cli: '', tel: '', veh: '', pat: '', obs: '' })
  const [item, setItem] = useState({ d: '', c: '1', p: '' })

  useEffect(() => {
    supabase.from('ordenes_servicio').select('*').order('created_at', { ascending: false }).then(({ data }) => setOrdenes(data ?? []))
  }, [supabase])

  const neto = items.reduce((a, it) => a + it.c * it.p, 0)
  const iva = ivaOn ? Math.round(neto * IVA_RATE) : 0
  const total = neto + iva

  function addItem() {
    if (!item.d || !item.p) { alert('Cargá concepto y precio.'); return }
    setItems(prev => [...prev, { d: item.d, c: +item.c || 1, p: +item.p.replace(/[^0-9.]/g, '') }])
    setItem({ d: '', c: '1', p: '' })
  }

  async function save() {
    if (!items.length) { alert('Agregá al menos un ítem.'); return }
    const { data: cnt } = await supabase.rpc('next_orden_numero')
    await supabase.from('ordenes_servicio').insert({
      numero: cnt, fecha: todayStr(),
      aseguradora: form.aseg || null, siniestro: form.sin || null, poliza: form.pol || null,
      cliente: form.cli || null, telefono: form.tel || null,
      vehiculo: form.veh || null, patente: form.pat.toUpperCase() || null,
      items, neto, iva_pct: IVA_RATE, iva, total,
      observaciones: form.obs || null, user_id: userId
    })
    setOpen(false); setItems([])
    setForm({ aseg: '', sin: '', pol: '', cli: '', tel: '', veh: '', pat: '', obs: '' })
    const { data } = await supabase.from('ordenes_servicio').select('*').order('created_at', { ascending: false })
    setOrdenes(data ?? [])
  }

  function printOrden(o: OrdenServicio) {
    const rows = o.items.map((it: VentaItem) => `<tr><td>${it.d}</td><td style="text-align:center">${it.c}</td><td style="text-align:right">${moneyARS(it.p)}</td><td style="text-align:right">${moneyARS(it.c * it.p)}</td></tr>`).join('')
    const w = window.open('', '_blank')!
    w.document.write(`<html><head><title>${o.numero}</title><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;max-width:740px;margin:24px auto;padding:0 20px;color:#0C1810}.hd{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #00A550;padding-bottom:12px}.box{border:1px solid #ddd;border-radius:8px;padding:12px 16px;margin:16px 0;font-size:13px;display:grid;grid-template-columns:1fr 1fr;gap:6px 20px}.aseg{font-size:16px;font-weight:bold;color:#007A3D;grid-column:1/3}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{padding:8px;border-bottom:1px solid #ddd;font-size:13px}th{background:#E6F7EF;text-align:left}.tot{text-align:right;font-size:20px;font-weight:bold;margin-top:8px}.sub{text-align:right;font-size:13px;color:#555;margin-top:4px}.firmas{display:flex;justify-content:space-between;margin-top:60px;font-size:12px;color:#777}.firmas div{border-top:1px solid #999;width:42%;text-align:center;padding-top:6px}</style></head><body><div class="hd"><div><h1 style="font-size:18px;margin:0">Parabrisas El Piamonte</h1></div><div style="text-align:right"><b style="font-size:18px">ORDEN DE SERVICIO</b><br><span style="font-size:12px;color:#777">${o.numero} · ${o.fecha.split('-').reverse().join('/')}</span></div></div><div class="box"><div class="aseg">Aseguradora: ${o.aseguradora || '—'}</div><div><b>N° Siniestro:</b> ${o.siniestro || '—'}</div><div><b>N° Póliza:</b> ${o.poliza || '—'}</div><div><b>Cliente:</b> ${o.cliente || '—'}</div><div><b>Tel:</b> ${o.telefono || '—'}</div><div><b>Vehículo:</b> ${o.vehiculo || '—'}</div><div><b>Patente:</b> ${o.patente || '—'}</div></div><table><tr><th>Trabajo / vidrio</th><th style="text-align:center">Cant.</th><th style="text-align:right">Unit.</th><th style="text-align:right">Subtotal</th></tr>${rows}</table><div class="sub">Subtotal neto: ${moneyARS(o.neto)}</div>${o.iva ? `<div class="sub">IVA ${Math.round(o.iva_pct * 100)}%: ${moneyARS(o.iva)}</div>` : ''}<div class="tot">TOTAL: ${moneyARS(o.total)}</div>${o.observaciones ? `<p style="font-size:12px;color:#777;margin-top:12px"><b>Obs:</b> ${o.observaciones}</p>` : ''}<div class="firmas"><div>Firma del taller</div><div>Conformidad cliente / aseguradora</div></div><script>window.print()<\/script></body></html>`)
    w.document.close()
  }

  async function del(id: string) {
    if (!confirm('¿Borrar orden?')) return
    await supabase.from('ordenes_servicio').delete().eq('id', id)
    setOrdenes(prev => prev.filter(o => o.id !== id))
  }

  return (
    <div>
      <div className="flex justify-end mb-5"><Btn onClick={() => setOpen(true)}>+ Nueva orden</Btn></div>

      {ordenes.length === 0 ? <Empty msg="Sin órdenes de servicio todavía." /> : (
        <div className="flex flex-col gap-3">
          {ordenes.map(o => (
            <div key={o.id} className="bg-white border border-p-line rounded-xl p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs bg-p-light text-p-dark px-2 py-0.5 rounded-full font-bold">{o.numero}</span>
                    <span className="font-saira font-bold text-p-dark">{o.aseguradora || 'Sin aseguradora'}</span>
                  </div>
                  <p className="text-sm text-p-ink mt-0.5">{o.cliente || '—'} {o.vehiculo ? `· ${o.vehiculo}` : ''} {o.patente ? `(${o.patente})` : ''}</p>
                  <p className="text-xs text-p-ink2 mt-0.5">{[o.siniestro ? 'Sin. ' + o.siniestro : null, o.poliza ? 'Pól. ' + o.poliza : null, o.fecha.split('-').reverse().join('/')].filter(Boolean).join(' · ')}</p>
                </div>
                <div className="text-right">
                  <p className="font-saira font-bold text-xl text-p-ink">{moneyARS(o.total)}</p>
                  <p className="text-xs text-p-ink2">{o.iva ? 'c/IVA' : 's/IVA'}</p>
                </div>
              </div>
              <div className="flex gap-2 flex-wrap mt-3 pt-3 border-t border-p-line2">
                <Btn size="sm" onClick={() => printOrden(o)}>Imprimir</Btn>
                {o.telefono && (
                  <a href={`https://wa.me/${(o.telefono ?? '').replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`*Parabrisas El Piamonte* — Orden ${o.numero}\nAseguradora: ${o.aseguradora || '—'}\nSiniestro: ${o.siniestro || '—'}\nVehículo: ${o.vehiculo || '—'}${o.patente ? ' (' + o.patente + ')' : ''}\n*TOTAL: ${moneyARS(o.total)}*${o.iva ? ' (IVA incl.)' : ''}`)}`}
                    target="_blank" rel="noopener noreferrer"
                    className="text-xs font-bold bg-[#25d366] text-white px-3 py-1.5 rounded-lg">WA</a>
                )}
                <Btn size="sm" variant="danger" onClick={() => del(o.id)}>Borrar</Btn>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Nueva orden de servicio">
        <div className="flex flex-col gap-3">
          <Field label="Aseguradora">
            <Input value={form.aseg} onChange={e => setForm(p => ({ ...p, aseg: e.target.value }))} list="aseguradoras" placeholder="La Caja, Sancor…" />
            <datalist id="aseguradoras">{ASEGURADORAS.map(a => <option key={a} value={a} />)}</datalist>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="N° Siniestro"><Input value={form.sin} onChange={e => setForm(p => ({ ...p, sin: e.target.value }))} /></Field>
            <Field label="N° Póliza"><Input value={form.pol} onChange={e => setForm(p => ({ ...p, pol: e.target.value }))} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Cliente"><Input value={form.cli} onChange={e => setForm(p => ({ ...p, cli: e.target.value }))} /></Field>
            <Field label="WhatsApp"><Input value={form.tel} onChange={e => setForm(p => ({ ...p, tel: e.target.value }))} placeholder="54 9 …" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Vehículo"><Input value={form.veh} onChange={e => setForm(p => ({ ...p, veh: e.target.value }))} placeholder="VW Gol" /></Field>
            <Field label="Patente"><Input value={form.pat} onChange={e => setForm(p => ({ ...p, pat: e.target.value.toUpperCase() }))} /></Field>
          </div>
          <div className="border-t border-p-line2 pt-3">
            <div className="flex flex-wrap gap-1.5 mb-3">
              {PRESU_PRESETS.map(r => <button key={r} onClick={() => setItem(p => ({ ...p, d: r }))} className="text-xs border border-p-line rounded-full px-2.5 py-1 hover:bg-p-light text-p-ink2">+ {r}</button>)}
            </div>
            <div className="grid grid-cols-5 gap-2">
              <div className="col-span-2"><Field label="Trabajo / vidrio"><Input value={item.d} onChange={e => setItem(p => ({ ...p, d: e.target.value }))} placeholder="Concepto" /></Field></div>
              <Field label="Cant."><Input type="number" value={item.c} onChange={e => setItem(p => ({ ...p, c: e.target.value }))} min="1" /></Field>
              <div className="col-span-2"><Field label="Precio neto"><Input value={item.p} onChange={e => setItem(p => ({ ...p, p: e.target.value }))} placeholder="$" /></Field></div>
            </div>
            <Btn size="sm" variant="secondary" className="w-full mt-2" onClick={addItem}>+ Agregar</Btn>
          </div>
          {items.length > 0 && (
            <div className="border-t border-p-line2 pt-2">
              {items.map((it, i) => (
                <div key={i} className="flex justify-between items-center py-1.5 border-b border-p-line2 text-sm">
                  <span>{it.d} {it.c > 1 ? `(×${it.c})` : ''}</span>
                  <div className="flex items-center gap-2"><span className="font-mono">{moneyARS(it.c * it.p)}</span><button onClick={() => setItems(p => p.filter((_, j) => j !== i))} className="text-red-400 text-xs">✕</button></div>
                </div>
              ))}
              <label className="flex items-center gap-2 mt-2 text-sm cursor-pointer">
                <input type="checkbox" checked={ivaOn} onChange={e => setIvaOn(e.target.checked)} className="accent-p-green" />IVA 21%
              </label>
              <div className="bg-p-light rounded-lg p-3 mt-2 text-sm">
                {ivaOn && <div className="flex justify-between text-p-ink2"><span>IVA 21%</span><span className="font-mono">{moneyARS(iva)}</span></div>}
                <div className="flex justify-between font-saira font-bold text-p-ink text-lg border-t border-p-line mt-1 pt-1"><span>TOTAL</span><span>{moneyARS(total)}</span></div>
              </div>
            </div>
          )}
          <Field label="Observaciones"><Input value={form.obs} onChange={e => setForm(p => ({ ...p, obs: e.target.value }))} placeholder="Detalle del trabajo, aclaraciones…" /></Field>
          <div className="flex justify-end gap-2 pt-1">
            <Btn variant="secondary" onClick={() => setOpen(false)}>Cancelar</Btn>
            <Btn onClick={save}>Guardar orden</Btn>
          </div>
        </div>
      </Modal>
    </div>
  )
}
