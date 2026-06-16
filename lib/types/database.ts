export type UserRole = 'gerencial' | 'admin' | 'ventas' | 'caja'

export interface Perfil {
  id: string
  nombre: string | null
  rol: UserRole
  activo: boolean
  created_at: string
}

export interface Config {
  id: string
  nombre: string
  datos: string | null
  logo_url: string | null
}

export interface Cotizacion {
  id: string
  fecha: string
  blue: number | null
  oficial: number | null
  mep: number | null
  fuente: string
  created_at: string
}

export interface ListaPrecio {
  id: string
  nombre: string
  proveedor: string
  tipo: 'catalogo' | 'promo' | 'oferta'
  desc_pct: number
  flete_pct: number
  extra_pct: number
  pp_pct: number
  iva_pct: number
  vigencia_hasta: string | null
  notas: string | null
  activa: boolean
}

export interface StockItem {
  id: string
  descripcion: string
  codigo: string | null
  marca: string | null
  modelo: string | null
  pos: string | null
  anio: string | null
  cantidad: number
  precio_venta: number | null
  costo: number | null
  deposito: string
  activo: boolean
  created_at: string
  updated_at: string
}

export interface Turno {
  id: string
  fecha: string
  hora: string | null
  cliente: string | null
  telefono: string | null
  vehiculo: string | null
  patente: string | null
  trabajo: string | null
  precio_acordado: number | null
  notas: string | null
  estado: 'pendiente' | 'confirmado' | 'hecho' | 'ausente'
  user_id: string | null
  created_at: string
  updated_at: string
}

export interface VentaItem {
  d: string   // descripción
  c: number   // cantidad
  p: number   // precio unitario
}

export interface Venta {
  id: string
  fecha: string
  descripcion: string
  costo: number | null
  precio: number
  ganancia: number | null  // columna generada
  cliente: string | null
  comprobante: string | null
  pago: string | null
  origen: 'stock' | 'compra'
  pendiente: boolean
  stock_id: string | null
  turno_id: string | null
  user_id: string | null
  created_at: string
}

export interface Presupuesto {
  id: string
  fecha: string
  vencimiento: string
  cliente: string | null
  telefono: string | null
  vehiculo: string | null
  items: VentaItem[]
  neto: number
  iva_pct: number
  iva: number
  total: number
  dolar_blue: number | null
  dolar_mep: number | null
  user_id: string | null
  tipo_cliente_id: string | null
  tipo_cliente_nombre: string | null
  margen_aplicado: number | null
  created_at: string
}

export interface OrdenServicio {
  id: string
  numero: number | null
  fecha: string
  aseguradora: string | null
  siniestro: string | null
  poliza: string | null
  cliente: string | null
  telefono: string | null
  vehiculo: string | null
  patente: string | null
  items: VentaItem[]
  neto: number
  iva_pct: number
  iva: number
  total: number
  obs: string | null
  observaciones: string | null
  tiene_adas: boolean | null
  numero_adas: number | null
  user_id: string | null
  created_at: string
}

export interface Oferta {
  id: string
  proveedor: string
  rubro: string | null
  precio: string | null
  vigencia: string | null
  nota: string | null
  img_url: string | null
  activa: boolean
  created_at: string
}

export interface CertificadoAdas {
  id: string
  numero: string
  fecha: string
  cliente: string | null
  razon_social: string | null
  marca: string | null
  modelo: string | null
  anio: string | null
  dominio: string | null
  vin: string | null
  kilometraje: string | null
  sistemas: string[]
  otros_sistemas: string | null
  procedimientos: string[]
  equipo: string
  software: string
  protocolos: string
  observaciones: string | null
  turno_id: string | null
  orden_id: string | null
  user_id: string | null
  created_at: string
}
