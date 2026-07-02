import { SupabaseClient } from '@supabase/supabase-js'

// Palabras clave de posición — igual que en BuscarClient
const POS_KW: Record<string,string> = {
  'PARA':'PARABRISAS','PARABRISA':'PARABRISAS','PARABRISAS':'PARABRISAS',
  'LUNETA':'LUNETA','TECHO':'TECHO','PUERTA':'PUERTA',
  'CUSTODIA':'CUSTODIA','ALETA':'ALETA','ATI':'LUNETA',
}

export interface ResultadoBusqueda {
  id: string
  descripcion: string
  sku_interno?: string
  codigo_referencia?: string
  // Si viene del catálogo de precios
  proveedor?: string
  precio?: number
  pos?: string
  // Si viene de stock
  cantidad?: number
  precio_venta?: number
  costo?: number
  articulo_id?: string
  fuente: 'stock' | 'catalogo' | 'articulos_maestro'
}

/**
 * Búsqueda unificada — exactamente el mismo método que usa el módulo Buscar.
 * - Detecta palabras clave de posición (parabrisas, luneta, puerta, etc.)
 * - Usa `pos` de la tabla `catalogo` como filtro cuando corresponde
 * - Filtra palabras restantes en JS (AND multi-palabra)
 * - Busca en paralelo: stock + catálogo de precios + artículos_maestro
 */
export async function buscarUnificado(supabase: SupabaseClient, q: string, limit = 8): Promise<ResultadoBusqueda[]> {
  if (q.trim().length < 2) return []

  const words    = q.trim().toUpperCase().split(/\s+/).filter(Boolean)
  const posWord  = words.find(w => POS_KW[w])
  const nonPosWs = words.filter(w => !POS_KW[w])
  const mainWord = nonPosWs[0] || words[0]
  const restWords = nonPosWs.slice(1)

  const filtrarResto = (items: any[], campos: string[]) =>
    restWords.length === 0 ? items : items.filter(it => {
      const txt = campos.map(c => (it[c]||'')).join(' ').toUpperCase()
      return restWords.every(w => txt.includes(w))
    })

  // 1) Stock (piezas físicas disponibles)
  let stockQ = supabase.from('stock')
    .select('id,descripcion,cantidad,precio_venta,costo,articulo_id')
    .eq('activo', true).gt('cantidad', 0).limit(100)
  if (posWord && nonPosWs.length > 0) {
    stockQ = (stockQ as any).eq('pos', POS_KW[posWord]).ilike('descripcion', `%${mainWord}%`)
  } else if (posWord) {
    stockQ = (stockQ as any).eq('pos', POS_KW[posWord])
  } else {
    stockQ = (stockQ as any).or(`descripcion.ilike.%${mainWord}%,marca.ilike.%${mainWord}%,codigo.ilike.%${mainWord}%`)
  }

  // 2) Catálogo de precios (tabla catalogo, misma que usa Buscar)
  let catQ = supabase.from('catalogo')
    .select('id,descripcion,proveedor,precio,pos,marca,codigo').limit(100)
  if (posWord && nonPosWs.length > 0) {
    catQ = (catQ as any).eq('pos', POS_KW[posWord]).ilike('descripcion', `%${mainWord}%`)
  } else if (posWord) {
    catQ = (catQ as any).eq('pos', POS_KW[posWord])
  } else {
    catQ = (catQ as any).or(`descripcion.ilike.%${mainWord}%,marca.ilike.%${mainWord}%,codigo.ilike.%${mainWord}%`)
  }

  // 3) Artículos maestro (catálogo sin precio)
  let artQ = supabase.from('articulos_maestro')
    .select('id,descripcion,sku_interno,codigo_referencia').eq('activo', true).limit(100)
    .or(`descripcion.ilike.%${mainWord}%,sku_interno.ilike.%${mainWord}%,codigo_referencia.ilike.%${mainWord}%`)

  const [{ data: stockData }, { data: catData }, { data: artData }] = await Promise.all([stockQ, catQ, artQ])

  const stock = filtrarResto(stockData ?? [], ['descripcion','marca','codigo'])
    .slice(0, limit).map(s => ({ ...s, fuente: 'stock' as const }))

  const cat = filtrarResto(catData ?? [], ['descripcion','marca'])
    .slice(0, limit).map(c => ({ ...c, fuente: 'catalogo' as const }))

  const arts = filtrarResto(artData ?? [], ['descripcion','sku_interno','codigo_referencia'])
    .slice(0, limit).map(a => ({ ...a, fuente: 'articulos_maestro' as const }))

  return [...stock, ...cat, ...arts]
}
