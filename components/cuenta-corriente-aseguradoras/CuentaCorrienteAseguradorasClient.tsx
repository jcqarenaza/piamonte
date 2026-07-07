'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Modal, Field, Input, Empty } from '@/components/ui'
import { moneyARS, todayStr } from '@/lib/utils/format'

interface Aseg { id:string; nombre:string }
interface Mov { id:string; fecha:string; tipo:string; descripcion:string; debe:number; haber:number; notas:string|null; comprobante_id:string|null }
interface Saldo { aseguradora_id:string; nombre:string; total_debe:number; total_haber:number; saldo:number; facturas:number }
interface FacturaPendiente { id:string; numero:number; fecha:string; total:number; nro_cbte_afip:number|null }
interface Retencion { tipo:'ganancias'|'iva'|'iibb'|'suss'|'otras'; label:string; monto:string; nro_cert:string; base:string }

const FORMAS = ['Transferencia','Multipay','Cheque','Efectivo','Otro']
const RET_TIPOS: {tipo: Retencion['tipo']; label:string}[] = [
  { tipo:'ganancias', label:'Ret. Ganancias' },
  { tipo:'iva',       label:'Ret. IVA' },
  { tipo:'iibb',      label:'Ret. IIBB' },
  { tipo:'suss',      label:'Ret. SUSS' },
  { tipo:'otras',     label:'Otras retenciones' },
]

const btn     = { background:'#00A550',color:'#fff',border:'none',borderRadius:10,padding:'10px 20px',fontWeight:700,fontSize:14,cursor:'pointer' } as const
const btnSm   = { ...btn, padding:'7px 14px', fontSize:12 } as const
const btnGray = { ...btnSm, background:'#6b7280' } as const

function toNum(s:string){ return parseFloat(s.replace(',','.')) || 0 }

export default function CuentaCorrienteAseguradorasClient() {
  const [saldos, setSaldos]   = useState<Saldo[]>([])
  const [sel, setSel]         = useState<Saldo|null>(null)
  const [movs, setMovs]       = useState<Mov[]>([])
  const [q, setQ]             = useState('')
  const [loading, setLoading] = useState(false)

  // Modal cobro
  const [cobroModal, setCobroModal] = useState(false)
  const [facturasPend, setFacturasPend] = useState<FacturaPendiente[]>([])
  const [factSel, setFactSel] = useState<Record<string,boolean>>({})
  const [forma, setForma]     = useState('Transferencia')
  const [banco, setBanco]     = useState('')
  const [cbu, setCbu]         = useState('')
  const [ref, setRef]         = useState('')
  const [nroOp, setNroOp]     = useState('')
  const [fecha, setFecha]     = useState(todayStr())
  const [retenciones, setRetenciones] = useState<Retencion[]>([
    { tipo:'ganancias', label:'Ret. Ganancias', monto:'', nro_cert:'', base:'' },
    { tipo:'iva',       label:'Ret. IVA',       monto:'', nro_cert:'', base:'' },
    { tipo:'iibb',      label:'Ret. IIBB',      monto:'', nro_cert:'', base:'' },
    { tipo:'suss',      label:'Ret. SUSS',      monto:'', nro_cert:'', base:'' },
    { tipo:'otras',     label:'Otras ret.',     monto:'', nro_cert:'', base:'' },
  ])
  const [savingCobro, setSavingCobro] = useState(false)

  // Modal edición cobro
  const [editCobro, setEditCobro] = useState<any|null>(null)
  const [editForm, setEditForm] = useState({ ret_ganancias:'', ret_iva:'', ret_iibb:'', ret_suss:'', ret_otras:'', monto_neto:'', referencia:'', nro_op:'', notas:'' })
  const [savingEdit, setSavingEdit] = useState(false)

  const supabase = createClient()

  useEffect(()=>{ loadSaldos() },[])

  async function loadSaldos() {
    const [{ data: movs }, { data: asegRows }] = await Promise.all([
      supabase.from('cuenta_corriente_aseguradoras').select('aseguradora_id,debe,haber,tipo'),
      supabase.from('aseguradoras').select('id,nombre'),
    ])
    if (!movs) return
    const nombreMap = new Map((asegRows??[]).map((a:any) => [a.id, a.nombre]))
    const map = new Map<string, Saldo>()
    for (const r of movs as any[]) {
      const id  = r.aseguradora_id
      const nom = nombreMap.get(id) || ''
      if (!map.has(id)) map.set(id, { aseguradora_id:id, nombre:nom, total_debe:0, total_haber:0, saldo:0, facturas:0 })
      const s = map.get(id)!
      s.total_debe  += +r.debe
      s.total_haber += +r.haber
      if (r.tipo === 'factura') s.facturas++
    }
    const arr = [...map.values()].map(s=>({...s, saldo: s.total_debe - s.total_haber}))
      .sort((a,b)=>b.saldo-a.saldo)
    setSaldos(arr)
  }

  async function loadMovs(asegId: string) {
    setLoading(true)
    const { data } = await supabase.from('cuenta_corriente_aseguradoras')
      .select('*').eq('aseguradora_id', asegId).order('fecha',{ascending:false}).order('created_at',{ascending:false})
    setMovs(data??[])
    setLoading(false)
  }

  function seleccionar(s: Saldo) {
    if (sel?.aseguradora_id === s.aseguradora_id) { setSel(null); setMovs([]); return }
    setSel(s); loadMovs(s.aseguradora_id)
  }

  async function abrirCobro() {
    if (!sel) return
    // Traer facturas pendientes (con debe > 0 y sin cobro vinculado)
    const { data: movsCc } = await supabase.from('cuenta_corriente_aseguradoras')
      .select('comprobante_id, debe, haber').eq('aseguradora_id', sel.aseguradora_id)
    
    // Calcular saldo por comprobante
    const saldoPorComp = new Map<string, number>()
    for (const m of (movsCc??[]) as any[]) {
      if (!m.comprobante_id) continue
      const prev = saldoPorComp.get(m.comprobante_id) || 0
      saldoPorComp.set(m.comprobante_id, prev + (+m.debe) - (+m.haber))
    }
    
    // Traer datos de los comprobantes pendientes
    const ids = [...saldoPorComp.entries()].filter(([,s])=>s>0).map(([id])=>id)
    if (!ids.length) { setFacturasPend([]); setFactSel({}); setCobroModal(true); return }
    
    const { data: comps } = await supabase.from('comprobantes')
      .select('id,numero,fecha,total,nro_cbte_afip').in('id', ids).order('fecha')
    
    const pend: FacturaPendiente[] = (comps??[]).map((c:any) => ({
      ...c, total: saldoPorComp.get(c.id) || c.total
    }))
    setFacturasPend(pend)
    // Pre-seleccionar todas
    const sel2: Record<string,boolean> = {}
    pend.forEach(f => sel2[f.id] = true)
    setFactSel(sel2)
    setCobroModal(true)
  }

  const montoFactSel = facturasPend.filter(f=>factSel[f.id]).reduce((a,f)=>a+f.total,0)
  const totalRetenciones = retenciones.reduce((a,r)=>a+toNum(r.monto),0)
  const montoNeto = montoFactSel - totalRetenciones

  function updRet(tipo: string, field: keyof Retencion, value: string) {
    setRetenciones(prev => prev.map(r => r.tipo === tipo ? {...r, [field]: value} : r))
  }

  async function confirmarCobro() {
    if (!sel || montoFactSel <= 0) return
    setSavingCobro(true)
    
    const { data: cobro } = await supabase.from('cobros_aseguradoras').insert({
      aseguradora_id: sel.aseguradora_id,
      fecha, forma_cobro: forma, banco: banco||null, cbu: cbu||null,
      referencia: ref||null, nro_op: nroOp||null,
      monto_bruto: montoFactSel,
      ret_ganancias: toNum(retenciones.find(r=>r.tipo==='ganancias')?.monto||'0'),
      ret_iva:       toNum(retenciones.find(r=>r.tipo==='iva')?.monto||'0'),
      ret_iibb:      toNum(retenciones.find(r=>r.tipo==='iibb')?.monto||'0'),
      ret_suss:      toNum(retenciones.find(r=>r.tipo==='suss')?.monto||'0'),
      ret_otras:     toNum(retenciones.find(r=>r.tipo==='otras')?.monto||'0'),
      monto_neto: montoNeto,
    }).select('id').single()

    if (!cobro) { setSavingCobro(false); return }

    // Detalle facturas
    const factsSel = facturasPend.filter(f=>factSel[f.id])
    await supabase.from('cobros_aseguradoras_facturas').insert(
      factsSel.map(f => ({ cobro_id: cobro.id, comprobante_id: f.id, monto: f.total }))
    )

    // Haber en CC por el total bruto
    await supabase.from('cuenta_corriente_aseguradoras').insert({
      aseguradora_id: sel.aseguradora_id,
      fecha, tipo: 'cobro',
      descripcion: `Cobro OP ${nroOp||ref||'s/n'} — ${factsSel.length} fact.`,
      debe: 0, haber: montoFactSel,
    })

    // Retenciones como certificados
    const retsConMonto = retenciones.filter(r=>toNum(r.monto)>0)
    if (retsConMonto.length) {
      await supabase.from('retenciones_sufridas').insert(
        retsConMonto.map(r => ({
          cobro_id: cobro.id,
          aseguradora_id: sel.aseguradora_id,
          fecha, tipo: r.tipo,
          nro_certificado: r.nro_cert||null,
          monto: toNum(r.monto),
          base_imponible: toNum(r.base)||null,
        }))
      )
    }

    // Reset
    setCobroModal(false)
    setForma('Transferencia'); setBanco(''); setCbu(''); setRef(''); setNroOp(''); setFecha(todayStr())
    setRetenciones(prev => prev.map(r=>({...r,monto:'',nro_cert:'',base:''})))
    setSavingCobro(false)
    loadSaldos(); loadMovs(sel.aseguradora_id)
  }

  async function abrirEditCobro(mov: Mov) {
    // Buscar el cobro en cobros_aseguradoras por comprobante o descripción
    const { data } = await supabase.from('cobros_aseguradoras')
      .select('*').eq('aseguradora_id', sel!.aseguradora_id)
      .order('created_at', { ascending: false })
    // Buscar el que corresponde a este movimiento por fecha y monto
    const cobro = (data??[]).find((c:any) => 
      c.fecha === mov.fecha && Math.abs(c.monto_bruto - mov.haber) < 1
    ) || data?.[0]
    if (!cobro) return
    setEditCobro(cobro)
    setEditForm({
      ret_ganancias: String(cobro.ret_ganancias||''),
      ret_iva:       String(cobro.ret_iva||''),
      ret_iibb:      String(cobro.ret_iibb||''),
      ret_suss:      String(cobro.ret_suss||''),
      ret_otras:     String(cobro.ret_otras||''),
      monto_neto:    String(cobro.monto_neto||''),
      referencia:    cobro.referencia||'',
      nro_op:        cobro.nro_op||'',
      notas:         cobro.notas||'',
    })
  }

  async function guardarEditCobro() {
    if (!editCobro) return
    setSavingEdit(true)
    const totalRet = toNum(editForm.ret_ganancias) + toNum(editForm.ret_iva) + toNum(editForm.ret_iibb) + toNum(editForm.ret_suss) + toNum(editForm.ret_otras)
    const montoNeto = toNum(editForm.monto_neto) || (editCobro.monto_bruto - totalRet)
    await supabase.from('cobros_aseguradoras').update({
      ret_ganancias: toNum(editForm.ret_ganancias),
      ret_iva:       toNum(editForm.ret_iva),
      ret_iibb:      toNum(editForm.ret_iibb),
      ret_suss:      toNum(editForm.ret_suss),
      ret_otras:     toNum(editForm.ret_otras),
      monto_neto:    montoNeto,
      referencia:    editForm.referencia||null,
      nro_op:        editForm.nro_op||null,
      notas:         editForm.notas||null,
    }).eq('id', editCobro.id)
    // Actualizar retenciones_sufridas
    await supabase.from('retenciones_sufridas').delete().eq('cobro_id', editCobro.id)
    const rets = [
      { tipo:'ganancias', monto: toNum(editForm.ret_ganancias) },
      { tipo:'iva',       monto: toNum(editForm.ret_iva) },
      { tipo:'iibb',      monto: toNum(editForm.ret_iibb) },
      { tipo:'suss',      monto: toNum(editForm.ret_suss) },
      { tipo:'otras',     monto: toNum(editForm.ret_otras) },
    ].filter(r => r.monto > 0)
    if (rets.length) {
      await supabase.from('retenciones_sufridas').insert(
        rets.map(r => ({ cobro_id: editCobro.id, aseguradora_id: sel!.aseguradora_id, fecha: editCobro.fecha, tipo: r.tipo, monto: r.monto }))
      )
    }
    setEditCobro(null)
    setSavingEdit(false)
    loadMovs(sel!.aseguradora_id)
  }

  const filtrados = saldos.filter(s => !q || s.nombre.toLowerCase().includes(q.toLowerCase()))
  const totalPendiente = saldos.reduce((a,s)=>a+Math.max(0,s.saldo),0)

  return (
    <div>
      {/* KPI */}
      <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-5 inline-flex items-center gap-4">
        <div>
          <p className="text-[11px] font-semibold text-red-700 uppercase tracking-wider">Total pendiente de cobro</p>
          <p className="font-saira font-bold text-2xl text-red-600">{moneyARS(totalPendiente)}</p>
        </div>
        <p className="text-xs text-red-500">{saldos.filter(s=>s.saldo>0).length} compañías con saldo</p>
      </div>

      <div className="mb-4">
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar aseguradora…"
          className="w-full max-w-md border border-p-line rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-p-green"/>
      </div>

      <div className="flex flex-col gap-2">
        {filtrados.filter(s=>s.saldo>0).map(s=>(
          <div key={s.aseguradora_id}>
            <div onClick={()=>seleccionar(s)}
              className={`bg-white border rounded-xl px-4 py-3 shadow-sm flex items-center gap-3 cursor-pointer ${sel?.aseguradora_id===s.aseguradora_id?'border-p-green bg-p-light/30':'border-p-line hover:border-p-green'}`}>
              <div className="flex-1 min-w-0">
                <p className="font-saira font-bold text-p-ink text-sm truncate">{s.nombre}</p>
                <p className="text-[10px] text-p-ink2">{s.facturas} factura(s) · Facturado: {moneyARS(s.total_debe)} · Cobrado: {moneyARS(s.total_haber)}</p>
              </div>
              <p className="font-saira font-bold text-xl text-red-500 shrink-0">Debe {moneyARS(s.saldo)}</p>
            </div>

            {sel?.aseguradora_id === s.aseguradora_id && (
              <div className="border border-p-green border-t-0 rounded-b-xl bg-p-light/10 px-4 py-3">
                <div className="mb-3">
                  <button onClick={abrirCobro} style={btn}>💵 Registrar cobro</button>
                </div>
                {loading ? <p className="text-sm text-p-gray py-2">Cargando…</p> : (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-p-ink2 font-semibold border-b border-p-line">
                        <th className="text-left py-1.5">Fecha</th>
                        <th className="text-left py-1.5">Descripción</th>
                        <th className="text-right py-1.5 text-red-500">Debe</th>
                        <th className="text-right py-1.5 text-green-600">Haber</th>
                      </tr>
                    </thead>
                    <tbody>
                      {movs.map(m=>(
                        <tr key={m.id} className="border-b border-p-line2">
                          <td className="py-2 font-mono text-p-ink2">{m.fecha.split('-').reverse().join('/')}</td>
                          <td className="py-2 text-p-ink flex items-center gap-2">
                            {m.descripcion}
                            {m.haber > 0 && (
                              <button onClick={()=>abrirEditCobro(m)} className="text-[10px] text-blue-500 hover:underline ml-1">✏️ editar</button>
                            )}
                          </td>
                          <td className="py-2 text-right font-mono text-red-500">{m.debe>0?moneyARS(m.debe):'—'}</td>
                          <td className="py-2 text-right font-mono text-green-600">{m.haber>0?moneyARS(m.haber):'—'}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="font-bold border-t border-p-line">
                        <td colSpan={2} className="py-2">Saldo pendiente</td>
                        <td colSpan={2} className="py-2 text-right font-saira text-lg text-red-500">{moneyARS(s.saldo)}</td>
                      </tr>
                    </tfoot>
                  </table>
                )}
              </div>
            )}
          </div>
        ))}
        {filtrados.filter(s=>s.saldo>0).length===0 && <Empty msg="No hay saldos pendientes con aseguradoras."/>}
      </div>

      {/* Modal cobro */}
      <Modal open={cobroModal} onClose={()=>setCobroModal(false)} title={`Registrar cobro — ${sel?.nombre}`}>
        <div className="flex flex-col gap-4 max-h-[80vh] overflow-y-auto pr-1">

          {/* Facturas pendientes */}
          <div>
            <p className="text-[11px] font-bold text-p-ink2 uppercase tracking-wider mb-2">Facturas que cancela este cobro</p>
            {facturasPend.length === 0
              ? <p className="text-sm text-p-ink2">No hay facturas pendientes.</p>
              : <div className="flex flex-col gap-1">
                  {facturasPend.map(f=>(
                    <label key={f.id} className={`flex items-center gap-3 border rounded-lg px-3 py-2 cursor-pointer text-sm ${factSel[f.id]?'border-p-green bg-green-50':'border-p-line'}`}>
                      <input type="checkbox" checked={!!factSel[f.id]} onChange={()=>setFactSel(p=>({...p,[f.id]:!p[f.id]}))} className="accent-p-green"/>
                      <span className="font-mono text-xs text-p-ink2">FA-0006-{String(f.nro_cbte_afip??f.numero).padStart(8,'0')}</span>
                      <span className="text-p-ink2 text-xs">{f.fecha.split('-').reverse().join('/')}</span>
                      <span className="ml-auto font-mono font-bold text-p-ink">{moneyARS(f.total)}</span>
                    </label>
                  ))}
                  <div className="flex justify-between text-sm font-bold pt-1 border-t border-p-line mt-1">
                    <span>Total seleccionado</span>
                    <span className="font-mono">{moneyARS(montoFactSel)}</span>
                  </div>
                </div>
            }
          </div>

          {/* Forma de cobro */}
          <div>
            <p className="text-[11px] font-bold text-p-ink2 uppercase tracking-wider mb-2">Forma de cobro</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Fecha">
                <Input type="date" value={fecha} onChange={e=>setFecha(e.target.value)}/>
              </Field>
              <Field label="Forma">
                <select value={forma} onChange={e=>setForma(e.target.value)} className="w-full border border-p-line rounded-lg px-3 py-2 text-sm">
                  {FORMAS.map(f=><option key={f}>{f}</option>)}
                </select>
              </Field>
              <Field label="N° Orden de Pago">
                <Input value={nroOp} onChange={e=>setNroOp(e.target.value)} placeholder="Ej: 00220576"/>
              </Field>
              <Field label="Referencia / N° transferencia">
                <Input value={ref} onChange={e=>setRef(e.target.value)} placeholder="Nro transferencia, cheque…"/>
              </Field>
              <Field label="Banco">
                <Input value={banco} onChange={e=>setBanco(e.target.value)} placeholder="Ej: Banco Nación"/>
              </Field>
              <Field label="CBU">
                <Input value={cbu} onChange={e=>setCbu(e.target.value)} placeholder="22 dígitos"/>
              </Field>
            </div>
          </div>

          {/* Retenciones */}
          <div>
            <p className="text-[11px] font-bold text-p-ink2 uppercase tracking-wider mb-2">Retenciones sufridas</p>
            <div className="flex flex-col gap-2">
              {retenciones.map(r=>(
                <div key={r.tipo} className="grid grid-cols-3 gap-2 items-end">
                  <Field label={r.label}>
                    <Input value={r.monto} onChange={e=>updRet(r.tipo,'monto',e.target.value)} placeholder="$0"/>
                  </Field>
                  <Field label="N° Certificado">
                    <Input value={r.nro_cert} onChange={e=>updRet(r.tipo,'nro_cert',e.target.value)} placeholder="Opcional"/>
                  </Field>
                  <Field label="Base imponible">
                    <Input value={r.base} onChange={e=>updRet(r.tipo,'base',e.target.value)} placeholder="$0"/>
                  </Field>
                </div>
              ))}
            </div>
          </div>

          {/* Resumen */}
          <div className="bg-p-light rounded-xl p-3 flex flex-col gap-1 text-sm">
            <div className="flex justify-between"><span className="text-p-ink2">Total facturado cancelado</span><span className="font-mono">{moneyARS(montoFactSel)}</span></div>
            {retenciones.filter(r=>toNum(r.monto)>0).map(r=>(
              <div key={r.tipo} className="flex justify-between text-red-600">
                <span>− {r.label}</span><span className="font-mono">{moneyARS(toNum(r.monto))}</span>
              </div>
            ))}
            <div className="flex justify-between font-bold text-p-green border-t border-p-line pt-1 mt-1">
              <span>Neto a acreditar</span><span className="font-mono font-saira text-lg">{moneyARS(montoNeto)}</span>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button onClick={()=>setCobroModal(false)} style={btnGray}>Cancelar</button>
            <button onClick={confirmarCobro} disabled={savingCobro||montoFactSel<=0}
              style={{...btn,opacity:(savingCobro||montoFactSel<=0)?.5:1}}>
              {savingCobro?'Guardando…':'✓ Confirmar cobro'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal edición cobro */}
      <Modal open={!!editCobro} onClose={()=>setEditCobro(null)} title="Editar cobro">
        {editCobro && (
          <div className="flex flex-col gap-3">
            <div className="bg-p-light rounded-xl px-4 py-2 text-sm">
              <span className="text-p-ink2">Bruto: </span>
              <span className="font-bold font-mono">{moneyARS(editCobro.monto_bruto)}</span>
              <span className="text-p-ink2 ml-4">Fecha: </span>
              <span className="font-mono">{editCobro.fecha?.split('-').reverse().join('/')}</span>
            </div>

            <p className="text-[11px] font-bold text-p-ink2 uppercase tracking-wider">Retenciones</p>
            <div className="grid grid-cols-2 gap-3">
              {[
                { key:'ret_ganancias', label:'Ret. Ganancias' },
                { key:'ret_iva',       label:'Ret. IVA' },
                { key:'ret_iibb',      label:'Ret. IIBB' },
                { key:'ret_suss',      label:'Ret. SUSS' },
                { key:'ret_otras',     label:'Otras ret.' },
              ].map(r=>(
                <Field key={r.key} label={r.label}>
                  <Input value={(editForm as any)[r.key]} onChange={e=>setEditForm(p=>({...p,[r.key]:e.target.value}))} placeholder="$0"/>
                </Field>
              ))}
              <Field label="Neto acreditado">
                <Input value={editForm.monto_neto} onChange={e=>setEditForm(p=>({...p,monto_neto:e.target.value}))} placeholder="Auto"/>
              </Field>
            </div>

            <p className="text-[11px] font-bold text-p-ink2 uppercase tracking-wider">Datos del pago</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="N° Orden de Pago"><Input value={editForm.nro_op} onChange={e=>setEditForm(p=>({...p,nro_op:e.target.value}))}/></Field>
              <Field label="Referencia"><Input value={editForm.referencia} onChange={e=>setEditForm(p=>({...p,referencia:e.target.value}))}/></Field>
            </div>
            <Field label="Notas"><Input value={editForm.notas} onChange={e=>setEditForm(p=>({...p,notas:e.target.value}))} placeholder="Opcional"/></Field>

            <div className="flex justify-end gap-2 pt-1">
              <button onClick={()=>setEditCobro(null)} style={btnGray}>Cancelar</button>
              <button onClick={guardarEditCobro} disabled={savingEdit}
                style={{...btn,opacity:savingEdit?.5:1}}>{savingEdit?'Guardando…':'✓ Guardar cambios'}</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
