'use client'
import { LOGO_BASE64 } from '@/lib/logo'
import { FIRMA_SAPPA } from '@/lib/firma'
import { useState, useEffect, useCallback } from 'react'
import { buscarCatalogo } from '@/lib/utils/buscarCatalogo'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Presupuesto, VentaItem } from '@/lib/types/database'
import { Modal, Field, Input, Select, Empty } from '@/components/ui'
import { moneyARS, todayStr } from '@/lib/utils/format'
import { jsPDF } from 'jspdf'

const IVA_RATE = 0.21

// Formato con 2 decimales para aseguradoras (debe coincidir exacto con la lista)
const moneyARS2 = (n:number) => '$' + n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// Botones inline
const btn  = { background:'#00A550',color:'#fff',border:'none',borderRadius:10,padding:'10px 20px',fontWeight:700,fontSize:14,cursor:'pointer' } as const
const btnSm= { ...btn,padding:'6px 14px',fontSize:13 } as const
const btnGray = { ...btnSm,background:'#6b7280' } as const
const btnRed  = { ...btnSm,background:'#ef4444' } as const
const btnBlue = { ...btnSm,background:'#1d4ed8' } as const
const btnWa   = { ...btnSm,background:'#25d366' } as const

interface TipoCliente { id:string; nombre:string; margen_pct:number; color:string }
interface RubroPrecio { id:string; nombre:string; precio_base:number; visible_en_impresion:boolean }
interface ClienteMin  { id:string; nombre:string; telefono:string|null; tipo_cliente_id:string|null; tipo_nombre?:string; tipo_margen?:number }
interface Aseguradora { id:string; nombre:string; lista_precio:string; recargo_pct:number }
interface PrecioAseg  { id:string; codigo:string; descripcion:string; cristal:string; marca:string; modelo:string; precio_siva:number; instalacion_siva:number; total_siva:number }

export default function PresupuestosClient({ userId }: { userId:string }) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [presus, setPresus]   = useState<Presupuesto[]>([])
  const [tipos, setTipos]     = useState<TipoCliente[]>([])
  const [rubros, setRubros]   = useState<RubroPrecio[]>([])
  const [open, setOpen]       = useState(false)
  const [expandido, setExpandido] = useState<string|null>(null)
  const [editId, setEditId]   = useState<string|null>(null)
  const [tarjConfigs, setTarjConfigs] = useState<any[]>([])
  const [histCli, setHistCli] = useState<any[]>([])
  const [ivaOn, setIvaOn]     = useState(true)
  const [cotiz, setCotiz]     = useState<{blue:number;mep:number;oficial:number}|null>(null)
  const supabase = createClient()

  // Modo aseguradora
  const [modoAseg, setModoAseg] = useState(false)
  const [aseguradoras, setAseguradoras] = useState<Aseguradora[]>([])
  const [asegSel, setAsegSel]   = useState<Aseguradora|null>(null)
  const [asegQ, setAsegQ]       = useState('')
  const [asegHits, setAsegHits] = useState<PrecioAseg[]>([])
  const [manoObraIncluida, setManoObraIncluida] = useState(true)

  // Flete por proveedor
  const [fleteProv, setFleteProv] = useState<Record<string,number>>({})

  // Form estado
  const [cliQ, setCliQ]       = useState('')
  const [cliSugs, setCliSugs] = useState<ClienteMin[]>([])
  const [cliSel, setCliSel]   = useState<ClienteMin|null>(null)
  const [tipoSel, setTipoSel] = useState<TipoCliente|null>(null)
  const [form, setForm]       = useState({ cli:'', tel:'', veh:'', pat:'', dias:'7' })

  // Items del presupuesto
  const [items, setItems]     = useState<(VentaItem & { costo?:number; esRubro?:boolean; precioModificado?:boolean })[]>([])
  const [catQ, setCatQ]       = useState('')
  const [catHits, setCatHits] = useState<{id:string;descripcion:string;proveedor:string;costo_neto:number;codigo?:string}[]>([])
  const [rubrosEdit, setRubrosEdit] = useState<Record<string,number>>({})
  const [itemManual, setItemManual] = useState({ d:'', c:'1', p:'' })

  // Leer params desde módulo Precios
  useEffect(() => {
    const piezaDesc  = searchParams.get('pieza_desc')
    const piezaPrecio = searchParams.get('pieza_precio')
    const tipoId     = searchParams.get('tipo_id')
    const tipoNombre = searchParams.get('tipo_nombre')
    if (piezaDesc && piezaPrecio) {
      setItems([{ d: piezaDesc, c: 1, p: +piezaPrecio }])
      if (tipoId) {
        setTipoSel(tipos.find(t => t.id === tipoId) || null)
      }
      setOpen(true)
    }
  }, [searchParams, tipos])

  useEffect(() => {
    supabase.from('presupuestos').select('*').order('created_at',{ascending:false}).then(({data})=>setPresus(data??[]))
    supabase.from('tipos_cliente').select('*').order('nombre').then(({data})=>setTipos(data??[]))
    supabase.from('rubros_precio').select('*').eq('activo',true).order('orden').then(({data})=>setRubros(data??[]))
    supabase.from('cotizaciones').select('blue,mep,oficial').order('fecha',{ascending:false}).limit(1).maybeSingle().then(({data})=>{if(data)setCotiz(data)})
    supabase.from('aseguradoras').select('id,nombre,lista_precio,recargo_pct').eq('activo',true).order('nombre').then(({data})=>setAseguradoras((data??[]).map((a:any)=>({...a,recargo_pct:+a.recargo_pct}))))
    supabase.from('proveedores_compra').select('nombre,flete_pct').eq('activo',true)
      .then(({data}) => {
        const m: Record<string,number> = {}
        for (const p of (data??[])) m[p.nombre] = +(p.flete_pct||0)
        setFleteProv(m)
      })
  },[supabase])

  // Búsqueda catálogo (modo normal)
  useEffect(()=>{
    if(modoAseg){setCatHits([]);return}
    if(catQ.trim().length<2){setCatHits([]);return}
    buscarCatalogo(supabase, catQ, { incluirStock: false, limit: 12 })
      .then(resultados => setCatHits(resultados.map(r=>({
        id: r.id, descripcion: r.descripcion || '', proveedor: r.proveedor || '', costo_neto: r.costo_neto || 0, codigo: r.codigo || undefined
      }))))
  },[catQ,supabase,modoAseg])

  // Búsqueda precios aseguradora
  useEffect(()=>{
    if(!modoAseg || !asegSel){setAsegHits([]);return}
    if(asegQ.trim().length<2){setAsegHits([]);return}
    const lista = asegSel.lista_precio
    const q = asegQ.trim()
    // Si parece código (empieza con número), buscar por codigo; sino por descripción
    const esCodigo = /^\d/.test(q)
    if (esCodigo) {
      supabase.from('precios_aseguradora').select('id,codigo,descripcion,cristal,marca,modelo,precio_siva,instalacion_siva,total_siva')
        .eq('lista', lista).ilike('codigo', `${q}%`).limit(15)
        .then(({data})=>setAsegHits((data??[]).map((r:any)=>({...r,precio_siva:+r.precio_siva,instalacion_siva:+r.instalacion_siva,total_siva:+r.total_siva}))))
    } else {
      const palabras = q.split(/\s+/)
      let query = supabase.from('precios_aseguradora').select('id,codigo,descripcion,cristal,marca,modelo,precio_siva,instalacion_siva,total_siva').eq('lista', lista)
      palabras.forEach(p => { query = query.ilike('descripcion', `%${p}%`) })
      query.limit(15).then(({data})=>setAsegHits((data??[]).map((r:any)=>({...r,precio_siva:+r.precio_siva,instalacion_siva:+r.instalacion_siva,total_siva:+r.total_siva}))))
    }
  },[asegQ,asegSel,modoAseg,supabase])

  function pickAseg(h: PrecioAseg) {
    if(!asegSel) return
    const recargo = asegSel.recargo_pct || 0
    // Precio exacto de la lista: total_siva × 1.21 × (1 + recargo)
    const precioFinal = h.total_siva * (1 + IVA_RATE) * (1 + recargo)
    // Redondear a 2 decimales para coincidir con la lista
    const precioExacto = Math.round(precioFinal * 100) / 100
    setItems(prev=>[...prev,{
      d: h.descripcion, c: 1, p: precioExacto,
      costo: h.total_siva, esRubro: false,
      codigo: h.codigo, cristal: h.cristal
    } as any])
    setAsegQ(''); setAsegHits([])
  }

  // Búsqueda clientes
  useEffect(()=>{
    if(cliSel){setCliSugs([]);return}
    if(cliQ.trim().length<2){setCliSugs([]);return}
    supabase.from('clientes').select('id,nombre,telefono,tipo_cliente_id,tipos_cliente(nombre,margen_pct)').ilike('nombre',`%${cliQ}%`).limit(8).then(({data})=>{
      setCliSugs((data??[]).map((c:any)=>({
        id:c.id, nombre:c.nombre, telefono:c.telefono,
        tipo_cliente_id:c.tipo_cliente_id,
        tipo_nombre:c.tipos_cliente?.nombre,
        tipo_margen:c.tipos_cliente?.margen_pct
      })))
    })
  },[cliQ,cliSel,supabase])

  async function selectCliente(c: ClienteMin){
    setCliQ(c.nombre)
    setCliSugs([])
    setCliSel(c)
    setForm(p=>({...p, cli:c.nombre, tel:c.telefono||p.tel}))
    setTipoSel(tipos.find(t=>t.id===c.tipo_cliente_id)||null)
    // Presupuestos anteriores NO convertidos
    const {data} = await supabase.from('presupuestos')
      .select('id,fecha,total,items,vehiculo')
      .ilike('cliente',`%${c.nombre}%`)
      .eq('convertido_os', false).eq('convertido_comp', false)
      .order('created_at',{ascending:false}).limit(3)
    setHistCli(data??[])
  }

  
  function selectConsumidorFinal() {
    const t = tipos.find(t=>t.nombre==='Particular')
    setCliSel(null); setTipoSel(t??null)
    setCliQ(''); setCliSugs([])
  }

  function pickCat(h:{id:string;descripcion:string;proveedor:string;costo_neto:number;codigo?:string}) {
    const margen = tipoSel?.margen_pct ?? 0.45
    // costo_neto ya incluye flete — NO volver a sumar
    const precioSug = Math.round(h.costo_neto * (1 + margen))
    setItems(prev=>[...prev,{d:h.descripcion,c:1,p:precioSug,costo:h.costo_neto,esRubro:false,codigo:h.codigo||undefined} as any])
    setCatQ(''); setCatHits([])
  }

  function addRubro(r: RubroPrecio) {
    const precio = rubrosEdit[r.id] ?? r.precio_base
    setItems(prev=>[...prev,{d:r.nombre,c:1,p:precio,esRubro:true,visible_impresion:r.visible_en_impresion} as any])
  }

  function addItemManual() {
    if(!itemManual.d||!itemManual.p) return
    setItems(prev=>[...prev,{d:itemManual.d,c:+itemManual.c||1,p:+itemManual.p.replace(/[^0-9.]/g,'')}])
    setItemManual({d:'',c:'1',p:''})
  }

  const itemsImpresion = items  // todos los ítems van al PDF
  // En modo aseguradora el precio ya incluye IVA (y recargo si corresponde)
  const neto  = modoAseg ? items.reduce((a,it)=>a+it.c*it.p,0) : items.reduce((a,it)=>a+it.c*it.p,0)
  const iva   = modoAseg ? 0 : (ivaOn ? Math.round(neto*IVA_RATE) : 0)
  const total = neto+iva

  // Precio sugerido vs precio real
  function alertaMargen(it: any) {
    if(!it.costo||!tipoSel) return null
    const minPrecio = Math.round(it.costo*(1+tipoSel.margen_pct))
    if(it.p < minPrecio) return `⚠ Mínimo ${tipoSel.nombre}: ${moneyARS(minPrecio)}`
    return null
  }

  function openEdit(p: any) {
    setEditId(p.id)
    setForm({ cli: p.cliente||'', tel: p.telefono||'', veh: p.vehiculo||'', pat: p.patente||'', dias: String(p.validez_dias||7) })
    setCliQ(p.cliente||'')
    setCliSugs([])
    setItems(p.items||[])
    // Restaurar modo aseguradora
    if (p.es_aseguradora && p.aseguradora_id) {
      setModoAseg(true)
      const a = aseguradoras.find((a:Aseguradora) => a.id === p.aseguradora_id)
      setAsegSel(a ?? { id: p.aseguradora_id, nombre: p.aseguradora_nombre, lista_precio: 'comun', recargo_pct: 0 })
      setManoObraIncluida(p.mano_obra_incluida !== false)
      setTipoSel(null)
    } else {
      setModoAseg(false)
      setAsegSel(null)
      if(p.tipo_cliente_id) setTipoSel(tipos.find((t:any)=>t.id===p.tipo_cliente_id)||null)
    }
    setOpen(true)
  }

  async function toOS(p: any) {
    // Marcar presupuesto como convertido a OS
    await supabase.from('presupuestos').update({ convertido_os: true }).eq('id', p.id)
    const params = new URLSearchParams({
      cli: p.cliente??'', tel: p.telefono??'', veh: p.vehiculo??'',
      pat: p.patente??'',
      items: JSON.stringify(p.items), total: String(p.total), iva: String(p.iva??0),
      pid: p.id,
      ...(p.tipo_cliente_id?{tipo_id:p.tipo_cliente_id}:{}),
      ...(p.tipo_cliente_nombre?{tipo_nombre:p.tipo_cliente_nombre}:{}),
      ...(p.es_aseguradora?{es_aseg:'1'}:{}),
      ...(p.aseguradora_id?{aseg_id:p.aseguradora_id}:{}),
      ...(p.aseguradora_nombre?{aseg_nombre:p.aseguradora_nombre}:{}),
    })
    router.push(`/ordenes?${params.toString()}`)
  }

  async function save() {
    if(!items.length) return
    const dias=+form.dias||7
    const venc=new Date(); venc.setDate(venc.getDate()+dias)
    if(editId) {
      await supabase.from('presupuestos').update({
        cliente:form.cli||null, telefono:form.tel||null, vehiculo:form.veh||null, patente:form.pat||null,
        items, total:total, iva:iva||null,
        tipo_cliente_id:tipoSel?.id||null, tipo_cliente_nombre:tipoSel?.nombre||null,
      }).eq('id', editId)
      setEditId(null)
    } else {
      await supabase.from('presupuestos').insert({
        fecha:todayStr(), vencimiento:venc.toISOString().slice(0,10),
        cliente:form.cli||null, telefono:form.tel||null, vehiculo:form.veh||null, patente:form.pat||null,
        items:itemsImpresion, neto, iva_pct:IVA_RATE, iva, total,
        dolar_blue:cotiz?.oficial??null, dolar_mep:cotiz?.mep??null, user_id:userId,
        tipo_cliente_id:tipoSel?.id??null, tipo_cliente_nombre:tipoSel?.nombre??null,
        margen_aplicado:tipoSel?.margen_pct??null,
        es_aseguradora: modoAseg,
        aseguradora_id: modoAseg ? asegSel?.id ?? null : null,
        aseguradora_nombre: modoAseg ? asegSel?.nombre ?? null : null,
        mano_obra_incluida: modoAseg ? manoObraIncluida : null,
      })
    }
    setOpen(false); setItems([]); setCliSel(null); setTipoSel(null); setEditId(null)
    setModoAseg(false); setAsegSel(null); setAsegQ('')
    setForm({cli:'',tel:'',veh:'',pat:'',dias:'7'})
    const {data}=await supabase.from('presupuestos').select('*').order('created_at',{ascending:false})
    setPresus(data??[])
  }

  // PDF con jsPDF
  async function generarPDF(p: Presupuesto): Promise<Blob> {
    const doc = new jsPDF({ format:'a4', unit:'mm' })
    const W=210, pad=14, rw=W-pad*2
    const esAseg = !!(p as any).es_aseguradora
    // Solo "Compañías" discrimina IVA — Particular y Chapista son CF
    const esRI = !esAseg && (p as any).tipo_cliente_nombre === 'Compañías'
    const fmt = (n:number) => esAseg ? moneyARS2(n) : moneyARS(n)
    const rRect = (x:number,yy:number,w:number,h:number,r:number,style:'F'|'S'|'FD') => doc.roundedRect(x,yy,w,h,r,r,style)
    let y=12

    // ─── HEADER ───
    try { doc.addImage(LOGO_BASE64,'PNG',pad,y-2,28,15) } catch(e){}
    doc.setTextColor(30,30,30); doc.setFont('helvetica','bold'); doc.setFontSize(10)
    doc.text('PARABRISAS EL PIAMONTE', pad+32, y+2)
    doc.setFont('helvetica','normal'); doc.setTextColor(100,100,100); doc.setFontSize(7)
    doc.text('Calle 102 N.366 - General Pico, La Pampa', pad+32, y+7)
    doc.text('Tel: 02302-15595969 / 02302-15464733', pad+32, y+11)
    doc.text('CUIT: 27-24265717-4 - IVA Responsable Inscripto', pad+32, y+15)
    // Badge PRESUPUESTO
    doc.setDrawColor(30,30,30); doc.setLineWidth(0.5)
    rRect(W-pad-36, y-2, 36, 18, 2, 'S')
    doc.setFontSize(7); doc.setTextColor(100,100,100)
    doc.text('PRESUPUESTO', W-pad-18, y+4, {align:'center'})
    doc.setFontSize(9); doc.setFont('helvetica','bold'); doc.setTextColor(30,30,30)
    doc.text(p.fecha.split('-').reverse().join('/'), W-pad-18, y+12, {align:'center'})
    y+=19

    // Línea verde
    doc.setFillColor(0,165,80); doc.rect(pad, y, rw, 1.5, 'F')
    y+=5

    // Marca de agua
    const gState = new (doc as any).GState({ opacity: 0.05 })
    doc.saveGraphicsState(); doc.setGState(gState)
    try { doc.addImage(LOGO_BASE64, 'PNG', 60, 120, 90, 50) } catch(e){}
    doc.setFont('helvetica','bold'); doc.setFontSize(30); doc.setTextColor(0,165,80)
    doc.text('EL PIAMONTE', W/2, 190, {align:'center'})
    doc.setFontSize(8); doc.text('www.parabrisaselpiamonte.com.ar', W/2, 198, {align:'center'})
    doc.restoreGraphicsState(); doc.setTextColor(30,30,30)

    // ─── DATOS CLIENTE ───
    doc.setFillColor(248,251,249); doc.setDrawColor(210,220,215); doc.setLineWidth(0.3)

    if (esAseg && (p as any).aseguradora_nombre) {
      const leftLines = [(p as any).aseguradora_nombre, (p as any).aseg_cuit, 'Responsable Inscripto', 'Cuenta Corriente'].filter(Boolean).length
      const rightLines = [p.cliente, (p as any).siniestro||null, p.vehiculo, (p as any).patente, p.telefono].filter(Boolean).length
      const boxH = 12 + Math.max(leftLines, rightLines) * 4 + 4
      rRect(pad, y, rw, boxH, 3, 'FD')
      doc.line(W/2, y+1, W/2, y+boxH-1)

      doc.setFontSize(6.5); doc.setFont('helvetica','bold'); doc.setTextColor(0,165,80)
      doc.text('ASEGURADORA', pad+3, y+5)
      doc.setFont('helvetica','bold'); doc.setFontSize(8.5); doc.setTextColor(30,30,30)
      doc.text((p as any).aseguradora_nombre, pad+3, y+10)
      doc.setFont('helvetica','normal'); doc.setFontSize(7.5); doc.setTextColor(80,80,80)
      let ly = y+15
      doc.text('IVA: Responsable Inscripto', pad+3, ly); ly+=4
      doc.text('Cond. Vta.: Cuenta Corriente', pad+3, ly)

      const rx = W/2+3
      doc.setFontSize(6.5); doc.setFont('helvetica','bold'); doc.setTextColor(0,165,80)
      doc.text('ASEGURADO', rx, y+5)
      doc.setFont('helvetica','bold'); doc.setFontSize(8.5); doc.setTextColor(30,30,30)
      doc.text(p.cliente||'—', rx, y+10)
      doc.setFont('helvetica','normal'); doc.setFontSize(7.5); doc.setTextColor(80,80,80)
      let ry = y+15
      if(p.vehiculo){ doc.text(`Vehiculo: ${p.vehiculo}`, rx, ry); ry+=4 }
      if((p as any).patente){ doc.text(`Patente: ${(p as any).patente}`, rx, ry); ry+=4 }
      if(p.telefono){ doc.text(`Tel: ${p.telefono}`, rx, ry) }
      y += boxH + 4
    } else {
      const filas = [
        `Cliente: ${p.cliente||'Consumidor Final'}`,
        ...(p.telefono ? [`Tel: ${p.telefono}`] : []),
        ...(p.vehiculo ? [`Vehiculo: ${p.vehiculo}`] : []),
        ...((p as any).patente ? [`Patente: ${(p as any).patente}`] : []),
        ...((p as any).tipo_cliente_nombre ? [`Tipo: ${(p as any).tipo_cliente_nombre}`] : []),
      ]
      const boxH = filas.length * 4.5 + 4
      rRect(pad, y, rw, boxH, 3, 'FD')
      let cy = y + 5
      filas.forEach(f => {
        const parts = f.split(': ')
        doc.setFont('helvetica','bold'); doc.setFontSize(8); doc.setTextColor(30,30,30)
        doc.text(parts[0]+':', pad+3, cy)
        doc.setFont('helvetica','normal'); doc.text(parts.slice(1).join(': '), pad+28, cy)
        cy += 4.5
      })
      y += boxH + 4
    }

    // ─── TABLA ───
    const cols=[68,14,44,44]
    doc.setFillColor(0,165,80)
    rRect(pad, y, rw, 6, 2, 'F')
    doc.setTextColor(255,255,255); doc.setFont('helvetica','bold'); doc.setFontSize(8)
    const hx = pad
    doc.text('Detalle', hx+2, y+4.5)
    doc.text('Cant.', hx+cols[0]+cols[1]-2, y+4.5, {align:'right'})
    doc.text('Precio unit.', hx+cols[0]+cols[1]+cols[2]-2, y+4.5, {align:'right'})
    doc.text('Subtotal', hx+cols[0]+cols[1]+cols[2]+cols[3]-2, y+4.5, {align:'right'})
    y+=6
    doc.setTextColor(30,30,30); doc.setFont('helvetica','normal'); doc.setFontSize(8)
    p.items.forEach((it:VentaItem, idx:number)=>{
      if(idx%2===0){ doc.setFillColor(245,250,247); doc.rect(pad,y,rw,6,'F') }
      doc.text(it.d.slice(0,45), hx+2, y+4.5)
      doc.text(String(it.c), hx+cols[0]+cols[1]-2, y+4.5, {align:'right'})
      doc.text(fmt(it.p), hx+cols[0]+cols[1]+cols[2]-2, y+4.5, {align:'right'})
      doc.text(fmt(it.c*it.p), hx+cols[0]+cols[1]+cols[2]+cols[3]-2, y+4.5, {align:'right'})
      y+=6
    })

    // ─── TOTALES — posición fija ───
    const totY = 243
    const tc=2, tw=rw/tc
    doc.setFillColor(0,165,80)
    rRect(pad, totY, rw, 6, 2, 'F')
    doc.setTextColor(255,255,255); doc.setFont('helvetica','bold'); doc.setFontSize(7.5)
    if(esAseg){
      doc.text('Total (IVA incluido)', pad+rw/2, totY+4.5, {align:'center'})
    } else if(esRI) {
      doc.text('Neto', pad+tw/2, totY+4.5, {align:'center'})
      doc.text('IVA 21%', pad+tw+tw/2, totY+4.5, {align:'center'})
    } else {
      doc.text('Total', pad+rw/2, totY+4.5, {align:'center'})
    }
    doc.setFillColor(248,251,249); doc.setDrawColor(210,220,215); doc.setLineWidth(0.3)
    rRect(pad, totY+6, rw, 7, 0, 'FD')
    doc.setTextColor(30,30,30); doc.setFontSize(9)
    if(esAseg){
      doc.setFont('helvetica','bold')
      doc.text(fmt(p.total), pad+rw/2, totY+11.5, {align:'center'})
    } else if(esRI) {
      doc.setFont('helvetica','normal'); doc.text(fmt(p.neto||p.total), pad+tw/2, totY+11.5, {align:'center'})
      doc.setFont('helvetica','bold'); doc.text(fmt(p.iva), pad+tw+tw/2, totY+11.5, {align:'center'})
    } else {
      doc.setFont('helvetica','bold')
      doc.text(fmt(p.total), pad+rw/2, totY+11.5, {align:'center'})
    }

    // Vencimiento
    doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(120,120,120)
    doc.text(`Valido hasta el ${p.vencimiento.split('-').reverse().join('/')}.`, pad, 265)

    // USD oficial — solo si no es aseg y hay cotización
    if(!esAseg && p.dolar_mep){
      doc.setFont('helvetica','italic'); doc.setFontSize(8); doc.setTextColor(0,100,60)
      doc.text(`≈ US$${Math.round(p.total/p.dolar_mep).toLocaleString('es-AR')} (oficial)`, W-pad, 272, {align:'right'})
    }
    // Leyenda MO: solo si incluye — si no incluye, silencio
    if((p as any).mano_obra_incluida !== false) {
      doc.setFont('helvetica','italic'); doc.setFontSize(8)
      doc.setTextColor(esAseg ? 100 : 0, esAseg ? 50 : 100, esAseg ? 150 : 60)
      doc.text('✓ Precio incluye mano de obra y colocacion', pad, 272)
      doc.setTextColor(30,30,30)
    }

    // ─── FOOTER ───
    doc.setFillColor(0,165,80); doc.rect(0,285,W,12,'F')
    doc.setTextColor(255,255,255); doc.setFont('helvetica','normal'); doc.setFontSize(8)
    doc.text('Tel: 2302 595969', pad, 292)
    doc.text('General Pico, La Pampa', W/2, 292, {align:'center'})
    doc.text('Calle 102 Nro 366', W-pad, 292, {align:'right'})

    return doc.output('blob')
  }

  async function compartirWA(p: Presupuesto) {
    const blob = await generarPDF(p)
    const nombre = `presupuesto-${p.id}.pdf`

    // Subir PDF a Supabase Storage
    try {
      await supabase.storage
        .from('presupuestos')
        .upload(nombre, blob, { contentType: 'application/pdf', upsert: true })
    } catch(e) {
      console.warn('No se pudo subir el PDF a Storage:', e)
    }

    // URL con número correlativo — más limpia para el cliente
    const nroPresupuesto = (p as any).numero || p.id
    const linkPDF = `${window.location.origin}/presupuesto/${nroPresupuesto}`

    const tel = (p.telefono??'').replace(/[^0-9]/g,'')
    const total = (p as any).es_aseguradora ? moneyARS2(p.total) : moneyARS(p.total)
    const texto = `Hola${p.cliente?' '+p.cliente:''}! Te enviamos el presupuesto de Parabrisas El Piamonte.\n\nTotal: ${total}\nVálido hasta: ${p.vencimiento.split('-').reverse().join('/')}\n\n📄 Ver presupuesto: ${linkPDF}`

    // Mobile: compartir con WhatsApp
    const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent)
    if (isMobile && tel) {
      let num = tel.replace(/^0/,'').replace(/^549/,'').replace(/^54/,'').replace(/^9/,'')
      window.open(`https://wa.me/549${num}?text=${encodeURIComponent(texto)}`, '_blank')
      return
    }

    // Desktop: abrir WhatsApp Web con el link
    if (tel) {
      let num = tel.replace(/^0/,'').replace(/^549/,'').replace(/^54/,'').replace(/^9/,'')
      window.open(`https://web.whatsapp.com/send?phone=549${num}&text=${encodeURIComponent(texto)}`, '_blank')
    }
  }

  const moneyStr = (n:number) => '$' + Math.round(n).toLocaleString('es-AR')

  async function descargarPDF(p: Presupuesto) {
    const blob = await generarPDF(p)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href=url
    a.download=`Presupuesto-${p.cliente?.replace(/\s/g,'-')??'Piamonte'}.pdf`
    a.click(); URL.revokeObjectURL(url)
  }

  async function del(id:string) {
    if(!confirm('¿Borrar presupuesto?')) return
    await supabase.from('presupuestos').delete().eq('id',id)
    setPresus(prev=>prev.filter(p=>p.id!==id))
  }

  const today = todayStr()

  return (
    <div>
      <div style={{display:'flex',justifyContent:'flex-end',marginBottom:20}}>
        <button onClick={()=>setOpen(true)} style={btn}>+ Nuevo presupuesto</button>
      </div>

      {presus.length===0 ? <Empty msg="Sin presupuestos todavía." /> : (
        <div className="flex flex-col gap-4">
          {presus.map(p=>{
            const venc = p.vencimiento<today
            const usdBlue = p.dolar_blue?`US$${Math.round(p.total/p.dolar_blue).toLocaleString('es-AR')} oficial`:''
            return (
              <div key={p.id}
                onClick={()=>setExpandido(e=>e===p.id?null:p.id)}
                onDoubleClick={()=>{ if(!(p as any).convertido_os && !(p as any).convertido_comp) openEdit(p) }} title="Click para opciones · doble click para editar"
                className={`bg-white border border-p-line rounded-xl shadow-sm cursor-pointer hover:border-p-green transition-colors overflow-hidden ${venc?'opacity-60':''}`}>
                <div className="flex items-center gap-2.5 px-3.5 py-2.5 flex-wrap">
                  <p className="font-saira font-bold text-p-ink text-sm truncate" style={{maxWidth:200}}>
                    {(p as any).numero && <span className="text-p-ink2 font-normal text-xs mr-1.5">P-{String((p as any).numero).padStart(4,'0')}</span>}
                    {p.cliente||'(sin nombre)'}
                  </p>
                  {(p as any).tipo_cliente_nombre && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-p-light text-p-dark shrink-0">{(p as any).tipo_cliente_nombre}</span>
                  )}
                  {(p as any).es_aseguradora && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 shrink-0">🏢 {(p as any).aseguradora_nombre || 'Aseguradora'}</span>
                  )}
                  {(p as any).convertido_os && !((p as any).convertido_comp) && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 shrink-0">🔧 OS</span>
                  )}
                  {(p as any).convertido_comp && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700 shrink-0">🧾 FC</span>
                  )}
                  {venc && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 shrink-0">VENCIDO</span>}
                  <span className="text-xs text-p-ink2 shrink-0">{p.vehiculo}</span>
                  <span className="text-xs text-p-ink2 shrink-0">vence {p.vencimiento.split('-').reverse().join('/')}</span>
                  <div className="flex-1 min-w-[8px]"/>
                  {usdBlue&&<span className="font-mono text-xs text-p-dark shrink-0">{usdBlue}</span>}
                  <p className="font-saira font-bold text-p-ink shrink-0">{(p as any).es_aseguradora ? moneyARS2(p.total) : moneyARS(p.total)}</p>
                </div>

                {expandido===p.id && (
                  <div onClick={e=>e.stopPropagation()} className="px-3.5 pb-3 pt-2 border-t border-p-line2 bg-p-light/30">
                    <p className="text-xs text-p-ink2 mb-2">{p.items.length} ítem(s) · {p.iva?'con IVA':'sin IVA'}</p>
                    <div className="flex gap-2 flex-wrap">
                      {!(p as any).convertido_os && !(p as any).convertido_comp && (
                        <button onClick={()=>openEdit(p)} style={{...btnSm,background:'#6b7280'}}>✏ Editar</button>
                      )}
                      {!(p as any).convertido_os && !(p as any).convertido_comp && (
                        <button onClick={()=>toOS(p)} style={{...btnSm,background:'#1d4ed8'}}>→ OS</button>
                      )}
                      {!(p as any).convertido_comp && (
                        <button onClick={async()=>{
                          await supabase.from('presupuestos').update({ convertido_comp: true }).eq('id', p.id)
                          const params = new URLSearchParams({
                            cli: p.cliente??'', tel: p.telefono??'', veh: p.vehiculo??'',
                            items: JSON.stringify(p.items), total: String(p.total), iva: String(p.iva??0),
                            pid: p.id,
                            ...(p.tipo_cliente_id?{tipo_id:p.tipo_cliente_id}:{}),
                            ...(p.tipo_cliente_nombre?{tipo_nombre:p.tipo_cliente_nombre}:{}),
                          })
                          router.push(`/comprobantes?${params.toString()}`)
                        }} style={{...btnSm,background:'#00A550'}}>✓ Comprobante</button>
                      )}
                      <button onClick={()=>compartirWA(p)} style={btnWa}>📱 WA</button>
                      <button onClick={()=>descargarPDF(p)} style={btnSm}>⬇ PDF</button>
                      {!(p as any).convertido_os && !(p as any).convertido_comp && (
                        <button onClick={()=>del(p.id)} style={btnRed}>Borrar</button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <Modal open={open} onClose={()=>setOpen(false)} title={editId ? "Editar presupuesto" : "Nuevo presupuesto"}>
        <div className="flex flex-col gap-3">

          {/* Toggle modo */}
          <div className="flex rounded-xl overflow-hidden border border-p-line">
            <button onClick={()=>{if(editId)return;setModoAseg(false);setItems([]);setAsegSel(null);setAsegQ('')}}
              className={`flex-1 py-2.5 text-sm font-bold transition-colors ${!modoAseg?'bg-[#0C1810] text-white':'bg-white text-p-ink2 hover:bg-p-light'} ${editId?'cursor-default':''}`}>
              👤 Particular / Chapista
            </button>
            <button onClick={()=>{if(editId)return;setModoAseg(true);setItems([]);setTipoSel(null);setCatQ('')}}
              className={`flex-1 py-2.5 text-sm font-bold transition-colors ${modoAseg?'bg-purple-600 text-white':'bg-white text-p-ink2 hover:bg-p-light'} ${editId?'cursor-default':''}`}>
              🏢 Aseguradora
            </button>
          </div>

          {/* --- MODO ASEGURADORA --- */}
          {modoAseg ? (<>
            {/* Selector de aseguradora */}
            <Field label="Compañía aseguradora">
              <Select value={asegSel?.id??''} onChange={e=>{const a=aseguradoras.find(a=>a.id===e.target.value);setAsegSel(a??null);setItems([]);setAsegQ('')}}>
                <option value="">Seleccionar aseguradora…</option>
                {aseguradoras.map(a=><option key={a.id} value={a.id}>{a.nombre}{a.recargo_pct>0?` (+${Math.round(a.recargo_pct*100)}%)`:''}</option>)}
              </Select>
            </Field>

            {asegSel && (
              <div className="flex items-center justify-between bg-purple-50 border border-purple-200 rounded-lg px-3 py-2">
                <div className="text-xs text-purple-800 font-semibold">
                  Lista: <strong>{asegSel.lista_precio === 'patronal' ? 'Federación Patronal' : 'Común'}</strong>
                  {asegSel.recargo_pct > 0 && <> · Recargo: <strong>{Math.round(asegSel.recargo_pct*100)}%</strong></>}
                  {' '}· Precios con IVA 21% incluido
                </div>
                <label className="flex items-center gap-1.5 text-xs text-purple-800 cursor-pointer whitespace-nowrap ml-3">
                  <input type="checkbox" checked={manoObraIncluida} onChange={e=>setManoObraIncluida(e.target.checked)} className="accent-purple-600"/>
                  Mano de obra incluida
                </label>
              </div>
            )}

            {/* Datos del asegurado */}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Nombre asegurado *"><Input value={form.cli} onChange={e=>setForm(p=>({...p,cli:e.target.value}))} placeholder="Nombre completo"/></Field>
              <Field label="WhatsApp"><Input value={form.tel} onChange={e=>setForm(p=>({...p,tel:e.target.value}))} placeholder="54 9 …"/></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Vehículo"><Input value={form.veh} onChange={e=>setForm(p=>({...p,veh:e.target.value}))} placeholder="VW Gol 2015"/></Field>
              <Field label="Patente"><Input value={form.pat} onChange={e=>setForm(p=>({...p,pat:e.target.value.toUpperCase()}))} placeholder="ABC 123"/></Field>
            </div>

            {/* Búsqueda en lista Pilkington */}
            <div>
              <label className="block text-[11px] font-semibold text-purple-700 uppercase tracking-wider mb-1.5">Buscar vidrio en lista Pilkington</label>
              <div className="relative">
                <Input value={asegQ} onChange={e=>setAsegQ(e.target.value)} placeholder={asegSel ? "Código Pilkington o descripción…" : "⬆ Seleccioná una aseguradora primero"} disabled={!asegSel}/>
                {asegHits.length>0&&(
                    <div className="absolute z-20 top-full left-0 right-0 bg-white border border-purple-200 rounded-xl shadow-xl max-h-64 overflow-y-auto mt-1">
                      {asegHits.map(h=>{
                        const recargo = asegSel?.recargo_pct || 0
                        const precioFinal = Math.round(h.total_siva * (1 + IVA_RATE) * (1 + recargo) * 100) / 100
                        return(
                          <button key={h.id} onClick={()=>pickAseg(h)} className="w-full text-left px-3 py-2.5 hover:bg-purple-50 border-b border-p-line2 last:border-0 flex items-center justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-p-ink truncate">{h.descripcion}</p>
                              <p className="text-[10px] text-p-ink2 flex items-center gap-1.5 flex-wrap">
                                <span className="font-mono font-bold bg-purple-100 text-purple-700 px-1.5 rounded">{h.codigo}</span>
                                <span>{h.cristal}</span>
                                <span className="text-p-ink2">s/IVA: {moneyARS2(h.total_siva)}</span>
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="font-mono font-bold text-sm text-purple-700">{moneyARS2(precioFinal)}</p>
                              <p className="text-[10px] text-purple-500">con IVA{recargo>0?' +recargo':''}</p>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )}
              </div>
            </div>
          </>) : (<>

          {/* --- MODO NORMAL (Particular/Chapista) --- */}
          {/* Selección de cliente */}
          <div>
            <label className="block text-[11px] font-semibold text-p-ink2 uppercase tracking-wider mb-1.5">Cliente</label>
            <div className="relative">
              <Input value={cliQ} onChange={e=>{
                const v = e.target.value
                setCliQ(v); setCliSel(null)
                setForm(p=>({...p, cli:v}))
              }} placeholder="Buscar cliente existente…"/>
              {cliSugs.length>0&&(
                <div className="absolute z-20 top-full left-0 right-0 bg-white border border-p-line rounded-xl shadow-xl max-h-48 overflow-y-auto mt-1">
                  <button onClick={selectConsumidorFinal} className="w-full text-left px-3 py-2.5 text-sm hover:bg-p-light border-b border-p-line2 font-semibold text-p-dark">
                    👤 Consumidor final
                  </button>
                  {cliSugs.map(c=>(
                    <button key={c.id} onClick={()=>selectCliente(c)} className="w-full text-left px-3 py-2.5 text-sm hover:bg-p-light border-b border-p-line2 last:border-0 flex items-center justify-between">
                      <div>
                        <p className="font-medium text-p-ink">{c.nombre}</p>
                        {c.tipo_nombre&&<p className="text-[10px] text-p-ink2">{c.tipo_nombre}</p>}
                      </div>
                      {c.tipo_margen&&<span className="text-xs text-p-dark font-mono">{Math.round(c.tipo_margen*100)}% margen</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-2 mt-1.5 flex-wrap">
              <button onClick={selectConsumidorFinal} style={{...btnSm,background:'#f3f4f6',color:'#374151',border:'1px solid #d1d5db',fontSize:12}}>
                👤 Consumidor final
              </button>
              {cliSel&&<span className="text-xs bg-p-light text-p-dark px-2 py-1 rounded-full font-semibold">✓ {cliSel.nombre}</span>}
            </div>
          </div>

          {/* Tipo + Margen */}
          <div className="grid grid-cols-2 gap-3">
            {/* Historial del cliente */}
            {histCli.length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-1">
                <p className="text-[11px] font-bold text-blue-800 uppercase tracking-wider mb-2">📋 Presupuestos anteriores — click para cargar</p>
                <div className="flex flex-col gap-1.5">
                  {histCli.map((p:any) => (
                    <button key={p.id} onClick={()=>{ setItems(p.items||[]); setForm((prev:any)=>({...prev,veh:p.vehiculo||prev.veh})); setHistCli([]) }}
                      className="flex items-center gap-3 bg-white rounded-lg px-3 py-2 text-left hover:bg-blue-50 border border-blue-100 w-full">
                      <span className="text-xs text-p-ink flex-1 truncate">{p.vehiculo||'Sin vehículo'} · {p.items?.length||0} ítem(s)</span>
                      <span className="text-xs font-mono font-bold text-p-dark shrink-0">{'$'+Math.round(p.total||0).toLocaleString('es-AR')}</span>
                      <span className="text-[10px] text-p-ink2 shrink-0">{p.fecha?.split('-').reverse().join('/')}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <Field label="Tipo de cliente">
              <Select value={tipoSel?.id??''} onChange={e=>{const t=tipos.find(t=>t.id===e.target.value);setTipoSel(t??null)}}>
                <option value="">Sin tipo</option>
                {tipos.map(t=><option key={t.id} value={t.id}>{t.nombre} ({Math.round(t.margen_pct*100)}% margen)</option>)}
              </Select>
            </Field>
            <Field label="Vehículo"><Input value={form.veh} onChange={e=>setForm(p=>({...p,veh:e.target.value}))} placeholder="VW Gol 2015"/></Field>
          </div>

          {tipoSel&&(
            <div className="bg-p-light rounded-lg px-3 py-2 text-xs text-p-dark font-semibold">
              Margen aplicado: <strong>{Math.round(tipoSel.margen_pct*100)}%</strong> — precio sugerido = costo × {(1+tipoSel.margen_pct).toFixed(2)}
            </div>
          )}

          {/* Datos de contacto */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nombre del cliente *"><Input value={form.cli} onChange={e=>setForm(p=>({...p,cli:e.target.value}))} placeholder="Nombre completo"/></Field>
            <Field label="WhatsApp"><Input value={form.tel} onChange={e=>setForm(p=>({...p,tel:e.target.value}))} placeholder="54 9 …"/></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Vehículo"><Input value={form.veh} onChange={e=>setForm(p=>({...p,veh:e.target.value}))} placeholder="VW Gol 2015"/></Field>
            <Field label="Patente"><Input value={form.pat} onChange={e=>setForm(p=>({...p,pat:e.target.value.toUpperCase()}))} placeholder="ABC 123"/></Field>
          </div>

          {/* Búsqueda en catálogo */}
          <div>
            <label className="block text-[11px] font-semibold text-p-ink2 uppercase tracking-wider mb-1.5">Buscar vidrio en catálogo</label>
            <div className="relative">
              <Input value={catQ} onChange={e=>setCatQ(e.target.value)} placeholder="Modelo, marca…"/>
              {catHits.length>0&&(
                <div className="absolute z-20 top-full left-0 right-0 bg-white border border-p-line rounded-xl shadow-xl max-h-52 overflow-y-auto mt-1">
                  {catHits.map(h=>{
                    const margen=tipoSel?.margen_pct??0.45
                    const sug=Math.round(h.costo_neto*(1+margen))
                    return(
                      <button key={h.id} onClick={()=>pickCat(h)} className="w-full text-left px-3 py-2.5 hover:bg-p-light border-b border-p-line2 last:border-0 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-p-ink">{h.descripcion}</p>
                          <p className="text-[10px] text-p-ink2 flex items-center gap-1.5">
                            {h.codigo && <span className="font-mono font-bold bg-p-light px-1.5 rounded">{h.codigo}</span>}
                            <span>{h.proveedor} · costo {moneyARS(h.costo_neto)}</span>
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-mono font-bold text-sm text-p-dark">{moneyARS(sug)}</p>
                          <p className="text-[10px] text-p-green">precio sugerido</p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
          </>)}

          {/* Rubros rápidos + Ítem libre (solo modo normal) */}
          {!modoAseg && (<>
          <div>
            <label className="block text-[11px] font-semibold text-p-ink2 uppercase tracking-wider mb-1.5">Rubros rápidos</label>
            <div className="grid grid-cols-2 gap-2">
              {rubros.map(r=>(
                <div key={r.id} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
                  <button onClick={()=>addRubro(r)} className="text-xs font-bold text-p-dark hover:text-p-green">+ {r.nombre}</button>
                  <input type="number" value={rubrosEdit[r.id]??r.precio_base}
                    onChange={e=>setRubrosEdit(p=>({...p,[r.id]:+e.target.value}))}
                    className="ml-auto w-24 border border-p-line rounded px-2 py-0.5 text-xs font-mono text-right focus:outline-none focus:border-p-green"
                    onFocus={()=>setRubrosEdit(p=>({...p,[r.id]:p[r.id]??r.precio_base}))}/>
                </div>
              ))}
            </div>
          </div>

          {/* Ítem manual */}
          <div>
            <label className="block text-[11px] font-semibold text-p-ink2 uppercase tracking-wider mb-1.5">Ítem libre</label>
            <div className="grid grid-cols-5 gap-2">
              <div className="col-span-2"><Input value={itemManual.d} onChange={e=>setItemManual(p=>({...p,d:e.target.value}))} placeholder="Descripción"/></div>
              <Input type="number" value={itemManual.c} onChange={e=>setItemManual(p=>({...p,c:e.target.value}))} min="1" placeholder="Cant."/>
              <div className="col-span-2"><Input value={itemManual.p} onChange={e=>setItemManual(p=>({...p,p:e.target.value}))} placeholder="$ precio"/></div>
            </div>
            <button onClick={addItemManual} style={{...btnGray,width:'100%',marginTop:6}}>+ Agregar ítem libre</button>
          </div>
          </>)}

          {/* Lista de ítems */}
          {items.length>0&&(
            <div className="border-t border-p-line2 pt-2">
              {items.map((it,i)=>{
                const alerta = alertaMargen(it)
                const esRubro = (it as any).esRubro
                return(
                  <div key={i} className="flex items-center justify-between py-1.5 border-b border-p-line2 text-sm">
                    <div className="min-w-0 flex-1">
                      <span className="text-p-ink">
                        {(it as any).codigo && <span className="font-mono text-[10px] font-bold bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded mr-1.5">{(it as any).codigo}</span>}
                        {it.d}{it.c>1?` (×${it.c})`:''}</span>
                      {alerta&&<p className="text-[10px] text-amber-600 font-semibold">{alerta}</p>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {modoAseg ? (
                        <div className="flex flex-col items-end gap-0.5">
                          <div className="flex items-center gap-1">
                            <span className="text-[9px] text-purple-500">c/IVA</span>
                            <input value={typeof it.p === 'number' ? it.p.toFixed(2) : it.p} onChange={e=>{
                              const v = parseFloat(String(e.target.value).replace(',','.')) || 0
                              setItems(prev=>prev.map((x,j)=>j===i?{...x,p:v,precioModificado:true}:x))
                            }}
                            className="w-28 border border-purple-200 rounded px-2 py-0.5 text-xs font-mono text-right focus:outline-none focus:border-purple-400"/>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-[9px] text-p-ink2">s/IVA</span>
                            <input value={(Math.round(it.p / (1 + IVA_RATE) * 100) / 100).toFixed(2)}
                              onChange={e=>{
                                const neto = parseFloat(String(e.target.value).replace(',','.')) || 0
                                const conIva = Math.round(neto * (1 + IVA_RATE) * 100) / 100
                                setItems(prev=>prev.map((x,j)=>j===i?{...x,p:conIva,precioModificado:true}:x))
                              }}
                              className="w-28 border border-p-line rounded px-2 py-0.5 text-[10px] font-mono text-right text-p-ink2 focus:outline-none focus:border-p-green"/>
                          </div>
                        </div>
                      ) : (
                        <input value={it.p} onChange={e=>{const v=+e.target.value;setItems(prev=>prev.map((x,j)=>j===i?{...x,p:v,precioModificado:true}:x))}}
                          className="w-28 border border-p-line rounded px-2 py-0.5 text-xs font-mono text-right focus:outline-none focus:border-p-green"/>
                      )}
                      <span className="font-mono text-p-ink text-xs w-24 text-right">{modoAseg ? moneyARS2(it.c*it.p) : moneyARS(it.c*it.p)}</span>
                      <button onClick={()=>setItems(prev=>prev.filter((_,j)=>j!==i))} className="text-red-400 text-xs">✕</button>
                    </div>
                  </div>
                )
              })}
              {!modoAseg && (
                <label className="flex items-center gap-2 mt-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={ivaOn} onChange={e=>setIvaOn(e.target.checked)} className="accent-p-green"/>Sumar IVA 21%
                </label>
              )}
              <div className="bg-p-light rounded-lg p-3 mt-2 text-sm">
                {modoAseg ? (
                  <>
                    <div className="flex justify-between font-saira font-bold text-purple-700 text-lg"><span>TOTAL (IVA incluido)</span><span>{moneyARS2(neto)}</span></div>
                    {asegSel && <p className="text-[10px] text-purple-500 mt-1">{asegSel.nombre}</p>}
                    <p className="text-[10px] text-purple-400 mt-0.5">{manoObraIncluida ? '✓ Precio incluye mano de obra' : 'No incluye mano de obra'}</p>
                  </>
                ) : (
                  <>
                    <div className="flex justify-between text-p-ink2"><span>Subtotal neto</span><span className="font-mono">{moneyARS(neto)}</span></div>
                    {ivaOn&&<div className="flex justify-between text-p-ink2"><span>IVA 21%</span><span className="font-mono">{moneyARS(iva)}</span></div>}
                    <div className="flex justify-between font-saira font-bold text-p-ink text-lg border-t border-p-line mt-1 pt-1"><span>TOTAL</span><span>{moneyARS(total)}</span></div>
                  </>
                )}
                {cotiz?.oficial&&<p className="font-mono text-xs text-p-dark mt-1 text-right">≈ US${Math.round(total/cotiz.oficial).toLocaleString('es-AR')} oficial</p>}
              </div>
            </div>
          )}

          <div className="flex justify-between items-center pt-1">
            <Field label="Válido por">
              <div className="flex items-center gap-1">
                <Input type="number" value={form.dias} onChange={e=>setForm(p=>({...p,dias:e.target.value}))} className="w-16" min="1"/>
                <span className="text-sm text-p-ink2">días</span>
              </div>
            </Field>
            <div className="flex gap-2">
              <button onClick={()=>setOpen(false)} style={btnGray}>Cancelar</button>
              <button onClick={save} style={btn}>Guardar</button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  )
}
