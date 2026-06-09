'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { moneyARS } from '@/lib/utils/format'

interface CatRow {
  id: string; proveedor: string; codigo: string | null; descripcion: string
  marca: string | null; pos: string | null; precio_lista: number
  costo_neto: number; disponible: string | null; es_promo: boolean
}

const PROV_COLOR: Record<string, { bg: string; text: string }> = {
  GAMMA:    { bg: '#dcfce7', text: '#166534' },
  MALATESTA:{ bg: '#dbeafe', text: '#1e40af' },
  SEKURIT:  { bg: '#f3e8ff', text: '#6b21a8' },
}

const POS_LABEL: Record<string, string> = {
  PARABRISAS:'Parabrisas', LUNETA:'Luneta', TECHO:'Techo',
  PUERTA_DD:'Puerta DD', PUERTA_DI:'Puerta DI',
  PUERTA_TD:'Puerta TD', PUERTA_TI:'Puerta TI',
  CUSTODIA_D:'Custodia D', CUSTODIA_I:'Custodia I',
  ALETA_D:'Aleta D', ALETA_I:'Aleta I',
}

type Agrupado = { desc: string; pos: string | null; provs: CatRow[] }

export default function CompararClient() {
  const [q, setQ]           = useState('')
  const [grupos, setGrupos] = useState<Agrupado[]>([])
  const [loading, setLoading] = useState(false)
  const [expandido, setExpandido] = useState<string | null>(null)
  const supabase = createClient()

  const buscar = useCallback(async () => {
    if (q.trim().length < 2) { setGrupos([]); return }
    setLoading(true)

    const POS_KW: Record<string,string> = {
      'PARA':'PARABRISAS','PARABRISA':'PARABRISAS','PARABRISAS':'PARABRISAS',
      'LUNETA':'LUNETA','TECHO':'TECHO','PUERTA':'PUERTA',
      'CUSTODIA':'CUSTODIA','ALETA':'ALETA',
    }
    const words    = q.trim().toUpperCase().split(/\s+/).filter(Boolean)
    const posWord  = words.find(w => POS_KW[w])
    const nonPosWs = words.filter(w => !POS_KW[w])
    const mainWord = nonPosWs[0] || words[0]

    let dbQ = supabase.from('catalogo')
      .select('id,proveedor,codigo,descripcion,marca,pos,precio_lista,costo_neto,disponible,es_promo')
    if (posWord && nonPosWs.length > 0) {
      dbQ = dbQ.eq('pos', POS_KW[posWord]).ilike('descripcion', `%${mainWord}%`)
    } else if (posWord) {
      dbQ = dbQ.eq('pos', POS_KW[posWord])
    } else {
      dbQ = dbQ.or(`descripcion.ilike.%${mainWord}%,marca.ilike.%${mainWord}%,codigo.ilike.%${mainWord}%`)
    }
    const { data: dataRaw } = await dbQ
      .order('descripcion').limit(200)
    // Agrupar por descripción normalizada
    const map = new Map<string, Agrupado>()
    for (const row of (dataRaw ?? []).filter((c:any) => restWords.every((w:string) => (c.descripcion||'').toUpperCase().includes(w) || (c.marca||'').toUpperCase().includes(w))) as CatRow[]) {
      const key = row.descripcion.toUpperCase().replace(/\s+/g,' ').trim()
      if (!map.has(key)) map.set(key, { desc: row.descripcion, pos: row.pos, provs: [] })
      map.get(key)!.provs.push(row)
    }
    // Ordenar: primero los que tienen más proveedores
    const arr = [...map.values()].sort((a, b) => b.provs.length - a.provs.length)
    setGrupos(arr)
    setLoading(false)
  }, [q, supabase])

  useEffect(() => {
    const t = setTimeout(buscar, 350)
    return () => clearTimeout(t)
  }, [buscar])

  return (
    <div>
      {/* Buscador */}
      <div className="relative mb-6">
        <input
          value={q} onChange={e => setQ(e.target.value)} autoFocus
          placeholder="Buscá por modelo, marca o código para comparar precios…"
          className="w-full border-2 border-p-line focus:border-p-green rounded-xl px-4 py-3 text-base text-p-ink focus:outline-none shadow-sm"
        />
        {loading && <span className="absolute right-4 top-3.5 text-p-gray text-sm">buscando…</span>}
      </div>

      {!q && (
        <div className="text-center py-16 text-p-gray">
          <p className="text-4xl mb-3">⚖️</p>
          <p className="font-saira font-bold text-p-ink text-lg">Comparador de precios</p>
          <p className="text-sm mt-1">Escribí un modelo para ver precios de todos los proveedores juntos.</p>
        </div>
      )}

      {/* Resultados */}
      <div className="flex flex-col gap-3">
        {grupos.map((g, i) => {
          const key = g.desc
          const isOpen = expandido === key
          const sorted = [...g.provs].sort((a, b) => a.costo_neto - b.costo_neto)
          const best = sorted[0]
          const worst = sorted[sorted.length - 1]
          const ahorro = worst && best ? worst.costo_neto - best.costo_neto : 0

          return (
            <div key={i} className="bg-white border border-p-line rounded-xl shadow-sm overflow-hidden">
              {/* Header clickeable */}
              <button
                onClick={() => setExpandido(isOpen ? null : key)}
                className="w-full text-left px-4 py-3 flex items-start justify-between gap-3 hover:bg-p-light/50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-saira font-bold text-p-ink text-sm">{g.desc}</p>
                    {g.pos && (
                      <span className="text-[10px] font-semibold bg-p-light text-p-dark px-2 py-0.5 rounded-full">
                        {POS_LABEL[g.pos] ?? g.pos}
                      </span>
                    )}
                    {g.provs.some(p => p.es_promo) && (
                      <span className="text-[10px] font-bold bg-rose-100 text-rose-600 px-2 py-0.5 rounded-full">PROMO</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    {sorted.map(p => (
                      <span key={p.id} style={{ background: PROV_COLOR[p.proveedor]?.bg ?? '#f3f4f6', color: PROV_COLOR[p.proveedor]?.text ?? '#374151' }}
                        className="text-[11px] font-bold px-2 py-0.5 rounded-full">
                        {p.proveedor}
                      </span>
                    ))}
                    {ahorro > 0 && (
                      <span className="text-[11px] text-green-600 font-semibold">
                        Ahorrás {moneyARS(ahorro)} eligiendo el mejor precio
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  {best && (
                    <>
                      <p className="font-mono font-bold text-p-ink text-base">{moneyARS(best.costo_neto)}</p>
                      <p className="text-[10px] text-p-ink2">mejor precio</p>
                    </>
                  )}
                  <span className="text-p-gray text-xs">{isOpen ? '▲' : '▼'}</span>
                </div>
              </button>

              {/* Detalle expandido */}
              {isOpen && (
                <div className="border-t border-p-line">
                  {/* Tabla comparativa */}
                  <div className="grid grid-cols-1 divide-y divide-p-line2">
                    {sorted.map((p, j) => {
                      const isBest = j === 0
                      const diff = p.costo_neto - best.costo_neto
                      return (
                        <div key={p.id}
                          className={`flex items-center gap-3 px-4 py-3 flex-wrap ${isBest ? 'bg-green-50' : ''}`}>
                          {/* Proveedor */}
                          <span style={{ background: PROV_COLOR[p.proveedor]?.bg ?? '#f3f4f6', color: PROV_COLOR[p.proveedor]?.text ?? '#374151' }}
                            className="text-xs font-bold px-2.5 py-1 rounded-full shrink-0 min-w-[80px] text-center">
                            {p.proveedor}
                          </span>
                          {/* Código */}
                          {p.codigo && (
                            <span className="font-mono text-xs text-p-ink2 shrink-0">cód {p.codigo}</span>
                          )}
                          {/* Disponibilidad */}
                          {p.disponible && (
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                              p.disponible === 'SI' ? 'bg-green-100 text-green-700' :
                              p.disponible === 'NO' ? 'bg-red-100 text-red-600' :
                              'bg-amber-100 text-amber-700'
                            }`}>
                              {p.disponible === 'MIN' ? 'stock mínimo' : p.disponible === 'SI' ? 'disponible' : 'sin stock'}
                            </span>
                          )}
                          {p.es_promo && (
                            <span className="text-[10px] font-bold bg-rose-100 text-rose-600 px-2 py-0.5 rounded-full shrink-0">PROMO</span>
                          )}
                          <div className="ml-auto text-right">
                            <p className={`font-mono font-bold text-base ${isBest ? 'text-green-700' : 'text-p-ink'}`}>
                              {moneyARS(p.costo_neto)}
                            </p>
                            {diff > 0 && (
                              <p className="text-xs text-red-500 font-mono">+{moneyARS(diff)}</p>
                            )}
                            {isBest && sorted.length > 1 && (
                              <p className="text-[10px] text-green-600 font-bold">✓ más barato</p>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Gráfico de barras proporcional */}
                  {sorted.length > 1 && (
                    <div className="px-4 py-3 border-t border-p-line2 bg-gray-50">
                      <p className="text-[10px] font-semibold text-p-ink2 uppercase tracking-wider mb-2">Comparación visual</p>
                      {sorted.map(p => {
                        const pct = worst.costo_neto > 0 ? (p.costo_neto / worst.costo_neto) * 100 : 100
                        const color = PROV_COLOR[p.proveedor]
                        return (
                          <div key={p.id} className="flex items-center gap-2 mb-1.5">
                            <span className="text-[11px] font-bold w-20 shrink-0 text-right" style={{ color: color?.text ?? '#374151' }}>
                              {p.proveedor}
                            </span>
                            <div className="flex-1 bg-gray-200 rounded-full h-4 overflow-hidden">
                              <div className="h-full rounded-full transition-all duration-500"
                                style={{ width: `${pct}%`, background: color?.text ?? '#374151', opacity: 0.7 }} />
                            </div>
                            <span className="font-mono text-xs font-bold w-24 text-right shrink-0">{moneyARS(p.costo_neto)}</span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {q.length >= 3 && !loading && grupos.length === 0 && (
        <p className="text-center text-sm text-p-gray py-10">
          Sin resultados para "{q}". Probá con otro modelo o importá más listas de proveedores.
        </p>
      )}
    </div>
  )
}
