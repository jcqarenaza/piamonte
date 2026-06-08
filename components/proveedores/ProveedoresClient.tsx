'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

const SUPABASE_URL = 'https://hjzhatercccblhgaukgx.supabase.co'

const FORMATOS = [
  { id: 'gamma',        label: 'GAMMA — Catálogo (.xlsx)',              ext: '.xlsx' },
  { id: 'malatesta',   label: 'Malatesta — Catálogo (.xlsx)',           ext: '.xlsx' },
  { id: 'sekurit',     label: 'Sekurit — Lista disponible (.xlsx)',     ext: '.xlsx' },
  { id: 'promo_ar',    label: 'Promo Alta Rotación 68% (.xlsx)',        ext: '.xlsx' },
  { id: 'promo_bg',    label: 'Promo Bajo Giro 68% (.xlsx)',            ext: '.xlsx' },
  { id: 'oferta_gamma',label: 'Oferta Especial Mixta GAMMA (.pdf)',     ext: '.pdf'  },
  { id: 'mix_malat',   label: 'Oferta Mix Pilkington/Euroglass (.pdf)', ext: '.pdf'  },
]

interface Lista { id:string; nombre:string; proveedor:string; tipo:string; desc_pct:number; flete_pct:number; iva_pct:number }
interface Result { ok:boolean; total?:number; importados?:number; error?:string }

function pct(n:number){ return (n*100).toFixed(1) }

export default function ProveedoresClient({ token }: { token:string }) {
  const [listas, setListas]     = useState<Lista[]>([])
  const [editId, setEditId]     = useState<string|null>(null)
  const [editVals, setEditVals] = useState({ desc_pct:'', flete_pct:'', iva_pct:'' })
  const [saving, setSaving]     = useState(false)
  const [formato, setFormato]   = useState('gamma')
  const [file, setFile]         = useState<File|null>(null)
  const [loading, setLoading]   = useState(false)
  const [result, setResult]     = useState<Result|null>(null)
  const supabase = createClient()

  useEffect(() => {
    supabase.from('listas_precio')
      .select('id,nombre,proveedor,tipo,desc_pct,flete_pct,iva_pct')
      .order('proveedor')
      .then(({ data }) => setListas(data ?? []))
  }, [supabase])

  async function saveEdit(id:string) {
    setSaving(true)
    await supabase.from('listas_precio').update({
      desc_pct:  parseFloat(editVals.desc_pct)/100,
      flete_pct: parseFloat(editVals.flete_pct)/100,
      iva_pct:   parseFloat(editVals.iva_pct)/100,
    }).eq('id', id)
    const { data } = await supabase.from('listas_precio')
      .select('id,nombre,proveedor,tipo,desc_pct,flete_pct,iva_pct').order('proveedor')
    setListas(data ?? [])
    setSaving(false); setEditId(null)
  }

  async function importar() {
    if (!file) return
    setLoading(true); setResult(null)
    const fd = new FormData()
    fd.append('file', file)
    fd.append('formato', formato)
    fd.append('lista_nombre', FORMATOS.find(f=>f.id===formato)?.label ?? formato)
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/importar-lista`, {
        method:'POST', headers:{ Authorization:`Bearer ${token}` }, body:fd,
      })
      setResult(await res.json())
    } catch {
      setResult({ ok:false, error:'No se pudo conectar. Verificá que la Edge Function esté deployada.' })
    }
    setLoading(false); setFile(null)
    const inp = document.getElementById('fi') as HTMLInputElement
    if (inp) inp.value = ''
  }

  const fmt = FORMATOS.find(f=>f.id===formato)!

  return (
    <div style={{ maxWidth: 560 }}>

      {/* Descuentos */}
      <h2 style={{ fontFamily:'var(--font-saira)', fontWeight:700, fontSize:16, marginBottom:12 }}>
        Descuentos por proveedor
      </h2>
      <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:32 }}>
        {listas.map(l => (
          <div key={l.id} style={{ background:'#fff', border:'1px solid #C2DDD0', borderRadius:12, padding:'12px 16px' }}>
            {editId === l.id ? (
              <div>
                <p style={{ fontWeight:700, marginBottom:8 }}>{l.nombre}</p>
                <div style={{ display:'flex', gap:12, flexWrap:'wrap', marginBottom:8 }}>
                  {[['desc_pct','Descuento %'],['flete_pct','Flete %'],['iva_pct','IVA %']].map(([k,lbl]) => (
                    <label key={k} style={{ fontSize:12, color:'#4A6655' }}>
                      {lbl}<br/>
                      <input type="number" step="0.1" min="0" max="100"
                        value={editVals[k as keyof typeof editVals]}
                        onChange={e => setEditVals(p=>({...p,[k]:e.target.value}))}
                        style={{ width:72, border:'1px solid #00A550', borderRadius:8, padding:'4px 8px', fontFamily:'monospace', fontSize:14, textAlign:'center' }} />
                    </label>
                  ))}
                </div>
                <div style={{ display:'flex', gap:8 }}>
                  <button onClick={() => saveEdit(l.id)} disabled={saving}
                    style={{ background:'#00A550', color:'#fff', border:'none', borderRadius:8, padding:'6px 16px', fontWeight:700, fontSize:13, cursor:'pointer' }}>
                    {saving ? 'Guardando…' : 'Guardar'}
                  </button>
                  <button onClick={() => setEditId(null)}
                    style={{ background:'#fff', border:'1px solid #C2DDD0', borderRadius:8, padding:'6px 16px', fontSize:13, cursor:'pointer' }}>
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div>
                  <p style={{ fontWeight:600, fontSize:14, margin:0 }}>{l.nombre}</p>
                  <p style={{ fontFamily:'monospace', fontSize:12, color:'#4A6655', margin:'2px 0 0' }}>
                    −{pct(l.desc_pct)}% desc{l.flete_pct>0?` + ${pct(l.flete_pct)}% flete`:''} + {pct(l.iva_pct)}% IVA
                  </p>
                </div>
                <button onClick={() => { setEditId(l.id); setEditVals({ desc_pct:pct(l.desc_pct), flete_pct:pct(l.flete_pct), iva_pct:pct(l.iva_pct) }) }}
                  style={{ border:'1px solid #C2DDD0', background:'#fff', borderRadius:8, padding:'6px 14px', fontSize:13, cursor:'pointer' }}>
                  ✏ Editar
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Importador */}
      <h2 style={{ fontFamily:'var(--font-saira)', fontWeight:700, fontSize:16, marginBottom:12 }}>
        Importar lista de precios
      </h2>

      <div style={{ marginBottom:16 }}>
        <label style={{ fontSize:12, fontWeight:600, color:'#4A6655', textTransform:'uppercase', letterSpacing:'0.05em', display:'block', marginBottom:6 }}>
          Tipo de lista
        </label>
        <select value={formato} onChange={e=>{ setFormato(e.target.value); setFile(null); setResult(null) }}
          style={{ width:'100%', border:'1px solid #C2DDD0', borderRadius:10, padding:'10px 12px', fontSize:14, background:'#fff' }}>
          {FORMATOS.map(f=><option key={f.id} value={f.id}>{f.label}</option>)}
        </select>
      </div>

      <div style={{ marginBottom:16 }}>
        <label style={{ fontSize:12, fontWeight:600, color:'#4A6655', textTransform:'uppercase', letterSpacing:'0.05em', display:'block', marginBottom:6 }}>
          Archivo ({fmt.ext})
        </label>
        <input id="fi" type="file" accept={fmt.ext}
          onChange={e=>{ setFile(e.target.files?.[0]??null); setResult(null) }}
          style={{ width:'100%', border:'1px solid #C2DDD0', borderRadius:10, padding:'8px 12px', fontSize:14, background:'#fff', cursor:'pointer' }} />
        {file && (
          <p style={{ fontFamily:'monospace', fontSize:12, color:'#4A6655', marginTop:6 }}>
            📎 {file.name} · {(file.size/1024).toFixed(0)} KB
          </p>
        )}
      </div>

      {/* BOTÓN SIEMPRE VISIBLE - sin Tailwind, sin clase, inline puro */}
      <button
        onClick={importar}
        disabled={!file || loading}
        style={{
          display:'block', width:'100%', padding:'14px',
          background: (!file||loading) ? '#aaa' : '#00A550',
          color:'#fff', border:'none', borderRadius:12,
          fontSize:16, fontWeight:700, cursor: (!file||loading)?'not-allowed':'pointer',
          marginBottom:16,
        }}>
        {loading ? '⏳ Importando…' : '⬆ Importar al catálogo'}
      </button>

      {result && (
        <div style={{
          padding:16, borderRadius:12,
          background: result.ok ? '#f0faf4' : '#fef2f2',
          border: `1px solid ${result.ok ? '#86efac' : '#fca5a5'}`,
          color: result.ok ? '#166534' : '#991b1b',
        }}>
          {result.ok ? (
            <>
              <p style={{ fontWeight:700, marginBottom:4 }}>✅ Importación exitosa</p>
              <p>Se importaron <b>{result.importados?.toLocaleString('es-AR')}</b> de <b>{result.total?.toLocaleString('es-AR')}</b> piezas.</p>
            </>
          ) : (
            <>
              <p style={{ fontWeight:700, marginBottom:4 }}>❌ Error al importar</p>
              <p style={{ fontFamily:'monospace', fontSize:12 }}>{result.error}</p>
            </>
          )}
        </div>
      )}
    </div>
  )
}
