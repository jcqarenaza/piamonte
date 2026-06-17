'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Btn, Modal, Field, Input, Empty } from '@/components/ui'
import { moneyARS, todayStr } from '@/lib/utils/format'

interface Cliente { id:string; nombre:string; telefono:string|null; email:string|null; cuit:string|null; notas:string|null; tipo_cliente_id:string|null; created_at:string; tiene_cuenta_corriente:boolean; plazo_cc_dias:number; tope_credito:number|null }
interface Historial {
  turnos: { id:string; fecha:string; trabajo:string|null; estado:string; precio_acordado:number|null }[]
  presupuestos: { id:string; fecha:string; total:number; vehiculo:string|null }[]
  ordenes: { id:string; numero:string; fecha:string; total:number; aseguradora:string|null }[]
}

export default function ClientesClient({ userId }: { userId:string }) {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [tipos, setTipos] = useState<{id:string;nombre:string}[]>([])
  const [q, setQ]               = useState('')
  const [open, setOpen]         = useState(false)
  const [selected, setSelected] = useState<Cliente|null>(null)
  const [historial, setHistorial] = useState<Historial|null>(null)
  const [loadingHist, setLoadingHist] = useState(false)
  const [saving, setSaving]     = useState(false)
  const supabase = createClient()

  const [form, setForm] = useState({ nombre:'', telefono:'', email:'', notas:'', cuit:'', tipo_cliente_id:'', tiene_cuenta_corriente:false, plazo_cc_dias:30, tope_credito:'' })

  const load = useCallback(async () => {
    supabase.from('tipos_cliente').select('id,nombre').order('nombre').then(({data})=>setTipos(data??[]))
    const query = supabase.from('clientes').select('*').order('nombre')
    if (q.trim()) query.ilike('nombre', `%${q}%`)
    const { data } = await query.limit(50)
    setClientes(data ?? [])
  }, [q, supabase])

  useEffect(() => { load() }, [load])

  async function save() {
    if (!form.nombre.trim()) return
    setSaving(true)
    if (selected?.id) {
      await supabase.from('clientes').update({ nombre:form.nombre, telefono:form.telefono||null, email:form.email||null, cuit:form.cuit||null, notas:form.notas||null, tipo_cliente_id:form.tipo_cliente_id||null, tiene_cuenta_corriente:form.tiene_cuenta_corriente, plazo_cc_dias:form.plazo_cc_dias, tope_credito:form.tope_credito?+form.tope_credito:null }).eq('id', selected.id)
    } else {
      await supabase.from('clientes').insert({ nombre:form.nombre, telefono:form.telefono||null, email:form.email||null, cuit:form.cuit||null, notas:form.notas||null, tipo_cliente_id:form.tipo_cliente_id||null, tiene_cuenta_corriente:form.tiene_cuenta_corriente, plazo_cc_dias:form.plazo_cc_dias, tope_credito:form.tope_credito?+form.tope_credito:null, user_id:userId })
    }
    setSaving(false); setOpen(false)
    setForm({ nombre:'', telefono:'', email:'', cuit:'', notas:'', tipo_cliente_id:'', tiene_cuenta_corriente:false, plazo_cc_dias:30, tope_credito:'' })
    load()
  }

  async function loadHistorial(c: Cliente) {
    if (selected?.id === c.id) { setSelected(null); setHistorial(null); return }
    setSelected(c); setLoadingHist(true); setHistorial(null)
    const nombre = c.nombre
    const [t, p, o] = await Promise.all([
      supabase.from('turnos').select('id,fecha,trabajo,estado,precio_acordado').ilike('cliente', `%${nombre}%`).order('fecha', {ascending:false}).limit(10),
      supabase.from('presupuestos').select('id,fecha,total,vehiculo').ilike('cliente', `%${nombre}%`).order('fecha', {ascending:false}).limit(10),
      supabase.from('ordenes_servicio').select('id,numero,fecha,total,aseguradora').ilike('cliente', `%${nombre}%`).order('fecha', {ascending:false}).limit(10),
    ])
    setHistorial({ turnos:t.data??[], presupuestos:p.data??[], ordenes:o.data??[] })
    setLoadingHist(false)
  }

  async function del(id:string) {
    if (!confirm('¿Borrar cliente?')) return
    await supabase.from('clientes').delete().eq('id', id)
    setClientes(prev => prev.filter(c => c.id !== id))
    if (selected?.id === id) { setSelected(null); setHistorial(null) }
  }

  const total = historial ? [
    ...historial.turnos.filter(t=>t.precio_acordado).map(t=>t.precio_acordado!),
    ...historial.presupuestos.map(p=>p.total),
    ...historial.ordenes.map(o=>o.total),
  ].reduce((a,b)=>a+b, 0) : 0

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar cliente…"
          className="flex-1 min-w-[200px] border border-p-line rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-p-green" />
        <button onClick={()=>{ setForm({ nombre:'', telefono:'', email:'', cuit:'', notas:'', tipo_cliente_id:'', tiene_cuenta_corriente:false, plazo_cc_dias:30, tope_credito:'' }); setOpen(true) }}
          style={{ background:'#00A550', color:'#fff', border:'none', borderRadius:10, padding:'10px 20px', fontWeight:700, fontSize:14, cursor:'pointer' }}>
          + Nuevo cliente
        </button>
      </div>

      {clientes.length === 0 ? (
        <Empty msg={q ? `Sin resultados para "${q}"` : 'Sin clientes todavía. Agregá el primero.'} />
      ) : (
        <div className="flex flex-col gap-2">
          {clientes.map(c => (
            <div key={c.id}>
              <div className={`bg-white border rounded-xl px-4 py-3 shadow-sm flex items-center gap-3 flex-wrap cursor-pointer transition-colors ${selected?.id===c.id ? 'border-p-green bg-p-light/30' : 'border-p-line hover:bg-p-light/20'}`}
                onClick={() => loadHistorial(c)}>
                <div className="w-9 h-9 rounded-full bg-p-green flex items-center justify-center text-white font-saira font-bold shrink-0">
                  {c.nombre.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-saira font-bold text-p-ink">{c.nombre}</p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <p className="text-xs text-p-ink2">{[c.telefono, c.email].filter(Boolean).join(' · ') || 'Sin contacto'}</p>
                    {c.tipo_cliente_id && tipos.find(t=>t.id===c.tipo_cliente_id) && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-p-light text-p-dark">
                        {tipos.find(t=>t.id===c.tipo_cliente_id)?.nombre}
                      </span>
                    )}
                    {c.tiene_cuenta_corriente && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                        📒 CC {c.plazo_cc_dias}d
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {c.telefono && (
                    <a href={`https://wa.me/${c.telefono.replace(/[^0-9]/g,'')}`} target="_blank" rel="noopener noreferrer"
                      onClick={e=>e.stopPropagation()}
                      className="bg-[#25d366] text-white text-xs font-bold px-2.5 py-1 rounded-lg">WA</a>
                  )}
                  <button onClick={e=>{ e.stopPropagation(); setForm({ nombre:c.nombre, telefono:c.telefono??'', email:c.email??'', cuit:c.cuit??'', notas:c.notas??'', tipo_cliente_id:c.tipo_cliente_id??'', tiene_cuenta_corriente:c.tiene_cuenta_corriente??false, plazo_cc_dias:c.plazo_cc_dias??30, tope_credito:c.tope_credito?String(c.tope_credito):'' }); setSelected(c); setOpen(true) }}
                    className="text-xs border border-p-line rounded-lg px-2 py-1 text-p-ink2 hover:bg-p-light">✏</button>
                  <button onClick={e=>{ e.stopPropagation(); del(c.id) }}
                    className="text-xs border border-red-200 rounded-lg px-2 py-1 text-red-400 hover:text-red-600">✕</button>
                </div>
              </div>

              {/* Historial expandido */}
              {selected?.id === c.id && (
                <div className="border border-t-0 border-p-green rounded-b-xl bg-white px-4 py-4 -mt-1">
                  {loadingHist ? (
                    <p className="text-sm text-p-gray text-center py-4">Cargando historial…</p>
                  ) : historial ? (
                    <div className="flex flex-col gap-4">
                      {/* Resumen */}
                      {total > 0 && (
                        <div className="bg-p-light rounded-xl px-4 py-3 flex items-center justify-between">
                          <p className="text-sm text-p-ink2 font-semibold">Facturado total histórico</p>
                          <p className="font-saira font-bold text-xl text-p-dark">{moneyARS(total)}</p>
                        </div>
                      )}

                      {/* Turnos */}
                      {historial.turnos.length > 0 && (
                        <div>
                          <p className="text-xs font-bold text-p-ink2 uppercase tracking-wider mb-2">📅 Turnos</p>
                          <div className="flex flex-col gap-1.5">
                            {historial.turnos.map(t => (
                              <div key={t.id} className="flex items-center gap-3 text-sm bg-gray-50 rounded-lg px-3 py-2">
                                <span className="font-mono text-xs text-p-ink2 shrink-0">{t.fecha.split('-').reverse().join('/')}</span>
                                <span className="flex-1 text-p-ink truncate">{t.trabajo ?? '—'}</span>
                                <span className={`text-xs font-bold px-2 py-0.5 rounded-full shrink-0 ${t.estado==='hecho'?'bg-green-100 text-green-700':t.estado==='confirmado'?'bg-blue-100 text-blue-700':'bg-gray-100 text-gray-600'}`}>{t.estado}</span>
                                {t.precio_acordado && <span className="font-mono text-xs font-bold text-p-ink shrink-0">{moneyARS(t.precio_acordado)}</span>}
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
                            {historial.presupuestos.map(p => (
                              <div key={p.id} className="flex items-center gap-3 text-sm bg-gray-50 rounded-lg px-3 py-2">
                                <span className="font-mono text-xs text-p-ink2 shrink-0">{p.fecha.split('-').reverse().join('/')}</span>
                                <span className="flex-1 text-p-ink truncate">{p.vehiculo ?? '—'}</span>
                                <span className="font-mono text-xs font-bold text-p-ink shrink-0">{moneyARS(p.total)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Órdenes */}
                      {historial.ordenes.length > 0 && (
                        <div>
                          <p className="text-xs font-bold text-p-ink2 uppercase tracking-wider mb-2">🔧 Órdenes de servicio</p>
                          <div className="flex flex-col gap-1.5">
                            {historial.ordenes.map(o => (
                              <div key={o.id} className="flex items-center gap-3 text-sm bg-gray-50 rounded-lg px-3 py-2">
                                <span className="font-mono text-xs font-bold text-p-dark shrink-0">{o.numero}</span>
                                <span className="font-mono text-xs text-p-ink2 shrink-0">{o.fecha.split('-').reverse().join('/')}</span>
                                <span className="flex-1 text-p-ink truncate">{o.aseguradora ?? '—'}</span>
                                <span className="font-mono text-xs font-bold text-p-ink shrink-0">{moneyARS(o.total)}</span>
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
          ))}
        </div>
      )}

      <Modal open={open} onClose={()=>setOpen(false)} title={selected && open ? 'Editar cliente' : 'Nuevo cliente'}>
        <div className="flex flex-col gap-3">
          <Field label="Nombre *"><Input value={form.nombre} onChange={e=>setForm(p=>({...p,nombre:e.target.value}))} placeholder="Nombre y apellido" /></Field>
          <Field label="WhatsApp"><Input type="tel" value={form.telefono} onChange={e=>setForm(p=>({...p,telefono:e.target.value}))} placeholder="54 9 2302…" /></Field>
          <Field label="Email"><Input type="email" value={form.email} onChange={e=>setForm(p=>({...p,email:e.target.value}))} placeholder="opcional" /></Field>
          <Field label="Tipo de cliente">
            <select value={form.tipo_cliente_id} onChange={e=>setForm(p=>({...p,tipo_cliente_id:e.target.value}))}
              className="w-full border border-p-line rounded-lg px-3 py-2 text-sm text-p-ink focus:outline-none focus:border-p-green bg-white">
              <option value="">Sin tipo</option>
              {tipos.map(t=><option key={t.id} value={t.id}>{t.nombre}</option>)}
            </select>
          </Field>
          <Field label="CUIT / CUIL"><Input value={form.cuit} onChange={e=>setForm(p=>({...p,cuit:e.target.value}))} placeholder="20-12345678-9" /></Field>
          <Field label="Notas"><Input value={form.notas} onChange={e=>setForm(p=>({...p,notas:e.target.value}))} placeholder="Vehículo habitual, observaciones…" /></Field>
          <div style={{borderTop:'1px solid #e5e7eb',paddingTop:12,marginTop:4}}>
            <label style={{display:'flex',alignItems:'center',gap:10,cursor:'pointer',marginBottom:8}}>
              <input type="checkbox" checked={form.tiene_cuenta_corriente}
                onChange={e=>setForm(p=>({...p,tiene_cuenta_corriente:e.target.checked}))}
                className="accent-p-green w-4 h-4"/>
              <span style={{fontSize:14,fontWeight:600,color:'#111827'}}>📒 Habilitar cuenta corriente</span>
            </label>
            {form.tiene_cuenta_corriente && !form.cuit && (
              <div style={{background:'#fee2e2',borderRadius:8,padding:'8px 12px',fontSize:12,color:'#dc2626',fontWeight:600}}>
                ⚠️ La cuenta corriente requiere CUIT o CUIL del cliente
              </div>
            )}
            {form.tiene_cuenta_corriente && (
              <Field label="Plazo en días (alerta de vencimiento)">
                <Input type="number" value={String(form.plazo_cc_dias)}
                  onChange={e=>setForm(p=>({...p,plazo_cc_dias:+e.target.value||30}))}
                  placeholder="30"/>
              </Field>
              <Field label="Tope de crédito ($)">
                <Input type="number" value={form.tope_credito}
                  onChange={e=>setForm(p=>({...p,tope_credito:e.target.value}))}
                  placeholder="Ej: 500000 (dejar vacío = sin límite)"/>
              </Field>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={()=>setOpen(false)} style={{background:'#6b7280',color:'#fff',border:'none',borderRadius:8,padding:'9px 20px',fontWeight:700,fontSize:14,cursor:'pointer'}}>Cancelar</button>
            <button onClick={save} disabled={saving} style={{background:'#00A550',color:'#fff',border:'none',borderRadius:8,padding:'9px 20px',fontWeight:700,fontSize:14,cursor:saving?'not-allowed':'pointer',opacity:saving?0.6:1}}>{saving?'Guardando…':'Guardar'}</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
