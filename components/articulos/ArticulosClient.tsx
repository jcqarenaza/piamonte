'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Modal, Field, Input, Select, Empty } from '@/components/ui'
import { moneyARS } from '@/lib/utils/format'

const btn     = { background:'#00A550',color:'#fff',border:'none',borderRadius:10,padding:'10px 20px',fontWeight:700,fontSize:14,cursor:'pointer' } as const
const btnSm   = { ...btn, padding:'6px 14px', fontSize:12 } as const
const btnGray = { ...btnSm, background:'#6b7280' } as const
const btnRed  = { ...btnSm, background:'#ef4444' } as const
const btnBlue = { ...btnSm, background:'#1d4ed8' } as const

interface ArtProv {
  id: string; proveedor_id: string; sku: string|null; precio_costo: number|null
  es_principal: boolean; notas: string|null
  proveedores_compra?: { nombre: string }
}
interface Articulo {
  id: string; codigo_interno: string; descripcion: string; marca: string|null
  categoria: string|null; precio_venta: number|null; costo_promedio: number|null
  stock_minimo: number; stock_actual: number; unidad: string|null
  notas: string|null; activo: boolean
  articulo_proveedores?: ArtProv[]
}
interface Proveedor { id: string; nombre: string }

const emptyForm = {
  descripcion:'', marca:'', categoria:'', precio_venta:'',
  costo_promedio:'', stock_minimo:'0', stock_actual:'0', unidad:'unidad', notas:''
}

export default function ArticulosClient() {
  const [articulos, setArticulos]     = useState<Articulo[]>([])
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [loading, setLoading]         = useState(true)
  const [q, setQ]                     = useState('')
  const [open, setOpen]               = useState(false)
  const [editId, setEditId]           = useState<string|null>(null)
  const [form, setForm]               = useState(emptyForm)
  const [selected, setSelected]       = useState<Articulo|null>(null)
  const [toast, setToast]             = useState('')
  // Panel de proveedores del artículo seleccionado
  const [provForm, setProvForm]       = useState({ proveedor_id:'', sku:'', precio_costo:'', es_principal:false, notas:'' })
  const [addingProv, setAddingProv]   = useState(false)
  // Búsqueda en catálogo para vincular SKU
  const [catQ, setCatQ]               = useState('')
  const [catSugs, setCatSugs]         = useState<any[]>([])

  const supabase = createClient()
  const ok = (msg:string) => { setToast(msg); setTimeout(()=>setToast(''), 2500) }

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('articulos')
      .select('*, articulo_proveedores(*, proveedores_compra(nombre))')
      .eq('activo', true).order('codigo_interno')
    setArticulos(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
    supabase.from('proveedores_compra').select('id,nombre').eq('activo',true).order('nombre')
      .then(({data})=>setProveedores(data??[]))
  }, [supabase])

  // Búsqueda en catálogo para sugerir SKU
  useEffect(() => {
    if (catQ.length < 2) { setCatSugs([]); return }
    supabase.from('catalogo').select('id,codigo,descripcion,precio,proveedor')
      .or(`codigo.ilike.%${catQ}%,descripcion.ilike.%${catQ}%`)
      .limit(6).then(({data})=>setCatSugs(data??[]))
  }, [catQ, supabase])

  function openNuevo() { setForm(emptyForm); setEditId(null); setOpen(true) }
  function openEditar(a: Articulo) {
    setForm({
      descripcion: a.descripcion, marca: a.marca||'', categoria: a.categoria||'',
      precio_venta: a.precio_venta?.toString()||'', costo_promedio: a.costo_promedio?.toString()||'',
      stock_minimo: a.stock_minimo.toString(), stock_actual: a.stock_actual.toString(),
      unidad: a.unidad||'unidad', notas: a.notas||''
    })
    setEditId(a.id); setOpen(true)
  }

  async function save() {
    const payload = {
      descripcion: form.descripcion, marca: form.marca||null, categoria: form.categoria||null,
      precio_venta: form.precio_venta ? +form.precio_venta : null,
      costo_promedio: form.costo_promedio ? +form.costo_promedio : null,
      stock_minimo: +form.stock_minimo||0, stock_actual: +form.stock_actual||0,
      unidad: form.unidad||'unidad', notas: form.notas||null,
    }
    if (editId) {
      await supabase.from('articulos').update(payload).eq('id', editId)
      ok('Artículo actualizado ✓')
    } else {
      await supabase.from('articulos').insert(payload)
      ok('Artículo creado ✓')
    }
    setOpen(false); load()
    if (selected) setSelected(articulos.find(a=>a.id===editId)||null)
  }

  async function eliminar(id:string) {
    if (!confirm('¿Dar de baja este artículo?')) return
    await supabase.from('articulos').update({activo:false}).eq('id',id)
    setSelected(null); load(); ok('Dado de baja')
  }

  async function addProveedor() {
    if (!selected || !provForm.proveedor_id) return
    // Si es_principal → quitar principal de los otros
    if (provForm.es_principal) {
      await supabase.from('articulo_proveedores').update({es_principal:false}).eq('articulo_id',selected.id)
    }
    await supabase.from('articulo_proveedores').upsert({
      articulo_id: selected.id, proveedor_id: provForm.proveedor_id,
      sku: provForm.sku||null, precio_costo: provForm.precio_costo?+provForm.precio_costo:null,
      es_principal: provForm.es_principal, notas: provForm.notas||null,
    }, { onConflict: 'articulo_id,proveedor_id' })
    setProvForm({ proveedor_id:'', sku:'', precio_costo:'', es_principal:false, notas:'' })
    setAddingProv(false); setCatQ(''); setCatSugs([])
    const {data} = await supabase.from('articulos')
      .select('*, articulo_proveedores(*, proveedores_compra(nombre))')
      .eq('id',selected.id).single()
    setSelected(data)
    load(); ok('Proveedor vinculado ✓')
  }

  async function quitarProveedor(apId:string) {
    await supabase.from('articulo_proveedores').delete().eq('id',apId)
    const {data} = await supabase.from('articulos')
      .select('*, articulo_proveedores(*, proveedores_compra(nombre))')
      .eq('id',selected!.id).single()
    setSelected(data); load()
  }

  async function setPrincipal(apId:string) {
    await supabase.from('articulo_proveedores').update({es_principal:false}).eq('articulo_id',selected!.id)
    await supabase.from('articulo_proveedores').update({es_principal:true}).eq('id',apId)
    const {data} = await supabase.from('articulos')
      .select('*, articulo_proveedores(*, proveedores_compra(nombre))')
      .eq('id',selected!.id).single()
    setSelected(data); load()
  }

  const margen = (a:Articulo) => {
    if (!a.precio_venta || !a.costo_promedio || a.costo_promedio===0) return null
    return Math.round(((a.precio_venta - a.costo_promedio) / a.precio_venta)*100)
  }

  const filtrados = articulos.filter(a =>
    !q || a.descripcion.toLowerCase().includes(q.toLowerCase()) ||
    a.codigo_interno.includes(q) || (a.marca||'').toLowerCase().includes(q.toLowerCase()) ||
    (a.categoria||'').toLowerCase().includes(q.toLowerCase())
  )

  return (
    <div className="flex gap-4 h-full">
      {toast && (
        <div style={{position:'fixed',bottom:96,left:'50%',transform:'translateX(-50%)',background:'#00A550',color:'#fff',padding:'10px 24px',borderRadius:12,fontWeight:700,fontSize:14,zIndex:100}}>
          {toast}
        </div>
      )}

      {/* Lista de artículos */}
      <div className="flex-1 min-w-0">
        <div className="flex gap-3 mb-4 flex-wrap">
          <input value={q} onChange={e=>setQ(e.target.value)}
            placeholder="Buscar por código, descripción, marca…"
            className="flex-1 min-w-[180px] border border-p-line rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-p-green bg-white shadow-sm"/>
          <button onClick={openNuevo} style={btn}>+ Nuevo artículo</button>
        </div>

        {loading ? <p className="text-sm text-p-gray text-center py-10">Cargando…</p> :
         filtrados.length===0 ? <Empty msg="Sin artículos cargados." /> : (
          <div className="flex flex-col gap-2">
            {filtrados.map(a => (
              <div key={a.id}
                onClick={()=>setSelected(selected?.id===a.id?null:a)}
                className={`bg-white border rounded-xl p-3 cursor-pointer transition-all shadow-sm ${selected?.id===a.id?'border-p-green ring-1 ring-p-green':'border-p-line hover:border-p-green/50'}`}>
                <div className="flex items-center gap-3 flex-wrap">
                  {/* Código interno — futuro barcode */}
                  <div className="font-mono font-black text-lg text-p-dark bg-p-light px-2.5 py-1 rounded-lg shrink-0 tracking-wider">
                    {a.codigo_interno}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-saira font-bold text-p-ink truncate">{a.descripcion}</p>
                    <div className="flex gap-2 flex-wrap mt-0.5">
                      {a.marca && <span className="text-[10px] text-p-ink2">{a.marca}</span>}
                      {a.categoria && <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full">{a.categoria}</span>}
                      {(a.articulo_proveedores||[]).map(ap=>(
                        <span key={ap.id} className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${ap.es_principal?'bg-green-100 text-green-700':'bg-gray-100 text-gray-500'}`}>
                          {ap.proveedores_compra?.nombre}{ap.sku?` · ${ap.sku}`:''}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-mono font-bold text-p-dark">{a.precio_venta?moneyARS(a.precio_venta):'-'}</p>
                    {margen(a)!==null && <p className="text-[10px] text-p-green font-bold">{margen(a)}% margen</p>}
                    <p className={`text-[10px] font-semibold mt-0.5 ${a.stock_actual<=a.stock_minimo?'text-red-500':'text-p-ink2'}`}>
                      stock: {a.stock_actual}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Panel lateral de detalle */}
      {selected && (
        <div className="w-80 shrink-0 bg-white border border-p-line rounded-2xl p-4 shadow-sm self-start sticky top-4">
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="font-mono font-black text-2xl text-p-dark tracking-wider">{selected.codigo_interno}</p>
              <p className="font-saira font-bold text-p-ink text-sm mt-0.5">{selected.descripcion}</p>
            </div>
            <button onClick={()=>setSelected(null)} className="text-p-gray hover:text-p-ink text-lg leading-none">✕</button>
          </div>

          {/* Código de barras visual (futuro: jsbarcode) */}
          <div className="bg-p-light rounded-xl p-3 text-center mb-3">
            <div className="font-mono text-xs text-p-ink2 tracking-[8px] mb-1">||| {selected.codigo_interno} |||</div>
            <p className="text-[10px] text-p-ink2">Código interno · Etiqueta</p>
          </div>

          {/* Datos */}
          <div className="flex flex-col gap-1.5 mb-4 text-xs">
            {selected.precio_venta && <div className="flex justify-between"><span className="text-p-ink2">Precio venta</span><span className="font-bold">{moneyARS(selected.precio_venta)}</span></div>}
            {selected.costo_promedio && <div className="flex justify-between"><span className="text-p-ink2">Costo prom.</span><span className="font-mono">{moneyARS(selected.costo_promedio)}</span></div>}
            {selected.precio_venta && selected.costo_promedio && (
              <div className="flex justify-between"><span className="text-p-ink2">Margen</span><span className="font-bold text-p-green">{margen(selected)}%</span></div>
            )}
            <div className="flex justify-between border-t border-p-line2 pt-1.5">
              <span className="text-p-ink2">Stock actual</span>
              <span className={`font-bold ${selected.stock_actual<=selected.stock_minimo?'text-red-500':'text-p-dark'}`}>{selected.stock_actual}</span>
            </div>
            <div className="flex justify-between"><span className="text-p-ink2">Stock mínimo</span><span>{selected.stock_minimo}</span></div>
          </div>

          {/* Proveedores */}
          <div className="border-t border-p-line2 pt-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] font-bold text-p-ink2 uppercase tracking-wider">Proveedores</p>
              {!addingProv && (
                <button onClick={()=>setAddingProv(true)} style={{...btnBlue,padding:'3px 10px',fontSize:11}}>+ Agregar</button>
              )}
            </div>

            {/* Lista de proveedores vinculados */}
            {(selected.articulo_proveedores||[]).length===0 && !addingProv && (
              <p className="text-xs text-p-ink2 text-center py-2">Sin proveedores vinculados</p>
            )}
            {(selected.articulo_proveedores||[]).map(ap=>(
              <div key={ap.id} className="bg-p-light rounded-lg p-2 mb-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    {ap.es_principal && <span className="text-[9px] font-bold bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">PRINCIPAL</span>}
                    <span className="text-xs font-bold text-p-dark">{ap.proveedores_compra?.nombre}</span>
                  </div>
                  <div className="flex gap-1">
                    {!ap.es_principal && (
                      <button onClick={()=>setPrincipal(ap.id)} title="Marcar como principal"
                        style={{background:'#00A550',color:'#fff',border:'none',borderRadius:5,padding:'2px 6px',fontSize:10,cursor:'pointer'}}>★</button>
                    )}
                    <button onClick={()=>quitarProveedor(ap.id)}
                      style={{background:'#ef4444',color:'#fff',border:'none',borderRadius:5,padding:'2px 6px',fontSize:10,cursor:'pointer'}}>✕</button>
                  </div>
                </div>
                {ap.sku && <p className="font-mono text-[10px] text-p-ink2 mt-0.5">SKU: {ap.sku}</p>}
                {ap.precio_costo && <p className="text-[10px] text-p-ink2">Costo: {moneyARS(ap.precio_costo)}</p>}
              </div>
            ))}

            {/* Formulario agregar proveedor */}
            {addingProv && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mt-2 flex flex-col gap-2">
                <select value={provForm.proveedor_id}
                  onChange={e=>setProvForm(p=>({...p,proveedor_id:e.target.value}))}
                  className="border border-p-line rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-blue-400 bg-white">
                  <option value="">Seleccionar proveedor…</option>
                  {proveedores.map(p=><option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
                {/* SKU + búsqueda en catálogo */}
                <div className="relative">
                  <input value={catQ} onChange={e=>setCatQ(e.target.value)}
                    placeholder="Buscar SKU en catálogo importado…"
                    className="w-full border border-p-line rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-blue-400 bg-white"/>
                  {catSugs.length>0 && (
                    <div className="absolute z-10 w-full bg-white border border-p-line rounded-xl shadow-lg mt-0.5 overflow-hidden">
                      {catSugs.map(c=>(
                        <button key={c.id} onClick={()=>{
                          setProvForm(p=>({...p, sku:c.codigo, precio_costo:c.precio?.toString()||''}))
                          setCatQ(c.codigo+' — '+c.descripcion.slice(0,30))
                          setCatSugs([])
                        }} className="w-full text-left px-2 py-1.5 hover:bg-p-light text-[10px] border-b border-p-line2 last:border-0">
                          <span className="font-mono font-bold text-p-dark">{c.codigo}</span>
                          <span className="text-p-ink2 ml-1">{c.descripcion.slice(0,35)}</span>
                          {c.precio&&<span className="text-p-green ml-1">{moneyARS(c.precio)}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <input value={provForm.sku} onChange={e=>setProvForm(p=>({...p,sku:e.target.value}))}
                  placeholder="SKU / código del proveedor"
                  className="border border-p-line rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-blue-400"/>
                <input value={provForm.precio_costo} onChange={e=>setProvForm(p=>({...p,precio_costo:e.target.value}))}
                  placeholder="Precio de costo"
                  className="border border-p-line rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-blue-400"/>
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input type="checkbox" checked={provForm.es_principal}
                    onChange={e=>setProvForm(p=>({...p,es_principal:e.target.checked}))} className="accent-p-green"/>
                  Proveedor principal
                </label>
                <div className="flex gap-1">
                  <button onClick={addProveedor} style={{...btnSm,fontSize:11,padding:'5px 10px'}}>✓ Vincular</button>
                  <button onClick={()=>{setAddingProv(false);setCatQ('');setCatSugs([])}} style={{...btnGray,fontSize:11,padding:'5px 10px'}}>Cancelar</button>
                </div>
              </div>
            )}
          </div>

          {/* Acciones */}
          <div className="flex gap-2 mt-4 border-t border-p-line2 pt-3">
            <button onClick={()=>openEditar(selected)} style={{...btnSm,flex:1,textAlign:'center'}}>✏ Editar</button>
            <button onClick={()=>eliminar(selected.id)} style={btnRed}>Baja</button>
          </div>
        </div>
      )}

      {/* Modal ABM */}
      <Modal open={open} onClose={()=>setOpen(false)} title={editId?'Editar artículo':'Nuevo artículo'}>
        <div className="flex flex-col gap-3">
          <Field label="Descripción *">
            <Input value={form.descripcion} onChange={e=>setForm(p=>({...p,descripcion:e.target.value}))} placeholder="PSAS. Toyota Hilux SW4 2019-2024"/>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Marca">
              <Input value={form.marca} onChange={e=>setForm(p=>({...p,marca:e.target.value}))} placeholder="Toyota"/>
            </Field>
            <Field label="Categoría">
              <Input value={form.categoria} onChange={e=>setForm(p=>({...p,categoria:e.target.value}))} placeholder="Parabrisas"/>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Precio de venta">
              <Input value={form.precio_venta} onChange={e=>setForm(p=>({...p,precio_venta:e.target.value}))} placeholder="479000"/>
            </Field>
            <Field label="Costo promedio">
              <Input value={form.costo_promedio} onChange={e=>setForm(p=>({...p,costo_promedio:e.target.value}))} placeholder="310000"/>
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Stock actual">
              <Input type="number" value={form.stock_actual} onChange={e=>setForm(p=>({...p,stock_actual:e.target.value}))}/>
            </Field>
            <Field label="Stock mínimo">
              <Input type="number" value={form.stock_minimo} onChange={e=>setForm(p=>({...p,stock_minimo:e.target.value}))}/>
            </Field>
            <Field label="Unidad">
              <Input value={form.unidad} onChange={e=>setForm(p=>({...p,unidad:e.target.value}))} placeholder="unidad"/>
            </Field>
          </div>
          <Field label="Notas">
            <Input value={form.notas} onChange={e=>setForm(p=>({...p,notas:e.target.value}))} placeholder="Observaciones…"/>
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={()=>setOpen(false)} style={btnGray}>Cancelar</button>
            <button onClick={save} disabled={!form.descripcion} style={{...btn,opacity:!form.descripcion?.5:1}}>Guardar</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
