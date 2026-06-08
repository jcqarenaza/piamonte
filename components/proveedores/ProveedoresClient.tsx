'use client'
import { useState } from 'react'
import { Btn, Field } from '@/components/ui'

const SUPABASE_URL = 'https://hjzhatercccblhgaukgx.supabase.co'

const FORMATOS = [
  { id: 'gamma',        label: 'GAMMA — Catálogo',               ext: '.xlsx' },
  { id: 'malatesta',   label: 'Malatesta — Catálogo',            ext: '.xlsx' },
  { id: 'sekurit',     label: 'Sekurit — Lista disponible',      ext: '.xlsx' },
  { id: 'promo_ar',    label: 'Promo Alta Rotación 68%',         ext: '.xlsx' },
  { id: 'promo_bg',    label: 'Promo Bajo Giro 68%',             ext: '.xlsx' },
  { id: 'oferta_gamma',label: 'Oferta Especial Mixta (GAMMA)',   ext: '.pdf'  },
  { id: 'mix_malat',   label: 'Oferta Mix Pilkington/Euroglass', ext: '.pdf'  },
]

const REGLAS = [
  { nombre: 'GAMMA',       desc: '−48% + 1,5% flete + IVA',                       color: 'bg-green-100 text-green-700'  },
  { nombre: 'Malatesta',   desc: '−53% + 1% flete + IVA',                          color: 'bg-blue-100 text-blue-700'    },
  { nombre: 'Sekurit',     desc: 'Precio neto + IVA',                              color: 'bg-purple-100 text-purple-700'},
  { nombre: 'Promos 68%',  desc: 'Desc base 68% + extra por ítem + PP 8% + IVA',  color: 'bg-amber-100 text-amber-700'  },
  { nombre: 'Ofertas PDF', desc: 'Precio neto + IVA (vigencia mensual)',           color: 'bg-rose-100 text-rose-700'    },
]

interface Result { ok: boolean; total?: number; importados?: number; error?: string }

export default function ProveedoresClient({ token }: { token: string }) {
  const [formato, setFormato] = useState('gamma')
  const [file, setFile]       = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult]   = useState<Result | null>(null)

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
      setResult(await res.json())
    } catch {
      setResult({ ok: false, error: 'Error de conexión con la Edge Function' })
    }
    setLoading(false)
    setFile(null)
    const inp = document.getElementById('fi') as HTMLInputElement
    if (inp) inp.value = ''
  }

  return (
    <div className="max-w-xl">

      {/* Reglas */}
      <div className="bg-white border border-p-line rounded-xl overflow-hidden mb-8 shadow-sm">
        <div className="px-4 py-3 border-b border-p-line2 bg-p-light">
          <p className="font-saira font-bold text-sm text-p-ink">Reglas de costo por proveedor</p>
        </div>
        {REGLAS.map((r, i) => (
          <div key={r.nombre} className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? 'border-t border-p-line2' : ''}`}>
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full shrink-0 ${r.color}`}>{r.nombre}</span>
            <p className="text-sm text-p-ink2">{r.desc}</p>
          </div>
        ))}
      </div>

      {/* Importador */}
      <div className="bg-white border border-p-line rounded-xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-p-line2 bg-p-light">
          <p className="font-saira font-bold text-sm text-p-ink">Importar lista de precios</p>
        </div>
        <div className="p-4 flex flex-col gap-4">

          {/* Selector de formato */}
          <Field label="1. Elegí el tipo de lista">
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

          {/* Selector de archivo */}
          <Field label={`2. Seleccioná el archivo (${fmt.ext})`}>
            <input
              id="fi"
              type="file"
              accept={fmt.ext}
              onChange={e => { setFile(e.target.files?.[0] ?? null); setResult(null) }}
              className="w-full border border-p-line rounded-lg px-3 py-2 text-sm bg-white
                file:mr-3 file:py-1.5 file:px-4 file:rounded-lg file:border-0
                file:bg-p-green file:text-white file:font-saira file:font-bold file:text-xs
                cursor-pointer"
            />
            {file && (
              <p className="text-xs text-p-ink2 mt-1.5">
                📎 {file.name} ({(file.size / 1024).toFixed(0)} KB)
              </p>
            )}
          </Field>

          {/* Botón */}
          <Btn
            onClick={importar}
            disabled={!file || loading}
            className="w-full text-base py-3"
          >
            {loading ? '⏳ Importando…' : '⬆ Importar al catálogo'}
          </Btn>

          {/* Resultado */}
          {result && (
            <div className={`p-4 rounded-xl border text-sm ${
              result.ok
                ? 'bg-green-50 border-green-200 text-green-800'
                : 'bg-red-50 border-red-200 text-red-700'
            }`}>
              {result.ok ? (
                <>
                  <p className="font-saira font-bold text-base mb-1">✅ Importación exitosa</p>
                  <p>Se importaron <b>{result.importados?.toLocaleString('es-AR')}</b> de <b>{result.total?.toLocaleString('es-AR')}</b> piezas.</p>
                </>
              ) : (
                <>
                  <p className="font-bold mb-1">❌ Error al importar</p>
                  <p className="font-mono text-xs">{result.error}</p>
                  {result.error?.includes('Edge Function') && (
                    <p className="mt-2 text-xs">La Edge Function <b>importar-lista</b> no está deployada todavía. Deployala desde el dashboard de Supabase.</p>
                  )}
                </>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
