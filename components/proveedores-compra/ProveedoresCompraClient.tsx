'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Modal, Field, Input, Empty } from '@/components/ui'
import { moneyARS } from '@/lib/utils/format'

const btn     = { background:'#00A550',color:'#fff',border:'none',borderRadius:10,padding:'10px 20px',fontWeight:700,fontSize:14,cursor:'pointer' } as const
const btnSm   = { ...btn, padding:'6px 14px', fontSize:13 } as const
const btnGray = { ...btnSm, background:'#6b7280' } as const
const btnRed  = { ...btnSm, background:'#ef4444' } as const

// Validación de CUIT/CUIL — algoritmo módulo 11 de AFIP, sin consultar servicios externos
function validarCuit(cuit: string): { ok:boolean; msg:string } {
  const limpio = cuit.replace(/[^0-9]/g,'')
  if (limpio.length === 0) return { ok:true, msg:'' }
  if (limpio.length !== 11) return { ok:false, msg:'El CUIT/CUIL debe tener 11 números' }
  const mult = [5,4,3,2,7,6,5,4,3,2]
  const digitos = limpio.split('').map(Number)
  const suma = mult.reduce((acc,m,i)=>acc + m*digitos[i], 0)
  let resto = 11 - (suma % 11)
  if (resto === 11) resto = 0
  if (resto === 10) return { ok:false, msg:'CUIT/CUIL inválido (dígito verificador)' }
  if (resto !== digitos[10]) return { ok:false, msg:'CUIT/CUIL inválido (dígito verificador no coincide)' }
  const prefijo = limpio.slice(0,2)
  const prefijosValidos = ['20','23','24','27','30','33','34','55']
  if (!prefijosValidos.includes(prefijo)) return { ok:false, msg:'Prefijo de CUIT/CUIL no reconocido' }
  return { ok:true, msg:'CUIT/CUIL válido' }
}
function formatCuit(v: string) {
  const limpio = v.replace(/[^0-9]/g,'').slice(0,11)
  if (limpio.length <= 2) return limpio
  if (limpio.length <= 10) return `${limpio.slice(0,2)}-${limpio.slice(2)}`
  return `${limpio.slice(0,2)}-${limpio.slice(2,10)}-${limpio.slice(10)}`
}

const CONDICIONES_IVA = ['Responsable Inscripto', 'Monotributo', 'Exento', 'Consumidor Final']

interface Proveedor {
  id:string; nombre:string; razon_social:string|null; cuit:string|null; condicion_iva:string|null
  email:string|null; telefono:string|null; direccion:string|null; localidad:string|null
  contacto:string|null; notas:string|null; activo:boolean; created_at:string
}
interface Compra { id:string; tipo:string; letra:string|null; punto_venta:string|null; numero:string|null; fecha:string; total:number; estado:string }

export default function ProveedoresCompraClient() {
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [q, setQ]               = useState('')
  const [open, setOpen]         = useState(false)
  const [selected, setSelected] = useState<Proveedor|null>(null)
  const [compras, setCompras]   = useState<Compra[]>([])
  const [selectedHist, setSelectedHist] = useState<Proveedor|null>(null)
  const [loadingCompras, setLoadingCompras] = useState(false)
  const [saving, setSaving]     = useState(false)
  const [mostrarInactivos, setMostrarInactivos] = useState(false)
  const supabase = createClient()

  const [form, setForm] = useState({
    nombre:'', razon_social:'', cuit:'', condicion_iva:'', email:'', telefono:'',
    direccion:'', localidad:'', contacto:'', notas:''
  })

  const cuitCheck = validarCuit(form.cuit)

  const load = useCallback(async () => {
    const query = supabase.from('proveedores_compra').select('*').order('nombre')
    if (!mostrarInactivos) query.eq('activo', true)
    if (q.trim()) query.ilike('nombre', `%${q}%`)
    const { data } = await query.limit(100)
    setProveedores(data ?? [])
  }, [q, mostrarInactivos, supabase])

  useEffect(() => { load() }, [load])

  function openNuevo() {
    setForm({ nombre:'', razon_social:'', cuit:'', condicion_iva:'', email:'', telefono:'', direccion:'', localidad:'', contacto:'', notas:'' })
    setSelected(null)
    setOpen(true)
  }

  function openEditar(p: Proveedor) {
    setForm({
      nombre: p.nombre, razon_social: p.razon_social||'', cuit: p.cuit||'', condicion_iva: p.condicion_iva||'',
      email: p.email||'', telefono: p.telefono||'', direccion: p.direccion||'', localidad: p.localidad||'',
      contacto: p.contacto||'', notas: p.notas||''
    })
    setSelected(p)
    setOpen(true)
  }

  async function save() {
    if (!form.nombre.trim()) return
    if (form.cuit && !validarCuit(form.cuit).ok) { alert('El CUIT/CUIL ingresado no es válido. Revisá los números.'); return }
    setSaving(true)
    const payload = {
      nombre: form.nombre, razon_social: form.razon_social||null, cuit: form.cuit||null,
      condicion_iva: form.condicion_iva||null, email: form.email||null, telefono: form.telefono||null,
      direccion: form.direccion||null, localidad: form.localidad||null, contacto: form.contacto||null,
      notas: form.notas||null,
    }
    if (selected?.id) {
      await supabase.from('proveedores_compra').update(payload).eq('id', selected.id)
    } else {
      await supabase.from('proveedores_compra').insert({ ...payload, activo: true })
    }
    setSaving(false); setOpen(false)
    load()
  }

  async function loadCompras(p: Proveedor) {
    if (selectedHist?.id === p.id) { setSelectedHist(null); setCompras([]); return }
    setSelectedHist(p); setLoadingCompras(true); setCompras([])
    const { data } = await supabase.from('comprobantes_compra')
      .select('id,tipo,letra,punto_venta,numero,fecha,total,estado')
      .eq('proveedor_id', p.id).order('fecha', {ascending:false}).limit(20)
    setCompras(data ?? [])
    setLoadingCompras(false)
  }

  async function desactivar(p: Proveedor) {
    if (!confirm(`¿Desactivar a "${p.nombre}"? No se borran sus compras, solo deja de aparecer en los selectores.`)) return
    await supabase.from('proveedores_compra').update({ activo:false }).eq('id', p.id)
    load()
  }
  async function reactivar(p: Proveedor) {
    await supabase.from('proveedores_compra').update({ activo:true }).eq('id', p.id)
    load()
  }

  const totalCompras = compras.filter(c=>c.estado!=='anulado').reduce((a,c)=>a+c.total,0)

  return (
    <div>
      <div className="flex justify-between items-center mb-4 gap-3 flex-wrap">
        <div className="flex gap-2 items-center flex-wrap">
          <Input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar proveedor…" />
          <label className="flex items-center gap-1.5 text-sm text-p-ink2 cursor-pointer whitespace-nowrap">
            <input type="checkbox" checked={mostrarInactivos} onChange={e=>setMostrarInactivos(e.target.checked)} className="accent-p-green"/>
            Mostrar inactivos
          </label>
        </div>
        <button onClick={openNuevo} style={btn}>+ Nuevo proveedor</button>
      </div>

      {proveedores.length === 0 ? <Empty msg="Sin proveedores." /> : (
        <div className="flex flex-col gap-2">
          {proveedores.map(p => (
            <div key={p.id} className={`bg-white border border-p-line rounded-xl p-4 shadow-sm ${!p.activo ? 'opacity-50' : ''}`}>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div onClick={()=>loadCompras(p)} className="cursor-pointer flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-saira font-bold text-p-ink text-base">{p.nombre}</p>
                    {!p.activo && <span className="text-[10px] font-bold bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Inactivo</span>}
                    {p.condicion_iva && <span className="text-[10px] font-bold bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">{p.condicion_iva}</span>}
                  </div>
                  {p.razon_social && <p className="text-sm text-p-ink2 mt-0.5">{p.razon_social}</p>}
                  <div className="flex flex-wrap gap-3 mt-1 text-xs text-p-ink2">
                    {p.cuit && <span className="font-mono">CUIT {p.cuit}</span>}
                    {p.telefono && <span>📞 {p.telefono}</span>}
                    {p.email && <span>✉ {p.email}</span>}
                    {p.localidad && <span>📍 {p.localidad}</span>}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={()=>openEditar(p)} style={btnGray}>✏ Editar</button>
                  {p.activo
                    ? <button onClick={()=>desactivar(p)} style={btnRed}>Desactivar</button>
                    : <button onClick={()=>reactivar(p)} style={{...btnSm,background:'#00A550'}}>Reactivar</button>}
                </div>
              </div>

              {selectedHist?.id === p.id && (
                <div className="mt-3 pt-3 border-t border-p-line2">
                  {loadingCompras ? (
                    <p className="text-xs text-p-ink2 text-center py-3">Cargando historial…</p>
                  ) : compras.length === 0 ? (
                    <p className="text-xs text-p-ink2 text-center py-3">Sin compras registradas a este proveedor.</p>
                  ) : (
                    <>
                      <div className="flex justify-between items-center mb-2">
                        <p className="text-[11px] font-semibold text-p-ink2 uppercase tracking-wider">Últimas compras</p>
                        <p className="text-sm font-saira font-bold text-p-ink">{moneyARS(totalCompras)}</p>
                      </div>
                      <div className="flex flex-col gap-1">
                        {compras.map(c => (
                          <div key={c.id} className={`flex items-center justify-between text-xs py-1 ${c.estado==='anulado'?'opacity-50':''}`}>
                            <span className="font-mono">
                              {c.tipo==='remito' ? `REM-${c.numero||'S/N'}` : `${c.letra||''} ${c.punto_venta||''}-${c.numero||'S/N'}`}
                            </span>
                            <span className="text-p-ink2">{c.fecha.split('-').reverse().join('/')}</span>
                            <span className="font-mono font-bold">{moneyARS(c.total)}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal open={open} onClose={()=>setOpen(false)} title={selected ? 'Editar proveedor' : 'Nuevo proveedor'}>
        <div className="flex flex-col gap-3">
          <Field label="Nombre / Fantasía *">
            <Input value={form.nombre} onChange={e=>setForm(p=>({...p,nombre:e.target.value}))} placeholder="Nombre del proveedor"/>
          </Field>
          <Field label="Razón social">
            <Input value={form.razon_social} onChange={e=>setForm(p=>({...p,razon_social:e.target.value}))} placeholder="Razón social (opcional)"/>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="CUIT">
              <Input value={form.cuit}
                onChange={e=>setForm(p=>({...p,cuit:formatCuit(e.target.value)}))}
                placeholder="30-12345678-9" maxLength={13}/>
            </Field>
            <Field label="Condición IVA">
              <select value={form.condicion_iva} onChange={e=>setForm(p=>({...p,condicion_iva:e.target.value}))}
                className="w-full border border-p-line rounded-lg px-3 py-2 text-sm text-p-ink focus:outline-none focus:border-p-green bg-white">
                <option value="">Sin especificar</option>
                {CONDICIONES_IVA.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
          </div>
          {form.cuit && (
            <div style={{
              background: cuitCheck.ok ? '#f0fdf4' : '#fef2f2',
              border: `1px solid ${cuitCheck.ok ? '#86efac' : '#fca5a5'}`,
              borderRadius:8, padding:'6px 12px', fontSize:12, marginTop:-6
            }}>
              <p style={{fontWeight:600, color: cuitCheck.ok ? '#15803d' : '#b91c1c'}}>
                {cuitCheck.ok ? '✓ ' : '⚠ '}{cuitCheck.msg}
              </p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Teléfono">
              <Input value={form.telefono} onChange={e=>setForm(p=>({...p,telefono:e.target.value}))} placeholder="opcional"/>
            </Field>
            <Field label="Email">
              <Input type="email" value={form.email} onChange={e=>setForm(p=>({...p,email:e.target.value}))} placeholder="opcional"/>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Dirección">
              <Input value={form.direccion} onChange={e=>setForm(p=>({...p,direccion:e.target.value}))} placeholder="opcional"/>
            </Field>
            <Field label="Localidad">
              <Input value={form.localidad} onChange={e=>setForm(p=>({...p,localidad:e.target.value}))} placeholder="opcional"/>
            </Field>
          </div>
          <Field label="Contacto">
            <Input value={form.contacto} onChange={e=>setForm(p=>({...p,contacto:e.target.value}))} placeholder="Persona de contacto (opcional)"/>
          </Field>
          <Field label="Notas">
            <Input value={form.notas} onChange={e=>setForm(p=>({...p,notas:e.target.value}))} placeholder="Observaciones…"/>
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={()=>setOpen(false)} style={btnGray}>Cancelar</button>
            <button onClick={save} disabled={!form.nombre.trim()||saving} style={{...btn,opacity:(!form.nombre.trim()||saving)?.6:1}}>
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
