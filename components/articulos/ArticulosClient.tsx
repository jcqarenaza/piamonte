'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Modal, Field, Input, Empty } from '@/components/ui'
import { moneyARS2 as moneyARS } from '@/lib/utils/format'

const btn     = { background:'#00A550',color:'#fff',border:'none',borderRadius:10,padding:'10px 20px',fontWeight:700,fontSize:14,cursor:'pointer' } as const
const btnSm   = { ...btn, padding:'6px 14px', fontSize:13 } as const
const btnGray = { ...btnSm, background:'#6b7280' } as const
const btnRed  = { ...btnSm, background:'#ef4444' } as const
const btnBlue = { ...btnSm, background:'#1d4ed8' } as const

const PROV_COLOR: Record<string, string> = {
  GAMMA: '#166534', MALATESTA: '#1e40af', SEKURIT: '#5b21b6'
}
const PROVEEDORES = ['GAMMA', 'MALATESTA', 'SEKURIT']

type Tab = 'todos' | 'pendientes' | 'referencias'

interface Articulo {
  id:string; descripcion:string; codigo_referencia:string|null; sku_interno:string|null
  marca:string|null; pos:string|null; anio:string|null; activo:boolean; created_at:string
  equivalencias?: Equivalencia[]
}
interface Equivalencia {
  id:string; articulo_id:string; proveedor:string; codigo_proveedor:string|null
  descripcion_proveedor:string|null; costo_neto:number|null; lista_nombre:string|null
}
interface CatalogoSuelto {
  id:string; proveedor:string; codigo:string|null; descripcion:string; costo_neto:number
}
interface Abreviatura {
  id:string; abreviatura:string; expansion:string; activo:boolean
}

export default function ArticulosClient() {
  const [tab, setTab] = useState<Tab>('todos')
  const [articulos, setArticulos] = useState<Articulo[]>([])
  const [q, setQ] = useState('')
  const [filtroFaltante, setFiltroFaltante] = useState<string>('') // proveedor que falta
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  const [editModal, setEditModal] = useState<Articulo|null>(null)
  const [editForm, setEditForm] = useState({ descripcion:'', codigo_referencia:'', marca:'', pos:'', anio:'' })
  const [saving, setSaving] = useState(false)

  // Asociar equivalencia manual
  const [asociarModal, setAsociarModal] = useState<Articulo|null>(null)
  const [asociarQ, setAsociarQ] = useState('')
  const [asociarSugs, setAsociarSugs] = useState<CatalogoSuelto[]>([])
  const [buscandoAsociar, setBuscandoAsociar] = useState(false)

  // Referencias / abreviaturas
  const [abreviaturas, setAbreviaturas] = useState<Abreviatura[]>([])
  const [nuevaAbrev, setNuevaAbrev] = useState({ abreviatura:'', expansion:'' })
  const [editAbrevId, setEditAbrevId] = useState<string|null>(null)
  const [aplicando, setAplicando] = useState(false)
  const [resultadoAplicar, setResultadoAplicar] = useState<string>('')

  async function loadAbreviaturas() {
    const { data } = await supabase.from('abreviaturas_descripcion').select('*').order('abreviatura')
    setAbreviaturas(data ?? [])
  }

  async function guardarAbreviatura() {
    if (!nuevaAbrev.abreviatura.trim() || !nuevaAbrev.expansion.trim()) return
    if (editAbrevId) {
      await supabase.from('abreviaturas_descripcion').update({
        abreviatura: nuevaAbrev.abreviatura, expansion: nuevaAbrev.expansion, updated_at: new Date().toISOString()
      }).eq('id', editAbrevId)
    } else {
      await supabase.from('abreviaturas_descripcion').insert({ abreviatura: nuevaAbrev.abreviatura, expansion: nuevaAbrev.expansion })
    }
    setNuevaAbrev({ abreviatura:'', expansion:'' })
    setEditAbrevId(null)
    loadAbreviaturas()
  }

  function editarAbreviatura(a: Abreviatura) {
    setNuevaAbrev({ abreviatura: a.abreviatura, expansion: a.expansion })
    setEditAbrevId(a.id)
  }

  async function borrarAbreviatura(id: string) {
    if (!confirm('¿Borrar esta abreviatura? Esto no afecta los artículos ya expandidos.')) return
    await supabase.from('abreviaturas_descripcion').delete().eq('id', id)
    loadAbreviaturas()
  }

  // Re-aplica todas las abreviaturas activas sobre las descripciones actuales de los artículos.
  // Útil después de agregar una abreviatura nueva, para que también se expanda en lo ya cargado.
  async function aplicarAbreviaturas() {
    setAplicando(true)
    setResultadoAplicar('')
    const { data: abrevs } = await supabase.from('abreviaturas_descripcion').select('abreviatura,expansion').eq('activo', true)
    if (!abrevs || abrevs.length === 0) { setAplicando(false); return }

    // Ordenar por longitud descendente para que las abreviaturas más largas se reemplacen primero
    const ordenadas = [...abrevs].sort((a,b) => b.abreviatura.length - a.abreviatura.length)

    const { data: arts } = await supabase.from('articulos_maestro').select('id,descripcion').eq('activo', true)
    let modificados = 0
    for (const art of (arts ?? [])) {
      let nueva = art.descripcion
      for (const ab of ordenadas) {
        const regex = new RegExp(ab.abreviatura.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
        if (regex.test(nueva)) nueva = nueva.replace(regex, ab.expansion)
      }
      if (nueva !== art.descripcion) {
        await supabase.from('articulos_maestro').update({ descripcion: nueva, updated_at: new Date().toISOString() }).eq('id', art.id)
        modificados++
      }
    }
    setResultadoAplicar(`✓ ${modificados} artículos actualizados`)
    setAplicando(false)
    if (tab !== 'referencias') load()
  }

  const load = useCallback(async () => {
    setLoading(true)
    let query = supabase.from('articulos_maestro').select('*, articulo_equivalencias(*)').eq('activo', true).order('descripcion').limit(tab === 'pendientes' ? 500 : 100)
    if (q.trim()) query = query.or(`descripcion.ilike.%${q}%,sku_interno.ilike.%${q}%,codigo_referencia.ilike.%${q}%`)
    const { data } = await query
    let arr = (data ?? []).map((a:any) => ({ ...a, equivalencias: a.articulo_equivalencias }))

    if (tab === 'pendientes') {
      // Solo artículos con al menos un proveedor faltante, ordenados por cuántos faltan (más incompletos primero)
      arr = arr
        .filter((a:Articulo) => PROVEEDORES.some(p => !a.equivalencias?.some(e => e.proveedor === p)))
        .sort((a:Articulo, b:Articulo) => {
          const faltanA = PROVEEDORES.filter(p => !a.equivalencias?.some(e => e.proveedor === p)).length
          const faltanB = PROVEEDORES.filter(p => !b.equivalencias?.some(e => e.proveedor === p)).length
          return faltanB - faltanA
        })
    } else if (filtroFaltante) {
      arr = arr.filter((a:Articulo) => !a.equivalencias?.some(e => e.proveedor === filtroFaltante))
    }
    setArticulos(arr)
    setLoading(false)
  }, [q, filtroFaltante, tab, supabase])

  useEffect(() => { load() }, [load])
  useEffect(() => { if (tab === 'referencias') loadAbreviaturas() }, [tab])

  function openEditar(a: Articulo) {
    setEditForm({
      descripcion: a.descripcion, codigo_referencia: a.codigo_referencia||'',
      marca: a.marca||'', pos: a.pos||'', anio: a.anio||''
    })
    setEditModal(a)
  }

  async function guardarEdicion() {
    if (!editModal || !editForm.descripcion.trim()) return
    setSaving(true)
    await supabase.from('articulos_maestro').update({
      descripcion: editForm.descripcion, codigo_referencia: editForm.codigo_referencia||null,
      marca: editForm.marca||null, pos: editForm.pos||null, anio: editForm.anio||null,
      updated_at: new Date().toISOString()
    }).eq('id', editModal.id)
    setSaving(false); setEditModal(null)
    load()
  }

  function abrirAsociar(a: Articulo) {
    setAsociarModal(a); setAsociarQ(''); setAsociarSugs([])
  }

  async function buscarParaAsociar(texto: string) {
    setAsociarQ(texto)
    if (texto.trim().length < 2) { setAsociarSugs([]); return }
    setBuscandoAsociar(true)
    const { data } = await supabase.from('catalogo')
      .select('id,proveedor,codigo,descripcion,costo_neto')
      .ilike('descripcion', `%${texto}%`)
      .limit(15)
    const ids = (data ?? []).map((d:any) => d.id)
    const { data: yaVinculados } = await supabase.from('articulo_equivalencias').select('catalogo_id').in('catalogo_id', ids)
    const vinculadosSet = new Set((yaVinculados ?? []).map((v:any) => v.catalogo_id))
    setAsociarSugs((data ?? []).filter((d:any) => !vinculadosSet.has(d.id)))
    setBuscandoAsociar(false)
  }

  async function confirmarAsociacion(item: CatalogoSuelto) {
    if (!asociarModal) return
    await supabase.from('articulo_equivalencias').insert({
      articulo_id: asociarModal.id, proveedor: item.proveedor, codigo_proveedor: item.codigo,
      descripcion_proveedor: item.descripcion, costo_neto: item.costo_neto, catalogo_id: item.id,
    })
    setAsociarModal(null)
    load()
  }

  async function quitarEquivalencia(equivId: string) {
    if (!confirm('¿Quitar esta equivalencia del artículo?')) return
    await supabase.from('articulo_equivalencias').delete().eq('id', equivId)
    load()
  }

  const faltantesDe = (a: Articulo) => PROVEEDORES.filter(p => !a.equivalencias?.some(e => e.proveedor === p))

  // Costo de reposición = el más caro entre los proveedores disponibles — es lo que realmente
  // cuesta hoy reponer la pieza en el peor caso. Si hay uno más barato, lo marcamos como ahorro posible.
  function costosDe(a: Articulo) {
    const validos = (a.equivalencias ?? []).filter(e => e.costo_neto != null && e.costo_neto > 0)
    if (validos.length === 0) return null
    const ordenados = [...validos].sort((x,y) => (y.costo_neto ?? 0) - (x.costo_neto ?? 0))
    const masCaro = ordenados[0]
    const masBarato = ordenados[ordenados.length - 1]
    const ahorro = (masCaro.costo_neto ?? 0) - (masBarato.costo_neto ?? 0)
    return { masCaro, masBarato, ahorro, hayDiferencia: ahorro > 0 }
  }
  const totalArticulos = articulos.length
  const totalConTodos = articulos.filter(a => faltantesDe(a).length === 0).length

  return (
    <div>
      {/* Tabs */}
      <div className="flex gap-2 mb-4 border-b border-p-line2">
        <button onClick={()=>{setTab('todos'); setFiltroFaltante('')}}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${tab==='todos' ? 'border-p-green text-p-green' : 'border-transparent text-p-ink2 hover:text-p-ink'}`}>
          📦 Todos los artículos
        </button>
        <button onClick={()=>setTab('pendientes')}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${tab==='pendientes' ? 'border-amber-500 text-amber-600' : 'border-transparent text-p-ink2 hover:text-p-ink'}`}>
          🔗 Equivalencias pendientes
        </button>
        <button onClick={()=>setTab('referencias')}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${tab==='referencias' ? 'border-blue-500 text-blue-600' : 'border-transparent text-p-ink2 hover:text-p-ink'}`}>
          📖 Referencias
        </button>
      </div>

      {tab === 'referencias' ? (
        <div>
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4">
            <p className="text-sm text-blue-800">
              Estas abreviaturas se expanden automáticamente en la descripción de los artículos. Ej: <strong>P.D.D.</strong> → <strong>Puerta Delantera Derecha</strong>.
            </p>
          </div>

          <div className="bg-white border border-p-line rounded-xl p-4 mb-4">
            <p className="text-[11px] font-semibold text-p-ink2 uppercase tracking-wider mb-2">
              {editAbrevId ? 'Editar abreviatura' : 'Nueva abreviatura'}
            </p>
            <div className="grid grid-cols-2 gap-3 mb-2">
              <Input value={nuevaAbrev.abreviatura} onChange={e=>setNuevaAbrev(p=>({...p,abreviatura:e.target.value}))} placeholder="Ej: P.D.D."/>
              <Input value={nuevaAbrev.expansion} onChange={e=>setNuevaAbrev(p=>({...p,expansion:e.target.value}))} placeholder="Ej: Puerta Delantera Derecha"/>
            </div>
            <div className="flex justify-end gap-2">
              {editAbrevId && (
                <button onClick={()=>{setEditAbrevId(null); setNuevaAbrev({abreviatura:'',expansion:''})}} style={btnGray}>Cancelar</button>
              )}
              <button onClick={guardarAbreviatura} disabled={!nuevaAbrev.abreviatura.trim()||!nuevaAbrev.expansion.trim()} style={btn}>
                {editAbrevId ? 'Guardar cambios' : '+ Agregar'}
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-2 mb-4">
            {abreviaturas.map(a => (
              <div key={a.id} className="bg-white border border-p-line rounded-xl p-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="font-mono font-bold text-sm text-p-dark bg-p-light px-2 py-1 rounded-lg">{a.abreviatura}</span>
                  <span className="text-p-ink2">→</span>
                  <span className="text-sm text-p-ink">{a.expansion}</span>
                </div>
                <div className="flex gap-2">
                  <button onClick={()=>editarAbreviatura(a)} style={{...btnGray, padding:'5px 12px', fontSize:11}}>✏</button>
                  <button onClick={()=>borrarAbreviatura(a.id)} style={{...btnRed, padding:'5px 12px', fontSize:11}}>✕</button>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-p-light rounded-xl p-3 flex items-center justify-between gap-3 flex-wrap">
            <p className="text-xs text-p-ink2">Aplicá estos reemplazos sobre las descripciones ya cargadas (por si agregaste una abreviatura nueva).</p>
            <div className="flex items-center gap-2">
              {resultadoAplicar && <span className="text-xs font-semibold text-p-green">{resultadoAplicar}</span>}
              <button onClick={aplicarAbreviaturas} disabled={aplicando} style={{...btnBlue, opacity:aplicando?.6:1}}>
                {aplicando ? 'Aplicando…' : '⟳ Aplicar a existentes'}
              </button>
            </div>
          </div>
        </div>
      ) : (
      <>
      {tab === 'pendientes' && !loading && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 flex items-center justify-between flex-wrap gap-2">
          <p className="text-sm text-amber-800">
            <strong>{totalArticulos}</strong> artículos con al menos un proveedor sin asociar.
          </p>
          <p className="text-xs text-amber-700">Ordenados por los que más proveedores les faltan.</p>
        </div>
      )}

      <div className="flex justify-between items-center mb-4 gap-3 flex-wrap">
        <div className="flex gap-2 items-center flex-wrap">
          <Input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar por descripción, SKU o código Pilkington…" />
          {tab === 'todos' && (
            <select value={filtroFaltante} onChange={e=>setFiltroFaltante(e.target.value)}
              className="border border-p-line rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-p-green">
              <option value="">Todos</option>
              {PROVEEDORES.map(p => <option key={p} value={p}>Sin {p}</option>)}
            </select>
          )}
        </div>
        <span className="text-sm text-p-ink2">{articulos.length} artículos{tab==='todos' && ` · ${totalConTodos} completos`}</span>
      </div>

      {loading ? <p className="text-sm text-p-gray text-center py-10">Cargando…</p> :
       articulos.length === 0 ? <Empty msg={tab==='pendientes' ? '¡Sin pendientes! Todos los artículos tienen sus 3 proveedores asociados.' : 'Sin artículos.'} /> : (
        <div className="flex flex-col gap-2">
          {articulos.map(a => {
            const faltan = faltantesDe(a)
            return (
            <div key={a.id} className="bg-white border border-p-line rounded-xl p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-saira font-bold text-p-ink text-base">{a.descripcion}</p>
                    <span className="text-[10px] font-mono bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{a.sku_interno}</span>
                    {a.codigo_referencia
                      ? <span className="text-[10px] font-mono bg-green-50 text-green-700 px-2 py-0.5 rounded-full">✓ Pilkington: {a.codigo_referencia}</span>
                      : <span className="text-[10px] text-amber-600 px-2 py-0.5 rounded-full border border-dashed border-amber-300">Sin código de fábrica</span>}
                    {a.pos && <span className="text-[10px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">{a.pos}</span>}
                    {tab === 'pendientes' && (
                      <span className="text-[10px] font-bold bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                        Faltan {faltan.length}/{PROVEEDORES.length}
                      </span>
                    )}
                  </div>
                  {/* Equivalencias por proveedor */}
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {a.equivalencias?.map(e => (
                      <span key={e.id} className="inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-full text-white"
                        style={{background: PROV_COLOR[e.proveedor] || '#6b7280'}}>
                        {e.proveedor} {e.codigo_proveedor} · {moneyARS(e.costo_neto||0)}
                        <button onClick={()=>quitarEquivalencia(e.id)} className="text-white/70 hover:text-white">✕</button>
                      </span>
                    ))}
                    {faltan.map(p => (
                      <span key={p} className="text-[11px] px-2 py-1 rounded-full border border-dashed border-amber-300 text-amber-600 bg-amber-50">
                        Sin {p}
                      </span>
                    ))}
                  </div>
                  {/* Costo de reposición — siempre el más caro entre proveedores disponibles */}
                  {(() => {
                    const c = costosDe(a)
                    if (!c) return null
                    return (
                      <div className="mt-2.5 flex items-center gap-3 flex-wrap">
                        <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5">
                          <span className="text-[10px] text-gray-500 uppercase tracking-wider mr-1.5">Costo de reposición</span>
                          <span className="font-mono font-bold text-sm text-gray-800">{moneyARS(c.masCaro.costo_neto||0)}</span>
                          <span className="text-[10px] text-gray-400 ml-1">({c.masCaro.proveedor})</span>
                        </div>
                        {c.hayDiferencia && (
                          <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-1.5">
                            <span className="text-[10px] text-green-700">💡 Lo conseguís en </span>
                            <span className="font-mono font-bold text-sm text-green-700">{moneyARS(c.masBarato.costo_neto||0)}</span>
                            <span className="text-[10px] text-green-600"> con {c.masBarato.proveedor} — ahorrás {moneyARS(c.ahorro)}</span>
                          </div>
                        )}
                      </div>
                    )
                  })()}
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={()=>abrirAsociar(a)} style={btnBlue}>+ Asociar proveedor</button>
                  <button onClick={()=>openEditar(a)} style={btnGray}>✏ Editar</button>
                </div>
              </div>
            </div>
            )
          })}
        </div>
      )}
      </>
      )}

      {/* Modal editar artículo */}
      <Modal open={!!editModal} onClose={()=>setEditModal(null)} title="Editar artículo">
        <div className="flex flex-col gap-3">
          <Field label="Descripción correcta *">
            <Input value={editForm.descripcion} onChange={e=>setEditForm(p=>({...p,descripcion:e.target.value}))} placeholder="Descripción prolija del artículo"/>
          </Field>
          <Field label="Código de referencia (fábrica / Pilkington)">
            <Input value={editForm.codigo_referencia} onChange={e=>setEditForm(p=>({...p,codigo_referencia:e.target.value}))} placeholder="Código grabado en el vidrio (opcional)"/>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Marca / modelo">
              <Input value={editForm.marca} onChange={e=>setEditForm(p=>({...p,marca:e.target.value}))} placeholder="VW Gol"/>
            </Field>
            <Field label="Posición">
              <Input value={editForm.pos} onChange={e=>setEditForm(p=>({...p,pos:e.target.value}))} placeholder="PARABRISAS"/>
            </Field>
          </div>
          <Field label="Año">
            <Input value={editForm.anio} onChange={e=>setEditForm(p=>({...p,anio:e.target.value}))} placeholder="2015-2020"/>
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={()=>setEditModal(null)} style={btnGray}>Cancelar</button>
            <button onClick={guardarEdicion} disabled={!editForm.descripcion.trim()||saving} style={{...btn,opacity:(!editForm.descripcion.trim()||saving)?.6:1}}>
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal asociar proveedor manualmente */}
      <Modal open={!!asociarModal} onClose={()=>setAsociarModal(null)} title="Asociar artículo de proveedor">
        <div className="flex flex-col gap-3">
          <p className="text-sm text-p-ink2">
            Buscá la misma pieza en el catálogo de proveedores para vincularla a <strong>{asociarModal?.descripcion}</strong>.
          </p>
          <Input value={asociarQ} onChange={e=>buscarParaAsociar(e.target.value)} placeholder="Buscar por descripción…" />
          {buscandoAsociar && <p className="text-xs text-p-ink2 text-center py-2">Buscando…</p>}
          {asociarSugs.length > 0 && (
            <div className="flex flex-col gap-1.5 max-h-72 overflow-y-auto">
              {asociarSugs.map(s => (
                <button key={s.id} onClick={()=>confirmarAsociacion(s)}
                  className="flex items-center justify-between gap-3 bg-p-light hover:bg-p-line2 rounded-lg px-3 py-2.5 text-left transition-colors">
                  <div className="min-w-0">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white mr-2"
                      style={{background: PROV_COLOR[s.proveedor] || '#6b7280'}}>{s.proveedor}</span>
                    <span className="text-sm text-p-ink">{s.descripcion}</span>
                    {s.codigo && <p className="text-[10px] font-mono text-p-ink2 mt-0.5">{s.codigo}</p>}
                  </div>
                  <span className="font-mono font-bold text-sm text-p-dark shrink-0">{moneyARS(s.costo_neto)}</span>
                </button>
              ))}
            </div>
          )}
          {asociarQ.trim().length >= 2 && !buscandoAsociar && asociarSugs.length === 0 && (
            <p className="text-xs text-p-ink2 text-center py-2">Sin resultados disponibles para vincular.</p>
          )}
          <div className="flex justify-end pt-1">
            <button onClick={()=>setAsociarModal(null)} style={btnGray}>Cerrar</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
