'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Modal, Field, Input, Empty } from '@/components/ui'
import { moneyARS } from '@/lib/utils/format'

const btn   = { background:'#00A550',color:'#fff',border:'none',borderRadius:10,padding:'10px 20px',fontWeight:700,fontSize:14,cursor:'pointer' } as const
const btnSm = { ...btn, padding:'6px 14px', fontSize:12 } as const
const btnGray = { ...btnSm, background:'#6b7280' } as const

interface Saldo { cliente_nombre:string; cliente_id:string|null; total_debe:number; total_haber:number; saldo_actual:number; ultima_operacion:string; movimientos:number }
interface Movimiento { id:string; fecha:string; tipo:string; descripcion:string|null; debe:number; haber:number; saldo:number; notas:string|null; created_at:string }

export default function CuentaCorrienteClient() {
  const [saldos, setSaldos]     = useState<Saldo[]>([])
  const [sel, setSel]           = useState<Saldo|null>(null)
  const [movs, setMovs]         = useState<Movimiento[]>([])
  const [q, setQ]               = useState('')
  const [openPago, setOpenPago] = useState(false)
  const [formPago, setFormPago] = useState({ monto:'', fecha:'', notas:'' })
  const [loading, setLoading]   = useState(true)
  const supabase = createClient()

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('vista_saldos_cc').select('*')
    setSaldos(data??[])
    setLoading(false)
  }

  async function loadMovs(nombre: string) {
    const { data } = await supabase.from('cuenta_corriente')
      .select('*').eq('cliente_nombre', nombre).order('fecha').order('created_at')
    // Recalcular saldo acumulado
    let saldoAcum = 0
    const movConSaldo = (data??[]).map((m:any) => {
      saldoAcum += (m.debe||0) - (m.haber||0)
      return { ...m, saldo: saldoAcum }
    })
    setMovs(movConSaldo)
  }

  useEffect(()=>{ load() },[supabase])
  useEffect(()=>{ if(sel) loadMovs(sel.cliente_nombre) },[sel])

  async function registrarPago() {
    if(!sel || !formPago.monto) return
    const monto = +formPago.monto
    await supabase.from('cuenta_corriente').insert({
      cliente_id: sel.cliente_id,
      cliente_nombre: sel.cliente_nombre,
      fecha: formPago.fecha || new Date().toISOString().slice(0,10),
      tipo: 'pago',
      descripcion: 'Pago a cuenta',
      debe: 0, haber: monto,
      notas: formPago.notas||null
    })
    setOpenPago(false)
    setFormPago({ monto:'', fecha:'', notas:'' })
    load()
    loadMovs(sel.cliente_nombre)
  }

  const totalDeuda = saldos.reduce((a,s)=>a+Math.max(0,s.saldo_actual),0)
  const conSaldo   = saldos.filter(s=>s.saldo_actual>0).length
  const filtrados  = saldos.filter(s=>!q||s.cliente_nombre.toLowerCase().includes(q.toLowerCase()))

  return (
    <div className="flex gap-4">
      {/* Lista de clientes con saldo */}
      <div className="flex-1 min-w-0">
        {/* KPIs */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-white border border-p-line rounded-xl p-4 shadow-sm">
            <p className="text-[11px] font-semibold text-p-ink2 uppercase tracking-wider">Total en calle</p>
            <p className="font-saira font-bold text-2xl text-red-500 mt-1">{moneyARS(totalDeuda)}</p>
          </div>
          <div className="bg-white border border-p-line rounded-xl p-4 shadow-sm">
            <p className="text-[11px] font-semibold text-p-ink2 uppercase tracking-wider">Clientes con saldo</p>
            <p className="font-saira font-bold text-2xl text-p-dark mt-1">{conSaldo}</p>
          </div>
        </div>

        <input value={q} onChange={e=>setQ(e.target.value)}
          placeholder="Buscar cliente…"
          className="w-full border border-p-line rounded-xl px-4 py-2.5 text-sm mb-4 focus:outline-none focus:border-p-green bg-white shadow-sm"/>

        {loading ? <p className="text-sm text-p-gray text-center py-10">Cargando…</p> :
         filtrados.length===0 ? <Empty msg="Sin clientes con saldo pendiente." /> : (
          <div className="flex flex-col gap-2">
            {filtrados.sort((a,b)=>b.saldo_actual-a.saldo_actual).map(s=>(
              <div key={s.cliente_nombre}
                onClick={()=>setSel(sel?.cliente_nombre===s.cliente_nombre?null:s)}
                className={`bg-white border rounded-xl p-4 cursor-pointer shadow-sm transition-all ${sel?.cliente_nombre===s.cliente_nombre?'border-red-400 ring-1 ring-red-300':'border-p-line hover:border-red-300'}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-saira font-bold text-p-ink">{s.cliente_nombre}</p>
                    <p className="text-xs text-p-ink2 mt-0.5">
                      {s.movimientos} movimiento(s) · último: {s.ultima_operacion?.split('-').reverse().join('/')}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`font-saira font-bold text-xl ${s.saldo_actual>0?'text-red-500':s.saldo_actual<0?'text-green-600':'text-p-ink2'}`}>
                      {s.saldo_actual>0?'Debe ':'Favor '}{moneyARS(Math.abs(s.saldo_actual))}
                    </p>
                    <p className="text-[10px] text-p-ink2">
                      Cargado: {moneyARS(s.total_debe)} · Pagado: {moneyARS(s.total_haber)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Panel movimientos del cliente */}
      {sel && (
        <div className="w-96 shrink-0 bg-white border border-p-line rounded-2xl shadow-sm self-start sticky top-4 flex flex-col">
          <div className="p-4 border-b border-p-line">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-saira font-bold text-p-ink text-lg">{sel.cliente_nombre}</p>
                <p className={`font-bold text-xl ${sel.saldo_actual>0?'text-red-500':'text-green-600'}`}>
                  {sel.saldo_actual>0?'Debe ':'A favor '}{moneyARS(Math.abs(sel.saldo_actual))}
                </p>
              </div>
              <button onClick={()=>setSel(null)} className="text-p-gray text-xl">✕</button>
            </div>
            {sel.saldo_actual > 0 && (
              <button onClick={()=>setOpenPago(true)} style={{...btn,marginTop:10,width:'100%',textAlign:'center'}}>
                💵 Registrar pago
              </button>
            )}
          </div>

          {/* Movimientos */}
          <div className="overflow-y-auto max-h-[500px]">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-p-light">
                <tr>
                  <th className="text-left px-3 py-2 font-bold text-p-ink2">Fecha</th>
                  <th className="text-left px-3 py-2 font-bold text-p-ink2">Descripción</th>
                  <th className="text-right px-3 py-2 font-bold text-red-500">Debe</th>
                  <th className="text-right px-3 py-2 font-bold text-green-600">Haber</th>
                  <th className="text-right px-3 py-2 font-bold text-p-dark">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {movs.map((m,i)=>(
                  <tr key={m.id} className={`border-t border-p-line2 ${i%2===0?'':'bg-p-light/30'}`}>
                    <td className="px-3 py-2 font-mono">{m.fecha?.split('-').reverse().join('/')}</td>
                    <td className="px-3 py-2 max-w-[100px]">
                      <p className="truncate">{m.descripcion||'—'}</p>
                      {m.tipo==='pago'&&<span className="text-[9px] font-bold bg-green-100 text-green-700 px-1 rounded">PAGO</span>}
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-bold text-red-500">{m.debe>0?moneyARS(m.debe):'—'}</td>
                    <td className="px-3 py-2 text-right font-mono font-bold text-green-600">{m.haber>0?moneyARS(m.haber):'—'}</td>
                    <td className={`px-3 py-2 text-right font-mono font-bold ${m.saldo>0?'text-red-500':m.saldo<0?'text-green-600':'text-p-ink2'}`}>
                      {moneyARS(Math.abs(m.saldo))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal registrar pago */}
      <Modal open={openPago} onClose={()=>setOpenPago(false)} title={`Registrar pago — ${sel?.cliente_nombre}`}>
        <div className="flex flex-col gap-3">
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
            <p className="text-sm text-red-700">Saldo pendiente</p>
            <p className="font-saira font-bold text-2xl text-red-600">{moneyARS(sel?.saldo_actual||0)}</p>
          </div>
          <Field label="Monto del pago *">
            <Input value={formPago.monto} onChange={e=>setFormPago(p=>({...p,monto:e.target.value}))} placeholder="0"/>
          </Field>
          {formPago.monto && (
            <div className="bg-p-light rounded-lg p-3 text-sm flex justify-between">
              <span className="text-p-ink2">Saldo restante</span>
              <span className={`font-bold ${(sel?.saldo_actual||0)-(+formPago.monto||0)>0?'text-red-500':'text-green-600'}`}>
                {moneyARS(Math.max(0,(sel?.saldo_actual||0)-(+formPago.monto||0)))}
              </span>
            </div>
          )}
          <Field label="Fecha">
            <Input type="date" value={formPago.fecha} onChange={e=>setFormPago(p=>({...p,fecha:e.target.value}))}/>
          </Field>
          <Field label="Notas">
            <Input value={formPago.notas} onChange={e=>setFormPago(p=>({...p,notas:e.target.value}))} placeholder="Forma de pago, referencia…"/>
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={()=>setOpenPago(false)} style={btnGray}>Cancelar</button>
            <button onClick={registrarPago} disabled={!formPago.monto} style={{...btn,opacity:!formPago.monto?.5:1}}>✓ Registrar pago</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
