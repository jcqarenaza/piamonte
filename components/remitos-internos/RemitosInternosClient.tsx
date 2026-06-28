'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Modal, Field, Input, Select, Empty } from '@/components/ui'
import { moneyARS } from '@/lib/utils/format'

const btn     = { background:'#00A550',color:'#fff',border:'none',borderRadius:10,padding:'10px 20px',fontWeight:700,fontSize:14,cursor:'pointer' } as const
const btnSm   = { ...btn, padding:'6px 14px', fontSize:12 } as const
const btnGray = { ...btnSm, background:'#6b7280' } as const
const btnBlue = { ...btnSm, background:'#1d4ed8' } as const

interface Deposito { id:string; nombre:string; es_principal:boolean }
interface StockItem { id:string; descripcion:string; codigo:string|null }
interface Remito { id:string; numero:string|null; fecha:string; estado:string; items:any[]; notas:string|null; created_at:string; deposito_origen_id:string; deposito_destino_id:string }

export default function RemitosInternosClient() {
  const [depositos, setDepositos]   = useState<Deposito[]>([])
  const [stockItems, setStockItems] = useState<StockItem[]>([])
  const [remitos, setRemitos]       = useState<Remito[]>([])
  const [open, setOpen]             = useState(false)
  const [loading, setLoading]       = useState(true)
  const [confirmando, setConfirmando] = useState<string|null>(null)
  const [expandido, setExpandido] = useState<string|null>(null)
  const [form, setForm] = useState({ origen:'', destino:'', fecha:'', notas:'' })
  const [items, setItems] = useState<{stock_id:string;descripcion:string;cantidad:number}[]>([])
  const [itemForm, setItemForm] = useState({ stock_id:'', cantidad:'1' })
  const [stockQ, setStockQ] = useState('')
  const [stockSugs, setStockSugs] = useState<StockItem[]>([])
  const supabase = createClient()

  async function load() {
    setLoading(true)
    const [d, r] = await Promise.all([
      supabase.from('depositos').select('*').eq('activo',true).order('es_principal',{ascending:false}),
      supabase.from('remitos_internos').select('*').order('created_at',{ascending:false}).limit(100),
    ])
    setDepositos(d.data??[])
    setRemitos(r.data??[])
    setLoading(false)
  }

  useEffect(()=>{
    load()
    supabase.from('stock').select('id,descripcion,codigo').eq('activo',true).order('descripcion').limit(500)
      .then(({data})=>setStockItems(data??[]))
  },[supabase])

  useEffect(()=>{
    if(stockQ.length<2){ setStockSugs([]); return }
    setStockSugs(stockItems.filter(s=>(s.descripcion+' '+(s.codigo||'')).toLowerCase().includes(stockQ.toLowerCase())).slice(0,6))
  },[stockQ,stockItems])

  function addItem() {
    const s = stockItems.find(x=>x.id===itemForm.stock_id)
    if(!s||!+itemForm.cantidad) return
    setItems(prev=>[...prev,{stock_id:s.id,descripcion:s.descripcion,cantidad:+itemForm.cantidad}])
    setItemForm({stock_id:'',cantidad:'1'}); setStockQ('')
  }

  async function save() {
    if(!form.origen||!form.destino||!items.length) return
    const { data } = await supabase.from('remitos_internos').insert({
      numero: 'RI-' + String(Date.now()).slice(-6),
      fecha: form.fecha||new Date().toISOString().slice(0,10),
      deposito_origen_id: form.origen,
      deposito_destino_id: form.destino,
      items, estado:'pendiente', notas:form.notas||null
    }).select().single()
    setOpen(false); setForm({origen:'',destino:'',fecha:'',notas:''}); setItems([])
    load()
  }

  async function confirmar(id:string) {
    setConfirmando(id)
    await supabase.from('remitos_internos').update({estado:'confirmado',confirmado_at:new Date().toISOString()}).eq('id',id)
    setConfirmando(null); load()
  }

  async function anular(id:string) {
    if(!confirm('¿Anular este remito?')) return
    await supabase.from('remitos_internos').update({estado:'anulado'}).eq('id',id)
    load()
  }

  const getDepoNombre = (id:string) => depositos.find(d=>d.id===id)?.nombre||'—'
  const soloUnDepo = depositos.length <= 1

  return (
    <div>
      {soloUnDepo && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5 flex items-center gap-3">
          <span className="text-2xl">🏭</span>
          <div>
            <p className="font-bold text-amber-800 text-sm">Solo hay un depósito activo</p>
            <p className="text-xs text-amber-700 mt-0.5">Los remitos internos se usan para mover stock entre depósitos. Cuando agregues un segundo depósito en ARCHIVOS → Depósitos, podés crear remitos aquí.</p>
          </div>
        </div>
      )}

      <div className="flex justify-end mb-4">
        <button onClick={()=>setOpen(true)} disabled={soloUnDepo}
          style={{...btn,opacity:soloUnDepo?.4:1,cursor:soloUnDepo?'not-allowed':'pointer'}}>
          + Nuevo remito interno
        </button>
      </div>

      {loading ? <p className="text-sm text-p-gray text-center py-10">Cargando…</p> :
       remitos.length===0 ? <Empty msg="Sin remitos internos." /> : (
        <div className="flex flex-col gap-2">
          {remitos.map(r=>(
            <div key={r.id} onClick={()=>setExpandido(e=>e===r.id?null:r.id)} title="Click para ver ítems y acciones"
              className={`bg-white border border-p-line rounded-xl shadow-sm cursor-pointer hover:border-p-green transition-colors overflow-hidden ${r.estado==='anulado'?'opacity-50':''}`}>
              <div className="flex items-center gap-2.5 px-3.5 py-2.5 flex-wrap">
                <span className="font-mono font-bold text-p-dark shrink-0">{r.numero||'S/N'}</span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                  r.estado==='confirmado'?'bg-green-100 text-green-700':
                  r.estado==='anulado'?'bg-gray-100 text-gray-500':'bg-amber-100 text-amber-700'
                }`}>{r.estado}</span>
                <span className="text-xs text-p-ink2 shrink-0">{r.fecha?.split('-').reverse().join('/')}</span>
                <span className="text-sm font-semibold text-p-ink shrink-0">{getDepoNombre(r.deposito_origen_id)}</span>
                <span className="text-p-ink2 shrink-0">→</span>
                <span className="text-sm font-semibold text-p-ink shrink-0">{getDepoNombre(r.deposito_destino_id)}</span>
                <span className="text-xs text-p-ink2 shrink-0">{(r.items||[]).length} ítem(s)</span>
                <div className="flex-1 min-w-[8px]"/>
              </div>

              {expandido===r.id && (
                <div onClick={e=>e.stopPropagation()} className="px-3.5 pb-3 pt-2 border-t border-p-line2 bg-p-light/30">
                  <div className="flex gap-1 flex-wrap mb-2.5">
                    {(r.items||[]).map((it:any,i:number)=>(
                      <span key={i} className="text-[11px] bg-white border border-p-line text-p-dark px-2 py-0.5 rounded-full">
                        {it.descripcion} ×{it.cantidad}
                      </span>
                    ))}
                  </div>
                  {r.estado==='pendiente' && (
                    <div className="flex gap-2">
                      <button onClick={()=>confirmar(r.id)} disabled={confirmando===r.id}
                        style={{...btnSm,background:'#00A550',opacity:confirmando===r.id?.7:1}}>
                        {confirmando===r.id?'Procesando…':'✓ Confirmar'}
                      </button>
                      <button onClick={()=>anular(r.id)} style={{...btnSm,background:'#ef4444'}}>✕ Anular</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal open={open} onClose={()=>setOpen(false)} title="Nuevo remito interno">
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Depósito origen *">
              <Select value={form.origen} onChange={e=>setForm(p=>({...p,origen:e.target.value}))}>
                <option value="">Seleccionar…</option>
                {depositos.map(d=><option key={d.id} value={d.id}>{d.nombre}</option>)}
              </Select>
            </Field>
            <Field label="Depósito destino *">
              <Select value={form.destino} onChange={e=>setForm(p=>({...p,destino:e.target.value}))}>
                <option value="">Seleccionar…</option>
                {depositos.filter(d=>d.id!==form.origen).map(d=><option key={d.id} value={d.id}>{d.nombre}</option>)}
              </Select>
            </Field>
          </div>
          <Field label="Fecha">
            <Input type="date" value={form.fecha} onChange={e=>setForm(p=>({...p,fecha:e.target.value}))}/>
          </Field>

          {/* Ítems */}
          <div className="border-t border-p-line2 pt-3">
            <label className="block text-[11px] font-semibold text-p-ink2 uppercase tracking-wider mb-2">Artículos a transferir</label>
            <div className="relative mb-2">
              <input value={stockQ} onChange={e=>setStockQ(e.target.value)}
                placeholder="Buscar artículo por código o descripción…"
                className="w-full border border-p-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-p-green"/>
              {stockSugs.length>0&&(
                <div className="absolute z-10 w-full bg-white border border-p-line rounded-xl shadow-lg mt-1 overflow-hidden">
                  {stockSugs.map(s=>(
                    <button key={s.id} onClick={()=>{setItemForm(p=>({...p,stock_id:s.id}));setStockQ(s.descripcion);setStockSugs([])}}
                      className="w-full text-left px-3 py-2 hover:bg-p-light text-sm border-b border-p-line2 last:border-0">
                      {s.codigo&&<span className="font-mono text-[10px] bg-p-light px-1 rounded mr-2">{s.codigo}</span>}
                      {s.descripcion}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-2 mb-3">
              <Input type="number" value={itemForm.cantidad} onChange={e=>setItemForm(p=>({...p,cantidad:e.target.value}))} placeholder="Cant." />
              <button onClick={addItem} style={{...btnSm,flexShrink:0}} disabled={!itemForm.stock_id}>+ Agregar</button>
            </div>
            {items.map((it,i)=>(
              <div key={i} className="flex items-center gap-2 py-1.5 border-b border-p-line2 text-sm">
                <span className="flex-1 truncate">{it.descripcion}</span>
                <span className="font-bold text-p-dark">×{it.cantidad}</span>
                <button onClick={()=>setItems(prev=>prev.filter((_,j)=>j!==i))} className="text-red-400 text-xs">✕</button>
              </div>
            ))}
          </div>

          <Field label="Notas">
            <Input value={form.notas} onChange={e=>setForm(p=>({...p,notas:e.target.value}))} placeholder="Motivo del traslado…"/>
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={()=>setOpen(false)} style={btnGray}>Cancelar</button>
            <button onClick={save} disabled={!form.origen||!form.destino||!items.length}
              style={{...btn,opacity:(!form.origen||!form.destino||!items.length)?.5:1}}>
              Crear remito
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
