'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Modal, Field, Input, Select, Empty } from '@/components/ui'
import { moneyARS } from '@/lib/utils/format'

const btn     = { background:'#00A550',color:'#fff',border:'none',borderRadius:10,padding:'10px 20px',fontWeight:700,fontSize:14,cursor:'pointer' } as const
const btnSm   = { ...btn, padding:'6px 14px', fontSize:12 } as const
const btnGray = { ...btnSm, background:'#6b7280' } as const

const RED_COLOR: Record<string,string> = {
  visa:'#1A1F71', mastercard:'#EB001B', naranja:'#FF6B35',
  mp:'#009EE3', cabal:'#006B3C', amex:'#006FCF'
}
const RED_LABEL: Record<string,string> = {
  visa:'Visa', mastercard:'Mastercard', naranja:'Naranja X',
  mp:'Mercado Pago', cabal:'Cabal', amex:'Amex'
}

interface Terminal { id:string; nombre:string; banco:string|null; red:string|null; nro_terminal:string|null; descuento_pct:number; dias_acreditacion:number; activo:boolean; cuenta_id?:string|null }
interface TarjetaConfig { id:string; banco:string; red:string; tipo:string; cuotas:number; recargo_pct:number; retencion_pct:number; dias_acreditacion:number; descripcion:string|null; activo:boolean }
interface Acreditacion {
  id:string; terminal_nombre:string|null; fecha_cobro:string; fecha_acred:string|null
  monto_bruto:number; descuento:number; monto_neto:number; cuotas:number
  lote:string|null; estado:string; notas:string|null; created_at:string
}

export default function TarjetasClient() {
  const [tab, setTab]             = useState<'acreditaciones'|'terminales'|'config'>('acreditaciones')
  const [terminales, setTerminales] = useState<Terminal[]>([])
  const [configs, setConfigs]     = useState<TarjetaConfig[]>([])
  const [filtroConfig, setFiltroConfig] = useState({ banco:'', red:'', tipo:'' })
  const [acreds, setAcreds]       = useState<Acreditacion[]>([])
  const [filtroEstado, setFiltroEstado] = useState('')
  const [openTerm, setOpenTerm]   = useState(false)
  const [editTerm, setEditTerm]   = useState<Terminal|null>(null)
  const CUENTA_PAMPA_CC = 'e7369b4b-4697-44ca-9303-a077a877e643'
  const [formTerm, setFormTerm]   = useState({ nombre:'', banco:'', red:'visa', nro_terminal:'', descuento_pct:'', dias_acreditacion:'2', notas:'', cuenta_id: CUENTA_PAMPA_CC })
  const [cuentasBanco, setCuentasBanco] = useState<any[]>([])

  const supabase = createClient()

  async function load() {
    const [t, a, c, cb] = await Promise.all([
      supabase.from('terminales').select('*').eq('activo',true).order('nombre'),
      supabase.from('acreditaciones_tarjeta').select('*').order('fecha_cobro',{ascending:false}).limit(200),
      supabase.from('tarjetas_config').select('*').eq('activo',true).order('banco').order('red').order('tipo').order('cuotas'),
      supabase.from('cuentas_banco').select('id,banco,tipo').eq('activo',true).order('banco')
    ])
    setTerminales(t.data??[])
    setAcreds(a.data??[])
    setConfigs(c.data??[])
    setCuentasBanco(cb.data??[])
  }

  useEffect(()=>{ load() },[supabase])

  async function saveTerm() {
    const payload = {
      nombre: formTerm.nombre, banco: formTerm.banco||null, red: formTerm.red||null,
      nro_terminal: formTerm.nro_terminal||null,
      descuento_pct: +formTerm.descuento_pct||0,
      dias_acreditacion: +formTerm.dias_acreditacion||2,
      notas: formTerm.notas||null,
      cuenta_id: formTerm.cuenta_id||null
    }
    if (editTerm) await supabase.from('terminales').update(payload).eq('id',editTerm.id)
    else          await supabase.from('terminales').insert(payload)
    setOpenTerm(false); setEditTerm(null)
    setFormTerm({nombre:'',banco:'',red:'visa',nro_terminal:'',descuento_pct:'',dias_acreditacion:'2',notas:'',cuenta_id:CUENTA_PAMPA_CC})
    load()
  }

  // Acreditar = la plata ENTRÓ al banco: además de marcar el estado,
  // se registra el crédito en la cuenta de la terminal → queda listo para
  // conciliar contra el extracto en el módulo Banco.
  async function marcarAcreditado(id:string) {
    const a = acreds.find(x=>x.id===id); if (!a) return
    const term = terminales.find(t=>t.nombre===a.terminal_nombre)
    const cuentaId = (term as any)?.cuenta_id || CUENTA_PAMPA_CC
    const hoy = new Date().toISOString().slice(0,10)
    const { error: errUpd } = await supabase.from('acreditaciones_tarjeta')
      .update({estado:'acreditado',fecha_acred:hoy}).eq('id',id)
    if (errUpd) { alert(`⚠ ${errUpd.message}`); return }
    const { error: errBco } = await supabase.from('movimientos_banco').insert({
      cuenta_id: cuentaId, fecha: hoy, tipo: 'credito',
      concepto: `Acreditación tarjeta ${a.terminal_nombre||''}${a.lote?` · lote ${a.lote}`:''}${a.cuotas>1?` · ${a.cuotas}c`:''}`.trim(),
      monto: a.monto_neto,
      origen_tipo: 'acreditacion_tarjeta',
      notas: `Bruto ${a.monto_bruto} − desc ${a.descuento}`,
    })
    if (errBco) alert(`⚠ Acreditación marcada, pero no se pudo registrar el crédito en Banco: ${errBco.message}\nCargalo a mano en el módulo Banco.`)
    load()
  }

  async function marcarRechazado(id:string) {
    if (!confirm('¿Marcar esta liquidación como RECHAZADA? No genera movimiento en Banco.')) return
    const { error } = await supabase.from('acreditaciones_tarjeta').update({estado:'rechazado'}).eq('id',id)
    if (error) alert(`⚠ ${error.message}`)
    load()
  }

  // KPIs
  const mes = new Date().toISOString().slice(0,7)
  const acredsMes  = acreds.filter(a=>a.fecha_cobro.startsWith(mes))
  const totalBruto = acredsMes.reduce((s,a)=>s+a.monto_bruto,0)
  const totalDesc  = acredsMes.reduce((s,a)=>s+a.descuento,0)
  const totalNeto  = acredsMes.reduce((s,a)=>s+a.monto_neto,0)
  const pendientes = acreds.filter(a=>a.estado==='pendiente')
  const totalPend  = pendientes.reduce((s,a)=>s+a.monto_neto,0)

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
        <button style={tabStyle('acreditaciones')} onClick={()=>setTab('acreditaciones')}>💳 Liquidaciones</button>
        <button style={tabStyle('terminales')} onClick={()=>setTab('terminales')}>⚙ Terminales</button>
        <button style={tabStyle('config')} onClick={()=>setTab('config')}>📋 Config cuotas</button>
      </div>

      {/* Tab Liquidaciones — solo lectura, vienen de Comprobantes */}
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
            <div className="ml-auto text-xs text-p-ink2 bg-p-light px-3 py-2 rounded-xl">
              💡 Las liquidaciones se generan automáticamente al registrar un comprobante con pago en Tarjeta
            </div>
          </div>

          {filtradas.length===0 ? <Empty msg="Sin liquidaciones registradas." /> : (
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
                      <button onClick={()=>marcarAcreditado(a.id)} style={{...btnSm,background:'#00A550'}}>✓ Acreditado (deposita en Banco)</button>
                      <button onClick={()=>marcarRechazado(a.id)} style={{...btnSm,background:'#dc2626'}}>✗ Rechazada</button>
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
                    setFormTerm({nombre:t.nombre,banco:t.banco||'',red:t.red||'visa',nro_terminal:t.nro_terminal||'',descuento_pct:t.descuento_pct.toString(),dias_acreditacion:t.dias_acreditacion.toString(),notas:'',cuenta_id:(t as any).cuenta_id||CUENTA_PAMPA_CC})
                    setOpenTerm(true)
                  }} style={btnGray}>✏</button>
                </div>
                {/* Cuotas de esta terminal */}
                <div className="flex gap-2 mt-3 flex-wrap">
                  {configs.filter(c=>c.banco===t.banco&&c.red===t.red).sort((a,b)=>a.cuotas-b.cuotas).map(c=>(
                    <div key={c.id} className="bg-p-light rounded-lg px-2 py-1 text-center">
                      <p className="font-bold text-p-dark text-xs">{c.cuotas}c</p>
                      {c.recargo_pct>0&&<p className="text-amber-600 font-bold text-[10px]">+{c.recargo_pct}%</p>}
                      <p className="text-red-400 text-[9px]">ret.{c.retencion_pct}%</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Tab Config cuotas */}
      {tab === 'config' && (
        <div>
          <div className="flex gap-3 mb-4 flex-wrap items-center">
            <select value={filtroConfig.banco} onChange={e=>setFiltroConfig(p=>({...p,banco:e.target.value}))}
              className="border border-p-line rounded-xl px-3 py-2 text-sm bg-white focus:outline-none shadow-sm">
              <option value="">Todos los bancos</option>
              {[...new Set(configs.map(c=>c.banco))].map(b=><option key={b} value={b}>{b}</option>)}
            </select>
            <select value={filtroConfig.red} onChange={e=>setFiltroConfig(p=>({...p,red:e.target.value}))}
              className="border border-p-line rounded-xl px-3 py-2 text-sm bg-white focus:outline-none shadow-sm">
              <option value="">Todas las redes</option>
              {Object.entries(RED_LABEL).map(([k,v])=><option key={k} value={k}>{v}</option>)}
            </select>
            <select value={filtroConfig.tipo} onChange={e=>setFiltroConfig(p=>({...p,tipo:e.target.value}))}
              className="border border-p-line rounded-xl px-3 py-2 text-sm bg-white focus:outline-none shadow-sm">
              <option value="">Débito y crédito</option>
              <option value="debito">Solo débito</option>
              <option value="credito">Solo crédito</option>
            </select>
          </div>
          <div className="overflow-x-auto rounded-xl border border-p-line shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-p-dark text-white">
                  <th className="text-left px-4 py-3 text-xs uppercase tracking-wider">Banco</th>
                  <th className="text-left px-3 py-3 text-xs uppercase tracking-wider">Red</th>
                  <th className="text-center px-3 py-3 text-xs uppercase tracking-wider">Tipo</th>
                  <th className="text-center px-3 py-3 text-xs uppercase tracking-wider">Cuotas</th>
                  <th className="text-center px-3 py-3 text-xs uppercase tracking-wider">Recargo %</th>
                  <th className="text-center px-3 py-3 text-xs uppercase tracking-wider">Retención %</th>
                  <th className="text-center px-3 py-3 text-xs uppercase tracking-wider">Acreditación</th>
                </tr>
              </thead>
              <tbody>
                {configs.filter(c=>
                  (!filtroConfig.banco||c.banco===filtroConfig.banco)&&
                  (!filtroConfig.red||c.red===filtroConfig.red)&&
                  (!filtroConfig.tipo||c.tipo===filtroConfig.tipo)
                ).map((c,i)=>(
                  <tr key={c.id} className={`border-t border-p-line2 ${i%2===0?'bg-white':'bg-p-light/40'}`}>
                    <td className="px-4 py-2.5 font-bold text-xs text-p-dark">{c.banco}</td>
                    <td className="px-3 py-2.5">
                      <span className="text-[10px] font-bold text-white px-2 py-0.5 rounded-full"
                        style={{background:RED_COLOR[c.red]||'#6b7280'}}>
                        {RED_LABEL[c.red]||c.red}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${c.tipo==='debito'?'bg-blue-100 text-blue-700':'bg-purple-100 text-purple-700'}`}>
                        {c.tipo}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center font-bold text-p-dark">{c.cuotas}c</td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={`font-bold text-sm ${c.recargo_pct>0?'text-amber-600':'text-p-ink2'}`}>
                        {c.recargo_pct>0?`+${c.recargo_pct}%`:'—'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center font-bold text-sm text-red-500">{c.retencion_pct}%</td>
                    <td className="px-3 py-2.5 text-center text-xs text-p-ink2">{c.dias_acreditacion}d hábiles</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-p-ink2 mt-3 text-center">
            💡 El recargo se incorpora al precio — el cliente nunca lo ve. La retención es lo que descuenta el banco.
          </p>
        </div>
      )}

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
            <Field label="Cuenta donde acredita">
              <select value={formTerm.cuenta_id} onChange={e=>setFormTerm(p=>({...p,cuenta_id:e.target.value}))}
                className="w-full border border-p-line rounded-lg px-2 py-2 text-sm bg-white focus:outline-none focus:border-p-green">
                {cuentasBanco.map(c=><option key={c.id} value={c.id}>{c.banco} {c.tipo}</option>)}
              </select>
            </Field>
          </div>
          {/* Cuotas de esta red */}
          {editTerm && (()=>{
            const cfgs = configs.filter(c=>c.banco===editTerm.banco&&c.red===editTerm.red)
            if(!cfgs.length) return null
            return (
              <div className="border-t border-p-line pt-3">
                <p className="text-[11px] font-bold text-p-ink2 uppercase tracking-wider mb-2">Configuración de cuotas</p>
                <div className="overflow-x-auto rounded-lg border border-p-line">
                  <table className="w-full text-xs">
                    <thead><tr className="bg-p-light">
                      <th className="text-left px-3 py-2 font-bold text-p-ink2">Tipo</th>
                      <th className="text-center px-3 py-2 font-bold text-p-ink2">Cuotas</th>
                      <th className="text-center px-3 py-2 font-bold text-amber-600">Recargo</th>
                      <th className="text-center px-3 py-2 font-bold text-red-500">Retención</th>
                    </tr></thead>
                    <tbody>
                      {cfgs.sort((a,b)=>a.cuotas-b.cuotas).map(c=>(
                        <tr key={c.id} className="border-t border-p-line2">
                          <td className="px-3 py-1.5">{c.tipo}</td>
                          <td className="px-3 py-1.5 text-center font-bold">{c.cuotas}c</td>
                          <td className="px-3 py-1.5 text-center font-bold text-amber-600">{c.recargo_pct>0?`+${c.recargo_pct}%`:'—'}</td>
                          <td className="px-3 py-1.5 text-center font-bold text-red-500">{c.retencion_pct}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })()}
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={()=>setOpenTerm(false)} style={btnGray}>Cancelar</button>
            <button onClick={saveTerm} disabled={!formTerm.nombre} style={{...btn,opacity:!formTerm.nombre?.5:1}}>Guardar</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
