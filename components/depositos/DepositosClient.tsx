'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Modal, Field, Input, Empty } from '@/components/ui'
import { moneyARS } from '@/lib/utils/format'

const btn   = { background:'#00A550',color:'#fff',border:'none',borderRadius:10,padding:'10px 20px',fontWeight:700,fontSize:14,cursor:'pointer' } as const
const btnSm = { ...btn, padding:'6px 14px', fontSize:12 } as const
const btnGray = { ...btnSm, background:'#6b7280' } as const

interface Deposito {
  id:string; nombre:string; descripcion:string|null; direccion:string|null
  activo:boolean; es_principal:boolean; created_at:string
}
interface StockDepo { descripcion:string; codigo:string|null; cantidad:number; precio_venta:number|null }

export default function DepositosClient() {
  const [depositos, setDepositos] = useState<Deposito[]>([])
  const [sel, setSel]             = useState<Deposito|null>(null)
  const [stockDepo, setStockDepo] = useState<StockDepo[]>([])
  const [open, setOpen]           = useState(false)
  const [editId, setEditId]       = useState<string|null>(null)
  const [form, setForm]           = useState({ nombre:'', descripcion:'', direccion:'' })
  const [loadingStock, setLoadingStock] = useState(false)
  const supabase = createClient()

  async function load() {
    const { data } = await supabase.from('depositos').select('*').eq('activo',true).order('es_principal',{ascending:false}).order('nombre')
    setDepositos(data??[])
  }

  async function loadStock(depoId: string) {
    setLoadingStock(true)
    const { data } = await supabase.from('stock_depositos')
      .select('cantidad, stock(descripcion, codigo, precio_venta)')
      .eq('deposito_id', depoId).gt('cantidad', 0).order('cantidad', {ascending:false})
    setStockDepo((data??[]).map((d:any)=>({
      descripcion: d.stock?.descripcion,
      codigo: d.stock?.codigo,
      cantidad: d.cantidad,
      precio_venta: d.stock?.precio_venta,
    })))
    setLoadingStock(false)
  }

  useEffect(()=>{ load() },[supabase])
  useEffect(()=>{ if(sel) loadStock(sel.id) },[sel])

  function openNuevo() { setForm({nombre:'',descripcion:'',direccion:''}); setEditId(null); setOpen(true) }
  function openEditar(d:Deposito) {
    setForm({nombre:d.nombre,descripcion:d.descripcion||'',direccion:d.direccion||''})
    setEditId(d.id); setOpen(true)
  }

  async function save() {
    const payload = { nombre:form.nombre, descripcion:form.descripcion||null, direccion:form.direccion||null }
    if(editId) await supabase.from('depositos').update(payload).eq('id',editId)
    else       await supabase.from('depositos').insert(payload)
    setOpen(false); load()
  }

  const totalUnidades = stockDepo.reduce((a,s)=>a+s.cantidad,0)
  const totalValor    = stockDepo.reduce((a,s)=>a+(s.cantidad*(s.precio_venta||0)),0)

  return (
    <div className="flex gap-4">
      {/* Lista de depósitos */}
      <div className="flex-1 min-w-0">
        <div className="flex justify-between mb-4">
          <p className="text-sm text-p-ink2">{depositos.length} depósito(s) activo(s)</p>
          <button onClick={openNuevo} style={btn}>+ Nuevo depósito</button>
        </div>
        {depositos.length===0 ? <Empty msg="Sin depósitos." /> : (
          <div className="flex flex-col gap-3">
            {depositos.map(d=>(
              <div key={d.id} onClick={()=>setSel(sel?.id===d.id?null:d)}
                className={`bg-white border rounded-xl p-4 cursor-pointer shadow-sm transition-all ${sel?.id===d.id?'border-p-green ring-1 ring-p-green':'border-p-line hover:border-p-green/50'}`}>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-saira font-bold text-p-ink text-lg">{d.nombre}</p>
                      {d.es_principal && <span className="text-[10px] font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Principal</span>}
                    </div>
                    {d.descripcion&&<p className="text-sm text-p-ink2 mt-0.5">{d.descripcion}</p>}
                    {d.direccion&&<p className="text-xs text-p-ink2 mt-0.5">📍 {d.direccion}</p>}
                  </div>
                  <button onClick={e=>{e.stopPropagation();openEditar(d)}} style={btnGray}>✏</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Panel stock del depósito */}
      {sel && (
        <div className="w-80 shrink-0 bg-white border border-p-line rounded-2xl p-4 shadow-sm self-start sticky top-4">
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="font-saira font-bold text-p-ink text-lg">{sel.nombre}</p>
              <p className="text-xs text-p-ink2">Stock en este depósito</p>
            </div>
            <button onClick={()=>setSel(null)} className="text-p-gray text-lg">✕</button>
          </div>
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div className="bg-p-light rounded-lg p-2 text-center">
              <p className="font-saira font-bold text-xl text-p-dark">{totalUnidades}</p>
              <p className="text-[10px] text-p-ink2">unidades</p>
            </div>
            <div className="bg-p-light rounded-lg p-2 text-center">
              <p className="font-saira font-bold text-sm text-p-green">{moneyARS(totalValor)}</p>
              <p className="text-[10px] text-p-ink2">valor total</p>
            </div>
          </div>
          {loadingStock ? <p className="text-xs text-center text-p-ink2 py-4">Cargando…</p> : (
            <div className="flex flex-col gap-1 max-h-96 overflow-y-auto">
              {stockDepo.map((s,i)=>(
                <div key={i} className="flex items-center gap-2 py-1.5 border-b border-p-line2 last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-p-ink truncate">{s.descripcion}</p>
                    {s.codigo&&<p className="text-[10px] font-mono text-p-ink2">{s.codigo}</p>}
                  </div>
                  <span className="font-bold text-sm text-p-dark shrink-0">{s.cantidad}</span>
                </div>
              ))}
              {stockDepo.length===0&&<p className="text-xs text-center text-p-ink2 py-4">Sin stock en este depósito</p>}
            </div>
          )}
        </div>
      )}

      <Modal open={open} onClose={()=>setOpen(false)} title={editId?'Editar depósito':'Nuevo depósito'}>
        <div className="flex flex-col gap-3">
          <Field label="Nombre *"><Input value={form.nombre} onChange={e=>setForm(p=>({...p,nombre:e.target.value}))} placeholder="Depósito Central"/></Field>
          <Field label="Descripción"><Input value={form.descripcion} onChange={e=>setForm(p=>({...p,descripcion:e.target.value}))} placeholder="Descripción opcional"/></Field>
          <Field label="Dirección"><Input value={form.direccion} onChange={e=>setForm(p=>({...p,direccion:e.target.value}))} placeholder="Calle y número"/></Field>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={()=>setOpen(false)} style={btnGray}>Cancelar</button>
            <button onClick={save} disabled={!form.nombre} style={{...btn,opacity:!form.nombre?.5:1}}>Guardar</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
