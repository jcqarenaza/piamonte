'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Presupuesto, VentaItem } from '@/lib/types/database'
import { Modal, Field, Input, Select, Empty } from '@/components/ui'
import { moneyARS, PRESU_PRESETS, todayStr } from '@/lib/utils/format'

const IVA_RATE = 0.21
const btn = { background:'#00A550', color:'#fff', border:'none', borderRadius:10, padding:'10px 20px', fontWeight:700, fontSize:14, cursor:'pointer' } as const
const btnSm = { ...btn, padding:'6px 14px', fontSize:13 } as const
const btnGray = { ...btnSm, background:'#6b7280' } as const
const btnRed = { ...btnSm, background:'#ef4444' } as const

interface CatHit { id:string; descripcion:string; proveedor:string; costo_neto:number; pos:string|null }

export default function PresupuestosClient({ userId }: { userId: string }) {
  const [presus, setPresus]   = useState<Presupuesto[]>([])
  const [open, setOpen]       = useState(false)
  const [items, setItems]     = useState<VentaItem[]>([])
  const [ivaOn, setIvaOn]     = useState(true)
  const [cotiz, setCotiz]     = useState<{ blue:number; mep:number }|null>(null)
  const [catQ, setCatQ]       = useState('')
  const [catHits, setCatHits] = useState<CatHit[]>([])
  const supabase = createClient()
  const router = useRouter()

  const [form, setForm] = useState({ cli:'', tel:'', veh:'', dias:'7' })
  const [item, setItem] = useState({ d:'', c:'1', p:'' })

  useEffect(() => {
    supabase.from('presupuestos').select('*').order('created_at',{ascending:false}).then(({data})=>setPresus(data??[]))
    supabase.from('cotizaciones').select('blue,mep').order('fecha',{ascending:false}).limit(1).maybeSingle().then(({data})=>{if(data)setCotiz(data)})
  }, [supabase])

  // Búsqueda de vidrios en catálogo
  useEffect(() => {
    if (catQ.trim().length < 3) { setCatHits([]); return }
    supabase.from('catalogo').select('id,descripcion,proveedor,costo_neto,pos')
      .ilike('descripcion', `%${catQ}%`).order('costo_neto').limit(12)
      .then(({data}) => setCatHits(data ?? []))
  }, [catQ, supabase])

  function pickCat(h: CatHit) {
    setItem(p=>({ ...p, d: h.descripcion, p: String(Math.round(h.costo_neto)) }))
    setCatQ(''); setCatHits([])
  }

  const neto = items.reduce((a,it)=>a+it.c*it.p, 0)
  const iva  = ivaOn ? Math.round(neto * IVA_RATE) : 0
  const total = neto + iva

  function addItem() {
    if (!item.d || !item.p) return
    setItems(prev=>[...prev,{d:item.d,c:+item.c||1,p:+item.p.replace(/[^0-9.]/g,'')}])
    setItem({d:'',c:'1',p:''})
  }

  async function save() {
    if (!items.length) return
    const dias = +form.dias||7
    const venc = new Date(); venc.setDate(venc.getDate()+dias)
    await supabase.from('presupuestos').insert({
      fecha:todayStr(), vencimiento:venc.toISOString().slice(0,10),
      cliente:form.cli||null, telefono:form.tel||null, vehiculo:form.veh||null,
      items, neto, iva_pct:IVA_RATE, iva, total,
      dolar_blue:cotiz?.blue??null, dolar_mep:cotiz?.mep??null, user_id:userId
    })
    setOpen(false); setItems([]); setForm({cli:'',tel:'',veh:'',dias:'7'})
    const {data}=await supabase.from('presupuestos').select('*').order('created_at',{ascending:false})
    setPresus(data??[])
  }

  function toOS(p: Presupuesto) {
    const params = new URLSearchParams({
      cli: p.cliente??'', tel: p.telefono??'', veh: p.vehiculo??'',
      items: JSON.stringify(p.items), total: String(p.total), iva: String(p.iva??0)
    })
    router.push(`/ordenes?from=${params.toString()}`)
  }

  function printPresu(p: Presupuesto) {
    const rows = p.items.map((it:VentaItem)=>`<tr><td>${it.d}</td><td align="center">${it.c}</td><td align="right">${moneyARS(it.p)}</td><td align="right">${moneyARS(it.c*it.p)}</td></tr>`).join('')
    const usd = p.dolar_blue ? `<div style="text-align:right;font-size:12px;color:#4A6655">≈ US$${Math.round(p.total/p.dolar_blue).toLocaleString('es-AR')} blue${p.dolar_mep?` · US$${Math.round(p.total/p.dolar_mep).toLocaleString('es-AR')} MEP`:''}</div>` : ''
    const w = window.open('','_blank')!
    w.document.write(`<html><head><meta charset="utf-8"><title>Presupuesto</title><style>body{font-family:Arial;max-width:700px;margin:24px auto;padding:0 20px}.hd{display:flex;justify-content:space-between;border-bottom:3px solid #00A550;padding-bottom:12px;margin-bottom:16px}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{padding:8px;border-bottom:1px solid #ddd;font-size:13px}th{background:#E6F7EF}.tot{text-align:right;font-size:20px;font-weight:bold;margin-top:8px}</style></head><body><div class="hd"><div><h2 style="margin:0">Parabrisas El Piamonte</h2></div><div style="text-align:right"><b>PRESUPUESTO</b><br><small>${p.fecha.split('-').reverse().join('/')}</small></div></div><p><b>Cliente:</b> ${p.cliente||'—'}${p.vehiculo?`&nbsp;&nbsp;<b>Vehículo:</b> ${p.vehiculo}`:''}</p><table><tr><th>Detalle</th><th>Cant.</th><th>Unit.</th><th>Subtotal</th></tr>${rows}</table>${p.iva?`<div style="text-align:right;margin-top:4px;font-size:13px">IVA 21%: ${moneyARS(p.iva)}</div>`:''}<div class="tot">TOTAL: ${moneyARS(p.total)}</div>${usd}<p style="font-size:11px;color:#777;margin-top:20px">Válido hasta el ${p.vencimiento.split('-').reverse().join('/')}.</p><script>window.print()<\/script></body></html>`)
    w.document.close()
  }

  function waMsg(p: Presupuesto) {
    const ls = p.items.map((it:VentaItem)=>`• ${it.d}${it.c>1?` (x${it.c})`:''}: ${moneyARS(it.c*it.p)}`).join('\n')
    const usd = p.dolar_blue ? `\n≈ US$${Math.round(p.total/p.dolar_blue).toLocaleString('es-AR')} blue` : ''
    return `*Parabrisas El Piamonte*\nPresupuesto${p.cliente?' para '+p.cliente:''}\n${p.vehiculo?`Vehículo: ${p.vehiculo}\n`:''}\n${ls}\n${p.iva?`IVA: ${moneyARS(p.iva)}\n`:''}\n*TOTAL: ${moneyARS(p.total)}*${usd}\nVálido hasta el ${p.vencimiento.split('-').reverse().join('/')}`
  }

  async function del(id:string) {
    if (!confirm('¿Borrar presupuesto?')) return
    await supabase.from('presupuestos').delete().eq('id',id)
    setPresus(prev=>prev.filter(p=>p.id!==id))
  }

  const today = todayStr()

  return (
    <div>
      <div style={{display:'flex',justifyContent:'flex-end',marginBottom:20}}>
        <button onClick={()=>setOpen(true)} style={btn}>+ Nuevo presupuesto</button>
      </div>

      {presus.length===0 ? <Empty msg="Sin presupuestos todavía." /> : (
        <div className="flex flex-col gap-4">
          {presus.map(p=>{
            const venc = p.vencimiento < today
            const usdBlue = p.dolar_blue ? `US$${Math.round(p.total/p.dolar_blue).toLocaleString('es-AR')} blue` : ''
            const usdMep  = p.dolar_mep  ? ` · US$${Math.round(p.total/p.dolar_mep).toLocaleString('es-AR')} MEP`  : ''
            return (
              <div key={p.id} className={`bg-white border border-p-line rounded-xl p-4 shadow-sm ${venc?'opacity-60':''}`}>
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <p className="font-saira font-bold text-p-ink">{p.cliente||'(sin nombre)'}</p>
                    <p className="text-xs text-p-ink2 mt-0.5">
                      {[p.vehiculo, `${p.items.length} ítem(s)`, p.iva?'c/IVA':'s/IVA', `vence ${p.vencimiento.split('-').reverse().join('/')}${venc?' — VENCIDO':''}`].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-saira font-bold text-xl text-p-ink">{moneyARS(p.total)}</p>
                    {(usdBlue||usdMep) && <p className="font-mono text-xs text-p-dark">{usdBlue}{usdMep}</p>}
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap mt-3 pt-3 border-t border-p-line2">
                  {p.telefono && (
                    <a href={`https://wa.me/${(p.telefono??'').replace(/[^0-9]/g,'')}?text=${encodeURIComponent(waMsg(p))}`}
                      target="_blank" rel="noopener noreferrer"
                      className="text-xs font-bold bg-[#25d366] text-white px-3 py-1.5 rounded-lg">WhatsApp</a>
                  )}
                  <button onClick={()=>printPresu(p)} style={btnSm}>Imprimir</button>
                  <button onClick={()=>toOS(p)} style={{...btnSm,background:'#1d4ed8'}}>→ Generar OS</button>
                  <button onClick={()=>del(p.id)} style={btnRed}>Borrar</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Modal open={open} onClose={()=>setOpen(false)} title="Nuevo presupuesto">
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Cliente"><Input value={form.cli} onChange={e=>setForm(p=>({...p,cli:e.target.value}))} placeholder="Nombre" /></Field>
            <Field label="WhatsApp"><Input value={form.tel} onChange={e=>setForm(p=>({...p,tel:e.target.value}))} placeholder="54 9 …" /></Field>
          </div>
          <Field label="Vehículo"><Input value={form.veh} onChange={e=>setForm(p=>({...p,veh:e.target.value}))} placeholder="VW Gol 2015" /></Field>

          {/* Búsqueda en catálogo */}
          <div>
            <label className="block text-[11px] font-semibold text-p-ink2 uppercase tracking-wider mb-1">Buscar vidrio en catálogo</label>
            <div className="relative">
              <Input value={catQ} onChange={e=>setCatQ(e.target.value)} placeholder="Escribí modelo o marca…" />
              {catHits.length>0 && (
                <div className="absolute z-20 top-full left-0 right-0 bg-white border border-p-line rounded-xl shadow-xl max-h-52 overflow-y-auto mt-1">
                  {catHits.map(h=>(
                    <button key={h.id} onClick={()=>pickCat(h)}
                      className="w-full text-left px-3 py-2.5 text-sm hover:bg-p-light border-b border-p-line2 last:border-0 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-p-ink truncate">{h.descripcion}</p>
                        <p className="text-[10px] text-p-ink2">{h.proveedor}</p>
                      </div>
                      <span className="font-mono font-bold text-sm text-p-dark shrink-0">{moneyARS(h.costo_neto)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Rubros rápidos */}
          <div>
            <label className="block text-[11px] font-semibold text-p-ink2 uppercase tracking-wider mb-1.5">Rubros rápidos</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {PRESU_PRESETS.map(r=>(
                <button key={r} onClick={()=>setItem(p=>({...p,d:r}))}
                  className="text-xs border border-p-line rounded-full px-2.5 py-1 hover:bg-p-light text-p-ink2">+ {r}</button>
              ))}
            </div>
            <div className="grid grid-cols-5 gap-2">
              <div className="col-span-2"><Field label="Ítem"><Input value={item.d} onChange={e=>setItem(p=>({...p,d:e.target.value}))} placeholder="Descripción" /></Field></div>
              <Field label="Cant."><Input type="number" value={item.c} onChange={e=>setItem(p=>({...p,c:e.target.value}))} min="1" /></Field>
              <div className="col-span-2"><Field label="Precio neto"><Input value={item.p} onChange={e=>setItem(p=>({...p,p:e.target.value}))} placeholder="$" /></Field></div>
            </div>
            <button onClick={addItem} style={{...btnSm,background:'#6b7280',width:'100%',marginTop:8}}>+ Agregar ítem</button>
          </div>

          {/* Items cargados */}
          {items.length>0 && (
            <div className="border-t border-p-line2 pt-2">
              {items.map((it,i)=>(
                <div key={i} className="flex items-center justify-between py-1.5 border-b border-p-line2 text-sm">
                  <span className="text-p-ink">{it.d} {it.c>1?`(×${it.c})`:''}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-p-ink">{moneyARS(it.c*it.p)}</span>
                    <button onClick={()=>setItems(prev=>prev.filter((_,j)=>j!==i))} className="text-red-400 hover:text-red-600 text-xs">✕</button>
                  </div>
                </div>
              ))}
              <label className="flex items-center gap-2 mt-2 text-sm cursor-pointer">
                <input type="checkbox" checked={ivaOn} onChange={e=>setIvaOn(e.target.checked)} className="accent-p-green" />
                Sumar IVA 21%
              </label>
              <div className="bg-p-light rounded-lg p-3 mt-2 text-sm">
                <div className="flex justify-between text-p-ink2"><span>Subtotal neto</span><span className="font-mono">{moneyARS(neto)}</span></div>
                {ivaOn && <div className="flex justify-between text-p-ink2"><span>IVA 21%</span><span className="font-mono">{moneyARS(iva)}</span></div>}
                <div className="flex justify-between font-saira font-bold text-p-ink text-lg border-t border-p-line mt-1 pt-1"><span>TOTAL</span><span>{moneyARS(total)}</span></div>
                {cotiz?.blue && <p className="font-mono text-xs text-p-dark mt-1 text-right">≈ US${Math.round(total/cotiz.blue).toLocaleString('es-AR')} blue{cotiz?.mep?` · US$${Math.round(total/cotiz.mep).toLocaleString('es-AR')} MEP`:''}</p>}
              </div>
            </div>
          )}

          <div className="flex justify-between items-center pt-1">
            <Field label="Válido por">
              <div className="flex items-center gap-1">
                <Input type="number" value={form.dias} onChange={e=>setForm(p=>({...p,dias:e.target.value}))} className="w-16" min="1" />
                <span className="text-sm text-p-ink2">días</span>
              </div>
            </Field>
            <div className="flex gap-2">
              <button onClick={()=>setOpen(false)} style={btnGray}>Cancelar</button>
              <button onClick={save} style={btn}>Guardar</button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  )
}
