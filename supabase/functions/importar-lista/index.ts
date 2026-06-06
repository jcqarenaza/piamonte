import { createClient } from 'jsr:@supabase/supabase-js@2'
import * as XLSX from 'npm:xlsx'

// ============================================================
// TIPOS
// ============================================================
interface Item {
  proveedor: string
  codigo: string
  descripcion: string
  marca: string
  modelo: string
  pos: string
  anio: string
  precio_lista: number
  costo_neto: number
  disponible: string
  es_promo: boolean
}

// ============================================================
// HELPERS DE NORMALIZACIÓN (port del normalizar.py)
// ============================================================
function norm(s: string): string {
  return s.toUpperCase()
    .replace(/Á/g,'A').replace(/É/g,'E').replace(/Í/g,'I')
    .replace(/Ó/g,'O').replace(/Ú/g,'U').replace(/Ü/g,'U').replace(/Ñ/g,'N')
    .trim()
}

function decodePos(desc: string): string {
  const d = norm(desc).replace(/^E-/, '')
  if (/^PSAS|^PB\b|PARABRISA/.test(d)) return 'PARABRISAS'
  if (/^TECHO/.test(d)) return 'TECHO'
  if (/^LTA|^LUNETA|^LT\b/.test(d)) return 'LUNETA'
  if (/^P\.?D\.?D|^PTA\.? ?DD/.test(d)) return 'PUERTA_DD'
  if (/^P\.?D\.?I|^PTA\.? ?DI/.test(d)) return 'PUERTA_DI'
  if (/^P\.?T\.?D|^PTA\.? ?TD/.test(d)) return 'PUERTA_TD'
  if (/^P\.?T\.?I|^PTA\.? ?TI/.test(d)) return 'PUERTA_TI'
  if (/^P\.?D\b/.test(d)) return 'PUERTA_DD'
  if (/^P\.?I\b/.test(d)) return 'PUERTA_DI'
  if (/^C\.?T\.?D|^C\.?D/.test(d) || (d.startsWith('CUSTODIA') && !d.includes('.I'))) return 'CUSTODIA_D'
  if (/^C\.?T\.?I|^C\.?I/.test(d)) return 'CUSTODIA_I'
  if (/^A\.?T?\.?D|^A\.?D\b/.test(d)) return 'ALETA_D'
  if (/^A\.?T?\.?I|^A\.?I\b/.test(d)) return 'ALETA_I'
  if (/^ALETA/.test(d)) return 'ALETA_D'
  if (/^V\.?D|^VENTANILLA/.test(d)) return 'VENTANA_D'
  if (/^V\.?I/.test(d)) return 'VENTANA_I'
  return 'OTRO'
}

const SERIES = new Set(['SERIE', 'CLASE', 'CLASS'])
const POS_PREFIX = /^(E-)?(PSAS|PB|PARABRISA\w*|LTA\.?TER\.?|LTA|LUNETA|LT|TECHO|P\.?[DT]\.?[DI]|P\.?[DI]|PTA\.? ?[DT][DI]|PTA|C\.?[DTI]\.?[A-Z]*|A\.?[DTI]?\.?[DI]?|ALETA|V\.?[DI]|VENTANILLA|VENTILETE|FIJO)[\.\s]*/i

function modelVersion(desc: string, marca: string): string {
  const d = norm(desc)
  const mk = norm(marca)
  let rest = mk && d.includes(mk) ? d.split(mk).slice(1).join(mk) : d.replace(POS_PREFIX, '')
  rest = rest.replace(/^[\.\-\s]+/, '').trim()
  const toks = rest.split(/\s+/).filter(Boolean)
  if (!toks.length) return ''
  let name = toks[0]
  let startIdx = 1
  if (SERIES.has(name) && toks.length > 1) { name = name + ' ' + toks[1]; startIdx = 2 }
  // buscar año
  let yr = ''
  for (const mt of rest.matchAll(/(?:19|20)\d{2}|\b\d{2}(?:[-/]\d{2})?\b/g)) {
    const tok = mt[0]
    const base = tok.split(/[-/]/)[0]
    if (base === name || name.includes(base)) continue
    const n = parseInt(base)
    if (base.length === 4) { yr = base.slice(2); break }
    if (base.length === 2 && (n >= 80 || n <= 35)) { yr = tok.replace('/', '-'); break }
  }
  return (name + (yr ? ' ' + yr : '')).trim()
}

function toNum(v: unknown): number {
  if (v == null) return 0
  const s = String(v).replace(/\./g, '').replace(',', '.')
  return parseFloat(s) || 0
}

// ============================================================
// PARSERS POR FORMATO
// ============================================================

// GAMMA: hoja "Lista General", encabezado con CODIGO/DESCRIPCION/PRECIO/MARCA
function parseGamma(wb: XLSX.WorkBook, desc_pct = 0.48, flete_pct = 0.015): Item[] {
  const ws = wb.Sheets['Lista General']
  if (!ws) throw new Error('Hoja "Lista General" no encontrada')
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })
  let hdr = -1
  let iC = -1, iD = -1, iP = -1, iM = -1
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const r = rows[i].map((v: unknown) => norm(String(v ?? '')))
    if (r.includes('CODIGO')) {
      hdr = i; iC = r.indexOf('CODIGO'); iD = r.findIndex(x => x.includes('DESCRIP'))
      iP = r.indexOf('PRECIO'); iM = r.indexOf('MARCA'); break
    }
  }
  if (hdr < 0) throw new Error('No se encontró el encabezado en Lista General')
  const items: Item[] = []
  for (let i = hdr + 1; i < rows.length; i++) {
    const r = rows[i]
    const cod = r[iC]; const pre = toNum(r[iP]); const desc = String(r[iD] ?? '').trim()
    if (!cod || !pre || !desc) continue
    const costo = pre * (1 - desc_pct) * (1 + flete_pct)
    const marca = String(r[iM] ?? '').trim()
    items.push({ proveedor: 'GAMMA', codigo: String(cod).trim(), descripcion: desc,
      marca, modelo: modelVersion(desc, marca), pos: decodePos(desc), anio: '',
      precio_lista: pre, costo_neto: Math.round(costo), disponible: '', es_promo: false })
  }
  return items
}

// MALATESETA: hoja "Lista", con brand headers y filas de producto
function parseMalateseta(wb: XLSX.WorkBook, desc_pct = 0.53, flete_pct = 0.01): Item[] {
  const ws = wb.Sheets['Lista']
  if (!ws) throw new Error('Hoja "Lista" no encontrada')
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })
  const codeRe = /^[0-9]{4,}[A-Z0-9]+$/
  let curMarca = ''
  const items: Item[] = []
  for (const r of rows) {
    const c1 = String(r[1] ?? '').trim(), c2 = String(r[2] ?? '').trim()
    const c5 = r[5]
    if (c1 && /^[A-ZÁÉÍÓÚÜÑ /\.\-]+$/.test(c1) && !/\d/.test(c1) && !c2 && c5 == null) {
      curMarca = c1; continue
    }
    if (codeRe.test(c1)) {
      const pre = toNum(c5)
      if (!pre) continue
      const costo = pre * (1 - desc_pct) * (1 + flete_pct)
      items.push({ proveedor: 'MALATESTA', codigo: c1, descripcion: c2,
        marca: curMarca, modelo: modelVersion(c2, curMarca), pos: decodePos(c2), anio: '',
        precio_lista: pre, costo_neto: Math.round(costo), disponible: '', es_promo: false })
    }
  }
  return items
}

// SEKURIT: hoja "LP"
function parseSekurit(wb: XLSX.WorkBook): Item[] {
  const ws = wb.Sheets['LP']
  if (!ws) throw new Error('Hoja "LP" no encontrada')
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })
  if (!rows.length) return []
  const hdr = rows[0].map((v: unknown) => norm(String(v ?? '')))
  const iMat = hdr.findIndex((h: string) => h === 'MATERIAL') // puede haber Material.1
  const iDesc = hdr.findIndex((h: string) => h.includes('DESCRIP'))
  const iMarca = hdr.findIndex((h: string) => h === 'MARCA')
  const iPre = hdr.findIndex((h: string) => h.includes('LISTA'))
  const iDisp = hdr.findIndex((h: string) => h.includes('DISPONIBLE') || h.includes('DISP'))
  const items: Item[] = []
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    const pre = toNum(r[iPre])
    const desc = String(r[iDesc] ?? '').trim()
    if (!pre || !desc) continue
    const marca = String(r[iMarca] ?? '').trim()
    const disp = String(r[iDisp] ?? '').trim().toUpperCase()
    const disponible = disp === 'SI' || disp === 'SÍ' ? 'SI' : disp === 'NO' ? 'NO' : disp.includes('MIN') ? 'MIN' : ''
    items.push({ proveedor: 'SEKURIT', codigo: String(r[iMat] ?? '').trim(),
      descripcion: desc, marca, modelo: modelVersion(desc, marca), pos: decodePos(desc), anio: '',
      precio_lista: pre, costo_neto: Math.round(pre), disponible, es_promo: false })
  }
  return items
}

// PROMOS 68% (Alta Rotación / Bajo Giro): hoja "Hoja1"
// Columnas: Código, Descripción, Precio de Lista, Desc Extra, P+IVA, Desc Base(0.68), P+IVA, Desc PP(0.08), P+IVA
function parsePromo68(wb: XLSX.WorkBook, listaNombre: string): Item[] {
  const ws = wb.Sheets['Hoja1']
  if (!ws) throw new Error('Hoja "Hoja1" no encontrada')
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })
  let hdr = -1
  for (let i = 0; i < Math.min(rows.length, 5); i++) {
    const r = rows[i].map((v: unknown) => norm(String(v ?? '')))
    if (r.some(x => x.includes('LISTA') || x.includes('PRECIO'))) { hdr = i; break }
  }
  const items: Item[] = []
  let curMarca = ''
  for (let i = hdr + 1; i < rows.length; i++) {
    const r = rows[i]
    // header de marca: col1 es texto, col2 (desc) es texto de marca, el resto null
    const c1 = String(r[1] ?? '').trim(), c2 = String(r[2] ?? '').trim()
    const c3 = toNum(r[3]) // precio lista
    const c4 = toNum(r[4]) // desc extra
    const c6 = toNum(r[6]) // precio con desc base (0.68) + iva — es el precio promo
    if (!c1 && c2 && !c3) { curMarca = c2; continue }
    if (!c1 || !c3) continue
    // costo neto: precio con desc base (col index 6 = P+IVA tras 68%) / 1.21 para sacar sin IVA
    const costoConIva = c6
    const costoNeto = costoConIva > 0 ? Math.round(costoConIva / 1.21) : 0
    items.push({ proveedor: 'SEKURIT', codigo: String(r[1] ?? '').trim(), descripcion: c2,
      marca: curMarca, modelo: modelVersion(c2, curMarca), pos: decodePos(c2), anio: '',
      precio_lista: c3, costo_neto: costoNeto, disponible: '', es_promo: true })
  }
  return items
}

// PDF Oferta Especial Mixta GAMMA: CODIGO / CODIGO_XYG / DESCRIPCION / PRECIO
function parsePdfEspecialGamma(text: string): Item[] {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const items: Item[] = []
  const codeRe = /^[0-9]{6,}[A-Z]+$/
  let i = 0
  while (i < lines.length) {
    if (codeRe.test(lines[i])) {
      const cod = lines[i]
      const next1 = lines[i + 1] ?? ''
      // Si next1 es también un código o "PILKINGTON", es codigo_xyg; sino es desc
      let desc = '', precioStr = ''
      if (codeRe.test(next1) || next1 === 'PILKINGTON') {
        desc = lines[i + 2] ?? ''; precioStr = lines[i + 3] ?? ''; i += 4
      } else {
        desc = next1; precioStr = lines[i + 2] ?? ''; i += 3
      }
      const pre = toNum(precioStr)
      if (!pre || !desc) continue
      items.push({ proveedor: 'GAMMA', codigo: cod, descripcion: desc,
        marca: '', modelo: modelVersion(desc, ''), pos: decodePos(desc), anio: '',
        precio_lista: pre, costo_neto: Math.round(pre), disponible: '', es_promo: true })
    } else { i++ }
  }
  return items
}

// PDF Oferta Mix Pilkington/Euroglass: DESC / PRECIO_MIX / $ / PRECIO_EUROGLASS / $
function parsePdfMixMalateseta(text: string): Item[] {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const items: Item[] = []
  const descRe = /^(E-)?PSAS|^LTA|^P\.|^C\.|^A\.|^V\./i
  const numRe = /^[\d\.,]+$/
  let i = 0
  while (i < lines.length) {
    if (descRe.test(lines[i])) {
      const desc = lines[i]
      // siguiente línea no-$ que sea número
      let pre = 0
      if (i + 1 < lines.length && numRe.test(lines[i + 1])) {
        pre = toNum(lines[i + 1]); i += 2
      } else { i++; continue }
      if (!pre) continue
      items.push({ proveedor: 'MALATESTA', codigo: '', descripcion: desc,
        marca: '', modelo: modelVersion(desc, ''), pos: decodePos(desc), anio: '',
        precio_lista: pre, costo_neto: Math.round(pre), disponible: '', es_promo: true })
    } else { i++ }
  }
  return items
}

// ============================================================
// EDGE FUNCTION PRINCIPAL
// ============================================================
Deno.serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const form = await req.formData()
    const file = form.get('file') as File
    const formato = (form.get('formato') as string ?? '').toLowerCase()
    const listaNombre = (form.get('lista_nombre') as string ?? formato)

    if (!file) return new Response(JSON.stringify({ error: 'No se recibió archivo' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const bytes = new Uint8Array(await file.arrayBuffer())
    const ext = file.name.split('.').pop()?.toLowerCase()

    let items: Item[] = []

    if (ext === 'pdf') {
      // Extraer texto del PDF usando pdf-parse
      const pdfParse = (await import('npm:pdf-parse/lib/pdf-parse.js')).default
      const data = await pdfParse(bytes)
      const text = data.text as string
      if (formato.includes('mix') || formato.includes('pilkington') || formato.includes('euroglass')) {
        items = parsePdfMixMalateseta(text)
      } else {
        items = parsePdfEspecialGamma(text)
      }
    } else {
      // Excel
      const wb = XLSX.read(bytes, { type: 'array' })
      if (formato === 'gamma') {
        items = parseGamma(wb)
      } else if (formato === 'malatesta') {
        items = parseMalateseta(wb)
      } else if (formato === 'sekurit') {
        items = parseSekurit(wb)
      } else if (formato.includes('promo') || formato.includes('rotacion') || formato.includes('giro')) {
        items = parsePromo68(wb, listaNombre)
      } else {
        // Auto-detect por hojas
        const sheets = wb.SheetNames
        if (sheets.includes('Lista General')) items = parseGamma(wb)
        else if (sheets.includes('Lista')) items = parseMalateseta(wb)
        else if (sheets.includes('LP')) items = parseSekurit(wb)
        else if (sheets.includes('Hoja1')) items = parsePromo68(wb, listaNombre)
        else throw new Error(`No se pudo detectar el formato. Hojas: ${sheets.join(', ')}`)
      }
    }

    if (!items.length) return new Response(JSON.stringify({ ok: false, error: 'No se encontraron ítems', count: 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    // Upsert en lotes de 500
    let inserted = 0
    const BATCH = 500
    const rows = items.map(it => ({
      proveedor: it.proveedor,
      codigo: it.codigo || null,
      descripcion: it.descripcion,
      marca: it.marca || null,
      modelo: it.modelo || null,
      pos: it.pos || null,
      precio_lista: it.precio_lista,
      costo_neto: it.costo_neto,
      disponible: it.disponible || null,
      es_promo: it.es_promo,
      updated_at: new Date().toISOString(),
    }))

    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH)
      const { error } = await supabase.from('catalogo').upsert(batch, {
        onConflict: 'proveedor,codigo',
        ignoreDuplicates: false,
      })
      if (error) console.error('Batch error:', error.message)
      else inserted += batch.length
    }

    return new Response(
      JSON.stringify({ ok: true, total: items.length, importados: inserted, formato, lista: listaNombre }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return new Response(JSON.stringify({ ok: false, error: msg }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
