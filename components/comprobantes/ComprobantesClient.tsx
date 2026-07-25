'use client'
import { LOGO_BASE64 } from '@/lib/logo'
import { FIRMA_SAPPA } from '@/lib/firma'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { buscarCatalogo } from '@/lib/utils/buscarCatalogo'
import { ChequeFields, EMPTY_CHEQUE, type ChequeData } from '@/components/cheques/ChequeFields'
import { createClient } from '@/lib/supabase/client'
import { Modal, Field, Input, Select, Empty } from '@/components/ui'
import { moneyARS2 as moneyARS, todayStr } from '@/lib/utils/format'

const IVA = 0.21
const IVA_NEGRO_OPTS = [
  { label: '75% del total declarado', pct: 75 },
  { label: '50% del total declarado', pct: 50 },
  { label: '25% del total declarado', pct: 25 },
  { label: 'Sin IVA declarado',       pct: 0  },
]
const btn      = { background:'#00A550',color:'#fff',border:'none',borderRadius:10,padding:'10px 20px',fontWeight:700,fontSize:14,cursor:'pointer' } as const
const btnSm    = { ...btn,padding:'6px 14px',fontSize:13 } as const
const btnGray  = { ...btnSm,background:'#6b7280' } as const
const btnRed   = { ...btnSm,background:'#ef4444' } as const
const btnBlue  = { ...btnSm,background:'#1d4ed8' } as const
const btnWa    = { ...btnSm,background:'#25d366' } as const

const METODOS = ['Efectivo','Transferencia','Débito','Crédito Visa','Crédito Master','Crédito Naranja','Crédito AMEX','Cheque','Cuenta corriente']
const CUOTAS  = [1,2,3,6,9,12,18,24]
const TIPO_FISCAL = [
  { id:'consumidor_final',      label:'Consumidor Final'     },
  { id:'monotributo',           label:'Monotributista'       },
  { id:'responsable_inscripto', label:'Responsable Inscripto'},
  { id:'exento',                label:'Exento de IVA'        },
]

type Modo = 'cf' | 'cliente' | 'aseguradora'
const PUEDE_CREAR_CLIENTE = (rol: string) => rol === 'admin' || rol === 'gerencial'

interface TipoCliente { id:string; nombre:string; margen_pct:number }
interface ClienteMin  { id:string; nombre:string; telefono:string|null; email:string|null; cuit:string|null; tipo_fiscal:string|null; tipo_cliente_id:string|null }
interface AseguradoraMin { id:string; nombre:string; razon_social:string|null; cuit:string|null; condicion_iva:string|null }

interface Pago { metodo:string; monto:string; cuotas?:number }
interface ItemVenta { d:string; c:number; p:number; costo?:number; stock_id?:string; articulo_id?:string|null }
interface RubroPrecio { id:string; nombre:string; precio_base:number; costo_base:number; visible_en_impresion:boolean }

interface Comprobante {
  id:string; numero:number|null; fecha:string; tipo:string
  cliente_nombre:string|null; cliente_telefono:string|null; cliente_cuit:string|null
  cliente_tipo_fiscal:string|null; tipo_cliente_nombre:string|null; vehiculo:string|null
  items:ItemVenta[]; neto:number; iva:number; total:number; pagos:Pago[]
  presupuesto_id:string|null; orden_id:string|null; created_at:string
  aseguradora_id?:string|null; aseguradora_nombre?:string|null; es_negro?:boolean
  patente?:string|null; siniestro?:string|null
  cae_emitido?:string|null; cae_vencimiento?:string|null
  categoria?:string; comprobante_original_id?:string|null; motivo_nc?:string|null
  nro_cbte_afip?:number|null
}

export default function ComprobantesClient({ userId, rol = 'ventas' }: { userId:string; rol?:string }) {
  const [comps, setComps]     = useState<Comprobante[]>([])
  const [open, setOpen]       = useState(false)
  const [tipos, setTipos]     = useState<TipoCliente[]>([])
  const supabase = createClient()
  const router   = useRouter()
  const searchParams = useSearchParams()

  const [modo, setModo] = useState<Modo>('cf')

  const [cliQ, setCliQ]         = useState('')
  const [cliSugs, setCliSugs]   = useState<ClienteMin[]>([])
  const [cliSel, setCli]        = useState<ClienteMin|null>(null)

  const [nuevoCliOpen, setNuevoCliOpen] = useState(false)
  const [nuevoCliForm, setNuevoCliForm] = useState({ nombre:'', telefono:'', cuit:'' })

  const [asegQ, setAsegQ]       = useState('')
  const [asegSugs, setAsegSugs] = useState<AseguradoraMin[]>([])
  const [asegSel, setAseg]      = useState<AseguradoraMin|null>(null)

  const [showFiscal, setShowFiscal] = useState(false)
  const [ivaNegroP, setIvaNegroP] = useState(75)

  const emptyFiscal = { tipo_fiscal:'consumidor_final', cuit:'', razon_social:'', tipo_cliente_id:'', vehiculo:'', patente:'' }
  const [fiscal, setFiscal]     = useState(emptyFiscal)
  const [clienteAseg, setClienteAseg] = useState('')
  const [siniestro, setSiniestro] = useState('')
  const [cfNombre, setCfNombre] = useState('')
  const [cfTel, setCfTel]       = useState('')
  const [cfDni, setCfDni]       = useState('')
  const [rubros, setRubros]           = useState<RubroPrecio[]>([])
  const [rubrosEdit, setRubrosEdit]   = useState<Record<string,number>>({})
  const [items, setItems]       = useState<ItemVenta[]>([])
  // Buscador unificado: primero busca en el catálogo maestro de artículos (con su costo de
  // reposición y SKU); si la pieza ya está en stock con cantidad disponible, también se ofrece
  // para descontar directamente. Mismo criterio que ya usan Stock y Compras.
  const [stockQ, setStockQ]     = useState('')
  const stockSearchRef = useRef<HTMLInputElement>(null)
  const [stockSugs, setStockSugs] = useState<any[]>([])
  const [precioEditStr, setPrecioEditStr] = useState<Record<number,string>>({})
  const [articuloSugs, setArticuloSugs] = useState<any[]>([])
  const [pagos, setPagos]       = useState<Pago[]>([{ metodo:'Efectivo', monto:'' }])
  // Un ChequeData por cada fila de pago (mismo índice). Solo se usa cuando metodo==='Cheque'.
  const [chequesPago, setChequesPago] = useState<Record<number,ChequeData>>({})
  const [toast, setToast]       = useState('')
  const [saving, setSaving]     = useState(false)
  const [adjModal, setAdjModal]   = useState<Comprobante|null>(null)
  const [adjuntos, setAdjuntos]   = useState<any[]>([])
  const [uploading, setUploading] = useState(false)
  const [genPDF, setGenPDF]       = useState(false)
  const [historialCli, setHistorialCli] = useState<{presupuestos:any[];ordenes:any[];remitos:any[]}|null>(null)
  const [osSelId, setOsSelId] = useState<string|null>(null)
  const [remitoSel, setRemitoSel] = useState<any|null>(null)
  const [remitoItemsSel, setRemitoItemsSel] = useState<Set<number>>(new Set())
  const [ventaPreviaOS, setVentaPreviaOS] = useState(false)
  const [oidParam, setOidParam] = useState<string|null>(null)
  const [tarjConfigs, setTarjConfigs]     = useState<any[]>([])
  const [pagoTarjConfig, setPagoTarjConfig] = useState('')
  const [obs, setObs]           = useState('')

  // Buscar en stock (piezas con unidades disponibles) y en el catálogo de artículos en paralelo —
  // se muestran agrupados, dejando claro cuál ya tiene unidades físicas y cuál es solo catálogo.
  const rubrosSugs = stockQ.trim().length >= 2
    ? rubros.filter(r => r.nombre.toLowerCase().includes(stockQ.trim().toLowerCase()))
    : []

  useEffect(()=>{
    if(stockQ.trim().length<2){setStockSugs([]);setArticuloSugs([]);return}
    buscarCatalogo(supabase, stockQ, { incluirStock: true, limit: 8 }).then(resultados=>{
      const conStock = resultados.filter(r=>r.stock_id)
      setStockSugs(conStock.slice(0,6))
      // Solo mostrar catálogo si el código no tiene equivalente en stock
      const codigosEnStock = new Set(conStock.map((r:any) => (r.codigo||'').slice(0,9).toUpperCase()))
      const sinDuplicado = resultados.filter(r => !r.stock_id && !codigosEnStock.has((r.codigo||'').slice(0,9).toUpperCase()))
      setArticuloSugs(sinDuplicado.slice(0,8))
    })
  },[stockQ,supabase])

  const esNegro = rol === 'caja'
  // ivaOn eliminado — el IVA se discrimina automaticamente segun tipo_fiscal del cliente
  // Exentos: Factura B sin IVA (precio neto = total)
  const esExento = fiscal.tipo_fiscal === 'exento'
  // Si el cliente es RI (Factura A), los precios ya incluyen IVA → neto = precio / 1.21
  // Si es CF/B/C/exento, el total es el precio tal cual
  const discriminaIva = !esNegro && !esExento && fiscal.tipo_fiscal === 'responsable_inscripto'
  const esCFoB = !esNegro && !esExento && !discriminaIva // B o C — IVA incluido en precio
  const subtotalItems = Math.round(items.reduce((a,it)=>a+it.c*it.p, 0) * 100) / 100
  // Para B/C: el precio ya incluye IVA, calculamos el neto descontando el IVA
  const neto = discriminaIva
    ? Math.round(subtotalItems / (1 + IVA) * 100) / 100
    : esCFoB
      ? Math.round(subtotalItems / (1 + IVA) * 100) / 100  // neto sin IVA para libro IVA
      : subtotalItems
  // IVA: discriminado en A (RI), calculado internamente en B/C para libro IVA, 0 en negro/exento
  const iva = esNegro
    ? (ivaNegroP > 0 ? Math.round((neto * ivaNegroP / 100) * IVA * 100) / 100 : 0)
    : esExento ? 0
    : Math.round(neto * IVA * 100) / 100  // tanto A como B/C llevan IVA calculado
  const total = esCFoB
    ? subtotalItems  // para B/C el total es el precio original (IVA incluido)
    : Math.round((neto + iva) * 100) / 100
  const totalPagado = pagos.reduce((a,p)=>a+(parseFloat(p.monto.replace(/[^0-9.]/g,''))||0), 0)
  const diferencia  = total - totalPagado

  useEffect(() => {
    supabase.from('comprobantes').select('*').eq('es_negro', esNegro).order('created_at',{ascending:false}).then(({data})=>setComps(data??[]))
    supabase.from('tarjetas_config').select('*').eq('activo',true).order('banco').order('red').order('cuotas').then(({data})=>setTarjConfigs(data??[]))
    supabase.from('tipos_cliente').select('*').order('nombre').then(({data})=>setTipos(data??[]))
    supabase.from('rubros_precio').select('*').eq('activo',true).order('orden').then(({data})=>setRubros(data??[]))
  },[supabase])

  useEffect(() => {
    const cli  = searchParams.get('cli')
    const tel  = searchParams.get('tel')
    const veh  = searchParams.get('veh')
    const pat  = searchParams.get('pat')
    const itm  = searchParams.get('items')
    const iva_ = searchParams.get('iva')
    const tipoId = searchParams.get('tipo_id')
    const asegNombre = searchParams.get('aseguradora')
    const sinNro = searchParams.get('siniestro')
    const piezaId = searchParams.get('pieza_id')
    const piezaDesc = searchParams.get('pieza_desc')
    const piezaPrecio = searchParams.get('pieza_precio')
    const oidUrl = searchParams.get('oid')
    if (oidUrl) {
      setOidParam(oidUrl); setOpen(true)
      // Verificar si esta OS ya tiene venta registrada en caja (sin comprobante = OS directa)
      supabase.from('ventas').select('id').is('comprobante_id', null)
        .eq('fecha', new Date().toISOString().slice(0,10))
        .then(({ data }) => {
          // Si hay ventas hoy sin comprobante, puede haber duplicado — marcamos aviso
          if (data && data.length > 0) setVentaPreviaOS(true)
        })
    }
    if (searchParams.get('nuevo') === '1') setOpen(true)
    if (asegNombre) {
      setModo('aseguradora')
      supabase.from('aseguradoras').select('id,nombre,razon_social,cuit,condicion_iva')
        .ilike('nombre', `%${asegNombre}%`).limit(1)
        .then(({data}) => { if (data?.[0]) selectAseguradora(data[0] as AseguradoraMin) })
      setFiscal(p=>({...p, vehiculo:veh||'', patente:pat||'' }))
      setClienteAseg(cli||'')
      setSiniestro(sinNro||'')
    } else if (cli || tel) {
      setModo('cliente')
      setFiscal(p=>({...p, vehiculo:veh||'', patente:pat||'', tipo_cliente_id:tipoId||'' }))
      if (tel) {
        supabase.from('clientes').select('id,nombre,telefono,email,cuit,tipo_fiscal,tipo_cliente_id')
          .eq('telefono', tel).maybeSingle()
          .then(async ({data}) => {
            if (data) await selectCliente(data as ClienteMin)  // ← selectCliente completo
            else if (cli) await buscarOPedirAltaCliente(cli, tel)
          })
      } else if (cli) {
        buscarOPedirAltaCliente(cli, tel)
      }
    }
    if (piezaId && piezaDesc && piezaPrecio) {
      setItems(prev => [...prev, { d: piezaDesc, c: 1, p: +piezaPrecio, articulo_id: piezaId }])
      setOpen(true)
    }
    if(itm){ try { setItems(JSON.parse(itm)) } catch {} }
    // ivaOn eliminado
    if(cli||tel||asegNombre) setOpen(true)
  },[searchParams])

  useEffect(()=>{
    if(cliQ.trim().length < 2){ setCliSugs([]); return }
    supabase.from('clientes').select('id,nombre,telefono,email,cuit,tipo_fiscal,tipo_cliente_id')
      .or(`nombre.ilike.%${cliQ}%,telefono.ilike.%${cliQ}%`).limit(6)
      .then(async ({data})=>{
        const lista = (data??[]) as ClienteMin[]
        // Auto-seleccionar si hay exactamente 1 resultado o coincidencia exacta de nombre
        const exacto = lista.find(c=>c.nombre.toLowerCase()===cliQ.trim().toLowerCase())
        if (exacto) { await selectCliente(exacto); setCliSugs([]); return }
        if (lista.length === 1) { await selectCliente(lista[0]); setCliSugs([]); return }
        setCliSugs(lista)
      })
  },[cliQ,supabase])

  useEffect(()=>{
    if(asegQ.trim().length < 2){ setAsegSugs([]); return }
    supabase.from('aseguradoras').select('id,nombre,razon_social,cuit,condicion_iva')
      .ilike('nombre', `%${asegQ}%`).limit(8)
      .then(async ({data})=>{
        const lista = (data??[]) as AseguradoraMin[]
        const exacto = lista.find(a=>a.nombre.toLowerCase()===asegQ.trim().toLowerCase())
        if (exacto) { selectAseguradora(exacto); setAsegSugs([]); return }
        if (lista.length === 1) { selectAseguradora(lista[0]); setAsegSugs([]); return }
        setAsegSugs(lista)
      })
  },[asegQ,supabase])

  // Al convertir un Presupuesto/OS, el nombre del cliente puede no estar cargado todavía como
  // cliente real (en Presupuestos es texto libre). Buscamos por nombre exacto/parecido; si no
  // hay match, abrimos directo "+ Nuevo cliente" con los datos ya completos para no trabar el flujo.
  async function buscarOPedirAltaCliente(nombre: string, telefono?: string|null) {
    setCliQ(nombre)
    // Buscar por nombre (ilike) o por teléfono limpio
    const telLimpio = (telefono||'').replace(/[^0-9]/g,'').slice(-8) // últimos 8 dígitos
    const { data } = await supabase.from('clientes')
      .select('id,nombre,telefono,email,cuit,tipo_fiscal,tipo_cliente_id')
      .ilike('nombre', `%${nombre}%`)
      .limit(5)
    // Preferir coincidencia exacta de nombre, luego por teléfono
    const exacto = (data??[]).find(c => c.nombre.toLowerCase() === nombre.toLowerCase())
    const porTel  = telLimpio ? (data??[]).find(c => (c.telefono||'').replace(/[^0-9]/g,'').endsWith(telLimpio)) : null
    const match   = exacto || porTel || (data??[])[0]
    if (match) {
      await selectCliente(match as ClienteMin)
    } else {
      setNuevoCliOpen(true)
      setNuevoCliForm(p => ({ ...p, nombre, telefono: telefono || p.telefono }))
    }
  }

  async function selectCliente(c:ClienteMin){
    setCli(c); setCliQ(c.nombre); setCliSugs([])
    setFiscal(p=>({...p, tipo_fiscal:c.tipo_fiscal||'consumidor_final', cuit:c.cuit||'', tipo_cliente_id:c.tipo_cliente_id||'' }))
    if(c.tipo_fiscal && c.tipo_fiscal !== 'consumidor_final') setShowFiscal(true)
    const { data: pres } = await supabase.from('presupuestos').select('id,fecha,total,items,vehiculo,tipo_cliente_nombre')
      .or(`cliente.ilike.%${c.nombre}%${c.telefono?`,telefono.eq.${c.telefono}`:''}`)
      .eq('convertido_os',false).eq('convertido_comp',false).order('created_at',{ascending:false}).limit(4)
    setHistorialCli({ presupuestos: pres??[], ordenes: [], remitos: [] })
  }

  async function selectAseguradora(a:AseguradoraMin){
    setAseg(a); setAsegQ(a.nombre); setAsegSugs([])
    setFiscal(p=>({...p, tipo_fiscal:'responsable_inscripto', cuit:a.cuit||'' }))
    setRemitoSel(null); setRemitoItemsSel(new Set())
    const { data: ords } = await supabase.from('ordenes_servicio').select('id,numero,fecha,total,items,vehiculo,aseguradora,patente,cliente,siniestro')
      .eq('aseguradora', a.nombre).eq('convertido_comp', false)
      .order('created_at',{ascending:false}).limit(8)
    // Traer remitos pendientes si la aseguradora tiene formato arca (Mercantil, Sancor)
    const { data: asegData } = await supabase.from('aseguradoras').select('formato_factura').eq('id', a.id).maybeSingle()
    let remitos: any[] = []
    if (asegData?.formato_factura === 'arca') {
      const { data: rems } = await supabase.from('remitos_salida')
        .select('*')
        .eq('aseguradora_id', a.id)
        .neq('estado', 'facturado')
        .order('created_at', {ascending:false})
        .limit(20)
      remitos = rems ?? []
    }
    setHistorialCli({ presupuestos: [], ordenes: ords??[], remitos })
  }

  function cambiarModo(m: Modo) {
    setModo(m)
    setCli(null); setCliQ(''); setCliSugs([])
    setAseg(null); setAsegQ(''); setAsegSugs([])
    setClienteAseg(""); setSiniestro(""); setCfNombre(""); setCfTel(""); setCfDni("")
    setHistorialCli(null)
    setNuevoCliOpen(false)
    if (m === 'cf') {
      setFiscal(p=>({...p, tipo_fiscal:'consumidor_final', cuit:'' }))
      setShowFiscal(false)
    }
  }

  async function guardarNuevoCliente() {
    if (!nuevoCliForm.nombre.trim()) return
    const { data, error } = await supabase.from('clientes').insert({
      nombre: nuevoCliForm.nombre, telefono: nuevoCliForm.telefono||null, cuit: nuevoCliForm.cuit||null,
      tipo_fiscal: 'consumidor_final',
    }).select('id,nombre,telefono,email,cuit,tipo_fiscal,tipo_cliente_id').single()
    if (error || !data) { setToast('No se pudo crear el cliente.'); setTimeout(()=>setToast(''),2500); return }
    await selectCliente(data as ClienteMin)
    setNuevoCliOpen(false)
    setNuevoCliForm({ nombre:'', telefono:'', cuit:'' })
  }

  function addPago(){ setPagos(p=>[...p,{metodo:'Efectivo',monto:''}]) }
  function updPago(i:number, k:keyof Pago, v:any){ setPagos(prev=>prev.map((p,j)=>j===i?{...p,[k]:v}:p)) }
  function delPago(i:number){ if(pagos.length>1) setPagos(prev=>prev.filter((_,j)=>j!==i)) }
  function distribuirTotal(){ setPagos(prev=>prev.map((p,i)=>i===0?{...p,monto:String(total)}:p)) }

  const tipoFiscalLabel = (tf:string|null) => TIPO_FISCAL.find(t=>t.id===tf)?.label || 'Consumidor Final'
  const tipoDoc = () => {
    if(!fiscal.tipo_fiscal||fiscal.tipo_fiscal==='consumidor_final'||fiscal.tipo_fiscal==='exento') return 'B'
    if(fiscal.tipo_fiscal==='responsable_inscripto') return 'A'
    return 'C'
  }

  const puedeGuardar = items.length>0 && (
    modo === 'cf' ||
    (modo === 'cliente' && !!cliSel?.id) ||
    (modo === 'aseguradora' && !!asegSel?.id)
  )
  const usaCC = pagos.some(p => p.metodo === 'Cuenta corriente')

  const TIPO_CBTE_AFIP: Record<string, number> = { A: 1, B: 6, C: 11 }
  const TIPO_CBTE_NC_AFIP: Record<string, number> = { A: 3, B: 8, C: 13 }
  const TIPO_CBTE_ND_AFIP: Record<string, number> = { A: 2, B: 7, C: 12 }

  // Nota de Débito
  const [ndComp, setNdComp]       = useState<Comprobante|null>(null)
  const [ndConcepto, setNdConcepto] = useState('')
  const [ndMonto, setNdMonto]     = useState('')
  const [ndIvaOn, setNdIvaOn]     = useState(true)
  const [ndLoading, setNdLoading] = useState(false)

  const CONCEPTOS_ND = [
    { label: 'Gastos por cheque rechazado', iva: true },
    { label: 'Cheque rechazado', iva: false },
    { label: 'Intereses por mora', iva: true },
    { label: 'Diferencia de precio', iva: true },
    { label: 'Corrección de Nota de Crédito', iva: true },
    { label: 'Gastos de gestión de cobro', iva: true },
    { label: 'Otro concepto', iva: true },
  ]

  const ndMontoNum = parseFloat((ndMonto||'0').replace(',','.')) || 0
  const ndNeto  = ndIvaOn ? Math.round(ndMontoNum / 1.21 * 100) / 100 : ndMontoNum
  const ndIva   = ndIvaOn ? Math.round((ndMontoNum - ndNeto) * 100) / 100 : 0
  const ndTotal = ndMontoNum

  async function confirmarND() {
    if (!ndComp || !ndConcepto || ndMontoNum <= 0) return
    setNdLoading(true)
    const { data: last } = await supabase.from('comprobantes').select('numero').eq('tipo', ndComp.tipo).eq('categoria','nd').order('numero',{ascending:false}).limit(1)
    const nextNum = (parseInt(String((last?.[0] as any)?.numero ?? '0'), 10) || 0) + 1

    const itemsNd: ItemVenta[] = [{ d: ndConcepto, c: 1, p: ndNeto }]
    const { data: nd } = await supabase.from('comprobantes').insert({
      numero: nextNum, fecha: todayStr(), tipo: ndComp.tipo, categoria: 'nd',
      cliente_id: (ndComp as any).cliente_id ?? null,
      cliente_nombre: ndComp.cliente_nombre, cliente_telefono: ndComp.cliente_telefono,
      cliente_cuit: ndComp.cliente_cuit, cliente_tipo_fiscal: ndComp.cliente_tipo_fiscal,
      aseguradora_id: (ndComp as any).aseguradora_id ?? null,
      aseguradora_nombre: ndComp.aseguradora_nombre,
      items: itemsNd, neto: ndNeto, iva: ndIva, total: ndTotal, pagos: [],
      comprobante_original_id: ndComp.id,
      es_negro: ndComp.es_negro || false,
    }).select('*').single()

    if (!nd) { setNdLoading(false); return }

    // Sumar a Caja del día
    await supabase.from('ventas').insert({
      fecha: todayStr(), descripcion: `ND ${nextNum} — ${ndConcepto} Comp. ${ndComp.numero}`,
      precio: ndTotal, costo: null, pendiente: false,
      comprobante_id: (nd as any).id, user_id: userId,
    })

    // Emitir CAE con tipo ND
    if (!ndComp.es_negro && ['A','B','C'].includes(ndComp.tipo)) {
      const { data: feOriginal } = await supabase.from('facturacion_electronica')
        .select('nro_cbte,tipo_cbte,punto_venta')
        .eq('comprobante_id', ndComp.id).eq('estado','emitida')
        .order('created_at',{ascending:false}).limit(1).maybeSingle()
      const cbteAsoc = feOriginal?.nro_cbte ? {
        tipo: (feOriginal as any).tipo_cbte, ptoVta: (feOriginal as any).punto_venta, nro: (feOriginal as any).nro_cbte
      } : undefined
      await solicitarCAE(nd as any, TIPO_CBTE_ND_AFIP[ndComp.tipo], cbteAsoc)
    }

    setNdComp(null); setNdConcepto(''); setNdMonto(''); setNdIvaOn(true)
    setNdLoading(false)
    const {data:comps2}=await supabase.from('comprobantes').select('*').eq('es_negro', esNegro).order('created_at',{ascending:false})
    setComps(comps2??[])
  }
  const [caeLoading, setCaeLoading] = useState<string|null>(null)

  // Nota de Crédito: devuelve stock, resta de Caja del día y emite con CAE propio en AFIP.
  const [ncComp, setNcComp]       = useState<Comprobante|null>(null)
  const [ncSel, setNcSel]         = useState<Record<number, {on:boolean; cant:number}>>({})
  const [ncMotivo, setNcMotivo]   = useState('')
  const [ncLoading, setNcLoading] = useState(false)

  function abrirNC(c: Comprobante) {
    setNcComp(c)
    const sel: Record<number, {on:boolean; cant:number}> = {}
    c.items.forEach((it, i) => { sel[i] = { on: true, cant: it.c } })
    setNcSel(sel)
    setNcMotivo('')
  }

  const ncItemsSel = ncComp ? ncComp.items
    .map((it, i) => ({ it, i, cant: ncSel[i]?.cant ?? it.c }))
    .filter((x) => ncSel[x.i]?.on && x.cant > 0) : []
  const ncNeto = ncItemsSel.reduce((a, x) => {
    // Para FA (discrimina IVA): el precio ya incluye IVA → neto = p/1.21
    // Para FB/NC sin IVA: el precio es el total directamente
    const tasaNc = ncComp && ncComp.neto > 0 ? ncComp.neto / ncComp.total : (1/1.21)
    return a + Math.round(x.it.p * x.cant * tasaNc * 100) / 100
  }, 0)
  const ncIvaRate = ncComp && ncComp.neto > 0 ? ncComp.iva / ncComp.neto : 0
  const ncIva = Math.round(ncNeto * ncIvaRate * 100) / 100
  const ncTotal = Math.round((ncNeto + ncIva) * 100) / 100

  async function confirmarNC() {
    if (!ncComp || ncItemsSel.length === 0) return
    setNcLoading(true)
    const { data: last } = await supabase.from('comprobantes').select('numero').eq('tipo', ncComp.tipo).eq('categoria','nc').order('numero',{ascending:false}).limit(1)
    const nextNum = (parseInt(String((last?.[0] as any)?.numero ?? '0'), 10) || 0) + 1

    const itemsNc: ItemVenta[] = ncItemsSel.map(x => ({ ...x.it, c: x.cant }))
    const { data: nc } = await supabase.from('comprobantes').insert({
      numero: nextNum, fecha: todayStr(), tipo: ncComp.tipo, categoria: 'nc',
      cliente_id: (ncComp as any).cliente_id ?? null, cliente_nombre: ncComp.cliente_nombre,
      cliente_telefono: ncComp.cliente_telefono, cliente_cuit: ncComp.cliente_cuit,
      cliente_tipo_fiscal: ncComp.cliente_tipo_fiscal, vehiculo: ncComp.vehiculo,
      aseguradora_id: (ncComp as any).aseguradora_id ?? null,
      aseguradora_nombre: ncComp.aseguradora_nombre ?? null,
      items: itemsNc, neto: ncNeto, iva: ncIva, total: ncTotal, pagos: [],
      comprobante_original_id: ncComp.id, motivo_nc: ncMotivo || null,
      es_negro: ncComp.es_negro || false,
    }).select('*').single()

    if (!nc) { setNcLoading(false); return }

    // Devolver stock de los ítems que sí tenían unidad física vinculada
    for (const x of ncItemsSel) {
      if (x.it.stock_id && x.cant > 0) {
        const { data: s } = await supabase.from('stock').select('cantidad').eq('id', x.it.stock_id).single()
        if (s) {
          const cantAnterior = (s as any).cantidad
          // PRIMERO insertar movimiento — así el trigger no duplica
          await supabase.from('stock_movimientos').insert({
            stock_id: x.it.stock_id,
            tipo: 'entrada',
            cantidad: x.cant,
            costo_unitario: x.it.costo ?? null,
            fecha: todayStr(),
            descripcion: `NC-${String(nextNum).padStart(8,'0')} · ${ncComp.cliente_nombre}${ncComp.aseguradora_nombre ? ' · ' + ncComp.aseguradora_nombre : ''} — devolución`,
            comprobante_venta_id: (nc as any).id,
            user_id: userId,
          })
          // DESPUÉS actualizar cantidad
          await supabase.from('stock').update({ cantidad: cantAnterior + x.cant }).eq('id', x.it.stock_id)
        }
      }
    }

    // Restar de Caja del día (entrada negativa, neta contra el "Facturado" del día de la NC)
    await supabase.from('ventas').insert({
      fecha: todayStr(), descripcion: `NC ${nextNum} — devolución Comprobante ${ncComp.numero}`,
      precio: -ncTotal, costo: null, pendiente: false,
      comprobante_id: (nc as any).id, user_id: userId,
    })

    // Saldar CC: la NC acredita (haber) el total en la cuenta del cliente o aseguradora
    const ncDesc = `NC-0006-${String(nextNum).padStart(8,'0')} — devolución FA-0006-${String(ncComp.nro_cbte_afip ?? ncComp.numero ?? 0).padStart(8,'0')}`
    if ((ncComp as any).aseguradora_id) {
      await supabase.from('cuenta_corriente_aseguradoras').insert({
        aseguradora_id: (ncComp as any).aseguradora_id,
        fecha: todayStr(), tipo: 'nc',
        descripcion: ncDesc,
        debe: 0, haber: ncTotal,
        comprobante_id: (nc as any).id, user_id: userId,
      })
    } else if ((ncComp as any).cliente_id) {
      await supabase.from('cuenta_corriente').insert({
        cliente_id: (ncComp as any).cliente_id,
        cliente_nombre: ncComp.cliente_nombre,
        fecha: todayStr(), tipo: 'nc',
        descripcion: ncDesc,
        debe: 0, haber: ncTotal,
        comprobante_id: (nc as any).id, user_id: userId,
      })
    }

    // Si la factura original vino de una OS, liberarla para poder refacturar
    if (ncComp.orden_id) {
      await supabase.from('ordenes_servicio').update({ convertido_comp: false }).eq('id', ncComp.orden_id)
    }

    // Emitir con CAE propio en AFIP si el original era fiscal — necesita el comprobante asociado
    // (tipo/PtoVta/Nro de la factura original, exigido por AFIP para toda NC).
    if (!ncComp.es_negro && ['A','B','C'].includes(ncComp.tipo)) {
      const { data: feOriginal } = await supabase.from('facturacion_electronica')
        .select('nro_cbte,tipo_cbte,punto_venta')
        .eq('comprobante_id', ncComp.id).eq('estado','emitida')
        .order('created_at',{ascending:false}).limit(1).maybeSingle()
      const cbteAsoc = feOriginal?.nro_cbte ? {
        tipo: (feOriginal as any).tipo_cbte, ptoVta: (feOriginal as any).punto_venta, nro: (feOriginal as any).nro_cbte
      } : undefined
      await solicitarCAE(nc as any, TIPO_CBTE_NC_AFIP[ncComp.tipo], cbteAsoc)
    }

    setNcComp(null)
    setNcLoading(false)
    const {data:comps2}=await supabase.from('comprobantes').select('*').eq('es_negro', esNegro).order('created_at',{ascending:false})
    setComps(comps2??[])
  }

  async function reintentarCAE(c: Comprobante) {
    if (c.categoria === 'nc' && c.comprobante_original_id) {
      const { data: feOriginal } = await supabase.from('facturacion_electronica')
        .select('nro_cbte,tipo_cbte,punto_venta')
        .eq('comprobante_id', c.comprobante_original_id).eq('estado','emitida')
        .order('created_at',{ascending:false}).limit(1).maybeSingle()
      const cbteAsoc = feOriginal?.nro_cbte ? {
        tipo: (feOriginal as any).tipo_cbte, ptoVta: (feOriginal as any).punto_venta, nro: (feOriginal as any).nro_cbte
      } : undefined
      await solicitarCAE(c, TIPO_CBTE_NC_AFIP[c.tipo], cbteAsoc)
    } else {
      await solicitarCAE(c)
    }
  }

  async function solicitarCAE(c: Comprobante, tipoCbteOverride?: number, cbteAsoc?: {tipo:number; ptoVta:number; nro:number}) {
    setCaeLoading(c.id)
    try {
      const tipoCbte = tipoCbteOverride ?? TIPO_CBTE_AFIP[c.tipo]
      if (!tipoCbte) { setCaeLoading(null); return }

      // Para facturas a aseguradora, el CUIT receptor es el de la aseguradora (no el del asegurado)
      let cuitReceptor = (c.cliente_cuit||'').replace(/[^0-9]/g,'')
      if (!cuitReceptor && c.aseguradora_id) {
        const { data: aseg } = await supabase.from('aseguradoras').select('cuit').eq('id', c.aseguradora_id).maybeSingle()
        cuitReceptor = (aseg?.cuit||'').replace(/[^0-9]/g,'')
      }

      const docTipo = cuitReceptor.length === 11 ? 80 : 99
      const docNro  = cuitReceptor.length === 11 ? cuitReceptor : '0'

      // AFIP requiere CUIT (docTipo=80) para Factura A (tipo 1) — validamos antes de llamar
      if ([1,51].includes(tipoCbte) && cuitReceptor.length !== 11) {
        setToast('⚠ Para emitir Factura A necesitás cargar el CUIT del cliente o la aseguradora (11 dígitos)')
        setTimeout(()=>setToast(''), 5000)
        setCaeLoading(null); return
      }
      const { data, error } = await supabase.functions.invoke('arca-facturar', {
        body: {
          comprobante_id: c.id, tipoCbte,
          // Factura B a CF: el total incluye IVA pero no está discriminado
          // AFIP requiere neto + iva por separado igualmente
          impTotal: c.total,
          impNeto: c.iva > 0 ? c.neto : Math.round(c.total / 1.21 * 100) / 100,
          impIva:  c.iva > 0 ? c.iva  : Math.round((c.total - c.total / 1.21) * 100) / 100,
          docTipo, docNro,
          ivaAlicuota: 5, // siempre mandar alícuota 21% cuando hay neto > 0
          cbteAsoc,
        }
      })
      if (!error && data?.ok) {
        await supabase.from('comprobantes').update({
          cae_emitido: data.cae, cae_vencimiento: data.cae_vencimiento || null,
          nro_cbte_afip: data.nro_cbte || null,
        }).eq('id', c.id)
        // Insertar o actualizar CC aseguradoras con el nro AFIP real
        if (data.nro_cbte && c.aseguradora_id) {
          const nroAfipFmt = String(data.nro_cbte).padStart(8,'0')
          const prefCC = c.categoria==='nc' ? 'NC' : c.tipo==='A' ? 'FA' : c.tipo==='B' ? 'FB' : 'FC'
          const desc = `${prefCC}-0006-${nroAfipFmt} — ${c.aseguradora_nombre||''}`
          // Si hay pendiente de insertar (factura nueva), insertar; si ya existe, actualizar descripción
          const { count } = await supabase.from('cuenta_corriente_aseguradoras')
            .select('id', { count:'exact', head:true }).eq('comprobante_id', c.id)
          if ((count||0) === 0 && (c as any)._ccAsegPendiente) {
            await supabase.from('cuenta_corriente_aseguradoras').insert({
              aseguradora_id: c.aseguradora_id, fecha: todayStr(),
              tipo: 'factura', descripcion: desc,
              debe: (c as any)._ccAsegPendiente.monto, haber: 0,
              comprobante_id: c.id, user_id: userId,
            })
          } else {
            await supabase.from('cuenta_corriente_aseguradoras')
              .update({ descripcion: desc }).eq('comprobante_id', c.id)
          }
        }
        // Actualizar descripción en CC clientes con el nro AFIP real
        if (data.nro_cbte && !c.aseguradora_id && (c as any).cliente_id) {
          const nroAfipFmt = String(data.nro_cbte).padStart(8,'0')
          const prefCC = c.tipo==='A' ? 'FA' : c.tipo==='B' ? 'FB' : 'FC'
          await supabase.from('cuenta_corriente')
            .update({ descripcion: `${prefCC}-0006-${nroAfipFmt}` })
            .eq('comprobante_id', c.id)
        }
        // Actualizar el número de comprobante en ventas con el nro AFIP real
        if (data.nro_cbte) {
          const nroAfipFmt = `${c.tipo||'A'}-0006-${String(data.nro_cbte).padStart(8,'0')}`
          await supabase.from('ventas').update({ comprobante: nroAfipFmt }).eq('comprobante_id', c.id)
        }
        setToast(`✓ CAE obtenido: ${data.cae} (N° AFIP ${String(data.nro_cbte).padStart(8,'0')})`)
      } else {
        setToast(`⚠ Comprobante guardado, pero sin CAE (AFIP): ${data?.error || error?.message || 'error desconocido'}`)
      }
    } catch (e: any) {
      setToast(`⚠ Comprobante guardado, pero sin CAE (AFIP): ${e?.message || 'error de conexión'}`)
    }
    setTimeout(()=>setToast(''), 5000)
    setCaeLoading(null)
    const {data:comps2}=await supabase.from('comprobantes').select('*').eq('es_negro', esNegro).order('created_at',{ascending:false})
    setComps(comps2??[])
  }

  async function save(){
    if (saving) return
    setSaving(true)
    if(!puedeGuardar) { setSaving(false); return }
    if (modo==='aseguradora' && !asegSel?.id) {
      alert('Seleccioná la aseguradora del listado de sugerencias')
      return
    }
    const usaCC = pagos.some(p => p.metodo === 'Cuenta corriente')
    if (usaCC && modo === 'cf') {
      alert('No se puede facturar en Cuenta Corriente a Consumidor Final. Cambiá a "Cliente" y seleccionalo del listado.')
      return
    }
    // CC sin cliente seleccionado: si hay nombre + CUIT, crear el cliente automáticamente
    let cliEfectivo = cliSel
    if (usaCC && modo === 'cliente' && !cliSel?.id) {
      const nombreCC = cliQ.trim()
      const cuitCC = fiscal.cuit.trim()
      if (!nombreCC || !cuitCC) {
        alert('Para facturar en Cuenta Corriente completá el nombre y CUIT del cliente.')
        return
      }
      const { data: nuevoCliente } = await supabase.from('clientes').insert({
        nombre: nombreCC,
        cuit: cuitCC,
        tipo_fiscal: fiscal.tipo_fiscal || 'responsable_inscripto',
        tiene_cuenta_corriente: true,
      }).select('id,nombre,telefono,email,cuit,tipo_fiscal,tipo_cliente_id').single()
      if (nuevoCliente) { setCli(nuevoCliente); cliEfectivo = nuevoCliente }
    }
    const { data:last } = await supabase.from('comprobantes').select('numero').eq('tipo', tipoDoc()).eq('categoria','factura').order('numero',{ascending:false}).limit(1)
    const nextNum = (parseInt(String((last?.[0] as any)?.numero ?? '0'), 10) || 0) + 1
    const pid = searchParams.get('pid'), oid = searchParams.get('oid')
    const tipoC = tipos.find(t=>t.id===fiscal.tipo_cliente_id)

    const { data:comp, error:compError } = await supabase.from('comprobantes').insert({
      numero:nextNum, fecha:todayStr(), tipo:tipoDoc(),
      cliente_id: modo==='cliente' ? (cliEfectivo?.id||null) : null,
      cliente_nombre: modo==='cliente' ? (cliEfectivo?.nombre||cliQ||null) : (modo==='aseguradora' ? (clienteAseg||null) : (modo==='cf' ? (cfNombre||'Consumidor Final') : null)),
      cliente_telefono: modo==='cliente' ? (cliEfectivo?.telefono||null) : (modo==='cf' && cfTel ? cfTel : null),
      cliente_cuit: modo==='cliente' ? (fiscal.cuit||null) : (modo==='cf' && cfDni ? cfDni : null),
      cliente_tipo_fiscal: fiscal.tipo_fiscal||'consumidor_final',
      tipo_cliente_id: fiscal.tipo_cliente_id||null,
      tipo_cliente_nombre: tipoC?.nombre||null,
      aseguradora_id: modo==='aseguradora' ? (asegSel?.id||null) : null,
      aseguradora_nombre: modo==='aseguradora' ? (asegSel?.nombre||null) : null,
      vehiculo: fiscal.vehiculo||null,
      patente: fiscal.patente||null,
      siniestro: modo==='aseguradora' ? (siniestro||null) : null,
      presupuesto_id: pid||null,
      orden_id: oid||osSelId||null,
      items, neto, iva_pct:IVA, iva, total,
      es_negro: esNegro,
      iva_negro_pct: esNegro ? ivaNegroP : null,
      pagos: modo==='aseguradora' && !pagos.some(p=>p.monto) ? [{metodo:'Cuenta corriente',monto:String(total)}] : pagos.filter(p=>p.monto),
      observaciones: obs||null,
      user_id: userId,
    }).select().single()

    if (compError || !comp) {
      alert(`Error al guardar el comprobante: ${compError?.message || 'Sin respuesta del servidor'}`)
      console.error('Error comprobante:', compError)
      return
    }

    const pagosCCMonto = pagos.filter(p=>p.metodo==='Cuenta corriente').reduce((a,p)=>a+(parseFloat(p.monto.replace(/[^0-9.]/g,''))||0),0)
    const montoCC = modo==='aseguradora' && asegSel?.id ? (pagosCCMonto || total) : pagosCCMonto
    if (montoCC > 0 && comp) {
      if (modo==='cliente' && cliEfectivo?.id) {
        await supabase.from('cuenta_corriente').insert({
          cliente_id: cliEfectivo.id, cliente_nombre: cliEfectivo.nombre, fecha: todayStr(),
          tipo: 'cargo', descripcion: `Comprobante ${nextNum}`,
          debe: montoCC, haber: 0, comprobante_id: (comp as any).id, user_id: userId,
        })
      } else if (modo==='aseguradora' && asegSel?.id) {
        // CC aseguradoras se inserta post-CAE para usar el nro_cbte_afip real
        // Guardamos los datos en el comprobante para usarlos después
        ;(comp as any)._ccAsegPendiente = { aseguradoraId: asegSel.id, monto: montoCC }
      }
    }

    // Cheques: si algún pago fue con cheque, registrarlo en el libro como cheque de tercero "en cartera"
    if (comp) {
      const numeroFmt = `${tipoDoc()}-${String(nextNum).padStart(8,'0')}`
      const nombreContraparte = modo==='aseguradora' ? asegSel?.nombre : (modo==='cliente' ? (cliSel?.nombre||cliQ||null) : 'Consumidor Final')
      for (let i=0; i<pagos.length; i++) {
        const p = pagos[i]
        const ch = chequesPago[i]
        if (p.metodo==='Cheque' && ch?.numero) {
          const montoCh = parseFloat(p.monto.replace(/[^0-9.]/g,'')||'0')
          await supabase.from('cheques').insert({
            tipo:'tercero', formato:ch.formato, modalidad:ch.modalidad,
            numero:ch.numero, banco:ch.banco,
            fecha_emision: todayStr(), fecha_cobro: ch.modalidad==='al_dia'?todayStr():ch.fecha_cobro,
            monto: montoCh, contraparte: nombreContraparte, estado:'en_cartera',
            notas: `Cobro ${nombreContraparte} — Comprobante ${nextNum}`,
            comprobante_id: (comp as any).id,
          })
        }
      }
    }

    const compId   = (comp as any)?.id
    const fechaComp = todayStr()

    // Descontar stock solo en ventas directas — si viene de una OS la OS ya lo descontó al crearse
    if (!oid) {
      for(const it of items){
        if(it.stock_id && it.c > 0){
          const {data:s} = await supabase.from('stock').select('cantidad,costo').eq('id',it.stock_id).single()
          if(s) {
            const notaMov = [
              comp ? `FC-0006-${String((comp as any).nro_cbte_afip || (comp as any).numero || '').padStart(8,'0')}` : null,
              asegSel?.nombre || cliSel?.nombre || null,
            ].filter(Boolean).join(' · ') || it.d
            // PRIMERO insertar movimiento — así el trigger no duplica
            await supabase.from('stock_movimientos').insert({
              stock_id: it.stock_id, tipo: 'salida',
              cantidad: it.c,
              costo_unitario: (s as any).costo || null,
              precio_venta_unitario: it.p,
              fecha: fechaComp,
              descripcion: notaMov,
              comprobante_venta_id: compId,
            })
            // DESPUÉS actualizar cantidad
            await supabase.from('stock').update({cantidad:Math.max(0,(s as any).cantidad-it.c)}).eq('id',it.stock_id)
          }
        }
      }
    }

    if (pid) await supabase.from('presupuestos').update({ convertido_comp: true }).eq('id', pid)
    if (oid) await supabase.from('ordenes_servicio').update({ convertido_comp: true, estado: 'realizado' }).eq('id', oid)
    if (osSelId && !oid) await supabase.from('ordenes_servicio').update({ convertido_comp: true, estado: 'realizado' }).eq('id', osSelId)

    // Actualizar remito si viene de uno
    if (remitoSel && comp) {
      const itemsFacturadosAntes: number[] = remitoSel.items_facturados ?? []
      const itemsFacturadosNuevos = [...new Set([...itemsFacturadosAntes, ...Array.from(remitoItemsSel)])]
      const todosFacturados = itemsFacturadosNuevos.length >= (remitoSel.items?.length ?? 0)
      await supabase.from('remitos_salida').update({
        items_facturados: itemsFacturadosNuevos,
        estado: todosFacturados ? 'facturado' : 'parcialmente_facturado',
        comprobante_id: todosFacturados ? (comp as any).id : remitoSel.comprobante_id,
      }).eq('id', remitoSel.id)
    }

    // Si venía de una OS, buscar y eliminar la venta de caja previa para evitar duplicar
    const osId = oid || osSelId
    if (osId && comp) {
      // Buscar ventas de caja registradas desde esa OS (sin comprobante_id = son de OS directa)
      const { data: ventasOS } = await supabase.from('ventas')
        .select('id, descripcion, precio')
        .is('comprobante_id', null)
        .eq('fecha', todayStr())
        .ilike('descripcion', `%${items[0]?.d?.slice(0,15) || ''}%`)
      // También buscar por stock_id de los ítems
      const stockCodigos = items.map((it:any) => it.codigo).filter(Boolean)
      const { data: ventasPorCodigo } = stockCodigos.length ? await supabase.from('ventas')
        .select('id, descripcion, precio')
        .is('comprobante_id', null)
        .or(stockCodigos.map((c:string) => `descripcion.ilike.%${c}%`).join(','))
        : { data: [] }

      const ventasABorrar = [...(ventasOS || []), ...(ventasPorCodigo || [])]
        .filter((v, i, arr) => arr.findIndex(x => x.id === v.id) === i) // deduplicar
        .filter(v => !v.descripcion?.includes('FA-') && !v.descripcion?.includes('FB-') && !v.descripcion?.includes('NC '))

      if (ventasABorrar.length > 0) {
        await supabase.from('ventas').delete().in('id', ventasABorrar.map(v => v.id))
      }
    }

    if(comp) {
      const nombreVenta = modo==='aseguradora' ? asegSel?.nombre : (modo==='cliente' ? cliSel?.nombre : 'Consumidor Final')
      const letraDoc = tipoDoc()
      const prefijo = esNegro ? 'Venta' : `F${letraDoc}`
      const nroFormateado = `${prefijo}-0006-${String(nextNum).padStart(8,'0')}`
      // Determinar método de pago principal para caja
      const pagosCCTotal = pagos.filter(p=>p.metodo==='Cuenta corriente').reduce((a,p)=>a+(parseFloat(p.monto.replace(/[^0-9.]/g,''))||0),0)
      const pagoPrincipal = pagosCCTotal >= total*0.9 ? 'Cuenta corriente'
        : pagos.find(p=>p.metodo!=='Cuenta corriente')?.metodo || pagos[0]?.metodo || 'Efectivo'
      const clienteVenta = modo==='aseguradora' ? (asegSel?.nombre||clienteAseg||null)
        : modo==='cliente' ? (cliEfectivo?.nombre||cliQ||null)
        : (cfNombre||null)
      await supabase.from('ventas').insert({
        fecha:todayStr(), descripcion:`${nroFormateado} - ${nombreVenta||'CF'}`,
        precio:total, costo:null, pendiente:true,
        comprobante_id:(comp as any).id,
        tipo_cliente_id:fiscal.tipo_cliente_id||null,
        tipo_cliente_nombre:tipoC?.nombre||null,
        pago: pagoPrincipal,
        cliente: clienteVenta,
        origen: 'compra',
        user_id:userId,
      })
    }

    // Facturación electrónica AFIP/ARCA — solo para A/B/C reales (nunca para ventas "negro",
    // que son intencionalmente extra-contables). Si falla, la venta ya quedó guardada igual;
    // se puede reintentar después desde el listado ("⚠ Sin CAE" → Reintentar).
    if (comp && !esNegro && ['A','B','C'].includes(tipoDoc())) {
      await solicitarCAE(comp as any)
    }

    setOpen(false)
    setItems([]); setPagos([{metodo:'Efectivo',monto:''}]); setChequesPago({})
    cambiarModo('cf')
    setFiscal(emptyFiscal); setObs('')
    setClienteAseg(''); setSiniestro(''); setOsSelId(null); setRemitoSel(null); setRemitoItemsSel(new Set())
    setCfNombre(''); setCfTel(''); setCfDni('')
    const volverAOS = oidParam
    setOidParam(null)
    if (volverAOS) { router.push('/ordenes'); return }
    router.push('/comprobantes')
    const {data}=await supabase.from('comprobantes').select('*').eq('es_negro', esNegro).order('created_at',{ascending:false})
    setComps(data??[])
    setSaving(false)
  }

  async function abrirAdjuntos(c: Comprobante) {
    setAdjModal(c)
    const [adjComp, adjOS] = await Promise.all([
      supabase.from('comprobante_adjuntos').select('*').eq('comprobante_id', c.id).order('orden'),
      c.orden_id
        ? supabase.from('comprobante_adjuntos').select('*').eq('os_id', c.orden_id).order('orden')
        : Promise.resolve({ data: [] })
    ])
    const osAdj = (adjOS.data ?? []).map((a:any) => ({...a, _de_os: true}))
    setAdjuntos([...(adjComp.data ?? []), ...osAdj])
  }

  async function subirArchivo(file: File, tipo: string) {
    if (!adjModal) return
    setUploading(true)
    try {
      const ext = file.name.split('.').pop()
      const path = `${adjModal.id}/${Date.now()}.${ext}`
      const { error } = await supabase.storage.from('comprobante-adjuntos').upload(path, file)
      if (error) throw error
      const { data: urlData } = supabase.storage.from('comprobante-adjuntos').getPublicUrl(path)
      await supabase.from('comprobante_adjuntos').insert({
        comprobante_id: adjModal.id, tipo, nombre: file.name,
        url: urlData.publicUrl, storage_path: path,
        orden: adjuntos.length
      })
      const { data } = await supabase.from('comprobante_adjuntos').select('*').eq('comprobante_id', adjModal.id).order('orden')
      setAdjuntos(data ?? [])
    } catch(e) { console.error(e) }
    setUploading(false)
  }

  async function eliminarAdjunto(id: string, path: string) {
    await supabase.storage.from('comprobante-adjuntos').remove([path])
    await supabase.from('comprobante_adjuntos').delete().eq('id', id)
    setAdjuntos(prev=>prev.filter(a=>a.id!==id))
  }

  async function generarPDFCombinado() {
    if (!adjModal) return
    setGenPDF(true)
    try {
      const { jsPDF } = await import('jspdf')
      const doc = new jsPDF({ format:'a4', unit:'mm' })
      doc.setFontSize(16); doc.setFont('helvetica','bold')
      doc.text(`${adjModal.tipo?.toUpperCase() || 'COMPROBANTE'} N° ${adjModal.numero||''}`, 15, 20)
      doc.setFontSize(11); doc.setFont('helvetica','normal')
      doc.text(`Cliente: ${adjModal.cliente_nombre || adjModal.aseguradora_nombre || '—'}`, 15, 32)
      doc.text(`Fecha: ${adjModal.fecha}`, 15, 40)
      doc.text(`Vehículo: ${(adjModal as any).vehiculo || '—'}`, 15, 48)
      doc.text(`Total: ${moneyARS(adjModal.total)}`, 15, 56)

      for (const adj of adjuntos) {
        doc.addPage()
        doc.setFontSize(12); doc.setFont('helvetica','bold')
        doc.text(adj.tipo === 'os_firmada' ? 'Orden de Servicio firmada' : `Foto — ${adj.nombre}`, 15, 15)
        try {
          const resp = await fetch(adj.url)
          const blob = await resp.blob()
          const reader = new FileReader()
          const b64: string = await new Promise(res=>{ reader.onload=()=>res(reader.result as string); reader.readAsDataURL(blob) })
          const ext = adj.nombre?.split('.').pop()?.toUpperCase() || 'JPEG'
          const fmt = ext === 'PNG' ? 'PNG' : 'JPEG'
          doc.addImage(b64, fmt, 10, 20, 190, 240, undefined, 'MEDIUM')
        } catch(e) {
          doc.text('(No se pudo cargar la imagen)', 15, 30)
        }
      }

      const nombre = `expediente-${adjModal.numero||adjModal.id.slice(0,8)}.pdf`
      doc.save(nombre)
    } catch(e) { console.error(e) }
    setGenPDF(false)
  }

  async function generarPDF(c:Comprobante): Promise<Blob> {
    const { jsPDF } = await import('jspdf')
    const doc = new jsPDF({format:'a4',unit:'mm'})
    const W=210, pad=14, rw=W-pad*2
    let y=12

    // Helper para rectángulos con esquinas redondeadas
    const rRect = (x:number,yy:number,w:number,h:number,r:number,style:'F'|'S'|'FD') => {
      doc.roundedRect(x,yy,w,h,r,r,style)
    }

    // ─── HEADER ───
    try { doc.addImage(LOGO_BASE64,'PNG',pad,y-2,28,15) } catch(e){}
    doc.setTextColor(30,30,30); doc.setFont('helvetica','bold'); doc.setFontSize(10)
    doc.text('PARABRISAS EL PIAMONTE', pad+32, y+2)
    doc.setFont('helvetica','normal'); doc.setTextColor(100,100,100); doc.setFontSize(7)
    doc.text('Calle 102 N.366 - General Pico, La Pampa', pad+32, y+7)
    doc.text('Tel: 02302-15595969 / 02302-15464733', pad+32, y+11)
    doc.text('CUIT: 27-24265717-4 - IVA Responsable Inscripto - Pto. Vta. 0006', pad+32, y+15)

    // Tipo comprobante (recuadro)
    const tipoLabel = c.categoria==='nc'
      ? (c.tipo==='A'?'Nota de Credito':'Nota de Credito') : 'Factura'
    const letraX = W-pad-28
    doc.setDrawColor(30,30,30); doc.setLineWidth(0.5)
    rRect(letraX, y-2, 28, 18, 2, 'S')
    doc.setFontSize(7); doc.setTextColor(100,100,100)
    doc.text(tipoLabel, letraX+14, y+3, {align:'center'})
    doc.setFontSize(18); doc.setFont('helvetica','bold'); doc.setTextColor(30,30,30)
    doc.text(c.tipo||'X', letraX+14, y+13, {align:'center'})

    // Número y fecha a la derecha del recuadro letra
    doc.setFontSize(9); doc.setFont('helvetica','bold')
    doc.text(`N. 0006-${String(c.nro_cbte_afip??c.numero??0).padStart(8,'0')}`, letraX-3, y+4, {align:'right'})
    doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(100,100,100)
    doc.text(c.fecha.split('-').reverse().join('/'), letraX-3, y+10, {align:'right'})

    // Línea verde separadora
    y+=19
    doc.setFillColor(0,165,80); doc.rect(pad, y, rw, 1.5, 'F')
    y+=5

    // NC referencia
    if (c.categoria==='nc') {
      const original = comps.find(x=>x.id===c.comprobante_original_id)
      doc.setFont('helvetica','italic'); doc.setFontSize(7.5); doc.setTextColor(150,100,0)
      doc.text(`Corresponde a Comprobante N. ${original?String(original.nro_cbte_afip??original.numero??0).padStart(8,'0'):'—'}${c.motivo_nc?` — ${c.motivo_nc}`:''}`, pad, y)
      doc.setTextColor(30,30,30); y+=5
    }

    // ─── MARCA DE AGUA ───
    const gState = new (doc as any).GState({ opacity: 0.05 })
    doc.saveGraphicsState(); doc.setGState(gState)
    try { doc.addImage(LOGO_BASE64, 'PNG', 60, 120, 90, 50) } catch(e){}
    doc.setFont('helvetica','bold'); doc.setFontSize(30); doc.setTextColor(0,165,80)
    doc.text('EL PIAMONTE', W/2, 190, {align:'center'})
    doc.setFontSize(8)
    doc.text('www.parabrisaselpiamonte.com.ar', W/2, 198, {align:'center'})
    doc.restoreGraphicsState()
    doc.setTextColor(30,30,30)

    // ─── DATOS CLIENTE (dos columnas si aseguradora, una si particular) ───
    const esAseg = !!c.aseguradora_nombre
    const condVta = c.pagos?.some((p:Pago)=>p.metodo?.toLowerCase().includes('contado')) ? 'Contado' : 'Cuenta Corriente'

    doc.setFillColor(248,251,249); doc.setDrawColor(210,220,215); doc.setLineWidth(0.3)
    if (esAseg) {
      // Fetch CUIT/IVA de la aseguradora
      let cuitAseg = c.cliente_cuit || ''
      let condIvaAseg = 'Responsable Inscripto'
      let dirAseg = ''
      let locAseg = ''
      if (c.aseguradora_id) {
        const { data: aRow } = await supabase.from('aseguradoras').select('cuit,condicion_iva,direccion,localidad').eq('id', c.aseguradora_id).maybeSingle()
        if (aRow) {
          cuitAseg = cuitAseg || aRow.cuit || ''
          condIvaAseg = aRow.condicion_iva || condIvaAseg
          dirAseg = aRow.direccion || ''
          locAseg = aRow.localidad || ''
        }
      }

      // Calcular altura dinámica según campos disponibles
      const leftLines = [dirAseg, locAseg, cuitAseg, condIvaAseg, condVta].filter(Boolean).length
      const rightLines = [(c as any).siniestro, c.vehiculo, (c as any).patente, c.cliente_telefono].filter(Boolean).length
      const maxLines = Math.max(leftLines, rightLines)
      const boxH = 12 + maxLines * 4 + 4
      rRect(pad, y, rw, boxH, 3, 'FD')
      // Línea central vertical
      doc.line(W/2, y+1, W/2, y+boxH-1)

      // Izquierda: Aseguradora
      doc.setFontSize(6.5); doc.setFont('helvetica','bold'); doc.setTextColor(0,165,80)
      doc.text('ASEGURADORA', pad+3, y+5)
      doc.setFont('helvetica','bold'); doc.setFontSize(8.5); doc.setTextColor(30,30,30)
      doc.text(c.aseguradora_nombre||'', pad+3, y+10)
      doc.setFont('helvetica','normal'); doc.setFontSize(7.5); doc.setTextColor(80,80,80)
      let ly = y+15
      if (dirAseg) { doc.text(`Dir: ${dirAseg}`, pad+3, ly); ly+=4 }
      if (locAseg) { doc.text(`Loc: ${locAseg}`, pad+3, ly); ly+=4 }
      if (cuitAseg) { doc.text(`CUIT: ${cuitAseg}`, pad+3, ly); ly+=4 }
      doc.text(`IVA: ${condIvaAseg}`, pad+3, ly); ly+=4
      doc.text(`Cond. Vta.: ${condVta}`, pad+3, ly)

      // Derecha: Asegurado
      const rx = W/2+3
      doc.setFontSize(6.5); doc.setFont('helvetica','bold'); doc.setTextColor(0,165,80)
      doc.text('ASEGURADO', rx, y+5)
      doc.setFont('helvetica','bold'); doc.setFontSize(8.5); doc.setTextColor(30,30,30)
      doc.text(c.cliente_nombre||'', rx, y+10)
      doc.setFont('helvetica','normal'); doc.setFontSize(7.5); doc.setTextColor(80,80,80)
      let ry = y+15
      if ((c as any).siniestro) { doc.text(`N. siniestro: ${(c as any).siniestro}`, rx, ry); ry+=4 }
      if (c.vehiculo) { doc.text(`Vehiculo: ${c.vehiculo}`, rx, ry); ry+=4 }
      if ((c as any).patente) { doc.text(`Patente: ${(c as any).patente}`, rx, ry); ry+=4 }
      if (c.cliente_telefono) { doc.text(`Tel: ${c.cliente_telefono}`, rx, ry) }

      y += boxH + 4
    } else {
      // Particular / Consumidor final
      const filas: string[] = []
      filas.push(`Cliente: ${c.cliente_nombre||'Consumidor Final'}`)
      if (c.cliente_cuit) filas.push(`${c.cliente_tipo_fiscal==='consumidor_final'||(c.cliente_cuit?.length??0)<=8?'DNI':'CUIT'}: ${c.cliente_cuit} - IVA: ${tipoFiscalLabel(c.cliente_tipo_fiscal)}`)
      if (c.cliente_telefono) filas.push(`Tel: ${c.cliente_telefono}`)
      if (c.vehiculo) filas.push(`Vehiculo: ${c.vehiculo}`)
      if ((c as any).patente) filas.push(`Patente: ${(c as any).patente}`)
      filas.push(`Cond. Vta.: ${condVta}`)

      const boxH = filas.length * 4.5 + 4
      rRect(pad, y, rw, boxH, 3, 'FD')
      doc.setFontSize(8); doc.setTextColor(30,30,30)
      let cy = y + 5
      filas.forEach(f => {
        const parts = f.split(': ')
        doc.setFont('helvetica','bold'); doc.text(parts[0]+':', pad+3, cy)
        doc.setFont('helvetica','normal'); doc.text(parts.slice(1).join(': '), pad+28, cy)
        cy += 4.5
      })
      y += boxH + 4
    }

    // ─── TABLA DE ÍTEMS ───
    const cols=[68,14,44,44]
    const colsTotal = cols.reduce((a,b)=>a+b,0)
    // Header verde con esquinas redondeadas arriba
    doc.setFillColor(0,165,80)
    rRect(pad, y, rw, 6, 2, 'F')
    doc.setTextColor(255,255,255); doc.setFont('helvetica','bold'); doc.setFontSize(8)
    const hx = pad
    doc.text('Cant.', hx+2, y+4.5)
    doc.text('Descripcion', hx+cols[0]-58, y+4.5)
    doc.text('Precio unit.', hx+cols[0]+cols[1]+cols[2]-2, y+4.5, {align:'right'})
    doc.text('Subtotal', hx+cols[0]+cols[1]+cols[2]+cols[3]-2, y+4.5, {align:'right'})
    y+=6

    // Filas
    doc.setTextColor(30,30,30); doc.setFont('helvetica','normal'); doc.setFontSize(8)
    const itemCount = c.items.length
    c.items.forEach((it:any,idx:number)=>{
      const isLast = idx === itemCount - 1
      if(idx%2===0){ doc.setFillColor(245,250,247); doc.rect(pad,y,rw,6,'F') }
      const codText = (it as any).codigo ? `[${(it as any).codigo}] ` : ''
      doc.text(String(it.c||1), hx+12, y+4.5, {align:'right'})
      doc.text((codText + String(it.d||'')).slice(0,45), hx+14, y+4.5)
      doc.setFont('helvetica','normal'); doc.setFontSize(8)
      // Factura A: precios sin IVA (el IVA se discrimina en el pie)
      const precioUnit = c.tipo==='A' ? Math.round((it.p||0) / 1.21 * 100) / 100 : (it.p||0)
      const precioSubt = c.tipo==='A' ? Math.round((it.c||1) * (it.p||0) / 1.21 * 100) / 100 : (it.c||1)*(it.p||0)
      doc.text(moneyARS(precioUnit), hx+cols[0]+cols[1]+cols[2]-2, y+4.5, {align:'right'})
      doc.text(moneyARS(precioSubt), hx+cols[0]+cols[1]+cols[2]+cols[3]-2, y+4.5, {align:'right'})
      y+=6
    })
    // Borde del área de items con esquinas redondeadas abajo
    doc.setDrawColor(210,220,215); doc.setLineWidth(0.3)
    // Dibujar borde inferior redondeado
    y+=1

    // ─── TOTALES EN FILA HORIZONTAL — siempre en posición fija ───
    const totY = 243
    const tc = 5
    const tw = rw / tc
    doc.setFillColor(0,165,80)
    rRect(pad, totY, rw, 6, 2, 'F')
    doc.setTextColor(255,255,255); doc.setFont('helvetica','bold'); doc.setFontSize(7.5)
    const totHeaders = ['Sub-total','Descuento','IVA 21%','IVA 10.5%','Total']
    totHeaders.forEach((h,i) => doc.text(h, pad + tw*i + tw/2, totY+4.5, {align:'center'}))

    doc.setFillColor(248,251,249); doc.setDrawColor(210,220,215); doc.setLineWidth(0.3)
    rRect(pad, totY+6, rw, 7, 0, 'FD')
    doc.setTextColor(30,30,30); doc.setFont('helvetica','normal'); doc.setFontSize(8)
    const descMonto = (c as any).descuento_monto || 0
    const iva105 = 0
    const totValues = [moneyARS(c.neto||0), moneyARS(descMonto), moneyARS(c.iva||0), moneyARS(iva105), moneyARS(c.total||0)]
    totValues.forEach((v,i) => {
      if (i === tc-1) doc.setFont('helvetica','bold')
      else doc.setFont('helvetica','normal')
      doc.text(v, pad + tw*i + tw/2, totY+11.5, {align:'center'})
    })

    // ─── FORMA DE PAGO — solo si no es cuenta corriente ───
    const esCuentaCorriente = c.pagos?.every((p:Pago) => p.metodo?.toLowerCase().includes('corriente') || p.metodo?.toLowerCase().includes('cta'))
    const pagoY = 255
    if(c.pagos?.length && !esCuentaCorriente){
      doc.setFont('helvetica','bold'); doc.setFontSize(8); doc.setTextColor(30,30,30)
      doc.text('Forma de pago:', pad, pagoY)
      doc.setFont('helvetica','normal')
      let py = pagoY + 4
      c.pagos.forEach((p:Pago)=>{
        doc.text(`${p.metodo}${p.cuotas&&p.cuotas>1?` (${p.cuotas} cuotas)`:''}: ${moneyARS(parseFloat(p.monto)||0)}`, pad+3, py)
        py+=4
      })
    }

    // ─── CAE COMPACTO — posición fija ───
    const caeY = 268
    if (!c.es_negro && ['A','B','C'].includes(c.tipo) && c.cae_emitido) {
      doc.setDrawColor(210,220,215); doc.setLineWidth(0.3)
      rRect(pad, caeY, rw, 10, 2, 'S')
      doc.setFont('helvetica','bold'); doc.setFontSize(8); doc.setTextColor(30,30,30)
      doc.text(`CAE: ${c.cae_emitido}`, pad+4, caeY+6.5)
      doc.setFont('helvetica','normal'); doc.setFontSize(7.5); doc.setTextColor(100,100,100)
      if (c.cae_vencimiento) doc.text(`Vto. CAE: ${c.cae_vencimiento.split('-').reverse().join('/')}`, W-pad-4, caeY+6.5, {align:'right'})
    }

    // ─── FOOTER — siempre en Y=285 ───
    doc.setFillColor(0,165,80)
    doc.rect(0, 285, W, 12, 'F')
    doc.setTextColor(255,255,255); doc.setFont('helvetica','normal'); doc.setFontSize(8)
    doc.text('Tel: 2302 595969', pad, 292)
    doc.text('General Pico, La Pampa', W/2, 292, {align:'center'})
    doc.text('Calle 102 Nro 366', W-pad, 292, {align:'right'})

    return doc.output('blob')
  }


  // PDF formato ARCA para Mercantil Andina y Sancor (layout validado)
  async function generarPDFArca(c:Comprobante): Promise<Blob> {
    const { jsPDF } = await import('jspdf')
    const html2canvas = (await import('html2canvas')).default

    // Fetch datos aseguradora
    let cuitAseg='', dirAseg='', razonSocial=c.aseguradora_nombre||''
    if (c.aseguradora_id) {
      const { data: aRow } = await supabase.from('aseguradoras').select('cuit,direccion,localidad,razon_social').eq('id', c.aseguradora_id).maybeSingle()
      if (aRow) {
        cuitAseg = c.cliente_cuit || aRow.cuit || ''
        dirAseg = [aRow.direccion, aRow.localidad].filter(Boolean).join(', ')
        razonSocial = aRow.razon_social || razonSocial
      }
    }

    const tipoLabel = c.categoria==='nc' ? 'NOTA DE CRÉDITO' : 'FACTURA'
    const codTipo = c.tipo==='A' ? 'COD. 01' : c.tipo==='B' ? 'COD. 06' : 'COD. 11'
    const nroAfip = String(c.nro_cbte_afip??c.numero??0).padStart(8,'0')
    const fechaFmt = c.fecha.split('-').reverse().join('/')
    const fmtNum = (n:number) => n.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})
    const caeVto = c.cae_vencimiento ? c.cae_vencimiento.split('-').reverse().join('/') : ''

    const renderPagina = async (copia: string): Promise<HTMLCanvasElement> => {
      const div = document.createElement('div')
      div.style.cssText = 'position:fixed;left:-9999px;top:0;width:794px;background:white;font-family:Arial,sans-serif;font-size:9px;color:#000'
      div.innerHTML = `
        <div style="padding:20px 20px 10px 20px">
          <!-- COPIA -->
          <div style="border:1px solid #000;text-align:center;font-weight:bold;font-size:13px;padding:4px 0;margin-bottom:0;width:60%;margin-left:20%">${copia}</div>

          <!-- ENCABEZADO -->
          <table style="width:100%;border-collapse:collapse;border:1px solid #000;margin-top:0">
            <tr>
              <td style="width:46%;padding:6px 6px;border-right:1px solid #000;vertical-align:top">
                <div style="font-weight:bold;font-size:10px;margin-bottom:6px">KNUTH VERONICA ALEJANDRA</div>
                <div><span style="font-weight:bold">Razón Social:</span> KNUTH VERONICA ALEJANDRA</div>
                <div style="margin-top:5px"><span style="font-weight:bold">Domicilio Comercial:</span> Calle 102 366 - General Pico, La Pampa</div>
                <div style="margin-top:5px"><span style="font-weight:bold">Condición frente al IVA:</span> IVA Responsable Inscripto</div>
              </td>
              <td style="width:8%;border-right:1px solid #000;text-align:center;vertical-align:middle;padding:4px">
                <div style="font-weight:bold;font-size:22px;line-height:1">${c.tipo||'A'}</div>
                <div style="font-size:6px;margin-top:4px">${codTipo}</div>
              </td>
              <td style="width:46%;padding:6px 8px;vertical-align:top">
                <div style="font-weight:bold;font-size:15px;margin-bottom:4px">${tipoLabel}</div>
                <div><span style="font-weight:bold">Punto de Venta: 0006</span>&nbsp;&nbsp;&nbsp;<span style="font-weight:bold">Comp. Nro: ${nroAfip}</span></div>
                <div style="margin-top:3px"><span style="font-weight:bold">Fecha de Emisión:</span> ${fechaFmt}</div>
                <div style="margin-top:3px"><span style="font-weight:bold">CUIT:</span> 27242657174</div>
                <div style="margin-top:2px"><span style="font-weight:bold">Ingresos Brutos:</span> 1919987</div>
                <div style="margin-top:2px"><span style="font-weight:bold">Fecha de Inicio de Actividades:</span> 01/09/2007</div>
              </td>
            </tr>
          </table>

          <!-- PERÍODO -->
          <table style="width:100%;border-collapse:collapse;border:1px solid #000;border-top:none">
            <tr>
              <td style="padding:4px 6px;width:50%;border-right:1px solid #000">
                <span style="font-weight:bold">Período Facturado Desde:</span> ${fechaFmt} &nbsp;&nbsp; <span style="font-weight:bold">Hasta:</span> ${fechaFmt}
              </td>
              <td style="padding:4px 6px">
                <span style="font-weight:bold">Fecha de Vto. para el pago:</span> ${fechaFmt}
              </td>
            </tr>
          </table>

          <!-- RECEPTOR -->
          <table style="width:100%;border-collapse:collapse;border:1px solid #000;border-top:none">
            <tr style="border-bottom:1px solid #000">
              <td style="padding:3px 6px;width:50%">
                <span style="font-weight:bold">CUIT:</span> ${cuitAseg.replace(/-/g,'')} &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
                <span style="font-weight:bold">Apellido y Nombre / Razón Social:</span> ${razonSocial}
              </td>
            </tr>
            <tr style="border-bottom:1px solid #000">
              <td style="padding:3px 6px">
                <span style="font-weight:bold">Condición frente al IVA:</span> IVA Responsable Inscripto &nbsp;&nbsp;&nbsp;&nbsp;
                <span style="font-weight:bold">Domicilio Comercial:</span> ${dirAseg||''}
              </td>
            </tr>
            <tr>
              <td style="padding:3px 6px">
                <span style="font-weight:bold">Condición de venta:</span> Cuenta Corriente
              </td>
            </tr>
          </table>

          <!-- TABLA ITEMS -->
          <table style="width:100%;border-collapse:collapse;margin-top:8px;font-size:8px">
            <thead>
              <tr style="background:#ddd;font-weight:bold">
                <td style="border:1px solid #000;padding:2px 3px;width:7%">Código</td>
                <td style="border:1px solid #000;padding:2px 3px;width:30%">Producto / Servicio</td>
                <td style="border:1px solid #000;padding:2px 3px;width:8%">Cantidad</td>
                <td style="border:1px solid #000;padding:2px 3px;width:8%">U. medida</td>
                <td style="border:1px solid #000;padding:2px 3px;width:12%">Precio Unit.</td>
                <td style="border:1px solid #000;padding:2px 3px;width:6%">% Bonif</td>
                <td style="border:1px solid #000;padding:2px 3px;width:11%">Subtotal</td>
                <td style="border:1px solid #000;padding:2px 3px;width:7%">Alícuota IVA</td>
                <td style="border:1px solid #000;padding:2px 3px;width:11%">Subtotal c/IVA</td>
              </tr>
            </thead>
            <tbody>
              ${c.items.map((it:any) => {
                const netoUnit = Math.round((it.p||0)/1.21*100)/100
                return `<tr>
                  <td style="border:1px solid #000;padding:2px 3px">${(it as any).codigo||''}</td>
                  <td style="border:1px solid #000;padding:2px 3px">${it.d||''}</td>
                  <td style="border:1px solid #000;padding:2px 3px">${Number(it.c||1).toFixed(2).replace('.',',')}</td>
                  <td style="border:1px solid #000;padding:2px 3px">unidades</td>
                  <td style="border:1px solid #000;padding:2px 3px">${fmtNum(netoUnit)}</td>
                  <td style="border:1px solid #000;padding:2px 3px">0,00</td>
                  <td style="border:1px solid #000;padding:2px 3px">${fmtNum(netoUnit*(it.c||1))}</td>
                  <td style="border:1px solid #000;padding:2px 3px">21%</td>
                  <td style="border:1px solid #000;padding:2px 3px">${fmtNum((it.c||1)*(it.p||0))}</td>
                </tr>`
              }).join('')}
            </tbody>
          </table>

          <!-- TOTALES -->
          <div style="margin-top:60px;display:flex;justify-content:flex-end">
            <table style="border:1px solid #000;font-size:8px;min-width:380px">
              <tr>
                <td style="padding:3px 8px;border-bottom:1px solid #000" colspan="2">
                  Importe Otros Tributos: $ &nbsp;&nbsp;&nbsp;&nbsp; 0,00
                </td>
              </tr>
              <tr><td style="padding:2px 8px;font-weight:bold">Importe Neto Gravado: $</td><td style="padding:2px 8px;text-align:right;font-weight:bold">${fmtNum(c.neto||0)}</td></tr>
              <tr><td style="padding:2px 8px">IVA 27%: $</td><td style="padding:2px 8px;text-align:right">0,00</td></tr>
              <tr><td style="padding:2px 8px">IVA 21%: $</td><td style="padding:2px 8px;text-align:right">${fmtNum(c.iva||0)}</td></tr>
              <tr><td style="padding:2px 8px">IVA 10.5%: $</td><td style="padding:2px 8px;text-align:right">0,00</td></tr>
              <tr><td style="padding:2px 8px">IVA 5%: $</td><td style="padding:2px 8px;text-align:right">0,00</td></tr>
              <tr><td style="padding:2px 8px">IVA 2.5%: $</td><td style="padding:2px 8px;text-align:right">0,00</td></tr>
              <tr><td style="padding:2px 8px">IVA 0%: $</td><td style="padding:2px 8px;text-align:right">0,00</td></tr>
              <tr><td style="padding:2px 8px">Importe Otros Tributos: $</td><td style="padding:2px 8px;text-align:right">0,00</td></tr>
              <tr style="border-top:1px solid #000"><td style="padding:3px 8px;font-weight:bold">Importe Total: $</td><td style="padding:3px 8px;text-align:right;font-weight:bold">${fmtNum(c.total||0)}</td></tr>
            </table>
          </div>

          <!-- PIE -->
          <div style="text-align:center;font-style:italic;margin-top:10px;font-size:9px">"PARABRISAS  EL PIAMONTE "</div>
          <hr style="border:none;border-top:1px solid #aaa;margin:6px 0"/>
          <div style="display:flex;justify-content:space-between;align-items:flex-start">
            <div>
              <div style="color:#005090;font-weight:bold;font-size:11px">ARCA</div>
              <div style="font-size:6px;color:#444">AGENCIA DE RECAUDACIÓN Y CONTROL ADUANERO</div>
              <div style="font-weight:bold;font-size:8px;margin-top:4px">Comprobante Autorizado</div>
              <div style="font-style:italic;font-size:6px;color:#555;margin-top:2px">Esta Agencia no se responsabiliza por los datos ingresados en el detalle de la operación</div>
            </div>
            <div style="text-align:center;font-size:8px">Pág. 1/1</div>
            <div style="text-align:right;font-size:8px">
              <div style="font-weight:bold">CAE N°: ${c.cae_emitido||''}</div>
              <div style="font-weight:bold">Fecha de Vto. de CAE: ${caeVto}</div>
            </div>
          </div>
        </div>
      `
      document.body.appendChild(div)
      const canvas = await html2canvas(div, { scale: 2, useCORS: true, backgroundColor: '#ffffff' })
      document.body.removeChild(div)
      return canvas
    }

    const doc = new jsPDF({ format: 'a4', unit: 'mm' })
    const copias = ['ORIGINAL', 'DUPLICADO', 'TRIPLICADO']
    for (let i = 0; i < copias.length; i++) {
      const canvas = await renderPagina(copias[i])
      const imgData = canvas.toDataURL('image/jpeg', 0.95)
      if (i > 0) doc.addPage()
      doc.addImage(imgData, 'JPEG', 0, 0, 210, 297)
    }
    return doc.output('blob')
  }


  async function compartirWA(c:Comprobante){
    const ASEG_ARCA = ['79b592cf-a211-4f39-826a-5e7c0ef594dc','acca4421-1905-4607-ae64-12455574d3f3']
    const esFormatoArca = !!(c.aseguradora_id && ASEG_ARCA.includes(c.aseguradora_id))
    const blob = esFormatoArca ? await generarPDFArca(c) : await generarPDF(c)
    const file = new File([blob],`Comprobante-${c.numero}.pdf`,{type:'application/pdf'})
    if(navigator.canShare?.({files:[file]})){ await navigator.share({files:[file],title:'Comprobante El Piamonte'}); return }
    const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=file.name; a.click(); URL.revokeObjectURL(url)
    const tel=(c.cliente_telefono||'').replace(/[^0-9]/g,'')
    const txt=`Hola${c.cliente_nombre?' '+c.cliente_nombre:''}! Te enviamos el comprobante N°${c.numero} de Parabrisas El Piamonte. Total: ${moneyARS(c.total)}.`
    setTimeout(()=>window.open(`https://web.whatsapp.com/send?phone=${tel}&text=${encodeURIComponent(txt)}`,'_blank'),800)
  }

  async function descargar(c:Comprobante){
    const ASEG_ARCA = ['79b592cf-a211-4f39-826a-5e7c0ef594dc','acca4421-1905-4607-ae64-12455574d3f3']
    const esFormatoArca = !!(c.aseguradora_id && ASEG_ARCA.includes(c.aseguradora_id))
    const blob = esFormatoArca ? await generarPDFArca(c) : await generarPDF(c)
    const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; const sufijo = c.categoria==="nc" ? " NC" : c.categoria==="nd" ? " ND" : ""; const nroAfip = String(c.nro_cbte_afip ?? c.numero ?? 0).padStart(8,"0"); a.download=`0006-${nroAfip}${sufijo}.pdf`; a.click(); URL.revokeObjectURL(url)
  }

  // Los comprobantes NO se pueden borrar. Una factura genera NC, una NC genera ND.
  // Si tiene CAE es un documento fiscal irreversible ante AFIP.
  // Esta función solo existe para comprobantes de prueba sin CAE (uso interno).
  async function del(id:string){
    const comp = comps.find(c=>c.id===id)
    if (comp?.cae_emitido) {
      alert('Este comprobante tiene CAE y no puede eliminarse. Para anularlo emití una Nota de Crédito.')
      return
    }
    if(!confirm('⚠ Este comprobante no tiene CAE.\n¿Seguro que querés eliminarlo? Esta acción es irreversible.'))return
    await supabase.from('comprobantes').delete().eq('id',id)
    setComps(prev=>prev.filter(c=>c.id!==id))
  }

  const [filtroTipo, setFiltroTipo] = useState<'todos'|'A'|'B'|'C'|'nc'|'nd'|'negro'>('todos')
  const [verComp, setVerComp] = useState<Comprobante|null>(null)
  const [detailDescMap, setDetailDescMap] = useState<Record<string,string>>({})
  const [expandido, setExpandido] = useState<string|null>(null)
  const compsFiltrados = comps.filter(c => {
    if (filtroTipo === 'todos') return true
    if (filtroTipo === 'nc') return c.categoria === 'nc'
    if (filtroTipo === 'nd') return c.categoria === 'nd'
    if (filtroTipo === 'negro') return !!c.es_negro
    return c.categoria !== 'nc' && c.tipo === filtroTipo
  })

  function addRubro(r: RubroPrecio) {
    const precio = rubrosEdit[r.id] ?? r.precio_base
    setItems(prev=>[...prev, { d:r.nombre, c:1, p:precio, costo: r.costo_base||undefined, articulo_id:null }])
  }

  return (
    <div>
      {toast && (
        <div style={{position:'fixed',bottom:24,left:'50%',transform:'translateX(-50%)',zIndex:60,background:toast.startsWith('✓')?'#00A550':'#ef4444',color:'#fff',padding:'10px 18px',borderRadius:10,fontSize:13,fontWeight:600,boxShadow:'0 4px 14px rgba(0,0,0,.2)'}}>
          {toast}
        </div>
      )}

      {/* Cuando venimos de una OS: mostrar solo el modal de factura, sin la lista */}
      {oidParam && !open && null}

      {!oidParam && <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20,gap:12,flexWrap:'wrap'}}>
        <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
          {([
            ['todos','Todos'],['A','Factura A'],['B','Factura B'],['nc','Notas de Crédito'],['nd','Notas de Débito'],
            ...(rol==='gerencial'||rol==='admin' ? [['negro','🔘 Sin CAE'] as const] : []),
          ] as const).map(([val,label])=>(
            <button key={val} onClick={()=>setFiltroTipo(val)}
              style={{background:filtroTipo===val?'#00A550':'#fff',color:filtroTipo===val?'#fff':'#4A6655',border:`1.5px solid ${filtroTipo===val?'#00A550':'#C2DDD0'}`,borderRadius:10,padding:'6px 14px',fontWeight:700,fontSize:12,cursor:'pointer'}}>
              {label}
            </button>
          ))}
        </div>
        <button onClick={()=>setOpen(true)} style={btn}>+ Nuevo comprobante</button>
      </div>

      {compsFiltrados.length===0 ? <Empty msg="Sin comprobantes para este filtro." /> : (
        <div className="flex flex-col gap-3">
          {compsFiltrados.map(c=>{
            const totalAcreditado = c.categoria!=='nc'
              ? comps.filter(x=>x.categoria==='nc' && x.comprobante_original_id===c.id).reduce((a,x)=>a+x.total,0)
              : 0
            const saldadaPorNC = c.categoria!=='nc' && totalAcreditado >= c.total - 0.5
            return (
            <div key={c.id}
              onClick={()=>setExpandido(p=>p===c.id?null:c.id)}
              onDoubleClick={async()=>{ 
                setVerComp(c)
                const items = c.items || []
                const map: Record<string,string> = {}

                // Buscar por descripción en catálogo
                const descs = items.map((it:any)=>it.d).filter(Boolean)
                if (descs.length) {
                  const { data } = await supabase.from('catalogo').select('codigo,descripcion').in('descripcion', descs).is('lista_nombre', null)
                  for (const r of data??[]) if (r.codigo && r.descripcion && !map[r.descripcion]) map[r.descripcion] = r.codigo
                }

                // Buscar por stock_id (para NC y otros que traigan stock_id en el ítem)
                const stockIds = items.map((it:any)=>it.stock_id).filter(Boolean)
                if (stockIds.length) {
                  const { data } = await supabase.from('stock').select('id,codigo').in('id', stockIds)
                  for (const r of data??[]) {
                    // Buscar el ítem con ese stock_id y mapear su descripción al código
                    const it = items.find((x:any)=>x.stock_id===r.id)
                    if (it && r.codigo && !map[it.d]) map[it.d] = r.codigo
                  }
                }

                setDetailDescMap(map)
              }} title="Click para opciones · doble click para ver el detalle"
              className="bg-white border border-p-line rounded-xl shadow-sm cursor-pointer hover:border-p-green transition-colors overflow-hidden">
              <div className="flex items-center gap-2.5 px-3.5 py-2.5 flex-wrap">
                <span className="font-mono text-[11px] font-bold text-p-dark bg-p-light px-2 py-0.5 rounded-full shrink-0">
                  {c.categoria==='nc'?'NC':(c.tipo==='A'?'FA':c.tipo==='B'?'FB':c.tipo==='C'?'FC':'X')}-0006-{String(c.nro_cbte_afip ?? c.numero ?? 0).padStart(8,'0')}
                </span>
                <div className="flex flex-col min-w-0" style={{maxWidth:240}}>
                  <p className="font-saira font-bold text-p-ink text-sm truncate">
                    {c.aseguradora_nombre||c.cliente_nombre||'Consumidor Final'}
                  </p>
                  {c.aseguradora_nombre && c.cliente_nombre && (
                    <p className="text-[10px] text-p-ink2 truncate">Aseg: {c.cliente_nombre}</p>
                  )}
                </div>
                {c.categoria==='nc'&&<span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 shrink-0">🧾 NC</span>}
                {c.categoria==='nd'&&<span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 shrink-0">🧾 ND</span>}
                {saldadaPorNC&&<span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-200 text-gray-700 shrink-0">↩ Saldada</span>}
                {(rol==='gerencial'||rol==='admin') && (c as any).es_negro&&<span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-800 text-white shrink-0">⚫</span>}
                {!c.es_negro && ['A','B','C'].includes(c.tipo) && (
                  c.cae_emitido
                    ? <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700 shrink-0">✓ CAE</span>
                    : <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 shrink-0">⚠ Sin CAE</span>
                )}
                <span className="text-xs text-p-ink2 shrink-0">{c.fecha.split('-').reverse().join('/')}</span>
                <div className="flex-1 min-w-[8px]"/>
                <p className="font-saira font-bold text-p-ink shrink-0">{moneyARS(c.total)}</p>
              </div>

              {expandido===c.id && (
                <div onClick={e=>e.stopPropagation()} className="px-3.5 pb-3 pt-2 border-t border-p-line2 bg-p-light/30">
                  <p className="text-xs text-p-ink2 mb-2">
                    {[c.vehiculo, c.cliente_cuit?`${tipoFiscalLabel(c.cliente_tipo_fiscal)} · CUIT ${c.cliente_cuit}`:null, c.items.length+' ítem(s)'].filter(Boolean).join(' · ')}
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    <button onClick={()=>abrirAdjuntos(c)} style={{...btnSm,background:'#7c3aed'}}>📎 Adjuntos</button>
                    {c.cliente_telefono&&<button onClick={()=>compartirWA(c)} style={btnWa}>📱 WhatsApp</button>}
                    {!c.es_negro && ['A','B','C'].includes(c.tipo) && !c.cae_emitido && (
                      <button onClick={()=>reintentarCAE(c)} disabled={caeLoading===c.id}
                        style={{...btnSm,background:'#dc2626',opacity:caeLoading===c.id?.6:1}}>
                        {caeLoading===c.id ? 'Solicitando…' : '⚠ Reintentar CAE'}
                      </button>
                    )}
                    {c.categoria!=='nc' && c.categoria!=='nd' && !saldadaPorNC && (
                      <button onClick={()=>abrirNC(c)} style={{...btnSm,background:'#d97706'}}>🧾 Nota de Crédito</button>
                    )}
                    <button onClick={()=>{ setNdComp(c); setNdConcepto(''); setNdMonto(''); setNdIvaOn(true) }}
                      style={{...btnSm,background:'#7c3aed'}}>🧾 Nota de Débito</button>
                    <button onClick={()=>setVerComp(c)} style={btnSm}>👁 Ver detalle</button>
                    <button onClick={()=>descargar(c)} style={btnSm}>⬇ PDF</button>
                    {!c.cae_emitido && (
                      <button onClick={()=>del(c.id)} style={btnRed}>Borrar</button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )})}
        </div>
      )}
      </div>}

      <Modal open={open} onClose={()=>{ if(oidParam) router.push('/ordenes'); else setOpen(false) }} title="Nuevo comprobante" size="xl">
        <div className="flex flex-col gap-3 max-h-[80vh] overflow-y-auto pr-1">

          {/* Aviso: esta OS ya tiene venta registrada en caja hoy */}
          {ventaPreviaOS && oidParam && (
            <div className="bg-amber-50 border border-amber-300 rounded-xl px-4 py-3 flex items-start gap-2">
              <span className="text-lg shrink-0">⚠️</span>
              <div>
                <p className="text-sm font-bold text-amber-800">Esta OS ya tiene una venta registrada en caja hoy</p>
                <p className="text-xs text-amber-700 mt-0.5">Al emitir el comprobante, la venta previa se elimina automáticamente y queda solo la factura. No cargues el pago dos veces.</p>
              </div>
            </div>
          )}

          <div>
            <label className="block text-[11px] font-semibold text-p-ink2 uppercase tracking-wider mb-1.5">¿A quién se factura?</label>
            <div className="flex gap-2 flex-wrap">
              <button type="button" onClick={()=>cambiarModo('cf')}
                style={{background:modo==='cf'?'#0C1810':'#fff',color:modo==='cf'?'#fff':'#4A6655',border:`1.5px solid ${modo==='cf'?'#0C1810':'#C2DDD0'}`,borderRadius:10,padding:'8px 16px',fontWeight:700,fontSize:13,cursor:'pointer'}}>
                👤 Consumidor Final
              </button>
              <button type="button" onClick={()=>cambiarModo('cliente')}
                style={{background:modo==='cliente'?'#00A550':'#fff',color:modo==='cliente'?'#fff':'#4A6655',border:`1.5px solid ${modo==='cliente'?'#00A550':'#C2DDD0'}`,borderRadius:10,padding:'8px 16px',fontWeight:700,fontSize:13,cursor:'pointer'}}>
                🧑‍💼 Cliente
              </button>
              <button type="button" onClick={()=>cambiarModo('aseguradora')}
                style={{background:modo==='aseguradora'?'#1d4ed8':'#fff',color:modo==='aseguradora'?'#fff':'#4A6655',border:`1.5px solid ${modo==='aseguradora'?'#1d4ed8':'#C2DDD0'}`,borderRadius:10,padding:'8px 16px',fontWeight:700,fontSize:13,cursor:'pointer'}}>
                🏢 Aseguradora
              </button>
            </div>
          </div>

          {modo === 'cf' && (
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-2 gap-2">
                <Field label="Nombre *">
                  <Input value={cfNombre} onChange={e=>setCfNombre(e.target.value)} placeholder="Apellido y nombre…"/>
                </Field>
                <Field label="DNI *">
                  <Input value={cfDni} onChange={e=>setCfDni(e.target.value.replace(/\D/g,''))} placeholder="12345678" maxLength={8}/>
                </Field>
              </div>
              <Field label="Teléfono (opcional)">
                <Input value={cfTel} onChange={e=>setCfTel(e.target.value)} type="tel" placeholder="Ej: 2302xxxxxx"/>
              </Field>
              {/* Opción para facturar como RI aunque sea consumidor final */}
              <label className="flex items-center gap-2 text-sm cursor-pointer mt-1">
                <input type="checkbox" checked={fiscal.tipo_fiscal==='responsable_inscripto'}
                  onChange={e=>setFiscal(p=>({...p, tipo_fiscal: e.target.checked ? 'responsable_inscripto' : 'consumidor_final', cuit: e.target.checked ? p.cuit : ''}))}
                  className="accent-p-green"/>
                <span className="font-semibold text-p-dark">Facturar como Responsable Inscripto (Factura A)</span>
              </label>
              {fiscal.tipo_fiscal==='responsable_inscripto' && (
                <Field label="CUIT *">
                  <Input value={fiscal.cuit} onChange={e=>setFiscal(p=>({...p,cuit:e.target.value}))} placeholder="20-12345678-9"/>
                </Field>
              )}
            </div>
          )}

          {modo === 'cliente' && (
            <div>
              <label className="block text-[11px] font-semibold text-p-ink2 uppercase tracking-wider mb-1.5">Buscar cliente</label>
              <div className="relative">
                <Input value={cliQ} onChange={e=>{setCliQ(e.target.value);setCli(null);setHistorialCli(null)}}
                  placeholder="Nombre o celular…"/>
                {cliSugs.length>0&&(
                  <div className="absolute z-20 top-full left-0 right-0 bg-white border border-p-line rounded-xl shadow-xl max-h-48 overflow-y-auto mt-1">
                    {cliSugs.map(c=>(
                      <button key={c.id} onClick={()=>selectCliente(c)}
                        className="w-full text-left px-3 py-2.5 text-sm hover:bg-p-light border-b border-p-line2 last:border-0">
                        <p className="font-medium text-p-ink">{c.nombre}</p>
                        <p className="text-[10px] text-p-ink2">{[c.telefono,tipoFiscalLabel(c.tipo_fiscal)].filter(Boolean).join(' · ')}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                {cliSel ? (
                  <>
                    <span className="text-xs text-p-green font-semibold">✓ {cliSel.nombre}</span>
                    <button onClick={()=>setShowFiscal(!showFiscal)}
                      className={`text-xs font-bold px-3 py-1.5 rounded-full border transition-colors ${showFiscal?'bg-p-ink text-white border-p-ink':'border-p-line text-p-ink2 hover:bg-p-light'}`}>
                      {showFiscal ? '▲ ' : '▼ '}{tipoFiscalLabel(fiscal.tipo_fiscal)}{fiscal.cuit&&` · CUIT ${fiscal.cuit}`}
                    </button>
                  </>
                ) : (
                  <>
                    <span className="text-xs text-amber-600 font-semibold">⚠ Elegí un cliente de la lista — no se puede facturar a un nombre sin cargar</span>
                    {PUEDE_CREAR_CLIENTE(rol) && (
                      <button onClick={()=>{setNuevoCliOpen(true); setNuevoCliForm(p=>({...p, nombre:cliQ}))}} style={{...btnBlue,padding:'5px 12px',fontSize:11}}>
                        + Nuevo cliente
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {nuevoCliOpen && PUEDE_CREAR_CLIENTE(rol) && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex flex-col gap-2">
              <p className="text-[11px] font-bold text-blue-700 uppercase tracking-wider">Nuevo cliente</p>
              <Input value={nuevoCliForm.nombre} onChange={e=>setNuevoCliForm(p=>({...p,nombre:e.target.value}))} placeholder="Nombre y apellido / Razón social *"/>
              <div className="grid grid-cols-2 gap-2">
                <Input value={nuevoCliForm.telefono} onChange={e=>setNuevoCliForm(p=>({...p,telefono:e.target.value}))} placeholder="Teléfono (opcional)"/>
                <Input value={nuevoCliForm.cuit} onChange={e=>setNuevoCliForm(p=>({...p,cuit:e.target.value}))} placeholder="CUIT (opcional)"/>
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={()=>setNuevoCliOpen(false)} style={{...btnGray,padding:'6px 14px',fontSize:12}}>Cancelar</button>
                <button onClick={guardarNuevoCliente} disabled={!nuevoCliForm.nombre.trim()} style={{...btn,padding:'6px 14px',fontSize:12,opacity:!nuevoCliForm.nombre.trim()?.6:1}}>Crear y usar</button>
              </div>
            </div>
          )}

          {modo === 'aseguradora' && (
            <div>
              <label className="block text-[11px] font-semibold text-p-ink2 uppercase tracking-wider mb-1.5">Buscar aseguradora</label>
              <div className="relative">
                <div className="relative">
                  <Input value={asegQ} onChange={e=>{setAsegQ(e.target.value);setAseg(null);setHistorialCli(null)}}
                    placeholder="Allianz, Mapfre, Sancor…"/>
                  {asegSel && (
                    <button type="button" onClick={()=>{setAseg(null);setAsegQ('');setAsegSugs([]);setHistorialCli(null)}}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-p-gray hover:text-red-500 text-lg leading-none px-1"
                      title="Cambiar aseguradora">✕</button>
                  )}
                </div>
                {asegSugs.length>0&&(
                  <div className="absolute z-20 top-full left-0 right-0 bg-white border border-p-line rounded-xl shadow-xl max-h-48 overflow-y-auto mt-1">
                    {asegSugs.map(a=>(
                      <button key={a.id} onClick={()=>selectAseguradora(a)}
                        className="w-full text-left px-3 py-2.5 text-sm hover:bg-p-light border-b border-p-line2 last:border-0">
                        <p className="font-medium text-p-ink">{a.nombre}</p>
                        {a.cuit&&<p className="text-[10px] text-p-ink2">CUIT {a.cuit}</p>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 mt-2">
                {asegSel ? (
                  <span className="text-xs text-blue-600 font-semibold">✓ {asegSel.nombre}</span>
                ) : (
                  <span className="text-xs text-amber-600 font-semibold">⚠ Elegí una aseguradora de la lista — no se puede facturar a un nombre sin cargar</span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3 mt-3">
                <Field label="Cliente (asegurado)">
                  <Input value={clienteAseg} onChange={e=>setClienteAseg(e.target.value)} placeholder="Nombre del titular del vehículo"/>
                </Field>
                <Field label="N° Siniestro">
                  <Input value={siniestro} onChange={e=>setSiniestro(e.target.value)} placeholder="Opcional"/>
                </Field>
              </div>
            </div>
          )}

          {showFiscal && modo==='cliente' && (
            <div className="bg-gray-50 rounded-xl p-3 border border-p-line flex flex-col gap-2.5">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Condición IVA">
                  <Select value={fiscal.tipo_fiscal} onChange={e=>setFiscal(p=>({...p,tipo_fiscal:e.target.value}))}>
                    {TIPO_FISCAL.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}
                  </Select>
                </Field>
                <Field label="Tipo de cliente">
                  <Select value={fiscal.tipo_cliente_id} onChange={e=>setFiscal(p=>({...p,tipo_cliente_id:e.target.value}))}>
                    <option value="">Sin tipo</option>
                    {tipos.map(t=><option key={t.id} value={t.id}>{t.nombre}</option>)}
                  </Select>
                </Field>
              </div>
              {fiscal.tipo_fiscal!=='consumidor_final'&&(
                <Field label="CUIT"><Input value={fiscal.cuit} onChange={e=>setFiscal(p=>({...p,cuit:e.target.value}))} placeholder="20-12345678-9"/></Field>
              )}
              <button onClick={async()=>{
                if(cliSel?.id){
                  await supabase.from('clientes').update({tipo_fiscal:fiscal.tipo_fiscal,cuit:fiscal.cuit||null,tipo_cliente_id:fiscal.tipo_cliente_id||null}).eq('id',cliSel.id)
                }
                setShowFiscal(false)
              }} style={{...btnSm,alignSelf:'flex-end'}}>Guardar</button>
            </div>
          )}

          {historialCli && !oidParam && historialCli.remitos.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
              <p className="text-[11px] font-bold text-blue-800 uppercase tracking-wider mb-2">🚚 Remitos pendientes de facturar</p>
              <div className="flex flex-col gap-2">
                {historialCli.remitos.map((r:any) => {
                  const itemsFacturados: number[] = r.items_facturados ?? []
                  const itemsPendientes = (r.items ?? []).filter((_:any, i:number) => !itemsFacturados.includes(i))
                  const isSelected = remitoSel?.id === r.id
                  return (
                    <div key={r.id} className={`bg-white rounded-lg border transition-colors ${isSelected ? 'border-blue-400 shadow-sm' : 'border-blue-100'}`}>
                      <button type="button" onClick={()=>{
                        if(isSelected){ setRemitoSel(null); setRemitoItemsSel(new Set()); setItems([]) }
                        else { 
                          setRemitoSel(r)
                          const idxsPendientes = new Set<number>(itemsPendientes.map((_:any,i:number)=>(r.items??[]).indexOf(itemsPendientes[i])))
                          setRemitoItemsSel(idxsPendientes)
                          // Cargar ítems pendientes con precio
                          Promise.all(itemsPendientes.map(async (si:any) => {
                            let precio = si.p || 0
                            if (!precio && modo === 'aseguradora' && asegSel?.id) {
                              // Buscar en precios_aseguradora por descripción o código
                              const { data: pa } = await supabase.from('precios_aseguradora')
                                .select('precio_siva').eq('aseguradora_id', asegSel.id)
                                .ilike('descripcion', `%${(si.d||'').split(' ').slice(0,3).join('%')}%`).limit(1).maybeSingle()
                              precio = pa?.precio_siva || 0
                            }
                            if (!precio && si.stock_id) {
                              const { data: st } = await supabase.from('stock').select('precio_venta').eq('id', si.stock_id).maybeSingle()
                              precio = Math.round((st?.precio_venta || 0) / 1.21 * 100) / 100
                            }
                            if (!precio && si.codigo) {
                              const { data: cat } = await supabase.from('catalogo').select('precio_lista').ilike('codigo', si.codigo).limit(1).maybeSingle()
                              precio = Math.round((cat?.precio_lista || 0) / 1.21 * 100) / 100
                            }
                            return { d: si.d, c: si.c, p: precio, codigo: si.codigo||null, stock_id: si.stock_id||null, articulo_id: si.articulo_id||null }
                          })).then(its => setItems(its))
                        }
                      }} className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-blue-50">
                        <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full shrink-0">R-{String(r.numero).padStart(4,'0')}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-p-ink truncate">{r.entregado_a_nombre||r.destinatario_nombre}</p>
                          <p className="text-[10px] text-p-ink2">{r.entregado_a_dominio||''} · {itemsPendientes.length} ítem(s) pendiente(s)</p>
                        </div>
                        <span className="text-[10px] text-p-ink2 shrink-0">{r.fecha?.split('-').reverse().join('/')}</span>
                        {isSelected && <span className="text-[10px] font-bold text-blue-600 shrink-0">✓ Seleccionado</span>}
                      </button>
                      {isSelected && itemsPendientes.length > 0 && (
                        <div className="border-t border-blue-100 px-3 py-2 flex flex-col gap-1">
                          <p className="text-[10px] font-bold text-p-ink2 uppercase mb-1">Seleccioná los ítems a facturar:</p>
                          {(r.items??[]).map((it:any, idx:number) => {
                            const yaFacturado = itemsFacturados.includes(idx)
                            const seleccionado = remitoItemsSel.has(idx)
                            return (
                              <label key={idx} className={`flex items-center gap-2 text-sm cursor-pointer rounded px-2 py-1 ${yaFacturado?'opacity-40 cursor-not-allowed':'hover:bg-blue-50'}`}>
                                <input type="checkbox" disabled={yaFacturado} checked={seleccionado}
                                  onChange={async e=>{
                                    const next = new Set(remitoItemsSel)
                                    if(e.target.checked) next.add(idx); else next.delete(idx)
                                    setRemitoItemsSel(next)
                                    // Cargar ítems seleccionados con precio desde aseguradora/stock/catalogo
                                    const selItems = (r.items??[]).filter((_:any,i:number)=>next.has(i))
                                    const itemsConPrecio = await Promise.all(selItems.map(async (si:any) => {
                                      let precio = si.p || 0
                                      if (!precio && modo === 'aseguradora' && asegSel?.id) {
                                        const { data: pa } = await supabase.from('precios_aseguradora')
                                          .select('precio_siva').eq('aseguradora_id', asegSel.id)
                                          .ilike('descripcion', `%${(si.d||'').split(' ').slice(0,3).join('%')}%`).limit(1).maybeSingle()
                                        precio = pa?.precio_siva || 0
                                      }
                                      if (!precio && si.stock_id) {
                                        const { data: st } = await supabase.from('stock').select('precio_venta').eq('id', si.stock_id).maybeSingle()
                                        precio = Math.round((st?.precio_venta || 0) / 1.21 * 100) / 100
                                      }
                                      if (!precio && si.codigo) {
                                        const { data: cat } = await supabase.from('catalogo').select('precio_lista').ilike('codigo', si.codigo).limit(1).maybeSingle()
                                        precio = Math.round((cat?.precio_lista || 0) / 1.21 * 100) / 100
                                      }
                                      return { d: si.d, c: si.c, p: precio, codigo: si.codigo||null, stock_id: si.stock_id||null, articulo_id: si.articulo_id||null }
                                    }))
                                    setItems(itemsConPrecio)
                                  }}/>
                                {it.codigo && <span className="font-mono text-[10px] bg-p-light px-1 rounded">{it.codigo}</span>}
                                <span className="flex-1 truncate">{it.d}</span>
                                <span className="font-bold shrink-0">×{it.c}</span>
                                {yaFacturado && <span className="text-[10px] text-green-600 shrink-0">✓ Facturado</span>}
                              </label>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {historialCli && !oidParam && (historialCli.presupuestos.length > 0 || historialCli.ordenes.length > 0) && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
              <p className="text-[11px] font-bold text-amber-800 uppercase tracking-wider mb-2">
                📋 {modo==='aseguradora' ? 'OS pendientes de facturar' : 'Presupuestos pendientes de este cliente'}
              </p>
              <div className="flex flex-col gap-1.5">
                {historialCli.presupuestos.map((p:any) => (
                  <button key={p.id} onClick={()=>{
                    setItems(p.items||[])
                    setFiscal(prev=>({...prev, vehiculo:p.vehiculo||prev.vehiculo, tipo_cliente_id:p.tipo_cliente_id||prev.tipo_cliente_id}))
                    setHistorialCli(null)
                  }} className="flex items-center gap-3 bg-white rounded-lg px-3 py-2 text-left hover:bg-amber-50 border border-amber-100 transition-colors w-full">
                    <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full shrink-0">PRES</span>
                    <span className="text-xs text-p-ink flex-1 truncate">{p.vehiculo||'Sin vehículo'} · {p.items?.length||0} ítem(s)</span>
                    <span className="text-xs font-mono font-bold text-p-dark shrink-0">{moneyARS(p.total)}</span>
                    <span className="text-[10px] text-p-ink2 shrink-0">{p.fecha?.split('-').reverse().join('/')}</span>
                  </button>
                ))}
                {historialCli.ordenes.map((o:any) => (
                  <button key={o.id} onClick={()=>{
                    setItems((o.items||[]).map((it:any)=>({...it,codigo:it.codigo||null})))
                    setFiscal(prev=>({...prev, vehiculo:o.vehiculo||prev.vehiculo, patente:o.patente||prev.patente}))
                    if (o.cliente) setClienteAseg(o.cliente)
                    if (o.siniestro) setSiniestro(o.siniestro)
                    setOsSelId(o.id) // guardar el id para marcar al guardar exitosamente
                    setHistorialCli(null)
                  }} className="flex items-center gap-3 bg-white rounded-lg px-3 py-2 text-left hover:bg-amber-50 border border-amber-100 transition-colors w-full">
                    <span className="text-[10px] font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded-full shrink-0">OS-{String(o.numero||0).padStart(4,'0')}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-p-ink truncate">{o.cliente||'Sin nombre'}</p>
                      <p className="text-[10px] text-p-ink2 truncate">{o.vehiculo||''}{o.patente ? ' · ' + o.patente : ''}</p>
                    </div>
                    <span className="text-xs font-mono font-bold text-p-dark shrink-0">{moneyARS(o.total)}</span>
                    <span className="text-[10px] text-p-ink2 shrink-0">{o.fecha?.split('-').reverse().join('/')}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Vehículo"><Input value={fiscal.vehiculo} onChange={e=>setFiscal(p=>({...p,vehiculo:e.target.value}))} placeholder="VW Gol 2015"/></Field>
            <Field label="Patente"><Input value={fiscal.patente} onChange={e=>setFiscal(p=>({...p,patente:e.target.value.toUpperCase()}))} placeholder="AB123CD"/></Field>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-p-ink2 uppercase tracking-wider mb-1.5">Buscar pieza (stock o catálogo)</label>
            <div className="relative">
              <input ref={stockSearchRef} value={stockQ} onChange={e=>setStockQ(e.target.value)}
                placeholder={items.length>0?"+ Agregar otra pieza, servicio o rubro…":"Buscar pieza (stock o catálogo)…"}
                className="w-full border border-p-line rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-p-green bg-white"/>
              {(stockSugs.length>0 || articuloSugs.length>0 || rubrosSugs.length>0) &&(
                <div className="absolute z-20 top-full left-0 right-0 bg-white border border-p-line rounded-xl shadow-xl max-h-64 overflow-y-auto mt-1">
                  {stockSugs.length > 0 && (
                    <>
                      <p className="text-[10px] font-bold text-p-ink2 uppercase tracking-wider px-3 pt-2 pb-1">En stock</p>
                      {stockSugs.map((s:any)=>(
                        <button key={s.id} onClick={()=>{
                          const costoStock = s.costo_neto || s.costo || 0
                          let precioStock = s.precio_venta || 0
                          if (costoStock > 0) {
                            if (modo === 'aseguradora') {
                              const tc = tipos.find((t:any)=>t.nombre==='Compañías')
                              if (tc?.margen_pct) precioStock = Math.round(costoStock*(1 + +tc.margen_pct))
                            } else if (modo === 'cliente') {
                              const tc = tipos.find((t:any)=>t.id===fiscal.tipo_cliente_id)
                              if (tc?.margen_pct) precioStock = Math.round(costoStock*(1 + +tc.margen_pct))
                            } else {
                              // CF: usar precio_lista o precio_venta como referencia
                              precioStock = s.precio_venta || Math.round(costoStock*1.45)
                            }
                          }
                          setItems(prev=>[...prev,{d:s.descripcion,c:1,p:precioStock,costo:costoStock,stock_id:s.id,articulo_id:s.articulo_id||null,codigo:s.codigo||null}])
                          setStockQ(''); setStockSugs([]); setArticuloSugs([])
                        }} className="w-full text-left px-3 py-2.5 hover:bg-p-light border-b border-p-line2 last:border-0 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-p-ink truncate">{s.articulo_id && '🔗 '}{s.descripcion}</p>
                            <p className="text-[10px] text-p-ink2">
                              {s.codigo && <span className="font-mono font-bold text-p-ink mr-1.5">{s.codigo}</span>}
                              Stock: {s.cantidad} u. · Costo: {s.costo?moneyARS(s.costo):'-'}
                            </p>
                          </div>
                          <span className="font-mono font-bold text-sm text-p-dark shrink-0">{s.precio_venta?moneyARS(s.precio_venta):'-'}</span>
                        </button>
                      ))}
                    </>
                  )}
                  {articuloSugs.length > 0 && (
                    <>
                      <p className="text-[10px] font-bold text-p-ink2 uppercase tracking-wider px-3 pt-2 pb-1 border-t border-p-line2">Catálogo proveedores</p>
                      {articuloSugs.map((a:any)=>(
                        <button key={a.id} onClick={()=>{
                          // Precio según tipo de cliente:
                          // modo aseguradora → margen del tipo "Compañías" o precio_lista
                          // modo cliente con tipo → margen del tipo asignado
                          // resto → precio_lista o costo_neto
                          const costo = a.costo_neto || 0
                          let precio = a.precio_lista || costo
                          if (modo === 'aseguradora') {
                            const tipoComp = tipos.find((t:any) => t.nombre === 'Compañías')
                            if (tipoComp?.margen_pct) precio = Math.round(costo * (1 + +tipoComp.margen_pct))
                          } else if (modo === 'cliente') {
                            const tipoSel = tipos.find((t:any) => t.id === fiscal.tipo_cliente_id)
                            if (tipoSel?.margen_pct) precio = Math.round(costo * (1 + +tipoSel.margen_pct))
                          }
                          setItems(prev=>[...prev,{d:a.descripcion,c:1,p:precio,articulo_id:null,codigo:(a as any).codigo||null}])
                          setStockQ(''); setStockSugs([]); setArticuloSugs([])
                          setTimeout(()=>stockSearchRef.current?.focus(), 50)
                        }} className="w-full text-left px-3 py-2.5 hover:bg-amber-50 border-b border-p-line2 last:border-0">
                          <p className="text-sm font-medium text-p-ink">{a.descripcion}</p>
                          <p className="text-[10px] text-p-ink2 flex items-center gap-1.5">
                            {a.codigo && <span className="font-mono font-bold bg-p-light px-1.5 rounded">{a.codigo}</span>}
                            {a.proveedor && <span className="font-bold">{a.proveedor}</span>}
                            {a.costo_neto ? ` · costo ${moneyARS(a.costo_neto)}` : ''}
                          </p>
                        </button>
                      ))}
                    </>
                  )}
                  {rubrosSugs.length > 0 && (
                    <>
                      <p className="text-[10px] font-bold text-p-ink2 uppercase tracking-wider px-3 pt-2 pb-1 border-t border-p-line2">🔧 Servicios y rubros</p>
                      {rubrosSugs.map(r=>(
                        <div key={r.id} className="flex items-center gap-2 px-3 py-2 hover:bg-green-50 border-b border-p-line2 last:border-0">
                          <p className="text-sm font-medium text-p-ink flex-1 truncate">{r.nombre}</p>
                          <input type="number"
                            value={rubrosEdit[r.id]??r.precio_base}
                            onChange={e=>setRubrosEdit(p=>({...p,[r.id]:+e.target.value}))}
                            onClick={e=>e.stopPropagation()}
                            className="w-28 border border-p-line rounded px-2 py-1 text-xs font-mono text-right focus:outline-none focus:border-p-green"/>
                          <button onClick={()=>{
                            addRubro(r)
                            setStockQ(''); setStockSugs([]); setArticuloSugs([])
                          }} style={{background:'#00A550',color:'#fff',border:'none',borderRadius:8,padding:'5px 10px',fontWeight:700,fontSize:12,cursor:'pointer'}}>
                            + Agregar
                          </button>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {items.length>0&&(
            <div className="border-t border-p-line2 pt-2">
              <label className="block text-[11px] font-semibold text-p-ink2 uppercase tracking-wider mb-2">Ítems</label>
              {items.map((it,i)=>(
                <div key={i} className="flex items-center gap-2 py-1.5 border-b border-p-line2">
                  {it.articulo_id && <span className="text-[10px] text-p-green font-bold shrink-0">🔗</span>}
                  {it.stock_id&&<span className="text-[10px] text-blue-500 font-bold shrink-0">📦</span>}
                  <span className="flex-1 text-p-ink min-w-0 text-sm break-words">{it.d}</span>
                  <div className="shrink-0">
                    <div className="text-[9px] text-p-ink2 text-center mb-0.5">cant.</div>
                    <input type="text" inputMode="numeric" min="1" value={it.c} onChange={e=>{const v=Math.max(1,+e.target.value||1);setItems(prev=>prev.map((x,j)=>j===i?{...x,c:v}:x))}} onKeyDown={e=>{if(e.key==='Enter'||e.keyCode===13)e.preventDefault()}}
                      className="w-12 border border-p-line rounded px-1.5 py-0.5 text-xs font-mono text-center focus:outline-none focus:border-p-green"/>
                  </div>
                  <div className="shrink-0">
                    <div className="text-[9px] text-p-ink2 text-center mb-0.5">precio</div>
                    <input type="text" inputMode="decimal"
                      value={precioEditStr[i] ?? String(it.p)}
                      onChange={e=>{
                        const v=e.target.value
                        setPrecioEditStr(prev=>({...prev,[i]:v}))
                        const num=parseFloat(v.replace(',','.'))||0
                        setItems(prev=>prev.map((x,j)=>j===i?{...x,p:num}:x))
                      }}
                      onBlur={e=>{
                        setPrecioEditStr(prev=>{const n={...prev};delete n[i];return n})
                      }}
                      onKeyDown={e=>{if(e.key==='Enter'||e.keyCode===13)e.preventDefault()}}
                      className="w-24 border border-p-line rounded px-1.5 py-0.5 text-xs font-mono text-right focus:outline-none focus:border-p-green"/>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-[9px] text-p-ink2 mb-0.5">total línea</div>
                    <span className="font-mono font-bold text-p-green text-sm">{moneyARS(it.c*it.p)}</span>
                  </div>
                  <button onClick={()=>setItems(prev=>prev.filter((_,j)=>j!==i))} className="text-red-400 text-xs shrink-0">✕</button>
                </div>
              ))}
              {esNegro ? (
                <div className="mt-2">
                  <label className="block text-[11px] font-semibold text-p-ink2 uppercase tracking-wider mb-1.5">IVA a declarar</label>
                  <select value={ivaNegroP} onChange={e=>setIvaNegroP(+e.target.value)}
                    style={{width:'100%',border:'1.5px solid #C2DDD0',borderRadius:10,padding:'9px 12px',fontSize:13,color:'#0C1810',background:'#fff',outline:'none'}}>
                    {IVA_NEGRO_OPTS.map(o=><option key={o.pct} value={o.pct}>{o.label}</option>)}
                  </select>
                </div>
              ) : (
                <p className="text-[11px] text-p-ink2 mt-2">
                  {discriminaIva
                    ? '📋 IVA 21% discriminado — cliente Responsable Inscripto (Factura A)'
                    : '💰 IVA incluido en el precio — no discriminado en esta factura'}
                </p>
              )}
              <div className="bg-p-light rounded-lg p-3 mt-2 text-sm">
                {(discriminaIva||esNegro)&&<div className="flex justify-between text-p-ink2"><span>Subtotal neto</span><span className="font-mono">{moneyARS(neto)}</span></div>}
                {iva>0&&<div className="flex justify-between text-p-ink2">
                  <span>{esNegro?`IVA 21% (sobre ${ivaNegroP}% declarado)`:'IVA 21%'}</span>
                  <span className="font-mono">{moneyARS(iva)}</span>
                </div>}
                <div className="flex justify-between font-saira font-bold text-p-ink text-lg border-t border-p-line mt-1 pt-1"><span>TOTAL</span><span>{moneyARS(total)}</span></div>
              </div>
            </div>
          )}

          <div className="border-t border-p-line2 pt-3">
            <div className="flex items-center justify-between mb-2">
              <label className="text-[11px] font-semibold text-p-ink2 uppercase tracking-wider">Formas de pago</label>
              <div className="flex gap-2">
                {total>0&&<button onClick={distribuirTotal} style={{...btnGray,padding:'4px 10px',fontSize:11}}>Distribuir total</button>}
                <button onClick={addPago} style={{...btnSm,padding:'4px 10px',fontSize:11}}>+ Agregar</button>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              {pagos.map((p,i)=>(
                <div key={i}>
                  <div className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-5">
                      <Select value={p.metodo} onChange={e=>updPago(i,'metodo',e.target.value)}>
                        {METODOS.map(m=><option key={m} value={m}>{m}</option>)}
                      </Select>
                    </div>
                    {p.metodo.startsWith('Crédito')&&(
                      <div className="col-span-2">
                        <Select value={p.cuotas||1} onChange={e=>updPago(i,'cuotas',+e.target.value)}>
                          {CUOTAS.map(c=><option key={c} value={c}>{c}c</option>)}
                        </Select>
                      </div>
                    )}
                    <div className={p.metodo.startsWith('Crédito')?'col-span-4':'col-span-6'}>
                      <Input value={p.monto} onChange={e=>updPago(i,'monto',e.target.value)} placeholder="$ monto"/>
                    </div>
                    {pagos.length>1&&<button onClick={()=>delPago(i)} className="text-red-400 text-xs col-span-1">✕</button>}
                  </div>
                  {p.metodo==='Cheque'&&(
                    <div className="mt-1.5">
                      <ChequeFields value={chequesPago[i]||EMPTY_CHEQUE} onChange={v=>setChequesPago(prev=>({...prev,[i]:v}))}/>
                    </div>
                  )}
                </div>
              ))}
              {usaCC && modo==='cf' && (
                <p className="text-xs font-bold text-red-500">⚠ Cuenta corriente no está disponible para Consumidor Final — elegí "Cliente" o "Aseguradora" arriba.</p>
              )}
              {total>0&&Math.abs(diferencia)>1&&(
                <p className={`text-xs font-bold mt-1 ${diferencia>0?'text-amber-600':'text-red-500'}`}>
                  {diferencia>0?`Falta: ${moneyARS(diferencia)}`:`Exceso: ${moneyARS(Math.abs(diferencia))}`}
                </p>
              )}
            </div>
          </div>

          <Field label="Observaciones"><Input value={obs} onChange={e=>setObs(e.target.value)} placeholder="Opcional…"/></Field>

          <div className="flex justify-end gap-2 pt-1">
            <button onClick={()=>setOpen(false)} style={btnGray}>Cancelar</button>
            <button type="button" onClick={save} disabled={!puedeGuardar || (usaCC && modo==='cf') || saving} style={{...btn,opacity:(!puedeGuardar || (usaCC && modo==='cf') || saving)?.5:1}}>
              {saving ? 'Guardando…' : '✓ Emitir comprobante'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal Nota de Crédito */}
      <Modal open={!!ncComp} onClose={()=>setNcComp(null)} title={`Nota de Crédito — Comprobante ${ncComp?.numero}`}>
        {ncComp && (
          <div className="flex flex-col gap-3">
            {/* Info del comprobante original */}
            <div className="bg-p-light rounded-xl px-4 py-3 text-sm flex flex-col gap-1">
              <p className="text-[11px] font-bold text-p-ink2 uppercase tracking-wide mb-0.5">Comprobante original</p>
              <div className="flex flex-wrap gap-x-4 gap-y-0.5">
                {ncComp.aseguradora_nombre && (
                  <span><span className="text-p-ink2">Aseguradora: </span><span className="font-semibold">{ncComp.aseguradora_nombre}</span></span>
                )}
                {ncComp.cliente_nombre && (
                  <span><span className="text-p-ink2">{ncComp.aseguradora_nombre ? 'Asegurado: ' : 'Cliente: '}</span><span className="font-semibold">{ncComp.cliente_nombre}</span></span>
                )}
                {(ncComp as any).siniestro && (
                  <span><span className="text-p-ink2">Siniestro: </span><span className="font-semibold">{(ncComp as any).siniestro}</span></span>
                )}
                {ncComp.vehiculo && (
                  <span><span className="text-p-ink2">Vehículo: </span><span className="font-semibold">{ncComp.vehiculo}</span></span>
                )}
                {(ncComp as any).patente && (
                  <span><span className="text-p-ink2">Patente: </span><span className="font-semibold">{(ncComp as any).patente}</span></span>
                )}
                {ncComp.cliente_tipo_fiscal && (
                  <span><span className="text-p-ink2">Cond. IVA: </span><span className="font-semibold">{tipoFiscalLabel(ncComp.cliente_tipo_fiscal)}</span></span>
                )}
              </div>
            </div>
            <p className="text-[11px] text-p-ink2">
              Destildá lo que no se devuelve o ajustá la cantidad. Al confirmar: se devuelve el stock de lo seleccionado,
              se resta de Caja del día de hoy{!ncComp.es_negro && ['A','B','C'].includes(ncComp.tipo) ? ', y se emite con su propio CAE en AFIP.' : '.'}
            </p>
            <div className="flex flex-col gap-1.5">
              {ncComp.items.map((it, i) => (
                <label key={i} className={`flex items-center gap-3 border rounded-lg px-3 py-2 ${ncSel[i]?.on ? 'border-amber-400 bg-amber-50' : 'border-p-line'}`}>
                  <input type="checkbox" checked={!!ncSel[i]?.on}
                    onChange={()=>setNcSel(p=>({...p, [i]:{ on: !p[i]?.on, cant: p[i]?.cant ?? it.c }}))}
                    className="accent-amber-500"/>
                  <span className="flex-1 text-sm truncate">{it.d}</span>
                  <input type="number" min={0} max={it.c} value={ncSel[i]?.cant ?? it.c}
                    onChange={e=>setNcSel(p=>({...p, [i]:{ on: p[i]?.on ?? true, cant: Math.min(it.c, Math.max(0, +e.target.value)) }}))}
                    disabled={!ncSel[i]?.on}
                    className="w-16 border border-p-line rounded-lg px-2 py-1 text-sm text-center"/>
                  <span className="text-xs text-p-ink2">/ {it.c}</span>
                  <span className="font-mono font-bold text-sm w-24 text-right">{moneyARS(it.p * (ncSel[i]?.cant ?? it.c))}</span>
                </label>
              ))}
            </div>
            <div className="bg-p-light rounded-xl p-3 flex flex-col gap-1.5">
              <div className="flex justify-between text-sm"><span className="text-p-ink2">Neto</span><span className="font-mono">{moneyARS(ncNeto)}</span></div>
              <div className="flex justify-between text-sm"><span className="text-p-ink2">IVA</span><span className="font-mono">{moneyARS(ncIva)}</span></div>
              <div className="flex justify-between font-saira font-bold text-lg border-t border-p-line mt-1 pt-1">
                <span>TOTAL NC</span><span>{moneyARS(ncTotal)}</span>
              </div>
            </div>
            <Field label="Motivo">
              <Input value={ncMotivo} onChange={e=>setNcMotivo(e.target.value)} placeholder="Devolución, error de carga, etc."/>
            </Field>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={()=>setNcComp(null)} style={btnGray}>Cancelar</button>
              <button onClick={confirmarNC} disabled={ncLoading || ncItemsSel.length===0}
                style={{...btn,background:'#d97706',opacity:(ncLoading || ncItemsSel.length===0)?.5:1}}>
                {ncLoading ? 'Generando…' : '🧾 Confirmar Nota de Crédito'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal Nota de Débito */}
      <Modal open={!!ndComp} onClose={()=>setNdComp(null)} title={'Nota de Débito — Comprobante ' + (ndComp?.numero??'')}>
        {ndComp && (
          <div className="flex flex-col gap-4">
            <div className="bg-p-light rounded-xl px-4 py-3 text-sm">
              <p className="text-p-ink2">Comprobante original:</p>
              <p className="font-bold">{ndComp.tipo}-0006-{String(ndComp.nro_cbte_afip??ndComp.numero).padStart(8,'0')} · {ndComp.aseguradora_nombre||ndComp.cliente_nombre}</p>
            </div>

            <Field label="Concepto *">
              <select value={ndConcepto} onChange={e=>{
                const c = CONCEPTOS_ND.find(x=>x.label===e.target.value)
                setNdConcepto(e.target.value)
                if (c) setNdIvaOn(c.iva)
              }} className="w-full border border-p-line rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-p-green">
                <option value="">Seleccioná un concepto…</option>
                {CONCEPTOS_ND.map(c=><option key={c.label}>{c.label}</option>)}
              </select>
            </Field>

            <Field label={ndIvaOn ? 'Monto total (con IVA) *' : 'Monto *'}>
              <Input value={ndMonto} onChange={e=>setNdMonto(e.target.value)} placeholder="$" type="number"/>
            </Field>

            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={ndIvaOn} onChange={e=>setNdIvaOn(e.target.checked)} className="accent-p-green"/>
              Incluye IVA 21%
            </label>

            {ndMontoNum > 0 && (
              <div className="bg-purple-50 border border-purple-200 rounded-xl px-4 py-3 text-sm flex flex-col gap-1">
                {ndIvaOn && <div className="flex justify-between text-p-ink2"><span>Neto</span><span className="font-mono">{moneyARS(ndNeto)}</span></div>}
                {ndIvaOn && <div className="flex justify-between text-p-ink2"><span>IVA 21%</span><span className="font-mono">{moneyARS(ndIva)}</span></div>}
                <div className="flex justify-between font-bold text-purple-700 border-t border-purple-200 pt-1">
                  <span>TOTAL ND</span><span className="font-mono font-saira text-lg">{moneyARS(ndTotal)}</span>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button onClick={()=>setNdComp(null)} style={btnGray}>Cancelar</button>
              <button onClick={confirmarND} disabled={ndLoading || !ndConcepto || ndMontoNum<=0}
                style={{...btn,background:'#7c3aed',opacity:(ndLoading||!ndConcepto||ndMontoNum<=0)?.5:1}}>
                {ndLoading ? 'Generando…' : '🧾 Confirmar Nota de Débito'}
              </button>
            </div>
          </div>
        )}
      </Modal>
      <Modal open={!!adjModal} onClose={()=>setAdjModal(null)} title={`Adjuntos — ${adjModal?.cliente_nombre||adjModal?.aseguradora_nombre||''} N°${adjModal?.numero||''}`}>
        {adjModal && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              {adjuntos.length === 0 && <p className="text-sm text-p-ink2 text-center py-4">Sin adjuntos todavía</p>}
              {adjuntos.map((a:any) => (
                <div key={a.id} className="flex items-center gap-3 bg-p-light rounded-xl px-3 py-2">
                  <span className="text-xs font-bold text-p-ink2 w-28 shrink-0">{a.tipo === 'os_firmada' ? '📋 OS firmada' : '📷 Foto'}</span>
                  <a href={a.url} target="_blank" rel="noreferrer" className="flex-1 text-sm text-p-green underline truncate">{a.nombre}</a>
                  {!a._de_os && (
                    <button onClick={()=>eliminarAdjunto(a.id, a.storage_path)} className="text-red-400 hover:text-red-600 text-xs shrink-0">✕</button>
                  )}
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-xs font-bold text-p-ink2 uppercase tracking-wide">Subir nuevo</p>
              <div className="flex gap-2">
                <label className="flex-1 cursor-pointer">
                  <span style={{...btnSm, background:'#1d4ed8', display:'block', textAlign:'center'}}>📋 OS firmada</span>
                  <input type="file" accept="image/*,application/pdf" className="hidden" disabled={uploading} onChange={e=>{ const f=e.target.files?.[0]; if(f) subirArchivo(f,'os_firmada'); e.target.value='' }}/>
                </label>
                <label className="flex-1 cursor-pointer">
                  <span style={{...btnSm, background:'#6b7280', display:'block', textAlign:'center'}}>📷 Foto</span>
                  <input type="file" accept="image/*" className="hidden" disabled={uploading} onChange={e=>{ const f=e.target.files?.[0]; if(f) subirArchivo(f,'foto'); e.target.value='' }}/>
                </label>
              </div>
              {uploading && <p className="text-xs text-p-ink2 text-center">Subiendo…</p>}
            </div>
            {adjuntos.length > 0 && (
              <button onClick={generarPDFCombinado} disabled={genPDF} style={{...btnSm, background:'#00A550'}}>
                {genPDF ? 'Generando…' : '⬇ Descargar expediente PDF'}
              </button>
            )}
            <div className="flex justify-end">
              <button onClick={()=>setAdjModal(null)} style={btnGray}>Cerrar</button>
            </div>
          </div>
        )}
      </Modal>
      <Modal open={!!verComp} onClose={()=>setVerComp(null)} title="Detalle del comprobante">
        {verComp && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="font-mono text-sm font-bold text-p-dark bg-p-light px-3 py-1 rounded-full">
                {verComp.categoria==='nc'?'NC':(verComp.tipo==='A'?'FA':verComp.tipo==='B'?'FB':verComp.tipo==='C'?'FC':'X')}-0006-{String(verComp.nro_cbte_afip ?? verComp.numero ?? 0).padStart(8,'0')}
              </span>
              <span className="text-sm text-p-ink2">{verComp.fecha.split('-').reverse().join('/')}</span>
            </div>
            {verComp.categoria==='nc' && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 text-xs text-amber-700">
                🧾 Nota de Crédito{verComp.motivo_nc?` — ${verComp.motivo_nc}`:''}
                {(() => {
                  const original = comps.find(x=>x.id===verComp.comprobante_original_id)
                  return original ? <> · corresponde a {original.tipo==='A'?'FA':original.tipo==='B'?'FB':'FC'}-{String(original.nro_cbte_afip ?? original.numero ?? 0).padStart(8,'0')}</> : null
                })()}
              </div>
            )}

            <div className="bg-p-light rounded-xl p-3 grid grid-cols-2 gap-2 text-sm">
              {verComp.aseguradora_nombre && <div className="col-span-2"><span className="text-p-ink2">Aseguradora: </span><span className="font-semibold">{verComp.aseguradora_nombre}</span></div>}
              <div><span className="text-p-ink2">{verComp.aseguradora_nombre?'Asegurado: ':'Cliente: '}</span><span className="font-semibold">{verComp.cliente_nombre || 'Consumidor Final'}</span></div>
              {(verComp as any).siniestro && <div><span className="text-p-ink2">N° Siniestro: </span>{(verComp as any).siniestro}</div>}
              {verComp.cliente_telefono && <div><span className="text-p-ink2">Tel: </span>{verComp.cliente_telefono}</div>}
              {verComp.cliente_cuit && <div><span className="text-p-ink2">{verComp.cliente_tipo_fiscal==='consumidor_final'||verComp.cliente_cuit?.length<=8?'DNI: ':'CUIT: '}</span>{verComp.cliente_cuit}</div>}
              {verComp.cliente_tipo_fiscal && <div><span className="text-p-ink2">Cond. IVA: </span>{tipoFiscalLabel(verComp.cliente_tipo_fiscal)}</div>}
              {verComp.vehiculo && <div><span className="text-p-ink2">Vehículo: </span>{verComp.vehiculo}</div>}
              {(verComp as any).patente && <div><span className="text-p-ink2">Patente: </span>{(verComp as any).patente}</div>}
            </div>

            <div>
              <p className="text-[11px] font-bold text-p-ink2 uppercase tracking-wide mb-1.5">Ítems</p>
              <div className="flex flex-col gap-1">
                {verComp.items.map((it,i)=>{
                  const cod = (it as any).codigo || detailDescMap[it.d] || null
                  return (
                  <div key={i} className="flex items-center justify-between text-sm border-b border-p-line2 py-1.5 gap-2">
                    <div className="flex-1 min-w-0">
                      {cod && <span className="text-[10px] font-mono font-bold bg-p-light text-p-ink2 px-1.5 py-0.5 rounded mr-1.5">{cod}</span>}
                      <span>{it.d}</span>
                    </div>

                    <span className="text-p-ink2 shrink-0">x{it.c}</span>
                    <span className="font-mono shrink-0 text-right">{moneyARS(it.p*it.c)}</span>
                  </div>
                )})}
              </div>
            </div>

            <div className="bg-p-light rounded-xl p-3 flex flex-col gap-1">
              <div className="flex justify-between text-sm"><span className="text-p-ink2">Neto</span><span className="font-mono">{moneyARS(verComp.neto)}</span></div>
              <div className="flex justify-between text-sm"><span className="text-p-ink2">IVA</span><span className="font-mono">{moneyARS(verComp.iva)}</span></div>
              <div className="flex justify-between font-saira font-bold text-lg border-t border-p-line mt-1 pt-1">
                <span>TOTAL</span><span>{moneyARS(verComp.total)}</span>
              </div>
            </div>

            {verComp.pagos?.length > 0 && (
              <div>
                <p className="text-[11px] font-bold text-p-ink2 uppercase tracking-wide mb-1.5">Forma de pago</p>
                {verComp.pagos.map((p,i)=>(
                  <div key={i} className="flex justify-between text-sm py-0.5">
                    <span>{p.metodo}{p.cuotas?` (${p.cuotas} cuotas)`:''}</span>
                    <span className="font-mono">{moneyARS(+p.monto)}</span>
                  </div>
                ))}
              </div>
            )}

            {!verComp.es_negro && ['A','B','C'].includes(verComp.tipo) && (
              <div className={`rounded-lg p-3 text-sm ${verComp.cae_emitido?'bg-green-50 text-green-700':'bg-red-50 text-red-700'}`}>
                {verComp.cae_emitido
                  ? <>✓ CAE {verComp.cae_emitido}{verComp.cae_vencimiento?` · Vto. ${verComp.cae_vencimiento.split('-').reverse().join('/')}`:''}</>
                  : '⚠ Sin CAE'}
              </div>
            )}
            {(rol==='gerencial'||rol==='admin') && verComp.es_negro && (
              <div className="rounded-lg p-3 text-sm bg-gray-800 text-white">🔘 Comprobante sin CAE — venta interna</div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button onClick={()=>setVerComp(null)} style={btnGray}>Cerrar</button>
              <button onClick={()=>descargar(verComp)} style={btnSm}>⬇ PDF</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
