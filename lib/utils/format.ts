export function money(n: number | null | undefined, dolar?: number): string {
  if (n == null) return '—'
  if (dolar && dolar > 0) {
    return 'US$' + Math.round(n / dolar).toLocaleString('es-AR')
  }
  return '$' + Math.round(n).toLocaleString('es-AR')
}

export function moneyARS(n: number | null | undefined): string {
  if (n == null) return '—'
  return '$' + Math.round(n).toLocaleString('es-AR')
}

// Igual que moneyARS pero con 2 decimales — usar en Compras para que coincida centavo a centavo con la factura impresa del proveedor.
export function moneyARS2(n: number | null | undefined): string {
  if (n == null) return '—'
  return '$' + n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function cleanNum(s: string): number {
  return +s.replace(/[^0-9.]/g, '') || 0
}

export function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

export function fmtFecha(iso: string): string {
  const [y, m, d] = iso.split('-')
  const dias = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado']
  const day = new Date(+y, +m - 1, +d).getDay()
  const dia = dias[day]; return `${dia.charAt(0).toUpperCase() + dia.slice(1)} ${d}/${m}/${y}`
}

export const POS_LABEL: Record<string, string> = {
  PARABRISAS:  'Parabrisas',
  LUNETA:      'Luneta',
  PUERTA_DD:   'Puerta del. der.',
  PUERTA_DI:   'Puerta del. izq.',
  PUERTA_TD:   'Puerta tras. der.',
  PUERTA_TI:   'Puerta tras. izq.',
  CUSTODIA_D:  'Custodia der.',
  CUSTODIA_I:  'Custodia izq.',
  ALETA_D:     'Aleta der.',
  ALETA_I:     'Aleta izq.',
  VENTANA_D:   'Ventana der.',
  VENTANA_I:   'Ventana izq.',
  TECHO:       'Techo',
  OTRO:        'Otro',
}

export const PRESU_PRESETS = [
  'Mano de obra', 'Pegamento', 'Activador',
  'Primer / gel', 'Sensor', 'Calibración ADAS',
]

export const ASEGURADORAS = [
  'La Caja', 'Sancor Seguros', 'Federación Patronal',
  'Mapfre', 'Allianz', 'Zurich', 'San Cristóbal',
  'Mercantil Andina', 'Rivadavia', 'Provincia Seguros',
  'Río Uruguay', 'Sura', 'Particular (sin seguro)',
]
