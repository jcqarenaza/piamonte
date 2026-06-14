'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { moneyARS } from '@/lib/utils/format'

const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

export default function ContabilidadClient() {
  const [tab, setTab]       = useState<'iva_ventas'|'iva_compras'|'balance'>('iva_ventas')
  const [mes, setMes]       = useState(new Date().toISOString().slice(0,7))
  const [ivaVentas, setIvaVentas]   = useState<any[]>([])
  const [ivaCompras, setIvaCompras] = useState<any[]>([])
  const [loading, setLoading]       = useState(false)
  const supabase = createClient()

  useEffect(()=>{
    async function load() {
      setLoading(true)
      const mesStart = mes + '-01'
      const mesEnd   = mes + '-31'
      const [v, c] = await Promise.all([
        supabase.from('vista_libro_iva_ventas').select('*').gte('fecha', mesStart).lte('fecha', mesEnd),
        supabase.from('vista_libro_iva_compras').select('*').gte('fecha', mesStart).lte('fecha', mesEnd),
      ])
      setIvaVentas(v.data??[])
      setIvaCompras(c.data??[])
      setLoading(false)
    }
    load()
  },[mes, supabase])

  const totVentas  = ivaVentas.reduce((a,r)=>({neto:a.neto+r.neto, iva:a.iva+r.iva, total:a.total+r.total}),{neto:0,iva:0,total:0})
  const totCompras = ivaCompras.reduce((a,r)=>({neto:a.neto+r.neto, iva:a.iva+r.iva, total:a.total+r.total}),{neto:0,iva:0,total:0})
  const saldoIva   = totVentas.iva - totCompras.iva

  const tabStyle = (t:string) => ({
    padding:'8px 20px', fontWeight:700, fontSize:13, cursor:'pointer', border:'none',
    borderBottom: tab===t?'3px solid #00A550':'3px solid transparent',
    background:'none', color: tab===t?'#00A550':'#6b7280'
  })

  const [y, m] = mes.split('-')

  return (
    <div>
      {/* Selector mes */}
      <div className="flex items-center gap-3 mb-5">
        <button onClick={()=>{const d=new Date(mes+'-01');d.setMonth(d.getMonth()-1);setMes(d.toISOString().slice(0,7))}}
          className="border border-p-line rounded-lg px-3 py-2 hover:bg-p-light">←</button>
        <div className="font-saira font-bold text-lg text-p-ink px-3">
          {MESES[+m-1]} {y}
        </div>
        <button onClick={()=>{const d=new Date(mes+'-01');d.setMonth(d.getMonth()+1);setMes(d.toISOString().slice(0,7))}}
          className="border border-p-line rounded-lg px-3 py-2 hover:bg-p-light">→</button>
        <button onClick={()=>setMes(new Date().toISOString().slice(0,7))} className="text-sm text-p-green font-semibold hover:underline">Este mes</button>
      </div>

      {/* Resumen IVA */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="bg-white border border-p-line rounded-xl p-4 shadow-sm">
          <p className="text-[11px] font-semibold text-p-ink2 uppercase tracking-wider">IVA Ventas (débito fiscal)</p>
          <p className="font-saira font-bold text-xl text-p-ink mt-1">{moneyARS(totVentas.iva)}</p>
          <p className="text-[10px] text-p-ink2">sobre {moneyARS(totVentas.neto)} neto</p>
        </div>
        <div className="bg-white border border-p-line rounded-xl p-4 shadow-sm">
          <p className="text-[11px] font-semibold text-p-ink2 uppercase tracking-wider">IVA Compras (crédito fiscal)</p>
          <p className="font-saira font-bold text-xl text-p-ink mt-1">{moneyARS(totCompras.iva)}</p>
          <p className="text-[10px] text-p-ink2">sobre {moneyARS(totCompras.neto)} neto</p>
        </div>
        <div className={`border rounded-xl p-4 shadow-sm ${saldoIva>=0?'bg-red-50 border-red-200':'bg-green-50 border-green-200'}`}>
          <p className="text-[11px] font-semibold text-p-ink2 uppercase tracking-wider">Saldo IVA a pagar</p>
          <p className={`font-saira font-bold text-xl mt-1 ${saldoIva>=0?'text-red-600':'text-green-600'}`}>{moneyARS(Math.abs(saldoIva))}</p>
          <p className="text-[10px] text-p-ink2">{saldoIva>=0?'A favor del fisco':'A favor del contribuyente'}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-p-line mb-4">
        <button style={tabStyle('iva_ventas')} onClick={()=>setTab('iva_ventas')}>📋 Libro IVA Ventas</button>
        <button style={tabStyle('iva_compras')} onClick={()=>setTab('iva_compras')}>📋 Libro IVA Compras</button>
        <button style={tabStyle('balance')} onClick={()=>setTab('balance')}>📊 Balance</button>
      </div>

      {loading ? <p className="text-sm text-p-gray text-center py-10">Cargando…</p> : (
        <>
          {/* Libro IVA Ventas */}
          {tab === 'iva_ventas' && (
            <div className="overflow-x-auto rounded-xl border border-p-line shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-p-dark text-white">
                    <th className="text-left px-4 py-3 text-xs uppercase">Fecha</th>
                    <th className="text-left px-3 py-3 text-xs uppercase">Tipo</th>
                    <th className="text-left px-3 py-3 text-xs uppercase">N°</th>
                    <th className="text-left px-3 py-3 text-xs uppercase">Cliente</th>
                    <th className="text-left px-3 py-3 text-xs uppercase">CUIT</th>
                    <th className="text-right px-3 py-3 text-xs uppercase">Neto</th>
                    <th className="text-right px-3 py-3 text-xs uppercase">IVA</th>
                    <th className="text-right px-3 py-3 text-xs uppercase">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {ivaVentas.map((r,i)=>(
                    <tr key={r.comprobante_id} className={`border-t border-p-line2 ${i%2===0?'bg-white':'bg-p-light/30'}`}>
                      <td className="px-4 py-2 font-mono text-xs">{r.fecha?.split('-').reverse().join('/')}</td>
                      <td className="px-3 py-2"><span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{r.tipo?.toUpperCase()}</span></td>
                      <td className="px-3 py-2 font-mono text-xs">{r.numero||'—'}</td>
                      <td className="px-3 py-2 text-xs truncate max-w-[120px]">{r.cliente_nombre||'—'}</td>
                      <td className="px-3 py-2 font-mono text-xs">{r.cliente_cuit||'—'}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs">{moneyARS(r.neto||0)}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-p-ink2">{moneyARS(r.iva||0)}</td>
                      <td className="px-3 py-2 text-right font-mono font-bold text-xs">{moneyARS(r.total||0)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-p-dark text-white">
                    <td colSpan={5} className="px-4 py-3 font-bold">TOTALES</td>
                    <td className="px-3 py-3 text-right font-mono font-bold">{moneyARS(totVentas.neto)}</td>
                    <td className="px-3 py-3 text-right font-mono font-bold text-p-green">{moneyARS(totVentas.iva)}</td>
                    <td className="px-3 py-3 text-right font-mono font-bold">{moneyARS(totVentas.total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* Libro IVA Compras */}
          {tab === 'iva_compras' && (
            <div className="overflow-x-auto rounded-xl border border-p-line shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-p-dark text-white">
                    <th className="text-left px-4 py-3 text-xs uppercase">Fecha</th>
                    <th className="text-left px-3 py-3 text-xs uppercase">Tipo</th>
                    <th className="text-left px-3 py-3 text-xs uppercase">N°</th>
                    <th className="text-left px-3 py-3 text-xs uppercase">Proveedor</th>
                    <th className="text-right px-3 py-3 text-xs uppercase">Neto</th>
                    <th className="text-right px-3 py-3 text-xs uppercase">IVA</th>
                    <th className="text-right px-3 py-3 text-xs uppercase">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {ivaCompras.map((r,i)=>(
                    <tr key={r.comprobante_compra_id} className={`border-t border-p-line2 ${i%2===0?'bg-white':'bg-p-light/30'}`}>
                      <td className="px-4 py-2 font-mono text-xs">{r.fecha?.split('-').reverse().join('/')}</td>
                      <td className="px-3 py-2"><span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">{r.letra||''}{r.punto_venta?`-${r.punto_venta}`:''}</span></td>
                      <td className="px-3 py-2 font-mono text-xs">{r.numero||'—'}</td>
                      <td className="px-3 py-2 text-xs truncate max-w-[140px]">{r.proveedor_nombre||'—'}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs">{moneyARS(r.neto||0)}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-p-ink2">{moneyARS(r.iva||0)}</td>
                      <td className="px-3 py-2 text-right font-mono font-bold text-xs">{moneyARS(r.total||0)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-p-dark text-white">
                    <td colSpan={4} className="px-4 py-3 font-bold">TOTALES</td>
                    <td className="px-3 py-3 text-right font-mono font-bold">{moneyARS(totCompras.neto)}</td>
                    <td className="px-3 py-3 text-right font-mono font-bold text-p-green">{moneyARS(totCompras.iva)}</td>
                    <td className="px-3 py-3 text-right font-mono font-bold">{moneyARS(totCompras.total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* Balance */}
          {tab === 'balance' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="bg-white border border-p-line rounded-xl p-5 shadow-sm">
                <h3 className="font-saira font-bold text-p-ink mb-4">Resumen del mes</h3>
                <div className="flex flex-col gap-3">
                  {[
                    {label:'Ventas brutas',   val:totVentas.total,  color:'text-p-green'},
                    {label:'IVA Débito fiscal', val:totVentas.iva,   color:'text-red-500'},
                    {label:'Ventas netas',    val:totVentas.neto,   color:'text-p-dark'},
                    {label:'Compras brutas',  val:totCompras.total, color:'text-amber-600'},
                    {label:'IVA Crédito fiscal', val:totCompras.iva, color:'text-p-green'},
                    {label:'Compras netas',   val:totCompras.neto,  color:'text-p-dark'},
                  ].map(r=>(
                    <div key={r.label} className="flex justify-between items-center py-2 border-b border-p-line2">
                      <span className="text-sm text-p-ink">{r.label}</span>
                      <span className={`font-mono font-bold ${r.color}`}>{moneyARS(r.val)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between items-center pt-2 border-t-2 border-p-dark">
                    <span className="font-bold text-p-dark">Resultado bruto</span>
                    <span className={`font-mono font-bold text-xl ${totVentas.neto-totCompras.neto>=0?'text-p-green':'text-red-500'}`}>
                      {moneyARS(totVentas.neto - totCompras.neto)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-p-ink2">Saldo IVA ({saldoIva>=0?'a pagar':'a favor'})</span>
                    <span className={`font-mono font-bold ${saldoIva>=0?'text-red-500':'text-p-green'}`}>
                      {moneyARS(Math.abs(saldoIva))}
                    </span>
                  </div>
                </div>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
                <h3 className="font-saira font-bold text-amber-800 mb-3">📋 Para el contador</h3>
                <p className="text-sm text-amber-700 mb-3">Información del mes para presentar:</p>
                <div className="bg-white rounded-lg p-3 font-mono text-xs space-y-1 text-p-dark">
                  <p>Período: {MESES[+m-1]} {y}</p>
                  <p>Ventas totales: {moneyARS(totVentas.total)}</p>
                  <p>IVA débito: {moneyARS(totVentas.iva)}</p>
                  <p>Compras totales: {moneyARS(totCompras.total)}</p>
                  <p>IVA crédito: {moneyARS(totCompras.iva)}</p>
                  <p>Saldo IVA: {moneyARS(saldoIva)} ({saldoIva>=0?'A PAGAR':'A FAVOR'})</p>
                </div>
                <button onClick={()=>{
                  const txt = `PERÍODO: ${MESES[+m-1]} ${y}\nVENTAS: ${moneyARS(totVentas.total)} (IVA: ${moneyARS(totVentas.iva)})\nCOMPRAS: ${moneyARS(totCompras.total)} (IVA: ${moneyARS(totCompras.iva)})\nSALDO IVA: ${moneyARS(saldoIva)} (${saldoIva>=0?'A PAGAR':'A FAVOR'})`
                  navigator.clipboard.writeText(txt)
                }} style={{marginTop:12,background:'#92400e',color:'#fff',border:'none',borderRadius:8,padding:'8px 16px',fontWeight:700,fontSize:12,cursor:'pointer',width:'100%'}}>
                  📋 Copiar resumen
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
