'use client'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { moneyARS } from '@/lib/utils/format'

/**
 * COMPRAS POR PROVEEDOR Y MES — proveedores en filas, meses en columnas.
 * Facturas suman, notas de crédito (tipo 'nc') restan. Mismo criterio que "Compras de stock" del Resultado.
 * Tocá un monto para ver los comprobantes de ese proveedor en ese mes.
 */
interface Row { id: string; fecha: string; tipo: string; letra: string | null; punto_venta: string | null; numero: string | null; proveedor_nombre: string | null; neto: number | null; total: number | null }

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const mesLabel = (k: string) => `${MESES[Number(k.slice(5, 7)) - 1]} ${k.slice(2, 4)}`

export default function ComprasPorProveedor() {
  const supabase = createClient()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [meses, setMeses] = useState(12)
  const [base, setBase] = useState<'neto' | 'total'>('neto')
  const [sel, setSel] = useState<{ prov: string; mes: string | null } | null>(null)

  useEffect(() => {
    let vivo = true
    ;(async () => {
      setLoading(true); setError('')
      const hoy = new Date()
      const desde = new Date(hoy.getFullYear(), hoy.getMonth() - (meses - 1), 1).toISOString().slice(0, 10)
      const out: Row[] = []
      for (let from = 0; ; from += 1000) {   // la API corta en 1000 filas: se pagina
        const { data, error } = await supabase.from('comprobantes_compra')
          .select('id,fecha,tipo,letra,punto_venta,numero,proveedor_nombre,neto,total')
          .gte('fecha', desde).order('fecha', { ascending: false }).range(from, from + 999)
        if (error) { if (vivo) { setError(error.message); setLoading(false) } return }
        out.push(...((data ?? []) as Row[]))
        if (!data || data.length < 1000) break
      }
      if (vivo) { setRows(out); setSel(null); setLoading(false) }
    })()
    return () => { vivo = false }
  }, [meses, supabase])

  const monto = (r: Row) => (Number(base === 'neto' ? r.neto : r.total) || 0) * (r.tipo === 'nc' ? -1 : 1)

  const { cols, provs, celdas, totProv, totMes, totalGral } = useMemo(() => {
    const hoy = new Date()
    const cols: string[] = []
    for (let i = meses - 1; i >= 0; i--) cols.push(new Date(hoy.getFullYear(), hoy.getMonth() - i, 1).toISOString().slice(0, 7))
    const celdas = new Map<string, number>(), totProv = new Map<string, number>(), totMes = new Map<string, number>()
    let totalGral = 0
    for (const r of rows) {
      const p = (r.proveedor_nombre ?? '').trim() || '(sin proveedor)'
      const m = r.fecha.slice(0, 7)
      const v = monto(r)
      celdas.set(p + '|' + m, (celdas.get(p + '|' + m) ?? 0) + v)
      totProv.set(p, (totProv.get(p) ?? 0) + v)
      totMes.set(m, (totMes.get(m) ?? 0) + v)
      totalGral += v
    }
    const provs = [...totProv.keys()].sort((a, b) => (totProv.get(b) ?? 0) - (totProv.get(a) ?? 0))
    return { cols, provs, celdas, totProv, totMes, totalGral }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, meses, base])

  const detalle = useMemo(() => !sel ? [] : rows.filter(r =>
    ((r.proveedor_nombre ?? '').trim() || '(sin proveedor)') === sel.prov && (!sel.mes || r.fecha.slice(0, 7) === sel.mes)), [rows, sel])

  const btn = (on: boolean) => ({ background: on ? '#00A550' : '#fff', color: on ? '#fff' : '#4A6655', border: `1.5px solid ${on ? '#00A550' : '#C2DDD0'}`, borderRadius: 8, padding: '6px 14px', fontWeight: 700, fontSize: 12, cursor: 'pointer' } as const)
  const num = (v: number | undefined) => v ? moneyARS(v) : <span className="text-p-gray">—</span>

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2 items-center">
        {[6, 12].map(n => <button key={n} onClick={() => setMeses(n)} style={btn(meses === n)}>Últimos {n} meses</button>)}
        <span className="w-2" />
        <button onClick={() => setBase('neto')} style={btn(base === 'neto')}>Neto (sin IVA)</button>
        <button onClick={() => setBase('total')} style={btn(base === 'total')}>Total con IVA</button>
      </div>
      <p className="text-xs text-p-ink2">Facturas menos notas de crédito, por proveedor y mes. Tocá un monto para ver los comprobantes; tocá el nombre para ver todos los del proveedor.</p>

      {loading ? <p className="text-center text-p-ink2 py-8">Cargando…</p>
        : error ? <p className="text-sm px-3 py-2 rounded" style={{ background: '#fee2e2', color: '#991b1b' }}>Error: {error}</p>
        : provs.length === 0 ? <p className="text-center text-p-ink2 py-8">Sin compras en el período.</p>
        : (
          <div className="bg-white border border-p-line rounded-xl shadow-sm overflow-x-auto">
            <table className="w-full text-xs" style={{ minWidth: 160 + cols.length * 92 }}>
              <thead>
                <tr className="bg-p-bg text-p-ink2">
                  <th className="text-left px-2 py-2 sticky left-0 bg-p-bg">Proveedor</th>
                  {cols.map(c => <th key={c} className="text-right px-2 py-2">{mesLabel(c)}</th>)}
                  <th className="text-right px-2 py-2">Total</th>
                </tr>
              </thead>
              <tbody>
                {provs.map(p => (
                  <tr key={p} className="border-t border-p-line">
                    <td className="px-2 py-1.5 font-semibold sticky left-0 bg-white cursor-pointer hover:underline" onClick={() => setSel({ prov: p, mes: null })}>{p}</td>
                    {cols.map(c => {
                      const v = celdas.get(p + '|' + c)
                      const on = sel?.prov === p && sel.mes === c
                      return <td key={c} className="px-2 py-1.5 text-right font-mono" style={{ cursor: v ? 'pointer' : 'default', background: on ? '#dcfce7' : undefined }} onClick={() => v && setSel({ prov: p, mes: c })}>{num(v)}</td>
                    })}
                    <td className="px-2 py-1.5 text-right font-mono font-bold">{num(totProv.get(p))}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-p-line bg-p-bg font-bold">
                  <td className="px-2 py-2 sticky left-0 bg-p-bg">Total</td>
                  {cols.map(c => <td key={c} className="px-2 py-2 text-right font-mono">{num(totMes.get(c))}</td>)}
                  <td className="px-2 py-2 text-right font-mono">{moneyARS(totalGral)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

      {sel && (
        <div className="bg-white border border-p-line rounded-xl shadow-sm overflow-hidden">
          <div className="flex justify-between items-center px-3 py-2 bg-p-bg">
            <p className="font-saira font-bold text-sm text-p-ink">{sel.prov} · {sel.mes ? mesLabel(sel.mes) : `últimos ${meses} meses`} · {moneyARS(detalle.reduce((a, r) => a + monto(r), 0))}</p>
            <button onClick={() => setSel(null)} className="text-xs text-p-ink2">✕ cerrar</button>
          </div>
          <table className="w-full text-xs">
            <thead><tr className="text-p-ink2"><th className="text-left px-2 py-1">Fecha</th><th className="text-left px-2 py-1">Comprobante</th><th className="text-right px-2 py-1">Monto</th></tr></thead>
            <tbody>
              {detalle.map(r => (
                <tr key={r.id} className="border-t border-p-line">
                  <td className="px-2 py-1">{r.fecha.split('-').reverse().join('/')}</td>
                  <td className="px-2 py-1">{r.tipo === 'nc' && <span className="text-[9px] font-bold bg-amber-100 text-amber-700 px-1 rounded mr-1">NC</span>}{[r.letra, r.punto_venta, r.numero].filter(Boolean).join(' ') || '—'}</td>
                  <td className="px-2 py-1 text-right font-mono" style={{ color: r.tipo === 'nc' ? '#166534' : undefined }}>{moneyARS(monto(r))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
