'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

function expandDesc(desc: string): string {
  return desc
    .replace(/^E-PSAS\./i, 'E-Parabrisas')
    .replace(/^PSAS\./i, 'Parabrisas')
    .replace(/^P\.D\.D\./i, 'Puerta Del. Der.')
    .replace(/^P\.D\.I\./i, 'Puerta Del. Izq.')
    .replace(/^P\.T\.D\./i, 'Puerta Tras. Der.')
    .replace(/^P\.T\.I\./i, 'Puerta Tras. Izq.')
    .replace(/^LTA\.TER\./i, 'Lateral Trasero')
    .replace(/^LTA\./i, 'Lateral')
    .replace(/^P\.T\./i, 'Puerta Trasera')
    .replace(/^P\.D\./i, 'Puerta Delantera')
    .replace(/C\/PAS/gi, 'c/Pasacables')
    .replace(/C\/CAP/gi, 'c/Capota')
    .replace(/C\/ANT/gi, 'c/Antena')
    .replace(/C\/SER/gi, 'c/Serrucho')
    .replace(/C\/CAM/gi, 'c/Cámara')
    .replace(/C\/SEN/gi, 'c/Sensor')
    .replace(/S\/ANT/gi, 's/Antena')
    .replace(/S\/SER/gi, 's/Serrucho')
    .replace(/C\/C/gi, 'c/Calc.')
    .replace(/DEGRADE/gi, 'Degradé')
}

function origenLabel(codigo: string | null): string | null {
  if (!codigo) return null
  const last = codigo.slice(-1).toUpperCase()
  if (last === "P") return "Pilkington"
  if (last === "I") return "PLK Imp."
  return null
}

const moneyARS = (n: number) => '$' + Math.round(n).toLocaleString('es-AR')
const PROV_DESC: Record<string, number> = {
  GAMMA:     0.48,
  MALATESTA: 0.53,
  SEKURIT:   0,
}

const PROV_COLOR: Record<string, { bg: string; text: string }> = {
  GAMMA:     { bg: '#dcfce7', text: '#166534' },
  MALATESTA: { bg: '#dbeafe', text: '#1e40af' },
  SEKURIT:   { bg: '#ede9fe', text: '#5b21b6' },
}

interface Pieza {
  id: string; proveedor: string; descripcion: string
  pos: string | null; costo_neto: number; precio_lista: number | null
  lista_nombre: string | null; codigo: string | null
}

export default function OfertasClient() {
  const [piezas, setPiezas] = useState<Pieza[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [provFilter, setProvFilter] = useState('')
  const [sortByDesc, setSortByDesc] = useState(true) // true = mayor descuento primero
  const supabase = createClient()

  useEffect(() => {
    Promise.all([
      supabase.from('catalogo')
        .select('id,proveedor,descripcion,pos,costo_neto,precio_lista,lista_nombre,codigo')
        .eq('es_promo', true)
        .order('proveedor')
        .limit(500),
      // Lista regular de GAMMA para comparar precios
      supabase.from('catalogo')
        .select('id,proveedor,descripcion,pos,costo_neto,precio_lista,lista_nombre,codigo')
        .eq('es_promo', false)
        .is('lista_nombre', null)
        .in('proveedor', ['GAMMA','MALATESTA'])
        .limit(6000),
    ]).then(([{ data: promos }, { data: regulares }]) => {
      setPiezas([...(promos ?? []), ...(regulares ?? [])])
      setLoading(false)
    })
  }, [supabase])

  const listas = [...new Set(piezas.map(p => p.lista_nombre).filter(Boolean))]
  const proveedores = [...new Set(piezas.map(p => p.proveedor))]

  const filtradas = piezas.filter(p => {
    const matchQ = !q || p.descripcion.toLowerCase().includes(q.toLowerCase()) || (p.codigo||'').toLowerCase().includes(q.toLowerCase())
    const matchP = !provFilter || p.lista_nombre === provFilter
    return matchQ && matchP
  })

  // Agrupar por lista
  const porLista = filtradas.reduce((acc, p) => {
    const k = p.lista_nombre || p.proveedor
    if (!acc[k]) acc[k] = []
    acc[k].push(p)
    return acc
  }, {} as Record<string, Pieza[]>)

  return (
    <div>
      {/* Controles */}
      <div className="flex gap-3 flex-wrap mb-5">
        <input value={q} onChange={e => setQ(e.target.value)}
          placeholder="Buscar modelo…"
          className="flex-1 min-w-[200px] border border-p-line rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-p-green bg-white shadow-sm"/>
        <select value={provFilter} onChange={e => setProvFilter(e.target.value)}
          className="border border-p-line rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-p-green bg-white shadow-sm">
          <option value="">Todas las listas</option>
          {listas.map(l => <option key={l!} value={l!}>{l}</option>)}
        </select>
      </div>

      {loading ? (
        <p className="text-sm text-p-gray text-center py-10">Cargando ofertas…</p>
      ) : piezas.length === 0 ? (
        <div className="bg-white border border-p-line rounded-xl p-10 text-center">
          <p className="text-4xl mb-3">📄</p>
          <p className="font-saira font-bold text-p-ink text-lg">Sin ofertas cargadas</p>
          <p className="text-sm text-p-ink2 mt-1">Importá los PDFs de oferta desde <a href="/proveedores" className="text-p-green font-semibold">Proveedores</a>.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {/* Resumen */}
          <div className="flex gap-3 flex-wrap">
            {listas.map(l => {
              const items = piezas.filter(p => p.lista_nombre === l)
              const prov = items[0]?.proveedor
              const c = PROV_COLOR[prov] || { bg: '#f3f4f6', text: '#374151' }
              return (
                <button key={l!} onClick={() => setProvFilter(provFilter === l ? '' : l!)}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl border-2 transition-all"
                  style={{ background: provFilter === l ? c.bg : '#fff', borderColor: provFilter === l ? c.text : '#E5E7EB', color: c.text }}>
                  <span className="font-bold text-sm">{l}</span>
                  <span className="font-mono text-xs bg-white/70 px-1.5 py-0.5 rounded-full">{items.length}</span>
                </button>
              )
            })}
            <span className="text-sm text-p-ink2 self-center ml-auto">
              {filtradas.length} piezas{q ? ` para "${q}"` : ''}
            </span>
          </div>

          {/* Tablas por lista */}
          {Object.entries(porLista).map(([lista, items]) => {
            const prov = items[0]?.proveedor
            const c = PROV_COLOR[prov] || { bg: '#f3f4f6', text: '#374151' }
            return (
              <div key={lista} className="bg-white border border-p-line rounded-xl overflow-hidden shadow-sm">
                <div className="flex items-center justify-between px-4 py-3 border-b border-p-line2"
                  style={{ background: c.bg }}>
                  <div className="flex items-center gap-2">
                    <span className="font-saira font-bold text-sm" style={{ color: c.text }}>{lista}</span>
                    <span className="text-xs font-mono" style={{ color: c.text }}>{items.length} piezas</span>
                  </div>
                  <span className="text-xs font-semibold" style={{ color: c.text }}>{prov}</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-p-line2 bg-gray-50">
                        <th className="text-left px-4 py-2 text-[11px] font-semibold text-p-ink2 uppercase tracking-wider">Descripción</th>
                        <th className="text-left px-4 py-2 text-[11px] font-semibold text-p-ink2 uppercase tracking-wider">Cód.</th>
                        <th className="text-right px-4 py-2 text-[11px] font-semibold text-p-ink2 uppercase tracking-wider">Precio oferta</th>
                        <th className="text-right px-4 py-2 text-[11px] font-semibold text-p-ink2 uppercase tracking-wider">
                          <button onClick={()=>setSortByDesc(p=>!p)} className="flex items-center gap-1 ml-auto hover:text-p-green">
                            Lista regular {sortByDesc ? '↓' : '↑'}
                          </button>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...items].sort((a, b) => {
                        const getRef = (p: Pieza) => {
                          const regularRow = p.codigo ? piezas.find(x => x.codigo === p.codigo && !x.lista_nombre) : null
                          const regularRowBase = !regularRow && p.codigo ? piezas.find(x => x.codigo && x.codigo.slice(0,6) === p.codigo!.slice(0,6) && !x.lista_nombre && x.proveedor === p.proveedor) : null
                          const refRow = regularRow || regularRowBase
                          return refRow ? refRow.costo_neto : (p.precio_lista && p.precio_lista !== p.costo_neto ? p.precio_lista : null)
                        }
                        const refA = getRef(a), refB = getRef(b)
                        const pctA = refA ? (refA - a.costo_neto) / refA * 100 : -999
                        const pctB = refB ? (refB - b.costo_neto) / refB * 100 : -999
                        return sortByDesc ? pctB - pctA : pctA - pctB
                      }).map((p, i) => {
                        // 1) Código exacto
                        const regularRow = p.codigo
                          ? piezas.find(x => x.codigo === p.codigo && !x.lista_nombre)
                          : null
                        // 2) Código base (primeros 9 chars) — para variantes VSLP/VSLI etc.
                        const regularRowBase = !regularRow && p.codigo
                          ? piezas.find(x => x.codigo && x.codigo.slice(0,6) === p.codigo!.slice(0,6) && !x.lista_nombre && x.proveedor === prov)
                          : null
                        // 3) Por descripción exacta (fallback)
                        const regularRowDesc = !regularRow && !regularRowBase
                          ? piezas.find(x => !x.lista_nombre && x.proveedor === prov && x.descripcion === p.descripcion)
                          : null
                        // 4) precio_lista del registro
                        // Para Mix Malatesta (es_promo, sin código): precio_lista = precio Euroglass solo (ya es neto, sin descuento adicional)
                        // Para lista regular: costo_neto ya tiene descuento aplicado
                        const refRow = regularRow || regularRowBase || regularRowDesc
                        const precioRef = refRow
                          ? refRow.costo_neto
                          : (p.precio_lista && p.precio_lista !== p.costo_neto ? p.precio_lista : null)
                        const ahorro = precioRef
                          ? Math.round(((precioRef - p.costo_neto) / precioRef) * 100)
                          : null

                        return (
                          <tr key={p.id} className={`border-b border-p-line2 last:border-0 ${i % 2 === 0 ? '' : 'bg-gray-50/50'}`}>
                            <td className="px-4 py-2.5 text-p-ink font-medium">{expandDesc(p.descripcion)}</td>
                            <td className="px-4 py-2.5 text-xs text-p-ink2">
                              <span className="font-mono">{p.codigo || '—'}</span>
                              {p.codigo && origenLabel(p.codigo) && (
                                <span className="ml-1.5 text-[10px] border border-p-line rounded px-1 py-0.5 text-p-ink2">{origenLabel(p.codigo)}</span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              <span className="font-mono font-bold" style={{ color: c.text }}>{moneyARS(p.costo_neto)}</span>
                            </td>
                            <td className="px-4 py-2.5 text-right text-xs">
                              {precioRef ? (
                                <div className="flex items-center justify-end gap-1.5">
                                  <span className="font-mono text-p-ink2">{moneyARS(precioRef)}</span>
                                  {ahorro !== null && ahorro !== 0 && (
                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${ahorro > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                                      {ahorro > 0 ? '↓' : '↑'}{Math.abs(ahorro)}%
                                    </span>
                                  )}
                                  {ahorro === 0 && (
                                    <span className="text-[10px] text-p-ink2 px-1">＝</span>
                                  )}

                                </div>
                              ) : '—'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
