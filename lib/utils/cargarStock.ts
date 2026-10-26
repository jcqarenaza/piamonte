// Carga TODO el stock activo en páginas de 1000 (Supabase corta cada consulta en 1000 filas).
// Antes se hacía con una sola consulta y, al superar las 1000 fichas, las últimas por orden
// alfabético (Taos, Tiguan, Toro, Virtus…) no aparecían en la pantalla de Stock (26/10/2026).
import type { SupabaseClient } from '@supabase/supabase-js'

export async function cargarStockActivo(supabase: SupabaseClient, extra?: (q: any) => any): Promise<any[]> {
  const PAGE = 1000
  const todo: any[] = []
  for (let desde = 0; ; desde += PAGE) {
    let q: any = supabase.from('stock').select('*').eq('activo', true).order('descripcion').order('id').range(desde, desde + PAGE - 1)
    if (extra) q = extra(q)
    const { data, error } = await q
    if (error || !data?.length) break
    todo.push(...data)
    if (data.length < PAGE) break
  }
  return todo
}
