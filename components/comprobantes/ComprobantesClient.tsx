'use client'
import { LOGO_BASE64 } from '@/lib/logo'
import { FIRMA_SAPPA } from '@/lib/firma'
import { useState, useEffect, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Modal, Field, Input, Select, Empty } from '@/components/ui'
import { moneyARS, todayStr } from '@/lib/utils/format'

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

// Formas de pago
const METODOS = ['Efectivo','Transferencia','Tarjeta','Cuenta corriente']
const CUOTAS  = [1,2,3,6,9,12,18,24]
const TIPO_FISCAL = [
  { id:'consumidor_final', label:'Consumidor Final' },
  { id:'monotributo',      label:'Monotributista'   },
  { id:'responsable_inscripto', label:'Responsable Inscripto' },
]

interface TipoCliente { id:string; nombre:string; margen_pct:number }
interface ClienteMin  { id:string; nombre:string; telefono:string|null; email:string|null; cuit:string|null; tipo_fiscal:string|null; tipo_cliente_id:string|null; vehiculo_habitual?:string }

interface Pago { metodo:string; monto:string; cuotas?:number }

interface Comprobante {
  id:string; numero:number|null; fecha:string; tipo:string
  cliente_id:string|null; cliente_nombre:string|null; cliente_telefono:string|null; cliente_cuit:string|null
  cliente_tipo_fiscal:string|null; tipo_cliente_nombre:string|null; vehiculo:string|null
  items:any[]; neto:number; iva:number; total:number; pagos:Pago[]
  presupuesto_id:string|null; orden_id:string|null; created_at:string; cae_emitido?:string
}

export default function ComprobantesClient({ userId, rol = 'ventas' }: { userId:string; rol?:string }) {
  const [comps, setComps]     = useState<Comprobante[]>([])
  const [open, setOpen]       = useState(false)
  const [tipos, setTipos]     = useState<TipoCliente[]>([])
  const supabase = createClient()
  const router   = useRouter()
  const searchParams = useSearchParams()

  // Estado del formulario
  const [cliQ, setCliQ]         = useState('')
  const [cliSugs, setCliSugs]   = useState<ClienteMin[]>([])
  const [cliSel, setCli]        = useState<ClienteMin|null>(null)
  const [showFiscal, setShowFiscal] = useState(false)
  const [ivaOn, setIvaOn]       = useState(false)
  const [ivaNegroP, setIvaNegroP] = useState(75) // % del total que se declara como base imponible

  const emptyFiscal = { tipo_fiscal:'consumidor_final', cuit:'', dni:'', razon_social:'', tipo_cliente_id:'', vehiculo:'' }
  const [fiscal, setFiscal]     = useState(emptyFiscal)
  const [items, setItems]       = useState<{d:string;c:number;p:number;costo?:number;stock_id?:string}[]>([])
  const [stockQ, setStockQ]     = useState('')
  const [stockSugs, setStockSugs] = useState<any[]>([])
  const [pagos, setPagos]       = useState<Pago[]>([{ metodo:'Efectivo', monto:'' }])
  const [toast, setToast]       = useState('')
  // Adjuntos
  const [adjModal, setAdjModal]   = useState<Comprobante|null>(null)
  const [adjuntos, setAdjuntos]   = useState<any[]>([])
  const [uploading, setUploading] = useState(false)
  const [genPDF, setGenPDF]       = useState(false)
  const [historialCli, setHistorialCli] = useState<{presupuestos:any[];ordenes:any[]}|null>(null)
  const [tarjConfigs, setTarjConfigs]     = useState<any[]>([])
  const [pagoTarjConfig, setPagoTarjConfig] = useState('')  // config_id seleccionado para tarjeta
  const [obs, setObs]           = useState('')
  const [nextNum, setNextNum]     = useState<number|null>(null)
  const [emitiendo, setEmitiendo] = useState(false)
  const [caeResult, setCaeResult] = useState<{cae:string;nro:number}|null>(null)
  // Nota de crédito
  const [ncModal, setNcModal] = useState<Comprobante|null>(null)
  const [ncTipo, setNcTipo] = useState<'total'|'parcial'>('total')
  const [ncItems, setNcItems] = useState<{d:string;c:number;p:number}[]>([])
  const [ncDevolucion, setNcDevolucion] = useState<'efectivo'|'vale'|'tarjeta'|'cuenta_corriente'>('efectivo')
  const [ncObs, setNcObs] = useState('')
  const [ncSaving, setNcSaving] = useState(false)
  const [ncPago, setNcPago] = useState<'devolver'|'acreditar'|null>(null)
  const [osPendientes, setOsPendientes] = useState<any[]>([])
  const [osModal, setOsModal] = useState(false)
  const [osSel, setOsSel] = useState<string|null>(null)
  const [tarjetaModal, setTarjetaModal] = useState(false)
  const [pagosModal, setPagosModal] = useState(false)
  const [tarjetaIdx, setTarjetaIdx] = useState(0)
  const [tarjetaForm, setTarjetaForm] = useState({ tipo:'credito', nombre:'Visa', cuotas:1 })

  const TARJETAS = ['Visa','Mastercard','American Express','Naranja','Cabal','MODO','Mercado Pago']
  const CUOTAS = [1,2,3,6,9,12,18,24] // id de la OS seleccionada

  // Buscar OS pendientes del cliente seleccionado
  useEffect(()=>{
    if (!cliSel && !cliQ) { setOsPendientes([]); return }
    const nombre = cliSel?.nombre || cliQ
    if (nombre.length < 3) { setOsPendientes([]); return }
    supabase.from('ordenes_servicio')
      .select('id,numero,fecha,cliente,vehiculo,items,neto,iva,total')
      .ilike('cliente', `%${nombre}%`)
      .eq('convertido_comp', false)
      .order('created_at', { ascending: false })
      .limit(5)
      .then(({ data }) => setOsPendientes(data ?? []))
  }, [cliSel, cliQ, supabase])

  // Búsqueda de stock
  useEffect(()=>{
    if(stockQ.trim().length<2){setStockSugs([]);return}
    supabase.from('stock').select('id,descripcion,cantidad,precio_venta,costo').eq('activo',true).gt('cantidad',0)
      .ilike('descripcion',`%${stockQ}%`).limit(8)
      .then(({data})=>setStockSugs(data??[]))
  },[stockQ,supabase])

  // Totales
  const esNegro = rol === 'caja'
  const neto  = items.reduce((a,it)=>a+it.c*it.p, 0)
  // En negro: el IVA se calcula sobre el % declarado del total
  const iva   = esNegro
    ? (ivaNegroP > 0 ? Math.round((neto * ivaNegroP / 100) * IVA) : 0)
    : (ivaOn ? Math.round(neto*IVA) : 0)
  const total = neto + iva
  const totalPagado = pagos.reduce((a,p)=>a+(parseFloat(p.monto.replace(/[^0-9.]/g,''))||0), 0)
  const diferencia  = total - totalPagado
  // Validaciones
  const esFacturaA    = fiscal.tipo_fiscal === 'responsable_inscripto'
  const esCF          = !fiscal.tipo_fiscal || fiscal.tipo_fiscal === 'consumidor_final'
  const nombreCliente = cliSel?.nombre || cliQ
  const faltaNombre   = !nombreCliente.trim()
  const faltaCuit     = !esCF && !fiscal.cuit
  const faltaDni      = esCF && !fiscal.dni
  const hayError      = faltaNombre || faltaCuit || faltaDni
  const puedeEmitir   = !hayError && items.length > 0

  useEffect(() => {
    supabase.from('comprobantes').select('*').order('created_at',{ascending:false}).then(({data})=>setComps(data??[]))
    supabase.from('tarjetas_config').select('*').eq('activo',true).order('banco').order('red').order('cuotas').then(({data})=>setTarjConfigs(data??[]))
    supabase.from('tipos_cliente').select('*').order('nombre').then(({data})=>setTipos(data??[]))
  },[supabase])

  // Pre-cargar desde presupuesto o OS
  useEffect(() => {
    const cli  = searchParams.get('cli')
    const tel  = searchParams.get('tel')
    const veh  = searchParams.get('veh')
    const itm  = searchParams.get('items')
    const tot  = searchParams.get('total')
    const iva_ = searchParams.get('iva')
    const pid  = searchParams.get('pid')
    const oid  = searchParams.get('oid')
    const tipoN = searchParams.get('tipo_nombre')
    const tipoId = searchParams.get('tipo_id')
    if (cli || tel) {
      setFiscal(p=>({...p, vehiculo:veh||'', tipo_cliente_id:tipoId||'' }))
      // Pre-fill como consumidor final con el nombre
      if(cli) {
        setCli({ id:'', nombre:cli, telefono:tel, email:null, cuit:null, tipo_fiscal:'consumidor_final', tipo_cliente_id:tipoId||null })
        setCliQ(cli)
        setCliSugs([]) // No mostrar dropdown al pre-cargar
      }
    }
    if(itm){ try { setItems(JSON.parse(itm)) } catch {} }
    if(iva_&&+iva_>0) setIvaOn(true)
    if(cli||tel) {
      // Calcular próximo número al abrir desde presupuesto/OS
      supabase.from('comprobantes').select('numero').order('numero',{ascending:false}).limit(1)
        .then(({data})=>setNextNum(((data?.[0] as any)?.numero ?? 0) + 1))
      setOpen(true)
    }
  },[searchParams])

  // Búsqueda de clientes por nombre o celular
  useEffect(()=>{
    if(cliQ.trim().length < 2){ setCliSugs([]); return }
    supabase.from('clientes').select('id,nombre,telefono,email,cuit,tipo_fiscal,tipo_cliente_id,notas')
      .or(`nombre.ilike.%${cliQ}%,telefono.ilike.%${cliQ}%`).limit(6)
      .then(({data})=>setCliSugs((data??[]) as ClienteMin[]))
  },[cliQ,cliSel,supabase])

  async function selectCliente(c:ClienteMin){
    setCli(c); setCliQ(c.nombre); setCliSugs([])
    setFiscal(p=>({...p, tipo_fiscal:c.tipo_fiscal||'consumidor_final', cuit:c.cuit||'', tipo_cliente_id:c.tipo_cliente_id||'' }))
    if(c.tipo_fiscal && c.tipo_fiscal !== 'consumidor_final') setShowFiscal(true)
    // Cargar historial del cliente
    const [pres, ords] = await Promise.all([
      supabase.from('presupuestos').select('id,fecha,total,items,vehiculo,tipo_cliente_nombre')
        .or(`cliente.ilike.%${c.nombre}%${c.telefono?`,telefono.eq.${c.telefono}`:''}`)
        .eq('convertido_os',false).eq('convertido_comp',false).order('created_at',{ascending:false}).limit(4),
      supabase.from('ordenes_servicio').select('id,numero,fecha,total,items,vehiculo,aseguradora')
        .or(`cliente.ilike.%${c.nombre}%${c.telefono?`,telefono.eq.${c.telefono}`:''}`)
        .order('created_at',{ascending:false}).limit(4),
    ])
    setHistorialCli({ presupuestos: pres.data??[], ordenes: ords.data??[] })
  }

  function usarConsumidorFinal(){
    setCli(null); setHistorialCli(null)
    setFiscal(p=>({...p, tipo_fiscal:'consumidor_final', cuit:'' }))
    setShowFiscal(false)
  }

  function addPago(){ setPagos(p=>[...p,{metodo:'Efectivo',monto:''}]) }
  function updPago(i:number, k:keyof Pago, v:any){ setPagos(prev=>prev.map((p,j)=>j===i?{...p,[k]:v}:p)) }
  function delPago(i:number){ if(pagos.length>1) setPagos(prev=>prev.filter((_,j)=>j!==i)) }
  function distribuirTotal(){ setPagos(prev=>prev.map((p,i)=>i===0?{...p,monto:String(total)}:p)) }

  const tipoFiscalLabel = (tf:string|null) => TIPO_FISCAL.find(t=>t.id===tf)?.label || 'Consumidor Final'
  const tipoDoc = () => {
    if(fiscal.tipo_fiscal==='responsable_inscripto') return 'A'
    return 'B' // RI emite solo A o B — nunca C (esa la emite el monotributista)
  }

  async function save(){
    if(!items.length) return
    if(faltaNombre) { alert('El nombre del cliente es obligatorio.'); return }
    if(faltaDni) { alert('El DNI es obligatorio para Consumidor Final.'); setShowFiscal(true); return }
    if(faltaCuit) { alert(`El CUIT es obligatorio para ${tipoFiscalLabel(fiscal.tipo_fiscal)}.`); setShowFiscal(true); return }
    const { data:last } = await supabase.from('comprobantes').select('numero').order('numero',{ascending:false}).limit(1)
    const nextNum = ((last?.[0] as any)?.numero ?? 0) + 1
    const pid = searchParams.get('pid'), oid = osSel || searchParams.get('oid')
    const tipoC = tipos.find(t=>t.id===fiscal.tipo_cliente_id)

    const { data:comp } = await supabase.from('comprobantes').insert({
      numero:nextNum, fecha:todayStr(), tipo:tipoDoc(),
      cliente_id: cliSel?.id||null,
      cliente_nombre: cliSel?.nombre||cliQ||null,
      cliente_telefono: cliSel?.telefono||null,
      cliente_cuit: fiscal.cuit||null,
      cliente_dni: fiscal.dni||null,
      cliente_tipo_fiscal: fiscal.tipo_fiscal||'consumidor_final',
      tipo_cliente_id: fiscal.tipo_cliente_id||null,
      tipo_cliente_nombre: tipoC?.nombre||null,
      vehiculo: fiscal.vehiculo||null,
      presupuesto_id: pid||null,
      orden_id: oid||null,
      items, neto, iva_pct:IVA, iva, total,
      es_negro: esNegro,
      iva_negro_pct: esNegro ? ivaNegroP : null,
      pagos: pagos.filter(p=>p.monto),
      observaciones: obs||null,
      user_id: userId,
    }).select().single()

    // Si algún pago es cuenta corriente, registrar movimiento en CC
    const pagosCC = pagos.filter(p => p.metodo === 'Cuenta corriente' && parseFloat(p.monto.replace(/[^0-9.]/g,'')) > 0)
    if (pagosCC.length > 0 && comp) {
      const nombreCliente = cliSel?.nombre || cliQ
      const montCC = pagosCC.reduce((a,p) => a + (parseFloat(p.monto.replace(/[^0-9.]/g,'')) || 0), 0)
      await supabase.from('cuenta_corriente').insert({
        cliente_id: cliSel?.id || null,
        cliente_nombre: nombreCliente,
        fecha: todayStr(),
        tipo: 'comprobante',
        descripcion: `Comprobante N°${nextNum}`,
        debe: montCC,
        haber: 0,
        comprobante_id: (comp as any).id,
        notas: null,
        user_id: userId,
      })
    }

    // Descontar stock para items vinculados
    for(const it of items){
      if(it.stock_id && it.c > 0){
        const {data:s} = await supabase.from('stock').select('cantidad').eq('id',it.stock_id).single()
        if(s) await supabase.from('stock').update({cantidad:Math.max(0,(s as any).cantidad-it.c)}).eq('id',it.stock_id)
      }
    }
    const costoTotal = items.reduce((a,it)=>a+(it.costo||0)*it.c, 0)
    const tieneTodoCosto = items.every(it=>it.costo!=null&&it.costo>0)

    // Registrar venta automáticamente en Caja
    if(comp) {
      await supabase.from('ventas').insert({
        fecha:todayStr(), descripcion:`Comprobante ${nextNum} - ${cliSel?.nombre||cliQ||'CF'}`,
        precio:total, costo:null, pendiente:true,
        comprobante_id:(comp as any).id,
        tipo_cliente_id:fiscal.tipo_cliente_id||null,
        tipo_cliente_nombre:tipoC?.nombre||null,
        user_id:userId,
      })
    }

    // Marcar OS como facturada si viene de una OS
    if (oid) {
      await supabase.from('ordenes_servicio').update({ convertido_comp: true }).eq('id', oid)
      setOsSel(null)
    }

    // Emitir factura electrónica en ARCA automáticamente
    if (comp && !esNegro) {
      setEmitiendo(true)
      try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
        const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        const tipoCbte = tipoDoc() === 'A' ? 1 : 6
        const esFacturaA = tipoCbte === 1

        // Cálculo correcto de IVA:
        // Los precios cargados YA incluyen IVA (precio final al cliente)
        // ARCA necesita: impNeto (sin IVA) + impIva + impTotal
        const tieneIva = ivaOn && iva > 0
        const impTotal = total
        const impNeto  = tieneIva ? Math.round(total / 1.21 * 100) / 100 : total
        const impIva   = tieneIva ? Math.round((total - impNeto) * 100) / 100 : 0

        // DocTipo y DocNro según tipo de cliente
        // DocTipo: 80=CUIT, 96=DNI, 99=Sin identificar
        const docTipo = esFacturaA ? 80 : (fiscal.dni ? 96 : 99)
        const docNro  = esFacturaA
          ? (fiscal.cuit?.replace(/[^0-9]/g,'') || '0')
          : (fiscal.dni?.replace(/[^0-9]/g,'') || '0')

        const resp = await fetch(`${supabaseUrl}/functions/v1/arca-facturar`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${anonKey}` },
          body: JSON.stringify({
            comprobante_id: (comp as any).id,
            tipoCbte,
            impTotal,
            impNeto,
            impIva,
            concepto: 1,
            docTipo,
            docNro,
            // ivaAlicuota 5 = 21% — solo se manda si hay IVA
            ivaAlicuota: tieneIva ? 5 : undefined,
          })
        })
        const arcaData = await resp.json()
        if (arcaData.ok) {
          setCaeResult({ cae: arcaData.cae, nro: arcaData.nro_cbte })
          await supabase.from('comprobantes').update({ cae_emitido: arcaData.cae }).eq('id', (comp as any).id)
        } else {
          console.error('ARCA error:', arcaData.error)
          alert(`Error ARCA: ${arcaData.error}`)
        }
      } catch(e) { console.error('Error ARCA:', e) }
      setEmitiendo(false)
    }

    setOpen(false)
    setItems([]); setPagos([{metodo:'Efectivo',monto:''}])
    setCli(null); setCliQ(''); setFiscal(emptyFiscal); setObs(''); setIvaOn(false); setOsSel(null)
    router.push('/comprobantes')
    const {data}=await supabase.from('comprobantes').select('*').order('created_at',{ascending:false})
    setComps(data??[])
  }

  // ── Nota de Crédito ──────────────────────────────────────────────────────────
  function abrirNC(comp: Comprobante) {
    setNcModal(comp)
    setNcTipo('total')
    setNcItems(comp.items.map((it:any) => ({d:it.d, c:it.c, p:it.p})))
    // Detectar forma de pago predominante
    const pagosComp = comp.pagos ?? []
    const tieneTarjeta = pagosComp.some((p:any) => p.metodo?.startsWith('Créd') || p.metodo?.startsWith('Déb'))
    const tieneCuentaCorriente = pagosComp.some((p:any) => p.metodo === 'Cuenta corriente')
    setNcDevolucion(tieneCuentaCorriente ? 'cuenta_corriente' : tieneTarjeta ? 'tarjeta' : 'efectivo')
    setNcObs('')
    setNcPago(null)
  }

  async function emitirNC() {
    if (!ncModal) return
    setNcSaving(true)
    const itemsNC = ncTipo === 'total' ? ncModal.items : ncItems.filter(it => it.c > 0 && it.p > 0)
    const netoNC  = itemsNC.reduce((a:number, it:any) => a + it.c * it.p, 0)
    const ivaNC   = ncModal.iva > 0 ? Math.round(netoNC * IVA) : 0
    const totalNC = netoNC + ivaNC

    // Determinar tipo NC según tipo de factura original
    const tipoNC = ncModal.tipo === 'A' ? 'NCA' : 'NCB'
    const tipoCbteNC = ncModal.tipo === 'A' ? 3 : 8

    // Guardar NC en DB
    const { data:last } = await supabase.from('comprobantes').select('numero').order('numero',{ascending:false}).limit(1)
    const nextNum = ((last?.[0] as any)?.numero ?? 0) + 1

    const { data:ncComp } = await supabase.from('comprobantes').insert({
      numero: nextNum,
      fecha: todayStr(),
      tipo: tipoNC,
      cliente_id: ncModal.cliente_id ?? null,
      cliente_nombre: ncModal.cliente_nombre,
      cliente_telefono: ncModal.cliente_telefono,
      cliente_cuit: ncModal.cliente_cuit,
      cliente_tipo_fiscal: ncModal.cliente_tipo_fiscal,
      vehiculo: ncModal.vehiculo,
      items: itemsNC,
      neto: netoNC,
      iva_pct: IVA,
      iva: ivaNC,
      total: totalNC,
      pagos: [{ metodo: ncDevolucion === 'vale' ? 'Vale' : ncDevolucion === 'tarjeta' ? 'Devolución tarjeta' : ncDevolucion === 'cuenta_corriente' ? 'Crédito cuenta corriente' : 'Devolución efectivo', monto: String(totalNC) }],
      comprobante_origen_id: ncModal.id,
      user_id: userId,
      es_nc: true,
      observaciones: `NC de Comprobante N°${ncModal.numero}${ncPago === 'acreditar' ? ' — Crédito a cuenta' : ncPago === 'devolver' ? ' — Devolución' : ''}${ncObs ? ' - ' + ncObs : ''}`,
    }).select().single()

    // Emitir NC en ARCA
    if (ncComp) {
      try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
        const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        await fetch(`${supabaseUrl}/functions/v1/arca-facturar`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${anonKey}` },
          body: JSON.stringify({
            comprobante_id: (ncComp as any).id,
            tipoCbte: tipoCbteNC,
            impTotal: totalNC,
            impNeto: netoNC,
            impIva: ivaNC,
            concepto: 1,
            docTipo: ncModal.cliente_tipo_fiscal === 'responsable_inscripto' ? 80 : 99,
            docNro: ncModal.cliente_cuit?.replace(/-/g,'') || '0',
            ivaAlicuota: ivaNC > 0 ? 5 : undefined,
          })
        })
      } catch(e) { console.error('Error ARCA NC:', e) }
    }

    setNcModal(null)
    setNcSaving(false)
    const {data} = await supabase.from('comprobantes').select('*').order('created_at',{ascending:false})
    setComps(data??[])
  }

  // ── Adjuntos ──────────────────────────────────────────────────────────────
  async function abrirAdjuntos(c: Comprobante) {
    setAdjModal(c)
    // Cargar adjuntos del comprobante + adjuntos de la OS vinculada
    const [adjComp, adjOS] = await Promise.all([
      supabase.from('comprobante_adjuntos').select('*').eq('comprobante_id', c.id).order('orden'),
      c.orden_id
        ? supabase.from('comprobante_adjuntos').select('*').eq('os_id', c.orden_id).order('orden')
        : Promise.resolve({ data: [] })
    ])
    // Marcar los de la OS para distinguirlos visualmente
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
      // Página 1: Comprobante
      const doc = new jsPDF({ format:'a4', unit:'mm' })
      // Agregar texto básico del comprobante
      doc.setFontSize(16); doc.setFont('helvetica','bold')
      doc.text(`${adjModal.tipo?.toUpperCase() || 'COMPROBANTE'} N° ${adjModal.numero||''}`, 15, 20)
      doc.setFontSize(11); doc.setFont('helvetica','normal')
      doc.text(`Cliente: ${adjModal.cliente_nombre || '—'}`, 15, 32)
      doc.text(`Fecha: ${adjModal.fecha}`, 15, 40)
      doc.text(`Vehículo: ${(adjModal as any).vehiculo || '—'}`, 15, 48)
      doc.text(`Total: $${Math.round(adjModal.total).toLocaleString('es-AR')}`, 15, 56)

      // Páginas adicionales: fotos y OS
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
    const W=210, pad=16
    let y=20

    // Header blanco
    doc.setFillColor(255,255,255); doc.rect(0,0,W,30,'F')
    doc.setFillColor(0,165,80); doc.rect(0,28,W,2,'F')
    try { doc.addImage(LOGO_BASE64,'PNG',pad,2,44,24) } catch(e){}
    doc.setTextColor(30,30,30); doc.setFont('helvetica','bold')
    doc.setFontSize(11); doc.text('PARABRISAS EL PIAMONTE', pad+50, 10)
    doc.setFont('helvetica','normal'); doc.setTextColor(80,80,80)
    doc.setFontSize(7.5); doc.text('KNUTH VERONICA ALEJANDRA · CUIT 27-24265717-4 · Resp. Inscripto IVA', pad+50, 17)
    doc.setTextColor(120,120,120)
    doc.setFontSize(7); doc.text('Especialistas en cristales automotrices · General Pico, La Pampa · 2302 595969', pad+50, 23)
    const tipoLabel = c.tipo==='A'?'FACTURA A':c.tipo==='B'?'FACTURA B':c.tipo==='C'?'FACTURA C':'COMPROBANTE'
    doc.setFontSize(13); doc.text(tipoLabel, W-pad, 13, {align:'right'})
    doc.setFontSize(10); doc.text(`N° ${String(c.numero||0).padStart(8,'0')}`, W-pad, 20, {align:'right'})
    doc.setFontSize(8); doc.text(c.fecha.split('-').reverse().join('/'), W-pad, 27, {align:'right'})
    y=38

    // Datos cliente
    doc.setTextColor(30,30,30); doc.setFillColor(245,250,247)
    doc.rect(pad, y-4, W-pad*2, c.cliente_cuit?24:16, 'F')
    doc.setFont('helvetica','bold'); doc.setFontSize(9)
    doc.text('Cliente:', pad+2, y); doc.setFont('helvetica','normal')
    doc.text(c.cliente_nombre||'Consumidor Final', pad+20, y)
    if(c.cliente_telefono){ doc.setFont('helvetica','bold'); doc.text('Tel:', pad+100, y); doc.setFont('helvetica','normal'); doc.text(c.cliente_telefono, pad+110, y) }
    y+=6
    if(c.cliente_cuit){
      doc.setFont('helvetica','bold'); doc.text('CUIT:', pad+2, y); doc.setFont('helvetica','normal')
      doc.text(c.cliente_cuit, pad+20, y)
      doc.setFont('helvetica','bold'); doc.text('Cond. IVA:', pad+80, y); doc.setFont('helvetica','normal')
      doc.text(tipoFiscalLabel(c.cliente_tipo_fiscal), pad+104, y)
      y+=6
    }
    if(c.vehiculo){ doc.setFont('helvetica','bold'); doc.text('Vehículo:', pad+2, y); doc.setFont('helvetica','normal'); doc.text(c.vehiculo, pad+22, y); y+=6 }
    y+=6

    // Tabla ítems
    const cols=[95,20,35,35]
    doc.setFillColor(0,165,80); doc.rect(pad,y,W-pad*2,7,'F')
    doc.setTextColor(255,255,255); doc.setFont('helvetica','bold'); doc.setFontSize(9)
    let xi=pad; ['Detalle','Cant.','Precio unit.','Subtotal'].forEach((h,i)=>{ doc.text(h,xi+(i>0?cols[i]-2:2),y+5,{align:i>0?'right':'left'}); xi+=cols[i] })
    y+=7
    doc.setTextColor(30,30,30); doc.setFont('helvetica','normal')
    c.items.forEach((it:any,idx:number)=>{
      if(idx%2===0){ doc.setFillColor(240,250,245); doc.rect(pad,y,W-pad*2,6.5,'F') }
      let xi=pad
      doc.text(String(it.d||'').slice(0,45),xi+2,y+4.5); xi+=cols[0]
      doc.text(String(it.c||1),xi-2,y+4.5,{align:'right'}); xi+=cols[1]
      doc.text(moneyARS(it.p||0),xi-2,y+4.5,{align:'right'}); xi+=cols[2]
      doc.text(moneyARS((it.c||1)*(it.p||0)),xi-2,y+4.5,{align:'right'})
      y+=6.5
    })
    y+=4

    // Totales
    const totX=W-pad-70
    if(c.iva && c.iva > 0) {
      // Precio/1.21 = neto real sin IVA
      const netoReal = Math.round(c.total / 1.21)
      const ivaReal  = c.total - netoReal
      doc.setFont('helvetica','normal'); doc.setFontSize(9)
      doc.text('Subtotal neto:',totX,y); doc.text(moneyARS(netoReal),W-pad,y,{align:'right'}); y+=6
      doc.text('IVA 21%:',totX,y); doc.text(moneyARS(ivaReal),W-pad,y,{align:'right'}); y+=6
    }
    doc.setFont('helvetica','bold'); doc.setFontSize(12)
    doc.text('TOTAL:',totX,y); doc.text(moneyARS(c.total),W-pad,y,{align:'right'})
    y+=10

    // Formas de pago
    if(c.pagos?.length){ 
      doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.text('Forma de pago:',pad,y); y+=5
      doc.setFont('helvetica','normal')
      c.pagos.forEach((p:Pago)=>{ doc.text(`${p.metodo}${p.cuotas&&p.cuotas>1?` (${p.cuotas} cuotas)`:''}: ${moneyARS(parseFloat(p.monto)||0)}`,pad+4,y); y+=5 })
      y+=4
    }

    // CAE si existe
    if((c as any).cae_emitido) {
      doc.setFillColor(232,245,233); doc.rect(pad, y, W-pad*2, 10, 'F')
      doc.setTextColor(0,120,50); doc.setFont('helvetica','bold'); doc.setFontSize(8)
      doc.text('CAE:', pad+2, y+4)
      doc.setFont('helvetica','normal')
      doc.text((c as any).cae_emitido, pad+14, y+4)
      doc.setFont('helvetica','bold')
      doc.text('Vto. CAE:', pad+70, y+4)
      doc.setFont('helvetica','normal')
      doc.text('27/06/2026', pad+90, y+4)
      y+=14
    }

    // Saldo cuenta corriente si aplica
    const pagosCC = (c.pagos||[]).filter((p:Pago)=>p.metodo==='Cuenta corriente')
    if(pagosCC.length>0) {
      const montCC = pagosCC.reduce((a:number,p:Pago)=>a+(parseFloat(p.monto)||0),0)
      const vencCC = new Date(c.fecha)
      vencCC.setDate(vencCC.getDate()+30)
      doc.setFillColor(254,243,199); doc.rect(pad, y, W-pad*2, 14, 'F')
      doc.setTextColor(146,64,14); doc.setFont('helvetica','bold'); doc.setFontSize(9)
      doc.text('📒 SALDO EN CUENTA CORRIENTE', pad+2, y+5)
      doc.setFont('helvetica','normal'); doc.setFontSize(8)
      doc.text(`Importe: ${moneyARS(montCC)}`, pad+2, y+11)
      doc.text(`Vencimiento: ${vencCC.toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit',year:'numeric'})}`, pad+60, y+11)
      y+=18
    }

    // Footer
    doc.setFillColor(0,165,80); doc.rect(0,285,W,12,'F')
    doc.setTextColor(255,255,255); doc.setFont('helvetica','normal'); doc.setFontSize(8)
    doc.text('📞 2302 595969', pad, 292)
    doc.text('General Pico, La Pampa', W/2, 292, {align:'center'})
    doc.text('Calle 17 N° 1224', W-pad, 292, {align:'right'})

    return doc.output('blob')
  }

  async function compartirWA(c:Comprobante){
    const blob = await generarPDF(c)
    const file = new File([blob],`Comprobante-${c.numero}.pdf`,{type:'application/pdf'})
    if(navigator.canShare?.({files:[file]})){ await navigator.share({files:[file],title:'Comprobante El Piamonte'}); return }
    const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=file.name; a.click(); URL.revokeObjectURL(url)
    const tel=(c.cliente_telefono||'').replace(/[^0-9]/g,'')
    const txt=`Hola${c.cliente_nombre?' '+c.cliente_nombre:''}! Te enviamos el comprobante N°${c.numero} de Parabrisas El Piamonte. Total: ${moneyARS(c.total)}.`
    setTimeout(()=>window.open(`https://web.whatsapp.com/send?phone=${tel}&text=${encodeURIComponent(txt)}`,'_blank'),800)
  }

  async function descargar(c:Comprobante){
    const blob=await generarPDF(c)
    const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`Comprobante-${c.numero}.pdf`; a.click(); URL.revokeObjectURL(url)
  }

  async function del(id:string){
    if(!confirm('¿Borrar comprobante?'))return
    await supabase.from('comprobantes').delete().eq('id',id)
    setComps(prev=>prev.filter(c=>c.id!==id))
  }

  return (
    <div>
      <div style={{display:'flex',justifyContent:'flex-end',marginBottom:20}}>
        <button onClick={async()=>{
        const {data} = await supabase.from('comprobantes').select('numero').order('numero',{ascending:false}).limit(1)
        setNextNum(((data?.[0] as any)?.numero ?? 0) + 1)
        setOpen(true)
      }} style={btn}>🧾 Nueva factura</button>
      </div>

      {comps.length===0 ? <Empty msg="Sin comprobantes todavía." /> : (
        <div className="flex flex-col gap-3">
          {comps.map(c=>(
            <div key={c.id} style={{background:'#fff',border:'1px solid #e5e7eb',borderRadius:14,boxShadow:'0 1px 4px rgba(0,0,0,.06)',overflow:'hidden'}}>
              {/* Header tipo factura */}
              <div style={{background:(c as any).es_negro?'#1f2937':c.tipo?.startsWith('NC')?'#ef4444':'#00A550',padding:'8px 16px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <span style={{fontFamily:'monospace',fontWeight:800,fontSize:13,color:'#fff',letterSpacing:1}}>
                    {c.tipo==='A'?'FACTURA A':c.tipo==='B'?'FACTURA B':c.tipo==='C'?'FACTURA C':c.tipo?.startsWith('NC')?'NOTA DE CRÉDITO':'COMPROBANTE'}
                  </span>
                  {(c as any).es_negro&&<span style={{fontSize:10,background:'rgba(255,255,255,.2)',color:'#fff',borderRadius:4,padding:'1px 6px',fontWeight:700}}>⚫ NEGRO</span>}
                </div>
                <div style={{textAlign:'right'}}>
                  <p style={{fontFamily:'monospace',fontSize:12,color:'rgba(255,255,255,.9)',fontWeight:700}}>
                    N° {String(c.numero||0).padStart(8,'0')}
                  </p>
                  <p style={{fontSize:10,color:'rgba(255,255,255,.7)'}}>
                    {c.fecha.split('-').reverse().join('/')}
                  </p>
                </div>
              </div>

              {/* Cuerpo */}
              <div style={{padding:'12px 16px'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:12,flexWrap:'wrap'}}>
                  <div>
                    <p style={{fontWeight:700,fontSize:15,color:'#111827'}}>{c.cliente_nombre||'Consumidor Final'}</p>
                    <p style={{fontSize:11,color:'#6b7280',marginTop:2}}>
                      {[
                        c.cliente_cuit && `CUIT ${c.cliente_cuit}`,
                        c.cliente_cuit && tipoFiscalLabel(c.cliente_tipo_fiscal),
                        c.vehiculo,
                        c.items.length + ' ítem(s)',
                      ].filter(Boolean).join(' · ')}
                    </p>
                    {/* CAE si existe */}
                    {(c as any).cae_emitido && (
                      <p style={{fontSize:10,color:'#059669',marginTop:4,fontFamily:'monospace',fontWeight:600}}>
                        ✅ CAE: {(c as any).cae_emitido}
                      </p>
                    )}
                  </div>
                  <p style={{fontFamily:'var(--font-saira,sans-serif)',fontWeight:800,fontSize:22,color:'#111827',flexShrink:0}}>
                    {moneyARS(c.total)}
                  </p>
                </div>

                {/* Formas de pago resumen */}
                {c.pagos?.length > 0 && (
                  <div style={{display:'flex',gap:6,flexWrap:'wrap',marginTop:8}}>
                    {c.pagos.map((p:any,i:number)=>(
                      <span key={i} style={{fontSize:10,background:'#f3f4f6',borderRadius:6,padding:'2px 8px',color:'#374151',fontWeight:600}}>
                        {p.metodo}{p.cuotas&&p.cuotas>1?` ${p.cuotas}c`:''}: {moneyARS(parseFloat(p.monto)||0)}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Acciones */}
              <div style={{padding:'8px 16px',borderTop:'1px solid #f3f4f6',display:'flex',gap:6,flexWrap:'wrap'}}>
                <button onClick={()=>abrirAdjuntos(c)} style={{...btnSm,background:'#7c3aed'}}>📎 Adjuntos</button>
                {c.cliente_telefono&&<button onClick={()=>compartirWA(c)} style={btnWa}>📱 WhatsApp</button>}
                <button onClick={()=>descargar(c)} style={btnSm}>⬇ PDF</button>
                {!c.tipo?.startsWith('NC') && (
                  <button onClick={()=>abrirNC(c)} style={{...btnRed,fontSize:11}}>📋 Nota de crédito</button>
                )}
                <button onClick={()=>del(c.id)} style={{...btnRed,background:'#9ca3af'}}>Borrar</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={open} onClose={()=>setOpen(false)} title="">
        <div className="flex flex-col gap-3 max-h-[80vh] overflow-y-auto overflow-x-hidden">

          {/* Header estilo factura */}
          <div style={{margin:'-16px -16px 12px',background:'#00A550',padding:'16px 20px',borderRadius:'12px 12px 0 0'}}>
            {/* Fila superior: nombre fantasía + número */}
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:10}}>
              <div style={{display:'flex',alignItems:'center',gap:10}}>
                <div style={{width:42,height:42,background:'rgba(255,255,255,.25)',borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,position:'relative',overflow:'hidden'}}>
                  <span style={{color:'#fff',fontWeight:900,fontSize:14,fontFamily:'var(--font-saira,sans-serif)',letterSpacing:-1}}>EP</span>
                  <img src={`data:image/png;base64,${LOGO_BASE64}`} alt=""
                    style={{width:42,height:42,objectFit:'contain',position:'absolute',inset:0}}
                    onError={e=>{(e.target as HTMLImageElement).style.display='none'}}/>
                </div>
                <div>
                  <p style={{color:'#fff',fontSize:16,fontWeight:800,fontFamily:'var(--font-saira,sans-serif)',lineHeight:1.1}}>
                    Parabrisas El Piamonte
                  </p>
                  <p style={{color:'rgba(255,255,255,.7)',fontSize:10,marginTop:2}}>
                    KNUTH VERONICA ALEJANDRA · CUIT 27-24265717-4
                  </p>
                </div>
              </div>
              <div style={{textAlign:'right'}}>
                <p style={{color:'rgba(255,255,255,.6)',fontSize:9,textTransform:'uppercase',letterSpacing:1}}>N° Comprobante</p>
                <p style={{color:'#fff',fontSize:18,fontWeight:800,fontFamily:'monospace',lineHeight:1.2}}>
                  {nextNum ? String(nextNum).padStart(8,'0') : '--------'}
                </p>
                <p style={{color:'rgba(255,255,255,.6)',fontSize:10}}>
                  {new Date().toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit',year:'numeric'})}
                </p>
              </div>
            </div>
            {/* Fila inferior: tipo de factura + punto de venta */}
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',borderTop:'1px solid rgba(255,255,255,.2)',paddingTop:8}}>
              <p style={{color:'#fff',fontSize:18,fontWeight:900,fontFamily:'var(--font-saira,sans-serif)',letterSpacing:1}}>
                {fiscal.tipo_fiscal==='responsable_inscripto' ? 'FACTURA A' : 'FACTURA B'}
              </p>
              <p style={{color:'rgba(255,255,255,.8)',fontSize:11}}>
                Punto de venta <strong style={{color:'#fff'}}>00006</strong> · Resp. Inscripto IVA
              </p>
            </div>
          </div>

          {/* Búsqueda de cliente */}
          <div>
            <label className="block text-[11px] font-semibold text-p-ink2 uppercase tracking-wider mb-1.5">Cliente</label>
            {cliSel ? (
              <div className="flex items-center gap-2 bg-p-light rounded-xl px-3 py-2.5 border border-p-green">
                <div className="flex-1">
                  <p className="font-semibold text-sm text-p-ink">{cliSel.nombre}</p>
                  <p className="text-[10px] text-p-ink2">{[cliSel.telefono, tipoFiscalLabel(fiscal.tipo_fiscal)].filter(Boolean).join(' · ')}</p>
                </div>
                <button onClick={()=>{setCli(null);setCliQ('');setCliSugs([])}}
                  className="text-p-ink2 hover:text-red-500 text-xs font-bold px-2 py-1 rounded-lg hover:bg-red-50">
                  ✕ cambiar
                </button>
              </div>
            ) : (
              <div className="relative">
                <Input value={cliQ} onChange={e=>{setCliQ(e.target.value);setCli(null)}}
                  placeholder="Nombre o celular…"/>
                {cliSugs.length>0&&(
                  <div className="absolute z-20 top-full left-0 right-0 bg-white border border-p-line rounded-xl shadow-xl max-h-48 overflow-y-auto mt-1">
                    <button onClick={usarConsumidorFinal}
                      className="w-full text-left px-3 py-2.5 text-sm font-semibold text-p-dark hover:bg-p-light border-b border-p-line2">
                      👤 Consumidor Final
                    </button>
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
            )}
            {/* Badge tipo fiscal y alertas */}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <button onClick={()=>setShowFiscal(!showFiscal)}
                className={`text-xs font-bold px-3 py-1.5 rounded-full border transition-colors ${showFiscal?'bg-p-ink text-white border-p-ink':'border-p-line text-p-ink2 hover:bg-p-light'}`}>
                {showFiscal ? '▲ ' : '▼ '}{tipoFiscalLabel(fiscal.tipo_fiscal)}
                {fiscal.cuit&&` · ${fiscal.cuit}`}
                {fiscal.dni&&` · DNI ${fiscal.dni}`}
              </button>
              {faltaNombre && <span style={{background:'#fee2e2',color:'#dc2626',borderRadius:6,padding:'3px 10px',fontSize:11,fontWeight:700}}>⚠️ Nombre obligatorio</span>}
              {faltaCuit && !faltaNombre && <span style={{background:'#fee2e2',color:'#dc2626',borderRadius:6,padding:'3px 10px',fontSize:11,fontWeight:700}}>⚠️ CUIT obligatorio</span>}
              {faltaDni && !faltaNombre && <span style={{background:'#fef3c7',color:'#d97706',borderRadius:6,padding:'3px 10px',fontSize:11,fontWeight:700}}>⚠️ DNI obligatorio</span>}
            </div>
          </div>

          {/* Modal fiscal expandible */}
          {showFiscal&&(
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
              {fiscal.tipo_fiscal==='consumidor_final' ? (
                <Field label="DNI *"><Input value={fiscal.dni} onChange={e=>setFiscal(p=>({...p,dni:e.target.value}))} placeholder="12345678"/></Field>
              ) : (
                <Field label="CUIT *"><Input value={fiscal.cuit} onChange={e=>setFiscal(p=>({...p,cuit:e.target.value}))} placeholder="20-12345678-9"/></Field>
              )}
              <button onClick={async()=>{
                if(cliSel?.id){
                  await supabase.from('clientes').update({tipo_fiscal:fiscal.tipo_fiscal,cuit:fiscal.cuit||null,tipo_cliente_id:fiscal.tipo_cliente_id||null}).eq('id',cliSel.id)
                }
                setShowFiscal(false)
              }} style={{...btnSm,alignSelf:'flex-end'}}>Guardar</button>
            </div>
          )}

          {/* Historial del cliente */}
          {historialCli && (historialCli.presupuestos.length > 0 || historialCli.ordenes.length > 0) && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
              <p className="text-[11px] font-bold text-amber-800 uppercase tracking-wider mb-2">📋 Documentos pendientes de este cliente</p>
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
                    setItems(o.items||[])
                    setFiscal(prev=>({...prev, vehiculo:o.vehiculo||prev.vehiculo}))
                    setHistorialCli(null)
                  }} className="flex items-center gap-3 bg-white rounded-lg px-3 py-2 text-left hover:bg-amber-50 border border-amber-100 transition-colors w-full">
                    <span className="text-[10px] font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded-full shrink-0">OS-{String(o.numero||0).padStart(4,'0')}</span>
                    <span className="text-xs text-p-ink flex-1 truncate">{o.vehiculo||'Sin vehículo'}{o.aseguradora?' · '+o.aseguradora:''}</span>
                    <span className="text-xs font-mono font-bold text-p-dark shrink-0">{moneyARS(o.total)}</span>
                    <span className="text-[10px] text-p-ink2 shrink-0">{o.fecha?.split('-').reverse().join('/')}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Vehículo */}
          <Field label="Vehículo"><Input value={fiscal.vehiculo} onChange={e=>setFiscal(p=>({...p,vehiculo:e.target.value}))} placeholder="VW Gol 2015"/></Field>

          {/* Buscar en stock */}
          <div>
            <label className="block text-[11px] font-semibold text-p-ink2 uppercase tracking-wider mb-1.5">Buscar en stock</label>
            <div className="relative">
              <Input value={stockQ} onChange={e=>setStockQ(e.target.value)} placeholder="Buscar pieza del stock…"/>
              {stockSugs.length>0&&(
                <div className="absolute z-20 top-full left-0 right-0 bg-white border border-p-line rounded-xl shadow-xl max-h-48 overflow-y-auto mt-1">
                  {stockSugs.map((s:any)=>(
                    <button key={s.id} onClick={()=>{
                      setItems(prev=>[...prev,{d:s.descripcion,c:1,p:s.precio_venta||0,costo:s.costo||0,stock_id:s.id}])
                      setStockQ(''); setStockSugs([])
                    }} className="w-full text-left px-3 py-2.5 hover:bg-p-light border-b border-p-line2 last:border-0 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-p-ink truncate">{s.descripcion}</p>
                        <p className="text-[10px] text-p-ink2">Stock: {s.cantidad} u. · Costo: {s.costo?moneyARS(s.costo):'-'}</p>
                      </div>
                      <span className="font-mono font-bold text-sm text-p-dark shrink-0">{s.precio_venta?moneyARS(s.precio_venta):'-'}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Ítems */}
          {items.length>0&&(
            <div className="border-t border-p-line2 pt-2">
              <label className="block text-[11px] font-semibold text-p-ink2 uppercase tracking-wider mb-2">Ítems</label>
              {items.map((it,i)=>(
                <div key={i} className="flex items-center gap-2 py-1.5 border-b border-p-line2 text-sm">
                  <span className="flex-1 text-p-ink min-w-0 truncate">{it.d}{it.c>1?` ×${it.c}`:''}</span>
                  {it.stock_id&&<span className="text-[10px] text-p-green font-bold shrink-0">📦</span>}
                  <div className="shrink-0">
                    <div className="text-[9px] text-p-ink2 text-right mb-0.5">costo</div>
                    <input type="number" value={it.costo||''} onChange={e=>{const v=+e.target.value;setItems(prev=>prev.map((x,j)=>j===i?{...x,costo:v}:x))}}
                      placeholder="$" className="w-24 border border-p-line rounded px-2 py-0.5 text-xs font-mono text-right focus:outline-none focus:border-p-green"/>
                  </div>
                  <div className="shrink-0">
                    <div className="text-[9px] text-p-ink2 text-right mb-0.5">precio venta</div>
                    <input type="number" value={it.p} onChange={e=>{const v=+e.target.value;setItems(prev=>prev.map((x,j)=>j===i?{...x,p:v}:x))}}
                      className="w-28 border border-p-line rounded px-2 py-0.5 text-xs font-mono text-right focus:outline-none focus:border-p-green"/>
                  </div>
                  <span className="font-mono text-xs w-20 text-right shrink-0">{moneyARS(it.c*it.p)}</span>
                  <button onClick={()=>setItems(prev=>prev.filter((_,j)=>j!==i))} className="text-red-400 text-xs">✕</button>
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
                <label className="flex items-center gap-2 mt-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={ivaOn} onChange={e=>setIvaOn(e.target.checked)} className="accent-p-green"/>Incluir IVA 21%
                </label>
              )}
              <div className="bg-p-light rounded-lg p-3 mt-2 text-sm">
                {(ivaOn||esNegro)&&<div className="flex justify-between text-p-ink2"><span>Subtotal neto</span><span className="font-mono">{moneyARS(neto)}</span></div>}
                {iva>0&&<div className="flex justify-between text-p-ink2">
                  <span>{esNegro?`IVA 21% (sobre ${ivaNegroP}% declarado)`:'IVA 21%'}</span>
                  <span className="font-mono">{moneyARS(iva)}</span>
                </div>}
                <div className="flex justify-between font-saira font-bold text-p-ink text-lg border-t border-p-line mt-1 pt-1"><span>TOTAL</span><span>{moneyARS(total)}</span></div>
              </div>
            </div>
          )}

          {/* Formas de pago — botón que abre modal */}
          <div className="border-t border-p-line2 pt-3">
            <div className="flex items-center justify-between mb-2">
              <label className="text-[11px] font-semibold text-p-ink2 uppercase tracking-wider">Formas de pago</label>
              <button onClick={()=>setPagosModal(true)} style={{...btnSm,padding:'6px 14px',fontSize:12}}>
                {pagos.some(p=>p.monto&&+p.monto.replace(/[^0-9.]/g,'')>0) ? '✏ Editar pagos' : '+ Agregar'}
              </button>
            </div>
            {/* Resumen pagos */}
            {pagos.filter(p=>p.monto&&+p.monto.replace(/[^0-9.]/g,'')>0).length > 0 ? (
              <div className="flex flex-col gap-1.5">
                {pagos.filter(p=>p.monto&&+p.monto.replace(/[^0-9.]/g,'')>0).map((p,i)=>(
                  <div key={i} className="flex justify-between items-center bg-p-light rounded-lg px-3 py-2 text-sm">
                    <span className="font-medium text-p-ink">{p.metodo}</span>
                    <span className="font-mono font-bold text-p-dark">{moneyARS(+p.monto.replace(/[^0-9.]/g,'')||0)}</span>
                  </div>
                ))}
                {diferencia !== 0 && (
                  <p className="text-xs font-bold text-amber-600">
                    {diferencia > 0 ? `Falta: ${moneyARS(diferencia)}` : `Sobra: ${moneyARS(-diferencia)}`}
                  </p>
                )}
              </div>
            ) : (
              <button onClick={()=>setPagosModal(true)}
                className="w-full border-2 border-dashed border-p-line rounded-xl py-3 text-sm text-p-ink2 hover:border-p-green hover:text-p-green transition-colors">
                Tap para agregar forma de pago
              </button>
            )}
            {diferencia > 0 && pagos.some(p=>p.monto) && (
              <p className="text-xs font-bold text-red-500 mt-1">Falta: {moneyARS(diferencia)}</p>
            )}
          </div>

          {/* MODAL DE PAGOS — reemplaza la vieja sección inline */}
          {false && pagos.map((p,i)=>(
            <div key={i} className="grid grid-cols-12 gap-2 items-center">
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
              ))}
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
            <button onClick={save} disabled={!items.length||!cliQ} style={{...btn,opacity:(!items.length||!cliQ)?.5:1}}>
              ✓ Emitir comprobante
            </button>
          </div>
        </div>
      </Modal>
      {/* Modal de pagos */}
      {pagosModal && (
        <Modal open={pagosModal} onClose={()=>setPagosModal(false)} title="Formas de pago">
          <div className="flex flex-col gap-3">
            <div className="bg-p-light rounded-xl px-4 py-3 flex justify-between items-center">
              <span className="text-sm text-p-ink2">Total a pagar</span>
              <span className="font-saira font-bold text-xl text-p-dark">{moneyARS(total)}</span>
            </div>

            {pagos.map((p,i)=>(
              <div key={i} className="bg-white border border-p-line rounded-xl p-3 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <Select value={p.metodo.startsWith('Tarjeta')?'Tarjeta':p.metodo}
                    onChange={e=>{
                      if(e.target.value==='Tarjeta'){
                        setTarjetaIdx(i); setTarjetaForm({tipo:'credito',nombre:'Visa',cuotas:1}); setTarjetaModal(true)
                      } else {
                        updPago(i,'metodo',e.target.value)
                      }
                    }}>
                    {METODOS.map(m=><option key={m} value={m}>{m}</option>)}
                  </Select>
                  {p.metodo.startsWith('Tarjeta') && (
                    <button onClick={()=>{setTarjetaIdx(i);setTarjetaModal(true)}}
                      style={{fontSize:11,background:'#dbeafe',color:'#1d4ed8',border:'none',borderRadius:6,padding:'4px 10px',cursor:'pointer',whiteSpace:'nowrap',fontWeight:700}}>
                      {p.metodo} ✏
                    </button>
                  )}
                  {pagos.length > 1 && (
                    <button onClick={()=>setPagos(prev=>prev.filter((_,j)=>j!==i))}
                      className="text-red-400 hover:text-red-600 text-xs ml-auto">✕</button>
                  )}
                </div>
                <div className="flex gap-2 items-center">
                  <Input value={p.monto} onChange={e=>updPago(i,'monto',e.target.value)} placeholder="$ monto"/>
                  {total > 0 && (
                    <button onClick={()=>{
                      const resto = total - pagos.reduce((a,x,j)=>j===i?a:a+(parseFloat(x.monto.replace(/[^0-9.]/g,''))||0),0)
                      updPago(i,'monto',String(Math.round(resto)))
                    }} style={{fontSize:11,background:'#f3f4f6',border:'none',borderRadius:6,padding:'4px 8px',cursor:'pointer',whiteSpace:'nowrap'}}>
                      resto
                    </button>
                  )}
                </div>
              </div>
            ))}

            <button onClick={addPago} style={{...btnGray,width:'100%',textAlign:'center'}}>+ Agregar otro método</button>

            {diferencia !== 0 && (
              <div style={{background:diferencia>0?'#fee2e2':'#f0fdf4',border:`1px solid ${diferencia>0?'#fca5a5':'#86efac'}`,borderRadius:10,padding:'8px 12px',textAlign:'center'}}>
                <p style={{fontSize:13,fontWeight:700,color:diferencia>0?'#dc2626':'#16a34a'}}>
                  {diferencia > 0 ? `Falta: ${moneyARS(diferencia)}` : `Sobra: ${moneyARS(-diferencia)}`}
                </p>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button onClick={()=>setPagosModal(false)} style={{...btn}}>✓ Confirmar</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal tarjeta */}
      {tarjetaModal && (
        <Modal open={tarjetaModal} onClose={()=>setTarjetaModal(false)} title="Detalle de tarjeta">
          <div className="flex flex-col gap-3">
            <div className="flex gap-2">
              {(['credito','debito'] as const).map(t=>(
                <button key={t} onClick={()=>setTarjetaForm(p=>({...p,tipo:t}))}
                  style={{flex:1,padding:'8px',borderRadius:8,border:'none',fontWeight:700,fontSize:13,cursor:'pointer',
                    background:tarjetaForm.tipo===t?'#1d4ed8':'#e5e7eb',
                    color:tarjetaForm.tipo===t?'#fff':'#374151'}}>
                  {t==='credito'?'💳 Crédito':'🏧 Débito'}
                </button>
              ))}
            </div>
            <Field label="Tarjeta">
              <select value={tarjetaForm.nombre} onChange={e=>setTarjetaForm(p=>({...p,nombre:e.target.value}))}
                className="w-full border border-p-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-p-green bg-white">
                {TARJETAS.map(t=><option key={t}>{t}</option>)}
              </select>
            </Field>
            {tarjetaForm.tipo==='credito' && (
              <Field label="Cuotas">
                <div className="flex gap-2 flex-wrap">
                  {CUOTAS.map(q=>(
                    <button key={q} onClick={()=>setTarjetaForm(p=>({...p,cuotas:q}))}
                      style={{padding:'6px 12px',borderRadius:8,border:'none',fontWeight:700,fontSize:13,cursor:'pointer',
                        background:tarjetaForm.cuotas===q?'#00A550':'#e5e7eb',
                        color:tarjetaForm.cuotas===q?'#fff':'#374151'}}>
                      {q===1?'Contado':`${q}c`}
                    </button>
                  ))}
                </div>
              </Field>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={()=>setTarjetaModal(false)} style={{background:'#6b7280',color:'#fff',border:'none',borderRadius:8,padding:'9px 20px',fontWeight:700,fontSize:14,cursor:'pointer'}}>Cancelar</button>
              <button onClick={()=>{
                const label = `Tarjeta ${tarjetaForm.tipo==='credito'?'Cred.':'Déb.'} ${tarjetaForm.nombre}${tarjetaForm.tipo==='credito'&&tarjetaForm.cuotas>1?` ${tarjetaForm.cuotas}c`:''}`
                setPagos(prev=>prev.map((x,j)=>j===tarjetaIdx?{...x,metodo:label}:x))
                setTarjetaModal(false)
              }} style={{background:'#00A550',color:'#fff',border:'none',borderRadius:8,padding:'9px 20px',fontWeight:700,fontSize:14,cursor:'pointer'}}>
                Confirmar
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Toast CAE */}
      {caeResult && (
        <div style={{position:'fixed',bottom:96,left:'50%',transform:'translateX(-50%)',background:'#00A550',color:'#fff',padding:'12px 24px',borderRadius:14,fontWeight:700,fontSize:14,zIndex:200,boxShadow:'0 4px 20px rgba(0,0,0,.2)',textAlign:'center'}}>
          ✅ Factura emitida · CAE: {caeResult.cae} · N°: {String(caeResult.nro).padStart(8,'0')}
          <button onClick={()=>setCaeResult(null)} style={{marginLeft:16,background:'rgba(255,255,255,.2)',border:'none',color:'#fff',borderRadius:6,padding:'2px 10px',cursor:'pointer'}}>✕</button>
        </div>
      )}

      {/* Modal Nota de Crédito */}
      {ncModal && (
        <Modal open={!!ncModal} onClose={()=>setNcModal(null)} title={`Nota de Crédito — Comp. N°${ncModal.numero}`}>
          <div className="flex flex-col gap-4">
            {/* Advertencia tarjeta */}
            {ncDevolucion === 'tarjeta' && (
              <div style={{background:'#fef3c7',border:'1px solid #d97706',borderRadius:10,padding:'10px 14px',fontSize:13,color:'#92400e'}}>
                ⚠️ El comprobante fue pagado con tarjeta. Verificá con el banco si el plazo permite devolución antes de proceder.
              </div>
            )}
            {ncDevolucion === 'cuenta_corriente' && (
              <div style={{background:'#eff6ff',border:'1px solid #3b82f6',borderRadius:10,padding:'10px 14px',fontSize:13,color:'#1e40af'}}>
                📒 La devolución se acreditará como crédito en la cuenta corriente del cliente.
              </div>
            )}

            {/* Tipo de NC */}
            <div>
              <label className="block text-[11px] font-semibold text-p-ink2 uppercase tracking-wider mb-2">Tipo de nota de crédito</label>
              <div className="flex gap-3">
                <button onClick={()=>setNcTipo('total')}
                  style={{...btnSm, background: ncTipo==='total'?'#00A550':'#e5e7eb', color: ncTipo==='total'?'#fff':'#374151'}}>
                  Por el total
                </button>
                <button onClick={()=>setNcTipo('parcial')}
                  style={{...btnSm, background: ncTipo==='parcial'?'#00A550':'#e5e7eb', color: ncTipo==='parcial'?'#fff':'#374151'}}>
                  Por ítems específicos
                </button>
              </div>
            </div>

            {/* Ítems parciales */}
            {ncTipo === 'parcial' && (
              <div>
                <label className="block text-[11px] font-semibold text-p-ink2 uppercase tracking-wider mb-2">Seleccioná los ítems a acreditar</label>
                {ncItems.map((it, i) => (
                  <div key={i} className="flex items-center gap-3 py-2 border-b border-p-line2 text-sm">
                    <input type="checkbox" checked={it.c > 0}
                      onChange={e => setNcItems(prev => prev.map((x,j) => j===i ? {...x, c: e.target.checked ? (ncModal.items[i]?.c||1) : 0} : x))}
                      className="accent-p-green"/>
                    <span className="flex-1">{it.d}</span>
                    <input type="number" value={it.c} min={0} max={ncModal.items[i]?.c||1}
                      onChange={e => setNcItems(prev => prev.map((x,j) => j===i ? {...x, c: +e.target.value} : x))}
                      className="w-16 border border-p-line rounded px-2 py-1 text-xs text-center"/>
                    <span className="font-mono text-xs w-20 text-right">{moneyARS(it.c * it.p)}</span>
                  </div>
                ))}
                <div className="flex justify-between font-bold text-sm pt-2">
                  <span>Total NC:</span>
                  <span className="font-mono">{moneyARS(ncItems.filter(it=>it.c>0).reduce((a,it)=>a+it.c*it.p,0))}</span>
                </div>
              </div>
            )}

            {/* Forma de devolución */}
            <div>
              <label className="block text-[11px] font-semibold text-p-ink2 uppercase tracking-wider mb-2">Forma de devolución</label>
              <div className="flex gap-2 flex-wrap">
                {(['efectivo','vale','tarjeta','cuenta_corriente'] as const).map(d => (
                  <button key={d} onClick={()=>setNcDevolucion(d)}
                    style={{...btnSm, background: ncDevolucion===d?'#1d4ed8':'#e5e7eb', color: ncDevolucion===d?'#fff':'#374151', textTransform:'capitalize'}}>
                    {d === 'efectivo' ? '💵 Efectivo' : d === 'vale' ? '🎟️ Vale' : d === 'tarjeta' ? '💳 Tarjeta' : '📒 Cta. Corriente'}
                  </button>
                ))}
              </div>
            </div>

            <Field label="Observaciones (opcional)">
              <Input value={ncObs} onChange={e=>setNcObs(e.target.value)} placeholder="Motivo de la devolución…"/>
            </Field>

            {/* Aviso si el comprobante está pago */}
            {(() => {
              const totalPagadoComp = (ncModal.pagos ?? []).reduce((a:number, p:any) => a + (parseFloat(p.monto) || 0), 0)
              const estaPago = totalPagadoComp >= ncModal.total * 0.99
              if (!estaPago) return null
              return (
                <div style={{background:'#fef3c7',border:'2px solid #d97706',borderRadius:10,padding:'12px 14px',fontSize:13}}>
                  <p style={{fontWeight:700,color:'#92400e',marginBottom:8}}>⚠️ Este comprobante ya fue cobrado por {moneyARS(totalPagadoComp)}</p>
                  <p style={{color:'#92400e',marginBottom:10,fontSize:12}}>¿Qué hacemos con el importe de la nota de crédito?</p>
                  <div style={{display:'flex',gap:8}}>
                    <button onClick={()=>setNcPago('devolver')}
                      style={{...btnSm, background: ncPago==='devolver'?'#ef4444':'#e5e7eb', color: ncPago==='devolver'?'#fff':'#374151'}}>
                      💵 Devolver dinero
                    </button>
                    <button onClick={()=>setNcPago('acreditar')}
                      style={{...btnSm, background: ncPago==='acreditar'?'#2563eb':'#e5e7eb', color: ncPago==='acreditar'?'#fff':'#374151'}}>
                      📒 Dejar a cuenta del cliente
                    </button>
                  </div>
                  {ncPago === 'acreditar' && (
                    <p style={{marginTop:8,fontSize:11,color:'#1e40af',fontStyle:'italic'}}>
                      El crédito quedará registrado en la cuenta corriente del cliente para su próxima compra.
                    </p>
                  )}
                </div>
              )
            })()}

            {/* Resumen */}
            <div style={{background:'#f9fafb',border:'1px solid #e5e7eb',borderRadius:10,padding:'10px 14px',fontSize:13}}>
              <div className="flex justify-between"><span>Tipo:</span><span className="font-bold">{ncModal.tipo==='A'?'Nota de Crédito A':ncModal.tipo==='C'?'Nota de Crédito C':'Nota de Crédito B'}</span></div>
              <div className="flex justify-between"><span>Devolución:</span><span className="font-bold">{ncDevolucion === 'efectivo' ? '💵 Efectivo' : ncDevolucion === 'vale' ? '🎟️ Vale' : ncDevolucion === 'tarjeta' ? '💳 Tarjeta' : '📒 Cta. Corriente'}</span></div>
              <div className="flex justify-between font-bold text-base mt-1 pt-1 border-t border-p-line">
                <span>Total a acreditar:</span>
                <span className="text-red-600">{moneyARS(
                  ncTipo === 'total'
                    ? ncModal.total
                    : ncItems.filter(it=>it.c>0).reduce((a,it)=>a+it.c*it.p,0) * (ncModal.iva > 0 ? 1 + IVA : 1)
                )}</span>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button onClick={()=>setNcModal(null)} style={btnGray}>Cancelar</button>
              <button onClick={emitirNC} disabled={ncSaving} style={{...btnRed, opacity: ncSaving ? .6 : 1}}>
                {ncSaving ? 'Emitiendo…' : '✓ Emitir Nota de Crédito'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
