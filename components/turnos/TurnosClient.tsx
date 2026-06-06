'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Turno } from '@/lib/types/database'
import { Btn, Modal, Field, Input, Select, Badge, Empty } from '@/components/ui'
import { fmtFecha, todayStr } from '@/lib/utils/format'

const ESTADOS = ['pendiente', 'confirmado', 'hecho', 'ausente'] as const

function buildWaMsg(t: Turno) {
  return `¡Hola ${t.cliente || ''}! Te recordamos tu turno en *Parabrisas El Piamonte* para el ${fmtFecha(t.fecha)} a las ${t.hora?.slice(0, 5) || '--:--'} hs. Trabajo: ${t.trabajo || 'el trabajo acordado'}${t.vehiculo ? ` en tu ${t.vehiculo}` : ''}${t.patente ? ` (${t.patente})` : ''}. ¡Hasta entonces!`
}

export default function TurnosClient({ initialTurnos, userId }: { initialTurnos: Turno[]; userId: string }) {
  const [turnos, setTurnos] = useState<Turno[]>(initialTurnos)
  const [fecha, setFecha] = useState(todayStr())
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Turno | null>(null)
  const supabase = createClient()

  const [form, setForm] = useState({
    cliente: '', telefono: '', vehiculo: '', patente: '',
    trabajo: '', fecha: todayStr(), hora: '', precio_acordado: '', notas: '',
    estado: 'pendiente' as Turno['estado']
  })

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('turnos').select('*').eq('fecha', fecha).order('hora', { ascending: true, nullsFirst: true })
    setTurnos(data ?? [])
    setLoading(false)
  }, [fecha, supabase])

  useEffect(() => { load() }, [load])

  function openNew() {
    setEditing(null)
    setForm({ cliente: '', telefono: '', vehiculo: '', patente: '', trabajo: '', fecha, hora: '', precio_acordado: '', notas: '', estado: 'pendiente' })
    setOpen(true)
  }

  function openEdit(t: Turno) {
    setEditing(t)
    setForm({
      cliente: t.cliente ?? '', telefono: t.telefono ?? '', vehiculo: t.vehiculo ?? '',
      patente: t.patente ?? '', trabajo: t.trabajo ?? '', fecha: t.fecha,
      hora: t.hora?.slice(0, 5) ?? '', precio_acordado: t.precio_acordado?.toString() ?? '',
      notas: t.notas ?? '', estado: t.estado
    })
    setOpen(true)
  }

  async function save() {
    const payload = {
      cliente: form.cliente, telefono: form.telefono, vehiculo: form.vehiculo,
      patente: form.patente.toUpperCase(), trabajo: form.trabajo,
      fecha: form.fecha, hora: form.hora || null, notas: form.notas,
      precio_acordado: form.precio_acordado ? +form.precio_acordado.replace(/[^0-9.]/g, '') : null,
      estado: form.estado, user_id: userId
    }
    if (editing) {
      await supabase.from('turnos').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', editing.id)
    } else {
      await supabase.from('turnos').insert(payload)
    }
    setOpen(false)
    load()
  }

  async function setEstado(id: string, estado: Turno['estado']) {
    await supabase.from('turnos').update({ estado, updated_at: new Date().toISOString() }).eq('id', id)
    setTurnos(prev => prev.map(t => t.id === id ? { ...t, estado } : t))
  }

  async function del(id: string) {
    if (!confirm('¿Borrar turno?')) return
    await supabase.from('turnos').delete().eq('id', id)
    setTurnos(prev => prev.filter(t => t.id !== id))
  }

  const f = (k: keyof typeof form, v: string) => setForm(p => ({ ...p, [k]: v }))

  // navegar días
  function changeDay(delta: number) {
    const d = new Date(fecha + 'T12:00:00')
    d.setDate(d.getDate() + delta)
    setFecha(d.toISOString().slice(0, 10))
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <button onClick={() => changeDay(-1)} className="p-1.5 rounded-lg border border-p-line hover:bg-p-light">←</button>
          <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
            className="border border-p-line rounded-lg px-3 py-1.5 text-sm font-mono text-p-ink focus:outline-none focus:border-p-green" />
          <button onClick={() => changeDay(1)} className="p-1.5 rounded-lg border border-p-line hover:bg-p-light">→</button>
          <button onClick={() => setFecha(todayStr())} className="text-xs text-p-ink2 hover:text-p-ink underline">Hoy</button>
        </div>
        <Btn onClick={openNew}>+ Nuevo turno</Btn>
      </div>

      {/* Título del día */}
      <p className="text-sm text-p-ink2 capitalize mb-4">{fmtFecha(fecha)} · {turnos.length} turno(s)</p>

      {/* Lista */}
      {loading ? <p className="text-sm text-p-gray py-8 text-center">Cargando…</p> :
        turnos.length === 0 ? <Empty msg="Sin turnos para este día. ¡Agendá uno!" /> :
          <div className="flex flex-col gap-3">
            {turnos.map(t => <TurnoCard key={t.id} turno={t} onEdit={() => openEdit(t)} onDel={() => del(t.id)} onEstado={setEstado} />)}
          </div>
      }

      {/* Modal */}
      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'Editar turno' : 'Nuevo turno'}>
        <div className="flex flex-col gap-3">
          <Field label="Cliente"><Input value={form.cliente} onChange={e => f('cliente', e.target.value)} placeholder="Nombre y apellido" /></Field>
          <Field label="WhatsApp"><Input value={form.telefono} onChange={e => f('telefono', e.target.value)} placeholder="54 9 2302 …" type="tel" /></Field>
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
            <Field label="Estado">
              <Select value={form.estado} onChange={e => f('estado', e.target.value)}>
                {ESTADOS.map(e => <option key={e}>{e}</option>)}
              </Select>
            </Field>
          </div>
          <Field label="Notas"><Input value={form.notas} onChange={e => f('notas', e.target.value)} placeholder="Observaciones opcionales" /></Field>
          <div className="flex justify-end gap-2 pt-2">
            <Btn variant="secondary" onClick={() => setOpen(false)}>Cancelar</Btn>
            <Btn onClick={save}>Guardar</Btn>
          </div>
        </div>
      </Modal>
    </div>
  )
}

function TurnoCard({ turno: t, onEdit, onDel, onEstado }: {
  turno: Turno; onEdit: () => void; onDel: () => void; onEstado: (id: string, e: Turno['estado']) => void
}) {
  const waNum = (t.telefono ?? '').replace(/[^0-9]/g, '')
  const waUrl = waNum ? `https://wa.me/${waNum}?text=${encodeURIComponent(buildWaMsg(t))}` : null

  return (
    <div className="bg-white border border-p-line rounded-xl p-4 shadow-sm flex gap-3 flex-wrap">
      {/* Hora */}
      <div className="text-center min-w-[44px]">
        <p className="font-mono font-bold text-p-ink text-base">{t.hora?.slice(0, 5) ?? '—'}</p>
      </div>
      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-saira font-bold text-p-ink">{t.cliente ?? '(sin nombre)'}</p>
          <Badge label={t.estado} />
        </div>
        <p className="text-sm text-p-ink2 truncate mt-0.5">{t.trabajo ?? '—'}</p>
        <p className="text-xs text-p-gray mt-0.5">
          {[t.vehiculo, t.patente, t.precio_acordado ? '$' + Math.round(t.precio_acordado).toLocaleString('es-AR') : null].filter(Boolean).join(' · ')}
        </p>
      </div>
      {/* Acciones */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Estados rápidos */}
        {(['confirmado', 'hecho'] as Turno['estado'][]).map(e => (
          <button key={e} onClick={() => onEstado(t.id, t.estado === e ? 'pendiente' : e)}
            className={`text-xs font-bold px-2 py-1 rounded-lg border transition-colors ${t.estado === e ? 'bg-p-green text-white border-p-green' : 'border-p-line text-p-ink2 hover:bg-p-light'}`}>
            {e === 'confirmado' ? 'conf.' : 'hecho'}
          </button>
        ))}
        {waUrl && (
          <a href={waUrl} target="_blank" rel="noopener noreferrer"
            className="bg-[#25d366] text-white text-xs font-bold px-2.5 py-1 rounded-lg">WA</a>
        )}
        <button onClick={onEdit} className="text-xs text-p-ink2 hover:text-p-ink border border-p-line rounded-lg px-2 py-1">✏</button>
        <button onClick={onDel} className="text-xs text-red-400 hover:text-red-600 border border-red-200 rounded-lg px-2 py-1">✕</button>
      </div>
    </div>
  )
}
