'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { moneyARS } from '@/lib/utils/format'

const btn   = { background:'#00A550',color:'#fff',border:'none',borderRadius:10,padding:'10px 20px',fontWeight:700,fontSize:14,cursor:'pointer' } as const
const btnSm = { ...btn, padding:'6px 14px', fontSize:12 } as const

export default function ArqueoClient({ esPiamonte = false }: { esPiamonte?: boolean }) {
  const [fecha, setFecha]         = useState(new Date().toISOString().slice(0,10))
  const [arqueo, setArqueo]       = useState<any|null>(null)
  const [loading, setLoading]     = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [fisEfectivo, setFisEfectivo] = useState('')
  const [fisTransfer, setFisTransfer] = useState('')
  const [notas, setNotas]         = useState('')
  const [historial, setHistorial] = useState<any[]>([])
  const supabase = createClient()

  async function cargarDia(f: string) {
    setLoading(true)
    const fechaSig = new Date(new Date(f).getTime() + 86400000).toISOString().slice(0,10)

    const [comprobantes, ventasCaja, movCaja2, gastosRes, arqueoExist] = await Promise.all([
      // Comprobantes facturados (blanco)
      supabase.from('comprobantes').select('total,pagos')
        .gte('created_at', f + 'T00:00:00')
        .lt('created_at', fechaSig + 'T00:00:00'),
      // Ventas de caja SIN comprobante (no duplicar)
      supabase.from('ventas').select('precio,pago')
        .eq('fecha', f)
        .is('comprobante_id', null),
      // Movimientos Caja 2
      supabase.from('movimientos_caja').select('tipo,monto')
        .gte('created_at', f + 'T00:00:00')
        .lt('created_at', fechaSig + 'T00:00:00'),
      // Gastos del día
      supabase.from('gastos').select('monto,forma_pago')
        .eq('fecha', f),
      // Arqueo existente
      supabase.from('arqueos_caja').select('*').eq('fecha', f).maybeSingle()
    ])

    // ── Comprobantes: desglosar por forma de pago ──
    let sysEfectivo = 0, sysTarjeta = 0, sysTransfer = 0, sysCuentaCte = 0
    for (const c of comprobantes.data ?? []) {
      const pagos = Array.isArray(c.pagos) ? c.pagos : []
      if (pagos.length === 0) {
        sysEfectivo += c.total ?? 0
      } else {
        for (const p of pagos) {
          const m = parseFloat(p.monto) || 0
          if (p.metodo === 'Efectivo') sysEfectivo += m
          else if (p.metodo?.startsWith('Crédito') || p.metodo?.startsWith('Débito') || p.metodo === 'Tarjeta') sysTarjeta += m
          else if (p.metodo === 'Transferencia' || p.metodo === 'Depósito') sysTransfer += m
          else if (p.metodo === 'Cuenta corriente') sysCuentaCte += m
          else sysEfectivo += m
        }
      }
    }

    // ── Ventas de caja (sin comprobante) ──
    let cajaEfectivo = 0, cajaTarjeta = 0, cajaTransfer = 0, cajaCuentaCte = 0
    for (const v of ventasCaja.data ?? []) {
      const m = v.precio ?? 0
      if (v.pago === 'Efectivo') cajaEfectivo += m
      else if (v.pago?.startsWith('Créd') || v.pago?.startsWith('Déb') || v.pago === 'Tarjeta') cajaTarjeta += m
      else if (v.pago === 'Transferencia' || v.pago === 'Depósito') cajaTransfer += m
      else if (v.pago === 'Cuenta corriente') cajaCuentaCte += m
      else cajaEfectivo += m
    }

    const sysTotal = sysEfectivo + sysTarjeta + sysTransfer + sysCuentaCte
                   + cajaEfectivo + cajaTarjeta + cajaTransfer + cajaCuentaCte

    // ── Caja 2: ventas y compras ──
    let caja2Ventas = 0, caja2Compras = 0
    for (const m of movCaja2.data ?? []) {
      if (m.tipo === 'venta') caja2Ventas += m.monto ?? 0
      else if (m.tipo === 'compra') caja2Compras += m.monto ?? 0
    }
    const caja2Neto = caja2Ventas - caja2Compras

    // ── Gastos ──
    let gastosEfectivo = 0, gastosTarjeta = 0, gastosTransfer = 0
    for (const g of gastosRes.data ?? []) {
      const m = g.monto ?? 0
      if (g.forma_pago === 'Efectivo') gastosEfectivo += m
      else if (g.forma_pago === 'Tarjeta') gastosTarjeta += m
      else if (g.forma_pago === 'Transferencia') gastosTransfer += m
      else gastosEfectivo += m
    }
    const gastosTotal = gastosEfectivo + gastosTarjeta + gastosTransfer

    setArqueo({
      fecha: f,
      sysEfectivo, sysTarjeta, sysTransfer, sysCuentaCte, sysTotal,
      cajaEfectivo, cajaTarjeta, cajaTransfer, cajaCuentaCte,
      cajaTotal: cajaEfectivo + cajaTarjeta + cajaTransfer + cajaCuentaCte,
      caja2Ventas, caja2Compras, caja2Neto,
      gastosEfectivo, gastosTarjeta, gastosTransfer, gastosTotal,
      totalGeneral: sysTotal + caja2Neto - gastosTotal,
      ...(arqueoExist.data || {})
    })

    if (arqueoExist.data) {
      setFisEfectivo(arqueoExist.data.fis_efectivo?.toString() || '')
      setFisTransfer(arqueoExist.data.fis_transfer?.toString() || '')
      setNotas(arqueoExist.data.notas || '')
    } else {
      setFisEfectivo(''); setFisTransfer(''); setNotas('')
    }
    setLoading(false)
  }

  useEffect(() => {
    cargarDia(fecha)
    supabase.from('arqueos_caja').select('*').order('fecha', { ascending:false }).limit(10)
      .then(({ data }) => setHistorial(data ?? []))
  }, [fecha])

  async function cerrarArqueo() {
    if (!arqueo) return
    setGuardando(true)
    const fis_efectivo = +fisEfectivo || 0
    const fis_tarjeta  = arqueo.sysTarjeta + arqueo.cajaTarjeta
    const fis_transfer = +fisTransfer || 0
    const fis_total    = fis_efectivo + fis_tarjeta + fis_transfer
    const diferencia   = fis_total - (arqueo.sysEfectivo + arqueo.cajaEfectivo + arqueo.sysTarjeta + arqueo.cajaTarjeta + arqueo.sysTransfer + arqueo.cajaTransfer)

    await supabase.from('arqueos_caja').upsert({
      fecha: arqueo.fecha,
      sys_efectivo: arqueo.sysEfectivo, sys_tarjeta: arqueo.sysTarjeta,
      sys_transfer: arqueo.sysTransfer, sys_total: arqueo.sysTotal,
      negro_ventas: arqueo.caja2Ventas, negro_compras: arqueo.caja2Compras,
      negro_neto: arqueo.caja2Neto,
      gastos_total: arqueo.gastosTotal,
      fis_efectivo, fis_tarjeta, fis_transfer, fis_total,
      diferencia, estado: 'cerrado', notas: notas || null,
      cerrado_at: new Date().toISOString()
    }, { onConflict: 'fecha' })

    setGuardando(false)
    cargarDia(fecha)
    const {data} = await supabase.from('arqueos_caja').select('*').order('fecha', { ascending:false }).limit(10)
    setHistorial(data ?? [])
  }

  const fis_efectivo = +fisEfectivo || 0
  const fis_transfer = +fisTransfer || 0
  const fis_tarjeta  = arqueo ? arqueo.sysTarjeta + arqueo.cajaTarjeta : 0
  const fis_total    = fis_efectivo + fis_tarjeta + fis_transfer
  const efectivoSistema = arqueo ? arqueo.sysEfectivo + arqueo.cajaEfectivo : 0
  const transferSistema = arqueo ? arqueo.sysTransfer + arqueo.cajaTransfer : 0
  const diferencia = fis_total - (efectivoSistema + fis_tarjeta + transferSistema)

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      {/* Selector fecha */}
      <div className="flex items-center gap-3">
        <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
          className="border border-p-line rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-p-green bg-white shadow-sm"/>
        <button onClick={()=>cargarDia(fecha)} style={btnSm}>🔄 Actualizar</button>
        <button onClick={()=>setFecha(new Date().toISOString().slice(0,10))}
          className="text-sm text-p-green font-semibold hover:underline">Hoy</button>
      </div>

      {loading ? <p className="text-sm text-p-gray text-center py-10">Cargando…</p> : arqueo && (
        <>
          <div className="bg-white border border-p-line rounded-2xl shadow-sm overflow-hidden">
            <div className="bg-p-dark text-white px-6 py-4 flex justify-between items-center">
              <div>
                <h2 className="font-saira font-bold text-lg">Arqueo — {fecha.split('-').reverse().join('/')}</h2>
                {arqueo.estado==='cerrado' && <p className="text-[11px] text-p-green font-bold">✓ Cerrado</p>}
              </div>
              <div className="text-right">
                <p className="font-saira font-bold text-2xl text-p-green">{moneyARS(arqueo.totalGeneral)}</p>
                <p className="text-[11px] text-gray-300">total neto del día</p>
              </div>
            </div>

            <div className="p-6 flex flex-col gap-6">

              {/* ── BLANCO (comprobantes + ventas caja) ── */}
              <div>
                <p className="text-[11px] font-bold text-p-ink2 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full">⬜ FACTURADO</span>
                  <span>Comprobantes y ventas del día</span>
                </p>
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <p className="text-[10px] font-bold text-p-ink2 uppercase tracking-wider mb-2">📊 Sistema</p>
                    <div className="flex flex-col gap-1.5">
                      {[
                        { label:'Efectivo',        val: arqueo.sysEfectivo + arqueo.cajaEfectivo, icon:'💵' },
                        { label:'Tarjeta',         val: arqueo.sysTarjeta + arqueo.cajaTarjeta,   icon:'💳' },
                        { label:'Transferencia',   val: arqueo.sysTransfer + arqueo.cajaTransfer,  icon:'🏦' },
                        { label:'Cta. Corriente',  val: arqueo.sysCuentaCte + arqueo.cajaCuentaCte, icon:'📒' },
                      ].map(r => (
                        <div key={r.label} className="flex justify-between items-center py-1.5 border-b border-p-line2">
                          <span className="text-sm text-p-ink">{r.icon} {r.label}</span>
                          <span className="font-mono font-bold text-p-dark">{moneyARS(r.val)}</span>
                        </div>
                      ))}
                      <div className="flex justify-between items-center pt-1">
                        <span className="font-bold text-p-dark text-sm">TOTAL</span>
                        <span className="font-mono font-bold text-p-dark">{moneyARS(arqueo.sysTotal)}</span>
                      </div>
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-p-ink2 uppercase tracking-wider mb-2">🧾 Conteo físico</p>
                    <div className="flex flex-col gap-2">
                      <div>
                        <label className="text-xs text-p-ink2 mb-1 block">💵 Efectivo en caja</label>
                        <input type="number" value={fisEfectivo} onChange={e => setFisEfectivo(e.target.value)}
                          disabled={arqueo.estado==='cerrado'}
                          className="w-full border border-p-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-p-green disabled:bg-gray-50"/>
                      </div>
                      <div className="flex justify-between items-center py-1.5 border-b border-p-line2">
                        <span className="text-sm text-p-ink">💳 Tarjeta (= sistema)</span>
                        <span className="font-mono font-bold text-p-dark">{moneyARS(arqueo.sysTarjeta + arqueo.cajaTarjeta)}</span>
                      </div>
                      <div>
                        <label className="text-xs text-p-ink2 mb-1 block">🏦 Transferencias recibidas</label>
                        <input type="number" value={fisTransfer} onChange={e => setFisTransfer(e.target.value)}
                          disabled={arqueo.estado==='cerrado'}
                          className="w-full border border-p-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-p-green disabled:bg-gray-50"/>
                      </div>
                      <div className="flex justify-between items-center pt-1 border-t-2 border-p-line">
                        <span className="font-bold text-p-dark text-sm">TOTAL FÍSICO</span>
                        <span className="font-mono font-bold text-p-dark">{moneyARS(fis_total)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Diferencia */}
                <div className={`mt-3 rounded-xl p-3 text-center ${
                  diferencia === 0 ? 'bg-green-50 border border-green-200' :
                  diferencia > 0   ? 'bg-blue-50 border border-blue-200' :
                  'bg-red-50 border border-red-200'
                }`}>
                  <p className="text-xs font-semibold text-p-ink2 uppercase tracking-wider">Diferencia</p>
                  <p className={`font-saira font-black text-xl mt-0.5 ${
                    diferencia === 0 ? 'text-green-600' : diferencia > 0 ? 'text-blue-600' : 'text-red-600'
                  }`}>
                    {diferencia > 0 ? '+' : ''}{moneyARS(diferencia)}
                  </p>
                  <p className="text-xs text-p-ink2 mt-0.5">
                    {diferencia === 0 ? '✓ Cuadra' : diferencia > 0 ? 'Sobrante' : 'Faltante'}
                  </p>
                </div>
              </div>

              {/* ── CAJA 2 ── */}
              <div className="border-t border-p-line pt-4">
                {esPiamonte ? (
                  <>
                    <p className="text-[11px] font-bold text-p-ink2 uppercase tracking-wider mb-3 flex items-center gap-2">
                      <span className="bg-gray-800 text-white px-2 py-0.5 rounded-full">🛒 CAJA 2</span>
                      <span>Movimientos de caja</span>
                    </p>
                    <div className="flex flex-col gap-2">
                      <div className="flex justify-between items-center py-1.5 border-b border-p-line2">
                        <span className="text-sm text-p-ink">💰 Ventas</span>
                        <span className="font-mono font-bold text-green-600">{moneyARS(arqueo.caja2Ventas)}</span>
                      </div>
                      <div className="flex justify-between items-center py-1.5 border-b border-p-line2">
                        <span className="text-sm text-p-ink">🛒 Compras</span>
                        <span className="font-mono font-bold text-red-500">− {moneyARS(arqueo.caja2Compras)}</span>
                      </div>
                      <div className="flex justify-between items-center pt-1">
                        <span className="font-bold text-p-dark text-sm">NETO CAJA 2</span>
                        <span className={`font-mono font-bold ${arqueo.caja2Neto >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                          {moneyARS(arqueo.caja2Neto)}
                        </span>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-[11px] font-bold text-p-ink2 uppercase tracking-wider mb-3">🔧 Ajustes de caja</p>
                    <div className="flex justify-between items-center py-1.5">
                      <span className="text-sm text-p-ink">Movimientos varios</span>
                      <span className={`font-mono font-bold ${arqueo.caja2Neto >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                        {moneyARS(arqueo.caja2Neto)}
                      </span>
                    </div>
                  </>
                )}
              </div>

              {/* ── GASTOS ── */}
              <div className="border-t border-p-line pt-4">
                <p className="text-[11px] font-bold text-p-ink2 uppercase tracking-wider mb-3">💸 Gastos del día</p>
                <div className="flex flex-col gap-2">
                  {[
                    { label:'Efectivo',      val: arqueo.gastosEfectivo ?? 0, icon:'💵' },
                    { label:'Tarjeta',       val: arqueo.gastosTarjeta  ?? 0, icon:'💳' },
                    { label:'Transferencia', val: arqueo.gastosTransfer ?? 0, icon:'🏦' },
                  ].map(r => (
                    <div key={r.label} className="flex justify-between items-center py-1.5 border-b border-p-line2">
                      <span className="text-sm text-p-ink">{r.icon} {r.label}</span>
                      <span className="font-mono font-bold text-red-500">− {moneyARS(r.val)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between items-center pt-1">
                    <span className="font-bold text-p-dark text-sm">TOTAL GASTOS</span>
                    <span className="font-mono font-bold text-red-500">− {moneyARS(arqueo.gastosTotal ?? 0)}</span>
                  </div>
                </div>
              </div>

              {/* ── TOTAL GENERAL ── */}
              <div className="border-t-2 border-p-line pt-4 flex justify-between items-center">
                <span className="font-saira font-bold text-p-ink text-lg">TOTAL GENERAL NETO</span>
                <span className="font-saira font-bold text-2xl text-p-green">{moneyARS(arqueo.totalGeneral)}</span>
              </div>

              {/* Notas + cerrar */}
              {arqueo.estado !== 'cerrado' && (
                <div className="flex flex-col gap-3">
                  <input value={notas} onChange={e => setNotas(e.target.value)}
                    placeholder="Observaciones del arqueo…"
                    className="w-full border border-p-line rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-p-green"/>
                  <button onClick={cerrarArqueo} disabled={guardando} style={{ ...btn, opacity: guardando ? .7 : 1 }}>
                    {guardando ? 'Cerrando…' : '🔒 Cerrar arqueo del día'}
                  </button>
                </div>
              )}
              {arqueo.estado === 'cerrado' && arqueo.notas && (
                <p className="text-sm text-p-ink2 bg-p-light rounded-lg px-3 py-2">{arqueo.notas}</p>
              )}
            </div>
          </div>

          {/* Historial */}
          {historial.length > 0 && (
            <div className="bg-white border border-p-line rounded-xl p-5 shadow-sm">
              <h3 className="font-saira font-bold text-p-ink mb-3">Historial de arqueos</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b-2 border-p-line">
                    <th className="text-left py-2 text-xs font-bold text-p-ink2 uppercase">Fecha</th>
                    <th className="text-right py-2 text-xs font-bold text-p-ink2 uppercase">Facturado</th>
                    <th className="text-right py-2 text-xs font-bold text-p-ink2 uppercase">Caja 2</th>
                    <th className="text-right py-2 text-xs font-bold text-p-ink2 uppercase">Diferencia</th>
                    <th className="text-center py-2 text-xs font-bold text-p-ink2 uppercase">Estado</th>
                  </tr></thead>
                  <tbody>
                    {historial.map(a => (
                      <tr key={a.id} className="border-b border-p-line2 cursor-pointer hover:bg-p-light"
                        onClick={() => setFecha(a.fecha)}>
                        <td className="py-2 font-mono text-xs">{a.fecha.split('-').reverse().join('/')}</td>
                        <td className="py-2 text-right font-mono">{moneyARS(a.sys_total)}</td>
                        <td className="py-2 text-right font-mono">{moneyARS(a.negro_neto ?? 0)}</td>
                        <td className={`py-2 text-right font-bold ${a.diferencia===0?'text-green-600':a.diferencia>0?'text-blue-600':'text-red-600'}`}>
                          {a.diferencia > 0 ? '+' : ''}{moneyARS(a.diferencia)}
                        </td>
                        <td className="py-2 text-center">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${a.estado==='cerrado'?'bg-green-100 text-green-700':'bg-amber-100 text-amber-700'}`}>
                            {a.estado}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
