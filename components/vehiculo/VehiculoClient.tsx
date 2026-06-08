'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

const POS_LABEL: Record<string,string> = {
  PARABRISAS:'Parabrisas', LUNETA:'Luneta', TECHO:'Techo solar',
  PUERTA_DD:'Puerta Del. Der.', PUERTA_DI:'Puerta Del. Izq.',
  PUERTA_TD:'Puerta Tra. Der.', PUERTA_TI:'Puerta Tra. Izq.',
  CUSTODIA_D:'Custodia Der.', CUSTODIA_I:'Custodia Izq.',
}

interface CatRow { id:string; proveedor:string; codigo:string|null; descripcion:string; costo_neto:number; disponible:string|null; es_promo:boolean }
interface StockRow { id:string; descripcion:string; cantidad:number; precio_venta:number|null }

function moneyARS(n:number){ return '$'+Math.round(n).toLocaleString('es-AR') }
const PROV_COLOR: Record<string,string> = {
  GAMMA:'bg-green-100 text-green-700', MALATESTA:'bg-blue-100 text-blue-700', SEKURIT:'bg-purple-100 text-purple-700'
}

// ── SVG AUTO (sedan, top-down) ─────────────────────────────────────────────
function SvgAuto({ pos, onSelect }: { pos: string|null; onSelect: (p:string)=>void }) {
  const f = (p:string) => pos===p ? '#00A550' : '#d4ede2'
  const s = (p:string) => pos===p ? '#005C2E' : '#5a9178'
  const t = (p:string) => pos===p ? '#fff' : '#1a4a30'
  const sw = 1.5

  return (
    <svg viewBox="0 0 340 600" style={{width:'100%',maxWidth:240,display:'block',margin:'0 auto',filter:'drop-shadow(0 4px 16px rgba(0,80,40,0.13))'}}>
      <defs>
        <radialGradient id="bodyGrad" cx="50%" cy="50%">
          <stop offset="0%" stopColor="#f0f7f3"/>
          <stop offset="100%" stopColor="#d8eee3"/>
        </radialGradient>
        <radialGradient id="roofGrad" cx="50%" cy="50%">
          <stop offset="0%" stopColor="#e8f4ee"/>
          <stop offset="100%" stopColor="#c8dfd2"/>
        </radialGradient>
      </defs>

      {/* Sombra exterior */}
      <ellipse cx="170" cy="300" rx="148" ry="280" fill="rgba(0,0,0,0.07)" transform="translate(4,6)"/>

      {/* Carrocería principal */}
      <path d="M 70 110 Q 60 80 100 60 L 240 60 Q 280 80 270 110 L 290 200 L 295 380 Q 295 470 270 510 L 240 540 Q 210 560 170 560 Q 130 560 100 540 L 70 510 Q 45 470 45 380 L 50 200 Z"
        fill="url(#bodyGrad)" stroke="#8ab09a" strokeWidth="2"/>

      {/* PARABRISAS */}
      <g onClick={()=>onSelect('PARABRISAS')} style={{cursor:'pointer'}}>
        <path d="M 100 62 L 240 62 Q 275 78 268 112 L 292 180 Q 252 158 170 155 Q 88 158 48 180 L 72 112 Q 65 78 100 62 Z"
          fill={f('PARABRISAS')} stroke={s('PARABRISAS')} strokeWidth={sw} opacity="0.92"/>
        <text x="170" y="122" textAnchor="middle" fontSize="13" fontWeight="bold" fill={t('PARABRISAS')} fontFamily="Arial">Parabrisas</text>
      </g>

      {/* LUNETA */}
      <g onClick={()=>onSelect('LUNETA')} style={{cursor:'pointer'}}>
        <path d="M 48 420 Q 88 442 170 445 Q 252 442 292 420 L 268 490 Q 245 542 170 555 Q 95 542 72 490 Z"
          fill={f('LUNETA')} stroke={s('LUNETA')} strokeWidth={sw} opacity="0.92"/>
        <text x="170" y="490" textAnchor="middle" fontSize="13" fontWeight="bold" fill={t('LUNETA')} fontFamily="Arial">Luneta</text>
      </g>

      {/* TECHO (zona central) */}
      <g onClick={()=>onSelect('TECHO')} style={{cursor:'pointer'}}>
        <path d="M 55 190 Q 88 168 170 165 Q 252 168 285 190 L 285 380 Q 252 400 170 403 Q 88 400 55 380 Z"
          fill={pos==='TECHO'?'#00A550':'url(#roofGrad)'} stroke={s('TECHO')} strokeWidth={sw} opacity="0.88"/>
        <text x="170" y="290" textAnchor="middle" fontSize="13" fontWeight="bold" fill={t('TECHO')} fontFamily="Arial">Techo</text>
      </g>

      {/* PUERTA_DD — delantera derecha (izq en SVG) */}
      <g onClick={()=>onSelect('PUERTA_DD')} style={{cursor:'pointer'}}>
        <path d="M 45 195 L 52 195 L 52 300 L 45 300 Z" fill="transparent"/>
        <rect x="22" y="196" width="34" height="96" rx="6"
          fill={f('PUERTA_DD')} stroke={s('PUERTA_DD')} strokeWidth={sw} opacity="0.92"/>
        <text x="39" y="242" textAnchor="middle" fontSize="9" fontWeight="bold" fill={t('PUERTA_DD')} fontFamily="Arial">Del</text>
        <text x="39" y="254" textAnchor="middle" fontSize="9" fontWeight="bold" fill={t('PUERTA_DD')} fontFamily="Arial">Der</text>
      </g>

      {/* PUERTA_DI — delantera izquierda (der en SVG) */}
      <g onClick={()=>onSelect('PUERTA_DI')} style={{cursor:'pointer'}}>
        <rect x="284" y="196" width="34" height="96" rx="6"
          fill={f('PUERTA_DI')} stroke={s('PUERTA_DI')} strokeWidth={sw} opacity="0.92"/>
        <text x="301" y="242" textAnchor="middle" fontSize="9" fontWeight="bold" fill={t('PUERTA_DI')} fontFamily="Arial">Del</text>
        <text x="301" y="254" textAnchor="middle" fontSize="9" fontWeight="bold" fill={t('PUERTA_DI')} fontFamily="Arial">Izq</text>
      </g>

      {/* PUERTA_TD — trasera derecha */}
      <g onClick={()=>onSelect('PUERTA_TD')} style={{cursor:'pointer'}}>
        <rect x="22" y="302" width="34" height="88" rx="6"
          fill={f('PUERTA_TD')} stroke={s('PUERTA_TD')} strokeWidth={sw} opacity="0.92"/>
        <text x="39" y="344" textAnchor="middle" fontSize="9" fontWeight="bold" fill={t('PUERTA_TD')} fontFamily="Arial">Tra</text>
        <text x="39" y="356" textAnchor="middle" fontSize="9" fontWeight="bold" fill={t('PUERTA_TD')} fontFamily="Arial">Der</text>
      </g>

      {/* PUERTA_TI — trasera izquierda */}
      <g onClick={()=>onSelect('PUERTA_TI')} style={{cursor:'pointer'}}>
        <rect x="284" y="302" width="34" height="88" rx="6"
          fill={f('PUERTA_TI')} stroke={s('PUERTA_TI')} strokeWidth={sw} opacity="0.92"/>
        <text x="301" y="344" textAnchor="middle" fontSize="9" fontWeight="bold" fill={t('PUERTA_TI')} fontFamily="Arial">Tra</text>
        <text x="301" y="356" textAnchor="middle" fontSize="9" fontWeight="bold" fill={t('PUERTA_TI')} fontFamily="Arial">Izq</text>
      </g>

      {/* CUSTODIA_D — pequeña trasera derecha */}
      <g onClick={()=>onSelect('CUSTODIA_D')} style={{cursor:'pointer'}}>
        <rect x="22" y="398" width="34" height="44" rx="5"
          fill={f('CUSTODIA_D')} stroke={s('CUSTODIA_D')} strokeWidth={sw} opacity="0.92"/>
        <text x="39" y="423" textAnchor="middle" fontSize="8" fontWeight="bold" fill={t('CUSTODIA_D')} fontFamily="Arial">Cust</text>
        <text x="39" y="433" textAnchor="middle" fontSize="8" fontWeight="bold" fill={t('CUSTODIA_D')} fontFamily="Arial">Der</text>
      </g>

      {/* CUSTODIA_I — pequeña trasera izquierda */}
      <g onClick={()=>onSelect('CUSTODIA_I')} style={{cursor:'pointer'}}>
        <rect x="284" y="398" width="34" height="44" rx="5"
          fill={f('CUSTODIA_I')} stroke={s('CUSTODIA_I')} strokeWidth={sw} opacity="0.92"/>
        <text x="301" y="423" textAnchor="middle" fontSize="8" fontWeight="bold" fill={t('CUSTODIA_I')} fontFamily="Arial">Cust</text>
        <text x="301" y="433" textAnchor="middle" fontSize="8" fontWeight="bold" fill={t('CUSTODIA_I')} fontFamily="Arial">Izq</text>
      </g>

      {/* Espejos retrovisores */}
      <ellipse cx="44" cy="175" rx="12" ry="7" fill="#8ab09a" transform="rotate(-15,44,175)"/>
      <ellipse cx="296" cy="175" rx="12" ry="7" fill="#8ab09a" transform="rotate(15,296,175)"/>

      {/* Ruedas */}
      {[[52,145],[52,445],[288,145],[288,445]].map(([x,y],i)=>(
        <g key={i}>
          <rect x={x-20} y={y-32} width="40" height="64" rx="12" fill="#2d3748" opacity="0.85"/>
          <rect x={x-12} y={y-20} width="24" height="40" rx="8" fill="#4a5568" opacity="0.7"/>
          <circle cx={x} cy={y} r="8" fill="#718096" opacity="0.5"/>
        </g>
      ))}

      {/* Líneas de separación de puertas (divisiones visibles) */}
      <line x1="56" y1="298" x2="56" y2="302" stroke="#8ab09a" strokeWidth="2"/>
      <line x1="284" y1="298" x2="284" y2="302" stroke="#8ab09a" strokeWidth="2"/>
    </svg>
  )
}

// ── SVG CAMIONETA (pickup 4x4, top-down) ──────────────────────────────────
function SvgCamioneta({ pos, onSelect }: { pos: string|null; onSelect: (p:string)=>void }) {
  const f = (p:string) => pos===p ? '#00A550' : '#d4ede2'
  const s = (p:string) => pos===p ? '#005C2E' : '#5a9178'
  const t = (p:string) => pos===p ? '#fff' : '#1a4a30'
  const sw = 1.5

  return (
    <svg viewBox="0 0 340 720" style={{width:'100%',maxWidth:240,display:'block',margin:'0 auto',filter:'drop-shadow(0 4px 16px rgba(0,80,40,0.13))'}}>
      <defs>
        <radialGradient id="bodyGrad2" cx="50%" cy="50%">
          <stop offset="0%" stopColor="#f0f7f3"/>
          <stop offset="100%" stopColor="#d8eee3"/>
        </radialGradient>
      </defs>

      {/* Sombra */}
      <ellipse cx="170" cy="380" rx="148" ry="355" fill="rgba(0,0,0,0.07)" transform="translate(4,6)"/>

      {/* Cabina */}
      <path d="M 72 100 Q 62 72 100 52 L 240 52 Q 278 72 268 100 L 288 190 L 288 380 L 52 380 L 52 190 Z"
        fill="url(#bodyGrad2)" stroke="#8ab09a" strokeWidth="2"/>

      {/* Caja de carga */}
      <path d="M 55 390 L 285 390 L 285 590 Q 285 650 260 670 L 170 680 Q 80 670 55 590 Z"
        fill="#c8dfd2" stroke="#8ab09a" strokeWidth="2"/>

      {/* Interior de caja (detalle) */}
      <path d="M 68 400 L 272 400 L 272 570 Q 272 615 250 628 L 170 636 Q 90 628 68 570 Z"
        fill="#b8d4c8" stroke="#8ab09a" strokeWidth="1" opacity="0.6"/>

      {/* PARABRISAS */}
      <g onClick={()=>onSelect('PARABRISAS')} style={{cursor:'pointer'}}>
        <path d="M 100 54 L 240 54 Q 274 70 267 104 L 288 172 Q 248 150 170 147 Q 92 150 52 172 L 73 104 Q 66 70 100 54 Z"
          fill={f('PARABRISAS')} stroke={s('PARABRISAS')} strokeWidth={sw} opacity="0.92"/>
        <text x="170" y="114" textAnchor="middle" fontSize="13" fontWeight="bold" fill={t('PARABRISAS')} fontFamily="Arial">Parabrisas</text>
      </g>

      {/* LUNETA */}
      <g onClick={()=>onSelect('LUNETA')} style={{cursor:'pointer'}}>
        <path d="M 55 335 Q 90 358 170 360 Q 250 358 285 335 L 285 382 L 55 382 Z"
          fill={f('LUNETA')} stroke={s('LUNETA')} strokeWidth={sw} opacity="0.92"/>
        <text x="170" y="360" textAnchor="middle" fontSize="12" fontWeight="bold" fill={t('LUNETA')} fontFamily="Arial">Luneta</text>
      </g>

      {/* TECHO */}
      <g onClick={()=>onSelect('TECHO')} style={{cursor:'pointer'}}>
        <path d="M 55 182 Q 90 162 170 159 Q 250 162 285 182 L 285 332 Q 250 352 170 354 Q 90 352 55 332 Z"
          fill={pos==='TECHO'?'#00A550':'url(#bodyGrad2)'} stroke={s('TECHO')} strokeWidth={sw} opacity="0.88"/>
        <text x="170" y="262" textAnchor="middle" fontSize="13" fontWeight="bold" fill={t('TECHO')} fontFamily="Arial">Techo</text>
      </g>

      {/* PUERTA_DD */}
      <g onClick={()=>onSelect('PUERTA_DD')} style={{cursor:'pointer'}}>
        <rect x="20" y="184" width="34" height="88" rx="6"
          fill={f('PUERTA_DD')} stroke={s('PUERTA_DD')} strokeWidth={sw} opacity="0.92"/>
        <text x="37" y="226" textAnchor="middle" fontSize="9" fontWeight="bold" fill={t('PUERTA_DD')} fontFamily="Arial">Del</text>
        <text x="37" y="238" textAnchor="middle" fontSize="9" fontWeight="bold" fill={t('PUERTA_DD')} fontFamily="Arial">Der</text>
      </g>

      {/* PUERTA_DI */}
      <g onClick={()=>onSelect('PUERTA_DI')} style={{cursor:'pointer'}}>
        <rect x="286" y="184" width="34" height="88" rx="6"
          fill={f('PUERTA_DI')} stroke={s('PUERTA_DI')} strokeWidth={sw} opacity="0.92"/>
        <text x="303" y="226" textAnchor="middle" fontSize="9" fontWeight="bold" fill={t('PUERTA_DI')} fontFamily="Arial">Del</text>
        <text x="303" y="238" textAnchor="middle" fontSize="9" fontWeight="bold" fill={t('PUERTA_DI')} fontFamily="Arial">Izq</text>
      </g>

      {/* PUERTA_TD */}
      <g onClick={()=>onSelect('PUERTA_TD')} style={{cursor:'pointer'}}>
        <rect x="20" y="282" width="34" height="88" rx="6"
          fill={f('PUERTA_TD')} stroke={s('PUERTA_TD')} strokeWidth={sw} opacity="0.92"/>
        <text x="37" y="322" textAnchor="middle" fontSize="9" fontWeight="bold" fill={t('PUERTA_TD')} fontFamily="Arial">Tra</text>
        <text x="37" y="334" textAnchor="middle" fontSize="9" fontWeight="bold" fill={t('PUERTA_TD')} fontFamily="Arial">Der</text>
      </g>

      {/* PUERTA_TI */}
      <g onClick={()=>onSelect('PUERTA_TI')} style={{cursor:'pointer'}}>
        <rect x="286" y="282" width="34" height="88" rx="6"
          fill={f('PUERTA_TI')} stroke={s('PUERTA_TI')} strokeWidth={sw} opacity="0.92"/>
        <text x="303" y="322" textAnchor="middle" fontSize="9" fontWeight="bold" fill={t('PUERTA_TI')} fontFamily="Arial">Tra</text>
        <text x="303" y="334" textAnchor="middle" fontSize="9" fontWeight="bold" fill={t('PUERTA_TI')} fontFamily="Arial">Izq</text>
      </g>

      {/* Espejos */}
      <ellipse cx="42" cy="168" rx="13" ry="7" fill="#8ab09a" transform="rotate(-12,42,168)"/>
      <ellipse cx="298" cy="168" rx="13" ry="7" fill="#8ab09a" transform="rotate(12,298,168)"/>

      {/* Ruedas (4x4, más grandes) */}
      {[[50,138],[50,440],[290,138],[290,440]].map(([x,y],i)=>(
        <g key={i}>
          <rect x={x-22} y={y-38} width="44" height="76" rx="13" fill="#2d3748" opacity="0.9"/>
          <rect x={x-13} y={y-24} width="26" height="48" rx="9" fill="#4a5568" opacity="0.7"/>
          <circle cx={x} cy={y} r="9" fill="#718096" opacity="0.6"/>
        </g>
      ))}

      {/* Texto caja de carga */}
      <text x="170" y="510" textAnchor="middle" fontSize="12" fill="#5a9178" fontFamily="Arial" fontWeight="bold" opacity="0.7">Caja de carga</text>
    </svg>
  )
}


// ── SVG CAMIONETA CABINA SIMPLE (top-down) ──────────────────────────────────
function SvgCabinaSimple({ pos, onSelect }: { pos: string|null; onSelect: (p:string)=>void }) {
  const f = (p:string) => pos===p ? '#00A550' : '#d4ede2'
  const s = (p:string) => pos===p ? '#005C2E' : '#5a9178'
  const t = (p:string) => pos===p ? '#fff' : '#1a4a30'
  const sw = 1.5

  return (
    <svg viewBox="0 0 340 680" style={{width:'100%',maxWidth:240,display:'block',margin:'0 auto',filter:'drop-shadow(0 4px 16px rgba(0,80,40,0.13))'}}>
      <defs>
        <radialGradient id="bodyGrad3" cx="50%" cy="50%">
          <stop offset="0%" stopColor="#f0f7f3"/>
          <stop offset="100%" stopColor="#d8eee3"/>
        </radialGradient>
      </defs>
      <ellipse cx="170" cy="360" rx="148" ry="335" fill="rgba(0,0,0,0.07)" transform="translate(4,6)"/>

      {/* Cabina (más corta que doble) */}
      <path d="M 72 90 Q 62 62 100 44 L 240 44 Q 278 62 268 90 L 288 180 L 288 310 L 52 310 L 52 180 Z"
        fill="url(#bodyGrad3)" stroke="#8ab09a" strokeWidth="2"/>

      {/* Caja de carga (más larga) */}
      <path d="M 55 320 L 285 320 L 285 590 Q 285 650 260 668 L 170 676 Q 80 668 55 590 Z"
        fill="#c8dfd2" stroke="#8ab09a" strokeWidth="2"/>
      <path d="M 68 330 L 272 330 L 272 572 Q 272 618 250 630 L 170 638 Q 90 630 68 572 Z"
        fill="#b8d4c8" stroke="#8ab09a" strokeWidth="1" opacity="0.6"/>

      {/* PARABRISAS */}
      <g onClick={()=>onSelect('PARABRISAS')} style={{cursor:'pointer'}}>
        <path d="M 100 46 L 240 46 Q 274 62 267 94 L 288 162 Q 248 142 170 139 Q 92 142 52 162 L 73 94 Q 66 62 100 46 Z"
          fill={f('PARABRISAS')} stroke={s('PARABRISAS')} strokeWidth={sw} opacity="0.92"/>
        <text x="170" y="106" textAnchor="middle" fontSize="13" fontWeight="bold" fill={t('PARABRISAS')} fontFamily="Arial">Parabrisas</text>
      </g>

      {/* LUNETA */}
      <g onClick={()=>onSelect('LUNETA')} style={{cursor:'pointer'}}>
        <path d="M 55 268 Q 90 290 170 292 Q 250 290 285 268 L 285 312 L 55 312 Z"
          fill={f('LUNETA')} stroke={s('LUNETA')} strokeWidth={sw} opacity="0.92"/>
        <text x="170" y="290" textAnchor="middle" fontSize="12" fontWeight="bold" fill={t('LUNETA')} fontFamily="Arial">Luneta</text>
      </g>

      {/* TECHO */}
      <g onClick={()=>onSelect('TECHO')} style={{cursor:'pointer'}}>
        <path d="M 55 172 Q 90 154 170 151 Q 250 154 285 172 L 285 265 Q 250 285 170 287 Q 90 285 55 265 Z"
          fill={pos==='TECHO'?'#00A550':'url(#bodyGrad3)'} stroke={s('TECHO')} strokeWidth={sw} opacity="0.88"/>
        <text x="170" y="225" textAnchor="middle" fontSize="13" fontWeight="bold" fill={t('TECHO')} fontFamily="Arial">Techo</text>
      </g>

      {/* Solo 2 puertas delanteras */}
      <g onClick={()=>onSelect('PUERTA_DD')} style={{cursor:'pointer'}}>
        <rect x="20" y="174" width="34" height="120" rx="6"
          fill={f('PUERTA_DD')} stroke={s('PUERTA_DD')} strokeWidth={sw} opacity="0.92"/>
        <text x="37" y="230" textAnchor="middle" fontSize="9" fontWeight="bold" fill={t('PUERTA_DD')} fontFamily="Arial">Puerta</text>
        <text x="37" y="242" textAnchor="middle" fontSize="9" fontWeight="bold" fill={t('PUERTA_DD')} fontFamily="Arial">Der</text>
      </g>
      <g onClick={()=>onSelect('PUERTA_DI')} style={{cursor:'pointer'}}>
        <rect x="286" y="174" width="34" height="120" rx="6"
          fill={f('PUERTA_DI')} stroke={s('PUERTA_DI')} strokeWidth={sw} opacity="0.92"/>
        <text x="303" y="230" textAnchor="middle" fontSize="9" fontWeight="bold" fill={t('PUERTA_DI')} fontFamily="Arial">Puerta</text>
        <text x="303" y="242" textAnchor="middle" fontSize="9" fontWeight="bold" fill={t('PUERTA_DI')} fontFamily="Arial">Izq</text>
      </g>

      {/* Espejos */}
      <ellipse cx="42" cy="162" rx="13" ry="7" fill="#8ab09a" transform="rotate(-12,42,162)"/>
      <ellipse cx="298" cy="162" rx="13" ry="7" fill="#8ab09a" transform="rotate(12,298,162)"/>

      {/* Ruedas */}
      {[[50,128],[50,440],[290,128],[290,440]].map(([x,y],i)=>(
        <g key={i}>
          <rect x={x-22} y={y-38} width="44" height="76" rx="13" fill="#2d3748" opacity="0.9"/>
          <rect x={x-13} y={y-24} width="26" height="48" rx="9" fill="#4a5568" opacity="0.7"/>
          <circle cx={x} cy={y} r="9" fill="#718096" opacity="0.6"/>
        </g>
      ))}

      <text x="170" y="490" textAnchor="middle" fontSize="12" fill="#5a9178" fontFamily="Arial" fontWeight="bold" opacity="0.7">Caja de carga</text>
    </svg>
  )
}

// ── COMPONENTE PRINCIPAL ───────────────────────────────────────────────────
export default function VehiculoClient() {
  const [tipo, setTipo]     = useState<'auto'|'camioneta'|'simple'>('auto')
  const [pos, setPos]       = useState<string|null>(null)
  const [marca, setMarca]   = useState('')
  const [cat, setCat]       = useState<CatRow[]>([])
  const [stock, setStock]   = useState<StockRow[]>([])
  const [loading, setLoading] = useState(false)
  const [marcaSugs, setMarcaSugs] = useState<string[]>([])
  const supabase = createClient()

  useEffect(() => {
    if (marca.length < 2) { setMarcaSugs([]); return }
    supabase.from('catalogo').select('marca').ilike('marca',`%${marca}%`).limit(20)
      .then(({data}) => setMarcaSugs([...new Set((data??[]).map((r:any)=>r.marca).filter(Boolean))].slice(0,6) as string[]))
  }, [marca, supabase])

  const buscar = useCallback(async () => {
    if (!pos) return
    setLoading(true)
    const q = supabase.from('catalogo')
      .select('id,proveedor,codigo,descripcion,costo_neto,disponible,es_promo')
      .eq('pos', pos).order('costo_neto')
    if (marca.trim()) q.ilike('descripcion', `%${marca}%`)
    const [{ data: catData }, { data: stockData }] = await Promise.all([
      q.limit(50),
      supabase.from('stock').select('id,descripcion,cantidad,precio_venta').eq('pos',pos).eq('activo',true).gt('cantidad',0)
    ])
    setCat(catData ?? []); setStock(stockData ?? [])
    setLoading(false)
  }, [pos, marca, supabase])

  useEffect(() => { buscar() }, [buscar])

  function selPos(p:string) { setPos(prev => prev===p ? null : p) }

  return (
    <div className="flex flex-col gap-5">
      {/* Toggle tipo vehículo */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm text-p-ink2 font-semibold">Tipo:</span>
        <div className="flex rounded-xl overflow-hidden border border-p-line">
          {([['auto','🚗 Auto'],['camioneta','🛻 Camioneta 4p'],['simple','🛻 Cab. Simple']] as const).map(([v,lbl]) => (
            <button key={v} onClick={()=>{setTipo(v as any);setPos(null)}}
              style={{ background: tipo===v ? '#00A550' : '#fff', color: tipo===v ? '#fff' : '#4A6655', border:'none', padding:'8px 16px', fontWeight:700, fontSize:12, cursor:'pointer', transition:'all .15s' }}>
              {lbl}
            </button>
          ))}
        </div>
        {/* Filtro marca */}
        <div className="relative ml-2">
          <input value={marca} onChange={e=>{setMarca(e.target.value);setMarcaSugs([])}}
            placeholder="Filtrar por marca…"
            className="border border-p-line rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-p-green w-44"/>
          {marcaSugs.length>0 && (
            <div className="absolute z-10 top-full left-0 bg-white border border-p-line rounded-xl shadow-lg mt-1 overflow-hidden w-44">
              {marcaSugs.map(m=>(
                <button key={m} onClick={()=>{setMarca(m);setMarcaSugs([])}}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-p-light border-b border-p-line2 last:border-0">
                  {m}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {/* Diagrama */}
        <div className="w-full lg:w-64 shrink-0">
          <p className="text-xs text-p-ink2 text-center mb-3">Tocá una zona del vehículo</p>
          {tipo === 'auto' ? <SvgAuto pos={pos} onSelect={selPos}/>
            : tipo === 'camioneta' ? <SvgCamioneta pos={pos} onSelect={selPos}/>
            : <SvgCabinaSimple pos={pos} onSelect={selPos}/>}
          {/* Leyenda */}
          <div className="flex flex-wrap justify-center gap-1.5 mt-4">
            {Object.entries(POS_LABEL).map(([k,v])=>(
              <button key={k} onClick={()=>selPos(k)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${pos===k?'bg-p-green text-white border-p-green':'border-p-line text-p-ink2 hover:bg-p-light'}`}>
                {v}
              </button>
            ))}
          </div>
        </div>

        {/* Panel de resultados */}
        <div className="flex-1 w-full">
          {!pos ? (
            <div className="bg-white border border-p-line rounded-xl p-8 text-center">
              <p className="text-4xl mb-3">🚗</p>
              <p className="font-saira font-bold text-p-ink text-lg">Seleccioná una zona</p>
              <p className="text-sm text-p-ink2 mt-1">Tocá el vehículo o los botones de abajo.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <h3 className="font-saira font-bold text-base text-p-ink">
                {POS_LABEL[pos]}{marca ? <span className="font-normal text-p-ink2"> · {marca}</span> : ''}
              </h3>

              {/* Stock propio */}
              {stock.length > 0 && (
                <div className="bg-white border-2 border-p-green rounded-xl overflow-hidden">
                  <div className="bg-p-green px-4 py-2.5">
                    <p className="font-saira font-bold text-white text-sm">✓ En mi stock — {stock.length} modelo(s)</p>
                  </div>
                  <div className="divide-y divide-p-line2">
                    {stock.map(s=>(
                      <div key={s.id} className="flex items-center justify-between px-4 py-2.5 gap-3">
                        <p className="text-sm font-medium text-p-ink flex-1 min-w-0 truncate">{s.descripcion}</p>
                        <div className="text-right shrink-0">
                          <p className="font-saira font-bold text-p-green text-lg">{s.cantidad}<span className="text-xs font-normal text-p-ink2"> u.</span></p>
                          {s.precio_venta && <p className="font-mono text-xs text-p-dark">{moneyARS(s.precio_venta)}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Catálogo */}
              <div className="bg-white border border-p-line rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 border-b border-p-line2 bg-p-light flex justify-between items-center">
                  <p className="font-saira font-bold text-sm text-p-ink">Catálogo de proveedores</p>
                  <span className="text-xs text-p-ink2">{loading ? 'cargando…' : `${cat.length} piezas`}</span>
                </div>
                {cat.length===0 && !loading ? (
                  <p className="text-sm text-p-gray text-center py-8">
                    {marca ? `Sin resultados para "${marca}" en ${POS_LABEL[pos]}.` : 'Sin piezas. Importá las listas de proveedores.'}
                  </p>
                ) : (
                  <div className="divide-y divide-p-line2 max-h-80 overflow-y-auto">
                    {cat.map(r=>(
                      <div key={r.id} className="flex items-center gap-2 px-4 py-2.5 flex-wrap">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${PROV_COLOR[r.proveedor]??'bg-gray-100 text-gray-600'}`}>{r.proveedor}</span>
                        {r.codigo && <span className="font-mono text-[10px] text-p-ink2 shrink-0">cód {r.codigo}</span>}
                        <span className="text-sm text-p-ink flex-1 min-w-0 truncate">{r.descripcion}</span>
                        {r.es_promo && <span className="text-[10px] font-bold bg-rose-100 text-rose-600 px-1.5 py-0.5 rounded shrink-0">PROMO</span>}
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
