'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const POS_INFO: Record<string, { label: string; descripcion: string }> = {
  PARABRISAS: { label: 'Parabrisas',       descripcion: 'Vidrio delantero' },
  LUNETA:     { label: 'Luneta',           descripcion: 'Vidrio trasero' },
  TECHO:      { label: 'Techo solar',      descripcion: 'Vidrio del techo' },
  PUERTA_DD:  { label: 'Puerta delantera derecha',  descripcion: 'Ventanilla DD' },
  PUERTA_DI:  { label: 'Puerta delantera izquierda',descripcion: 'Ventanilla DI' },
  PUERTA_TD:  { label: 'Puerta trasera derecha',    descripcion: 'Ventanilla TD' },
  PUERTA_TI:  { label: 'Puerta trasera izquierda',  descripcion: 'Ventanilla TI' },
  CUSTODIA_D: { label: 'Custodia derecha', descripcion: 'Ventanilla fija lateral derecha' },
  CUSTODIA_I: { label: 'Custodia izquierda', descripcion: 'Ventanilla fija lateral izquierda' },
}

interface StockItem {
  id: string; descripcion: string; marca: string | null; modelo: string | null
  pos: string | null; cantidad: number; precio_venta: number | null; costo: number | null
}

export default function VehiculoClient() {
  const [selected, setSelected] = useState<string | null>(null)
  const [stockItems, setStockItems] = useState<StockItem[]>([])
  const [loadingPos, setLoadingPos] = useState<string | null>(null)
  const supabase = createClient()

  async function clickPos(pos: string) {
    if (selected === pos) { setSelected(null); setStockItems([]); return }
    setSelected(pos); setLoadingPos(pos)
    const { data } = await supabase.from('stock')
      .select('id,descripcion,marca,modelo,pos,cantidad,precio_venta,costo')
      .eq('pos', pos).eq('activo', true).order('descripcion')
    setStockItems(data ?? [])
    setLoadingPos(null)
  }

  const posInfo = selected ? POS_INFO[selected] : null

  // Colores por posición
  function fill(pos: string) {
    if (selected === pos) return '#00A550'
    if (loadingPos === pos) return '#7dcfa3'
    return '#C2DDD0'
  }
  function stroke(pos: string) { return selected === pos ? '#005C2E' : '#4A6655' }

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      {/* Diagrama SVG */}
      <div className="flex-1">
        <p className="text-xs text-p-ink2 mb-3 text-center">Tocá una zona para ver tu stock disponible</p>
        <svg viewBox="0 0 500 320" className="w-full max-w-lg mx-auto" style={{ fontFamily: 'Arial, sans-serif' }}>
          {/* Carrocería */}
          <rect x="60" y="80" width="380" height="160" rx="20" fill="#f0f4f2" stroke="#9ca3af" strokeWidth="2"/>

          {/* Techo */}
          <path d="M 140 80 Q 250 30 360 80" fill="none" stroke="#9ca3af" strokeWidth="2"/>

          {/* PARABRISAS */}
          <g onClick={() => clickPos('PARABRISAS')} style={{ cursor: 'pointer' }}>
            <path d="M 140 82 Q 185 45 250 40 Q 315 45 360 82 L 340 130 Q 250 115 160 130 Z"
              fill={fill('PARABRISAS')} stroke={stroke('PARABRISAS')} strokeWidth="2" opacity="0.85"/>
            <text x="250" y="95" textAnchor="middle" fontSize="11" fontWeight="bold" fill={selected === 'PARABRISAS' ? '#fff' : '#1a3a2a'}>
              Parabrisas
            </text>
          </g>

          {/* LUNETA */}
          <g onClick={() => clickPos('LUNETA')} style={{ cursor: 'pointer' }}>
            <path d="M 160 185 Q 250 200 340 185 L 360 82 Q 315 100 250 105 Q 185 100 140 82 Z"
              fill={fill('LUNETA')} stroke={stroke('LUNETA')} strokeWidth="2" opacity="0.85"
              transform="scale(-1,1) translate(-500,0) translate(0,165)"/>
            {/* Luneta propia */}
            <path d="M 160 175 Q 250 200 340 175 L 325 230 Q 250 248 175 230 Z"
              fill={fill('LUNETA')} stroke={stroke('LUNETA')} strokeWidth="2" opacity="0.85"/>
            <text x="250" y="215" textAnchor="middle" fontSize="11" fontWeight="bold" fill={selected === 'LUNETA' ? '#fff' : '#1a3a2a'}>
              Luneta
            </text>
          </g>

          {/* TECHO */}
          <g onClick={() => clickPos('TECHO')} style={{ cursor: 'pointer' }}>
            <path d="M 165 133 Q 250 118 335 133 L 330 172 Q 250 160 170 172 Z"
              fill={fill('TECHO')} stroke={stroke('TECHO')} strokeWidth="2" opacity="0.85"/>
            <text x="250" y="158" textAnchor="middle" fontSize="10" fontWeight="bold" fill={selected === 'TECHO' ? '#fff' : '#1a3a2a'}>
              Techo
            </text>
          </g>

          {/* PUERTA_DI — delantera izquierda (derecha en el SVG vista desde arriba) */}
          <g onClick={() => clickPos('PUERTA_DI')} style={{ cursor: 'pointer' }}>
            <rect x="340" y="90" width="55" height="80" rx="5"
              fill={fill('PUERTA_DI')} stroke={stroke('PUERTA_DI')} strokeWidth="2" opacity="0.85"/>
            <text x="367" y="127" textAnchor="middle" fontSize="9" fontWeight="bold" fill={selected === 'PUERTA_DI' ? '#fff' : '#1a3a2a'}>P.Del</text>
            <text x="367" y="139" textAnchor="middle" fontSize="9" fontWeight="bold" fill={selected === 'PUERTA_DI' ? '#fff' : '#1a3a2a'}>Izq</text>
          </g>

          {/* PUERTA_DD — delantera derecha (izquierda en el SVG) */}
          <g onClick={() => clickPos('PUERTA_DD')} style={{ cursor: 'pointer' }}>
            <rect x="105" y="90" width="55" height="80" rx="5"
              fill={fill('PUERTA_DD')} stroke={stroke('PUERTA_DD')} strokeWidth="2" opacity="0.85"/>
            <text x="132" y="127" textAnchor="middle" fontSize="9" fontWeight="bold" fill={selected === 'PUERTA_DD' ? '#fff' : '#1a3a2a'}>P.Del</text>
            <text x="132" y="139" textAnchor="middle" fontSize="9" fontWeight="bold" fill={selected === 'PUERTA_DD' ? '#fff' : '#1a3a2a'}>Der</text>
          </g>

          {/* PUERTA_TI — trasera izquierda */}
          <g onClick={() => clickPos('PUERTA_TI')} style={{ cursor: 'pointer' }}>
            <rect x="340" y="175" width="55" height="65" rx="5"
              fill={fill('PUERTA_TI')} stroke={stroke('PUERTA_TI')} strokeWidth="2" opacity="0.85"/>
            <text x="367" y="206" textAnchor="middle" fontSize="9" fontWeight="bold" fill={selected === 'PUERTA_TI' ? '#fff' : '#1a3a2a'}>P.Tra</text>
            <text x="367" y="218" textAnchor="middle" fontSize="9" fontWeight="bold" fill={selected === 'PUERTA_TI' ? '#fff' : '#1a3a2a'}>Izq</text>
          </g>

          {/* PUERTA_TD — trasera derecha */}
          <g onClick={() => clickPos('PUERTA_TD')} style={{ cursor: 'pointer' }}>
            <rect x="105" y="175" width="55" height="65" rx="5"
              fill={fill('PUERTA_TD')} stroke={stroke('PUERTA_TD')} strokeWidth="2" opacity="0.85"/>
            <text x="132" y="206" textAnchor="middle" fontSize="9" fontWeight="bold" fill={selected === 'PUERTA_TD' ? '#fff' : '#1a3a2a'}>P.Tra</text>
            <text x="132" y="218" textAnchor="middle" fontSize="9" fontWeight="bold" fill={selected === 'PUERTA_TD' ? '#fff' : '#1a3a2a'}>Der</text>
          </g>

          {/* CUSTODIA_I — izquierda */}
          <g onClick={() => clickPos('CUSTODIA_I')} style={{ cursor: 'pointer' }}>
            <ellipse cx="420" cy="155" rx="22" ry="18"
              fill={fill('CUSTODIA_I')} stroke={stroke('CUSTODIA_I')} strokeWidth="2" opacity="0.85"/>
            <text x="420" y="152" textAnchor="middle" fontSize="8" fontWeight="bold" fill={selected === 'CUSTODIA_I' ? '#fff' : '#1a3a2a'}>Cust</text>
            <text x="420" y="162" textAnchor="middle" fontSize="8" fontWeight="bold" fill={selected === 'CUSTODIA_I' ? '#fff' : '#1a3a2a'}>Izq</text>
          </g>

          {/* CUSTODIA_D — derecha */}
          <g onClick={() => clickPos('CUSTODIA_D')} style={{ cursor: 'pointer' }}>
            <ellipse cx="80" cy="155" rx="22" ry="18"
              fill={fill('CUSTODIA_D')} stroke={stroke('CUSTODIA_D')} strokeWidth="2" opacity="0.85"/>
            <text x="80" y="152" textAnchor="middle" fontSize="8" fontWeight="bold" fill={selected === 'CUSTODIA_D' ? '#fff' : '#1a3a2a'}>Cust</text>
            <text x="80" y="162" textAnchor="middle" fontSize="8" fontWeight="bold" fill={selected === 'CUSTODIA_D' ? '#fff' : '#1a3a2a'}>Der</text>
          </g>

          {/* Ruedas decorativas */}
          {[[100,260],[190,270],[310,270],[400,260]].map(([cx,cy],i) => (
            <ellipse key={i} cx={cx} cy={cy} rx="28" ry="14" fill="#374151" opacity="0.5"/>
          ))}
        </svg>
      </div>

      {/* Panel lateral */}
      <div className="w-full lg:w-80">
        {!selected && (
          <div className="bg-white border border-p-line rounded-xl p-6 text-center">
            <p className="text-3xl mb-2">👆</p>
            <p className="font-saira font-bold text-p-ink">Seleccioná una zona</p>
            <p className="text-sm text-p-ink2 mt-1">Tocá cualquier parte del auto para ver qué tenés en stock.</p>
          </div>
        )}

        {selected && (
          <div className="bg-white border border-p-green rounded-xl overflow-hidden shadow-sm">
            <div className="bg-p-green px-4 py-3">
              <p className="font-saira font-bold text-white text-base">{posInfo?.label}</p>
              <p className="text-green-100 text-xs">{posInfo?.descripcion}</p>
            </div>
            <div className="p-4">
              {loadingPos === selected ? (
                <p className="text-sm text-p-gray text-center py-4">Cargando…</p>
              ) : stockItems.length === 0 ? (
                <div className="text-center py-6">
                  <p className="text-2xl mb-2">📦</p>
                  <p className="text-sm font-semibold text-p-ink">Sin stock en esta posición</p>
                  <p className="text-xs text-p-ink2 mt-1">No tenés piezas cargadas para {posInfo?.label}.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <p className="text-xs font-semibold text-p-ink2 uppercase tracking-wider mb-1">
                    {stockItems.length} pieza(s) en stock
                  </p>
                  {stockItems.map(s => (
                    <div key={s.id} className={`border rounded-lg p-3 ${s.cantidad > 0 ? 'border-p-line' : 'border-red-200 opacity-60'}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-p-ink truncate">{s.descripcion}</p>
                          {s.marca && <p className="text-xs text-p-ink2">{s.marca}</p>}
                        </div>
                        <div className={`font-saira font-bold text-xl shrink-0 ${s.cantidad > 0 ? 'text-p-green' : 'text-red-400'}`}>
                          {s.cantidad}
                        </div>
                      </div>
                      {s.precio_venta && (
                        <p className="font-mono text-xs text-p-dark font-bold mt-1">
                          ${Math.round(s.precio_venta).toLocaleString('es-AR')}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
