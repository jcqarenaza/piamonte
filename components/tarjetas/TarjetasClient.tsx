'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Modal, Field, Input, Select, Empty } from '@/components/ui'
import { moneyARS } from '@/lib/utils/format'

const btn     = { background:'#00A550',color:'#fff',border:'none',borderRadius:10,padding:'10px 20px',fontWeight:700,fontSize:14,cursor:'pointer' } as const
const btnSm   = { ...btn, padding:'6px 14px', fontSize:12 } as const
const btnGray = { ...btnSm, background:'#6b7280' } as const
const btnBlue = { ...btnSm, background:'#1d4ed8' } as const

const RED_COLOR: Record<string,string> = {
  visa:'#1A1F71', mastercard:'#EB001B', naranja:'#FF6B35',
  mp:'#009EE3', cabal:'#006B3C', amex:'#006FCF'
}
const RED_LABEL: Record<string,string> = {
  visa:'Visa', mastercard:'Mastercard', naranja:'Naranja X',
  mp:'Mercado Pago', cabal:'Cabal', amex:'Amex'
}

interface Terminal { id:string; nombre:string; banco:string|null; red:string|null; nro_terminal:string|null; descuento_pct:number; dias_acreditacion:number; activo:boolean }
interface Acreditacion {
  id:string; terminal_nombre:string|null; fecha_cobro:string; fecha_acred:string|null
  monto_bruto:number; descuento:number; monto_neto:number; cuotas:number
  lote:string|null; estado:string; notas:string|null; created_at:string
}

export default function TarjetasClient() {
  const [tab, setTab]         = useState<'acreditaciones'|'terminales'>('acreditaciones')
  const [terminales, setTerminales] = useState<Terminal[]>([])
  const [acreds, setAcreds]   = useState<Acreditacion[]>([])
  const [filtroEstado, setFiltroEstado] = useState('')
  const [openAcred, setOpenAcred] = useState(false)
  const [openTerm, setOpenTerm]   = useState(false)
  const [editTerm, setEditTerm]   = useState<Terminal|null>(null)

  const [formAcred, setFormAcred] = useState({
    terminal_id:'', fecha_cobro:'', fecha_acred:'', monto_bruto:'',
    cuotas:'1', lote:'', notas:''
  })
  const [formTerm, setFormTerm] = useState({
    nombre:'', banco:'', red:'visa', nro_terminal:'', descuento_pct:'', dias_acreditacion:'2', notas:''
  })

  const supabase = createClient()

  async function load() {
    const [t, a] = await Promise.all([
      supabase.from('terminales').select('*').eq('activo',true).order('nombre'),
      supabase.from('acreditaciones_tarjeta').select('*').order('fecha_cobro',{ascending:false}).limit(200)
    ])
    setTerminales(t.data??[])
    setAcreds(a.data??[])
  }

  useEffect(()=>{ load() },[supabase])

  async function saveAcred() {
    const term = terminales.find(t=>t.id===formAcred.terminal_id)
    const bruto = +formAcred.monto_bruto||0
    const desc  = term ? Math.round(bruto * (term.descuento_pct/100)) : 0
    await supabase.from('acreditaciones_tarjeta').insert({
      terminal_id: formAcred.terminal_id||null,
      terminal_nombre: term?.nombre||null,
      fecha_cobro: formAcred.fecha_cobro,
      fecha_acred: formAcred.fecha_acred||null,
      monto_bruto: bruto, descuento: desc, monto_neto: bruto-desc,
      cuotas: +formAcred.cuotas||1,
      lote: formAcred.lote||null, notas: formAcred.notas||null,
      estado: 'pendiente'
    })
    setOpenAcred(false)
    setFormAcred({terminal_id:'',fecha_cobro:'',fecha_acred:'',monto_bruto:'',cuotas:'1',lote:'',notas:''})
    load()
  }

  async function saveTerm() {
    const payload = {
      nombre: formTerm.nombre, banco: formTerm.banco||null, red: formTerm.red||null,
      nro_terminal: formTerm.nro_terminal||null,
      descuento_pct: +formTerm.descuento_pct||0,
      dias_acreditacion: +formTerm.dias_acreditacion||2,
      notas: formTerm.notas||null
    }
    if (editTerm) {
      await supabase.from('terminales').update(payload).eq('id',editTerm.id)
    } else {
      await supabase.from('terminales').insert(payload)
    }
    setOpenTerm(false); setEditTerm(null)
    setFormTerm({nombre:'',banco:'',red:'visa',nro_terminal:'',descuento_pct:'',dias_acreditacion:'2',notas:''})
    load()
  }

  async function marcarAcreditado(id:string) {
    await supabase.from('acreditaciones_tarjeta').update({estado:'acreditado',fecha_acred:new Date().toISOString().slice(0,10)}).eq('id',id)
    load()
  }

  // KPIs
  const hoy = new Date()
  const mes = hoy.toISOString().slice(0,7)
  const acredsMes   = acreds.filter(a=>a.fecha_cobro.startsWith(mes))
  const totalBruto  = acredsMes.reduce((s,a)=>s+a.monto_bruto,0)
  const totalDesc   = acredsMes.reduce((s,a)=>s+a.descuento,0)
  const totalNeto   = acredsMes.reduce((s,a)=>s+a.monto_neto,0)
  const pendientes  = acreds.filter(a=>a.estado==='pendiente')
  const totalPend   = pendientes.reduce((s,a)=>s+a.monto_neto,0)

  const filtradas = acreds.filter(a=>!filtroEstado||a.estado===filtroEstado)

  const tabStyle = (t:string) => ({
    padding:'8px 20px', fontWeight:700, fontSize:13, cursor:'pointer', border:'none',
    borderBottom: tab===t?'3px solid #00A550':'3px solid transparent',
    background:'none', color: tab===t?'#00A550':'#6b7280'
  })

  return (
    <div>
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <div className="bg-white border border-p-line rounded-xl p-4 shadow-sm">
          <p className="text-[11px] font-semibold text-p-ink2 uppercase tracking-wider">Cobrado este mes</p>
          <p className="font-saira font-bold text-xl text-p-ink mt-1">{moneyARS(totalBruto)}</p>
        </div>
        <div className="bg-white border border-p-line rounded-xl p-4 shadow-sm">
          <p className="text-[11px] font-semibold text-p-ink2 uppercase tracking-wider">Neto (sin comisiones)</p>
          <p className="font-saira font-bold text-xl text-p-green mt-1">{moneyARS(totalNeto)}</p>
          <p className="text-[10px] text-red-400 font-semibold">-{moneyARS(totalDesc)} comisiones</p>
        </div>
        <div className="bg-white border border-p-line rounded-xl p-4 shadow-sm">
          <p className="text-[11px] font-semibold text-p-ink2 uppercase tracking-wider">Pendiente de acred.</p>
          <p className="font-saira font-bold text-xl text-amber-500 mt-1">{moneyARS(totalPend)}</p>
          <p className="text-[10px] text-p-ink2">{pendientes.length} liquidación(es)</p>
        </div>
        <div className="bg-white border border-p-line rounded-xl p-4 shadow-sm">
          <p className="text-[11px] font-semibold text-p-ink2 uppercase tracking-wider">Terminales activas</p>
          <p className="font-saira font-bold text-xl text-p-ink mt-1">{terminales.length}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-p-line mb-4">
        <button style={tabStyle('acreditaciones')} onClick={()=>setTab('acreditaciones')}>💳 Acreditaciones</button>
        <button style={tabStyle('terminales')} onClick={()=>setTab('terminales')}>⚙ Terminales</button>
      </div>

      {/* Tab Acreditaciones */}
      {tab === 'acreditaciones' && (
        <>
          <div className="flex gap-3 mb-4 flex-wrap items-center">
            <select value={filtroEstado} onChange={e=>setFiltroEstado(e.target.value)}
              className="border border-p-line rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none shadow-sm">
              <option value="">Todos los estados</option>
              <option value="pendiente">Pendiente</option>
              <option value="acreditado">Acreditado</option>
              <option value="rechazado">Rechazado</option>
            </select>
            <div className="ml-auto">
              <button onClick={()=>setOpenAcred(true)} style={btn}>+ Registrar cobro</button>
            </div>
          </div>

          {filtradas.length===0 ? <Empty msg="Sin acreditaciones registradas." /> : (
            <div className="flex flex-col gap-2">
              {filtradas.map(a=>(
                <div key={a.id} className="bg-white border border-p-line rounded-xl p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-3">
                      <div className="font-bold text-sm text-white px-3 py-1 rounded-lg shrink-0"
                        style={{background:RED_COLOR[terminales.find(t=>t.nombre===a.terminal_nombre)?.red||'']||'#6b7280'}}>
                        {a.terminal_nombre||'Sin terminal'}
                      </div>
                      <div>
                        <p className="text-xs text-p-ink2">Cobrado: <strong>{a.fecha_cobro.split('-').reverse().join('/')}</strong>
                          {a.cuotas>1&&<span className="ml-2 text-blue-600 font-bold">{a.cuotas}c</span>}
                        </p>
                        {a.fecha_acred && <p className="text-xs text-p-ink2">Acreditado: <strong>{a.fecha_acred.split('-').reverse().join('/')}</strong></p>}
                        {a.lote && <p className="text-[10px] text-p-ink2 font-mono">Lote: {a.lote}</p>}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-saira font-bold text-lg text-p-ink">{moneyARS(a.monto_neto)}</p>
                      <p className="text-[10px] text-p-ink2">Bruto {moneyARS(a.monto_bruto)} · desc {moneyARS(a.descuento)}</p>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        a.estado==='acreditado'?'bg-green-100 text-green-700':
                        a.estado==='rechazado'?'bg-red-100 text-red-700':'bg-amber-100 text-amber-700'}`}>
                        {a.estado}
                      </span>
                    </div>
                  </div>
                  {a.estado==='pendiente' && (
                    <div className="mt-2 pt-2 border-t border-p-line2 flex gap-2">
                      <button onClick={()=>marcarAcreditado(a.id)} style={{...btnSm,background:'#00A550'}}>✓ Marcar acreditado</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Tab Terminales */}
      {tab === 'terminales' && (
        <>
          <div className="flex justify-end mb-4">
            <button onClick={()=>{setEditTerm(null);setOpenTerm(true)}} style={btn}>+ Nueva terminal</button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {terminales.map(t=>(
              <div key={t.id} className="bg-white border border-p-line rounded-xl p-4 shadow-sm">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-xs font-black shrink-0"
                      style={{background:RED_COLOR[t.red||'']||'#6b7280'}}>
                      {(RED_LABEL[t.red||'']||t.red||'').slice(0,2).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-saira font-bold text-p-ink">{t.nombre}</p>
                      <p className="text-xs text-p-ink2">{t.banco}{t.nro_terminal?` · ${t.nro_terminal}`:''}</p>
                    </div>
                  </div>
                  <button onClick={()=>{
                    setEditTerm(t)
                    setFormTerm({nombre:t.nombre,banco:t.banco||'',red:t.red||'visa',nro_terminal:t.nro_terminal||'',descuento_pct:t.descuento_pct.toString(),dias_acreditacion:t.dias_acreditacion.toString(),notas:''})
                    setOpenTerm(true)
                  }} style={btnGray}>✏</button>
                </div>
                <div className="flex gap-4 mt-3 text-xs">
                  <div><span className="text-p-ink2">Descuento</span><p className="font-bold text-red-500">{t.descuento_pct}%</p></div>
                  <div><span className="text-p-ink2">Acreditación</span><p className="font-bold">{t.dias_acreditacion} días hábiles</p></div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Modal registrar cobro */}
      <Modal open={openAcred} onClose={()=>setOpenAcred(false)} title="Registrar cobro con tarjeta">
        <div className="flex flex-col gap-3">
          <Field label="Terminal *">
            <Select value={formAcred.terminal_id} onChange={e=>setFormAcred(p=>({...p,terminal_id:e.target.value}))}>
              <option value="">Seleccionar terminal…</option>
              {terminales.map(t=><option key={t.id} value={t.id}>{t.nombre} ({t.descuento_pct}%)</option>)}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Fecha cobro *">
              <Input type="date" value={formAcred.fecha_cobro} onChange={e=>setFormAcred(p=>({...p,fecha_cobro:e.target.value}))}/>
            </Field>
            <Field label="Cuotas">
              <Select value={formAcred.cuotas} onChange={e=>setFormAcred(p=>({...p,cuotas:e.target.value}))}>
                {[1,2,3,6,9,12,18,24].map(c=><option key={c} value={c}>{c} cuota{c>1?'s':''}</option>)}
              </Select>
            </Field>
          </div>
          <Field label="Monto bruto *">
            <Input value={formAcred.monto_bruto} onChange={e=>setFormAcred(p=>({...p,monto_bruto:e.target.value}))} placeholder="$0"/>
          </Field>
          {formAcred.terminal_id && formAcred.monto_bruto && (
            <div className="bg-p-light rounded-xl p-3 text-sm flex justify-between">
              <div>
                <p className="text-p-ink2 text-xs">Descuento ({terminales.find(t=>t.id===formAcred.terminal_id)?.descuento_pct}%)</p>
                <p className="font-bold text-red-500">-{moneyARS(Math.round(+formAcred.monto_bruto*(terminales.find(t=>t.id===formAcred.terminal_id)?.descuento_pct||0)/100))}</p>
              </div>
              <div className="text-right">
                <p className="text-p-ink2 text-xs">Neto a recibir</p>
                <p className="font-bold text-p-green text-lg">{moneyARS(Math.round(+formAcred.monto_bruto*(1-(terminales.find(t=>t.id===formAcred.terminal_id)?.descuento_pct||0)/100)))}</p>
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="N° Lote / Cupón">
              <Input value={formAcred.lote} onChange={e=>setFormAcred(p=>({...p,lote:e.target.value}))} placeholder="001234"/>
            </Field>
            <Field label="Fecha acreditación estimada">
              <Input type="date" value={formAcred.fecha_acred} onChange={e=>setFormAcred(p=>({...p,fecha_acred:e.target.value}))}/>
            </Field>
          </div>
          <Field label="Notas">
            <Input value={formAcred.notas} onChange={e=>setFormAcred(p=>({...p,notas:e.target.value}))} placeholder="Observaciones…"/>
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={()=>setOpenAcred(false)} style={btnGray}>Cancelar</button>
            <button onClick={saveAcred} disabled={!formAcred.terminal_id||!formAcred.fecha_cobro||!formAcred.monto_bruto}
              style={{...btn,opacity:(!formAcred.terminal_id||!formAcred.fecha_cobro||!formAcred.monto_bruto)?.5:1}}>
              ✓ Registrar
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal terminal */}
      <Modal open={openTerm} onClose={()=>setOpenTerm(false)} title={editTerm?'Editar terminal':'Nueva terminal'}>
        <div className="flex flex-col gap-3">
          <Field label="Nombre *"><Input value={formTerm.nombre} onChange={e=>setFormTerm(p=>({...p,nombre:e.target.value}))} placeholder="Visa crédito 1 cuota"/></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Banco"><Input value={formTerm.banco} onChange={e=>setFormTerm(p=>({...p,banco:e.target.value}))} placeholder="Galicia"/></Field>
            <Field label="Red">
              <Select value={formTerm.red} onChange={e=>setFormTerm(p=>({...p,red:e.target.value}))}>
                {Object.entries(RED_LABEL).map(([k,v])=><option key={k} value={k}>{v}</option>)}
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="N° Terminal"><Input value={formTerm.nro_terminal} onChange={e=>setFormTerm(p=>({...p,nro_terminal:e.target.value}))} placeholder="12345"/></Field>
            <Field label="Descuento %"><Input value={formTerm.descuento_pct} onChange={e=>setFormTerm(p=>({...p,descuento_pct:e.target.value}))} placeholder="2.35"/></Field>
            <Field label="Días acred."><Input type="number" value={formTerm.dias_acreditacion} onChange={e=>setFormTerm(p=>({...p,dias_acreditacion:e.target.value}))} placeholder="2"/></Field>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={()=>setOpenTerm(false)} style={btnGray}>Cancelar</button>
            <button onClick={saveTerm} disabled={!formTerm.nombre} style={{...btn,opacity:!formTerm.nombre?.5:1}}>Guardar</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
