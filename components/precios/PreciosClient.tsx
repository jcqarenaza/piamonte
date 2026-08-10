'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { moneyARS } from '@/lib/utils/format'
import { useOnlineStatus } from '@/lib/offline/useOnlineStatus'
import { OfflineBanner } from '@/lib/offline/OfflineBanner'
import { precargarCatalogoCompleto, getCatalogoMeta, buscarEnCatalogoCompleto } from '@/lib/offline/db'

interface TipoCliente { id: string; nombre: string; margen_pct: number }
interface PrecioProveedor {
  proveedor: string; codigo: string | null; costo_neto: number; lista_nombre: string | null; es_promo: boolean; costo_anterior: number | null
}
interface Articulo {
  id: string; sku_interno: string | null; codigo_referencia: string | null
  descripcion: string; pos: string | null
  precios: PrecioProveedor[]
}

const PROV_COLOR: Record<string, string> = {
  GAMMA: '#166534', MALATESTA: '#1e40af', SEKURIT: '#5b21b6'
}
const TIPO_ORDER = ['Particular', 'Chapista']
const TIPO_ICON: Record<string, string> = { Particular: '👤', Chapista: '🔧' }

const IVA_RATE = 0.21
const TIPOS_CON_IVA_DISCRIMINADO = ['Chapista']

// El costo_neto ya incluye flete (se aplica al importar las listas)
// NO volver a sumar flete acá
function calcPrecios(costo: number, margen: number, flete: number, cfg: { recargo_tarjeta_pct: number; descuento_transferencia_pct: number; descuento_efectivo_pct: number }) {
  const costoReal = costo // flete ya incluido en costo_neto
  const tarjeta     = Math.round(costoReal * (1 + margen) * (1 + cfg.recargo_tarjeta_pct / 100))
  const transferencia = Math.round(tarjeta * (1 - cfg.descuento_transferencia_pct / 100))
  const efectivo    = Math.round(tarjeta * (1 - cfg.descuento_efectivo_pct / 100))
  return { tarjeta, transferencia, efectivo, costoReal: Math.round(costoReal) }
}
function precioSinIva(precio: number) {
  return Math.round(precio / (1 + IVA_RATE))
}
function ivaMonto(precio: number) {
  return precio - precioSinIva(precio)
}

// Agrupa las equivalencias "crudas" de un artículo en una fila por proveedor —
// si el mismo proveedor tiene varios códigos de variante para la misma pieza,
// nos quedamos con el costo más bajo de ese proveedor (no se muestran como filas separadas).
function dedupPorProveedor(equivalencias: any[]): PrecioProveedor[] {
  const porProveedor = new Map<string, PrecioProveedor>()
  for (const e of equivalencias) {
    if (e.costo_neto == null) continue
    const actual = porProveedor.get(e.proveedor)
    if (!actual || e.costo_neto < actual.costo_neto) {
      porProveedor.set(e.proveedor, {
        proveedor: e.proveedor, codigo: e.codigo_proveedor,
        costo_neto: e.costo_neto, lista_nombre: e.lista_nombre, es_promo: !!e.lista_nombre,
        costo_anterior: e.costo_anterior ?? null,
      })
    }
  }
  return [...porProveedor.values()].sort((a, b) => a.costo_neto - b.costo_neto)
}

export default function PreciosClient({ rol = 'ventas' }: { rol?: string }) {
  const esGerencial = rol === 'gerencial' || rol === 'admin'
  const [q, setQ]           = useState('')
  const [configPrecios, setConfigPrecios] = useState({
    recargo_tarjeta_pct: 35,
    descuento_transferencia_pct: 15,
    descuento_efectivo_pct: 25,
  })
  const [articulos, setArticulos] = useState<Articulo[]>([])
  const [tipos, setTipos]   = useState<TipoCliente[]>([])
  const [loading, setLoading] = useState(false)
  const [tipoSel, setTipoSel] = useState<string>('todos')
  const [precioInstalacion, setPrecioInstalacion] = useState(0)
  const [conInstalacion, setConInstalacion] = useState(true)
  const [fleteProv, setFleteProv] = useState<Record<string,number>>({})
  // Precios de venta a ASEGURADORAS (lista Pilkington importada) por código PLK
  const [asegPrecios, setAsegPrecios] = useState<Record<string, any>>({})
  useEffect(() => {
    if (!articulos.length) { setAsegPrecios({}); return }
    ;(async () => {
      const codes = Array.from(new Set(articulos.flatMap(a =>
        [a.codigo_referencia, ...a.precios.map(p => p.codigo)]
          .filter((c): c is string => !!c && /^\d{6}/.test(c)).map(c => c.toUpperCase())
      )))
      if (!codes.length) { setAsegPrecios({}); return }
      // Última vigencia disponible
      const { data: vig } = await supabase.from('precios_aseguradora')
        .select('vigencia').eq('lista','comun').order('vigencia',{ascending:false}).limit(1).maybeSingle()
      const vigencia = (vig as any)?.vigencia
      if (!vigencia) return
      const bases = Array.from(new Set(codes.map(c => c.slice(0,6))))
      const orFiltro = bases.map(b => `codigo.ilike.${b}%`).join(',')
      const { data: rows } = await supabase.from('precios_aseguradora')
        .select('codigo,descripcion,precio_siva,instalacion_siva,total_siva')
        .eq('lista','comun').eq('vigencia', vigencia).or(orFiltro).limit(200)
      const map: Record<string, any> = {}
      for (const r of (rows??[]) as any[]) {
        const cod = String(r.codigo||'').toUpperCase()
        map[cod] = { ...r, vigencia }                    // match exacto
        const base = cod.slice(0,6)
        if (!map[`~${base}`]) map[`~${base}`] = { ...r, vigencia }  // fallback por variante
      }
      setAsegPrecios(map)
    })()
  }, [articulos, supabase])
  // Busca el precio de aseguradora de un artículo: código exacto o variante de la misma base
  function asegDe(a: Articulo): { row:any; exacto:boolean } | null {
    const codes = [a.codigo_referencia, ...a.precios.map(p=>p.codigo)]
      .filter((c): c is string => !!c && /^\d{6}/.test(c)).map(c=>c.toUpperCase())
    for (const c of codes) if (asegPrecios[c]) return { row: asegPrecios[c], exacto: true }
    for (const c of codes) if (asegPrecios[`~${c.slice(0,6)}`]) return { row: asegPrecios[`~${c.slice(0,6)}`], exacto: false }
    return null
  }
  const isOnline = useOnlineStatus()
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    supabase.from('config_precios').select('*').eq('id', 1).maybeSingle()
      .then(({ data }) => { if (data) setConfigPrecios(data) })
    supabase.from('rubros_precio').select('precio_base').ilike('nombre','%nstalac%').eq('activo',true).maybeSingle()
      .then(({data}) => { if (data) setPrecioInstalacion(+(data as any).precio_base || 0) })
    supabase.from('proveedores_compra').select('nombre,flete_pct').eq('activo',true)
      .then(({data}) => {
        const m: Record<string,number> = {}
        for (const p of (data??[])) m[p.nombre] = +(p.flete_pct||0)
        setFleteProv(m)
      })
  }, [supabase])

  useEffect(() => {
    supabase.from('tipos_cliente').select('*').order('nombre')
      .then(({ data }) => {
        const sorted = TIPO_ORDER
          .map(n => (data ?? []).find((t: TipoCliente) => t.nombre === n))
          .filter(Boolean) as TipoCliente[]
        const resto = (data ?? []).filter((t: TipoCliente) => !TIPO_ORDER.includes(t.nombre) && t.nombre !== 'Compañías')
        setTipos([...sorted, ...resto])
      })
  }, [supabase])

  useEffect(() => {
    if (!isOnline) return
    let cancelado = false
    async function chequearYPrecargar() {
      const [artInfo, equivInfo, configInfo, tiposInfo] = await Promise.all([
        supabase.from('articulos_maestro').select('updated_at').order('updated_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('articulo_equivalencias').select('created_at').order('created_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('config_precios').select('updated_at').eq('id', 1).maybeSingle(),
        supabase.from('tipos_cliente').select('updated_at').order('updated_at', { ascending: false }).limit(1).maybeSingle(),
      ])
      const { count } = await supabase.from('articulos_maestro').select('id', { count: 'exact', head: true })

      const fingerprint = [
        count ?? 0,
        artInfo.data?.updated_at ?? '',
        equivInfo.data?.created_at ?? '',
        configInfo.data?.updated_at ?? '',
        tiposInfo.data?.updated_at ?? '',
      ].join('|')

      const meta = await getCatalogoMeta()
      if (meta?.fingerprint === fingerprint) return

      const { data } = await supabase.from('articulos_maestro')
        .select('id,sku_interno,codigo_referencia,descripcion,pos,articulo_equivalencias(proveedor,codigo_proveedor,costo_neto,lista_nombre,costo_anterior)')
        .eq('activo', true)
      if (!cancelado && data) {
        const piezasPlanas = data.flatMap((a: any) =>
          dedupPorProveedor(a.articulo_equivalencias ?? []).map((p: PrecioProveedor) => ({
            id: a.id, sku_interno: a.sku_interno, codigo_referencia: a.codigo_referencia,
            descripcion: a.descripcion, pos: a.pos,
            proveedor: p.proveedor, codigo: p.codigo, costo_neto: p.costo_neto,
            lista_nombre: p.lista_nombre, es_promo: p.es_promo, costo_anterior: p.costo_anterior,
          }))
        )
        precargarCatalogoCompleto(piezasPlanas, fingerprint)
      }
    }
    chequearYPrecargar()
    return () => { cancelado = true }
  }, [isOnline, supabase])

  const POS_KW: Record<string,string> = {
    'PARA':'PARABRISAS','PARABRISA':'PARABRISAS','PARABRISAS':'PARABRISAS',
    'LUNETA':'LUNETA','LU':'LUNETA','REAR':'LUNETA',
    'LATERAL':'LATERAL','LA':'LATERAL','LAT':'LATERAL',
    'ALETA':'ALETA_D','AD':'ALETA_D','AT':'ALETA_T',
  }

  function agruparPlanasEnArticulos(planas: any[]): Articulo[] {
    const porArticulo = new Map<string, Articulo>()
    for (const p of planas) {
      if (!porArticulo.has(p.id)) {
        porArticulo.set(p.id, {
          id: p.id, sku_interno: p.sku_interno, codigo_referencia: p.codigo_referencia,
          descripcion: p.descripcion, pos: p.pos, precios: [],
        })
      }
      porArticulo.get(p.id)!.precios.push({
        proveedor: p.proveedor, codigo: p.codigo, costo_neto: p.costo_neto,
        lista_nombre: p.lista_nombre, es_promo: p.es_promo, costo_anterior: p.costo_anterior ?? null,
      })
    }
    return [...porArticulo.values()]
  }

  const buscar = useCallback(async () => {
    if (q.trim().length < 2) { setArticulos([]); return }
    setLoading(true)

    if (!isOnline) {
      const planas = await buscarEnCatalogoCompleto(q.trim())
      setArticulos(agruparPlanasEnArticulos(planas))
      setLoading(false)
      return
    }

    const esCodigo = !/\s/.test(q.trim()) // sin espacios = posible código
    const words = q.toUpperCase().split(/\s+/).filter(Boolean)
    const posWord = words.find(w => POS_KW[w])
    const nonPos  = words.filter(w => !POS_KW[w])
    const pos     = posWord ? POS_KW[posWord] : null
    const first   = nonPos[0] || words[0]
    const rest    = nonPos.slice(1)

    // Si parece un código, buscar primero por codigo_proveedor en equivalencias
    if (esCodigo) {
      const { data: eqData } = await supabase.from('articulo_equivalencias')
        .select('articulo_id, proveedor, codigo_proveedor, costo_neto, lista_nombre')
        .ilike('codigo_proveedor', `%${q.trim()}%`).limit(50)
      if (eqData && eqData.length > 0) {
        const artIds = [...new Set(eqData.map((e:any) => e.articulo_id))]
        const { data: artData } = await supabase.from('articulos_maestro')
          .select('id,sku_interno,codigo_referencia,descripcion,pos,articulo_equivalencias(proveedor,codigo_proveedor,costo_neto,lista_nombre,costo_anterior)')
          .in('id', artIds).eq('activo', true)
        const resultado: Articulo[] = (artData ?? []).map((a: any) => ({
          id: a.id, sku_interno: a.sku_interno, codigo_referencia: a.codigo_referencia,
          descripcion: a.descripcion, pos: a.pos,
          precios: dedupPorProveedor(a.articulo_equivalencias ?? []),
        })).filter((a: Articulo) => a.precios.length > 0)
        setArticulos(resultado); setLoading(false); return
      }
    }

    let query = supabase.from('articulos_maestro')
      .select('id,sku_interno,codigo_referencia,descripcion,pos,articulo_equivalencias(proveedor,codigo_proveedor,costo_neto,lista_nombre,costo_anterior)')
      .eq('activo', true)
      .or(`descripcion.ilike.%${first}%,codigo_referencia.ilike.%${first}%,sku_interno.ilike.%${first}%`)
      .order('descripcion').limit(150)
    if (pos) query = query.eq('pos', pos)

    const { data, error } = await query
    if (error) {
      const planas = await buscarEnCatalogoCompleto(q.trim())
      setArticulos(agruparPlanasEnArticulos(planas))
      setLoading(false)
      return
    }

    const filtrados = (data ?? []).filter((a: any) =>
      rest.every((w: string) => (a.descripcion || '').toUpperCase().includes(w))
    )

    const resultado: Articulo[] = filtrados.map((a: any) => ({
      id: a.id, sku_interno: a.sku_interno, codigo_referencia: a.codigo_referencia,
      descripcion: a.descripcion, pos: a.pos,
      precios: dedupPorProveedor(a.articulo_equivalencias ?? []),
    })).filter((a: Articulo) => a.precios.length > 0)

    setArticulos(resultado)
    setLoading(false)
  }, [q, supabase, isOnline])

  useEffect(() => {
    const t = setTimeout(buscar, 300)
    return () => clearTimeout(t)
  }, [buscar])

  const articulosOrdenados = [...articulos].sort((a, b) => b.precios.length - a.precios.length)

  function irAPresupuesto(articulo: Articulo, precio: PrecioProveedor, tipo: TipoCliente) {
    const precios = calcPrecios(precio.costo_neto, tipo.margen_pct, fleteProv[precio.proveedor]||0, configPrecios)
    const params = new URLSearchParams({
      pieza_id: articulo.id,
      pieza_desc: articulo.descripcion,
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
      {!isOnline && <OfflineBanner />}
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

      <div className="flex gap-3 items-center mb-5 flex-wrap">
        <input value={q} onChange={e => setQ(e.target.value)}
          placeholder="Buscá una pieza: ford focus parabrisas, vw gol luneta…"
          className="flex-1 border-2 border-p-line focus:border-p-green rounded-xl px-4 py-3 text-sm bg-white outline-none shadow-sm min-w-[200px]"/>
        {precioInstalacion > 0 && (
          <label className="flex items-center gap-2 cursor-pointer bg-white border border-p-line rounded-xl px-4 py-3 shadow-sm select-none shrink-0">
            <input type="checkbox" checked={conInstalacion} onChange={e=>setConInstalacion(e.target.checked)} className="accent-p-green w-4 h-4"/>
            <span className="text-sm font-semibold text-p-ink">+ Instalación ({moneyARS(precioInstalacion)})</span>
          </label>
        )}
      </div>

      {loading && <p className="text-sm text-p-gray text-center py-8">Buscando…</p>}

      {!loading && articulosOrdenados.length > 0 && (
        <div className="flex flex-col gap-4">
          {articulosOrdenados.map((articulo) => {
            const bestCosto = Math.min(...articulo.precios.map(p => p.costo_neto))

            return (
              <div key={articulo.id} className="bg-white border border-p-line rounded-xl overflow-hidden shadow-sm">
                <div className="px-4 py-3 border-b border-p-line2 bg-p-light">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-saira font-bold text-p-ink">{articulo.descripcion}</p>
                    {esGerencial && articulo.sku_interno && (
                      <span className="text-[10px] font-mono bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{articulo.sku_interno}</span>
                    )}
                  </div>
                  <p className="text-xs text-p-ink2 mt-0.5">
                    {articulo.pos} · {articulo.precios.length} {articulo.precios.length === 1 ? 'proveedor' : 'proveedores'} ·{' '}
                    {esGerencial && <span className="text-p-green font-semibold">mejor costo {moneyARS(bestCosto)}</span>}
                  </p>
                  {(() => {
                    const aseg = asegDe(articulo)
                    if (!aseg) return null
                    const total = Number(aseg.row.total_siva)||0
                    const civa = total * 1.21
                    const mercantil = civa * 1.06
                    return (
                      <div className="mt-2 bg-teal-50 border border-teal-200 rounded-lg px-3 py-2 flex items-center gap-x-4 gap-y-1 flex-wrap text-[11px]">
                        <span className="font-bold text-teal-800">💼 Aseguradora ({String(aseg.row.vigencia)})</span>
                        <span className="text-teal-800">Material {moneyARS(Number(aseg.row.precio_siva)||0)}</span>
                        <span className="text-teal-800">+ Instal. {moneyARS(Number(aseg.row.instalacion_siva)||0)}</span>
                        <span className="font-bold text-teal-900">Total s/IVA {moneyARS(total)}</span>
                        <span className="font-bold text-teal-900">c/IVA {moneyARS(civa)}</span>
                        <span className="font-bold text-teal-900">Mercantil {moneyARS(mercantil)}</span>
                        {!aseg.exacto && <span className="text-amber-700 font-semibold">variante {aseg.row.codigo}</span>}
                      </div>
                    )
                  })()}
                </div>

                <div className="divide-y divide-p-line2">
                  {articulo.precios.map((precio, i) => (
                    <div key={`${precio.proveedor}-${i}`}>
                      <div className="flex items-center gap-3 px-4 py-2 bg-gray-50/60">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white shrink-0"
                          style={{ background: PROV_COLOR[precio.proveedor] || '#6b7280' }}>
                          {precio.proveedor}{precio.es_promo ? ' · OFERTA' : ''}
                        </span>
                        {precio.codigo && <span className="font-mono text-[10px] text-p-ink2">{precio.codigo}</span>}
                        {precio.lista_nombre && <span className="text-[10px] text-p-ink2">{precio.lista_nombre}</span>}
                        {esGerencial && <span className="ml-auto text-[10px] text-p-ink2">Costo: <span className="font-mono font-bold text-p-dark">{moneyARS(precio.costo_neto)}</span>
                          {precio.costo_anterior && precio.costo_anterior !== precio.costo_neto && (() => {
                            const diff = precio.costo_neto - precio.costo_anterior
                            const pct = Math.round((diff / precio.costo_anterior) * 100)
                            return <span className={`ml-1.5 font-mono font-bold ${diff > 0 ? 'text-red-500' : 'text-green-600'}`}>{diff > 0 ? '▲' : '▼'} {pct > 0 ? '+' : ''}{pct}%</span>
                          })()}
                        </span>}
                      </div>

                      <div className={`grid gap-0 ${tipoSel === 'todos' ? 'grid-cols-1 md:grid-cols-3' : 'grid-cols-1'}`}>
                        {tipos
                          .filter(t => tipoSel === 'todos' || t.id === tipoSel)
                          .map((tipo, idx) => {
                            const inst = conInstalacion ? precioInstalacion : 0
                            const precios = calcPrecios(precio.costo_neto, tipo.margen_pct, fleteProv[precio.proveedor]||0, configPrecios)
                            const isBest = precio.costo_neto === bestCosto
                            return (
                              <div key={tipo.id}
                                className={`flex items-center justify-between px-4 py-3 border-t border-p-line2 ${idx > 0 ? 'md:border-l' : ''} ${isBest ? 'bg-green-50/50' : ''}`}>
                                <div className="flex-1">
                                  <p className="text-[11px] font-semibold text-p-ink2 mb-1">
                                    {TIPO_ICON[tipo.nombre] || '👥'} {tipo.nombre}
                                    {esGerencial && <span className="text-p-gray ml-1">+{Math.round(tipo.margen_pct * 100)}%</span>}
                                  </p>
                                  <div className="flex flex-col gap-1">
                                    <div className="flex items-center gap-2">
                                      <span className="text-[10px] text-p-ink2 w-24">💳 Tarjeta</span>
                                      <span className={`font-saira font-bold text-base ${isBest ? 'text-p-green' : 'text-p-ink'}`}>{moneyARS(precios.tarjeta + inst)}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-[10px] text-p-ink2 w-24">🏦 Transf. <span className="text-green-600">-{configPrecios.descuento_transferencia_pct}%</span></span>
                                      <span className="font-saira font-bold text-base text-blue-600">{moneyARS(precios.transferencia + inst)}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-[10px] text-p-ink2 w-24">💵 Efectivo <span className="text-green-600">-{configPrecios.descuento_efectivo_pct}%</span></span>
                                      <span className="font-saira font-bold text-base text-green-700">{moneyARS(precios.efectivo + inst)}</span>
                                    </div>
                                    {TIPOS_CON_IVA_DISCRIMINADO.includes(tipo.nombre) && (
                                      <div className="mt-1 text-[10px] text-p-ink2">
                                        Neto: {moneyARS(precioSinIva(precios.tarjeta))} · IVA: {moneyARS(ivaMonto(precios.tarjeta))}
                                      </div>
                                    )}
                                  </div>
                                </div>
                                <button onClick={() => irAPresupuesto(articulo, precio, tipo)} disabled={!isOnline}
                                  style={{ background: isOnline ? '#00A550' : '#9ca3af', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 14px', fontWeight: 700, fontSize: 12, cursor: isOnline ? 'pointer' : 'not-allowed' }}>
                                  {isOnline ? '→ Presupuesto' : 'Sin conexión'}
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

      {q.length >= 2 && !loading && articulosOrdenados.length === 0 && (
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
