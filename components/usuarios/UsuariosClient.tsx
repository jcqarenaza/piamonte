'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Modal, Field, Input, Select, Empty } from '@/components/ui'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const btn     = { background:'#00A550',color:'#fff',border:'none',borderRadius:8,padding:'8px 16px',fontWeight:700,fontSize:13,cursor:'pointer' } as const
const btnGray = { ...btn,background:'#6b7280' } as const
const btnRed  = { ...btn,background:'#ef4444' } as const

const ROLES = [
  { id:'gerencial', label:'Gerencial — acceso total' },
  { id:'admin',     label:'Administrador — operación completa' },
  { id:'ventas',    label:'Ventas — sin ver costos ni proveedores' },
  { id:'caja',      label:'Caja — ventas y compras en efectivo' },
]
const ROL_COLOR: Record<string,string> = { gerencial:'#7c3aed', admin:'#2563eb', ventas:'#059669', caja:'#d97706' }

interface Usuario { id:string; nombre:string; rol:string; email?:string }
interface ConfigPrecios { recargo_tarjeta_pct:number; descuento_transferencia_pct:number; descuento_efectivo_pct:number }

function ConfigPreciosPanel() {
  const supabase = createClient()
  const [cfg, setCfg] = useState<ConfigPrecios>({ recargo_tarjeta_pct:35, descuento_transferencia_pct:15, descuento_efectivo_pct:25 })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    supabase.from('config_precios').select('*').eq('id',1).maybeSingle()
      .then(({data}) => { if(data) setCfg(data) })
  }, [supabase])

  async function guardar() {
    setSaving(true)
    await supabase.from('config_precios').update({
      recargo_tarjeta_pct: cfg.recargo_tarjeta_pct,
      descuento_transferencia_pct: cfg.descuento_transferencia_pct,
      descuento_efectivo_pct: cfg.descuento_efectivo_pct,
      updated_at: new Date().toISOString()
    }).eq('id', 1)
    setSaving(false); setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  // Ejemplo con costo de $100 y margen 45%
  const costo = 100, margen = 0.45
  const tarjeta = Math.round(costo * (1+margen) * (1 + cfg.recargo_tarjeta_pct/100))
  const transf  = Math.round(tarjeta * (1 - cfg.descuento_transferencia_pct/100))
  const efect   = Math.round(tarjeta * (1 - cfg.descuento_efectivo_pct/100))

  return (
    <div className="bg-white border border-p-line rounded-2xl shadow-sm p-6 mb-6">
      <h3 className="font-saira font-bold text-p-ink text-lg mb-4">💰 Configuración de precios</h3>
      <div className="grid grid-cols-3 gap-4 mb-4">
        <Field label="Recargo tarjeta (%)">
          <Input type="number" value={cfg.recargo_tarjeta_pct}
            onChange={e=>setCfg(p=>({...p,recargo_tarjeta_pct:+e.target.value}))}/>
        </Field>
        <Field label="Descuento transferencia (%)">
          <Input type="number" value={cfg.descuento_transferencia_pct}
            onChange={e=>setCfg(p=>({...p,descuento_transferencia_pct:+e.target.value}))}/>
        </Field>
        <Field label="Descuento efectivo (%)">
          <Input type="number" value={cfg.descuento_efectivo_pct}
            onChange={e=>setCfg(p=>({...p,descuento_efectivo_pct:+e.target.value}))}/>
        </Field>
      </div>
      {/* Preview con costo $100 margen 45% */}
      <div className="bg-p-light rounded-xl p-4 mb-4 text-sm">
        <p className="text-xs text-p-ink2 uppercase font-bold tracking-wider mb-2">Preview — costo $100, margen 45%</p>
        <div className="flex gap-6">
          <div><span className="text-p-ink2">💳 Tarjeta</span> <span className="font-bold text-p-dark">${tarjeta}</span></div>
          <div><span className="text-p-ink2">🏦 Transferencia</span> <span className="font-bold text-blue-600">${transf}</span></div>
          <div><span className="text-p-ink2">💵 Efectivo</span> <span className="font-bold text-green-700">${efect}</span></div>
        </div>
      </div>
      <button onClick={guardar} disabled={saving}
        style={{...btn, opacity: saving?.7:1}}>
        {saved ? '✓ Guardado' : saving ? 'Guardando…' : 'Guardar configuración'}
      </button>
    </div>
  )
}

export default function UsuariosClient() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [open, setOpen]         = useState(false)
  const [editId, setEditId]     = useState<string|null>(null)
  const [saving, setSaving]     = useState(false)
  const [toast, setToast]       = useState('')
  const [form, setForm]         = useState({ nombre:'', email:'', password:'', rol:'ventas' })
  const supabase = createClient()

  function ok(msg:string){ setToast(msg); setTimeout(()=>setToast(''),2500) }

  async function load(){
    const { data } = await supabase.from('perfiles').select('id,nombre,rol').order('nombre')
    setUsuarios(data??[])
  }
  useEffect(()=>{ load() },[])

  function openNuevo(){ setForm({nombre:'',email:'',password:'',rol:'ventas'}); setEditId(null); setOpen(true) }
  function openEditar(u:Usuario){ setForm({nombre:u.nombre,email:u.email||'',password:'',rol:u.rol}); setEditId(u.id); setOpen(true) }

  async function save(){
    if(!form.nombre) return
    setSaving(true)
    const supabaseAnon = await supabase.auth.getSession()
    const token = supabaseAnon.data.session?.access_token
    const res = await fetch(`${SUPABASE_URL}/functions/v1/gestionar-usuario`, {
      method:'POST',
      headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${token}` },
      body: JSON.stringify({
        accion: editId?'editar':'crear',
        id: editId, nombre:form.nombre, email:form.email,
        password:form.password||undefined, rol:form.rol
      })
    })
    const data = await res.json()
    if(data.error){ alert('Error: '+data.error); setSaving(false); return }
    ok(editId ? 'Usuario actualizado ✓' : 'Usuario creado ✓')
    setOpen(false); setSaving(false); load()
  }

  async function eliminar(u:Usuario){
    if(!confirm(`¿Eliminar a ${u.nombre}? Esta acción no se puede deshacer.`)) return
    const { data:session } = await supabase.auth.getSession()
    const token = session.session?.access_token
    await fetch(`${SUPABASE_URL}/functions/v1/gestionar-usuario`, {
      method:'POST',
      headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${token}` },
      body: JSON.stringify({ accion:'eliminar', id:u.id })
    })
    ok('Usuario eliminado')
    load()
  }

  return (
    <div className="max-w-2xl">
      {toast&&(
        <div style={{position:'fixed',bottom:96,left:'50%',transform:'translateX(-50%)',background:'#00A550',color:'#fff',padding:'10px 24px',borderRadius:12,fontWeight:700,fontSize:14,zIndex:100,boxShadow:'0 4px 16px rgba(0,0,0,.2)'}}>
          {toast}
        </div>
      )}

      <div style={{display:'flex',justifyContent:'flex-end',marginBottom:16}}>
        <button onClick={openNuevo} style={btn}>+ Nuevo usuario</button>
      </div>

      {usuarios.length===0 ? <Empty msg="Sin usuarios." /> : (
        <div className="flex flex-col gap-3">
          {usuarios.map(u=>(
            <div key={u.id} className="bg-white border border-p-line rounded-xl p-4 shadow-sm flex items-center gap-4 flex-wrap">
              <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 font-bold text-white text-sm"
                style={{background:ROL_COLOR[u.rol]||'#6b7280'}}>
                {u.nombre.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-saira font-bold text-p-ink">{u.nombre}</p>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full text-white"
                  style={{background:ROL_COLOR[u.rol]||'#6b7280'}}>
                  {ROLES.find(r=>r.id===u.rol)?.label.split('—')[0].trim() || u.rol}
                </span>
              </div>
              <div className="flex gap-2">
                <button onClick={()=>openEditar(u)} style={{...btnGray,padding:'6px 12px',fontSize:12}}>✏ Editar</button>
                <button onClick={()=>eliminar(u)} style={{...btnRed,padding:'6px 12px',fontSize:12}}>✕</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={open} onClose={()=>setOpen(false)} title={editId?'Editar usuario':'Nuevo usuario'}>
        <div className="flex flex-col gap-3">
          <Field label="Nombre completo">
            <Input value={form.nombre} onChange={e=>setForm(p=>({...p,nombre:e.target.value}))} placeholder="Juan García"/>
          </Field>
          {!editId&&(
            <Field label="Email">
              <Input type="email" value={form.email} onChange={e=>setForm(p=>({...p,email:e.target.value}))} placeholder="juan@piamonte.com"/>
            </Field>
          )}
          <Field label={editId?'Nueva contraseña (dejar vacío para no cambiar)':'Contraseña'}>
            <Input type="password" value={form.password} onChange={e=>setForm(p=>({...p,password:e.target.value}))} placeholder={editId?'(sin cambios)':'Mínimo 8 caracteres'}/>
          </Field>
          <Field label="Rol y acceso">
            <Select value={form.rol} onChange={e=>setForm(p=>({...p,rol:e.target.value}))}>
              {ROLES.map(r=><option key={r.id} value={r.id}>{r.label}</option>)}
            </Select>
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={()=>setOpen(false)} style={btnGray}>Cancelar</button>
            <button onClick={save} disabled={saving} style={{...btn,opacity:saving?.6:1}}>
              {saving?'Guardando…':'Guardar'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
