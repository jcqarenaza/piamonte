'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Modal, Field, Input, Select, Empty } from '@/components/ui'
import { moneyARS2 as moneyARS, moneyARS2, todayStr } from '@/lib/utils/format'

const IVA = 0.21
const btn     = { background:'#00A550',color:'#fff',border:'none',borderRadius:10,padding:'10px 20px',fontWeight:700,fontSize:14,cursor:'pointer' } as const
const btnSm   = { ...btn, padding:'6px 14px', fontSize:13 } as const
const btnGray = { ...btnSm, background:'#6b7280' } as const
const btnRed  = { ...btnSm, background:'#ef4444' } as const
const btnBlue = { ...btnSm, background:'#1d4ed8' } as const

const TIPOS = [
  { id:'factura',   label:'Factura',        icon:'🧾' },
  { id:'remito',    label:'Remito',          icon:'📦' },
  { id:'nc',        label:'Nota de Crédito', icon:'↩' },
  { id:'nd',        label:'Nota de Débito',  icon:'↗' },
]
const LETRAS = ['A','B','C','E','M','X']
const TIPO_COLOR: Record<string,string> = {
  factura:'#1d4ed8', remito:'#00A550', nc:'#d97706', nd:'#7c3aed'
}

// Validación de CUIT/CUIL — algoritmo módulo 11 de AFIP, sin consultar servicios externos
function validarCuit(cuit: string): { ok:boolean; msg:string } {
  const limpio = cuit.replace(/[^0-9]/g,'')
  if (limpio.length === 0) return { ok:true, msg:'' }
  if (limpio.length !== 11) return { ok:false, msg:'El CUIT/CUIL debe tener 11 números' }
  const mult = [5,4,3,2,7,6,5,4,3,2]
  const digitos = limpio.split('').map(Number)
  const suma = mult.reduce((acc,m,i)=>acc + m*digitos[i], 0)
  let resto = 11 - (suma % 11)
  if (resto === 11) resto = 0
  if (resto === 10) return { ok:false, msg:'CUIT/CUIL inválido (dígito verificador)' }
  if (resto !== digitos[10]) return { ok:false, msg:'CUIT/CUIL inválido (dígito verificador no coincide)' }
  const prefijo = limpio.slice(0,2)
  const prefijosValidos = ['20','23','24','27','30','33','34','55']
  if (!prefijosValidos.includes(prefijo)) return { ok:false, msg:'Prefijo de CUIT/CUIL no reconocido' }
  return { ok:true, msg:'CUIT/CUIL válido' }
}
function formatCuit(v: string) {
  const limpio = v.replace(/[^0-9]/g,'').slice(0,11)
  if (limpio.length <= 2) return limpio
  if (limpio.length <= 10) return `${limpio.slice(0,2)}-${limpio.slice(2)}`
  return `${limpio.slice(0,2)}-${limpio.slice(2,10)}-${limpio.slice(10)}`
}

interface Proveedor { id:string; nombre:string; razon_social:string|null; cuit?:string|null; descuento_pct?:number|null }
interface Item { d:string; c:number; p:number; articulo_id?:string|null }
interface Comprobante {
  id:string; tipo:string; letra:string|null; punto_venta:string|null; numero:string|null
  fecha:string; proveedor_id:string|null; proveedor_nombre:string|null
  items:Item[]; neto:number; iva:number; total:number
  cae:string|null; cae_vencimiento:string|null; remito_id:string|null
  descuento_pct:number|null; descuento_monto:number|null; flete:number|null
  ret_iva:number|null; ret_ganancias:number|null; ret_iibb:number|null; ajuste_redondeo:number|null
  estado:string; afecta_stock:boolean; notas:string|null; created_at:string
}

export default function ComprasClient() {
  const [comprobantes, setComprobantes] = useState<Comprobante[]>([])
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [filtroTipo, setFiltroTipo] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('')
  const [ivaOn, setIvaOn] = useState(true)

  // Alta rápida de proveedor
  const [provModal, setProvModal] = useState(false)
  const [provForm, setProvForm] = useState({ nombre:'', razon_social:'', cuit:'', email:'', telefono:'', direccion:'', localidad:'', contacto:'', notas:'' })
  const [savingProv, setSavingProv] = useState(false)
  const provCuitCheck = validarCuit(provForm.cuit)

  // Modal vinculación a stock (remito o factura con afecta_stock)
  const [remitoModal, setRemitoModal] = useState<Comprobante|null>(null)
  const [stockItems, setStockItems] = useState<any[]>([])
  const [mappings, setMappings] = useState<Record<number,{stock_id:string;qty:number;costo:number}|null>>({})
  const [stockQ, setStockQ] = useState<Record<number,string>>({})
  const [stockSugs, setStockSugs] = useState<Record<number,any[]>>({})
  const [procesando, setProcesando] = useState(false)
  const [nuevoItem, setNuevoItem] = useState<Record<number,{desc:string;codigo:string;precio:string}|null>>({})

  // Informe de comparación: lo que se pagó en la factura vs. el costo vigente en las listas de precios
  const [compararModal, setCompararModal] = useState<Comprobante|null>(null)
  const [comparacion, setComparacion] = useState<any[]>([])
  const [comparando, setComparando] = useState(false)

  const [form, setForm] = useState({
    tipo:'factura', letra:'A', punto_venta:'0001', numero:'', fecha:todayStr(),
    proveedor_id:'', proveedor_nombre:'', notas:'', afecta_stock:false,
    cae:'', cae_vencimiento:'', remito_vinculado_id:'',
    descuento_pct:'', flete:'', ret_iva:'', ret_ganancias:'', ret_iibb:''
  })
  const [descuentoTocadoAMano, setDescuentoTocadoAMano] = useState(false)
  const [items, setItems] = useState<Item[]>([])
  const [itemForm, setItemForm] = useState({ d:'', c:'1', p:'' })
  const [editandoItemIdx, setEditandoItemIdx] = useState<number|null>(null)
  // Artículo del catálogo maestro elegido para el ítem que se está cargando — igual patrón que Stock
  const [itemArticuloSel, setItemArticuloSel] = useState<{id:string;descripcion:string}|null>(null)
  const [itemArticuloSugs, setItemArticuloSugs] = useState<any[]>([])

  const supabase = createClient()

  // Cadena de cálculo: Subtotal ítems → Descuento proveedor → +IVA → +Flete → −Retenciones → ±Ajuste manual
  const netoItems    = items.reduce((a,i)=>a+i.c*i.p, 0)
  const descuentoPct = parseFloat(form.descuento_pct.replace(',','.')) || 0
  const descuentoMonto = Math.round(netoItems * descuentoPct * 100) / 10000
  const netoConDescuento = netoItems - descuentoMonto
  const iva   = ivaOn ? Math.round(netoConDescuento*IVA*100)/100 : 0
  const flete = parseFloat(form.flete.replace(',','.')) || 0
  const retIva = parseFloat(form.ret_iva.replace(',','.')) || 0
  const retGanancias = parseFloat(form.ret_ganancias.replace(',','.')) || 0
  const retIibb = parseFloat(form.ret_iibb.replace(',','.')) || 0
  const totalRetenciones = retIva + retGanancias + retIibb
  const [ajusteManual, setAjusteManual] = useState('')
  const ajuste = parseFloat(ajusteManual.replace(',','.')) || 0
  const neto  = netoConDescuento
  const total = Math.round((netoConDescuento + iva + flete - totalRetenciones + ajuste) * 100) / 100

  const loadProveedores = useCallback(async () => {
    const { data } = await supabase.from('proveedores_compra').select('id,nombre,razon_social,cuit,descuento_pct').eq('activo',true).order('nombre')
    setProveedores(data ?? [])
  }, [supabase])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('comprobantes_compra')
      .select('*').order('fecha', {ascending:false}).order('created_at',{ascending:false}).limit(200)
    setComprobantes(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
    loadProveedores()
    supabase.from('stock').select('id,descripcion,codigo,cantidad,costo,precio_venta').eq('activo',true).order('descripcion')
      .then(({data})=>setStockItems(data??[]))
  }, [supabase, loadProveedores])

  // Sugerir el % de descuento habitual del proveedor al elegirlo — solo si el operador no lo tocó a mano
  useEffect(() => {
    if (!form.proveedor_id || descuentoTocadoAMano) return
    const prov = proveedores.find(p=>p.id===form.proveedor_id)
    setForm(p => ({ ...p, descuento_pct: prov?.descuento_pct ? String(prov.descuento_pct) : '' }))
  }, [form.proveedor_id, proveedores, descuentoTocadoAMano])

  // Buscar en el catálogo maestro de artículos a medida que se tipea la descripción del ítem —
  // mismo criterio que ya usa Stock, para que Compras también quede vinculado al SKU.
  async function buscarItemArticulo(texto: string) {
    setItemForm(p => ({ ...p, d: texto }))
    setItemArticuloSel(null)
    if (texto.trim().length < 2) { setItemArticuloSugs([]); return }
    const { data } = await supabase.from('articulos_maestro')
      .select('id,descripcion,sku_interno').eq('activo', true)
      .or(`descripcion.ilike.%${texto}%,sku_interno.ilike.%${texto}%`).limit(6)
    setItemArticuloSugs(data ?? [])
  }

  function elegirItemArticulo(a: any) {
    setItemArticuloSel(a)
    setItemForm(p => ({ ...p, d: a.descripcion }))
    setItemArticuloSugs([])
  }

  function addItem() {
    const p = parseFloat(itemForm.p.replace(/[^0-9.,]/g,'').replace(',','.'))
    const c = parseInt(itemForm.c)
    if (!itemForm.d || !p || !c) return
    const nuevoItemData: Item = { d:itemForm.d, c, p, articulo_id: itemArticuloSel?.id || null }
    if (editandoItemIdx !== null) {
      setItems(prev => prev.map((it,i) => i===editandoItemIdx ? nuevoItemData : it))
      setEditandoItemIdx(null)
    } else {
      setItems(prev=>[...prev, nuevoItemData])
    }
    setItemForm({d:'',c:'1',p:''})
    setItemArticuloSel(null)
    setItemArticuloSugs([])
  }

  async function guardarProveedor() {
    if (!provForm.nombre.trim()) return
    if (provForm.cuit && !validarCuit(provForm.cuit).ok) { alert('El CUIT/CUIL ingresado no es válido. Revisá los números.'); return }
    setSavingProv(true)
    const { data, error } = await supabase.from('proveedores_compra').insert({
      nombre: provForm.nombre, razon_social: provForm.razon_social||null, cuit: provForm.cuit||null,
      email: provForm.email||null, telefono: provForm.telefono||null, direccion: provForm.direccion||null,
      localidad: provForm.localidad||null, contacto: provForm.contacto||null, notas: provForm.notas||null,
      activo: true,
    }).select('id,nombre,razon_social,cuit').single()
    setSavingProv(false)
    if (error || !data) { alert('No se pudo guardar el proveedor.'); return }
    setProveedores(prev => [...prev, data].sort((a,b)=>a.nombre.localeCompare(b.nombre)))
    setForm(p => ({ ...p, proveedor_id: data.id, proveedor_nombre: data.nombre }))
    setProvModal(false)
    setProvForm({ nombre:'', razon_social:'', cuit:'', email:'', telefono:'', direccion:'', localidad:'', contacto:'', notas:'' })
  }

  async function save() {
    if (!items.length && total === 0) return
    const prov = proveedores.find(p=>p.id===form.proveedor_id)
    // Si la factura está vinculada a un remito ya recibido, ese remito ya sumó el stock —
    // la factura no debe volver a tocarlo, solo queda de respaldo fiscal.
    const tieneRemitoVinculado = form.tipo==='factura' && !!form.remito_vinculado_id
    await supabase.from('comprobantes_compra').insert({
      tipo: form.tipo, letra: form.letra||null,
      punto_venta: form.punto_venta||null, numero: form.numero||null,
      fecha: form.fecha, proveedor_id: form.proveedor_id||null,
      proveedor_nombre: prov?.nombre || form.proveedor_nombre || null,
      items, neto, iva_pct: IVA, iva, total,
      descuento_pct: descuentoPct||0, descuento_monto: descuentoMonto||0,
      flete: flete||0, ret_iva: retIva||0, ret_ganancias: retGanancias||0, ret_iibb: retIibb||0,
      ajuste_redondeo: ajuste||0,
      cae: form.tipo==='factura' ? (form.cae||null) : null,
      cae_vencimiento: form.tipo==='factura' ? (form.cae_vencimiento||null) : null,
      remito_id: tieneRemitoVinculado ? form.remito_vinculado_id : null,
      estado: 'pendiente', afecta_stock: tieneRemitoVinculado ? false : form.afecta_stock,
      notas: form.notas||null,
    })
    // Si vinculamos un remito, lo marcamos como facturado para que no aparezca disponible para vincular de nuevo
    if (tieneRemitoVinculado) {
      await supabase.from('comprobantes_compra').update({ notas: 'Facturado' }).eq('id', form.remito_vinculado_id)
    }
    setOpen(false)
    setForm({tipo:'factura',letra:'A',punto_venta:'0001',numero:'',fecha:todayStr(),
      proveedor_id:'',proveedor_nombre:'',notas:'',afecta_stock:false,cae:'',cae_vencimiento:'',remito_vinculado_id:'',
      descuento_pct:'',flete:'',ret_iva:'',ret_ganancias:'',ret_iibb:''})
    setDescuentoTocadoAMano(false)
    setAjusteManual('')
    setItems([]); setIvaOn(true)
    load()
  }

  // Abre el modal de vinculación a stock — funciona para remitos Y para facturas con afecta_stock
  function abrirVinculacion(c:Comprobante) {
    setRemitoModal(c)
    const init: Record<number,{stock_id:string;qty:number;costo:number}|null> = {}
    const initQ: Record<number,string> = {}
    c.items.forEach((it,i) => {
      const match = stockItems.find(s =>
        s.descripcion?.toLowerCase().includes(it.d.toLowerCase()) ||
        it.d.toLowerCase().includes(s.descripcion?.toLowerCase() || '')
      )
      init[i] = match ? { stock_id: match.id, qty: it.c, costo: it.p } : null
      initQ[i] = match ? match.descripcion : ''
    })
    setMappings(init)
    setStockQ(initQ)
    setStockSugs({})
  }

  function buscarStock(idx:number, q:string) {
    setStockQ(prev=>({...prev,[idx]:q}))
    if (q.length < 2) { setStockSugs(prev=>({...prev,[idx]:[]})); return }
    const res = stockItems.filter(s =>
      (s.descripcion||'').toLowerCase().includes(q.toLowerCase()) ||
      (s.codigo||'').toLowerCase().includes(q.toLowerCase())
    ).slice(0,6)
    setStockSugs(prev=>({...prev,[idx]:res}))
  }

  function pickStock(idx:number, s:any, qty:number, costo:number) {
    setMappings(prev=>({...prev,[idx]:{ stock_id:s.id, qty, costo }}))
    setStockQ(prev=>({...prev,[idx]:s.descripcion}))
    setStockSugs(prev=>({...prev,[idx]:[]}))
  }

  // Crea la fila de stock y, si el ítem ya venía vinculado a un artículo del catálogo maestro
  // (porque se eligió al cargar la factura), la deja enlazada a ese mismo artículo —
  // así no hace falta volver a vincularla a mano desde Stock.
  async function crearYVincular(idx:number, it:Item) {
    const n = nuevoItem[idx]
    if (!n?.desc) return
    const { data } = await supabase.from('stock').insert({
      descripcion: n.desc,
      codigo: n.codigo || null,
      precio_venta: parseFloat(n.precio)||null,
      costo: it.p||null,
      cantidad: 0,
      activo: true,
      pos: 'STOCK',
      articulo_id: it.articulo_id || null,
    }).select('id,descripcion,codigo,cantidad').single()
    if (data) {
      setStockItems(prev=>[...prev, data])
      pickStock(idx, data, mappings[idx]?.qty??it.c, it.p)
      setNuevoItem(prev=>({...prev,[idx]:null}))
    }
  }

  async function confirmarRecepcion() {
    if (!remitoModal) return
    setProcesando(true)
    const prov = proveedores.find(p=>p.id===remitoModal.proveedor_id)
    const fecha = new Date().toISOString().slice(0,10)
    const etiqueta = remitoModal.tipo === 'remito'
      ? `Remito ${remitoModal.numero || 'S/N'}`
      : `Factura ${remitoModal.letra||''} ${remitoModal.punto_venta||''}-${remitoModal.numero||'S/N'}`

    for (const [idxStr, map] of Object.entries(mappings)) {
      const idx = parseInt(idxStr)
      const item = remitoModal.items[idx]
      if (!map) continue

      await supabase.from('ajustes_stock').insert({
        fecha, tipo:'entrada',
        stock_id: map.stock_id,
        descripcion: item.d,
        cantidad: map.qty,
        costo_unitario: map.costo,
        proveedor: prov?.nombre || remitoModal.proveedor_nombre || null,
        nota: `${etiqueta} — recepción automática`,
      })

      // Si el ítem de la factura ya tenía un artículo del catálogo asociado y la fila de stock
      // destino todavía no estaba vinculada a ninguno, la vinculamos ahora — así Compras
      // termina de cerrar el círculo del SKU sin que haga falta un paso manual extra en Stock.
      const { data: st } = await supabase.from('stock').select('cantidad,articulo_id').eq('id', map.stock_id).maybeSingle()
      if (st) {
        const updatePayload: any = { cantidad: (st.cantidad||0) + map.qty }
        if (!st.articulo_id && item.articulo_id) updatePayload.articulo_id = item.articulo_id
        await supabase.from('stock').update(updatePayload).eq('id', map.stock_id)
      }
    }

    await supabase.from('comprobantes_compra').update({ estado:'procesado', afecta_stock:true }).eq('id', remitoModal.id)

    setProcesando(false)
    setRemitoModal(null)
    setMappings({})
    load()
  }

  async function anular(id:string) {
    if (!confirm('¿Anular este comprobante?')) return
    await supabase.from('comprobantes_compra').update({estado:'anulado'}).eq('id',id)
    load()
  }

  // Compara lo pagado en la factura contra el costo vigente en el catálogo maestro (todas las
  // equivalencias por proveedor). Si el ítem ya tiene articulo_id, comparamos directo contra
  // sus equivalencias — más preciso que buscar por palabras sueltas en la descripción.
  async function compararPrecios(c: Comprobante) {
    setCompararModal(c)
    setComparando(true)
    setComparacion([])

    const resultados: any[] = []
    for (const it of c.items) {
      let candidatos: any[] = []

      if (it.articulo_id) {
        const { data } = await supabase.from('articulo_equivalencias')
          .select('proveedor,costo_neto,lista_nombre,codigo_proveedor')
          .eq('articulo_id', it.articulo_id)
        candidatos = data ?? []
      } else {
        // Sin artículo vinculado todavía — fallback a la búsqueda por palabras de antes
        const palabras = it.d.toUpperCase().split(/\s+/).filter((w:string) => w.length > 2)
        if (palabras.length > 0) {
          const { data } = await supabase.from('articulos_maestro')
            .select('id,descripcion,articulo_equivalencias(proveedor,costo_neto,lista_nombre,codigo_proveedor)')
            .ilike('descripcion', `%${palabras[0]}%`).limit(20)
          const match = (data ?? []).find((a:any) =>
            palabras.every((w:string) => (a.descripcion||'').toUpperCase().includes(w))
          )
          candidatos = match?.articulo_equivalencias ?? []
        }
      }

      if (candidatos.length === 0) { resultados.push({ item: it, candidatos: [], sinMatch: true }); continue }

      const porProveedor = new Map<string, any>()
      for (const cand of candidatos) {
        const actual = porProveedor.get(cand.proveedor)
        if (!actual || cand.costo_neto < actual.costo_neto) porProveedor.set(cand.proveedor, cand)
      }
      const lista = [...porProveedor.values()].sort((a,b)=>a.costo_neto - b.costo_neto)

      const masBarato = lista[0]
      const diferencia = masBarato ? it.p - masBarato.costo_neto : null
      const diferenciaPct = masBarato && masBarato.costo_neto > 0 ? (diferencia! / masBarato.costo_neto) * 100 : null

      resultados.push({ item: it, candidatos: lista, sinMatch: lista.length === 0, diferencia, diferenciaPct, masBarato })
    }

    setComparacion(resultados)
    setComparando(false)
  }

  // Remitos ya procesados (stock ya cargado) y aún no marcados como facturados — para vincular a una Factura
  const remitosDisponibles = comprobantes.filter(c =>
    c.tipo === 'remito' && c.estado === 'procesado' && c.notas !== 'Facturado'
  )

  const filtrados = comprobantes.filter(c =>
    (!filtroTipo || c.tipo === filtroTipo) &&
    (!filtroEstado || c.estado === filtroEstado)
  )

  const mes = new Date().toISOString().slice(0,7)
  const totalMes = comprobantes.filter(c=>c.fecha.startsWith(mes)&&c.estado!=='anulado'&&c.tipo==='factura')
    .reduce((a,c)=>a+c.total,0)

  const tipoLabel = (tipo:string) => TIPOS.find(t=>t.id===tipo)?.label || tipo
  const tipoIcon  = (tipo:string) => TIPOS.find(t=>t.id===tipo)?.icon || '📄'
  const numComp   = (c:Comprobante) => c.tipo==='remito' ? `REM-${c.numero||'S/N'}` :
    c.tipo==='nc' ? `NC ${c.letra||''}-${c.punto_venta||''}-${c.numero||''}` :
    c.tipo==='nd' ? `ND ${c.letra||''}-${c.punto_venta||''}-${c.numero||''}` :
    `${c.letra||''}${c.punto_venta ? ' '+c.punto_venta : ''}-${c.numero||'S/N'}`

  // Puede vincularse a stock si es remito pendiente, o factura pendiente marcada con afecta_stock
  const puedeVincular = (c:Comprobante) =>
    c.estado==='pendiente' && c.items?.length>0 && !c.remito_id &&
    (c.tipo==='remito' || (c.tipo==='factura' && c.afecta_stock))

  return (
    <div>
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <div className="bg-white border border-p-line rounded-xl p-4 shadow-sm">
          <p className="text-[11px] font-semibold text-p-ink2 uppercase tracking-wider">Compras del mes</p>
          <p className="font-saira font-bold text-xl text-p-ink mt-1">{moneyARS(totalMes)}</p>
        </div>
        <div className="bg-white border border-p-line rounded-xl p-4 shadow-sm">
          <p className="text-[11px] font-semibold text-p-ink2 uppercase tracking-wider">Facturas</p>
          <p className="font-saira font-bold text-xl text-p-ink mt-1">{comprobantes.filter(c=>c.tipo==='factura'&&c.estado!=='anulado').length}</p>
        </div>
        <div className="bg-white border border-p-line rounded-xl p-4 shadow-sm">
          <p className="text-[11px] font-semibold text-p-ink2 uppercase tracking-wider">Pendientes de stock</p>
          <p className="font-saira font-bold text-xl text-amber-600 mt-1">{comprobantes.filter(puedeVincular).length}</p>
        </div>
        <div className="bg-white border border-p-line rounded-xl p-4 shadow-sm">
          <p className="text-[11px] font-semibold text-p-ink2 uppercase tracking-wider">NC / ND</p>
          <p className="font-saira font-bold text-xl text-purple-600 mt-1">{comprobantes.filter(c=>['nc','nd'].includes(c.tipo)&&c.estado!=='anulado').length}</p>
        </div>
      </div>

      {/* Filtros + botón */}
      <div className="flex gap-2 flex-wrap mb-5 items-center">
        <select value={filtroTipo} onChange={e=>setFiltroTipo(e.target.value)}
          className="border border-p-line rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-p-green shadow-sm">
          <option value="">Todos los tipos</option>
          {TIPOS.map(t=><option key={t.id} value={t.id}>{t.icon} {t.label}</option>)}
        </select>
        <select value={filtroEstado} onChange={e=>setFiltroEstado(e.target.value)}
          className="border border-p-line rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-p-green shadow-sm">
          <option value="">Todos los estados</option>
          <option value="pendiente">Pendiente</option>
          <option value="procesado">Procesado</option>
          <option value="anulado">Anulado</option>
        </select>
        <span className="text-sm text-p-ink2 ml-1">{filtrados.length} comprobantes</span>
        <div className="ml-auto flex gap-2">
          <button onClick={()=>setProvModal(true)} style={btnGray}>+ Proveedor</button>
          <button onClick={()=>setOpen(true)} style={btn}>+ Cargar comprobante</button>
        </div>
      </div>

      {/* Listado */}
      {loading ? <p className="text-sm text-p-gray text-center py-10">Cargando…</p> :
       filtrados.length === 0 ? <Empty msg="Sin comprobantes de compra." /> : (
        <div className="flex flex-col gap-2">
          {filtrados.map(c=>(
            <div key={c.id} className={`bg-white border border-p-line rounded-xl p-4 shadow-sm ${c.estado==='anulado'?'opacity-50':''}`}>
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-[10px] font-bold px-2.5 py-1 rounded-full text-white shrink-0"
                    style={{background:TIPO_COLOR[c.tipo]||'#6b7280'}}>
                    {tipoIcon(c.tipo)} {tipoLabel(c.tipo)}
                  </span>
                  <span className="font-mono font-bold text-sm text-p-dark">{numComp(c)}</span>
                  <span className="text-sm font-semibold text-p-ink">{c.proveedor_nombre||'Sin proveedor'}</span>
                  <span className="text-xs text-p-ink2">{c.fecha.split('-').reverse().join('/')}</span>
                  {c.cae && <span className="text-[10px] font-mono bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">CAE {c.cae}</span>}
                  {c.remito_id && <span className="text-[10px] font-bold bg-green-50 text-green-700 px-2 py-0.5 rounded-full">📦 Stock ya cargado (remito)</span>}
                </div>
                <div className="text-right">
                  <p className="font-saira font-bold text-lg text-p-ink">{moneyARS(c.total)}</p>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    c.estado==='procesado'?'bg-green-100 text-green-700':
                    c.estado==='anulado'?'bg-gray-100 text-gray-500':'bg-amber-100 text-amber-700'
                  }`}>{c.estado}</span>
                </div>
              </div>
              {c.cae_vencimiento && (
                <p className="text-[11px] text-p-ink2 mt-1">Vto. CAE: {c.cae_vencimiento.split('-').reverse().join('/')}</p>
              )}
              {/* Items */}
              {c.items?.length > 0 && (
                <div className="mt-2 pt-2 border-t border-p-line2">
                  <div className="flex flex-wrap gap-1">
                    {c.items.slice(0,3).map((it,i)=>(
                      <span key={i} className="text-[11px] bg-p-light text-p-dark px-2 py-0.5 rounded-full">
                        {it.articulo_id && '🔗 '}{it.d} ×{it.c}
                      </span>
                    ))}
                    {c.items.length>3&&<span className="text-[11px] text-p-ink2">+{c.items.length-3} más</span>}
                  </div>
                </div>
              )}
              {/* Acciones */}
              <div className="flex gap-2 mt-3 pt-2 border-t border-p-line2 flex-wrap">
                {puedeVincular(c) && (
                  <button onClick={()=>abrirVinculacion(c)}
                    style={{...btnSm,background:'#00A550'}}>
                    📦 Cargar a stock
                  </button>
                )}
                {c.items?.length > 0 && (c.tipo==='factura'||c.tipo==='remito') && (
                  <button onClick={()=>compararPrecios(c)} style={btnBlue}>
                    📊 Comparar precios
                  </button>
                )}
                {c.estado==='pendiente' && (
                  <button onClick={()=>anular(c.id)} style={btnRed}>✕ Anular</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal vinculación a stock — remito o factura con afecta_stock */}
      {remitoModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={e=>{if(e.target===e.currentTarget)setRemitoModal(null)}}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-p-line">
              <div>
                <h2 className="font-saira font-bold text-xl text-p-ink">📦 Cargar mercadería a stock</h2>
                <p className="text-sm text-p-ink2 mt-0.5">
                  {remitoModal.proveedor_nombre} · {remitoModal.tipo==='remito' ? `Rem. ${remitoModal.numero||'S/N'}` : numComp(remitoModal)}
                </p>
              </div>
              <button onClick={()=>setRemitoModal(null)} className="text-p-gray hover:text-p-ink text-2xl leading-none">✕</button>
            </div>
            <div className="overflow-y-auto flex-1 p-5">
              <p className="text-xs text-p-ink2 mb-4">
                Vinculá cada ítem con su correspondiente artículo en stock. Los vinculados sumarán la cantidad al stock actual.
              </p>
              <div className="flex flex-col gap-4">
                {remitoModal.items.map((it,i) => (
                  <div key={i} className="bg-p-light rounded-xl p-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-semibold text-sm text-p-ink">{it.articulo_id && '🔗 '}{it.d}</p>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-p-ink2">Cant:</span>
                        <input type="number" value={mappings[i]?.qty ?? it.c}
                          onChange={e=>setMappings(prev=>({...prev,[i]:prev[i]?{...prev[i]!,qty:+e.target.value}:null}))}
                          className="w-16 border border-p-line rounded-lg px-2 py-1 text-sm text-center"/>
                      </div>
                    </div>
                    {!nuevoItem[i] && (
                      <div className="relative">
                        <input
                          value={stockQ[i]||''}
                          onChange={e=>buscarStock(i,e.target.value)}
                          placeholder="Buscar por descripción o código…"
                          className="w-full border border-p-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-p-green bg-white"/>
                        {(stockSugs[i]?.length>0 || (stockQ[i]?.length>=2 && !stockSugs[i]?.length)) && (
                          <div className="absolute z-10 w-full bg-white border border-p-line rounded-xl shadow-lg mt-1 overflow-hidden">
                            {stockSugs[i]?.map(s=>(
                              <button key={s.id} onClick={()=>pickStock(i,s,mappings[i]?.qty??it.c,it.p)}
                                className="w-full text-left px-3 py-2 hover:bg-p-light text-sm border-b border-p-line2 last:border-0">
                                {s.codigo&&<span className="font-mono text-[10px] bg-p-light px-1.5 py-0.5 rounded mr-2 text-p-dark">{s.codigo}</span>}
                                <span className="font-medium">{s.descripcion}</span>
                                <span className="text-xs text-p-ink2 ml-2">stock: {s.cantidad}</span>
                              </button>
                            ))}
                            {stockQ[i]?.length>=2 && !stockSugs[i]?.length && (
                              <div className="px-3 py-3 text-sm text-p-ink2">
                                <p className="mb-2">No encontrado en stock.</p>
                                <button onClick={()=>setNuevoItem(prev=>({...prev,[i]:{desc:it.d,codigo:'',precio:''}}))}
                                  style={{background:'#1d4ed8',color:'#fff',border:'none',borderRadius:8,padding:'6px 14px',fontWeight:700,fontSize:12,cursor:'pointer'}}>
                                  + Crear nuevo artículo
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {nuevoItem[i] && (
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex flex-col gap-2">
                        <p className="text-[11px] font-bold text-blue-700 uppercase tracking-wider">Nuevo artículo en stock</p>
                        <input value={nuevoItem[i]!.desc}
                          onChange={e=>setNuevoItem(prev=>({...prev,[i]:{...prev[i]!,desc:e.target.value}}))}
                          placeholder="Descripción *"
                          className="border border-p-line rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-blue-400"/>
                        <div className="grid grid-cols-2 gap-2">
                          <input value={nuevoItem[i]!.codigo}
                            onChange={e=>setNuevoItem(prev=>({...prev,[i]:{...prev[i]!,codigo:e.target.value}}))}
                            placeholder="Código (opcional)"
                            className="border border-p-line rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-blue-400"/>
                          <input value={nuevoItem[i]!.precio}
                            onChange={e=>setNuevoItem(prev=>({...prev,[i]:{...prev[i]!,precio:e.target.value}}))}
                            placeholder="Precio de venta"
                            className="border border-p-line rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-blue-400"/>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={()=>crearYVincular(i,it)}
                            style={{background:'#00A550',color:'#fff',border:'none',borderRadius:8,padding:'6px 14px',fontWeight:700,fontSize:12,cursor:'pointer'}}>
                            ✓ Crear y vincular
                          </button>
                          <button onClick={()=>setNuevoItem(prev=>({...prev,[i]:null}))}
                            style={{background:'#6b7280',color:'#fff',border:'none',borderRadius:8,padding:'6px 14px',fontWeight:700,fontSize:12,cursor:'pointer'}}>
                            Cancelar
                          </button>
                        </div>
                      </div>
                    )}

                    {mappings[i] && !nuevoItem[i] && (
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700">✓ Vinculado</span>
                        <button onClick={()=>{setMappings(prev=>({...prev,[i]:null}));setStockQ(prev=>({...prev,[i]:''}))}}
                          className="text-[10px] text-red-400 hover:text-red-600">Desvincular</button>
                      </div>
                    )}
                    {!mappings[i] && !nuevoItem[i] && (
                      <p className="text-[10px] text-amber-600 mt-1.5">⚠ Sin vincular — no afectará el stock</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <div className="p-5 border-t border-p-line flex justify-between items-center">
              <p className="text-sm text-p-ink2">
                {Object.values(mappings).filter(Boolean).length} de {remitoModal.items.length} ítems vinculados
              </p>
              <div className="flex gap-2">
                <button onClick={()=>setRemitoModal(null)} style={{...btnGray}}>Cancelar</button>
                <button onClick={confirmarRecepcion} disabled={procesando}
                  style={{...btn,opacity:procesando?.7:1}}>
                  {procesando?'Procesando…':'✓ Confirmar carga a stock'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal comparación de precios contra catálogo */}
      {compararModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={e=>{if(e.target===e.currentTarget)setCompararModal(null)}}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-p-line">
              <div>
                <h2 className="font-saira font-bold text-xl text-p-ink">📊 Comparación de precios</h2>
                <p className="text-sm text-p-ink2 mt-0.5">
                  {compararModal.proveedor_nombre} · {numComp(compararModal)} — vs. costo vigente en el catálogo
                </p>
              </div>
              <button onClick={()=>setCompararModal(null)} className="text-p-gray hover:text-p-ink text-2xl leading-none">✕</button>
            </div>
            <div className="overflow-y-auto flex-1 p-5">
              {comparando ? (
                <p className="text-sm text-p-ink2 text-center py-10">Comparando contra el catálogo…</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {comparacion.map((r, i) => (
                    <div key={i} className={`rounded-xl p-3 border ${
                      r.sinMatch ? 'bg-gray-50 border-gray-200' :
                      r.diferencia > 0 ? 'bg-red-50 border-red-200' :
                      r.diferencia < 0 ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'
                    }`}>
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <p className="font-semibold text-sm text-p-ink">{r.item.articulo_id && '🔗 '}{r.item.d}</p>
                        <span className="font-mono text-sm">
                          Pagado: <strong>{moneyARS2(r.item.p)}</strong>
                        </span>
                      </div>

                      {r.sinMatch ? (
                        <p className="text-xs text-p-ink2 mt-1.5">Sin coincidencia en el catálogo — no se pudo comparar.</p>
                      ) : (
                        <>
                          <div className="flex items-center justify-between mt-1.5">
                            <p className="text-xs text-p-ink2">
                              Más barato disponible: <strong>{r.masBarato.proveedor}</strong> ({r.masBarato.lista_nombre || 'lista actual'}) — {moneyARS2(r.masBarato.costo_neto)}
                            </p>
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                              r.diferencia > 0 ? 'bg-red-100 text-red-700' :
                              r.diferencia < 0 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                            }`}>
                              {r.diferencia > 0 ? `⚠ Pagaste ${moneyARS2(r.diferencia)} más (+${r.diferenciaPct.toFixed(1)}%)` :
                               r.diferencia < 0 ? `✓ Pagaste ${moneyARS2(Math.abs(r.diferencia))} menos (${r.diferenciaPct.toFixed(1)}%)` :
                               'Mismo precio'}
                            </span>
                          </div>
                          {r.candidatos.length > 1 && (
                            <div className="mt-2 pt-2 border-t border-p-line2 flex flex-wrap gap-1.5">
                              {r.candidatos.map((c2:any, j:number) => (
                                <span key={j} className="text-[11px] bg-white border border-p-line2 px-2 py-0.5 rounded-full">
                                  {c2.proveedor}: {moneyARS2(c2.costo_neto)}
                                </span>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  ))}

                  {/* Resumen */}
                  {comparacion.some(r=>!r.sinMatch) && (
                    <div className="bg-p-light rounded-xl p-3 mt-2">
                      <p className="text-sm font-saira font-bold text-p-ink">
                        Diferencia total: {moneyARS2(comparacion.filter(r=>!r.sinMatch).reduce((a,r)=>a+(r.diferencia||0),0))}
                      </p>
                      <p className="text-[11px] text-p-ink2 mt-0.5">
                        Positivo = pagaste de más respecto a la lista más barata disponible. Útil para reclamar al proveedor o pedir lista actualizada.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="p-5 border-t border-p-line flex justify-end">
              <button onClick={()=>setCompararModal(null)} style={btnGray}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal alta rápida de proveedor */}
      <Modal open={provModal} onClose={()=>setProvModal(false)} title="Nuevo proveedor">
        <div className="flex flex-col gap-3">
          <Field label="Nombre / Fantasía *">
            <Input value={provForm.nombre} onChange={e=>setProvForm(p=>({...p,nombre:e.target.value}))} placeholder="Nombre del proveedor"/>
          </Field>
          <Field label="Razón social">
            <Input value={provForm.razon_social} onChange={e=>setProvForm(p=>({...p,razon_social:e.target.value}))} placeholder="Razón social (opcional)"/>
          </Field>
          <Field label="CUIT">
            <Input value={provForm.cuit}
              onChange={e=>setProvForm(p=>({...p,cuit:formatCuit(e.target.value)}))}
              placeholder="30-12345678-9" maxLength={13}/>
            {provForm.cuit && (
              <div style={{
                marginTop:6,
                background: provCuitCheck.ok ? '#f0fdf4' : '#fef2f2',
                border: `1px solid ${provCuitCheck.ok ? '#86efac' : '#fca5a5'}`,
                borderRadius:8, padding:'6px 12px', fontSize:12
              }}>
                <p style={{fontWeight:600, color: provCuitCheck.ok ? '#15803d' : '#b91c1c'}}>
                  {provCuitCheck.ok ? '✓ ' : '⚠ '}{provCuitCheck.msg}
                </p>
              </div>
            )}
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Teléfono">
              <Input value={provForm.telefono} onChange={e=>setProvForm(p=>({...p,telefono:e.target.value}))} placeholder="opcional"/>
            </Field>
            <Field label="Email">
              <Input type="email" value={provForm.email} onChange={e=>setProvForm(p=>({...p,email:e.target.value}))} placeholder="opcional"/>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Dirección">
              <Input value={provForm.direccion} onChange={e=>setProvForm(p=>({...p,direccion:e.target.value}))} placeholder="opcional"/>
            </Field>
            <Field label="Localidad">
              <Input value={provForm.localidad} onChange={e=>setProvForm(p=>({...p,localidad:e.target.value}))} placeholder="opcional"/>
            </Field>
          </div>
          <Field label="Contacto">
            <Input value={provForm.contacto} onChange={e=>setProvForm(p=>({...p,contacto:e.target.value}))} placeholder="Persona de contacto (opcional)"/>
          </Field>
          <Field label="Notas">
            <Input value={provForm.notas} onChange={e=>setProvForm(p=>({...p,notas:e.target.value}))} placeholder="Observaciones…"/>
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={()=>setProvModal(false)} style={btnGray}>Cancelar</button>
            <button onClick={guardarProveedor} disabled={!provForm.nombre.trim()||savingProv}
              style={{...btn,opacity:(!provForm.nombre.trim()||savingProv)?.6:1}}>
              {savingProv?'Guardando…':'✓ Guardar proveedor'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal nuevo comprobante */}
      <Modal open={open} onClose={()=>setOpen(false)} title="Cargar comprobante de compra">
        <div className="flex flex-col gap-3 max-h-[80vh] overflow-y-auto pr-1">
          {/* Tipo */}
          <div>
            <label className="block text-[11px] font-semibold text-p-ink2 uppercase tracking-wider mb-2">Tipo</label>
            <div className="flex gap-2 flex-wrap">
              {TIPOS.map(t=>(
                <button key={t.id} onClick={()=>setForm(p=>({...p,tipo:t.id}))}
                  style={{background:form.tipo===t.id?TIPO_COLOR[t.id]:'#fff',color:form.tipo===t.id?'#fff':'#4A6655',border:`1.5px solid ${form.tipo===t.id?TIPO_COLOR[t.id]:'#C2DDD0'}`,borderRadius:8,padding:'7px 16px',fontWeight:700,fontSize:13,cursor:'pointer'}}>
                  {t.icon} {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Número */}
          {form.tipo !== 'remito' && (
            <div className="grid grid-cols-3 gap-2">
              <Field label="Letra">
                <Select value={form.letra} onChange={e=>setForm(p=>({...p,letra:e.target.value}))}>
                  {LETRAS.map(l=><option key={l} value={l}>{l}</option>)}
                </Select>
              </Field>
              <Field label="Punto de venta">
                <Input value={form.punto_venta} onChange={e=>setForm(p=>({...p,punto_venta:e.target.value}))} placeholder="0001"/>
              </Field>
              <Field label="Número">
                <Input value={form.numero} onChange={e=>setForm(p=>({...p,numero:e.target.value}))} placeholder="00001234"/>
              </Field>
            </div>
          )}
          {form.tipo === 'remito' && (
            <Field label="N° Remito">
              <Input value={form.numero} onChange={e=>setForm(p=>({...p,numero:e.target.value}))} placeholder="R-001234"/>
            </Field>
          )}

          {/* CAE — solo para Factura */}
          {form.tipo === 'factura' && (
            <div className="grid grid-cols-2 gap-3 bg-blue-50 border border-blue-100 rounded-xl p-3">
              <Field label="CAE">
                <Input value={form.cae} onChange={e=>setForm(p=>({...p,cae:e.target.value}))} placeholder="N° de CAE (opcional)"/>
              </Field>
              <Field label="Vencimiento CAE">
                <Input type="date" value={form.cae_vencimiento} onChange={e=>setForm(p=>({...p,cae_vencimiento:e.target.value}))}/>
              </Field>
            </div>
          )}

          {/* Vincular a remito ya recibido — evita duplicar la carga a stock */}
          {form.tipo === 'factura' && remitosDisponibles.length > 0 && (
            <Field label="¿Corresponde a un remito ya recibido?">
              <select value={form.remito_vinculado_id}
                onChange={e=>setForm(p=>({...p,remito_vinculado_id:e.target.value, afecta_stock: e.target.value ? false : p.afecta_stock}))}
                className="w-full border border-p-line rounded-lg px-3 py-2 text-sm text-p-ink focus:outline-none focus:border-p-green bg-white">
                <option value="">No — es independiente</option>
                {remitosDisponibles.map(r=>(
                  <option key={r.id} value={r.id}>
                    REM-{r.numero||'S/N'} · {r.proveedor_nombre||'Sin proveedor'} · {r.fecha.split('-').reverse().join('/')}
                  </option>
                ))}
              </select>
              {form.remito_vinculado_id && (
                <p className="text-[11px] text-blue-700 mt-1.5">
                  ✓ El stock ya fue cargado con ese remito. Esta factura queda solo como respaldo fiscal, no vuelve a tocar el stock.
                </p>
              )}
            </Field>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Fecha">
              <Input type="date" value={form.fecha} onChange={e=>setForm(p=>({...p,fecha:e.target.value}))}/>
            </Field>
            <Field label="Proveedor">
              <div className="flex gap-2">
                <Select value={form.proveedor_id} onChange={e=>setForm(p=>({...p,proveedor_id:e.target.value}))}>
                  <option value="">Seleccionar…</option>
                  {proveedores.map(p=><option key={p.id} value={p.id}>{p.nombre}</option>)}
                </Select>
                <button type="button" onClick={()=>setProvModal(true)} style={{...btnBlue, padding:'9px 12px', whiteSpace:'nowrap'}}>+ Nuevo</button>
              </div>
            </Field>
          </div>

          {/* Ítems */}
          <div className="border-t border-p-line2 pt-3">
            <label className="block text-[11px] font-semibold text-p-ink2 uppercase tracking-wider mb-2">
              Ítems {editandoItemIdx !== null && <span className="text-blue-600 font-normal">— editando ítem #{editandoItemIdx+1}</span>}
            </label>
            <div className="grid grid-cols-12 gap-2 mb-2">
              <div className="col-span-6 relative">
                <Input value={itemForm.d} onChange={e=>buscarItemArticulo(e.target.value)} placeholder="Descripción / código"/>
                {itemArticuloSugs.length > 0 && (
                  <div className="absolute z-20 top-full left-0 right-0 bg-white border border-p-line rounded-xl shadow-xl max-h-48 overflow-y-auto mt-1">
                    {itemArticuloSugs.map((a:any) => (
                      <button key={a.id} type="button" onClick={()=>elegirItemArticulo(a)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-p-light border-b border-p-line2 last:border-0">
                        <p className="font-medium text-p-ink">{a.descripcion}</p>
                        <p className="text-[10px] font-mono text-p-ink2">{a.sku_interno}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="col-span-2">
                <Input type="number" value={itemForm.c} onChange={e=>setItemForm(p=>({...p,c:e.target.value}))} placeholder="Cant."/>
              </div>
              <div className="col-span-3">
                <Input value={itemForm.p} onChange={e=>setItemForm(p=>({...p,p:e.target.value}))} placeholder="$ precio unit. (con decimales)"/>
              </div>
              <button onClick={addItem} style={{...btnSm,padding:'9px 8px',fontSize:12,background:editandoItemIdx!==null?'#1d4ed8':undefined}} className="col-span-1">
                {editandoItemIdx!==null ? '✓' : '+'}
              </button>
            </div>
            {itemArticuloSel ? (
              <p className="text-[11px] text-p-green font-semibold mb-2">✓ Vinculado al artículo del catálogo maestro ({itemArticuloSel.descripcion})</p>
            ) : itemForm.d.trim().length >= 2 ? (
              <p className="text-[11px] text-amber-600 mb-2">⚠ Sin coincidencia con el catálogo — el ítem se va a guardar solo con esta descripción</p>
            ) : null}
            {editandoItemIdx !== null && (
              <button onClick={()=>{setEditandoItemIdx(null);setItemForm({d:'',c:'1',p:''});setItemArticuloSel(null)}}
                className="text-[11px] text-p-ink2 underline mb-2">Cancelar edición</button>
            )}
            {items.map((it,i)=>(
              <div key={i} className="flex items-center gap-2 py-1.5 border-b border-p-line2 text-sm">
                {it.articulo_id && <span className="text-[10px] text-p-green font-bold shrink-0">🔗</span>}
                <span className="flex-1 truncate">{it.d}</span>
                <span className="text-p-ink2 shrink-0">×{it.c}</span>
                <span className="font-mono font-bold shrink-0">{moneyARS(it.p)}</span>
                <span className="font-mono text-p-green font-bold shrink-0">{moneyARS(it.c*it.p)}</span>
                <button onClick={()=>{
                  setEditandoItemIdx(i)
                  setItemForm({ d: it.d, c: String(it.c), p: String(it.p) })
                  setItemArticuloSel(it.articulo_id ? { id: it.articulo_id, descripcion: it.d } : null)
                }} className="text-blue-500 text-xs shrink-0">✏</button>
                <button onClick={()=>setItems(prev=>prev.filter((_,j)=>j!==i))} className="text-red-400 text-xs shrink-0">✕</button>
              </div>
            ))}
          </div>

          {/* Descuento del proveedor */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Descuento (%)">
              <Input type="number" value={form.descuento_pct}
                onChange={e=>{ setDescuentoTocadoAMano(true); setForm(p=>({...p,descuento_pct:e.target.value})) }}
                placeholder="0"/>
            </Field>
            <Field label="Descuento ($)">
              <div className="border border-p-line rounded-lg px-3 py-2 text-sm bg-p-light text-p-ink2 font-mono">
                {moneyARS(descuentoMonto)}
              </div>
            </Field>
          </div>

          {/* Totales */}
          <div className="bg-p-light rounded-xl p-3 flex flex-col gap-1.5">
            <div className="flex justify-between text-sm text-p-ink2"><span>Subtotal ítems</span><span className="font-mono">{moneyARS(netoItems)}</span></div>
            {descuentoMonto > 0 && (
              <div className="flex justify-between text-sm text-red-600"><span>Descuento ({descuentoPct}%)</span><span className="font-mono">−{moneyARS(descuentoMonto)}</span></div>
            )}
            <label className="flex items-center gap-2 text-sm cursor-pointer mt-1">
              <input type="checkbox" checked={ivaOn} onChange={e=>setIvaOn(e.target.checked)} className="accent-p-green"/>
              Incluir IVA 21%
            </label>
            {ivaOn && <div className="flex justify-between text-sm text-p-ink2"><span>IVA 21%</span><span className="font-mono">{moneyARS(iva)}</span></div>}

            <div className="border-t border-p-line my-1"/>

            <div className="grid grid-cols-2 gap-2">
              <Field label="Flete">
                <Input type="number" value={form.flete} onChange={e=>setForm(p=>({...p,flete:e.target.value}))} placeholder="0"/>
              </Field>
              <div></div>
              <Field label="Ret. IVA">
                <Input type="number" value={form.ret_iva} onChange={e=>setForm(p=>({...p,ret_iva:e.target.value}))} placeholder="0"/>
              </Field>
              <Field label="Ret. Ganancias">
                <Input type="number" value={form.ret_ganancias} onChange={e=>setForm(p=>({...p,ret_ganancias:e.target.value}))} placeholder="0"/>
              </Field>
              <Field label="Ret. IIBB">
                <Input type="number" value={form.ret_iibb} onChange={e=>setForm(p=>({...p,ret_iibb:e.target.value}))} placeholder="0"/>
              </Field>
              <Field label="Ajuste (redondeo)">
                <Input type="number" value={ajusteManual} onChange={e=>setAjusteManual(e.target.value)} placeholder="±0"/>
              </Field>
            </div>

            {flete > 0 && <div className="flex justify-between text-sm text-p-ink2"><span>Flete</span><span className="font-mono">+{moneyARS(flete)}</span></div>}
            {totalRetenciones > 0 && <div className="flex justify-between text-sm text-red-600"><span>Retenciones</span><span className="font-mono">−{moneyARS(totalRetenciones)}</span></div>}
            {ajuste !== 0 && <div className="flex justify-between text-sm text-p-ink2"><span>Ajuste</span><span className="font-mono">{ajuste>0?'+':''}{moneyARS(ajuste)}</span></div>}

            <div className="flex justify-between font-saira font-bold text-lg border-t border-p-line mt-1 pt-1">
              <span>TOTAL A PAGAR</span><span>{moneyARS(total)}</span>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={form.afecta_stock} onChange={e=>setForm(p=>({...p,afecta_stock:e.target.checked}))} className="accent-p-green"/>
            Este comprobante afecta el stock (carga mercadería al inventario)
          </label>
          {form.afecta_stock && (
            <p className="text-[11px] text-p-ink2 -mt-1">
              Al guardar, vas a poder vincular cada ítem con su artículo en stock desde el listado.
            </p>
          )}

          <Field label="Notas">
            <Input value={form.notas} onChange={e=>setForm(p=>({...p,notas:e.target.value}))} placeholder="Observaciones…"/>
          </Field>

          <div className="flex justify-end gap-2 pt-1">
            <button onClick={()=>setOpen(false)} style={btnGray}>Cancelar</button>
            <button onClick={save} style={btn}>✓ Guardar</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}