'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

interface TipoCliente { id:string; nombre:string; margen_pct:number; color:string; activo:boolean }
interface RubroPrecio { id:string; nombre:string; precio_base:number; visible_en_impresion:boolean; activo:boolean; orden:number }

const btn  = { background:'#00A550',color:'#fff',border:'none',borderRadius:8,padding:'8px 16px',fontWeight:700,fontSize:13,cursor:'pointer' } as const
const btnRed  = { ...btn, background:'#ef4444' } as const
const btnGray = { ...btn, background:'#6b7280' } as const

const COLORS = ['#2563eb','#d97706','#7c3aed','#dc2626','#059669','#0891b2','#475569']

function moneyARS(n:number){ return '$'+Math.round(n).toLocaleString('es-AR') }

export default function ConfiguracionClient() {
  const [tipos, setTipos]   = useState<TipoCliente[]>([])
  const [rubros, setRubros] = useState<RubroPrecio[]>([])
  const [saving, setSaving] = useState(false)
  const [toast, setToast]   = useState('')
  const supabase = createClient()

  // Edición inline de tipos
  const [tipoEdit, setTipoEdit] = useState<Record<string,{nombre:string;margen_pct:string;color:string}>>({})
  const [nuevoTipo, setNuevoTipo] = useState({ nombre:'', margen_pct:'', color:COLORS[0] })
  const [showNuevoTipo, setShowNuevoTipo] = useState(false)

  // Edición inline de rubros
  const [rubroEdit, setRubroEdit] = useState<Record<string,{nombre:string;precio_base:string;visible:boolean}>>({})
  const [nuevoRubro, setNuevoRubro] = useState({ nombre:'', precio_base:'', visible:false })
  const [showNuevoRubro, setShowNuevoRubro] = useState(false)

  useEffect(() => {
    supabase.from('tipos_cliente').select('*').order('nombre').then(({data})=>setTipos(data??[]))
    supabase.from('rubros_precio').select('*').eq('activo',true).order('orden').then(({data})=>setRubros(data??[]))
  },[supabase])

  function ok(msg:string){ setToast(msg); setTimeout(()=>setToast(''),2500) }

  // ── Tipos de cliente ──────────────────────────────────────────────────────
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
    if(!confirm('¿Borrar este tipo? Los clientes que lo tenían quedarán sin tipo asignado.')) return
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

  // ── Rubros ────────────────────────────────────────────────────────────────
  function startEditRubro(r:RubroPrecio){
    setRubroEdit(p=>({...p,[r.id]:{nombre:r.nombre,precio_base:String(r.precio_base),visible:r.visible_en_impresion}}))
  }
  async function saveRubro(id:string){
    const e=rubroEdit[id]; if(!e) return
    setSaving(true)
    await supabase.from('rubros_precio').update({nombre:e.nombre,precio_base:+e.precio_base,visible_en_impresion:e.visible}).eq('id',id)
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
    await supabase.from('rubros_precio').insert({nombre:nuevoRubro.nombre,precio_base:+nuevoRubro.precio_base,visible_en_impresion:nuevoRubro.visible,orden})
    const {data}=await supabase.from('rubros_precio').select('*').eq('activo',true).order('orden')
    setRubros(data??[]); setNuevoRubro({nombre:'',precio_base:'',visible:false}); setShowNuevoRubro(false)
    setSaving(false); ok('Rubro creado ✓')
  }

  return (
    <div className="max-w-2xl flex flex-col gap-8">
      {/* Toast */}
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

        {/* Nuevo tipo */}
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
            <div>
              <label className="block text-[10px] font-semibold text-p-ink2 uppercase mb-1">Color</label>
              <div className="flex gap-1">
                {COLORS.map(c=>(
                  <button key={c} onClick={()=>setNuevoTipo(p=>({...p,color:c}))}
                    style={{width:22,height:22,background:c,borderRadius:4,border:nuevoTipo.color===c?'2px solid #0C1810':'2px solid transparent',cursor:'pointer'}}/>
                ))}
              </div>
            </div>
            <button onClick={addTipo} disabled={saving} style={btn}>Guardar</button>
            <button onClick={()=>setShowNuevoTipo(false)} style={btnGray}>Cancelar</button>
          </div>
        )}

        {/* Lista */}
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
                  <p className="font-mono text-sm text-p-dark font-bold">{Math.round(t.margen_pct*100)}% margen</p>
                  <p className="text-xs text-p-ink2">precio = costo × {(1+t.margen_pct).toFixed(2)}</p>
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
                      className="border border-p-green rounded-lg px-2 py-1.5 text-sm font-mono w-28 focus:outline-none"/>
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
    </div>
  )
}
