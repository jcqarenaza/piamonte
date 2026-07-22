'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Modal, Field, Input, Empty } from '@/components/ui'
import { jsPDF } from 'jspdf'

const todayStr = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })

const btn     = { background:'#00A550',color:'#fff',border:'none',borderRadius:10,padding:'10px 20px',fontWeight:700,fontSize:14,cursor:'pointer' } as const
const btnSm   = { ...btn, padding:'6px 14px', fontSize:12 } as const
const btnGray = { ...btnSm, background:'#6b7280' } as const
const btnBlue = { ...btnSm, background:'#1d4ed8' } as const

interface StockItem { id:string; descripcion:string; codigo:string|null; cantidad:number }
interface RemitoItem { stock_id:string; descripcion:string; codigo:string|null; cantidad:number }
interface Remito { id:string; numero:number; fecha:string; destinatario:string; destinatario_direccion:string|null; transportista:string|null; items:RemitoItem[]; notas:string|null; estado:string; created_at:string }

export default function RemitosSalidaClient({ userId }:{ userId:string }) {
  const [remitos, setRemitos]     = useState<Remito[]>([])
  const [loading, setLoading]     = useState(true)
  const [open, setOpen]           = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [expandido, setExpandido] = useState<string|null>(null)
  const [form, setForm] = useState({ destinatario:'', direccion:'', transportista:'', fecha: todayStr(), notas:'' })
  const [items, setItems] = useState<RemitoItem[]>([])
  const [stockQ, setStockQ] = useState('')
  const [stockSugs, setStockSugs] = useState<StockItem[]>([])
  const [cantForm, setCantForm] = useState('1')
  const [stockSel, setStockSel] = useState<StockItem|null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('remitos_salida').select('*').order('numero',{ascending:false}).limit(100)
    setRemitos(data ?? [])
    setLoading(false)
  }

  useEffect(()=>{ load() },[])

  useEffect(()=>{
    if(stockQ.trim().length < 2){ setStockSugs([]); return }
    Promise.all([
      supabase.from('stock').select('id,descripcion,codigo,cantidad').eq('activo',true).ilike('codigo',`%${stockQ.trim()}%`).limit(5),
      supabase.from('stock').select('id,descripcion,codigo,cantidad').eq('activo',true).ilike('descripcion',`%${stockQ.trim()}%`).limit(5),
    ]).then(([{data:c},{data:d}])=>{
      const todos = [...(c??[]),...(d??[])].filter((s,i,a)=>a.findIndex(x=>x.id===s.id)===i)
      setStockSugs(todos.slice(0,8))
    })
  },[stockQ])

  function agregarItem() {
    if(!stockSel || !+cantForm) return
    if(+cantForm > stockSel.cantidad) {
      if(!confirm(`Solo hay ${stockSel.cantidad} en stock. ¿Continuar igual?`)) return
    }
    setItems(prev=>[...prev,{ stock_id:stockSel.id, descripcion:stockSel.descripcion, codigo:stockSel.codigo, cantidad:+cantForm }])
    setStockSel(null); setStockQ(''); setCantForm('1')
    searchRef.current?.focus()
  }

  async function guardar() {
    if(!form.destinatario.trim()) { alert('Ingresá el destinatario.'); return }
    if(items.length === 0) { alert('Agregá al menos un artículo.'); return }
    setGuardando(true)

    const { data: remito } = await supabase.from('remitos_salida').insert({
      fecha: form.fecha, destinatario: form.destinatario.trim(),
      destinatario_direccion: form.direccion||null,
      transportista: form.transportista||null,
      items, notas: form.notas||null,
      user_id: userId, estado: 'emitido',
    }).select('id,numero').single()

    if(remito) {
      // Descontar stock — insertar movimiento PRIMERO, después actualizar cantidad
      for(const it of items) {
        await supabase.from('stock_movimientos').insert({
          stock_id: it.stock_id, tipo: 'salida', cantidad: it.cantidad,
          fecha: form.fecha,
          descripcion: `Remito R-${String(remito.numero).padStart(4,'0')} · ${form.destinatario}`,
        })
        const { data: s } = await supabase.from('stock').select('cantidad').eq('id',it.stock_id).single()
        if(s) await supabase.from('stock').update({ cantidad: Math.max(0,(s as any).cantidad - it.cantidad) }).eq('id',it.stock_id)
      }
      setGuardando(false)
      setOpen(false)
      setForm({ destinatario:'', direccion:'', transportista:'', fecha: todayStr(), notas:'' })
      setItems([])
      await load()
      // Generar PDF automáticamente
      generarPDF({ id:remito.id, numero:remito.numero, fecha:form.fecha, destinatario:form.destinatario, destinatario_direccion:form.direccion||null, transportista:form.transportista||null, items, notas:form.notas||null, estado:'emitido', created_at:new Date().toISOString() })
    } else {
      setGuardando(false)
      alert('Error al guardar el remito.')
    }
  }

  function generarPDF(r: Remito) {
    const doc = new jsPDF({ format:'a4', unit:'mm' })
    const pad = 15, pw = 180

    // Header verde
    doc.setFillColor(0,165,80)
    doc.rect(pad, 10, pw, 18, 'F')
    doc.setTextColor(255,255,255)
    doc.setFont('helvetica','bold'); doc.setFontSize(14)
    doc.text('REMITO DE SALIDA', pad+5, 21)
    doc.setFontSize(11)
    doc.text(`R-${String(r.numero).padStart(4,'0')}`, pad+pw-5, 21, {align:'right'})
    doc.setFont('helvetica','normal'); doc.setFontSize(8)
    doc.text('Parabrisas El Piamonte · Calle 102 Nro 366 · General Pico, La Pampa · Tel: 2302 595969', pad+5, 26)
    doc.text(`Fecha: ${r.fecha.split('-').reverse().join('/')}`, pad+pw-5, 26, {align:'right'})

    // Destinatario
    let y = 35
    doc.setTextColor(30,30,30)
    doc.setFillColor(245,250,247); doc.rect(pad, y, pw, 22, 'F')
    doc.setDrawColor(0,165,80); doc.setLineWidth(0.5)
    doc.rect(pad, y, pw, 22, 'S')
    doc.setFont('helvetica','bold'); doc.setFontSize(7)
    doc.setTextColor(0,130,60); doc.text('DESTINATARIO', pad+4, y+5)
    doc.setTextColor(30,30,30); doc.setFont('helvetica','bold'); doc.setFontSize(12)
    doc.text(r.destinatario, pad+4, y+13)
    if(r.destinatario_direccion) {
      doc.setFont('helvetica','normal'); doc.setFontSize(8)
      doc.text(r.destinatario_direccion, pad+4, y+19)
    }
    if(r.transportista) {
      doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(80,80,80)
      doc.text(`Transportista: ${r.transportista}`, pad+pw-5, y+13, {align:'right'})
    }

    // Tabla ítems
    y = 64
    doc.setFillColor(0,165,80); doc.rect(pad, y, pw, 7, 'F')
    doc.setTextColor(255,255,255); doc.setFont('helvetica','bold'); doc.setFontSize(8)
    doc.text('CÓDIGO', pad+3, y+4.5)
    doc.text('DESCRIPCIÓN', pad+35, y+4.5)
    doc.text('CANTIDAD', pad+pw-5, y+4.5, {align:'right'})
    y += 7

    doc.setTextColor(30,30,30); doc.setFontSize(9)
    let fill = false
    for(const it of r.items) {
      if(fill) { doc.setFillColor(245,250,247); doc.rect(pad, y, pw, 8, 'F') }
      doc.setFont('helvetica','bold'); doc.setFontSize(8)
      doc.text(it.codigo||'-', pad+3, y+5)
      doc.setFont('helvetica','normal'); doc.setFontSize(9)
      doc.text(it.descripcion.slice(0,60), pad+35, y+5)
      doc.setFont('helvetica','bold'); doc.setFontSize(10)
      doc.text(String(it.cantidad), pad+pw-5, y+5, {align:'right'})
      doc.setDrawColor(210,230,215); doc.setLineWidth(0.2)
      doc.line(pad, y+8, pad+pw, y+8)
      y += 8; fill = !fill
    }

    // Total
    y += 4
    doc.setDrawColor(0,165,80); doc.setLineWidth(0.5); doc.line(pad, y, pad+pw, y)
    y += 6
    const totalUnidades = r.items.reduce((a,it)=>a+it.cantidad,0)
    doc.setFont('helvetica','bold'); doc.setFontSize(10); doc.setTextColor(0,130,60)
    doc.text(`Total: ${totalUnidades} unidad${totalUnidades!==1?'es':''}`, pad+pw-5, y, {align:'right'})

    if(r.notas) {
      y += 8
      doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(100,100,100)
      doc.text(`Observaciones: ${r.notas}`, pad+3, y)
    }

    // Firmas
    y = Math.max(y+30, 240)
    doc.setDrawColor(150,150,150); doc.setLineWidth(0.3)
    doc.line(pad+5, y, pad+75, y)
    doc.line(pad+105, y, pad+pw-5, y)
    doc.setTextColor(100,100,100); doc.setFontSize(8); doc.setFont('helvetica','normal')
    doc.text('Firma y aclaración Remitente', pad+40, y+5, {align:'center'})
    doc.text('Firma y aclaración Receptor', pad+142, y+5, {align:'center'})

    doc.save(`Remito-R${String(r.numero).padStart(4,'0')}-${r.destinatario.replace(/\s+/g,'-')}.pdf`)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="font-saira font-bold text-2xl text-p-ink mb-0.5">Remitos de salida</h1>
          <p className="text-p-ink2 text-sm">Emití remitos para envíos. Descuenta stock al emitir.</p>
        </div>
        <button onClick={()=>setOpen(true)} style={btn}>+ Nuevo remito</button>
      </div>

      {loading ? <p className="text-sm text-p-ink2 text-center py-10">Cargando…</p> :
       remitos.length === 0 ? <Empty msg="Sin remitos de salida todavía."/> : (
        <div className="flex flex-col gap-2">
          {remitos.map(r=>(
            <div key={r.id} className="bg-white border border-p-line rounded-xl shadow-sm overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3 cursor-pointer" onClick={()=>setExpandido(expandido===r.id?null:r.id)}>
                <span className="font-mono font-bold text-p-green text-sm shrink-0">R-{String(r.numero).padStart(4,'0')}</span>
                <span className="font-saira font-bold text-p-ink">{r.destinatario}</span>
                {r.transportista && <span className="text-xs text-p-ink2">· {r.transportista}</span>}
                <span className="text-xs text-p-ink2 ml-auto shrink-0">{r.fecha.split('-').reverse().join('/')}</span>
                <span className="text-xs text-p-ink2 shrink-0">{r.items.reduce((a,it)=>a+it.cantidad,0)} u.</span>
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
                        <span className="flex-1 text-p-ink">{it.descripcion}</span>
                        <span className="font-bold text-p-ink shrink-0">×{it.cantidad}</span>
                      </div>
                    ))}
                  </div>
                  {r.notas && <p className="text-xs text-p-ink2 italic mb-3">"{r.notas}"</p>}
                  <button onClick={()=>generarPDF(r)} style={btnBlue as any}>📄 Reimprimir PDF</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal open={open} onClose={()=>setOpen(false)} title="Nuevo remito de salida" size="lg">
        <div className="flex flex-col gap-3 max-h-[80vh] overflow-y-auto pr-1">

          <div className="grid grid-cols-2 gap-3">
            <Field label="Destinatario *">
              <Input value={form.destinatario} onChange={e=>setForm(p=>({...p,destinatario:e.target.value}))} placeholder="La Mercantil, cliente, etc."/>
            </Field>
            <Field label="Fecha">
              <Input type="date" value={form.fecha} onChange={e=>setForm(p=>({...p,fecha:e.target.value}))}/>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Dirección destinatario">
              <Input value={form.direccion} onChange={e=>setForm(p=>({...p,direccion:e.target.value}))} placeholder="Opcional"/>
            </Field>
            <Field label="Transportista">
              <Input value={form.transportista} onChange={e=>setForm(p=>({...p,transportista:e.target.value}))} placeholder="Mario, etc."/>
            </Field>
          </div>

          <div className="border-t border-p-line pt-3">
            <p className="text-[11px] font-bold text-p-ink2 uppercase tracking-wider mb-2">Artículos</p>
            <div className="flex gap-2 items-center relative">
              <div className="flex-1 relative">
                <input ref={searchRef} value={stockSel ? stockSel.descripcion : stockQ}
                  onChange={e=>{ if(!stockSel) setStockQ(e.target.value) }}
                  readOnly={!!stockSel}
                  placeholder="Buscar por código o descripción…"
                  className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none ${stockSel?'border-green-300 bg-green-50 text-green-800':'border-p-line focus:border-p-green'}`}/>
                {stockSel && (
                  <button onClick={()=>{setStockSel(null);setStockQ('')}} className="absolute right-3 top-2.5 text-green-600 hover:text-red-500 font-bold">✕</button>
                )}
                {stockSugs.length > 0 && !stockSel && (
                  <div className="absolute z-20 top-full left-0 right-0 bg-white border border-p-line rounded-xl shadow-xl max-h-48 overflow-y-auto mt-1">
                    {stockSugs.map(s=>(
                      <button key={s.id} type="button" onClick={()=>{setStockSel(s);setStockSugs([])}}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-p-light border-b border-p-line2 last:border-0">
                        <div className="flex items-center gap-2">
                          {s.codigo && <span className="font-mono text-[10px] font-bold bg-p-light text-p-dark px-1.5 py-0.5 rounded shrink-0">{s.codigo}</span>}
                          <span className="flex-1 truncate">{s.descripcion}</span>
                          <span className={`text-[10px] font-bold shrink-0 ${s.cantidad>0?'text-green-600':'text-red-500'}`}>{s.cantidad} u.</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <input type="number" min="1" value={cantForm} onChange={e=>setCantForm(e.target.value)}
                className="w-20 border border-p-line rounded-xl px-3 py-2.5 text-sm text-center focus:outline-none focus:border-p-green"/>
              <button onClick={agregarItem} disabled={!stockSel} style={{...btnSm,opacity:stockSel?1:0.4}}>+ Agregar</button>
            </div>
          </div>

          {items.length > 0 && (
            <div className="flex flex-col gap-1.5 bg-p-light/50 rounded-xl p-3">
              {items.map((it,i)=>(
                <div key={i} className="flex items-center gap-2 text-sm">
                  {it.codigo && <span className="font-mono text-[10px] bg-white border border-p-line px-1.5 py-0.5 rounded">{it.codigo}</span>}
                  <span className="flex-1 truncate">{it.descripcion}</span>
                  <span className="font-bold">×{it.cantidad}</span>
                  <button onClick={()=>setItems(prev=>prev.filter((_,j)=>j!==i))} className="text-red-400 hover:text-red-600 ml-1">✕</button>
                </div>
              ))}
              <div className="text-right text-xs font-bold text-p-ink2 pt-1 border-t border-p-line2 mt-1">
                Total: {items.reduce((a,it)=>a+it.cantidad,0)} unidades
              </div>
            </div>
          )}

          <Field label="Observaciones">
            <Input value={form.notas} onChange={e=>setForm(p=>({...p,notas:e.target.value}))} placeholder="Opcional"/>
          </Field>

          <div className="flex justify-end gap-2 pt-2">
            <button onClick={()=>setOpen(false)} style={btnGray}>Cancelar</button>
            <button onClick={guardar} disabled={guardando} style={{...btn,opacity:guardando?0.7:1}}>
              {guardando?'Guardando…':'✓ Emitir remito'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
