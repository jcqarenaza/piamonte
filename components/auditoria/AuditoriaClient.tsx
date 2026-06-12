'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Registro {
  id: string; tabla: string; operacion: string; registro_id: string
  datos_anteriores: any; usuario_nombre: string; created_at: string
}

const TABLA_LABEL: Record<string,string> = {
  comprobantes:'Comprobante', ventas:'Venta', clientes:'Cliente',
  presupuestos:'Presupuesto', ordenes_servicio:'OS', stock:'Stock',
}

export default function AuditoriaClient() {
  const [registros, setRegistros] = useState<Registro[]>([])
  const [loading, setLoading]     = useState(true)
  const [sel, setSel]             = useState<Registro|null>(null)
  const supabase = createClient()

  useEffect(()=>{
    supabase.from('auditoria').select('*').order('created_at',{ascending:false}).limit(200)
      .then(({data})=>{ setRegistros(data??[]); setLoading(false) })
  },[supabase])

  const fecha = (s:string) => {
    const d = new Date(s)
    return d.toLocaleDateString('es-AR') + ' ' + d.toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'})
  }

  const resumen = (r: Registro) => {
    const d = r.datos_anteriores
    if(!d) return r.registro_id
    return d.cliente_nombre || d.nombre || d.cliente || d.descripcion || r.registro_id
  }

  return (
    <div>
      {loading ? <p className="text-sm text-p-gray text-center py-10">Cargando…</p> : (
        registros.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-4xl mb-3">🛡</p>
            <p className="font-saira font-bold text-p-ink">Sin registros de auditoría</p>
            <p className="text-sm text-p-ink2 mt-1">Los registros aparecen automáticamente cuando alguien elimina datos del sistema.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {registros.map(r=>(
              <div key={r.id} className="bg-white border border-p-line rounded-xl px-4 py-3 shadow-sm flex items-center gap-4 flex-wrap cursor-pointer hover:bg-p-light/50"
                onClick={()=>setSel(sel?.id===r.id?null:r)}>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 shrink-0">
                  {r.operacion}
                </span>
                <span className="text-xs font-bold text-p-dark shrink-0">
                  {TABLA_LABEL[r.tabla]||r.tabla}
                </span>
                <p className="text-sm text-p-ink flex-1 min-w-0 truncate">{resumen(r)}</p>
                <span className="text-[10px] text-p-ink2 shrink-0">{r.usuario_nombre}</span>
                <span className="font-mono text-[10px] text-p-gray shrink-0">{fecha(r.created_at)}</span>
              </div>
            ))}
            {/* Detalle expandido */}
            {sel && (
              <div className="bg-gray-50 border border-p-line rounded-xl p-4 mt-1">
                <p className="font-saira font-bold text-sm text-p-ink mb-2">Datos eliminados — {TABLA_LABEL[sel.tabla]||sel.tabla}</p>
                <pre className="text-[11px] font-mono text-p-ink2 overflow-x-auto whitespace-pre-wrap bg-white border border-p-line2 rounded-lg p-3">
                  {JSON.stringify(sel.datos_anteriores, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )
      )}
    </div>
  )
}
