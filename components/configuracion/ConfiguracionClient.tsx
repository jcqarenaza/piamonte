'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

interface TipoCliente { id:string; nombre:string; margen_pct:number; color:string; activo:boolean }
interface RubroPrecio { id:string; nombre:string; precio_base:number; costo_base:number; visible_en_impresion:boolean; activo:boolean; orden:number }
interface CategoriaGasto { id:string; nombre:string; color:string; orden:number; activo:boolean }
interface Colaborador { id:string; nombre:string; activo:boolean }

const btn     = { background:'#00A550',color:'#fff',border:'none',borderRadius:8,padding:'8px 16px',fontWeight:700,fontSize:13,cursor:'pointer' } as const
const btnRed  = { ...btn, background:'#ef4444' } as const
const btnGray = { ...btn, background:'#6b7280' } as const
const COLORS  = ['#2563eb','#d97706','#7c3aed','#dc2626','#059669','#0891b2','#475569']

function moneyARS(n:number){ return '$'+Math.round(n).toLocaleString('es-AR') }

export default function ConfiguracionClient() {
  const [tipos,      setTipos]      = useState<TipoCliente[]>([])
  const [rubros,     setRubros]     = useState<RubroPrecio[]>([])
  const [categorias, setCategorias] = useState<CategoriaGasto[]>([])
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([])
  const [saving,     setSaving]     = useState(false)
  const [toast,      setToast]      = useState('')
  const supabase = createClient()

  const [tipoEdit,      setTipoEdit]      = useState<Record<string,{nombre:string;margen_pct:string;color:string}>>({})
  const [nuevoTipo,     setNuevoTipo]     = useState({ nombre:'', margen_pct:'', color:COLORS[0] })
  const [showNuevoTipo, setShowNuevoTipo] = useState(false)

  const [rubroEdit,      setRubroEdit]      = useState<Record<string,{nombre:string;precio_base:string;costo_base:string;visible:boolean}>>({})
  const [nuevoRubro,     setNuevoRubro]     = useState({ nombre:'', precio_base:'', costo_base:'', visible:false })
  const [showNuevoRubro, setShowNuevoRubro] = useState(false)

  const [catEdit,      setCatEdit]      = useState<Record<string,{nombre:string;color:string}>>({})
  const [nuevaCat,     setNuevaCat]     = useState({ nombre:'', color:COLORS[0] })
  const [showNuevaCat, setShowNuevaCat] = useState(false)
  const [nuevoColab,     setNuevoColab]     = useState('')
  const [nuevoColabColocador, setNuevoColabColocador] = useState(false)
  const [showNuevoColab, setShowNuevoColab] = useState(false)
  const [colabEdit,      setColabEdit]      = useState<Record<string,string>>({})

  useEffect(() => {
    supabase.from('tipos_cliente').select('*').order('nombre').then(({data})=>setTipos(data??[]))
    supabase.from('rubros_precio').select('*').eq('activo',true).order('orden').then(({data})=>setRubros(data??[]))
    supabase.from('categorias_gasto').select('*').eq('activo',true).order('orden').then(({data})=>setCategorias(data??[]))
    supabase.from('colaboradores').select('*').eq('activo',true).order('nombre').then(({data})=>setColaboradores(data??[]))
  },[supabase])

  function ok(msg:string){ setToast(msg); setTimeout(()=>setToast(''),2500) }

  function startEditTipo(t:TipoCliente){
    setTipoEdit(p=>({...p,[t.id]:{nombre:t.nombre,margen_pct:String(Math.round(t.margen_pct*100)),color:t.color}}))
  }
  async function saveTipo(id:string){
    const e=tipoEdit[id]; if(!e) return
    setSaving(true)
    await supabase.from('tipos_cliente').update({nombre:e.nombre,margen_pct:+e.margen_pct/100,color:e.color}).eq('id',id)
    const {data}=await supabase.from('tipos_cliente').select('*').order('nombre')
    setTipos(data??[])
    setTipoEdit(p=>{const n={...p};delete n[id];return n})
    setSaving(false); ok('Tipo actualizado ✓')
  }
  async function deleteTipo(id:string){
    if(!confirm('¿Borrar este tipo?')) return
    await supabase.from('tipos_cliente').delete().eq('id',id)
    setTipos(prev=>prev.filter(t=>t.id!==id)); ok('Tipo eliminado')
  }
  async function addTipo(){
    if(!nuevoTipo.nombre||!nuevoTipo.margen_pct) return
    setSaving(true)
    await supabase.from('tipos_cliente').insert({nombre:nuevoTipo.nombre,margen_pct:+nuevoTipo.margen_pct/100,color:nuevoTipo.color})
    const {data}=await supabase.from('tipos_cliente').select('*').order('nombre')
    setTipos(data??[]); setNuevoTipo({nombre:'',margen_pct:'',color:COLORS[0]}); setShowNuevoTipo(false)
    setSaving(false); ok('Tipo creado ✓')
  }

  function startEditRubro(r:RubroPrecio){
    setRubroEdit(p=>({...p,[r.id]:{nombre:r.nombre,precio_base:String(r.precio_base),costo_base:String(r.costo_base||0),visible:r.visible_en_impresion}}))
  }
  async function saveRubro(id:string){
    const e=rubroEdit[id]; if(!e) return
    setSaving(true)
    await supabase.from('rubros_precio').update({nombre:e.nombre,precio_base:+e.precio_base,costo_base:+e.costo_base||0,visible_en_impresion:e.visible}).eq('id',id)
    const {data}=await supabase.from('rubros_precio').select('*').eq('activo',true).order('orden')
    setRubros(data??[])
    setRubroEdit(p=>{const n={...p};delete n[id];return n})
    setSaving(false); ok('Rubro actualizado ✓')
  }
  async function deleteRubro(id:string){
    if(!confirm('¿Borrar este rubro?')) return
    await supabase.from('rubros_precio').update({activo:false}).eq('id',id)
    setRubros(prev=>prev.filter(r=>r.id!==id)); ok('Rubro eliminado')
  }
  async function addRubro(){
    if(!nuevoRubro.nombre||!nuevoRubro.precio_base) return
    setSaving(true)
    const orden = (Math.max(...rubros.map(r=>r.orden),0))+1
    await supabase.from('rubros_precio').insert({nombre:nuevoRubro.nombre,precio_base:+nuevoRubro.precio_base,costo_base:+nuevoRubro.costo_base||0,visible_en_impresion:nuevoRubro.visible,orden})
    const {data}=await supabase.from('rubros_precio').select('*').eq('activo',true).order('orden')
    setRubros(data??[]); setNuevoRubro({nombre:'',precio_base:'',costo_base:'',visible:false}); setShowNuevoRubro(false)
    setSaving(false); ok('Rubro creado ✓')
  }

  return (
    <div className="max-w-2xl flex flex-col gap-8">

      {toast && (
        <div style={{position:'fixed',bottom:96,left:'50%',transform:'translateX(-50%)',background:'#00A550',color:'#fff',padding:'10px 24px',borderRadius:12,fontWeight:700,fontSize:14,zIndex:100,boxShadow:'0 4px 16px rgba(0,0,0,.2)'}}>
          {toast}
        </div>
      )}

      {/* ── Tipos de cliente ── */}
      <div className="bg-white border border-p-line rounded-xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-p-line2 bg-p-light flex items-center justify-between">
          <div>
            <p className="font-saira font-bold text-sm text-p-ink">Tipos de cliente</p>
            <p className="text-xs text-p-ink2 mt-0.5">Define los tipos y el margen de utilidad para cada uno.</p>
          </div>
          <button onClick={()=>setShowNuevoTipo(!showNuevoTipo)} style={btn}>+ Nuevo tipo</button>
        </div>

        {showNuevoTipo && (
          <div className="px-4 py-3 bg-green-50 border-b border-p-line2 flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-[10px] font-semibold text-p-ink2 uppercase mb-1">Nombre</label>
              <input value={nuevoTipo.nombre} onChange={e=>setNuevoTipo(p=>({...p,nombre:e.target.value}))}
                placeholder="Ej: Empresa" className="border border-p-line rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-p-green w-36"/>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-p-ink2 uppercase mb-1">Margen %</label>
              <input type="number" value={nuevoTipo.margen_pct} onChange={e=>setNuevoTipo(p=>({...p,margen_pct:e.target.value}))}
                placeholder="45" className="border border-p-line rounded-lg px-3 py-1.5 text-sm font-mono focus:outline-none focus:border-p-green w-20"/>
            </div>
            <div className="flex gap-1.5 items-center">
              {COLORS.map(c=>(
                <button key={c} onClick={()=>setNuevoTipo(p=>({...p,color:c}))}
                  style={{width:20,height:20,background:c,borderRadius:4,border:nuevoTipo.color===c?'2px solid #0C1810':'2px solid transparent',cursor:'pointer'}}/>
              ))}
            </div>
            <button onClick={addTipo} disabled={saving} style={btn}>Guardar</button>
            <button onClick={()=>setShowNuevoTipo(false)} style={btnGray}>Cancelar</button>
          </div>
        )}

        {tipos.map(t=>{
          const e = tipoEdit[t.id]
          return (
            <div key={t.id} className="flex items-center gap-3 px-4 py-3 border-b border-p-line2 last:border-0 flex-wrap">
              {e ? (
                <>
                  <input value={e.nombre} onChange={ev=>setTipoEdit(p=>({...p,[t.id]:{...p[t.id],nombre:ev.target.value}}))}
                    className="border border-p-green rounded-lg px-3 py-1.5 text-sm w-36 focus:outline-none"/>
                  <div className="flex items-center gap-1">
                    <input type="number" value={e.margen_pct} onChange={ev=>setTipoEdit(p=>({...p,[t.id]:{...p[t.id],margen_pct:ev.target.value}}))}
                      className="border border-p-green rounded-lg px-2 py-1.5 text-sm font-mono w-20 text-center focus:outline-none"/>
                    <span className="text-sm text-p-ink2">%</span>
                  </div>
                  <div className="flex gap-1">
                    {COLORS.map(c=>(
                      <button key={c} onClick={()=>setTipoEdit(p=>({...p,[t.id]:{...p[t.id],color:c}}))}
                        style={{width:20,height:20,background:c,borderRadius:4,border:e.color===c?'2px solid #0C1810':'2px solid transparent',cursor:'pointer'}}/>
                    ))}
                  </div>
                  <button onClick={()=>saveTipo(t.id)} disabled={saving} style={btn}>Guardar</button>
                  <button onClick={()=>setTipoEdit(p=>{const n={...p};delete n[t.id];return n})} style={btnGray}>Cancelar</button>
                </>
              ) : (
                <>
                  <div style={{width:12,height:12,background:t.color,borderRadius:3,flexShrink:0}}/>
                  <p className="font-semibold text-sm text-p-ink flex-1">{t.nombre}</p>
                  <p className="font-mono text-sm text-p-ink2">{Math.round(t.margen_pct*100)}%</p>
                  <button onClick={()=>startEditTipo(t)} style={{...btnGray,padding:'5px 12px',fontSize:12}}>✏ Editar</button>
                  <button onClick={()=>deleteTipo(t.id)} style={{...btnRed,padding:'5px 12px',fontSize:12}}>✕</button>
                </>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Rubros rápidos ── */}
      <div className="bg-white border border-p-line rounded-xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-p-line2 bg-p-light flex items-center justify-between">
          <div>
            <p className="font-saira font-bold text-sm text-p-ink">Rubros rápidos</p>
            <p className="text-xs text-p-ink2 mt-0.5">Precios default de mano de obra, materiales y servicios.</p>
          </div>
          <button onClick={()=>setShowNuevoRubro(!showNuevoRubro)} style={btn}>+ Nuevo rubro</button>
        </div>

        {showNuevoRubro && (
          <div className="px-4 py-3 bg-green-50 border-b border-p-line2 flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-[10px] font-semibold text-p-ink2 uppercase mb-1">Nombre</label>
              <input value={nuevoRubro.nombre} onChange={e=>setNuevoRubro(p=>({...p,nombre:e.target.value}))}
                placeholder="Ej: Retiro de vidrio" className="border border-p-line rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-p-green w-44"/>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-p-ink2 uppercase mb-1">Precio base</label>
              <input type="number" value={nuevoRubro.precio_base} onChange={e=>setNuevoRubro(p=>({...p,precio_base:e.target.value}))}
                placeholder="15000" className="border border-p-line rounded-lg px-3 py-1.5 text-sm font-mono focus:outline-none focus:border-p-green w-28"/>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-p-ink2 uppercase mb-1">Costo base</label>
              <input type="number" value={nuevoRubro.costo_base} onChange={e=>setNuevoRubro(p=>({...p,costo_base:e.target.value}))}
                placeholder="0" className="border border-amber-300 rounded-lg px-3 py-1.5 text-sm font-mono focus:outline-none focus:border-amber-400 w-28"/>
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={nuevoRubro.visible} onChange={e=>setNuevoRubro(p=>({...p,visible:e.target.checked}))} className="accent-p-green"/>
              Visible en PDF
            </label>
            <button onClick={addRubro} disabled={saving} style={btn}>Guardar</button>
            <button onClick={()=>setShowNuevoRubro(false)} style={btnGray}>Cancelar</button>
          </div>
        )}

        {rubros.map(r=>{
          const e = rubroEdit[r.id]
          return (
            <div key={r.id} className="flex items-center gap-3 px-4 py-3 border-b border-p-line2 last:border-0 flex-wrap">
              {e ? (
                <>
                  <input value={e.nombre} onChange={ev=>setRubroEdit(p=>({...p,[r.id]:{...p[r.id],nombre:ev.target.value}}))}
                    className="border border-p-green rounded-lg px-3 py-1.5 text-sm w-44 focus:outline-none"/>
                  <div className="flex items-center gap-1">
                    <span className="text-sm text-p-ink2">$</span>
                    <input type="number" value={e.precio_base} onChange={ev=>setRubroEdit(p=>({...p,[r.id]:{...p[r.id],precio_base:ev.target.value}}))}
                      placeholder="precio" className="border border-p-green rounded-lg px-2 py-1.5 text-sm font-mono w-28 focus:outline-none"/>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-p-ink2">costo $</span>
                    <input type="number" value={e.costo_base} onChange={ev=>setRubroEdit(p=>({...p,[r.id]:{...p[r.id],costo_base:ev.target.value}}))}
                      placeholder="0" className="border border-amber-300 rounded-lg px-2 py-1.5 text-sm font-mono w-28 focus:outline-none"/>
                  </div>
                  <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                    <input type="checkbox" checked={e.visible} onChange={ev=>setRubroEdit(p=>({...p,[r.id]:{...p[r.id],visible:ev.target.checked}})) } className="accent-p-green"/>
                    Visible en PDF
                  </label>
                  <button onClick={()=>saveRubro(r.id)} disabled={saving} style={btn}>Guardar</button>
                  <button onClick={()=>setRubroEdit(p=>{const n={...p};delete n[r.id];return n})} style={btnGray}>Cancelar</button>
                </>
              ) : (
                <>
                  <p className="font-semibold text-sm text-p-ink flex-1">{r.nombre}</p>
                  <p className="font-mono font-bold text-sm text-p-dark">{moneyARS(r.precio_base)}</p>
                  {r.costo_base > 0 && <p className="font-mono text-xs text-amber-600">costo: {moneyARS(r.costo_base)}</p>}
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${r.visible_en_impresion?'bg-green-100 text-green-700':'bg-gray-100 text-gray-500'}`}>
                    {r.visible_en_impresion?'visible en PDF':'oculto en PDF'}
                  </span>
                  <button onClick={()=>startEditRubro(r)} style={{...btnGray,padding:'5px 12px',fontSize:12}}>✏ Editar</button>
                  <button onClick={()=>deleteRubro(r.id)} style={{...btnRed,padding:'5px 12px',fontSize:12}}>✕</button>
                </>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Categorías de Gasto ── */}
      <div className="bg-white border border-p-line rounded-xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-p-line2 bg-p-light flex items-center justify-between">
          <div>
            <p className="font-saira font-bold text-sm text-p-ink">🏷 Categorías de Gasto</p>
            <p className="text-xs text-p-ink2 mt-0.5">Usadas en Caja e Informes para clasificar los gastos.</p>
          </div>
          <button onClick={()=>setShowNuevaCat(true)} style={btn}>+ Nueva categoría</button>
        </div>

        {showNuevaCat && (
          <div className="px-4 py-3 bg-green-50 border-b border-p-line2 flex flex-wrap gap-3 items-end">
            <input value={nuevaCat.nombre} onChange={e=>setNuevaCat(p=>({...p,nombre:e.target.value}))}
              placeholder="Nombre de categoría…"
              className="border border-p-line rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-p-green w-48"/>
            <div className="flex gap-1.5 items-center">
              {COLORS.map(c=>(
                <button key={c} onClick={()=>setNuevaCat(p=>({...p,color:c}))}
                  style={{width:22,height:22,borderRadius:'50%',background:c,border:nuevaCat.color===c?'3px solid #111':'2px solid transparent',cursor:'pointer'}}/>
              ))}
            </div>
            <button onClick={async ()=>{
              if(!nuevaCat.nombre.trim()) return
              setSaving(true)
              await supabase.from('categorias_gasto').insert({nombre:nuevaCat.nombre.trim(),color:nuevaCat.color,orden:categorias.length+1})
              const {data}=await supabase.from('categorias_gasto').select('*').eq('activo',true).order('orden')
              setCategorias(data??[])
              setNuevaCat({nombre:'',color:COLORS[0]}); setShowNuevaCat(false)
              setSaving(false); ok('Categoría creada ✓')
            }} disabled={saving||!nuevaCat.nombre.trim()} style={btn}>Guardar</button>
            <button onClick={()=>setShowNuevaCat(false)} style={btnGray}>Cancelar</button>
          </div>
        )}

        {categorias.map(cat=>{
          const e = catEdit[cat.id]
          return (
            <div key={cat.id} className="flex items-center gap-3 px-4 py-3 border-b border-p-line2 last:border-0 flex-wrap">
              {e ? (
                <>
                  <input value={e.nombre} onChange={ev=>setCatEdit(p=>({...p,[cat.id]:{...p[cat.id],nombre:ev.target.value}}))}
                    className="border border-p-line rounded-lg px-3 py-1.5 text-sm flex-1 min-w-[160px] focus:outline-none focus:border-p-green"/>
                  <div className="flex gap-1.5">
                    {COLORS.map(c=>(
                      <button key={c} onClick={()=>setCatEdit(p=>({...p,[cat.id]:{...p[cat.id],color:c}}))}
                        style={{width:22,height:22,borderRadius:'50%',background:c,border:e.color===c?'3px solid #111':'2px solid transparent',cursor:'pointer'}}/>
                    ))}
                  </div>
                  <button onClick={async ()=>{
                    setSaving(true)
                    await supabase.from('categorias_gasto').update({nombre:e.nombre,color:e.color}).eq('id',cat.id)
                    if(e.nombre !== cat.nombre) {
                      await supabase.from('gastos').update({categoria:e.nombre}).eq('categoria',cat.nombre)
                    }
                    const {data}=await supabase.from('categorias_gasto').select('*').eq('activo',true).order('orden')
                    setCategorias(data??[])
                    setCatEdit(p=>{const n={...p};delete n[cat.id];return n})
                    setSaving(false); ok('Categoría actualizada ✓')
                  }} disabled={saving} style={btn}>Guardar</button>
                  <button onClick={()=>setCatEdit(p=>{const n={...p};delete n[cat.id];return n})} style={btnGray}>Cancelar</button>
                </>
              ) : (
                <>
                  <span style={{width:14,height:14,borderRadius:'50%',background:cat.color,display:'inline-block',flexShrink:0}}/>
                  <p className="font-semibold text-sm text-p-ink flex-1">{cat.nombre}</p>
                  <button onClick={()=>setCatEdit(p=>({...p,[cat.id]:{nombre:cat.nombre,color:cat.color}}))}
                    style={{...btnGray,padding:'5px 12px',fontSize:12}}>✏ Editar</button>
                  <button onClick={async ()=>{
                    if(!confirm(`¿Desactivar "${cat.nombre}"? Los gastos existentes conservan la categoría.`)) return
                    await supabase.from('categorias_gasto').update({activo:false}).eq('id',cat.id)
                    setCategorias(prev=>prev.filter(c=>c.id!==cat.id))
                    ok('Categoría desactivada')
                  }} style={{...btnRed,padding:'5px 12px',fontSize:12}}>✕</button>
                </>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Colaboradores ─────────────────────────────────────────────────── */}
      <div className="bg-white border border-p-line rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-p-line2">
          <div>
            <p className="font-saira font-bold text-sm text-p-ink">👷 Colaboradores</p>
            <p className="text-xs text-p-ink2 mt-0.5">Técnicos asignables a las Órdenes de Trabajo.</p>
          </div>
          <button onClick={()=>setShowNuevoColab(true)} style={btn}>+ Nuevo colaborador</button>
        </div>

        {showNuevoColab && (
          <div className="px-4 py-3 bg-green-50 border-b border-p-line2 flex gap-3 items-end flex-wrap">
            <input value={nuevoColab} onChange={e=>setNuevoColab(e.target.value)}
              placeholder="Nombre del colaborador…"
              className="border border-p-line rounded-lg px-3 py-1.5 text-sm flex-1 min-w-[160px] focus:outline-none focus:border-p-green"/>
            <label className="flex items-center gap-2 text-sm cursor-pointer whitespace-nowrap">
              <input type="checkbox" checked={nuevoColabColocador} onChange={e=>setNuevoColabColocador(e.target.checked)} className="accent-amber-600 w-4 h-4"/>
              🚚 Colocador externo <span className="text-[10px] text-p-ink2">(recibe remitos)</span>
            </label>
            <button onClick={async ()=>{
              if(!nuevoColab.trim()) return
              setSaving(true)
              const { error } = await supabase.from('colaboradores').insert({nombre:nuevoColab.trim(), es_colocador: nuevoColabColocador})
              if (error) { alert(`⚠ No se pudo crear: ${error.message}`); setSaving(false); return }
              const {data}=await supabase.from('colaboradores').select('*').eq('activo',true).order('nombre')
              setColaboradores(data??[])
              setNuevoColab(''); setNuevoColabColocador(false); setShowNuevoColab(false)
              setSaving(false); ok('Colaborador creado ✓')
            }} disabled={saving||!nuevoColab.trim()} style={btn}>Guardar</button>
            <button onClick={()=>{setShowNuevoColab(false);setNuevoColab('')}} style={btnGray}>Cancelar</button>
          </div>
        )}

        {colaboradores.map(col=>{
          const editando = colabEdit[col.id] !== undefined
          return (
            <div key={col.id} className="flex items-center gap-3 px-4 py-3 border-b border-p-line2 last:border-0 flex-wrap">
              {editando ? (
                <>
                  <input value={colabEdit[col.id]} onChange={e=>setColabEdit(p=>({...p,[col.id]:e.target.value}))}
                    className="border border-p-line rounded-lg px-3 py-1.5 text-sm flex-1 min-w-[160px] focus:outline-none focus:border-p-green"/>
                  <button onClick={async ()=>{
                    setSaving(true)
                    await supabase.from('colaboradores').update({nombre:colabEdit[col.id]}).eq('id',col.id)
                    const {data}=await supabase.from('colaboradores').select('*').eq('activo',true).order('nombre')
                    setColaboradores(data??[])
                    setColabEdit(p=>{const n={...p};delete n[col.id];return n})
                    setSaving(false); ok('Colaborador actualizado ✓')
                  }} disabled={saving} style={btn}>Guardar</button>
                  <button onClick={()=>setColabEdit(p=>{const n={...p};delete n[col.id];return n})} style={btnGray}>Cancelar</button>
                </>
              ) : (
                <>
                  <span className="text-lg">{(col as any).es_colocador ? '🚚' : '👷'}</span>
                  <p className="font-semibold text-sm text-p-ink flex-1">{col.nombre}
                    {(col as any).es_colocador && <span className="ml-2 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">Colocador externo</span>}
                  </p>
                  <button onClick={async ()=>{
                      const nuevo = !(col as any).es_colocador
                      const { error } = await supabase.from('colaboradores').update({es_colocador: nuevo}).eq('id',col.id)
                      if (error) { alert(`⚠ ${error.message}`); return }
                      setColaboradores(prev=>prev.map(c=>c.id===col.id?{...c, es_colocador: nuevo} as any:c))
                      ok(nuevo ? 'Marcado como colocador externo ✓' : 'Ya no es colocador')
                    }}
                    style={{...btnGray,padding:'5px 12px',fontSize:12, background:(col as any).es_colocador?'#b45309':'#6b7280'}}>
                    🚚 {(col as any).es_colocador ? 'Quitar colocador' : 'Hacer colocador'}
                  </button>
                  <button onClick={()=>setColabEdit(p=>({...p,[col.id]:col.nombre}))}
                    style={{...btnGray,padding:'5px 12px',fontSize:12}}>✏ Editar</button>
                  <button onClick={async ()=>{
                    if(!confirm(`¿Desactivar a "${col.nombre}"?`)) return
                    await supabase.from('colaboradores').update({activo:false}).eq('id',col.id)
                    setColaboradores(prev=>prev.filter(c=>c.id!==col.id))
                    ok('Colaborador desactivado')
                  }} style={{...btnRed,padding:'5px 12px',fontSize:12}}>✕</button>
                </>
              )}
            </div>
          )
        })}
        {colaboradores.length === 0 && !showNuevoColab && (
          <p className="text-sm text-p-gray text-center py-6">No hay colaboradores cargados</p>
        )}
      </div>

    </div>
  )
}
