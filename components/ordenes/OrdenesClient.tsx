'use client'
import { LOGO_BASE64 } from '@/lib/logo'
import { FIRMA_SAPPA } from '@/lib/firma'
import { useState, useEffect, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { OrdenServicio, VentaItem } from '@/lib/types/database'
import { Modal, Field, Input, Select, Empty } from '@/components/ui'
import { moneyARS, ASEGURADORAS, todayStr } from '@/lib/utils/format'

const IVA_RATE = 0.21
const btn      = { background:'#00A550',color:'#fff',border:'none',borderRadius:10,padding:'10px 20px',fontWeight:700,fontSize:14,cursor:'pointer' } as const
const btnSm    = { ...btn,padding:'6px 14px',fontSize:13 } as const
const btnGray  = { ...btnSm,background:'#6b7280' } as const
const btnRed   = { ...btnSm,background:'#ef4444' } as const
const btnWa    = { ...btnSm,background:'#25d366' } as const
const btnBlue  = { ...btnSm,background:'#1d4ed8' } as const


function tieneADAS(items: VentaItem[]): boolean {
  return items.some(it => it.d.toLowerCase().includes('adas') || it.d.toLowerCase().includes('calibración'))
}

export default function OrdenesClient({ userId }: { userId: string }) {
  const [ordenes, setOrdenes]   = useState<OrdenServicio[]>([])
  const [open, setOpen]         = useState(false)
  const [items, setItems]       = useState<VentaItem[]>([])
  const [ivaOn, setIvaOn]       = useState(true)
  const [loading, setLoading]   = useState(false)
  const supabase = createClient()
  const searchParams = useSearchParams()
  const router = useRouter()

  const [form, setForm] = useState({ aseg:'', sin:'', pol:'', cli:'', tel:'', veh:'', pat:'', obs:'' })
  const [item, setItem] = useState({ d:'', c:'1', p:'' })
  const [filtroAseg, setFiltroAseg] = useState('')
  const [adjModal, setAdjModal]   = useState<any|null>(null)
  const [adjuntos, setAdjuntos]   = useState<any[]>([])
  const [uploading, setUploading] = useState(false)
  const [editId, setEditId]     = useState<string|null>(null)
  const [rubros, setRubros]     = useState<{id:string;nombre:string;precio_base:number}[]>([])
  const [presCli, setPresCli]   = useState<any[]>([])

  // Pre-cargar desde presupuesto
  useEffect(() => {
    const cli = searchParams.get('cli'), tel = searchParams.get('tel'), veh = searchParams.get('veh')
    const itemsStr = searchParams.get('items')
    if (cli || tel || veh) setForm(p => ({ ...p, cli:cli??'', tel:tel??'', veh:veh??'' }))
    if (itemsStr) { try { setItems(JSON.parse(itemsStr)) } catch {} }
    if (cli || tel) setOpen(true)
  }, [searchParams])

  // Presupuestos del cliente al escribir su nombre
  useEffect(() => {
    const nombre = form.cli.trim()
    if(nombre.length < 3){ setPresCli([]); return }
    supabase.from('presupuestos').select('id,fecha,total,items,vehiculo,telefono,tipo_cliente_nombre')
      .ilike('cliente', `%${nombre}%`).eq('convertido_os', false).eq('convertido_comp', false).order('created_at',{ascending:false}).limit(4)
      .then(({data}) => setPresCli(data??[]))
  }, [form.cli, supabase])

  const load = useCallback(() => {
    supabase.from('rubros_precio').select('id,nombre,precio_base').eq('activo',true).order('orden').then(({data})=>setRubros(data??[]))
    supabase.from('ordenes_servicio').select('*').order('created_at',{ascending:false}).then(({data})=>setOrdenes(data??[]))
  }, [supabase])

  useEffect(() => { load() }, [load])

  const neto  = items.reduce((a,it)=>a+it.c*it.p, 0)
  const iva   = ivaOn ? Math.round(neto*IVA_RATE) : 0
  const total = neto + iva

  function addItem() {
    if(!item.d||!item.p) return
    setItems(prev=>[...prev,{d:item.d,c:+item.c||1,p:+item.p.replace(/[^0-9.]/g,'')}])
    setItem({d:'',c:'1',p:''})
  }

  async function abrirAdjuntos(o: any) {
    setAdjModal(o)
    const { data } = await supabase.from('comprobante_adjuntos').select('*').eq('os_id', o.id).order('orden')
    setAdjuntos(data ?? [])
  }

  async function subirArchivoOS(file: File, tipo: string) {
    if (!adjModal) return
    setUploading(true)
    try {
      const ext = file.name.split('.').pop()
      const path = `os/${adjModal.id}/${Date.now()}.${ext}`
      const { error } = await supabase.storage.from('comprobante-adjuntos').upload(path, file)
      if (error) throw error
      const { data: urlData } = supabase.storage.from('comprobante-adjuntos').getPublicUrl(path)
      await supabase.from('comprobante_adjuntos').insert({
        os_id: adjModal.id, comprobante_id: null, tipo, nombre: file.name,
        url: urlData.publicUrl, storage_path: path, orden: adjuntos.length
      })
      const { data } = await supabase.from('comprobante_adjuntos').select('*').eq('os_id', adjModal.id).order('orden')
      setAdjuntos(data ?? [])
    } catch(e) { console.error(e) }
    setUploading(false)
  }

  async function eliminarAdjuntoOS(id: string, path: string) {
    await supabase.storage.from('comprobante-adjuntos').remove([path])
    await supabase.from('comprobante_adjuntos').delete().eq('id', id)
    setAdjuntos(prev=>prev.filter(a=>a.id!==id))
  }

  function openEdit(o: any) {
    setEditId(o.id)
    setForm({
      cli: o.cliente||'', tel: o.telefono||'', veh: o.vehiculo||'',
      pat: o.patente||'', aseg: o.aseguradora||'', sin: o.siniestro||'',
      pol: o.poliza||'', obs: o.obs||''
    })
    setItems(o.items||[])
    setOpen(true)
  }

  async function save() {
    if(!items.length) return
    setLoading(true)
    const conADAS = tieneADAS(items)
    let numero_adas: number|null = null

    if(conADAS) {
      // Obtener próximo número ADAS
      const { count } = await supabase.from('certificados_adas').select('*',{count:'exact',head:true})
      numero_adas = (count??0) + 1
      // Crear también el certificado ADAS
      await supabase.from('certificados_adas').insert({
        numero: numero_adas, fecha: todayStr(),
        cliente: form.cli||null, vehiculo: form.veh||null,
        patente: form.pat||null, user_id: userId
      })
    }

    const { data: nuevas } = await supabase.from('ordenes_servicio').select('numero').order('numero',{ascending:false}).limit(1)
    const nextNum = ((nuevas?.[0] as any)?.numero ?? 0) + 1

    if(editId) {
      await supabase.from('ordenes_servicio').update({
        cliente:form.cli||null, telefono:form.tel||null, vehiculo:form.veh||null,
        patente:form.pat||null, aseguradora:form.aseg||null, siniestro:form.sin||null,
        poliza:form.pol||null, obs:form.obs||null, items, total, iva:ivaOn||null,
      }).eq('id', editId)
      setEditId(null)
    } else {
    await supabase.from('ordenes_servicio').insert({
      numero: nextNum, fecha: todayStr(),
      aseguradora: form.aseg||null, siniestro: form.sin||null, poliza: form.pol||null,
      cliente: form.cli||null, telefono: form.tel||null, vehiculo: form.veh||null,
      patente: form.pat||null, obs: form.obs||null,
      items, neto, iva_pct:IVA_RATE, iva, total,
      tiene_adas: conADAS, numero_adas, user_id: userId
    })
    }

    setOpen(false); setItems([]); setForm({aseg:'',sin:'',pol:'',cli:'',tel:'',veh:'',pat:'',obs:''})
    setLoading(false); load()
  }

  async function del(id:string) {
    if(!confirm('¿Borrar esta orden?')) return
    await supabase.from('ordenes_servicio').delete().eq('id',id); load()
  }

  // ── PDF ──────────────────────────────────────────────────────────────────
  async function generarPDF(o: OrdenServicio): Promise<Blob> {
    const { jsPDF } = await import('jspdf')
    const doc = new jsPDF({format:'a4',unit:'mm'})
    const W=210, pad=15
    let y=20
    const conADAS = (o as any).tiene_adas
    const numADAS = (o as any).numero_adas
    const numOS   = `OS-${String((o as any).numero||0).padStart(4,'0')}`

    // ── Header ──
    doc.setFillColor(0,165,80)
    doc.rect(0,0,W,30,'F')
    try { doc.addImage(LOGO_BASE64,'PNG',pad,2,42,24) } catch(e){}
    doc.setTextColor(255,255,255)
    doc.setFont('helvetica','bold')
    doc.setFontSize(18); doc.text('PARABRISAS EL PIAMONTE', pad, 13)
    doc.setFontSize(9); doc.text('Especialistas en cristales automotrices · General Pico, La Pampa', pad, 20)
    // Tipo de documento y número
    const tipoDoc = conADAS ? 'CERTIFICADO ADAS' : 'ORDEN DE SERVICIO'
    const numDoc  = conADAS ? String(numADAS||0).padStart(7,'0') : numOS
    doc.setFontSize(13); doc.text(tipoDoc, W-pad, 13, {align:'right'})
    doc.setFontSize(10); doc.text(`N° ${numDoc}`, W-pad, 20, {align:'right'})
    doc.setFontSize(8);  doc.text(o.fecha.split('-').reverse().join('/'), W-pad, 26, {align:'right'})
    y = 38

    // ── Datos cliente / vehículo ──
    doc.setTextColor(30,30,30)
    doc.setFillColor(245,250,247)
    doc.rect(pad, y-4, W-pad*2, conADAS ? 24 : (o.aseguradora ? 34 : 22), 'F')

    doc.setFont('helvetica','bold'); doc.setFontSize(9)
    doc.text('Cliente:', pad+2, y); doc.setFont('helvetica','normal')
    doc.text(o.cliente||'—', pad+22, y)
    if(o.telefono){ doc.setFont('helvetica','bold'); doc.text('Tel:', pad+100, y); doc.setFont('helvetica','normal'); doc.text(o.telefono, pad+110, y) }
    y+=6

    doc.setFont('helvetica','bold'); doc.text('Vehículo:', pad+2, y); doc.setFont('helvetica','normal')
    doc.text(o.vehiculo||'—', pad+22, y)
    if((o as any).patente){ doc.setFont('helvetica','bold'); doc.text('Patente:', pad+100, y); doc.setFont('helvetica','normal'); doc.text((o as any).patente, pad+122, y) }
    y+=6

    if(!conADAS && o.aseguradora) {
      doc.setFont('helvetica','bold'); doc.text('Aseguradora:', pad+2, y); doc.setFont('helvetica','normal')
      doc.text(o.aseguradora, pad+30, y); y+=6
      if(o.siniestro||o.poliza){
        if(o.siniestro){ doc.setFont('helvetica','bold'); doc.text('Siniestro:', pad+2, y); doc.setFont('helvetica','normal'); doc.text(o.siniestro, pad+24, y) }
        if(o.poliza)   { doc.setFont('helvetica','bold'); doc.text('Póliza:', pad+100, y); doc.setFont('helvetica','normal'); doc.text(o.poliza, pad+116, y) }
        y+=6
      }
    }
    y+=6

    // ── Tabla de ítems ──
    const cols = [100, 20, 35, 35]
    doc.setFillColor(0,165,80)
    doc.rect(pad, y, W-pad*2, 7, 'F')
    doc.setTextColor(255,255,255); doc.setFont('helvetica','bold'); doc.setFontSize(9)
    let xi = pad
    ;['Detalle','Cant.','Precio unit.','Subtotal'].forEach((h,i)=>{
      doc.text(h, xi+(i>0?cols[i]-2:2), y+5, {align:i>0?'right':'left'}); xi+=cols[i]
    })
    y+=7

    doc.setTextColor(30,30,30); doc.setFont('helvetica','normal'); doc.setFontSize(9)
    ;(o.items as VentaItem[]).forEach((it,idx)=>{
      if(idx%2===0){doc.setFillColor(240,250,245);doc.rect(pad,y,W-pad*2,6.5,'F')}
      let xi=pad
      doc.text(it.d.slice(0,48), xi+2, y+4.5); xi+=cols[0]
      doc.text(String(it.c), xi-2, y+4.5, {align:'right'}); xi+=cols[1]
      doc.text(moneyARS(it.p), xi-2, y+4.5, {align:'right'}); xi+=cols[2]
      doc.text(moneyARS(it.c*it.p), xi-2, y+4.5, {align:'right'})
      y+=6.5
    })
    y+=4

    // ── Totales ──
    const totX = W-pad-70
    if(o.iva){ doc.text('Subtotal neto:', totX, y); doc.text(moneyARS(o.neto), W-pad, y, {align:'right'}); y+=6 }
    if(o.iva){ doc.text('IVA 21%:', totX, y); doc.text(moneyARS(o.iva), W-pad, y, {align:'right'}); y+=6 }
    doc.setFont('helvetica','bold'); doc.setFontSize(12)
    doc.text('TOTAL:', totX, y); doc.text(moneyARS(o.total), W-pad, y, {align:'right'})
    y+=10

    // Observaciones
    if(o.obs){ doc.setFont('helvetica','italic'); doc.setFontSize(8); doc.setTextColor(100,100,100); doc.text(`Obs: ${o.obs}`, pad, y); y+=6 }

    // ── Firma (siempre para OS, especialmente para ADAS) ──
    y = Math.max(y, 220)
    doc.setDrawColor(180,180,180); doc.line(pad, y, pad+70, y)
    doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(80,80,80)
    doc.text('Mario Sappa', pad, y+5)
    doc.text('Técnico Especialista en Cristales Automotrices', pad, y+10)
    if(conADAS){ doc.setFont('helvetica','bold'); doc.text('ADAS Calibration Technician', pad, y+15) }

    // ── Footer ──
    doc.setFillColor(0,165,80); doc.rect(0,285,W,12,'F')
    doc.setTextColor(255,255,255); doc.setFont('helvetica','normal'); doc.setFontSize(8)
    doc.text('📞 2302 595969', pad, 292)
    doc.text('General Pico, La Pampa', W/2, 292, {align:'center'})
    doc.text('Calle 17 N° 1224', W-pad, 292, {align:'right'})

    return doc.output('blob')
  }

  async function compartirWA(o: OrdenServicio) {
    const blob = await generarPDF(o)
    const conADAS = (o as any).tiene_adas
    const numADAS = (o as any).numero_adas
    const numOS   = `OS-${String((o as any).numero||0).padStart(4,'0')}`
    const nombre  = conADAS ? `ADAS-${String(numADAS||0).padStart(7,'0')}` : numOS
    const file = new File([blob], `${nombre}-${o.cliente?.replace(/\s/g,'-')??'Piamonte'}.pdf`, {type:'application/pdf'})
    if(navigator.canShare?.({files:[file]})) { await navigator.share({files:[file],title:`${conADAS?'Certificado ADAS':'Orden de Servicio'} El Piamonte`}); return }
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href=url; a.download=file.name; a.click(); URL.revokeObjectURL(url)
    const tel = (o.telefono??'').replace(/[^0-9]/g,'')
    const texto = `Hola${o.cliente?' '+o.cliente:''}! Te enviamos ${conADAS?'el certificado ADAS':'la orden de servicio'} de Parabrisas El Piamonte. N° ${conADAS?String(numADAS||0).padStart(7,'0'):numOS}.`
    setTimeout(()=>window.open(`https://web.whatsapp.com/send?phone=${tel}&text=${encodeURIComponent(texto)}`,'_blank'),800)
  }

  async function descargarPDF(o: OrdenServicio) {
    const blob = await generarPDF(o)
    const conADAS = (o as any).tiene_adas
    const numADAS = (o as any).numero_adas
    const numOS   = `OS-${String((o as any).numero||0).padStart(4,'0')}`
    const nombre  = conADAS ? `ADAS-${String(numADAS||0).padStart(7,'0')}` : numOS
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href=url; a.download=`${nombre}.pdf`; a.click(); URL.revokeObjectURL(url)
  }

  // Aseguradoras únicas presentes en las órdenes
  const aseguradorasEnUso = Array.from(new Set(ordenes.map(o => o.aseguradora).filter(Boolean))) as string[]

  // Órdenes filtradas
  const ordenesFiltradas = filtroAseg === ''
    ? ordenes
    : filtroAseg === '__sin__'
      ? ordenes.filter(o => !o.aseguradora)
      : ordenes.filter(o => o.aseguradora === filtroAseg)

  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20,gap:12,flexWrap:'wrap'}}>
        {/* Filtro por compañía */}
        <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
          <button
            onClick={()=>setFiltroAseg('')}
            style={{...btnSm, background: filtroAseg==='' ? '#00A550' : '#e5e7eb', color: filtroAseg==='' ? '#fff' : '#374151'}}>
            Todas
          </button>
          {aseguradorasEnUso.map(a=>(
            <button key={a}
              onClick={()=>setFiltroAseg(filtroAseg===a ? '' : a)}
              style={{...btnSm, background: filtroAseg===a ? '#00A550' : '#e5e7eb', color: filtroAseg===a ? '#fff' : '#374151'}}>
              {a}
            </button>
          ))}
          {ordenes.some(o=>!o.aseguradora) && (
            <button
              onClick={()=>setFiltroAseg('__sin__')}
              style={{...btnSm, background: filtroAseg==='__sin__' ? '#6b7280' : '#e5e7eb', color: filtroAseg==='__sin__' ? '#fff' : '#374151'}}>
              Sin seguro
            </button>
          )}
        </div>
        <button onClick={()=>setOpen(true)} style={btn}>+ Nueva orden</button>
      </div>

      {ordenesFiltradas.length===0 ? <Empty msg="Sin órdenes todavía." /> : (
        <div className="flex flex-col gap-4">
          {ordenesFiltradas.map(o => {
            const conADAS = (o as any).tiene_adas
            const numADAS = (o as any).numero_adas
            const numOS   = `OS-${String((o as any).numero||0).padStart(4,'0')}`
            return (
              <div key={o.id} className="bg-white border border-p-line rounded-xl p-4 shadow-sm">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-saira font-bold text-p-ink">{o.cliente||'(sin nombre)'}</p>
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${conADAS?'bg-blue-100 text-blue-700':'bg-p-light text-p-dark'}`}>
                        {conADAS ? `ADAS N° ${String(numADAS||0).padStart(7,'0')}` : numOS}
                      </span>
                    </div>
                    <p className="text-xs text-p-ink2 mt-0.5">
                      {[o.vehiculo,(o as any).patente,o.aseguradora,o.fecha.split('-').reverse().join('/')].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <p className="font-saira font-bold text-xl text-p-ink">{moneyARS(o.total)}</p>
                </div>
                <div className="flex gap-2 flex-wrap mt-3 pt-3 border-t border-p-line2">
                  <button onClick={()=>compartirWA(o)} style={btnWa}>📱 WhatsApp PDF</button>
                  <button onClick={()=>abrirAdjuntos(o)}
                    style={{...btnSm,background:'#7c3aed'}}>
                    📎 {adjModal?.id===o.id?`${adjuntos.length} adj.`:'Fotos'}
                  </button>
                  <button onClick={()=>openEdit(o)} style={{...btnSm,background:'#6b7280'}}>✏ Editar</button>
                  <button onClick={()=>descargarPDF(o)} style={btnSm}>⬇ PDF</button>
                  <button onClick={async()=>{
                    await supabase.from('ordenes_servicio').update({ convertido_comp: true }).eq('id', o.id)
                    const params = new URLSearchParams({
                      cli: o.cliente??'', tel: o.telefono??'', veh: o.vehiculo??'',
                      items: JSON.stringify(o.items), total: String(o.total), iva: String(o.iva??0),
                      oid: o.id,
                    })
                    router.push(`/comprobantes?${params.toString()}`)
                  }} style={{...btnSm,background:'#00A550'}}>✓ Comprobante</button>
                  <button onClick={()=>del(o.id)} style={btnRed}>Borrar</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal fotos OS */}
      {adjModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={e=>{if(e.target===e.currentTarget)setAdjModal(null)}}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="flex items-start justify-between p-5 border-b border-p-line">
              <div>
                <h2 className="font-saira font-bold text-xl text-p-ink">📸 Fotos del trabajo</h2>
                <p className="text-sm text-p-ink2 mt-0.5">
                  OS {adjModal.numero ? `N° OS-${String(adjModal.numero).padStart(4,'0')}` : 'S/N'} · {adjModal.cliente}
                </p>
                <p className="text-[11px] text-p-green font-semibold mt-1">
                  ✓ Las fotos quedan disponibles en el comprobante vinculado
                </p>
              </div>
              <button onClick={()=>setAdjModal(null)} className="text-p-gray hover:text-p-ink text-2xl leading-none">✕</button>
            </div>
            <div className="overflow-y-auto flex-1 p-5 flex flex-col gap-4">
              {/* Upload fotos */}
              <div>
                <p className="text-[11px] font-bold text-p-ink2 uppercase tracking-wider mb-2">
                  Fotos ({adjuntos.filter(a=>a.tipo==='foto').length}/4)
                </p>
                {adjuntos.filter(a=>a.tipo==='foto').length < 4 && (
                  <label className={`flex items-center justify-center gap-2 border-2 border-dashed border-p-line rounded-xl p-4 cursor-pointer hover:border-p-green transition-colors ${uploading?'opacity-50':''}`}>
                    <span className="text-2xl">📷</span>
                    <span className="text-sm text-p-ink2">{uploading?'Subiendo…':'Agregar foto del trabajo'}</span>
                    <input type="file" accept="image/*" className="hidden" disabled={uploading}
                      onChange={e=>{const f=e.target.files?.[0]; if(f)subirArchivoOS(f,'foto'); e.target.value=''}}/>
                  </label>
                )}
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {adjuntos.filter(a=>a.tipo==='foto').map(a=>(
                    <div key={a.id} className="relative rounded-xl overflow-hidden border border-p-line shadow-sm">
                      <img src={a.url} alt={a.nombre} className="w-full h-32 object-cover"/>
                      <button onClick={()=>eliminarAdjuntoOS(a.id,a.storage_path)}
                        className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs shadow">✕</button>
                    </div>
                  ))}
                </div>
              </div>
              {/* OS firmada */}
              <div>
                <p className="text-[11px] font-bold text-p-ink2 uppercase tracking-wider mb-2">
                  OS firmada por el cliente ({adjuntos.filter(a=>a.tipo==='os_firmada').length}/1)
                </p>
                {adjuntos.filter(a=>a.tipo==='os_firmada').length === 0 ? (
                  <label className={`flex items-center justify-center gap-2 border-2 border-dashed border-blue-200 rounded-xl p-4 cursor-pointer hover:border-blue-400 bg-blue-50 ${uploading?'opacity-50':''}`}>
                    <span className="text-2xl">📄</span>
                    <span className="text-sm text-blue-600">{uploading?'Subiendo…':'Subir OS escaneada'}</span>
                    <input type="file" accept="image/*,application/pdf" className="hidden" disabled={uploading}
                      onChange={e=>{const f=e.target.files?.[0]; if(f)subirArchivoOS(f,'os_firmada'); e.target.value=''}}/>
                  </label>
                ) : (
                  <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl p-3">
                    <span className="text-2xl">📄</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-blue-700 truncate">{adjuntos.find(a=>a.tipo==='os_firmada')?.nombre}</p>
                      <a href={adjuntos.find(a=>a.tipo==='os_firmada')?.url} target="_blank" className="text-[11px] text-blue-500 hover:underline">Ver archivo</a>
                    </div>
                    <button onClick={()=>{const a=adjuntos.find(x=>x.tipo==='os_firmada'); if(a)eliminarAdjuntoOS(a.id,a.storage_path)}}
                      className="text-red-400 hover:text-red-600 text-sm">✕</button>
                  </div>
                )}
              </div>
            </div>
            <div className="p-4 border-t border-p-line flex justify-end">
              <button onClick={()=>setAdjModal(null)}
                style={{background:'#6b7280',color:'#fff',border:'none',borderRadius:8,padding:'8px 20px',fontWeight:700,fontSize:13,cursor:'pointer'}}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      <Modal open={open} onClose={()=>setOpen(false)} title={editId ? "Editar orden de servicio" : "Nueva orden de servicio"}>
        <div className="flex flex-col gap-3">
          {/* Cliente */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Cliente"><Input value={form.cli} onChange={e=>setForm(p=>({...p,cli:e.target.value}))} placeholder="Nombre"/></Field>
            <Field label="WhatsApp"><Input value={form.tel} onChange={e=>setForm(p=>({...p,tel:e.target.value}))} placeholder="54 9 …"/></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {/* Presupuestos del cliente */}
          {presCli.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
              <p className="text-[11px] font-bold text-blue-800 uppercase tracking-wider mb-2">📋 Presupuestos de este cliente — click para cargar</p>
              <div className="flex flex-col gap-1.5">
                {presCli.map((p:any) => (
                  <button key={p.id} onClick={()=>{
                    setItems(p.items||[])
                    setForm(prev=>({...prev, tel:p.telefono||prev.tel, veh:p.vehiculo||prev.veh}))
                    setPresCli([])
                  }} className="flex items-center gap-3 bg-white rounded-lg px-3 py-2 text-left hover:bg-blue-50 border border-blue-100 w-full">
                    <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full shrink-0">PRES</span>
                    <span className="text-xs text-p-ink flex-1 truncate">{p.vehiculo||'Sin vehículo'} · {p.items?.length||0} ítem(s)</span>
                    <span className="text-xs font-mono font-bold text-p-dark shrink-0">{('$'+Math.round(p.total||0).toLocaleString('es-AR'))}</span>
                    <span className="text-[10px] text-p-ink2 shrink-0">{p.fecha?.split('-').reverse().join('/')}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <Field label="Vehículo"><Input value={form.veh} onChange={e=>setForm(p=>({...p,veh:e.target.value}))} placeholder="VW Gol 2015"/></Field>
            <Field label="Patente"><Input value={form.pat} onChange={e=>setForm(p=>({...p,pat:e.target.value}))} placeholder="AB 123 CD"/></Field>
          </div>
          {/* Seguro */}
          <div className="grid grid-cols-3 gap-3">
            <Field label="Aseguradora">
              <Select value={form.aseg} onChange={e=>setForm(p=>({...p,aseg:e.target.value}))}>
                <option value="">Sin seguro</option>
                {ASEGURADORAS.map(a=><option key={a} value={a}>{a}</option>)}
              </Select>
            </Field>
            <Field label="N° Siniestro"><Input value={form.sin} onChange={e=>setForm(p=>({...p,sin:e.target.value}))} placeholder="000000"/></Field>
            <Field label="Póliza"><Input value={form.pol} onChange={e=>setForm(p=>({...p,pol:e.target.value}))} placeholder="000000"/></Field>
          </div>
          {/* Ítems */}
          <div className="border-t border-p-line2 pt-3">
            <label className="block text-[11px] font-semibold text-p-ink2 uppercase tracking-wider mb-2">Rubros rápidos</label>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {rubros.map(r=>(
                <button key={r.id} onClick={()=>setItems(prev=>[...prev,{d:r.nombre,c:1,p:r.precio_base}])}
                  className={`text-xs px-2.5 py-1 rounded-full border ${r.nombre.toLowerCase().includes('adas')?'border-blue-300 bg-blue-50 text-blue-700':'border-p-line text-p-ink2 hover:bg-p-light'}`}>
                  + {r.nombre}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-5 gap-2">
              <div className="col-span-2"><Input value={item.d} onChange={e=>setItem(p=>({...p,d:e.target.value}))} placeholder="Concepto"/></div>
              <Input type="number" value={item.c} onChange={e=>setItem(p=>({...p,c:e.target.value}))} min="1"/>
              <div className="col-span-2"><Input value={item.p} onChange={e=>setItem(p=>({...p,p:e.target.value}))} placeholder="$ precio"/></div>
            </div>
            <button onClick={addItem} style={{...btnGray,width:'100%',marginTop:6}}>+ Agregar ítem</button>
          </div>
          {/* Lista ítems */}
          {items.length>0&&(
            <div className="border-t border-p-line2 pt-2">
              {items.map((it,i)=>(
                <div key={i} className={`flex items-center gap-2 py-1.5 border-b border-p-line2 text-sm ${it.d.toLowerCase().includes('adas')?'text-blue-700 font-semibold':''}`}>
                  <span className="flex-1">{it.d}{it.c>1?` ×${it.c}`:''}</span>
                  <input type="number" value={it.p} onChange={e=>{const v=+e.target.value;setItems(prev=>prev.map((x,j)=>j===i?{...x,p:v}:x))}}
                    className="w-28 border border-p-line rounded px-2 py-0.5 text-xs font-mono text-right focus:outline-none focus:border-p-green"/>
                  <span className="font-mono text-xs w-24 text-right">{moneyARS(it.c*it.p)}</span>
                  <button onClick={()=>setItems(prev=>prev.filter((_,j)=>j!==i))} className="text-red-400 text-xs ml-1">✕</button>
                </div>
              ))}
              {tieneADAS(items)&&(
                <div className="mt-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-700 font-semibold">
                  🛡️ Esta OS incluye calibración ADAS — se generará certificado con numeración ADAS automáticamente.
                </div>
              )}
              <label className="flex items-center gap-2 mt-2 text-sm cursor-pointer">
                <input type="checkbox" checked={ivaOn} onChange={e=>setIvaOn(e.target.checked)} className="accent-p-green"/>Sumar IVA 21%
              </label>
              <div className="bg-p-light rounded-lg p-3 mt-2 text-sm">
                {ivaOn&&<div className="flex justify-between text-p-ink2"><span>Subtotal</span><span className="font-mono">{moneyARS(neto)}</span></div>}
                {ivaOn&&<div className="flex justify-between text-p-ink2"><span>IVA 21%</span><span className="font-mono">{moneyARS(iva)}</span></div>}
                <div className="flex justify-between font-saira font-bold text-p-ink text-lg border-t border-p-line mt-1 pt-1"><span>TOTAL</span><span>{moneyARS(total)}</span></div>
              </div>
            </div>
          )}
          <Field label="Observaciones"><Input value={form.obs} onChange={e=>setForm(p=>({...p,obs:e.target.value}))} placeholder="Opcional…"/></Field>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={()=>setOpen(false)} style={btnGray}>Cancelar</button>
            <button onClick={save} disabled={loading} style={{...btn,opacity:loading?.6:1}}>
              {loading?'Guardando…':'Guardar'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
