'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { moneyARS } from '@/lib/utils/format'

interface TipoCliente { id: string; nombre: string; margen_pct: number }
interface Pieza {
  id: string; proveedor: string; codigo: string | null
  descripcion: string; pos: string | null; costo_neto: number
  lista_nombre: string | null; es_promo: boolean; grupo_id: number | null
}

const PROV_COLOR: Record<string, string> = {
  GAMMA: '#166534', MALATESTA: '#1e40af', SEKURIT: '#5b21b6'
}
const TIPO_ORDER = ['Particular', 'Compañías', 'Chapista']
const TIPO_ICON: Record<string, string> = { Particular: '👤', Compañías: '🏢', Chapista: '🔧' }

const IVA_RATE = 0.21
// Tipos que ven precio con IVA discriminado
const TIPOS_CON_IVA_DISCRIMINADO = ['Compañías', 'Chapista']

function calcPrecios(costo: number, margen: number, cfg: { recargo_tarjeta_pct: number; descuento_transferencia_pct: number; descuento_efectivo_pct: number }) {
  const tarjeta     = Math.round(costo * (1 + margen) * (1 + cfg.recargo_tarjeta_pct / 100))
  const transferencia = Math.round(tarjeta * (1 - cfg.descuento_transferencia_pct / 100))
  const efectivo    = Math.round(tarjeta * (1 - cfg.descuento_efectivo_pct / 100))
  return { tarjeta, transferencia, efectivo }
}
// Backward compat
function precioVenta(costo: number, margen: number) {
  return Math.round(costo * (1 + margen))
}
function precioSinIva(precio: number) {
  return Math.round(precio / (1 + IVA_RATE))
}
function ivaMonto(precio: number) {
  return precio - precioSinIva(precio)
}

export default function PreciosClient({ rol = 'ventas' }: { rol?: string }) {
  const esGerencial = rol === 'gerencial' || rol === 'admin'
  const [q, setQ]           = useState('')
  const [configPrecios, setConfigPrecios] = useState({
    recargo_tarjeta_pct: 35,
    descuento_transferencia_pct: 15,
    descuento_efectivo_pct: 25,
  })
  const [piezas, setPiezas] = useState<Pieza[]>([])
  const [tipos, setTipos]   = useState<TipoCliente[]>([])
  const [loading, setLoading] = useState(false)
  const [tipoSel, setTipoSel] = useState<string>('todos')
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    supabase.from('config_precios').select('*').eq('id', 1).maybeSingle()
      .then(({ data }) => { if (data) setConfigPrecios(data) })
  }, [supabase])

  useEffect(() => {
    supabase.from('tipos_cliente').select('*').order('nombre')
      .then(({ data }) => {
        // Ordenar según TIPO_ORDER
        const sorted = TIPO_ORDER
          .map(n => (data ?? []).find((t: TipoCliente) => t.nombre === n))
          .filter(Boolean) as TipoCliente[]
        // Agregar los que no están en TIPO_ORDER al final
        const resto = (data ?? []).filter((t: TipoCliente) => !TIPO_ORDER.includes(t.nombre))
        setTipos([...sorted, ...resto])
      })
  }, [supabase])

  const POS_KW: Record<string,string> = {
    'PARA':'PARABRISAS','PARABRISA':'PARABRISAS','PARABRISAS':'PARABRISAS',
    'LUNETA':'LUNETA','LU':'LUNETA','REAR':'LUNETA',
    'LATERAL':'LATERAL','LA':'LATERAL','LAT':'LATERAL',
    'ALETA':'ALETA_D','AD':'ALETA_D','AT':'ALETA_T',
  }

  const buscar = useCallback(async () => {
    if (q.trim().length < 2) { setPiezas([]); return }
    setLoading(true)
    const words = q.toUpperCase().split(/\s+/).filter(Boolean)
    const posWord = words.find(w => POS_KW[w])
    const nonPos  = words.filter(w => !POS_KW[w])
    const pos     = posWord ? POS_KW[posWord] : null
    const first   = nonPos[0] || words[0]
    const rest    = nonPos.slice(1)

    let query = supabase.from('catalogo')
      .select('id,proveedor,codigo,descripcion,pos,costo_neto,lista_nombre,es_promo,grupo_id')
      .or(`descripcion.ilike.%${first}%,codigo.ilike.%${first}%,marca.ilike.%${first}%`)
      .order('proveedor').limit(300)
    if (pos) query = query.eq('pos', pos)

    const { data } = await query
    const filtered = (data ?? []).filter((p: any) =>
      rest.every((w: string) =>
        (p.descripcion || '').toUpperCase().includes(w) || (p.marca || '').toUpperCase().includes(w)
      )
    ) as Pieza[]
    // Deduplicar por descripcion+pos — un precio por proveedor (el más barato)
    const map = new Map<string, Pieza>()
    for (const p of filtered) {
      const k = `${p.proveedor}|${p.descripcion}`
      if (!map.has(k) || p.costo_neto < map.get(k)!.costo_neto) map.set(k, p)
    }
    setPiezas([...map.values()])
    setLoading(false)
  }, [q, supabase])

  useEffect(() => {
    const t = setTimeout(buscar, 300)
    return () => clearTimeout(t)
  }, [buscar])

  // Agrupar piezas por descripción para mostrar comparativa entre proveedores
  const grupos = new Map<string, Pieza[]>()
  for (const p of piezas) {
    const k = p.descripcion
    if (!grupos.has(k)) grupos.set(k, [])
    grupos.get(k)!.push(p)
  }
  const gruposArr = [...grupos.entries()].sort((a, b) => b[1].length - a[1].length)

  function irAPresupuesto(pieza: Pieza, tipo: TipoCliente) {
    const precios = calcPrecios(pieza.costo_neto, tipo.margen_pct, configPrecios)
    const params = new URLSearchParams({
      pieza_id: pieza.id,
      pieza_desc: pieza.descripcion,
      pieza_precio: String(precios.tarjeta),
      pieza_precio_transf: String(precios.transferencia),
      pieza_precio_efect: String(precios.efectivo),
      tipo_id: tipo.id,
      tipo_nombre: tipo.nombre,
    })
    router.push(`/presupuestos?${params.toString()}`)
  }

  return (
    <div>
      {/* Chips tipo cliente */}
      <div className="flex gap-2 flex-wrap mb-5">
        <button onClick={() => setTipoSel('todos')}
          style={{ background: tipoSel === 'todos' ? '#0C1810' : '#fff', color: tipoSel === 'todos' ? '#fff' : '#4A6655', border: '1.5px solid #C2DDD0', borderRadius: 20, padding: '6px 16px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
          Todos los tipos
        </button>
        {tipos.map(t => (
          <button key={t.id} onClick={() => setTipoSel(tipoSel === t.id ? 'todos' : t.id)}
            style={{ background: tipoSel === t.id ? '#00A550' : '#fff', color: tipoSel === t.id ? '#fff' : '#4A6655', border: `1.5px solid ${tipoSel === t.id ? '#00A550' : '#C2DDD0'}`, borderRadius: 20, padding: '6px 16px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            {TIPO_ICON[t.nombre] || '👥'} {t.nombre} {esGerencial && <span style={{ opacity: 0.7, fontWeight: 400 }}>+{Math.round(t.margen_pct * 100)}%</span>}
          </button>
        ))}
      </div>

      {/* Búsqueda */}
      <input value={q} onChange={e => setQ(e.target.value)}
        placeholder="Buscá una pieza: ford focus parabrisas, vw gol luneta…"
        className="w-full border-2 border-p-line focus:border-p-green rounded-xl px-4 py-3 text-sm mb-5 bg-white outline-none shadow-sm"/>

      {loading && <p className="text-sm text-p-gray text-center py-8">Buscando…</p>}

      {!loading && piezas.length > 0 && (
        <div className="flex flex-col gap-4">
          {gruposArr.map(([desc, items]) => {
            const bestCosto = Math.min(...items.map(p => p.costo_neto))

            return (
              <div key={desc} className="bg-white border border-p-line rounded-xl overflow-hidden shadow-sm">
                {/* Header pieza */}
                <div className="px-4 py-3 border-b border-p-line2 bg-p-light">
                  <p className="font-saira font-bold text-p-ink">{desc}</p>
                  <p className="text-xs text-p-ink2 mt-0.5">
                    {items[0].pos} · {items.length} {items.length === 1 ? 'proveedor' : 'proveedores'} ·{' '}
                    {esGerencial && <span className="text-p-green font-semibold">mejor costo {moneyARS(bestCosto)}</span>}
                  </p>
                </div>

                {/* Precios por proveedor */}
                <div className="divide-y divide-p-line2">
                  {items.map(pieza => (
                    <div key={pieza.id}>
                      {/* Fila proveedor */}
                      <div className="flex items-center gap-3 px-4 py-2 bg-gray-50/60">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white shrink-0"
                          style={{ background: PROV_COLOR[pieza.proveedor] || '#6b7280' }}>
                          {pieza.proveedor}{pieza.es_promo ? ' · OFERTA' : ''}
                        </span>
                        {pieza.codigo && <span className="font-mono text-[10px] text-p-ink2">{pieza.codigo}</span>}
                        {pieza.lista_nombre && <span className="text-[10px] text-p-ink2">{pieza.lista_nombre}</span>}
                        {esGerencial && <span className="ml-auto text-[10px] text-p-ink2">Costo: <span className="font-mono font-bold text-p-dark">{moneyARS(pieza.costo_neto)}</span></span>}
                      </div>

                      {/* Precios por tipo de cliente */}
                      <div className={`grid gap-0 ${tipoSel === 'todos' ? 'grid-cols-1 md:grid-cols-3' : 'grid-cols-1'}`}>
                        {tipos
                          .filter(t => tipoSel === 'todos' || t.id === tipoSel)
                          .map((tipo, idx) => {
                            const precio = precioVenta(pieza.costo_neto, tipo.margen_pct)
                            const isBest = pieza.costo_neto === bestCosto
                            return (
                              <div key={tipo.id}
                                className={`flex items-center justify-between px-4 py-3 border-t border-p-line2 ${idx > 0 ? 'md:border-l' : ''} ${isBest ? 'bg-green-50/50' : ''}`}>
                                <div>
                                  <p className="text-[11px] font-semibold text-p-ink2">
                                    {TIPO_ICON[tipo.nombre] || '👥'} {tipo.nombre}
                                    {esGerencial && <span className="text-p-gray ml-1">+{Math.round(tipo.margen_pct * 100)}%</span>}
                                  </p>
                                  <p className={`font-saira font-bold text-xl mt-0.5 ${isBest ? 'text-p-green' : 'text-p-ink'}`}>
                                    {moneyARS(precio)}
                                  </p>
                                  {TIPOS_CON_IVA_DISCRIMINADO.includes(tipo.nombre) && (
                                    <div className="mt-0.5 text-[10px] text-p-ink2 leading-tight">
                                      <span>Neto: <span className="font-mono font-semibold">{moneyARS(precioSinIva(precio))}</span></span>
                                      <span className="mx-1">·</span>
                                      <span>IVA 21%: <span className="font-mono font-semibold">{moneyARS(ivaMonto(precio))}</span></span>
                                    </div>
                                  )}
                                </div>
                                <button onClick={() => irAPresupuesto(pieza, tipo)}
                                  style={{ background: '#00A550', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 14px', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                                  → Presupuesto
                                </button>
                              </div>
                            )
                          })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {q.length >= 2 && !loading && piezas.length === 0 && (
        <p className="text-center text-sm text-p-gray py-10">Sin resultados para "{q}".</p>
      )}

      {q.length < 2 && (
        <div className="text-center py-16 text-p-gray">
          <p className="text-4xl mb-3">💰</p>
          <p className="font-saira font-bold text-p-ink text-lg">Calculadora de precios</p>
          <p className="text-sm mt-1 max-w-md mx-auto">Buscá una pieza y ves el precio de venta para cada tipo de cliente con el margen aplicado automáticamente.</p>
        </div>
      )}
    </div>
  )
}
