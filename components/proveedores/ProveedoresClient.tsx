'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import * as XLSX from 'xlsx'

const FORMATOS = [
  { id: 'gamma',           label: 'GAMMA — Catálogo',               ext: '.xlsx', tipo: 'excel' },
  { id: 'malatesta',       label: 'Malatesta — Catálogo (viejo)',    ext: '.xlsx', tipo: 'excel' },
  { id: 'malatesta_julio', label: 'Malatesta — Catálogo Julio 2026', ext: '.xlsx', tipo: 'excel' },
  { id: 'euroglass',       label: 'Euroglass — Oferta',              ext: '.xlsx', tipo: 'excel' },
  { id: 'sekurit',     label: 'Sekurit — Lista disponible',      ext: '.xlsx', tipo: 'excel' },
  { id: 'promo_ar',    label: 'Promo Alta Rotación 68%',         ext: '.xlsx', tipo: 'excel' },
  { id: 'promo_bg',    label: 'Promo Bajo Giro 68%',             ext: '.xlsx', tipo: 'excel' },
  { id: 'oferta_gamma',label: 'Oferta Especial Mixta (GAMMA)',   ext: '.pdf',  tipo: 'pdf'   },
  { id: 'mix_malat',   label: 'Oferta Mix Pilkington/Euroglass', ext: '.pdf',  tipo: 'pdf'   },
]

interface Lista { id:string; nombre:string; proveedor:string; tipo:string; desc_pct:number; flete_pct:number; iva_pct:number }
interface CatRow { proveedor:string; codigo:string|null; descripcion:string; marca:string|null; modelo:string|null; pos:string|null; precio_lista:number; costo_neto:number; disponible:string|null; es_promo:boolean; lista_nombre:string|null; updated_at:string; updated_by?:string; updated_source?:string }

// ── helpers ──────────────────────────────────────────────────────────────────
function norm(s:string) {
  return s.toUpperCase()
    .replace(/[ÁÀÄÂ]/g,'A').replace(/[ÉÈËÊ]/g,'E').replace(/[ÍÌÏÎ]/g,'I')
    .replace(/[ÓÒÖÔ]/g,'O').replace(/[ÚÙÜÛ]/g,'U').replace(/Ñ/g,'N').trim()
}
function decodePos(d:string) {
  const s=norm(d).replace(/^E-/,'')
  // GAMMA: PSAS. / Malatesta: PSAS. / Sekurit: PB
  if(/^PSAS|^PB\b|^PB\s|PARABRISA/.test(s)) return 'PARABRISAS'
  // Sekurit: Lu / GAMMA: LUNETA / LTA
  if(/^LUNETA|^LTA|^LT\b|^LU\b|^LU\s/.test(s)) return 'LUNETA'
  if(/^TECHO/.test(s)) return 'TECHO'
  // Sekurit: Pta DD / Pta DI / Pta TD / Pta TI
  if(/^PTA\s+DD|^P\.?D\.?D/.test(s)) return 'PUERTA_DD'
  if(/^PTA\s+DI|^P\.?D\.?I/.test(s)) return 'PUERTA_DI'
  if(/^PTA\s+TD|^P\.?T\.?D/.test(s)) return 'PUERTA_TD'
  if(/^PTA\s+TI|^P\.?T\.?I/.test(s)) return 'PUERTA_TI'
  // Sekurit: Pta (sin especificar) → genérico
  if(/^PTA\s/.test(s)) return 'PUERTA_DD'
  if(/^P\.?D\b/.test(s)) return 'PUERTA_DD'
  if(/^P\.?I\b/.test(s)) return 'PUERTA_DI'
  // Custodias / Sekurit: Cu D / Cu I
  if(/^C\.?T?\.?D|^C\.?D|^CU\s+D/.test(s)||s.startsWith('CUSTODIA')) return 'CUSTODIA_D'
  if(/^C\.?T?\.?I|^C\.?I|^CU\s+I/.test(s)) return 'CUSTODIA_I'
  if(/^A\.?T?\.?D|^A\.?D\b|^ALETA\s+TD|^ALETA\s+DD/.test(s)) return 'ALETA_D'
  if(/^A\.?T?\.?I|^A\.?I\b|^ALETA\s+TI|^ALETA\s+DI/.test(s)) return 'ALETA_I'
  return 'OTRO'
}
function toNum(v:unknown) {
  if(v==null) return 0
  if(typeof v === 'number') return v  // xlsx ya parsea números — no tocar el punto decimal
  const s = String(v).replace(/\./g,'').replace(',','.')
  return parseFloat(s) || 0
}
function mkRow(prov:string,cod:string,desc:string,marca:string,pre:number,costo:number,disp='',promo=false): CatRow {
  return { proveedor:prov, codigo:cod||null, descripcion:desc, marca:marca||null,
    modelo:null, pos:decodePos(desc), precio_lista:pre,
    costo_neto:Math.round(costo), disponible:disp||null,
    es_promo:promo, lista_nombre:null, 
    updated_at:new Date().toISOString(),
    updated_by:'importador',
    updated_source:'importador' }
}


// ── parsers Excel ─────────────────────────────────────────────────────────────
async function parseGamma(file:File): Promise<CatRow[]> {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type:'array' })
  const ws = wb.Sheets['Lista General']
  if(!ws) throw new Error('Hoja "Lista General" no encontrada')
  const rows:unknown[][] = XLSX.utils.sheet_to_json(ws, { header:1, defval:null })
  let h=-1,iC=-1,iD=-1,iP=-1,iM=-1
  for(let i=0;i<Math.min(rows.length,15);i++){
    const r=rows[i].map((v:unknown)=>norm(String(v??'')))
    if(r.includes('CODIGO')){h=i;iC=r.indexOf('CODIGO');iD=r.findIndex((x:string)=>x.includes('DESCRIP'));iP=r.indexOf('PRECIO');iM=r.indexOf('MARCA');break}
  }
  if(h<0) throw new Error('Sin encabezado en Lista General')
  return rows.slice(h+1)
    .filter(r=>r[iC]&&toNum(r[iP])&&String(r[iD]??'').trim())
    .map(r=>mkRow('GAMMA',String(r[iC]).trim(),String(r[iD]??'').trim(),String(r[iM]??'').trim(),toNum(r[iP]),0))
}

async function parseMalateseta(file:File): Promise<CatRow[]> {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type:'array' })
  const ws = wb.Sheets['Lista']
  if(!ws) throw new Error('Hoja "Lista" no encontrada')
  const rows:unknown[][] = XLSX.utils.sheet_to_json(ws, { header:1, defval:null })
  const cRe=/^[0-9]{4,}[A-Z0-9]+$/; let marca=''; const items:CatRow[]=[]
  for(const r of rows){
    const c1=String(r[1]??'').trim(),c2=String(r[2]??'').trim(),c5=r[5]
    if(c1&&!/\d/.test(c1)&&!c2&&c5==null){marca=c1;continue}
    if(cRe.test(c1)){const p=toNum(c5);if(!p)continue;items.push(mkRow('MALATESTA',c1,c2,marca,p,0))}
  }
  return items
}

async function parseEuroglass(file:File): Promise<CatRow[]> {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type:'array', cellFormula:false, cellNF:false })
  // Buscar la hoja que tenga datos (cualquier nombre)
  const wsName = wb.SheetNames[0]
  const ws = wb.Sheets[wsName]
  const rows:unknown[][] = XLSX.utils.sheet_to_json(ws, { header:1, defval:null })
  const items:CatRow[] = []
  // Fila 0: headers de parámetros (IVA, FLETE, GANANCIA...)
  // Fila 1: valores de parámetros
  // Fila 2: encabezados columnas (Descripción, Pilk/Mix, Euroglass...)
  // Fila 3+: datos
  for (const r of rows.slice(3)) {
    const desc = String(r[0]??'').trim()
    const pricePilk = toNum(r[1])   // Col B: precio Pilkington/Mix
    const priceEG   = toNum(r[2])   // Col C: precio Euroglass
    if (!desc || (!pricePilk && !priceEG)) continue
    // Cargar con el precio más bajo disponible como costo_neto
    const costo = priceEG > 0 ? priceEG : pricePilk
    const lista  = pricePilk > 0 ? pricePilk : priceEG
    items.push(mkRow('EUROGLASS', '', desc, 'EUROGLASS', lista, costo))
  }
  return items
}

async function parseMalatestaJulio(file:File): Promise<CatRow[]> {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type:'array', cellFormula:false, cellNF:false })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows:unknown[][] = XLSX.utils.sheet_to_json(ws, { header:1, defval:null })
  const items:CatRow[] = []
  for (const r of rows) {
    const codigo = String(r[0]??'').trim()
    const desc   = String(r[1]??'').trim()
    const origen = String(r[2]??'').trim()
    const precio = toNum(r[4])
    // Fila válida: código alfanumérico real + descripción + precio
    if (!codigo || !desc || precio <= 0) continue
    if (codigo === 'Codigo' || !codigo.match(/[0-9]/)) continue // saltar headers/marcas
    const proveedor = 'MALATESTA' // PLK Argentina y EG son ambos Malatesta
    items.push(mkRow(proveedor, codigo, desc, proveedor, precio, 0))
  }
  return items
}

async function parseSekurit(file:File): Promise<CatRow[]> {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type:'array' })
  const ws = wb.Sheets['LP']
  if(!ws) throw new Error('Hoja "LP" no encontrada')
  const rows:unknown[][] = XLSX.utils.sheet_to_json(ws, { header:1, defval:'' })

  // Detectar posición desde descripción
  function posFromDesc(desc:string): string {
    const d = desc.toUpperCase()
    if(d.startsWith('PB ') || d.startsWith('PB  ')) return 'PARABRISAS'
    if(d.startsWith('LU ') || d.startsWith('LU  ') || d.startsWith('LUNETA')) return 'LUNETA'
    if(d.startsWith('PTA DD') || d.startsWith('PTA  DD')) return 'PUERTA_DD'
    if(d.startsWith('PTA DI') || d.startsWith('PTA  DI')) return 'PUERTA_DI'
    if(d.startsWith('PTA TD') || d.startsWith('PTA  TD')) return 'PUERTA_TD'
    if(d.startsWith('PTA TI') || d.startsWith('PTA  TI')) return 'PUERTA_TI'
    if(d.startsWith('PTA ') || d.startsWith('PTA  ')) return 'PUERTA_DD' // fallback puerta
    if(d.startsWith('CU D') || d.startsWith('CUS D') || d.startsWith('CUST D')) return 'CUSTODIA_D'
    if(d.startsWith('CU I') || d.startsWith('CUS I') || d.startsWith('CUST I')) return 'CUSTODIA_I'
    if(d.startsWith('TECHO') || d.startsWith('TCH')) return 'TECHO'
    return ''
  }

  // Headers de posición que cambian el contexto
  const POS_HEADERS: Record<string,string> = {
    'PARABRISAS':'PARABRISAS','LUNETAS':'LUNETA','LUNETA':'LUNETA',
    'LATERALES':'LATERAL','PUERTAS':'PUERTA_DD',
    'CUSTODIAS':'CUSTODIA_D','TECHOS':'TECHO','TECHO':'TECHO',
  }
  // Headers de marcas conocidas (para no confundirlos con posición)
  const KNOWN_BRANDS = new Set(['AUDI','BMW','CHERY','CHEVROLET','CITROEN','FIAT','FORD','HONDA',
    'HYUNDAI','JEEP','KIA','MERCEDES','NISSAN','PEUGEOT','RENAULT','SUZUKI','TOYOTA','VOLKSWAGEN','VW'])

  const items: CatRow[] = []
  let currentPos = ''

  for(let i=1; i<rows.length; i++) {
    const r = rows[i]
    const c0 = String(r[0]||'').trim()
    const precio = toNum(r[7])

    // Si no tiene precio es un header de sección
    if(!precio) {
      const c0up = c0.toUpperCase()
      if(POS_HEADERS[c0up]) currentPos = POS_HEADERS[c0up]
      // Si es marca conocida → no cambia pos
      continue
    }

    const desc  = String(r[4]||'').trim()
    const marca = String(r[6]||'').trim()
    const cod   = String(r[0]||'').trim() || String(r[2]||'').trim()
    const dispRaw = String(r[8]||'').trim().toUpperCase()
    const disp  = dispRaw==='SI'||dispRaw==='SÍ'?'SI':dispRaw==='NO'?'NO':dispRaw.includes('MIN')?'MIN':''

    if(!desc) continue

    // Refinar pos desde descripción (más específico que el header de sección)
    const posDesc = posFromDesc(desc)
    const pos = posDesc || currentPos

    const row = mkRow('SEKURIT', cod, desc, marca, precio, precio, disp, false)
    row.pos = pos || null
    items.push(row)
  }
  return items
}

async function parsePromo(file:File): Promise<CatRow[]> {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type:'array' })
  const ws = wb.Sheets['Hoja1']
  if(!ws) throw new Error('Hoja "Hoja1" no encontrada')
  const rows:unknown[][] = XLSX.utils.sheet_to_json(ws, { header:1, defval:null })
  let h=0
  for(let i=0;i<Math.min(rows.length,5);i++){if(rows[i].map((v:unknown)=>norm(String(v??''))).some((x:string)=>x.includes('LISTA'))){h=i;break}}
  let marca=''; const items:CatRow[]=[]
  for(let i=h+1;i<rows.length;i++){
    const r=rows[i],c1=String(r[1]??'').trim(),c2=String(r[2]??'').trim()
    const c3=toNum(r[3]),c6=toNum(r[6])
    if(!c1&&c2&&!c3){marca=c2;continue}
    if(!c1||!c3)continue
    items.push(mkRow('SEKURIT',c1,c2,marca,c3,c6>0?c6/1.21:0,'',true))
  }
  return items
}

// ── parsers PDF ───────────────────────────────────────────────────────────────
async function extractPdfText(bytes:Uint8Array): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist')
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`
  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise
  const parts: string[] = []
  for(let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    // Cada item de pdfjs va en su propia línea para que los parsers funcionen
    content.items
      .filter((item: any) => 'str' in item && (item as any).str.trim())
      .forEach((item: any) => parts.push((item as any).str.trim()))
  }
  return parts.join('\n')
}
async function parsePdfGamma(file:File): Promise<CatRow[]> {
  const bytes=new Uint8Array(await file.arrayBuffer())
  const text=await extractPdfText(bytes)
  // pdfjs devuelve un item por línea. Formato GAMMA oferta:
  // Línea N:   "080930VSLP"         (código)
  // Línea N+1: "PILKINGTON"         (o segundo código XYG)
  // Línea N+2: "PSAS. CHEV. AGILE"  (descripción)
  // Línea N+3: "125803,00"          (precio)
  const lines=text.split('\n').map(l=>l.trim()).filter(Boolean)
  const cRe=/^[0-9]{5,}[A-Z0-9]+$/
  const pRe=/^[\d.,]+$/
  const descRe=/^(E-)?PSAS/i
  const items:CatRow[]=[]; let i=0
  while(i<lines.length){
    if(cRe.test(lines[i])){
      const cod=lines[i]
      let j=i+1
      // Saltar segundo código o PILKINGTON
      if(j<lines.length && (cRe.test(lines[j])||lines[j]==='PILKINGTON')) j++
      // La siguiente línea debería ser la descripción
      if(j<lines.length && descRe.test(lines[j])){
        const desc=lines[j]; j++
        // La siguiente línea debería ser el precio
        if(j<lines.length && pRe.test(lines[j])){
          const p=toNum(lines[j])
          if(p>1000) items.push(mkRow('GAMMA',cod,desc,'',p,p,'',true))
          j++
        }
      }
      i=j
    }else i++
  }
  return items
}
async function parsePdfMix(file:File): Promise<CatRow[]> {
  const bytes=new Uint8Array(await file.arrayBuffer())
  const text=await extractPdfText(bytes)
  // pdfjs devuelve un item por línea. Formato Malatesta Mix:
  // Línea N:   "PSAS. CHEVROLET AGILE / MONTANA '09/'15"  (descripción)
  // Línea N+1: "125.803"  (precio Mix — el mayor, Pilkington+Euroglass)
  // Línea N+2: "$"
  // Línea N+3: "116.484"  (precio Euroglass solo)
  // Línea N+4: "$"
  const lines=text.split('\n').map(l=>l.trim()).filter(Boolean)
  const descRe=/^(E-)?PSAS/i
  const numRe=/^[\d.,]+$/
  const items:CatRow[]=[]; let i=0
  while(i<lines.length){
    if(descRe.test(lines[i])){
      const desc=lines[i]
      // El primer número tras la descripción es el precio Mix
      let pMix=0, j=i+1
      while(j<lines.length && j<i+4){
        if(numRe.test(lines[j])){ pMix=toNum(lines[j]); j++; break }
        j++
      }
      i=j
      if(!pMix||pMix<1000)continue
      items.push(mkRow('MALATESTA','',desc,'',pMix,pMix,'',true))
    }else i++
  }
  return items
}

function pct(n:number){ return (n*100).toFixed(1) }

// ── Componente ────────────────────────────────────────────────────────────────
export default function ProveedoresClient() {
  const [listas, setListas]     = useState<Lista[]>([])
  const [editId, setEditId]     = useState<string|null>(null)
  const [editVals, setEditVals] = useState({ desc_pct:'', flete_pct:'', iva_pct:'' })
  const [saving, setSaving]     = useState(false)
  const [formato, setFormato]   = useState('gamma')
  const [file, setFile]         = useState<File|null>(null)
  const [loading, setLoading]   = useState(false)
  const [progress, setProgress] = useState('')
  const [result, setResult]     = useState<{ok:boolean;msg:string}|null>(null)
  // Tab activo: 'importar' | 'precios'
  const [mainTab, setMainTab]   = useState<'importar'|'precios'>('importar')

  useEffect(() => {
    if (mainTab === 'precios' && catItems.length === 0) {
      cargarPrecios()
    }
  }, [mainTab])
  // Vista de precios por proveedor
  const [provFiltro, setProvFiltro] = useState('MALATESTA')
  const [catItems, setCatItems] = useState<any[]>([])
  const [catQ, setCatQ]         = useState('')
  const [catLoading, setCatLoading] = useState(false)
  const [editPrecio, setEditPrecio] = useState<{id:string; lista:string; costo:string}|null>(null)
  const [sortCol, setSortCol] = useState<'codigo'|'descripcion'|'precio_lista'|'costo_neto'|'dto'>('codigo')
  const [sortDir, setSortDir] = useState<'asc'|'desc'>('asc')

  function toggleSort(col: typeof sortCol) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
  }

  const catOrdenado = [...catItems].sort((a, b) => {
    let va: any, vb: any
    if (sortCol === 'codigo') { va = a.codigo||''; vb = b.codigo||'' }
    else if (sortCol === 'descripcion') { va = a.descripcion||''; vb = b.descripcion||'' }
    else if (sortCol === 'precio_lista') { va = a.precio_lista||0; vb = b.precio_lista||0 }
    else if (sortCol === 'costo_neto') { va = a.costo_neto||0; vb = b.costo_neto||0 }
    else { // dto
      va = a.precio_lista > 0 && a.costo_neto > 0 ? Math.round((1-a.costo_neto/a.precio_lista)*100) : -1
      vb = b.precio_lista > 0 && b.costo_neto > 0 ? Math.round((1-b.costo_neto/b.precio_lista)*100) : -1
    }
    if (va < vb) return sortDir === 'asc' ? -1 : 1
    if (va > vb) return sortDir === 'asc' ? 1 : -1
    return 0
  })
  const supabase = createClient()

  useEffect(() => {
    supabase.from('listas_precio').select('id,nombre,proveedor,tipo,desc_pct,flete_pct,iva_pct,updated_at')
      .order('proveedor').then(({ data }) => setListas(data ?? []))
  }, [supabase])

  async function cargarPrecios() {
    setCatLoading(true)
    let q = supabase.from('catalogo').select('id,codigo,descripcion,precio_lista,costo_neto,pos,marca,updated_at,updated_source')
      .ilike('proveedor', provFiltro).order('descripcion').limit(500)
    if (catQ.trim().length >= 2) {
      const esCode = !/\s/.test(catQ.trim())
      if (esCode) q = q.ilike('codigo', `%${catQ}%`)
      else q = q.ilike('descripcion', `%${catQ}%`)
    }
    const { data } = await q
    setCatItems(data ?? [])
    setCatLoading(false)
  }

  async function guardarPrecio(id: string) {
    if (!editPrecio) return
    await supabase.from('catalogo').update({
      precio_lista: parseFloat(editPrecio.lista.replace(',','.')) || null,
      costo_neto:   parseFloat(editPrecio.costo.replace(',','.')) || null,
      updated_at: new Date().toISOString(),
      updated_source: 'manual',
    }).eq('id', id)
    setCatItems(prev => prev.map(c => c.id===id ? { ...c,
      precio_lista: parseFloat(editPrecio.lista.replace(',','.')),
      costo_neto:   parseFloat(editPrecio.costo.replace(',','.')),
    } : c))
    setEditPrecio(null)
  }

  async function saveEdit(id:string) {
    setSaving(true)
    await supabase.from('listas_precio').update({
      desc_pct: parseFloat(editVals.desc_pct)/100,
      flete_pct:parseFloat(editVals.flete_pct)/100,
      iva_pct:  parseFloat(editVals.iva_pct)/100,
    }).eq('id',id)
    const { data } = await supabase.from('listas_precio')
      .select('id,nombre,proveedor,tipo,desc_pct,flete_pct,iva_pct,updated_at').order('proveedor')
    setListas(data??[]); setSaving(false); setEditId(null)
  }

  async function importar() {
    if(!file) return
    setLoading(true); setResult(null); setProgress('Leyendo archivo…')
    try {
      let items:CatRow[] = []
      if(formato==='gamma')         items = await parseGamma(file)
      else if(formato==='malatesta')      items = await parseMalateseta(file)
      else if(formato==='malatesta_julio') items = await parseMalatestaJulio(file)
      else if(formato==='euroglass')       items = await parseEuroglass(file)
      else if(formato==='sekurit')  items = await parseSekurit(file)
      else if(formato==='promo_ar'||formato==='promo_bg') items = await parsePromo(file)
      else if(formato==='oferta_gamma') items = await parsePdfGamma(file)
      else if(formato==='mix_malat')    items = await parsePdfMix(file)

      if(!items.length) throw new Error('No se encontraron ítems en el archivo')

      // Unificar PLK ARGENTINA → MALATESTA (PLK no es un proveedor separado)
      items = items.map(it => ({
        ...it,
        proveedor: it.proveedor === 'PLK ARGENTINA' ? 'MALATESTA' : it.proveedor
      }))

      // Aplicar el descuento desde listas_precio en vez de hardcodeado en cada parser
      const FORMATO_LISTA: Record<string,string> = {
        gamma: 'GAMMA', malatesta: 'MALATESTA', malatesta_julio: 'MALATESTA',
        euroglass: 'EUROGLASS', sekurit: 'SEKURIT',
        promo_ar: 'Promo Alta Rotación', promo_bg: 'Bajo Giro',
      }
      const proveedorLista = FORMATO_LISTA[formato]
      const lista = proveedorLista ? listas.find(l =>
        l.nombre.toUpperCase().includes(proveedorLista.toUpperCase()) ||
        (l as any).proveedor?.toUpperCase() === proveedorLista.toUpperCase()
      ) : null
      const descPct = lista ? (lista as any).desc_pct : 0  // 0 = sin descuento (ofertas PDF)
      const fletePct = lista ? (lista as any).flete_pct : 0

      if (descPct > 0 || fletePct > 0) {
        items = items.map(it => ({
          ...it,
          costo_neto: it.precio_lista > 0
            ? Math.round(it.precio_lista * (1 - descPct) * (1 + fletePct))
            : it.costo_neto
        }))
      }

      // Asignar lista_nombre según el formato importado
      const listaNombre: Record<string,string> = {
        gamma: 'Catálogo', malatesta: 'Catálogo', sekurit: 'Lista',
        promo_ar: 'Promo Alta Rot.', promo_bg: 'Bajo Giro',
        oferta_gamma: 'Oferta Mixta Jun26', mix_malat: 'Mix P/E Jun26',
      }
      const ln = listaNombre[formato] || ''
      items = items.map(it => ({ ...it, lista_nombre: ln || null }))

      // Deduplicar — Malatesta y otros pueden tener el mismo código más de una vez
      const seen = new Set<string>()
      items = items.filter(it => {
        const key = `${it.proveedor}|${it.codigo ?? it.descripcion}`
        if (seen.has(key)) return false
        seen.add(key); return true
      })

      setProgress(`Importando ${items.length.toLocaleString('es-AR')} piezas…`)
      let inserted=0
      const BATCH=200
      for(let i=0;i<items.length;i+=BATCH){
        const batch=items.slice(i,i+BATCH)
        const { error } = await supabase.from('catalogo')
          .upsert(batch, { onConflict:'proveedor,codigo', ignoreDuplicates:false })
        if(error) throw new Error(error.message)
        inserted+=batch.length
        setProgress(`Importando… ${inserted.toLocaleString('es-AR')} / ${items.length.toLocaleString('es-AR')}`)
      }
      setResult({ ok:true, msg:`✅ Se importaron ${inserted.toLocaleString('es-AR')} piezas correctamente.` })
      // Crear articulos_maestro SOLO para los códigos del import actual que no tienen equivalencia
      setProgress('Creando artículos nuevos en el maestro…')
      try {
        let creados = 0
        for (const cat of items) {
          if (!cat.codigo || !cat.descripcion) continue
          // ¿Ya tiene equivalencia exacta?
          const { data: eq } = await supabase.from('articulo_equivalencias')
            .select('id').eq('codigo_proveedor', cat.codigo).maybeSingle()
          if (eq) continue
          // Crear artículo en maestro
          const { data: nuevo } = await supabase.from('articulos_maestro').insert({
            descripcion: cat.descripcion, pos: cat.pos || null, activo: true,
          }).select('id').single()
          if (!nuevo) continue
          // Crear la equivalencia
          await supabase.from('articulo_equivalencias').insert({
            articulo_id: nuevo.id, codigo_proveedor: cat.codigo,
            proveedor: cat.proveedor || formato, lista_nombre: 'Auto-import',
          })
          creados++
        }
        if (creados > 0)
          setResult({ ok:true, msg:`✅ ${inserted.toLocaleString('es-AR')} piezas importadas · ${creados} artículos nuevos creados en el maestro.` })
      } catch {}
    } catch(e:unknown) {
      setResult({ ok:false, msg:`❌ ${e instanceof Error ? e.message : String(e)}` })
    }
    setLoading(false); setProgress(''); setFile(null)
    const inp=document.getElementById('fi') as HTMLInputElement
    if(inp)inp.value=''
  }

  const fmt = FORMATOS.find(f=>f.id===formato)!

  return (
    <div>
      {/* Tabs principales */}
      <div className="flex border-b border-p-line mb-6">
        {([['importar','📥 Importar listas'],['precios','💰 Precios por proveedor']] as const).map(([v,l])=>(
          <button key={v} onClick={()=>setMainTab(v)}
            style={{padding:'8px 24px',fontWeight:700,fontSize:13,cursor:'pointer',border:'none',background:'none',
              borderBottom:mainTab===v?'3px solid #00A550':'3px solid transparent',
              color:mainTab===v?'#00A550':'#6b7280'}}>
            {l}
          </button>
        ))}
      </div>

      {/* TAB: Precios por proveedor */}
      {mainTab === 'precios' && (
        <div>
          <div className="flex gap-3 mb-4 flex-wrap items-center">
            <select value={provFiltro} onChange={e=>{setProvFiltro(e.target.value);setCatItems([]);setCatQ('');setTimeout(()=>cargarPrecios(),50)}}
              className="border border-p-line rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:border-p-green">
              {['MALATESTA','GAMMA','SEKURIT','EUROGLASS'].map(p=><option key={p}>{p}</option>)}
            </select>
            <input value={catQ} onChange={e=>setCatQ(e.target.value)}
              placeholder="Buscar código o descripción…" onKeyDown={e=>e.key==='Enter'&&cargarPrecios()}
              className="flex-1 min-w-[180px] border border-p-line rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-p-green"/>
            <button onClick={cargarPrecios} disabled={catLoading}
              className="bg-p-green text-white font-bold text-sm px-5 py-2 rounded-xl cursor-pointer border-none">
              {catLoading ? 'Cargando…' : 'Buscar'}
            </button>
          </div>

          {catItems.length > 0 && (
            <div className="bg-white border border-p-line rounded-xl overflow-hidden">
              <div className="grid text-[11px] font-bold text-p-ink2 uppercase tracking-wider px-4 py-2 bg-p-light border-b border-p-line select-none"
                style={{gridTemplateColumns:'100px 1fr 120px 90px 130px 90px 90px'}}>
                {(['codigo','descripcion','precio_lista','dto','costo_neto'] as const).map((col,i)=>(
                  <button key={col} onClick={()=>toggleSort(col)}
                    className={`text-left flex items-center gap-1 cursor-pointer bg-transparent border-none p-0 hover:text-p-green transition-colors ${sortCol===col?'text-p-green':''}`}>
                    {['Código','Descripción','Precio lista','−Dto','Costo neto'][i]}
                    <span className="text-[9px]">{sortCol===col?(sortDir==='asc'?'↑':'↓'):'↕'}</span>
                  </button>
                ))}
                <span className="text-right">Actualizado</span>
                <span></span>
              </div>
              <div className="max-h-[60vh] overflow-y-auto">
                {catOrdenado.map(c=>{
                  const dto = c.precio_lista > 0 && c.costo_neto > 0
                    ? Math.round((1 - c.costo_neto / c.precio_lista) * 100)
                    : null
                  return (
                  <div key={c.id} className="grid items-center px-4 py-2 border-b border-p-line2 hover:bg-p-light/50"
                    style={{gridTemplateColumns:'100px 1fr 120px 90px 130px 90px 90px'}}>
                    <span className="text-xs font-mono text-p-ink2 truncate">{c.codigo||'—'}</span>
                    <span className="text-sm text-p-ink truncate pr-2">{c.descripcion}</span>
                    <span className="text-xs font-mono text-right text-p-ink2">{c.precio_lista?`$${Number(c.precio_lista).toLocaleString('es-AR')}`:'—'}</span>
                    <span className="text-xs font-mono text-right text-red-500">{dto!==null?`${dto}%`:'—'}</span>
                    {editPrecio?.id === c.id ? (<>
                      <input value={editPrecio?.costo||''} onChange={e=>setEditPrecio(p=>p?{...p,costo:e.target.value}:p)}
                        className="border border-p-green rounded px-2 py-1 text-xs font-mono text-right focus:outline-none"/>
                      <div className="flex gap-1">
                        <button onClick={()=>guardarPrecio(c.id)} className="text-[10px] bg-p-green text-white rounded px-2 py-1 border-none cursor-pointer">✓</button>
                        <button onClick={()=>setEditPrecio(null)} className="text-[10px] text-p-gray cursor-pointer">✕</button>
                      </div>
                    </>) : (<>
                      <span className="font-mono font-bold text-right text-p-green">{c.costo_neto?`$${Number(c.costo_neto).toLocaleString('es-AR')}`:'—'}</span>
                      <div className="text-right">
                        {(c as any).updated_at && <p className="text-[9px] font-mono text-p-ink2">{new Date((c as any).updated_at).toLocaleDateString('es-AR')}</p>}
                        {(c as any).updated_source && <p className={`text-[9px] font-bold ${(c as any).updated_source==='manual'?'text-amber-600':'text-p-green'}`}>{(c as any).updated_source==='manual'?'✏ manual':'📥 import'}</p>}
                      </div>
                      <button onClick={()=>setEditPrecio({id:c.id,lista:String(c.precio_lista||''),costo:String(c.costo_neto||'')})}
                        className="text-[11px] text-p-ink2 hover:text-p-ink cursor-pointer bg-transparent border-none">✏ Editar</button>
                    </>)}
                  </div>
                )})}
              </div>
              <div className="px-4 py-2 text-xs text-p-ink2 bg-p-light">{catItems.length} artículos · {provFiltro}</div>
            </div>
          )}
        </div>
      )}

      {/* TAB: Importar listas */}
      {mainTab === 'importar' && <div style={{ maxWidth:560 }}>

      {/* Descuentos */}
      <h2 style={{ fontFamily:'var(--font-saira)',fontWeight:700,fontSize:16,marginBottom:12 }}>
        Descuentos por proveedor
      </h2>
      <div style={{ display:'flex',flexDirection:'column',gap:8,marginBottom:32 }}>
        {listas.map(l=>(
          <div key={l.id} style={{ background:'#fff',border:'1px solid #C2DDD0',borderRadius:12,padding:'12px 16px' }}>
            {editId===l.id ? (
              <div>
                <p style={{ fontWeight:700,marginBottom:8 }}>{l.nombre}</p>
                <div style={{ display:'flex',gap:12,flexWrap:'wrap',marginBottom:8 }}>
                  {([['desc_pct','Descuento %'],['flete_pct','Flete %'],['iva_pct','IVA %']] as const).map(([k,lbl])=>(
                    <label key={k} style={{ fontSize:12,color:'#4A6655' }}>
                      {lbl}<br/>
                      <input type="number" step="0.1" min="0" max="100"
                        value={editVals[k]}
                        onChange={e=>setEditVals(p=>({...p,[k]:e.target.value}))}
                        style={{ width:72,border:'1px solid #00A550',borderRadius:8,padding:'4px 8px',fontFamily:'monospace',fontSize:14,textAlign:'center' }}/>
                    </label>
                  ))}
                </div>
                <div style={{ display:'flex',gap:8 }}>
                  <button onClick={()=>saveEdit(l.id)} disabled={saving}
                    style={{ background:'#00A550',color:'#fff',border:'none',borderRadius:8,padding:'6px 16px',fontWeight:700,fontSize:13,cursor:'pointer' }}>
                    {saving?'Guardando…':'Guardar'}
                  </button>
                  <button onClick={()=>setEditId(null)}
                    style={{ background:'#fff',border:'1px solid #C2DDD0',borderRadius:8,padding:'6px 16px',fontSize:13,cursor:'pointer' }}>
                    Cancelar
                  </button>
                </div>
              </div>
            ):(
              <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center' }}>
                <div>
                  <p style={{ fontWeight:600,fontSize:14,margin:0 }}>{l.nombre}</p>
                  <p style={{ fontFamily:'monospace',fontSize:12,color:'#4A6655',margin:'2px 0 0' }}>
                    −{pct(l.desc_pct)}% desc{l.flete_pct>0?` + ${pct(l.flete_pct)}% flete`:''} + {pct(l.iva_pct)}% IVA
                  </p>
                  {(l as any).updated_at && <p style={{fontSize:10,color:'#9ca3af',margin:'2px 0 0'}}>Actualizado: {new Date((l as any).updated_at).toLocaleDateString('es-AR')}</p>}
                </div>
                <button onClick={()=>{ setEditId(l.id); setEditVals({ desc_pct:pct(l.desc_pct),flete_pct:pct(l.flete_pct),iva_pct:pct(l.iva_pct) }) }}
                  style={{ border:'1px solid #C2DDD0',background:'#fff',borderRadius:8,padding:'6px 14px',fontSize:13,cursor:'pointer' }}>
                  ✏ Editar
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Importador */}
      <h2 style={{ fontFamily:'var(--font-saira)',fontWeight:700,fontSize:16,marginBottom:12 }}>
        Importar lista de precios
      </h2>
      <div style={{ marginBottom:16 }}>
        <label style={{ fontSize:12,fontWeight:600,color:'#4A6655',textTransform:'uppercase',letterSpacing:'0.05em',display:'block',marginBottom:6 }}>Tipo de lista</label>
        <select value={formato} onChange={e=>{ setFormato(e.target.value); setFile(null); setResult(null) }}
          style={{ width:'100%',border:'1px solid #C2DDD0',borderRadius:10,padding:'10px 12px',fontSize:14,background:'#fff' }}>
          {FORMATOS.map(f=><option key={f.id} value={f.id}>{f.label} ({f.ext})</option>)}
        </select>
      </div>
      <div style={{ marginBottom:16 }}>
        <label style={{ fontSize:12,fontWeight:600,color:'#4A6655',textTransform:'uppercase',letterSpacing:'0.05em',display:'block',marginBottom:6 }}>Archivo ({fmt.ext})</label>
        <input key={fmt.ext} id="fi" type="file" accept={fmt.ext}
          onChange={e=>{ setFile(e.target.files?.[0]??null); setResult(null) }}
          style={{ width:'100%',border:'1px solid #C2DDD0',borderRadius:10,padding:'8px 12px',fontSize:14,background:'#fff',cursor:'pointer' }}/>
        {file&&<p style={{ fontFamily:'monospace',fontSize:12,color:'#4A6655',marginTop:6 }}>📎 {file.name} · {(file.size/1024).toFixed(0)} KB</p>}
      </div>
      <button onClick={importar} disabled={!file||loading}
        style={{ display:'block',width:'100%',padding:'14px',background:(!file||loading)?'#aaa':'#00A550',
          color:'#fff',border:'none',borderRadius:12,fontSize:16,fontWeight:700,
          cursor:(!file||loading)?'not-allowed':'pointer',marginBottom:12 }}>
        {loading ? progress||'Procesando…' : '⬆ Importar al catálogo'}
      </button>
      {result&&(
        <div style={{ padding:16,borderRadius:12,background:result.ok?'#f0faf4':'#fef2f2',
          border:`1px solid ${result.ok?'#86efac':'#fca5a5'}`,color:result.ok?'#166534':'#991b1b',fontSize:14 }}>
          {result.msg}
        </div>
      )}
      </div>}
    </div>
  )
}
