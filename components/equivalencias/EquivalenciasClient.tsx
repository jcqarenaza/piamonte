'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

const moneyARS = (n:number) => '$'+Math.round(n).toLocaleString('es-AR')
const btn  = { background:'#00A550',color:'#fff',border:'none',borderRadius:8,padding:'8px 16px',fontWeight:700,fontSize:13,cursor:'pointer' } as const
const btnGray = { ...btn, background:'#6b7280' } as const
const btnRed  = { ...btn, background:'#ef4444' } as const
const btnBlue = { ...btn, background:'#1d4ed8' } as const

const PROV_COLOR: Record<string,string> = {
  GAMMA: '#059669', MALATESTA: '#2563eb', SEKURIT: '#7c3aed'
}

interface Pieza {
  id: string; proveedor: string; codigo: string|null
  descripcion: string; pos: string|null; costo_neto: number
  precio_lista: number; grupo_id: number|null
}

type Modo = 'buscar' | 'enlazando'

export default function EquivalenciasClient() {
  const [q, setQ]               = useState('')
  const [resultados, setRes]    = useState<Pieza[]>([])
  const [grupos, setGrupos]     = useState<Map<number, Pieza[]>>(new Map())
  const [loading, setLoading]   = useState(false)
  const [modo, setModo]         = useState<Modo>('buscar')
  const [piezaA, setPiezaA]     = useState<Pieza|null>(null)  // pieza a enlazar
  const [qB, setQB]             = useState('')
  const [resB, setResB]         = useState<Pieza[]>([])
  const [toast, setToast]       = useState('')
  const supabase = createClient()

  function ok(msg:string){ setToast(msg); setTimeout(()=>setToast(''),2500) }

  // Búsqueda principal
  const buscar = useCallback(async () => {
    if(q.trim().length < 2){ setRes([]); setGrupos(new Map()); return }
    setLoading(true)
    const POS_KW: Record<string,string> = {
      'PARA':'PARABRISAS','PARABRISAS':'PARABRISAS','PARABRISA':'PARABRISAS',
      'LUNETA':'LUNETA','TECHO':'TECHO','PUERTA':'PUERTA',
    }
    const words = q.trim().toUpperCase().split(/\s+/).filter(Boolean)
    const posWord = words.find(w=>POS_KW[w])
    const nonPos  = words.filter(w=>!POS_KW[w])
    const main    = nonPos[0]||words[0]

    let dbQ = supabase.from('catalogo')
      .select('id,proveedor,codigo,descripcion,pos,costo_neto,precio_lista,grupo_id')
      .order('proveedor').limit(80)

    if(posWord && nonPos.length > 0) dbQ = dbQ.eq('pos', POS_KW[posWord]).ilike('descripcion',`%${main}%`)
    else if(posWord) dbQ = dbQ.eq('pos', POS_KW[posWord])
    else dbQ = dbQ.or(`descripcion.ilike.%${main}%,marca.ilike.%${main}%`)

    const { data } = await dbQ
    const piezas = ((data??[]) as Pieza[]).filter(p =>
      nonPos.slice(1).every(w =>
        p.descripcion.toUpperCase().includes(w) || (p.codigo||'').toUpperCase().includes(w)
      )
    )
    setRes(piezas)

    // Agrupar por grupo_id
    const m = new Map<number, Pieza[]>()
    for(const p of piezas){
      if(p.grupo_id == null) continue
      if(!m.has(p.grupo_id)) m.set(p.grupo_id, [])
      m.get(p.grupo_id)!.push(p)
    }
    setGrupos(m)
    setLoading(false)
  }, [q, supabase])

  useEffect(() => { const t = setTimeout(buscar, 350); return ()=>clearTimeout(t) }, [buscar])

  // Búsqueda de pieza B (para enlazar)
  useEffect(() => {
    if(qB.trim().length < 2){ setResB([]); return }
    supabase.from('catalogo').select('id,proveedor,codigo,descripcion,pos,costo_neto,precio_lista,grupo_id')
      .or(`descripcion.ilike.%${qB}%,marca.ilike.%${qB}%`).order('proveedor').limit(20)
      .then(({data})=>setResB((data??[]) as Pieza[]))
  }, [qB, supabase])

  // Enlazar dos piezas (o una pieza a un grupo existente)
  async function enlazar(piezaB: Pieza) {
    if(!piezaA) return
    // Determinar el grupo_id a usar
    let grupoId = piezaA.grupo_id || piezaB.grupo_id
    if(!grupoId){
      // Crear nuevo grupo: obtener el max grupo_id + 1
      const { data } = await supabase.from('catalogo').select('grupo_id').order('grupo_id',{ascending:false}).limit(1).not('grupo_id','is',null)
      grupoId = ((data?.[0] as any)?.grupo_id ?? 0) + 1
    }
    // Actualizar ambas piezas (y todas las del grupo anterior si las hay)
    const idsToUpdate: string[] = [piezaA.id, piezaB.id]
    if(piezaA.grupo_id){
      const { data } = await supabase.from('catalogo').select('id').eq('grupo_id',piezaA.grupo_id)
      idsToUpdate.push(...((data??[]) as any[]).map((r:any)=>r.id))
    }
    if(piezaB.grupo_id && piezaB.grupo_id !== piezaA.grupo_id){
      const { data } = await supabase.from('catalogo').select('id').eq('grupo_id',piezaB.grupo_id)
      idsToUpdate.push(...((data??[]) as any[]).map((r:any)=>r.id))
    }
    const ids = [...new Set(idsToUpdate)]
    await supabase.from('catalogo').update({grupo_id: grupoId}).in('id', ids)
    ok('✓ Piezas enlazadas como equivalencias')
    setModo('buscar'); setPiezaA(null); setQB(''); setResB([])
    buscar()
  }

  // Desenlazar una pieza
  async function desenlazar(pieza: Pieza) {
    if(!confirm(`¿Quitar ${pieza.proveedor} de este grupo de equivalencias?`)) return
    await supabase.from('catalogo').update({grupo_id: null}).eq('id', pieza.id)
    ok('Pieza desenlazada')
    buscar()
  }

  // Iniciar enlace manual
  function iniciarEnlace(p: Pieza) {
    setPiezaA(p); setModo('enlazando'); setQB(''); setResB([])
  }

  // Piezas sin grupo (para enlazar manualmente)
  const sinGrupo = resultados.filter(p => p.grupo_id == null)
  // Piezas con grupo, deduplicadas
  const conGrupo = [...new Set(resultados.filter(p=>p.grupo_id!=null).map(p=>p.grupo_id!))]

  return (
    <div className="max-w-3xl">
      {toast && (
        <div style={{position:'fixed',bottom:96,left:'50%',transform:'translateX(-50%)',background:'#00A550',color:'#fff',padding:'10px 24px',borderRadius:12,fontWeight:700,fontSize:14,zIndex:100,boxShadow:'0 4px 16px rgba(0,0,0,.2)'}}>
          {toast}
        </div>
      )}

      {/* ── Modo: enlazando ── */}
      {modo === 'enlazando' && piezaA && (
        <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4 mb-5">
          <div className="flex items-center justify-between mb-3">
            <p className="font-saira font-bold text-blue-800">Enlazando pieza</p>
            <button onClick={()=>{setModo('buscar');setPiezaA(null)}} style={btnGray}>Cancelar</button>
          </div>
          <div className="bg-white rounded-lg p-3 mb-3 border border-blue-100">
            <div className="flex items-center gap-2">
              <span className="font-bold text-xs px-2 py-0.5 rounded-full text-white" style={{background:PROV_COLOR[piezaA.proveedor]||'#6b7280'}}>{piezaA.proveedor}</span>
              <p className="text-sm font-medium text-p-ink">{piezaA.descripcion}</p>
              <p className="ml-auto font-mono text-sm font-bold text-p-dark">{moneyARS(piezaA.costo_neto)}</p>
            </div>
          </div>
          <p className="text-sm text-blue-700 mb-2">Buscá la pieza equivalente en otro proveedor:</p>
          <div className="relative">
            <input value={qB} onChange={e=>setQB(e.target.value)} placeholder="Buscar pieza equivalente…"
              className="w-full border border-blue-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-blue-400"/>
            {resB.length > 0 && (
              <div className="absolute z-20 top-full left-0 right-0 bg-white border border-p-line rounded-xl shadow-xl max-h-64 overflow-y-auto mt-1">
                {resB.filter(p=>p.id!==piezaA.id).map(p=>(
                  <button key={p.id} onClick={()=>enlazar(p)}
                    className="w-full text-left px-3 py-2.5 hover:bg-p-light border-b border-p-line2 last:border-0 flex items-center gap-2">
                    <span className="font-bold text-[10px] px-2 py-0.5 rounded-full text-white shrink-0" style={{background:PROV_COLOR[p.proveedor]||'#6b7280'}}>{p.proveedor}</span>
                    <span className="text-sm text-p-ink flex-1 min-w-0 truncate">{p.descripcion}</span>
                    {p.grupo_id && <span className="text-[10px] text-blue-500 shrink-0">grupo {p.grupo_id}</span>}
                    <span className="font-mono text-sm font-bold text-p-dark shrink-0">{moneyARS(p.costo_neto)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Búsqueda ── */}
      <div className="mb-5">
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar pieza (ej: fiesta parabrisas, gol luneta…)"
          className="w-full border border-p-line rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-p-green shadow-sm bg-white"/>
        {loading && <p className="text-xs text-p-gray mt-1.5 px-1">Buscando…</p>}
      </div>

      {resultados.length === 0 && q.length >= 2 && !loading && (
        <p className="text-sm text-p-gray text-center py-10">Sin resultados para "{q}".</p>
      )}

      {/* ── Grupos con equivalencias ── */}
      {conGrupo.length > 0 && (
        <div className="mb-6">
          <p className="text-[11px] font-bold text-p-ink2 uppercase tracking-wider mb-2">Con equivalencias ({conGrupo.length} grupos)</p>
          <div className="flex flex-col gap-3">
            {conGrupo.map(gid => {
              const miembros = grupos.get(gid)!
              return (
                <div key={gid} className="bg-white border-2 border-p-green rounded-xl overflow-hidden shadow-sm">
                  <div className="bg-p-light px-4 py-2 flex items-center justify-between">
                    <p className="text-xs font-bold text-p-dark">Grupo #{gid} · {miembros[0].descripcion.replace(/^(PSAS\.|PB\s+|E-PSAS\.|E-)/i,'').trim()}</p>
                    <span className="text-[10px] text-p-green font-bold">{miembros.length} proveedores</span>
                  </div>
                  {miembros.map(m=>(
                    <div key={m.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-p-line2 last:border-0">
                      <span className="font-bold text-[10px] px-2 py-0.5 rounded-full text-white shrink-0" style={{background:PROV_COLOR[m.proveedor]||'#6b7280'}}>{m.proveedor}</span>
                      <p className="text-sm text-p-ink flex-1 min-w-0 truncate">{m.descripcion}</p>
                      <p className="font-mono text-sm font-bold text-p-dark shrink-0">{moneyARS(m.costo_neto)}</p>
                      <button onClick={()=>desenlazar(m)} className="text-red-400 text-xs hover:text-red-600 shrink-0">✕</button>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Sin equivalencias ── */}
      {sinGrupo.length > 0 && (
        <div>
          <p className="text-[11px] font-bold text-p-ink2 uppercase tracking-wider mb-2">Sin equivalencias ({sinGrupo.length})</p>
          <div className="flex flex-col gap-2">
            {sinGrupo.map(p=>(
              <div key={p.id} className="bg-white border border-p-line rounded-xl flex items-center gap-3 px-4 py-2.5 shadow-sm">
                <span className="font-bold text-[10px] px-2 py-0.5 rounded-full text-white shrink-0" style={{background:PROV_COLOR[p.proveedor]||'#6b7280'}}>{p.proveedor}</span>
                <p className="text-sm text-p-ink flex-1 min-w-0 truncate">{p.descripcion}</p>
                <p className="text-[10px] text-p-gray shrink-0">{p.pos||'?'}</p>
                <p className="font-mono text-sm font-bold text-p-dark shrink-0">{moneyARS(p.costo_neto)}</p>
                <button onClick={()=>iniciarEnlace(p)} style={{...btn,padding:'5px 12px',fontSize:11}}>Enlazar</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Stats ── */}
      {q.length < 2 && (
        <div className="text-center py-16 text-p-gray">
          <p className="text-4xl mb-3">🔗</p>
          <p className="font-saira font-bold text-p-ink text-lg">Equivalencias entre proveedores</p>
          <p className="text-sm mt-1">Buscá una pieza para ver y gestionar sus equivalencias entre GAMMA, Malatesta y Sekurit.</p>
        </div>
      )}
    </div>
  )
}
