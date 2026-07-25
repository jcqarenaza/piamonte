'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Modal, Field, Input, Select, Empty } from '@/components/ui'
import { moneyARS2 as moneyARS, moneyARS2, todayStr } from '@/lib/utils/format'
import { buscarCatalogo } from '@/lib/utils/buscarCatalogo'
import { ChequeFields, EMPTY_CHEQUE, type ChequeData } from '@/components/cheques/ChequeFields'

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
interface Item { d:string; c:number; p:number; articulo_id?:string|null; dto?:number|null }
interface Comprobante {
  id:string; tipo:string; letra:string|null; punto_venta:string|null; numero:string|null
  fecha:string; proveedor_id:string|null; proveedor_nombre:string|null
  items:Item[]; neto:number; iva:number; total:number
  cae:string|null; cae_vencimiento:string|null; remito_id:string|null
  descuento_pct:number|null; descuento_monto:number|null; flete:number|null
  ret_iva:number|null; ret_ganancias:number|null; ret_iibb:number|null; ajuste_redondeo:number|null
  estado:string; afecta_stock:boolean; notas:string|null; created_at:string; es_contado?:boolean; saldado?:boolean
}

export default function ComprasClient() {
  const [comprobantes, setComprobantes] = useState<Comprobante[]>([])
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [open, setOpen] = useState(false)
  const [editId, setEditId] = useState<string|null>(null)
  const [loading, setLoading] = useState(false)
  const [filtroTipo, setFiltroTipo] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('')
  const [expandido, setExpandido] = useState<string|null>(null)
  const [verComp, setVerComp] = useState<Comprobante|null>(null)
  const [ivaOn, setIvaOn] = useState(true)
  const [periodosCerrados, setPeriodosCerrados] = useState<string[]>([])

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
  const [catDescMap, setCatDescMap] = useState<Record<string,string>>({})
  const [detailDescMap, setDetailDescMap] = useState<Record<string,string>>({})

  // Informe de comparación: lo que se pagó en la factura vs. el costo vigente en las listas de precios
  const [compararModal, setCompararModal] = useState<Comprobante|null>(null)
  const [comparacion, setComparacion] = useState<any[]>([])
  const [comparando, setComparando] = useState(false)

  const [form, setForm] = useState({
    tipo:'factura', letra:'A', punto_venta:'0001', numero:'', fecha:todayStr(),
    proveedor_id:'', proveedor_nombre:'', notas:'', afecta_stock:true,
    cae:'', cae_vencimiento:'', remito_vinculado_id:'',
    descuento_pct:'', flete:'', ret_iva:'', ret_ganancias:'', ret_iibb:'',
    forma_pago:'cuenta_corriente' as 'cuenta_corriente'|'contado',
  })
  const [formaPagoModal, setFormaPagoModal] = useState(false)
  const [formPagoContado, setFormPagoContado] = useState({ forma_pago:'Efectivo', monto:'', fecha:todayStr() })
  const [chequeContado, setChequeContado] = useState<ChequeData>(EMPTY_CHEQUE)
  const [descuentoTocadoAMano, setDescuentoTocadoAMano] = useState(false)
  const [items, setItems] = useState<Item[]>([])
  const [itemForm, setItemForm] = useState({ d:'', c:'1', p:'', dto:'', codigo:'' })
  const [editandoItemIdx, setEditandoItemIdx] = useState<number|null>(null)
  const [itemArticuloSel, setItemArticuloSel] = useState<{id:string;descripcion:string}|null>(null)
  const [itemArticuloSugs, setItemArticuloSugs] = useState<any[]>([])
  const searchRef = useRef<HTMLInputElement>(null) // para auto-focus tras agregar ítem
  // Overrides manuales para subtotal, descuento, IVA (manejo de diferencias de redondeo)
  const [ovSubtotal, setOvSubtotal] = useState<string>('')
  const [ovDescuento, setOvDescuento] = useState<string>('')
  const [ovIva, setOvIva] = useState<string>('')

  // Pendientes NC del proveedor seleccionado
  const [pendientesNC, setPendientesNC] = useState<any[]>([])
  const [pendientesSelNC, setPendientesSelNC] = useState<Record<string,boolean>>({})

  const supabase = createClient()

  // Cadena de cálculo: Subtotal ítems → Descuento proveedor → +IVA (mercadería+flete) → +Neto flete → −Retenciones → ±Ajuste
  // El flete no lleva descuento pero SÍ lleva IVA 21%
  const itemsSinFlete = items.filter(it => it.d.trim().toUpperCase() !== 'FLETE')
  const itemsFlete    = items.filter(it => it.d.trim().toUpperCase() === 'FLETE')
  const netoItems = itemsSinFlete.reduce((a,it) => {
    const bruto = it.c * it.p
    const desc  = it.dto ? Math.round(bruto * it.dto * 100) / 10000 : 0
    return a + bruto - desc
  }, 0)
  const netoFlete = itemsFlete.reduce((a,it) => a + it.c * it.p, 0)
  const descuentoItemsTotal = itemsSinFlete.reduce((a,it) => {
    const bruto = it.c * it.p
    return a + (it.dto ? Math.round(bruto * it.dto * 100) / 10000 : 0)
  }, 0)
  const descuentoPct = parseFloat(form.descuento_pct.replace(',','.')) || 0
  const descuentoMonto = Math.round(netoItems * descuentoPct * 100) / 10000
  const calcSubtotal = netoItems - descuentoMonto  // sin flete — el flete va separado
  const calcDescuento = descuentoMonto
  // IVA total = IVA sobre mercadería + IVA sobre flete (ambos 21%)
  const calcIvaItems = ivaOn ? Math.round(calcSubtotal * IVA * 100) / 100 : 0
  const calcIvaFlete = ivaOn ? Math.round(netoFlete * IVA * 100) / 100 : 0
  const calcIva = calcIvaItems + calcIvaFlete
  // Valores finales: override manual si el usuario lo editó, sino el calculado
  const finalSubtotal  = ovSubtotal  !== '' ? parseFloat(ovSubtotal.replace(',','.'))  || calcSubtotal  : calcSubtotal
  const finalDescuento = ovDescuento !== '' ? parseFloat(ovDescuento.replace(',','.')) || calcDescuento : calcDescuento
  const finalIva       = ovIva       !== '' ? parseFloat(ovIva.replace(',','.'))       || calcIva       : calcIva
  const iva = finalIva
  const flete = netoFlete  // el flete viene de los ítems, no del campo form.flete
  const retIva = parseFloat(form.ret_iva.replace(',','.')) || 0
  const retGanancias = parseFloat(form.ret_ganancias.replace(',','.')) || 0
  const retIibb = parseFloat(form.ret_iibb.replace(',','.')) || 0
  const totalRetenciones = retIva + retGanancias + retIibb
  const [ajusteManual, setAjusteManual] = useState('')
  const ajuste = parseFloat(ajusteManual.replace(',','.')) || 0
  const neto  = finalSubtotal + netoFlete  // neto incluye flete sin IVA
  const total = Math.round((finalSubtotal + netoFlete + finalIva - totalRetenciones + ajuste) * 100) / 100

  const loadProveedores = useCallback(async () => {
    const { data } = await supabase.from('proveedores_compra').select('id,nombre,razon_social,cuit,descuento_pct').eq('activo',true).order('nombre')
    setProveedores(data ?? [])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function load() {
    setLoading(true)
    const [{ data }, { data: periodos }] = await Promise.all([
      supabase.from('comprobantes_compra')
        .select('*').order('fecha', {ascending:false}).order('created_at',{ascending:false}).limit(200),
      supabase.from('periodos_fiscales').select('periodo').eq('cerrado', true)
    ])
    setComprobantes(data ?? [])
    setPeriodosCerrados((periodos ?? []).map((p:any) => p.periodo))
    setLoading(false)
  }

  function periodoCerrado(fecha: string) {
    const periodo = fecha?.slice(0, 7) // YYYY-MM
    return periodosCerrados.includes(periodo)
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
    const dtoStr = prov?.descuento_pct ? String(prov.descuento_pct) : ''
    setForm(p => ({ ...p, descuento_pct: dtoStr }))
    setItemForm(p => ({ ...p, dto: dtoStr }))
    if (prov?.descuento_pct) {
      const pct = prov.descuento_pct
      setItems(prev => prev.map(it => it.dto != null ? it : { ...it, dto: pct }))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.proveedor_id, descuentoTocadoAMano])

  // Buscar en el catálogo maestro de artículos a medida que se tipea la descripción del ítem —
  // mismo criterio que ya usa Stock, para que Compras también quede vinculado al SKU.
  async function buscarItemArticulo(texto: string) {
    setItemForm(p => ({ ...p, d: texto }))
    setItemArticuloSel(null)
    if (texto.trim().length < 2) { setItemArticuloSugs([]); return }

    // Si parece código Pilkington (6+ dígitos + letras, sin espacios), guardarlo en codigo
    const esCodigo = /^\d{6}[A-Z0-9]{0,6}$/i.test(texto.trim())
    if (esCodigo) {
      const codigoUpper = texto.trim().toUpperCase()
      setItemForm(p => ({ ...p, codigo: codigoUpper }))
    }

    const provNombre = proveedores.find(p=>p.id===form.proveedor_id)?.nombre || undefined
    const resultados = await buscarCatalogo(supabase, texto, { incluirStock: false, limit: 8, proveedor: provNombre })
    setItemArticuloSugs(resultados)

    // Si es código y no encontró resultados exactos, buscar descripción por código base (9 chars)
    if (esCodigo && resultados.length === 0 && texto.trim().length >= 6) {
      const codigoBase = texto.trim().slice(0, 9)
      const { data } = await supabase.from('catalogo')
        .select('descripcion,codigo').ilike('codigo', `${codigoBase}%`).limit(1).maybeSingle()
      if (data?.descripcion) {
        setItemForm(p => ({ ...p, d: data.descripcion, codigo: texto.trim().toUpperCase() }))
      }
    }
  }

  function elegirItemArticulo(a: any) {
    setItemArticuloSel(a)
    // Pre-cargar el precio de LISTA del catálogo (sin descuento) — el descuento se aplica por separado
    const precioBase = a.precio_lista || a.costo_neto || ''
    setItemForm(p => ({ ...p, d: a.descripcion, p: precioBase ? String(precioBase) : p.p, codigo: a.codigo || '' }))
    setItemArticuloSugs([])
  }

  async function addItem() {
    const p = parseFloat(itemForm.p.replace(/[^0-9.,]/g,'').replace(',','.'))
    const c = parseInt(itemForm.c)
    if (!itemForm.d || !p || !c) return
    const dto = parseFloat(itemForm.dto) || null

    // Si no hay articulo_id del catálogo pero hay código, buscar maestro por código base (9 chars)
    let articuloId = itemArticuloSel?.id || null
    if (!articuloId && itemForm.codigo && itemForm.codigo.length >= 6) {
      const codigoBase = itemForm.codigo.slice(0, 9)
      const { data: maestro } = await supabase.from('articulos_maestro')
        .select('id').ilike('codigo_referencia', `${codigoBase}%`).limit(1).maybeSingle()
      if (maestro) articuloId = maestro.id
    }

    const nuevoItemData: Item = { d:itemForm.d, c, p, articulo_id: articuloId, dto, ...(itemForm.codigo?{codigo:itemForm.codigo}:{}) }
    if (editandoItemIdx !== null) {
      setItems(prev => prev.map((it,i) => i===editandoItemIdx ? nuevoItemData : it))
      setEditandoItemIdx(null)
    } else {
      setItems(prev=>[...prev, nuevoItemData])
    }
    setItemForm(p=>({d:'',c:'1',p:'',dto:p.dto,codigo:''}))
    setItemArticuloSel(null)
    setItemArticuloSugs([])
    setOvSubtotal(''); setOvDescuento(''); setOvIva('')
    setTimeout(() => searchRef.current?.focus(), 50)
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

  // esContado=true → la factura no entra a la cuenta corriente del proveedor (lo maneja el trigger
  // en Supabase mirando comprobantes_compra.es_contado) y además se registra el egreso en Caja/Gastos.
  async function save(esContado: boolean = false, pagoContado?: {forma_pago:string; monto:string; fecha:string}) {
    if (!items.length && total === 0) return
    const prov = proveedores.find(p=>p.id===form.proveedor_id)

    // Si es edición, hacer update y salir
    if (editId) {
      await supabase.from('comprobantes_compra').update({
        tipo: form.tipo, letra: form.letra||null,
        punto_venta: form.punto_venta||null, numero: form.numero||null,
        fecha: form.fecha, proveedor_id: form.proveedor_id||null,
        proveedor_nombre: prov?.nombre || form.proveedor_nombre || null,
        items, neto, iva_pct: IVA, iva, total,
        descuento_pct: descuentoPct||0, descuento_monto: descuentoMonto||0,
        flete: flete||0, ret_iva: retIva||0, ret_ganancias: retGanancias||0, ret_iibb: retIibb||0,
        ajuste_redondeo: ajuste||0,
        notas: form.notas||null,
        estado: 'pendiente',
        afecta_stock: form.afecta_stock,
      }).eq('id', editId)
      setEditId(null); setOpen(false); setItems([]); load()
      return
    }

    // Validar duplicado: mismo proveedor + letra + punto_venta + número
    if (form.tipo==='factura' && form.proveedor_id && form.numero && form.punto_venta) {
      const { data: dup } = await supabase.from('comprobantes_compra')
        .select('id,fecha').eq('proveedor_id', form.proveedor_id)
        .eq('letra', form.letra||'A').eq('punto_venta', form.punto_venta).eq('numero', form.numero)
        .maybeSingle()
      if (dup) {
        alert(`⚠ Ya existe una factura ${form.letra} ${form.punto_venta}-${form.numero} de este proveedor (cargada el ${dup.fecha.split('-').reverse().join('/')}). No se puede duplicar.`)
        return
      }
    }
    // Si la factura está vinculada a un remito ya recibido, ese remito ya sumó el stock —
    // la factura no debe volver a tocarlo, solo queda de respaldo fiscal.
    const tieneRemitoVinculado = form.tipo==='factura' && !!form.remito_vinculado_id
    const { data: comp } = await supabase.from('comprobantes_compra').insert({
      tipo: form.tipo, letra: form.letra||null,
      punto_venta: form.punto_venta||null, numero: form.numero||null,
      fecha: form.fecha, proveedor_id: form.proveedor_id||null,
      proveedor_nombre: prov?.nombre || form.proveedor_nombre || null,
      items, neto, iva_pct: IVA, iva, total,
      descuento_pct: descuentoPct||0, descuento_monto: descuentoMonto||0,
      flete: flete||0, ret_iva: retIva||0, ret_ganancias: retGanancias||0, ret_iibb: retIibb||0,
      ajuste_redondeo: ajuste||0,
      cae: ['factura','nc'].includes(form.tipo) ? (form.cae||null) : null,
      cae_vencimiento: ['factura','nc'].includes(form.tipo) ? (form.cae_vencimiento||null) : null,
      remito_id: tieneRemitoVinculado ? form.remito_vinculado_id : null,
      estado: 'pendiente', afecta_stock: tieneRemitoVinculado ? false : form.afecta_stock,
      notas: form.notas||null,
      es_contado: esContado,
    }).select('id,numero,letra,punto_venta').single()
    // Si vinculamos un remito, lo marcamos como facturado para que no aparezca disponible para vincular de nuevo
    if (tieneRemitoVinculado) {
      await supabase.from('comprobantes_compra').update({ notas: 'Facturado' }).eq('id', form.remito_vinculado_id)
    }
    // Pago al contado → se registra como gasto del día en Caja, no genera deuda con el proveedor
    if (esContado && pagoContado && comp) {
      const numeroFmt = `${comp.letra||''}${comp.punto_venta||''}-${comp.numero||''}`
      await supabase.from('gastos').insert({
        fecha: pagoContado.fecha || todayStr(),
        categoria: 'Pago a proveedor',
        descripcion: `Factura ${numeroFmt} — ${prov?.nombre || form.proveedor_nombre || ''}`,
        monto: parseFloat(pagoContado.monto.replace(',','.')) || total,
        forma_pago: pagoContado.forma_pago,
        comprobante: numeroFmt,
      })
      // Si pagó con cheque, registrarlo en el libro de cheques como cheque propio
      if (pagoContado.forma_pago === 'Cheque' && (pagoContado as any).cheque?.numero) {
        const ch = (pagoContado as any).cheque as ChequeData
        await supabase.from('cheques').insert({
          tipo: 'propio', formato: ch.formato, modalidad: ch.modalidad,
          numero: ch.numero, banco: ch.banco,
          fecha_emision: pagoContado.fecha || todayStr(),
          fecha_cobro: ch.modalidad === 'al_dia' ? (pagoContado.fecha || todayStr()) : ch.fecha_cobro,
          monto: parseFloat(pagoContado.monto.replace(',','.')) || total,
          contraparte: prov?.nombre || form.proveedor_nombre || null,
          estado: 'emitido',
          notas: `Pago factura ${numeroFmt}`,
          comprobante_compra_id: (comp as any).id || null,
        })
      }
    }
    setOpen(false)
    setFormaPagoModal(false)

    // Actualizar costo en stock/catálogo para los ítems de la factura
    // costo = precio_lista × (1 - dto%) — lo que realmente pagamos
    if (form.tipo === 'factura') {
      const alertas: string[] = []
      for (const it of items) {
        if (it.d.trim().toUpperCase() === 'FLETE') continue
        const dtoPct = (it.dto ?? descuentoPct) / 100
        const costoNuevo = Math.round(it.p * (1 - dtoPct))
        if (!costoNuevo) continue

        // Buscar stock por código — también buscar en catálogo si el campo d tiene el código
        const codigo = (it as any).codigo || (it.d && it.d.match(/^[0-9]{6}[A-Z]/i) ? it.d.trim() : null)
        let stockMatch: any = null
        if (codigo) {
          const { data } = await supabase.from('stock').select('id,costo,descripcion').eq('codigo', codigo).maybeSingle()
          stockMatch = data
          // Si no está en stock, buscar descripción en catálogo para crear correctamente
          if (!stockMatch) {
            const { data: cat } = await supabase.from('catalogo')
              .select('descripcion,costo_neto').eq('codigo', codigo).is('lista_nombre', null).limit(1).maybeSingle()
            if (cat) it.d = cat.descripcion // usar descripción del catálogo
          }
        }
        if (!stockMatch && it.d && !it.d.match(/^[0-9]{6}[A-Z]/i)) {
          // NO buscar por descripción — solo por código exacto para evitar falsos matches
        }

        if (stockMatch) {
          // Alerta si difiere más del 5%
          if (stockMatch.costo && Math.abs(costoNuevo - stockMatch.costo) / stockMatch.costo > 0.05) {
            alertas.push(`${it.d.slice(0,40)}: costo anterior $${Math.round(stockMatch.costo).toLocaleString('es-AR')} → nuevo $${costoNuevo.toLocaleString('es-AR')}`)
          }
          await supabase.from('stock').update({ costo: costoNuevo }).eq('id', stockMatch.id)
        }

        // También actualizar catalogo.costo_neto si hay código
        if (codigo) {
          await supabase.from('catalogo').update({ costo_neto: costoNuevo }).eq('codigo', codigo)
        }
      }
      if (alertas.length > 0) {
        alert(`⚠ Diferencia de precio en ${alertas.length} artículo(s):\n\n${alertas.join('\n')}\n\nSe actualizó el costo. Si hay error, reclamá al proveedor.`)
      }
    }

    // Al cargar factura con afecta_stock: crear artículos en stock como "pendiente de ingreso"
    // La cantidad real se suma cuando confirman la llegada de mercadería (botón Cargar a stock)
    if (comp && form.tipo === 'factura' && form.afecta_stock && !tieneRemitoVinculado) {
      const numFact = `${comp.letra||''}${comp.punto_venta||''}-${comp.numero||''}`
      const itemsActualizados = [...items]

      for (let idx = 0; idx < items.length; idx++) {
        const it = items[idx]
        if ((it.d||'').toUpperCase().trim() === 'FLETE' || (it as any).codigo === 'FL') continue

        const codigo = (it as any).codigo || null
        const dtoPct = (it.dto ?? descuentoPct) / 100
        const costoUnit = Math.round(it.p * (1 - dtoPct) * 100) / 100

        // Resolver articulo_id
        let articuloId: string | null = (it as any).articulo_id || null
        if (!articuloId && codigo) {
          const { data: eq } = await supabase.from('articulo_equivalencias')
            .select('articulo_id').eq('codigo_proveedor', codigo).maybeSingle()
          articuloId = eq?.articulo_id || null
        }

        if (!codigo && !articuloId) continue

        // Buscar fila de stock existente
        let stockRow: any = null
        if (codigo) {
          const { data } = await supabase.from('stock').select('id,cantidad,articulo_id,codigo,pendiente_ingreso').eq('codigo', codigo).eq('activo', true).maybeSingle()
          stockRow = data
        }
        if (!stockRow && articuloId) {
          const { data } = await supabase.from('stock').select('id,cantidad,articulo_id,codigo,pendiente_ingreso').eq('articulo_id', articuloId).eq('activo', true).maybeSingle()
          // Solo reutilizar si el código es el mismo — si el código es distinto, crear uno nuevo
          if (data && data.codigo === codigo) stockRow = data
        }

        if (stockRow) {
          // Ya existe — actualizar costo y marcar pendiente de ingreso (no suma cantidad todavía)
          await supabase.from('stock').update({
            costo: costoUnit,
            articulo_id: stockRow.articulo_id || articuloId || null,
            pendiente_ingreso: true,
          }).eq('id', stockRow.id)
          itemsActualizados[idx] = { ...itemsActualizados[idx], stock_id: stockRow.id } as any
        } else {
          // Crear nueva fila de stock con cantidad 0 y pendiente_ingreso = true
          let desc = it.d
          if (codigo) {
            const { data: cat } = await supabase.from('catalogo').select('descripcion').eq('codigo', codigo).limit(1).maybeSingle()
            if (cat?.descripcion) desc = cat.descripcion
          }
          const codigoFinal = codigo || (articuloId ? `ART-${articuloId.slice(0,8)}` : null)
          const { data: newStock } = await supabase.from('stock').insert({
            codigo: codigoFinal, descripcion: desc, cantidad: 0,
            costo: costoUnit, precio_venta: 0,
            articulo_id: articuloId || null, activo: true,
            pendiente_ingreso: true,
          }).select('id').single()
          if (newStock) {
            itemsActualizados[idx] = { ...itemsActualizados[idx], stock_id: newStock.id } as any
          }
        }
      }

      // Guardar stock_ids y dejar como pendiente (no procesado — se procesa al confirmar llegada)
      await supabase.from('comprobantes_compra').update({
        items: itemsActualizados,
      }).eq('id', comp.id)

    } else if (comp) {
      await supabase.from('comprobantes_compra').update({ estado: 'procesado' }).eq('id', comp.id)
    }

    // NC de compra: solo acredita en CC del proveedor — el stock ya fue descontado
    // cuando se marcó "Roto / Devuelto" en el Ajustar de stock
    if (comp && form.tipo === 'nc') {
      const numNc = `${comp.letra||''}${comp.punto_venta||''}-${comp.numero||''}`
      const provNombre = prov?.nombre || form.proveedor_nombre || ''
      const provId = prov?.id || form.proveedor_id || null

      // CC del proveedor: lo inserta automáticamente el trigger trg_cargo_cc_proveedores
      // al hacer el INSERT en comprobantes_compra — NO insertar acá para evitar duplicados

      // Saldar los pendientes según la cantidad real cargada en el ítem
      const seleccionados = pendientesNC.filter((p:any) => pendientesSelNC[p.id])
      for (const pendiente of seleccionados) {
        const itemNC = items.find((it:any) => (it as any)._pendiente_id === pendiente.id)
        const cantSaldada = itemNC ? itemNC.c : pendiente.cantidad
        const cantRestante = pendiente.cantidad - cantSaldada

        if (cantRestante <= 0) {
          // Saldo total — reemplazar el ajuste por un movimiento de NC y borrar el ajuste
          await supabase.from('stock_movimientos')
            .delete()
            .eq('stock_id', pendiente.stock_id)
            .eq('pendiente_nc', true)
          await supabase.from('ajustes_stock')
            .delete()
            .eq('id', pendiente.id)
          // Insertar movimiento de NC (siempre, independiente de si existía pendiente_nc)
          await supabase.from('stock_movimientos').insert({
            stock_id: pendiente.stock_id,
            tipo: 'salida',
            cantidad: cantSaldada,
            fecha: form.fecha || todayStr(),
            descripcion: `NC ${numNc} · ${provNombre}`,
            pendiente_nc: false,
            comprobante_compra_id: comp.id,
          })
        } else {
          // Saldo parcial — reducir el ajuste y agregar movimiento de NC
          await supabase.from('ajustes_stock')
            .update({
              cantidad: cantRestante,
              nota: `${pendiente.nota||'Roto'} — quedan ${cantRestante}u`,
            })
            .eq('id', pendiente.id)
          await supabase.from('stock_movimientos')
            .update({
              cantidad: cantRestante,
              descripcion: `${pendiente.nota||'Roto'} — quedan ${cantRestante}u`,
            })
            .eq('stock_id', pendiente.stock_id)
            .eq('pendiente_nc', true)
          // Insertar movimiento de NC por la cantidad saldada
          await supabase.from('stock_movimientos').insert({
            stock_id: pendiente.stock_id,
            tipo: 'salida',
            cantidad: cantSaldada,
            fecha: form.fecha || todayStr(),
            descripcion: `NC ${numNc} · ${provNombre}`,
            pendiente_nc: false,
            comprobante_compra_id: comp.id,
          })
        }
      }

      await supabase.from('comprobantes_compra').update({ estado: 'procesado' }).eq('id', comp.id)
    }
    // Los costos del catálogo se actualizan solo desde el importador de listas, no desde facturas

    setForm({tipo:'factura',letra:'A',punto_venta:'0001',numero:'',fecha:todayStr(),
      proveedor_id:'',proveedor_nombre:'',notas:'',afecta_stock:true,cae:'',cae_vencimiento:'',remito_vinculado_id:'',
      descuento_pct:'',flete:'',ret_iva:'',ret_ganancias:'',ret_iibb:'', forma_pago:'cuenta_corriente'})
    setFormPagoContado({ forma_pago:'Efectivo', monto:'', fecha:todayStr() })
    setChequeContado(EMPTY_CHEQUE)
    setDescuentoTocadoAMano(false)
    setAjusteManual('')
    setItems([]); setIvaOn(true)
    setItemForm({d:'',c:'1',p:'',dto:'',codigo:''})
    setPendientesNC([]); setPendientesSelNC({})
    load()
  }

  // Click en "Guardar": si es factura al contado, primero pide los datos del pago.
  function abrirGuardado() {
    if (!items.length && total === 0) return
    if (form.tipo === 'factura' && form.forma_pago === 'contado') {
      setFormPagoContado({ forma_pago:'Efectivo', monto:String(total), fecha: form.fecha || todayStr() })
      setFormaPagoModal(true)
    } else {
      save(false)
    }
  }

  // Abre el modal de vinculación a stock — funciona para remitos Y para facturas con afecta_stock
  async function abrirVinculacion(c:Comprobante) {
    setRemitoModal(c)
    // Cargar descripciones del catálogo para los códigos de esta factura
    const codigos = c.items.map(it => (it as any).codigo || (/^[0-9]{6}[A-Z]/i.test((it.d||'').trim()) ? it.d.trim() : null)).filter(Boolean)
    if (codigos.length) {
      const { data: catRows } = await supabase.from('catalogo').select('codigo,descripcion').in('codigo', codigos).is('lista_nombre', null)
      const map: Record<string,string> = {}
      for (const r of catRows??[]) if (r.codigo && !map[r.codigo]) map[r.codigo] = r.descripcion
      setCatDescMap(map)
    }
    const init: Record<number,{stock_id:string;qty:number;costo:number}|null> = {}
    const initQ: Record<number,string> = {}
    c.items.forEach((it,i) => {
      // Código puede venir en campo codigo O en campo d si se cargó con el código como nombre
      const codigo = (it as any).codigo || (it.d && /^[0-9]{6}[A-Z]/i.test(it.d.trim()) ? it.d.trim() : null)
      const matchStock = codigo && codigo !== 'FL'
        ? stockItems.find(s => s.codigo === codigo)
        : null
      init[i] = matchStock ? { stock_id: matchStock.id, qty: it.c, costo: it.p } : null
      initQ[i] = matchStock ? matchStock.descripcion : ''
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
      pos: 'PARABRISAS',
      articulo_id: it.articulo_id || null,
    }).select('id,descripcion,codigo,cantidad').single()
    // Actualizar descripción en catálogo si tiene código
    if (n.codigo) {
      await supabase.from('catalogo').update({ descripcion: n.desc }).eq('codigo', n.codigo).is('lista_nombre', null)
    }
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

    // Construir items actualizados con stock_id del mapping para persistir en el JSONB
    const itemsActualizados = [...remitoModal.items]

    // Completar mapping con ítems que ya tienen stock_id en el JSONB pero no fueron vinculados manualmente
    const mappingCompleto: Record<number, {stock_id:string; qty:number; costo:number}|null> = { ...mappings }
    remitoModal.items.forEach((item: any, idx: number) => {
      if (mappingCompleto[idx]) return // ya está en el mapping manual
      const stockId = item.stock_id
      if (!stockId || item.d?.toUpperCase().trim() === 'FLETE') return
      mappingCompleto[idx] = { stock_id: stockId, qty: item.c, costo: item.p }
    })

    for (const [idxStr, map] of Object.entries(mappingCompleto)) {
      const idx = parseInt(idxStr)
      const item = remitoModal.items[idx]
      if (!map) continue

      const { data: st } = await supabase.from('stock').select('cantidad,articulo_id,pendiente_ingreso').eq('id', map.stock_id).maybeSingle()
      if (st) {
        const updatePayload: any = {
          cantidad: (st.cantidad||0) + map.qty,
          pendiente_ingreso: false,
        }
        if (!st.articulo_id && item.articulo_id) updatePayload.articulo_id = item.articulo_id
        await supabase.from('stock').update(updatePayload).eq('id', map.stock_id)
      }

      // Registrar en stock_movimientos sin descripcion hardcodeada —
      // la vista_movimientos_stock la construye automáticamente desde comprobante_compra_id
      await supabase.from('stock_movimientos').insert({
        stock_id: map.stock_id, tipo: 'entrada',
        cantidad: map.qty, costo_unitario: map.costo,
        fecha,
        comprobante_compra_id: remitoModal.id,
      })

      // Persistir stock_id en el JSONB del comprobante para que quede vinculado
      itemsActualizados[idx] = { ...itemsActualizados[idx], stock_id: map.stock_id } as any
    }

    // Guardar items actualizados con stock_id + marcar procesado
    await supabase.from('comprobantes_compra').update({
      estado: 'procesado',
      afecta_stock: true,
      items: itemsActualizados,
    }).eq('id', remitoModal.id)

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


  function editarComprobante(c: Comprobante) {
    setForm({
      tipo: c.tipo, letra: c.letra || 'A', punto_venta: c.punto_venta || '0001', numero: c.numero || '',
      fecha: c.fecha, proveedor_id: c.proveedor_id || '', proveedor_nombre: c.proveedor_nombre || '',
      notas: c.notas || '', afecta_stock: c.afecta_stock ?? false,
      cae: c.cae || '', cae_vencimiento: c.cae_vencimiento || '', remito_vinculado_id: '',
      descuento_pct: c.descuento_pct ? String(c.descuento_pct) : '',
      flete: c.flete ? String(c.flete) : '',
      ret_iva: c.ret_iva ? String(c.ret_iva) : '',
      ret_ganancias: c.ret_ganancias ? String(c.ret_ganancias) : '',
      ret_iibb: c.ret_iibb ? String(c.ret_iibb) : '',
      forma_pago: c.es_contado ? 'contado' : 'cuenta_corriente',
    })
    setItems(c.items.map((it: any) => ({
      d: it.d || '', c: it.c || 1, p: it.p || 0, dto: it.dto ?? null,
      codigo: it.codigo || '', articulo_id: it.articulo_id || null
    })))
    setEditId(c.id)
    setOpen(true)
  }

  async function eliminarComprobante(id: string) {
    const comp = comprobantes.find(c => c.id === id)
    if (!comp) return
    if (periodoCerrado(comp.fecha)) {
      alert(`⛔ No se puede eliminar — el período ${comp.fecha?.slice(0,7)} está cerrado fiscalmente.`)
      return
    }
    if (!confirm('¿Eliminar este comprobante de compra? Esta acción no se puede deshacer.')) return
    if (!confirm('¿Estás seguro? Se elimina permanentemente.')) return

    // Si afectó stock, revertir movimientos
    if (comp.afecta_stock && comp.estado === 'procesado') {
      const { data: movimientos } = await supabase.from('stock_movimientos')
        .select('id, stock_id, cantidad').eq('comprobante_compra_id', id)
      if (movimientos && movimientos.length > 0) {
        for (const mov of movimientos) {
          const { data: s } = await supabase.from('stock').select('cantidad').eq('id', mov.stock_id).maybeSingle()
          if (s) {
            await supabase.from('stock').update({ cantidad: Math.max(0, (s.cantidad || 0) - mov.cantidad) }).eq('id', mov.stock_id)
          }
        }
        await supabase.from('stock_movimientos').delete().eq('comprobante_compra_id', id)
      }
    }

    // Revertir CC del proveedor si generó cargo
    await supabase.from('cuenta_corriente_proveedores').delete().eq('comprobante_compra_id', id)

    await supabase.from('comprobantes_compra').delete().eq('id', id)
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
      if ((it.d||'').toUpperCase().trim() === 'FLETE') continue
      let candidatos: any[] = []
      const codigoItem = (it as any).codigo || null

      // 1. Buscar por articulo_id en equivalencias
      if (it.articulo_id) {
        const { data } = await supabase.from('articulo_equivalencias')
          .select('proveedor,costo_neto,lista_nombre,codigo_proveedor')
          .eq('articulo_id', it.articulo_id)
        candidatos = data ?? []
      }

      // 2. Si no encontró por articulo_id (o vino vacío), buscar por código en catálogo
      if (candidatos.length === 0 && codigoItem) {
        const { data } = await supabase.from('catalogo')
          .select('proveedor, costo_neto, precio_lista, codigo')
          .eq('codigo', codigoItem)
          .gt('costo_neto', 0).limit(10)
        if (data && data.length > 0) {
          const porProv = new Map<string,any>()
          for (const row of data) {
            if (!porProv.has(row.proveedor) || row.costo_neto < porProv.get(row.proveedor).costo_neto)
              porProv.set(row.proveedor, { proveedor: row.proveedor, costo_neto: row.costo_neto, lista_nombre: 'Catálogo', codigo_proveedor: row.codigo })
          }
          candidatos = [...porProv.values()]
        }
      }

      // 3. Si no, buscar por código base en catálogo (6 primeros dígitos)
      if (candidatos.length === 0 && codigoItem && /^[0-9]{6}[A-Z]/i.test(codigoItem)) {
        const codigoBase = codigoItem.replace(/[^0-9]/g,'').slice(0,6)
        const { data } = await supabase.from('catalogo')
          .select('proveedor, costo_neto, precio_lista, codigo')
          .ilike('codigo', `${codigoBase}%`)
          .gt('costo_neto', 0).limit(20)
        const porProv = new Map<string,any>()
        for (const row of (data??[])) {
          if (!porProv.has(row.proveedor) || row.costo_neto < porProv.get(row.proveedor).costo_neto)
            porProv.set(row.proveedor, { proveedor: row.proveedor, costo_neto: row.costo_neto, lista_nombre: 'Catálogo', codigo_proveedor: row.codigo })
        }
        candidatos = [...porProv.values()]
      }

      // 4. Búsqueda por descripción eliminada — solo matchear por código exacto
      // para evitar falsos positivos entre artículos con descripciones similares

      if (candidatos.length === 0) { resultados.push({ item: it, candidatos: [], sinMatch: true }); continue }

      const porProveedor = new Map<string, any>()
      for (const cand of candidatos) {
        const actual = porProveedor.get(cand.proveedor)
        if (!actual || cand.costo_neto < actual.costo_neto) porProveedor.set(cand.proveedor, cand)
      }
      const lista = [...porProveedor.values()].sort((a,b)=>a.costo_neto - b.costo_neto)

      // El precio del ítem: si tiene dto propio lo aplica, sino usa el dto del comprobante
      // Para Sekurit el precio ya viene como costo_neto (sin descuento adicional)
      const itemDto = (it as any).dto != null ? +(it as any).dto : null
      const compDto = c.descuento_pct ? +c.descuento_pct : 0
      const dtoPct = (itemDto !== null ? itemDto : compDto) / 100
      const precioNetoReal = Math.round(it.p * (1 - dtoPct) * 100) / 100

      const masBarato = lista[0]
      const diferencia = masBarato ? precioNetoReal - masBarato.costo_neto : null
      const diferenciaPct = masBarato && masBarato.costo_neto > 0 ? (diferencia! / masBarato.costo_neto) * 100 : null

      resultados.push({ item: it, candidatos: lista, sinMatch: lista.length === 0, diferencia, diferenciaPct, masBarato, precioNetoReal })
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

  const [filtroPendSaldar, setFiltroPendSaldar] = useState(false)
  const [tabCompras, setTabCompras] = useState<'comprobantes'|'pedidos'>('comprobantes')
  const filtradosFinal = filtroPendSaldar
    ? filtrados.filter(c => !c.saldado && !c.es_contado && c.tipo === 'factura')
    : filtrados

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

      {/* Tabs principales */}
      <div className="flex gap-1 mb-5 border-b border-p-line">
        {[{id:'comprobantes',label:'📄 Comprobantes'},{id:'pedidos',label:'📦 Pedidos'}].map(t=>(
          <button key={t.id} onClick={()=>setTabCompras(t.id as any)}
            className={`px-4 py-2.5 text-sm font-semibold rounded-t-xl transition-colors ${tabCompras===t.id?'bg-white border border-b-white border-p-line -mb-px text-p-green':'text-p-ink2 hover:text-p-ink'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tabCompras === 'pedidos' && (
        <ModuloPedidos supabase={supabase} proveedores={proveedores}/>
      )}

      {tabCompras === 'comprobantes' && (<>

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
        <button onClick={()=>setFiltroPendSaldar(v=>!v)}
          className={`border rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors shadow-sm ${filtroPendSaldar?'bg-amber-500 text-white border-amber-500':'bg-white text-p-ink border-p-line hover:border-amber-400'}`}>
          💳 Pendientes de saldar
        </button>
        <span className="text-sm text-p-ink2 ml-1">{filtradosFinal.length} comprobantes</span>
        <div className="ml-auto flex gap-2">
          <button onClick={()=>setProvModal(true)} style={btnGray}>+ Proveedor</button>
          <button onClick={()=>{
            setForm({tipo:'factura',letra:'A',punto_venta:'0001',numero:'',fecha:todayStr(),
              proveedor_id:'',proveedor_nombre:'',notas:'',afecta_stock:true,cae:'',cae_vencimiento:'',remito_vinculado_id:'',
              descuento_pct:'',flete:'',ret_iva:'',ret_ganancias:'',ret_iibb:'',forma_pago:'cuenta_corriente'})
            setItems([]); setIvaOn(true); setEditId(null)
            setItemForm({d:'',c:'1',p:'',dto:'',codigo:''})
            setDescuentoTocadoAMano(false); setAjusteManual('')
            setPendientesNC([]); setPendientesSelNC({})
            setOpen(true)
          }} style={btn}>+ Cargar comprobante</button>
        </div>
      </div>

      {/* Listado */}
      {loading ? <p className="text-sm text-p-gray text-center py-10">Cargando…</p> :
       filtradosFinal.length === 0 ? <Empty msg="Sin comprobantes de compra." /> : (
        <div className="flex flex-col gap-2">
          {filtradosFinal.map(c=>(
            <div key={c.id}
              onClick={()=>setExpandido(p=>p===c.id?null:c.id)}
              onDoubleClick={()=>setVerComp(c)} title="Click para opciones · doble click para ver el detalle"
              className={`bg-white border border-p-line rounded-xl shadow-sm cursor-pointer hover:border-p-green transition-colors overflow-hidden ${c.estado==='anulado'?'opacity-50':''}`}>
              <div className="flex items-center gap-2.5 px-3.5 py-2.5 flex-wrap">
                <span className="text-[10px] font-bold px-2.5 py-1 rounded-full text-white shrink-0"
                  style={{background:TIPO_COLOR[c.tipo]||'#6b7280'}}>
                  {tipoIcon(c.tipo)} {tipoLabel(c.tipo)}
                </span>
                <span className="font-mono font-bold text-sm text-p-dark shrink-0">{numComp(c)}</span>
                <span className="text-sm font-semibold text-p-ink truncate" style={{maxWidth:180}}>{c.proveedor_nombre||'Sin proveedor'}</span>
                <span className="text-xs text-p-ink2 shrink-0">{c.fecha.split('-').reverse().join('/')}</span>
                {c.cae && <span className="text-[10px] font-mono bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full shrink-0">CAE</span>}
                {c.tipo==='factura' && (
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${c.es_contado?'bg-blue-50 text-blue-700':'bg-amber-50 text-amber-700'}`}>
                    {c.es_contado ? '💵 Contado' : '📒 Cta. Cte.'}
                  </span>
                )}
                {(c.tipo==='factura'||c.tipo==='nc') && !c.es_contado && c.saldado && (
                  <span className="text-[10px] font-bold bg-green-50 text-green-700 px-2 py-0.5 rounded-full shrink-0">✓ Saldada</span>
                )}
                {c.remito_id && <span className="text-[10px] font-bold bg-green-50 text-green-700 px-2 py-0.5 rounded-full shrink-0">📦 Stock OK</span>}
                <div className="flex-1 min-w-[8px]"/>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                  c.estado==='procesado'?'bg-green-100 text-green-700':
                  c.estado==='anulado'?'bg-gray-100 text-gray-500':'bg-amber-100 text-amber-700'
                }`}>{c.estado}</span>
                <p className="font-saira font-bold text-p-ink shrink-0">{moneyARS(c.total)}</p>
              </div>

              {expandido===c.id && (
                <div onClick={e=>e.stopPropagation()} className="px-3.5 pb-3 pt-2 border-t border-p-line2 bg-p-light/30">
                  {c.cae_vencimiento && (
                    <p className="text-[11px] text-p-ink2 mb-1.5">Vto. CAE: {c.cae_vencimiento.split('-').reverse().join('/')}</p>
                  )}
                  {c.items?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2.5">
                      {c.items.slice(0,5).map((it,i)=>(
                        <span key={i} className="text-[11px] bg-white border border-p-line text-p-dark px-2 py-0.5 rounded-full">
                          {(it as any).codigo && <span className="font-mono font-bold text-p-green mr-1">{(it as any).codigo}</span>}
                          {it.articulo_id && '🔗 '}{it.d} ×{it.c}
                        </span>
                      ))}
                      {c.items.length>5&&<span className="text-[11px] text-p-ink2">+{c.items.length-5} más</span>}
                    </div>
                  )}
                  <div className="flex gap-2 flex-wrap">
                    {puedeVincular(c) && (
                      <button onClick={()=>abrirVinculacion(c)} style={{...btnSm,background:'#00A550'}}>📦 Cargar a stock</button>
                    )}
                    {/* Factura pendiente con afecta_stock=false — permitir activar ingreso al stock */}
                    {c.tipo==='factura' && c.estado==='pendiente' && !c.afecta_stock && c.items?.length>0 && (
                      <button onClick={async ()=>{
                        if (!confirm('¿Activar ingreso al stock para esta factura?')) return
                        await supabase.from('comprobantes_compra').update({ afecta_stock: true }).eq('id', c.id)
                        load()
                      }} style={{...btnSm,background:'#f59e0b',color:'#fff'}}>📦 Activar ingreso al stock</button>
                    )}
                    {c.items?.length > 0 && (c.tipo==='factura'||c.tipo==='remito') && (
                      <button onClick={()=>compararPrecios(c)} style={btnBlue}>📊 Comparar precios</button>
                    )}
                    {periodoCerrado(c.fecha) ? (
                      <span className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-lg font-semibold">🔒 Período cerrado</span>
                    ) : (
                      <button onClick={()=>editarComprobante(c)} style={btnSm}>✏ Editar</button>
                    )}
                    {!periodoCerrado(c.fecha) && (
                      <button onClick={()=>eliminarComprobante(c.id)} style={{...btnSm,background:'#991b1b'}}>🗑 Eliminar</button>
                    )}
                    <button onClick={async ()=>{ 
                      setVerComp(c)
                      const codigos = c.items.map((it:any) => it.codigo || (/^[0-9]{6}[A-Z]/i.test((it.d||'').trim()) ? it.d.trim() : null)).filter(Boolean)
                      if (codigos.length) {
                        const { data } = await supabase.from('catalogo').select('codigo,descripcion').in('codigo', codigos).is('lista_nombre', null)
                        const map: Record<string,string> = {}
                        for (const r of data??[]) if (r.codigo && !map[r.codigo]) map[r.codigo] = r.descripcion
                        setDetailDescMap(map)
                      }
                    }} style={btnSm}>👁 Ver detalle</button>
                  </div>
                </div>
              )}
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
                {remitoModal.items.map((it,i) => {
                  const codigoRaw = (it as any).codigo || (/^[0-9]{6}[A-Z]/i.test((it.d||'').trim()) ? it.d.trim() : null)
                  const codigo = codigoRaw
                  const esFlete = codigo === 'FL' || (it.d||'').toUpperCase().trim() === 'FLETE'
                  // Descripción desde catálogo si d parece un código
                  const descMostrar = (/^[0-9]{6}[A-Z]/i.test((it.d||'').trim()) && catDescMap[it.d.trim()]) ? catDescMap[it.d.trim()] : it.d
                  return (
                  <div key={i} className={`rounded-xl p-3 ${esFlete?'bg-gray-50 opacity-60':'bg-p-light'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="font-semibold text-sm text-p-ink">{it.articulo_id && '🔗 '}{descMostrar}</p>
                        {codigo && !esFlete && (
                          <div className="flex items-center gap-1 mt-0.5">
                            <span className="text-[10px] font-mono text-p-ink2 bg-p-light px-1.5 py-0.5 rounded">{codigoRaw}</span>
                            {mappings[i] && <span className="text-[10px] text-green-600 font-bold">✓</span>}
                            {!mappings[i] && codigoRaw && <span className="text-[10px] text-amber-600">⚠ sin stock</span>}
                          </div>
                        )}
                      </div>
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
                                <button onClick={()=>setNuevoItem(prev=>({...prev,[i]:{desc:catDescMap[codigoRaw||'']||descMostrar,codigo:codigoRaw||'',precio:''}}))}
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
                )})}
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
                        <div>
                          <p className="font-semibold text-sm text-p-ink">{r.item.articulo_id && '🔗 '}{r.item.d}</p>
                          {(r.item as any).codigo && (
                            <span className="font-mono text-[10px] bg-p-light text-p-dark px-1.5 py-0.5 rounded mt-0.5 inline-block">{(r.item as any).codigo}</span>
                          )}
                        </div>
                        <span className="font-mono text-sm">
                          Pagado (neto): <strong>{moneyARS2(r.precioNetoReal ?? r.item.p)}</strong>
                          {r.precioNetoReal && r.precioNetoReal !== r.item.p && (
                            <span className="text-[10px] text-p-ink2 ml-1">lista: {moneyARS2(r.item.p)}</span>
                          )}
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
                                  {c2.proveedor}{c2.codigo_proveedor ? ` · ${c2.codigo_proveedor}` : ''}: {moneyARS2(c2.costo_neto)}
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
      <Modal open={open} onClose={()=>{setOpen(false);setEditId(null)}} title={editId ? "Editar comprobante de compra" : "Cargar comprobante de compra"} size="xl">
        <div className="flex flex-col gap-3 max-h-[80vh] overflow-y-auto pr-1">
          {/* Tipo */}
          <div>
            <label className="block text-[11px] font-semibold text-p-ink2 uppercase tracking-wider mb-2">Tipo</label>
            <div className="flex gap-2 flex-wrap">
              {TIPOS.map(t=>(
                <button key={t.id} onClick={async ()=>{ 
                  setForm(p=>({...p,tipo:t.id}))
                  if (t.id === 'nc' && form.proveedor_id) {
                    if (form.proveedor_id) {
                      const { data } = await supabase.from('ajustes_stock')
                        .select('id, descripcion, cantidad, fecha, nota, stock:stock_id(codigo, descripcion)')
                        .eq('pendiente_nc', true)
                        .eq('proveedor_id', form.proveedor_id)
                        .order('fecha', { ascending: true })
                      setPendientesNC(data ?? [])
                    }
                    // No preseleccionar — dejar que el usuario elija de a uno
                    setPendientesSelNC({})
                  } else {
                    setPendientesNC([])
                  }
                }}
                  style={{background:form.tipo===t.id?TIPO_COLOR[t.id]:'#fff',color:form.tipo===t.id?'#fff':'#4A6655',border:`1.5px solid ${form.tipo===t.id?TIPO_COLOR[t.id]:'#C2DDD0'}`,borderRadius:8,padding:'7px 16px',fontWeight:700,fontSize:13,cursor:'pointer'}}>
                  {t.icon} {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Pendientes NC del proveedor */}
          {form.tipo === 'nc' && pendientesNC.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
              <p className="text-xs font-bold text-amber-800 mb-2">⏳ {pendientesNC.length} artículo(s) con NC pendiente — hacé click para agregar a esta NC</p>
              <div className="flex flex-col gap-1.5">
                {pendientesNC.map((p:any) => {
                  const yaAgregado = !!pendientesSelNC[p.id]
                  const codigo = (p.stock as any)?.codigo || '—'
                  const desc = (p.stock as any)?.descripcion || p.descripcion || '—'
                  const costo = (p.stock as any)?.costo || 0
                  return (
                    <button key={p.id} type="button"
                      onClick={()=>{
                        if(yaAgregado) {
                          // Deseleccionar — sacar del ítem
                          setPendientesSelNC(prev=>({...prev,[p.id]:false}))
                          setItems(prev=>prev.filter(it=>(it as any)._pendiente_id !== p.id))
                        } else {
                          // Agregar como ítem con precio del costo
                          setPendientesSelNC(prev=>({...prev,[p.id]:true}))
                          const precioLista = costo > 0 ? costo / (1 - 0.68) : 0 // invertir descuento Sekurit
                          setItems(prev=>[...prev,{
                            d: desc, c: p.cantidad,
                            p: precioLista > 0 ? precioLista : costo,
                            codigo, dto: null,
                            articulo_id: null,
                            _pendiente_id: p.id,
                          } as any])
                        }
                      }}
                      className={`w-full flex items-center gap-2 text-xs px-2.5 py-2 rounded-lg border transition-all text-left ${
                        yaAgregado
                          ? 'bg-green-100 border-green-300 text-green-800'
                          : 'bg-white border-amber-200 text-amber-800 hover:bg-amber-100'
                      }`}>
                      <span className={`text-[10px] font-bold shrink-0 ${yaAgregado?'text-green-600':'text-amber-600'}`}>
                        {yaAgregado ? '✓' : '+'}
                      </span>
                      <span className="font-mono bg-amber-100 px-1.5 py-0.5 rounded text-[10px] shrink-0">{codigo}</span>
                      <span className="flex-1 truncate">{desc}</span>
                      <span className="font-bold shrink-0">×{p.cantidad}</span>
                      <span className="text-amber-500 shrink-0">{p.fecha?.split('-').reverse().join('/')}</span>
                    </button>
                  )
                })}
              </div>
              {Object.values(pendientesSelNC).filter(Boolean).length > 0 && (
                <p className="text-[10px] text-green-700 font-semibold mt-2">
                  ✓ {Object.values(pendientesSelNC).filter(Boolean).length} artículo(s) agregados — al guardar quedarán saldados automáticamente.
                </p>
              )}
            </div>
          )}
          {form.tipo === 'nc' && pendientesNC.length === 0 && form.proveedor_id && (
            <p className="text-xs text-p-ink2 bg-p-light rounded-lg px-3 py-2">Sin artículos pendientes de NC para este proveedor.</p>
          )}

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
                <Select value={form.proveedor_id} onChange={async e=>{ 
                  setForm(p=>({...p,proveedor_id:e.target.value}))
                  if (form.tipo === 'nc' && e.target.value) {
                    const { data } = await supabase.from('ajustes_stock')
                      .select('id, descripcion, cantidad, fecha, nota, stock:stock_id(codigo, descripcion)')
                      .eq('pendiente_nc', true)
                      .eq('proveedor_id', e.target.value)
                      .order('fecha', { ascending: true })
                    setPendientesNC(data ?? []); setPendientesSelNC(Object.fromEntries((data ?? []).map((x:any) => [x.id, true])))
                  }
                }}>
                  <option value="">Seleccionar…</option>
                  {proveedores.map(p=><option key={p.id} value={p.id}>{p.nombre}</option>)}
                </Select>
                <button type="button" onClick={()=>setProvModal(true)} style={{...btnBlue, padding:'9px 12px', whiteSpace:'nowrap'}}>+ Nuevo</button>
              </div>
            </Field>
          </div>

          {form.tipo === 'factura' && (
            <Field label="Forma de pago">
              <Select value={form.forma_pago} onChange={e=>setForm(p=>({...p,forma_pago:e.target.value as 'cuenta_corriente'|'contado'}))}>
                <option value="cuenta_corriente">📒 Cuenta corriente — queda pendiente de pago</option>
                <option value="contado">💵 Contado — se paga en el momento</option>
              </Select>
            </Field>
          )}

          {/* Ítems — mismo estilo que Comprobantes */}
          <div className="border-t border-p-line2 pt-3">
            <label className="block text-[11px] font-semibold text-p-ink2 uppercase tracking-wider mb-2">Ítems</label>

            {/* Buscador igual que en Comprobantes */}
            <div className="relative mb-2">
              <input ref={searchRef}
                value={itemArticuloSel ? `${itemArticuloSel.descripcion}` : itemForm.d}
                onChange={e=>{ if(!itemArticuloSel) buscarItemArticulo(e.target.value) }}
                readOnly={!!itemArticuloSel}
                placeholder="Buscar pieza (catálogo o descripción libre)…"
                className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none bg-white ${itemArticuloSel ? 'border-green-300 bg-green-50 text-green-800 cursor-default' : 'border-p-line focus:border-p-green'}`}/>
              {itemArticuloSel && (
                <button onClick={()=>{setItemArticuloSel(null);setItemForm(p=>({...p,d:'',codigo:''}))}}
                  className="absolute right-3 top-2.5 text-green-600 hover:text-red-500 text-sm font-bold">✕</button>
              )}
              {itemArticuloSugs.length > 0 && !itemArticuloSel && (
                <div className="absolute z-20 top-full left-0 right-0 bg-white border border-p-line rounded-xl shadow-xl max-h-48 overflow-y-auto mt-1">
                  {itemArticuloSugs.map((a:any) => (
                    <button key={a.id} type="button" onClick={()=>elegirItemArticulo(a)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-p-light border-b border-p-line2 last:border-0">
                      <p className="font-medium text-p-ink">{a.descripcion}</p>
                      <p className="text-[10px] font-mono text-p-ink2 flex items-center gap-1.5 flex-wrap">
                        {a.codigo && <span className="bg-p-light px-1 rounded font-bold text-p-dark">PLK: {a.codigo}</span>}
                        {a.codigo_proveedor && <span className="bg-blue-50 text-blue-700 px-1 rounded font-bold">{form.proveedor_nombre?.split(' ')[0]}: {a.codigo_proveedor}</span>}
                        {a.proveedor && <span className="font-bold">{a.proveedor} · </span>}
                        {a.costo_neto ? moneyARS(a.costo_neto) : ''}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Fila de precio/cant/dto para el ítem pendiente + botón agregar */}
            {itemForm.d.trim().length > 0 && (
              <div className="flex gap-2 items-center mb-2 bg-p-light/50 rounded-xl px-3 py-2 flex-wrap">
                <div className="flex items-center gap-1 flex-1 min-w-0">
                  {itemArticuloSel && <span className="text-[10px] bg-green-100 text-green-700 font-bold px-1.5 py-0.5 rounded-full shrink-0">✓ Catálogo</span>}
                  <span className={`text-sm truncate ${itemArticuloSel ? 'text-p-ink font-medium' : 'text-p-ink2'}`}>{itemForm.d}</span>
                </div>
                <input value={itemForm.codigo}
                  onChange={e=>!itemArticuloSel && setItemForm(p=>({...p,codigo:e.target.value.toUpperCase()}))}
                  readOnly={!!itemArticuloSel}
                  placeholder="Código"
                  className={`w-28 border rounded-lg px-2 py-1.5 text-xs font-mono focus:outline-none ${itemArticuloSel ? 'border-green-200 bg-green-50 text-green-800 cursor-default' : 'border-amber-300 focus:border-amber-500'}`}
                  title={itemArticuloSel ? 'Código del catálogo — no editable' : 'Código Pilkington'}/>
                <input type="number" value={itemForm.c} onChange={e=>setItemForm(p=>({...p,c:e.target.value}))} placeholder="Cant" className="w-14 border border-p-line rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:border-p-green"/>
                <input value={itemForm.p} onChange={e=>setItemForm(p=>({...p,p:e.target.value}))} placeholder="$ precio" className="w-28 border border-p-line rounded-lg px-2 py-1.5 text-sm font-mono focus:outline-none focus:border-p-green"/>
                <input type="number" value={itemForm.dto} onChange={e=>setItemForm(p=>({...p,dto:e.target.value}))} placeholder="Dto%" className="w-14 border border-p-line rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:border-amber-400" title="Descuento %"/>
                <button onClick={addItem} style={{...btnSm,padding:'7px 12px'}} disabled={!itemForm.p}>+ Agregar</button>
                <button onClick={()=>{setItemForm(p=>({d:'',c:'1',p:'',dto:p.dto,codigo:''}));setItemArticuloSel(null)}} className="text-red-400 text-xs">✕</button>
              </div>
            )}

            {/* Flete rápido */}
            <div className="mb-2">
              <button onClick={()=>setItemForm(p=>({...p,d:'FLETE',c:'1',p:form.flete||'',dto:''}))}
                style={{...btnSm,background:'#6b7280',fontSize:11,padding:'4px 10px'}}>
                🚛 Flete como ítem
              </button>
            </div>
            {items.map((it,i)=>{
              const bruto = it.c * it.p
              const desc  = it.dto ? Math.round(bruto * it.dto * 100) / 10000 : 0
              const neto  = bruto - desc
              return (
              <div key={i} className="flex items-center gap-2 py-1.5 border-b border-p-line2 text-sm">
                {it.articulo_id && <span className="text-[10px] text-p-green font-bold shrink-0">🔗</span>}
                <span className="flex-1 text-p-ink text-sm break-words min-w-0">
                  {(it as any).codigo && <span className="font-mono text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded mr-1.5">{(it as any).codigo}</span>}
                  {it.d}
                </span>
                <div className="shrink-0">
                  <div className="text-[9px] text-p-ink2 text-center mb-0.5">cant.</div>
                  <input type="number" min="1" value={it.c} onChange={e=>setItems(prev=>prev.map((x,j)=>j===i?{...x,c:+e.target.value||1}:x))}
                    className="w-12 border border-p-line rounded px-1.5 py-0.5 text-xs font-mono text-center focus:outline-none focus:border-p-green"/>
                </div>
                <div className="shrink-0">
                  <div className="text-[9px] text-p-ink2 text-center mb-0.5">precio</div>
                  <input value={it.p} onChange={e=>{
                      const val = e.target.value.replace(',','.')
                      setItems(prev=>prev.map((x,j)=>j===i?{...x,p:val as any}:x))
                    }}
                    onBlur={e=>{
                      const val = parseFloat(String(e.target.value).replace(',','.').replace(/[^0-9.]/g,'')) || 0
                      setItems(prev=>prev.map((x,j)=>j===i?{...x,p:val}:x))
                    }}
                    className="w-24 border border-p-line rounded px-1.5 py-0.5 text-xs font-mono focus:outline-none focus:border-p-green"/>
                </div>
                {it.dto ? (
                  <span className="text-[10px] bg-green-100 text-green-700 font-bold px-1.5 py-0.5 rounded shrink-0 cursor-pointer"
                    onClick={()=>setItems(prev=>prev.map((x,j)=>j===i?{...x,dto:null}:x))}>
                    −{it.dto}% ✕
                  </span>
                ) : null}
                <div className="shrink-0 text-right">
                  <div className="text-[9px] text-p-ink2 mb-0.5">total línea</div>
                  <span className="font-mono font-bold text-p-green">{moneyARS(neto)}</span>
                </div>
                <button onClick={()=>setItems(prev=>prev.filter((_,j)=>j!==i))} className="text-red-400 text-xs shrink-0">✕</button>
              </div>
            )})}
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
            {descuentoItemsTotal > 0 && (
              <div className="flex justify-between text-xs text-p-ink2"><span>Bruto ítems (antes de dto por ítem)</span><span className="font-mono">{moneyARS(items.reduce((a,it)=>a+it.c*it.p,0))}</span></div>
            )}
            <div className="flex justify-between text-sm text-p-ink2"><span>Subtotal ítems {descuentoItemsTotal>0?'(con dto por ítem)':''}</span><span className="font-mono">{moneyARS(netoItems+netoFlete)}</span></div>

            {/* Descuento editable */}
            {(descuentoMonto > 0 || ovDescuento !== '') && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-red-600">Descuento ({descuentoPct}%)</span>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-p-ink2">−$</span>
                  <input type="number" value={ovDescuento !== '' ? ovDescuento : calcDescuento.toFixed(2)}
                    onChange={e=>setOvDescuento(e.target.value)}
                    onFocus={e=>{ if(ovDescuento==='') setOvDescuento(calcDescuento.toFixed(2)); e.target.select() }}
                    className="w-32 border border-red-300 rounded px-2 py-0.5 text-xs font-mono text-right focus:outline-none focus:border-red-500"/>
                  {ovDescuento !== '' && <button onClick={()=>setOvDescuento('')} className="text-[10px] text-p-ink2 hover:text-p-ink">↩</button>}
                </div>
              </div>
            )}

            {/* Subtotal neto editable */}
            <div className="flex items-center justify-between gap-2 border-t border-p-line pt-1">
              <span className="text-sm font-semibold text-p-ink">Subtotal neto</span>
              <div className="flex items-center gap-1">
                <span className="text-xs text-p-ink2">$</span>
                <input type="number" value={ovSubtotal !== '' ? ovSubtotal : calcSubtotal.toFixed(2)}
                  onChange={e=>setOvSubtotal(e.target.value)}
                  onFocus={e=>{ if(ovSubtotal==='') setOvSubtotal(calcSubtotal.toFixed(2)); e.target.select() }}
                  className="w-36 border border-p-line rounded px-2 py-0.5 text-sm font-mono text-right focus:outline-none focus:border-p-green"/>
                {ovSubtotal !== '' && <button onClick={()=>setOvSubtotal('')} className="text-[10px] text-p-ink2 hover:text-p-ink">↩</button>}
              </div>
            </div>

            {/* IVA editable */}
            <label className="flex items-center gap-2 text-sm cursor-pointer mt-1">
              <input type="checkbox" checked={ivaOn} onChange={e=>{setIvaOn(e.target.checked);setOvIva('')}} className="accent-p-green"/>
              Incluir IVA 21%
            </label>
            {ivaOn && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-p-ink2">IVA 21%</span>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-p-ink2">$</span>
                  <input type="number" value={ovIva !== '' ? ovIva : calcIva.toFixed(2)}
                    onChange={e=>setOvIva(e.target.value)}
                    onFocus={e=>{ if(ovIva==='') setOvIva(calcIva.toFixed(2)); e.target.select() }}
                    className="w-36 border border-p-line rounded px-2 py-0.5 text-sm font-mono text-right focus:outline-none focus:border-p-green"/>
                  {ovIva !== '' && <button onClick={()=>setOvIva('')} className="text-[10px] text-p-ink2 hover:text-p-ink">↩</button>}
                </div>
              </div>
            )}

            <div className="border-t border-p-line my-1"/>

            <div className="grid grid-cols-2 gap-2">
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

          {/* Para NC: campo de monto manual si no cargó ítems */}
          {form.tipo === 'nc' && items.length === 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex flex-col gap-2">
              <p className="text-xs font-bold text-blue-800">Monto de la NC (si no cargás ítems detallados)</p>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Neto s/IVA">
                  <Input type="number" value={ovSubtotal} onChange={e=>setOvSubtotal(e.target.value)} placeholder="0"/>
                </Field>
                <Field label="IVA 21%">
                  <Input type="number" value={ovIva} onChange={e=>setOvIva(e.target.value)} placeholder="0"/>
                </Field>
              </div>
              {(+ovSubtotal > 0 || +ovIva > 0) && (
                <div className="flex justify-between text-sm font-bold text-blue-800">
                  <span>Total NC</span>
                  <span className="font-mono">{moneyARS((parseFloat(ovSubtotal)||0) + (parseFloat(ovIva)||0))}</span>
                </div>
              )}
            </div>
          )}

          {/* Afecta stock — solo para facturas y remitos, no NC */}
          {form.tipo !== 'nc' && form.tipo !== 'nd' && (
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={form.afecta_stock} onChange={e=>setForm(p=>({...p,afecta_stock:e.target.checked}))} className="accent-p-green"/>
            Este comprobante afecta el stock (carga mercadería al inventario)
          </label>
          )}
          {form.tipo !== 'nc' && form.tipo !== 'nd' && form.afecta_stock && (
            <p className="text-[11px] text-p-ink2 -mt-1">
              Al guardar, vas a poder vincular cada ítem con su artículo en stock desde el listado.
            </p>
          )}

          {/* CAE — al final, una vez cargados todos los ítems e importes */}
          {['factura','nc'].includes(form.tipo) && (
            <div className="grid grid-cols-2 gap-3 bg-blue-50 border border-blue-100 rounded-xl p-3">
              <Field label="CAE">
                <Input value={form.cae} onChange={e=>setForm(p=>({...p,cae:e.target.value}))} placeholder="N° de CAE (opcional)"/>
              </Field>
              <Field label="Vencimiento CAE">
                <Input type="date" value={form.cae_vencimiento} onChange={e=>setForm(p=>({...p,cae_vencimiento:e.target.value}))}/>
              </Field>
            </div>
          )}

          <Field label="Notas">
            <Input value={form.notas} onChange={e=>setForm(p=>({...p,notas:e.target.value}))} placeholder="Observaciones…"/>
          </Field>

          <div className="flex justify-end gap-2 pt-1">
            <button onClick={()=>setOpen(false)} style={btnGray}>Cancelar</button>
            <button onClick={abrirGuardado} style={btn}>✓ Guardar</button>
          </div>
        </div>
      </Modal>

      {/* Modal: confirmar pago al contado */}
      <Modal open={formaPagoModal} onClose={()=>setFormaPagoModal(false)} title="Registrar pago al contado">
        <div className="flex flex-col gap-3">
          <div className="bg-p-light rounded-xl p-3 text-center">
            <p className="text-sm text-p-ink2">Total de la factura</p>
            <p className="font-saira font-bold text-2xl text-p-ink">{moneyARS(total)}</p>
          </div>
          <Field label="Forma de pago">
            <Select value={formPagoContado.forma_pago} onChange={e=>setFormPagoContado(p=>({...p,forma_pago:e.target.value}))}>
              <option value="Efectivo">Efectivo</option>
              <option value="Transferencia">Transferencia</option>
              <option value="Tarjeta">Tarjeta</option>
              <option value="Cheque">🖊 Cheque</option>
            </Select>
          </Field>
          {formPagoContado.forma_pago==='Cheque'&&(
            <ChequeFields value={chequeContado} onChange={setChequeContado}/>
          )}
          <Field label="Monto pagado">
            <Input value={formPagoContado.monto} onChange={e=>setFormPagoContado(p=>({...p,monto:e.target.value}))}/>
          </Field>
          <Field label="Fecha">
            <Input type="date" value={formPagoContado.fecha} onChange={e=>setFormPagoContado(p=>({...p,fecha:e.target.value}))}/>
          </Field>
          <p className="text-[11px] text-p-ink2">
            Esto registra un gasto en Caja del día y la factura no entra a la cuenta corriente del proveedor.
          </p>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={()=>setFormaPagoModal(false)} style={btnGray}>Cancelar</button>
            <button onClick={()=>save(true, {...formPagoContado, cheque: formPagoContado.forma_pago==='Cheque'?chequeContado:undefined} as any)}
              disabled={!formPagoContado.monto||(formPagoContado.forma_pago==='Cheque'&&!chequeContado.numero)}
              style={{...btn,opacity:(!formPagoContado.monto||(formPagoContado.forma_pago==='Cheque'&&!chequeContado.numero))?.5:1}}>
              ✓ Confirmar pago y guardar
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal Ver detalle (solo lectura) */}
      <Modal open={!!verComp} onClose={()=>setVerComp(null)} title="Detalle del comprobante">
        {verComp && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="text-[11px] font-bold px-2.5 py-1 rounded-full text-white"
                style={{background:TIPO_COLOR[verComp.tipo]||'#6b7280'}}>
                {tipoIcon(verComp.tipo)} {tipoLabel(verComp.tipo)}
              </span>
              <span className="font-mono font-bold text-sm">{numComp(verComp)}</span>
              <span className="text-sm text-p-ink2">{verComp.fecha.split('-').reverse().join('/')}</span>
            </div>
            <div className="bg-p-light rounded-xl p-3 text-sm">
              <span className="text-p-ink2">Proveedor: </span><span className="font-semibold">{verComp.proveedor_nombre||'Sin proveedor'}</span>
            </div>

            <div>
              <p className="text-[11px] font-bold text-p-ink2 uppercase tracking-wide mb-1.5">Ítems</p>
              <div className="flex flex-col gap-1">
                {verComp.items.map((it,i)=>(
                  <div key={i} className="flex items-center justify-between text-sm border-b border-p-line2 py-1.5 gap-2">
                    <div className="flex-1 min-w-0">
                      {(() => {
                        const cod = (it as any).codigo || (/^[0-9]{6}[A-Z]/i.test((it.d||'').trim()) ? it.d.trim() : null)
                        const desc = cod && detailDescMap[cod] ? detailDescMap[cod] : it.d
                        return <>
                          {cod && <span className="text-[10px] font-mono font-bold bg-p-light text-p-ink2 px-1.5 py-0.5 rounded mr-1.5">{cod}</span>}
                          <span>{it.articulo_id && '🔗 '}{desc}</span>
                        </>
                      })()}
                    </div>
                    <span className="text-p-ink2 shrink-0">x{it.c}</span>
                    <span className="font-mono shrink-0 text-right">{moneyARS(it.p*it.c)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-p-light rounded-xl p-3 flex flex-col gap-1 text-sm">
              <div className="flex justify-between"><span className="text-p-ink2">Neto</span><span className="font-mono">{moneyARS(verComp.neto)}</span></div>
              {!!verComp.descuento_pct && <div className="flex justify-between"><span className="text-p-ink2">Descuento ({verComp.descuento_pct}%)</span><span className="font-mono">− {moneyARS(verComp.descuento_monto||0)}</span></div>}
              <div className="flex justify-between"><span className="text-p-ink2">IVA</span><span className="font-mono">{moneyARS(verComp.iva)}</span></div>
              {!!verComp.flete && <div className="flex justify-between"><span className="text-p-ink2">Flete</span><span className="font-mono">{moneyARS(verComp.flete)}</span></div>}
              {!!verComp.ret_iva && <div className="flex justify-between"><span className="text-p-ink2">Ret. IVA</span><span className="font-mono">− {moneyARS(verComp.ret_iva)}</span></div>}
              {!!verComp.ret_ganancias && <div className="flex justify-between"><span className="text-p-ink2">Ret. Ganancias</span><span className="font-mono">− {moneyARS(verComp.ret_ganancias)}</span></div>}
              {!!verComp.ret_iibb && <div className="flex justify-between"><span className="text-p-ink2">Ret. IIBB</span><span className="font-mono">− {moneyARS(verComp.ret_iibb)}</span></div>}
              {!!verComp.ajuste_redondeo && <div className="flex justify-between"><span className="text-p-ink2">Ajuste</span><span className="font-mono">{moneyARS(verComp.ajuste_redondeo)}</span></div>}
              <div className="flex justify-between font-saira font-bold text-lg border-t border-p-line mt-1 pt-1">
                <span>TOTAL</span><span>{moneyARS(verComp.total)}</span>
              </div>
            </div>

            {verComp.cae && (
              <div className="rounded-lg p-3 text-sm bg-green-50 text-green-700">
                ✓ CAE {verComp.cae}{verComp.cae_vencimiento?` · Vto. ${verComp.cae_vencimiento.split('-').reverse().join('/')}`:''}
              </div>
            )}
            {verComp.notas && <p className="text-xs text-p-ink2 italic">"{verComp.notas}"</p>}

            <div className="flex justify-end gap-2 pt-1">
              <button onClick={()=>setVerComp(null)} style={btnGray}>Cerrar</button>
            </div>
          </div>
        )}
      </Modal>
      </>) /* fin tabCompras === 'comprobantes' */}
    </div>
  )
}

// ─── Módulo de Pedidos ────────────────────────────────────────────────────────
function ModuloPedidos({ supabase, proveedores }: { supabase: any; proveedores: any[] }) {
  const [q, setQ] = useState('')
  const [resultados, setResultados] = useState<any[]>([])
  const [buscando, setBuscando] = useState(false)
  const [pedido, setPedido] = useState<{articulo_id:string; descripcion:string; codigo:string; proveedor:string; costo:number; cantidad:string}[]>([])
  const [cantPedido, setCantPedido] = useState<Record<string,string>>({})

  async function buscar() {
    if (q.trim().length < 2) return
    setBuscando(true)
    const esCode = !/\s/.test(q.trim())

    let queryBase = supabase.from('catalogo')
      .select('id,descripcion,codigo,proveedor,costo_neto,precio_lista,pos,marca')
      .is('lista_nombre', null)  // solo precios vigentes, no listas viejas

    // Si es código: buscar tanto por código exacto con sufijo como por código base
    let qCode = esCode
      ? queryBase.ilike('codigo', `%${q.trim()}%`)
      : queryBase.ilike('descripcion', `%${q.trim()}%`)
    qCode = qCode.gt('costo_neto', 0).order('proveedor').limit(50)

    const { data: cat } = await qCode

    // Si no encontró y es código numérico, intentar búsqueda por descripción también
    let catExtra: any[] = []
    if (esCode && (!cat || cat.length === 0)) {
      const { data } = await supabase.from('catalogo')
        .select('id,descripcion,codigo,proveedor,costo_neto,precio_lista,pos,marca')
        .ilike('descripcion', `%${q.trim()}%`)
        .gt('costo_neto', 0).is('lista_nombre', null).limit(50)
      catExtra = data || []
    }

    const todos = [...(cat || []), ...catExtra]

    // Agrupar por código base (primeros 6 dígitos) — mismo artículo, distintos proveedores/variantes
    const grupos: Record<string, any[]> = {}
    for (const c of todos) {
      // Usar los primeros 6 chars del código como clave, o descripción si no hay código
      const codigoBase = c.codigo ? c.codigo.replace(/[^0-9]/g,'').slice(0,6) : null
      const key = codigoBase && codigoBase.length >= 4 
        ? codigoBase 
        : (c.descripcion || '').toUpperCase().trim().slice(0, 30)
      if (!grupos[key]) grupos[key] = []
      // No duplicar mismo proveedor + código exacto
      if (!grupos[key].find((x: any) => x.codigo === c.codigo && x.proveedor === c.proveedor)) {
        grupos[key].push(c)
      }
    }

    const items = Object.entries(grupos).map(([, variants]) => {
      const sorted = [...variants].sort((a, b) => (a.costo_neto || 0) - (b.costo_neto || 0))
      // Usar la descripción del más barato como descripción del grupo
      return { descripcion: sorted[0].descripcion, variants: sorted }
    }).filter(g => g.variants.length > 0).slice(0, 10)

    setResultados(items)
    setBuscando(false)
  }

  function agregarAPedido(v: any) {
    const key = `${v.codigo}-${v.proveedor}`
    if (pedido.find(p => p.codigo === v.codigo && p.proveedor === v.proveedor)) return
    setPedido(p => [...p, {
      articulo_id: v.id, descripcion: v.descripcion, codigo: v.codigo,
      proveedor: v.proveedor, costo: v.costo_neto, cantidad: cantPedido[key] || '1'
    }])
  }

  function imprimirPedido() {
    const lineas = pedido.map(p =>
      `${p.proveedor.padEnd(12)} | ${p.codigo.padEnd(15)} | ${p.descripcion.slice(0,35).padEnd(35)} | x${p.cantidad} | $${Number(p.costo).toLocaleString('es-AR')}`
    ).join('\n')
    const encabezado = `LISTA DE PEDIDOS — ${new Date().toLocaleDateString('es-AR')}\n${'─'.repeat(85)}\n`
    const w = window.open('', '_blank')
    if (w) {
      w.document.write(`<pre style="font-family:monospace;font-size:13px;padding:20px">${encabezado}${lineas}</pre>`)
      w.print()
    }
  }

  const proveedoresPedido = [...new Set(pedido.map(p => p.proveedor))]

  return (
    <div className="flex flex-col gap-5">
      {/* Buscador */}
      <div className="flex gap-2">
        <input value={q} onChange={e=>setQ(e.target.value)}
          onKeyDown={e=>e.key==='Enter'&&buscar()}
          placeholder="Buscar por código o descripción… ej: 1410031 o Corolla"
          className="flex-1 border border-p-line rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-p-green shadow-sm"/>
        <button onClick={buscar} disabled={buscando}
          className="bg-p-green text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-sm hover:bg-p-green/90 disabled:opacity-50">
          {buscando ? 'Buscando…' : '🔍 Buscar'}
        </button>
      </div>

      {/* Resultados con comparativa de precios */}
      {resultados.length > 0 && (
        <div className="flex flex-col gap-3">
          <p className="text-[11px] font-bold text-p-ink2 uppercase tracking-wider">{resultados.length} artículo(s) encontrado(s)</p>
          {resultados.map((item, i) => (
              <div key={i} className="bg-white border border-p-line rounded-xl shadow-sm overflow-hidden">
                <div className="px-4 py-2.5 bg-p-light/50 border-b border-p-line">
                  <p className="font-saira font-bold text-p-ink text-sm">{item.descripcion}</p>
                  <p className="text-[10px] text-p-ink2">{item.variants.length} proveedor{item.variants.length>1?'es':''}</p>
                </div>
                <div className="flex flex-col divide-y divide-p-line2">
                  {item.variants.map((v: any, j: number) => {
                    const esMasBarato = j === 0 && item.variants.length > 1
                    const key = `${v.codigo}-${v.proveedor}`
                    const yaEnPedido = pedido.find(p => p.codigo === v.codigo && p.proveedor === v.proveedor)
                    return (
                      <div key={j} className={`flex items-center gap-3 px-4 py-2.5 ${esMasBarato ? 'bg-green-50' : ''}`}>
                        {esMasBarato && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0" style={{background:'#00A550',color:'#fff'}}>✓ Más barato</span>}
                        <span className="text-[11px] font-bold text-p-ink2 w-24 shrink-0">{v.proveedor}</span>
                        <span className="font-mono text-xs text-p-ink2 shrink-0">{v.codigo}</span>
                        <span className="font-mono font-bold text-sm ml-auto shrink-0">${Number(v.costo_neto||0).toLocaleString('es-AR')}</span>
                        <input type="number" min="1"
                          value={cantPedido[key]||'1'}
                          onChange={e=>setCantPedido(p=>({...p,[key]:e.target.value}))}
                          className="w-14 border border-p-line rounded-lg px-2 py-1 text-sm text-center focus:outline-none"/>
                        <button onClick={()=>agregarAPedido({...v,cantidad:cantPedido[key]||'1'})}
                          disabled={!!yaEnPedido}
                          style={{
                            background: yaEnPedido ? '#dcfce7' : '#00A550',
                            color: yaEnPedido ? '#15803d' : '#fff',
                            border: 'none', borderRadius: 8, padding: '6px 12px',
                            fontWeight: 700, fontSize: 12, cursor: yaEnPedido ? 'default' : 'pointer',
                            flexShrink: 0
                          }}>
                          {yaEnPedido ? '✓' : '+ Pedir'}
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
          ))}
        </div>
      )}

      {/* Lista de pedido armada */}
      {pedido.length > 0 && (
        <div className="bg-white border border-p-line rounded-xl shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 bg-p-light/50 border-b border-p-line">
            <p className="font-saira font-bold text-p-ink">📋 Lista de pedido ({pedido.length} ítems)</p>
            <div className="flex gap-2">
              <button onClick={imprimirPedido}
                className="text-xs font-bold px-3 py-1.5 border border-p-line rounded-lg hover:bg-p-light">
                🖨 Imprimir
              </button>
              <button onClick={()=>setPedido([])}
                className="text-xs font-bold px-3 py-1.5 border border-red-200 text-red-600 rounded-lg hover:bg-red-50">
                Limpiar
              </button>
            </div>
          </div>
          {proveedoresPedido.map(prov => (
            <div key={prov}>
              <p className="text-[11px] font-bold text-p-ink2 uppercase tracking-wider px-4 py-2 bg-p-light/30 border-b border-p-line2">
                📦 {prov}
              </p>
              {pedido.filter(p=>p.proveedor===prov).map((p,i)=>(
                <div key={i} className="flex items-center gap-3 px-4 py-2.5 border-b border-p-line2 last:border-0 text-sm">
                  <span className="font-mono text-xs text-p-ink2 w-28 shrink-0">{p.codigo}</span>
                  <span className="flex-1 text-p-ink truncate">{p.descripcion}</span>
                  <span className="font-mono text-xs shrink-0">x{p.cantidad}</span>
                  <span className="font-mono font-bold shrink-0">${Number(p.costo).toLocaleString('es-AR')}</span>
                  <button onClick={()=>setPedido(prev=>prev.filter(x=>!(x.codigo===p.codigo&&x.proveedor===p.proveedor)))}
                    className="text-red-400 hover:text-red-600 text-xs ml-1 shrink-0">✕</button>
                </div>
              ))}
            </div>
          ))}
          <div className="px-4 py-3 border-t border-p-line flex justify-between items-center bg-p-light/30">
            <span className="text-sm font-semibold text-p-ink2">Total estimado</span>
            <span className="font-mono font-bold text-p-ink">
              ${pedido.reduce((a,p)=>a+(p.costo*(parseInt(p.cantidad)||1)),0).toLocaleString('es-AR')}
            </span>
          </div>
        </div>
      )}

      {resultados.length === 0 && !buscando && q.trim().length > 1 && (
        <p className="text-sm text-p-ink2 text-center py-8">Sin resultados para "{q}". Probá con otro código o descripción.</p>
      )}
    </div>
  )
}