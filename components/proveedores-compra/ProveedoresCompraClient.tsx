'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Modal, Field, Input, Select, Empty } from '@/components/ui'
import { moneyARS } from '@/lib/utils/format'

const btn     = { background:'#00A550',color:'#fff',border:'none',borderRadius:10,padding:'10px 20px',fontWeight:700,fontSize:14,cursor:'pointer' } as const
const btnSm   = { ...btn, padding:'6px 14px', fontSize:13 } as const
const btnGray = { ...btnSm, background:'#6b7280' } as const
const btnRed  = { ...btnSm, background:'#ef4444' } as const

interface Lista { id:string; nombre:string; proveedor:string }
interface Proveedor {
  id:string; nombre:string; razon_social:string|null; cuit:string|null
  condicion_iva:string|null; email:string|null; telefono:string|null
  direccion:string|null; localidad:string|null; contacto:string|null
  lista_precio_id:string|null; notas:string|null; activo:boolean
  listas_precio?: Lista
}

const COND_IVA = [
  { id:'responsable_inscripto', label:'Responsable Inscripto' },
  { id:'monotributo', label:'Monotributista' },
  { id:'exento', label:'Exento' },
]

const emptyForm = {
  nombre:'', razon_social:'', cuit:'', condicion_iva:'responsable_inscripto',
  email:'', telefono:'', direccion:'', localidad:'', contacto:'',
  lista_precio_id:'', notas:''
}

export default function ProveedoresCompraClient() {
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [listas, setListas] = useState<Lista[]>([])
  const [open, setOpen] = useState(false)
  const [editId, setEditId] = useState<string|null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')
  const [q, setQ] = useState('')
  const supabase = createClient()

  const ok = (msg:string) => { setToast(msg); setTimeout(()=>setToast(''),2500) }

  async function load() {
    const { data } = await supabase.from('proveedores_compra')
      .select('*, listas_precio(id,nombre,proveedor)')
      .eq('activo', true).order('nombre')
    setProveedores(data ?? [])
  }

  useEffect(() => {
    load()
    supabase.from('listas_precio').select('id,nombre,proveedor').order('nombre').then(({data})=>setListas(data??[]))
  }, [supabase])

  function openNuevo() { setForm(emptyForm); setEditId(null); setOpen(true) }
  function openEditar(p:Proveedor) {
    setForm({
      nombre:p.nombre, razon_social:p.razon_social||'', cuit:p.cuit||'',
      condicion_iva:p.condicion_iva||'responsable_inscripto',
      email:p.email||'', telefono:p.telefono||'', direccion:p.direccion||'',
      localidad:p.localidad||'', contacto:p.contacto||'',
      lista_precio_id:p.lista_precio_id||'', notas:p.notas||''
    })
    setEditId(p.id); setOpen(true)
  }

  async function save() {
    if (!form.nombre) return
    setSaving(true)
    const payload = {
      nombre: form.nombre, razon_social: form.razon_social||null,
      cuit: form.cuit||null, condicion_iva: form.condicion_iva||null,
      email: form.email||null, telefono: form.telefono||null,
      direccion: form.direccion||null, localidad: form.localidad||null,
      contacto: form.contacto||null,
      lista_precio_id: form.lista_precio_id||null, notas: form.notas||null,
    }
    if (editId) {
      await supabase.from('proveedores_compra').update(payload).eq('id', editId)
      ok('Proveedor actualizado ✓')
    } else {
      await supabase.from('proveedores_compra').insert(payload)
      ok('Proveedor creado ✓')
    }
    setOpen(false); setSaving(false); load()
  }

  async function eliminar(id:string, nombre:string) {
    if (!confirm(`¿Dar de baja a ${nombre}?`)) return
    await supabase.from('proveedores_compra').update({ activo: false }).eq('id', id)
    ok('Proveedor dado de baja')
    load()
  }

  const filtrados = proveedores.filter(p =>
    !q || p.nombre.toLowerCase().includes(q.toLowerCase()) ||
    (p.cuit||'').includes(q) || (p.localidad||'').toLowerCase().includes(q.toLowerCase())
  )

  return (
    <div>
      {toast && (
        <div style={{position:'fixed',bottom:96,left:'50%',transform:'translateX(-50%)',background:'#00A550',color:'#fff',padding:'10px 24px',borderRadius:12,fontWeight:700,fontSize:14,zIndex:100,boxShadow:'0 4px 16px rgba(0,0,0,.2)'}}>
          {toast}
        </div>
      )}

      <div className="flex gap-3 mb-5 flex-wrap items-center">
        <input value={q} onChange={e=>setQ(e.target.value)}
          placeholder="Buscar proveedor…"
          className="flex-1 min-w-[200px] border border-p-line rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-p-green bg-white shadow-sm"/>
        <button onClick={openNuevo} style={btn}>+ Nuevo proveedor</button>
      </div>

      {filtrados.length === 0 ? <Empty msg="Sin proveedores cargados." /> : (
        <div className="flex flex-col gap-3">
          {filtrados.map(p => (
            <div key={p.id} className="bg-white border border-p-line rounded-xl p-4 shadow-sm">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-saira font-bold text-p-ink text-lg">{p.nombre}</p>
                    {p.condicion_iva && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                        {COND_IVA.find(c=>c.id===p.condicion_iva)?.label || p.condicion_iva}
                      </span>
                    )}
                    {p.listas_precio && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                        📋 {p.listas_precio.nombre}
                      </span>
                    )}
                  </div>
                  {p.razon_social && <p className="text-sm text-p-ink2 mt-0.5">{p.razon_social}</p>}
                  <div className="flex gap-4 flex-wrap mt-1.5 text-xs text-p-ink2">
                    {p.cuit && <span>CUIT: <span className="font-mono font-bold text-p-dark">{p.cuit}</span></span>}
                    {p.telefono && <span>📞 {p.telefono}</span>}
                    {p.email && <span>✉ {p.email}</span>}
                    {p.localidad && <span>📍 {p.localidad}</span>}
                    {p.contacto && <span>👤 {p.contacto}</span>}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={()=>openEditar(p)} style={{...btnSm,background:'#6b7280'}}>✏ Editar</button>
                  <button onClick={()=>eliminar(p.id, p.nombre)} style={btnRed}>✕</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={open} onClose={()=>setOpen(false)} title={editId ? 'Editar proveedor' : 'Nuevo proveedor'}>
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nombre / Marca *">
              <Input value={form.nombre} onChange={e=>setForm(p=>({...p,nombre:e.target.value}))} placeholder="GAMMA"/>
            </Field>
            <Field label="Razón social">
              <Input value={form.razon_social} onChange={e=>setForm(p=>({...p,razon_social:e.target.value}))} placeholder="Distribuidora GAMMA S.A."/>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="CUIT">
              <Input value={form.cuit} onChange={e=>setForm(p=>({...p,cuit:e.target.value}))} placeholder="20-12345678-9"/>
            </Field>
            <Field label="Condición IVA">
              <Select value={form.condicion_iva} onChange={e=>setForm(p=>({...p,condicion_iva:e.target.value}))}>
                {COND_IVA.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Teléfono">
              <Input value={form.telefono} onChange={e=>setForm(p=>({...p,telefono:e.target.value}))} placeholder="011 5272 6317"/>
            </Field>
            <Field label="Email">
              <Input value={form.email} onChange={e=>setForm(p=>({...p,email:e.target.value}))} placeholder="ventas@gamma.com"/>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Localidad">
              <Input value={form.localidad} onChange={e=>setForm(p=>({...p,localidad:e.target.value}))} placeholder="Buenos Aires"/>
            </Field>
            <Field label="Contacto comercial">
              <Input value={form.contacto} onChange={e=>setForm(p=>({...p,contacto:e.target.value}))} placeholder="Nombre del vendedor"/>
            </Field>
          </div>
          <Field label="Dirección">
            <Input value={form.direccion} onChange={e=>setForm(p=>({...p,direccion:e.target.value}))} placeholder="Calle 1236 629, Ingeniero Allan"/>
          </Field>
          <Field label="Lista de precios vinculada">
            <Select value={form.lista_precio_id} onChange={e=>setForm(p=>({...p,lista_precio_id:e.target.value}))}>
              <option value="">Sin lista vinculada</option>
              {listas.map(l=><option key={l.id} value={l.id}>{l.proveedor} — {l.nombre}</option>)}
            </Select>
          </Field>
          <Field label="Notas">
            <Input value={form.notas} onChange={e=>setForm(p=>({...p,notas:e.target.value}))} placeholder="Condiciones de pago, días de entrega…"/>
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={()=>setOpen(false)} style={btnGray}>Cancelar</button>
            <button onClick={save} disabled={saving||!form.nombre} style={{...btn,opacity:saving||!form.nombre?.5:1}}>
              {saving?'Guardando…':'Guardar'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
