'use client'
import { LOGO_BASE64 } from '@/lib/logo'
import { FIRMA_SAPPA } from '@/lib/firma'
import { useState, useEffect, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
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

// Formas de pago
const METODOS = ['Efectivo','Transferencia','Débito','Crédito Visa','Crédito Master','Crédito Naranja','Crédito AMEX','Cheque','Cuenta corriente']
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
  cliente_nombre:string|null; cliente_telefono:string|null; cliente_cuit:string|null
  cliente_tipo_fiscal:string|null; tipo_cliente_nombre:string|null; vehiculo:string|null
  items:any[]; neto:number; iva:number; total:number; pagos:Pago[]
  presupuesto_id:string|null; orden_id:string|null; created_at:string
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

  const emptyFiscal = { tipo_fiscal:'consumidor_final', cuit:'', razon_social:'', tipo_cliente_id:'', vehiculo:'' }
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

  // Búsqueda de stock
  useEffect(()=>{
    if(stockQ.trim().length<2){setStockSugs([]);return}
    supabase.from('stock').select('id,descripcion,cantidad,precio_venta,costo').eq('activo',true).gt('cantidad',0)
      .ilike('descripcion',`%${stockQ}%`).limit(8)
      .then(({data})=>setStockSugs(data??[]))
  },[stockQ,supabase])

  // Totales
  const esNegro = rol === 'caja'
  const neto  = Math.round(items.reduce((a,it)=>a+it.c*it.p, 0) * 100) / 100
  // En negro: el IVA se calcula sobre el % declarado del total — redondeado a centavos, no a pesos enteros,
  // para que neto + IVA coincida exacto con el total y no descuadre contra ARCA al pedir el CAE.
  const iva   = esNegro
    ? (ivaNegroP > 0 ? Math.round((neto * ivaNegroP / 100) * IVA * 100) / 100 : 0)
    : (ivaOn ? Math.round(neto*IVA*100) / 100 : 0)
  const total = Math.round((neto + iva) * 100) / 100
  const totalPagado = pagos.reduce((a,p)=>a+(parseFloat(p.monto.replace(/[^0-9.]/g,''))||0), 0)
  const diferencia  = total - totalPagado

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
      }
    }
    if(itm){ try { setItems(JSON.parse(itm)) } catch {} }
    if(iva_&&+iva_>0) setIvaOn(true)
    if(cli||tel) setOpen(true)
  },[searchParams])

  // Búsqueda de clientes por nombre o celular
  useEffect(()=>{
    if(cliQ.trim().length < 2){ setCliSugs([]); return }
    supabase.from('clientes').select('id,nombre,telefono,email,cuit,tipo_fiscal,tipo_cliente_id,notas')
      .or(`nombre.ilike.%${cliQ}%,telefono.ilike.%${cliQ}%`).limit(6)
      .then(({data})=>setCliSugs((data??[]) as ClienteMin[]))
  },[cliQ,supabase])

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
    if(!fiscal.tipo_fiscal||fiscal.tipo_fiscal==='consumidor_final') return 'B'
    if(fiscal.tipo_fiscal==='responsable_inscripto') return 'A'
    return 'C'
  }

  async function save(){
    if(!items.length) return
    const { data:last } = await supabase.from('comprobantes').select('numero').order('numero',{ascending:false}).limit(1)
    const nextNum = ((last?.[0] as any)?.numero ?? 0) + 1
    const pid = searchParams.get('pid'), oid = searchParams.get('oid')
    const tipoC = tipos.find(t=>t.id===fiscal.tipo_cliente_id)

    const { data:comp } = await supabase.from('comprobantes').insert({
      numero:nextNum, fecha:todayStr(), tipo:tipoDoc(),
      cliente_id: cliSel?.id||null,
      cliente_nombre: cliSel?.nombre||cliQ||null,
      cliente_telefono: cliSel?.telefono||null,
      cliente_cuit: fiscal.cuit||null,
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

    setOpen(false)
    setItems([]); setPagos([{metodo:'Efectivo',monto:''}])
    setCli(null); setCliQ(''); setFiscal(emptyFiscal); setObs(''); setIvaOn(false)
    router.push('/comprobantes')
    const {data}=await supabase.from('comprobantes').select('*').order('created_at',{ascending:false})
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
      doc.text(`Total: ${moneyARS(adjModal.total)}`, 15, 56)

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
    doc.setFontSize(11); doc.text('PARABRISAS EL PIAMONTE', pad+50, 12)
    doc.setFont('helvetica','normal'); doc.setTextColor(100,100,100)
    doc.setFontSize(8); doc.text('Especialistas en cristales automotrices · General Pico, La Pampa · 2302 595969', pad+50, 20)
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

    // Búsqueda de stock
  useEffect(()=>{
    if(stockQ.trim().length<2){setStockSugs([]);return}
    supabase.from('stock').select('id,descripcion,cantidad,precio_venta,costo').eq('activo',true).gt('cantidad',0)
      .ilike('descripcion',`%${stockQ}%`).limit(8)
      .then(({data})=>setStockSugs(data??[]))
  },[stockQ,supabase])

  // Totales
    const totX=W-pad-70
    if(c.iva){ doc.text('Subtotal neto:',totX,y); doc.text(moneyARS(c.neto),W-pad,y,{align:'right'}); y+=6 }
    if(c.iva){ doc.text('IVA 21%:',totX,y); doc.text(moneyARS(c.iva),W-pad,y,{align:'right'}); y+=6 }
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
        <button onClick={()=>setOpen(true)} style={btn}>+ Nuevo comprobante</button>
      </div>

      {comps.length===0 ? <Empty msg="Sin comprobantes todavía." /> : (
        <div className="flex flex-col gap-3">
          {comps.map(c=>(
            <div key={c.id} className="bg-white border border-p-line rounded-xl p-4 shadow-sm">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs font-bold text-p-dark bg-p-light px-2 py-0.5 rounded-full">
                      {c.tipo==='A'?'FA':c.tipo==='B'?'FB':c.tipo==='C'?'FC':'X'}-{String(c.numero||0).padStart(8,'0')}
                    </span>
                    {(c as any).es_negro&&<span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-800 text-white">⚫ NEGRO</span>}
                    <p className="font-saira font-bold text-p-ink">{c.cliente_nombre||'Consumidor Final'}</p>
                    {c.tipo_cliente_nombre&&<span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-p-light text-p-dark">{c.tipo_cliente_nombre}</span>}
                    {c.cliente_cuit&&<span className="text-[10px] text-p-gray">{tipoFiscalLabel(c.cliente_tipo_fiscal)} · CUIT {c.cliente_cuit}</span>}
                  </div>
                  <p className="text-xs text-p-ink2 mt-0.5">
                    {[c.vehiculo, c.fecha.split('-').reverse().join('/'), c.items.length+' ítem(s)'].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <p className="font-saira font-bold text-xl text-p-ink">{moneyARS(c.total)}</p>
              </div>
              <div className="flex gap-2 flex-wrap mt-3 pt-3 border-t border-p-line2">
                <button onClick={()=>abrirAdjuntos(c)}
                  style={{...btnSm,background:'#7c3aed'}}>
                  📎 Adjuntos
                </button>
                {c.cliente_telefono&&<button onClick={()=>compartirWA(c)} style={btnWa}>📱 WhatsApp</button>}
                <button onClick={()=>descargar(c)} style={btnSm}>⬇ PDF</button>
                <button onClick={()=>del(c.id)} style={btnRed}>Borrar</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={open} onClose={()=>setOpen(false)} title="Nuevo comprobante">
        <div className="flex flex-col gap-3 max-h-[80vh] overflow-y-auto pr-1">

          {/* Búsqueda de cliente */}
          <div>
            <label className="block text-[11px] font-semibold text-p-ink2 uppercase tracking-wider mb-1.5">Cliente</label>
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
            {/* Badge tipo fiscal */}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <button onClick={()=>setShowFiscal(!showFiscal)}
                className={`text-xs font-bold px-3 py-1.5 rounded-full border transition-colors ${showFiscal?'bg-p-ink text-white border-p-ink':'border-p-line text-p-ink2 hover:bg-p-light'}`}>
                {showFiscal ? '▲ ' : '▼ '}{tipoFiscalLabel(fiscal.tipo_fiscal)}
                {fiscal.cuit&&` · CUIT ${fiscal.cuit}`}
              </button>
              {cliSel&&<span className="text-xs text-p-green font-semibold">✓ {cliSel.nombre}</span>}
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

          {/* Formas de pago */}
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
    </div>
  )
}
