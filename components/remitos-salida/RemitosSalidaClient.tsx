'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { buscarCatalogo } from '@/lib/utils/buscarCatalogo'
import { Modal, Field, Input, Select, Empty } from '@/components/ui'
import { jsPDF } from 'jspdf'

const todayStr = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
const moneyARS = (n:number) => '$'+n.toLocaleString('es-AR',{minimumFractionDigits:0,maximumFractionDigits:0})

const btn     = { background:'#00A550',color:'#fff',border:'none',borderRadius:10,padding:'10px 20px',fontWeight:700,fontSize:14,cursor:'pointer' } as const
const btnSm   = { ...btn, padding:'6px 14px', fontSize:12 } as const
const btnGray = { ...btnSm, background:'#6b7280' } as const
const btnBlue = { ...btnSm, background:'#1d4ed8' } as const

interface RemitoItem { d:string; c:number; codigo:string|null; stock_id?:string; articulo_id?:string|null }
interface Remito {
  id:string; numero:number; fecha:string
  destinatario_nombre:string; destinatario_cuit:string|null; destinatario_direccion:string|null; destinatario_condicion_iva:string|null
  transportista_nombre:string|null; transportista_dni:string|null
  items:RemitoItem[]; notas:string|null; estado:string; created_at:string
}

const COND_IVA = ['Consumidor Final','Responsable Inscripto','Monotributista','Exento']
const FORM_INIT = {
  fecha: todayStr(),
  dest_nombre:'', dest_cuit:'', dest_dir:'', dest_iva:'Consumidor Final',
  trans_nombre:'', trans_dni:'',
  notas:''
}

export default function RemitosSalidaClient({ userId }:{ userId:string }) {
  const [remitos, setRemitos]     = useState<Remito[]>([])
  const [loading, setLoading]     = useState(true)
  const [open, setOpen]           = useState(false)
  const [editRemito, setEditRemito] = useState<Remito|null>(null)
  const [guardando, setGuardando] = useState(false)
  const [expandido, setExpandido] = useState<string|null>(null)
  const [form, setForm] = useState(FORM_INIT)
  const [items, setItems] = useState<RemitoItem[]>([])
  // Buscador catálogo
  const [catQ, setCatQ]     = useState('')
  const [catSugs, setCatSugs] = useState<any[]>([])
  const [catSel, setCatSel]   = useState<any|null>(null)
  const [cantForm, setCantForm] = useState('1')
  const searchRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('remitos_salida').select('*').order('numero',{ascending:false}).limit(100)
    setRemitos((data??[]) as Remito[])
    setLoading(false)
  }

  useEffect(()=>{ load() },[])

  // Búsqueda en catálogo
  useEffect(()=>{
    if(catQ.trim().length < 2){ setCatSugs([]); return }
    buscarCatalogo(supabase, catQ.trim(), { incluirStock:true, limit:8 })
      .then(res=>setCatSugs(res))
  },[catQ])

  function setF(k:string,v:string){ setForm(p=>({...p,[k]:v})) }

  function agregarItem() {
    if(!catSel || !+cantForm) return
    setItems(prev=>[...prev,{
      d: catSel.descripcion || catSel.d || '',
      c: +cantForm,
      codigo: catSel.codigo || catSel.codigoArticulo || null,
      stock_id: catSel.stock_id || undefined,
      articulo_id: catSel.articulo_id || null,
    }])
    setCatSel(null); setCatQ(''); setCantForm('1')
    searchRef.current?.focus()
  }

  function abrirEditar(r: Remito) {
    setEditRemito(r)
    setForm({
      fecha: r.fecha,
      dest_nombre: r.destinatario_nombre, dest_cuit: r.destinatario_cuit||'',
      dest_dir: r.destinatario_direccion||'', dest_iva: r.destinatario_condicion_iva||'Consumidor Final',
      trans_nombre: r.transportista_nombre||'', trans_dni: r.transportista_dni||'',
      notas: r.notas||''
    })
    setItems(r.items || [])
    setOpen(true)
  }

  async function guardar() {
    if(!form.dest_nombre.trim()) { alert('Ingresá el destinatario.'); return }
    if(items.length === 0) { alert('Agregá al menos un artículo.'); return }
    setGuardando(true)

    const payload = {
      fecha: form.fecha,
      destinatario_nombre: form.dest_nombre.trim(),
      destinatario_cuit: form.dest_cuit||null,
      destinatario_direccion: form.dest_dir||null,
      destinatario_condicion_iva: form.dest_iva||null,
      transportista_nombre: form.trans_nombre||null,
      transportista_dni: form.trans_dni||null,
      items, notas: form.notas||null,
      user_id: userId, estado: 'emitido',
    }

    if(editRemito) {
      // Editar — no volver a descontar stock
      await supabase.from('remitos_salida').update(payload).eq('id', editRemito.id)
      setGuardando(false); setOpen(false); setEditRemito(null)
      setForm(FORM_INIT); setItems([])
      await load()
      const updated = { ...editRemito, ...payload }
      generarPDF(updated as any)
    } else {
      // Nuevo — descontar stock
      const { data: remito } = await supabase.from('remitos_salida').insert(payload).select('id,numero').single()
      if(remito) {
        for(const it of items) {
          if(it.stock_id) {
            await supabase.from('stock_movimientos').insert({
              stock_id: it.stock_id, tipo: 'salida', cantidad: it.c,
              fecha: form.fecha,
              descripcion: `Remito R-${String(remito.numero).padStart(4,'0')} · ${form.dest_nombre}`,
            })
            const { data: s } = await supabase.from('stock').select('cantidad').eq('id',it.stock_id).single()
            if(s) await supabase.from('stock').update({ cantidad: Math.max(0,(s as any).cantidad - it.c) }).eq('id',it.stock_id)
          }
        }
        setGuardando(false); setOpen(false)
        setForm(FORM_INIT); setItems([])
        await load()
        generarPDF({ ...payload, id:remito.id, numero:remito.numero, created_at:new Date().toISOString() } as any)
      } else {
        setGuardando(false); alert('Error al guardar.')
      }
    }
  }

  function generarPDF(r: Remito) {
    const doc = new jsPDF({ format:'a4', unit:'mm' })
    const pad = 15, pw = 180

    // Header
    doc.setFillColor(0,165,80)
    doc.rect(pad, 10, pw, 20, 'F')
    doc.setTextColor(255,255,255)
    doc.setFont('helvetica','bold'); doc.setFontSize(16)
    doc.text('REMITO DE SALIDA', pad+5, 22)
    doc.setFontSize(12)
    doc.text(`R-${String(r.numero).padStart(4,'0')}`, pad+pw-5, 22, {align:'right'})
    doc.setFont('helvetica','normal'); doc.setFontSize(8)
    doc.text('Parabrisas El Piamonte · Calle 102 Nro 366 · General Pico, La Pampa · Tel: 2302 595969', pad+5, 28)
    doc.text(`Fecha: ${r.fecha.split('-').reverse().join('/')}`, pad+pw-5, 28, {align:'right'})

    // Destinatario
    let y = 36
    doc.setTextColor(30,30,30)
    doc.setFillColor(245,250,247); doc.rect(pad, y, pw/2-2, 30, 'F')
    doc.setDrawColor(0,165,80); doc.setLineWidth(0.5); doc.rect(pad, y, pw/2-2, 30, 'S')
    doc.setFont('helvetica','bold'); doc.setFontSize(7); doc.setTextColor(0,130,60)
    doc.text('DESTINATARIO', pad+3, y+5)
    doc.setTextColor(20,20,20); doc.setFont('helvetica','bold'); doc.setFontSize(10)
    doc.text(r.destinatario_nombre, pad+3, y+12)
    doc.setFont('helvetica','normal'); doc.setFontSize(8)
    if(r.destinatario_cuit) doc.text(`CUIT/DNI: ${r.destinatario_cuit}`, pad+3, y+18)
    if(r.destinatario_direccion) doc.text(r.destinatario_direccion, pad+3, y+23)
    if(r.destinatario_condicion_iva) doc.text(r.destinatario_condicion_iva, pad+3, y+28)

    // Transportista
    doc.setFillColor(245,250,247); doc.rect(pad+pw/2+2, y, pw/2-2, 30, 'F')
    doc.setDrawColor(0,165,80); doc.rect(pad+pw/2+2, y, pw/2-2, 30, 'S')
    doc.setFont('helvetica','bold'); doc.setFontSize(7); doc.setTextColor(0,130,60)
    doc.text('TRANSPORTISTA', pad+pw/2+5, y+5)
    doc.setTextColor(20,20,20); doc.setFont('helvetica','bold'); doc.setFontSize(10)
    doc.text(r.transportista_nombre||'—', pad+pw/2+5, y+12)
    doc.setFont('helvetica','normal'); doc.setFontSize(8)
    if(r.transportista_dni) doc.text(`DNI: ${r.transportista_dni}`, pad+pw/2+5, y+18)

    // Tabla ítems
    y = 73
    doc.setFillColor(0,165,80); doc.rect(pad, y, pw, 7, 'F')
    doc.setTextColor(255,255,255); doc.setFont('helvetica','bold'); doc.setFontSize(8)
    doc.text('CÓDIGO', pad+3, y+4.5)
    doc.text('DESCRIPCIÓN', pad+38, y+4.5)
    doc.text('CANT.', pad+pw-5, y+4.5, {align:'right'})
    y += 7

    doc.setTextColor(30,30,30); doc.setFont('helvetica','normal'); doc.setFontSize(9)
    let fill = false
    for(const it of r.items) {
      if(fill) { doc.setFillColor(245,250,247); doc.rect(pad, y, pw, 8, 'F') }
      doc.setFont('helvetica','bold'); doc.setFontSize(8)
      doc.text(it.codigo||'—', pad+3, y+5)
      doc.setFont('helvetica','normal'); doc.setFontSize(9)
      doc.text((it.d||'').slice(0,60), pad+38, y+5)
      doc.setFont('helvetica','bold')
      doc.text(String(it.c), pad+pw-5, y+5, {align:'right'})
      doc.setDrawColor(210,230,215); doc.setLineWidth(0.2)
      doc.line(pad, y+8, pad+pw, y+8)
      y += 8; fill = !fill
    }

    // Total
    y += 4
    doc.setDrawColor(0,165,80); doc.setLineWidth(0.5); doc.line(pad, y, pad+pw, y)
    y += 6
    const totalUnidades = r.items.reduce((a,it)=>a+it.c,0)
    doc.setFont('helvetica','bold'); doc.setFontSize(10); doc.setTextColor(0,130,60)
    doc.text(`Total: ${totalUnidades} unidad${totalUnidades!==1?'es':''}`, pad+pw-5, y, {align:'right'})

    if(r.notas) {
      y += 8
      doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(100,100,100)
      doc.text(`Obs: ${r.notas}`, pad+3, y)
    }

    // Firmas
    y = Math.max(y+30, 245)
    doc.setDrawColor(150,150,150); doc.setLineWidth(0.3)
    doc.line(pad+5, y, pad+75, y); doc.line(pad+105, y, pad+pw-5, y)
    doc.setTextColor(100,100,100); doc.setFontSize(8); doc.setFont('helvetica','normal')
    doc.text('Firma y aclaración Remitente', pad+40, y+5, {align:'center'})
    doc.text('Firma y aclaración Receptor', pad+142, y+5, {align:'center'})

    doc.save(`Remito-R${String(r.numero).padStart(4,'0')}-${r.destinatario_nombre.replace(/\s+/g,'-')}.pdf`)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="font-saira font-bold text-2xl text-p-ink mb-0.5">Remitos de salida</h1>
          <p className="text-p-ink2 text-sm">Emití remitos para envíos. Descuenta stock al emitir.</p>
        </div>
        <button onClick={()=>{ setEditRemito(null); setForm(FORM_INIT); setItems([]); setOpen(true) }} style={btn}>+ Nuevo remito</button>
      </div>

      {loading ? <p className="text-sm text-p-ink2 text-center py-10">Cargando…</p> :
       remitos.length === 0 ? <Empty msg="Sin remitos de salida todavía."/> : (
        <div className="flex flex-col gap-2">
          {remitos.map(r=>(
            <div key={r.id} className="bg-white border border-p-line rounded-xl shadow-sm overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3 cursor-pointer" onClick={()=>setExpandido(expandido===r.id?null:r.id)}>
                <span className="font-mono font-bold text-p-green text-sm shrink-0">R-{String(r.numero).padStart(4,'0')}</span>
                <div>
                  <p className="font-saira font-bold text-p-ink text-sm">{r.destinatario_nombre}</p>
                  {r.transportista_nombre && <p className="text-xs text-p-ink2">Transportista: {r.transportista_nombre}</p>}
                </div>
                <span className="text-xs text-p-ink2 ml-auto shrink-0">{r.fecha.split('-').reverse().join('/')}</span>
                <span className="text-xs text-p-ink2 shrink-0">{r.items.reduce((a,it)=>a+it.c,0)} u.</span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${r.estado==='facturado'?'bg-green-100 text-green-700':'bg-blue-100 text-blue-700'}`}>
                  {r.estado==='facturado'?'✓ Facturado':'Emitido'}
                </span>
              </div>
              {expandido===r.id && (
                <div className="border-t border-p-line px-4 py-3">
                  <div className="flex flex-col gap-1 mb-3">
                    {r.items.map((it,i)=>(
                      <div key={i} className="flex items-center gap-2 text-sm">
                        {it.codigo && <span className="font-mono text-[11px] bg-p-light px-1.5 py-0.5 rounded text-p-dark">{it.codigo}</span>}
                        <span className="flex-1 text-p-ink">{it.d}</span>
                        <span className="font-bold text-p-ink shrink-0">×{it.c}</span>
                      </div>
                    ))}
                  </div>
                  {r.notas && <p className="text-xs text-p-ink2 italic mb-3">"{r.notas}"</p>}
                  <div className="flex gap-2">
                    <button onClick={()=>generarPDF(r)} style={btnBlue as any}>📄 Reimprimir</button>
                    <button onClick={()=>abrirEditar(r)} style={btnSm as any}>✏ Editar</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal open={open} onClose={()=>{setOpen(false);setEditRemito(null);setForm(FORM_INIT);setItems([])}}
        title={editRemito ? `Editar R-${String(editRemito.numero).padStart(4,'0')}` : 'Nuevo remito de salida'} size="lg">
        <div className="flex flex-col gap-3 max-h-[80vh] overflow-y-auto pr-1">

          {/* Datos del remito */}
          <Field label="Fecha">
            <Input type="date" value={form.fecha} onChange={e=>setF('fecha',e.target.value)}/>
          </Field>

          {/* Destinatario */}
          <div className="bg-p-light/60 rounded-xl p-3 flex flex-col gap-2">
            <p className="text-[11px] font-bold text-p-ink2 uppercase tracking-wider">Destinatario</p>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Razón social / Nombre *">
                <Input value={form.dest_nombre} onChange={e=>setF('dest_nombre',e.target.value)} placeholder="La Mercantil SA"/>
              </Field>
              <Field label="CUIT / DNI">
                <Input value={form.dest_cuit} onChange={e=>setF('dest_cuit',e.target.value)} placeholder="20-12345678-9"/>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Dirección">
                <Input value={form.dest_dir} onChange={e=>setF('dest_dir',e.target.value)} placeholder="Calle 123, General Pico"/>
              </Field>
              <Field label="Condición IVA">
                <Select value={form.dest_iva} onChange={e=>setF('dest_iva',e.target.value)}>
                  {COND_IVA.map(c=><option key={c} value={c}>{c}</option>)}
                </Select>
              </Field>
            </div>
          </div>

          {/* Transportista */}
          <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 flex flex-col gap-2">
            <p className="text-[11px] font-bold text-amber-700 uppercase tracking-wider">Transportista (quien lleva la mercadería)</p>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Nombre completo">
                <Input value={form.trans_nombre} onChange={e=>setF('trans_nombre',e.target.value)} placeholder="Mario Sappa"/>
              </Field>
              <Field label="DNI">
                <Input value={form.trans_dni} onChange={e=>setF('trans_dni',e.target.value)} placeholder="12345678"/>
              </Field>
            </div>
          </div>

          {/* Artículos */}
          <div className="border-t border-p-line pt-3">
            <p className="text-[11px] font-bold text-p-ink2 uppercase tracking-wider mb-2">Artículos</p>
            <div className="flex gap-2 items-center relative">
              <div className="flex-1 relative">
                <input ref={searchRef}
                  value={catSel ? (catSel.descripcion||catSel.d||'') : catQ}
                  onChange={e=>{ if(!catSel) setCatQ(e.target.value) }}
                  readOnly={!!catSel}
                  placeholder="Buscar por código o descripción…"
                  className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none ${catSel?'border-green-300 bg-green-50 text-green-800':'border-p-line focus:border-p-green'}`}/>
                {catSel && (
                  <button onClick={()=>{setCatSel(null);setCatQ('')}} className="absolute right-3 top-2.5 text-green-600 hover:text-red-500 font-bold">✕</button>
                )}
                {catSugs.length > 0 && !catSel && (
                  <div className="absolute z-20 top-full left-0 right-0 bg-white border border-p-line rounded-xl shadow-xl max-h-52 overflow-y-auto mt-1">
                    {catSugs.map((s:any,i:number)=>(
                      <button key={i} type="button" onClick={()=>{setCatSel(s);setCatSugs([])}}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-p-light border-b border-p-line2 last:border-0">
                        <div className="flex items-center gap-2">
                          {(s.codigo||s.codigoArticulo) && (
                            <span className="font-mono text-[10px] font-bold bg-p-light text-p-dark px-1.5 py-0.5 rounded shrink-0">
                              {s.codigo||s.codigoArticulo}
                            </span>
                          )}
                          <span className="flex-1 truncate">{s.descripcion||s.d}</span>
                          {s.stock_cantidad !== undefined && (
                            <span className={`text-[10px] font-bold shrink-0 ${s.stock_cantidad>0?'text-green-600':'text-red-500'}`}>
                              {s.stock_cantidad} u.
                            </span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <input type="number" min="1" value={cantForm} onChange={e=>setCantForm(e.target.value)}
                className="w-20 border border-p-line rounded-xl px-3 py-2.5 text-sm text-center focus:outline-none focus:border-p-green"/>
              <button onClick={agregarItem} disabled={!catSel} style={{...btnSm,opacity:catSel?1:0.4}}>+ Agregar</button>
            </div>
          </div>

          {items.length > 0 && (
            <div className="flex flex-col gap-1.5 bg-p-light/50 rounded-xl p-3">
              {items.map((it,i)=>(
                <div key={i} className="flex items-center gap-2 text-sm">
                  {it.codigo && <span className="font-mono text-[10px] bg-white border border-p-line px-1.5 py-0.5 rounded">{it.codigo}</span>}
                  <span className="flex-1 truncate">{it.d}</span>
                  <span className="font-bold">×{it.c}</span>
                  <button onClick={()=>setItems(prev=>prev.filter((_,j)=>j!==i))} className="text-red-400 hover:text-red-600 ml-1">✕</button>
                </div>
              ))}
              <div className="text-right text-xs font-bold text-p-ink2 pt-1 border-t border-p-line2 mt-1">
                Total: {items.reduce((a,it)=>a+it.c,0)} unidades
              </div>
            </div>
          )}

          <Field label="Observaciones">
            <Input value={form.notas} onChange={e=>setF('notas',e.target.value)} placeholder="Opcional"/>
          </Field>

          <div className="flex justify-end gap-2 pt-2">
            <button onClick={()=>{setOpen(false);setEditRemito(null);setForm(FORM_INIT);setItems([])}} style={btnGray}>Cancelar</button>
            <button onClick={guardar} disabled={guardando} style={{...btn,opacity:guardando?0.7:1}}>
              {guardando ? 'Guardando…' : editRemito ? '✓ Guardar cambios' : '✓ Emitir remito'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
