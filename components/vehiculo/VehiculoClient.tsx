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

// Colores comunes
const G = '#00A550', GD = '#005C2E', GL = '#d4ede2', GS = '#7abf9a'
const BODY = '#e8f4ee', BODY2 = '#c8dfd2', WHEEL = '#2d3748', WHEELR = '#4a5568'

type SelFn = (p:string)=>void

function zFill(pos:string|null, p:string){ return pos===p ? G : GL }
function zStr(pos:string|null, p:string){ return pos===p ? GD : GS }
function zTxt(pos:string|null, p:string){ return pos===p ? '#fff' : '#1a4a30' }

function Wheel({x,y,w=40,h=70}:{x:number;y:number;w?:number;h?:number}){
  return <g>
    <rect x={x-w/2} y={y-h/2} width={w} height={h} rx={w*0.3} fill={WHEEL} opacity="0.88"/>
    <rect x={x-w*0.3} y={y-h*0.32} width={w*0.6} height={h*0.64} rx={w*0.2} fill={WHEELR} opacity="0.7"/>
    <circle cx={x} cy={y} r={w*0.2} fill="#718096" opacity="0.6"/>
  </g>
}

function Mirror({x,y,flip}:{x:number;y:number;flip?:boolean}){
  const sc = flip ? -1 : 1
  return <ellipse cx={x} cy={y} rx="14" ry="8" fill={GS} transform={`rotate(${flip?15:-15},${x},${y}) scale(${sc},1)`}/>
}

// ── AUTO SEDAN ───────────────────────────────────────────────────────────────
function SvgAuto({pos,onSelect}:{pos:string|null;onSelect:SelFn}){
  const f=(p:string)=>zFill(pos,p), s=(p:string)=>zStr(pos,p), t=(p:string)=>zTxt(pos,p)
  // dimensiones simétricas
  const W=320, cx=W/2  // center x = 160
  const sw=1.5

  return (
    <svg viewBox={`0 0 ${W} 580`} style={{width:'100%',maxWidth:220,display:'block',margin:'0 auto',filter:'drop-shadow(0 3px 12px rgba(0,60,30,.15))'}}>
      {/* Sombra */}
      <ellipse cx={cx} cy={290} rx={130} ry={268} fill="rgba(0,0,0,.08)" transform="translate(3,5)"/>
      {/* Carrocería */}
      <path d={`M ${cx-110} 100 Q ${cx-120} 68 ${cx-90} 50 L ${cx+90} 50 Q ${cx+120} 68 ${cx+110} 100 L ${cx+130} 210 L ${cx+130} 390 Q ${cx+130} 470 ${cx+100} 510 L ${cx+80} 535 Q ${cx+50} 555 ${cx} 555 Q ${cx-50} 555 ${cx-80} 535 L ${cx-100} 510 Q ${cx-130} 470 ${cx-130} 390 L ${cx-130} 210 Z`}
        fill={BODY} stroke="#9abfaa" strokeWidth="2"/>

      {/* PARABRISAS */}
      <g onClick={()=>onSelect('PARABRISAS')} style={{cursor:'pointer'}}>
        <path d={`M ${cx-88} 52 L ${cx+88} 52 Q ${cx+118} 68 ${cx+108} 104 L ${cx+128} 178 Q ${cx+80} 155 ${cx} 152 Q ${cx-80} 155 ${cx-128} 178 L ${cx-108} 104 Q ${cx-118} 68 ${cx-88} 52 Z`}
          fill={f('PARABRISAS')} stroke={s('PARABRISAS')} strokeWidth={sw}/>
        <text x={cx} y={118} textAnchor="middle" fontSize="12" fontWeight="bold" fill={t('PARABRISAS')} fontFamily="Arial">Parabrisas</text>
      </g>

      {/* LUNETA */}
      <g onClick={()=>onSelect('LUNETA')} style={{cursor:'pointer'}}>
        <path d={`M ${cx-128} 410 Q ${cx-80} 432 ${cx} 435 Q ${cx+80} 432 ${cx+128} 410 L ${cx+108} 486 Q ${cx+88} 540 ${cx} 550 Q ${cx-88} 540 ${cx-108} 486 Z`}
          fill={f('LUNETA')} stroke={s('LUNETA')} strokeWidth={sw}/>
        <text x={cx} y={478} textAnchor="middle" fontSize="12" fontWeight="bold" fill={t('LUNETA')} fontFamily="Arial">Luneta</text>
      </g>

      {/* TECHO */}
      <g onClick={()=>onSelect('TECHO')} style={{cursor:'pointer'}}>
        <path d={`M ${cx-126} 188 Q ${cx-80} 166 ${cx} 163 Q ${cx+80} 166 ${cx+126} 188 L ${cx+126} 398 Q ${cx+80} 418 ${cx} 421 Q ${cx-80} 418 ${cx-126} 398 Z`}
          fill={pos==='TECHO'?G:BODY} stroke={s('TECHO')} strokeWidth={sw}/>
        <text x={cx} y={298} textAnchor="middle" fontSize="12" fontWeight="bold" fill={t('TECHO')} fontFamily="Arial">Techo</text>
      </g>

      {/* Puertas delanteras — simétricas */}
      {/* DD (izq en svg) */}
      <g onClick={()=>onSelect('PUERTA_DD')} style={{cursor:'pointer'}}>
        <rect x={12} y={192} width={32} height={88} rx={6} fill={f('PUERTA_DD')} stroke={s('PUERTA_DD')} strokeWidth={sw}/>
        <text x={28} y={233} textAnchor="middle" fontSize="8" fontWeight="bold" fill={t('PUERTA_DD')} fontFamily="Arial">Del</text>
        <text x={28} y={244} textAnchor="middle" fontSize="8" fontWeight="bold" fill={t('PUERTA_DD')} fontFamily="Arial">Der</text>
      </g>
      {/* DI (der en svg) */}
      <g onClick={()=>onSelect('PUERTA_DI')} style={{cursor:'pointer'}}>
        <rect x={W-44} y={192} width={32} height={88} rx={6} fill={f('PUERTA_DI')} stroke={s('PUERTA_DI')} strokeWidth={sw}/>
        <text x={W-28} y={233} textAnchor="middle" fontSize="8" fontWeight="bold" fill={t('PUERTA_DI')} fontFamily="Arial">Del</text>
        <text x={W-28} y={244} textAnchor="middle" fontSize="8" fontWeight="bold" fill={t('PUERTA_DI')} fontFamily="Arial">Izq</text>
      </g>

      {/* Puertas traseras */}
      <g onClick={()=>onSelect('PUERTA_TD')} style={{cursor:'pointer'}}>
        <rect x={12} y={292} width={32} height={88} rx={6} fill={f('PUERTA_TD')} stroke={s('PUERTA_TD')} strokeWidth={sw}/>
        <text x={28} y={333} textAnchor="middle" fontSize="8" fontWeight="bold" fill={t('PUERTA_TD')} fontFamily="Arial">Tra</text>
        <text x={28} y={344} textAnchor="middle" fontSize="8" fontWeight="bold" fill={t('PUERTA_TD')} fontFamily="Arial">Der</text>
      </g>
      <g onClick={()=>onSelect('PUERTA_TI')} style={{cursor:'pointer'}}>
        <rect x={W-44} y={292} width={32} height={88} rx={6} fill={f('PUERTA_TI')} stroke={s('PUERTA_TI')} strokeWidth={sw}/>
        <text x={W-28} y={333} textAnchor="middle" fontSize="8" fontWeight="bold" fill={t('PUERTA_TI')} fontFamily="Arial">Tra</text>
        <text x={W-28} y={344} textAnchor="middle" fontSize="8" fontWeight="bold" fill={t('PUERTA_TI')} fontFamily="Arial">Izq</text>
      </g>

      {/* Custodias */}
      <g onClick={()=>onSelect('CUSTODIA_D')} style={{cursor:'pointer'}}>
        <rect x={12} y={392} width={32} height={44} rx={5} fill={f('CUSTODIA_D')} stroke={s('CUSTODIA_D')} strokeWidth={sw}/>
        <text x={28} y={415} textAnchor="middle" fontSize="7.5" fontWeight="bold" fill={t('CUSTODIA_D')} fontFamily="Arial">Cust</text>
        <text x={28} y={425} textAnchor="middle" fontSize="7.5" fontWeight="bold" fill={t('CUSTODIA_D')} fontFamily="Arial">Der</text>
      </g>
      <g onClick={()=>onSelect('CUSTODIA_I')} style={{cursor:'pointer'}}>
        <rect x={W-44} y={392} width={32} height={44} rx={5} fill={f('CUSTODIA_I')} stroke={s('CUSTODIA_I')} strokeWidth={sw}/>
        <text x={W-28} y={415} textAnchor="middle" fontSize="7.5" fontWeight="bold" fill={t('CUSTODIA_I')} fontFamily="Arial">Cust</text>
        <text x={W-28} y={425} textAnchor="middle" fontSize="7.5" fontWeight="bold" fill={t('CUSTODIA_I')} fontFamily="Arial">Izq</text>
      </g>

      <Mirror x={35} y={165}/>
      <Mirror x={W-35} y={165} flip/>
      <Wheel x={50} y={138}/><Wheel x={50} y={448}/>
      <Wheel x={W-50} y={138}/><Wheel x={W-50} y={448}/>
    </svg>
  )
}

// ── CAMIONETA DOBLE CABINA ───────────────────────────────────────────────────
function SvgCamioneta({pos,onSelect}:{pos:string|null;onSelect:SelFn}){
  const f=(p:string)=>zFill(pos,p), s=(p:string)=>zStr(pos,p), t=(p:string)=>zTxt(pos,p)
  const W=320, cx=W/2, sw=1.5

  return (
    <svg viewBox={`0 0 ${W} 700`} style={{width:'100%',maxWidth:220,display:'block',margin:'0 auto',filter:'drop-shadow(0 3px 12px rgba(0,60,30,.15))'}}>
      <ellipse cx={cx} cy={360} rx={130} ry={335} fill="rgba(0,0,0,.08)" transform="translate(3,5)"/>

      {/* Cabina */}
      <path d={`M ${cx-110} 90 Q ${cx-120} 60 ${cx-88} 44 L ${cx+88} 44 Q ${cx+120} 60 ${cx+110} 90 L ${cx+130} 200 L ${cx+130} 380 L ${cx-130} 380 L ${cx-130} 200 Z`}
        fill={BODY} stroke="#9abfaa" strokeWidth="2"/>
      {/* Caja */}
      <path d={`M ${cx-130} 388 L ${cx+130} 388 L ${cx+130} 598 Q ${cx+130} 660 ${cx+100} 678 L ${cx+80} 690 Q ${cx+50} 700 ${cx} 700 Q ${cx-50} 700 ${cx-80} 690 L ${cx-100} 678 Q ${cx-130} 660 ${cx-130} 598 Z`}
        fill={BODY2} stroke="#9abfaa" strokeWidth="2"/>
      {/* Interior caja */}
      <path d={`M ${cx-118} 396 L ${cx+118} 396 L ${cx+118} 582 Q ${cx+118} 632 ${cx+92} 648 L ${cx} 656 Q ${cx-92} 648 ${cx-118} 582 Z`}
        fill="#b8d4c8" stroke={GS} strokeWidth="1" opacity="0.5"/>

      {/* PARABRISAS */}
      <g onClick={()=>onSelect('PARABRISAS')} style={{cursor:'pointer'}}>
        <path d={`M ${cx-86} 46 L ${cx+86} 46 Q ${cx+116} 62 ${cx+106} 94 L ${cx+126} 168 Q ${cx+80} 148 ${cx} 145 Q ${cx-80} 148 ${cx-126} 168 L ${cx-106} 94 Q ${cx-116} 62 ${cx-86} 46 Z`}
          fill={f('PARABRISAS')} stroke={s('PARABRISAS')} strokeWidth={sw}/>
        <text x={cx} y={108} textAnchor="middle" fontSize="12" fontWeight="bold" fill={t('PARABRISAS')} fontFamily="Arial">Parabrisas</text>
      </g>

      {/* LUNETA */}
      <g onClick={()=>onSelect('LUNETA')} style={{cursor:'pointer'}}>
        <path d={`M ${cx-126} 332 Q ${cx-80} 354 ${cx} 357 Q ${cx+80} 354 ${cx+126} 332 L ${cx+126} 382 L ${cx-126} 382 Z`}
          fill={f('LUNETA')} stroke={s('LUNETA')} strokeWidth={sw}/>
        <text x={cx} y={357} textAnchor="middle" fontSize="12" fontWeight="bold" fill={t('LUNETA')} fontFamily="Arial">Luneta</text>
      </g>

      {/* TECHO */}
      <g onClick={()=>onSelect('TECHO')} style={{cursor:'pointer'}}>
        <path d={`M ${cx-124} 178 Q ${cx-80} 158 ${cx} 155 Q ${cx+80} 158 ${cx+124} 178 L ${cx+124} 322 Q ${cx+80} 342 ${cx} 345 Q ${cx-80} 342 ${cx-124} 322 Z`}
          fill={pos==='TECHO'?G:BODY} stroke={s('TECHO')} strokeWidth={sw}/>
        <text x={cx} y={258} textAnchor="middle" fontSize="12" fontWeight="bold" fill={t('TECHO')} fontFamily="Arial">Techo</text>
      </g>

      {/* Puertas delanteras */}
      <g onClick={()=>onSelect('PUERTA_DD')} style={{cursor:'pointer'}}>
        <rect x={8} y={182} width={32} height={84} rx={6} fill={f('PUERTA_DD')} stroke={s('PUERTA_DD')} strokeWidth={sw}/>
        <text x={24} y={221} textAnchor="middle" fontSize="8" fontWeight="bold" fill={t('PUERTA_DD')} fontFamily="Arial">Del</text>
        <text x={24} y={232} textAnchor="middle" fontSize="8" fontWeight="bold" fill={t('PUERTA_DD')} fontFamily="Arial">Der</text>
      </g>
      <g onClick={()=>onSelect('PUERTA_DI')} style={{cursor:'pointer'}}>
        <rect x={W-40} y={182} width={32} height={84} rx={6} fill={f('PUERTA_DI')} stroke={s('PUERTA_DI')} strokeWidth={sw}/>
        <text x={W-24} y={221} textAnchor="middle" fontSize="8" fontWeight="bold" fill={t('PUERTA_DI')} fontFamily="Arial">Del</text>
        <text x={W-24} y={232} textAnchor="middle" fontSize="8" fontWeight="bold" fill={t('PUERTA_DI')} fontFamily="Arial">Izq</text>
      </g>

      {/* Puertas traseras */}
      <g onClick={()=>onSelect('PUERTA_TD')} style={{cursor:'pointer'}}>
        <rect x={8} y={278} width={32} height={84} rx={6} fill={f('PUERTA_TD')} stroke={s('PUERTA_TD')} strokeWidth={sw}/>
        <text x={24} y={317} textAnchor="middle" fontSize="8" fontWeight="bold" fill={t('PUERTA_TD')} fontFamily="Arial">Tra</text>
        <text x={24} y={328} textAnchor="middle" fontSize="8" fontWeight="bold" fill={t('PUERTA_TD')} fontFamily="Arial">Der</text>
      </g>
      <g onClick={()=>onSelect('PUERTA_TI')} style={{cursor:'pointer'}}>
        <rect x={W-40} y={278} width={32} height={84} rx={6} fill={f('PUERTA_TI')} stroke={s('PUERTA_TI')} strokeWidth={sw}/>
        <text x={W-24} y={317} textAnchor="middle" fontSize="8" fontWeight="bold" fill={t('PUERTA_TI')} fontFamily="Arial">Tra</text>
        <text x={W-24} y={328} textAnchor="middle" fontSize="8" fontWeight="bold" fill={t('PUERTA_TI')} fontFamily="Arial">Izq</text>
      </g>

      <Mirror x={32} y={160}/><Mirror x={W-32} y={160} flip/>
      <Wheel x={48} y={130} w={42} h={74}/><Wheel x={48} y={450} w={42} h={74}/>
      <Wheel x={W-48} y={130} w={42} h={74}/><Wheel x={W-48} y={450} w={42} h={74}/>
      <text x={cx} y={534} textAnchor="middle" fontSize="11" fill="#5a9178" fontFamily="Arial" fontWeight="bold" opacity="0.65">Caja de carga</text>
    </svg>
  )
}

// ── CABINA SIMPLE ────────────────────────────────────────────────────────────
function SvgCabinaSimple({pos,onSelect}:{pos:string|null;onSelect:SelFn}){
  const f=(p:string)=>zFill(pos,p), s=(p:string)=>zStr(pos,p), t=(p:string)=>zTxt(pos,p)
  const W=320, cx=W/2, sw=1.5

  return (
    <svg viewBox={`0 0 ${W} 680`} style={{width:'100%',maxWidth:220,display:'block',margin:'0 auto',filter:'drop-shadow(0 3px 12px rgba(0,60,30,.15))'}}>
      <ellipse cx={cx} cy={340} rx={130} ry={320} fill="rgba(0,0,0,.08)" transform="translate(3,5)"/>

      {/* Cabina corta */}
      <path d={`M ${cx-110} 90 Q ${cx-120} 60 ${cx-88} 44 L ${cx+88} 44 Q ${cx+120} 60 ${cx+110} 90 L ${cx+130} 190 L ${cx+130} 302 L ${cx-130} 302 L ${cx-130} 190 Z`}
        fill={BODY} stroke="#9abfaa" strokeWidth="2"/>
      {/* Caja larga */}
      <path d={`M ${cx-130} 310 L ${cx+130} 310 L ${cx+130} 596 Q ${cx+130} 654 ${cx+100} 670 L ${cx+80} 678 Q ${cx+50} 686 ${cx} 686 Q ${cx-50} 686 ${cx-80} 678 L ${cx-100} 670 Q ${cx-130} 654 ${cx-130} 596 Z`}
        fill={BODY2} stroke="#9abfaa" strokeWidth="2"/>
      {/* Interior caja */}
      <path d={`M ${cx-118} 318 L ${cx+118} 318 L ${cx+118} 580 Q ${cx+118} 628 ${cx+92} 642 L ${cx} 650 Q ${cx-92} 642 ${cx-118} 580 Z`}
        fill="#b8d4c8" stroke={GS} strokeWidth="1" opacity="0.5"/>

      {/* PARABRISAS */}
      <g onClick={()=>onSelect('PARABRISAS')} style={{cursor:'pointer'}}>
        <path d={`M ${cx-86} 46 L ${cx+86} 46 Q ${cx+116} 62 ${cx+106} 94 L ${cx+126} 168 Q ${cx+80} 148 ${cx} 145 Q ${cx-80} 148 ${cx-126} 168 L ${cx-106} 94 Q ${cx-116} 62 ${cx-86} 46 Z`}
          fill={f('PARABRISAS')} stroke={s('PARABRISAS')} strokeWidth={sw}/>
        <text x={cx} y={108} textAnchor="middle" fontSize="12" fontWeight="bold" fill={t('PARABRISAS')} fontFamily="Arial">Parabrisas</text>
      </g>

      {/* LUNETA */}
      <g onClick={()=>onSelect('LUNETA')} style={{cursor:'pointer'}}>
        <path d={`M ${cx-126} 256 Q ${cx-80} 278 ${cx} 281 Q ${cx+80} 278 ${cx+126} 256 L ${cx+126} 305 L ${cx-126} 305 Z`}
          fill={f('LUNETA')} stroke={s('LUNETA')} strokeWidth={sw}/>
        <text x={cx} y={280} textAnchor="middle" fontSize="12" fontWeight="bold" fill={t('LUNETA')} fontFamily="Arial">Luneta</text>
      </g>

      {/* TECHO */}
      <g onClick={()=>onSelect('TECHO')} style={{cursor:'pointer'}}>
        <path d={`M ${cx-124} 178 Q ${cx-80} 158 ${cx} 155 Q ${cx+80} 158 ${cx+124} 178 L ${cx+124} 248 Q ${cx+80} 268 ${cx} 271 Q ${cx-80} 268 ${cx-124} 248 Z`}
          fill={pos==='TECHO'?G:BODY} stroke={s('TECHO')} strokeWidth={sw}/>
        <text x={cx} y={218} textAnchor="middle" fontSize="12" fontWeight="bold" fill={t('TECHO')} fontFamily="Arial">Techo</text>
      </g>

      {/* Solo 2 puertas, más altas */}
      <g onClick={()=>onSelect('PUERTA_DD')} style={{cursor:'pointer'}}>
        <rect x={8} y={182} width={32} height={110} rx={6} fill={f('PUERTA_DD')} stroke={s('PUERTA_DD')} strokeWidth={sw}/>
        <text x={24} y={233} textAnchor="middle" fontSize="8" fontWeight="bold" fill={t('PUERTA_DD')} fontFamily="Arial">Puerta</text>
        <text x={24} y={244} textAnchor="middle" fontSize="8" fontWeight="bold" fill={t('PUERTA_DD')} fontFamily="Arial">Der</text>
      </g>
      <g onClick={()=>onSelect('PUERTA_DI')} style={{cursor:'pointer'}}>
        <rect x={W-40} y={182} width={32} height={110} rx={6} fill={f('PUERTA_DI')} stroke={s('PUERTA_DI')} strokeWidth={sw}/>
        <text x={W-24} y={233} textAnchor="middle" fontSize="8" fontWeight="bold" fill={t('PUERTA_DI')} fontFamily="Arial">Puerta</text>
        <text x={W-24} y={244} textAnchor="middle" fontSize="8" fontWeight="bold" fill={t('PUERTA_DI')} fontFamily="Arial">Izq</text>
      </g>

      <Mirror x={32} y={160}/><Mirror x={W-32} y={160} flip/>
      <Wheel x={48} y={128} w={42} h={74}/><Wheel x={48} y={440} w={42} h={74}/>
      <Wheel x={W-48} y={128} w={42} h={74}/><Wheel x={W-48} y={440} w={42} h={74}/>
      <text x={cx} y={490} textAnchor="middle" fontSize="11" fill="#5a9178" fontFamily="Arial" fontWeight="bold" opacity="0.65">Caja de carga</text>
    </svg>
  )
}

// ── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────
export default function VehiculoClient() {
  const [tipo, setTipo]     = useState<'auto'|'camioneta'|'simple'>('auto')
  const [pos, setPos]       = useState<string|null>(null)
  const [marca, setMarca]   = useState('')
  const [cat, setCat]       = useState<CatRow[]>([])
  const [stock, setStock]   = useState<StockRow[]>([])
  const [loading, setLoading] = useState(false)
  const [marcaSugs, setMarcaSugs] = useState<string[]>([])
  const supabase = createClient()

  useEffect(()=>{
    if(marca.length<2){setMarcaSugs([]);return}
    supabase.from('catalogo').select('marca').ilike('marca',`%${marca}%`).limit(20)
      .then(({data})=>setMarcaSugs([...new Set((data??[]).map((r:any)=>r.marca).filter(Boolean))].slice(0,6) as string[]))
  },[marca,supabase])

  const buscar = useCallback(async()=>{
    if(!pos){setCat([]);setStock([]);return}
    setLoading(true)
    const q = supabase.from('catalogo').select('id,proveedor,codigo,descripcion,costo_neto,disponible,es_promo').eq('pos',pos).order('costo_neto')
    if(marca.trim()) q.or(`descripcion.ilike.%${marca}%,marca.ilike.%${marca}%`)
    const[{data:catData},{data:stockData}] = await Promise.all([
      q.limit(50),
      supabase.from('stock').select('id,descripcion,cantidad,precio_venta').eq('pos',pos).eq('activo',true).gt('cantidad',0)
    ])
    setCat(catData??[]);setStock(stockData??[]);setLoading(false)
  },[pos,marca,supabase])

  useEffect(()=>{buscar()},[buscar])
  function selPos(p:string){setPos(prev=>prev===p?null:p)}

  const TIPOS:[string,string,string][] = [['auto','🚗','Auto'],['camioneta','🛻','Camioneta 4p'],['simple','🛻','Cab. Simple']]

  return (
    <div className="flex flex-col gap-5">
      {/* Controles */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex rounded-xl overflow-hidden border border-p-line">
          {TIPOS.map(([v,icon,lbl])=>(
            <button key={v} onClick={()=>{setTipo(v as any);setPos(null)}}
              style={{background:tipo===v?'#00A550':'#fff',color:tipo===v?'#fff':'#4A6655',border:'none',padding:'8px 16px',fontWeight:700,fontSize:12,cursor:'pointer',transition:'background .15s'}}>
              {icon} {lbl}
            </button>
          ))}
        </div>
        <div className="relative">
          <input value={marca} onChange={e=>{setMarca(e.target.value);setMarcaSugs([])}}
            placeholder="Filtrar por marca…"
            className="border border-p-line rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-p-green w-44"/>
          {marcaSugs.length>0&&(
            <div className="absolute z-10 top-full left-0 bg-white border border-p-line rounded-xl shadow-lg mt-1 overflow-hidden w-44">
              {marcaSugs.map(m=>(
                <button key={m} onClick={()=>{setMarca(m);setMarcaSugs([])}}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-p-light border-b border-p-line2 last:border-0">{m}</button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {/* SVG */}
        <div className="w-full lg:w-60 shrink-0">
          <p className="text-xs text-p-ink2 text-center mb-3">Tocá una zona del vehículo</p>
          {tipo==='auto'    && <SvgAuto          pos={pos} onSelect={selPos}/>}
          {tipo==='camioneta'&&<SvgCamioneta      pos={pos} onSelect={selPos}/>}
          {tipo==='simple'  && <SvgCabinaSimple   pos={pos} onSelect={selPos}/>}
          <div className="flex flex-wrap justify-center gap-1.5 mt-4">
            {Object.entries(POS_LABEL).map(([k,v])=>(
              <button key={k} onClick={()=>selPos(k)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${pos===k?'bg-p-green text-white border-p-green':'border-p-line text-p-ink2 hover:bg-p-light'}`}>
                {v}
              </button>
            ))}
          </div>
        </div>

        {/* Panel resultados */}
        <div className="flex-1 w-full">
          {!pos ? (
            <div className="bg-white border border-p-line rounded-xl p-8 text-center">
              <p className="text-4xl mb-3">👆</p>
              <p className="font-saira font-bold text-p-ink text-lg">Seleccioná una zona</p>
              <p className="text-sm text-p-ink2 mt-1">Tocá el vehículo o los botones de abajo.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <h3 className="font-saira font-bold text-base text-p-ink">
                {POS_LABEL[pos]}{marca?<span className="font-normal text-p-ink2"> · {marca}</span>:''}
              </h3>
              {stock.length>0&&(
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
                          {s.precio_venta&&<p className="font-mono text-xs text-p-dark">{moneyARS(s.precio_venta)}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="bg-white border border-p-line rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 border-b border-p-line2 bg-p-light flex justify-between items-center">
                  <p className="font-saira font-bold text-sm text-p-ink">Catálogo de proveedores</p>
                  <span className="text-xs text-p-ink2">{loading?'cargando…':`${cat.length} piezas`}</span>
                </div>
                {cat.length===0&&!loading?(
                  <p className="text-sm text-p-gray text-center py-8">{marca?`Sin resultados para "${marca}" en ${POS_LABEL[pos]}.`:'Sin piezas. Importá las listas de proveedores.'}</p>
                ):(
                  <div className="divide-y divide-p-line2 max-h-80 overflow-y-auto">
                    {cat.map(r=>(
                      <div key={r.id} className="flex items-center gap-2 px-4 py-2.5 flex-wrap">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${PROV_COLOR[r.proveedor]??'bg-gray-100 text-gray-600'}`}>{r.proveedor}</span>
                        {r.codigo&&<span className="font-mono text-[10px] text-p-ink2 shrink-0">cód {r.codigo}</span>}
                        <span className="text-sm text-p-ink flex-1 min-w-0 truncate">{r.descripcion}</span>
                        {r.es_promo&&<span className="text-[10px] font-bold bg-rose-100 text-rose-600 px-1.5 py-0.5 rounded shrink-0">PROMO</span>}
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
