// Saca de la descripción de una pieza (Malatesta / Gamma / Sekurit) los años de aplicación y el equipamiento.
// Los proveedores escriben el año de cuatro maneras distintas: '09/'14 · '24/ · (16-) · 99-2013 · 2015 · '15

export type RangoAnios = { desde: number; hasta: number | null }   // hasta null = "en adelante"

const yy = (s: string) => { const n = parseInt(s, 10); return s.length === 4 ? n : (n <= 45 ? 2000 + n : 1900 + n) }

export function extraerAnios(desc: string): RangoAnios | null {
  const s = (desc || '').replace(/`/g, "'")
  let m = s.match(/'?\b(\d{2}|\d{4})\s*\/\s*'?(\d{2}|\d{4})\b/)
  if (m && !/^\d\/\d$/.test(m[0])) return { desde: yy(m[1]), hasta: yy(m[2]) }
  m = s.match(/'(\d{2})\s*\/(?!\s*'?\d)/)                       // '24/   (en adelante)
  if (m) return { desde: yy(m[1]), hasta: null }
  m = s.match(/\(\s*(\d{2}|\d{4})\s*-\s*(\d{2}|\d{4})?\s*\)/)   // (16-)  (99-05)
  if (m) return { desde: yy(m[1]), hasta: m[2] ? yy(m[2]) : null }
  m = s.match(/\b(\d{2}|\d{4})\s*-\s*(\d{4})\b/)                // 99-2013
  if (m) return { desde: yy(m[1]), hasta: yy(m[2]) }
  m = s.match(/\s(\d{2})-(?=\s|$|\|)/)                           // 23-  (en adelante)
  if (m) return { desde: yy(m[1]), hasta: null }
  m = s.match(/\b((?:19|20)\d{2})\b/)
  if (m) return { desde: +m[1], hasta: +m[1] }
  m = s.match(/'(\d{2})\b/)
  if (m) return { desde: yy(m[1]), hasta: yy(m[1]) }
  return null
}

export function textoAnios(r: RangoAnios): string {
  return r.hasta == null ? `${r.desde} en adelante` : r.desde === r.hasta ? `${r.desde}` : `${r.desde}–${r.hasta}`
}

export function aplicaAnio(r: RangoAnios | null, anio: number): boolean | null {
  if (!r) return null                                         // sin dato de año
  return r.desde <= anio && (r.hasta == null || anio <= r.hasta)
}

const EQUIPO: [RegExp, string][] = [
  [/C\/\s*SEN|SENSOR/i, 'sensor'], [/C\/\s*CAP/i, 'captor'], [/C\/\s*CAM|C[ÁA]MARA/i, 'cámara'],
  [/ANTENA/i, 'antena'], [/\bTERM\b\.?|T[ÉE]RMIC/i, 'térmico'], [/SOLAR/i, 'solar'], [/AC[ÚU]ST/i, 'acústico'],
  [/\bHUD\b/i, 'HUD'], [/ENCAPS|ENCPAS/i, 'encapsulado'], [/C\/\s*AGUJ/i, 'c/agujero'],
]
export function extraerEquipo(desc: string): string[] {
  return EQUIPO.filter(([re]) => re.test(desc || '')).map(([, t]) => t)
}

// "clio 2015 parabrisas" → texto "clio parabrisas" + año 2015 (el año se usa para filtrar, no para buscar en el texto)
export function partirConsulta(q: string): { texto: string; anio: number | null } {
  const ws = q.trim().split(/\s+/).filter(Boolean)
  const esAnio = (w: string) => /^(19|20)\d{2}$/.test(w)
  const resto = ws.filter(w => !esAnio(w))
  if (!resto.length || resto.length === ws.length) return { texto: q.trim(), anio: null }
  return { texto: resto.join(' '), anio: +ws.find(esAnio)! }
}
