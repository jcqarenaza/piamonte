'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

const SUPABASE_URL = 'https://hjzhatercccblhgaukgx.supabase.co'

const FORMATOS = [
  { id: 'gamma',        label: 'GAMMA — Catálogo (.xlsx)',               ext: '.xlsx' },
  { id: 'malatesta',   label: 'Malatesta — Catálogo (.xlsx)',            ext: '.xlsx' },
  { id: 'sekurit',     label: 'Sekurit — Lista disponible (.xlsx)',      ext: '.xlsx' },
  { id: 'promo_ar',    label: 'Promo Alta Rotación 68% (.xlsx)',         ext: '.xlsx' },
  { id: 'promo_bg',    label: 'Promo Bajo Giro 68% (.xlsx)',             ext: '.xlsx' },
  { id: 'oferta_gamma',label: 'Oferta Especial Mixta GAMMA (.pdf)',      ext: '.pdf'  },
  { id: 'mix_malat',   label: 'Oferta Mix Pilkington/Euroglass (.pdf)',  ext: '.pdf'  },
]

interface Lista { id: string; nombre: string; proveedor: string; tipo: string; desc_pct: number; flete_pct: number; iva_pct: number }
interface Result { ok: boolean; total?: number; importados?: number; error?: string }

function pct(n: number) { return (n * 100).toFixed(1) }

export default function ProveedoresClient({ token }: { token: string }) {
  const [listas, setListas]     = useState<Lista[]>([])
  const [editId, setEditId]     = useState<string | null>(null)
  const [editVals, setEditVals] = useState({ desc_pct: '', flete_pct: '', iva_pct: '' })
  const [saving, setSaving]     = useState(false)
  const [formato, setFormato]   = useState('gamma')
  const [file, setFile]         = useState<File | null>(null)
  const [loading, setLoading]   = useState(false)
  const [result, setResult]     = useState<Result | null>(null)
  const supabase = createClient()

  useEffect(() => {
    supabase.from('listas_precio').select('id,nombre,proveedor,tipo,desc_pct,flete_pct,iva_pct')
      .order('proveedor').then(({ data }) => setListas(data ?? []))
  }, [supabase])

  function startEdit(l: Lista) {
    setEditId(l.id)
    setEditVals({ desc_pct: pct(l.desc_pct), flete_pct: pct(l.flete_pct), iva_pct: pct(l.iva_pct) })
  }

  async function saveEdit(id: string) {
    setSaving(true)
    await supabase.from('listas_precio').update({
      desc_pct:  parseFloat(editVals.desc_pct)  / 100,
      flete_pct: parseFloat(editVals.flete_pct) / 100,
      iva_pct:   parseFloat(editVals.iva_pct)   / 100,
    }).eq('id', id)
    const { data } = await supabase.from('listas_precio')
      .select('id,nombre,proveedor,tipo,desc_pct,flete_pct,iva_pct').order('proveedor')
    setListas(data ?? [])
    setSaving(false)
    setEditId(null)
  }

  const fmt = FORMATOS.find(f => f.id === formato)!

  async function importar() {
    if (!file) return
    setLoading(true); setResult(null)
    const fd = new FormData()
    fd.append('file', file)
    fd.append('formato', formato)
    fd.append('lista_nombre', fmt.label)
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/importar-lista`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      })
      const json = await res.json()
      setResult(json)
    } catch {
      setResult({ ok: false, error: 'No se pudo conectar con la función de importación. Verificá que esté deployada en Supabase.' })
    }
    setLoading(false)
    setFile(null)
    const inp = document.getElementById('fileinput') as HTMLInputElement
    if (inp) inp.value = ''
  }

  return (
    <div className="flex flex-col gap-6 max-w-xl">

      {/* ── Descuentos ── */}
      <div>
        <h2 className="font-saira font-bold text-base text-p-ink mb-3">Descuentos por proveedor</h2>
        <div className="flex flex-col gap-2">
          {listas.map(l => (
            <div key={l.id} className="bg-white border border-p-line rounded-xl px-4 py-3 shadow-sm">
              {editId === l.id ? (
                /* Modo edición */
                <div className="flex flex-col gap-2">
                  <p className="font-saira font-bold text-sm text-p-ink">{l.nombre}</p>
                  <div className="flex gap-3 flex-wrap">
                    {[
                      { key: 'desc_pct',  label: 'Descuento %' },
                      { key: 'flete_pct', label: 'Flete %' },
                      { key: 'iva_pct',   label: 'IVA %' },
                    ].map(({ key, label }) => (
                      <label key={key} className="flex flex-col gap-1 text-xs text-p-ink2">
                        {label}
                        <input
                          type="number" step="0.1" min="0" max="100"
                          value={editVals[key as keyof typeof editVals]}
                          onChange={e => setEditVals(p => ({ ...p, [key]: e.target.value }))}
                          className="w-20 border border-p-green rounded-lg px-2 py-1 text-sm font-mono text-center focus:outline-none"
                        />
                      </label>
                    ))}
                  </div>
                  <div className="flex gap-2 mt-1">
                    <button onClick={() => saveEdit(l.id)} disabled={saving}
                      className="bg-p-green text-white text-xs font-bold px-4 py-1.5 rounded-lg disabled:opacity-60">
                      {saving ? 'Guardando…' : 'Guardar'}
                    </button>
                    <button onClick={() => setEditId(null)}
                      className="border border-p-line text-p-ink2 text-xs font-bold px-4 py-1.5 rounded-lg">
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                /* Modo lectura */
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-saira font-semibold text-sm text-p-ink">{l.nombre}</p>
                    <p className="text-xs text-p-ink2 mt-0.5 font-mono">
                      −{pct(l.desc_pct)}% desc
                      {l.flete_pct > 0 ? ` + ${pct(l.flete_pct)}% flete` : ''}
                      {` + ${pct(l.iva_pct)}% IVA`}
                    </p>
                  </div>
                  <button onClick={() => startEdit(l)}
                    className="text-xs border border-p-line rounded-lg px-3 py-1.5 text-p-ink2 hover:bg-p-light hover:text-p-ink shrink-0">
                    ✏ Editar
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Importador ── */}
      <div>
        <h2 className="font-saira font-bold text-base text-p-ink mb-3">Importar lista de precios</h2>
        <div className="bg-white border border-p-line rounded-xl p-5 shadow-sm flex flex-col gap-4">

          {/* Tipo */}
          <div>
            <label className="block text-xs font-semibold text-p-ink2 uppercase tracking-wider mb-1.5">
              Tipo de lista
            </label>
            <select value={formato}
              onChange={e => { setFormato(e.target.value); setFile(null); setResult(null) }}
              className="w-full border border-p-line rounded-lg px-3 py-2.5 text-sm text-p-ink bg-white focus:outline-none focus:border-p-green">
              {FORMATOS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
          </div>

          {/* Archivo */}
          <div>
            <label className="block text-xs font-semibold text-p-ink2 uppercase tracking-wider mb-1.5">
              Archivo ({fmt.ext})
            </label>
            <input id="fileinput" type="file" accept={fmt.ext}
              onChange={e => { setFile(e.target.files?.[0] ?? null); setResult(null) }}
              className="w-full border border-p-line rounded-lg px-3 py-2 text-sm bg-white cursor-pointer
                file:mr-3 file:py-1.5 file:px-4 file:rounded-lg file:border-0
                file:bg-p-green file:text-white file:font-bold file:text-xs file:cursor-pointer" />
            {file && (
              <p className="text-xs text-p-ink2 mt-1.5 font-mono">
                📎 {file.name} · {(file.size / 1024).toFixed(0)} KB
              </p>
            )}
          </div>

          {/* BOTÓN — siempre visible */}
          <button
            onClick={importar}
            disabled={!file || loading}
            className="w-full py-3 rounded-xl font-saira font-bold text-base text-white transition-colors
              bg-p-green hover:bg-p-dark disabled:opacity-40 disabled:cursor-not-allowed">
            {loading ? '⏳ Importando…' : '⬆ Importar al catálogo'}
          </button>

          {/* Resultado */}
          {result && (
            <div className={`rounded-xl p-4 text-sm ${result.ok ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-700'}`}>
              {result.ok ? (
                <><p className="font-bold mb-1">✅ Importación exitosa</p>
                <p>Se importaron <b>{result.importados?.toLocaleString('es-AR')}</b> de <b>{result.total?.toLocaleString('es-AR')}</b> piezas al catálogo.</p></>
              ) : (
                <><p className="font-bold mb-1">❌ Error al importar</p>
                <p className="text-xs font-mono mt-1">{result.error}</p></>
              )}
            </div>
          )}

        </div>
      </div>

    </div>
  )
}
