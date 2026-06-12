'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Turno } from '@/lib/types/database'
import { Btn, Modal, Field, Input, Select, Badge, Empty } from '@/components/ui'
import { fmtFecha, todayStr } from '@/lib/utils/format'

const ESTADOS = ['pendiente', 'confirmado', 'hecho', 'ausente'] as const

function buildWaMsg(t: Turno) {
  return `¡Hola ${t.cliente || ''}! Te recordamos tu turno en *Parabrisas El Piamonte* para el ${fmtFecha(t.fecha)} a las ${t.hora?.slice(0,5) || '--:--'} hs. Trabajo: ${t.trabajo || 'el trabajo acordado'}${t.vehiculo ? ` en tu ${t.vehiculo}` : ''}${t.patente ? ` (${t.patente})` : ''}. ¡Hasta entonces!`
}

function Toast({ msg, ok }: { msg: string; ok: boolean }) {
  return (
    <div className={`fixed bottom-24 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-semibold text-white ${ok ? 'bg-p-green' : 'bg-red-500'}`}>
      {msg}
    </div>
  )
}

export default function TurnosClient({ initialTurnos, userId }: { initialTurnos: Turno[]; userId: string }) {
  const [turnos, setTurnos]   = useState<Turno[]>(initialTurnos)
  const [fecha, setFecha]     = useState(todayStr())
  const [loading, setLoading] = useState(false)
  const [open, setOpen]       = useState(false)
  const [editing, setEditing] = useState<Turno | null>(null)
  const [toast, setToast]     = useState<{ msg: string; ok: boolean } | null>(null)
  const supabase = createClient()

  const emptyForm = { cliente: '', telefono: '', vehiculo: '', patente: '', trabajo: '', fecha, hora: '', precio_acordado: '', notas: '', estado: 'pendiente' as Turno['estado'] }
  const [form, setForm] = useState(emptyForm)

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3000)
  }

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.from('turnos').select('*').eq('fecha', fecha).order('hora', { ascending: true, nullsFirst: true })
    if (error) showToast('Error al cargar turnos: ' + error.message, false)
    else setTurnos(data ?? [])
    setLoading(false)
  }, [fecha, supabase])

  useEffect(() => { load() }, [load])

  function openNew() {
    setEditing(null)
    setForm({ ...emptyForm, fecha })
    setOpen(true)
  }

  function openEdit(t: Turno) {
    setEditing(t)
    setForm({
      cliente: t.cliente ?? '', telefono: t.telefono ?? '', vehiculo: t.vehiculo ?? '',
      patente: t.patente ?? '', trabajo: t.trabajo ?? '', fecha: t.fecha,
      hora: t.hora?.slice(0,5) ?? '', precio_acordado: t.precio_acordado?.toString() ?? '',
      notas: t.notas ?? '', estado: t.estado
    })
    setOpen(true)
  }

  async function save() {
    if (!form.cliente && !form.telefono) { showToast('Cargá al menos el nombre o teléfono', false); return }
    if (!form.fecha) { showToast('La fecha es obligatoria', false); return }
    const payload = {
      cliente: form.cliente || null, telefono: form.telefono || null,
      vehiculo: form.vehiculo || null, patente: form.patente.toUpperCase() || null,
      trabajo: form.trabajo || null, fecha: form.fecha,
      hora: form.hora || null, notas: form.notas || null,
      precio_acordado: form.precio_acordado ? +form.precio_acordado.replace(/[^0-9.]/g,'') : null,
      estado: form.estado, user_id: userId, updated_at: new Date().toISOString()
    }
    if (editing) {
      const { error } = await supabase.from('turnos').update(payload).eq('id', editing.id)
      if (error) { showToast('Error al guardar: ' + error.message, false); return }
      showToast('Turno actualizado ✓')
    } else {
      const { error } = await supabase.from('turnos').insert(payload)
      if (error) { showToast('Error al guardar: ' + error.message, false); return }
      showToast('Turno agendado ✓')
    }
    setOpen(false); load()
  }

  async function setEstado(id: string, estado: Turno['estado']) {
    const { error } = await supabase.from('turnos').update({ estado, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) { showToast('Error: ' + error.message, false); return }
    setTurnos(prev => prev.map(t => t.id === id ? { ...t, estado } : t))
  }

  async function del(id: string) {
    if (!confirm('¿Borrar este turno?')) return
    const { error } = await supabase.from('turnos').delete().eq('id', id)
    if (error) { showToast('Error al borrar: ' + error.message, false); return }
    setTurnos(prev => prev.filter(t => t.id !== id))
    showToast('Turno eliminado')
  }

  const f = (k: keyof typeof form, v: string) => setForm(p => ({ ...p, [k]: v }))

  function changeDay(delta: number) {
    const d = new Date(fecha + 'T12:00:00'); d.setDate(d.getDate() + delta)
    setFecha(d.toISOString().slice(0,10))
  }

  return (
    <div>
      {toast && <Toast msg={toast.msg} ok={toast.ok} />}

      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <button onClick={() => changeDay(-1)} className="p-1.5 rounded-lg border border-p-line hover:bg-p-light text-lg">←</button>
          <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
            className="border border-p-line rounded-lg px-3 py-1.5 text-sm font-mono text-p-ink focus:outline-none focus:border-p-green" />
          <button onClick={() => changeDay(1)} className="p-1.5 rounded-lg border border-p-line hover:bg-p-light text-lg">→</button>
          <button onClick={() => setFecha(todayStr())} className="text-xs text-p-ink2 hover:text-p-ink underline">Hoy</button>
        </div>
        <button onClick={openNew} style={{ background:"#00A550", color:"#fff", border:"none", borderRadius:10, padding:"10px 20px", fontWeight:700, fontSize:14, cursor:"pointer" }}>+ Nuevo turno</button>
      </div>

      <p className="text-sm text-p-ink2 mb-4">{fmtFecha(fecha)} · {turnos.length} {turnos.length === 1 ? "turno" : "turnos"}</p>

      {loading ? (
        <p className="text-sm text-p-gray py-8 text-center">Cargando…</p>
      ) : turnos.length === 0 ? (
        <Empty msg="Sin turnos para este día. ¡Agendá uno!" />
      ) : (
        <div className="flex flex-col gap-3">
          {turnos.map(t => (
            <div key={t.id} className="bg-white border border-p-line rounded-xl p-4 shadow-sm flex gap-3 flex-wrap">
              <div className="text-center min-w-[44px]">
                <p className="font-mono font-bold text-p-ink text-base">{t.hora?.slice(0,5) ?? '—'}</p>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-saira font-bold text-p-ink">{t.cliente ?? '(sin nombre)'}</p>
                  <Badge label={t.estado} />
                </div>
                <p className="text-sm text-p-ink2 mt-0.5">{t.trabajo ?? '—'}</p>
                <p className="text-xs text-p-gray mt-0.5">
                  {[t.vehiculo, t.patente, t.precio_acordado ? '$' + Math.round(t.precio_acordado).toLocaleString('es-AR') : null].filter(Boolean).join(' · ')}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {/* Botón acción principal según estado */}
                {t.estado === 'pendiente' && (
                  <button onClick={() => setEstado(t.id, 'confirmado')}
                    style={{background:'#1d4ed8',color:'#fff',border:'none',borderRadius:8,padding:'6px 14px',fontWeight:700,fontSize:12,cursor:'pointer',whiteSpace:'nowrap'}}>
                    ✓ Confirmar
                  </button>
                )}
                {t.estado === 'confirmado' && (
                  <button onClick={() => setEstado(t.id, 'hecho')}
                    style={{background:'#00A550',color:'#fff',border:'none',borderRadius:8,padding:'6px 14px',fontWeight:700,fontSize:12,cursor:'pointer',whiteSpace:'nowrap'}}>
                    ✓ Hecho
                  </button>
                )}
                {(t.estado === 'hecho' || t.estado === 'ausente') && (
                  <button onClick={() => setEstado(t.id, 'pendiente')}
                    style={{background:'#f3f4f6',color:'#6b7280',border:'1px solid #e5e7eb',borderRadius:8,padding:'6px 14px',fontWeight:700,fontSize:12,cursor:'pointer',whiteSpace:'nowrap'}}>
                    ↩ Reabrir
                  </button>
                )}
                {/* Marcar ausente — solo desde pendiente/confirmado */}
                {(t.estado === 'pendiente' || t.estado === 'confirmado') && (
                  <button onClick={() => setEstado(t.id, 'ausente')}
                    style={{background:'#fff',color:'#ef4444',border:'1px solid #fecaca',borderRadius:8,padding:'6px 10px',fontWeight:700,fontSize:11,cursor:'pointer'}}>
                    Ausente
                  </button>
                )}
                {/* WA */}
                {t.telefono ? (
                  <a href={`https://wa.me/${t.telefono.replace(/[^0-9]/g,'')}?text=${encodeURIComponent(buildWaMsg(t))}`}
                    target="_blank" rel="noopener noreferrer"
                    style={{background:'#25d366',color:'#fff',border:'none',borderRadius:8,padding:'6px 12px',fontWeight:700,fontSize:12,textDecoration:'none',display:'inline-block'}}>
                    WA
                  </a>
                ) : (
                  <span style={{background:'#f3f4f6',color:'#d1d5db',border:'1px solid #e5e7eb',borderRadius:8,padding:'6px 12px',fontWeight:700,fontSize:12}}>WA</span>
                )}
                <button onClick={() => openEdit(t)}
                  style={{background:'#fff',color:'#6b7280',border:'1px solid #e5e7eb',borderRadius:8,padding:'6px 10px',fontSize:11,cursor:'pointer'}}>
                  ✏
                </button>
                <button onClick={() => del(t.id)}
                  style={{background:'#fff',color:'#ef4444',border:'1px solid #fecaca',borderRadius:8,padding:'6px 10px',fontSize:11,cursor:'pointer'}}>
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'Editar turno' : 'Nuevo turno'}>
        <div className="flex flex-col gap-3">
          <Field label="Cliente"><Input value={form.cliente} onChange={e => f('cliente', e.target.value)} placeholder="Nombre y apellido" /></Field>
          <Field label="WhatsApp"><Input type="tel" value={form.telefono} onChange={e => f('telefono', e.target.value)} placeholder="54 9 2302 …" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Vehículo"><Input value={form.vehiculo} onChange={e => f('vehiculo', e.target.value)} placeholder="VW Gol 2015" /></Field>
            <Field label="Patente"><Input value={form.patente} onChange={e => f('patente', e.target.value.toUpperCase())} placeholder="AB123CD" /></Field>
          </div>
          <Field label="Trabajo / pieza"><Input value={form.trabajo} onChange={e => f('trabajo', e.target.value)} placeholder="Parabrisas + colocación" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Fecha"><Input type="date" value={form.fecha} onChange={e => f('fecha', e.target.value)} /></Field>
            <Field label="Hora"><Input type="time" value={form.hora} onChange={e => f('hora', e.target.value)} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Precio acordado"><Input value={form.precio_acordado} onChange={e => f('precio_acordado', e.target.value)} placeholder="$" /></Field>
            <Field label="Estado"><Select value={form.estado} onChange={e => f('estado', e.target.value)}>{ESTADOS.map(e => <option key={e}>{e}</option>)}</Select></Field>
          </div>
          <Field label="Notas"><Input value={form.notas} onChange={e => f('notas', e.target.value)} placeholder="Observaciones opcionales" /></Field>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setOpen(false)} style={{background:'#6b7280',color:'#fff',border:'none',borderRadius:8,padding:'9px 20px',fontWeight:700,fontSize:14,cursor:'pointer'}}>Cancelar</button>
            <button onClick={save} style={{background:'#00A550',color:'#fff',border:'none',borderRadius:8,padding:'9px 20px',fontWeight:700,fontSize:14,cursor:'pointer'}}>Guardar turno</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
