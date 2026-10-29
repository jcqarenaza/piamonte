'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { moneyARS } from '@/lib/utils/format'

/**
 * REVISAR — reemplaza a Comparar y Equivalencias. Tres listas que se arman solas:
 *  1. Familias con descripciones distintas entre proveedores → se elige la oficial (tabla familias)
 *  2. Equivalencias a mano: vincular dos familias (grupo_id) o deshacer un vínculo
 *  3. Fichas de stock cuyo código no está en ninguna lista → sugerencia por base de 6 dígitos
 */

const PROV_COLOR: Record<string, string> = { GAMMA: '#166534', MALATESTA: '#1e40af', SEKURIT: '#5b21b6' }
const Prov = ({ p }: { p: string }) => <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white" style={{ background: PROV_COLOR[p] || '#6b7280' }}>{p}</span>

interface FamRev { familia: string; descripciones: number; opciones: { proveedor: string; codigo: string; descripcion: string }[]; stock: number }
interface Grupo { grupo_id: number; familias: string[]; descripcion: string; codigos: number }
interface StockSin { id: string; codigo: string; descripcion: string; cantidad: number; costo: number; precio_venta: number; pos: string | null; sugerencias: { familia: string; codigo: string; proveedor: string; descripcion: string }[] | null }
interface CatRow { familia: string; codigo: string; proveedor: string; descripcion: string; grupo_id: number | null }

export default function RevisarClient() {
  const supabase = createClient()
  const [sub, setSub] = useState<'desc' | 'equiv' | 'stock'>('desc')
  const [fams, setFams] = useState<FamRev[]>([])
  const [grupos, setGrupos] = useState<Grupo[]>([])
  const [stockSin, setStockSin] = useState<StockSin[]>([])
  const [loading, setLoading] = useState(true)
  const [custom, setCustom] = useState<Record<string, string>>({})

  const cargar = useCallback(async () => {
    setLoading(true)
    const [a, b, c] = await Promise.all([
      supabase.from('vista_familias_a_revisar').select('*').order('stock', { ascending: false }).order('familia').limit(300),
      supabase.from('vista_grupos_manuales').select('*').order('grupo_id', { ascending: false }),
      supabase.from('vista_stock_sin_catalogo_sug').select('*').order('cantidad', { ascending: false }),
    ])
    setFams((a.data ?? []) as FamRev[]); setGrupos((b.data ?? []) as Grupo[]); setStockSin((c.data ?? []) as StockSin[])
    setLoading(false)
  }, [supabase])
  useEffect(() => { cargar() }, [cargar])

  // ── 1) Descripción oficial ──
  async function elegirDescripcion(f: FamRev, descripcion: string) {
    const d = descripcion.trim(); if (!d) return
    const pos = f.opciones[0] ? null : null
    const { error } = await supabase.from('familias').upsert({ familia: f.familia, descripcion: d, pos })
    if (error) { alert('No se pudo guardar: ' + error.message); return }
    setFams(prev => prev.filter(x => x.familia !== f.familia))
  }

  // ── 2) Equivalencias a mano ──
  const [qa, setQa] = useState(''); const [qb, setQb] = useState('')
  const [ra, setRa] = useState<CatRow[]>([]); const [rb, setRb] = useState<CatRow[]>([])
  const [selA, setSelA] = useState<CatRow | null>(null); const [selB, setSelB] = useState<CatRow | null>(null)
  async function buscarCat(q: string, set: (r: CatRow[]) => void) {
    if (q.trim().length < 3) { set([]); return }
    const { data } = await supabase.from('catalogo').select('familia,codigo,proveedor,descripcion,grupo_id')
      .or(`codigo.ilike.%${q.trim()}%,descripcion.ilike.%${q.trim()}%`).order('codigo').limit(30)
    // una fila por familia
    const m = new Map<string, CatRow>()
    for (const r of (data ?? []) as CatRow[]) if (!m.has(r.familia)) m.set(r.familia, r)
    set([...m.values()])
  }
  useEffect(() => { const t = setTimeout(() => buscarCat(qa, setRa), 300); return () => clearTimeout(t) }, [qa]) // eslint-disable-line
  useEffect(() => { const t = setTimeout(() => buscarCat(qb, setRb), 300); return () => clearTimeout(t) }, [qb]) // eslint-disable-line
  async function vincular() {
    if (!selA || !selB || selA.familia === selB.familia) return
    if (!confirm(`¿Son la misma pieza?\n\n· ${selA.familia} — ${selA.descripcion}\n· ${selB.familia} — ${selB.descripcion}\n\nVan a aparecer juntas en Precios (todos los códigos de las dos familias).`)) return
    const { error } = await supabase.rpc('vincular_familias', { p_a: selA.familia, p_b: selB.familia })
    if (error) { alert('No se pudo vincular: ' + error.message); return }
    setSelA(null); setSelB(null); setQa(''); setQb(''); setRa([]); setRb([])
    cargar()
  }
  async function desvincular(familia: string) {
    if (!confirm(`¿Sacar ${familia} del grupo? Vuelve a mostrarse sola (sus propios códigos siguen juntos).`)) return
    const { error } = await supabase.rpc('desvincular_familia', { p_familia: familia })
    if (error) { alert(error.message); return }
    cargar()
  }

  // ── 3) Stock sin catálogo ──
  async function usarCodigo(s: StockSin, codigo: string) {
    if (!confirm(`¿Cambiar el código de la ficha de stock "${s.descripcion}"?\n\n${s.codigo} → ${codigo}\n\nEl código viejo queda anotado en las notas de la ficha.`)) return
    const { data: ficha } = await supabase.from('stock').select('notas').eq('id', s.id).maybeSingle()
    const notas = `${(ficha as any)?.notas ? (ficha as any).notas + ' · ' : ''}código anterior: ${s.codigo}`
    const { error } = await supabase.from('stock').update({ codigo, notas }).eq('id', s.id)
    if (error) { alert('No se pudo cambiar: ' + error.message); return }
    setStockSin(prev => prev.filter(x => x.id !== s.id))
  }

  const Pill = ({ v, label, n }: { v: typeof sub; label: string; n: number }) => (
    <button onClick={() => setSub(v)}
      style={{ background: sub === v ? '#00A550' : '#fff', color: sub === v ? '#fff' : '#4A6655', border: `1.5px solid ${sub === v ? '#00A550' : '#C2DDD0'}`, borderRadius: 20, padding: '6px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
      {label} <span style={{ opacity: .75, fontWeight: 400 }}>({n})</span>
    </button>
  )

  return (
    <div>
      <div className="flex gap-2 flex-wrap mb-4">
        <Pill v="desc" label="📝 Descripciones distintas" n={fams.length}/>
        <Pill v="equiv" label="🔗 Equivalencias a mano" n={grupos.length}/>
        <Pill v="stock" label="📦 Stock sin catálogo" n={stockSin.length}/>
      </div>
      {loading && <p className="text-sm text-p-gray text-center py-6">Cargando…</p>}

      {/* ── 1 ── */}
      {!loading && sub === 'desc' && (
        <div>
          <p className="text-[11px] text-p-ink2 mb-3">La misma pieza tiene descripciones distintas según el proveedor. Elegí la que va a mostrar Precios (o escribí una). Primero las que tenés en stock.</p>
          {fams.length === 0 && <p className="text-sm text-p-gray text-center py-6">Nada para revisar.</p>}
          <div className="flex flex-col gap-2">
            {fams.map(f => (
              <div key={f.familia} className={`bg-white border rounded-xl p-3 ${f.stock > 0 ? 'border-green-300' : 'border-p-line'}`}>
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className="font-mono font-bold text-sm text-p-ink">{f.familia}</span>
                  {f.stock > 0 && <span className="text-[11px] font-bold text-green-700 bg-green-50 border border-green-300 rounded-full px-2">📦 {f.stock} en stock</span>}
                  <span className="text-[10px] text-p-ink2">{f.descripciones} descripciones</span>
                </div>
                <div className="flex flex-col gap-1">
                  {Array.from(new Map(f.opciones.map(o => [o.descripcion.trim().toUpperCase(), o])).values()).map(o => (
                    <button key={o.descripcion} onClick={() => elegirDescripcion(f, o.descripcion)}
                      className="flex items-center gap-2 text-left text-xs px-2 py-1.5 rounded-lg border border-p-line hover:border-p-green hover:bg-green-50">
                      <Prov p={o.proveedor}/><span className="font-mono text-[10px] text-p-ink2">{o.codigo}</span><span className="text-p-ink">{o.descripcion}</span>
                      <span className="ml-auto text-[10px] text-p-green font-semibold">usar ésta</span>
                    </button>
                  ))}
                  <div className="flex gap-2 items-center mt-1">
                    <input value={custom[f.familia] ?? ''} onChange={e => setCustom(p => ({ ...p, [f.familia]: e.target.value }))} placeholder="…o escribí la descripción"
                      className="flex-1 border border-p-line rounded-lg px-2 py-1 text-xs"/>
                    <button disabled={!(custom[f.familia] ?? '').trim()} onClick={() => elegirDescripcion(f, custom[f.familia])}
                      className="text-xs font-semibold text-white bg-p-green rounded-lg px-3 py-1 disabled:opacity-40">Guardar</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 2 ── */}
      {!loading && sub === 'equiv' && (
        <div className="flex flex-col gap-4">
          <div className="bg-white border border-p-line rounded-xl p-4">
            <p className="font-saira font-bold text-sm text-p-ink mb-1">Vincular dos piezas que son la misma</p>
            <p className="text-[11px] text-p-ink2 mb-3">Para los casos que la regla automática no agarra (Sekurit, códigos viejos, bases distintas). Buscá una a cada lado y confirmá.</p>
            <div className="grid md:grid-cols-2 gap-3">
              {[{ q: qa, setQ: setQa, r: ra, sel: selA, setSel: setSelA }, { q: qb, setQ: setQb, r: rb, sel: selB, setSel: setSelB }].map((side, i) => (
                <div key={i}>
                  <input value={side.q} onChange={e => { side.setQ(e.target.value); side.setSel(null) }} placeholder={i === 0 ? 'Pieza A (código o descripción)' : 'Pieza B'}
                    className="w-full border-2 border-p-line focus:border-p-green rounded-xl px-3 py-2 text-sm outline-none"/>
                  {side.sel ? (
                    <div className="mt-2 text-xs bg-green-50 border border-green-300 rounded-lg px-2 py-1.5"><span className="font-mono font-bold">{side.sel.familia}</span> · {side.sel.descripcion}</div>
                  ) : (
                    <div className="mt-1 max-h-48 overflow-y-auto flex flex-col gap-0.5">
                      {side.r.map(r => (
                        <button key={r.familia} onClick={() => side.setSel(r)} className="text-left text-xs px-2 py-1 rounded hover:bg-p-light flex items-center gap-2">
                          <Prov p={r.proveedor}/><span className="font-mono font-bold">{r.familia}</span><span className="text-p-ink2 truncate">{r.descripcion}</span>
                          {r.grupo_id && <span className="text-[10px] text-purple-700">grupo {r.grupo_id}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <button disabled={!selA || !selB || selA.familia === selB.familia} onClick={vincular}
              className="mt-3 text-sm font-bold text-white bg-p-green rounded-xl px-4 py-2 disabled:opacity-40">🔗 Son la misma pieza</button>
          </div>

          <div className="bg-white border border-p-line rounded-xl p-4">
            <p className="font-saira font-bold text-sm text-p-ink mb-2">Vínculos existentes ({grupos.length})</p>
            {grupos.length === 0 && <p className="text-xs text-p-gray">No hay vínculos a mano.</p>}
            <div className="flex flex-col divide-y divide-p-line2">
              {grupos.map(g => (
                <div key={g.grupo_id} className="py-1.5 flex items-center gap-2 flex-wrap text-xs">
                  <span className="text-[10px] text-p-ink2 w-14">grupo {g.grupo_id}</span>
                  {g.familias.map(f => (
                    <span key={f} className="inline-flex items-center gap-1 bg-p-light border border-p-line rounded-lg px-2 py-0.5">
                      <span className="font-mono font-bold">{f}</span>
                      <button onClick={() => desvincular(f)} title="Sacar del grupo" className="text-red-500 hover:text-red-700 font-bold">×</button>
                    </span>
                  ))}
                  <span className="text-p-ink2 truncate">{g.descripcion}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── 3 ── */}
      {!loading && sub === 'stock' && (
        <div>
          <p className="text-[11px] text-p-ink2 mb-3">Fichas de stock cuyo código no existe en ninguna lista de proveedor: no se les actualiza el costo ni aparecen como equivalentes. Si hay una sugerencia con la misma base, usala; si no, corregí el código en Stock.</p>
          {stockSin.length === 0 && <p className="text-sm text-p-gray text-center py-6">Todo el stock está en el catálogo.</p>}
          <div className="flex flex-col gap-2">
            {stockSin.map(s => (
              <div key={s.id} className="bg-white border border-p-line rounded-xl p-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono font-bold text-sm">{s.codigo}</span>
                  <span className="text-sm text-p-ink">{s.descripcion}</span>
                  <span className="text-[11px] font-bold text-green-700 bg-green-50 border border-green-300 rounded-full px-2">📦 {s.cantidad}</span>
                  <span className="text-[10px] text-p-ink2">costo {moneyARS(Number(s.costo) || 0)} · venta {moneyARS(Number(s.precio_venta) || 0)}</span>
                </div>
                {s.sugerencias?.length ? (
                  <div className="mt-2 flex flex-col gap-1">
                    {s.sugerencias.map(sg => (
                      <button key={sg.familia} onClick={() => usarCodigo(s, sg.codigo)}
                        className="flex items-center gap-2 text-left text-xs px-2 py-1 rounded-lg border border-p-line hover:border-p-green hover:bg-green-50">
                        <Prov p={sg.proveedor}/><span className="font-mono font-bold">{sg.codigo}</span><span className="text-p-ink2 truncate">{sg.descripcion}</span>
                        <span className="ml-auto text-[10px] text-p-green font-semibold">usar este código</span>
                      </button>
                    ))}
                  </div>
                ) : <p className="text-[11px] text-amber-700 mt-1">Sin sugerencia (el código no tiene base de 6 dígitos conocida).</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
