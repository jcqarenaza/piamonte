'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Modal, Field, Input, Empty } from '@/components/ui'
import { moneyARS } from '@/lib/utils/format'

interface Cliente { id:string; nombre:string; telefono:string|null; email:string|null; cuit:string|null; notas:string|null; tipo_cliente_id:string|null; tiene_cuenta_corriente:boolean; plazo_cc_dias:number; tope_credito:number|null }
interface Historial {
  turnos: { id:string; fecha:string; trabajo:string|null; estado:string; precio_acordado:number|null }[]
  presupuestos: { id:string; fecha:string; total:number; vehiculo:string|null }[]
  ordenes: { id:string; numero:number; fecha:string; total:number; aseguradora:string|null; vehiculo:string|null; patente:string|null; siniestro:string|null; convertido_comp:boolean }[]
}

const btn    = { background:'#00A550',color:'#fff',border:'none',borderRadius:10,padding:'10px 20px',fontWeight:700,fontSize:14,cursor:'pointer' } as const
const btnSm  = { ...btn, padding:'7px 14px', fontSize:12 } as const
const btnGray = { ...btnSm, background:'#6b7280' } as const
const btnBlue = { ...btnSm, background:'#1d4ed8' } as const

export default function ClientesClient({ userId }: { userId:string }) {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [tipos, setTipos]       = useState<{id:string;nombre:string}[]>([])
  const [q, setQ]               = useState('')
  const [filtroTipo, setFiltroTipo]   = useState('')
  const [filtroCC, setFiltroCC]       = useState<'todos'|'con'|'sin'>('todos')
  const [open, setOpen]         = useState(false)
  const [selected, setSelected] = useState<Cliente|null>(null)
  const [historial, setHistorial] = useState<Historial|null>(null)
  const [loadingHist, setLoadingHist] = useState(false)
  const [saving, setSaving]     = useState(false)
  const [form, setForm] = useState({ nombre:'', telefono:'', email:'', notas:'', cuit:'', direccion:'', tipo_cliente_id:'', tiene_cuenta_corriente:false, plazo_cc_dias:30, tope_credito:'' })
  const supabase = createClient()
  const router   = useRouter()

  function validarCuit(cuit: string): { ok:boolean; msg:string } {
    const limpio = cuit.replace(/[^0-9]/g,'')
    if (!limpio.length) return { ok:true, msg:'' }
    if (limpio.length !== 11) return { ok:false, msg:'El CUIT/CUIL debe tener 11 números' }
    const mult = [5,4,3,2,7,6,5,4,3,2]
    const digitos = limpio.split('').map(Number)
    const suma = mult.reduce((acc,m,i)=>acc + m*digitos[i], 0)
    let resto = 11 - (suma % 11)
    if (resto === 11) resto = 0
    if (resto === 10) return { ok:false, msg:'CUIT/CUIL inválido (dígito verificador)' }
    if (resto !== digitos[10]) return { ok:false, msg:'CUIT/CUIL inválido (dígito verificador no coincide)' }
    return { ok:true, msg:'CUIT/CUIL válido' }
  }

  function formatCuit(v: string) {
    const l = v.replace(/[^0-9]/g,'').slice(0,11)
    if (l.length <= 2) return l
    if (l.length <= 10) return `${l.slice(0,2)}-${l.slice(2)}`
    return `${l.slice(0,2)}-${l.slice(2,10)}-${l.slice(10)}`
  }

  const cuitCheck = validarCuit(form.cuit)

  const load = useCallback(async () => {
    supabase.from('tipos_cliente').select('id,nombre').order('nombre').then(({data})=>setTipos(data??[]))
    let query = supabase.from('clientes').select('*').order('nombre')
    if (q.trim()) query = query.ilike('nombre', `%${q}%`)
    if (filtroTipo) query = query.eq('tipo_cliente_id', filtroTipo)
    if (filtroCC === 'con')  query = query.eq('tiene_cuenta_corriente', true)
    if (filtroCC === 'sin')  query = query.eq('tiene_cuenta_corriente', false)
    const { data } = await query.limit(100)
    setClientes(data ?? [])
  }, [q, filtroTipo, filtroCC, supabase])

  useEffect(() => { load() }, [load])

  async function save() {
    if (!form.nombre.trim()) return
    if (form.cuit && !validarCuit(form.cuit).ok) { alert('El CUIT/CUIL ingresado no es válido.'); return }
    setSaving(true)
    const payload = { nombre:form.nombre, telefono:form.telefono||null, email:form.email||null, cuit:form.cuit||null, direccion:form.direccion||null, notas:form.notas||null, tipo_cliente_id:form.tipo_cliente_id||null, tiene_cuenta_corriente:form.tiene_cuenta_corriente, plazo_cc_dias:form.plazo_cc_dias, tope_credito:form.tope_credito?+form.tope_credito:null }
    if (selected?.id) await supabase.from('clientes').update(payload).eq('id', selected.id)
    else await supabase.from('clientes').insert({ ...payload, user_id:userId })
    setSaving(false); setOpen(false)
    setForm({ nombre:'', telefono:'', email:'', cuit:'', direccion:'', notas:'', tipo_cliente_id:'', tiene_cuenta_corriente:false, plazo_cc_dias:30, tope_credito:'' })
    load()
  }

  async function loadHistorial(c: Cliente) {
    if (selected?.id === c.id) { setSelected(null); setHistorial(null); return }
    setSelected(c); setLoadingHist(true); setHistorial(null)
    const nombre = c.nombre
    const [t, p, o] = await Promise.all([
      supabase.from('turnos').select('id,fecha,trabajo,estado,precio_acordado').ilike('cliente', `%${nombre}%`).order('fecha', {ascending:false}).limit(10),
      supabase.from('presupuestos').select('id,fecha,total,vehiculo').ilike('cliente', `%${nombre}%`).order('fecha', {ascending:false}).limit(10),
      supabase.from('ordenes_servicio').select('id,numero,fecha,total,aseguradora,vehiculo,patente,siniestro,convertido_comp').ilike('cliente', `%${nombre}%`).order('fecha', {ascending:false}).limit(10),
    ])
    setHistorial({ turnos:t.data??[], presupuestos:p.data??[], ordenes:o.data??[] })
    setLoadingHist(false)
  }

  function irAFacturar(c: Cliente, os?: Historial['ordenes'][0]) {
    const params = new URLSearchParams({ cli: c.nombre, tel: c.telefono||'' })
    if (os) {
      params.set('oid', os.id)
      params.set('veh', os.vehiculo||'')
      params.set('pat', os.patente||'')
      if (os.aseguradora) params.set('aseguradora', os.aseguradora)
      if (os.siniestro)   params.set('siniestro', os.siniestro)
      params.set('items', JSON.stringify([]))
      params.set('total', String(os.total))
    }
    router.push(`/comprobantes?${params.toString()}`)
  }

  async function del(id:string) {
    if (!confirm('¿Borrar cliente?')) return
    await supabase.from('clientes').delete().eq('id', id)
    setClientes(prev => prev.filter(c => c.id !== id))
    if (selected?.id === id) { setSelected(null); setHistorial(null) }
  }

  const tipoNombre = (id:string|null) => tipos.find(t=>t.id===id)?.nombre

  return (
    <div>
      {/* Buscador + filtros */}
      <div className="flex flex-wrap gap-2 mb-5 items-center">
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar cliente…"
          className="flex-1 min-w-[180px] border border-p-line rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-p-green"/>
        {/* Filtro tipo */}
        <select value={filtroTipo} onChange={e=>setFiltroTipo(e.target.value)}
          className="border border-p-line rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-p-green">
          <option value="">Todos los tipos</option>
          {tipos.map(t=><option key={t.id} value={t.id}>{t.nombre}</option>)}
        </select>
        {/* Filtro cta cte */}
        <div className="flex border border-p-line rounded-xl overflow-hidden text-sm">
          {([['todos','Todos'],['con','Con CC'],['sin','Sin CC']] as const).map(([v,l])=>(
            <button key={v} onClick={()=>setFiltroCC(v)}
              className={`px-3 py-2.5 font-medium transition-colors ${filtroCC===v?'bg-p-green text-white':'bg-white text-p-ink2 hover:bg-p-light'}`}>
              {l}
            </button>
          ))}
        </div>
        <button onClick={()=>{ setForm({ nombre:'', telefono:'', email:'', cuit:'', direccion:'', notas:'', tipo_cliente_id:'', tiene_cuenta_corriente:false, plazo_cc_dias:30, tope_credito:'' }); setSelected(null); setOpen(true) }}
          style={btn}>+ Nuevo cliente</button>
      </div>

      {clientes.length === 0 ? (
        <Empty msg={q ? `Sin resultados para "${q}"` : 'Sin clientes todavía.'} />
      ) : (
        <div className="flex flex-col gap-2">
          {clientes.map(c => {
            const tipoNom = tipoNombre(c.tipo_cliente_id)
            return (
            <div key={c.id}>
              <div className={`bg-white border rounded-xl px-3.5 py-2.5 shadow-sm flex items-center gap-3 flex-wrap cursor-pointer ${selected?.id===c.id ? 'border-p-green bg-p-light/30' : 'border-p-line hover:border-p-green'}`}
                onClick={() => loadHistorial(c)}
                onDoubleClick={() => { setForm({ nombre:c.nombre, telefono:c.telefono??'', email:c.email??'', cuit:c.cuit??'', direccion:(c as any).direccion??'', notas:c.notas??'', tipo_cliente_id:c.tipo_cliente_id??'', tiene_cuenta_corriente:c.tiene_cuenta_corriente??false, plazo_cc_dias:c.plazo_cc_dias??30, tope_credito:c.tope_credito?String(c.tope_credito):'' }); setSelected(c); setOpen(true) }}>
                <div className="w-7 h-7 rounded-full bg-p-green flex items-center justify-center text-white font-saira font-bold text-xs shrink-0">
                  {c.nombre.charAt(0).toUpperCase()}
                </div>
                <p className="font-saira font-bold text-p-ink text-sm flex-1 truncate">{c.nombre}</p>
                {tipoNom && <span className="text-[10px] bg-blue-50 text-blue-700 border border-blue-200 font-bold px-2 py-0.5 rounded-full shrink-0">{tipoNom}</span>}
                {c.tiene_cuenta_corriente && <span className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 font-bold px-2 py-0.5 rounded-full shrink-0">📒 CC</span>}
                {c.telefono && <span className="text-xs text-p-ink2 shrink-0 hidden md:inline">{c.telefono}</span>}
                <div className="flex gap-1.5 ml-auto shrink-0" onClick={e=>e.stopPropagation()}>
                  <button onClick={()=>irAFacturar(c)} style={btnBlue}>🧾 Factura</button>
                  <button onClick={()=>{ setForm({ nombre:c.nombre, telefono:c.telefono??'', email:c.email??'', cuit:c.cuit??'', direccion:(c as any).direccion??'', notas:c.notas??'', tipo_cliente_id:c.tipo_cliente_id??'', tiene_cuenta_corriente:c.tiene_cuenta_corriente??false, plazo_cc_dias:c.plazo_cc_dias??30, tope_credito:c.tope_credito?String(c.tope_credito):'' }); setSelected(c); setOpen(true) }} style={btnGray}>✏</button>
                  <button onClick={()=>del(c.id)} style={{...btnGray,background:'#ef4444'}}>✕</button>
                </div>
              </div>

              {/* Panel historial */}
              {selected?.id === c.id && (
                <div className="border border-p-green rounded-b-xl border-t-0 bg-p-light/20 px-4 py-3">
                  {loadingHist ? <p className="text-sm text-center py-4 text-p-gray">Cargando historial…</p> : historial ? (
                    <div className="flex flex-col gap-4">

                      {/* OS pendientes de facturar */}
                      {historial.ordenes.filter(o=>!o.convertido_comp && o.total > 0).length > 0 && (
                        <div>
                          <p className="text-xs font-bold text-p-ink2 uppercase tracking-wider mb-2">🔧 OS pendientes de facturar</p>
                          <div className="flex flex-col gap-1.5">
                            {historial.ordenes.filter(o=>!o.convertido_comp && o.total > 0).map(o=>(
                              <div key={o.id} className="flex items-center gap-3 bg-white border border-p-line rounded-lg px-3 py-2">
                                <span className="font-mono text-xs font-bold text-p-dark shrink-0">OS-{String(o.numero).padStart(4,'0')}</span>
                                <span className="font-mono text-xs text-p-ink2 shrink-0">{o.fecha.split('-').reverse().join('/')}</span>
                                <span className="flex-1 text-p-ink text-sm truncate">{o.aseguradora||o.vehiculo||'—'}</span>
                                <span className="font-mono text-xs font-bold text-p-green shrink-0">{moneyARS(o.total)}</span>
                                <button onClick={()=>irAFacturar(c, o)} style={{...btnBlue,fontSize:11,padding:'4px 10px'}}>🧾 Facturar esta OS</button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* OS ya facturadas */}
                      {historial.ordenes.filter(o=>o.convertido_comp).length > 0 && (
                        <div>
                          <p className="text-xs font-bold text-p-ink2 uppercase tracking-wider mb-2">✅ OS ya facturadas</p>
                          <div className="flex flex-col gap-1.5">
                            {historial.ordenes.filter(o=>o.convertido_comp).map(o=>(
                              <div key={o.id} className="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2 opacity-60">
                                <span className="font-mono text-xs font-bold text-p-dark shrink-0">OS-{String(o.numero).padStart(4,'0')}</span>
                                <span className="font-mono text-xs text-p-ink2 shrink-0">{o.fecha.split('-').reverse().join('/')}</span>
                                <span className="flex-1 text-p-ink text-sm truncate">{o.aseguradora||o.vehiculo||'—'}</span>
                                <span className="font-mono text-xs font-bold shrink-0">{moneyARS(o.total)}</span>
                                <span className="text-[10px] text-green-700 font-bold shrink-0">🔒 Facturada</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Turnos */}
                      {historial.turnos.length > 0 && (
                        <div>
                          <p className="text-xs font-bold text-p-ink2 uppercase tracking-wider mb-2">📅 Turnos</p>
                          <div className="flex flex-col gap-1.5">
                            {historial.turnos.map(t=>(
                              <div key={t.id} className="flex items-center gap-3 text-sm bg-gray-50 rounded-lg px-3 py-2">
                                <span className="font-mono text-xs text-p-ink2 shrink-0">{t.fecha.split('-').reverse().join('/')}</span>
                                <span className="flex-1 text-p-ink truncate">{t.trabajo ?? '—'}</span>
                                <span className={`text-xs font-bold px-2 py-0.5 rounded-full shrink-0 ${t.estado==='hecho'?'bg-green-100 text-green-700':t.estado==='confirmado'?'bg-blue-100 text-blue-700':'bg-gray-100 text-gray-600'}`}>{t.estado}</span>
                                {t.precio_acordado && <span className="font-mono text-xs font-bold shrink-0">{moneyARS(t.precio_acordado)}</span>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Presupuestos */}
                      {historial.presupuestos.length > 0 && (
                        <div>
                          <p className="text-xs font-bold text-p-ink2 uppercase tracking-wider mb-2">📋 Presupuestos</p>
                          <div className="flex flex-col gap-1.5">
                            {historial.presupuestos.map(p=>(
                              <div key={p.id} className="flex items-center gap-3 text-sm bg-gray-50 rounded-lg px-3 py-2">
                                <span className="font-mono text-xs text-p-ink2 shrink-0">{p.fecha.split('-').reverse().join('/')}</span>
                                <span className="flex-1 text-p-ink truncate">{p.vehiculo ?? '—'}</span>
                                <span className="font-mono text-xs font-bold shrink-0">{moneyARS(p.total)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {!historial.turnos.length && !historial.presupuestos.length && !historial.ordenes.length && (
                        <p className="text-sm text-p-gray text-center py-2">Sin historial registrado todavía.</p>
                      )}
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          )})}
        </div>
      )}

      {/* Modal editar/nuevo */}
      <Modal open={open} onClose={()=>setOpen(false)} title={selected && open ? 'Editar cliente' : 'Nuevo cliente'}>
        <div className="flex flex-col gap-3">
          <Field label="CUIT / CUIL">
            <Input value={form.cuit} onChange={e=>setForm(p=>({...p,cuit:formatCuit(e.target.value)}))} placeholder="20-12345678-9" maxLength={13}/>
            {form.cuit && (
              <div className={`mt-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ${cuitCheck.ok?'bg-green-50 text-green-700 border border-green-200':'bg-red-50 text-red-700 border border-red-200'}`}>
                {cuitCheck.ok ? '✓ ' : '⚠ '}{cuitCheck.msg}
              </div>
            )}
          </Field>
          <Field label="Nombre *"><Input value={form.nombre} onChange={e=>setForm(p=>({...p,nombre:e.target.value}))} placeholder="Nombre y apellido"/></Field>
          <Field label="WhatsApp"><Input type="tel" value={form.telefono} onChange={e=>setForm(p=>({...p,telefono:e.target.value}))} placeholder="54 9 2302…"/></Field>
          <Field label="Email"><Input type="email" value={form.email} onChange={e=>setForm(p=>({...p,email:e.target.value}))} placeholder="opcional"/></Field>
          <Field label="Tipo de cliente">
            <select value={form.tipo_cliente_id} onChange={e=>setForm(p=>({...p,tipo_cliente_id:e.target.value}))}
              className="w-full border border-p-line rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-p-green">
              <option value="">Sin tipo</option>
              {tipos.map(t=><option key={t.id} value={t.id}>{t.nombre}</option>)}
            </select>
          </Field>
          <Field label="Dirección"><Input value={form.direccion} onChange={e=>setForm(p=>({...p,direccion:e.target.value}))} placeholder="Calle, localidad…"/></Field>
          <Field label="Notas"><Input value={form.notas} onChange={e=>setForm(p=>({...p,notas:e.target.value}))} placeholder="Vehículo habitual, observaciones…"/></Field>
          <div className="border-t border-p-line pt-3">
            <label className="flex items-center gap-3 cursor-pointer mb-2">
              <input type="checkbox" checked={form.tiene_cuenta_corriente} onChange={e=>setForm(p=>({...p,tiene_cuenta_corriente:e.target.checked}))} className="accent-p-green w-4 h-4"/>
              <span className="text-sm font-semibold text-p-ink">📒 Habilitar cuenta corriente</span>
            </label>
            {form.tiene_cuenta_corriente && !form.cuit && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-600 font-semibold mb-2">⚠ La cuenta corriente requiere CUIT/CUIL</div>
            )}
            {form.tiene_cuenta_corriente && (<>
              <Field label="Plazo en días"><Input type="number" value={String(form.plazo_cc_dias)} onChange={e=>setForm(p=>({...p,plazo_cc_dias:+e.target.value||30}))} placeholder="30"/></Field>
              <Field label="Tope de crédito ($)"><Input type="number" value={form.tope_credito} onChange={e=>setForm(p=>({...p,tope_credito:e.target.value}))} placeholder="Sin límite"/></Field>
            </>)}
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={()=>setOpen(false)} style={btnGray}>Cancelar</button>
            <button onClick={save} disabled={saving} style={{...btn,opacity:saving?.6:1}}>{saving?'Guardando…':'Guardar'}</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
