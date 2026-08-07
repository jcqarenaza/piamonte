'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Modal, Field, Input, Empty } from '@/components/ui'
import { moneyARS2 as moneyARS } from '@/lib/utils/format'
import { LOGO_BASE64 } from '@/lib/logo'
import { ChequeFields, EMPTY_CHEQUE, type ChequeData } from '@/components/cheques/ChequeFields'

const btn   = { background:'#00A550',color:'#fff',border:'none',borderRadius:10,padding:'10px 20px',fontWeight:700,fontSize:14,cursor:'pointer' } as const
const btnSm = { ...btn, padding:'6px 14px', fontSize:12 } as const
const btnGray = { ...btnSm, background:'#6b7280' } as const
const btnBlue = { ...btnSm, background:'#1d4ed8' } as const

interface Saldo { proveedor_nombre:string; proveedor_id:string|null; total_debe:number; total_haber:number; saldo_actual:number; ultima_operacion:string; movimientos:number }
interface Movimiento { id:string; fecha:string; tipo:string; descripcion:string|null; debe:number; haber:number; saldo:number; notas:string|null; created_at:string }
interface Pendiente { id:string; tipo:string; letra:string|null; punto_venta:string|null; numero:string|null; fecha:string; total:number }

export default function CuentaCorrienteProveedoresClient() {
  const [saldos, setSaldos]     = useState<Saldo[]>([])
  const [sel, setSel]           = useState<Saldo|null>(null)
  const [movs, setMovs]         = useState<Movimiento[]>([])
  const [q, setQ]               = useState('')
  const [openPago, setOpenPago] = useState(false)
  const [formPago, setFormPago] = useState({ monto:'', fecha:'', notas:'', forma_pago:'Transferencia' })
  const [chequePago, setChequePago] = useState<ChequeData>(EMPTY_CHEQUE)
  const [loading, setLoading]   = useState(true)
  // Orden de Pago: facturas y NC pendientes del proveedor seleccionado, y cuáles se eligieron pagar.
  const [opOpen, setOpOpen]         = useState(false)
  const [pendientes, setPendientes] = useState<Pendiente[]>([])
  const [seleccion, setSeleccion]   = useState<Record<string, boolean>>({})
  const [opForm, setOpForm]         = useState({ fecha:'', notas:'' })
  const [opPagos, setOpPagos]       = useState<{tipo:string;monto:string;chequeSelId:string;chequeQ:string;chequeNuevo:ChequeData}[]>([
    {tipo:'Transferencia',monto:'',chequeSelId:'',chequeQ:'',chequeNuevo:EMPTY_CHEQUE}
  ])
  const [chequeOP, setChequeOP]     = useState<ChequeData>(EMPTY_CHEQUE)
  const [guardandoOp, setGuardandoOp] = useState(false)
  // Cheques propios disponibles para usar en pagos
  const [chequesDisp, setChequesDisp] = useState<any[]>([])
  const [chequeSelId, setChequeSelId] = useState('')
  const [chequeQ, setChequeQ] = useState('')
  const [chequesSelIds, setChequesSelIds] = useState<Set<string>>(new Set())
  // Ajuste pendiente de NC
  const [openAjuste, setOpenAjuste]   = useState(false)
  const [ajusteForm, setAjusteForm]   = useState({ descripcion:'', monto:'', pendiente_nc:false, notas:'' })
  // NC: reemplazar ajuste pendiente
  const [ajustesPendNC, setAjustesPendNC] = useState<any[]>([])
  const [ordenesPago, setOrdenesPago] = useState<any[]>([])
  const [opItemsCache, setOpItemsCache] = useState<Record<string, any[]>>({})
  // ── Cheques nuevos en serie dentro de la OP ──
  const CUENTA_PAMPA_CC = 'e7369b4b-4697-44ca-9303-a077a877e643'
  const [cuentasPropias, setCuentasPropias] = useState<any[]>([])
  const [opChequesNuevos, setOpChequesNuevos] = useState<any[]>([])
  const [chComposer, setChComposer] = useState({ numero:'', cuenta_id: CUENTA_PAMPA_CC, monto:'', fecha_cobro:'', formato:'fisico', modalidad:'diferido' })
  const [verOPs, setVerOPs] = useState<string|null>(null)
  const [borrandoOp, setBorrandoOp] = useState<string|null>(null)
  const [vistaMovs, setVistaMovs] = useState(false)  // false=saldos, true=movimientos
  const [pendientesPago, setPendientesPago] = useState<any[]>([])  // facturas/NC no saldadas
  const [verComp, setVerComp] = useState<any|null>(null)  // comprobante a ver en modal
  const supabase = createClient()

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('vista_saldos_cc_proveedores').select('*')
    setSaldos(data??[])
    setLoading(false)
  }

  async function loadMovs(nombre: string) {
    const { data } = await supabase.from('cuenta_corriente_proveedores')
      .select('*').eq('proveedor_nombre', nombre).order('fecha').order('created_at')
    // Excluir TODOS los ajustes pendiente_nc (activos o ya saldados) — mismo criterio que el header:
    // el crédito real lo aporta la NC del proveedor cuando se carga, el ajuste es solo informativo
    const filtrados = (data??[]).filter((m:any) =>
      !(m.tipo === 'ajuste' && m.notas?.includes('pendiente_nc'))
    )
    // Recalcular saldo acumulado (asc) y luego invertir para mostrar más reciente primero
    let saldoAcum = 0
    const movConSaldo = filtrados.map((m:any) => {
      saldoAcum += (m.debe||0) - (m.haber||0)
      return { ...m, saldo: saldoAcum }
    })
    setMovs([...movConSaldo].reverse())
  }

  useEffect(()=>{ load() },[supabase])
  useEffect(()=>{
    if(sel) {
      loadMovs(sel.proveedor_nombre)
      // Cargar cheques propios emitidos a este proveedor — busca por proveedor_id O por contraparte,
      // y excluye los ya usados en otra OP (quedan con notas 'Orden de Pago Nº …')
      supabase.from('cheques').select('id,numero,banco,formato,modalidad,monto,fecha_cobro,contraparte,notas')
        .eq('tipo','propio')
        .or(`proveedor_id.eq.${sel.proveedor_id},contraparte.ilike.${sel.proveedor_nombre}`)
        .in('estado',['emitido','pendiente']).order('fecha_cobro')
        .then(({data})=>setChequesDisp((data??[]).filter((ch:any)=>!(ch.notas||'').startsWith('Orden de Pago'))))
      // Cuentas bancarias propias para elegir de dónde sale cada cheque nuevo
      supabase.from('cuentas_banco').select('id,banco,tipo').eq('activo',true).order('banco')
        .then(({data})=>setCuentasPropias(data??[]))
      setOpChequesNuevos([])
      setChComposer({ numero:'', cuenta_id: CUENTA_PAMPA_CC, monto:'', fecha_cobro:'', formato:'fisico', modalidad:'diferido' })
      // NC pendientes: fuente única = ajustes_stock.pendiente_nc (la misma que usa el modal de Compras).
      // Se muestran TODOS los pendientes, tengan monto o no.
      supabase.from('ajustes_stock')
        .select('id, fecha, cantidad, costo_unitario, nota, descripcion, stock:stock_id(codigo, descripcion)')
        .eq('pendiente_nc', true)
        .eq('proveedor_id', sel.proveedor_id)
        .order('fecha')
        .then(({data})=>setAjustesPendNC(data??[]))
      // Cargar OPs del proveedor (todas: activas y anuladas — auditoría)
      supabase.from('ordenes_pago')
        .select('id,numero,fecha,total_pagado,total_facturas,total_nc,forma_pago,notas,cuenta_corriente_id,anulada,fecha_anulacion,motivo_anulacion')
        .eq('proveedor_id', sel.proveedor_id)
        .order('fecha', { ascending: false })
        .then(({data})=>setOrdenesPago(data??[]))
      // Saldos pendientes desde el LEDGER (vista de imputación FIFO) — misma fuente que el header,
      // coincidencia por construcción: la primera fila (más reciente) siempre = "Debemos" del header.
      supabase.from('vista_cc_saldos_detalle')
        .select('*')
        .eq('proveedor_id', sel.proveedor_id)
        .order('fecha', { ascending: false })
        .order('created_at', { ascending: false })
        .then(async ({data})=>{
          const rows = data ?? []
          // Traer los comprobantes vinculados (número, tipo, ítems) para etiqueta y detalle al click
          const compIds = Array.from(new Set(rows.map((r:any)=>r.comprobante_compra_id).filter(Boolean)))
          const compMap: Record<string, any> = {}
          if (compIds.length) {
            const { data: comps } = await supabase.from('comprobantes_compra')
              .select('id,tipo,letra,punto_venta,numero,fecha,total,saldado,items')
              .in('id', compIds)
            for (const c of (comps ?? [])) compMap[(c as any).id] = c
          }
          const withComp = rows.map((r:any)=>({ ...r, comp: r.comprobante_compra_id ? (compMap[r.comprobante_compra_id] || null) : null }))
          setPendientesPago(withComp.filter((r:any) => +r.saldo_acumulado >= 1))
        })
      setVistaMovs(false)
    }
  },[sel])

  async function registrarPago() {
    if(!sel || !formPago.monto) return
    const monto = +formPago.monto
    const fechaPago = formPago.fecha || new Date().toISOString().slice(0,10)
    await supabase.from('cuenta_corriente_proveedores').insert({
      proveedor_id: sel.proveedor_id, proveedor_nombre: sel.proveedor_nombre,
      fecha: fechaPago, tipo: 'pago', descripcion: 'Pago a proveedor',
      debe: 0, haber: monto, notas: formPago.notas||null
    })
    if (formPago.forma_pago === 'Cheque' && chequePago.numero) {
      await supabase.from('cheques').insert({
        tipo:'propio', formato:chequePago.formato, modalidad:chequePago.modalidad,
        numero:chequePago.numero, banco:chequePago.banco,
        fecha_emision: fechaPago, fecha_cobro: chequePago.modalidad==='al_dia'?fechaPago:chequePago.fecha_cobro,
        monto, contraparte: sel.proveedor_nombre, estado:'emitido',
        notas: formPago.notas||null,
      })
    }
    setOpenPago(false)
    setFormPago({ monto:'', fecha:'', notas:'', forma_pago:'Transferencia' })
    setChequePago(EMPTY_CHEQUE)
    load()
    loadMovs(sel.proveedor_nombre)
  }

  async function guardarAjuste() {
    if (!sel || !ajusteForm.monto) return
    const monto = +ajusteForm.monto
    await supabase.from('cuenta_corriente_proveedores').insert({
      proveedor_id: sel.proveedor_id, proveedor_nombre: sel.proveedor_nombre,
      fecha: new Date().toISOString().slice(0,10), tipo: 'ajuste',
      descripcion: ajusteForm.descripcion || 'Ajuste / Devolución',
      debe: 0, haber: monto,
      notas: ajusteForm.pendiente_nc ? `${ajusteForm.notas ? ajusteForm.notas+' ' : ''}pendiente_nc` : (ajusteForm.notas||null)
    })
    setOpenAjuste(false)
    setAjusteForm({ descripcion:'', monto:'', pendiente_nc:false, notas:'' })
    load(); loadMovs(sel.proveedor_nombre)
  }

  async function aplicarNcSobreAjuste(ajusteId: string, ncMonto: number) {
    if (!sel) return
    // Anular el ajuste pendiente y crear movimiento de NC real
    await supabase.from('cuenta_corriente_proveedores').update({
      notas: 'NC aplicada — reemplazado por nota de crédito del proveedor'
    }).eq('id', ajusteId)
    // El movimiento de NC ya se registrará cuando se cargue la NC en Compras
    loadMovs(sel.proveedor_nombre)
    setAjustesPendNC(prev=>prev.filter(a=>a.id!==ajusteId))
  }
  async function anularOrdenPago(op: any) {
    if (!sel) return
    const motivo = prompt(`Motivo de anulación de OP Nº ${op.numero}:`)
    if (motivo === null) return
    if (!confirm(`Se va a anular la OP Nº ${op.numero} por ${'$'+Number(op.total_pagado).toLocaleString('es-AR')}:\n· Se elimina su pago de la CC (las facturas vuelven a pendientes)\n· Los cheques asociados vuelven a su estado anterior\n· La OP queda marcada como anulada (auditoría)\n¿Confirmás?`)) return
    setBorrandoOp(op.id)
    const fecha = new Date().toISOString().slice(0,10)
    // 1. Marcar OP anulada Y soltar el FK al movimiento (ordenes_pago.cuenta_corriente_id
    //    referencia la fila de CC — si no se suelta primero, el DELETE viola el constraint)
    await supabase.from('ordenes_pago').update({
      anulada: true, fecha_anulacion: fecha, motivo_anulacion: motivo||'Sin motivo',
      cuenta_corriente_id: null,
    }).eq('id', op.id)
    // 2. ELIMINAR el movimiento de pago original de la CC (no contramovimiento):
    //    la vista de imputación libera las facturas sola al desaparecer el haber.
    if (op.cuenta_corriente_id) {
      await supabase.from('cuenta_corriente_proveedores').delete().eq('id', op.cuenta_corriente_id)
    } else {
      // OPs viejas sin vínculo: por descripción exacta + tipo + proveedor
      await supabase.from('cuenta_corriente_proveedores').delete()
        .eq('proveedor_id', sel.proveedor_id).eq('tipo','pago')
        .eq('descripcion', `Orden de Pago Nº ${op.numero}`)
    }
    // 3. Cheques asociados a esta OP (vinculados por notas al crearla)
    const { data: chequesOP } = await supabase.from('cheques')
      .select('id,tipo,estado,numero,monto').eq('notas', `Orden de Pago Nº ${op.numero}`)
    for (const ch of (chequesOP ?? [])) {
      if (ch.tipo === 'propio' && ch.estado === 'emitido') {
        // Cheque propio emitido PARA esta OP: se anula y se revierte su débito bancario
        await supabase.from('cheques').update({ estado: 'anulado', notas: `Anulado con OP Nº ${op.numero} · ${motivo||'Sin motivo'}` }).eq('id', ch.id)
        await supabase.from('movimientos_banco').delete()
          .eq('origen_tipo','cheque_emitido')
          .ilike('concepto', `%Cheque N° ${ch.numero}%OP Nº ${op.numero}%`)
      } else {
        // Cheque preexistente seleccionado en la OP: se desvincula y vuelve a disponible
        await supabase.from('cheques').update({ estado: 'disponible', notas: null }).eq('id', ch.id)
      }
    }
    // 3. Facturas vuelven a saldado=false
    const { data: opItems } = await supabase.from('orden_pago_items')
      .select('comprobante_compra_id').eq('orden_pago_id', op.id)
    if (opItems?.length) {
      await supabase.from('comprobantes_compra').update({ saldado: false })
        .in('id', opItems.map((i:any)=>i.comprobante_compra_id))
    }
    // (la OP ya quedó marcada anulada en el paso 1)
    setBorrandoOp(null)
    setOrdenesPago(prev=>prev.map(o=>o.id===op.id?{...o,anulada:true,motivo_anulacion:motivo||'Sin motivo',fecha_anulacion:fecha}:o))
    load(); loadMovs(sel.proveedor_nombre)
  }

  async function abrirOrdenPago() {
    if (!sel) return
    // Fuente de verdad: la vista de imputación (no el flag saldado, que puede quedar
    // desincronizado con pagos parciales u OPs viejas). Cada factura se ofrece por
    // su PENDIENTE real según la vista.
    const { data: vrows } = await supabase.from('vista_cc_saldos_detalle')
      .select('comprobante_compra_id,monto,tipo')
      .eq('proveedor_id', sel.proveedor_id)
    const pendPorComp: Record<string, number> = {}
    for (const r of (vrows??[]) as any[]) {
      if (r.comprobante_compra_id && r.tipo !== 'credito' && +r.monto >= 1)
        pendPorComp[r.comprobante_compra_id] = (pendPorComp[r.comprobante_compra_id]||0) + +r.monto
    }
    const idsPend = Object.keys(pendPorComp)
    let facturas: any[] = []
    if (idsPend.length) {
      const { data: fs } = await supabase.from('comprobantes_compra')
        .select('id,tipo,letra,punto_venta,numero,fecha,total')
        .in('id', idsPend).neq('estado','anulado').order('fecha')
      facturas = (fs??[]).map((f:any)=>({ ...f, total: pendPorComp[f.id] ?? f.total }))
    }
    // NC del proveedor aún no aplicadas
    const { data: ncs } = await supabase.from('comprobantes_compra')
      .select('id,tipo,letra,punto_venta,numero,fecha,total')
      .eq('proveedor_id', sel.proveedor_id).eq('tipo','nc')
      .eq('saldado', false).neq('estado','anulado').order('fecha')
    setPendientes([...facturas.filter((f:any)=>f.tipo==='factura'), ...(ncs??[])])
    setSeleccion({})
    setOpForm({ fecha: new Date().toISOString().slice(0,10), notas:'' })
    setOpPagos([{tipo:'Transferencia',monto:'',chequeSelId:'',chequeQ:'',chequeNuevo:EMPTY_CHEQUE}])
    setChequesSelIds(new Set())
    setChequeSelId(''); setChequeQ('')
    setOpOpen(true)
  }

  function toggleSeleccion(id: string) {
    setSeleccion(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const facturasSel = pendientes.filter(p => p.tipo === 'factura' && seleccion[p.id])
  const ncSel        = pendientes.filter(p => p.tipo === 'nc' && seleccion[p.id])
  const totalFacturasSel = facturasSel.reduce((a,f)=>a+f.total, 0)
  const totalNcSel       = ncSel.reduce((a,n)=>a+n.total, 0)
  const totalAPagar      = totalFacturasSel - totalNcSel

  async function confirmarOrdenPago() {
    if (!sel || (facturasSel.length === 0 && ncSel.length === 0)) return
    setGuardandoOp(true)
    const fechaOp = opForm.fecha || new Date().toISOString().slice(0,10)

    const { data: numeroData } = await supabase.rpc('next_orden_pago_numero')
    const numero = numeroData as string

    // Descripción de formas de pago
    const chequesSelArr = chequesDisp.filter(ch=>chequesSelIds.has(ch.id))
    const partesCheques = chequesSelArr.map(ch=>`Cheque ${ch.numero} $${Number(ch.monto).toLocaleString('es-AR')}`)
    const partesNuevos = opChequesNuevos.map(ch=>`Cheque ${ch.numero} $${Number(ch.monto).toLocaleString('es-AR')}`)
    const partesOtros = opPagos.filter(p=>p.monto).map(p=>`${p.tipo} $${Number(p.monto).toLocaleString('es-AR')}`)
    const formasPagoDesc = [...partesCheques, ...partesNuevos, ...partesOtros].join(' + ') || 'Sin especificar'

    // total_pagado = suma real de medios de pago (cheques + otros), NO facturas - NC
    const totalChequesSel = chequesSelArr.reduce((a,ch)=>a+(+ch.monto),0)
    const totalNuevosSel = opChequesNuevos.reduce((a,ch)=>a+(parseFloat(ch.monto)||0),0)
    const totalOtrosSel = opPagos.reduce((a,p)=>a+(parseFloat(p.monto)||0),0)
    const totalMedioPago = totalChequesSel + totalNuevosSel + totalOtrosSel

    const { data: mov } = await supabase.from('cuenta_corriente_proveedores').insert({
      proveedor_id: sel.proveedor_id, proveedor_nombre: sel.proveedor_nombre,
      fecha: fechaOp, tipo: 'pago', descripcion: `Orden de Pago Nº ${numero}`,
      debe: 0, haber: totalMedioPago,
      notas: opForm.notas || null,
    }).select('id').single()

    const { data: opIns } = await supabase.from('ordenes_pago').insert({
      numero, fecha: fechaOp,
      proveedor_id: sel.proveedor_id, proveedor_nombre: sel.proveedor_nombre,
      total_facturas: totalFacturasSel, total_nc: totalNcSel, total_pagado: totalMedioPago,
      forma_pago: formasPagoDesc, notas: opForm.notas || null,
      cuenta_corriente_id: mov?.id || null,
    }).select('id').single()

    if (opIns) {
      const items = [...facturasSel, ...ncSel].map(p => ({
        orden_pago_id: opIns.id, comprobante_compra_id: p.id, tipo: p.tipo,
        numero: `${p.letra||''}${p.punto_venta||''}-${p.numero||''}`, monto: p.total,
      }))
      await supabase.from('orden_pago_items').insert(items)
    }

    // Registrar cheques propios seleccionados (checkbox)
    for (const chequeId of Array.from(chequesSelIds)) {
      await supabase.from('cheques').update({
        notas: `Orden de Pago Nº ${numero}`,
      }).eq('id', chequeId)
    }

    // Registrar nuevos cheques de "otras formas de pago"
    for (const pago of opPagos) {
      if (pago.tipo !== 'Cheque nuevo') continue
      const montoPago = parseFloat(pago.monto) || 0
      if (pago.chequeNuevo.numero) {
        const { data: chequeOpIns } = await supabase.from('cheques').insert({
          tipo:'propio', formato:pago.chequeNuevo.formato, modalidad:pago.chequeNuevo.modalidad,
          numero:pago.chequeNuevo.numero, banco:pago.chequeNuevo.banco,
          fecha_emision: fechaOp, fecha_cobro: pago.chequeNuevo.modalidad==='al_dia'?fechaOp:pago.chequeNuevo.fecha_cobro,
          monto: montoPago, contraparte: sel.proveedor_nombre, estado:'emitido',
          proveedor_id: sel.proveedor_id,
          notas: `Orden de Pago Nº ${numero}`,
        }).select('id').single()
        // Débito automático en CC Banco de La Pampa
        if (chequeOpIns?.id) {
          await supabase.from('movimientos_banco').insert({
            cuenta_id: 'e7369b4b-4697-44ca-9303-a077a877e643',
            fecha: fechaOp,
            tipo: 'debito',
            concepto: `Cheque N° ${pago.chequeNuevo.numero} — ${sel.proveedor_nombre} (OP Nº ${numero})`,
            monto: montoPago,
            origen_tipo: 'cheque_emitido',
            cheque_id: chequeOpIns.id,
            notas: `Orden de Pago Nº ${numero}`,
          })
        }
      }
    }

    // Registrar la SERIE de cheques nuevos — el débito va a la cuenta elegida por cheque
    for (const ch of opChequesNuevos) {
      const montoCh = parseFloat(ch.monto) || 0
      const cta = cuentasPropias.find(c=>c.id===ch.cuenta_id)
      const { data: chIns } = await supabase.from('cheques').insert({
        tipo:'propio', formato:ch.formato, modalidad:ch.modalidad,
        numero: ch.numero, banco: cta?.banco || 'Banco de La Pampa',
        cuenta_id: ch.cuenta_id,
        fecha_emision: fechaOp, fecha_cobro: ch.fecha_cobro,
        monto: montoCh, contraparte: sel.proveedor_nombre, estado:'emitido',
        proveedor_id: sel.proveedor_id,
        notas: `Orden de Pago Nº ${numero}`,
      }).select('id').single()
      if (chIns?.id) {
        await supabase.from('movimientos_banco').insert({
          cuenta_id: ch.cuenta_id,
          fecha: ch.fecha_cobro,
          tipo: 'debito',
          concepto: `Cheque N° ${ch.numero} — ${sel.proveedor_nombre} (OP Nº ${numero})`,
          monto: montoCh,
          origen_tipo: 'cheque_emitido',
          cheque_id: chIns.id,
          notas: `Orden de Pago Nº ${numero}`,
        })
      }
    }

    // Marcar como saldadas las facturas/NC incluidas
    const idsIncluidos = [...facturasSel, ...ncSel].map(p => p.id)
    if (idsIncluidos.length) {
      await supabase.from('comprobantes_compra').update({ saldado: true }).in('id', idsIncluidos)
    }

    setGuardandoOp(false)
    setOpOpen(false)
    setChequeSelId('')
    setChequesSelIds(new Set())
    setOpPagos([{tipo:'Transferencia',monto:'',chequeSelId:'',chequeQ:'',chequeNuevo:EMPTY_CHEQUE}])
    imprimirOrdenPago({
      numero, fecha: fechaOp, proveedor_nombre: sel.proveedor_nombre,
      facturas: facturasSel, nc: ncSel,
      totalFacturas: totalFacturasSel, totalNc: totalNcSel, totalPagado: totalMedioPago,
      forma_pago: formasPagoDesc, notas: opForm.notas,
    })
    load()
    loadMovs(sel.proveedor_nombre)
  }

  function imprimirOrdenPago(op: {
    numero:string; fecha:string; proveedor_nombre:string; facturas:Pendiente[]; nc:Pendiente[]
    totalFacturas:number; totalNc:number; totalPagado:number; forma_pago:string; notas:string
  }) {
    const fechaFmt = op.fecha.split('-').reverse().join('/')
    const filaItem = (p: Pendiente, signo: '+'|'-') => `
      <tr>
        <td style="padding:6px 8px;border-bottom:1px solid #eee">${p.tipo==='nc'?'NC':'Factura'} ${p.letra||''}${p.punto_venta||''}-${p.numero||''}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee">${p.fecha.split('-').reverse().join('/')}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;font-family:monospace">${signo} ${moneyARS(p.total)}</td>
      </tr>`
    const filasHtml = op.facturas.map(f=>filaItem(f,'+')).join('') + op.nc.map(n=>filaItem(n,'-')).join('')
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Orden de Pago N° ${op.numero}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,Helvetica,sans-serif;background:#fff;color:#1a1a1a;width:210mm;margin:0 auto;font-size:12px}
  .header{background:#fff;color:#1a1a1a;padding:14px 24px;display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #00A550}
  .logo-sub{font-size:10px;letter-spacing:3px;color:#555;margin-top:2px}
  .shield{background:#00A550;color:#fff;border-radius:12px;padding:10px 16px;text-align:center;border:2px solid #fff}
  .shield .sv{font-size:10px;font-weight:bold;letter-spacing:1px}
  .shield .sa{font-size:18px;font-weight:900;line-height:1}
  .title-bar{background:#fff;padding:14px 24px 8px;border-bottom:4px solid #00A550}
  .op-title{font-size:28px;font-weight:900;text-transform:uppercase;line-height:1.1;color:#1a1a1a}
  .op-title .accent{color:#00A550}
  .op-num{font-size:14px;font-weight:bold;color:#00A550;margin-top:4px}
  .op-fecha{font-size:12px;color:#555;margin-top:2px}
  .body{padding:24px}
  .section{border:1.5px solid #1a1a1a;border-radius:10px;padding:16px 20px;margin-bottom:14px}
  .sec-title{font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;color:#00A550}
  .field-label{font-size:10.5px;color:#555;margin-top:6px}
  .field-line{border:none;border-bottom:1px solid #888;width:100%;margin:4px 0 6px;display:block;font-size:13px;color:#1a1a1a}
  table{width:100%;border-collapse:collapse;font-size:12px}
  th{text-align:left;padding:6px 8px;background:#f5f5f5;font-size:10.5px;text-transform:uppercase;letter-spacing:.3px;color:#555}
  .totales{margin-top:10px}
  .totales div{display:flex;justify-content:space-between;padding:4px 0;font-size:13px}
  .monto-box{background:#00A550;color:#fff;border-radius:10px;padding:18px 20px;text-align:center;margin-top:10px}
  .monto-box .lbl{font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.5px;opacity:.9}
  .monto-box .val{font-size:30px;font-weight:900;margin-top:4px}
  .footer-bar{background:#f5f5f5;color:#1a1a1a;padding:10px 24px;text-align:center;margin-top:10px;border-top:2px solid #00A550;font-size:10px;color:#555}
  @media print{body{width:auto;margin:0}@page{margin:8mm 14mm;size:A4}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style></head><body>

<div class="header">
  <div>
    <img src="${LOGO_BASE64}" alt="El Piamonte" style="height:42px;object-fit:contain;"/>
    <div class="logo-sub">SEGURIDAD • TECNOLOGÍA • CONFIANZA</div>
  </div>
  <div class="shield">
    <div class="sv">ORDEN DE</div>
    <div class="sv">PAGO</div>
    <div class="sa">✔</div>
  </div>
</div>

<div class="title-bar">
  <div class="op-title">ORDEN DE <span class="accent">PAGO</span></div>
  <div class="op-num">N° ${op.numero}</div>
  <div class="op-fecha">Fecha: ${fechaFmt}</div>
</div>

<div class="body">
  <div class="section">
    <div class="sec-title">🏢 PROVEEDOR</div>
    <div class="field-line" style="font-size:16px;font-weight:700">${op.proveedor_nombre}</div>
  </div>

  <div class="section">
    <div class="sec-title">🧾 COMPROBANTES INCLUIDOS</div>
    <table>
      <thead><tr><th>Comprobante</th><th>Fecha</th><th style="text-align:right">Importe</th></tr></thead>
      <tbody>${filasHtml}</tbody>
    </table>
    <div class="totales">
      <div><span>Total facturas</span><span style="font-family:monospace">${moneyARS(op.totalFacturas)}</span></div>
      ${op.totalNc > 0 ? `<div><span>Notas de crédito aplicadas</span><span style="font-family:monospace">− ${moneyARS(op.totalNc)}</span></div>` : ''}
    </div>
  </div>

  <div class="monto-box">
    <div class="lbl">Total a pagar</div>
    <div class="val">${moneyARS(op.totalPagado)}</div>
  </div>

  <div class="section" style="margin-top:14px">
    <div class="sec-title">💳 DETALLE DEL PAGO</div>
    <div class="field-label">Forma de pago:</div>
    <div class="field-line">${op.forma_pago}</div>
    ${op.notas ? `<div class="field-label">Notas:</div><div class="field-line">${op.notas}</div>` : ''}
  </div>
</div>

<div class="footer-bar">Parabrisas El Piamonte — Orden de Pago a proveedor. No reemplaza factura ni recibo del proveedor.</div>

</body></html>`
    const w = window.open('', '_blank')!
    w.document.write(html)
    w.document.close()
  }

  const totalDeuda = saldos.reduce((a,s)=>a+Math.max(0,s.saldo_actual),0)
  const conSaldo   = saldos.filter(s=>s.saldo_actual>0).length
  const filtrados  = saldos.filter(s=>!q||s.proveedor_nombre.toLowerCase().includes(q.toLowerCase()))

  return (
    <div>
    <div style={{display:'grid',gridTemplateColumns:'260px 1fr',gap:16,alignItems:'start'}}>
      {/* Lista compacta de proveedores */}
      <div style={{display:'flex',flexDirection:'column',gap:6}}>
        {/* Totales compactos */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6,marginBottom:4}}>
          <div className="bg-white border border-p-line rounded-xl p-3">
            <p className="text-[10px] font-semibold text-p-ink2 uppercase tracking-wider">Total a pagar</p>
            <p className="font-saira font-bold text-base text-red-500 mt-0.5">{moneyARS(totalDeuda)}</p>
          </div>
          <div className="bg-white border border-p-line rounded-xl p-3">
            <p className="text-[10px] font-semibold text-p-ink2 uppercase tracking-wider">Con saldo</p>
            <p className="font-saira font-bold text-base text-p-dark mt-0.5">{conSaldo}</p>
          </div>
        </div>

        <input value={q} onChange={e=>setQ(e.target.value)}
          placeholder="Buscar proveedor…"
          className="w-full border border-p-line rounded-lg px-3 py-2 text-xs mb-1 focus:outline-none focus:border-p-green bg-white"/>

        {loading ? <p className="text-sm text-p-gray text-center py-6">Cargando…</p> :
         filtrados.length===0 ? <Empty msg="Sin proveedores con saldo." /> : (
          <div className="flex flex-col gap-1.5 overflow-y-auto" style={{maxHeight:380}}>
            {filtrados.sort((a,b)=>b.saldo_actual-a.saldo_actual).map(s=>(
              <div key={s.proveedor_nombre}
                onClick={()=>setSel(sel?.proveedor_nombre===s.proveedor_nombre?null:s)}
                className={`bg-white border rounded-lg px-3 py-3 cursor-pointer transition-all ${sel?.proveedor_nombre===s.proveedor_nombre?'border-red-400 ring-1 ring-red-200 bg-red-50/30':'border-p-line hover:border-red-200'}`}>
                <p className="font-saira font-bold text-p-ink w-full leading-tight mb-1" style={{fontSize:20}}>{s.proveedor_nombre}</p>
                <p className={`font-saira font-bold text-center ${s.saldo_actual>0?'text-red-500':s.saldo_actual<0?'text-green-600':'text-p-ink2'}`} style={{fontSize:15}}>
                  {moneyARS(Math.abs(s.saldo_actual))}
                </p>
              </div>
            ))}
          </div>
        )}

        <p className="text-[10px] text-p-ink2 mt-2 px-1">📒 Solo facturas en cuenta corriente generan deuda.</p>
      </div>

      {/* Panel detalle — ocupa el resto */}
      {sel ? (
        <div style={{display:'flex',flexDirection:'column',gap:10}}>

          {/* Header proveedor */}
          <div className="bg-white border border-p-line rounded-xl px-4 py-3">
            <div className="flex items-start justify-between mb-1">
              <p className="font-saira font-bold text-p-ink text-2xl flex-1">{sel.proveedor_nombre}</p>
              <div className="flex items-center gap-2 shrink-0 ml-3">
                <button onClick={()=>setOpenAjuste(true)} style={{background:'#fff',color:'#b45309',border:'1px solid #fcd34d',borderRadius:10,padding:'7px 14px',fontSize:12,fontWeight:700,cursor:'pointer',whiteSpace:'nowrap'}}>
                  ± Ajuste
                </button>
                {sel.saldo_actual > 0 && (
                  <button onClick={abrirOrdenPago} style={{...btnBlue,padding:'7px 14px',fontSize:12,whiteSpace:'nowrap'}}>
                    🧾 Nueva OP
                  </button>
                )}
                <button onClick={()=>setSel(null)} className="text-p-gray text-lg leading-none">✕</button>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-p-ink2">Cargado {moneyARS(sel.total_debe)} · Pagado {moneyARS(sel.total_haber)}</p>
              <p className={`font-bold text-xl ${sel.saldo_actual>0?'text-red-500':'text-green-600'}`}>
                {sel.saldo_actual>0?'Debemos ':'A favor '}{moneyARS(Math.abs(sel.saldo_actual))}
              </p>
            </div>
          </div>

          {/* Panel saldos o movimientos */}
          <div className="bg-white border border-p-line rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-p-line bg-p-light/50">
              <div className="flex gap-1">
                <button onClick={()=>setVistaMovs(false)}
                  style={!vistaMovs?{background:'#00A550',color:'#fff',border:'none',borderRadius:8,padding:'4px 12px',fontWeight:700,fontSize:11,cursor:'pointer'}:{background:'transparent',color:'#6b7280',border:'1px solid #e5e7eb',borderRadius:8,padding:'4px 12px',fontWeight:600,fontSize:11,cursor:'pointer'}}>
                  Saldos
                </button>
                <button onClick={()=>setVistaMovs(true)}
                  style={vistaMovs?{background:'#00A550',color:'#fff',border:'none',borderRadius:8,padding:'4px 12px',fontWeight:700,fontSize:11,cursor:'pointer'}:{background:'transparent',color:'#6b7280',border:'1px solid #e5e7eb',borderRadius:8,padding:'4px 12px',fontWeight:600,fontSize:11,cursor:'pointer'}}>
                  Movimientos
                </button>
              </div>
              <span className="text-[10px] text-p-ink2">
                {vistaMovs ? `${movs.length} registros` : `${pendientesPago.length} pendientes`}
              </span>
            </div>

            {/* Vista saldos pendientes */}
            {!vistaMovs && (
              <div className="overflow-y-auto" style={{maxHeight:400}}>
                {pendientesPago.length === 0 ? (
                  <p className="text-sm text-p-ink2 text-center py-8">Sin facturas pendientes de pago ✓</p>
                ) : (
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-p-light">
                      <tr>
                        <th className="text-left px-3 py-2 font-semibold text-p-ink2">Fecha</th>
                        <th className="text-left px-3 py-2 font-semibold text-p-ink2">Comprobante</th>
                        <th className="text-right px-3 py-2 font-semibold text-red-400">Total</th>
                        <th className="text-right px-3 py-2 font-semibold text-p-dark">Saldo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendientesPago.map((p:any,i)=>{
                        const c = p.comp
                        const tipoEf = c?.tipo || p.tipo
                        const tipoLabel = tipoEf==='nc'?'NC':tipoEf==='nd'?'ND':tipoEf==='ajuste'?'AJ':'FC'
                        const nro = c
                          ? `${tipoLabel} ${c.letra||''} ${c.punto_venta||''}-${c.numero||''}`
                          : (p.descripcion || tipoLabel)
                        const monto = +p.monto  // signado: cargos +, NC/créditos −
                        return (
                          <tr key={p.id} className={`border-t border-p-line2 ${c?'cursor-pointer hover:bg-p-light/40':''} ${i%2===0?'':'bg-p-light/20'}`}
                            onClick={()=>{ if(c) setVerComp(c) }}>
                            <td className="px-3 py-2 font-mono">{p.fecha?.split('-').reverse().join('/')}</td>
                            <td className="px-3 py-2 font-semibold text-p-ink truncate max-w-[280px]" title={p.descripcion||''}>{nro}</td>
                            <td className={`px-3 py-2 text-right font-mono font-bold ${monto<0?'text-green-600':'text-red-500'}`}>
                              {monto<0?'−':''}{moneyARS(Math.abs(monto))}
                            </td>
                            <td className={"px-3 py-2 text-right font-mono font-bold text-red-500"}>{moneyARS(+p.saldo_acumulado)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* Vista movimientos completa */}
            {vistaMovs && (
            <div className="overflow-y-auto" style={{maxHeight:400}}>
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-p-light">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold text-p-ink2">Fecha</th>
                    <th className="text-left px-3 py-2 font-semibold text-p-ink2">Descripción</th>
                    <th className="text-right px-3 py-2 font-semibold text-red-400">Debe</th>
                    <th className="text-right px-3 py-2 font-semibold text-green-600">Haber</th>
                    <th className="text-right px-3 py-2 font-semibold text-p-dark">Saldo</th>
                  </tr>
                </thead>
              <tbody>
                {movs.map((m,i)=>(
                  <tr key={m.id} className={`border-t border-p-line2 ${i%2===0?'':'bg-p-light/30'}`}>
                    <td className="px-3 py-2 font-mono">{m.fecha?.split('-').reverse().join('/')}</td>
                    <td className="px-3 py-2 max-w-[100px]">
                      <p className="truncate">{m.descripcion||'—'}</p>
                      {m.tipo==='pago'&&<span className="text-[9px] font-bold bg-green-100 text-green-700 px-1 rounded">PAGO</span>}
                      {m.tipo==='ajuste'&&m.notas?.includes('NC aplicada')&&<span className="text-[9px] font-bold bg-blue-100 text-blue-700 px-1 rounded">NC APLICADA</span>}
                      {m.tipo==='ajuste'&&!m.notas?.includes('pendiente_nc')&&!m.notas?.includes('NC aplicada')&&<span className="text-[9px] font-bold bg-gray-100 text-gray-600 px-1 rounded">AJUSTE</span>}
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-bold text-red-500">{m.debe>0?moneyARS(m.debe):'—'}</td>
                    <td className="px-3 py-2 text-right font-mono font-bold text-green-600">{m.haber>0?moneyARS(m.haber):'—'}</td>
                    <td className={`px-3 py-2 text-right font-mono font-bold ${m.saldo>0?'text-red-500':m.saldo<0?'text-green-600':'text-p-ink2'}`}>
                      {moneyARS(Math.abs(m.saldo))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
            )}
          </div>

          {/* OPs + NC pendientes — dos columnas abajo */}
          {(ordenesPago.length > 0 || ajustesPendNC.length > 0) && (
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>

              {/* OPs */}
              {ordenesPago.length > 0 && (
                <div className="bg-white border border-p-line rounded-xl p-3">
                  <p className="text-[10px] font-semibold text-p-ink2 uppercase tracking-wider mb-2">Órdenes de pago</p>
                  <div className="flex flex-col gap-1.5">
                    {ordenesPago.map(op=>(
                      <div key={op.id} className="flex flex-col text-xs border border-p-line rounded-lg overflow-hidden"
                        style={op.anulada?{opacity:.75,background:'#fafafa'}:undefined}>
                        <div className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-p-light/50"
                          onClick={async ()=>{
                            const abrir = verOPs===op.id?null:op.id
                            setVerOPs(abrir)
                            if (abrir && !opItemsCache[op.id]) {
                              const { data: its } = await supabase.from('orden_pago_items')
                                .select('tipo,numero,monto').eq('orden_pago_id', op.id).order('tipo')
                              setOpItemsCache(prev=>({...prev,[op.id]:its??[]}))
                            }
                          }}>
                          <div>
                            <span className="font-semibold text-p-ink">OP Nº {op.numero}</span>
                            {op.anulada && <span className="ml-1.5 text-[9px] font-bold text-red-600 bg-red-50 border border-red-200 rounded px-1 py-0.5">ANULADA</span>}
                            <span className="text-p-ink2 ml-1">· {op.fecha?.split('-').reverse().join('/')} · {op.forma_pago}</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-mono font-bold" style={{color:op.anulada?'#9ca3af':'#15803d',textDecoration:op.anulada?'line-through':undefined}}>{moneyARS(op.total_pagado)}</span>
                            <span className="text-p-ink2 text-[10px]">{verOPs===op.id ? '▲' : '▼'}</span>
                          </div>
                        </div>
                        {verOPs===op.id && (
                          <div className="border-t border-p-line">
                            {/* Qué imputó esta OP */}
                            <div className="px-3 py-2 bg-p-light/40 flex flex-col gap-1">
                              {(opItemsCache[op.id]??[]).length===0
                                ? <p className="text-[10px] text-p-ink2">Cargando imputaciones…</p>
                                : (opItemsCache[op.id]??[]).map((it:any,i:number)=>(
                                  <div key={i} className="flex items-center justify-between">
                                    <span className="text-[11px]">{it.tipo==='nc'?'NC':'FC'} {it.numero}</span>
                                    <span className="font-mono text-[11px]" style={{color:it.tipo==='nc'?'#b45309':'#374151'}}>{it.tipo==='nc'?'−':''}{moneyARS(it.monto)}</span>
                                  </div>
                                ))}
                              {(op.total_nc>0 || op.total_facturas>0) && (
                                <div className="flex items-center justify-between border-t border-p-line pt-1 mt-0.5 text-[10px] text-p-ink2">
                                  <span>Facturas {moneyARS(op.total_facturas)}{op.total_nc>0?` − NC ${moneyARS(op.total_nc)}`:''}</span>
                                  <span>Pagado {moneyARS(op.total_pagado)}</span>
                                </div>
                              )}
                              {op.notas && <p className="text-[10px] text-p-ink2 italic">{op.notas}</p>}
                            </div>
                            {op.anulada ? (
                              <div className="px-3 py-2 bg-red-50 border-t border-red-100">
                                <p className="text-[10px] text-red-600">Anulada el {op.fecha_anulacion?.split('-').reverse().join('/')} — {op.motivo_anulacion}</p>
                              </div>
                            ) : (
                              <div className="px-3 py-2 bg-red-50 border-t border-red-100 flex items-center justify-between gap-3">
                                <p className="text-[10px] text-red-600">Anular esta OP elimina su pago de la CC y las facturas vuelven a pendientes.</p>
                                <button onClick={()=>{anularOrdenPago(op)}}
                                  disabled={borrandoOp===op.id}
                                  className="text-[11px] font-bold text-red-600 border border-red-300 bg-white rounded px-2 py-1 hover:bg-red-100 shrink-0">
                                  {borrandoOp===op.id ? '…' : 'Anular OP'}
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* NC pendientes */}
              {ajustesPendNC.length > 0 && (
                <div style={{background:'#fefce8',border:'0.5px solid #fef08a',borderRadius:10,padding:'10px 12px'}}>
                  <p style={{fontSize:10,fontWeight:600,color:'#854d0e',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:6}}>
                    NC pendientes
                  </p>
                  <p style={{fontSize:10,color:'#92400e',marginBottom:6}}>
                    Cargá la NC en Compras y seleccioná los artículos pendientes
                  </p>
                  <div className="flex flex-col gap-1.5">
                    {ajustesPendNC.map((a:any)=>{
                      const monto = a.costo_unitario ? Math.round(a.costo_unitario * (a.cantidad || 0)) : null
                      const st = a.stock
                      const fechaStr = a.fecha ? a.fecha.split('-').reverse().join('/') : ''
                      const codigo = st?.codigo || ''
                      const desc = st?.descripcion || a.descripcion || ''
                      const nota = a.nota && a.nota !== 'Roto' && a.nota !== 'Roto / Dañado' ? a.nota : ''
                      const fullLabel = [fechaStr, codigo, desc, nota].filter(Boolean).join(' · ')
                      return (
                        <div key={a.id} className="flex items-start justify-between gap-2">
                          <div className="flex flex-col min-w-0">
                            <span style={{color:'#78350f',fontSize:11,fontWeight:600}} className="font-mono">{fechaStr} · {codigo}</span>
                            <span style={{color:'#92400e',fontSize:10}} className="truncate" title={fullLabel}>{desc}{nota ? ` — ${nota}` : ''}</span>
                          </div>
                          <div className="flex flex-col items-end shrink-0">
                            <span style={{color:'#92400e',fontWeight:700,fontSize:11}} className="font-mono">
                              {monto !== null ? moneyARS(monto) : <span style={{color:'#b45309',fontSize:10}}>sin costo</span>}
                            </span>
                            <span style={{color:'#92400e',fontSize:10}} className="font-mono">×{a.cantidad||1} u.</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

            </div>
          )}

        </div>
      ) : (
        <div className="bg-white border border-p-line rounded-xl p-8 flex items-center justify-center">
          <p className="text-sm text-p-ink2">Seleccioná un proveedor para ver sus movimientos</p>
        </div>
      )}

    </div>

      {/* Modal ver comprobante con ítems */}
      {verComp && (
        <Modal open={!!verComp} onClose={()=>setVerComp(null)} title={`${verComp.tipo==='nc'?'NC':verComp.tipo==='nd'?'ND':'Factura'} ${verComp.letra||''} ${verComp.punto_venta||''}-${verComp.numero||''}`}>
          <div className="flex flex-col gap-3 text-sm">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="flex justify-between"><span className="text-p-ink2">Fecha</span><span>{verComp.fecha?.split('-').reverse().join('/')}</span></div>
              <div className="flex justify-between"><span className="text-p-ink2">Total</span><span className="font-bold text-red-500">{moneyARS(verComp.total)}</span></div>
              <div className="flex justify-between col-span-2"><span className="text-p-ink2">Estado</span><span className={verComp.saldado?'text-green-600 font-semibold':'text-amber-600 font-semibold'}>{verComp.saldado?'✓ Saldado':'⏳ Pendiente de pago'}</span></div>
            </div>
            {verComp.items && verComp.items.length > 0 && (
              <div>
                <p className="text-[11px] font-bold text-p-ink2 uppercase tracking-wider mb-1.5">Ítems</p>
                <table className="w-full text-xs">
                  <thead className="bg-p-light">
                    <tr>
                      <th className="text-left px-2 py-1.5 font-semibold text-p-ink2">Descripción</th>
                      <th className="text-left px-2 py-1.5 font-semibold text-p-ink2">Código</th>
                      <th className="text-right px-2 py-1.5 font-semibold text-p-ink2">Cant</th>
                      <th className="text-right px-2 py-1.5 font-semibold text-p-ink2">Precio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {verComp.items.map((it:any,i:number)=>(
                      <tr key={i} className={`border-t border-p-line2 ${i%2===0?'':'bg-p-light/30'}`}>
                        <td className="px-2 py-1.5">{it.d||'—'}</td>
                        <td className="px-2 py-1.5 font-mono text-[10px]">{(it as any).codigo||'—'}</td>
                        <td className="px-2 py-1.5 text-right">{it.c}</td>
                        <td className="px-2 py-1.5 text-right font-mono">{moneyARS(it.p)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="flex justify-end">
              <button onClick={()=>setVerComp(null)} style={btnGray}>Cerrar</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal registrar pago */}
      <Modal open={openPago} onClose={()=>setOpenPago(false)} title={`Registrar pago — ${sel?.proveedor_nombre}`}>
        <div className="flex flex-col gap-3">
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
            <p className="text-sm text-red-700">Saldo pendiente</p>
            <p className="font-saira font-bold text-2xl text-red-600">{moneyARS(sel?.saldo_actual||0)}</p>
          </div>
          <Field label="Monto del pago *">
            <Input value={formPago.monto} onChange={e=>setFormPago(p=>({...p,monto:e.target.value}))} placeholder="0"/>
          </Field>
          {formPago.monto && (
            <div className="bg-p-light rounded-lg p-3 text-sm flex justify-between">
              <span className="text-p-ink2">Saldo restante</span>
              <span className={`font-bold ${(sel?.saldo_actual||0)-(+formPago.monto||0)>0?'text-red-500':'text-green-600'}`}>
                {moneyARS(Math.max(0,(sel?.saldo_actual||0)-(+formPago.monto||0)))}
              </span>
            </div>
          )}
          <Field label="Forma de pago">
            <select value={formPago.forma_pago} onChange={e=>setFormPago(p=>({...p,forma_pago:e.target.value}))}
              className="w-full border border-p-line rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-p-green">
              <option value="Transferencia">Transferencia</option>
              <option value="Efectivo">Efectivo</option>
              <option value="Cheque">🖊 Cheque</option>
            </select>
          </Field>
          {formPago.forma_pago==='Cheque'&&<ChequeFields value={chequePago} onChange={setChequePago}/>}
          <Field label="Fecha">
            <Input type="date" value={formPago.fecha} onChange={e=>setFormPago(p=>({...p,fecha:e.target.value}))}/>
          </Field>
          <Field label="Notas">
            <Input value={formPago.notas} onChange={e=>setFormPago(p=>({...p,notas:e.target.value}))} placeholder="Referencia…"/>
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={()=>setOpenPago(false)} style={btnGray}>Cancelar</button>
            <button onClick={registrarPago}
              disabled={!formPago.monto||(formPago.forma_pago==='Cheque'&&!chequePago.numero)}
              style={{...btn,opacity:(!formPago.monto||(formPago.forma_pago==='Cheque'&&!chequePago.numero))?.5:1}}>
              ✓ Registrar pago
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal Orden de Pago: elegir varias facturas + NC para un solo pago */}
      <Modal open={opOpen} onClose={()=>setOpOpen(false)} title={`Nueva Orden de Pago — ${sel?.proveedor_nombre}`} size="lg">
        <div className="flex flex-col gap-3">
          {pendientes.length === 0 ? (
            <Empty msg="Este proveedor no tiene facturas ni NC pendientes de aplicar." />
          ) : (
            <>
              <p className="text-[11px] text-p-ink2">Tildá las facturas que vas a pagar y las NC que querés aplicar a este pago.</p>
              <div className="flex flex-col gap-1.5 max-h-72 overflow-y-auto">
                {pendientes.map(p => (
                  <label key={p.id}
                    className={`flex items-center gap-3 border rounded-lg px-3 py-2 cursor-pointer ${seleccion[p.id] ? (p.tipo==='nc'?'border-amber-400 bg-amber-50':'border-p-green bg-green-50') : 'border-p-line'}`}>
                    <input type="checkbox" checked={!!seleccion[p.id]} onChange={()=>toggleSeleccion(p.id)} className="accent-p-green"/>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${p.tipo==='nc'?'bg-amber-100 text-amber-700':'bg-blue-50 text-blue-700'}`}>
                      {p.tipo==='nc'?'NC':'Factura'}
                    </span>
                    <span className="flex-1 text-sm font-mono">{p.letra||''}{p.punto_venta||''}-{p.numero||''}</span>
                    <span className="text-xs text-p-ink2">{p.fecha.split('-').reverse().join('/')}</span>
                    <span className={`font-mono font-bold text-sm ${p.tipo==='nc'?'text-amber-600':'text-p-ink'}`}>
                      {p.tipo==='nc'?'− ':''}{moneyARS(p.total)}
                    </span>
                  </label>
                ))}
              </div>

              <div className="bg-p-light rounded-xl p-3 flex flex-col gap-1.5">
                <div className="flex justify-between text-sm"><span className="text-p-ink2">Total facturas seleccionadas</span><span className="font-mono">{moneyARS(totalFacturasSel)}</span></div>
                {totalNcSel > 0 && (
                  <div className="flex justify-between text-sm text-amber-600"><span>NC aplicadas</span><span className="font-mono">− {moneyARS(totalNcSel)}</span></div>
                )}
                <div className="flex justify-between font-saira font-bold text-lg border-t border-p-line mt-1 pt-1">
                  <span>TOTAL A PAGAR</span><span>{moneyARS(totalAPagar)}</span>
                </div>
              </div>

              <div className="flex flex-col gap-3">

                {/* ── Cheques propios emitidos al proveedor ── */}
                {chequesDisp.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] font-bold text-p-ink2 uppercase tracking-wider">Cheques emitidos a {sel?.proveedor_nombre}</p>
                      <span className="text-xs text-p-ink2 font-mono">
                        {moneyARS(chequesDisp.filter(ch=>chequesSelIds.has(ch.id)).reduce((a,ch)=>a+(+ch.monto),0))}
                      </span>
                    </div>
                    <input value={chequeQ} onChange={e=>setChequeQ(e.target.value)}
                      placeholder="Buscar por número…"
                      className="border border-p-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-p-green"/>
                    <div className="flex flex-col gap-1 max-h-52 overflow-y-auto">
                      {chequesDisp.filter(ch=>!chequeQ||ch.numero?.includes(chequeQ.replace(/\s/g,''))).map(ch=>(
                        <label key={ch.id} className={`flex items-center gap-2 border rounded-lg px-3 py-2 cursor-pointer text-sm ${chequesSelIds.has(ch.id)?'border-p-green bg-green-50':'border-p-line hover:bg-p-light/50'}`}>
                          <input type="checkbox" checked={chequesSelIds.has(ch.id)}
                            onChange={()=>{
                              const next = new Set(chequesSelIds)
                              next.has(ch.id) ? next.delete(ch.id) : next.add(ch.id)
                              setChequesSelIds(next)
                            }} className="accent-p-green w-4 h-4 shrink-0"/>
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${ch.formato==='echeq'?'bg-blue-100 text-blue-700':'bg-gray-100 text-gray-600'}`}>
                            {ch.formato==='echeq'?'E-Cheq':'Físico'}
                          </span>
                          <span className="font-mono font-bold text-xs">{ch.numero}</span>
                          <span className="text-xs text-p-ink2">{ch.banco}</span>
                          <span className="text-xs text-p-ink2">vto: {ch.fecha_cobro?.split('-').reverse().join('/')}</span>
                          <span className="ml-auto font-mono font-bold">{moneyARS(+ch.monto)}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── Cheques nuevos en serie ── */}
                <div className="flex flex-col gap-2">
                  <p className="text-[11px] font-bold text-p-ink2 uppercase tracking-wider">🖊 Cheques nuevos</p>
                  {opChequesNuevos.length > 0 && (
                    <div className="flex flex-col gap-1">
                      {opChequesNuevos.map((ch,i)=>(
                        <div key={i} className="flex items-center gap-2 border border-blue-200 bg-blue-50 rounded-lg px-3 py-1.5 text-xs">
                          <span className="font-mono font-bold">{ch.numero}</span>
                          <span className="text-p-ink2">{cuentasPropias.find(c=>c.id===ch.cuenta_id)?.banco||''}</span>
                          <span className="text-p-ink2">vto {ch.fecha_cobro?.split('-').reverse().join('/')}</span>
                          <span className="ml-auto font-mono font-bold">{moneyARS(+ch.monto)}</span>
                          <button onClick={()=>setOpChequesNuevos(p=>p.filter((_,x)=>x!==i))} className="text-red-400 hover:text-red-600 font-bold px-1">✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="border border-blue-200 bg-blue-50/50 rounded-xl p-2.5 grid grid-cols-2 gap-2">
                    <Field label="N° cheque">
                      <Input value={chComposer.numero} onChange={e=>setChComposer(p=>({...p,numero:e.target.value}))} placeholder="65715343"/>
                    </Field>
                    <Field label="Cuenta">
                      <Select value={chComposer.cuenta_id} onChange={e=>setChComposer(p=>({...p,cuenta_id:e.target.value}))}>
                        {cuentasPropias.map(c=><option key={c.id} value={c.id}>{c.banco} {c.tipo}</option>)}
                      </Select>
                    </Field>
                    <Field label="Monto $">
                      <Input value={chComposer.monto} onChange={e=>setChComposer(p=>({...p,monto:e.target.value}))} placeholder="1456086.50"/>
                    </Field>
                    <Field label="Fecha de cobro">
                      <Input type="date" value={chComposer.fecha_cobro} onChange={e=>setChComposer(p=>({...p,fecha_cobro:e.target.value}))}/>
                    </Field>
                    <button onClick={()=>{
                        if (!chComposer.numero || !parseFloat(chComposer.monto) || !chComposer.fecha_cobro) { alert('Completá número, monto y fecha de cobro.'); return }
                        setOpChequesNuevos(p=>[...p,{...chComposer}])
                        // Precargar el siguiente de la serie: mismos datos, número +1, vencimiento +1 mes
                        const sigNum = /^\d+$/.test(chComposer.numero) ? String(BigInt(chComposer.numero)+BigInt(1)).padStart(chComposer.numero.length,'0') : ''
                        const vto = new Date(chComposer.fecha_cobro+'T12:00:00'); vto.setMonth(vto.getMonth()+1)
                        setChComposer(p=>({...p, numero: sigNum, fecha_cobro: vto.toISOString().slice(0,10)}))
                      }}
                      className="col-span-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-lg py-2">
                      + Agregar cheque a la serie
                    </button>
                    <p className="col-span-2 text-[10px] text-p-ink2">Al agregar, el próximo queda precargado con el número siguiente y el vencimiento un mes después — editá lo que haga falta.</p>
                  </div>
                </div>

                {/* ── Otras formas de pago (transferencia, efectivo) ── */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-bold text-p-ink2 uppercase tracking-wider">Otras formas de pago</p>
                    <button onClick={()=>setOpPagos(p=>[...p,{tipo:'Transferencia',monto:'',chequeSelId:'',chequeQ:'',chequeNuevo:EMPTY_CHEQUE}])}
                      style={{...btnSm,fontSize:11}}>+ Agregar</button>
                  </div>
                  {opPagos.map((pago,pi)=>(
                    <div key={pi} className="flex flex-col gap-1.5">
                      <div className="flex items-center gap-2">
                        <select value={pago.tipo} onChange={e=>{const v=[...opPagos];v[pi]={...v[pi],tipo:e.target.value};setOpPagos(v)}}
                          className="border border-p-line rounded-lg px-2 py-1.5 text-sm bg-white flex-1 focus:outline-none focus:border-p-green">
                          <option value="Transferencia">Transferencia</option>
                          <option value="Efectivo">Efectivo</option>
                        </select>
                        <input value={pago.monto} onChange={e=>{const v=[...opPagos];v[pi]={...v[pi],monto:e.target.value};setOpPagos(v)}}
                          placeholder="Monto $" className="border border-p-line rounded-lg px-2 py-1.5 text-sm w-32 font-mono focus:outline-none focus:border-p-green"/>
                        {opPagos.length > 1 && (
                          <button onClick={()=>setOpPagos(p=>p.filter((_,i)=>i!==pi))} className="text-red-400 hover:text-red-600 text-lg font-bold px-1">✕</button>
                        )}
                      </div>
                      {pago.tipo==='Cheque nuevo' && (
                        <ChequeFields value={pago.chequeNuevo} onChange={val=>{const v=[...opPagos];v[pi]={...v[pi],chequeNuevo:val};setOpPagos(v)}}/>
                      )}
                    </div>
                  ))}
                </div>

                {/* ── Resumen total ── */}
                {(() => {
                  const totalCheques = chequesDisp.filter(ch=>chequesSelIds.has(ch.id)).reduce((a,ch)=>a+(+ch.monto),0)
                  const totalNuevos = opChequesNuevos.reduce((a,ch)=>a+(parseFloat(ch.monto)||0),0)
                  const totalOtros = opPagos.reduce((a,p)=>a+(parseFloat(p.monto)||0),0)
                  const totalCargado = totalCheques + totalNuevos + totalOtros
                  const diff = Math.abs(totalCargado - totalAPagar)
                  return (totalCheques > 0 || totalOtros > 0) ? (
                    <div className={`flex justify-between text-sm px-1 font-bold ${diff < 1 ? 'text-green-600' : 'text-amber-600'}`}>
                      <span>Total cargado {diff < 1 ? '✓' : `(falta ${moneyARS(totalAPagar - totalCargado)})`}</span>
                      <span className="font-mono">{moneyARS(totalCargado)}</span>
                    </div>
                  ) : null
                })()}
              </div>
              <Field label="Fecha">
                <Input type="date" value={opForm.fecha} onChange={e=>setOpForm(p=>({...p,fecha:e.target.value}))}/>
              </Field>
              <Field label="Notas">
                <Input value={opForm.notas} onChange={e=>setOpForm(p=>({...p,notas:e.target.value}))} placeholder="Referencia, número de operación…"/>
              </Field>

              <div className="flex justify-end gap-2 pt-1">
                <button onClick={()=>setOpOpen(false)} style={btnGray}>Cancelar</button>
                <button onClick={confirmarOrdenPago} disabled={guardandoOp || (facturasSel.length===0 && ncSel.length===0)}
                  style={{...btn,opacity:(guardandoOp || (facturasSel.length===0 && ncSel.length===0))?.5:1}}>
                  {guardandoOp ? 'Generando…' : '🧾 Confirmar y emitir Orden de Pago'}
                </button>
              </div>
            </>
          )}
        </div>
      </Modal>
      {/* Modal Ajuste / Pendiente NC */}
      <Modal open={openAjuste} onClose={()=>setOpenAjuste(false)} title={`Ajuste — ${sel?.proveedor_nombre}`}>
        <div className="flex flex-col gap-3">
          <Field label="Descripción">
            <Input value={ajusteForm.descripcion} onChange={e=>setAjusteForm(p=>({...p,descripcion:e.target.value}))} placeholder="Ej: Vidrio roto / devolución…"/>
          </Field>
          <Field label="Monto ($)">
            <Input value={ajusteForm.monto} onChange={e=>setAjusteForm(p=>({...p,monto:e.target.value}))} placeholder="0"/>
          </Field>
          <label className="flex items-center gap-2 text-sm cursor-pointer bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
            <input type="checkbox" checked={ajusteForm.pendiente_nc} onChange={e=>setAjusteForm(p=>({...p,pendiente_nc:e.target.checked}))} className="accent-amber-600"/>
            <div>
              <p className="font-semibold text-amber-800">Pendiente de Nota de Crédito</p>
              <p className="text-[11px] text-amber-600">El proveedor va a emitir una NC. Este ajuste queda marcado para reemplazarlo cuando llegue.</p>
            </div>
          </label>
          <Field label="Notas (opcional)">
            <Input value={ajusteForm.notas} onChange={e=>setAjusteForm(p=>({...p,notas:e.target.value}))} placeholder="Detalle…"/>
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={()=>setOpenAjuste(false)} style={btnGray}>Cancelar</button>
            <button onClick={guardarAjuste} disabled={!ajusteForm.monto}
              style={{...btn,opacity:!ajusteForm.monto?.5:1}}>✓ Guardar ajuste</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
