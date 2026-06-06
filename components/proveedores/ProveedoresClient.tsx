'use client'
import { useState } from 'react'
import { Btn, Field, Input } from '@/components/ui'

const SUPABASE_URL = 'https://hjzhatercccblhgaukgx.supabase.co'
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhqemhhdGVyY2NjYmxoZ2F1a2d4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3NDQwMjMsImV4cCI6MjA5NjMyMDAyM30.XYoxEnhkvxIB0pAPAT6H3-mn70uxLzwNYqJQIjoKc3o'

const FORMATOS = [
  { id: 'gamma',    label: 'GAMMA — Catálogo',                  hint: 'Excel con hoja "Lista General"',     ext: '.xlsx' },
  { id: 'malatesta',label: 'Malatesta — Catálogo',              hint: 'Excel con hoja "Lista"',             ext: '.xlsx' },
  { id: 'sekurit',  label: 'Sekurit — Lista disponible',        hint: 'Excel con hoja "LP"',                ext: '.xlsx' },
  { id: 'promo_ar', label: 'Promo Alta Rotación 68%',           hint: 'Excel con hoja "Hoja1" (Sekurit)',   ext: '.xlsx' },
  { id: 'promo_bg', label: 'Promo Bajo Giro 68%',               hint: 'Excel con hoja "Hoja1" (Sekurit)',   ext: '.xlsx' },
  { id: 'oferta_gamma', label: 'Oferta Especial Mixta (GAMMA)', hint: 'PDF de oferta mixta de GAMMA',       ext: '.pdf'  },
  { id: 'mix_malat',    label: 'Oferta Mix Pilkington/Euroglass', hint: 'PDF de oferta mixta Malatesta',   ext: '.pdf'  },
]

const PROVEEDORES_CONFIG = [
  { nombre: 'GAMMA', desc: 'Catálogo: −48% + 1,5% flete + IVA',  color: 'bg-green-100 text-green-700' },
  { nombre: 'Malatesta', desc: 'Catálogo: −53% + 1% flete + IVA', color: 'bg-blue-100 text-blue-700' },
  { nombre: 'Sekurit', desc: 'Lista precio neto + IVA',           color: 'bg-purple-100 text-purple-700' },
  { nombre: 'Promos 68%', desc: 'Desc base 68% + extra por ítem + pronto pago 8% + IVA', color: 'bg-amber-100 text-amber-700' },
  { nombre: 'Ofertas PDF', desc: 'Precio neto + IVA (vigencia mensual)', color: 'bg-rose-100 text-rose-700' },
]

interface Result { ok: boolean; total?: number; importados?: number; error?: string; formato?: string }

export default function ProveedoresClient({ token }: { token: string }) {
  const [formato, setFormato] = useState(FORMATOS[0].id)
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<Result | null>(null)

  const fmt = FORMATOS.find(f => f.id === formato)!

  async function importar() {
    if (!file) { alert('Seleccioná un archivo primero.'); return }
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
      const data = await res.json()
      setResult(data)
    } catch (e: unknown) {
      setResult({ ok: false, error: e instanceof Error ? e.message : 'Error de conexión' })
    }
    setLoading(false)
    setFile(null)
    // resetear input
    const inp = document.getElementById('fileInput') as HTMLInputElement
    if (inp) inp.value = ''
  }

  return (
    <div className="max-w-2xl">
      {/* Reglas de descuento */}
      <h2 className="font-saira font-bold text-base text-p-ink mb-3">Reglas de costo por proveedor</h2>
      <div className="bg-white border border-p-line rounded-xl overflow-hidden mb-8">
        {PROVEEDORES_CONFIG.map((p, i) => (
          <div key={p.nombre} className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? 'border-t border-p-line2' : ''}`}>
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${p.color}`}>{p.nombre}</span>
            <p className="text-sm text-p-ink2 flex-1">{p.desc}</p>
          </div>
        ))}
      </div>

      {/* Importador */}
      <h2 className="font-saira font-bold text-base text-p-ink mb-3">Importar lista de precios</h2>
      <div className="bg-white border border-p-line rounded-xl p-5 shadow-sm">
        <Field label="1. Elegí el tipo de lista" className="mb-4">
          <div className="grid grid-cols-1 gap-2">
            {FORMATOS.map(f => (
              <label key={f.id} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${formato === f.id ? 'border-p-green bg-p-light' : 'border-p-line hover:bg-p-light/50'}`}>
                <input type="radio" name="formato" value={f.id} checked={formato === f.id} onChange={() => { setFormato(f.id); setFile(null); setResult(null) }} className="mt-0.5 accent-p-green" />
                <div>
                  <p className="font-semibold text-sm text-p-ink">{f.label}</p>
                  <p className="text-xs text-p-ink2">{f.hint}</p>
                </div>
              </label>
            ))}
          </div>
        </Field>

        <Field label={`2. Seleccioná el archivo (${fmt.ext})`} className="mb-4">
          <input id="fileInput" type="file" accept={fmt.ext} onChange={e => { setFile(e.target.files?.[0] ?? null); setResult(null) }}
            className="w-full border border-p-line rounded-lg px-3 py-2 text-sm text-p-ink bg-white cursor-pointer file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:bg-p-light file:text-p-dark file:font-semibold file:text-xs" />
          {file && <p className="text-xs text-p-ink2 mt-1">📎 {file.name} ({(file.size / 1024).toFixed(0)} KB)</p>}
        </Field>

        <Btn onClick={importar} disabled={!file || loading} className="w-full">
          {loading ? '⏳ Importando…' : '⬆ Importar al catálogo'}
        </Btn>

        {result && (
          <div className={`mt-4 p-4 rounded-lg border text-sm ${result.ok ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-700'}`}>
            {result.ok ? (
              <>
                <p className="font-bold text-base">✅ Importación exitosa</p>
                <p className="mt-1">Se importaron <b>{result.importados?.toLocaleString('es-AR')}</b> de <b>{result.total?.toLocaleString('es-AR')}</b> piezas al catálogo.</p>
                <p className="text-xs text-green-600 mt-1">Formato detectado: {result.formato}</p>
              </>
            ) : (
              <>
                <p className="font-bold">❌ Error al importar</p>
                <p className="mt-1 font-mono text-xs">{result.error}</p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
