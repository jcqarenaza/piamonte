'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Modal, Field, Input, Select, Empty } from '@/components/ui'
import { moneyARS, todayStr } from '@/lib/utils/format'

const IVA = 0.21
const btn     = { background:'#00A550',color:'#fff',border:'none',borderRadius:10,padding:'10px 20px',fontWeight:700,fontSize:14,cursor:'pointer' } as const
const btnSm   = { ...btn, padding:'6px 14px', fontSize:13 } as const
const btnGray = { ...btnSm, background:'#6b7280' } as const
const btnRed  = { ...btnSm, background:'#ef4444' } as const

const TIPOS = [
  { id:'factura',   label:'Factura',        icon:'🧾' },
  { id:'remito',    label:'Remito',          icon:'📦' },
  { id:'nc',        label:'Nota de Crédito', icon:'↩' },
  { id:'nd',        label:'Nota de Débito',  icon:'↗' },
]
const LETRAS = ['A','B','C','E','M','X']
const TIPO_COLOR: Record<string,string> = {
  factura:'#1d4ed8', remito:'#00A550', nc:'#d97706', nd:'#7c3aed'
}

interface Proveedor { id:string; nombre:string; razon_social:string|null }
interface Item { d:string; c:number; p:number }
interface Comprobante {
  id:string; tipo:string; letra:string|null; punto_venta:string|null; numero:string|null
  fecha:string; proveedor_id:string|null; proveedor_nombre:string|null
  items:Item[]; neto:number; iva:number; total:number
  estado:string; afecta_stock:boolean; notas:string|null; created_at:string
}

export default function ComprasClient() {
  const [comprobantes, setComprobantes] = useState<Comprobante[]>([])
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [filtroTipo, setFiltroTipo] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('')
  const [ivaOn, setIvaOn] = useState(true)

  const [form, setForm] = useState({
    tipo:'factura', letra:'A', punto_venta:'0001', numero:'', fecha:todayStr(),
    proveedor_id:'', proveedor_nombre:'', notas:'', afecta_stock:false
  })
  const [items, setItems] = useState<Item[]>([])
  const [itemForm, setItemForm] = useState({ d:'', c:'1', p:'' })

  const supabase = createClient()

  const neto  = items.reduce((a,i)=>a+i.c*i.p, 0)
  const iva   = ivaOn ? Math.round(neto*IVA) : 0
  const total = neto + iva

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('comprobantes_compra')
      .select('*').order('fecha', {ascending:false}).order('created_at',{ascending:false}).limit(200)
    setComprobantes(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
    supabase.from('proveedores_compra').select('id,nombre,razon_social').eq('activo',true).order('nombre')
      .then(({data})=>setProveedores(data??[]))
  }, [supabase])

  function addItem() {
    const p = parseFloat(itemForm.p.replace(/[^0-9.]/g,''))
    const c = parseInt(itemForm.c)
    if (!itemForm.d || !p || !c) return
    setItems(prev=>[...prev, {d:itemForm.d, c, p}])
    setItemForm({d:'',c:'1',p:''})
  }

  async function save() {
    if (!items.length && total === 0) return
    const prov = proveedores.find(p=>p.id===form.proveedor_id)
    await supabase.from('comprobantes_compra').insert({
      tipo: form.tipo, letra: form.letra||null,
      punto_venta: form.punto_venta||null, numero: form.numero||null,
      fecha: form.fecha, proveedor_id: form.proveedor_id||null,
      proveedor_nombre: prov?.nombre || form.proveedor_nombre || null,
      items, neto, iva_pct: IVA, iva, total,
      estado: 'pendiente', afecta_stock: form.afecta_stock, notas: form.notas||null,
    })
    setOpen(false)
    setForm({tipo:'factura',letra:'A',punto_venta:'0001',numero:'',fecha:todayStr(),
      proveedor_id:'',proveedor_nombre:'',notas:'',afecta_stock:false})
    setItems([]); setIvaOn(true)
    load()
  }

  async function procesarRemito(id:string) {
    // Marcar como procesado — en Fase 2 aquí irá el ajuste de stock
    await supabase.from('comprobantes_compra').update({estado:'procesado'}).eq('id',id)
    load()
  }

  async function anular(id:string) {
    if (!confirm('¿Anular este comprobante?')) return
    await supabase.from('comprobantes_compra').update({estado:'anulado'}).eq('id',id)
    load()
  }

  const filtrados = comprobantes.filter(c =>
    (!filtroTipo || c.tipo === filtroTipo) &&
    (!filtroEstado || c.estado === filtroEstado)
  )

  // Totales del mes actual
  const mes = new Date().toISOString().slice(0,7)
  const totalMes = comprobantes.filter(c=>c.fecha.startsWith(mes)&&c.estado!=='anulado'&&c.tipo==='factura')
    .reduce((a,c)=>a+c.total,0)

  const tipoLabel = (tipo:string) => TIPOS.find(t=>t.id===tipo)?.label || tipo
  const tipoIcon  = (tipo:string) => TIPOS.find(t=>t.id===tipo)?.icon || '📄'
  const numComp   = (c:Comprobante) => c.tipo==='remito' ? `REM-${c.numero||'S/N'}` :
    c.tipo==='nc' ? `NC ${c.letra||''}-${c.punto_venta||''}-${c.numero||''}` :
    c.tipo==='nd' ? `ND ${c.letra||''}-${c.punto_venta||''}-${c.numero||''}` :
    `${c.letra||''}${c.punto_venta ? ' '+c.punto_venta : ''}-${c.numero||'S/N'}`

  return (
    <div>
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <div className="bg-white border border-p-line rounded-xl p-4 shadow-sm">
          <p className="text-[11px] font-semibold text-p-ink2 uppercase tracking-wider">Compras del mes</p>
          <p className="font-saira font-bold text-xl text-p-ink mt-1">{moneyARS(totalMes)}</p>
        </div>
        <div className="bg-white border border-p-line rounded-xl p-4 shadow-sm">
          <p className="text-[11px] font-semibold text-p-ink2 uppercase tracking-wider">Facturas</p>
          <p className="font-saira font-bold text-xl text-p-ink mt-1">{comprobantes.filter(c=>c.tipo==='factura'&&c.estado!=='anulado').length}</p>
        </div>
        <div className="bg-white border border-p-line rounded-xl p-4 shadow-sm">
          <p className="text-[11px] font-semibold text-p-ink2 uppercase tracking-wider">Remitos pendientes</p>
          <p className="font-saira font-bold text-xl text-amber-600 mt-1">{comprobantes.filter(c=>c.tipo==='remito'&&c.estado==='pendiente').length}</p>
        </div>
        <div className="bg-white border border-p-line rounded-xl p-4 shadow-sm">
          <p className="text-[11px] font-semibold text-p-ink2 uppercase tracking-wider">NC / ND</p>
          <p className="font-saira font-bold text-xl text-purple-600 mt-1">{comprobantes.filter(c=>['nc','nd'].includes(c.tipo)&&c.estado!=='anulado').length}</p>
        </div>
      </div>

      {/* Filtros + botón */}
      <div className="flex gap-2 flex-wrap mb-5 items-center">
        <select value={filtroTipo} onChange={e=>setFiltroTipo(e.target.value)}
          className="border border-p-line rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-p-green shadow-sm">
          <option value="">Todos los tipos</option>
          {TIPOS.map(t=><option key={t.id} value={t.id}>{t.icon} {t.label}</option>)}
        </select>
        <select value={filtroEstado} onChange={e=>setFiltroEstado(e.target.value)}
          className="border border-p-line rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-p-green shadow-sm">
          <option value="">Todos los estados</option>
          <option value="pendiente">Pendiente</option>
          <option value="procesado">Procesado</option>
          <option value="anulado">Anulado</option>
        </select>
        <span className="text-sm text-p-ink2 ml-1">{filtrados.length} comprobantes</span>
        <div className="ml-auto">
          <button onClick={()=>setOpen(true)} style={btn}>+ Cargar comprobante</button>
        </div>
      </div>

      {/* Listado */}
      {loading ? <p className="text-sm text-p-gray text-center py-10">Cargando…</p> :
       filtrados.length === 0 ? <Empty msg="Sin comprobantes de compra." /> : (
        <div className="flex flex-col gap-2">
          {filtrados.map(c=>(
            <div key={c.id} className={`bg-white border border-p-line rounded-xl p-4 shadow-sm ${c.estado==='anulado'?'opacity-50':''}`}>
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-[10px] font-bold px-2.5 py-1 rounded-full text-white shrink-0"
                    style={{background:TIPO_COLOR[c.tipo]||'#6b7280'}}>
                    {tipoIcon(c.tipo)} {tipoLabel(c.tipo)}
                  </span>
                  <span className="font-mono font-bold text-sm text-p-dark">{numComp(c)}</span>
                  <span className="text-sm font-semibold text-p-ink">{c.proveedor_nombre||'Sin proveedor'}</span>
                  <span className="text-xs text-p-ink2">{c.fecha.split('-').reverse().join('/')}</span>
                </div>
                <div className="text-right">
                  <p className="font-saira font-bold text-lg text-p-ink">{moneyARS(c.total)}</p>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    c.estado==='procesado'?'bg-green-100 text-green-700':
                    c.estado==='anulado'?'bg-gray-100 text-gray-500':'bg-amber-100 text-amber-700'
                  }`}>{c.estado}</span>
                </div>
              </div>
              {/* Items */}
              {c.items?.length > 0 && (
                <div className="mt-2 pt-2 border-t border-p-line2">
                  <div className="flex flex-wrap gap-1">
                    {c.items.slice(0,3).map((it,i)=>(
                      <span key={i} className="text-[11px] bg-p-light text-p-dark px-2 py-0.5 rounded-full">
                        {it.d} ×{it.c}
                      </span>
                    ))}
                    {c.items.length>3&&<span className="text-[11px] text-p-ink2">+{c.items.length-3} más</span>}
                  </div>
                </div>
              )}
              {/* Acciones */}
              <div className="flex gap-2 mt-3 pt-2 border-t border-p-line2 flex-wrap">
                {c.tipo==='remito' && c.estado==='pendiente' && (
                  <button onClick={()=>procesarRemito(c.id)}
                    style={{...btnSm,background:'#00A550'}}>
                    📦 Marcar recibido
                  </button>
                )}
                {c.estado==='pendiente' && (
                  <button onClick={()=>anular(c.id)} style={btnRed}>✕ Anular</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal nuevo comprobante */}
      <Modal open={open} onClose={()=>setOpen(false)} title="Cargar comprobante de compra">
        <div className="flex flex-col gap-3 max-h-[80vh] overflow-y-auto pr-1">
          {/* Tipo */}
          <div>
            <label className="block text-[11px] font-semibold text-p-ink2 uppercase tracking-wider mb-2">Tipo</label>
            <div className="flex gap-2 flex-wrap">
              {TIPOS.map(t=>(
                <button key={t.id} onClick={()=>setForm(p=>({...p,tipo:t.id}))}
                  style={{background:form.tipo===t.id?TIPO_COLOR[t.id]:'#fff',color:form.tipo===t.id?'#fff':'#4A6655',border:`1.5px solid ${form.tipo===t.id?TIPO_COLOR[t.id]:'#C2DDD0'}`,borderRadius:8,padding:'7px 16px',fontWeight:700,fontSize:13,cursor:'pointer'}}>
                  {t.icon} {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Número */}
          {form.tipo !== 'remito' && (
            <div className="grid grid-cols-3 gap-2">
              <Field label="Letra">
                <Select value={form.letra} onChange={e=>setForm(p=>({...p,letra:e.target.value}))}>
                  {LETRAS.map(l=><option key={l} value={l}>{l}</option>)}
                </Select>
              </Field>
              <Field label="Punto de venta">
                <Input value={form.punto_venta} onChange={e=>setForm(p=>({...p,punto_venta:e.target.value}))} placeholder="0001"/>
              </Field>
              <Field label="Número">
                <Input value={form.numero} onChange={e=>setForm(p=>({...p,numero:e.target.value}))} placeholder="00001234"/>
              </Field>
            </div>
          )}
          {form.tipo === 'remito' && (
            <Field label="N° Remito">
              <Input value={form.numero} onChange={e=>setForm(p=>({...p,numero:e.target.value}))} placeholder="R-001234"/>
            </Field>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Fecha">
              <Input type="date" value={form.fecha} onChange={e=>setForm(p=>({...p,fecha:e.target.value}))}/>
            </Field>
            <Field label="Proveedor">
              <Select value={form.proveedor_id} onChange={e=>setForm(p=>({...p,proveedor_id:e.target.value}))}>
                <option value="">Seleccionar…</option>
                {proveedores.map(p=><option key={p.id} value={p.id}>{p.nombre}</option>)}
              </Select>
            </Field>
          </div>

          {/* Ítems */}
          <div className="border-t border-p-line2 pt-3">
            <label className="block text-[11px] font-semibold text-p-ink2 uppercase tracking-wider mb-2">Ítems</label>
            <div className="grid grid-cols-12 gap-2 mb-2">
              <div className="col-span-6">
                <Input value={itemForm.d} onChange={e=>setItemForm(p=>({...p,d:e.target.value}))} placeholder="Descripción / código"/>
              </div>
              <div className="col-span-2">
                <Input type="number" value={itemForm.c} onChange={e=>setItemForm(p=>({...p,c:e.target.value}))} placeholder="Cant."/>
              </div>
              <div className="col-span-3">
                <Input value={itemForm.p} onChange={e=>setItemForm(p=>({...p,p:e.target.value}))} placeholder="$ precio unit."/>
              </div>
              <button onClick={addItem} style={{...btnSm,padding:'9px 8px',fontSize:12}} className="col-span-1">+</button>
            </div>
            {items.map((it,i)=>(
              <div key={i} className="flex items-center gap-2 py-1.5 border-b border-p-line2 text-sm">
                <span className="flex-1 truncate">{it.d}</span>
                <span className="text-p-ink2 shrink-0">×{it.c}</span>
                <span className="font-mono font-bold shrink-0">{moneyARS(it.p)}</span>
                <span className="font-mono text-p-green font-bold shrink-0">{moneyARS(it.c*it.p)}</span>
                <button onClick={()=>setItems(prev=>prev.filter((_,j)=>j!==i))} className="text-red-400 text-xs shrink-0">✕</button>
              </div>
            ))}
          </div>

          {/* Totales */}
          <div className="bg-p-light rounded-xl p-3">
            <label className="flex items-center gap-2 mb-2 text-sm cursor-pointer">
              <input type="checkbox" checked={ivaOn} onChange={e=>setIvaOn(e.target.checked)} className="accent-p-green"/>
              Incluir IVA 21%
            </label>
            {ivaOn && <div className="flex justify-between text-sm text-p-ink2"><span>Subtotal</span><span className="font-mono">{moneyARS(neto)}</span></div>}
            {ivaOn && <div className="flex justify-between text-sm text-p-ink2"><span>IVA 21%</span><span className="font-mono">{moneyARS(iva)}</span></div>}
            <div className="flex justify-between font-saira font-bold text-lg border-t border-p-line mt-1 pt-1">
              <span>TOTAL</span><span>{moneyARS(total)}</span>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={form.afecta_stock} onChange={e=>setForm(p=>({...p,afecta_stock:e.target.checked}))} className="accent-p-green"/>
            Este comprobante afecta el stock (remito con mercadería)
          </label>

          <Field label="Notas">
            <Input value={form.notas} onChange={e=>setForm(p=>({...p,notas:e.target.value}))} placeholder="Observaciones…"/>
          </Field>

          <div className="flex justify-end gap-2 pt-1">
            <button onClick={()=>setOpen(false)} style={btnGray}>Cancelar</button>
            <button onClick={save} style={btn}>✓ Guardar</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
