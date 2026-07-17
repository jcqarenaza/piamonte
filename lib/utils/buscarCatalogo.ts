import { SupabaseClient } from '@supabase/supabase-js'

const POS_KW: Record<string,string> = {
  'PARA':'PARABRISAS','PARABRISA':'PARABRISAS','PARABRISAS':'PARABRISAS',
  'LUNETA':'LUNETA','TECHO':'TECHO','PUERTA':'PUERTA',
  'CUSTODIA':'CUSTODIA','ALETA':'ALETA','PDD':'PUERTA','PDI':'PUERTA',
  'PTD':'PUERTA','PTI':'PUERTA',
}

export interface ResultadoCatalogo {
  id: string
  descripcion: string
  codigo: string | null
  proveedor: string | null
  costo_neto: number | null
  pos: string | null
  marca: string | null
  // Indica si vino del stock físico
  stock_id?: string
  cantidad?: number
  precio_venta?: number
  articulo_id?: string | null
}

/**
 * Búsqueda unificada para TODOS los módulos.
 *
 * Lógica:
 * - Sin espacios (parece código): busca por catalogo.codigo → si matchea, devuelve directo
 * - Con espacios (descripción): usa POS keywords + búsqueda por descripción
 * - Siempre incluye stock físico disponible como primera opción
 */
export async function buscarCatalogo(
  supabase: SupabaseClient,
  query: string,
  opts: { incluirStock?: boolean; limit?: number; proveedor?: string } = {}
): Promise<ResultadoCatalogo[]> {
  const { incluirStock = true, limit = 8, proveedor } = opts
  const q = query.trim()
  if (q.length < 2) return []

  const esCodigoDirecto = !/\s/.test(q) // sin espacios = posible código

  // --- Búsqueda por código ---
  if (esCodigoDirecto) {
    let cq = supabase.from('catalogo')
      .select('id,descripcion,codigo,proveedor,costo_neto,precio_lista,pos,marca')
      .ilike('codigo', `%${query.trim()}%`)
    // Filtro proveedor con wildcards para que matchee aunque el nombre difiera en case/formato
    if (proveedor) cq = cq.ilike('proveedor', `%${proveedor.split(' ')[0]}%`)
    cq = cq.order('proveedor').limit(limit * 3)
    const { data: porCodigo } = await cq

    if (porCodigo && porCodigo.length > 0) {
      // Para búsqueda por código NO deduplicamos — mostramos todas las variantes (DSLP, DSLI, VSLP, etc.)
      const resultados = (porCodigo as ResultadoCatalogo[]).slice(0, limit)

      // Agregar stock físico si disponible
      if (incluirStock) {
        const { data: stockData } = await supabase.from('stock')
          .select('id,descripcion,codigo,cantidad,precio_venta,costo,articulo_id')
          .ilike('codigo', `%${query.trim()}%`).gt('cantidad', 0).eq('activo', true).limit(4)
        const stockItems: ResultadoCatalogo[] = (stockData||[]).map(s => ({
          id: s.id, descripcion: s.descripcion, codigo: s.codigo,
          proveedor: null, costo_neto: s.costo,
          pos: null, marca: null,
          stock_id: s.id, cantidad: s.cantidad, precio_venta: s.precio_venta, articulo_id: s.articulo_id
        }))
        if (stockItems.length > 0) return [...stockItems, ...resultados.filter(r => !stockItems.find(s=>s.codigo===r.codigo))]
        return resultados
      }
      return resultados
    }
    // Si no encontró por código exacto, caer en búsqueda por descripción
  }

  // --- Búsqueda por descripción con POS keywords ---
  const words    = q.toUpperCase().split(/\s+/).filter(Boolean)
  const posWord  = words.find(w => POS_KW[w])
  const nonPosWs = words.filter(w => !POS_KW[w])
  const mainWord = nonPosWs[0] || words[0]
  const restWords = nonPosWs.slice(1)

  const filtrar = (items: any[]) => items.filter(c =>
    restWords.every(w => (c.descripcion||'').toUpperCase().includes(w) || (c.marca||'').toUpperCase().includes(w))
  )

  // Stock físico
  let stockItems: ResultadoCatalogo[] = []
  if (incluirStock) {
    let sQ = supabase.from('stock').select('id,descripcion,codigo,cantidad,precio_venta,costo,articulo_id')
      .eq('activo', true).gt('cantidad', 0).limit(50)
    if (posWord && nonPosWs.length > 0) sQ = sQ.eq('pos', POS_KW[posWord]).ilike('descripcion', `%${mainWord}%`)
    else sQ = sQ.or(`descripcion.ilike.%${mainWord}%,codigo.ilike.%${mainWord}%`)
    const { data: sd } = await sQ
    stockItems = filtrar(sd||[]).slice(0, 4).map(s => ({
      id: s.id, descripcion: s.descripcion, codigo: s.codigo,
      proveedor: null, costo_neto: s.costo,
      pos: null, marca: null,
      stock_id: s.id, cantidad: s.cantidad, precio_venta: s.precio_venta, articulo_id: s.articulo_id
    }))
  }

  // Catálogo
  let cQ = supabase.from('catalogo').select('id,descripcion,codigo,proveedor,costo_neto,precio_lista,pos,marca').limit(150)
  if (proveedor) cQ = cQ.ilike('proveedor', `%${proveedor.split(' ')[0]}%`)
  if (posWord && nonPosWs.length > 0) cQ = cQ.eq('pos', POS_KW[posWord]).ilike('descripcion', `%${mainWord}%`)
  else if (posWord)                    cQ = cQ.eq('pos', POS_KW[posWord])
  else                                 cQ = cQ.or(`descripcion.ilike.%${mainWord}%,codigo.ilike.%${mainWord}%`)
  const { data: cd } = await cQ
  const catFiltrado = filtrar(cd||[])
  const dedup = new Map<string,ResultadoCatalogo>()
  for (const c of catFiltrado) {
    const key = (c.descripcion||'').toUpperCase().trim()
    if (!dedup.has(key)) dedup.set(key, c as ResultadoCatalogo)
  }
  const catItems = [...dedup.values()].slice(0, limit)

  // Filtrar catálogo: no mostrar si el código base (6 chars) ya está en stock
  const codigosEnStock = new Set(stockItems.map(s => (s.codigo||'').slice(0,9).toUpperCase()))
  const catSinDuplicados = catItems.filter(c => !codigosEnStock.has((c.codigo||'').slice(0,9).toUpperCase()))
  return [...stockItems, ...catSinDuplicados]
}
