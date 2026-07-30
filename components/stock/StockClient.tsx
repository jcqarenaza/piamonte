'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { StockItem } from '@/lib/types/database'
import { Btn, Modal, Field, Input, Select, Empty, AlarmBar } from '@/components/ui'
import { moneyARS2 as moneyARS, POS_LABEL } from '@/lib/utils/format'

const FAM_MAP: Record<string, string> = {
  PARABRISAS: 'Parabrisas', LUNETA: 'Lunetas',
  PUERTA_DD: 'Puertas', PUERTA_DI: 'Puertas', PUERTA_TD: 'Puertas', PUERTA_TI: 'Puertas',
  CUSTODIA_D: 'Aletas y Custodias', CUSTODIA_I: 'Aletas y Custodias',
  ALETA_D: 'Aletas y Custodias', ALETA_I: 'Aletas y Custodias', ALETA: 'Aletas y Custodias',
  VENTANA_D: 'Aletas y Custodias', VENTANA_I: 'Aletas y Custodias',
  TECHO: 'Techo', VIDRIO: 'Otros',
}
const FAMS = ['Parabrisas', 'Lunetas', 'Techo', 'Puertas', 'Aletas y Custodias', 'Otros']
const FAM_ICON: Record<string, string> = { Parabrisas: '🟦', Lunetas: '🟫', Techo: '🔲', Puertas: '🚪', 'Aletas y Custodias': '🔷', Otros: '⬜' }

type Tab = 'inventario' | 'vincular' | 'movimientos'

export default function StockClient({ isAdmin, userId }: { isAdmin: boolean; userId?: string }) {
  const [tab, setTab] = useState<Tab>('inventario')
  const [selMov, setSelMov] = useState<any|null>(null)
  const [verComp, setVerComp] = useState<any|null>(null)

  async function abrirComprobante(id: string) {
    const { data } = await supabase.from('comprobantes_compra').select('*').eq('id', id).single()
    if (data) { setVerComp(data); return }
    const { data: cv } = await supabase.from('comprobantes').select('*').eq('id', id).single()
    if (cv) setVerComp(cv)
  }
  const [selMovData, setSelMovData] = useState<any[]>([])
  const [loadingSelMov, setLoadingSelMov] = useState(false)
  const [ajusteCantModal, setAjusteCantModal] = useState<any|null>(null)
  const [ajusteCantForm, setAjusteCantForm] = useState({ tipo: 'entrada', cant: '1', nota: '', motivo: '', pendiente_nc: false, proveedor_id: '', proveedor_nombre: '' })
  const [savingAjuste, setSavingAjuste] = useState(false)
  const [proveedoresLista, setProveedoresLista] = useState<{id:string;nombre:string}[]>([])
  const [items, setItems] = useState<StockItem[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [depFilter, setDepFilter] = useState('')
  const [soloSinCosto, setSoloSinCosto] = useState(false)
  const [filtroFam, setFiltroFam] = useState<string|null>(null)
  // Movimientos
  const [movs, setMovs] = useState<any[]>([])
  const [movLoading, setMovLoading] = useState(false)
  const [movFiltroTipo, setMovFiltroTipo] = useState<'todos'|'entrada'|'salida'>('todos')
  const [movQ, setMovQ] = useState('')
  const [open, setOpen] = useState(false)
  const [ajusteOpen, setAjusteOpen] = useState(false)
  const [ajusteForm, setAjusteForm] = useState({ desc:'', cant:'1', costo:'', prov:'', nota:'' })
  const [ajusteSearch, setAjusteSearch] = useState('')
  const [ajusteSugs, setAjusteSugs] = useState<StockItem[]>([])
  const [ajusteStockId, setAjusteStockId] = useState<string|null>(null)
  const [costoEdit, setCostoEdit] = useState<Record<string, string>>({})
  const [editId, setEditId] = useState<string|null>(null)
  const [dolarOficial, setDolarOficial] = useState<number|null>(null)
  const [abreviaturas, setAbreviaturas] = useState<Record<string,string>>({})
  const [conteoMode, setConteoMode] = useState(false)
  const [conteos, setConteos] = useState<Record<string,number>>({})
  const [ajusteMasivoOpen, setAjusteMasivoOpen] = useState(false)
  const [ajusteMasivoQ, setAjusteMasivoQ] = useState('')
  const [ajusteMasivoSug, setAjusteMasivoSug] = useState<typeof items>([])
  const [ajusteMasivoSel, setAjusteMasivoSel] = useState<typeof items[0]|null>(null)
  const [ajusteMasivoDelta, setAjusteMasivoDelta] = useState(0)
  const [ajusteMasivoNota, setAjusteMasivoNota] = useState('')
  const [ajusteMasivoLoading, setAjusteMasivoLoading] = useState(false)
  const [ajusteMasivoLeyenda, setAjusteMasivoLeyenda] = useState('')
  const [ajusteMasivoLista, setAjusteMasivoLista] = useState<{id:string;codigo:string;desc:string;cantActual:number;delta:number}[]>([])
  // Excel import
  const [excelPreview, setExcelPreview] = useState<{
    codigo:string; nombre:string; marca:string;
    stockId:string|null; cantActual:number;
    maestroId:string|null; estado:'existe'|'sin_stock'|'nuevo'
    deltaExcel:number
  }[]>([])
  const [excelPreviewOpen, setExcelPreviewOpen] = useState(false)
  const [excelLoading, setExcelLoading] = useState(false)
  const supabase = createClient()

  async function confirmarAjusteCant() {
    if (!ajusteCantModal || !ajusteCantForm.cant) return
    setSavingAjuste(true)
    const delta = ajusteCantForm.tipo === 'entrada' ? +ajusteCantForm.cant : -Math.abs(+ajusteCantForm.cant)
    const nueva = ajusteCantModal.cantidad + delta
    const notaFinal = [ajusteCantForm.motivo, ajusteCantForm.nota].filter(Boolean).join(' — ') || 'Ajuste manual'
    const esPendienteNC = ajusteCantForm.tipo === 'salida' && ajusteCantForm.pendiente_nc

    // PRIMERO registrar en stock_movimientos — así el trigger encuentra el registro y no duplica
    await supabase.from('stock_movimientos').insert({
      stock_id: ajusteCantModal.id,
      tipo: ajusteCantForm.tipo,
      cantidad: Math.abs(delta),
      fecha: new Date().toISOString().slice(0,10),
      descripcion: notaFinal,
      pendiente_nc: esPendienteNC,
      user_id: userId || null,
    })

    // DESPUÉS actualizar cantidad — el trigger ya encontrará el movimiento y no duplicará
    await setUserCtx()
    await supabase.from('stock').update({ cantidad: nueva }).eq('id', ajusteCantModal.id)

    // Si es salida con pendiente NC → registrar en ajustes_stock con proveedor para que ComprasClient lo encuentre
    if (esPendienteNC && ajusteCantForm.proveedor_id) {
      const montoAjuste = Math.round((ajusteCantModal.costo || 0) * Math.abs(delta))

      // Insertar en ajustes_stock con proveedor — es la fuente que usa ComprasClient para listar pendientes NC
      await supabase.from('ajustes_stock').insert({
        stock_id: ajusteCantModal.id,
        tipo: 'salida',
        cantidad: Math.abs(delta),
        nota: notaFinal,
        descripcion: ajusteCantModal.descripcion || '',
        fecha: new Date().toISOString().slice(0,10),
        user_id: userId || null,
        proveedor: ajusteCantForm.proveedor_nombre,
        proveedor_id: ajusteCantForm.proveedor_id,
        pendiente_nc: true,
        costo_unitario: ajusteCantModal.costo || null,
        stock_anterior: ajusteCantModal.cantidad,
        stock_posterior: nueva,
      })

      // Registrar en CC del proveedor
      await supabase.from('cuenta_corriente_proveedores').insert({
        proveedor_id: ajusteCantForm.proveedor_id,
        proveedor_nombre: ajusteCantForm.proveedor_nombre,
        fecha: new Date().toISOString().slice(0,10), tipo: 'ajuste',
        descripcion: `${notaFinal} — ${ajusteCantModal.descripcion?.slice(0,50)} (${ajusteCantModal.codigo||''})`,
        debe: 0, haber: montoAjuste,
        notas: `pendiente_nc`,
      })
    }

    setAjusteCantModal(null)
    setAjusteCantForm({ tipo: 'entrada', cant: '1', nota: '', motivo: '', pendiente_nc: false, proveedor_id: '', proveedor_nombre: '' })
    setSavingAjuste(false)
    load()
    if (selMov?.id === ajusteCantModal.id) abrirMovimientos({...ajusteCantModal, cantidad: nueva})
  }

  async function abrirMovimientos(s: any) {
    if (selMov?.id === s.id) { setSelMov(null); setSelMovData([]); return }
    setSelMov(s); setLoadingSelMov(true)
    const { data } = await supabase.from('vista_movimientos_stock')
      .select('*').eq('stock_id', s.id)
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(50)
    setSelMovData(data ?? [])
    setLoadingSelMov(false)
  }

  async function cargarMovimientos() {
    setMovLoading(true)
    let q = supabase.from('stock_movimientos')
      .select(`id, tipo, cantidad, costo_unitario, precio_venta_unitario, fecha, descripcion, created_at,
        stock:stock_id(desc_stock:descripcion, codigo),
        compra:comprobante_compra_id(numero, tipo, letra, punto_venta, proveedor_nombre),
        venta:comprobante_venta_id(numero, tipo, categoria, nro_cbte_afip, cliente_nombre, aseguradora_nombre)`)
      .order('fecha', { ascending: false }).order('created_at', { ascending: false }).limit(200)
    if (movFiltroTipo !== 'todos') q = q.eq('tipo', movFiltroTipo)
    const { data } = await q
    setMovs(data ?? [])
    setMovLoading(false)
  }

  const [form, setForm] = useState({ desc: '', cod: '', marca: '', pos: '', anio: '', cant: '1', precio: '', costo: '', dep: 'Principal', minimo: '0', leyenda: '' })
  const [articuloSel, setArticuloSel] = useState<{id:string;descripcion:string;codigo_referencia:string|null}|null>(null)
  const [articuloSugs, setArticuloSugs] = useState<any[]>([])
  const [buscandoArticulo, setBuscandoArticulo] = useState(false)

  // ── Vincular pendientes ──
  const [pendientes, setPendientes] = useState<StockItem[]>([])
  const [loadingPend, setLoadingPend] = useState(false)
  const [vincQ, setVincQ] = useState<Record<string,string>>({})
  const [vincSugs, setVincSugs] = useState<Record<string,any[]>>({})
  const [vincCosto, setVincCosto] = useState<Record<string,string>>({})
  const [vincSel, setVincSel] = useState<Record<string,any>>({})

  // ── Ambiguos: artículos migrados con más de un Pilkington posible ──
  type AmbiguoItem = { stock_id: string; codigo_actual: string; descripcion: string; cantidad: number; opciones: string[] }
  const [ambiguos, setAmbiguos] = useState<AmbiguoItem[]>([])
  const [loadingAmbiguos, setLoadingAmbiguos] = useState(false)
  const [ambigSel, setAmbigSel] = useState<Record<string,string>>({})
  const [ambigGuardando, setAmbigGuardando] = useState<Record<string,boolean>>({})

  const loadAmbiguos = useCallback(async () => {
    setLoadingAmbiguos(true)
    // Traer artículos con código que termina en P y con articulo_id asignado
    // Para cada uno buscar cuántas opciones P existen en el catálogo con los mismos 6 dígitos base
    const { data: stockP } = await supabase
      .from('stock')
      .select('id, codigo, descripcion, cantidad, articulo_id')
      .eq('activo', true)
      .like('codigo', '%P')
      .not('articulo_id', 'is', null)
      .gt('cantidad', 0)
    
    if (!stockP?.length) { setAmbiguos([]); setLoadingAmbiguos(false); return }

    // Para cada uno buscar alternativas en el catálogo con mismos 9 caracteres base y terminando en P
    const result: AmbiguoItem[] = []
    for (const s of stockP) {
      const base9 = s.codigo.slice(0, 9)
      const { data: opciones } = await supabase
        .from('articulos_maestro')
        .select('codigo_referencia')
        .ilike('codigo_referencia', base9 + '%')
        .like('codigo_referencia', '%P')
      if (opciones && opciones.length > 1) {
        result.push({
          stock_id: s.id,
          codigo_actual: s.codigo,
          descripcion: s.descripcion,
          cantidad: s.cantidad,
          opciones: opciones.map((o: any) => o.codigo_referencia).sort()
        })
      }
    }
    setAmbiguos(result)
    setLoadingAmbiguos(false)
  }, [supabase])

  useEffect(() => { if (tab === 'vincular') loadAmbiguos() }, [tab, loadAmbiguos])

  async function confirmarAmbiguo(item: AmbiguoItem) {
    const nuevoCodigo = ambigSel[item.stock_id]
    if (!nuevoCodigo) return
    setAmbigGuardando(p => ({ ...p, [item.stock_id]: true }))
    // Buscar el articulo_maestro_id del código elegido
    const { data: am } = await supabase
      .from('articulos_maestro')
      .select('id')
      .eq('codigo_referencia', nuevoCodigo)
      .single()
    if (am) {
      await supabase.from('stock').update({ codigo: nuevoCodigo, articulo_id: am.id, updated_at: new Date().toISOString() }).eq('id', item.stock_id)
      setAmbiguos(prev => prev.filter(x => x.stock_id !== item.stock_id))
    }
    setAmbigGuardando(p => ({ ...p, [item.stock_id]: false }))
  }

  const load = useCallback(async () => {
    const { data: abrData } = await supabase.from('abreviaturas_descripcion').select('abreviatura,expansion')
    if (abrData) {
      const map: Record<string,string> = {}
      abrData.forEach((a:any) => { map[a.abreviatura.toUpperCase()] = a.expansion })
      setAbreviaturas(map)
    }
    const { data } = await supabase.from('stock').select('*').eq('activo', true).order('descripcion')
    setItems(data ?? [])
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    supabase.from('proveedores_compra').select('id,nombre').eq('activo', true).order('nombre')
      .then(({ data }) => setProveedoresLista(data ?? []))
  }, [supabase])

  const loadPendientes = useCallback(async () => {
    setLoadingPend(true)
    const { data } = await supabase.from('stock').select('*').eq('activo', true).is('articulo_id', null).order('descripcion').limit(200)
    const pends = data ?? []
    setPendientes(pends)
    setLoadingPend(false)
    // Auto-sugerir vinculaciones por código
    autoSugerirPendientes(pends)
  }, [supabase])

  useEffect(() => { if (tab === 'vincular') loadPendientes() }, [tab, loadPendientes])

  useEffect(() => {
    supabase.from('cotizaciones').select('oficial').order('fecha', { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => { if (data?.oficial) setDolarOficial(data.oficial) })
  }, [supabase])

  // Chequeo de consistencia stock vs movimientos
  const [inconsistencias, setInconsistencias] = useState<any[]>([])
  const [showInconsistencias, setShowInconsistencias] = useState(false)
  useEffect(() => {
    supabase.from('vista_inconsistencias_stock').select('*')
      .then(({ data }) => setInconsistencias(data ?? []))
  }, [supabase])

  const depositos = [...new Set(items.map(s => s.deposito || 'Principal'))].sort()

  function normPos(pos: string | null | undefined): string {
    const p = (pos ?? '').trim().toUpperCase()
    if (!p) return 'SIN_POS'
    if (p.startsWith('PARABRISAS')) return 'PARABRISAS'
    if (p.startsWith('LUNETA') || p === 'LUNETAS') return 'LUNETA'
    if (p.startsWith('TECHO')) return 'TECHO'
    if (p.startsWith('PUERTA') || p.startsWith('C.D.') || p.startsWith('PUERTA_') || p.startsWith('C.INF')) {
      if (p.includes('TRASERA') || p.includes('_T')) return p.includes('IZQUIERDA') || p.includes('_TI') ? 'PUERTA_TI' : 'PUERTA_TD'
      if (p.includes('IZQUIERDA') || p.startsWith('C.D.I') || p === 'PUERTA IZQUIERDA') return 'PUERTA_DI'
      return 'PUERTA_DD'
    }
    if (p.startsWith('CUSTODIA') || p.startsWith('CUSODIA')) {
      if (p.includes('IZQUIERDA') || p.includes('IZQUIERDO') || p.includes('_I')) return 'CUSTODIA_I'
      return 'CUSTODIA_D'
    }
    if (p.startsWith('ALETA') || p === 'ALETA_I' || p === 'ALETA_D') return 'ALETA'
    if (p.startsWith('VIDRIO') || p.startsWith('TECHO')) return 'VIDRIO'
    return p
  }

  const resumen = FAMS.map(fam => {
    const arr = items.filter(s => FAM_MAP[normPos(s.pos)] === fam)
    const totalU = arr.reduce((a, s) => a + s.cantidad, 0)
    const valCosto = arr.filter(s => s.costo).reduce((a, s) => a + (s.costo ?? 0) * s.cantidad, 0)
    const sinCosto = arr.filter(s => !s.costo && s.cantidad > 0).length
    return { fam, items: arr.length, totalU, valCosto, sinCosto }
  })
  const valTotalVenta = items.filter(s => s.precio_venta).reduce((a, s) => a + (s.precio_venta ?? 0) * s.cantidad, 0)
  const valTotalVentaNeto = Math.round(valTotalVenta / 1.21)
  const itemsConAmbos = items.filter(s => s.costo && s.precio_venta)
  const uTotal = resumen.reduce((a, r) => a + r.totalU, 0)
  const sinCostoCount = resumen.reduce((a, r) => a + r.sinCosto, 0)
  const valTotalVentaUSD = dolarOficial ? valTotalVentaNeto / dolarOficial : null

  // Cuántas filas de stock todavía no están vinculadas a un artículo maestro —
  // esto es lo que habilita comparar costos consistentemente entre Stock, Compras y Ventas.
  const sinVincularCount = items.filter(s => !(s as any).articulo_id).length

  let visible = items
  if (depFilter) visible = visible.filter(s => (s.deposito || 'Principal') === depFilter)
  if (q) {
    const qUp = q.toUpperCase()
    const palabras = qUp.split(/\s+/).filter(Boolean)
    visible = visible.filter(s => {
      const base = (s.descripcion + ' ' + (s.marca ?? '') + ' ' + (s.codigo ?? '') + ' ' + (s.pos ?? '')).toUpperCase()
      // Expandir abreviaturas en la descripción del artículo
      let expandida = base
      Object.entries(abreviaturas).forEach(([abr, exp]) => {
        expandida = expandida.split(abr).join(exp.toUpperCase())
      })
      // Todas las palabras deben estar presentes (no necesariamente juntas)
      return palabras.every(p => base.includes(p) || expandida.includes(p))
    })
  }
  if (soloSinCosto) visible = visible.filter(s => !s.costo && s.cantidad > 0)
  if (filtroFam) visible = visible.filter(s => FAM_MAP[normPos(s.pos)] === filtroFam)

  async function chgCant(id: string, delta: number) {
    const s = items.find(x => x.id === id)!
    const cant = Math.max(0, s.cantidad + delta)
    // PRIMERO insertar movimiento — así el trigger no duplica
    await supabase.from('stock_movimientos').insert({
      stock_id: id,
      tipo: delta > 0 ? 'entrada' : 'salida',
      cantidad: Math.abs(delta),
      fecha: new Date().toISOString().slice(0,10),
      descripcion: 'Cargar mercadería',
    })
    // DESPUÉS actualizar cantidad
    await setUserCtx()
    await supabase.from('stock').update({ cantidad: cant, updated_at: new Date().toISOString() }).eq('id', id)
    setItems(prev => prev.map(x => x.id === id ? { ...x, cantidad: cant } : x))
  }

  async function saveCosto(id: string, val: string) {
    const c = +val.replace(/[^0-9.]/g, '')
    if (!c) return
    await supabase.from('stock').update({ costo: c, updated_at: new Date().toISOString() }).eq('id', id)
    setItems(prev => prev.map(x => x.id === id ? { ...x, costo: c } : x))
    setCostoEdit(p => { const n = { ...p }; delete n[id]; return n })
  }

  async function del(id: string) {
    if (!confirm('¿Quitar del stock?')) return
    await supabase.from('stock').update({ activo: false, updated_at: new Date().toISOString() }).eq('id', id)
    setItems(prev => prev.filter(x => x.id !== id))
  }

  useEffect(() => {
    if (ajusteSearch.length < 2) { setAjusteSugs([]); return }
    const q = ajusteSearch.toUpperCase()
    setAjusteSugs(items.filter(s => (s.descripcion+' '+(s.marca??'')).toUpperCase().includes(q)).slice(0,6))
  }, [ajusteSearch, items])

  async function saveAjuste() {
    if (!ajusteForm.desc || !ajusteForm.cant) return
    const cant = +ajusteForm.cant || 0
    const costo = ajusteForm.costo ? +ajusteForm.costo.replace(/[^0-9.]/g,'') : null
    if (ajusteStockId) {
      const s = items.find(x => x.id === ajusteStockId)
      if (s) {
        await setUserCtx()
        await supabase.from('stock').update({ cantidad: s.cantidad + cant, ...(costo ? {costo} : {}), updated_at: new Date().toISOString() }).eq('id', ajusteStockId)
      }
    } else {
      await supabase.from('stock').insert({
        descripcion: ajusteForm.desc, cantidad: cant, costo,
        deposito: 'Principal', activo: true
      })
    }
    await supabase.from('ajustes_stock').insert({
      tipo: 'entrada', stock_id: ajusteStockId || null,
      descripcion: ajusteForm.desc, cantidad: cant,
      costo_unitario: costo, proveedor: ajusteForm.prov || null,
      nota: ajusteForm.nota || null
    })
    setAjusteOpen(false)
    setAjusteForm({ desc:'', cant:'1', costo:'', prov:'', nota:'' })
    setAjusteSearch(''); setAjusteStockId(null)
    load()
  }

  function openNuevo() {
    setForm({ desc: '', cod: '', marca: '', pos: '', anio: '', cant: '1', precio: '', costo: '', dep: 'Principal', minimo: '0', leyenda: '' })
    setEditId(null)
    setArticuloSel(null)
    setArticuloSugs([])
    setOpen(true)
  }

  async function openNuevoConCodigo(codigo: string) {
    // Buscar en articulos_maestro por código de referencia
    const { data: art } = await supabase.from('articulos_maestro')
      .select('id,descripcion,codigo_referencia,marca,pos,anio')
      .eq('codigo_referencia', codigo.toUpperCase())
      .maybeSingle()

    // Si no está en el maestro, buscar en catálogo
    const { data: cat } = !art ? await supabase.from('catalogo')
      .select('descripcion,marca,pos')
      .eq('codigo', codigo.toUpperCase())
      .limit(1).maybeSingle() : { data: null }

    const desc = art?.descripcion || cat?.descripcion || ''
    const marca = art?.marca || cat?.marca || ''
    const pos = art?.pos || cat?.pos || ''
    const anio = art?.anio ? String(art.anio) : ''

    setForm({ desc, cod: codigo, marca, pos, anio, cant: '1', precio: '', costo: '', dep: 'Principal', minimo: '0', leyenda: '' })
    setEditId(null)
    setArticuloSel(art ? { id: art.id, descripcion: art.descripcion, codigo_referencia: art.codigo_referencia } : null)
    setArticuloSugs([])
    setOpen(true)
  }

  function openEditar(s: StockItem) {
    setForm({
      desc: s.descripcion, cod: s.codigo || '', marca: s.marca || '',
      pos: s.pos || '', anio: s.anio || '', cant: String(s.cantidad),
      precio: s.precio_venta ? String(s.precio_venta) : '',
      costo: s.costo ? String(s.costo) : '',
      dep: s.deposito || 'Principal',
      minimo: String(s.stock_minimo ?? 0),
      leyenda: '',
    })
    setEditId(s.id)
    if ((s as any).articulo_id) {
      supabase.from('articulos_maestro').select('id,descripcion,codigo_referencia').eq('id', (s as any).articulo_id).maybeSingle()
        .then(({data}) => setArticuloSel(data ?? null))
    } else {
      setArticuloSel(null)
    }
    setArticuloSugs([])
    setOpen(true)
  }

  async function buscarArticulo(texto: string) {
    setForm(p => ({ ...p, desc: texto }))
    setArticuloSel(null)
    if (texto.trim().length < 2) { setArticuloSugs([]); return }
    setBuscandoArticulo(true)
    const { data } = await supabase.from('articulos_maestro')
      .select('id,descripcion,codigo_referencia,marca,pos').eq('activo', true)
      .or(`descripcion.ilike.%${texto}%,sku_interno.ilike.%${texto}%`).limit(6)
    setArticuloSugs(data ?? [])
    setBuscandoArticulo(false)
  }

  function elegirArticulo(a: any) {
    setArticuloSel(a)
    setForm(p => ({ ...p, desc: a.descripcion, marca: a.marca || p.marca, pos: a.pos || p.pos }))
    setArticuloSugs([])
  }

  async function save() {
    if (!form.desc) { alert('Cargá la descripción.'); return }

    let articuloId = articuloSel?.id || null
    if (!articuloId) {
      const { data: nuevo } = await supabase.from('articulos_maestro')
        .insert({ descripcion: form.desc, marca: form.marca || null, pos: form.pos || null, anio: form.anio || null })
        .select('id').single()
      articuloId = nuevo?.id || null
    }

    const payload = {
      descripcion: form.desc, codigo: form.cod || null, marca: form.marca || null,
      pos: form.pos || null, anio: form.anio || null, cantidad: +form.cant || 0,
      precio_venta: form.precio ? +form.precio.replace(/[^0-9.]/g, '') : null,
      costo: form.costo ? +form.costo.replace(/[^0-9.]/g, '') : null,
      deposito: form.dep || 'Principal', updated_at: new Date().toISOString(),
      articulo_id: articuloId,
      stock_minimo: +form.minimo || 0,
    }
    if (editId) {
      await supabase.from('stock').update(payload).eq('id', editId)
    } else {
      const { data: newStock } = await supabase.from('stock').insert(payload).select('id').single()
      // Si tiene cantidad inicial, registrar movimiento de alta
      if (newStock && +form.cant > 0) {
        await supabase.from('stock_movimientos').insert({
          stock_id: newStock.id,
          tipo: 'entrada',
          cantidad: +form.cant,
          fecha: new Date().toISOString().slice(0,10),
          descripcion: form.leyenda.trim() || 'Alta manual de stock',
          user_id: userId || null,
        })
      }
    }
    setOpen(false)
    setForm({ desc: '', cod: '', marca: '', pos: '', anio: '', cant: '1', precio: '', costo: '', dep: 'Principal', minimo: '0', leyenda: '' })
    setEditId(null)
    setArticuloSel(null)
    load()
  }

  // ── Vincular pendientes: buscar artículo maestro para una fila puntual de stock ──
  async function buscarParaVincular(stockId: string, texto: string) {
    setVincQ(p => ({ ...p, [stockId]: texto }))
    setVincSel(p => { const n = { ...p }; delete n[stockId]; return n })
    if (texto.trim().length < 2) { setVincSugs(p => ({ ...p, [stockId]: [] })); return }
    // Buscar por descripción Y por código (Pilkington 9 chars)
    const esCodigo = /^\d/.test(texto.trim())
    let data: any[] = []
    if (esCodigo) {
      const { data: d } = await supabase.from('articulos_maestro')
        .select('id,descripcion,codigo_referencia,sku_interno').eq('activo', true)
        .ilike('codigo_referencia', `${texto.trim()}%`).limit(6)
      data = d ?? []
    }
    if (data.length === 0) {
      const { data: d } = await supabase.from('articulos_maestro')
        .select('id,descripcion,codigo_referencia,sku_interno').eq('activo', true)
        .ilike('descripcion', `%${texto}%`).limit(6)
      data = d ?? []
    }
    setVincSugs(p => ({ ...p, [stockId]: data }))
  }

  // Auto-sugerir por código al cargar la pestaña
  async function autoSugerirPendientes(pends: StockItem[]) {
    const autoSel: Record<string, any> = {}
    const autoQ: Record<string, string> = {}
    for (const s of pends) {
      if (!s.codigo || s.codigo.length < 6) continue
      const codigoBase = s.codigo.slice(0, 9)
      const { data } = await supabase.from('articulos_maestro')
        .select('id,descripcion,codigo_referencia,sku_interno').eq('activo', true)
        .ilike('codigo_referencia', `${codigoBase}%`).limit(1)
      if (data && data.length > 0) {
        autoSel[s.id] = data[0]
        autoQ[s.id] = data[0].descripcion
      }
    }
    if (Object.keys(autoSel).length > 0) {
      setVincSel(p => ({ ...p, ...autoSel }))
      setVincQ(p => ({ ...p, ...autoQ }))
    }
  }

  // Vincular en lote todos los auto-sugeridos
  async function vincularTodosAutoSugeridos() {
    const ids = pendientes.filter(s => vincSel[s.id]).map(s => s.id)
    if (ids.length === 0) return
    if (!confirm(`¿Vincular ${ids.length} artículos automáticamente?`)) return
    for (const id of ids) {
      const s = pendientes.find(x => x.id === id)
      if (!s) continue
      await confirmarVinculo(s)
    }
  }

  function elegirParaVincular(stockId: string, art: any) {
    setVincSel(p => ({ ...p, [stockId]: art }))
    setVincQ(p => ({ ...p, [stockId]: art.descripcion }))
    setVincSugs(p => ({ ...p, [stockId]: [] }))
  }

  // Confirma el vínculo entre la fila de stock y el artículo elegido, y de paso permite
  // cargar el costo en el mismo paso — es el punto en el que más sentido tiene hacerlo,
  // porque ya estás mirando la pieza y decidiendo a qué artículo del catálogo corresponde.
  async function confirmarVinculo(s: StockItem) {
    const art = vincSel[s.id]
    if (!art) return
    const costoVal = vincCosto[s.id] ? +vincCosto[s.id].replace(/[^0-9.]/g, '') : null
    const payload: any = { articulo_id: art.id, updated_at: new Date().toISOString() }
    if (costoVal) payload.costo = costoVal
    await supabase.from('stock').update(payload).eq('id', s.id)
    setPendientes(prev => prev.filter(x => x.id !== s.id))
    setItems(prev => prev.map(x => x.id === s.id ? { ...x, ...payload } : x))
  }

  // Si la pieza no existe todavía en el catálogo maestro, se crea al vuelo con la
  // descripción que ya tiene en stock — mismo criterio que en el alta nueva.
  async function crearArticuloYVincular(s: StockItem) {
    const { data: nuevo } = await supabase.from('articulos_maestro')
      .insert({ descripcion: s.descripcion, marca: s.marca || null, pos: s.pos || null, anio: s.anio || null })
      .select('id,descripcion,codigo_referencia,sku_interno').single()
    if (nuevo) elegirParaVincular(s.id, nuevo)
  }


  function agregarAjuste() {
    if (!ajusteMasivoSel) return
    // Evitar duplicados
    if (ajusteMasivoLista.find(x => x.id === ajusteMasivoSel!.id)) return
    setAjusteMasivoLista(p => [...p, {
      id: ajusteMasivoSel!.id,
      codigo: ajusteMasivoSel!.codigo || '',
      desc: ajusteMasivoSel!.descripcion || '',
      cantActual: ajusteMasivoSel!.cantidad || 0,
      delta: ajusteMasivoDelta,
    }])
    setAjusteMasivoSel(null)
    setAjusteMasivoQ('')
    setAjusteMasivoDelta(0)
  }

  async function procesarExcel(file: File) {
    setExcelLoading(true)
    try {
      const XLSX = await import('xlsx')
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' })

      const resultado: typeof excelPreview = []

      for (const row of rows) {
        const codigoRaw = String(row['Codigo'] || row['codigo'] || row['CODIGO'] || '').trim().toUpperCase()
        const nombre = String(row['Nombre'] || row['Nombre '] || row['nombre'] || row['NOMBRE'] || '').trim()
        const marca  = String(row['Marca']  || row['marca']  || row['MARCA']  || '').trim()
        // Cantidad contada: columna sin header (Unnamed: 4) o columna "Cantidad"
        const cantExcelRaw = row['__EMPTY'] ?? row['Unnamed: 4'] ?? row['Cantidad'] ?? row['cantidad'] ?? row['CANTIDAD'] ?? null
        // Vacío o NaN = se contó 0; null solo si la fila no tiene columna cantidad en absoluto
        const cantExcel: number = (cantExcelRaw === null || cantExcelRaw === '') ? 0 : Number(cantExcelRaw)
        if (!codigoRaw || codigoRaw === 'NAN') continue

        // Excel borra ceros a la izquierda → generar variantes con 0s al frente hasta 10 chars
        const codigoVariants = [codigoRaw]
        if (/^[0-9]/.test(codigoRaw)) {
          // Solo para códigos que empiezan con número (los alfanuméricos como FAVICUR no necesitan esto)
          let padded = codigoRaw
          while (padded.length < 10) {
            padded = '0' + padded
            codigoVariants.push(padded)
          }
        }

        // Buscar en stock activo por código exacto o variante con ceros (case-insensitive)
        // Usar el PRIMER match por código — si hay múltiples con mismo código (ej: ORIGINAL)
        // solo tomamos el que tiene descripción más similar al Excel
        const stockMatches = items.filter(s =>
          codigoVariants.includes((s.codigo || '').toUpperCase()) && (s as any).activo !== false
        )
        const stockMatch = stockMatches.length === 1
          ? stockMatches[0]
          : stockMatches.find(s => (s.descripcion||'').toLowerCase().includes(nombre.toLowerCase()))
            ?? stockMatches[0]
        const codigo = stockMatch ? (stockMatch.codigo || codigoRaw).toUpperCase() : codigoRaw

        if (stockMatch) {
          const deltaExcel = cantExcel - (stockMatch.cantidad || 0)
          resultado.push({
            codigo, nombre: stockMatch.descripcion || nombre, marca,
            stockId: stockMatch.id, cantActual: stockMatch.cantidad || 0,
            maestroId: (stockMatch as any).articulo_id || null,
            estado: 'existe', deltaExcel,
          })
        } else {
          // Buscar en articulos_maestro probando cada variante de código
          let am: any = null
          for (const v of codigoVariants) {
            const { data } = await supabase
              .from('articulos_maestro')
              .select('id,descripcion,marca')
              .ilike('codigo_referencia', v)
              .limit(1)
            if (data?.[0]) { am = data[0]; break }
          }

          resultado.push({
            codigo, nombre: am?.descripcion || nombre, marca: am?.marca || marca,
            stockId: null, cantActual: 0,
            maestroId: am?.id || null,
            estado: am ? 'sin_stock' : 'nuevo',
            deltaExcel: cantExcel ?? 0,
          })
        }
      }

      setExcelPreview(resultado)
      setExcelPreviewOpen(true)
    } catch (e: any) {
      alert('Error al leer el Excel: ' + e.message)
    } finally {
      setExcelLoading(false)
    }
  }

  async function confirmarExcel() {
    setExcelLoading(true)
    const fecha = new Date().toISOString().slice(0,10)
    const nuevosALista: typeof ajusteMasivoLista = []

    for (const r of excelPreview) {
      if (r.estado === 'existe' && r.stockId) {
        // Ya tiene stock → agregar directo. Dedup: no agregar si ya está en nuevosALista o en lista existente
        if (!ajusteMasivoLista.find(x => x.id === r.stockId) && !nuevosALista.find(x => x.id === r.stockId)) {
          nuevosALista.push({ id: r.stockId, codigo: r.codigo, desc: r.nombre, cantActual: r.cantActual, delta: r.deltaExcel ?? 0 })
        }
      } else if (r.estado === 'sin_stock' && r.maestroId) {
        // Existe en maestro pero sin fila en stock → crear fila con cantidad 0
        const { data: newStock } = await supabase.from('stock').insert({
          descripcion: r.nombre,
          codigo: r.codigo,
          marca: r.marca || null,
          cantidad: 0,
          deposito: 'Principal',
          activo: true,
          articulo_id: r.maestroId,
          updated_at: new Date().toISOString(),
        }).select('id').single()

        if (newStock) {
          // Movimiento de alta con cantidad 0
          await supabase.from('stock_movimientos').insert({
            stock_id: newStock.id,
            tipo: 'entrada',
            cantidad: 0,
            fecha,
            descripcion: 'Alta desde carga Excel — pendiente conteo',
          })
          nuevosALista.push({ id: newStock.id, codigo: r.codigo, desc: r.nombre, cantActual: 0, delta: r.deltaExcel ?? 0 })
        }
      }
      // estado === 'nuevo': no se puede crear sin datos completos, se ignora
    }

    // Refrescar items del estado local
    const { data: itemsRefresh } = await supabase.from('stock').select('*').eq('activo', true)
    if (itemsRefresh) setItems(itemsRefresh as any)

    setAjusteMasivoLista(p => [...p, ...nuevosALista])
    setExcelLoading(false)
    setExcelPreviewOpen(false)
    setExcelPreview([])
  }

  // Helper: setear user_id en contexto PostgreSQL para el trigger
  async function setUserCtx() {
    if (!userId) return
    try { await supabase.rpc('set_config', { key: 'app.current_user_id', value: userId, is_local: true }) } catch(_) {}
  }

  async function guardarAjusteMasivo() {
    if (!ajusteMasivoLeyenda.trim() || !ajusteMasivoLista.length) return
    setAjusteMasivoLoading(true)
    const fecha = new Date().toISOString().slice(0,10)
    // Desactivar trigger antes del loop para evitar doble movimiento
    try { await supabase.rpc('set_config', { key: 'app.skip_stock_trigger', value: 'true', is_local: true }) } catch(_) {}
    for (const it of ajusteMasivoLista) {
      const nueva = it.cantActual + it.delta
      if (it.delta !== 0) {
        // INSERT movimiento ANTES del UPDATE (regla crítica)
        await supabase.from('stock_movimientos').insert({
          stock_id: it.id,
          tipo: it.delta > 0 ? 'entrada' : 'salida',
          cantidad: Math.abs(it.delta),
          fecha,
          descripcion: ajusteMasivoLeyenda.trim(),
          user_id: userId || null,
        })
        await setUserCtx()
        await supabase.from('stock').update({ cantidad: nueva }).eq('id', it.id)
        setItems(prev => prev.map(s => s.id===it.id ? {...s, cantidad: nueva} : s))
      } else {
        // Delta 0 — registrar conteo confirmado
        await supabase.from('stock_movimientos').insert({
          stock_id: it.id,
          tipo: 'entrada',
          cantidad: 0,
          fecha,
          descripcion: `Conteo confirmado · ${ajusteMasivoLeyenda.trim()}`,
          user_id: userId || null,
        })
      }
    }
    // Reactivar trigger
    try { await supabase.rpc('set_config', { key: 'app.skip_stock_trigger', value: 'false', is_local: true }) } catch(_) {}
    setAjusteMasivoLoading(false)
    setAjusteMasivoOpen(false)
    setAjusteMasivoLista([])
    setAjusteMasivoLeyenda('')
  }

  async function generarConteo() {
    const { jsPDF } = await import('jspdf')
    const doc = new jsPDF({ format: 'a4', unit: 'mm' })
    const fams = filtroFam ? [filtroFam] : FAMS
    let firstPage = true
    fams.forEach(fam => {
      const arts = items.filter(s => FAM_MAP[normPos(s.pos)] === fam && s.activo && s.cantidad >= 0)
      if (!arts.length) return
      if (!firstPage) doc.addPage()
      firstPage = false
      doc.setFont('helvetica','bold'); doc.setFontSize(14); doc.setTextColor(0,0,0)
      doc.text(`Conteo de Stock — ${fam}`, 10, 15)
      doc.setFontSize(8); doc.setFont('helvetica','normal'); doc.setTextColor(100,100,100)
      doc.text(new Date().toLocaleDateString('es-AR'), 10, 21)
      const cols = [10, 50, 120, 145, 165, 190]
      const headers = ['Código','Descripción','Cant. sistema','Conteo','Diferencia','Obs.']
      doc.setFillColor(220,220,220); doc.rect(10, 25, 190, 7, 'FD')
      doc.setFont('helvetica','bold'); doc.setFontSize(7); doc.setTextColor(0,0,0)
      headers.forEach((h,i) => doc.text(h, cols[i]+1, 30.5))
      let y = 32
      arts.forEach((s,idx) => {
        if (y > 275) { doc.addPage(); y = 20 }
        if (idx % 2 === 0) { doc.setFillColor(248,248,248); doc.rect(10, y, 190, 8, 'F') }
        doc.setDrawColor(200,200,200); doc.setLineWidth(0.2); doc.line(10, y+8, 200, y+8)
        doc.setFont('helvetica','normal'); doc.setFontSize(7); doc.setTextColor(0,0,0)
        doc.text((s.codigo||'').slice(0,15), cols[0]+1, y+5.5)
        doc.text((s.descripcion||'').slice(0,38), cols[1]+1, y+5.5)
        doc.text(String(s.cantidad), cols[2]+1, y+5.5)
        doc.setDrawColor(0,0,0); doc.setLineWidth(0.3)
        doc.rect(cols[3], y+1, 18, 6, 'S')
        doc.rect(cols[4], y+1, 23, 6, 'S')
        doc.rect(cols[5], y+1, 10, 6, 'S')
        y += 8
      })
      doc.setFont('helvetica','italic'); doc.setFontSize(7); doc.setTextColor(100,100,100)
      doc.text(`Total: ${arts.length} artículos`, 10, y+5)
    })
    doc.save('conteo-stock.pdf')
  }

  async function generarEtiqueta(s: typeof items[0]) {
    const { jsPDF } = await import('jspdf')
    const doc = new jsPDF({ format: [80, 80], unit: 'mm', putOnlyUsedFonts: true })
    const code = s.codigo||'000000'
    doc.setFont('helvetica','bold'); doc.setFontSize(13); doc.setTextColor(0,0,0)
    doc.text(code, 40, 10, { align: 'center' })
    // Barcode simple con líneas
    const barY = 14; const barH = 28; let bx = 5
    doc.setFillColor(0,0,0)
    for (let i=0; i<code.length; i++) {
      const w = (code.charCodeAt(i) % 3) * 0.4 + 0.8
      doc.rect(bx, barY, w, barH, 'F')
      bx += w + ((code.charCodeAt(i) % 2) === 0 ? 0.8 : 1.2)
      if (bx > 74) break
    }
    doc.setFont('helvetica','normal'); doc.setFontSize(7); doc.setTextColor(0,0,0)
    doc.text((s.descripcion||'').slice(0,50), 40, 48, { align: 'center', maxWidth: 70 })
    if (s.marca) {
      doc.setFontSize(6); doc.setTextColor(100,100,100)
      doc.text(s.marca, 40, 56, { align: 'center' })
    }
    // Abrir en nueva ventana para imprimir directamente
    const blob2 = doc.output('blob')
    const url2 = URL.createObjectURL(blob2)
    const win = window.open(url2, '_blank')
    if (win) { win.onload = () => { win.focus(); win.print() } }
  }

  return (
    <div>
      {/* Tabs */}
      <div className="flex gap-2 mb-4 border-b border-p-line2">
        <button onClick={() => setTab('inventario')}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${tab==='inventario' ? 'border-p-green text-p-green' : 'border-transparent text-p-ink2 hover:text-p-ink'}`}>
          📦 Inventario
        </button>
        {isAdmin && (
          <button onClick={() => setTab('vincular')}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${tab==='vincular' ? 'border-amber-500 text-amber-600' : 'border-transparent text-p-ink2 hover:text-p-ink'}`}>
            🔗 Vincular a artículo
            {sinVincularCount > 0 && <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">{sinVincularCount}</span>}
          </button>
        )}

      </div>

      {tab === 'vincular' ? (
        <div>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4">
            <p className="text-sm text-amber-800">
              Vinculá cada pieza con su artículo del catálogo maestro — así Compras, Ventas y Stock comparten el mismo costo y el mismo identificador (SKU). Podés buscar por <strong>código Pilkington</strong> o por descripción.
            </p>
          </div>
          {/* ── Sección ambiguos: artículos migrados con más de un Pilkington posible ── */}
          {loadingAmbiguos ? (
            <p className="text-sm text-p-gray text-center py-4">Buscando artículos con código ambiguo…</p>
          ) : ambiguos.length > 0 ? (
            <div className="mb-6">
              <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 mb-3 flex items-center gap-2">
                <span className="text-lg">⚠️</span>
                <div>
                  <p className="text-sm font-semibold text-orange-800">{ambiguos.length} artículo(s) con código Pilkington ambiguo</p>
                  <p className="text-xs text-orange-700">Fueron migrados automáticamente pero tienen más de una variante posible. Revisá y elegí el código correcto.</p>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                {ambiguos.map(item => (
                  <div key={item.stock_id} className="bg-white border border-orange-200 rounded-xl p-3 flex items-center gap-3 flex-wrap">
                    <div className="min-w-[200px]">
                      <p className="font-medium text-sm text-p-ink">{item.descripcion}</p>
                      <p className="text-xs text-p-ink2">{item.cantidad} u. · actual: <span className="font-mono font-bold text-orange-700">{item.codigo_actual}</span></p>
                    </div>
                    <div className="flex-1 min-w-[200px]">
                      <p className="text-xs text-p-ink2 mb-1">Elegir código correcto:</p>
                      <div className="flex gap-2 flex-wrap">
                        {item.opciones.map(op => (
                          <button
                            key={op}
                            onClick={() => setAmbigSel(p => ({ ...p, [item.stock_id]: op }))}
                            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold border transition-colors ${
                              ambigSel[item.stock_id] === op
                                ? 'bg-p-green text-white border-p-green'
                                : op === item.codigo_actual
                                  ? 'bg-orange-100 text-orange-700 border-orange-300'
                                  : 'bg-white text-p-ink border-p-line hover:border-p-green'
                            }`}>
                            {op === item.codigo_actual ? `${op} ← actual` : op}
                          </button>
                        ))}
                      </div>
                    </div>
                    <button
                      onClick={() => confirmarAmbiguo(item)}
                      disabled={!ambigSel[item.stock_id] || ambigSel[item.stock_id] === item.codigo_actual || ambigGuardando[item.stock_id]}
                      style={{
                        background: ambigSel[item.stock_id] && ambigSel[item.stock_id] !== item.codigo_actual ? '#00A550' : '#d1d5db',
                        color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontWeight: 700, fontSize: 12,
                        cursor: ambigSel[item.stock_id] && ambigSel[item.stock_id] !== item.codigo_actual ? 'pointer' : 'not-allowed'
                      }}>
                      {ambigGuardando[item.stock_id] ? '…' : '✓ Confirmar'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* ── Pendientes sin vincular ── */}
          {loadingPend ? <p className="text-sm text-p-gray text-center py-10">Buscando pendientes y auto-sugiriendo…</p> :
           pendientes.length === 0 ? <Empty msg="¡Sin pendientes! Todo el stock está vinculado a su artículo." /> : (<>
            {/* Botón vincular en lote si hay auto-sugeridos */}
            {(() => {
              const autoCount = pendientes.filter(s => vincSel[s.id]).length
              return autoCount > 0 ? (
                <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 mb-3 flex items-center justify-between">
                  <p className="text-sm text-green-800">✨ <strong>{autoCount}</strong> artículo(s) con sugerencia automática por código Pilkington</p>
                  <button onClick={vincularTodosAutoSugeridos} style={{background:'#00A550',color:'#fff',border:'none',borderRadius:8,padding:'8px 16px',fontWeight:700,fontSize:13,cursor:'pointer'}}>
                    ✓ Vincular todos ({autoCount})
                  </button>
                </div>
              ) : null
            })()}
            <div className="flex flex-col gap-2">
              {pendientes.map(s => (
                <div key={s.id} className={`bg-white border rounded-xl p-3 flex items-center gap-3 flex-wrap ${vincSel[s.id] ? 'border-green-300 bg-green-50/30' : 'border-p-line'}`}>
                  <div className="min-w-[180px]">
                    <p className="font-medium text-sm text-p-ink">{s.descripcion}</p>
                    <p className="text-xs text-p-ink2">{[s.marca, s.codigo ? 'cód '+s.codigo : null, s.cantidad+' u.'].filter(Boolean).join(' · ')}</p>
                  </div>
                  <div className="relative flex-1 min-w-[220px]">
                    <input value={vincQ[s.id] ?? ''} onChange={e => buscarParaVincular(s.id, e.target.value)}
                      placeholder={s.codigo ? `Buscar por código (${s.codigo}) o descripción…` : "Buscar artículo del catálogo…"}
                      className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-p-green ${vincSel[s.id] ? 'border-green-300 bg-green-50' : 'border-p-line'}`}/>
                    {vincSel[s.id] && (
                      <p className="text-[10px] text-green-600 font-semibold mt-0.5">✓ {vincSel[s.id].codigo_referencia || vincSel[s.id].sku_interno}</p>
                    )}
                    {(vincSugs[s.id]?.length ?? 0) > 0 && (
                      <div className="absolute z-20 top-full left-0 right-0 bg-white border border-p-line rounded-xl shadow-xl max-h-48 overflow-y-auto mt-1">
                        {vincSugs[s.id].map((a:any) => (
                          <button key={a.id} onClick={() => elegirParaVincular(s.id, a)}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-p-light border-b border-p-line2 last:border-0">
                            <p className="font-medium text-p-ink">{a.descripcion}</p>
                            <p className="text-[10px] font-mono text-p-ink2">{a.sku_interno}{a.codigo_referencia ? ' · '+a.codigo_referencia : ''}</p>
                          </button>
                        ))}
                      </div>
                    )}
                    {vincQ[s.id]?.trim().length >= 2 && !vincSel[s.id] && (vincSugs[s.id]?.length ?? 0) === 0 && (
                      <button onClick={() => crearArticuloYVincular(s)} className="text-[11px] text-blue-600 underline mt-1">
                        + Crear artículo nuevo con esta descripción
                      </button>
                    )}
                  </div>
                  <input value={vincCosto[s.id] ?? (s.costo ? String(Math.round(s.costo)) : '')}
                    onChange={e => setVincCosto(p => ({ ...p, [s.id]: e.target.value }))}
                    placeholder="costo" title="Costo de venta: costo consumidor final + recargo tarjeta + IVA"
                    className="w-24 border border-p-line rounded-lg px-2 py-2 text-xs font-mono focus:outline-none focus:border-p-green"/>
                  <button onClick={() => confirmarVinculo(s)} disabled={!vincSel[s.id]}
                    style={{background: vincSel[s.id] ? '#00A550' : '#d1d5db', color:'#fff', border:'none', borderRadius:8, padding:'8px 14px', fontWeight:700, fontSize:12, cursor: vincSel[s.id] ? 'pointer' : 'not-allowed'}}>
                    ✓ Vincular
                  </button>
                </div>
              ))}
            </div>
          </>)}
        </div>
      ) : (
      <>
      {/* Resumen por familia */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {resumen.map(r => (
          <div key={r.fam}
            onClick={()=>{ setFiltroFam(filtroFam===r.fam?null:r.fam); setQ(''); setSoloSinCosto(false) }}
            className={`border rounded-xl p-4 shadow-sm cursor-pointer transition-all ${filtroFam===r.fam?'border-p-green bg-green-50':'bg-white border-p-line hover:border-p-green'}`}>
            <p className="text-xs font-semibold text-p-ink2 uppercase tracking-wider">{FAM_ICON[r.fam]} {r.fam}</p>
            <p className="font-saira font-bold text-2xl text-p-ink mt-1">{r.totalU}<span className="text-sm font-normal text-p-ink2"> u. / {r.items} mod.</span></p>
            <p className="font-mono text-xs text-p-dark mt-1">{r.valCosto > 0 ? moneyARS(r.valCosto) : 'sin costo'}</p>
          </div>
        ))}
      </div>

      {/* Alerta de stock bajo mínimo */}
      {(() => {
        const bajoMinimo = items.filter(s => s.activo && s.stock_minimo > 0 && s.cantidad < s.stock_minimo)
        if (!bajoMinimo.length) return null
        return (
          <div className="rounded-xl border border-red-300 bg-red-50 px-5 py-3.5 mb-3">
            <p className="text-[11px] font-bold text-red-700 uppercase tracking-wider mb-2">
              ⚠ {bajoMinimo.length} artículo(s) por debajo del stock mínimo
            </p>
            <div className="flex flex-col gap-1.5">
              {bajoMinimo.slice(0,8).map(s=>(
                <div key={s.id} className="flex items-center justify-between text-xs">
                  <span className="text-red-800 font-semibold truncate flex-1">{s.descripcion}</span>
                  <span className="font-mono text-red-600 ml-3 shrink-0">
                    {s.cantidad} u. / mín. {s.stock_minimo}
                  </span>
                </div>
              ))}
              {bajoMinimo.length > 8 && <p className="text-[10px] text-red-500">+{bajoMinimo.length-8} más…</p>}
            </div>
          </div>
        )
      })()}

      {isAdmin && (
        <div className="grid grid-cols-2 gap-3 mb-3">
          {/* Costo total del stock */}
          <div style={{background:'#E6F5EC',border:'1px solid #BFE6CE'}} className="rounded-xl px-5 py-3.5">
            <p style={{color:'#1E8449'}} className="text-xs font-semibold uppercase tracking-wider">📦 Costo del stock</p>
            <p style={{color:'#0E5A2C'}} className="font-saira font-bold text-2xl mt-1">
              {moneyARS(items.filter(s=>s.costo&&s.costo>0).reduce((a,s)=>a+(s.costo??0)*s.cantidad,0))}
            </p>
            {valTotalVentaUSD != null && (
              <p style={{color:'#1E8449'}} className="font-mono text-sm mt-0.5">
                US$ {(items.filter(s=>s.costo&&s.costo>0).reduce((a,s)=>a+(s.costo??0)*s.cantidad,0)/dolarOficial!).toLocaleString('es-AR',{maximumFractionDigits:0})}
              </p>
            )}
            <p style={{color:'#5B9C75'}} className="text-xs mt-1">
              {items.filter(s=>s.costo&&s.costo>0&&s.cantidad>0).length} artículos con costo · {sinCostoCount > 0 ? `${sinCostoCount} sin costo` : 'todos con costo ✓'}
            </p>
          </div>
          {/* Precio de venta total */}
          <div style={{background:'#EBF4FB',border:'1px solid #BFD9F0'}} className="rounded-xl px-5 py-3.5">
            <p style={{color:'#1A5276'}} className="text-xs font-semibold uppercase tracking-wider">💰 Valorizado (precio venta)</p>
            <p style={{color:'#154360'}} className="font-saira font-bold text-2xl mt-1">{moneyARS(valTotalVentaNeto)}</p>
            {valTotalVentaUSD != null && <p style={{color:'#1A5276'}} className="font-mono text-sm mt-0.5">US$ {valTotalVentaUSD.toLocaleString('es-AR',{maximumFractionDigits:0})}</p>}
            <p style={{color:'#5D8AA8'}} className="text-xs mt-1">
              Margen potencial (neto s/IVA): {valTotalVenta > 0 && items.filter(s=>s.costo&&s.costo>0).reduce((a,s)=>a+(s.costo??0)*s.cantidad,0) > 0
                ? moneyARS((valTotalVenta / 1.21) - items.filter(s=>s.costo&&s.costo>0).reduce((a,s)=>a+(s.costo??0)*s.cantidad,0))
                : '—'}
            </p>
          </div>
        </div>
      )}
      {dolarOficial && isAdmin && (
        <p style={{color:'#6b7280'}} className="text-[11px] mb-3">Dólar oficial: {moneyARS(dolarOficial)}</p>
      )}

      {filtroFam && (
        <div className="bg-green-50 border border-p-green rounded-xl px-4 py-2 mb-2 flex items-center justify-between text-sm">
          <span className="font-semibold text-p-green">Filtrando: {filtroFam}</span>
          <button onClick={()=>setFiltroFam(null)} className="text-p-green hover:text-p-dark font-bold ml-2">✕ limpiar</button>
        </div>
      )}
      {sinVincularCount > 0 && isAdmin && (
        <div onClick={() => setTab('vincular')} className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 mb-2 cursor-pointer hover:bg-amber-100 transition-colors flex items-center justify-between">
          <p className="text-sm text-amber-800">🔗 <strong>{filtroFam ? items.filter(s => !(s as any).articulo_id && FAM_MAP[normPos(s.pos)] === filtroFam).length : sinVincularCount}</strong> artículos sin vincular{filtroFam ? ` (${filtroFam})` : ' al catálogo'}</p>
          <span className="text-xs font-bold text-amber-700">Vincular →</span>
        </div>
      )}
      {sinCostoCount > 0 && isAdmin && (
        <div onClick={()=>setSoloSinCosto(true)} className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-2.5 mb-3 cursor-pointer hover:bg-orange-100 transition-colors flex items-center justify-between">
          <p className="text-sm text-orange-800">⚠ <strong>{filtroFam ? items.filter(s => !s.costo && s.cantidad > 0 && FAM_MAP[normPos(s.pos)] === filtroFam).length : sinCostoCount}</strong> artículos sin costo{filtroFam ? ` (${filtroFam})` : ' — no suman al valor'}</p>
          <span className="text-xs font-bold text-orange-700">Ver →</span>
        </div>
      )}
      {inconsistencias.length > 0 && isAdmin && (
        <div className="bg-red-50 border border-red-200 rounded-xl mb-3 overflow-hidden">
          <div className="px-4 py-2.5 flex items-center justify-between">
            <p className="text-sm text-red-800 cursor-pointer hover:underline" onClick={()=>setShowInconsistencias(v=>!v)}>🔍 <strong>{inconsistencias.length}</strong> artículo(s) con stock desincronizado de sus movimientos{filtroFam ? ` — filtrando: ${filtroFam}` : ''}</p>
            <div className="flex items-center gap-3">
              {filtroFam && <button onClick={()=>setFiltroFam(null)} className="text-xs text-red-600 hover:underline">limpiar filtro</button>}
              <span className="text-xs font-bold text-red-700 cursor-pointer" onClick={()=>setShowInconsistencias(v=>!v)}>{showInconsistencias ? 'Ocultar ▲' : 'Ver detalle ▼'}</span>
            </div>
          </div>
          {showInconsistencias && (
            <div className="border-t border-red-200 max-h-64 overflow-y-auto">
              {inconsistencias.filter((inc:any) => !filtroFam || FAM_MAP[normPos((inc.stock as any)?.pos || inc.pos || '')] === filtroFam).map((inc:any)=>{
                return (
                <div key={inc.stock_id}
                  onDoubleClick={async ()=>{
                    // Poner el código en el buscador para que aparezca en la lista
                    setQ(inc.codigo)
                    // Buscar el artículo y abrir sus movimientos
                    const { data } = await supabase.from('stock').select('*').eq('id', inc.stock_id).maybeSingle()
                    if (data) {
                      setTimeout(() => abrirMovimientos(data), 100)
                    }
                  }}
                  className="flex items-center gap-3 px-4 py-2 border-b border-red-100 last:border-0 text-xs cursor-pointer hover:bg-red-100/50"
                  title="Doble click para ver en lista y movimientos">
                  <span className="font-mono bg-red-100 text-red-700 px-1.5 py-0.5 rounded">{inc.codigo}</span>
                  <span className="flex-1 truncate text-red-900">{inc.descripcion}</span>
                  <span className="text-red-600">stock: <strong>{inc.stock_actual}</strong></span>
                  <span className="text-red-500">movs: <strong>{inc.total_movimientos}</strong></span>
                  <span className={`font-bold ${inc.diferencia > 0 ? 'text-amber-600' : 'text-red-700'}`}>
                    {inc.diferencia > 0 ? '+' : ''}{inc.diferencia}
                  </span>
                </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Controles */}
      <div className="flex items-center gap-2 flex-wrap mb-4">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Filtrar por modelo, marca o código…"
          className="flex-1 min-w-[200px] border border-p-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-p-green" />
        <select value={depFilter} onChange={e => setDepFilter(e.target.value)}
          className="border border-p-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-p-green bg-white">
          <option value="">Todos los depósitos</option>
          {depositos.map(d => <option key={d}>{d}</option>)}
        </select>
        {isAdmin && <button onClick={() => setSoloSinCosto(!soloSinCosto)}
          className={`text-xs font-bold px-3 py-2 rounded-lg border transition-colors ${soloSinCosto ? 'bg-amber-100 text-amber-700 border-amber-300' : 'border-p-line text-p-ink2 hover:bg-p-light'}`}>
          {soloSinCosto ? '✕ Solo sin costo' : '⚠ Solo sin costo'}
        </button>}
        <button onClick={openNuevo} style={{background:"#00A550",color:"#fff",border:"none",borderRadius:8,padding:"7px 14px",fontWeight:700,fontSize:12,cursor:"pointer"}}>+ Agregar</button>
        <button onClick={() => setAjusteOpen(true)}
          style={{background:'#1d4ed8',color:'#fff',border:'none',borderRadius:8,padding:'7px 14px',fontWeight:700,fontSize:12,cursor:'pointer'}}>
          📥 Cargar mercadería
        </button>
        {isAdmin && <button onClick={generarConteo}
          style={{background:'#7c3aed',color:'#fff',border:'none',borderRadius:8,padding:'7px 14px',fontWeight:700,fontSize:12,cursor:'pointer'}}>
          📋 Conteo
        </button>}
        {isAdmin && <button onClick={()=>{setAjusteMasivoOpen(true);setAjusteMasivoLista([]);setAjusteMasivoSel(null);setAjusteMasivoQ('');setAjusteMasivoDelta(0);setAjusteMasivoNota('')}}
          style={{background:'#059669',color:'#fff',border:'none',borderRadius:8,padding:'7px 14px',fontWeight:700,fontSize:12,cursor:'pointer'}}>
          📊 Ajuste masivo
        </button>}
      </div>

      <p className="text-xs text-p-ink2 mb-3">{visible.length} ítems · {visible.reduce((a, s) => a + s.cantidad, 0)} u.</p>

      {loading ? <p className="text-sm text-p-gray text-center py-10">Cargando…</p> :
        visible.length === 0 ? (
          q ? (
            <div className="bg-white border border-p-line rounded-xl px-5 py-6 text-center flex flex-col items-center gap-3">
              <p className="text-p-ink2 text-sm">No hay artículos con <span className="font-mono font-bold text-p-ink">"{q}"</span> en stock.</p>
              <p className="text-xs text-p-ink2">¿Querés agregarlo?</p>
              <button onClick={()=> openNuevoConCodigo(q)}
                style={{background:'#00A550',color:'#fff',border:'none',borderRadius:8,padding:'9px 20px',fontWeight:700,fontSize:13,cursor:'pointer'}}>
                + Agregar "{q}" al stock
              </button>
            </div>
          ) : <Empty msg="Sin ítems con ese filtro." />
        ) : (
          <div className="flex flex-col gap-2">
            {visible.slice(0, 300).map(s => {
              const precioNeto = s.precio_venta ? Math.round(s.precio_venta / 1.21) : null
              return (
              <div key={s.id}>
                <div onDoubleClick={() => abrirMovimientos(s)} title="Doble click para ver movimientos"
                  className={`bg-white border rounded-xl px-4 py-3 shadow-sm flex items-center gap-3 flex-wrap cursor-pointer ${
                    selMov?.id === s.id ? 'border-p-green' :
                    s.stock_minimo > 0 && s.cantidad < s.stock_minimo ? 'border-l-4 border-l-red-400 border-p-line' :
                    !s.costo && s.cantidad > 0 ? 'border-l-4 border-l-amber-400 border-p-line' : 'border-p-line'
                  }`}>
                  <div className={`font-saira font-bold text-xl min-w-[32px] text-center ${s.cantidad > 0 ? 'text-p-green' : 'text-red-400'}`}>{s.cantidad}</div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-p-ink truncate">{s.descripcion}{s.anio ? ' · ' + s.anio : ''}</p>
                    <p className="text-xs text-p-ink2 truncate">{[s.marca, POS_LABEL[s.pos ?? ''] ?? s.pos, s.codigo ? 'cód ' + s.codigo : null, '📦 ' + (s.deposito || 'Principal'), !(s as any).articulo_id ? '⚠ sin vincular' : null].filter(Boolean).join(' · ')}</p>
                  </div>
                  <div className="text-right min-w-[80px]">
                    {(s as any).pendiente_ingreso ? (
                      <p className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">⏳ Pend. ingreso</p>
                    ) : (
                      <>
                        {precioNeto && <p className="font-mono font-bold text-sm text-p-ink">{moneyARS(precioNeto)}</p>}
                        <p className="text-[10px] text-p-ink2 uppercase">venta s/IVA</p>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {isAdmin && <>
                      <button onClick={e=>{e.stopPropagation();setAjusteCantModal(s);setAjusteCantForm({tipo:'entrada',cant:'1',nota:'',motivo:'',pendiente_nc:false,proveedor_id:'',proveedor_nombre:''})}}
                        className="text-xs border border-p-line rounded-lg px-2 py-1 text-p-ink hover:bg-p-light font-semibold" title="Ajustar cantidad">⚖ Ajustar</button>
                      <button onClick={e=>{e.stopPropagation();openEditar(s)}} className="w-7 h-7 border border-blue-200 rounded-lg text-sm text-blue-500 hover:text-blue-700 hover:bg-blue-50" title="Editar artículo">✏</button>
                      <button onClick={e=>{e.stopPropagation();generarEtiqueta(s)}} className="w-7 h-7 border border-purple-200 rounded-lg text-sm text-purple-500 hover:bg-purple-50" title="Imprimir etiqueta">🏷</button>
                    </>}
                    <button onClick={e=>{e.stopPropagation();abrirMovimientos(s)}} className="w-7 h-7 border border-p-line rounded-lg text-sm text-p-ink2 hover:bg-p-light" title="Ver movimientos">📊</button>
                  </div>
                </div>
                {selMov?.id === s.id && (
                  <div className="bg-white border border-p-green border-t-0 rounded-b-xl shadow-sm overflow-hidden mb-1">
                    <div className="flex items-center justify-between px-4 py-2 bg-green-50 border-b border-p-line2">
                      <span className="font-semibold text-sm text-p-green">📊 Movimientos — {selMov.descripcion}</span>
                      <button onClick={()=>{setSelMov(null);setSelMovData([])}} className="text-p-gray hover:text-p-ink">✕</button>
                    </div>
                    {loadingSelMov ? <p className="text-sm text-p-gray text-center py-4">Cargando…</p>
                    : selMovData.length === 0 ? <p className="text-sm text-p-gray text-center py-4">Sin movimientos.</p>
                    : (
                      <div className="divide-y divide-p-line2 max-h-56 overflow-y-auto">
                        {selMovData.map((m:any)=>{
                          const tieneCompra = !!m.comprobante_compra_id
                          const tieneVenta = !!m.comprobante_venta_id
                          const esPendienteNC = !!m.pendiente_nc
                          // Armar etiqueta consistente: prioridad descripcion del movimiento,
                          // si no, construir desde el join de compra con formato uniforme
                          const etiqueta = (() => {
                            if (m.descripcion) return m.descripcion
                            if (m.compra) {
                              const c = m.compra
                              const tipoLabel = c.tipo === 'nc' ? 'NC' : c.tipo === 'remito' ? 'Remito' : 'Factura'
                              const nro = `${c.letra||''}${c.punto_venta ? ' '+c.punto_venta : ''}-${c.numero||''}`
                              return `${tipoLabel} ${nro} · ${c.proveedor_nombre||''}`
                            }
                            return m.nota || m.motivo || '—'
                          })()
                          return (
                          <div key={m.id}
                            onClick={()=>{ if(tieneVenta||tieneCompra) abrirComprobante(m.comprobante_venta_id||m.comprobante_compra_id) }}
                            className={`grid px-4 py-2 text-xs items-center gap-2 ${tieneVenta||tieneCompra?'cursor-pointer hover:bg-blue-50/30':esPendienteNC?'bg-amber-50/50':''}`}
                            style={{gridTemplateColumns:'80px 80px 50px 1fr 80px 70px'}}>
                            <span className="font-mono text-p-ink2">{m.fecha?.split('-').reverse().join('/')}</span>
                            <span className={`font-bold px-1.5 py-0.5 rounded-full text-center ${m.tipo==='entrada'?'bg-green-100 text-green-700':m.tipo==='salida'?'bg-red-100 text-red-600':'bg-gray-100 text-gray-600'}`}>
                              {m.tipo==='entrada'?'📥 +'+m.cantidad:m.tipo==='salida'?'📤 -'+m.cantidad:'⚖ '+m.cantidad}
                            </span>
                            <span className="text-center font-bold text-p-ink">{m.stock_posterior??'—'}</span>
                            <span className={`truncate ${tieneCompra?'text-blue-600 font-medium':tieneVenta?'text-green-700 font-medium':esPendienteNC?'text-amber-700 font-medium':'text-p-ink2'}`}>
                              {tieneCompra && <span className="mr-1">🧾</span>}
                              {tieneVenta && <span className="mr-1">🔖</span>}
                              {esPendienteNC && <span className="mr-1">⏳</span>}
                              {etiqueta}
                              {esPendienteNC && <span className="ml-1.5 text-[10px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">Pendiente NC</span>}
                            </span>
                            <span className="font-mono text-right text-p-ink2">{m.costo_unitario?moneyARS(m.costo_unitario):'—'}</span>
                            <span className="truncate text-p-ink2 text-[10px]">{m.usuario_nombre||''}</span>
                          </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )})}
          </div>
        )}
      </>
      )}

      {/* Modal ver comprobante desde movimiento */}
      {verComp && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={e=>{if(e.target===e.currentTarget)setVerComp(null)}}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-p-line">
              <div>
                <p className="font-saira font-bold text-p-ink">
                  {verComp.categoria ? `${verComp.tipo?.toUpperCase()}-0006-${String(verComp.nro_cbte_afip||verComp.numero||0).padStart(8,'0')}` : `Factura ${verComp.numero}`}
                </p>
                <p className="text-xs text-p-ink2">{verComp.aseguradora_nombre||verComp.proveedor_nombre||''} · {verComp.fecha?.split('-').reverse().join('/')}</p>
              </div>
              <button onClick={()=>setVerComp(null)} className="text-p-gray text-xl">✕</button>
            </div>
            <div className="overflow-y-auto flex-1 p-4 flex flex-col gap-3">
              {(verComp.items||[]).map((it:any,i:number)=>(
                <div key={i} className="flex justify-between text-sm border-b border-p-line2 py-1.5 gap-2">
                  <span className="flex-1 min-w-0">
                    {(it.codigo||(it as any).codigo) && (
                      <span className="font-mono text-[10px] font-bold bg-p-light text-p-dark px-1.5 py-0.5 rounded mr-1.5">
                        {it.codigo||(it as any).codigo}
                      </span>
                    )}
                    <span className="truncate">{it.d||it.descripcion}</span>
                  </span>
                  <span className="text-p-ink2 shrink-0">x{it.c||it.cantidad}</span>
                  <span className="font-mono shrink-0">{moneyARS((it.p||it.precio_unitario||0)*(it.c||it.cantidad||1))}</span>
                </div>
              ))}
              <div className="bg-p-light rounded-xl p-3 text-sm">
                <div className="flex justify-between font-bold font-saira text-base">
                  <span>TOTAL</span><span>{moneyARS(verComp.total||0)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal ajuste de cantidad */}
      {ajusteCantModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={e=>{if(e.target===e.currentTarget)setAjusteCantModal(null)}}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-saira font-bold text-p-ink">⚖ Ajustar stock</p>
                <p className="text-xs text-p-ink2">{ajusteCantModal.descripcion}</p>
              </div>
              <button onClick={()=>setAjusteCantModal(null)} className="text-p-gray text-xl">✕</button>
            </div>
            <div className="flex gap-2">
              {(['entrada','salida'] as const).map(t=>(
                <button key={t} onClick={()=>setAjusteCantForm(p=>({...p,tipo:t,motivo:'',pendiente_nc:false}))}
                  className={`flex-1 py-2 rounded-lg text-sm font-bold border ${ajusteCantForm.tipo===t?(t==='entrada'?'bg-green-100 text-green-700 border-green-300':'bg-red-100 text-red-600 border-red-300'):'bg-white text-p-ink2 border-p-line'}`}>
                  {t==='entrada'?'📥 Entrada':'📤 Salida'}
                </button>
              ))}
            </div>
            {ajusteCantForm.tipo === 'salida' && (
              <div className="flex flex-col gap-2">
                <label className="text-[11px] font-bold text-p-ink2 uppercase tracking-wider">Motivo</label>
                <select value={ajusteCantForm.motivo} onChange={e=>setAjusteCantForm(p=>({...p,motivo:e.target.value,pendiente_nc:['Roto','Devuelto al proveedor'].includes(e.target.value)}))}
                  className="border border-p-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-p-green bg-white">
                  <option value="">Seleccionar motivo…</option>
                  <option value="Roto">🔴 Roto / Dañado</option>
                  <option value="Devuelto al proveedor">↩ Devuelto al proveedor</option>
                  <option value="Venta sin sistema">🛒 Venta sin sistema</option>
                  <option value="Ajuste inventario">📋 Ajuste inventario</option>
                  <option value="Otro">Otro</option>
                </select>
                {['Roto','Devuelto al proveedor'].includes(ajusteCantForm.motivo) && (
                  <div className="flex flex-col gap-2">
                    <label className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 cursor-pointer">
                      <input type="checkbox" checked={ajusteCantForm.pendiente_nc} onChange={e=>setAjusteCantForm(p=>({...p,pendiente_nc:e.target.checked,proveedor_id:'',proveedor_nombre:''}))} className="accent-amber-600"/>
                      <div>
                        <p className="text-sm font-semibold text-amber-800">Pendiente de Nota de Crédito</p>
                        <p className="text-[10px] text-amber-600">Crea un ajuste en la CC del proveedor hasta recibir la NC</p>
                      </div>
                    </label>
                    {ajusteCantForm.pendiente_nc && (
                      <div className="flex flex-col gap-1">
                        <label className="text-[11px] font-bold text-p-ink2 uppercase tracking-wider">Proveedor que debe la NC</label>
                        <select value={ajusteCantForm.proveedor_id}
                          onChange={e=>{
                            const prov = proveedoresLista.find(p=>p.id===e.target.value)
                            setAjusteCantForm(p=>({...p,proveedor_id:e.target.value,proveedor_nombre:prov?.nombre||''}))
                          }}
                          className="border border-p-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-p-green bg-white">
                          <option value="">Seleccionar proveedor…</option>
                          {proveedoresLista.map(p=>(
                            <option key={p.id} value={p.id}>{p.nombre}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            <div className="flex flex-col gap-2">
              <label className="text-[11px] font-bold text-p-ink2 uppercase tracking-wider">Cantidad</label>
              <input type="number" min="1" value={ajusteCantForm.cant} onChange={e=>setAjusteCantForm(p=>({...p,cant:e.target.value}))}
                className="border border-p-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-p-green"/>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-[11px] font-bold text-p-ink2 uppercase tracking-wider">Observación</label>
              <input value={ajusteCantForm.nota} onChange={e=>setAjusteCantForm(p=>({...p,nota:e.target.value}))}
                placeholder="Motivo del ajuste…"
                className="border border-p-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-p-green"/>
            </div>
            <div className="bg-p-light rounded-lg px-3 py-2 text-sm flex justify-between">
              <span className="text-p-ink2">Stock actual</span>
              <span className="font-bold">{ajusteCantModal.cantidad} u.</span>
            </div>
            <div className="flex gap-2">
              <button onClick={()=>setAjusteCantModal(null)} style={{flex:1,background:'#6b7280',color:'#fff',border:'none',borderRadius:8,padding:'9px',fontWeight:700,fontSize:14,cursor:'pointer'}}>Cancelar</button>
              <button onClick={confirmarAjusteCant} 
                disabled={savingAjuste||!ajusteCantForm.cant||(ajusteCantForm.pendiente_nc&&!ajusteCantForm.proveedor_id)}
                style={{flex:2,background:'#00A550',color:'#fff',border:'none',borderRadius:8,padding:'9px',fontWeight:700,fontSize:14,cursor:'pointer',opacity:savingAjuste||!ajusteCantForm.cant||(ajusteCantForm.pendiente_nc&&!ajusteCantForm.proveedor_id)?0.5:1}}>
                {savingAjuste?'Guardando…':'✓ Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Ajuste Masivo */}
      <Modal open={ajusteMasivoOpen} onClose={()=>{setAjusteMasivoOpen(false);setAjusteMasivoLista([]);setAjusteMasivoLeyenda('')}} title="📊 Ajuste masivo de stock" size="lg">
        <div className="flex flex-col gap-4" style={{minHeight:480}}>

          {/* Leyenda general */}
          <Field label="Leyenda general del ajuste *">
            <Input value={ajusteMasivoLeyenda} onChange={e=>setAjusteMasivoLeyenda(e.target.value)} placeholder="Ej: Conteo físico 29/07/2026"/>
          </Field>

          {/* Cargar Excel */}
          <div className="flex items-center gap-2">
            <label style={{display:'flex',alignItems:'center',gap:8,background:'#1a2744',color:'#fff',borderRadius:8,padding:'7px 16px',fontWeight:700,fontSize:13,cursor:'pointer'}}>
              {excelLoading ? '⏳ Procesando…' : '📂 Cargar Excel'}
              <input type="file" accept=".xlsx,.xls" style={{display:'none'}}
                onChange={e=>{const f=e.target.files?.[0]; if(f) procesarExcel(f); e.target.value=''}}
                disabled={excelLoading}/>
            </label>
            <span className="text-xs text-p-ink2">Cols: Codigo · Marca · Nombre</span>
          </div>

          {/* Buscador de código */}
          <div className="relative">
            <Input value={ajusteMasivoQ} onChange={e=>{
              const q=e.target.value.toUpperCase(); setAjusteMasivoQ(e.target.value)
              if (q.length>=1) {
                setAjusteMasivoSug(items.filter(s=>(s.codigo||'').toUpperCase().startsWith(q) && !ajusteMasivoLista.find(x=>x.id===s.id)).slice(0,10))
              } else setAjusteMasivoSug([])
            }} placeholder="Buscá por código…"/>
            {ajusteMasivoSug.length>0 && !ajusteMasivoSel && (
              <div className="absolute z-20 top-full left-0 right-0 bg-white border border-p-line rounded-xl shadow-xl max-h-48 overflow-y-auto mt-1">
                {ajusteMasivoSug.map(s=>(
                  <button key={s.id} type="button" onClick={()=>{setAjusteMasivoSel(s);setAjusteMasivoQ('');setAjusteMasivoSug([]);setAjusteMasivoDelta(0)}}
                    className="w-full text-left px-3 py-2.5 text-sm hover:bg-p-light border-b border-p-line2 last:border-0">
                    <p className="font-medium text-p-ink">{s.descripcion}</p>
                    <p className="text-[10px] font-mono text-p-ink2">{s.codigo} · stock: {s.cantidad}</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Artículo seleccionado */}
          {ajusteMasivoSel && (
            <div className="bg-p-light rounded-xl p-3 flex flex-col gap-2 border border-p-green">
              <div className="flex justify-between items-center">
                <div>
                  <p className="font-semibold text-p-ink">{ajusteMasivoSel.descripcion}</p>
                  <p className="text-xs font-mono text-p-ink2">{ajusteMasivoSel.codigo} · stock actual: <strong>{ajusteMasivoSel.cantidad}</strong></p>
                </div>
                <button onClick={()=>{setAjusteMasivoSel(null);setAjusteMasivoDelta(0)}} className="text-p-gray hover:text-p-ink text-lg">✕</button>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={()=>setAjusteMasivoDelta(d=>d-1)} className="w-9 h-9 border border-red-200 rounded-lg text-red-600 hover:bg-red-50 font-bold text-xl">−</button>
                <span className={`font-mono font-bold text-xl w-12 text-center ${ajusteMasivoDelta>0?'text-green-600':ajusteMasivoDelta<0?'text-red-600':'text-p-ink2'}`}>
                  {ajusteMasivoDelta>0?'+':''}{ajusteMasivoDelta}
                </span>
                <button onClick={()=>setAjusteMasivoDelta(d=>d+1)} className="w-9 h-9 border border-green-200 rounded-lg text-green-600 hover:bg-green-50 font-bold text-xl">+</button>
                <span className="text-sm font-mono text-p-dark ml-2">→ <strong>{(ajusteMasivoSel.cantidad||0)+ajusteMasivoDelta}</strong></span>
                <button onClick={agregarAjuste}
                  style={{marginLeft:'auto',background:'#00A550',color:'#fff',border:'none',borderRadius:8,padding:'8px 18px',fontWeight:700,fontSize:13,cursor:'pointer'}}>
                  + Agregar
                </button>
              </div>
            </div>
          )}

          {/* Lista de artículos cargados */}
          {ajusteMasivoLista.length>0 && (
            <div className="border border-p-line rounded-xl overflow-hidden">
              <div className="bg-p-light px-3 py-2 flex justify-between text-xs font-semibold text-p-ink2">
                <span>{ajusteMasivoLista.length} artículo(s)</span>
                <span>Stock actual → nuevo</span>
              </div>
              {/* Totales */}
              {(()=>{
                const totalActual = ajusteMasivoLista.reduce((a,it)=>a+it.cantActual,0)
                const totalNuevo  = ajusteMasivoLista.reduce((a,it)=>a+it.cantActual+it.delta,0)
                const suman = ajusteMasivoLista.filter(it=>it.delta>0).reduce((a,it)=>a+it.delta,0)
                const restan = ajusteMasivoLista.filter(it=>it.delta<0).reduce((a,it)=>a+it.delta,0)
                return (
                  <div className="grid grid-cols-4 divide-x divide-p-line2 border-b border-p-line2">
                    <div className="px-2 py-2 text-center">
                      <p className="text-[9px] text-p-ink2 uppercase font-semibold">Artículos</p>
                      <p className="font-mono font-bold text-p-ink text-sm">{ajusteMasivoLista.length}</p>
                    </div>
                    <div className="px-2 py-2 text-center">
                      <p className="text-[9px] text-p-ink2 uppercase font-semibold">Total actual</p>
                      <p className="font-mono font-bold text-p-ink text-sm">{totalActual}</p>
                    </div>
                    <div className="px-2 py-2 text-center">
                      <p className="text-[9px] text-p-ink2 uppercase font-semibold">Total nuevo</p>
                      <p className={`font-mono font-bold text-sm ${totalNuevo>totalActual?'text-green-600':totalNuevo<totalActual?'text-red-600':'text-p-ink'}`}>{totalNuevo}</p>
                    </div>
                    <div className="px-2 py-2 text-center">
                      <p className="text-[9px] text-p-ink2 uppercase font-semibold">Δ</p>
                      <p className="font-mono text-[10px] font-bold">
                        {suman>0 && <span className="text-green-600">+{suman} </span>}
                        {restan<0 && <span className="text-red-600">{restan}</span>}
                        {suman===0&&restan===0 && <span className="text-p-ink2">—</span>}
                      </p>
                    </div>
                  </div>
                )
              })()}
              <div className="max-h-48 overflow-y-auto">
                {[...ajusteMasivoLista].sort((a,b)=>{
                    // Primero los que tienen diferencia, después los iguales por cantActual desc
                    const aDif = a.delta !== 0
                    const bDif = b.delta !== 0
                    if (aDif && !bDif) return -1
                    if (!aDif && bDif) return 1
                    return b.cantActual - a.cantActual
                  }).map((it,i)=>(
                  <div key={it.id} className="flex items-center gap-3 px-3 py-2 border-b border-p-line2 last:border-0">
                    <span className="font-mono text-xs text-p-ink2 w-24 shrink-0">{it.codigo}</span>
                    <span className="text-sm text-p-ink flex-1 truncate">{it.desc}</span>
                    <span className="font-mono text-sm">{it.cantActual}</span>
                    <span className={`font-mono text-sm font-bold w-10 text-center ${it.delta>0?'text-green-600':it.delta<0?'text-red-600':'text-p-ink2'}`}>
                      {it.delta>0?'+':''}{it.delta}
                    </span>
                    <span className="font-mono text-sm font-bold text-p-dark w-8">{it.cantActual+it.delta}</span>
                    <button onClick={()=>setAjusteMasivoLista(p=>p.filter(x=>x.id!==it.id))} className="text-p-gray hover:text-red-500 text-sm">✕</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Guardar */}
          <button onClick={guardarAjusteMasivo}
            disabled={ajusteMasivoLoading||!ajusteMasivoLeyenda.trim()||!ajusteMasivoLista.length}
            style={{background:'#00A550',color:'#fff',border:'none',borderRadius:10,padding:'12px',fontWeight:700,fontSize:15,cursor:'pointer',
              opacity:(ajusteMasivoLoading||!ajusteMasivoLeyenda.trim()||!ajusteMasivoLista.length)?0.5:1}}>
            {ajusteMasivoLoading?'Guardando…':`✓ Guardar ${ajusteMasivoLista.length} ajuste(s)`}
          </button>
        </div>
      </Modal>

      {/* Modal preview Excel */}
      <Modal open={excelPreviewOpen} onClose={()=>{setExcelPreviewOpen(false);setExcelPreview([])}} title="📊 Preview — artículos del Excel" size="lg">
        <div className="flex flex-col gap-3">
          <div className="text-sm text-p-ink2">
            Revisá los artículos antes de agregarlos al ajuste. Solo los que <strong>ya existen en stock</strong> se incorporan con delta 0.
          </div>

          {/* Resumen */}
          <div className="flex gap-3 flex-wrap">
            <span className="bg-green-100 text-green-700 text-xs font-semibold px-3 py-1 rounded-full">
              ✓ {excelPreview.filter(r=>r.estado==='existe').length} en stock
            </span>
            <span className="bg-amber-100 text-amber-700 text-xs font-semibold px-3 py-1 rounded-full">
              ⚠ {excelPreview.filter(r=>r.estado==='sin_stock').length} en maestro s/stock
            </span>
            <span className="bg-red-100 text-red-700 text-xs font-semibold px-3 py-1 rounded-full">
              ✕ {excelPreview.filter(r=>r.estado==='nuevo').length} no existen
            </span>
          </div>

          {/* Tabla */}
          <div className="border border-p-line rounded-xl overflow-hidden max-h-96 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-p-light sticky top-0">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold text-p-ink2 text-[10px]">Código</th>
                  <th className="text-left px-3 py-2 font-semibold text-p-ink2 text-[10px]">Descripción</th>
                  <th className="text-right px-3 py-2 font-semibold text-p-ink2 text-[10px]">Actual</th>
                  <th className="text-right px-3 py-2 font-semibold text-p-ink2 text-[10px]">Nuevo</th>
                  <th className="text-right px-3 py-2 font-semibold text-p-ink2 text-[10px]">Δ</th>
                  <th className="text-center px-3 py-2 font-semibold text-p-ink2 text-[10px]">Estado</th>
                </tr>
              </thead>
              <tbody>
                {excelPreview.map((r,i)=>(
                  <tr key={i} className={`border-t border-p-line2 ${r.estado==='existe'?'':'opacity-50'}`}>
                    <td className="px-3 py-2 font-mono text-xs">{r.codigo}</td>
                    <td className="px-3 py-2 truncate max-w-[160px] text-xs">{r.nombre}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs">{r.estado==='existe'?r.cantActual:'—'}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs font-bold">{r.deltaExcel > 0 ? r.cantActual + r.deltaExcel : r.estado==='existe' ? r.cantActual + r.deltaExcel : '—'}</td>
                    <td className={`px-3 py-2 text-right font-mono text-xs font-bold ${r.deltaExcel>0?'text-green-600':r.deltaExcel<0?'text-red-600':'text-p-ink2'}`}>
                      {r.estado!=='nuevo' && r.deltaExcel!==0 ? (r.deltaExcel>0?'+':'')+r.deltaExcel : '—'}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {r.estado==='existe' && <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-semibold text-[10px]">✓ existe</span>}
                      {r.estado==='sin_stock' && <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold text-[10px]">s/stock</span>}
                      {r.estado==='nuevo' && <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-semibold text-[10px]">no existe</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="text-xs text-p-ink2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            ⚠ Los artículos <strong>s/stock</strong> se van a crear con cantidad 0 y quedan listos para ajustar.
            Los <strong>no existen</strong> se ignoran — necesitan carga manual completa.
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={()=>{setExcelPreviewOpen(false);setExcelPreview([])}}
              style={{border:'1px solid #ccc',borderRadius:8,padding:'8px 16px',fontSize:13,cursor:'pointer'}}>
              Cancelar
            </button>
            <button onClick={confirmarExcel}
              disabled={excelLoading||!excelPreview.some(r=>r.estado==='existe'||r.estado==='sin_stock')}
              style={{background:'#00A550',color:'#fff',border:'none',borderRadius:8,padding:'8px 18px',fontWeight:700,fontSize:13,cursor:'pointer',
                opacity:(excelLoading||!excelPreview.some(r=>r.estado==='existe'||r.estado==='sin_stock'))?0.5:1}}>
              {excelLoading ? '⏳ Creando…' : `✓ Confirmar (${excelPreview.filter(r=>r.estado==='existe').length} existen · ${excelPreview.filter(r=>r.estado==='sin_stock').length} a crear)`}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={open} onClose={() => setOpen(false)} title={editId ? 'Editar artículo' : 'Agregar a stock'}>
        <div className="flex flex-col gap-3">
          <Field label="Descripción *">
            <div className="relative">
              <Input value={form.desc} onChange={e => buscarArticulo(e.target.value)} placeholder="Ej: Parabrisas VW Gol" />
              {articuloSugs.length > 0 && (
                <div className="absolute z-20 top-full left-0 right-0 bg-white border border-p-line rounded-xl shadow-xl max-h-48 overflow-y-auto mt-1">
                  {articuloSugs.map((a:any) => (
                    <button key={a.id} type="button" onClick={()=>elegirArticulo(a)}
                      className="w-full text-left px-3 py-2.5 text-sm hover:bg-p-light border-b border-p-line2 last:border-0">
                      <p className="font-medium text-p-ink">{a.descripcion}</p>
                      {a.codigo_referencia && <p className="text-[10px] font-mono text-p-ink2">Ref: {a.codigo_referencia}</p>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {articuloSel ? (
              <p className="text-[11px] text-p-green font-semibold mt-1">✓ Vinculado al artículo del catálogo maestro</p>
            ) : form.desc.trim().length >= 2 ? (
              <p className="text-[11px] text-amber-600 mt-1">⚠ Sin coincidencia — se va a crear un artículo nuevo con esta descripción</p>
            ) : null}
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Código proveedor">
              <Input value={form.cod} onChange={async e => {
                const cod = e.target.value.toUpperCase()
                setForm(p => ({ ...p, cod }))
                // Buscar en maestro por código exacto
                if (cod.length >= 6) {
                  const { data } = await supabase.from('articulos_maestro').select('*').eq('codigo_referencia', cod).maybeSingle()
                  if (data) setArticuloSel(data)
                }
              }} placeholder="Ej: 421830VSLP" />
              {articuloSel?.codigo_referencia === form.cod.toUpperCase() && (
                <p className="text-[11px] text-p-green font-semibold mt-1">✓ Código encontrado en catálogo: {articuloSel.descripcion}</p>
              )}
            </Field>
            <Field label="Marca / modelo"><Input value={form.marca} onChange={e => setForm(p => ({ ...p, marca: e.target.value }))} placeholder="VW Gol" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Posición"><Input value={form.pos} onChange={e => setForm(p => ({ ...p, pos: e.target.value }))} placeholder="PARABRISAS" /></Field>
            <Field label="Año"><Input value={form.anio} onChange={e => setForm(p => ({ ...p, anio: e.target.value }))} placeholder="2015-2020" /></Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Cantidad"><Input type="number" value={form.cant} onChange={e => setForm(p => ({ ...p, cant: e.target.value }))} min="0" /></Field>
            <Field label="Precio venta"><Input value={form.precio} onChange={e => setForm(p => ({ ...p, precio: e.target.value }))} placeholder="$" /></Field>
            <Field label="Costo de venta"><Input value={form.costo} onChange={e => setForm(p => ({ ...p, costo: e.target.value }))} placeholder="$" /></Field>
          </div>
          <Field label="Mínimo en stock">
            <div className="flex items-center gap-3">
              <Input type="number" value={form.minimo} onChange={e => setForm(p => ({ ...p, minimo: e.target.value }))} min="0" placeholder="0"/>
              <p className="text-[11px] text-p-ink2">Si la cantidad baja de este número, aparece una alerta en el módulo. Dejá en 0 para no alertar.</p>
            </div>
          </Field>
          <p className="text-[11px] text-p-ink2 -mt-2">
            Costo de venta = costo consumidor final + recargo tarjeta + IVA. Es el valor con el que se valoriza el stock — no el costo neto de lista.
          </p>
          <Field label="Depósito"><Input value={form.dep} onChange={e => setForm(p => ({ ...p, dep: e.target.value }))} placeholder="Principal" /></Field>
          <Field label="Leyenda del movimiento">
            <Input value={form.leyenda} onChange={e => setForm(p => ({ ...p, leyenda: e.target.value }))} placeholder="Ej: Planilla 20/07 Vero, Factura Malatesta, etc."/>
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => setOpen(false)} style={{background:'#6b7280',color:'#fff',border:'none',borderRadius:8,padding:'9px 20px',fontWeight:700,fontSize:14,cursor:'pointer'}}>Cancelar</button>
            <button onClick={save} style={{background:'#00A550',color:'#fff',border:'none',borderRadius:8,padding:'9px 20px',fontWeight:700,fontSize:14,cursor:'pointer'}}>{editId ? 'Guardar cambios' : 'Agregar'}</button>
          </div>
        </div>
      </Modal>
      {/* Modal carga de mercadería */}
      {ajusteOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onClick={e=>e.target===e.currentTarget&&setAjusteOpen(false)}>
          <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-p-line">
              <h2 className="font-saira font-bold text-lg text-p-ink">📥 Cargar mercadería</h2>
              <button onClick={()=>setAjusteOpen(false)} className="text-p-gray text-xl">✕</button>
            </div>
            <div className="p-5 flex flex-col gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-p-ink2 uppercase tracking-wider mb-1.5">Buscar pieza existente en stock</label>
                <div className="relative">
                  <input value={ajusteSearch} onChange={e=>{setAjusteSearch(e.target.value);setAjusteStockId(null)}}
                    placeholder="Modelo, marca…"
                    className="w-full border border-p-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-p-green"/>
                  {ajusteSugs.length>0&&(
                    <div className="absolute z-10 top-full left-0 right-0 bg-white border border-p-line rounded-lg shadow-lg max-h-40 overflow-y-auto">
                      {ajusteSugs.map(s=>(
                        <button key={s.id} onClick={()=>{setAjusteForm(p=>({...p,desc:s.descripcion,costo:s.costo?String(Math.round(s.costo)):''}));setAjusteStockId(s.id);setAjusteSearch(s.descripcion);setAjusteSugs([])}}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-p-light border-b border-p-line2 last:border-0">
                          <span className="font-medium">{s.descripcion}</span>
                          <span className="text-p-ink2 text-xs ml-2">stock actual: {s.cantidad} u.</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {ajusteStockId&&<p className="text-xs text-p-green font-semibold mt-1">✓ Entrada a pieza existente</p>}
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-p-ink2 uppercase tracking-wider mb-1.5">O descripción nueva</label>
                <input value={ajusteForm.desc} onChange={e=>setAjusteForm(p=>({...p,desc:e.target.value}))}
                  placeholder="Descripción de la pieza"
                  className="w-full border border-p-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-p-green"/>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-p-ink2 uppercase tracking-wider mb-1.5">Unidades</label>
                  <input type="number" min="1" value={ajusteForm.cant} onChange={e=>setAjusteForm(p=>({...p,cant:e.target.value}))}
                    className="w-full border border-p-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-p-green"/>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-p-ink2 uppercase tracking-wider mb-1.5">Costo unit.</label>
                  <input value={ajusteForm.costo} onChange={e=>setAjusteForm(p=>({...p,costo:e.target.value}))} placeholder="$"
                    className="w-full border border-p-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-p-green"/>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-p-ink2 uppercase tracking-wider mb-1.5">Proveedor</label>
                  <input value={ajusteForm.prov} onChange={e=>setAjusteForm(p=>({...p,prov:e.target.value}))} placeholder="GAMMA…"
                    className="w-full border border-p-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-p-green"/>
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-p-ink2 uppercase tracking-wider mb-1.5">Nota</label>
                <input value={ajusteForm.nota} onChange={e=>setAjusteForm(p=>({...p,nota:e.target.value}))} placeholder="Observaciones opcionales"
                  className="w-full border border-p-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-p-green"/>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={()=>setAjusteOpen(false)} style={{background:'#6b7280',color:'#fff',border:'none',borderRadius:8,padding:'8px 18px',fontWeight:700,fontSize:13,cursor:'pointer'}}>Cancelar</button>
                <button onClick={saveAjuste} style={{background:'#00A550',color:'#fff',border:'none',borderRadius:8,padding:'8px 18px',fontWeight:700,fontSize:13,cursor:'pointer'}}>Cargar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}