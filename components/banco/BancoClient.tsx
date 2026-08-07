'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Modal, Field, Input, Empty } from '@/components/ui'
import { moneyARS2 as moneyARS, todayStr } from '@/lib/utils/format'

// Parseo robusto de montos: acepta "1234.56", "1234,56" y "1.234,56"
function parseMonto(s: string): number {
  const t = String(s ?? '').trim()
  if (!t) return 0
  if (t.includes(',')) return parseFloat(t.replace(/\./g,'').replace(',','.')) || 0
  return parseFloat(t) || 0
}
import { useDolar } from '@/components/dolar/DolarBar'

const btn     = { background:'#00A550',color:'#fff',border:'none',borderRadius:10,padding:'10px 20px',fontWeight:700,fontSize:14,cursor:'pointer' } as const
const btnSm   = { ...btn, padding:'6px 14px', fontSize:12 } as const
const btnGray = { ...btnSm, background:'#6b7280' } as const
const btnBlue = { ...btnSm, background:'#1d4ed8' } as const

interface Cuenta { id:string; banco:string; tipo:string; nro_cuenta:string|null; alias:string|null; cbu:string|null; saldo_inicial:number; fecha_saldo_inicial:string; activo:boolean }
interface Movimiento { id:string; cuenta_id:string; fecha:string; tipo:'credito'|'debito'; concepto:string; monto:number; origen_tipo:string|null; conciliado:boolean; nro_extracto:string|null; notas:string|null; cheque_id:string|null; saldo?:number }

const TIPOS_CUENTA = ['Cuenta Corriente','Caja de Ahorro','Cuenta Inversión','Billetera Virtual','Mercado Pago']
const BANCOS_ARG = ['Banco de La Pampa','Banco Nación','Banco Provincia','Banco Galicia','Banco Santander','Banco BBVA','Banco Macro','Banco Credicoop','Banco Patagonia','Banco del Sol','ICBC','Brubank','Naranja X','Mercado Pago','Otro']
const ORIG_LABEL: Record<string,string> = {
  cheque_tercero:'Cheque tercero', cheque_propio:'Cheque propio',
  tarjeta:'Liquidación tarjeta', transferencia_venta:'Transferencia (venta)',
  transferencia_pago:'Transferencia (pago)', transferencia_entre_cuentas:'Transferencia entre cuentas',
  deposito_manual:'Depósito manual', debito_bancario:'Débito bancario', cheque_emitido:'Cheque emitido', otro:'Otro'
}

const emptyMov = { tipo:'credito' as 'credito'|'debito', concepto:'', monto:'', origen_tipo:'deposito_manual', fecha:todayStr(), notas:'', nro_extracto:'' }
const emptyCuenta = { banco:'Banco de La Pampa', tipo:'Cuenta Corriente', nro_cuenta:'', alias:'', cbu:'', saldo_inicial:'0', fecha_saldo_inicial:todayStr() }
const emptyTransf = { fecha:todayStr(), monto:'', concepto:'', destino_tipo:'tercero' as 'tercero'|'cuenta_propia', cuenta_destino_id:'', notas:'' }

export default function BancoClient() {
  const [cuentas, setCuentas]   = useState<Cuenta[]>([])
  const [selCuenta, setSelCuenta] = useState<Cuenta|null>(null)
  const [movs, setMovs]         = useState<Movimiento[]>([])
  const [loading, setLoading]   = useState(true)
  const [tab, setTab]           = useState<'libro'|'conciliacion'>('libro')
  const [cuentaModal, setCuentaModal] = useState(false)
  const [editCuentaId, setEditCuentaId] = useState<string|null>(null)
  const [formCuenta, setFormCuenta] = useState(emptyCuenta)
  const [movModal, setMovModal] = useState(false)
  const [editMovId, setEditMovId] = useState<string|null>(null)
  const [formMov, setFormMov]   = useState(emptyMov)
  const [pendConcil, setPendConcil] = useState<Movimiento[]>([])
  const [selConcil, setSelConcil]   = useState<Record<string,boolean>>({})
  const [nroExtracto, setNroExtracto] = useState('')
  // Transferencia
  const [transfModal, setTransfModal] = useState(false)
  const [formTransf, setFormTransf] = useState(emptyTransf)
  const [savingTransf, setSavingTransf] = useState(false)

  const supabase = createClient()
  const { usdStr } = useDolar()

  const loadCuentas = useCallback(async () => {
    const { data } = await supabase.from('cuentas_banco').select('*').eq('activo',true).order('banco')
    setCuentas(data??[])
    if (data?.length) setSelCuenta(prev => prev ?? data[0])
  },[supabase])

  const loadMovs = useCallback(async (cuenta: Cuenta) => {
    setLoading(true)
    const { data } = await supabase.from('movimientos_banco').select('*')
      .eq('cuenta_id', cuenta.id).order('fecha',{ascending:true}).order('created_at',{ascending:true}).limit(500)
    let saldo = cuenta.saldo_inicial ?? 0
    const conSaldo = (data??[]).map(m=>{ saldo += m.tipo==='credito' ? m.monto : -m.monto; return { ...m, saldo } }).reverse()
    setMovs(conSaldo)
    setPendConcil((data??[]).filter(m=>!m.conciliado))
    setLoading(false)
  },[supabase])

  useEffect(()=>{ loadCuentas() },[loadCuentas])
  useEffect(()=>{ if(selCuenta) loadMovs(selCuenta) },[selCuenta, loadMovs])

  const saldoActual  = movs.length > 0 ? (movs[0].saldo ?? 0) : (selCuenta?.saldo_inicial ?? 0)
  const mes          = todayStr().slice(0,7)
  const credMes      = movs.filter(m=>m.fecha.startsWith(mes)&&m.tipo==='credito').reduce((a,m)=>a+m.monto,0)
  const debMes       = movs.filter(m=>m.fecha.startsWith(mes)&&m.tipo==='debito').reduce((a,m)=>a+m.monto,0)
  const sinConciliar = pendConcil.length

  async function guardarCuenta() {
    const payload = { banco:formCuenta.banco, tipo:formCuenta.tipo, nro_cuenta:formCuenta.nro_cuenta||null, alias:formCuenta.alias||null, cbu:formCuenta.cbu||null, saldo_inicial:+formCuenta.saldo_inicial||0, fecha_saldo_inicial:formCuenta.fecha_saldo_inicial, moneda:'ARS', activo:true, updated_at:new Date().toISOString() }
    if (editCuentaId) await supabase.from('cuentas_banco').update(payload).eq('id',editCuentaId)
    else await supabase.from('cuentas_banco').insert(payload)
    setCuentaModal(false); loadCuentas()
  }

  async function guardarMov() {
    if (!selCuenta||!formMov.monto||!formMov.concepto) return
    const payload = { cuenta_id:selCuenta.id, fecha:formMov.fecha, tipo:formMov.tipo, concepto:formMov.concepto, monto:parseMonto(formMov.monto), origen_tipo:formMov.origen_tipo||null, notas:formMov.notas||null, nro_extracto:formMov.nro_extracto||null }
    if (editMovId) await supabase.from('movimientos_banco').update(payload).eq('id',editMovId)
    else await supabase.from('movimientos_banco').insert(payload)
    setMovModal(false); if(selCuenta) loadMovs(selCuenta)
  }

  async function guardarTransferencia() {
    if (!selCuenta||!formTransf.monto||!formTransf.concepto) return
    setSavingTransf(true)
    try {
      const monto = parseMonto(formTransf.monto)
      // Débito en cuenta origen
      await supabase.from('movimientos_banco').insert({
        cuenta_id: selCuenta.id,
        fecha: formTransf.fecha,
        tipo: 'debito',
        concepto: formTransf.concepto,
        monto,
        origen_tipo: 'transferencia_pago',
        notas: formTransf.notas||null,
      })
      // Si es entre cuentas propias → crédito en destino
      if (formTransf.destino_tipo === 'cuenta_propia' && formTransf.cuenta_destino_id) {
        const cuentaDest = cuentas.find(c=>c.id===formTransf.cuenta_destino_id)
        await supabase.from('movimientos_banco').insert({
          cuenta_id: formTransf.cuenta_destino_id,
          fecha: formTransf.fecha,
          tipo: 'credito',
          concepto: `Transferencia desde ${selCuenta.banco} (${selCuenta.tipo==='Cuenta Corriente'?'CC':'CA'})${formTransf.concepto ? ` — ${formTransf.concepto}` : ''}`,
          monto,
          origen_tipo: 'transferencia_entre_cuentas',
          notas: formTransf.notas||null,
        })
      }
      setTransfModal(false)
      setFormTransf(emptyTransf)
      if(selCuenta) loadMovs(selCuenta)
    } catch(e) { console.error(e); alert('Error al guardar transferencia') }
    finally { setSavingTransf(false) }
  }

  async function conciliar() {
    const ids = Object.entries(selConcil).filter(([,v])=>v).map(([k])=>k)
    if (!ids.length) return
    await supabase.from('movimientos_banco').update({ conciliado:true, nro_extracto:nroExtracto||null, fecha_conciliacion:todayStr() }).in('id',ids)
    setSelConcil({}); setNroExtracto(''); if(selCuenta) loadMovs(selCuenta)
  }

  const selConcilArr     = pendConcil.filter(m=>selConcil[m.id])
  const totalSelConcil   = selConcilArr.reduce((a,m)=>a+(m.tipo==='credito'?m.monto:-m.monto),0)
  const totalPendConcil  = pendConcil.reduce((a,m)=>a+(m.tipo==='credito'?m.monto:-m.monto),0)

  return (
    <div>
      {/* Selector de cuentas */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div className="flex gap-2 flex-wrap">
          {cuentas.map(c=>(
            <button key={c.id} onClick={()=>setSelCuenta(c)}
              style={{background:selCuenta?.id===c.id?'#00A550':'#fff',color:selCuenta?.id===c.id?'#fff':'#374151',border:`1.5px solid ${selCuenta?.id===c.id?'#00A550':'#e5e7eb'}`,borderRadius:10,padding:'8px 16px',fontWeight:700,fontSize:13,cursor:'pointer'}}>
              🏦 {c.banco} {c.tipo==='Cuenta Corriente'?'(CC)':c.tipo==='Caja de Ahorro'?'(CA)':c.tipo==='Mercado Pago'?'(MP)':''}
              {(c.cbu||c.nro_cuenta) && <span className="text-[10px] font-mono text-p-ink2 ml-1">···{(c.cbu||c.nro_cuenta||'').slice(-5)}</span>}
            </button>
          ))}
          <button onClick={()=>{ setEditCuentaId(null); setFormCuenta(emptyCuenta); setCuentaModal(true) }} style={btnGray}>+ Cuenta</button>
          {selCuenta&&<button onClick={()=>{ setEditCuentaId(selCuenta.id); setFormCuenta({banco:selCuenta.banco,tipo:selCuenta.tipo,nro_cuenta:selCuenta.nro_cuenta||'',alias:selCuenta.alias||'',cbu:selCuenta.cbu||'',saldo_inicial:String(selCuenta.saldo_inicial),fecha_saldo_inicial:selCuenta.fecha_saldo_inicial}); setCuentaModal(true) }} style={btnGray}>✏ Editar</button>}
        </div>
      </div>

      {!selCuenta ? <Empty msg="Agregá una cuenta bancaria para empezar."/> : (<>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <div className={`border rounded-2xl p-4 shadow-sm col-span-2 md:col-span-1 ${saldoActual>=0?'bg-white border-p-line':'bg-red-50 border-red-300'}`}>
          <p className="text-[11px] font-bold text-p-ink2 uppercase tracking-wider mb-1">Saldo actual</p>
          <p className={`font-saira font-bold text-2xl ${saldoActual>=0?'text-p-dark':'text-red-600'}`}>{moneyARS(saldoActual)}</p>
          <p className="text-[10px] text-p-ink2">{usdStr(Math.abs(saldoActual),'oficial')} BNA</p>
        </div>
        <div className="bg-white border border-p-line rounded-2xl p-4 shadow-sm">
          <p className="text-[11px] font-bold text-p-ink2 uppercase tracking-wider mb-1">Créditos del mes</p>
          <p className="font-saira font-bold text-base text-green-600">+ {moneyARS(credMes)}</p>
        </div>
        <div className="bg-white border border-p-line rounded-2xl p-4 shadow-sm">
          <p className="text-[11px] font-bold text-p-ink2 uppercase tracking-wider mb-1">Débitos del mes</p>
          <p className="font-saira font-bold text-base text-red-500">− {moneyARS(debMes)}</p>
        </div>
        <div className="bg-white border border-p-line rounded-2xl p-4 shadow-sm">
          <p className="text-[11px] font-bold text-p-ink2 uppercase tracking-wider mb-1">Sin conciliar</p>
          <p className="font-saira font-bold text-base text-p-dark">{sinConciliar}</p>
          <p className="text-[10px] text-p-ink2">movimiento(s)</p>
        </div>
      </div>

      {/* Tabs + acciones */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex gap-1">
          {([['libro','📒 Libro de banco'],['conciliacion','🔍 Conciliación']] as const).map(([v,l])=>(
            <button key={v} onClick={()=>setTab(v)}
              style={{padding:'7px 16px',borderRadius:8,fontWeight:700,fontSize:13,cursor:'pointer',
                background:tab===v?'#00A550':'transparent',color:tab===v?'#fff':'#6b7280',
                borderBottom:tab===v?'2px solid #00A550':'2px solid transparent',border:'none'}}>
              {l}
            </button>
          ))}
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={()=>{ setFormTransf(emptyTransf); setTransfModal(true) }} style={btnBlue}>↗ + Transferencia</button>
          <button onClick={()=>{ setEditMovId(null); setFormMov(emptyMov); setMovModal(true) }} style={btn}>+ Movimiento manual</button>
        </div>
      </div>

      {/* LIBRO */}
      {tab==='libro'&&(
        loading ? <p className="text-center text-p-ink2 py-8">Cargando…</p> :
        movs.length===0 ? <Empty msg="Sin movimientos todavía. Agregá uno manualmente o depositá un cheque."/> : (
          <div className="overflow-x-auto rounded-2xl border border-p-line shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-p-light text-p-ink2 text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3 text-left">Fecha</th>
                  <th className="px-4 py-3 text-left">Concepto</th>
                  <th className="px-4 py-3 text-left hidden md:table-cell">Origen</th>
                  <th className="px-4 py-3 text-right text-green-600">Crédito</th>
                  <th className="px-4 py-3 text-right text-red-500">Débito</th>
                  <th className="px-4 py-3 text-right">Saldo</th>
                  <th className="px-4 py-3"/>
                </tr>
              </thead>
              <tbody className="divide-y divide-p-line">
                {movs.map(m=>(
                  <tr key={m.id} className={`hover:bg-p-light/50 transition-colors ${!m.conciliado?'bg-amber-50/40':''}`}>
                    <td className="px-4 py-2.5 font-mono text-xs text-p-ink2 whitespace-nowrap">{m.fecha.split('-').reverse().join('/')}</td>
                    <td className="px-4 py-2.5 text-p-ink">
                      {m.concepto}
                      {!m.conciliado && <span className="ml-1.5 text-[9px] bg-amber-100 text-amber-700 rounded px-1 py-0.5 font-bold">PEND</span>}
                    </td>
                    <td className="px-4 py-2.5 text-p-ink2 hidden md:table-cell">{m.origen_tipo?ORIG_LABEL[m.origen_tipo]||m.origen_tipo:'—'}</td>
                    <td className="px-4 py-2.5 text-right font-mono font-bold text-green-600">{m.tipo==='credito'?moneyARS(m.monto):'—'}</td>
                    <td className="px-4 py-2.5 text-right font-mono font-bold text-red-500">{m.tipo==='debito'?moneyARS(m.monto):'—'}</td>
                    <td className={`px-4 py-2.5 text-right font-mono font-bold ${(m.saldo??0)>=0?'text-p-dark':'text-red-600'}`}>{moneyARS(m.saldo??0)}</td>
                    <td className="px-4 py-2.5 text-right">
                      {!m.conciliado&&<button onClick={()=>{ setEditMovId(m.id); setFormMov({tipo:m.tipo,concepto:m.concepto,monto:String(m.monto),origen_tipo:m.origen_tipo||'otro',fecha:m.fecha,notas:m.notas||'',nro_extracto:m.nro_extracto||''}); setMovModal(true) }} className="text-p-ink2 hover:text-p-ink text-[10px]">✏</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-p-light font-bold border-t-2 border-p-line">
                <tr>
                  <td colSpan={3} className="px-4 py-3 text-sm font-bold text-p-ink">Saldo actual</td>
                  <td className="px-4 py-3 text-right text-sm font-mono text-green-600">{moneyARS(movs.filter(m=>m.tipo==='credito').reduce((a,m)=>a+m.monto,0))}</td>
                  <td className="px-4 py-3 text-right text-sm font-mono text-red-500">{moneyARS(movs.filter(m=>m.tipo==='debito').reduce((a,m)=>a+m.monto,0))}</td>
                  <td className={`px-4 py-3 text-right text-lg font-saira font-bold ${saldoActual>=0?'text-p-dark':'text-red-600'}`}>{moneyARS(saldoActual)}</td>
                  <td/>
                </tr>
              </tfoot>
            </table>
          </div>
        )
      )}

      {/* CONCILIACIÓN */}
      {tab==='conciliacion'&&(
        pendConcil.length===0 ? <Empty msg="¡Todo conciliado! No hay movimientos pendientes."/> : (
          <div>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 flex items-center justify-between flex-wrap gap-3">
              <div>
                <p className="text-sm font-bold text-amber-800">{sinConciliar} movimiento(s) pendientes — diferencia neta: <span className="font-mono">{moneyARS(totalPendConcil)}</span></p>
                <p className="text-xs text-amber-700 mt-0.5">Tildá los que aparecen en el extracto del banco y confirmá.</p>
              </div>
              {selConcilArr.length>0&&(
                <div className="flex items-center gap-2 flex-wrap">
                  <Input value={nroExtracto} onChange={e=>setNroExtracto(e.target.value)} placeholder="N° extracto (opcional)"/>
                  <button onClick={conciliar} style={btnBlue}>✓ Conciliar {selConcilArr.length} ({moneyARS(Math.abs(totalSelConcil))})</button>
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2">
              {pendConcil.map(m=>(
                <label key={m.id} className={`flex items-center gap-3 border rounded-xl px-3.5 py-2.5 cursor-pointer ${selConcil[m.id]?'border-p-green bg-green-50':'border-p-line bg-white'}`}>
                  <input type="checkbox" checked={!!selConcil[m.id]} onChange={()=>setSelConcil(p=>({...p,[m.id]:!p[m.id]}))} className="accent-p-green w-4 h-4 shrink-0"/>
                  <span className="font-mono text-xs text-p-ink2 shrink-0">{m.fecha.split('-').reverse().join('/')}</span>
                  <span className="text-sm text-p-ink flex-1 truncate">{m.concepto}</span>
                  <span className="text-[10px] text-p-ink2 shrink-0 hidden md:inline">{m.origen_tipo?ORIG_LABEL[m.origen_tipo]:'—'}</span>
                  <span className={`font-mono font-bold text-sm shrink-0 ${m.tipo==='credito'?'text-green-600':'text-red-500'}`}>
                    {m.tipo==='credito'?'+':'−'}{moneyARS(m.monto)}
                  </span>
                </label>
              ))}
            </div>
          </div>
        )
      )}

      {/* Modal movimiento manual */}
      <Modal open={movModal} onClose={()=>setMovModal(false)} title={editMovId?'Editar movimiento':'Movimiento manual'}>
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tipo">
              <select value={formMov.tipo} onChange={e=>setFormMov(p=>({...p,tipo:e.target.value as 'credito'|'debito'}))} className="w-full border border-p-line rounded-lg px-3 py-2 text-sm bg-white">
                <option value="credito">💚 Crédito (entra dinero)</option>
                <option value="debito">🔴 Débito (sale dinero)</option>
              </select>
            </Field>
            <Field label="Fecha"><Input type="date" value={formMov.fecha} onChange={e=>setFormMov(p=>({...p,fecha:e.target.value}))}/></Field>
          </div>
          <Field label="Concepto *"><Input value={formMov.concepto} onChange={e=>setFormMov(p=>({...p,concepto:e.target.value}))} placeholder="Descripción…"/></Field>
          <Field label="Monto *"><Input value={formMov.monto} onChange={e=>setFormMov(p=>({...p,monto:e.target.value}))} placeholder="$"/></Field>
          <Field label="Origen">
            <select value={formMov.origen_tipo} onChange={e=>setFormMov(p=>({...p,origen_tipo:e.target.value}))} className="w-full border border-p-line rounded-lg px-3 py-2 text-sm bg-white">
              {Object.entries(ORIG_LABEL).map(([k,v])=><option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <Field label="N° extracto (si ya está en el extracto)"><Input value={formMov.nro_extracto} onChange={e=>setFormMov(p=>({...p,nro_extracto:e.target.value}))} placeholder="Opcional"/></Field>
          <Field label="Notas"><Input value={formMov.notas} onChange={e=>setFormMov(p=>({...p,notas:e.target.value}))} placeholder="Opcional…"/></Field>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={()=>setMovModal(false)} style={btnGray}>Cancelar</button>
            <button onClick={guardarMov} disabled={!formMov.concepto||!formMov.monto} style={{...btn,opacity:(!formMov.concepto||!formMov.monto)?.5:1}}>Guardar</button>
          </div>
        </div>
      </Modal>

      {/* Modal cheque emitido */}
      {/* Modal transferencia */}
      <Modal open={transfModal} onClose={()=>setTransfModal(false)} title="Nueva transferencia">
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Fecha"><Input type="date" value={formTransf.fecha} onChange={e=>setFormTransf(p=>({...p,fecha:e.target.value}))}/></Field>
            <Field label="Monto *"><Input value={formTransf.monto} onChange={e=>setFormTransf(p=>({...p,monto:e.target.value}))} placeholder="$"/></Field>
          </div>
          <Field label="Concepto / Destinatario *"><Input value={formTransf.concepto} onChange={e=>setFormTransf(p=>({...p,concepto:e.target.value}))} placeholder="Ej: Pago proveedor GAMMA…"/></Field>
          <Field label="Destino">
            <select value={formTransf.destino_tipo} onChange={e=>setFormTransf(p=>({...p,destino_tipo:e.target.value as 'tercero'|'cuenta_propia',cuenta_destino_id:''}))} className="w-full border border-p-line rounded-lg px-3 py-2 text-sm bg-white">
              <option value="tercero">Tercero (proveedor, etc.)</option>
              <option value="cuenta_propia">Cuenta propia</option>
            </select>
          </Field>
          {formTransf.destino_tipo==='cuenta_propia' && (
            <Field label="Cuenta destino">
              <select value={formTransf.cuenta_destino_id} onChange={e=>setFormTransf(p=>({...p,cuenta_destino_id:e.target.value}))} className="w-full border border-p-line rounded-lg px-3 py-2 text-sm bg-white">
                <option value="">Seleccioná cuenta…</option>
                {cuentas.filter(c=>c.id!==selCuenta?.id).map(c=>(
                  <option key={c.id} value={c.id}>
                    {c.banco} ({c.tipo==='Cuenta Corriente'?'CC':c.tipo==='Caja de Ahorro'?'CA':'MP'}) ···{(c.cbu||c.nro_cuenta||'').slice(-5)}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Notas"><Input value={formTransf.notas} onChange={e=>setFormTransf(p=>({...p,notas:e.target.value}))} placeholder="Opcional…"/></Field>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={()=>setTransfModal(false)} style={btnGray}>Cancelar</button>
            <button onClick={guardarTransferencia} disabled={savingTransf||!formTransf.monto||!formTransf.concepto} style={{...btn,opacity:(savingTransf||!formTransf.monto||!formTransf.concepto)?.5:1}}>
              {savingTransf?'Guardando…':'Registrar transferencia'}
            </button>
          </div>
        </div>
      </Modal>

      </>)}

      {/* Modal cuenta */}
      <Modal open={cuentaModal} onClose={()=>setCuentaModal(false)} title={editCuentaId?'Editar cuenta':'Nueva cuenta bancaria'}>
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Banco">
              <select value={formCuenta.banco} onChange={e=>setFormCuenta(p=>({...p,banco:e.target.value}))} className="w-full border border-p-line rounded-lg px-3 py-2 text-sm bg-white">
                {BANCOS_ARG.map(b=><option key={b}>{b}</option>)}
              </select>
            </Field>
            <Field label="Tipo">
              <select value={formCuenta.tipo} onChange={e=>setFormCuenta(p=>({...p,tipo:e.target.value}))} className="w-full border border-p-line rounded-lg px-3 py-2 text-sm bg-white">
                {TIPOS_CUENTA.map(t=><option key={t}>{t}</option>)}
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Alias"><Input value={formCuenta.alias} onChange={e=>setFormCuenta(p=>({...p,alias:e.target.value}))} placeholder="ej: CC La Pampa"/></Field>
            <Field label="N° de cuenta"><Input value={formCuenta.nro_cuenta} onChange={e=>setFormCuenta(p=>({...p,nro_cuenta:e.target.value}))} placeholder="Opcional"/></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Saldo inicial ($)"><Input value={formCuenta.saldo_inicial} onChange={e=>setFormCuenta(p=>({...p,saldo_inicial:e.target.value}))} placeholder="0"/></Field>
            <Field label="Fecha saldo inicial"><Input type="date" value={formCuenta.fecha_saldo_inicial} onChange={e=>setFormCuenta(p=>({...p,fecha_saldo_inicial:e.target.value}))}/></Field>
            <Field label="CBU (22 dígitos)">
              <Input value={formCuenta.cbu} onChange={e=>setFormCuenta(p=>({...p,cbu:e.target.value.replace(/[^0-9]/g,'').slice(0,22)}))} placeholder="Ej: 0340338708338003525016" maxLength={22}/>
              {formCuenta.cbu && <p className="text-[11px] text-p-ink2 mt-1">Últimos 5: <span className="font-mono font-bold">{formCuenta.cbu.slice(-5)}</span></p>}
            </Field>
          </div>
          <p className="text-[11px] text-p-ink2">El saldo inicial es el que tenía la cuenta antes de empezar a cargar movimientos en el sistema.</p>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={()=>setCuentaModal(false)} style={btnGray}>Cancelar</button>
            <button onClick={guardarCuenta} style={btn}>Guardar</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
