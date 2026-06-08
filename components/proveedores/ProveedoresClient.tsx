'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Btn, Field } from '@/components/ui'

const SUPABASE_URL = 'https://hjzhatercccblhgaukgx.supabase.co'

const FORMATOS = [
  { id: 'gamma',        label: 'GAMMA — Catálogo',               ext: '.xlsx' },
  { id: 'malatesta',   label: 'Malatesta — Catálogo',            ext: '.xlsx' },
  { id: 'sekurit',     label: 'Sekurit — Lista disponible',      ext: '.xlsx' },
  { id: 'promo_ar',    label: 'Promo Alta Rotación 68%',         ext: '.xlsx' },
  { id: 'promo_bg',    label: 'Promo Bajo Giro 68%',             ext: '.xlsx' },
  { id: 'oferta_gamma','label': 'Oferta Especial Mixta (GAMMA)', ext: '.pdf'  },
  { id: 'mix_malat',   label: 'Oferta Mix Pilkington/Euroglass', ext: '.pdf'  },
]

interface Lista { id: string; nombre: string; proveedor: string; tipo: string; desc_pct: number; flete_pct: number; iva_pct: number; vigencia_hasta: string | null; activa: boolean }
interface Result { ok: boolean; total?: number; importados?: number; error?: string }

export default function ProveedoresClient({ token }: { token: string }) {
  const [listas, setListas]   = useState<Lista[]>([])
  const [saving, setSaving]   = useState<string | null>(null)
  const [saved, setSaved]     = useState<string | null>(null)
  const [formato, setFormato] = useState('gamma')
  const [file, setFile]       = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult]   = useState<Result | null>(null)
  const supabase = createClient()

  useEffect(() => {
    supabase.from('listas_precio').select('*').order('proveedor').then(({ data }) => setListas(data ?? []))
  }, [supabase])

  async function updateLista(id: string, field: string, val: string) {
    const num = parseFloat(val) / 100   // usuario escribe 48, guardamos 0.48
    setSaving(id)
    await supabase.from('listas_precio').update({ [field]: num }).eq('id', id)
    setListas(prev => prev.map(l => l.id === id ? { ...l, [field]: num } : l))
    setSaving(null); setSaved(id); setTimeout(() => setSaved(null), 1500)
  }

  const fmt = FORMATOS.find(f => f.id === formato)!

  async function importar() {
    if (!file) return
    setLoading(true); setResult(null)
    const fd = new FormData()
    fd.append('file', file); fd.append('formato', formato); fd.append('lista_nombre', fmt.label)
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/importar-lista`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd,
      })
      setResult(await res.json())
    } catch {
      setResult({ ok: false, error: 'Error de conexión. ¿Está deployada la Edge Function?' })
    }
    setLoading(false); setFile(null)
    const inp = document.getElementById('fi') as HTMLInputElement
    if (inp) inp.value = ''
  }

  function pct(n: number) { return (n * 100).toFixed(1) }

  return (
    <div className="max-w-2xl flex flex-col gap-8">

      {/* Descuentos editables */}
      <div className="bg-white border border-p-line rounded-xl overflow-hidden shadow-sm">
        <div className="px-4 py-3 border-b border-p-line2 bg-p-light">
          <p className="font-saira font-bold text-sm text-p-ink">Reglas de costo por proveedor</p>
          <p className="text-xs text-p-ink2 mt-0.5">Editá los porcentajes y se guardan automáticamente.</p>
        </div>

        {listas.length === 0 ? (
          <p className="text-sm text-p-gray text-center py-8">Cargando…</p>
        ) : (
          <div>
            {/* Header */}
            <div className="grid grid-cols-5 gap-2 px-4 py-2 bg-gray-50 border-b border-p-line2 text-[10px] font-bold text-p-ink2 uppercase tracking-wider">
              <span className="col-span-2">Lista</span>
              <span className="text-center">Desc %</span>
              <span className="text-center">Flete %</span>
              <span className="text-center">IVA %</span>
            </div>
            {listas.map(l => (
              <div key={l.id} className={`grid grid-cols-5 gap-2 px-4 py-2.5 border-b border-p-line2 items-center ${!l.activa ? 'opacity-50' : ''}`}>
                <div className="col-span-2">
                  <p className="text-sm font-medium text-p-ink">{l.nombre}</p>
                  <p className="text-[10px] text-p-ink2">{l.proveedor} · {l.tipo}</p>
                </div>
                {(['desc_pct','flete_pct','iva_pct'] as const).map(field => (
                  <div key={field} className="flex items-center gap-1">
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      defaultValue={pct(l[field])}
                      onBlur={e => updateLista(l.id, field, e.target.value)}
                      className="w-full border border-p-line rounded px-2 py-1 text-xs font-mono text-center focus:outline-none focus:border-p-green"
                    />
                    <span className="text-xs text-p-gray">%</span>
                  </div>
                ))}
                {saving === l.id && <div className="col-span-5 text-[10px] text-p-ink2 text-right pb-1">Guardando…</div>}
                {saved === l.id && <div className="col-span-5 text-[10px] text-green-600 text-right pb-1">✓ Guardado</div>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Importador */}
      <div className="bg-white border border-p-line rounded-xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-p-line2 bg-p-light">
          <p className="font-saira font-bold text-sm text-p-ink">Importar lista de precios</p>
          <p className="text-xs text-p-ink2 mt-0.5">Seleccioná el tipo y subí el archivo. El catálogo se actualiza automáticamente.</p>
        </div>
        <div className="p-4 flex flex-col gap-4">
          <Field label="1. Tipo de lista">
            <select
              value={formato}
              onChange={e => { setFormato(e.target.value); setFile(null); setResult(null) }}
              className="w-full border border-p-line rounded-lg px-3 py-2.5 text-sm text-p-ink bg-white focus:outline-none focus:border-p-green"
            >
              {FORMATOS.map(f => (
                <option key={f.id} value={f.id}>{f.label} ({f.ext})</option>
              ))}
            </select>
          </Field>

          <Field label={`2. Archivo (${fmt.ext})`}>
            <input
              id="fi" type="file" accept={fmt.ext}
              onChange={e => { setFile(e.target.files?.[0] ?? null); setResult(null) }}
              className="w-full border border-p-line rounded-lg px-3 py-2 text-sm bg-white
                file:mr-3 file:py-1.5 file:px-4 file:rounded-lg file:border-0
                file:bg-p-green file:text-white file:font-saira file:font-bold file:text-xs cursor-pointer"
            />
            {file && <p className="text-xs text-p-ink2 mt-1">📎 {file.name} ({(file.size/1024).toFixed(0)} KB)</p>}
          </Field>

          <Btn onClick={importar} disabled={!file || loading} className="w-full py-3 text-base">
            {loading ? '⏳ Importando…' : '⬆ Importar al catálogo'}
          </Btn>

          {result && (
            <div className={`p-4 rounded-xl border text-sm ${result.ok ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-700'}`}>
              {result.ok ? (
                <><p className="font-bold mb-1">✅ Importación exitosa</p>
                <p>Se importaron <b>{result.importados?.toLocaleString('es-AR')}</b> de <b>{result.total?.toLocaleString('es-AR')}</b> piezas.</p></>
              ) : (
                <><p className="font-bold mb-1">❌ Error</p>
                <p className="font-mono text-xs">{result.error}</p></>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
