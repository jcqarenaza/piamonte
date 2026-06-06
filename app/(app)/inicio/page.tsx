export const dynamic = 'force-dynamic'
import { createClient } from '@/lib/supabase/server'
import { fmtFecha, moneyARS, todayStr } from '@/lib/utils/format'
import Link from 'next/link'
import type { Turno, Venta } from '@/lib/types/database'

export default async function InicioPage() {
  const supabase = await createClient()
  const today = todayStr()
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowStr = tomorrow.toISOString().slice(0, 10)

  // Recordatorios: turnos de mañana
  const { data: recordatorios } = await supabase
    .from('turnos')
    .select('*')
    .eq('fecha', tomorrowStr)
    .neq('estado', 'hecho')
    .order('hora')

  // Turnos de hoy
  const { data: turnosHoy } = await supabase
    .from('turnos')
    .select('*')
    .eq('fecha', today)
    .order('hora')

  // Ventas de hoy (KPIs)
  const { data: ventasHoy } = await supabase
    .from('ventas')
    .select('precio, costo, pendiente')
    .eq('fecha', today)

  // Ventas pendientes (sin costo)
  const { count: pendientes } = await supabase
    .from('ventas')
    .select('*', { count: 'exact', head: true })
    .eq('pendiente', true)

  // Stock sin costo
  const { count: stockSinCosto } = await supabase
    .from('stock')
    .select('*', { count: 'exact', head: true })
    .gt('cantidad', 0)
    .is('costo', null)

  // Cotización hoy
  const { data: cotiz } = await supabase
    .from('cotizaciones')
    .select('blue, oficial, mep, fecha')
    .order('fecha', { ascending: false })
    .limit(1)
    .single()

  // KPIs del día
  const ventas = ventasHoy || []
  const facturado = ventas.reduce((a, v) => a + (v.precio || 0), 0)
  const costo = ventas.filter(v => !v.pendiente).reduce((a, v) => a + (v.costo || 0), 0)
  const ganancia = facturado - costo
  const diasStr = fmtFecha(today)

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="font-saira font-bold text-2xl text-p-ink">Hola 👋</h1>
          <p className="text-p-ink2 text-sm capitalize">{diasStr}</p>
        </div>
        <Link
          href="/buscar"
          className="bg-p-green text-white font-saira font-bold text-sm px-5 py-2.5 rounded-xl hover:bg-p-dark transition-colors"
        >
          + Atender cliente
        </Link>
      </div>

      {/* Cotización dólar */}
      {cotiz && (
        <div className="bg-p-light border border-p-line rounded-xl px-4 py-2.5 flex gap-5 flex-wrap text-sm mb-6">
          <span className="text-p-ink2 font-semibold text-xs uppercase tracking-wider">💵 Dólar</span>
          <span className="text-p-ink2">Blue <b className="font-mono text-p-ink">${cotiz.blue?.toLocaleString('es-AR')}</b></span>
          <span className="text-p-ink2">Oficial <b className="font-mono text-p-ink">${cotiz.oficial?.toLocaleString('es-AR')}</b></span>
          <span className="text-p-ink2">MEP <b className="font-mono text-p-ink">${cotiz.mep?.toLocaleString('es-AR')}</b></span>
        </div>
      )}

      {/* Alarmas */}
      <div className="flex flex-col gap-2 mb-6">
        {(pendientes || 0) > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center justify-between gap-4">
            <div>
              <span className="font-saira font-bold text-amber-700">⚠️ {pendientes} venta(s) sin costo</span>
              <p className="text-xs text-amber-600">Falta el costo para calcular la ganancia real.</p>
            </div>
            <Link href="/caja" className="text-xs font-semibold text-amber-700 underline whitespace-nowrap">Ir a Caja</Link>
          </div>
        )}
        {(stockSinCosto || 0) > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center justify-between gap-4">
            <div>
              <span className="font-saira font-bold text-amber-700">📦 {stockSinCosto} en stock sin costo</span>
              <p className="text-xs text-amber-600">No suman al valor del inventario.</p>
            </div>
            <Link href="/stock" className="text-xs font-semibold text-amber-700 underline whitespace-nowrap">Ir a Stock</Link>
          </div>
        )}
      </div>

      {/* KPIs del día */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Facturado hoy', value: moneyARS(facturado), accent: false },
          { label: 'Costo de lo vendido', value: moneyARS(costo), accent: false },
          { label: 'Ganancia del día', value: moneyARS(ganancia), accent: true },
          { label: 'Operaciones', value: `${ventas.length}`, accent: false },
        ].map(k => (
          <div key={k.label} className={`rounded-xl border px-4 py-4 ${k.accent ? 'border-p-green bg-p-light' : 'border-p-line bg-white'}`}>
            <p className={`font-saira font-bold text-2xl ${k.accent ? 'text-p-dark' : 'text-p-ink'}`}>{k.value}</p>
            <p className="text-xs text-p-ink2 uppercase tracking-wider mt-1">{k.label}</p>
          </div>
        ))}
      </div>

      {/* Grid: recordatorios + turnos hoy */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Recordatorios */}
        <div className="bg-white border border-p-line rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-saira font-bold text-base text-p-dark">📲 Recordar hoy</h2>
            <span className="bg-p-light text-p-dark text-xs font-mono px-2 py-0.5 rounded-full">{recordatorios?.length ?? 0}</span>
          </div>
          <p className="text-xs text-p-ink2 mb-3">Turnos de mañana — tocá WhatsApp para enviar el mensaje.</p>
          {recordatorios && recordatorios.length > 0 ? (
            <div className="flex flex-col gap-2">
              {recordatorios.map((t: Turno) => (
                <TurnoMiniCard key={t.id} turno={t} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-p-gray text-center py-6">No hay turnos para mañana.</p>
          )}
        </div>

        {/* Turnos de hoy */}
        <div className="bg-white border border-p-line rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-saira font-bold text-base text-p-ink">Turnos de hoy</h2>
            <span className="bg-p-graybg text-p-ink2 text-xs font-mono px-2 py-0.5 rounded-full">{turnosHoy?.length ?? 0}</span>
          </div>
          {turnosHoy && turnosHoy.length > 0 ? (
            <div className="flex flex-col gap-2">
              {turnosHoy.map((t: Turno) => (
                <TurnoMiniCard key={t.id} turno={t} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-p-gray text-center py-6">No hay turnos para hoy.</p>
          )}
        </div>
      </div>
    </div>
  )
}

function TurnoMiniCard({ turno }: { turno: Turno }) {
  const waNum = (turno.telefono || '').replace(/[^0-9]/g, '')
  const msg = `¡Hola ${turno.cliente || ''}! Te recordamos tu turno en Parabrisas El Piamonte para el ${fmtFecha(turno.fecha)} a las ${turno.hora || '--:--'} hs. Trabajo: ${turno.trabajo || 'el trabajo acordado'}${turno.vehiculo ? ` en tu ${turno.vehiculo}` : ''}. ¡Gracias!`
  const waUrl = waNum ? `https://wa.me/${waNum}?text=${encodeURIComponent(msg)}` : null

  const estadoColor: Record<string, string> = {
    pendiente:   'bg-gray-100 text-gray-600',
    confirmado:  'bg-p-light text-p-dark',
    hecho:       'bg-green-100 text-green-700',
    ausente:     'bg-red-100 text-red-600',
  }

  return (
    <div className="flex items-center gap-3 p-3 bg-p-paper rounded-lg">
      <div className="text-center min-w-[40px]">
        <p className="font-mono font-bold text-p-ink text-sm">{turno.hora?.slice(0,5) || '—'}</p>
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm text-p-ink truncate">{turno.cliente || '(sin nombre)'}</p>
        <p className="text-xs text-p-ink2 truncate">{turno.trabajo || '—'}{turno.vehiculo ? ` · ${turno.vehiculo}` : ''}</p>
      </div>
      <div className="flex items-center gap-2">
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${estadoColor[turno.estado] || 'bg-gray-100 text-gray-600'}`}>
          {turno.estado}
        </span>
        {waUrl && (
          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-[#25d366] text-white text-xs font-bold px-2 py-1 rounded-lg"
          >
            WA
          </a>
        )}
      </div>
    </div>
  )
}
