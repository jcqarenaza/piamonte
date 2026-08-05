'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Modal, Field, Input, Empty } from '@/components/ui'
import { moneyARS2 as moneyARS } from '@/lib/utils/format'

const btn     = { background:'#00A550',color:'#fff',border:'none',borderRadius:10,padding:'10px 20px',fontWeight:700,fontSize:14,cursor:'pointer' } as const
const btnSm   = { ...btn, padding:'6px 14px', fontSize:13 } as const
const btnGray = { ...btnSm, background:'#6b7280' } as const
const btnRed  = { ...btnSm, background:'#ef4444' } as const

// Validación de CUIT — algoritmo módulo 11 de AFIP, sin consultar servicios externos
function validarCuit(cuit: string): { ok:boolean; msg:string } {
  const limpio = cuit.replace(/[^0-9]/g,'')
  if (limpio.length === 0) return { ok:true, msg:'' }
  if (limpio.length !== 11) return { ok:false, msg:'El CUIT debe tener 11 números' }
  const mult = [5,4,3,2,7,6,5,4,3,2]
  const digitos = limpio.split('').map(Number)
  const suma = mult.reduce((acc,m,i)=>acc + m*digitos[i], 0)
  let resto = 11 - (suma % 11)
  if (resto === 11) resto = 0
  if (resto === 10) return { ok:false, msg:'CUIT inválido (dígito verificador)' }
  if (resto !== digitos[10]) return { ok:false, msg:'CUIT inválido (dígito verificador no coincide)' }
  const prefijo = limpio.slice(0,2)
  const prefijosValidos = ['20','23','24','27','30','33','34','55']
  if (!prefijosValidos.includes(prefijo)) return { ok:false, msg:'Prefijo de CUIT no reconocido' }
  return { ok:true, msg:'CUIT válido' }
}
function formatCuit(v: string) {
  const limpio = v.replace(/[^0-9]/g,'').slice(0,11)
  if (limpio.length <= 2) return limpio
  if (limpio.length <= 10) return `${limpio.slice(0,2)}-${limpio.slice(2)}`
  return `${limpio.slice(0,2)}-${limpio.slice(2,10)}-${limpio.slice(10)}`
}

const CONDICIONES_IVA = ['Responsable Inscripto', 'Monotributo', 'Exento']
const PLAZOS_COMUNES = [15, 30, 45, 60, 90]

interface Aseguradora {
  id:string; nombre:string; razon_social:string|null; cuit:string|null; condicion_iva:string|null
  direccion:string|null; contacto:string|null; telefono:string|null; plazo_pago_dias:number
  activo:boolean; created_at:string
}
interface FacturaPendiente { id:string; numero:number|null; nro_cbte_afip:number|null; fecha:string; total:number; vehiculo:string|null }

export default function AseguradorasClient() {
  const [aseguradoras, setAseguradoras] = useState<Aseguradora[]>([])
  const [q, setQ]               = useState('')
  const [open, setOpen]         = useState(false)
  const [selected, setSelected] = useState<Aseguradora|null>(null)
  const [saving, setSaving]     = useState(false)
  const [mostrarInactivas, setMostrarInactivas] = useState(false)
  const [selectedHist, setSelectedHist] = useState<Aseguradora|null>(null)
  const [pendientes, setPendientes] = useState<FacturaPendiente[]>([])
  const [loadingPend, setLoadingPend] = useState(false)
  const supabase = createClient()

  const [form, setForm] = useState({
    nombre:'', razon_social:'', cuit:'', condicion_iva:'', direccion:'',
    contacto:'', telefono:'', plazo_pago_dias:'30', formato_factura:'interno'
  })
  const cuitCheck = validarCuit(form.cuit)

  const load = useCallback(async () => {
    const query = supabase.from('aseguradoras').select('*').order('nombre')
    if (!mostrarInactivas) query.eq('activo', true)
    if (q.trim()) query.ilike('nombre', `%${q}%`)
    const { data } = await query.limit(100)
    setAseguradoras(data ?? [])
  }, [q, mostrarInactivas, supabase])

  useEffect(() => { load() }, [load])

  function openNuevo() {
    setForm({ nombre:'', razon_social:'', cuit:'', condicion_iva:'', direccion:'', contacto:'', telefono:'', plazo_pago_dias:'30', formato_factura:'interno' })
    setSelected(null)
    setOpen(true)
  }

  function openEditar(a: Aseguradora) {
    setForm({
      nombre: a.nombre, razon_social: a.razon_social||'', cuit: a.cuit||'', condicion_iva: a.condicion_iva||'',
      direccion: a.direccion||'', contacto: a.contacto||'', telefono: a.telefono||'',
      plazo_pago_dias: String(a.plazo_pago_dias ?? 30),
      formato_factura: (a as any).formato_factura || 'interno'
    })
    setSelected(a)
    setOpen(true)
  }

  async function save() {
    if (!form.nombre.trim()) return
    if (form.cuit && !validarCuit(form.cuit).ok) { alert('El CUIT ingresado no es válido. Revisá los números.'); return }
    setSaving(true)
    const payload = {
      nombre: form.nombre, razon_social: form.razon_social||null, cuit: form.cuit||null,
      condicion_iva: form.condicion_iva||null, direccion: form.direccion||null,
      contacto: form.contacto||null, telefono: form.telefono||null,
      plazo_pago_dias: parseInt(form.plazo_pago_dias) || 30,
      formato_factura: form.formato_factura || 'interno',
    }
    if (selected?.id) {
      await supabase.from('aseguradoras').update(payload).eq('id', selected.id)
    } else {
      await supabase.from('aseguradoras').insert({ ...payload, activo: true })
    }
    setSaving(false); setOpen(false)
    load()
  }

  async function loadPendientes(a: Aseguradora) {
    if (selectedHist?.id === a.id) { setSelectedHist(null); setPendientes([]); return }
    setSelectedHist(a); setLoadingPend(true); setPendientes([])
    const { data } = await supabase.from('comprobantes')
      .select('id,numero,nro_cbte_afip,fecha,total,vehiculo')
      .eq('aseguradora_id', a.id).order('fecha', {ascending:true}).limit(50)
    setPendientes(data ?? [])
    setLoadingPend(false)
  }

  async function desactivar(a: Aseguradora) {
    if (!confirm(`¿Desactivar "${a.nombre}"? No se borra el historial de facturas, solo deja de aparecer en los selectores.`)) return
    await supabase.from('aseguradoras').update({ activo:false }).eq('id', a.id)
    load()
  }
  async function reactivar(a: Aseguradora) {
    await supabase.from('aseguradoras').update({ activo:true }).eq('id', a.id)
    load()
  }

  // Estado de vencimiento de cada factura pendiente, según fecha + plazo de pago de la aseguradora
  function estadoVencimiento(fecha: string, plazoDias: number) {
    const vence = new Date(fecha + 'T12:00:00')
    vence.setDate(vence.getDate() + plazoDias)
    const hoy = new Date(); hoy.setHours(12,0,0,0)
    const diasRestantes = Math.round((vence.getTime() - hoy.getTime()) / 86400000)
    if (diasRestantes < 0) return { label: `Vencida hace ${Math.abs(diasRestantes)}d`, color: '#ef4444', bg: '#fef2f2' }
    if (diasRestantes <= 7) return { label: `Vence en ${diasRestantes}d`, color: '#d97706', bg: '#fffbeb' }
    return { label: `Vence ${vence.toLocaleDateString('es-AR')}`, color: '#16a34a', bg: '#f0fdf4' }
  }

  const totalPendiente = pendientes.reduce((a,f)=>a+f.total, 0)

  return (
    <div>
      <div className="flex justify-between items-center mb-4 gap-3 flex-wrap">
        <div className="flex gap-2 items-center flex-wrap">
          <Input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar aseguradora…" />
          <label className="flex items-center gap-1.5 text-sm text-p-ink2 cursor-pointer whitespace-nowrap">
            <input type="checkbox" checked={mostrarInactivas} onChange={e=>setMostrarInactivas(e.target.checked)} className="accent-p-green"/>
            Mostrar inactivas
          </label>
        </div>
        <button onClick={openNuevo} style={btn}>+ Nueva aseguradora</button>
      </div>

      {aseguradoras.length === 0 ? <Empty msg="Sin aseguradoras cargadas." /> : (
        <div className="flex flex-col gap-2">
          {aseguradoras.map(a => (
            <div key={a.id}
              onClick={()=>loadPendientes(a)}
              onDoubleClick={()=>openEditar(a)} title="Click para más info · doble click para editar"
              className={`bg-white border border-p-line rounded-xl shadow-sm cursor-pointer hover:border-p-green transition-colors overflow-hidden ${!a.activo ? 'opacity-50' : ''}`}>
              <div className="flex items-center gap-2.5 px-3.5 py-2.5 flex-wrap">
                <p className="font-saira font-bold text-p-ink text-sm truncate" style={{maxWidth:200}}>{a.nombre}</p>
                {!a.activo && <span className="text-[10px] font-bold bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full shrink-0">Inactiva</span>}
                <span className="text-[10px] font-bold bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full shrink-0">⏱ {a.plazo_pago_dias}d</span>
                {a.condicion_iva && <span className="text-[10px] font-bold bg-p-light text-p-dark px-2 py-0.5 rounded-full shrink-0">{a.condicion_iva}</span>}
                {a.cuit && <span className="text-xs text-p-ink2 font-mono shrink-0">CUIT {a.cuit}</span>}
                <div className="flex-1 min-w-[8px]"/>
              </div>

              {selectedHist?.id === a.id && (
                <div onClick={e=>e.stopPropagation()} className="px-3.5 pb-3 pt-2 border-t border-p-line2 bg-p-light/30">
                  <div className="flex flex-wrap gap-3 text-xs text-p-ink2 mb-2">
                    {a.razon_social && <span>{a.razon_social}</span>}
                    {a.contacto && <span>👤 {a.contacto}</span>}
                    {a.telefono && <span>📞 {a.telefono}</span>}
                  </div>
                  <div className="flex gap-2 flex-wrap mb-3">
                    <button onClick={()=>openEditar(a)} style={btnGray}>✏ Editar</button>
                    {a.activo
                      ? <button onClick={()=>desactivar(a)} style={btnRed}>Desactivar</button>
                      : <button onClick={()=>reactivar(a)} style={{...btnSm,background:'#00A550'}}>Reactivar</button>}
                  </div>
                  {loadingPend ? (
                    <p className="text-xs text-p-ink2 text-center py-3">Cargando facturas…</p>
                  ) : pendientes.length === 0 ? (
                    <p className="text-xs text-p-ink2 text-center py-3">Sin facturas registradas a esta aseguradora.</p>
                  ) : (
                    <>
                      <div className="flex justify-between items-center mb-2">
                        <p className="text-[11px] font-semibold text-p-ink2 uppercase tracking-wider">Facturas — plazo {a.plazo_pago_dias} días</p>
                        <p className="text-sm font-saira font-bold text-p-ink">{moneyARS(totalPendiente)}</p>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        {pendientes.map(f => {
                          const est = estadoVencimiento(f.fecha, a.plazo_pago_dias)
                          return (
                            <div key={f.id} className="flex items-center justify-between text-xs py-1.5 px-2 rounded-lg" style={{background:est.bg}}>
                              <span className="font-mono">FA-{String(f.nro_cbte_afip??f.numero??0).padStart(8,'0')}</span>
                              <span className="text-p-ink2 flex-1 text-center truncate px-2">{f.vehiculo||'—'}</span>
                              <span className="font-mono font-bold">{moneyARS(f.total)}</span>
                              <span className="font-bold ml-3" style={{color:est.color}}>{est.label}</span>
                            </div>
                          )
                        })}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal open={open} onClose={()=>setOpen(false)} title={selected ? 'Editar aseguradora' : 'Nueva aseguradora'}>
        <div className="flex flex-col gap-3">
          <Field label="Nombre *">
            <Input value={form.nombre} onChange={e=>setForm(p=>({...p,nombre:e.target.value}))} placeholder="Allianz, Mapfre, Sancor…"/>
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
          <Field label="Plazo de pago (días)">
            <div className="flex gap-2 flex-wrap mb-2">
              {PLAZOS_COMUNES.map(p => (
                <button key={p} type="button" onClick={()=>setForm(prev=>({...prev,plazo_pago_dias:String(p)}))}
                  style={{
                    background: form.plazo_pago_dias===String(p) ? '#1d4ed8' : '#fff',
                    color: form.plazo_pago_dias===String(p) ? '#fff' : '#4A6655',
                    border: `1.5px solid ${form.plazo_pago_dias===String(p) ? '#1d4ed8' : '#C2DDD0'}`,
                    borderRadius:8, padding:'4px 12px', fontWeight:700, fontSize:12, cursor:'pointer'
                  }}>
                  {p} días
                </button>
              ))}
            </div>
            <Input type="number" value={form.plazo_pago_dias} onChange={e=>setForm(p=>({...p,plazo_pago_dias:e.target.value}))} placeholder="30"/>
            <p className="text-[11px] text-p-ink2 mt-1">Se usa para calcular cuándo vence cada factura y avisar antes de que pase.</p>
          </Field>
          <Field label="Formato de factura (PDF)">
            <select value={form.formato_factura} onChange={e=>setForm(p=>({...p,formato_factura:e.target.value}))}
              className="w-full border border-p-line rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-p-green">
              <option value="interno">Interno (El Piamonte)</option>
              <option value="arca">Formato ARCA (plantilla oficial)</option>
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Contacto">
              <Input value={form.contacto} onChange={e=>setForm(p=>({...p,contacto:e.target.value}))} placeholder="Productor / gestor de cuenta"/>
            </Field>
            <Field label="Teléfono">
              <Input value={form.telefono} onChange={e=>setForm(p=>({...p,telefono:e.target.value}))} placeholder="opcional"/>
            </Field>
          </div>
          <Field label="Dirección">
            <Input value={form.direccion} onChange={e=>setForm(p=>({...p,direccion:e.target.value}))} placeholder="opcional"/>
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
