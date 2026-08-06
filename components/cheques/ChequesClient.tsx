'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Modal, Field, Input, Empty } from '@/components/ui'
import { moneyARS, todayStr } from '@/lib/utils/format'

const btn     = { background:'#00A550',color:'#fff',border:'none',borderRadius:10,padding:'10px 20px',fontWeight:700,fontSize:14,cursor:'pointer' } as const
const btnSm   = { ...btn, padding:'6px 14px', fontSize:12 } as const
const btnGray = { ...btnSm, background:'#6b7280' } as const

type Tipo     = 'tercero'|'propio'
type Modalidad= 'al_dia'|'diferido'
type Formato  = 'fisico'|'echeq'
type Estado   = 'en_cartera'|'depositado'|'endosado'|'emitido'|'cobrado'|'rebotado'|'anulado'

interface Cheque {
  id:string; tipo:Tipo; modalidad:Modalidad; formato:Formato; numero:string; banco:string
  fecha_emision:string; fecha_cobro:string; monto:number
  contraparte:string|null; estado:Estado; destino:string|null
  notas:string|null; created_at:string
}

import { ChequeFields, EMPTY_CHEQUE, BANCOS_DEFAULT, type ChequeData } from '@/components/cheques/ChequeFields'
const ESTADO_LABEL: Record<Estado,string> = {
  en_cartera:'🗃 En cartera', depositado:'🏦 Depositado', endosado:'↗ Endosado',
  emitido:'📝 Emitido', cobrado:'✅ Cobrado', rebotado:'❌ Rebotado', anulado:'🚫 Anulado'
}
const ESTADO_COLOR: Record<Estado,string> = {
  en_cartera:'bg-blue-100 text-blue-700', depositado:'bg-indigo-100 text-indigo-700',
  endosado:'bg-purple-100 text-purple-700', emitido:'bg-amber-100 text-amber-700',
  cobrado:'bg-green-100 text-green-700', rebotado:'bg-red-100 text-red-700', anulado:'bg-gray-100 text-gray-500'
}
const ESTADOS_TERCERO: Estado[] = ['en_cartera','depositado','endosado','cobrado','rebotado','anulado']
const ESTADOS_PROPIO:  Estado[] = ['emitido','cobrado','rebotado','anulado']

const emptyForm = {
  tipo:'tercero' as Tipo, modalidad:'al_dia' as Modalidad, formato:'fisico' as Formato,
  numero:'', banco:'Banco Nación', fecha_emision:todayStr(), fecha_cobro:todayStr(),
  monto:'', contraparte:'', estado:'en_cartera' as Estado, destino:'', notas:''
}

function addDays(fecha:string, dias:number) {
  const d = new Date(fecha+'T00:00:00'); d.setDate(d.getDate()+dias); return d.toISOString().slice(0,10)
}
function diffDays(desde:string, hasta:string) {
  return Math.ceil((new Date(hasta+'T00:00:00').getTime()-new Date(desde+'T00:00:00').getTime())/86400000)
}

// Rangos del dashboard
const RANGOS = [
  { label:'Vencen hoy / Vencidos', key:'hoy',  color:'bg-red-100 border-red-300 text-red-700',   fn:(d:number)=>d<=0 },
  { label:'2 – 7 días',            key:'r7',   color:'bg-orange-100 border-orange-300 text-orange-700', fn:(d:number)=>d>=1&&d<=7 },
  { label:'8 – 15 días',           key:'r15',  color:'bg-amber-100 border-amber-300 text-amber-700',    fn:(d:number)=>d>=8&&d<=15 },
  { label:'16 – 30 días',          key:'r30',  color:'bg-yellow-100 border-yellow-300 text-yellow-700', fn:(d:number)=>d>=16&&d<=30 },
  { label:'31 – 60 días',          key:'r60',  color:'bg-blue-100 border-blue-300 text-blue-700',       fn:(d:number)=>d>=31&&d<=60 },
  { label:'Más de 60 días',        key:'r60p', color:'bg-gray-100 border-gray-300 text-gray-600',       fn:(d:number)=>d>60 },
]

export default function ChequesClient({ userId }: { userId?: string }) {
  const [cheques, setCheques]   = useState<Cheque[]>([])
  const [loading, setLoading]   = useState(true)
  const [tab, setTab]           = useState<'dashboard'|Tipo>('dashboard')
  const [filtroEstado, setFiltroEstado] = useState<'pendientes'|'todos'|Estado>('pendientes')
  const [filtroRango, setFiltroRango]   = useState<string|null>(null)
  const [busqueda, setBusqueda]         = useState('')
  const [expandido, setExpandido] = useState<string|null>(null)
  const [open, setOpen]         = useState(false)
  const [editId, setEditId]     = useState<string|null>(null)
  const [form, setForm]         = useState(emptyForm)
  // Bancos desde la DB
  const [bancos, setBancos]     = useState<string[]>(BANCOS_DEFAULT)
  const [bancosModal, setBancosModal] = useState(false)
  const [nuevoBanco, setNuevoBanco]   = useState('')
  const [impactoModal, setImpactoModal] = useState(false)
  const [impactoCheque, setImpactoCheque] = useState<Cheque|null>(null)
  const [impactoEstado, setImpactoEstado] = useState<Estado>('depositado')
  const [cuentasBanco, setCuentasBanco]   = useState<{id:string;alias:string|null;banco:string;tipo:string}[]>([])
  const [impactoCuentaId, setImpactoCuentaId] = useState('')
  const [impactoFecha, setImpactoFecha]   = useState(todayStr())
  const [proveedores, setProveedores] = useState<{id:string;nombre:string}[]>([])
  const [contraparteOtro, setContraparteOtro] = useState(false)
  const supabase = createClient()

  async function load() {
    setLoading(true)
    const [{ data: chData }, { data: bData }, { data: provData }] = await Promise.all([
      supabase.from('cheques').select('*').order('fecha_cobro').order('created_at',{ascending:false}),
      supabase.from('bancos_cheque').select('nombre').eq('activo',true).order('nombre'),
      supabase.from('proveedores_compra').select('id,nombre').eq('activo',true).order('nombre'),
    ])
    setCheques(chData??[])
    if (bData && bData.length > 0) setBancos(bData.map(b=>b.nombre))
    setProveedores(provData??[])
    setLoading(false)
  }
  useEffect(()=>{ load() },[])

  async function agregarBanco() {
    if (!nuevoBanco.trim()) return
    await supabase.from('bancos_cheque').insert({ nombre: nuevoBanco.trim() })
    setNuevoBanco('')
    const { data } = await supabase.from('bancos_cheque').select('nombre').eq('activo',true).order('nombre')
    if (data) setBancos(data.map(b=>b.nombre))
  }
  async function eliminarBanco(nombre: string) {
    await supabase.from('bancos_cheque').update({ activo: false }).eq('nombre', nombre)
    setBancos(prev=>prev.filter(b=>b!==nombre))
  }

  function abrirNuevo(tipo?: Tipo) {
    setEditId(null)
    setForm({...emptyForm, tipo:tipo||'tercero', estado:tipo==='propio'?'emitido':'en_cartera'}); setContraparteOtro(false)
    setOpen(true)
  }
  function abrirEditar(c:Cheque) {
    setEditId(c.id)
    setForm({ tipo:c.tipo, modalidad:c.modalidad, formato:c.formato||'fisico',
      numero:c.numero, banco:c.banco, fecha_emision:c.fecha_emision, fecha_cobro:c.fecha_cobro,
      monto:String(c.monto), contraparte:c.contraparte||'', estado:c.estado, destino:c.destino||'', notas:c.notas||'' })
    setOpen(true)
  }
  async function guardar() {
    if (!form.numero||!form.monto) return
    // Validar número duplicado (solo en insert)
    if (!editId) {
      const { data: dup } = await supabase.from('cheques')
        .select('id').eq('numero', form.numero).eq('tipo', form.tipo).maybeSingle()
      if (dup) {
        alert(`⛔ Ya existe un cheque ${form.tipo === 'propio' ? 'propio' : 'de tercero'} con el número ${form.numero}.`)
        return
      }
    }
    // Vincular proveedor real: si la contraparte matchea un proveedor del selector, guardar su id
    const provMatch = proveedores.find(p => p.nombre === form.contraparte)
    const payload = {
      tipo:form.tipo, modalidad:form.modalidad, formato:form.formato,
      numero:form.numero, banco:form.banco,
      fecha_emision:form.fecha_emision,
      fecha_cobro:form.modalidad==='al_dia'?form.fecha_emision:form.fecha_cobro,
      monto:+form.monto, contraparte:form.contraparte||null,
      proveedor_id: provMatch?.id ?? null,
      estado:form.estado, destino:form.destino||null, notas:form.notas||null,
      updated_at:new Date().toISOString()
    }
    if (editId) {
      await supabase.from('cheques').update(payload).eq('id',editId)
    } else {
      const { data: chequeIns } = await supabase.from('cheques').insert(payload).select('id').single()
      // Si es cheque propio nuevo → débito automático en CC Banco de La Pampa
      // (fecha del débito = fecha de cobro: es cuando golpea la cuenta, y es la fecha del extracto)
      if (form.tipo === 'propio' && chequeIns?.id) {
        await supabase.from('movimientos_banco').insert({
          cuenta_id: 'e7369b4b-4697-44ca-9303-a077a877e643',
          fecha: payload.fecha_cobro,
          tipo: 'debito',
          concepto: `Cheque propio N° ${form.numero}${form.contraparte ? ` — ${form.contraparte}` : ''}`,
          monto: +form.monto,
          origen_tipo: 'cheque_emitido',
          cheque_id: chequeIns.id,
          notas: form.notas || null,
        })
      }
    }
    setOpen(false); load()
  }
  async function cambiarEstado(id:string, estado:Estado) {
    await supabase.from('cheques').update({estado,updated_at:new Date().toISOString()}).eq('id',id)
    setCheques(prev=>prev.map(c=>c.id===id?{...c,estado}:c))
  }

  async function abrirImpacto(c: Cheque, estado: Estado) {
    const { data } = await supabase.from('cuentas_banco').select('id,alias,banco,tipo').eq('activo',true).order('banco')
    setCuentasBanco(data??[])
    setImpactoCuentaId(data?.[0]?.id||'')
    setImpactoCheque(c); setImpactoEstado(estado); setImpactoFecha(todayStr()); setImpactoModal(true)
  }

  async function confirmarImpacto() {
    if (!impactoCheque) return
    if (!impactoCuentaId) { alert('Seleccioná una cuenta bancaria'); return }
    await cambiarEstado(impactoCheque.id, impactoEstado)
    if (impactoCuentaId) {
      const esTercero = impactoCheque.tipo === 'tercero'
      await supabase.from('movimientos_banco').insert({
        cuenta_id: impactoCuentaId, fecha: impactoFecha,
        tipo: esTercero ? 'credito' : 'debito',
        concepto: esTercero
          ? `Depósito cheque N° ${impactoCheque.numero} — ${impactoCheque.contraparte||''}`
          : `Cobro cheque propio N° ${impactoCheque.numero} — ${impactoCheque.contraparte||''}`,
        monto: impactoCheque.monto,
        origen_tipo: esTercero ? 'cheque_tercero' : 'cheque_propio',
        cheque_id: impactoCheque.id,
      })
    }
    setImpactoModal(false); load()
  }

  const hoy = todayStr()

  // Pendientes activos: en cartera, depositados, endosados (terceros) y emitidos (propios)
  const pendientesActivosTerceros = cheques.filter(c=>c.tipo==='tercero'&&['en_cartera','depositado','endosado'].includes(c.estado))
  const pendientesActivosPropios  = cheques.filter(c=>c.tipo==='propio'&&c.estado==='emitido')

  // Dashboard: toma solo "en cartera" (terceros) y "emitidos" (propios) para los rangos
  // Los depositados ya están en el banco, los endosados ya salieron — no hace falta alertarlos
  const activosParaDash = cheques.filter(c=>
    (c.tipo==='tercero'&&c.estado==='en_cartera') || (c.tipo==='propio'&&c.estado==='emitido')
  )
  const rangoDash = RANGOS.map(r=>({
    ...r,
    cheques: activosParaDash.filter(c=>r.fn(diffDays(hoy,c.fecha_cobro))),
  }))
  const totalDash = rangoDash.reduce((a,r)=>a+r.cheques.reduce((s,c)=>s+c.monto,0),0)

  // Listado de cada tab (terceros / propios)
  function filtradosTipo(tipo:Tipo) {
    const q = busqueda.toLowerCase().trim()
    return cheques.filter(c=>{
      if (c.tipo!==tipo) return false
      if (filtroEstado==='pendientes') {
        if (!['en_cartera','depositado','endosado','emitido'].includes(c.estado)) return false
      } else if (filtroEstado!=='todos') {
        if (c.estado!==filtroEstado) return false
      }
      if (filtroRango) {
        const r = RANGOS.find(r=>r.key===filtroRango)
        if (r && !r.fn(diffDays(hoy,c.fecha_cobro))) return false
      }
      if (q) {
        const match = (c.numero||'').toLowerCase().includes(q) ||
          (c.contraparte||'').toLowerCase().includes(q) ||
          (c.banco||'').toLowerCase().includes(q)
        if (!match) return false
      }
      return true
    }).sort((a,b)=>{
      // Propios: orden numérico descendente; terceros: por fecha cobro
      if (tipo==='propio') return (+b.numero||0)-(+a.numero||0)
      return a.fecha_cobro.localeCompare(b.fecha_cobro)
    })
  }

  function diasLabel(fecha:string) {
    const d = diffDays(hoy,fecha)
    if (d<0) return `${Math.abs(d)}d vencido`
    if (d===0) return 'vence hoy'
    return `${d}d`
  }
  const estadosDisp = form.tipo==='tercero' ? ESTADOS_TERCERO : ESTADOS_PROPIO

  function ChequeRow({ c }:{ c:Cheque }) {
    const vencido  = ['en_cartera','emitido'].includes(c.estado) && c.fecha_cobro<hoy
    const proxVenc = ['en_cartera','emitido'].includes(c.estado) && c.fecha_cobro>=hoy && c.fecha_cobro<=addDays(hoy,7)
    const dias     = diffDays(hoy,c.fecha_cobro)
    return (
      <div onClick={()=>setExpandido(e=>e===c.id?null:c.id)} onDoubleClick={()=>abrirEditar(c)}
        title="Click para acciones · doble click para editar"
        className={`bg-white rounded-xl shadow-sm cursor-pointer hover:border-p-green transition-colors overflow-hidden border ${vencido?'border-l-4 border-l-red-400 border-red-200':proxVenc?'border-l-4 border-l-amber-400 border-amber-100':'border-p-line'}`}>
        <div className="flex items-center gap-2.5 px-3.5 py-2.5 flex-wrap">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${ESTADO_COLOR[c.estado]}`}>{ESTADO_LABEL[c.estado]}</span>
          {c.formato==='echeq'&&<span className="text-[10px] font-bold bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full shrink-0">E-CHQ</span>}
          {c.modalidad==='diferido'&&<span className="text-[10px] font-bold bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full shrink-0">Dif.</span>}
          <span className="font-mono text-xs text-p-dark shrink-0">#{c.numero}</span>
          <span className="text-xs text-p-ink2 shrink-0">{c.banco}</span>
          {c.contraparte&&<span className="text-sm font-semibold text-p-ink truncate" style={{maxWidth:200}}>{c.contraparte}</span>}
          <div className="flex-1 min-w-[8px]"/>
          {['en_cartera','emitido'].includes(c.estado)&&(
            <span className={`text-[10px] font-bold shrink-0 font-mono ${vencido?'text-red-600':dias<=7?'text-amber-600':'text-p-ink2'}`}>
              {diasLabel(c.fecha_cobro)}
            </span>
          )}
          <span className="font-mono text-xs text-p-ink2 shrink-0">{c.fecha_cobro.split('-').reverse().join('/')}</span>
          <span className="font-saira font-bold text-p-ink shrink-0">{moneyARS(c.monto)}</span>
        </div>
        {expandido===c.id&&(
          <div onClick={e=>e.stopPropagation()} className="px-3.5 pb-3 pt-2 border-t border-p-line2 bg-p-light/30">
            <div className="flex flex-wrap gap-3 text-xs text-p-ink2 mb-2.5">
              <span>Emitido: {c.fecha_emision.split('-').reverse().join('/')}</span>
              {c.destino&&<span>Destino: {c.destino}</span>}
              {c.notas&&<span className="italic">"{c.notas}"</span>}
            </div>
            <div className="flex gap-2 flex-wrap">
              <button onClick={()=>abrirEditar(c)} style={btnGray}>✏ Editar</button>
              {c.tipo==='tercero'&&c.estado==='en_cartera'&&<>
                <button onClick={()=>abrirImpacto(c,'depositado')} style={{...btnSm,background:'#4f46e5'}}>🏦 Depositar</button>
                <button onClick={()=>cambiarEstado(c.id,'endosado')} style={{...btnSm,background:'#7c3aed'}}>↗ Endosar</button>
                <button onClick={()=>abrirImpacto(c,'cobrado')} style={{...btnSm,background:'#16a34a'}}>✅ Cobrado</button>
                <button onClick={()=>cambiarEstado(c.id,'rebotado')} style={{...btnSm,background:'#dc2626'}}>❌ Rebotado</button>
              </>}
              {c.tipo==='tercero'&&c.estado==='depositado'&&<>
                <button onClick={()=>abrirImpacto(c,'cobrado')} style={{...btnSm,background:'#16a34a'}}>✅ Acreditado</button>
                <button onClick={()=>cambiarEstado(c.id,'rebotado')} style={{...btnSm,background:'#dc2626'}}>❌ Rebotado</button>
              </>}
              {c.tipo==='propio'&&c.estado==='emitido'&&<>
                <button onClick={()=>abrirImpacto(c,'cobrado')} style={{...btnSm,background:'#16a34a'}}>✅ Cobrado</button>
                <button onClick={()=>cambiarEstado(c.id,'rebotado')} style={{...btnSm,background:'#dc2626'}}>❌ Rebotado</button>
              </>}
              {!['cobrado','rebotado','anulado'].includes(c.estado)&&(
                <button onClick={()=>cambiarEstado(c.id,'anulado')} style={{...btnSm,background:'#6b7280'}}>🚫 Anular</button>
              )}
              {c.estado==='cobrado'&&(
                <button onClick={()=>cambiarEstado(c.id, c.tipo==='propio'?'emitido':'en_cartera')} style={{...btnSm,background:'#f59e0b',color:'#fff'}}>↩ Volver a pendiente</button>
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div>
      {/* Tabs principales */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div className="flex border-b border-p-line">
          {([['dashboard','📊 Dashboard'],['tercero','📥 De terceros'],['propio','📤 Propios']] as const).map(([v,l])=>(
            <button key={v} onClick={()=>{ setTab(v); if(v!=='dashboard') setFiltroRango(null) }}
              style={{padding:'8px 20px',fontWeight:700,fontSize:13,cursor:'pointer',border:'none',background:'none',
                borderBottom:tab===v?'3px solid #00A550':'3px solid transparent',
                color:tab===v?'#00A550':'#6b7280'}}>
              {l}
              {v==='tercero'&&pendientesActivosTerceros.length>0&&<span className="ml-1.5 text-[9px] font-bold bg-blue-500 text-white rounded-full px-1.5">{pendientesActivosTerceros.length}</span>}
              {v==='propio'&&pendientesActivosPropios.length>0&&<span className="ml-1.5 text-[9px] font-bold bg-amber-500 text-white rounded-full px-1.5">{pendientesActivosPropios.length}</span>}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button onClick={()=>setBancosModal(true)} style={{...btnGray,padding:'10px 16px',fontSize:13}}>🏦 Bancos</button>
          <button onClick={()=>abrirNuevo(tab==='dashboard'?undefined:tab as Tipo)} style={btn}>+ Nuevo cheque</button>
        </div>
      </div>

      {/* DASHBOARD */}
      {tab==='dashboard'&&(
        <div>
          <div className="bg-white border border-p-line rounded-2xl p-5 shadow-sm mb-5">
            <div className="flex items-center justify-between mb-4">
              <p className="font-saira font-bold text-p-ink">Cheques activos por vencimiento</p>
              <p className="text-sm text-p-ink2">Total: <span className="font-bold text-p-ink">{moneyARS(totalDash)}</span></p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {rangoDash.map(r=>(
                <div key={r.key} onClick={()=>{
                  // Ir al tab correspondiente (si todos son propios, va a propios; si hay terceros, va a terceros)
                  const hayTerceros = r.cheques.some(c=>c.tipo==='tercero')
                  setTab(hayTerceros ? 'tercero' : 'propio')
                  setFiltroEstado('pendientes')
                  setFiltroRango(r.key)
                }}
                  className={`border rounded-xl p-4 cursor-pointer hover:shadow-md transition-shadow ${r.color} ${r.cheques.length?'opacity-100':'opacity-40'}`}>
                  <p className="text-[11px] font-bold uppercase tracking-wide mb-2">{r.label}</p>
                  <div className="flex items-end justify-between gap-2">
                    <div>
                      <p className="font-saira font-bold text-2xl">{moneyARS(r.cheques.reduce((a,c)=>a+c.monto,0))}</p>
                      <p className="text-[10px] opacity-75 mt-0.5">{r.cheques.length} cheque(s)</p>
                    </div>
                    {r.cheques.length>0&&(
                      <div className="text-right text-[10px] opacity-80 shrink-0">
                        <p>{r.cheques.filter(c=>c.tipo==='tercero').length} terceros</p>
                        <p>{r.cheques.filter(c=>c.tipo==='propio').length} propios</p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Lista unificada de los más urgentes */}
          {(rangoDash[0].cheques.length>0||rangoDash[1].cheques.length>0)&&(
            <div>
              <p className="text-[11px] font-bold text-p-ink2 uppercase tracking-wider mb-3">⚠ Requieren atención (vencen en 7 días o ya vencidos)</p>
              <div className="flex flex-col gap-2">
                {[...rangoDash[0].cheques,...rangoDash[1].cheques]
                  .sort((a,b)=>a.fecha_cobro.localeCompare(b.fecha_cobro))
                  .map(c=><ChequeRow key={c.id} c={c}/>)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB TERCEROS */}
      {tab==='tercero'&&(
        <div>
          {filtroRango&&(
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs bg-blue-100 text-blue-700 font-bold px-3 py-1 rounded-full">
                📅 {RANGOS.find(r=>r.key===filtroRango)?.label}
              </span>
              <button onClick={()=>setFiltroRango(null)} className="text-xs text-p-ink2 hover:text-p-ink underline">✕ Ver todos los rangos</button>
            </div>
          )}
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            {(['pendientes','todos','en_cartera','depositado','endosado','cobrado','rebotado'] as const).map(v=>(
              <button key={v} onClick={()=>setFiltroEstado(v)}
                style={{background:filtroEstado===v?'#00A550':'#fff',color:filtroEstado===v?'#fff':'#4A6655',
                  border:`1.5px solid ${filtroEstado===v?'#00A550':'#C2DDD0'}`,borderRadius:10,padding:'5px 12px',fontWeight:700,fontSize:11,cursor:'pointer'}}>
                {v==='pendientes'?'Activos':v==='todos'?'Todos':ESTADO_LABEL[v as Estado]}
              </button>
            ))}
          </div>
          <input value={busqueda} onChange={e=>setBusqueda(e.target.value)}
            placeholder="Buscar por N°, contraparte o banco…"
            className="w-full border border-p-line rounded-xl px-4 py-2 text-sm mb-3 focus:outline-none focus:border-p-green"/>
          {loading?<p className="text-sm text-center py-8 text-p-gray">Cargando…</p>:
           filtradosTipo('tercero').length===0
            ?<Empty msg="Sin cheques de terceros para este filtro."/>
            :<div className="flex flex-col gap-2">
              {filtradosTipo('tercero').map(c=><ChequeRow key={c.id} c={c}/>)}
            </div>}
        </div>
      )}

      {/* TAB PROPIOS */}
      {tab==='propio'&&(
        <div>
          {filtroRango&&(
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs bg-amber-100 text-amber-700 font-bold px-3 py-1 rounded-full">
                📅 {RANGOS.find(r=>r.key===filtroRango)?.label}
              </span>
              <button onClick={()=>setFiltroRango(null)} className="text-xs text-p-ink2 hover:text-p-ink underline">✕ Ver todos los rangos</button>
            </div>
          )}
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            {(['pendientes','todos','emitido','cobrado','rebotado'] as const).map(v=>(
              <button key={v} onClick={()=>setFiltroEstado(v)}
                style={{background:filtroEstado===v?'#d97706':'#fff',color:filtroEstado===v?'#fff':'#92400e',
                  border:`1.5px solid ${filtroEstado===v?'#d97706':'#fde68a'}`,borderRadius:10,padding:'5px 12px',fontWeight:700,fontSize:11,cursor:'pointer'}}>
                {v==='pendientes'?'Activos':v==='todos'?'Todos':ESTADO_LABEL[v as Estado]}
              </button>
            ))}
          </div>
          <input value={busqueda} onChange={e=>setBusqueda(e.target.value)}
            placeholder="Buscar por N°, contraparte o banco…"
            className="w-full border border-p-line rounded-xl px-4 py-2 text-sm mb-3 focus:outline-none focus:border-p-green"/>
          {loading?<p className="text-sm text-center py-8 text-p-gray">Cargando…</p>:
           filtradosTipo('propio').length===0
            ?<Empty msg="Sin cheques propios para este filtro."/>
            :<div className="flex flex-col gap-2">
              {filtradosTipo('propio').map(c=><ChequeRow key={c.id} c={c}/>)}
            </div>}
        </div>
      )}

      {/* Modal alta/edición */}
      <Modal open={open} onClose={()=>setOpen(false)} title={editId?'Editar cheque':'Nuevo cheque'}>
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tipo">
              <select value={form.tipo} onChange={e=>{
                const t=e.target.value as Tipo
                setForm(p=>({...p,tipo:t,estado:t==='tercero'?'en_cartera':'emitido'}))
              }} className="w-full border border-p-line rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-p-green">
                <option value="tercero">📥 De tercero (recibido)</option>
                <option value="propio">📤 Propio (emitido)</option>
              </select>
            </Field>
            <Field label="Formato">
              <select value={form.formato} onChange={e=>setForm(p=>({...p,formato:e.target.value as Formato}))}
                className="w-full border border-p-line rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-p-green">
                <option value="fisico">📄 Cheque físico</option>
                <option value="echeq">💻 E-Cheq</option>
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Modalidad">
              <select value={form.modalidad} onChange={e=>setForm(p=>({...p,modalidad:e.target.value as Modalidad}))}
                className="w-full border border-p-line rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-p-green">
                <option value="al_dia">Al día</option>
                <option value="diferido">Diferido</option>
              </select>
            </Field>
            <Field label="Banco *">
              <select value={form.banco} onChange={e=>setForm(p=>({...p,banco:e.target.value}))}
                className="w-full border border-p-line rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-p-green">
                {bancos.map(b=><option key={b}>{b}</option>)}
              </select>
            </Field>
          </div>
          <Field label="N° de cheque *"><Input value={form.numero} onChange={e=>setForm(p=>({...p,numero:e.target.value}))} placeholder="12345678"/></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Fecha de emisión"><Input type="date" value={form.fecha_emision} onChange={e=>setForm(p=>({...p,fecha_emision:e.target.value}))}/></Field>
            {form.modalidad==='diferido'&&<Field label="Fecha de cobro"><Input type="date" value={form.fecha_cobro} onChange={e=>setForm(p=>({...p,fecha_cobro:e.target.value}))}/></Field>}
          </div>
          <Field label="Monto *"><Input value={form.monto} onChange={e=>setForm(p=>({...p,monto:e.target.value}))} placeholder="$"/></Field>
          <Field label={form.tipo==='tercero'?'Recibido de':'Emitido a'}>
            {form.tipo === 'propio' ? (
              <>
                <select
                  value={contraparteOtro ? '__otro__' : (form.contraparte || '')}
                  onChange={e=>{
                    if (e.target.value === '__otro__') { setContraparteOtro(true); setForm(p=>({...p,contraparte:''})) }
                    else { setContraparteOtro(false); setForm(p=>({...p,contraparte:e.target.value})) }
                  }}
                  className="w-full border border-p-line rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-p-green">
                  <option value="">Seleccionar proveedor…</option>
                  {proveedores.map(p=><option key={p.id} value={p.nombre}>{p.nombre}</option>)}
                  <option value="__otro__">Otro…</option>
                </select>
                {contraparteOtro && (
                  <Input style={{marginTop:6}} value={form.contraparte} onChange={e=>setForm(p=>({...p,contraparte:e.target.value}))} placeholder="Escribí el nombre del proveedor…"/>
                )}
              </>
            ) : (
              <Input value={form.contraparte} onChange={e=>setForm(p=>({...p,contraparte:e.target.value}))} placeholder="Nombre del cliente…"/>
            )}
          </Field>
          <Field label="Estado">
            <select value={form.estado} onChange={e=>setForm(p=>({...p,estado:e.target.value as Estado}))}
              className="w-full border border-p-line rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-p-green">
              {estadosDisp.map(s=><option key={s} value={s}>{ESTADO_LABEL[s]}</option>)}
            </select>
          </Field>
          {['depositado','endosado'].includes(form.estado)&&(
            <Field label={form.estado==='endosado'?'Endosado a':'Depositado en (cuenta)'}>
              <Input value={form.destino} onChange={e=>setForm(p=>({...p,destino:e.target.value}))} placeholder="…"/>
            </Field>
          )}
          <Field label="Notas"><Input value={form.notas} onChange={e=>setForm(p=>({...p,notas:e.target.value}))} placeholder="Opcional…"/></Field>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={()=>setOpen(false)} style={btnGray}>Cancelar</button>
            <button onClick={guardar} disabled={!form.numero||!form.monto}
              style={{...btn,opacity:(!form.numero||!form.monto)?.5:1}}>
              {editId?'Guardar cambios':'Registrar cheque'}
            </button>
          </div>
        </div>
      </Modal>
      {/* Modal gestión de bancos */}
      <Modal open={bancosModal} onClose={()=>setBancosModal(false)} title="Gestionar bancos">
        <div className="flex flex-col gap-3">
          <p className="text-[11px] text-p-ink2">Estos bancos aparecen en todos los formularios de cheque del sistema.</p>
          <div className="flex gap-2">
            <Input value={nuevoBanco} onChange={e=>setNuevoBanco(e.target.value)}
              placeholder="Nombre del banco…"
              onKeyDown={e=>e.key==='Enter'&&agregarBanco()}/>
            <button onClick={agregarBanco} style={btnSm} disabled={!nuevoBanco.trim()}>+ Agregar</button>
          </div>
          <div className="flex flex-col gap-1 max-h-64 overflow-y-auto">
            {bancos.map(b=>(
              <div key={b} className="flex items-center justify-between bg-white border border-p-line rounded-lg px-3 py-2">
                <span className="text-sm text-p-ink">🏦 {b}</span>
                {!['Banco de La Pampa','Banco Nación','Otro'].includes(b) && (
                  <button onClick={()=>eliminarBanco(b)} className="text-red-400 text-xs hover:text-red-600">✕</button>
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-end pt-1">
            <button onClick={()=>setBancosModal(false)} style={btnGray}>Cerrar</button>
          </div>
        </div>
      </Modal>
      {/* Modal impacto bancario */}
      <Modal open={impactoModal} onClose={()=>setImpactoModal(false)} title="Impacto en cuenta bancaria">
        {impactoCheque&&(
          <div className="flex flex-col gap-3">
            <div className="bg-p-light rounded-xl p-3 text-sm">
              <p className="font-bold text-p-ink">Cheque N° {impactoCheque.numero}</p>
              <p className="text-p-ink2 mt-0.5">{impactoCheque.contraparte} · {moneyARS(impactoCheque.monto)}</p>
              <p className="text-[10px] text-p-ink2 mt-1">{impactoCheque.tipo==='tercero'?'→ Crédito en la cuenta seleccionada':'→ Débito en la cuenta seleccionada'}</p>
            </div>
            {cuentasBanco.length===0 ? (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-700">
                ⚠ No hay cuentas cargadas todavía. El cheque se marcará pero <strong>no generará movimiento bancario</strong>. Agregá una cuenta en el módulo Banco.
              </div>
            ) : (
              <Field label="¿En qué cuenta impacta?">
                <select value={impactoCuentaId} onChange={e=>setImpactoCuentaId(e.target.value)}
                  className="w-full border border-p-line rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-p-green">
                  <option value="" disabled>Seleccioná una cuenta…</option>
                  {cuentasBanco.map(c=><option key={c.id} value={c.id}>🏦 {c.alias||c.banco} ({c.tipo==='Cuenta Corriente'?'CC':'CA'})</option>)}
                </select>
              </Field>
            )}
            <Field label="Fecha del movimiento">
              <Input type="date" value={impactoFecha} onChange={e=>setImpactoFecha(e.target.value)}/>
            </Field>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={()=>setImpactoModal(false)} style={btnGray}>Cancelar</button>
              <button onClick={confirmarImpacto} style={{...btn,opacity:!impactoCuentaId?0.5:1}} disabled={!impactoCuentaId}>✓ Confirmar</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
