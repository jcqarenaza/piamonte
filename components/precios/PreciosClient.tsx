'use client'
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { moneyARS } from '@/lib/utils/format'
import { useOnlineStatus } from '@/lib/offline/useOnlineStatus'
import { OfflineBanner } from '@/lib/offline/OfflineBanner'
import { precargarCatalogoCompleto, getCatalogoMeta, buscarEnCatalogoCompleto } from '@/lib/offline/db'
import RevisarClient from '@/components/precios/RevisarClient'

/**
 * PRECIOS — búsqueda por FAMILIA sobre el catálogo completo (GAMMA + Malatesta + Sekurit).
 *  familia = 6 dígitos + 3 primeras letras  → misma pieza, otro origen (4ª letra): se muestran juntas
 *  base6   = 6 dígitos                      → mismo modelo, otra variante (color/sensor/proceso): chips abajo
 *  grupo_id (vínculo a mano de Comparar)    → une familias en una sola tarjeta
 * El stock en mano se muestra por código, en la tarjeta y en cada fila.
 */

interface TipoCliente { id: string; nombre: string; margen_pct: number }
interface Fila {
  familia: string; base6: string; es_variante: boolean; grupo_id: number | null
  id: string; proveedor: string; codigo: string; descripcion: string; marca: string | null; pos: string | null
  costo_neto: number | null; costo_anterior: number | null; precio_lista: number | null; lista_nombre: string | null; es_promo: boolean
  disponible: boolean | null; updated_at: string | null
  stock_cant: number | null; stock_precio: number | null; stock_costo: number | null
  desc_familia?: string | null
}
interface Tarjeta {
  key: string; familias: string[]; base6: string; descripcion: string; pos: string | null; manual: boolean
  filas: Fila[]; stock: number; bestCosto: number; baratoSinDisp: number
  variantes: { familia: string; codigo: string; descripcion: string; costo: number | null; stock: number; provs: string[] }[]
}

const PROV_COLOR: Record<string, string> = { GAMMA: '#166534', MALATESTA: '#1e40af', SEKURIT: '#5b21b6' }
// 4ª letra del código = origen / marca del vidrio
const ORIGEN: Record<string, string> = { P: 'Pilkington', M: 'Euroglas', X: 'Xinyi', I: 'Importado', F: 'Fanavid', U: 'Importado', E: 'Euroglas', C: 'China', R: 'Reposición', S: 'Sekurit' }
// Origen de un código: 6 dígitos + 4 letras → la 4ª letra; códigos de Gamma de 5 letras → terminan en ORI (originales) o XYG
function origenDe(codigo: string): string | null {
  const c = (codigo || '').toUpperCase()
  if (/^[0-9]{6}[A-Z]{4}$/.test(c)) return ORIGEN[c[9]] ?? null
  if (/^[0-9]{6}[A-Z]{2,4}ORI$/.test(c)) return 'Original'
  if (/^[0-9]{6}[A-Z]{2,4}XYG$/.test(c)) return 'XYG'
  return null
}
const TIPO_ORDER = ['Particular', 'Chapista']
const TIPO_ICON: Record<string, string> = { Particular: '👤', Chapista: '🔧' }
const IVA_RATE = 0.21
const TIPOS_CON_IVA_DISCRIMINADO = ['Chapista']

// El costo_neto ya incluye flete (se aplica al importar las listas). NO volver a sumar flete acá.
function calcPrecios(costo: number, margen: number, cfg: { recargo_tarjeta_pct: number; descuento_transferencia_pct: number; descuento_efectivo_pct: number }) {
  const tarjeta       = Math.round(costo * (1 + margen) * (1 + cfg.recargo_tarjeta_pct / 100))
  const transferencia = Math.round(tarjeta * (1 - cfg.descuento_transferencia_pct / 100))
  const efectivo      = Math.round(tarjeta * (1 - cfg.descuento_efectivo_pct / 100))
  return { tarjeta, transferencia, efectivo }
}
const precioSinIva = (p: number) => Math.round(p / (1 + IVA_RATE))
const familiaDe = (codigo: string) => /^[0-9]{6}[A-Za-z]{4}$/.test(codigo) ? codigo.slice(0, 9).toUpperCase() : codigo.toUpperCase()
const fechaCorta = (iso: string | null) => iso ? iso.slice(0, 10).split('-').reverse().slice(0, 2).join('/') : ''

// El stock es por CÓDIGO: si Malatesta y Gamma venden el mismo código, el stock en mano se cuenta una sola vez
function stockPorCodigo(fs: Fila[]): number {
  const m = new Map<string, number>()
  for (const f of fs) { const k = f.codigo.toUpperCase(); m.set(k, Math.max(m.get(k) ?? 0, Number(f.stock_cant) || 0)) }
  let t = 0; for (const v of m.values()) t += v
  return t
}

// Arma las tarjetas: una por familia (o por grupo manual), con sus filas y las variantes del mismo modelo
function armarTarjetas(filas: Fila[]): Tarjeta[] {
  const directas = filas.filter(f => !f.es_variante)
  const variantes = filas.filter(f => f.es_variante)
  const porKey = new Map<string, Fila[]>()
  for (const f of directas) {
    const key = f.grupo_id ? `g${f.grupo_id}` : f.familia
    if (!porKey.has(key)) porKey.set(key, [])
    porKey.get(key)!.push(f)
  }
  const tarjetas: Tarjeta[] = []
  for (const [key, fs] of porKey) {
    // sin duplicar proveedor+código
    const vistos = new Set<string>()
    const unicas = fs.filter(f => { const k = `${f.proveedor}|${f.codigo.toUpperCase()}`; if (vistos.has(k)) return false; vistos.add(k); return true })
    unicas.sort((a, b) => (Number(b.stock_cant) || 0) - (Number(a.stock_cant) || 0) || (Number(a.costo_neto) || 9e12) - (Number(b.costo_neto) || 9e12))
    const conStock = unicas.find(f => Number(f.stock_cant) > 0)
    const oficial = unicas.find(f => f.desc_familia)?.desc_familia
    const desc = oficial || (conStock ?? unicas.find(f => f.proveedor === 'GAMMA') ?? unicas[0]).descripcion
    const familias = Array.from(new Set(unicas.map(f => f.familia)))
    const base6 = unicas[0].base6
    const costosTodos = unicas.map(f => Number(f.costo_neto)).filter(c => c > 0)
    // El mejor costo cuenta solo lo que está disponible (si el más barato no lo tiene, no sirve para cotizar)
    const costosDisp = unicas.filter(f => f.disponible !== false).map(f => Number(f.costo_neto)).filter(c => c > 0)
    const costos = costosDisp.length ? costosDisp : costosTodos
    const minTodos = costosTodos.length ? Math.min(...costosTodos) : 0
    // variantes del mismo modelo que NO están en esta tarjeta
    const varMap = new Map<string, Tarjeta['variantes'][0]>()
    const varVistos = new Set<string>()
    for (const v of variantes) {
      if (v.base6 !== base6 || familias.includes(v.familia)) continue
      const e = varMap.get(v.familia) ?? { familia: v.familia, codigo: v.codigo, descripcion: v.descripcion, costo: null, stock: 0, provs: [] }
      const c = Number(v.costo_neto); if (c > 0 && (e.costo == null || c < e.costo)) e.costo = c
      const kv = `${v.familia}|${v.codigo.toUpperCase()}`
      if (!varVistos.has(kv)) { varVistos.add(kv); e.stock += Number(v.stock_cant) || 0 }
      if (!e.provs.includes(v.proveedor)) e.provs.push(v.proveedor)
      if (Number(v.stock_cant) > 0) e.codigo = v.codigo
      varMap.set(v.familia, e)
    }
    tarjetas.push({
      key, familias, base6, descripcion: desc, pos: unicas[0].pos, manual: !!unicas[0].grupo_id,
      filas: unicas, stock: stockPorCodigo(unicas),
      bestCosto: costos.length ? Math.min(...costos) : 0,
      baratoSinDisp: costosDisp.length && minTodos > 0 && minTodos < Math.min(...costosDisp) ? minTodos : 0,
      variantes: [...varMap.values()].sort((a, b) => b.stock - a.stock || (a.costo ?? 9e12) - (b.costo ?? 9e12)),
    })
  }
  // Los que tenés en stock primero, después por cantidad de proveedores
  return tarjetas.sort((a, b) => (b.stock > 0 ? 1 : 0) - (a.stock > 0 ? 1 : 0) || b.filas.length - a.filas.length)
}

export default function PreciosClient({ rol = 'ventas' }: { rol?: string }) {
  const esGerencial = rol === 'gerencial' || rol === 'admin'
  const [q, setQ] = useState('')
  const [configPrecios, setConfigPrecios] = useState({ recargo_tarjeta_pct: 35, descuento_transferencia_pct: 15, descuento_efectivo_pct: 25 })
  const [filas, setFilas] = useState<Fila[]>([])
  const [tipos, setTipos] = useState<TipoCliente[]>([])
  const [loading, setLoading] = useState(false)
  const [tipoSel, setTipoSel] = useState<string>('todos')
  const [precioInstalacion, setPrecioInstalacion] = useState(0)
  const [conInstalacion, setConInstalacion] = useState(true)
  const [abierta, setAbierta] = useState<string | null>(null)   // tarjeta expandida (precios por tipo)

  const [tab, setTab] = useState<'buscar' | 'revisar'>('buscar')
  useEffect(() => { try { if (new URLSearchParams(window.location.search).get('tab') === 'revisar') setTab('revisar') } catch {} }, [])
  const supabase = createClient()
  const isOnline = useOnlineStatus()
  const router = useRouter()

  const tarjetas = useMemo(() => armarTarjetas(filas), [filas])

  // Precio de venta a ASEGURADORAS (lista Pilkington) por código, con fallback a la misma base
  const [asegPrecios, setAsegPrecios] = useState<Record<string, any>>({})
  useEffect(() => {
    if (!tarjetas.length || !isOnline) { setAsegPrecios({}); return }
    ;(async () => {
      const bases = Array.from(new Set(tarjetas.map(t => t.base6).filter(b => /^\d{6}$/.test(b))))
      if (!bases.length) { setAsegPrecios({}); return }
      const { data: vig } = await supabase.from('precios_aseguradora').select('vigencia').eq('lista', 'comun').order('vigencia', { ascending: false }).limit(1).maybeSingle()
      const vigencia = (vig as any)?.vigencia
      if (!vigencia) return
      const { data: rows } = await supabase.from('precios_aseguradora')
        .select('codigo,descripcion,precio_siva,instalacion_siva,total_siva')
        .eq('lista', 'comun').eq('vigencia', vigencia).or(bases.map(b => `codigo.ilike.${b}%`).join(',')).limit(300)
      const map: Record<string, any> = {}
      for (const r of (rows ?? []) as any[]) {
        const cod = String(r.codigo || '').toUpperCase()
        map[cod] = { ...r, vigencia }
        if (!map[`~${cod.slice(0, 6)}`]) map[`~${cod.slice(0, 6)}`] = { ...r, vigencia }
      }
      setAsegPrecios(map)
    })()
  }, [tarjetas, isOnline, supabase])
  function asegDe(t: Tarjeta): { row: any; exacto: boolean } | null {
    for (const f of t.filas) if (asegPrecios[f.codigo.toUpperCase()]) return { row: asegPrecios[f.codigo.toUpperCase()], exacto: true }
    if (asegPrecios[`~${t.base6}`]) return { row: asegPrecios[`~${t.base6}`], exacto: false }
    return null
  }

  useEffect(() => {
    supabase.from('config_precios').select('*').eq('id', 1).maybeSingle().then(({ data }) => { if (data) setConfigPrecios(data) })
    supabase.from('stock').select('precio_venta').eq('codigo', 'COLOC0001').maybeSingle().then(({ data }) => { if (data) setPrecioInstalacion(+(data as any).precio_venta || 0) })
    supabase.from('tipos_cliente').select('*').order('nombre').then(({ data }) => {
      const sorted = TIPO_ORDER.map(n => (data ?? []).find((t: TipoCliente) => t.nombre === n)).filter(Boolean) as TipoCliente[]
      const resto = (data ?? []).filter((t: TipoCliente) => !TIPO_ORDER.includes(t.nombre) && t.nombre !== 'Compañías')
      setTipos([...sorted, ...resto])
    })
  }, [supabase])

  // Precarga offline del catálogo (se usa solo sin conexión)
  useEffect(() => {
    if (!isOnline) return
    let cancelado = false
    ;(async () => {
      const { data: ult } = await supabase.from('catalogo').select('updated_at').order('updated_at', { ascending: false }).limit(1).maybeSingle()
      const { count } = await supabase.from('catalogo').select('id', { count: 'exact', head: true })
      const fingerprint = `cat|${count ?? 0}|${(ult as any)?.updated_at ?? ''}`
      const meta = await getCatalogoMeta()
      if (meta?.fingerprint === fingerprint) return
      const planas: any[] = []
      for (let from = 0; ; from += 1000) {
        const { data } = await supabase.from('catalogo').select('id,proveedor,codigo,descripcion,marca,pos,costo_neto,costo_anterior,lista_nombre,es_promo,grupo_id,updated_at').range(from, from + 999)
        if (!data?.length) break
        planas.push(...data); if (data.length < 1000) break
      }
      if (!cancelado && planas.length) precargarCatalogoCompleto(planas, fingerprint)
    })()
    return () => { cancelado = true }
  }, [isOnline, supabase])

  const reqRef = useRef(0)   // descarta respuestas viejas (al tipear rápido llegaban búsquedas parciales tarde y pisaban el resultado)
  const buscar = useCallback(async () => {
    const texto = q.trim()
    const reqId = ++reqRef.current
    if (texto.length < 2) { setFilas([]); setLoading(false); return }
    setLoading(true)
    if (!isOnline) {
      const planas = await buscarEnCatalogoCompleto(texto)
      if (reqId !== reqRef.current) return
      setFilas((planas as any[]).map(p => ({
        familia: familiaDe(p.codigo || ''), base6: familiaDe(p.codigo || '').slice(0, 6), es_variante: false, grupo_id: p.grupo_id ?? null,
        id: p.id, proveedor: p.proveedor, codigo: p.codigo, descripcion: p.descripcion, marca: p.marca ?? null, pos: p.pos ?? null,
        costo_neto: p.costo_neto, costo_anterior: p.costo_anterior ?? null, precio_lista: null, lista_nombre: p.lista_nombre ?? null, es_promo: !!p.es_promo,
        disponible: null, updated_at: p.updated_at ?? null, stock_cant: null, stock_precio: null, stock_costo: null, desc_familia: null,
      })))
      setLoading(false); return
    }
    const { data, error } = await supabase.rpc('buscar_familias', { p_q: texto, p_limit: 40 })
    if (reqId !== reqRef.current) return
    if (error) { console.error(error); setFilas([]) } else setFilas((data ?? []) as Fila[])
    setLoading(false)
  }, [q, supabase, isOnline])

  useEffect(() => { const t = setTimeout(buscar, 300); return () => clearTimeout(t) }, [buscar])

  // ── Vincular equivalencias desde la tarjeta (gerencial) ─────────────────────
  const [vinculando, setVinculando] = useState<string | null>(null)   // key de la tarjeta con el buscador abierto
  const [vinQ, setVinQ] = useState('')
  const [vinRes, setVinRes] = useState<{ familia: string; descripcion: string; codigos: string[]; stock: number }[]>([])
  const [vinMsg, setVinMsg] = useState('')
  useEffect(() => {
    if (!vinculando || vinQ.trim().length < 2) { setVinRes([]); return }
    let vivo = true
    const t = setTimeout(async () => {
      const { data } = await supabase.rpc('buscar_familias', { p_q: vinQ.trim(), p_limit: 12 })
      if (!vivo) return
      const m = new Map<string, { familia: string; descripcion: string; codigos: string[]; stock: number }>()
      for (const f of (data ?? []) as Fila[]) {
        if (f.es_variante) continue
        const x = m.get(f.familia) ?? { familia: f.familia, descripcion: f.desc_familia || f.descripcion, codigos: [], stock: 0 }
        if (!x.codigos.includes(f.codigo)) x.codigos.push(f.codigo)
        x.stock = Math.max(x.stock, Number(f.stock_cant) || 0)
        m.set(f.familia, x)
      }
      setVinRes([...m.values()])
    }, 300)
    return () => { vivo = false; clearTimeout(t) }
  }, [vinQ, vinculando, supabase])
  async function vincular(t: Tarjeta, otra: string) {
    if (!confirm(`¿Vincular ${otra} como equivalente de ${t.familias.join(' = ')}?\nVan a aparecer juntos en la misma tarjeta (se puede deshacer).`)) return
    const { error } = await supabase.rpc('vincular_familias', { p_a: t.familias[0], p_b: otra })
    if (error) { alert('No se pudo vincular: ' + error.message); return }
    setVinMsg(`✅ ${otra} vinculado`); setVinQ(''); setVinRes([]); await buscar()
  }
  async function desvincular(t: Tarjeta) {
    if (!confirm(`¿Deshacer el vínculo manual de ${t.familias.join(' = ')}? Cada familia vuelve a su tarjeta propia.`)) return
    for (const f of t.familias) await supabase.rpc('desvincular_familia', { p_familia: f })
    setVinculando(null); await buscar()
  }

  function irAPresupuesto(t: Tarjeta, f: Fila, tipo: TipoCliente) {
    const p = calcPrecios(Number(f.costo_neto) || 0, tipo.margen_pct, configPrecios)
    const params = new URLSearchParams({
      pieza_id: f.id, pieza_desc: `${t.descripcion} (${f.codigo})`, pieza_precio: String(p.tarjeta),
      pieza_precio_transf: String(p.transferencia), pieza_precio_efect: String(p.efectivo),
      tipo_id: tipo.id, tipo_nombre: tipo.nombre,
    })
    router.push(`/presupuestos?${params.toString()}`)
  }

  const tiposVisibles = tipos.filter(t => tipoSel === 'todos' || t.id === tipoSel)

  return (
    <div>
      {!isOnline && <OfflineBanner />}
      <div className="flex border-b border-p-line mb-4">
        {([['buscar', '💰 Precios'], ['revisar', '🧹 Revisar']] as const).map(([v, l]) => (
          <button key={v} onClick={() => setTab(v)}
            style={{ padding: '8px 20px', fontWeight: 700, fontSize: 13, cursor: 'pointer', border: 'none', background: 'none', borderBottom: tab === v ? '3px solid #00A550' : '3px solid transparent', color: tab === v ? '#00A550' : '#6b7280' }}>
            {l}
          </button>
        ))}
      </div>
      {tab === 'revisar' && <RevisarClient />}
      {tab === 'buscar' && <>
      <div className="flex gap-2 flex-wrap mb-4">
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

      <div className="flex gap-3 items-center mb-2 flex-wrap">
        <input value={q} onChange={e => setQ(e.target.value)}
          placeholder="Código (422131, VSLP) o descripción (taos parabrisas, gol luneta)…"
          className="flex-1 border-2 border-p-line focus:border-p-green rounded-xl px-4 py-3 text-sm bg-white outline-none shadow-sm min-w-[200px]"/>
        {precioInstalacion > 0 && (
          <label className="flex items-center gap-2 cursor-pointer bg-white border border-p-line rounded-xl px-4 py-3 shadow-sm select-none shrink-0">
            <input type="checkbox" checked={conInstalacion} onChange={e => setConInstalacion(e.target.checked)} className="accent-p-green w-4 h-4"/>
            <span className="text-sm font-semibold text-p-ink">+ Instalación ({moneyARS(precioInstalacion)})</span>
          </label>
        )}
      </div>
      <p className="text-[11px] text-p-ink2 mb-4">Una tarjeta por pieza con todos sus códigos equivalentes (mismos 6 dígitos + 3 letras; la 4ª letra es el origen). <b>Doble clic</b> abre los precios por tipo de cliente. 📦 = cantidad en stock. Abajo, las otras variantes del mismo modelo.</p>

      {loading && <p className="text-sm text-p-gray text-center py-8">Buscando…</p>}

      {!loading && tarjetas.length > 0 && (
        <div className="flex flex-col gap-4">
          {tarjetas.map(t => {
            const aseg = asegDe(t)
            const expandida = abierta === t.key
            return (
              <div key={t.key} onDoubleClick={() => setAbierta(expandida ? null : t.key)} title="Doble clic: abrir / cerrar precios por tipo"
                className={`bg-white border rounded-xl overflow-hidden shadow-sm select-none ${t.stock > 0 ? 'border-green-300' : 'border-p-line'} ${expandida ? 'ring-2 ring-p-green/40' : ''}`}>
                {/* Cabecera de la pieza */}
                <div className="px-4 py-3 border-b border-p-line2 bg-p-light">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-saira font-bold text-p-ink">{t.descripcion}</p>
                    {t.filas.some(f => f.desc_familia) && <span className="text-[10px] text-p-green" title="Descripción elegida en Revisar">✓ oficial</span>}
                    {t.stock > 0
                      ? <span className="text-[11px] font-bold text-green-700 bg-green-50 border border-green-300 rounded-full px-2 py-0.5">📦 {t.stock} en stock</span>
                      : <span className="text-[11px] font-semibold text-p-ink2 bg-white border border-p-line rounded-full px-2 py-0.5">sin stock · a pedir</span>}
                    <span className="font-mono text-[10px] text-p-ink2 bg-white border border-p-line px-2 py-0.5 rounded-full">{t.familias.join(' = ')}</span>
                    {t.manual && <span className="text-[10px] text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-full" title="Equivalencia confirmada a mano">vinculada a mano</span>}
                    {esGerencial && isOnline && (
                      <span className="ml-auto flex gap-1.5" onDoubleClick={e => e.stopPropagation()}>
                        <button onClick={() => { setVinculando(vinculando === t.key ? null : t.key); setVinQ(''); setVinRes([]); setVinMsg('') }}
                          className="text-[11px] font-semibold px-2 py-0.5 rounded-full border border-purple-300 text-purple-700 bg-white hover:bg-purple-50 cursor-pointer">🔗 Vincular</button>
                        {t.manual && <button onClick={() => desvincular(t)} className="text-[11px] font-semibold px-2 py-0.5 rounded-full border border-red-200 text-red-600 bg-white hover:bg-red-50 cursor-pointer">✕ Desvincular</button>}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-p-ink2 mt-0.5">
                    {t.pos || '—'} · {t.filas.length} {t.filas.length === 1 ? 'código' : 'códigos'} en {new Set(t.filas.map(f => f.proveedor)).size} proveedor(es)
                    {esGerencial && t.bestCosto > 0 && <> · <span className="text-p-green font-semibold">mejor costo {moneyARS(t.bestCosto)}</span>{t.baratoSinDisp > 0 && <span className="text-red-600"> · más barato {moneyARS(t.baratoSinDisp)} pero sin disponibilidad</span>}</>}
                  </p>
                  {aseg && (() => {
                    const total = Number(aseg.row.total_siva) || 0
                    return (
                      <div className="mt-2 bg-teal-50 border border-teal-200 rounded-lg px-3 py-1.5 flex items-center gap-x-4 gap-y-1 flex-wrap text-[11px]">
                        <span className="font-bold text-teal-800">💼 Aseguradora ({String(aseg.row.vigencia)})</span>
                        <span className="text-teal-800">Material {moneyARS(Number(aseg.row.precio_siva) || 0)}</span>
                        <span className="text-teal-800">+ Instal. {moneyARS(Number(aseg.row.instalacion_siva) || 0)}</span>
                        <span className="font-bold text-teal-900">Total s/IVA {moneyARS(total)}</span>
                        <span className="font-bold text-teal-900">c/IVA {moneyARS(total * 1.21)}</span>
                        <span className="font-bold text-teal-900">Mercantil {moneyARS(total * 1.21 * 1.06)}</span>
                        {!aseg.exacto && <span className="text-amber-700 font-semibold">variante {aseg.row.codigo}</span>}
                      </div>
                    )
                  })()}
                </div>

                {/* Una fila por código de proveedor */}
                <div className="divide-y divide-p-line2">
                  {t.filas.map((f, idx) => {
                    const costo = Number(f.costo_neto) || 0
                    const primeraDelCodigo = t.filas.findIndex(x => x.codigo.toUpperCase() === f.codigo.toUpperCase()) === idx
                    const stock = primeraDelCodigo ? (Number(f.stock_cant) || 0) : 0
                    const origen = origenDe(f.codigo)
                    const isBest = costo > 0 && costo === t.bestCosto && f.disponible !== false
                    const tipoRef = tiposVisibles[0]
                    const pRef = tipoRef && costo > 0 ? calcPrecios(costo, tipoRef.margen_pct, configPrecios) : null
                    const inst = conInstalacion ? precioInstalacion : 0
                    return (
                      <div key={`${f.proveedor}-${f.codigo}`} className={`px-4 py-2 ${isBest ? 'bg-green-50/40' : ''}`}>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white shrink-0" style={{ background: PROV_COLOR[f.proveedor] || '#6b7280' }}>
                            {f.proveedor}{f.es_promo ? ' · OFERTA' : ''}
                          </span>
                          <span className="font-mono text-xs font-bold text-p-ink">{f.codigo}</span>
                          {origen && <span className="text-[10px] text-p-ink2">{origen}</span>}
                          {stock > 0 && <span className="text-[10px] font-bold text-green-700 bg-green-50 border border-green-300 rounded-full px-1.5">📦 {stock}</span>}
                          {f.disponible === false && <span className="text-[10px] text-red-600">sin disponibilidad</span>}
                          {f.lista_nombre && <span className="text-[10px] text-p-ink2">{f.lista_nombre}</span>}
                          {f.descripcion !== t.descripcion && <span className="text-[10px] text-p-ink2 italic truncate max-w-[260px]" title={f.descripcion}>“{f.descripcion}”</span>}
                          <span className="ml-auto flex items-center gap-3">
                            {esGerencial && (
                              <span className="text-[10px] text-p-ink2">Costo <span className="font-mono font-bold text-p-dark">{costo > 0 ? moneyARS(costo) : '—'}</span>
                                {f.costo_anterior && costo > 0 && Number(f.costo_anterior) !== costo && (() => {
                                  const diff = costo - Number(f.costo_anterior); const pct = Math.round(diff / Number(f.costo_anterior) * 100)
                                  return <span className={`ml-1 font-mono font-bold ${diff > 0 ? 'text-red-500' : 'text-green-600'}`}>{diff > 0 ? '▲' : '▼'}{pct > 0 ? '+' : ''}{pct}%</span>
                                })()}
                                {f.updated_at && <span className="ml-1 text-p-gray">({fechaCorta(f.updated_at)})</span>}
                              </span>
                            )}
                            {pRef && tipoRef && (
                              <span className="text-xs" title={`${tipoRef.nombre} · tarjeta / transferencia / efectivo`}>
                                <span className="font-saira font-bold text-p-ink">{moneyARS(pRef.tarjeta + inst)}</span>
                                <span className="text-blue-600 font-semibold ml-1.5">{moneyARS(pRef.transferencia + inst)}</span>
                                <span className="text-green-700 font-semibold ml-1.5">{moneyARS(pRef.efectivo + inst)}</span>
                              </span>
                            )}
                            {costo > 0 && (
                              <button onClick={() => setAbierta(expandida ? null : t.key)} className="text-[11px] text-p-green font-semibold hover:underline">{expandida ? 'cerrar' : 'detalle'}</button>
                            )}
                          </span>
                        </div>

                        {expandida && costo > 0 && (
                          <div className={`mt-2 grid gap-2 ${tiposVisibles.length > 1 ? 'grid-cols-1 md:grid-cols-3' : 'grid-cols-1'}`}>
                            {tiposVisibles.map(tipo => {
                              const p = calcPrecios(costo, tipo.margen_pct, configPrecios)
                              return (
                                <div key={tipo.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                                  <div>
                                    <p className="text-[11px] font-semibold text-p-ink2 mb-1">{TIPO_ICON[tipo.nombre] || '👥'} {tipo.nombre}{esGerencial && <span className="text-p-gray ml-1">+{Math.round(tipo.margen_pct * 100)}%</span>}</p>
                                    <div className="text-xs leading-5">
                                      <div>💳 Tarjeta <b className="font-saira text-sm">{moneyARS(p.tarjeta + inst)}</b></div>
                                      <div>🏦 Transf. <span className="text-green-600 text-[10px]">-{configPrecios.descuento_transferencia_pct}%</span> <b className="font-saira text-sm text-blue-600">{moneyARS(p.transferencia + inst)}</b></div>
                                      <div>💵 Efectivo <span className="text-green-600 text-[10px]">-{configPrecios.descuento_efectivo_pct}%</span> <b className="font-saira text-sm text-green-700">{moneyARS(p.efectivo + inst)}</b></div>
                                      {TIPOS_CON_IVA_DISCRIMINADO.includes(tipo.nombre) && <div className="text-[10px] text-p-ink2">Neto {moneyARS(precioSinIva(p.tarjeta))} · IVA {moneyARS(p.tarjeta - precioSinIva(p.tarjeta))}</div>}
                                    </div>
                                  </div>
                                  <button onClick={() => irAPresupuesto(t, f, tipo)} disabled={!isOnline}
                                    style={{ background: isOnline ? '#00A550' : '#9ca3af', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 12px', fontWeight: 700, fontSize: 12, cursor: isOnline ? 'pointer' : 'not-allowed' }}>
                                    → Presupuesto
                                  </button>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* Buscador para vincular otra pieza como equivalente */}
                {vinculando === t.key && (
                  <div className="px-4 py-3 bg-purple-50/60 border-t border-purple-100" onDoubleClick={e => e.stopPropagation()}>
                    <p className="text-[11px] font-semibold text-purple-800 mb-1">🔗 Buscá la pieza que es equivalente de <span className="font-mono">{t.familias.join(' = ')}</span> (por código o descripción) y tocá Vincular</p>
                    <input autoFocus value={vinQ} onChange={e => { setVinQ(e.target.value); setVinMsg('') }} placeholder="Código o descripción…"
                      className="w-full border border-purple-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:border-purple-500" />
                    {vinMsg && <p className="text-[11px] text-green-700 mt-1">{vinMsg}</p>}
                    <div className="mt-2 flex flex-col gap-1">
                      {vinRes.filter(x => !t.familias.includes(x.familia)).map(x => (
                        <div key={x.familia} className="flex items-center gap-2 bg-white border border-p-line rounded-lg px-2 py-1 text-xs">
                          <span className="font-mono font-bold">{x.familia}</span>
                          <span className="flex-1 text-p-ink2 truncate">{x.descripcion}</span>
                          <span className="font-mono text-[10px] text-p-gray hidden md:inline">{x.codigos.slice(0, 4).join(' · ')}</span>
                          {x.stock > 0 && <span className="font-bold text-green-700">📦 {x.stock}</span>}
                          <button onClick={() => vincular(t, x.familia)} className="text-[11px] font-bold px-2 py-0.5 rounded bg-purple-600 text-white cursor-pointer border-none">Vincular</button>
                        </div>
                      ))}
                      {vinQ.trim().length >= 2 && vinRes.filter(x => !t.familias.includes(x.familia)).length === 0 && <p className="text-[11px] text-p-gray">Sin resultados.</p>}
                    </div>
                  </div>
                )}

                {/* Variantes del mismo modelo */}
                {t.variantes.length > 0 && (
                  <div className="px-4 py-2 bg-amber-50/60 border-t border-amber-100">
                    <p className="text-[10px] uppercase tracking-wider text-amber-800 font-semibold mb-1">Otras variantes del mismo modelo ({t.base6}) — otro color, con/sin sensor, otro proceso</p>
                    <div className="flex gap-1.5 flex-wrap">
                      {t.variantes.map(v => (
                        <span key={v.familia} className="inline-flex items-stretch gap-0.5">
                        <button onClick={() => setQ(v.familia)} title={`${v.descripcion} · ${v.provs.join(', ')}`}
                          className={`text-[11px] rounded-lg px-2 py-1 border ${v.stock > 0 ? 'bg-green-50 border-green-300 text-green-800' : 'bg-white border-amber-200 text-p-ink'} hover:border-p-green`}>
                          <span className="font-mono font-bold">{v.familia}</span>
                          <span className="ml-1 text-p-ink2">{v.descripcion.length > 34 ? v.descripcion.slice(0, 34) + '…' : v.descripcion}</span>
                          {esGerencial && v.costo != null && <span className="ml-1 font-mono">{moneyARS(v.costo)}</span>}
                          {v.stock > 0 && <span className="ml-1 font-bold">📦 {v.stock}</span>}
                        </button>
                        {esGerencial && isOnline && <button onClick={() => vincular(t, v.familia)} title={`Vincular ${v.familia} como equivalente de esta pieza`}
                          className="text-[11px] rounded-lg px-1.5 border border-purple-300 text-purple-700 bg-white hover:bg-purple-50 cursor-pointer">🔗</button>}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {q.trim().length >= 2 && !loading && tarjetas.length === 0 && (
        <p className="text-center text-sm text-p-gray py-10">Sin resultados para "{q}".</p>
      )}
      {q.trim().length < 2 && (
        <div className="text-center py-16 text-p-gray">
          <p className="text-4xl mb-3">💰</p>
          <p className="font-saira font-bold text-p-ink text-lg">Precios y equivalencias</p>
          <p className="text-sm mt-1 max-w-md mx-auto">Buscá por código o descripción: ves la pieza con todos sus códigos equivalentes, el stock en mano, el costo por proveedor y el precio de venta por tipo de cliente.</p>
        </div>
      )}
      </>}
    </div>
  )
}
