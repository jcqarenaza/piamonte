'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Venta, StockItem } from '@/lib/types/database'
import { Btn, Modal, Field, Input, Select, KpiCard, Empty, AlarmBar } from '@/components/ui'
import { moneyARS2 as moneyARS, todayStr } from '@/lib/utils/format'
import { useDolar } from '@/components/dolar/DolarBar'

const PAGOS = ['Efectivo', 'Transferencia', 'Tarjeta', 'Cuenta corriente']

export default function CajaClient({ userId, perfil }: { userId: string; perfil: { rol: string } }) {
  const [fecha, setFecha] = useState(todayStr())
  const [ventas, setVentas] = useState<Venta[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [stockItems, setStockItems] = useState<StockItem[]>([])
  const [stockQ, setStockQ] = useState('')
  const [stockSug, setStockSug] = useState<StockItem[]>([])
  const [editCosto, setEditCosto] = useState<Record<string, string>>({})
  const [editId, setEditId]     = useState<string|null>(null)
  const [editForm, setEditForm] = useState({ codigo:'', descripcion:'', costo:'', precio:'', cliente:'', pago:'', comprobante:'' })
  const [modoAseg, setModoAseg] = useState(false)
  const [asegCaja, setAsegCaja] = useState('')
  const [osCaja, setOsCaja] = useState<any[]>([])
  const [osSelCaja, setOsSelCaja] = useState<any|null>(null)
  const [editStockQ, setEditStockQ]   = useState('')
  const [editStockSug, setEditStockSug] = useState<StockItem[]>([])
  const supabase = createClient()
  const { usdStr } = useDolar()
  const usdBNA = (n: number) => usdStr(n, 'oficial')
  const isAdmin = perfil.rol === 'admin' || perfil.rol === 'gerencial'

  const esCajaRol = perfil.rol === 'caja'
  const [reciboVenta, setReciboVenta] = useState<any|null>(null)
  const [itemsCaja, setItemsCaja] = useState<{desc:string;codigo:string;precio:number|string;costo:number;stock_id:string|null;cantidad:number}[]>([])
  const [cuentasBanco, setCuentasBanco] = useState<any[]>([])
  const [cuentaBancoId, setCuentaBancoId] = useState('')
  const [form, setForm] = useState({
    descripcion: '', costo: '', precio: '', cantidad: '1', cliente: '', comprobante: '',
    pago: 'Efectivo', origen: 'compra' as 'stock' | 'compra',
    stock_id: null as string | null,
    descontarStock: true,
    tipo_id: '', tipo_nombre: ''
  })
  const [tipos, setTipos] = useState<{id:string;nombre:string}[]>([])
  const [tab, setTab] = useState<'ventas'|'gastos'|'ctacte'>('ventas')
  const [gastos, setGastos] = useState<any[]>([])
  const [recibos, setRecibos] = useState<any[]>([])
  const [pagosProveedores, setPagosProveedores] = useState<any[]>([])
  const [gastoOpen, setGastoOpen] = useState(false)
  const [gastoForm, setGastoForm] = useState({ categoria:'', descripcion:'', monto:'', forma_pago:'Efectivo', comprobante:'' })
  const [categoriasGasto, setCategoriasGasto] = useState<{id:string;nombre:string;color:string}[]>([])

const PAGOS_GASTO = ['Efectivo','Transferencia','Débito','Crédito','Cheque']

  const loadVentas = useCallback(async () => {
    setLoading(true)
    const esGerencial = perfil.rol === 'gerencial' || perfil.rol === 'admin'
    const esCaja = perfil.rol === 'caja'

    // Filtrar por es_caja2 según el rol
    let q = supabase.from('ventas').select('*').eq('fecha', fecha).order('created_at', { ascending: false })
    if (perfil.rol === 'caja') q = (q as any).eq('user_id', userId)
    if (esCaja) {
      q = q.eq('es_caja2', true)   // Caja solo ve sus ventas (caja2)
    } else if (!esGerencial) {
      q = q.eq('es_caja2', false)  // Admin/Ventas solo ven caja1
    }
    // Gerencial ve todo (sin filtro)

    const [ventasRes, gastosRes, recibosRes, pagosProvRes] = await Promise.all([
      q,
      supabase.from('gastos').select('*').eq('fecha', fecha).order('created_at', { ascending: false }),
      supabase.from('recibos_cobro').select('*').eq('fecha', fecha).order('created_at', { ascending: false }),
      supabase.from('cuentas_banco').select('id,banco,tipo,alias').eq('activo',true).order('banco').then(({data})=>setCuentasBanco(data??[])),
    supabase.from('cuenta_corriente_proveedores').select('*').eq('fecha', fecha).eq('tipo','pago').order('created_at', { ascending: false }),
    ])
    setVentas(ventasRes.data ?? [])
    setGastos(gastosRes.data ?? [])
    setRecibos(recibosRes.data ?? [])
    setPagosProveedores(pagosProvRes.data ?? [])
    setLoading(false)
  }, [fecha, supabase, perfil.rol])

  useEffect(() => { loadVentas() }, [loadVentas])

  useEffect(() => {
    supabase.from('tipos_cliente').select('id,nombre').order('nombre').then(({data})=>setTipos(data??[]))
  }, [supabase])

  useEffect(() => {
    supabase.from("stock").select("id,descripcion,codigo,marca,pos,precio_venta,costo,cantidad").gt("cantidad",0).then(({ data }) => setStockItems((data as unknown as StockItem[]) ?? []))
    supabase.from("categorias_gasto").select("id,nombre,color").eq("activo",true).order("orden").then(({ data }) => setCategoriasGasto(data ?? []))
  }, [supabase])

  // Sugerir stock en modal edición
  useEffect(() => {
    if (editStockQ.length < 2) { setEditStockSug([]); return }
    const q = editStockQ.toUpperCase()
    setEditStockSug(stockItems.filter(s => (s.descripcion + ' ' + (s.marca??'') + ' ' + (s.codigo??'')).toUpperCase().includes(q)).slice(0, 6))
  }, [editStockQ, stockItems])

  function pickEditStock(s: StockItem) {
    setEditForm(p => ({
      ...p,
      codigo: s.codigo ?? '',
      descripcion: s.descripcion,
      costo: s.costo ? String(Math.round(s.costo)) : p.costo,
      precio: s.precio_venta ? String(Math.round(s.precio_venta)) : p.precio,
    }))
    setEditStockQ(''); setEditStockSug([])
  }

  // Sugerir stock
  useEffect(() => {
    if (stockQ.length < 2) { setStockSug([]); return }
    const q = stockQ.toUpperCase()
    setStockSug(stockItems.filter(s => (s.descripcion + ' ' + s.marca + ' ' + (s.codigo ?? '')).toUpperCase().includes(q)).slice(0, 8))
  }, [stockQ, stockItems])

  function pickStock(s: StockItem) {
    setItemsCaja(prev => {
      const existe = prev.findIndex(i => i.stock_id === s.id)
      if (existe >= 0) { const next = [...prev]; next[existe].cantidad += 1; return next }
      return [...prev, { desc: s.descripcion, codigo: s.codigo||'', precio: s.precio_venta||0, costo: s.costo||0, stock_id: s.id, cantidad: 1 }]
    })
    // Setear descripcion, precio y costo desde el artículo seleccionado
    setForm(p => ({
      ...p,
      descripcion: s.descripcion,
      precio: s.precio_venta ? String(Math.round(s.precio_venta)) : '',
      costo: s.costo ? String(Math.round(s.costo)) : '',
      cantidad: '1',
      origen: 'stock',
      stock_id: s.id,
      descontarStock: true,
    }))
    setStockQ(''); setStockSug([])
  }

  const toUsd = (n: number) => usdBNA(n) !== '—' ? ' · ' + usdBNA(n) : ''

  // Rentabilidad real (sin IVA, con flete 1.5%)
  function calcRentabilidad(precio: number, costo: number | null) {
    if (!costo) return null
    const precioNeto = precio / 1.21
    const costoNeto  = costo / 1.21 / 1.015
    const ganancia   = precioNeto - costoNeto
    const margen     = Math.round((ganancia / precioNeto) * 100)
    return { precioNeto: Math.round(precioNeto), costoNeto: Math.round(costoNeto), ganancia: Math.round(ganancia), margen }
  }

  const gan = () => {
    const c = +form.costo.replace(/,/g, '.').replace(/[^0-9.]/g, ''), p = +form.precio.replace(/,/g, '.').replace(/[^0-9.]/g, '')
    return c && p ? p - c : null
  }

  async function cargarOsCaja(aseg: string) {
    setAsegCaja(aseg); setOsSelCaja(null)
    if (!aseg) { setOsCaja([]); return }
    const { data } = await supabase.from('ordenes_servicio')
      .select('*').eq('aseguradora', aseg).eq('estado','realizado')
      .eq('convertido_comp', false).order('fecha', {ascending:false}).limit(20)
    setOsCaja(data??[])
  }

  function seleccionarOsCaja(os: any) {
    setOsSelCaja(os)
    // Precargar datos de la OS en el form
    if (os.items?.length > 0) {
      const it = os.items[0]
      setForm(p=>({...p,
        descripcion: it.d || '',
        precio: String(it.p || ''),
        costo: String(it.costo || ''),
        cliente: os.cliente || '',
        stock_id: it.stock_id || null,
        descontarStock: !!it.stock_id,
        origen: it.stock_id ? 'stock' : 'compra',
      }))
    } else {
      setForm(p=>({...p, cliente: os.cliente || ''}))
    }
  }

  async function save() {
    if (!form.descripcion || !form.precio) { alert('Cargá descripción y precio.'); return }
    const c = +form.costo.replace(/,/g, '.').replace(/[^0-9.]/g, '') || null
    const p = +form.precio.replace(/,/g, '.').replace(/[^0-9.]/g, '')
    const { data: ventaIns } = await supabase.from('ventas').insert({
      fecha, descripcion: form.descripcion, costo: c, precio: p,
      cliente: form.cliente || null, comprobante: form.comprobante || null,
      pago: form.pago + (form.pago==='Transferencia' && cuentaBancoId ? ` (${cuentasBanco.find(c=>c.id===cuentaBancoId)?.banco||''} ${cuentasBanco.find(c=>c.id===cuentaBancoId)?.tipo||''})` : ''), origen: form.origen, pendiente: !c,
      stock_id: form.stock_id, user_id: userId,
      tipo_cliente_id: form.tipo_id||null,
      tipo_cliente_nombre: form.tipo_nombre||null,
      es_caja2: perfil.rol === 'caja'
    }).select('id').single()

    // Si viene de una OS de aseguradora (Mercantil/Sancor), marcarla como procesada
    if (osSelCaja?.id) {
      await supabase.from('ordenes_servicio').update({ convertido_comp: true, estado: 'realizado' }).eq('id', osSelCaja.id)
      setOsSelCaja(null); setAsegCaja(''); setOsCaja([])
    }
    // Si es cuenta corriente, registrar deuda del cliente
    if (form.pago === 'Cuenta corriente' && form.cliente) {
      await supabase.from('cuenta_corriente').insert({
        cliente_nombre: form.cliente,
        fecha,
        tipo: 'venta',
        descripcion: form.descripcion,
        debe: p,
        haber: 0,
        saldo: p,
        notas: form.comprobante ? `Comp. ${form.comprobante}` : null,
        user_id: userId,
      })
    }
    // Descontar stock — iterar todos los ítems con stock
    const notaVenta = [
      form.comprobante ? `Comp. ${form.comprobante}` : null,
      form.cliente || null,
      form.pago !== 'Efectivo' ? form.pago : null,
    ].filter(Boolean).join(' · ') || 'Venta de caja'
    const itemsParaDescontar = itemsCaja.filter(it => it.stock_id)
    if (itemsParaDescontar.length === 0 && form.origen === 'stock' && form.stock_id && form.descontarStock) {
      itemsParaDescontar.push({ desc: form.descripcion, codigo: '', precio: form.precio, costo: 0, stock_id: form.stock_id, cantidad: parseInt(form.cantidad)||1 })
    }
    for (const it of itemsParaDescontar) {
      const s = stockItems.find(x => x.id === it.stock_id)
      if (!s || s.cantidad <= 0) continue
      const { error: errStockIt } = await supabase.rpc('insertar_movimiento_stock', {
        p_stock_id: it.stock_id,
        p_tipo: 'salida',
        p_cantidad: it.cantidad || 1,
        p_precio_venta_unitario: parseFloat(String(it.precio).replace(/[^0-9.]/g,'')) || null,
        p_fecha: fecha,
        p_descripcion: notaVenta,
        p_user_id: userId || null,
      })
      if (errStockIt) alert(`⚠ Venta guardada pero error al descontar stock (${it.desc}): ${errStockIt.message}`)
      else setStockItems(prev => prev.map(x => x.id === it.stock_id ? { ...x, cantidad: x.cantidad - (it.cantidad||1) } : x))
    }
    setOpen(false)
    setItemsCaja([])
    setForm({ descripcion: '', costo: '', precio: '', cantidad: '1', cliente: '', comprobante: '', pago: 'Efectivo', origen: 'compra', stock_id: null, descontarStock: true, tipo_id: '', tipo_nombre: '' })
    loadVentas()
  }

  async function delVenta(v: Venta) {
    if (!confirm('¿Borrar venta?')) return
    if (v.origen === 'stock' && v.stock_id) {
      const s = stockItems.find(x => x.id === v.stock_id)
      if (s) {
        // Movimiento + devolución de stock en una sola transacción (RPC atómico)
        const { error: errStock2 } = await supabase.rpc('insertar_movimiento_stock', {
          p_stock_id: v.stock_id, p_tipo: 'entrada', p_cantidad: 1,
          p_fecha: v.fecha || fecha,
          p_descripcion: `Devolución — venta borrada (${(v.descripcion||'Caja').slice(0,40)})`,
          p_user_id: userId || null,
        })
        if (errStock2) { alert(`⚠ Venta borrada pero error al devolver stock: ${errStock2.message}`) }
        else setStockItems(prev => prev.map(x => x.id === v.stock_id ? { ...x, cantidad: x.cantidad + 1 } : x))
      }
    }
    await supabase.from('ventas').delete().eq('id', v.id)
    loadVentas()
  }

  async function updateCosto(v: Venta, costo: string) {
    const c = +costo.replace(/,/g, '.').replace(/[^0-9.]/g, '')
    if (!c) return
    await supabase.from('ventas').update({ costo: c, pendiente: false }).eq('id', v.id)
    setVentas(prev => prev.map(x => x.id === v.id ? { ...x, costo: c, pendiente: false } : x))
    setEditCosto(p => { const n = { ...p }; delete n[v.id]; return n })
  }

  async function registrarAuditoria(ventaId: string, accion: string, campo: string, anterior: string, nuevo: string) {
    await supabase.from('auditoria_ventas').insert({
      venta_id: ventaId, accion, campo,
      valor_anterior: String(anterior),
      valor_nuevo: String(nuevo),
      user_id: userId,
    })
  }

  function abrirEditar(v: Venta) {
    setEditId(v.id)
    const m = v.descripcion?.match(/^\[([^\]]+)\]\s*(.+)$/)
    setEditForm({
      codigo: m ? m[1] : '',
      descripcion: m ? m[2] : (v.descripcion ?? ''),
      costo: v.costo ? String(v.costo) : '',
      precio: String(v.precio),
      cliente: v.cliente ?? '',
      pago: v.pago ?? 'Efectivo',
      comprobante: v.comprobante ?? '',
    })
  }

  async function guardarEdicion(v: Venta) {
    const campos: Array<[string, string, string]> = []
    const upd: Record<string, any> = {}
    const descConCodigo = editForm.codigo ? `[${editForm.codigo}] ${editForm.descripcion}` : editForm.descripcion
    if (descConCodigo !== v.descripcion) { campos.push(['descripcion', v.descripcion ?? '', descConCodigo]); upd.descripcion = descConCodigo }
    const newCosto = +editForm.costo.replace(/,/g, '.').replace(/[^0-9.]/g, '') || null
    if (newCosto !== (v.costo || null)) { campos.push(['costo', String(v.costo ?? ''), String(newCosto ?? '')]); upd.costo = newCosto; upd.pendiente = !newCosto }
    const newPrecio = +editForm.precio.replace(/,/g, '.').replace(/[^0-9.]/g, '')
    if (newPrecio !== v.precio) { campos.push(['precio', String(v.precio), String(newPrecio)]); upd.precio = newPrecio }
    if (editForm.cliente !== (v.cliente ?? '')) { campos.push(['cliente', v.cliente ?? '', editForm.cliente]); upd.cliente = editForm.cliente || null }
    if (editForm.pago !== v.pago) { campos.push(['pago', v.pago ?? '', editForm.pago]); upd.pago = editForm.pago }
    if (editForm.comprobante !== (v.comprobante ?? '')) { campos.push(['comprobante', v.comprobante ?? '', editForm.comprobante]); upd.comprobante = editForm.comprobante || null }
    if (Object.keys(upd).length === 0) { setEditId(null); return }
    const { error } = await supabase.from('ventas').update(upd).eq('id', v.id)
    if (error) { alert('Error al guardar: ' + error.message); return }
    for (const [campo, ant, nvo] of campos) await registrarAuditoria(v.id, 'editar', campo, ant, nvo).catch(()=>{})
    setEditId(null)
    loadVentas()
  }

  async function delVentaAudit(v: Venta) {
    if (!confirm('¿Borrar venta?')) return
    await registrarAuditoria(v.id, 'eliminar', 'venta', JSON.stringify({ descripcion: v.descripcion, precio: v.precio, cliente: v.cliente }), '')
    if (v.origen === 'stock' && v.stock_id) {
      const s = stockItems.find(x => x.id === v.stock_id)
      if (s) {
        // Movimiento + devolución de stock en una sola transacción (RPC atómico)
        const { error: errStock3 } = await supabase.rpc('insertar_movimiento_stock', { p_stock_id: v.stock_id, p_tipo: 'entrada', p_cantidad: 1, p_fecha: v.fecha || fecha, p_descripcion: `Devolución — venta borrada (${(v.descripcion||'Caja').slice(0,40)})`, p_user_id: userId || null })
        if (errStock3) alert(`⚠ Error al devolver stock: ${errStock3.message}`)
      }
    }
    await supabase.from('ventas').delete().eq('id', v.id)
    loadVentas()
  }

  async function guardarGasto() {
    if (!gastoForm.categoria || !gastoForm.descripcion || !gastoForm.monto) return
    await supabase.from('gastos').insert({
      fecha,
      categoria: gastoForm.categoria,
      descripcion: gastoForm.descripcion,
      monto: +gastoForm.monto.replace(/,/g, '.').replace(/[^0-9.]/g, ''),
      forma_pago: gastoForm.forma_pago,
      comprobante: gastoForm.comprobante || null,
      user_id: userId,
    })
    setGastoOpen(false)
    setGastoForm({ categoria:'', descripcion:'', monto:'', forma_pago:'Efectivo', comprobante:'' })
    loadVentas()
  }

  async function delGasto(id: string) {
    if (!confirm('¿Borrar gasto?')) return
    await supabase.from('gastos').delete().eq('id', id)
    loadVentas()
  }

  function changeDay(d: number) {
    const dt = new Date(fecha + 'T12:00:00'); dt.setDate(dt.getDate() + d)
    setFecha(dt.toISOString().slice(0, 10))
  }

  // KPIs
  const fact = ventas.reduce((a, v) => a + v.precio, 0)
  const factContado = ventas.filter(v => v.pago !== 'Cuenta corriente').reduce((a, v) => a + v.precio, 0)
  const factCC      = ventas.filter(v => v.pago === 'Cuenta corriente').reduce((a, v) => a + v.precio, 0)
  const costo = ventas.filter(v => !v.pendiente).reduce((a, v) => a + (v.costo ?? 0), 0)
  const gan2 = fact - costo
  const [ventaFiltro, setVentaFiltro] = useState<'todas'|'contado'|'cc'>('todas')
  const ventasFiltradas = ventaFiltro==='contado' ? ventas.filter(v=>v.pago!=='Cuenta corriente') : ventaFiltro==='cc' ? ventas.filter(v=>v.pago==='Cuenta corriente') : ventas
  const pend = ventas.filter(v => v.pendiente).length
  const totalRecibos = recibos.reduce((a,r)=>a+r.monto, 0)
  const totalPagosProv = pagosProveedores.reduce((a,p)=>a+p.haber, 0)
  const totalGastos = gastos.reduce((a,g)=>a+g.monto, 0)
  // Saldo neto del día = lo que entró (ventas + cobros de clientes) - lo que salió (gastos + pagos a proveedores)
  const totalEntradas = fact + totalRecibos
  const totalSalidas  = totalGastos + totalPagosProv
  const saldoNeto     = totalEntradas - totalSalidas

  return (
    <div>
      {/* Fecha */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <button onClick={() => changeDay(-1)} className="p-1.5 rounded-lg border border-p-line hover:bg-p-light">←</button>
          <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
            className="border border-p-line rounded-lg px-3 py-1.5 text-sm font-mono" />
          <button onClick={() => changeDay(1)} className="p-1.5 rounded-lg border border-p-line hover:bg-p-light">→</button>
          <button onClick={() => setFecha(todayStr())} className="text-xs text-p-ink2 hover:text-p-ink underline">Hoy</button>
        </div>
        <button onClick={() => setOpen(true)} style={{ background:"#00A550", color:"#fff", border:"none", borderRadius:10, padding:"10px 20px", fontWeight:700, fontSize:14, cursor:"pointer" }}>+ Registrar venta</button>
      </div>

      {/* Resumen financiero del día — visible solo para gerencial/admin */}
      {isAdmin && (
        <div className="bg-white border border-p-line rounded-2xl p-4 mb-5 shadow-sm">
          <p className="text-[11px] font-bold text-p-ink2 uppercase tracking-wider mb-3">Resumen del día</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
            <div className="text-sm">
              <p className="text-p-ink2 text-xs mb-0.5">Ventas facturadas</p>
              <p className="font-saira font-bold text-p-ink">{moneyARS(fact)}</p>
              <div className="flex gap-2 mt-1">
                <button type="button" onClick={()=>setVentaFiltro(ventaFiltro==='contado'?'todas':'contado')}
                  className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${ventaFiltro==='contado'?'bg-green-600 text-white':'bg-green-100 text-green-700'}`}>
                  Contado {moneyARS(factContado)}
                </button>
                <button type="button" onClick={()=>setVentaFiltro(ventaFiltro==='cc'?'todas':'cc')}
                  className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${ventaFiltro==='cc'?'bg-amber-600 text-white':'bg-amber-100 text-amber-700'}`}>
                  CC {moneyARS(factCC)}
                </button>
              </div>
            </div>
            <div className="text-sm">
              <p className="text-p-ink2 text-xs mb-0.5">+ Cobros Cta. Cte.</p>
              <p className="font-saira font-bold text-green-600">{moneyARS(totalRecibos)}</p>
              <p className="text-[10px] text-p-ink2">{usdBNA(totalRecibos)}</p>
            </div>
            <div className="text-sm">
              <p className="text-p-ink2 text-xs mb-0.5">− Gastos</p>
              <p className="font-saira font-bold text-red-500">{moneyARS(totalGastos)}</p>
              <p className="text-[10px] text-p-ink2">{usdBNA(totalGastos)}</p>
            </div>
            <div className="text-sm">
              <p className="text-p-ink2 text-xs mb-0.5">− Pagos a proveedores</p>
              <p className="font-saira font-bold text-red-500">{moneyARS(totalPagosProv)}</p>
              <p className="text-[10px] text-p-ink2">{usdBNA(totalPagosProv)}</p>
            </div>
          </div>
          <div className={`rounded-xl px-4 py-3 flex items-center justify-between ${saldoNeto >= 0 ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
            <p className="text-sm font-bold text-p-ink">Saldo neto del día</p>
            <div className="text-right">
              <p className={`font-saira font-bold text-2xl ${saldoNeto >= 0 ? 'text-green-600' : 'text-red-500'}`}>{moneyARS(saldoNeto)}</p>
              <p className="text-[10px] text-p-ink2">{usdBNA(Math.abs(saldoNeto))} {saldoNeto < 0 ? '(negativo)' : ''}</p>
            </div>
          </div>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <KpiCard label="Facturado" value={moneyARS(fact)} sub={usdBNA(fact)} />
        {isAdmin && <KpiCard label="Costo de lo vendido" value={moneyARS(costo)} sub={usdBNA(costo)} />}
        {isAdmin && <KpiCard label={`Ganancia${pend ? ' (parcial)' : ''}`} value={moneyARS(gan2)} accent sub={usdBNA(gan2)} />}
        <KpiCard label="Operaciones" value={`${ventas.length}`} sub={pend ? `${pend} s/costo` : undefined} />
        {isAdmin && <KpiCard label="Gastos del día" value={moneyARS(totalGastos)} />}
        {isAdmin && <KpiCard label="Cobros Cta. Cte. (clientes)" value={moneyARS(totalRecibos)} />}
        {isAdmin && <KpiCard label="Pagos a proveedores" value={moneyARS(totalPagosProv)} />}
      </div>

      {pend > 0 && <AlarmBar count={pend} label="venta(s) sin costo — ganancia incompleta" />}

      {/* Tabs ventas / gastos */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
        <div style={{display:'flex',gap:8}}>
          <button onClick={()=>setTab('ventas')}
            style={{background:tab==='ventas'?'#00A550':'#e5e7eb',color:tab==='ventas'?'#fff':'#374151',border:'none',borderRadius:8,padding:'6px 16px',fontWeight:700,fontSize:13,cursor:'pointer'}}>
            💰 Ventas ({ventas.length})
          </button>
          <button onClick={()=>setTab('gastos')}
            style={{background:tab==='gastos'?'#ef4444':'#e5e7eb',color:tab==='gastos'?'#fff':'#374151',border:'none',borderRadius:8,padding:'6px 16px',fontWeight:700,fontSize:13,cursor:'pointer'}}>
            💸 Gastos ({gastos.length})
          </button>
          <button onClick={()=>setTab('ctacte')}
            style={{background:tab==='ctacte'?'#1d4ed8':'#e5e7eb',color:tab==='ctacte'?'#fff':'#374151',border:'none',borderRadius:8,padding:'6px 16px',fontWeight:700,fontSize:13,cursor:'pointer'}}>
            📒 Cta. Cte. ({recibos.length + pagosProveedores.length})
          </button>
        </div>
        {tab==='gastos' && (
          <button onClick={()=>setGastoOpen(true)}
            style={{background:'#ef4444',color:'#fff',border:'none',borderRadius:8,padding:'7px 16px',fontWeight:700,fontSize:13,cursor:'pointer'}}>
            + Registrar gasto
          </button>
        )}
      </div>

      {/* Lista */}
      <div className="tsec font-saira font-bold text-sm text-p-ink uppercase tracking-wider mb-3">
        {tab==='gastos' ? 'Gastos del día' : tab==='ctacte' ? 'Movimientos de Cuenta Corriente del día' : 'Ventas del día'}
        <span className="font-mono text-xs bg-p-light text-p-dark px-2 py-0.5 rounded-full ml-2">
          {tab==='gastos' ? gastos.length : tab==='ctacte' ? recibos.length + pagosProveedores.length : ventas.length}
        </span>
      </div>

      {tab === 'ctacte' ? (
        loading ? <p className="text-sm text-p-gray py-8 text-center">Cargando…</p> :
        (recibos.length === 0 && pagosProveedores.length === 0) ? <Empty msg="Sin cobros ni pagos de cuenta corriente en este día." /> : (
          <div className="flex flex-col gap-3">
            {recibos.map(r => (
              <div key={r.id} className="bg-white border border-p-line rounded-xl p-4 shadow-sm flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span style={{background:'#dcfce7',color:'#16a34a',borderRadius:6,padding:'2px 8px',fontSize:11,fontWeight:700}}>COBRO CLIENTE</span>
                    <p className="font-saira font-bold text-p-ink">{r.cliente_nombre}</p>
                  </div>
                  <p className="text-xs text-p-ink2 mt-0.5">Recibo N° {r.numero} · {r.forma_pago}</p>
                </div>
                <p className="font-mono font-bold text-green-600">+ {moneyARS(r.monto)}</p>
              </div>
            ))}
            {pagosProveedores.map(p => (
              <div key={p.id} className="bg-white border border-p-line rounded-xl p-4 shadow-sm flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span style={{background:'#fee2e2',color:'#dc2626',borderRadius:6,padding:'2px 8px',fontSize:11,fontWeight:700}}>PAGO PROVEEDOR</span>
                    <p className="font-saira font-bold text-p-ink">{p.proveedor_nombre}</p>
                  </div>
                  <p className="text-xs text-p-ink2 mt-0.5">{p.notas || p.descripcion || 'Pago a cuenta'}</p>
                </div>
                <p className="font-mono font-bold text-red-500">- {moneyARS(p.haber)}</p>
              </div>
            ))}
          </div>
        )
      ) : tab === 'gastos' ? (
        loading ? <p className="text-sm text-p-gray py-8 text-center">Cargando…</p> :
        gastos.length === 0 ? <Empty msg="Sin gastos en este día." /> : (
          <div className="flex flex-col gap-3">
            {gastos.map(g => (
              <div key={g.id} className="bg-white border border-p-line rounded-xl p-4 shadow-sm flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span style={{background:'#fee2e2',color:'#dc2626',borderRadius:6,padding:'2px 8px',fontSize:11,fontWeight:700}}>{g.categoria}</span>
                    <p className="font-saira font-bold text-p-ink">{g.descripcion}</p>
                  </div>
                  <p className="text-xs text-p-ink2 mt-0.5">
                    {[g.forma_pago, g.comprobante ? 'Comp. '+g.comprobante : null].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-mono font-bold text-red-500">- {moneyARS(g.monto)}</p>
                </div>
                <button onClick={()=>delGasto(g.id)} className="text-red-400 hover:text-red-600 text-sm">✕</button>
              </div>
            ))}
          </div>
        )
      ) : (
      <>{loading ? <p className="text-sm text-p-gray py-8 text-center">Cargando…</p> :
        ventas.length === 0 ? <Empty msg="Sin ventas en este día. Registrá una con + Registrar venta." /> :
          <div className="flex flex-col gap-3">
            {ventas.map(v => (
              <div key={v.id} className={`bg-white border rounded-xl p-4 shadow-sm flex items-center gap-3 flex-wrap ${v.pendiente ? 'border-l-4 border-l-amber-400 border-p-line' : 'border-p-line'}`}>
                <div className="flex-1 min-w-0">
                  {(() => {
                const m = v.descripcion?.match(/^\[([^\]]+)\]\s*(.+)$/)
                // Si tiene número AFIP en comprobante, usarlo como título
                const tituloDesc = v.comprobante && v.cliente
                  ? `${v.comprobante} - ${v.cliente}`
                  : v.descripcion
                return m
                  ? <p className="font-saira font-bold text-p-ink"><span className="font-mono text-xs text-p-ink2 mr-2 bg-p-light px-1.5 py-0.5 rounded">{m[1]}</span>{m[2]}</p>
                  : <p className="font-saira font-bold text-p-ink">{tituloDesc}</p>
              })()}
                  <p className="text-xs text-p-ink2 mt-0.5">
                    {[v.cliente && !v.comprobante ? v.cliente : null, v.pago, v.origen === 'stock' ? 'de stock' : 'comprada'].filter(Boolean).join(' · ')}
                  </p>
                </div>
                {/* Costo editable (solo admin) */}
                {isAdmin && v.pendiente && (
                  <div className="flex items-center gap-1">
                    <input placeholder="costo" value={editCosto[v.id] ?? ''}
                      onChange={e => setEditCosto(p => ({ ...p, [v.id]: e.target.value }))}
                      className="w-24 border border-amber-300 rounded px-2 py-1 text-xs font-mono" />
                    <button onClick={() => updateCosto(v, editCosto[v.id] ?? '')}
                      className="text-xs bg-amber-100 text-amber-700 border border-amber-300 px-2 py-1 rounded">ok</button>
                  </div>
                )}
                <div className="text-right">
                  <p className="font-mono font-bold text-p-ink">{moneyARS(v.precio)}</p>
                  {isAdmin && !v.pendiente && (() => {
                    const r = calcRentabilidad(v.precio, v.costo)
                    return r ? (
                      <div className="text-right">
                        <p className={`text-xs font-mono font-bold ${r.ganancia >= 0 ? 'text-green-600' : 'text-red-500'}`}>{moneyARS(r.ganancia)} <span className="text-[10px] opacity-70">({r.margen}%)</span></p>
                        <p className="text-[10px] text-p-ink2">neto s/IVA+flete</p>
                      </div>
                    ) : null
                  })()}
                  {v.pendiente && <p className="text-xs text-amber-500 font-mono">s/costo</p>}
                </div>
                <div className="flex flex-col gap-1">
                  {esCajaRol && <button onClick={() => setReciboVenta(v)} style={{background:'#6b7280',color:'#fff',border:'none',borderRadius:6,padding:'4px 10px',fontSize:11,fontWeight:700,cursor:'pointer'}}>🖨 Recibo</button>}
                  {isAdmin && !(v as any).comprobante_id && <button onClick={() => abrirEditar(v)} style={{background:'#2563eb',color:'#fff',border:'none',borderRadius:6,padding:'4px 10px',fontSize:11,fontWeight:700,cursor:'pointer'}}>✏ Editar</button>}
                  {!(v as any).comprobante_id && <button onClick={() => isAdmin ? delVentaAudit(v) : delVenta(v)} className="text-red-400 hover:text-red-600 text-sm">✕</button>}
                </div>
              </div>
            ))}
          </div>
      }

      </>
      )}

      {/* Modal gasto */}
      <Modal open={gastoOpen} onClose={()=>setGastoOpen(false)} title="Registrar gasto">
        <div className="flex flex-col gap-3">
          <Field label="Categoría">
            <Select value={gastoForm.categoria} onChange={e=>setGastoForm(p=>({...p,categoria:e.target.value}))}>
              <option value="">Seleccioná una categoría</option>
              {categoriasGasto.map(cat=><option key={cat.id} value={cat.nombre}>{cat.nombre}</option>)}
            </Select>
          </Field>
          <Field label="Descripción"><Input value={gastoForm.descripcion} onChange={e=>setGastoForm(p=>({...p,descripcion:e.target.value}))} placeholder="Ej: Sueldo Juan, Alquiler junio…" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Monto"><Input value={gastoForm.monto} onChange={e=>setGastoForm(p=>({...p,monto:e.target.value}))} placeholder="$" /></Field>
            <Field label="Forma de pago">
              <Select value={gastoForm.forma_pago} onChange={e=>setGastoForm(p=>({...p,forma_pago:e.target.value}))}>
                {PAGOS_GASTO.map(p=><option key={p}>{p}</option>)}
              </Select>
            </Field>
          </div>
          <Field label="N° comprobante (opcional)"><Input value={gastoForm.comprobante} onChange={e=>setGastoForm(p=>({...p,comprobante:e.target.value}))} placeholder="Factura / ticket" /></Field>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={()=>setGastoOpen(false)} style={{background:'#6b7280',color:'#fff',border:'none',borderRadius:8,padding:'9px 20px',fontWeight:700,fontSize:14,cursor:'pointer'}}>Cancelar</button>
            <button onClick={guardarGasto} style={{background:'#ef4444',color:'#fff',border:'none',borderRadius:8,padding:'9px 20px',fontWeight:700,fontSize:14,cursor:'pointer'}}>Registrar gasto</button>
          </div>
        </div>
      </Modal>

      {/* Modal venta */}
      <Modal open={open} onClose={() => setOpen(false)} title="Registrar venta">
        <div className="flex flex-col gap-3">

          {/* 1. DATOS DEL CLIENTE */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Cliente"><Input value={form.cliente} onChange={e => setForm(p => ({ ...p, cliente: e.target.value }))} placeholder="Nombre" /></Field>
            <Field label="Forma de pago">
              <Select value={form.pago} onChange={e => setForm(p => ({ ...p, pago: e.target.value }))}>
                {PAGOS.map(p => <option key={p}>{p}</option>)}
              </Select>
            {form.pago === 'Transferencia' && cuentasBanco.length > 0 && (
              <Field label="Cuenta destino">
                <Select value={cuentaBancoId} onChange={e => setCuentaBancoId(e.target.value)}>
                  <option value="">Sin especificar</option>
                  {cuentasBanco.map(c => <option key={c.id} value={c.id}>{c.banco} · {c.tipo}{c.alias ? ` (${c.alias})` : ''}</option>)}
                </Select>
              </Field>
            )}
            </Field>
            {!esCajaRol && <Field label="Tipo de cliente">
              <select value={form.tipo_id} onChange={e=>{const t=tipos.find(t=>t.id===e.target.value);setForm(p=>({...p,tipo_id:e.target.value,tipo_nombre:t?.nombre||''}))}}
                style={{width:'100%',border:'1.5px solid #C2DDD0',borderRadius:10,padding:'9px 12px',fontSize:13,color:'#0C1810',background:'#fff',outline:'none'}}>
                <option value="">Sin tipo</option>
                {tipos.map(t=><option key={t.id} value={t.id}>{t.nombre}</option>)}
              </select>
            </Field>}
            {!esCajaRol && <Field label="N° comprobante"><Input value={form.comprobante} onChange={e => setForm(p => ({ ...p, comprobante: e.target.value }))} placeholder="Factura / remito" /></Field>}
          </div>

          {/* 2. BUSCAR EN STOCK */}
          <Field label="Buscar pieza en stock">
            <div className="relative">
              <Input value={stockQ} onChange={e => setStockQ(e.target.value)} placeholder="Escribí modelo, marca o código…" />
              {stockSug.length > 0 && (
                <div className="absolute z-10 top-full left-0 right-0 bg-white border border-p-line rounded-lg shadow-lg max-h-40 overflow-y-auto">
                  {stockSug.map(s => (
                    <button key={s.id} onClick={() => pickStock(s)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-p-light border-b border-p-line2 last:border-0">
                      <span className="font-medium">{s.descripcion}</span>
                      <span className="text-p-ink2 text-xs ml-2">{s.codigo && <span className="font-mono mr-1 text-p-dark">{s.codigo}</span>}{s.marca} · stock {s.cantidad}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </Field>

          {/* 3. ÍTEM MANUAL */}
          <div className="bg-p-light rounded-xl p-3 flex flex-col gap-2">
            <p className="text-[11px] font-bold text-p-ink2 uppercase">Ítem manual</p>
            <Field label="Descripción"><Input value={form.descripcion} onChange={e => setForm(p => ({ ...p, descripcion: e.target.value }))} placeholder="Ej: Pegamento, mano de obra…" /></Field>
            <div className="grid grid-cols-3 gap-2">
              {!esCajaRol && <Field label="Costo"><Input value={form.costo} onChange={e => setForm(p => ({ ...p, costo: e.target.value }))} placeholder="$" /></Field>}
              <Field label="Precio *"><Input value={form.precio} onChange={e => setForm(p => ({ ...p, precio: e.target.value }))} placeholder="$" inputMode="decimal" /></Field>
              <Field label="Cantidad"><Input value={form.cantidad||'1'} onChange={e => setForm(p => ({ ...p, cantidad: e.target.value }))} placeholder="1" /></Field>
            </div>
            {form.descripcion && form.precio && (
              <button type="button" onClick={()=>{
                const cant = parseInt(form.cantidad||'1')||1
                const precio = +form.precio.replace(/[^0-9.]/g,'')
                if(!precio) return
                setItemsCaja(prev=>[...prev,{desc:form.descripcion,codigo:'',precio,costo:+form.costo.replace(/[^0-9.]/g,'')||0,stock_id:null,cantidad:cant}])
                setForm(p=>({...p,descripcion:'',precio:'',costo:'',cantidad:'1'}))
              }} className="self-end text-xs bg-p-green text-white px-3 py-1.5 rounded-lg font-bold">+ Agregar ítem</button>
            )}
          </div>

          {/* 4. LISTA DE ÍTEMS con precio editable */}
          {itemsCaja.length > 0 && (
            <div className="bg-p-light rounded-xl p-3 flex flex-col gap-2">
              <p className="text-[11px] font-bold text-p-ink2 uppercase mb-1">Ítems</p>
              {itemsCaja.map((it,i) => (
                <div key={i} className="flex items-center gap-2 bg-white rounded-lg px-2 py-1.5 border border-p-line">
                  {it.codigo && <span className="font-mono text-[10px] bg-p-light px-1 rounded border shrink-0">{it.codigo}</span>}
                  <span className="flex-1 truncate text-sm">{it.desc}</span>
                  <input type="text" inputMode="numeric" value={it.cantidad}
                    onChange={e=>setItemsCaja(prev=>prev.map((x,j)=>j===i?{...x,cantidad:+e.target.value||1}:x))}
                    className="w-10 border border-p-line rounded text-center text-xs font-mono px-1 py-0.5"/>
                  <input type="text" inputMode="decimal" value={it.precio}
                    onChange={e=>setItemsCaja(prev=>prev.map((x,j)=>j===i?{...x,precio:e.target.value}:x))}
                    onBlur={e=>setItemsCaja(prev=>prev.map((x,j)=>j===i?{...x,precio:parseFloat(String(x.precio).replace(',','.'))||0}:x))}
                    className="w-24 border border-p-line rounded text-right text-xs font-mono px-1 py-0.5"/>
                  <button onClick={()=>setItemsCaja(prev=>prev.filter((_,j)=>j!==i))} className="text-red-400 text-xs shrink-0">✕</button>
                </div>
              ))}
              <div className="flex justify-between font-bold pt-1 border-t border-p-line mt-1">
                <span>Total</span>
                <span className="font-mono">{moneyARS(itemsCaja.reduce((a,it)=>a+(parseFloat(String(it.precio).replace(',','.'))||0)*it.cantidad,0))}</span>
              </div>
            </div>
          )}

          {/* 5. OPCIONES EXTRA (no caja) */}
          {!esCajaRol && (
            <>
              {/* Modo aseguradora */}
              <div className="flex gap-2">
                <button type="button" onClick={()=>{setModoAseg(false);setAsegCaja('');setOsCaja([]);setOsSelCaja(null)}}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold border ${!modoAseg?'bg-p-green text-white border-p-green':'bg-white text-p-ink2 border-p-line'}`}>👤 Cliente</button>
                <button type="button" onClick={()=>setModoAseg(true)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold border ${modoAseg?'bg-blue-600 text-white border-blue-600':'bg-white text-p-ink2 border-p-line'}`}>🏢 Aseguradora</button>
              </div>
              {modoAseg && (
                <div className="flex flex-col gap-2 bg-blue-50 border border-blue-200 rounded-xl p-3">
                  <p className="text-[11px] font-bold text-blue-700 uppercase tracking-wider">Seleccioná la aseguradora</p>
                  <div className="flex gap-2">
                    {['Mercantil Andina','Sancor Seguros'].map(a=>(
                      <button type="button" key={a} onClick={()=>cargarOsCaja(a)}
                        className={`flex-1 py-2 rounded-lg text-xs font-bold border ${asegCaja===a?'bg-blue-600 text-white border-blue-600':'bg-white text-blue-700 border-blue-300'}`}>{a}</button>
                    ))}
                  </div>
                  {osCaja.length > 0 && (
                    <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
                      <p className="text-[10px] font-bold text-blue-600 uppercase">OS pendientes de {asegCaja}</p>
                      {osCaja.map(os=>(
                        <button type="button" key={os.id} onClick={()=>seleccionarOsCaja(os)}
                          className={`text-left px-3 py-2 rounded-lg text-xs border ${osSelCaja?.id===os.id?'bg-blue-100 border-blue-400':'bg-white border-blue-200 hover:bg-blue-50'}`}>
                          <span className="font-bold text-blue-800">OS-{String(os.numero).padStart(4,'0')}</span>
                          <span className="text-blue-600 ml-2">{os.cliente}</span>
                          <span className="text-blue-500 ml-2">{os.vehiculo} · {os.patente}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {asegCaja && osCaja.length===0 && <p className="text-xs text-blue-500 text-center py-2">Sin OS pendientes</p>}
                </div>
              )}
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={form.descontarStock}
                  onChange={e=>setForm(p=>({...p,descontarStock:e.target.checked,origen:e.target.checked?'stock':'compra'}))}
                  className="accent-p-green w-4 h-4"/>
                <span className="text-sm text-p-ink font-medium">Descontar del stock</span>
              </label>
              {gan() !== null && (() => {
                const precio = +form.precio.replace(/,/g,'.').replace(/[^0-9.]/g,'')
                const costo  = +form.costo.replace(/,/g,'.').replace(/[^0-9.]/g,'')
                const r = calcRentabilidad(precio, costo)
                return r ? (
                  <div style={{background:'#f9fafb',border:'1px solid #e5e7eb',borderRadius:10,padding:'10px 14px',fontSize:12}}>
                    <p style={{fontWeight:700,color:'#374151',marginBottom:4}}>📊 Rentabilidad real</p>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:3}}>
                      <span style={{color:'#6b7280'}}>Precio neto:</span><span style={{fontFamily:'monospace',fontWeight:600}}>{moneyARS(r.precioNeto)}</span>
                      <span style={{color:'#6b7280'}}>Costo neto:</span><span style={{fontFamily:'monospace',fontWeight:600}}>{moneyARS(r.costoNeto)}</span>
                      <span style={{color:'#6b7280',fontWeight:700}}>Ganancia:</span>
                      <span style={{fontFamily:'monospace',fontWeight:800,color:r.ganancia>=0?'#00A550':'#ef4444'}}>{moneyARS(r.ganancia)} ({r.margen}%)</span>
                    </div>
                  </div>
                ) : null
              })()}
            </>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setOpen(false)} style={{background:'#6b7280',color:'#fff',border:'none',borderRadius:8,padding:'9px 20px',fontWeight:700,fontSize:14,cursor:'pointer'}}>Cancelar</button>
            <button onClick={save} style={{background:"#00A550",color:"#fff",border:"none",borderRadius:8,padding:"9px 20px",fontWeight:700,fontSize:14,cursor:"pointer"}}>Registrar</button>
          </div>
        </div>
      </Modal>
      {/* Modal recibo */}
      {reciboVenta && (
        <Modal open={!!reciboVenta} onClose={()=>setReciboVenta(null)} title="Recibo">
          <div style={{fontFamily:'monospace',fontSize:13,padding:8}}>
            <div style={{textAlign:'center',marginBottom:12}}>
              <p style={{fontWeight:700,fontSize:16}}>RECIBO</p>
              <p style={{fontSize:11,color:'#6b7280'}}>{reciboVenta.fecha?.split('-').reverse().join('/')}</p>
              {reciboVenta.cliente && <p style={{fontWeight:600,marginTop:4}}>{reciboVenta.cliente}</p>}
            </div>
            <table style={{width:'100%',borderCollapse:'collapse',marginBottom:12}}>
              <thead>
                <tr style={{borderBottom:'1px solid #e5e7eb'}}>
                  <th style={{textAlign:'left',padding:'4px 2px',fontSize:11,color:'#6b7280'}}>Código</th>
                  <th style={{textAlign:'left',padding:'4px 2px',fontSize:11,color:'#6b7280'}}>Descripción</th>
                  <th style={{textAlign:'right',padding:'4px 2px',fontSize:11,color:'#6b7280'}}>Precio</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const m = reciboVenta.descripcion?.match(/^\[([^\]]+)\]\s*(.+)$/)
                  const cod = m?.[1] || ''
                  const desc = m?.[2] || reciboVenta.descripcion || ''
                  return (
                    <tr style={{borderBottom:'1px solid #f3f4f6'}}>
                      <td style={{padding:'6px 2px',fontSize:12}}>{cod}</td>
                      <td style={{padding:'6px 2px',fontSize:12}}>{desc}</td>
                      <td style={{padding:'6px 2px',fontSize:12,textAlign:'right',fontWeight:700}}>{moneyARS(reciboVenta.precio)}</td>
                    </tr>
                  )
                })()}
              </tbody>
            </table>
            <div style={{borderTop:'2px solid #111',paddingTop:8,display:'flex',justifyContent:'space-between'}}>
              <span style={{fontWeight:700,fontSize:14}}>TOTAL</span>
              <span style={{fontWeight:800,fontSize:16}}>{moneyARS(reciboVenta.precio)}</span>
            </div>
            {reciboVenta.pago && <p style={{fontSize:11,color:'#6b7280',marginTop:6}}>Forma de pago: {reciboVenta.pago}</p>}
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <button onClick={()=>setReciboVenta(null)} style={{background:'#6b7280',color:'#fff',border:'none',borderRadius:8,padding:'9px 20px',fontWeight:700,fontSize:14,cursor:'pointer'}}>Cerrar</button>
            <button onClick={()=>{
              const w = window.open('','_blank','width=600,height=400')
              if(!w) return
              const rv = reciboVenta
              const m = rv.descripcion?.match(/^\[([^\]]+)\]\s*(.+)$/)
              const cod = m?.[1]||''; const desc = m?.[2]||rv.descripcion||''
              w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Recibo</title><style>
                body{font-family:monospace;font-size:13px;padding:20px;margin:0}
                table{width:100%;border-collapse:collapse;margin-bottom:12px}
                th{text-align:left;padding:4px 2px;font-size:11px;color:#6b7280;border-bottom:1px solid #e5e7eb}
                td{padding:6px 2px;font-size:12px}
                .right{text-align:right}
                .total{border-top:2px solid #111;padding-top:8px;display:flex;justify-content:space-between;font-weight:800;font-size:16px;margin-top:8px}
                .center{text-align:center;margin-bottom:12px}
                @media print{@page{margin:10mm}}
              </style></head><body>
                <div class="center">
                  <div style="font-weight:700;font-size:16px">RECIBO</div>
                  <div style="font-size:11px;color:#6b7280">${rv.fecha?.split('-').reverse().join('/')}</div>
                  ${rv.cliente?`<div style="font-weight:600;margin-top:4px">${rv.cliente}</div>`:''}
                </div>
                <table>
                  <thead><tr><th>Código</th><th>Descripción</th><th class="right">Precio</th></tr></thead>
                  <tbody><tr><td>${cod}</td><td>${desc}</td><td class="right" style="font-weight:700">${new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS'}).format(rv.precio)}</td></tr></tbody>
                </table>
                <div class="total"><span>TOTAL</span><span>${new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS'}).format(rv.precio)}</span></div>
                ${rv.pago?`<div style="font-size:11px;color:#6b7280;margin-top:6px">Forma de pago: ${rv.pago}</div>`:''}
                <script>window.onload=()=>{window.print();window.close()}<\/script>
              </body></html>`)
              w.document.close()
            }} style={{background:'#00A550',color:'#fff',border:'none',borderRadius:8,padding:'9px 20px',fontWeight:700,fontSize:14,cursor:'pointer'}}>🖨 Imprimir</button>
          </div>
        </Modal>
      )}

      {/* Modal edición (solo admin) */}
      {editId && (() => {
        const v = ventas.find(x => x.id === editId)
        if (!v) return null
        return (
          <Modal open={!!editId} onClose={() => setEditId(null)} title="Editar venta">
            <div className="flex flex-col gap-3">
              {/* Vista previa tipo factura */}
              {(()=>{ const v2=ventas.find(x=>x.id===editId); const sv=v2?.stock_id?stockItems.find(x=>x.id===v2.stock_id):null; return v2 ? (
              <div style={{background:'#f9fafb',border:'1px solid #e5e7eb',borderRadius:12,padding:'14px 16px'}}>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p style={{fontWeight:800,fontSize:15,color:'#0C1810'}}>{v2.cliente||'Particular'}</p>
                    <p style={{fontSize:11,color:'#6b7280'}}>{v2.fecha} · {v2.pago}</p>
                    {v2.comprobante&&<p style={{fontSize:11,color:'#6b7280'}}>Comp: {v2.comprobante}</p>}
                  </div>
                  <p style={{fontWeight:800,fontSize:16,color:'#00A550'}}>{moneyARS(v2.precio)}</p>
                </div>
                <div style={{background:'#fff',borderRadius:8,padding:'10px 12px',border:'1px solid #e5e7eb'}}>
                  {sv ? (
                    <div className="flex items-center justify-between">
                      <div><span style={{fontFamily:'monospace',fontSize:11,background:'#e5e7eb',padding:'2px 6px',borderRadius:4,marginRight:8}}>{sv.codigo}</span><span style={{fontSize:13,fontWeight:600}}>{sv.descripcion}</span></div>
                      <span style={{fontSize:13,fontFamily:'monospace',fontWeight:700}}>{moneyARS(v2.precio)}</span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <span style={{fontSize:13,color:'#374151'}}>{v2.descripcion}</span>
                      <span style={{fontSize:13,fontFamily:'monospace',fontWeight:700}}>{moneyARS(v2.precio)}</span>
                    </div>
                  )}
                </div>
              </div>
              ) : null })()}
              <p style={{fontSize:11,fontWeight:700,color:'#6b7280',textTransform:'uppercase',letterSpacing:1}}>Editar datos</p>
              {/* Buscador de stock para edición */}
              <Field label="Buscar pieza en stock (opcional)">
                <div className="relative">
                  <Input value={editStockQ} onChange={e => setEditStockQ(e.target.value)} placeholder="Escribí para buscar y autocompletar…" />
                  {editStockSug.length > 0 && (
                    <div className="absolute z-10 top-full left-0 right-0 bg-white border border-p-line rounded-lg shadow-lg max-h-40 overflow-y-auto">
                      {editStockSug.map(s => (
                        <button key={s.id} onClick={() => pickEditStock(s)}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-p-light border-b border-p-line2 last:border-0">
                          <span className="font-medium">{s.descripcion}</span>
                          <span className="text-p-ink2 text-xs ml-2">{s.codigo && <span className="font-mono mr-1">{s.codigo}</span>}{s.marca}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </Field>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Código pieza">
                  <Input value={editForm.codigo} onChange={e => setEditForm(p => ({ ...p, codigo: e.target.value }))} placeholder="Ej: ABC123" />
                </Field>
                <div className="col-span-2">
                  <Field label="Descripción"><Input value={editForm.descripcion} onChange={e => setEditForm(p => ({ ...p, descripcion: e.target.value }))} /></Field>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Costo"><Input value={editForm.costo} onChange={e => setEditForm(p => ({ ...p, costo: e.target.value }))} placeholder="$" /></Field>
                <Field label="Precio"><Input value={editForm.precio} onChange={e => setEditForm(p => ({ ...p, precio: e.target.value }))} placeholder="$" /></Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Cliente"><Input value={editForm.cliente} onChange={e => setEditForm(p => ({ ...p, cliente: e.target.value }))} /></Field>
                <Field label="N° comprobante"><Input value={editForm.comprobante} onChange={e => setEditForm(p => ({ ...p, comprobante: e.target.value }))} /></Field>
              </div>
              <Field label="Forma de pago">
                <Select value={editForm.pago} onChange={e => setEditForm(p => ({ ...p, pago: e.target.value }))}>
                  {PAGOS.map(p => <option key={p}>{p}</option>)}
                </Select>
              </Field>
              {/* Desglose rentabilidad real */}
              {(() => {
                const precio = +editForm.precio.replace(/,/g, '.').replace(/[^0-9.]/g,'')
                const costo  = +editForm.costo.replace(/,/g, '.').replace(/[^0-9.]/g,'')
                const r = precio && costo ? calcRentabilidad(precio, costo) : null
                return r ? (
                  <div style={{background:'#f9fafb',border:'1px solid #e5e7eb',borderRadius:10,padding:'10px 14px',fontSize:12}}>
                    <p style={{fontWeight:700,color:'#374151',marginBottom:6}}>📊 Rentabilidad real (sin IVA + flete 1.5%)</p>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:4}}>
                      <span style={{color:'#6b7280'}}>Precio neto:</span><span style={{fontFamily:'monospace',fontWeight:600}}>{moneyARS(r.precioNeto)}</span>
                      <span style={{color:'#6b7280'}}>Costo neto:</span><span style={{fontFamily:'monospace',fontWeight:600}}>{moneyARS(r.costoNeto)}</span>
                      <span style={{color:'#6b7280',fontWeight:700}}>Ganancia:</span>
                      <span style={{fontFamily:'monospace',fontWeight:800,color:r.ganancia>=0?'#00A550':'#ef4444'}}>{moneyARS(r.ganancia)} ({r.margen}%)</span>
                    </div>
                  </div>
                ) : null
              })()}
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setEditId(null)} style={{background:'#6b7280',color:'#fff',border:'none',borderRadius:8,padding:'9px 20px',fontWeight:700,fontSize:14,cursor:'pointer'}}>Cancelar</button>
                <button onClick={() => guardarEdicion(v)} style={{background:'#00A550',color:'#fff',border:'none',borderRadius:8,padding:'9px 20px',fontWeight:700,fontSize:14,cursor:'pointer'}}>Guardar</button>
              </div>
            </div>
          </Modal>
        )
      })()}
    </div>
  )
}
