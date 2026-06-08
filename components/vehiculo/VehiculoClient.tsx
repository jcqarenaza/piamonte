'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

const POS_LABEL: Record<string, string> = {
  PARABRISAS:'Parabrisas', LUNETA:'Luneta', TECHO:'Techo solar',
  PUERTA_DD:'Puerta Del. Der.', PUERTA_DI:'Puerta Del. Izq.',
  PUERTA_TD:'Puerta Tra. Der.', PUERTA_TI:'Puerta Tra. Izq.',
  CUSTODIA_D:'Custodia Der.', CUSTODIA_I:'Custodia Izq.',
}

const POSICIONES = Object.keys(POS_LABEL)

interface CatRow { id:string; proveedor:string; codigo:string|null; descripcion:string; costo_neto:number; disponible:string|null; es_promo:boolean }
interface StockRow { id:string; descripcion:string; cantidad:number; precio_venta:number|null }

function moneyARS(n:number){ return '$'+Math.round(n).toLocaleString('es-AR') }

const PROV_COLOR: Record<string,string> = {
  GAMMA:'bg-green-100 text-green-700', MALATESTA:'bg-blue-100 text-blue-700', SEKURIT:'bg-purple-100 text-purple-700'
}

export default function VehiculoClient() {
  const [marca, setMarca]   = useState('')
  const [pos, setPos]       = useState<string|null>(null)
  const [cat, setCat]       = useState<CatRow[]>([])
  const [stock, setStock]   = useState<StockRow[]>([])
  const [loading, setLoading] = useState(false)
  const [marcaSugs, setMarcaSugs] = useState<string[]>([])
  const supabase = createClient()

  // Sugerencias de marcas
  useEffect(() => {
    if (marca.length < 2) { setMarcaSugs([]); return }
    supabase.from('catalogo').select('marca').ilike('marca', `%${marca}%`)
      .limit(20).then(({ data }) => {
        const unicas = [...new Set((data??[]).map((r:any)=>r.marca).filter(Boolean))] as string[]
        setMarcaSugs(unicas.slice(0,6))
      })
  }, [marca, supabase])

  const buscar = useCallback(async () => {
    if (!pos) return
    setLoading(true)
    const q = supabase.from('catalogo')
      .select('id,proveedor,codigo,descripcion,costo_neto,disponible,es_promo')
      .eq('pos', pos).order('costo_neto')
    if (marca.trim()) q.ilike('descripcion', `%${marca}%`)
    const { data: catData } = await q.limit(50)
    const { data: stockData } = await supabase.from('stock')
      .select('id,descripcion,cantidad,precio_venta').eq('pos', pos).eq('activo', true).gt('cantidad', 0)
    setCat(catData ?? [])
    setStock(stockData ?? [])
    setLoading(false)
  }, [pos, marca, supabase])

  useEffect(() => { buscar() }, [buscar])

  function selPos(p: string) { setPos(prev => prev === p ? null : p) }

  // SVG colores
  const c = (p:string) => pos===p ? '#00A550' : '#C2DDD0'
  const t = (p:string) => pos===p ? '#ffffff' : '#1a3a2a'
  const s = (p:string) => pos===p ? '#005C2E' : '#4A6655'

  return (
    <div className="flex flex-col gap-6">

      {/* Búsqueda por marca/modelo */}
      <div className="relative max-w-sm">
        <label className="block text-xs font-semibold text-p-ink2 uppercase tracking-wider mb-1.5">
          Filtrar por marca / modelo
        </label>
        <input value={marca} onChange={e=>{setMarca(e.target.value);setMarcaSugs([])}}
          placeholder="Ej: Ford, Toyota Hilux…"
          className="w-full border border-p-line rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-p-green" />
        {marcaSugs.length > 0 && (
          <div className="absolute z-10 top-full left-0 right-0 bg-white border border-p-line rounded-xl shadow-lg mt-1 overflow-hidden">
            {marcaSugs.map(m => (
              <button key={m} onClick={()=>{setMarca(m);setMarcaSugs([])}}
                className="w-full text-left px-4 py-2 text-sm hover:bg-p-light border-b border-p-line2 last:border-0">
                {m}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* SVG perfil lateral */}
        <div className="flex-1">
          <p className="text-xs text-p-ink2 mb-3 text-center">Tocá una zona para ver precios de catálogo y stock disponible</p>
          <svg viewBox="0 0 600 260" className="w-full max-w-2xl mx-auto drop-shadow-sm">

            {/* Carrocería base */}
            <path d="M 60 180 L 60 140 Q 62 138 80 130 L 160 75 Q 185 58 230 52 L 370 52 Q 420 54 460 75 L 530 130 Q 545 138 548 145 L 548 180 Q 548 195 535 200 L 80 200 Q 65 195 60 180 Z"
              fill="#e8f0ec" stroke="#9ca3af" strokeWidth="1.5"/>

            {/* PARABRISAS */}
            <g onClick={()=>selPos('PARABRISAS')} style={{cursor:'pointer'}}>
              <path d="M 162 77 L 225 55 L 268 52 L 268 130 L 185 135 Q 165 132 158 125 Z"
                fill={c('PARABRISAS')} stroke={s('PARABRISAS')} strokeWidth="1.5" opacity="0.9"/>
              <text x="218" y="100" textAnchor="middle" fontSize="10" fontWeight="bold" fill={t('PARABRISAS')}>Para-</text>
              <text x="218" y="113" textAnchor="middle" fontSize="10" fontWeight="bold" fill={t('PARABRISAS')}>brisas</text>
            </g>

            {/* PUERTA_DI — delantera (lado visible, lado izquierdo del auto) */}
            <g onClick={()=>selPos('PUERTA_DI')} style={{cursor:'pointer'}}>
              <path d="M 272 53 L 370 53 L 370 135 L 272 135 Z"
                fill={c('PUERTA_DI')} stroke={s('PUERTA_DI')} strokeWidth="1.5" opacity="0.9"/>
              <text x="321" y="98" textAnchor="middle" fontSize="10" fontWeight="bold" fill={t('PUERTA_DI')}>P. Del.</text>
              <text x="321" y="111" textAnchor="middle" fontSize="10" fontWeight="bold" fill={t('PUERTA_DI')}>Izq.</text>
            </g>

            {/* PUERTA_TI — trasera */}
            <g onClick={()=>selPos('PUERTA_TI')} style={{cursor:'pointer'}}>
              <path d="M 374 53 L 440 53 L 455 80 L 455 135 L 374 135 Z"
                fill={c('PUERTA_TI')} stroke={s('PUERTA_TI')} strokeWidth="1.5" opacity="0.9"/>
              <text x="412" y="98" textAnchor="middle" fontSize="10" fontWeight="bold" fill={t('PUERTA_TI')}>P. Tra.</text>
              <text x="412" y="111" textAnchor="middle" fontSize="10" fontWeight="bold" fill={t('PUERTA_TI')}>Izq.</text>
            </g>

            {/* LUNETA */}
            <g onClick={()=>selPos('LUNETA')} style={{cursor:'pointer'}}>
              <path d="M 459 82 L 527 132 Q 535 140 530 148 L 462 140 L 459 82 Z"
                fill={c('LUNETA')} stroke={s('LUNETA')} strokeWidth="1.5" opacity="0.9"/>
              <text x="496" y="120" textAnchor="middle" fontSize="10" fontWeight="bold" fill={t('LUNETA')}>Luneta</text>
            </g>

            {/* TECHO (zona superior, no vidrio pero útil) */}
            <g onClick={()=>selPos('TECHO')} style={{cursor:'pointer'}}>
              <path d="M 270 45 L 370 45 L 370 52 L 270 52 Z"
                fill={c('TECHO')} stroke={s('TECHO')} strokeWidth="1.5" opacity="0.9"/>
              <text x="320" y="51" textAnchor="middle" fontSize="8" fontWeight="bold" fill={t('TECHO')}>Techo</text>
            </g>

            {/* CUSTODIA_I — pequeña ventanilla trasera fija */}
            <g onClick={()=>selPos('CUSTODIA_I')} style={{cursor:'pointer'}}>
              <path d="M 442 55 L 462 55 L 462 80 L 455 80 L 440 55 Z"
                fill={c('CUSTODIA_I')} stroke={s('CUSTODIA_I')} strokeWidth="1.5" opacity="0.9"/>
              <text x="452" y="70" textAnchor="middle" fontSize="7" fontWeight="bold" fill={t('CUSTODIA_I')}>Cust</text>
            </g>

            {/* CUSTODIA_D — pequeña ventanilla delantera fija */}
            <g onClick={()=>selPos('CUSTODIA_D')} style={{cursor:'pointer'}}>
              <path d="M 162 77 L 180 55 L 195 55 L 195 80 Z"
                fill={c('CUSTODIA_D')} stroke={s('CUSTODIA_D')} strokeWidth="1.5" opacity="0.9"/>
              <text x="180" y="70" textAnchor="middle" fontSize="7" fontWeight="bold" fill={t('CUSTODIA_D')}>Cust</text>
            </g>

            {/* Carrocería inferior */}
            <rect x="60" y="195" width="488" height="18" rx="4" fill="#d1d5db"/>
            {/* Ruedas */}
            <circle cx="165" cy="210" r="32" fill="#374151"/>
            <circle cx="165" cy="210" r="18" fill="#6b7280"/>
            <circle cx="445" cy="210" r="32" fill="#374151"/>
            <circle cx="445" cy="210" r="18" fill="#6b7280"/>
            {/* Separaciones de puertas */}
            <line x1="270" y1="136" x2="270" y2="200" stroke="#9ca3af" strokeWidth="2"/>
            <line x1="372" y1="136" x2="372" y2="200" stroke="#9ca3af" strokeWidth="2"/>
            <line x1="457" y1="140" x2="457" y2="200" stroke="#9ca3af" strokeWidth="2"/>
            {/* Espejo retrovisor */}
            <ellipse cx="148" cy="128" rx="14" ry="8" fill="#9ca3af"/>
          </svg>

          {/* Leyenda */}
          <div className="flex flex-wrap justify-center gap-2 mt-3">
            {POSICIONES.map(p => (
              <button key={p} onClick={()=>selPos(p)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${pos===p ? 'bg-p-green text-white border-p-green' : 'border-p-line text-p-ink2 hover:bg-p-light'}`}>
                {POS_LABEL[p]}
              </button>
            ))}
          </div>
        </div>

        {/* Panel derecho */}
        <div className="w-full lg:w-96">
          {!pos ? (
            <div className="bg-white border border-p-line rounded-xl p-6 text-center">
              <p className="text-3xl mb-2">👆</p>
              <p className="font-saira font-bold text-p-ink">Seleccioná una zona</p>
              <p className="text-sm text-p-ink2 mt-1">Tocá el auto o los botones de abajo.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {/* Stock propio */}
              {stock.length > 0 && (
                <div className="bg-white border-2 border-p-green rounded-xl overflow-hidden">
                  <div className="bg-p-green px-4 py-2">
                    <p className="font-saira font-bold text-white text-sm">✓ En mi stock — {POS_LABEL[pos]}</p>
                  </div>
                  <div className="divide-y divide-p-line2">
                    {stock.map(s => (
                      <div key={s.id} className="flex items-center justify-between px-4 py-2.5 gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-p-ink truncate">{s.descripcion}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-saira font-bold text-p-green">{s.cantidad} u.</p>
                          {s.precio_venta && <p className="font-mono text-xs text-p-dark">{moneyARS(s.precio_venta)}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Catálogo proveedores */}
              <div className="bg-white border border-p-line rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 border-b border-p-line2 bg-p-light flex items-center justify-between">
                  <p className="font-saira font-bold text-sm text-p-ink">
                    Catálogo — {POS_LABEL[pos]}
                    {marca && <span className="font-normal text-p-ink2"> · {marca}</span>}
                  </p>
                  {loading && <span className="text-xs text-p-gray">cargando…</span>}
                  {!loading && <span className="text-xs text-p-ink2">{cat.length} piezas</span>}
                </div>
                {cat.length === 0 && !loading ? (
                  <p className="text-sm text-p-gray text-center py-8">
                    Sin resultados{marca ? ` para "${marca}"` : ''}. {!marca && 'Importá las listas de proveedores.'}
                  </p>
                ) : (
                  <div className="divide-y divide-p-line2 max-h-96 overflow-y-auto">
                    {cat.map(r => (
                      <div key={r.id} className="flex items-center gap-3 px-4 py-2.5 flex-wrap">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${PROV_COLOR[r.proveedor]??'bg-gray-100 text-gray-600'}`}>
                          {r.proveedor}
                        </span>
                        {r.codigo && <span className="font-mono text-xs text-p-ink2 shrink-0">cód {r.codigo}</span>}
                        <span className="text-sm text-p-ink flex-1 min-w-0 truncate">{r.descripcion}</span>
                        {r.es_promo && <span className="text-[10px] font-bold bg-rose-100 text-rose-600 px-1.5 py-0.5 rounded shrink-0">PROMO</span>}
                        {r.disponible && r.disponible!=='SI' && (
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${r.disponible==='NO'?'bg-red-100 text-red-600':'bg-amber-100 text-amber-700'}`}>
                            {r.disponible==='NO'?'sin stock':'mín'}
                          </span>
                        )}
                        <span className="font-mono font-bold text-sm text-p-ink ml-auto shrink-0">{moneyARS(r.costo_neto)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
