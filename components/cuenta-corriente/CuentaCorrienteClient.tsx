'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Modal, Field, Input, Empty } from '@/components/ui'
import { moneyARS2 as moneyARS } from '@/lib/utils/format'
import CuentaCorrienteAseguradorasClient from '@/components/cuenta-corriente-aseguradoras/CuentaCorrienteAseguradorasClient'
import { LOGO_BASE64 } from '@/lib/logo'
import { ChequeFields, EMPTY_CHEQUE, type ChequeData } from '@/components/cheques/ChequeFields'

const btn   = { background:'#00A550',color:'#fff',border:'none',borderRadius:10,padding:'10px 20px',fontWeight:700,fontSize:14,cursor:'pointer' } as const
const btnSm = { ...btn, padding:'6px 14px', fontSize:12 } as const
const btnGray = { ...btnSm, background:'#6b7280' } as const

interface Saldo { cliente_nombre:string; cliente_id:string|null; total_debe:number; total_haber:number; saldo_actual:number; ultima_operacion:string; movimientos:number; plazo_cc_dias?:number; tope_credito?:number }
interface Movimiento { id:string; fecha:string; tipo:string; descripcion:string|null; debe:number; haber:number; saldo:number; notas:string|null; created_at:string }

export default function CuentaCorrienteClient() {
  const [tab, setTab] = useState<'clientes'|'aseguradoras'>('clientes')
  const [saldos, setSaldos]     = useState<Saldo[]>([])
  const [sel, setSel]           = useState<Saldo|null>(null)
  const [movs, setMovs]         = useState<Movimiento[]>([])
  const [q, setQ]               = useState('')
  const [openPago, setOpenPago] = useState(false)
  const [formPago, setFormPago] = useState({ monto:'', fecha:'', notas:'', forma_pago:'Efectivo' })
  const [chequeCobro, setChequeCobro] = useState<ChequeData>(EMPTY_CHEQUE)
  const [loading, setLoading]   = useState(true)
  const [factsPend, setFactsPend] = useState<any[]>([])
  const [factsSel, setFactsSel]   = useState<Record<string,boolean>>({})
  const [vistaMovs, setVistaMovs] = useState(false)
  const [pendientes, setPendientes] = useState<any[]>([])
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
  useEffect(()=>{
    if(sel){
      loadMovs(sel.cliente_nombre)
      // Cargar saldos pendientes desde la vista FIFO
      supabase.from('vista_cc_clientes_saldos_detalle')
        .select('*')
        .eq('cliente_id', sel.cliente_id)
        .order('fecha', { ascending: false })
        .order('created_at', { ascending: false })
        .then(async ({data})=>{
          const rows = (data??[]).filter((r:any) => +r.saldo_acumulado >= 1)
          const compIds = Array.from(new Set(rows.map((r:any)=>r.comprobante_id).filter(Boolean)))
          const compMap: Record<string,any> = {}
          if (compIds.length) {
            const { data: comps } = await supabase.from('comprobantes')
              .select('id,tipo,nro_cbte_afip,numero,fecha,total')
              .in('id', compIds)
            for (const c of (comps??[])) compMap[(c as any).id] = c
          }
          setPendientes(rows.map((r:any)=>({ ...r, comp: r.comprobante_id ? (compMap[r.comprobante_id]||null) : null })))
        })
      setVistaMovs(false)
    }
  },[sel])

  async function abrirCobro() {
    if (!sel?.cliente_id) return
    // Cargar facturas del cliente sin cobro completo
    const { data } = await supabase.from('comprobantes')
      .select('id,fecha,nro_cbte_afip,numero,total,neto,iva')
      .eq('cliente_id', sel.cliente_id)
      .not('es_negro', 'is', true)
      .neq('categoria', 'nc')
      .order('fecha', { ascending: true })
    const todas = data ?? []
    // Sugerir las pendientes (las que no tienen cobro total en CC)
    setFactsPend(todas)
    // Pre-seleccionar todas
    setFactsSel(Object.fromEntries(todas.map((f:any) => [f.id, true])))
    setOpenPago(true)
  }

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
  const conSaldo   = saldos.filter(s=>s.saldo_actual>=1).length
  const filtrados  = saldos.filter(s=>
    Math.abs(s.saldo_actual) >= 1 && // ocultar saldos de centavos por redondeo
    (!q || s.cliente_nombre.toLowerCase().includes(q.toLowerCase()))
  )

  return (
    <div>
      {/* Tabs */}
      <div className="flex border-b border-p-line mb-5">
        {([['clientes','👤 Clientes'],['aseguradoras','🏢 Aseguradoras']] as const).map(([v,l])=>(
          <button key={v} onClick={()=>setTab(v)}
            style={{padding:'8px 24px',fontWeight:700,fontSize:13,cursor:'pointer',border:'none',background:'none',
              borderBottom:tab===v?'3px solid #00A550':'3px solid transparent',
              color:tab===v?'#00A550':'#6b7280'}}>
            {l}
          </button>
        ))}
      </div>

      {tab==='aseguradoras' && <CuentaCorrienteAseguradorasClient />}

      {tab==='clientes' && <div style={{display:'grid',gridTemplateColumns:'260px 1fr',gap:16,alignItems:'start'}}>
      {/* Lista compacta de clientes */}
      <div style={{display:'flex',flexDirection:'column',gap:6}}>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6,marginBottom:4}}>
          <div className="bg-white border border-p-line rounded-xl p-3">
            <p className="text-[10px] font-semibold text-p-ink2 uppercase tracking-wider">Total en calle</p>
            <p className="font-saira font-bold text-base text-red-500 mt-0.5">{moneyARS(totalDeuda)}</p>
          </div>
          <div className="bg-white border border-p-line rounded-xl p-3">
            <p className="text-[10px] font-semibold text-p-ink2 uppercase tracking-wider">Con saldo</p>
            <p className="font-saira font-bold text-base text-p-dark mt-0.5">{conSaldo}</p>
          </div>
        </div>

        <input value={q} onChange={e=>setQ(e.target.value)}
          placeholder="Buscar cliente…"
          className="w-full border border-p-line rounded-lg px-3 py-2 text-xs mb-1 focus:outline-none focus:border-p-green bg-white"/>

        {loading ? <p className="text-sm text-p-gray text-center py-6">Cargando…</p> :
         filtrados.length===0 ? <Empty msg="Sin clientes con saldo." /> : (
          <div className="flex flex-col gap-1.5 overflow-y-auto" style={{maxHeight:380}}>
            {filtrados.sort((a,b)=>b.saldo_actual-a.saldo_actual).map(s=>{
              const plazo = s.plazo_cc_dias ?? 30
              const dias = s.ultima_operacion ? Math.floor((Date.now() - new Date(s.ultima_operacion).getTime()) / 86400000) : 0
              const vencido = s.saldo_actual > 0 && dias >= plazo
              const tope = s.tope_credito && s.saldo_actual >= s.tope_credito
              return (
              <div key={s.cliente_nombre}
                onClick={()=>setSel(sel?.cliente_nombre===s.cliente_nombre?null:s)}
                className={`bg-white border rounded-lg px-3 py-2.5 cursor-pointer transition-all ${sel?.cliente_nombre===s.cliente_nombre?'border-red-400 ring-1 ring-red-200 bg-red-50/30':'border-p-line hover:border-red-200'}`}>
                {vencido && <div className="text-[9px] font-bold text-red-600 mb-1">⚠ {dias}d sin pago</div>}
                {tope && <div className="text-[9px] font-bold text-amber-600 mb-1">🚫 Tope superado</div>}
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-base font-semibold text-p-ink truncate">{s.cliente_nombre}</p>
                    <p className="text-[10px] text-p-ink2">{s.movimientos} mov · {s.ultima_operacion?.split('-').reverse().join('/')}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-sm font-bold ${s.saldo_actual>0?'text-red-500':s.saldo_actual<0?'text-green-600':'text-p-ink2'}`}>
                      {moneyARS(Math.abs(s.saldo_actual))}
                    </p>
                  </div>
                </div>
              </div>
            )})}
          </div>
        )}
      </div>

      {/* Panel detalle cliente */}
      {sel ? (
        <div style={{display:'flex',flexDirection:'column',gap:10}}>
          {/* Header */}
          <div className="bg-white border border-p-line rounded-xl px-4 py-3 flex items-center justify-between gap-3">
            <div>
              <p className="font-saira font-bold text-p-ink text-xl">{sel.cliente_nombre}</p>
              <p className="text-[10px] text-p-ink2">Cargado {moneyARS(sel.total_debe)} · Pagado {moneyARS(sel.total_haber)}</p>
            </div>
            <div className="flex items-center gap-3">
              <p className={`font-bold text-lg ${sel.saldo_actual>0?'text-red-500':'text-green-600'}`}>
                {sel.saldo_actual>0?'Debe ':'A favor '}{moneyARS(Math.abs(sel.saldo_actual))}
              </p>
              <div className="flex gap-2">
                {sel.saldo_actual > 0 && (
                  <button onClick={abrirCobro} style={{...btn,padding:'7px 14px',fontSize:12,whiteSpace:'nowrap'}}>
                    💰 Cobrar
                  </button>
                )}
                <button onClick={()=>{
                  supabase.from('clientes').select('telefono,tipo_cliente_id').eq('id', sel.cliente_id||'').maybeSingle()
                    .then(({data})=>{
                      const p = new URLSearchParams({
                        cli: sel.cliente_nombre,
                        ...(data?.telefono ? {tel: data.telefono} : {}),
                        ...(data?.tipo_cliente_id ? {tipo_id: data.tipo_cliente_id} : {}),
                      })
                      router.push(`/comprobantes?${p.toString()}`)
                    })
                }} style={{...btn,padding:'7px 14px',fontSize:12,background:'#1d4ed8',whiteSpace:'nowrap'}}>
                  🧾 Factura
                </button>
              </div>
              <button onClick={()=>setSel(null)} className="text-p-gray text-lg leading-none">✕</button>
            </div>
          </div>

          {/* Saldos / Movimientos toggle */}
          <div className="bg-white border border-p-line rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-p-line bg-p-light/50">
              <div className="flex gap-1">
                <button onClick={()=>setVistaMovs(false)}
                  className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${!vistaMovs?'bg-p-green text-white':'text-p-ink2 hover:bg-p-light'}`}>
                  Saldos
                </button>
                <button onClick={()=>setVistaMovs(true)}
                  className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${vistaMovs?'bg-p-green text-white':'text-p-ink2 hover:bg-p-light'}`}>
                  Movimientos
                </button>
              </div>
              <span className="text-[10px] text-p-ink2">
                {vistaMovs ? `${movs.length} registros` : `${pendientes.length} pendientes`}
              </span>
            </div>

            {/* Vista Saldos */}
            {!vistaMovs && (
              <div className="overflow-y-auto" style={{maxHeight:400}}>
                {pendientes.length === 0 ? (
                  <p className="text-sm text-p-ink2 text-center py-8">Sin facturas pendientes ✓</p>
                ) : (
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-p-light">
                      <tr>
                        <th className="text-left px-3 py-2 font-semibold text-p-ink2">Fecha</th>
                        <th className="text-left px-3 py-2 font-semibold text-p-ink2">Comprobante</th>
                        <th className="text-right px-3 py-2 font-semibold text-red-400">Total</th>
                        <th className="text-right px-3 py-2 font-semibold text-p-dark">Saldo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendientes.map((p:any,i)=>{
                        const c = p.comp
                        const monto = +p.monto
                        const nro = c
                          ? `FA 0006-${String(c.nro_cbte_afip||c.numero||'').padStart(8,'0')}`
                          : (p.descripcion || p.tipo)
                        return (
                          <tr key={p.id} className={`border-t border-p-line2 ${i%2===0?'':'bg-p-light/20'}`}>
                            <td className="px-3 py-2 font-mono">{p.fecha?.split('-').reverse().join('/')}</td>
                            <td className="px-3 py-2 font-semibold text-p-ink">{nro}</td>
                            <td className={`px-3 py-2 text-right font-mono font-bold ${monto<0?'text-green-600':'text-red-500'}`}>
                              {monto<0?'−':''}{moneyARS(Math.abs(monto))}
                            </td>
                            <td className="px-3 py-2 text-right font-mono font-bold text-red-500">
                              {moneyARS(+p.saldo_acumulado)}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* Vista Movimientos */}
            {vistaMovs && (
              <div className="overflow-y-auto" style={{maxHeight:400}}>
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-p-light">
                    <tr>
                      <th className="text-left px-3 py-2 font-semibold text-p-ink2">Fecha</th>
                      <th className="text-left px-3 py-2 font-semibold text-p-ink2">Descripción</th>
                      <th className="text-right px-3 py-2 font-semibold text-red-400">Debe</th>
                      <th className="text-right px-3 py-2 font-semibold text-green-600">Haber</th>
                      <th className="text-right px-3 py-2 font-semibold text-p-dark">Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movs.map((m,i)=>(
                      <tr key={m.id} className={`border-t border-p-line2 ${i%2===0?'':'bg-p-light/30'}`}>
                        <td className="px-3 py-2 font-mono">{m.fecha?.split('-').reverse().join('/')}</td>
                        <td className="px-3 py-2 max-w-[140px]">
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
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white border border-p-line rounded-xl p-8 flex items-center justify-center">
          <p className="text-sm text-p-ink2">Seleccioná un cliente para ver sus movimientos</p>
        </div>
      )}

      {/* Modal registrar pago */}
      <Modal open={openPago} onClose={()=>setOpenPago(false)} title={`Registrar cobro — ${sel?.cliente_nombre}`}>
        <div className="flex flex-col gap-3">

          {/* Facturas pendientes */}
          {factsPend.length > 0 && (
            <div>
              <p className="text-[11px] font-bold text-p-ink2 uppercase tracking-wider mb-1.5">Facturas a cobrar</p>
              <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
                {factsPend.map((f:any)=>(
                  <label key={f.id} className={`flex items-center gap-2 border rounded-lg px-3 py-2 cursor-pointer text-sm ${factsSel[f.id]?'border-p-green bg-green-50':'border-p-line'}`}>
                    <input type="checkbox" checked={!!factsSel[f.id]}
                      onChange={e=>setFactsSel(p=>({...p,[f.id]:e.target.checked}))}
                      className="accent-p-green w-4 h-4 shrink-0"/>
                    <span className="text-[10px] font-mono bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">
                      FA-0006-{String(f.nro_cbte_afip||f.numero||'').padStart(8,'0')}
                    </span>
                    <span className="text-xs text-p-ink2">{f.fecha?.split('-').reverse().join('/')}</span>
                    <span className="ml-auto font-mono font-bold text-sm">{moneyARS(Number(f.total)||0)}</span>
                  </label>
                ))}
              </div>
              <div className="flex justify-between mt-1.5 px-1 text-xs text-p-ink2">
                <span>{Object.values(factsSel).filter(Boolean).length} de {factsPend.length} seleccionadas</span>
                <span className="font-bold text-p-dark">
                  Total: {moneyARS(factsPend.filter((f:any)=>factsSel[f.id]).reduce((a:number,f:any)=>a+Number(f.total),0))}
                </span>
              </div>
            </div>
          )}

          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
            <p className="text-sm text-red-700">Saldo pendiente</p>
            <p className="font-saira font-bold text-2xl text-red-600">{moneyARS(sel?.saldo_actual||0)}</p>
          </div>
          <Field label="Monto del cobro *">
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
          <Field label="Forma de cobro">
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
              🧾 Registrar cobro y emitir recibo
            </button>
          </div>
        </div>
      </Modal>
    </div>}
    </div>
  )
}

