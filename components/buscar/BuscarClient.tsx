'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { moneyARS, POS_LABEL } from '@/lib/utils/format'
import type { StockItem } from '@/lib/types/database'

interface CatRow {
  id: string; proveedor: string; codigo: string; descripcion: string
  marca: string; modelo: string; pos: string; precio_lista: number
  costo_neto: number; disponible: string; es_promo: boolean
}
interface ResultGroup { stock?: StockItem; provs: CatRow[]; grupoId?: number }

const PROVCOLOR: Record<string, string> = {
  GAMMA: 'bg-green-100 text-green-700', MALATESTA: 'bg-blue-100 text-blue-700',
  SEKURIT: 'bg-purple-100 text-purple-700',
}

export default function BuscarClient() {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<{ desc: string; stock?: StockItem; provs: CatRow[] }[]>([])
  const [loading, setLoading] = useState(false)
  const [hasCatalog, setHasCatalog] = useState<boolean | null>(null)
  const supabase = createClient()

  useEffect(() => {
    supabase.from('catalogo').select('id', { count: 'exact', head: true }).then(({ count }) => setHasCatalog((count ?? 0) > 0))
  }, [supabase])

  const search = useCallback(async () => {
    if (q.trim().length < 2) { setResults([]); return }
    setLoading(true)

    // ── Búsqueda multi-palabra ────────────────────────────────────────────────
    const POS_KW: Record<string,string> = {
      'PARA':'PARABRISAS','PARABRISA':'PARABRISAS','PARABRISAS':'PARABRISAS',
      'LUNETA':'LUNETA','TECHO':'TECHO','PUERTA':'PUERTA',
      'CUSTODIA':'CUSTODIA','ALETA':'ALETA',
    }
    const words    = q.trim().toUpperCase().split(/\s+/).filter(Boolean)
    const posWord  = words.find(w => POS_KW[w])
    const nonPosWs = words.filter(w => !POS_KW[w])
    const mainWord = nonPosWs[0] || words[0]

    // Construir query catálogo
    let catQ = supabase.from('catalogo').select('*').order('proveedor').limit(100)
    if (posWord && nonPosWs.length > 0) {
      // "fiesta para" → descripcion ILIKE %fiesta% AND pos = PARABRISAS
      catQ = catQ.eq('pos', POS_KW[posWord]).ilike('descripcion', `%${mainWord}%`)
    } else if (posWord) {
      // solo "parabrisas"
      catQ = catQ.eq('pos', POS_KW[posWord])
    } else {
      // búsqueda libre — filtrar resto client-side
      catQ = catQ.or(`descripcion.ilike.%${mainWord}%,marca.ilike.%${mainWord}%,codigo.ilike.%${mainWord}%`)
    }

    // Stock — mismo filtro
    let stockQ = supabase.from('stock').select('*').eq('activo', true).order('descripcion').limit(30)
    if (posWord && nonPosWs.length > 0) {
      stockQ = stockQ.eq('pos', POS_KW[posWord]).ilike('descripcion', `%${mainWord}%`)
    } else if (posWord) {
      stockQ = stockQ.eq('pos', POS_KW[posWord])
    } else {
      stockQ = stockQ.or(`descripcion.ilike.%${mainWord}%,marca.ilike.%${mainWord}%,codigo.ilike.%${mainWord}%`)
    }

    const [{ data: stockData }, { data: catDataRaw }] = await Promise.all([stockQ, catQ])

    // Filtro cliente: palabras restantes deben aparecer en descripcion o marca
    const restWords = nonPosWs.slice(1)
    const catData = (catDataRaw ?? []).filter((c:any) =>
      restWords.every((w:string) =>
        (c.descripcion||'').toUpperCase().includes(w) || (c.marca||'').toUpperCase().includes(w)
      )
    )
    const stockFiltered = (stockData ?? []).filter((s:any) =>
      restWords.every((w:string) =>
        (s.descripcion||'').toUpperCase().includes(w) || (s.marca||'').toUpperCase().includes(w)
      )
    )

    // Agrupar por descripción/posición
    const groups = new Map<string, ResultGroup>()
    for (const s of stockFiltered) {
      const key = (s.descripcion + (s.pos ?? '')).toUpperCase().replace(/\s+/g, ' ')
      if (!groups.has(key)) groups.set(key, { provs: [] })
      groups.get(key)!.stock = s
    }
    const grupoMap = new Map<number, string>()
    for (const c of catData as CatRow[]) {
      const gid = (c as any).grupo_id as number|null
      let key: string
      if (gid) {
        if (!grupoMap.has(gid)) { key = `grupo_${gid}`; grupoMap.set(gid, key) }
        else key = grupoMap.get(gid)!
      } else {
        key = (c.descripcion + (c.pos ?? '')).toUpperCase().replace(/\s+/g, ' ')
      }
      if (!groups.has(key)) groups.set(key, { provs: [], grupoId: gid || undefined })
      groups.get(key)!.provs.push(c as CatRow)
    }
    const arr = [...groups.entries()].map(([k, v]) => ({ desc: k, ...v }))
      .sort((a, b) => (b.stock ? 1 : 0) - (a.stock ? 1 : 0))
    setResults(arr)
    setLoading(false)
  }, [q, supabase])

  useEffect(() => {
    const t = setTimeout(search, 300)
    return () => clearTimeout(t)
  }, [search])

  return (
    <div>
      {/* Buscador */}
      <div className="relative mb-4">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Escribí modelo, marca o código de parabrisas…"
          className="w-full border-2 border-p-line focus:border-p-green rounded-xl px-4 py-3 text-base text-p-ink focus:outline-none shadow-sm" autoFocus />
        {loading && <span className="absolute right-4 top-3.5 text-p-gray text-sm">buscando…</span>}
      </div>

      {/* Info si no hay catálogo */}
      {hasCatalog === false && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 text-sm text-amber-700">
          <p className="font-bold">📋 El catálogo de proveedores está vacío</p>
          <p className="mt-1">Importá las listas desde la sección <b>Proveedores</b> para ver precios y disponibilidad. El stock propio aparece igual.</p>
        </div>
      )}

      {!q && <p className="text-sm text-p-gray text-center py-10">Escribí al menos 2 letras para buscar en el catálogo y tu stock.</p>}

      {/* Resultados */}
      <div className="flex flex-col gap-4">
        {results.map((r, i) => {
          const s = r.stock
          const provs = r.provs
          const bestProv = provs.sort((a, b) => a.costo_neto - b.costo_neto)[0]
          const title = s?.descripcion ?? provs[0]?.descripcion ?? r.desc
          const pos = s?.pos ?? provs[0]?.pos ?? ''
          return (
            <div key={i} className={`bg-white border rounded-xl shadow-sm overflow-hidden ${s ? 'border-p-green border-2' : 'border-p-line'}`}>
              {/* Header */}
              <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-p-line2 flex-wrap">
                <div className="flex-1 min-w-0">
                  {s && <span className="inline-block text-xs font-bold bg-p-light text-p-dark px-2 py-0.5 rounded-full mb-1">✓ En stock ({s.cantidad})</span>}
                  <p className="font-saira font-bold text-p-ink">{title}</p>
                  <p className="text-xs text-p-ink2">{s?.marca ?? provs[0]?.marca ?? ''} {pos ? '· ' + (POS_LABEL[pos] ?? pos) : ''}</p>
                </div>
                {s?.precio_venta && (
                  <div className="text-right">
                    <p className="font-saira font-bold text-xl text-p-ink">{moneyARS(s.precio_venta)}</p>
                    <p className="text-[10px] text-p-ink2 uppercase">tu precio de venta</p>
                  </div>
                )}
              </div>
              {/* Proveedores */}
              {provs.length > 0 && (
                <div className="divide-y divide-p-line2">
                  {provs.map((c, j) => (
                    <div key={j} className={`flex items-center gap-3 px-4 py-2.5 flex-wrap ${j === 0 && bestProv?.costo_neto === c.costo_neto ? 'bg-p-light/50' : ''}`}>
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${PROVCOLOR[c.proveedor] ?? 'bg-gray-100 text-gray-600'}`}>{c.proveedor}</span>
                      {c.codigo && <span className="font-mono text-xs text-p-ink2">cód {c.codigo}</span>}
                      {c.es_promo && <span className="text-[10px] font-bold bg-rose-100 text-rose-600 px-1.5 py-0.5 rounded">PROMO</span>}
                      <span className="ml-auto font-mono font-bold text-sm text-p-ink">{moneyARS(c.costo_neto)}</span>
                      {c.disponible && (
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${c.disponible === 'SI' ? 'bg-green-100 text-green-700' : c.disponible === 'NO' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-700'}`}>{c.disponible === 'MIN' ? 'mín' : c.disponible.toLowerCase()}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {provs.length === 0 && s && (
                <div className="px-4 py-2.5 text-xs text-p-ink2">No figura en las listas de proveedores cargadas.</div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
