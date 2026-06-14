'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { moneyARS } from '@/lib/utils/format'

const btn   = { background:'#00A550',color:'#fff',border:'none',borderRadius:10,padding:'10px 20px',fontWeight:700,fontSize:14,cursor:'pointer' } as const
const btnSm = { ...btn, padding:'6px 14px', fontSize:12 } as const

export default function ArqueoClient() {
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
    // Totales del sistema para esa fecha
    const [ventas, comprobantes, tarjPend, arqueoExist] = await Promise.all([
      supabase.from('ventas').select('precio_venta,forma_pago').eq('fecha', f),
      supabase.from('comprobantes').select('total,pagos').gte('fecha', f).lt('fecha', new Date(new Date(f).getTime()+86400000).toISOString().slice(0,10)),
      supabase.from('acreditaciones_tarjeta').select('monto_neto').eq('fecha_cobro', f).eq('estado','pendiente'),
      supabase.from('arqueos_caja').select('*').eq('fecha', f).maybeSingle()
    ])

    // Calcular por forma de pago
    let sysEfectivo = 0, sysTarjeta = 0, sysTransfer = 0
    for(const c of comprobantes.data ?? []) {
      const pagos = Array.isArray(c.pagos) ? c.pagos : []
      for(const p of pagos) {
        const m = +p.monto||0
        if(p.metodo==='Efectivo') sysEfectivo += m
        else if(p.metodo==='Tarjeta') sysTarjeta += m
        else if(['Transferencia','Depósito'].includes(p.metodo)) sysTransfer += m
        else sysEfectivo += m  // default
      }
    }

    const sysTotal = sysEfectivo + sysTarjeta + sysTransfer
    const tarjPendTotal = (tarjPend.data??[]).reduce((a,t)=>a+t.monto_neto,0)

    setArqueo({
      fecha: f, sysEfectivo, sysTarjeta, sysTransfer, sysTotal, tarjPendTotal,
      ...(arqueoExist.data||{})
    })

    if(arqueoExist.data) {
      setFisEfectivo(arqueoExist.data.fis_efectivo?.toString()||'')
      setFisTransfer(arqueoExist.data.fis_transfer?.toString()||'')
      setNotas(arqueoExist.data.notas||'')
    } else {
      setFisEfectivo(''); setFisTransfer(''); setNotas('')
    }
    setLoading(false)
  }

  useEffect(() => {
    cargarDia(fecha)
    supabase.from('arqueos_caja').select('*').order('fecha',{ascending:false}).limit(10)
      .then(({data})=>setHistorial(data??[]))
  }, [fecha, supabase])

  async function cerrarArqueo() {
    if (!arqueo) return
    setGuardando(true)
    const fis_efectivo = +fisEfectivo||0
    const fis_tarjeta  = arqueo.sysTarjeta   // tarjeta viene de sistema
    const fis_transfer = +fisTransfer||0
    const fis_total    = fis_efectivo + fis_tarjeta + fis_transfer
    const diferencia   = fis_total - arqueo.sysTotal

    await supabase.from('arqueos_caja').upsert({
      fecha: arqueo.fecha,
      sys_efectivo: arqueo.sysEfectivo, sys_tarjeta: arqueo.sysTarjeta,
      sys_transfer: arqueo.sysTransfer, sys_total: arqueo.sysTotal,
      fis_efectivo, fis_tarjeta, fis_transfer, fis_total,
      diferencia, estado:'cerrado', notas: notas||null,
      cerrado_at: new Date().toISOString()
    }, { onConflict:'fecha' })

    setGuardando(false)
    cargarDia(fecha)
    const {data} = await supabase.from('arqueos_caja').select('*').order('fecha',{ascending:false}).limit(10)
    setHistorial(data??[])
  }

  const fis_efectivo = +fisEfectivo||0
  const fis_transfer = +fisTransfer||0
  const fis_total    = fis_efectivo + (arqueo?.sysTarjeta||0) + fis_transfer
  const diferencia   = fis_total - (arqueo?.sysTotal||0)

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      {/* Selector fecha */}
      <div className="flex items-center gap-3">
        <input type="date" value={fecha} onChange={e=>{setFecha(e.target.value)}}
          className="border border-p-line rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-p-green bg-white shadow-sm"/>
        <button onClick={()=>cargarDia(fecha)} style={btnSm}>🔄 Actualizar</button>
        <button onClick={()=>setFecha(new Date().toISOString().slice(0,10))}
          className="text-sm text-p-green font-semibold hover:underline">Hoy</button>
      </div>

      {loading ? <p className="text-sm text-p-gray text-center py-10">Cargando…</p> : arqueo && (
        <>
          {/* Panel principal */}
          <div className="bg-white border border-p-line rounded-2xl shadow-sm overflow-hidden">
            <div className="bg-p-dark text-white px-6 py-4 flex justify-between items-center">
              <div>
                <h2 className="font-saira font-bold text-lg">Arqueo — {fecha.split('-').reverse().join('/')}</h2>
                {arqueo.estado==='cerrado'&&<p className="text-[11px] text-p-green font-bold">✓ Cerrado</p>}
              </div>
              <p className="font-saira font-bold text-2xl text-p-green">{moneyARS(arqueo.sysTotal)}</p>
            </div>

            <div className="p-6">
              <div className="grid grid-cols-2 gap-6">
                {/* Sistema */}
                <div>
                  <p className="text-[11px] font-bold text-p-ink2 uppercase tracking-wider mb-3">📊 Sistema (automático)</p>
                  <div className="flex flex-col gap-2">
                    {[
                      {label:'Efectivo',   val:arqueo.sysEfectivo, icon:'💵'},
                      {label:'Tarjeta',    val:arqueo.sysTarjeta,  icon:'💳'},
                      {label:'Transferencia', val:arqueo.sysTransfer, icon:'🏦'},
                    ].map(r=>(
                      <div key={r.label} className="flex justify-between items-center py-2 border-b border-p-line2">
                        <span className="text-sm text-p-ink">{r.icon} {r.label}</span>
                        <span className="font-mono font-bold text-p-dark">{moneyARS(r.val)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between items-center pt-1">
                      <span className="font-bold text-p-dark">TOTAL</span>
                      <span className="font-mono font-bold text-lg text-p-dark">{moneyARS(arqueo.sysTotal)}</span>
                    </div>
                  </div>
                </div>

                {/* Físico */}
                <div>
                  <p className="text-[11px] font-bold text-p-ink2 uppercase tracking-wider mb-3">🧾 Conteo físico</p>
                  <div className="flex flex-col gap-2">
                    <div>
                      <label className="text-xs text-p-ink2 mb-1 block">💵 Efectivo en caja</label>
                      <input type="number" value={fisEfectivo} onChange={e=>setFisEfectivo(e.target.value)}
                        disabled={arqueo.estado==='cerrado'}
                        className="w-full border border-p-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-p-green disabled:bg-gray-50"/>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-p-line2">
                      <span className="text-sm text-p-ink">💳 Tarjeta (= sistema)</span>
                      <span className="font-mono font-bold text-p-dark">{moneyARS(arqueo.sysTarjeta)}</span>
                    </div>
                    <div>
                      <label className="text-xs text-p-ink2 mb-1 block">🏦 Transferencias recibidas</label>
                      <input type="number" value={fisTransfer} onChange={e=>setFisTransfer(e.target.value)}
                        disabled={arqueo.estado==='cerrado'}
                        className="w-full border border-p-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-p-green disabled:bg-gray-50"/>
                    </div>
                    <div className="flex justify-between items-center pt-1 border-t-2 border-p-line">
                      <span className="font-bold text-p-dark">TOTAL</span>
                      <span className="font-mono font-bold text-lg text-p-dark">{moneyARS(fis_total)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Diferencia */}
              <div className={`mt-4 rounded-xl p-4 text-center ${
                diferencia === 0 ? 'bg-green-50 border border-green-200' :
                diferencia > 0  ? 'bg-blue-50 border border-blue-200' :
                'bg-red-50 border border-red-200'
              }`}>
                <p className="text-xs font-semibold text-p-ink2 uppercase tracking-wider">Diferencia</p>
                <p className={`font-saira font-black text-2xl mt-1 ${
                  diferencia === 0?'text-green-600':diferencia>0?'text-blue-600':'text-red-600'
                }`}>
                  {diferencia > 0 ? '+' : ''}{moneyARS(diferencia)}
                </p>
                <p className="text-xs text-p-ink2 mt-1">
                  {diferencia === 0 ? '✓ Cuadra perfectamente' :
                   diferencia > 0  ? 'Sobrante' : 'Faltante'}
                </p>
              </div>

              {/* Notas + botón cerrar */}
              {arqueo.estado !== 'cerrado' && (
                <div className="mt-4 flex flex-col gap-3">
                  <input value={notas} onChange={e=>setNotas(e.target.value)}
                    placeholder="Observaciones del arqueo…"
                    className="w-full border border-p-line rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-p-green"/>
                  <button onClick={cerrarArqueo} disabled={guardando} style={{...btn,opacity:guardando?.7:1}}>
                    {guardando?'Cerrando…':'🔒 Cerrar arqueo del día'}
                  </button>
                </div>
              )}
              {arqueo.estado === 'cerrado' && arqueo.notas && (
                <p className="mt-3 text-sm text-p-ink2 bg-p-light rounded-lg px-3 py-2">{arqueo.notas}</p>
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
                    <th className="text-right py-2 text-xs font-bold text-p-ink2 uppercase">Sistema</th>
                    <th className="text-right py-2 text-xs font-bold text-p-ink2 uppercase">Físico</th>
                    <th className="text-right py-2 text-xs font-bold text-p-ink2 uppercase">Diferencia</th>
                    <th className="text-center py-2 text-xs font-bold text-p-ink2 uppercase">Estado</th>
                  </tr></thead>
                  <tbody>
                    {historial.map(a=>(
                      <tr key={a.id} className="border-b border-p-line2 cursor-pointer hover:bg-p-light"
                        onClick={()=>setFecha(a.fecha)}>
                        <td className="py-2 font-mono text-xs">{a.fecha.split('-').reverse().join('/')}</td>
                        <td className="py-2 text-right font-mono">{moneyARS(a.sys_total)}</td>
                        <td className="py-2 text-right font-mono">{moneyARS(a.fis_total)}</td>
                        <td className={`py-2 text-right font-bold ${a.diferencia===0?'text-green-600':a.diferencia>0?'text-blue-600':'text-red-600'}`}>
                          {a.diferencia>0?'+':''}{moneyARS(a.diferencia)}
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
