'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Modal, Field, Input, Empty } from '@/components/ui'
import { moneyARS } from '@/lib/utils/format'
import { LOGO_BASE64 } from '@/lib/logo'
import { ChequeFields, EMPTY_CHEQUE, type ChequeData } from '@/components/cheques/ChequeFields'

const btn   = { background:'#00A550',color:'#fff',border:'none',borderRadius:10,padding:'10px 20px',fontWeight:700,fontSize:14,cursor:'pointer' } as const
const btnSm = { ...btn, padding:'6px 14px', fontSize:12 } as const
const btnGray = { ...btnSm, background:'#6b7280' } as const

interface Saldo { cliente_nombre:string; cliente_id:string|null; total_debe:number; total_haber:number; saldo_actual:number; ultima_operacion:string; movimientos:number; plazo_cc_dias?:number; tope_credito?:number }
interface Movimiento { id:string; fecha:string; tipo:string; descripcion:string|null; debe:number; haber:number; saldo:number; notas:string|null; created_at:string }

export default function CuentaCorrienteClient() {
  const [saldos, setSaldos]     = useState<Saldo[]>([])
  const [sel, setSel]           = useState<Saldo|null>(null)
  const [movs, setMovs]         = useState<Movimiento[]>([])
  const [q, setQ]               = useState('')
  const [openPago, setOpenPago] = useState(false)
  const [formPago, setFormPago] = useState({ monto:'', fecha:'', notas:'', forma_pago:'Efectivo' })
  const [chequeCobro, setChequeCobro] = useState<ChequeData>(EMPTY_CHEQUE)
  const [loading, setLoading]   = useState(true)
  const supabase = createClient()
  const router   = useRouter()

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
    if(!sel || !formPago.monto || +formPago.monto <= 0) return
    const monto = +formPago.monto
    const fechaPago = formPago.fecha || new Date().toISOString().slice(0,10)
    const { data: mov } = await supabase.from('cuenta_corriente').insert({
      cliente_id: sel.cliente_id,
      cliente_nombre: sel.cliente_nombre,
      fecha: fechaPago,
      tipo: 'pago',
      descripcion: 'Pago a cuenta',
      debe: 0, haber: monto,
      notas: formPago.notas||null
    }).select('id').single()

    // Recibo numerado — mismo criterio que los Certificados (contador propio en `contadores`)
    const { data: numeroData } = await supabase.rpc('next_recibo_numero')
    const numero = numeroData as string
    await supabase.from('recibos_cobro').insert({
      numero, fecha: fechaPago,
      cliente_id: sel.cliente_id, cliente_nombre: sel.cliente_nombre,
      monto, forma_pago: formPago.forma_pago,
      notas: formPago.notas||null,
      cuenta_corriente_id: mov?.id || null,
    })

    setOpenPago(false)
    imprimirRecibo({ numero, fecha: fechaPago, cliente_nombre: sel.cliente_nombre, monto, forma_pago: formPago.forma_pago, notas: formPago.notas })
    // Si cobró con cheque de tercero, registrarlo en el libro de cheques
    if (formPago.forma_pago === 'Cheque' && chequeCobro.numero) {
      await supabase.from('cheques').insert({
        tipo:'tercero', formato:chequeCobro.formato, modalidad:chequeCobro.modalidad,
        numero:chequeCobro.numero, banco:chequeCobro.banco,
        fecha_emision: fechaPago, fecha_cobro: chequeCobro.modalidad==='al_dia'?fechaPago:chequeCobro.fecha_cobro,
        monto, contraparte: sel.cliente_nombre, estado:'en_cartera',
        notas: `Cobro Cta Cte — Recibo Nº ${numero}`,
      })
    }
    setFormPago({ monto:'', fecha:'', notas:'', forma_pago:'Efectivo' })
    setChequeCobro(EMPTY_CHEQUE)
    load()
    loadMovs(sel.cliente_nombre)
  }

  function imprimirRecibo(r: { numero:string; fecha:string; cliente_nombre:string; monto:number; forma_pago:string; notas:string }) {
    const fechaFmt = r.fecha.split('-').reverse().join('/')
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Recibo N° ${r.numero}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,Helvetica,sans-serif;background:#fff;color:#1a1a1a;width:210mm;margin:0 auto;font-size:12px}
  .header{background:#fff;color:#1a1a1a;padding:14px 24px;display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #00A550}
  .logo-sub{font-size:10px;letter-spacing:3px;color:#555;margin-top:2px}
  .shield{background:#00A550;color:#fff;border-radius:12px;padding:10px 16px;text-align:center;border:2px solid #fff}
  .shield .sv{font-size:10px;font-weight:bold;letter-spacing:1px}
  .shield .sa{font-size:18px;font-weight:900;line-height:1}
  .title-bar{background:#fff;padding:14px 24px 8px;border-bottom:4px solid #00A550}
  .rec-title{font-size:30px;font-weight:900;text-transform:uppercase;line-height:1.1;color:#1a1a1a}
  .rec-title .accent{color:#00A550}
  .rec-num{font-size:14px;font-weight:bold;color:#00A550;margin-top:4px}
  .rec-fecha{font-size:12px;color:#555;margin-top:2px}
  .body{padding:24px}
  .section{border:1.5px solid #1a1a1a;border-radius:10px;padding:16px 20px;margin-bottom:14px}
  .sec-title{font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;color:#00A550}
  .field-label{font-size:10.5px;color:#555;margin-top:6px}
  .field-line{border:none;border-bottom:1px solid #888;width:100%;margin:4px 0 6px;display:block;font-size:13px;color:#1a1a1a}
  .monto-box{background:#00A550;color:#fff;border-radius:10px;padding:18px 20px;text-align:center;margin-top:4px}
  .monto-box .lbl{font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.5px;opacity:.9}
  .monto-box .val{font-size:30px;font-weight:900;margin-top:4px}
  .footer-bar{background:#f5f5f5;color:#1a1a1a;padding:10px 24px;text-align:center;margin-top:10px;border-top:2px solid #00A550;font-size:10px;color:#555}
  @media print{body{width:auto;margin:0}@page{margin:8mm 14mm;size:A4}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style></head><body>

<div class="header">
  <div>
    <img src="${LOGO_BASE64}" alt="El Piamonte" style="height:42px;object-fit:contain;"/>
    <div class="logo-sub">SEGURIDAD • TECNOLOGÍA • CONFIANZA</div>
  </div>
  <div class="shield">
    <div class="sv">RECIBO DE</div>
    <div class="sv">PAGO</div>
    <div class="sa">✔</div>
  </div>
</div>

<div class="title-bar">
  <div class="rec-title">RECIBO DE <span class="accent">PAGO</span></div>
  <div class="rec-num">N° ${r.numero}</div>
  <div class="rec-fecha">Fecha: ${fechaFmt}</div>
</div>

<div class="body">
  <div class="section">
    <div class="sec-title">👤 RECIBIMOS DE</div>
    <div class="field-label">Cliente:</div>
    <div class="field-line" style="font-size:16px;font-weight:700">${r.cliente_nombre}</div>
  </div>
  <div class="monto-box">
    <div class="lbl">Monto recibido</div>
    <div class="val">${moneyARS(r.monto)}</div>
  </div>
  <div class="section" style="margin-top:14px">
    <div class="sec-title">💳 DETALLE</div>
    <div class="field-label">Forma de pago:</div>
    <div class="field-line">${r.forma_pago}</div>
    ${r.notas ? `<div class="field-label">Notas:</div><div class="field-line">${r.notas}</div>` : ''}
    <div class="field-label">En concepto de:</div>
    <div class="field-line">Pago a cuenta — cuenta corriente</div>
  </div>
</div>

<div class="footer-bar">Parabrisas El Piamonte — Recibo válido como comprobante de pago a cuenta. No reemplaza factura.</div>

</body></html>`
    const w = window.open('', '_blank')!
    w.document.write(html)
    w.document.close()
  }

  const totalDeuda = saldos.reduce((a,s)=>a+Math.max(0,s.saldo_actual),0)
  const conSaldo   = saldos.filter(s=>s.saldo_actual>0).length
  const filtrados  = saldos.filter(s=>
    s.saldo_actual !== 0 && // ocultar saldados
    (!q || s.cliente_nombre.toLowerCase().includes(q.toLowerCase()))
  )

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
                {/* Alerta de plazo vencido */}
                {(() => {
                  if (!s.ultima_operacion || !s.saldo_actual || s.saldo_actual <= 0) return null
                  const plazo = s.plazo_cc_dias ?? 30
                  const diasTranscurridos = Math.floor((Date.now() - new Date(s.ultima_operacion).getTime()) / 86400000)
                  if (diasTranscurridos < plazo) return null
                  return (
                    <div style={{background:'#fee2e2',borderRadius:8,padding:'6px 10px',marginBottom:8,fontSize:12,fontWeight:700,color:'#dc2626'}}>
                      ⚠️ Plazo vencido — {diasTranscurridos} días sin pago (límite: {plazo} días)
                    </div>
                  )
                })()}
                {s.tope_credito && s.saldo_actual >= s.tope_credito && (
                  <div style={{background:'#fef3c7',borderRadius:8,padding:'6px 10px',marginBottom:8,fontSize:12,fontWeight:700,color:'#d97706'}}>
                    🚫 Tope de crédito superado — {moneyARS(s.saldo_actual)} / {moneyARS(s.tope_credito)}
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-saira font-bold text-p-ink">{s.cliente_nombre}</p>
                    <p className="text-xs text-p-ink2 mt-0.5">
                      {s.movimientos} movimiento(s) · último: {s.ultima_operacion?.split('-').reverse().join('/')}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`font-saira font-bold text-xl ${s.saldo_actual>0?'text-red-500':s.saldo_actual<0?'text-green-600':'text-p-ink2'}`}>
                      {s.saldo_actual>0?'Debe ':s.saldo_actual<0?'Favor ':''}{moneyARS(Math.abs(s.saldo_actual))}
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
            <button onClick={()=>{
              const params = new URLSearchParams({
                cli: sel.cliente_nombre,
                ...(sel.cliente_id ? {tel:''} : {}),
              })
              // Buscar el teléfono del cliente para pre-cargarlo
              supabase.from('clientes').select('telefono,tipo_cliente_id').eq('id', sel.cliente_id||'').maybeSingle()
                .then(({data})=>{
                  const p = new URLSearchParams({
                    cli: sel.cliente_nombre,
                    ...(data?.telefono ? {tel: data.telefono} : {}),
                    ...(data?.tipo_cliente_id ? {tipo_id: data.tipo_cliente_id} : {}),
                  })
                  router.push(`/comprobantes?${p.toString()}`)
                })
            }} style={{...btn,marginTop:8,width:'100%',textAlign:'center',background:'#1d4ed8'}}>
              🧾 Nueva factura
            </button>
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
          <Field label="Forma de pago">
            <select value={formPago.forma_pago} onChange={e=>setFormPago(p=>({...p,forma_pago:e.target.value}))}
              className="w-full border border-p-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-p-green bg-white">
              <option value="Efectivo">Efectivo</option>
              <option value="Transferencia">Transferencia</option>
              <option value="Tarjeta">Tarjeta</option>
              <option value="Cheque">🖊 Cheque de tercero</option>
            </select>
          </Field>
          {formPago.forma_pago==='Cheque'&&<ChequeFields value={chequeCobro} onChange={setChequeCobro}/>}
          <Field label="Notas">
            <Input value={formPago.notas} onChange={e=>setFormPago(p=>({...p,notas:e.target.value}))} placeholder="Referencia…"/>
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={()=>setOpenPago(false)} style={btnGray}>Cancelar</button>
            <button onClick={registrarPago}
              disabled={!formPago.monto||(formPago.forma_pago==='Cheque'&&!chequeCobro.numero)}
              style={{...btn,opacity:(!formPago.monto||(formPago.forma_pago==='Cheque'&&!chequeCobro.numero))?.5:1}}>
              🧾 Registrar pago y emitir recibo
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

