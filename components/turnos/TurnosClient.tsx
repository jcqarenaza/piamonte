'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import type { Turno } from '@/lib/types/database'
import { Btn, Modal, Field, Input, Select, Badge, Empty } from '@/components/ui'
import { fmtFecha, todayStr } from '@/lib/utils/format'
import { useOnlineStatus } from '@/lib/offline/useOnlineStatus'
import { OfflineBanner, SyncingBanner } from '@/lib/offline/OfflineBanner'
import {
  cacheTurnosDelDia, getTurnosDelDiaCache,
  agregarTurnoPendiente, getTurnosPendientes, quitarTurnoPendiente,
  precargarTurnosRango, getTurnosPrecargaMeta,
  type TurnoPendiente
} from '@/lib/offline/db'

const ESTADOS = ['pendiente', 'confirmado', 'hecho', 'ausente'] as const

function buildWaMsg(t: Turno) {
  return `¡Hola ${t.cliente || ''}! Te recordamos tu turno en *Parabrisas El Piamonte* para el ${fmtFecha(t.fecha)} a las ${t.hora?.slice(0,5) || '--:--'} hs. Trabajo: ${t.trabajo || 'el trabajo acordado'}${t.vehiculo ? ` en tu ${t.vehiculo}` : ''}${t.patente ? ` (${t.patente})` : ''}. ¡Hasta entonces!`
}
function buildWaMsgListo(t: Turno) {
  return `Nos comunicamos de *El Piamonte*. Para informarle que su vehículo/producto está listo.${t.vehiculo ? ` (${t.vehiculo}${t.patente ? ' - ' + t.patente : ''})` : ''} Puede pasar a retirarlo dentro de nuestro horario de lunes a viernes de 8:00 a 12:00 y de 14:30 a 19:30 hs.`
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
  const isOnline = useOnlineStatus()
  const [pendientes, setPendientes] = useState<TurnoPendiente[]>([])
  const [sincronizando, setSincronizando] = useState(false)
  const supabase = createClient()
  const router   = useRouter()

  const emptyForm = { cliente: '', telefono: '', vehiculo: '', patente: '', trabajo: '', fecha, hora: '', precio_acordado: '', notas: '', estado: 'pendiente' as Turno['estado'] }
  const [form, setForm] = useState(emptyForm)

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3000)
  }

  const load = useCallback(async () => {
    setLoading(true)
    if (!isOnline) {
      // Sin conexión: mostrar lo último cacheado para esta fecha, sin pegarle a Supabase
      const cache = await getTurnosDelDiaCache(fecha)
      setTurnos(cache ?? [])
      setLoading(false)
      return
    }
    const { data, error } = await supabase.from('turnos').select('*').eq('fecha', fecha).order('hora', { ascending: true, nullsFirst: true })
    if (error) {
      showToast('Error al cargar turnos: ' + error.message, false)
      // Si falla la red a mitad de camino, caemos al cache como respaldo
      const cache = await getTurnosDelDiaCache(fecha)
      if (cache) setTurnos(cache)
    } else {
      setTurnos(data ?? [])
      cacheTurnosDelDia(fecha, data ?? [])
    }
    setLoading(false)
  }, [fecha, supabase, isOnline])

  useEffect(() => { load() }, [load])

  // Cargar la cola de pendientes al montar, y cada vez que cambia el estado de conexión
  useEffect(() => {
    getTurnosPendientes().then(setPendientes)
  }, [isOnline])

  // Precarga automática: trae los turnos de los próximos 14 días de una sola consulta y los guarda
  // en el dispositivo, agrupados por fecha. Así, si se corta la conexión, no solo el día que estabas
  // mirando queda disponible — cualquiera de esos 14 días se puede ver y agendar turnos nuevos.
  // Se repite como máximo una vez por hora para no recargar la red constantemente.
  useEffect(() => {
    if (!isOnline) return
    let cancelado = false
    async function precargar() {
      const ultimaPrecarga = await getTurnosPrecargaMeta()
      const haceMenosDeUnaHora = ultimaPrecarga && (Date.now() - new Date(ultimaPrecarga).getTime()) < 60 * 60 * 1000
      if (haceMenosDeUnaHora) return

      const desde = todayStr()
      const hastaDate = new Date(); hastaDate.setDate(hastaDate.getDate() + 14)
      const hasta = hastaDate.toISOString().slice(0,10)

      const { data } = await supabase.from('turnos').select('*')
        .gte('fecha', desde).lte('fecha', hasta)
        .order('fecha').order('hora', { ascending: true, nullsFirst: true })

      if (cancelado || !data) return

      const porFecha: Record<string, any[]> = {}
      for (const t of data) {
        if (!porFecha[t.fecha]) porFecha[t.fecha] = []
        porFecha[t.fecha].push(t)
      }
      precargarTurnosRango(porFecha)
    }
    precargar()
    return () => { cancelado = true }
  }, [isOnline, supabase])

  // Sincronización automática al recuperar conexión
  useEffect(() => {
    if (!isOnline) return
    let cancelado = false
    async function sincronizar() {
      const pend = await getTurnosPendientes()
      if (pend.length === 0) return
      setSincronizando(true)
      for (const p of pend) {
        try {
          if (p.accion === 'insert') {
            const { error } = await supabase.from('turnos').insert(p.payload)
            if (error) {
              // Conflicto de horario u otro error — dejamos el pendiente para revisión manual, no lo perdemos
              console.error('No se pudo sincronizar turno offline:', error.message)
              continue
            }
          } else if (p.accion === 'update' && p.turno_id) {
            await supabase.from('turnos').update(p.payload).eq('id', p.turno_id)
          } else if (p.accion === 'delete' && p.turno_id) {
            await supabase.from('turnos').delete().eq('id', p.turno_id)
          }
          await quitarTurnoPendiente(p.local_id)
        } catch (e) {
          console.error('Error sincronizando turno offline:', e)
        }
      }
      if (!cancelado) {
        setSincronizando(false)
        const restantes = await getTurnosPendientes()
        setPendientes(restantes)
        if (restantes.length === 0) showToast('Cambios sincronizados ✓')
        load()
      }
    }
    sincronizar()
    return () => { cancelado = true }
  }, [isOnline, supabase, load])

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

    if (!isOnline) {
      // Sin conexión: guardamos en la cola local y mostramos el turno como "tentativo" en pantalla.
      // Se sincroniza solo apenas vuelve la señal.
      const localId = `offline_${Date.now()}_${Math.random().toString(36).slice(2)}`
      if (editing) {
        await agregarTurnoPendiente({ local_id: localId, accion: 'update', turno_id: editing.id, payload, fecha: form.fecha, created_at: new Date().toISOString() })
        setTurnos(prev => prev.map(t => t.id === editing.id ? { ...t, ...payload } as Turno : t))
      } else {
        await agregarTurnoPendiente({ local_id: localId, accion: 'insert', payload, fecha: form.fecha, created_at: new Date().toISOString() })
        const tentativo = { ...payload, id: localId, created_at: new Date().toISOString() } as unknown as Turno
        if (form.fecha === fecha) setTurnos(prev => [...prev, tentativo].sort((a,b) => (a.hora||'').localeCompare(b.hora||'')))
      }
      setPendientes(await getTurnosPendientes())
      showToast(editing ? 'Guardado sin conexión — se sincroniza al volver internet' : 'Turno agendado sin conexión — pendiente de sincronizar')
      setOpen(false)
      return
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
    if (!isOnline) { showToast('Sin conexión — este cambio necesita internet', false); return }
    const { error } = await supabase.from('turnos').update({ estado, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) { showToast('Error: ' + error.message, false); return }
    setTurnos(prev => prev.map(t => t.id === id ? { ...t, estado } : t))
  }

  async function del(id: string) {
    if (!isOnline) { showToast('Sin conexión — borrar necesita internet', false); return }
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
      {!isOnline && <OfflineBanner pendientes={pendientes.length} />}
      {isOnline && sincronizando && <SyncingBanner count={pendientes.length} />}

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
          {turnos.map(t => {
            const esTentativo = String(t.id).startsWith('offline_')
            return (
            <div key={t.id} onDoubleClick={()=>!esTentativo && openEdit(t)} title={esTentativo?undefined:"Doble click para editar"}
              className={`bg-white border rounded-xl p-4 shadow-sm flex gap-3 flex-wrap ${esTentativo ? 'border-amber-300 border-dashed' : 'border-p-line'}`}>
              <div className="text-center min-w-[44px]">
                <p className="font-mono font-bold text-p-ink text-base">{t.hora?.slice(0,5) ?? '—'}</p>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-saira font-bold text-p-ink">{t.cliente ?? '(sin nombre)'}</p>
                  <Badge label={t.estado} />
                  {esTentativo && <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">⏳ Sin sincronizar</span>}
                </div>
                <p className="text-sm text-p-ink2 mt-0.5">{t.trabajo ?? '—'}</p>
                <p className="text-xs text-p-gray mt-0.5">
                  {[t.vehiculo, t.patente, t.precio_acordado ? '$' + Math.round(t.precio_acordado).toLocaleString('es-AR') : null].filter(Boolean).join(' · ')}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {!esTentativo && (<>
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
                </>)}
                {/* WA */}
                {t.telefono ? (
                  <a href={`https://wa.me/${t.telefono.replace(/[^0-9]/g,'')}?text=${encodeURIComponent(t.estado === 'hecho' ? buildWaMsgListo(t) : buildWaMsg(t))}`}
                    target="_blank" rel="noopener noreferrer"
                    style={{background:'#25d366',color:'#fff',border:'none',borderRadius:8,padding:'6px 12px',fontWeight:700,fontSize:12,textDecoration:'none',display:'inline-block'}}>
                    {t.estado === 'hecho' ? '✅ WA' : 'WA'}
                  </a>
                ) : (
                  <span style={{background:'#f3f4f6',color:'#d1d5db',border:'1px solid #e5e7eb',borderRadius:8,padding:'6px 12px',fontWeight:700,fontSize:12}}>WA</span>
                )}
                {!esTentativo && (<>
                <button onClick={() => openEdit(t)}
                  style={{background:'#fff',color:'#6b7280',border:'1px solid #e5e7eb',borderRadius:8,padding:'6px 10px',fontSize:11,cursor:'pointer'}}>
                  ✏
                </button>
                {/* OS: si ya tiene OS → navegar, sino → crear nueva */}
                <button onClick={()=>{
                  if ((t as any).os_id) {
                    router.push(`/ordenes?q=${encodeURIComponent(t.cliente||'')}`)
                  } else {
                    const params = new URLSearchParams({
                      cli: t.cliente||'', tel: t.telefono||'', veh: t.vehiculo||'',
                      pat: t.patente||'', turno_id: t.id,
                    })
                    router.push(`/ordenes?${params.toString()}`)
                  }
                }} style={{background:(t as any).os_id?'#059669':'#1d4ed8',color:'#fff',border:'none',borderRadius:8,padding:'6px 10px',fontWeight:700,fontSize:11,cursor:'pointer'}}
                title={(t as any).os_id ? 'Ver Orden de Servicio' : 'Generar Orden de Servicio'}>
                  {(t as any).os_id ? '📋 OS →' : '📋 OS'}
                </button>
                <button onClick={() => del(t.id)}
                  style={{background:'#fff',color:'#ef4444',border:'1px solid #fecaca',borderRadius:8,padding:'6px 10px',fontSize:11,cursor:'pointer'}}>
                  ✕
                </button>
                </>)}
              </div>
            </div>
            )
          })}
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
