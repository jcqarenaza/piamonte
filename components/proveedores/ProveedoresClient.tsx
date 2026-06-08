'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

const FORMATOS = [
  { id: 'gamma',        label: 'GAMMA — Catálogo',               ext: '.xlsx', tipo: 'excel' },
  { id: 'malatesta',   label: 'Malatesta — Catálogo',            ext: '.xlsx', tipo: 'excel' },
  { id: 'sekurit',     label: 'Sekurit — Lista disponible',      ext: '.xlsx', tipo: 'excel' },
  { id: 'promo_ar',    label: 'Promo Alta Rotación 68%',         ext: '.xlsx', tipo: 'excel' },
  { id: 'promo_bg',    label: 'Promo Bajo Giro 68%',             ext: '.xlsx', tipo: 'excel' },
  { id: 'oferta_gamma',label: 'Oferta Especial Mixta (GAMMA)',   ext: '.pdf',  tipo: 'pdf'   },
  { id: 'mix_malat',   label: 'Oferta Mix Pilkington/Euroglass', ext: '.pdf',  tipo: 'pdf'   },
]

interface Lista { id:string; nombre:string; proveedor:string; tipo:string; desc_pct:number; flete_pct:number; iva_pct:number }
interface CatRow { proveedor:string; codigo:string|null; descripcion:string; marca:string|null; modelo:string|null; pos:string|null; precio_lista:number; costo_neto:number; disponible:string|null; es_promo:boolean; updated_at:string }

// ── helpers ──────────────────────────────────────────────────────────────────
function norm(s:string) {
  return s.toUpperCase()
    .replace(/[ÁÀÄÂ]/g,'A').replace(/[ÉÈËÊ]/g,'E').replace(/[ÍÌÏÎ]/g,'I')
    .replace(/[ÓÒÖÔ]/g,'O').replace(/[ÚÙÜÛ]/g,'U').replace(/Ñ/g,'N').trim()
}
function decodePos(d:string) {
  const s=norm(d).replace(/^E-/,'')
  if(/^PSAS|^PB\b|PARABRISA/.test(s)) return 'PARABRISAS'
  if(/^LUNETA|^LTA|^LT\b/.test(s))    return 'LUNETA'
  if(/^TECHO/.test(s))                 return 'TECHO'
  if(/^P\.?D\.?D/.test(s))            return 'PUERTA_DD'
  if(/^P\.?D\.?I/.test(s))            return 'PUERTA_DI'
  if(/^P\.?T\.?D/.test(s))            return 'PUERTA_TD'
  if(/^P\.?T\.?I/.test(s))            return 'PUERTA_TI'
  if(/^P\.?D\b/.test(s))              return 'PUERTA_DD'
  if(/^P\.?I\b/.test(s))              return 'PUERTA_DI'
  if(/^C\.?T?\.?D|^C\.?D/.test(s)||s.startsWith('CUSTODIA')) return 'CUSTODIA_D'
  if(/^C\.?T?\.?I|^C\.?I/.test(s))   return 'CUSTODIA_I'
  if(/^A\.?T?\.?D|^A\.?D\b/.test(s)) return 'ALETA_D'
  if(/^A\.?T?\.?I|^A\.?I\b/.test(s)) return 'ALETA_I'
  return 'OTRO'
}
function toNum(v:unknown) {
  if(v==null) return 0
  return parseFloat(String(v).replace(/\./g,'').replace(',','.')) || 0
}
function mkRow(prov:string,cod:string,desc:string,marca:string,pre:number,costo:number,disp='',promo=false): CatRow {
  return { proveedor:prov, codigo:cod||null, descripcion:desc, marca:marca||null,
    modelo:null, pos:decodePos(desc), precio_lista:pre,
    costo_neto:Math.round(costo), disponible:disp||null,
    es_promo:promo, updated_at:new Date().toISOString() }
}

// ── parsers Excel ─────────────────────────────────────────────────────────────
async function loadXLSX() {
  // @ts-ignore
  const mod = await import('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/xlsx.mjs')
  return mod
}

async function parseGamma(file:File): Promise<CatRow[]> {
  const XLSX = await loadXLSX()
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
    .map(r=>mkRow('GAMMA',String(r[iC]).trim(),String(r[iD]??'').trim(),String(r[iM]??'').trim(),toNum(r[iP]),toNum(r[iP])*(1-0.48)*(1+0.015)))
}

async function parseMalateseta(file:File): Promise<CatRow[]> {
  const XLSX = await loadXLSX()
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type:'array' })
  const ws = wb.Sheets['Lista']
  if(!ws) throw new Error('Hoja "Lista" no encontrada')
  const rows:unknown[][] = XLSX.utils.sheet_to_json(ws, { header:1, defval:null })
  const cRe=/^[0-9]{4,}[A-Z0-9]+$/; let marca=''; const items:CatRow[]=[]
  for(const r of rows){
    const c1=String(r[1]??'').trim(),c2=String(r[2]??'').trim(),c5=r[5]
    if(c1&&!/\d/.test(c1)&&!c2&&c5==null){marca=c1;continue}
    if(cRe.test(c1)){const p=toNum(c5);if(!p)continue;items.push(mkRow('MALATESTA',c1,c2,marca,p,p*(1-0.53)*(1+0.01)))}
  }
  return items
}

async function parseSekurit(file:File): Promise<CatRow[]> {
  const XLSX = await loadXLSX()
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type:'array' })
  const ws = wb.Sheets['LP']
  if(!ws) throw new Error('Hoja "LP" no encontrada')
  const rows:unknown[][] = XLSX.utils.sheet_to_json(ws, { header:1, defval:null })
  const h=rows[0].map((v:unknown)=>norm(String(v??'')))
  const iM=h.findIndex((x:string)=>x==='MATERIAL'),iD=h.findIndex((x:string)=>x.includes('DESCRIP'))
  const iMk=h.findIndex((x:string)=>x==='MARCA'),iP=h.findIndex((x:string)=>x.includes('LISTA'))
  const iDp=h.findIndex((x:string)=>x.includes('DISP'))
  return rows.slice(1).filter(r=>toNum(r[iP])&&String(r[iD]??'').trim()).map(r=>{
    const d=String(r[iDp]??'').trim().toUpperCase()
    const disp=d==='SI'||d==='SÍ'?'SI':d==='NO'?'NO':d.includes('MIN')?'MIN':''
    return mkRow('SEKURIT',String(r[iM]??'').trim(),String(r[iD]??'').trim(),String(r[iMk]??'').trim(),toNum(r[iP]),toNum(r[iP]),disp,false)
  })
}

async function parsePromo(file:File): Promise<CatRow[]> {
  const XLSX = await loadXLSX()
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
function extractPdfText(bytes:Uint8Array): string {
  const text=new TextDecoder('latin1').decode(bytes)
  const parts:string[]=[]
  const re=/\(([^)\\]*(?:\\.[^)\\]*)*)\)/g; let m
  while((m=re.exec(text))!==null){
    const s=m[1].replace(/\\n/g,'\n').replace(/\\r/g,'\n').replace(/\\t/g,' ')
      .replace(/\\\\/g,'\\').replace(/\\\(/g,'(').replace(/\\\)/g,')').trim()
    if(s.length>1)parts.push(s)
  }
  return parts.join('\n')
}
async function parsePdfGamma(file:File): Promise<CatRow[]> {
  const bytes=new Uint8Array(await file.arrayBuffer())
  const text=extractPdfText(bytes)
  const lines=text.split('\n').map(l=>l.trim()).filter(Boolean)
  const cRe=/^[0-9]{6,}[A-Z]+$/; const items:CatRow[]=[]; let i=0
  while(i<lines.length){
    if(cRe.test(lines[i])){
      const cod=lines[i],n1=lines[i+1]??''
      let desc='',ps=''
      if(cRe.test(n1)||n1==='PILKINGTON'){desc=lines[i+2]??'';ps=lines[i+3]??'';i+=4}
      else{desc=n1;ps=lines[i+2]??'';i+=3}
      const p=toNum(ps);if(!p||!desc)continue
      items.push(mkRow('GAMMA',cod,desc,'',p,p,'',true))
    }else i++
  }
  return items
}
async function parsePdfMix(file:File): Promise<CatRow[]> {
  const bytes=new Uint8Array(await file.arrayBuffer())
  const text=extractPdfText(bytes)
  const lines=text.split('\n').map(l=>l.trim()).filter(Boolean)
  const dRe=/^(E-)?PSAS|^LTA|^P\.|^C\.|^A\./i,nRe=/^[\d.,]+$/
  const items:CatRow[]=[]; let i=0
  while(i<lines.length){
    if(dRe.test(lines[i])){
      const desc=lines[i]; let p=0
      if(i+1<lines.length&&nRe.test(lines[i+1])){p=toNum(lines[i+1]);i+=2}else{i++;continue}
      if(!p)continue
      items.push(mkRow('MALATESTA','',desc,'',p,p,'',true))
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
  const supabase = createClient()

  useEffect(() => {
    supabase.from('listas_precio').select('id,nombre,proveedor,tipo,desc_pct,flete_pct,iva_pct')
      .order('proveedor').then(({ data }) => setListas(data ?? []))
  }, [supabase])

  async function saveEdit(id:string) {
    setSaving(true)
    await supabase.from('listas_precio').update({
      desc_pct: parseFloat(editVals.desc_pct)/100,
      flete_pct:parseFloat(editVals.flete_pct)/100,
      iva_pct:  parseFloat(editVals.iva_pct)/100,
    }).eq('id',id)
    const { data } = await supabase.from('listas_precio')
      .select('id,nombre,proveedor,tipo,desc_pct,flete_pct,iva_pct').order('proveedor')
    setListas(data??[]); setSaving(false); setEditId(null)
  }

  async function importar() {
    if(!file) return
    setLoading(true); setResult(null); setProgress('Leyendo archivo…')
    try {
      let items:CatRow[] = []
      if(formato==='gamma')         items = await parseGamma(file)
      else if(formato==='malatesta')items = await parseMalateseta(file)
      else if(formato==='sekurit')  items = await parseSekurit(file)
      else if(formato==='promo_ar'||formato==='promo_bg') items = await parsePromo(file)
      else if(formato==='oferta_gamma') items = await parsePdfGamma(file)
      else if(formato==='mix_malat')    items = await parsePdfMix(file)

      if(!items.length) throw new Error('No se encontraron ítems en el archivo')

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
    } catch(e:unknown) {
      setResult({ ok:false, msg:`❌ ${e instanceof Error ? e.message : String(e)}` })
    }
    setLoading(false); setProgress(''); setFile(null)
    const inp=document.getElementById('fi') as HTMLInputElement
    if(inp)inp.value=''
  }

  const fmt = FORMATOS.find(f=>f.id===formato)!

  return (
    <div style={{ maxWidth:560 }}>

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
        <input id="fi" type="file" accept={fmt.ext}
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
    </div>
  )
}
