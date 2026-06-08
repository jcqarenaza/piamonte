'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

export type CurMode = 'ARS' | 'blue' | 'oficial' | 'mep'

interface Cotiz { blue: number; oficial: number; mep: number; fecha: string }

// Hook global de cotización (exportado para usar en otros componentes)
let _cotiz: Cotiz | null = null
let _cur: CurMode = 'ARS'
const _listeners = new Set<() => void>()

export function useDolar() {
  const [cotiz, setCotiz] = useState<Cotiz | null>(_cotiz)
  const [cur, setCurState] = useState<CurMode>(_cur)
  const [manual, setManual] = useState(false)

  useEffect(() => {
    const notify = () => { setCotiz(_cotiz); setCurState(_cur) }
    _listeners.add(notify)
    return () => { _listeners.delete(notify) }
  }, [])

  const setCur = (m: CurMode) => { _cur = m; _listeners.forEach(fn => fn()) }

  const rate = () => {
    if (_cur === 'ARS' || !_cotiz) return 0
    return _cotiz[_cur as keyof Omit<Cotiz, 'fecha'>] ?? 0
  }

  const money = (n: number | null | undefined): string => {
    if (n == null) return '—'
    const r = rate()
    if (r > 0) return 'US$' + Math.round(n / r).toLocaleString('es-AR')
    return '$' + Math.round(n).toLocaleString('es-AR')
  }

  const moneyARS = (n: number | null | undefined): string =>
    n == null ? '—' : '$' + Math.round(n).toLocaleString('es-AR')

  const usdStr = (n: number, mode: CurMode): string => {
    if (!_cotiz) return '—'
    const r = _cotiz[mode as keyof Omit<Cotiz, 'fecha'>]
    return r ? 'US$' + Math.round(n / r).toLocaleString('es-AR') : '—'
  }

  return { cotiz, cur, setCur, rate, money, moneyARS, usdStr, manual, setManual }
}

export function DolarBar() {
  const { cotiz, cur, setCur, setManual } = useDolar()
  const [loading, setLoading] = useState(false)
  const [showManual, setShowManual] = useState(false)
  const [mBlue, setMBlue] = useState('')
  const [mOf, setMOf] = useState('')
  const [mMep, setMMep] = useState('')
  const supabase = createClient()

  const fetch = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('cotizaciones').select('blue,oficial,mep,fecha').order('fecha', { ascending: false }).limit(1).maybeSingle()
    if (data) { _cotiz = data; _listeners.forEach(fn => fn()) }
    setLoading(false)
  }, [supabase])

  useEffect(() => { fetch() }, [fetch])

  const fmt = (n: number | null) => n ? '$' + Math.round(n).toLocaleString('es-AR') : '—'

  const saveManual = () => {
    _cotiz = { blue: +mBlue || 0, oficial: +mOf || 0, mep: +mMep || 0, fecha: new Date().toISOString().slice(0,10) }
    _listeners.forEach(fn => fn())
    setManual(true); setShowManual(false)
  }

  return (
    <div className="bg-p-light border-b border-p-line">
      <div className="max-w-screen-xl mx-auto px-4 py-1.5 flex items-center gap-4 flex-wrap text-xs overflow-x-auto scrollbar-none">
        <span className="font-saira font-bold text-p-dark text-[11px] uppercase tracking-wider shrink-0">💵 Dólar</span>
        <span className="text-p-ink2 shrink-0">Blue <b className="font-mono text-p-ink">{fmt(cotiz?.blue ?? null)}</b></span>
        <span className="text-p-ink2 shrink-0">Oficial <b className="font-mono text-p-ink">{fmt(cotiz?.oficial ?? null)}</b></span>
        <span className="text-p-ink2 shrink-0">MEP <b className="font-mono text-p-ink">{fmt(cotiz?.mep ?? null)}</b></span>
        {cotiz?.fecha && <span className="font-mono text-p-gray shrink-0">{cotiz.fecha}</span>}
        <button onClick={fetch} disabled={loading} className="text-p-dark hover:text-p-darker shrink-0" title="Actualizar">↻</button>
        <div className="ml-auto flex items-center gap-2 shrink-0">
          <label className="text-p-ink2 flex items-center gap-1.5">
            Precios en
            <select value={cur} onChange={e => setCur(e.target.value as CurMode)}
              className="border border-p-line rounded px-2 py-0.5 text-xs text-p-ink bg-white focus:outline-none">
              <option value="ARS">Pesos $</option>
              <option value="blue">USD Blue</option>
              <option value="oficial">USD Oficial</option>
              <option value="mep">USD MEP</option>
            </select>
          </label>
          <button onClick={() => setShowManual(!showManual)} className="text-p-ink2 hover:text-p-ink border border-p-line rounded px-2 py-0.5 bg-white text-xs">✎ fijar</button>
        </div>
      </div>
      {showManual && (
        <div className="bg-amber-50 border-t border-amber-200 px-4 py-2 flex items-center gap-3 flex-wrap text-xs">
          <span className="text-amber-700 font-semibold">Fijar manualmente:</span>
          {[['Blue', mBlue, setMBlue], ['Oficial', mOf, setMOf], ['MEP', mMep, setMMep]].map(([l, v, s]) => (
            <label key={l as string} className="flex items-center gap-1 text-p-ink2">
              {l as string} <input type="number" value={v as string} onChange={e => (s as (v:string)=>void)(e.target.value)}
                className="w-20 border border-p-line rounded px-2 py-0.5 text-xs font-mono" />
            </label>
          ))}
          <button onClick={saveManual} className="bg-p-green text-white text-xs font-bold px-3 py-1 rounded">Guardar</button>
          <button onClick={() => setShowManual(false)} className="text-p-gray text-xs">Cancelar</button>
        </div>
      )}
    </div>
  )
}
