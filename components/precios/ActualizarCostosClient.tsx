'use client'
import { useState, useEffect } from 'react'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/client'
import { moneyARS } from '@/lib/utils/format'

/**
 * ACTUALIZAR COSTOS — sube la lista de Mario (Pilkington / Euroglass) de Malatesta o Gamma.
 * Solo toca catalogo.costo_neto / precio_lista (guarda el anterior). NO toca precios_aseguradora.
 * Costo = lista × (1 − descuento). Primero muestra el cambio, recién después se confirma.
 */

interface Item { codigo: string; descripcion: string; lista: number; costo: number; neto?: boolean }
interface Cambio { codigo: string; descripcion: string; viejo: number; nuevo: number; pct: number }
interface Diff { iguales: number; suben: Cambio[]; bajan: Cambio[]; nuevos: Item[]; noVienen: number; total: number; aEnviar: Item[] }

const CODIGO_RE = /^\d{6}[A-Z]{4,5}$/
const PROVS = ['MALATESTA', 'GAMMA'] as const
const LOTE = 200   // lotes chicos: el catálogo tiene muchos índices y un lote grande da statement timeout

// Lista de Gamma (hojas GENERAL / XYG / ORIGINALES): código, nombre, marca, precio en col D.
// GENERAL viene "S/DCTO" (se le aplica el descuento); XYG y ORIGINALES ya vienen netos.
async function leerGamma(wb: XLSX.WorkBook): Promise<Item[]> {
  const seen = new Set<string>()
  const out: Item[] = []
  for (const hoja of ['GENERAL', 'XYG', 'ORIGINALES']) {
    const ws = wb.Sheets[hoja]
    if (!ws) continue
    const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })
    for (const r of rows) {
      const cod = String(r[0] ?? '').trim().toUpperCase()
      if (!CODIGO_RE.test(cod) || seen.has(cod)) continue
      const precio = typeof r[3] === 'number' ? r[3] : 0
      if (precio <= 0) continue
      seen.add(cod)
      out.push({ codigo: cod, descripcion: String(r[1] ?? '').trim(), lista: precio, costo: 0, neto: hoja !== 'GENERAL' })
    }
  }
  return out
}

async function leerLista(file: File): Promise<Item[]> {
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellFormula: false, cellNF: false })
  if (wb.Sheets['GENERAL']) return leerGamma(wb)
  const ws = wb.Sheets['Lista'] ?? wb.Sheets[wb.SheetNames[0]]
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })
  const seen = new Set<string>()
  const out: Item[] = []
  for (const r of rows) {
    const cod = String(r[0] ?? '').trim().toUpperCase()
    if (!CODIGO_RE.test(cod) || seen.has(cod)) continue
    const lista = typeof r[4] === 'number' ? r[4] : 0
    if (lista <= 0) continue
    seen.add(cod)
    out.push({ codigo: cod, descripcion: String(r[1] ?? '').trim(), lista, costo: 0 })
  }
  return out
}

export default function ActualizarCostosClient() {
  const supabase = createClient()
  const [prov, setProv] = useState<(typeof PROVS)[number]>('MALATESTA')
  const [desc, setDesc] = useState('53')
  const [flete, setFlete] = useState('0')   // Malatesta: costo = lista × 0,47 (sin flete, como está cargado). Gamma: 1,5%
  const [descDefault, setDescDefault] = useState<Record<string, string>>({})
  const [file, setFile] = useState<File | null>(null)
  const [diff, setDiff] = useState<Diff | null>(null)
  const [crearNuevos, setCrearNuevos] = useState(false)
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null)
  const [ver, setVer] = useState<'suben' | 'bajan' | 'nuevos' | 'raros'>('raros')

  useEffect(() => {
    supabase.from('listas_precio').select('proveedor,desc_pct,tipo').eq('tipo', 'catalogo').then(({ data }) => {
      const m: Record<string, string> = {}
      for (const l of data ?? []) m[(l as any).proveedor] = String(Math.round(Number((l as any).desc_pct) * 10000) / 100)
      setDescDefault(m)
      if (m.MALATESTA) setDesc(m.MALATESTA)
    })
  }, [supabase])

  function cambiarProv(p: (typeof PROVS)[number]) {
    setProv(p); setDiff(null); setMsg(null)
    if (descDefault[p]) setDesc(descDefault[p])
    setFlete(p === 'GAMMA' ? '1.5' : '0')
  }

  async function analizar() {
    if (!file) return
    const d = parseFloat(desc.replace(',', '.')) / 100
    if (isNaN(d) || d < 0 || d >= 1) { setMsg({ ok: false, t: 'Descuento inválido' }); return }
    setBusy('Leyendo el archivo…'); setMsg(null); setDiff(null)
    try {
      const fl = (parseFloat(flete.replace(',', '.')) || 0) / 100
      const items = (await leerLista(file)).map(i => ({ ...i, costo: Math.round(i.lista * (i.neto ? 1 : 1 - d) * (1 + fl)) }))
      if (!items.length) throw new Error('No encontré códigos (formato 6 números + 4 letras) con precio en la columna E')
      setBusy('Comparando con el catálogo…')
      const actual = new Map<string, number>()
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase.from('catalogo').select('codigo,costo_neto').eq('proveedor', prov).range(from, from + 999)
        if (error) throw new Error(error.message)
        for (const r of data ?? []) actual.set(String((r as any).codigo).toUpperCase(), Number((r as any).costo_neto) || 0)
        if (!data || data.length < 1000) break
      }
      const suben: Cambio[] = [], bajan: Cambio[] = [], nuevos: Item[] = []
      let iguales = 0
      const enArchivo = new Set<string>()
      const aEnviar: Item[] = []
      for (const it of items) {
        enArchivo.add(it.codigo)
        if (!actual.has(it.codigo)) { nuevos.push(it); continue }
        const viejo = actual.get(it.codigo)!
        if (viejo === it.costo) { iguales++; continue }
        const c = { codigo: it.codigo, descripcion: it.descripcion, viejo, nuevo: it.costo, pct: viejo > 0 ? it.costo / viejo - 1 : 1 }
        ;(c.nuevo > c.viejo ? suben : bajan).push(c)
        aEnviar.push(it)
      }
      let noVienen = 0
      actual.forEach((_, k) => { if (!enArchivo.has(k)) noVienen++ })
      suben.sort((a, b) => b.pct - a.pct); bajan.sort((a, b) => a.pct - b.pct)
      setDiff({ iguales, suben, bajan, nuevos, noVienen, total: items.length, aEnviar })
      setVer(suben.length + bajan.length ? 'raros' : 'nuevos')
    } catch (e: any) {
      setMsg({ ok: false, t: e.message ?? String(e) })
    }
    setBusy('')
  }

  async function aplicar() {
    if (!diff) return
    const lista = [...diff.aEnviar, ...(crearNuevos ? diff.nuevos : [])]
    if (!lista.length) return
    if (!confirm(`Se van a actualizar ${diff.aEnviar.length} costos de ${prov}` + (crearNuevos ? ` y crear ${diff.nuevos.length} códigos nuevos` : '') + '. Los precios de aseguradora NO se tocan. ¿Confirmás?')) return
    setMsg(null)
    let act = 0, nue = 0
    try {
      for (let i = 0; i < lista.length; i += LOTE) {
        setBusy(`Aplicando… ${Math.min(i + LOTE, lista.length)} / ${lista.length}`)
        const { data, error } = await supabase.rpc('actualizar_costos_catalogo', { p_proveedor: prov, p_items: lista.slice(i, i + LOTE), p_crear_nuevos: crearNuevos })
        if (error) throw new Error(error.message)
        act += (data as any)?.actualizados ?? 0; nue += (data as any)?.nuevos ?? 0
      }
      setMsg({ ok: true, t: `✅ ${act} costos actualizados` + (crearNuevos ? ` · ${nue} códigos nuevos` : '') + '. Los precios de venta de aseguradora quedaron como estaban.' })
      setDiff(null); setFile(null)
    } catch (e: any) {
      setMsg({ ok: false, t: `Error: ${e.message ?? e}. Si dice que no existe la función, falta correr el SQL 2026-10-29_actualizar_costos.sql.` })
    }
    setBusy('')
  }

  const raros = diff ? [...diff.suben, ...diff.bajan].filter(c => Math.abs(c.pct) > 0.4).sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct)) : []
  const filas: Cambio[] = !diff ? [] : ver === 'suben' ? diff.suben : ver === 'bajan' ? diff.bajan : ver === 'raros' ? raros : []

  const Card = ({ n, l, c, k }: { n: number; l: string; c?: string; k?: typeof ver }) => (
    <button onClick={() => k && setVer(k)} className="bg-white border border-p-line rounded-lg px-4 py-2 text-left" style={{ cursor: k ? 'pointer' : 'default', outline: k && ver === k ? '2px solid #00A550' : 'none' }}>
      <div className="font-saira font-bold text-xl" style={{ color: c }}>{n.toLocaleString('es-AR')}</div>
      <div className="text-[11px] text-p-ink2">{l}</div>
    </button>
  )

  return (
    <div style={{ maxWidth: 900 }}>
      <p className="text-sm text-p-ink2 mb-3">Subí la lista que te pasa Mario (Pilkington / Euroglass). Calcula el <b>costo = lista × (1 − descuento)</b> y actualiza <b>solo el costo</b> del catálogo. <b>No cambia los precios de aseguradora.</b> Antes de aplicar ves todo lo que cambia.</p>

      <div className="flex flex-wrap gap-3 items-end mb-3">
        <div>
          <div className="text-[11px] text-p-ink2 mb-1">Proveedor</div>
          <div className="flex">{PROVS.map(p => (
            <button key={p} onClick={() => cambiarProv(p)} style={{ padding: '6px 14px', fontWeight: 700, fontSize: 12, border: '1px solid #d1d5db', background: prov === p ? '#00A550' : '#fff', color: prov === p ? '#fff' : '#374151', cursor: 'pointer' }}>{p}</button>
          ))}</div>
        </div>
        <div>
          <div className="text-[11px] text-p-ink2 mb-1">Descuento sobre la lista (%)</div>
          <input value={desc} onChange={e => { setDesc(e.target.value); setDiff(null) }} className="border border-p-line rounded px-2 py-1 text-sm w-24" />
        </div>
        <div>
          <div className="text-[11px] text-p-ink2 mb-1">Flete (%)</div>
          <input value={flete} onChange={e => { setFlete(e.target.value); setDiff(null) }} className="border border-p-line rounded px-2 py-1 text-sm w-16" />
        </div>
        <div>
          <div className="text-[11px] text-p-ink2 mb-1">Archivo (.xlsx)</div>
          <input type="file" accept=".xlsx,.xls" onChange={e => { setFile(e.target.files?.[0] ?? null); setDiff(null); setMsg(null) }} className="text-xs" />
        </div>
        <button onClick={analizar} disabled={!file || !!busy} className="px-4 py-1.5 rounded text-white text-sm font-bold" style={{ background: !file || busy ? '#9ca3af' : '#1e40af', cursor: !file || busy ? 'default' : 'pointer' }}>🔍 Ver qué cambia</button>
      </div>
      <p className="text-[11px] text-p-gray mb-3">Malatesta: 53% de descuento, sin flete (así están cargados hoy). Gamma: 48% + 1,5% de flete sobre la hoja GENERAL; las hojas XYG y ORIGINALES ya vienen netas (solo suman flete). Herramientas, pegamentos y films no se importan.</p>

      {busy && <p className="text-sm text-p-ink2 mb-3">⏳ {busy}</p>}
      {msg && <p className="text-sm mb-3 px-3 py-2 rounded" style={{ background: msg.ok ? '#dcfce7' : '#fee2e2', color: msg.ok ? '#166534' : '#991b1b' }}>{msg.t}</p>}

      {diff && <>
        <div className="flex flex-wrap gap-2 mb-3">
          <Card n={diff.total} l="en el archivo" />
          <Card n={diff.iguales} l="sin cambios" />
          <Card n={diff.suben.length} l="suben" c="#b91c1c" k="suben" />
          <Card n={diff.bajan.length} l="bajan" c="#166534" k="bajan" />
          <Card n={diff.nuevos.length} l="códigos nuevos" c="#1e40af" k="nuevos" />
          <Card n={raros.length} l="variación mayor a 40% (revisar)" c="#b45309" k="raros" />
          <Card n={diff.noVienen} l="del catálogo que no vienen (no se tocan)" />
        </div>

        <div className="bg-white border border-p-line rounded-lg overflow-hidden mb-3">
          <table className="w-full text-xs">
            <thead><tr className="bg-p-bg text-p-ink2"><th className="text-left px-2 py-1">Código</th><th className="text-left px-2 py-1">Descripción</th><th className="text-right px-2 py-1">Costo actual</th><th className="text-right px-2 py-1">Costo nuevo</th><th className="text-right px-2 py-1">Var.</th></tr></thead>
            <tbody>
              {ver === 'nuevos'
                ? diff.nuevos.slice(0, 60).map(n => (<tr key={n.codigo} className="border-t border-p-line"><td className="px-2 py-1 font-mono">{n.codigo}</td><td className="px-2 py-1">{n.descripcion}</td><td className="px-2 py-1 text-right text-p-gray">—</td><td className="px-2 py-1 text-right font-mono">{moneyARS(n.costo)}</td><td className="px-2 py-1 text-right text-p-gray">nuevo</td></tr>))
                : filas.slice(0, 60).map(c => (<tr key={c.codigo} className="border-t border-p-line"><td className="px-2 py-1 font-mono">{c.codigo}</td><td className="px-2 py-1">{c.descripcion}</td><td className="px-2 py-1 text-right font-mono">{moneyARS(c.viejo)}</td><td className="px-2 py-1 text-right font-mono">{moneyARS(c.nuevo)}</td><td className="px-2 py-1 text-right font-semibold" style={{ color: c.pct > 0 ? '#b91c1c' : '#166534' }}>{c.pct > 0 ? '+' : ''}{(c.pct * 100).toFixed(1)}%</td></tr>))}
              {((ver === 'nuevos' ? diff.nuevos.length : filas.length) === 0) && <tr><td colSpan={5} className="px-2 py-3 text-center text-p-gray">Nada para mostrar acá</td></tr>}
            </tbody>
          </table>
          {(ver === 'nuevos' ? diff.nuevos.length : filas.length) > 60 && <p className="text-[11px] text-p-gray px-2 py-1">Mostrando los primeros 60.</p>}
        </div>

        <label className="flex items-center gap-2 text-sm mb-3">
          <input type="checkbox" checked={crearNuevos} onChange={e => setCrearNuevos(e.target.checked)} />
          También crear los {diff.nuevos.length.toLocaleString('es-AR')} códigos nuevos en el catálogo de {prov}
        </label>
        <button onClick={aplicar} disabled={!!busy || (diff.aEnviar.length === 0 && !(crearNuevos && diff.nuevos.length))} className="px-5 py-2 rounded text-white font-bold text-sm" style={{ background: busy ? '#9ca3af' : '#00A550', cursor: busy ? 'default' : 'pointer' }}>
          ✅ Aplicar {diff.aEnviar.length.toLocaleString('es-AR')} cambios de costo
        </button>
      </>}
    </div>
  )
}
