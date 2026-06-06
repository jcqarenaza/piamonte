'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Oferta } from '@/lib/types/database'
import { Btn, Modal, Field, Input, Empty } from '@/components/ui'
import { todayStr } from '@/lib/utils/format'

export default function OfertasClient() {
  const [ofertas, setOfertas] = useState<Oferta[]>([])
  const [open, setOpen] = useState(false)
  const [imgPrev, setImgPrev] = useState('')
  const supabase = createClient()

  const [form, setForm] = useState({ prov: '', rubro: '', precio: '', vence: '', nota: '' })
  const [file, setFile] = useState<File | null>(null)

  const today = todayStr()

  useEffect(() => {
    supabase.from('ofertas').select('*').eq('activa', true).order('created_at', { ascending: false }).then(({ data }) => setOfertas(data ?? []))
  }, [supabase])

  function onFile(f: File | null) {
    setFile(f)
    if (f) { const fr = new FileReader(); fr.onload = () => setImgPrev(fr.result as string); fr.readAsDataURL(f) }
    else setImgPrev('')
  }

  async function save() {
    if (!form.prov) { alert('Cargá el proveedor.'); return }
    let img_url = null
    if (file && imgPrev) {
      // Subir imagen a Supabase Storage (bucket 'ofertas') — si no existe, guardamos como dataURL pequeño
      img_url = imgPrev.length < 500_000 ? imgPrev : null // máx ~350KB como dataURL
    }
    await supabase.from('ofertas').insert({
      proveedor: form.prov, rubro: form.rubro || null, precio: form.precio || null,
      vigencia: form.vence || null, nota: form.nota || null, img_url, activa: true
    })
    setOpen(false); setFile(null); setImgPrev('')
    setForm({ prov: '', rubro: '', precio: '', vence: '', nota: '' })
    const { data } = await supabase.from('ofertas').select('*').eq('activa', true).order('created_at', { ascending: false })
    setOfertas(data ?? [])
  }

  async function del(id: string) {
    if (!confirm('¿Quitar oferta?')) return
    await supabase.from('ofertas').update({ activa: false }).eq('id', id)
    setOfertas(prev => prev.filter(o => o.id !== id))
  }

  return (
    <div>
      <div className="flex justify-end mb-5"><Btn onClick={() => setOpen(true)}>+ Nueva oferta</Btn></div>

      {ofertas.length === 0 ? <Empty msg="Sin ofertas cargadas." /> : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {ofertas.map(o => {
            const venc = o.vigencia && o.vigencia < today
            return (
              <div key={o.id} className={`bg-white border border-p-line rounded-xl p-4 shadow-sm flex gap-3 ${venc ? 'opacity-60' : ''}`}>
                {o.img_url && (
                  <button onClick={() => window.open(o.img_url!, '_blank')} className="shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={o.img_url} alt="oferta" className="w-16 h-16 object-cover rounded-lg border border-p-line" />
                  </button>
                )}
                {!o.img_url && <div className="w-16 h-16 rounded-lg bg-p-light flex items-center justify-center text-2xl shrink-0">📄</div>}
                <div className="flex-1 min-w-0">
                  <p className="font-saira font-bold text-p-ink">{o.proveedor}{o.rubro ? ' · ' + o.rubro : ''}</p>
                  {o.nota && <p className="text-xs text-p-ink2 mt-0.5 truncate">{o.nota}</p>}
                  {o.precio && <p className="font-mono font-bold text-p-dark text-sm mt-1">{o.precio}</p>}
                  {o.vigencia && <p className="text-xs text-p-gray mt-0.5">Vence: {o.vigencia.split('-').reverse().join('/')}{venc ? ' — VENCIDA' : ''}</p>}
                </div>
                <button onClick={() => del(o.id)} className="text-red-400 hover:text-red-600 text-sm self-start">✕</button>
              </div>
            )
          })}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Nueva oferta">
        <div className="flex flex-col gap-3">
          <Field label="Proveedor *"><Input value={form.prov} onChange={e => setForm(p => ({ ...p, prov: e.target.value }))} placeholder="GAMMA, Sekurit…" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Rubro / pieza"><Input value={form.rubro} onChange={e => setForm(p => ({ ...p, rubro: e.target.value }))} placeholder="Parabrisas, pegamento…" /></Field>
            <Field label="Precio / descuento"><Input value={form.precio} onChange={e => setForm(p => ({ ...p, precio: e.target.value }))} placeholder="$ o %" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nota"><Input value={form.nota} onChange={e => setForm(p => ({ ...p, nota: e.target.value }))} placeholder="Detalle libre" /></Field>
            <Field label="Vence"><Input type="date" value={form.vence} onChange={e => setForm(p => ({ ...p, vence: e.target.value }))} /></Field>
          </div>
          <Field label="Imagen de la lista">
            <input type="file" accept="image/*" onChange={e => onFile(e.target.files?.[0] ?? null)}
              className="w-full border border-p-line rounded-lg px-3 py-2 text-sm file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:bg-p-light file:text-p-dark file:font-semibold file:text-xs" />
            {imgPrev && <img src={imgPrev} alt="" className="mt-2 max-h-32 rounded-lg border border-p-line" />}
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <Btn variant="secondary" onClick={() => setOpen(false)}>Cancelar</Btn>
            <Btn onClick={save}>Guardar</Btn>
          </div>
        </div>
      </Modal>
    </div>
  )
}
