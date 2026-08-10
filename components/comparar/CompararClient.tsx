'use client'
import { useState, useEffect, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { moneyARS } from '@/lib/utils/format'

const PROV_COLOR: Record<string, { bg: string; text: string }> = {
  GAMMA:     { bg: '#dcfce7', text: '#166534' },
  MALATESTA: { bg: '#dbeafe', text: '#1e40af' },
  SEKURIT:   { bg: '#ede9fe', text: '#5b21b6' },
}

// Similitud Jaccard sobre tokens de la descripción
function normTokens(s: string): string[] {
  return s.toUpperCase()
    .replace(/^(E-PSAS\.|PSAS\.|PB\s+|E-)/,'')
    .replace(/[`'.\/\-()]/g,' ')
    .replace(/\s+/g,' ').trim()
    .split(' ').filter(w => w.length > 2)
}
function similitud(a: string, b: string): number {
  const wa = new Set(normTokens(a))
  const wb = new Set(normTokens(b))
  const inter = [...wa].filter(w => wb.has(w)).length
  const union = new Set([...wa, ...wb]).size
  return union === 0 ? 0 : Math.round((inter / union) * 100)
}

interface CatRow {
  id: string; proveedor: string; codigo: string | null; descripcion: string
  marca: string | null; pos: string | null; precio_lista: number
  costo_neto: number; disponible: string | null; es_promo: boolean
  lista_nombre: string | null; grupo_id: number | null
}
interface Agrupado { desc: string; pos: string | null; provs: CatRow[]; grupoId?: number }

export default function CompararClient() {
  const [q, setQ]           = useState('')
  const [grupos, setGrupos] = useState<Agrupado[]>([])
  const [loading, setLoading] = useState(false)
  const [openIdx, setOpenIdx] = useState<number | null>(null)
  const [sugs, setSugs]     = useState<Record<string, { pieza: CatRow; sim: number }[]>>({})
  const [loadingSug, setLoadingSug] = useState<string | null>(null)
  const supabase = createClient()

  // Descuento default por proveedor (de Compras) — para mostrar costo REAL además del de lista
  const [dtoProv, setDtoProv] = useState<Record<string, number>>({})
  useEffect(() => {
    supabase.from('proveedores_compra').select('*').eq('activo', true).then(({data}) => {
      const map: Record<string, number> = {}
      for (const p of (data ?? []) as any[]) {
        const dto = Number(p.descuento_pct ?? p.descuento ?? p.dto_default ?? p.descuento_default ?? 0) || 0
        // Matchear por primera palabra del nombre (Malatesta Sergio → MALATESTA)
        const key = String(p.nombre || '').toUpperCase().split(' ')[0]
        if (key) map[key] = dto
      }
      setDtoProv(map)
    })
  }, [supabase])
  const dtoDe = (proveedor: string) => dtoProv[String(proveedor||'').toUpperCase().split(' ')[0]] ?? 0
  const costoReal = (r: CatRow) => r.costo_neto * (1 - dtoDe(r.proveedor)/100)

  const POS_MAP: Record<string, string> = {
    'PARA':'PARABRISAS','PARABRISAS':'PARABRISAS','REAR':'LUNETA','LUNETA':'LUNETA',
    'LU':'LUNETA','LA':'LATERAL','LATERAL':'LATERAL',
  }

  const buscar = useCallback(async () => {
    const raw = q.trim()
    if (raw.length < 2) { setGrupos([]); return }
    setLoading(true)
    const words = raw.toUpperCase().split(/\s+/).filter(Boolean)

    // ── Búsqueda por CÓDIGO (con regla PLK base-6): "420934" o "420934VSLI"
    // trae todas las variantes y todos los proveedores que las tengan
    const esCodigo = !/\s/.test(raw) && /^\d{4,}/.test(raw)
    if (esCodigo) {
      const rawUp = raw.toUpperCase()
      const base6 = /^\d{6}/.test(rawUp) ? rawUp.slice(0,6) : null
      const filtro = base6 ? `codigo.ilike.${base6}%` : `codigo.ilike.%${rawUp}%`
      const { data: dataCod } = await supabase.from('catalogo')
        .select('id,proveedor,codigo,descripcion,marca,pos,precio_lista,costo_neto,disponible,es_promo,grupo_id,lista_nombre')
        .or(filtro).limit(300)
      let rows = (dataCod ?? []) as CatRow[]
      // Sumar los grupos de equivalencia de lo encontrado (códigos de otras marcas)
      const gids = Array.from(new Set(rows.map(r=>r.grupo_id).filter(Boolean))) as number[]
      if (gids.length) {
        const { data: dataGrp } = await supabase.from('catalogo')
          .select('id,proveedor,codigo,descripcion,marca,pos,precio_lista,costo_neto,disponible,es_promo,grupo_id,lista_nombre')
          .in('grupo_id', gids).limit(300)
        const ya = new Set(rows.map(r=>r.id))
        for (const r of (dataGrp ?? []) as CatRow[]) if (!ya.has(r.id)) rows.push(r)
      }
      // Agrupar por grupo_id; sin grupo, por código exacto (variantes separadas)
      const mapC = new Map<string, Agrupado>()
      for (const row of rows) {
        const key = row.grupo_id ? `g_${row.grupo_id}` : `c_${(row.codigo||row.id).toUpperCase()}`
        if (!mapC.has(key)) mapC.set(key, { desc: row.descripcion, pos: row.pos, provs: [], grupoId: row.grupo_id || undefined })
        mapC.get(key)!.provs.push(row)
      }
      setGrupos([...mapC.values()].sort((a,b)=>b.provs.length-a.provs.length))
      setLoading(false); setOpenIdx(null); setSugs({})
      return
    }

    const posKws = ['PARA','PARABRISAS','REAR','LUNETA','LU','LA','LATERAL']
    const posWords = words.filter(w => posKws.includes(w))
    const nonPosWs = words.filter(w => !posKws.includes(w))
    const pos = posWords.length > 0 ? POS_MAP[posWords[0]] : null
    const firstWord = nonPosWs[0] ?? null
    const restWords = nonPosWs.slice(1)

    let query = supabase.from('catalogo')
      .select('id,proveedor,codigo,descripcion,marca,pos,precio_lista,costo_neto,disponible,es_promo,grupo_id,lista_nombre')
      .limit(300)
    // Si solo escribió la posición ("parabrisas"), filtrar por pos sin exigir el texto
    // (las descripciones usan abreviaturas como PSAS. y no matchean la palabra completa)
    if (firstWord) query = query.or(`descripcion.ilike.%${firstWord}%,codigo.ilike.%${firstWord}%,marca.ilike.%${firstWord}%`)
    if (pos) query = query.eq('pos', pos)
    if (!firstWord && !pos) { setGrupos([]); setLoading(false); return }

    const { data: dataRaw } = await query

    const filtered = (dataRaw ?? []).filter((c: any) =>
      restWords.every((w: string) =>
        (c.descripcion||'').toUpperCase().includes(w) || (c.marca||'').toUpperCase().includes(w)
      )
    ) as CatRow[]

    // Agrupar SOLO por grupo_id explícito — sin grupo_id cada pieza es individual
    const map = new Map<string, Agrupado>()
    const grupoKeyMap = new Map<number, string>()
    for (const row of filtered) {
      const gid = row.grupo_id
      let key: string
      if (gid) {
        if (!grupoKeyMap.has(gid)) { key = `g_${gid}`; grupoKeyMap.set(gid, key) }
        else key = grupoKeyMap.get(gid)!
      } else {
        key = `solo_${row.id}`
      }
      if (!map.has(key)) map.set(key, { desc: row.descripcion, pos: row.pos, provs: [], grupoId: gid || undefined })
      map.get(key)!.provs.push(row)
    }
    const arr = [...map.values()].sort((a, b) => b.provs.length - a.provs.length)
    setGrupos(arr)
    setLoading(false)
    setOpenIdx(null)
    setSugs({})
  }, [q, supabase])

  useEffect(() => {
    const t = setTimeout(buscar, 350)
    return () => clearTimeout(t)
  }, [buscar])

  // Confirmar equivalencia: ambas piezas quedan con el MISMO grupo_id.
  // Si alguna ya pertenecía a un grupo, los grupos SE FUSIONAN → transitividad:
  // todo lo que era equivalente a una pasa a ser equivalente a la otra.
  const [vinculando, setVinculando] = useState<string | null>(null)
  async function vincularEquivalencia(a: CatRow, b: CatRow) {
    if (!confirm(`¿Confirmar que son el mismo vidrio?\n\n· ${a.proveedor} ${a.codigo||''} — ${a.descripcion}\n· ${b.proveedor} ${b.codigo||''} — ${b.descripcion}\n\nQueda registrado en el maestro de Articulos (y todo lo ya vinculado, tambien).`)) return
    setVinculando(b.id)

    // ── 1) MAESTRO (fuente de verdad): "este artículo es tal código en tal marca" ──
    const codes = [a.codigo, b.codigo].filter(Boolean) as string[]
    let articuloId: string | null = null
    if (codes.length) {
      const { data: porRef } = await supabase.from('articulos_maestro')
        .select('id').in('codigo_referencia', codes).eq('activo', true).limit(1).maybeSingle()
      articuloId = (porRef as any)?.id ?? null
      if (!articuloId) {
        const { data: porEq } = await supabase.from('articulo_equivalencias')
          .select('articulo_id').in('codigo_proveedor', codes).limit(1).maybeSingle()
        articuloId = (porEq as any)?.articulo_id ?? null
      }
    }
    if (!articuloId) {
      // No existe en el maestro: crearlo con el código PLK como referencia si lo hay
      const codPLK = codes.find(c => /^\d{6}/.test(c)) ?? null
      const { data: nuevoArt, error: errArt } = await supabase.from('articulos_maestro')
        .insert({ descripcion: a.descripcion, codigo_referencia: codPLK, activo: true })
        .select('id').single()
      if (errArt || !nuevoArt) { alert(`⚠ No se pudo crear el artículo en el maestro: ${errArt?.message}`); setVinculando(null); return }
      articuloId = nuevoArt.id
    }
    for (const p of [a, b]) {
      if (!p.codigo) continue
      const { data: ya } = await supabase.from('articulo_equivalencias')
        .select('id').eq('articulo_id', articuloId).eq('codigo_proveedor', p.codigo).limit(1).maybeSingle()
      if (!ya) {
        const { error: errEq } = await supabase.from('articulo_equivalencias')
          .insert({ articulo_id: articuloId, proveedor: p.proveedor, codigo_proveedor: p.codigo })
        if (errEq) { alert(`⚠ No se pudo registrar la equivalencia de ${p.codigo}: ${errEq.message}`); setVinculando(null); return }
      }
    }

    // ── 2) CATÁLOGO: grupo_id sincronizado (agrupado visual de Comparar) ──
    let gid = a.grupo_id ?? b.grupo_id ?? null
    if (!gid) {
      const { data: mx } = await supabase.from('catalogo').select('grupo_id').not('grupo_id','is',null).order('grupo_id',{ascending:false}).limit(1).maybeSingle()
      gid = ((mx as any)?.grupo_id ?? 0) + 1
    }
    // Fusionar: todo lo que tenga el grupo de A o de B pasa al grupo final
    for (const viejo of [a.grupo_id, b.grupo_id]) {
      if (viejo && viejo !== gid) {
        const { error } = await supabase.from('catalogo').update({ grupo_id: gid }).eq('grupo_id', viejo)
        if (error) { alert(`⚠ Error al fusionar grupos: ${error.message}`); setVinculando(null); return }
      }
    }
    const { error: e1 } = await supabase.from('catalogo').update({ grupo_id: gid }).eq('id', a.id)
    const { error: e2 } = await supabase.from('catalogo').update({ grupo_id: gid }).eq('id', b.id)
    if (e1 || e2) { alert(`⚠ Error al vincular: ${(e1||e2)?.message}`); setVinculando(null); return }
    setVinculando(null)
    buscar()  // refrescar: ahora aparecen agrupadas
  }

  async function cargarSugs(pieza: CatRow) {
    const key = pieza.id
    if (sugs[key] !== undefined) return
    setLoadingSug(key)
    const { data } = await supabase.from('catalogo')
      .select('id,proveedor,codigo,descripcion,pos,costo_neto,precio_lista,es_promo,lista_nombre,grupo_id,marca,disponible')
      .eq('pos', pieza.pos || 'PARABRISAS')
      .neq('proveedor', pieza.proveedor)
      .limit(400)
    const matches = (data ?? [] as CatRow[])
      .map(p => ({ pieza: p as CatRow, sim: similitud(pieza.descripcion, p.descripcion) }))
      .filter(m => m.sim >= 50)
      .sort((a, b) => b.sim - a.sim)
      .slice(0, 8)
    setSugs(prev => ({ ...prev, [key]: matches }))
    setLoadingSug(null)
  }

  return (
    <div>
      <p className="text-p-ink2 text-sm mb-4">Compará el costo neto del mismo vidrio entre GAMMA, Malatesta y Sekurit. El precio más bajo queda resaltado en verde.</p>

      <input value={q} onChange={e => setQ(e.target.value)}
        placeholder="Buscá un modelo: ford focus, vw gol, parabrisas corolla…"
        className="w-full border-2 border-p-line focus:border-p-green rounded-xl px-4 py-3 text-sm mb-4 bg-white outline-none shadow-sm"/>

      {loading && <p className="text-sm text-p-gray text-center py-8">Buscando…</p>}

      {!loading && grupos.length > 0 && (
        <div className="flex flex-col gap-3">
          {grupos.map((g, idx) => {
            const isOpen = openIdx === idx

            // Deduplicar por proveedor+lista (un precio por origen), ordenar por COSTO REAL (con dto)
            const dedupMap = new Map<string, CatRow>()
            for (const p of g.provs) {
              const k = `${p.proveedor}|${p.lista_nombre||''}`
              if (!dedupMap.has(k) || costoReal(p) < costoReal(dedupMap.get(k)!)) dedupMap.set(k, p)
            }
            const sorted = [...dedupMap.values()].sort((a, b) => costoReal(a) - costoReal(b))
            const best = sorted[0]
            const worst = sorted[sorted.length - 1]
            const ahorro = sorted.length > 1 ? costoReal(worst) - costoReal(best) : 0

            return (
              <div key={idx} className="bg-white border border-p-line rounded-xl overflow-hidden shadow-sm">
                {/* Header */}
                <button onClick={() => setOpenIdx(isOpen ? null : idx)}
                  className="w-full text-left px-4 py-3 flex items-start justify-between gap-4 hover:bg-p-light/50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-saira font-bold text-p-ink truncate">{g.desc}</p>
                      {g.pos && <span className="text-[10px] text-p-ink2 bg-p-light px-1.5 py-0.5 rounded-full">{g.pos}</span>}
                    </div>
                    {g.provs[0].marca && <p className="text-xs text-p-ink2 mt-0.5">{g.provs[0].marca}</p>}
                    {/* Códigos con su costo real, por proveedor */}
                    <div className="flex gap-1.5 flex-wrap mt-1.5">
                      {sorted.map(p => (
                        <span key={p.id} style={{ background: PROV_COLOR[p.proveedor]?.bg ?? '#f3f4f6', color: PROV_COLOR[p.proveedor]?.text ?? '#374151' }}
                          className="text-[11px] font-bold px-2 py-0.5 rounded-full">
                          {p.proveedor}{p.codigo ? ` ${p.codigo}` : ''} · {moneyARS(costoReal(p))}{p.es_promo ? ' (Oferta)' : ''}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-saira font-bold text-lg text-p-ink">{moneyARS(costoReal(best))}</p>
                    <p className="text-[10px] text-p-ink2">mejor costo{dtoDe(best.proveedor)>0?` (c/dto ${dtoDe(best.proveedor)}%)`:''}</p>
                    {ahorro > 0 && <p className="text-[10px] text-p-green font-bold">Ahorrás {moneyARS(ahorro)}</p>}
                  </div>
                  <span className="text-p-ink2 text-xs mt-1">{isOpen ? '▲' : '▼'}</span>
                </button>

                {/* Detalle expandido */}
                {isOpen && (
                  <div className="border-t border-p-line">
                    {/* Tabla comparativa */}
                    <div className="grid grid-cols-1 divide-y divide-p-line2">
                      {sorted.map((p, j) => {
                        const cr = costoReal(p)
                        const dto = dtoDe(p.proveedor)
                        const isBest = cr === costoReal(best)
                        const diff = cr - costoReal(best)
                        return (
                          <div key={p.id} className={`flex items-center gap-4 px-4 py-3 ${isBest ? 'bg-green-50' : ''}`}>
                            <span style={{ background: PROV_COLOR[p.proveedor]?.bg ?? '#f3f4f6', color: PROV_COLOR[p.proveedor]?.text ?? '#374151' }}
                              className="text-xs font-bold px-2.5 py-1 rounded-full shrink-0 text-center">
                              {p.proveedor}{p.lista_nombre ? ' · ' + p.lista_nombre.replace(/Catálogo|Catalog/i,'Cat.').replace(/Oferta especial mixta/i,'Oferta Mixta').replace(/Oferta Mix/i,'Mix P/E') : ''}
                            </span>
                            {p.codigo && <span className="font-mono text-xs text-p-ink2 shrink-0">cód {p.codigo}</span>}
                            <div className="flex-1"/>
                            <div className="text-right shrink-0">
                              <p className={`font-mono font-bold text-sm ${isBest ? 'text-p-green' : 'text-p-ink'}`}>
                                {moneyARS(cr)}
                                {isBest && <span className="ml-1 text-[10px]">✓ más barato</span>}
                              </p>
                              {dto > 0 && <p className="text-[10px] text-p-ink2 font-mono">lista {moneyARS(p.costo_neto)} − {dto}%</p>}
                              {diff > 0 && <p className="text-[10px] text-red-500 font-mono">+{moneyARS(diff)}</p>}
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {/* Comparación visual */}
                    {sorted.length > 1 && (
                      <div className="px-4 py-3 border-t border-p-line2 bg-gray-50">
                        <p className="text-[10px] font-semibold text-p-ink2 uppercase tracking-wider mb-2">Comparación visual</p>
                        <div className="flex flex-col gap-1.5">
                          {sorted.map(p => (
                            <div key={p.id} className="flex items-center gap-2">
                              <span className="text-[10px] font-bold w-20 shrink-0" style={{ color: PROV_COLOR[p.proveedor]?.text ?? '#374151' }}>
                                {p.proveedor}
                              </span>
                              <div className="flex-1 bg-gray-200 rounded-full h-3 overflow-hidden">
                                <div className="h-full rounded-full transition-all"
                                  style={{ width: `${Math.round((p.costo_neto / worst.costo_neto) * 100)}%`, background: PROV_COLOR[p.proveedor]?.text ?? '#6b7280' }}/>
                              </div>
                              <span className="font-mono text-xs w-24 text-right shrink-0">{moneyARS(p.costo_neto)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Sugerencias de similitud — también para grupos existentes (sumar marcas nuevas) */}
                    <div className="px-4 py-3 border-t border-p-line2 bg-blue-50/40">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-[11px] font-semibold text-p-ink2 uppercase tracking-wider">
                            🔗 Posibles equivalencias en otros proveedores
                          </p>
                          {sugs[g.provs[0].id] === undefined && (
                            <button onClick={() => cargarSugs(g.provs[0])}
                              disabled={loadingSug === g.provs[0].id}
                              style={{ background:'#1d4ed8', color:'#fff', border:'none', borderRadius:6, padding:'4px 12px', fontSize:11, fontWeight:700, cursor:'pointer', opacity: loadingSug === g.provs[0].id ? 0.6 : 1 }}>
                              {loadingSug === g.provs[0].id ? 'Buscando…' : 'Ver sugerencias'}
                            </button>
                          )}
                        </div>
                        {sugs[g.provs[0].id] !== undefined && (
                          sugs[g.provs[0].id].length === 0
                            ? <p className="text-xs text-p-gray">Sin sugerencias con ≥50% de similitud.</p>
                            : (
                              <div className="flex flex-col gap-1.5">
                                {sugs[g.provs[0].id].map(({ pieza: s, sim }) => (
                                  <div key={s.id} className="flex items-center gap-3 bg-white rounded-lg px-3 py-2 border border-p-line">
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white shrink-0"
                                      style={{ background: PROV_COLOR[s.proveedor]?.text || '#6b7280' }}>
                                      {s.proveedor}
                                    </span>
                                    <span className="text-xs text-p-ink flex-1 min-w-0 truncate">{s.descripcion}</span>
                                    {s.codigo && <span className="font-mono text-[10px] text-p-ink2 shrink-0">{s.codigo}</span>}
                                    <span className="font-mono text-xs font-bold text-p-dark shrink-0">{moneyARS(s.costo_neto)}</span>
                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${sim >= 80 ? 'bg-green-100 text-green-700' : sim >= 65 ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-600'}`}>
                                      {sim}%
                                    </span>
                                    <button onClick={() => vincularEquivalencia(g.provs[0], s)}
                                      disabled={vinculando === s.id}
                                      className="shrink-0 text-[11px] font-bold text-white rounded-md px-2.5 py-1"
                                      style={{ background:'#00A550', opacity: vinculando === s.id ? .6 : 1, cursor:'pointer', border:'none' }}>
                                      {vinculando === s.id ? '…' : '✓ Vincular'}
                                    </button>
                                  </div>
                                ))}
                                <p className="text-[10px] text-p-ink2 mt-0.5">
                                  El vínculo queda registrado en el maestro — lo ves en{' '}
                                  <a href={`/articulos?q=${encodeURIComponent(g.provs[0].codigo||g.desc.split(' ').slice(0,3).join(' '))}`} className="text-p-green font-semibold">Artículos</a>.
                                </p>
                              </div>
                            )
                        )}
                      </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {q.length >= 2 && !loading && grupos.length === 0 && (
        <p className="text-center text-sm text-p-gray py-10">
          Sin resultados para "{q}". Probá con otro modelo o importá más listas de proveedores.
        </p>
      )}
    </div>
  )
}
