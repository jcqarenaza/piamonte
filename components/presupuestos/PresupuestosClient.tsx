'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Presupuesto, VentaItem } from '@/lib/types/database'
import { Modal, Field, Input, Select, Empty } from '@/components/ui'
import { moneyARS, todayStr } from '@/lib/utils/format'

const IVA_RATE = 0.21

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

export default function PresupuestosClient({ userId }: { userId:string }) {
  const [presus, setPresus]   = useState<Presupuesto[]>([])
  const [tipos, setTipos]     = useState<TipoCliente[]>([])
  const [rubros, setRubros]   = useState<RubroPrecio[]>([])
  const [open, setOpen]       = useState(false)
  const [ivaOn, setIvaOn]     = useState(true)
  const [cotiz, setCotiz]     = useState<{blue:number;mep:number}|null>(null)
  const supabase = createClient()

  // Form estado
  const [cliQ, setCliQ]       = useState('')
  const [cliSugs, setCliSugs] = useState<ClienteMin[]>([])
  const [cliSel, setCliSel]   = useState<ClienteMin|null>(null)
  const [tipoSel, setTipoSel] = useState<TipoCliente|null>(null)
  const [form, setForm]       = useState({ cli:'', tel:'', veh:'', dias:'7' })

  // Items del presupuesto
  const [items, setItems]     = useState<(VentaItem & { costo?:number; esRubro?:boolean; precioModificado?:boolean })[]>([])
  const [catQ, setCatQ]       = useState('')
  const [catHits, setCatHits] = useState<{id:string;descripcion:string;proveedor:string;costo_neto:number}[]>([])
  const [rubrosEdit, setRubrosEdit] = useState<Record<string,number>>({})
  const [itemManual, setItemManual] = useState({ d:'', c:'1', p:'' })

  useEffect(() => {
    supabase.from('presupuestos').select('*').order('created_at',{ascending:false}).then(({data})=>setPresus(data??[]))
    supabase.from('tipos_cliente').select('*').order('nombre').then(({data})=>setTipos(data??[]))
    supabase.from('rubros_precio').select('*').eq('activo',true).order('orden').then(({data})=>setRubros(data??[]))
    supabase.from('cotizaciones').select('blue,mep').order('fecha',{ascending:false}).limit(1).maybeSingle().then(({data})=>{if(data)setCotiz(data)})
  },[supabase])

  // Búsqueda catálogo
  useEffect(()=>{
    if(catQ.trim().length<3){setCatHits([]);return}
    supabase.from('catalogo').select('id,descripcion,proveedor,costo_neto').ilike('descripcion',`%${catQ}%`).order('costo_neto').limit(12).then(({data})=>setCatHits(data??[]))
  },[catQ,supabase])

  // Búsqueda clientes
  useEffect(()=>{
    if(cliQ.trim().length<2){setCliSugs([]);return}
    supabase.from('clientes').select('id,nombre,telefono,tipo_cliente_id,tipos_cliente(nombre,margen_pct)').ilike('nombre',`%${cliQ}%`).limit(8).then(({data})=>{
      setCliSugs((data??[]).map((c:any)=>({
        id:c.id, nombre:c.nombre, telefono:c.telefono,
        tipo_cliente_id:c.tipo_cliente_id,
        tipo_nombre:c.tipos_cliente?.nombre,
        tipo_margen:c.tipos_cliente?.margen_pct
      })))
    })
  },[cliQ,supabase])

  function selectCliente(c: ClienteMin) {
    setCliSel(c); setForm(p=>({...p,cli:c.nombre,tel:c.telefono??''})); setCliQ(''); setCliSugs([])
    if(c.tipo_cliente_id) {
      const t = tipos.find(t=>t.id===c.tipo_cliente_id)
      if(t) setTipoSel(t)
    }
  }

  function selectConsumidorFinal() {
    const t = tipos.find(t=>t.nombre==='Particular')
    setCliSel(null); setTipoSel(t??null)
    setCliQ(''); setCliSugs([])
  }

  function pickCat(h:{id:string;descripcion:string;proveedor:string;costo_neto:number}) {
    const margen = tipoSel?.margen_pct ?? 0.45
    const precioSug = Math.round(h.costo_neto * (1 + margen))
    setItems(prev=>[...prev,{d:h.descripcion,c:1,p:precioSug,costo:h.costo_neto,esRubro:false}])
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

  const itemsImpresion = items.filter((it:any)=>!it.esRubro || it.visible_impresion!==false)
  const neto  = items.reduce((a,it)=>a+it.c*it.p,0)
  const iva   = ivaOn ? Math.round(neto*IVA_RATE) : 0
  const total = neto+iva

  // Precio sugerido vs precio real
  function alertaMargen(it: any) {
    if(!it.costo||!tipoSel) return null
    const minPrecio = Math.round(it.costo*(1+tipoSel.margen_pct))
    if(it.p < minPrecio) return `⚠ Mínimo ${tipoSel.nombre}: ${moneyARS(minPrecio)}`
    return null
  }

  async function save() {
    if(!items.length) return
    const dias=+form.dias||7
    const venc=new Date(); venc.setDate(venc.getDate()+dias)
    await supabase.from('presupuestos').insert({
      fecha:todayStr(), vencimiento:venc.toISOString().slice(0,10),
      cliente:form.cli||null, telefono:form.tel||null, vehiculo:form.veh||null,
      items:itemsImpresion, neto, iva_pct:IVA_RATE, iva, total,
      dolar_blue:cotiz?.blue??null, dolar_mep:cotiz?.mep??null, user_id:userId,
      tipo_cliente_id:tipoSel?.id??null, tipo_cliente_nombre:tipoSel?.nombre??null,
      margen_aplicado:tipoSel?.margen_pct??null
    })
    setOpen(false); setItems([]); setCliSel(null); setTipoSel(null)
    setForm({cli:'',tel:'',veh:'',dias:'7'})
    const {data}=await supabase.from('presupuestos').select('*').order('created_at',{ascending:false})
    setPresus(data??[])
  }

  // PDF con jsPDF
  async function generarPDF(p: Presupuesto): Promise<Blob> {
    const { jsPDF } = await import('jspdf')
    const doc = new jsPDF({ format:'a4', unit:'mm' })
    const W=210, pad=15
    let y=20

    // Header verde
    doc.setFillColor(0,165,80)
    doc.rect(0,0,W,28,'F')
    doc.setTextColor(255,255,255)
    doc.setFont('helvetica','bold')
    doc.setFontSize(18); doc.text('PARABRISAS EL PIAMONTE',pad,12)
    doc.setFontSize(10); doc.text('Especialistas en cristales automotrices',pad,19)
    doc.setFontSize(11); doc.text(`PRESUPUESTO`,W-pad,12,{align:'right'})
    doc.setFontSize(9); doc.text(p.fecha.split('-').reverse().join('/'),W-pad,19,{align:'right'})
    y=36

    // Datos cliente
    doc.setTextColor(30,30,30)
    doc.setFont('helvetica','bold'); doc.setFontSize(10)
    doc.text(`Cliente: `,pad,y); doc.setFont('helvetica','normal')
    doc.text(p.cliente||'—',pad+20,y)
    if(p.vehiculo){ doc.setFont('helvetica','bold'); doc.text('Vehículo: ',pad+90,y); doc.setFont('helvetica','normal'); doc.text(p.vehiculo,pad+110,y) }
    if((p as any).tipo_cliente_nombre){ y+=6; doc.setFont('helvetica','italic'); doc.setFontSize(9); doc.text(`Tipo de cliente: ${(p as any).tipo_cliente_nombre}`,pad,y) }
    y+=10

    // Tabla
    const cols = [90,20,35,35]
    const headers = ['Detalle','Cant.','Precio unit.','Subtotal']
    doc.setFillColor(0,165,80); doc.rect(pad,y,W-pad*2,7,'F')
    doc.setTextColor(255,255,255); doc.setFont('helvetica','bold'); doc.setFontSize(9)
    let x=pad
    headers.forEach((h,i)=>{ doc.text(h,x+(i>0?cols[i]-2:2),y+5,{align:i>0?'right':'left'}); x+=cols[i] })
    y+=7

    doc.setTextColor(30,30,30); doc.setFont('helvetica','normal'); doc.setFontSize(9)
    p.items.forEach((it:VentaItem,idx:number)=>{
      const bg = idx%2===0
      if(bg){ doc.setFillColor(240,250,245); doc.rect(pad,y,W-pad*2,6.5,'F') }
      let xi=pad
      doc.text(it.d.slice(0,40),xi+2,y+4.5); xi+=cols[0]
      doc.text(String(it.c),xi-2,y+4.5,{align:'right'}); xi+=cols[1]
      doc.text(moneyARS(it.p),xi-2,y+4.5,{align:'right'}); xi+=cols[2]
      doc.text(moneyARS(it.c*it.p),xi-2,y+4.5,{align:'right'})
      y+=6.5
    })
    y+=3

    // Totales
    const totX = W-pad-70
    if(p.iva){ doc.text('Subtotal neto:',totX,y); doc.text(moneyARS(p.neto),W-pad,y,{align:'right'}); y+=6 }
    if(p.iva){ doc.text('IVA 21%:',totX,y); doc.text(moneyARS(p.iva),W-pad,y,{align:'right'}); y+=6 }
    doc.setFont('helvetica','bold'); doc.setFontSize(12)
    doc.text('TOTAL:',totX,y); doc.text(moneyARS(p.total),W-pad,y,{align:'right'})
    if(p.dolar_blue){ y+=5; doc.setFont('helvetica','italic'); doc.setFontSize(9); doc.setTextColor(0,100,60)
      doc.text(`≈ US$${Math.round(p.total/p.dolar_blue).toLocaleString('es-AR')} (blue)`,W-pad,y,{align:'right'}) }
    y+=10

    // Vencimiento
    doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(120,120,120)
    doc.text(`Válido hasta el ${p.vencimiento.split('-').reverse().join('/')}.`,pad,y)
    y+=6

    // Footer
    doc.setFillColor(0,165,80)
    doc.rect(0,285,W,12,'F')
    doc.setTextColor(255,255,255); doc.setFont('helvetica','normal'); doc.setFontSize(9)
    doc.text('📞 2302 595969  ·  WhatsApp',pad,292)
    doc.text('📍 General Pico, La Pampa - Calle 17 N° 1224',W-pad,292,{align:'right'})

    return doc.output('blob')
  }

  async function compartirWA(p: Presupuesto) {
    const blob = await generarPDF(p)
    const file = new File([blob], `Presupuesto-${p.cliente?.replace(/\s/g,'-')??'Piamonte'}.pdf`, {type:'application/pdf'})

    // Mobile: Web Share API
    if(navigator.canShare?.({files:[file]})) {
      await navigator.share({ files:[file], title:'Presupuesto El Piamonte' })
      return
    }
    // Desktop: descargar PDF + abrir WhatsApp Web
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href=url
    a.download=file.name; a.click()
    URL.revokeObjectURL(url)
    const tel = (p.telefono??'').replace(/[^0-9]/g,'')
    const texto = `Hola${p.cliente?' '+p.cliente:''}! Te enviamos el presupuesto de Parabrisas El Piamonte. Total: ${moneyARS(p.total)}. Válido hasta el ${p.vencimiento.split('-').reverse().join('/')}.`
    setTimeout(()=>window.open(`https://web.whatsapp.com/send?phone=${tel}&text=${encodeURIComponent(texto)}`,'_blank'),800)
  }

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
            const usdBlue = p.dolar_blue?`US$${Math.round(p.total/p.dolar_blue).toLocaleString('es-AR')} blue`:''
            return (
              <div key={p.id} className={`bg-white border border-p-line rounded-xl p-4 shadow-sm ${venc?'opacity-60':''}`}>
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-saira font-bold text-p-ink">{p.cliente||'(sin nombre)'}</p>
                      {(p as any).tipo_cliente_nombre && (
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-p-light text-p-dark">{(p as any).tipo_cliente_nombre}</span>
                      )}
                    </div>
                    <p className="text-xs text-p-ink2 mt-0.5">
                      {[p.vehiculo,`${p.items.length} ítem(s)`,p.iva?'c/IVA':'s/IVA',`vence ${p.vencimiento.split('-').reverse().join('/')}${venc?' — VENCIDO':''}`].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-saira font-bold text-xl text-p-ink">{moneyARS(p.total)}</p>
                    {usdBlue&&<p className="font-mono text-xs text-p-dark">{usdBlue}</p>}
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap mt-3 pt-3 border-t border-p-line2">
                  <button onClick={()=>compartirWA(p)} style={btnWa}>📱 WhatsApp PDF</button>
                  <button onClick={()=>descargarPDF(p)} style={btnSm}>⬇ PDF</button>
                  <button onClick={()=>del(p.id)} style={btnRed}>Borrar</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Modal open={open} onClose={()=>setOpen(false)} title="Nuevo presupuesto">
        <div className="flex flex-col gap-3">

          {/* Selección de cliente */}
          <div>
            <label className="block text-[11px] font-semibold text-p-ink2 uppercase tracking-wider mb-1.5">Cliente</label>
            <div className="relative">
              <Input value={cliQ} onChange={e=>{setCliQ(e.target.value);setCliSel(null)}} placeholder="Buscar cliente existente…"/>
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
            <Field label="Nombre (si no está en clientes)"><Input value={form.cli} onChange={e=>setForm(p=>({...p,cli:e.target.value}))} placeholder="Nombre"/></Field>
            <Field label="WhatsApp"><Input value={form.tel} onChange={e=>setForm(p=>({...p,tel:e.target.value}))} placeholder="54 9 …"/></Field>
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
                          <p className="text-[10px] text-p-ink2">{h.proveedor} · costo {moneyARS(h.costo_neto)}</p>
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

          {/* Rubros rápidos */}
          <div>
            <label className="block text-[11px] font-semibold text-p-ink2 uppercase tracking-wider mb-1.5">Rubros rápidos <span className="font-normal normal-case text-p-gray">(no aparecen en el PDF)</span></label>
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

          {/* Lista de ítems */}
          {items.length>0&&(
            <div className="border-t border-p-line2 pt-2">
              {items.map((it,i)=>{
                const alerta = alertaMargen(it)
                const esRubro = (it as any).esRubro
                return(
                  <div key={i} className={`flex items-center justify-between py-1.5 border-b border-p-line2 text-sm ${esRubro?'opacity-75':''}`}>
                    <div className="min-w-0 flex-1">
                      <span className={`text-p-ink ${esRubro?'italic':''}`}>{it.d}{it.c>1?` (×${it.c})`:''}</span>
                      {esRubro&&<span className="ml-1 text-[10px] text-p-gray">(interno)</span>}
                      {alerta&&<p className="text-[10px] text-amber-600 font-semibold">{alerta}</p>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <input type="number" value={it.p} onChange={e=>{const v=+e.target.value;setItems(prev=>prev.map((x,j)=>j===i?{...x,p:v,precioModificado:true}:x))}}
                        className="w-28 border border-p-line rounded px-2 py-0.5 text-xs font-mono text-right focus:outline-none focus:border-p-green"/>
                      <span className="font-mono text-p-ink text-xs w-24 text-right">{moneyARS(it.c*it.p)}</span>
                      <button onClick={()=>setItems(prev=>prev.filter((_,j)=>j!==i))} className="text-red-400 text-xs">✕</button>
                    </div>
                  </div>
                )
              })}
              <label className="flex items-center gap-2 mt-2 text-sm cursor-pointer">
                <input type="checkbox" checked={ivaOn} onChange={e=>setIvaOn(e.target.checked)} className="accent-p-green"/>Sumar IVA 21%
              </label>
              <div className="bg-p-light rounded-lg p-3 mt-2 text-sm">
                <div className="flex justify-between text-p-ink2"><span>Subtotal neto</span><span className="font-mono">{moneyARS(neto)}</span></div>
                {ivaOn&&<div className="flex justify-between text-p-ink2"><span>IVA 21%</span><span className="font-mono">{moneyARS(iva)}</span></div>}
                <div className="flex justify-between font-saira font-bold text-p-ink text-lg border-t border-p-line mt-1 pt-1"><span>TOTAL</span><span>{moneyARS(total)}</span></div>
                {cotiz?.blue&&<p className="font-mono text-xs text-p-dark mt-1 text-right">≈ US${Math.round(total/cotiz.blue).toLocaleString('es-AR')} blue</p>}
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
