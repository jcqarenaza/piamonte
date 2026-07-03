'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Modal, Field, Input, Empty } from '@/components/ui'
import { moneyARS, todayStr } from '@/lib/utils/format'

interface Aseg { id:string; nombre:string }
interface Mov { id:string; fecha:string; tipo:string; descripcion:string; debe:number; haber:number; notas:string|null }
interface Saldo { aseguradora_id:string; nombre:string; total_debe:number; total_haber:number; saldo:number; facturas:number }

const btn    = { background:'#00A550',color:'#fff',border:'none',borderRadius:10,padding:'10px 20px',fontWeight:700,fontSize:14,cursor:'pointer' } as const
const btnSm  = { ...btn, padding:'7px 14px', fontSize:12 } as const
const btnGray = { ...btnSm, background:'#6b7280' } as const

export default function CuentaCorrienteAseguradorasClient() {
  const [saldos, setSaldos]     = useState<Saldo[]>([])
  const [sel, setSel]           = useState<Saldo|null>(null)
  const [movs, setMovs]         = useState<Mov[]>([])
  const [q, setQ]               = useState('')
  const [pagoModal, setPagoModal] = useState(false)
  const [formPago, setFormPago] = useState({ monto:'', fecha:todayStr(), notas:'' })
  const [loading, setLoading]   = useState(false)
  const supabase = createClient()

  useEffect(()=>{ loadSaldos() },[])

  async function loadSaldos() {
    const { data } = await supabase
      .from('cuenta_corriente_aseguradoras')
      .select('aseguradora_id, aseguradoras(nombre), debe, haber')
    if (!data) return
    const map = new Map<string, Saldo>()
    for (const r of data as any[]) {
      const id   = r.aseguradora_id
      const nom  = r.aseguradoras?.nombre || ''
      if (!map.has(id)) map.set(id, { aseguradora_id:id, nombre:nom, total_debe:0, total_haber:0, saldo:0, facturas:0 })
      const s = map.get(id)!
      s.total_debe  += +r.debe
      s.total_haber += +r.haber
      if (+r.debe > 0) s.facturas++
    }
    const arr = [...map.values()].map(s=>({...s, saldo: s.total_debe - s.total_haber}))
      .sort((a,b)=>b.saldo-a.saldo)
    setSaldos(arr)
  }

  async function loadMovs(asegId: string) {
    setLoading(true)
    const { data } = await supabase.from('cuenta_corriente_aseguradoras')
      .select('*').eq('aseguradora_id', asegId).order('fecha',{ascending:false}).order('created_at',{ascending:false})
    setMovs(data??[])
    setLoading(false)
  }

  function seleccionar(s: Saldo) {
    if (sel?.aseguradora_id === s.aseguradora_id) { setSel(null); setMovs([]); return }
    setSel(s); loadMovs(s.aseguradora_id)
  }

  async function registrarCobro() {
    if (!sel || !formPago.monto || +formPago.monto <= 0) return
    await supabase.from('cuenta_corriente_aseguradoras').insert({
      aseguradora_id: sel.aseguradora_id,
      fecha: formPago.fecha,
      tipo: 'cobro',
      descripcion: `Cobro — ${sel.nombre}`,
      debe: 0,
      haber: +formPago.monto,
      notas: formPago.notas||null,
    })
    setPagoModal(false)
    setFormPago({ monto:'', fecha:todayStr(), notas:'' })
    loadSaldos(); loadMovs(sel.aseguradora_id)
  }

  const filtrados = saldos.filter(s => !q || s.nombre.toLowerCase().includes(q.toLowerCase()))
  const totalPendiente = saldos.reduce((a,s)=>a+Math.max(0,s.saldo),0)

  return (
    <div>
      {/* KPI total */}
      <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-5 inline-flex items-center gap-4">
        <div>
          <p className="text-[11px] font-semibold text-red-700 uppercase tracking-wider">Total pendiente de cobro</p>
          <p className="font-saira font-bold text-2xl text-red-600">{moneyARS(totalPendiente)}</p>
        </div>
        <p className="text-xs text-red-500">{saldos.filter(s=>s.saldo>0).length} compañías con saldo</p>
      </div>

      {/* Buscador */}
      <div className="mb-4">
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar aseguradora…"
          className="w-full max-w-md border border-p-line rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-p-green"/>
      </div>

      {/* Listado */}
      <div className="flex flex-col gap-2">
        {filtrados.filter(s=>s.saldo > 0).map(s=>(
          <div key={s.aseguradora_id}>
            <div onClick={()=>seleccionar(s)}
              className={`bg-white border rounded-xl px-4 py-3 shadow-sm flex items-center gap-3 cursor-pointer ${sel?.aseguradora_id===s.aseguradora_id?'border-p-green bg-p-light/30':'border-p-line hover:border-p-green'}`}>
              <div className="flex-1 min-w-0">
                <p className="font-saira font-bold text-p-ink text-sm truncate">{s.nombre}</p>
                <p className="text-[10px] text-p-ink2">{s.facturas} factura(s) · Facturado: {moneyARS(s.total_debe)} · Cobrado: {moneyARS(s.total_haber)}</p>
              </div>
              <p className="font-saira font-bold text-xl text-red-500 shrink-0">Debe {moneyARS(s.saldo)}</p>
            </div>

            {sel?.aseguradora_id === s.aseguradora_id && (
              <div className="border border-p-green border-t-0 rounded-b-xl bg-p-light/10 px-4 py-3">
                <div className="mb-3">
                  <button onClick={()=>setPagoModal(true)} style={btn}>💵 Registrar cobro</button>
                </div>
                {loading ? <p className="text-sm text-p-gray py-2">Cargando…</p> : (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-p-ink2 font-semibold border-b border-p-line">
                        <th className="text-left py-1.5">Fecha</th>
                        <th className="text-left py-1.5">Descripción</th>
                        <th className="text-right py-1.5 text-red-500">Debe</th>
                        <th className="text-right py-1.5 text-green-600">Haber</th>
                      </tr>
                    </thead>
                    <tbody>
                      {movs.map(m=>(
                        <tr key={m.id} className="border-b border-p-line2">
                          <td className="py-2 font-mono text-p-ink2">{m.fecha.split('-').reverse().join('/')}</td>
                          <td className="py-2 text-p-ink">{m.descripcion}</td>
                          <td className="py-2 text-right font-mono text-red-500">{m.debe>0?moneyARS(m.debe):'—'}</td>
                          <td className="py-2 text-right font-mono text-green-600">{m.haber>0?moneyARS(m.haber):'—'}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="font-bold border-t border-p-line">
                        <td colSpan={2} className="py-2">Saldo pendiente</td>
                        <td colSpan={2} className="py-2 text-right font-saira text-lg text-red-500">{moneyARS(s.saldo)}</td>
                      </tr>
                    </tfoot>
                  </table>
                )}
              </div>
            )}
          </div>
        ))}
        {filtrados.filter(s=>s.saldo>0).length===0 && <Empty msg="No hay saldos pendientes con aseguradoras."/>}
      </div>

      {/* Modal cobro */}
      <Modal open={pagoModal} onClose={()=>setPagoModal(false)} title={`Registrar cobro — ${sel?.nombre}`}>
        <div className="flex flex-col gap-3">
          <Field label="Monto cobrado *"><Input value={formPago.monto} onChange={e=>setFormPago(p=>({...p,monto:e.target.value}))} placeholder="$"/></Field>
          <Field label="Fecha"><Input type="date" value={formPago.fecha} onChange={e=>setFormPago(p=>({...p,fecha:e.target.value}))}/></Field>
          <Field label="Notas"><Input value={formPago.notas} onChange={e=>setFormPago(p=>({...p,notas:e.target.value}))} placeholder="N° transferencia, cheque…"/></Field>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={()=>setPagoModal(false)} style={btnGray}>Cancelar</button>
            <button onClick={registrarCobro} disabled={!formPago.monto||+formPago.monto<=0}
              style={{...btn,opacity:(!formPago.monto||+formPago.monto<=0)?.5:1}}>Registrar cobro</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
