'use client'
import { LOGO_BASE64 } from '@/lib/logo'
import { FIRMA_SAPPA } from '@/lib/firma'
import { useState, useEffect, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { OrdenServicio, VentaItem } from '@/lib/types/database'
import { Modal, Field, Input, Select, Empty } from '@/components/ui'
import { moneyARS, todayStr } from '@/lib/utils/format'
const moneyARS2 = (n:number) => '$' + n.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})

const IVA_RATE = 0.21
const btn      = { background:'#00A550',color:'#fff',border:'none',borderRadius:10,padding:'10px 20px',fontWeight:700,fontSize:14,cursor:'pointer' } as const
const btnSm    = { ...btn,padding:'6px 14px',fontSize:13 } as const
const btnGray  = { ...btnSm,background:'#6b7280' } as const
const btnRed   = { ...btnSm,background:'#ef4444' } as const
const btnWa    = { ...btnSm,background:'#25d366' } as const
const btnBlue  = { ...btnSm,background:'#1d4ed8' } as const


function tieneADAS(items: VentaItem[]): boolean {
  return items.some(it => it.d.toLowerCase().includes('adas') || it.d.toLowerCase().includes('calibración'))
}

export default function OrdenesClient({ userId, rol }: { userId: string; rol?: string }) {
  const esVentas = rol === 'ventas'
  const esAdmin = rol === 'admin' || rol === 'gerencial'
  const [ordenes, setOrdenes]   = useState<OrdenServicio[]>([])
  const [open, setOpen]         = useState(false)
  const [items, setItems]       = useState<VentaItem[]>([])
  const [ivaOn, setIvaOn]       = useState(true)
  const [loading, setLoading]   = useState(false)
  const supabase = createClient()
  const searchParams = useSearchParams()
  const router = useRouter()

  const [form, setForm] = useState({ aseg:'', sin:'', pol:'', cli:'', tel:'', veh:'', pat:'', obs:'', estado:'pendiente', turno_id:'', colaborador_id:'' })
  const [item, setItem] = useState({ d:'', c:'1', p:'' })
  const [posVidrio, setPosVidrio] = useState<string[]>([])
  const [filtroAseg, setFiltroAseg] = useState('')
  const [buscarNombre, setBuscarNombre] = useState('')
  const [adjModal, setAdjModal]   = useState<any|null>(null)
  const [adjuntos, setAdjuntos]   = useState<any[]>([])
  const [uploading, setUploading] = useState(false)
  const [editId, setEditId]     = useState<string|null>(null)
  const [rubros, setRubros]     = useState<{id:string;nombre:string;precio_base:number}[]>([])
  const [presCli, setPresCli]   = useState<any[]>([])
  const [productores, setProductores] = useState<any[]>([])
  const [formProd, setFormProd] = useState('')  // productor_id seleccionado
  const [stockQ, setStockQ]     = useState('')
  const [stockSugs, setStockSugs] = useState<any[]>([])
  const [stockSel, setStockSel] = useState<any|null>(null)
  const [filtroEstado, setFiltroEstado] = useState<'todas'|'pendiente'|'realizado'|'facturada'|'facturadas'>('todas')
  // Aseguradoras — cargadas desde la base, no hardcodeadas, para que se puedan agregar nuevas
  // (Allianz, Mapfre, etc.) sin tocar código, y siempre desde un registro real, no texto libre.
  const [aseguradoras, setAseguradoras] = useState<{id:string;nombre:string}[]>([])
  const [colaboradores, setColaboradores] = useState<{id:string;nombre:string;es_colocador?:boolean}[]>([])
  // ── Envío a colocador externo (tercerización de colocación) ──
  const [colocModal, setColocModal] = useState(false)
  const [colocSel, setColocSel] = useState('')            // colaborador colocador elegido
  const [colocOSSel, setColocOSSel] = useState<Record<string,boolean>>({})
  const [colocDatos, setColocDatos] = useState({ cuit:'', dir:'', iva:'Responsable Inscripto', trans:'', trans_dni:'' })
  const [colocEnviando, setColocEnviando] = useState(false)

  // OS candidatas: SOLO las asignadas al colocador elegido. Se consultan FRESCAS
  // de la base al elegir colocador (no del estado en memoria, que puede estar viejo).
  const [colocCandidatas, setColocCandidatas] = useState<any[]>([])
  useEffect(() => {
    if (!colocModal || !colocSel) { setColocCandidatas([]); return }
    supabase.from('ordenes_servicio').select('*')
      .eq('colaborador_id', colocSel)
      .or('cristal_colocado.is.null,cristal_colocado.eq.false')
      .or('convertido_comp.is.null,convertido_comp.eq.false')
      .or('stock_via_remito.is.null,stock_via_remito.eq.false')
      .order('numero')
      .then(({data}) => setColocCandidatas((data??[]).filter((o:any)=>(o.items||[]).some((it:any)=>it.stock_id))))
  }, [colocModal, colocSel, supabase])

  async function confirmarEnvioColocador() {
    const colocador = colaboradores.find(c=>c.id===colocSel)
    if (!colocador) { alert('Elegí el colocador.'); return }
    const osSel = colocCandidatas.filter((o:any)=>colocOSSel[o.id])
    if (!osSel.length) { alert('Seleccioná al menos una OS.'); return }
    const itemsRemito = osSel.flatMap((o:any)=>(o.items||[]).filter((it:any)=>it.stock_id).map((it:any)=>({
      d: `${it.d} — OT-${String(o.numero).padStart(4,'0')} ${o.cliente||''}`.trim(),
      c: it.c||1, codigo: it.codigo||null, stock_id: it.stock_id, os_id: o.id,
    })))
    if (!confirm(`Se va a generar UN remito a ${colocador.nombre} con ${itemsRemito.length} artículo(s) de ${osSel.length} OS.\nEl stock se descuenta AHORA (salida física del depósito). Al marcar las OS como colocadas, NO se vuelve a descontar.\n¿Confirmás?`)) return
    setColocEnviando(true)
    // 1) Remito consolidado
    const { data: remito, error: errRem } = await supabase.from('remitos_salida').insert({
      fecha: todayStr(), destinatario_nombre: colocador.nombre,
      destinatario_cuit: colocDatos.cuit.replace(/\D/g,'') || null,
      destinatario_direccion: colocDatos.dir || null,
      destinatario_condicion_iva: colocDatos.iva || null,
      transportista_nombre: colocDatos.trans || null,
      transportista_dni: colocDatos.trans_dni.replace(/\D/g,'') || null,
      tipo_destinatario: 'colocador',
      items: itemsRemito, estado: 'emitido',
      notas: `Envío a colocador — ${osSel.map((o:any)=>`OS-${String(o.numero).padStart(4,'0')}`).join(', ')}`,
      user_id: userId,
    }).select('id,numero').single()
    if (errRem || !remito) { alert(`⚠ Error al crear el remito: ${errRem?.message}`); setColocEnviando(false); return }
    // 2) Descontar stock (única vez, acá — la colocación después no re-descuenta)
    const errsStk: string[] = []
    for (const it of itemsRemito) {
      const { error: errS } = await supabase.rpc('insertar_movimiento_stock', {
        p_stock_id: it.stock_id, p_tipo: 'salida', p_cantidad: it.c, p_fecha: todayStr(),
        p_descripcion: `Remito R-${String(remito.numero||0).padStart(4,'0')} a colocador ${colocador.nombre}`,
        p_user_id: userId,
      })
      if (errS) errsStk.push(`${it.codigo||it.d}: ${errS.message}`)
    }
    if (errsStk.length) alert(`⚠ Remito creado pero ${errsStk.length} item(s) no descontaron stock:\n${errsStk.join('\n')}\nRevisalos a mano.`)
    // 3) Marcar OS: stock ya salió por remito + asignar colocador
    await supabase.from('ordenes_servicio')
      .update({ stock_via_remito: true, colaborador_id: colocador.id })
      .in('id', osSel.map((o:any)=>o.id))
    alert(`✓ Remito R-${String(remito.numero||0).padStart(4,'0')} generado para ${colocador.nombre}.\nImprimilo desde la pantalla de Remitos.`)
    setColocEnviando(false); setColocModal(false); setColocOSSel({}); load()
  }
  // Factura manual (Sancor)
  const [factManualModal, setFactManualModal] = useState<any|null>(null)
  const [sancorModal, setSancorModal] = useState(false)
  const [sancorOS, setSancorOS] = useState<any[]>([])
  const [sancorSel, setSancorSel] = useState<Record<string,boolean>>({})
  const [sancorTotales, setSancorTotales] = useState<Record<string,number>>({})
  const [sancorForm, setSancorForm] = useState({pv:'',nro:'',cae:'',fecha:todayStr(),vto:''})
  const [sancorLoading, setSancorLoading] = useState(false)
  const [sancorTipo, setSancorTipo] = useState<'FC'|'FCE'>('FC')
  const [sancorTipoTocado, setSancorTipoTocado] = useState(false)
  const [sancorObs, setSancorObs] = useState('')
  const [umbralFce, setUmbralFce] = useState<number>(0)
  const [sancorTextos, setSancorTextos] = useState<Record<string,string>>({})
  // Emisión FCE directa contra ARCA
  const [cuentasBanco, setCuentasBanco] = useState<any[]>([])
  const [sancorCbuId, setSancorCbuId] = useState<string>('')
  const [sancorVtoPago, setSancorVtoPago] = useState<string>('')
  const [sancorCuitReceptor, setSancorCuitReceptor] = useState<string>('')
  const [sancorEmitiendo, setSancorEmitiendo] = useState(false)
  const [factManualForm, setFactManualForm] = useState({ cae:'', nro:'', pv:'', vto:'', fecha:'' })
  // Turno desde OS
  const [turnoModal, setTurnoModal] = useState<any|null>(null)
  const [expandido, setExpandido] = useState<string|null>(null)
  const [turnoForm, setTurnoForm] = useState({ fecha:'', hora:'', trabajo:'' })

  // Pre-cargar desde presupuesto
  useEffect(() => {
    const cli = searchParams.get('cli'), tel = searchParams.get('tel'), veh = searchParams.get('veh')
    const pat = searchParams.get('pat'), turnoId = searchParams.get('turno_id')
    const editOsId = searchParams.get('edit')
    const qParam = searchParams.get('q')
    if (qParam) setBuscarNombre(decodeURIComponent(qParam))
    const itemsStr = searchParams.get('items')
    if (editOsId) {
      // Abrir directamente en modo edición la OS indicada
      supabase.from('ordenes_servicio').select('*').eq('id', editOsId).maybeSingle()
        .then(({data}) => {
          if (data) {
            setEditId(data.id)
            setForm({ cli:data.cliente||'', tel:data.telefono||'', veh:data.vehiculo||'',
              pat:data.patente||'', aseg:data.aseguradora||'', sin:data.siniestro||'',
              pol:data.poliza||'', obs:data.obs||'', estado:data.estado||'pendiente', turno_id:data.turno_id||'', colaborador_id:data.colaborador_id||'' })
            setItems(data.items||[])
            setOpen(true)
          }
        })
    } else if (cli || tel || veh) {
      const asegNombre = searchParams.get('aseg_nombre')
      const esAseg = searchParams.get('es_aseg') === '1'
      setForm(p => ({ ...p, cli:cli??'', tel:tel??'', veh:veh??'', pat:pat??'', ...(asegNombre?{aseg:asegNombre}:{}) }))
      if (esAseg) setIvaOn(false) // precio aseguradora ya incluye IVA
    }
    if (turnoId) setForm(p => ({ ...p, turno_id: turnoId }))
    if (itemsStr) { try { setItems(JSON.parse(itemsStr)) } catch {} }
    if (!editOsId && (cli || tel)) setOpen(true)
  }, [searchParams])

  // Presupuestos del cliente al escribir su nombre
  useEffect(() => {
    const nombre = form.cli.trim()
    if(nombre.length < 3){ setPresCli([]); return }
    supabase.from('presupuestos').select('id,fecha,total,items,vehiculo,telefono,tipo_cliente_nombre')
      .ilike('cliente', `%${nombre}%`).eq('convertido_os', false).eq('convertido_comp', false).order('created_at',{ascending:false}).limit(4)
      .then(({data}) => setPresCli(data??[]))
  }, [form.cli, supabase])

  const load = useCallback(() => {
    supabase.from('rubros_precio').select('id,nombre,precio_base').eq('activo',true).order('orden').then(({data})=>setRubros(data??[]))
    supabase.from('ordenes_servicio').select('*,updated_at').order('created_at',{ascending:false}).then(async ({data})=>{
      const ords = data??[]
      // Traer fecha/hora de los turnos vinculados para mostrarlos en la lista
      const tIds = Array.from(new Set(ords.map((o:any)=>o.turno_id).filter(Boolean)))
      if (tIds.length) {
        const { data: ts } = await supabase.from('turnos').select('id,fecha,hora,estado').in('id', tIds)
        const tMap: Record<string,any> = {}
        for (const t of ts??[]) tMap[(t as any).id] = t
        for (const o of ords as any[]) if (o.turno_id && tMap[o.turno_id]) o._turno = tMap[o.turno_id]
      }
      setOrdenes(ords)
    })
    supabase.from('productores').select('id,nombre,telefono').order('nombre').then(({data})=>setProductores(data??[]))
    supabase.from('aseguradoras').select('id,nombre').eq('activo',true).order('nombre').then(({data})=>setAseguradoras(data??[]))
    supabase.from('colaboradores').select('id,nombre,es_colocador').eq('activo',true).order('nombre').then(({data})=>setColaboradores(data??[]))
  }, [supabase])

  useEffect(() => { load() }, [load])

  useEffect(()=>{
    if(stockQ.trim().length<2){setStockSugs([]);return}
    const q = stockQ.trim()
    // Buscar por código exacto primero, luego por descripción (incluye pendiente_ingreso y stock en 0)
    Promise.all([
      supabase.from('stock').select('id,descripcion,cantidad,precio_venta,codigo,pendiente_ingreso').eq('activo',true).ilike('codigo',`%${q}%`).limit(5),
      supabase.from('stock').select('id,descripcion,cantidad,precio_venta,codigo,pendiente_ingreso').eq('activo',true).ilike('descripcion',`%${q}%`).limit(5),
    ]).then(([{data:porCod},{data:porDesc}])=>{
      const todos = [...(porCod??[]),...(porDesc??[])]
      const unicos = todos.filter((s,i)=>todos.findIndex(x=>x.id===s.id)===i)
      // Ordenar: con stock primero, pendiente ingreso después, sin stock al final
      unicos.sort((a,b) => {
        if (a.cantidad > 0 && b.cantidad <= 0) return -1
        if (b.cantidad > 0 && a.cantidad <= 0) return 1
        return 0
      })
      setStockSugs(unicos.slice(0,8))
    })
  },[stockQ,supabase])

  const neto  = items.reduce((a,it)=>a+it.c*(parseFloat(String(it.p).replace(',','.'))||0), 0)
  const iva   = ivaOn ? neto*IVA_RATE : 0
  const total = neto + iva

  function addItem() {
    if(!item.d||!item.p) return
    setItems(prev=>[...prev,{d:item.d,c:+item.c||1,p:parseFloat(item.p.replace(',','.'))||0}])
    setItem({d:'',c:'1',p:''})
  }

  async function abrirAdjuntos(o: any) {
    setAdjModal(o)
    const { data } = await supabase.from('comprobante_adjuntos').select('*').eq('os_id', o.id).order('orden')
    setAdjuntos(data ?? [])
  }

  async function subirArchivoOS(file: File, tipo: string) {
    if (!adjModal) return
    setUploading(true)
    try {
      const ext = file.name.split('.').pop()
      const path = `os/${adjModal.id}/${Date.now()}.${ext}`
      const { error } = await supabase.storage.from('comprobante-adjuntos').upload(path, file)
      if (error) throw error
      const { data: urlData } = supabase.storage.from('comprobante-adjuntos').getPublicUrl(path)
      await supabase.from('comprobante_adjuntos').insert({
        os_id: adjModal.id, comprobante_id: null, tipo, nombre: file.name,
        url: urlData.publicUrl, storage_path: path, orden: adjuntos.length
      })
      const { data } = await supabase.from('comprobante_adjuntos').select('*').eq('os_id', adjModal.id).order('orden')
      setAdjuntos(data ?? [])
    } catch(e) { console.error(e) }
    setUploading(false)
  }

  async function eliminarAdjuntoOS(id: string, path: string) {
    await supabase.storage.from('comprobante-adjuntos').remove([path])
    await supabase.from('comprobante_adjuntos').delete().eq('id', id)
    setAdjuntos(prev=>prev.filter(a=>a.id!==id))
  }

  // Descargar todos los adjuntos con nombres prolijos (para subir a portales de aseguradoras)
  const [descargando, setDescargando] = useState(false)
  async function descargarAdjuntos() {
    if (!adjModal || !adjuntos.length) return
    setDescargando(true)
    const base = `OS-${String(adjModal.numero||'SN').padStart(4,'0')}_${(adjModal.cliente||'').split(',')[0].replace(/[^a-zA-ZáéíóúñÁÉÍÓÚÑ ]/g,'').trim().replace(/\s+/g,'-')}`
    let nFoto = 0
    for (const a of adjuntos) {
      try {
        const resp = await fetch(a.url)
        const blob = await resp.blob()
        const ext = (a.storage_path||a.nombre||'').split('.').pop() || 'jpg'
        const nombre = a.tipo === 'os_firmada' ? `${base}_firmada.${ext}` : `${base}_foto${++nFoto}.${ext}`
        const link = document.createElement('a')
        link.href = URL.createObjectURL(blob)
        link.download = nombre
        document.body.appendChild(link); link.click(); link.remove()
        URL.revokeObjectURL(link.href)
        await new Promise(r=>setTimeout(r, 300))  // que el navegador no se atragante
      } catch(e) { console.error('Descarga falló:', a.nombre, e) }
    }
    setDescargando(false)
  }

  function openEdit(o: any) {
    setEditId(o.id)
    setForm({
      cli: o.cliente||'', tel: o.telefono||'', veh: o.vehiculo||'',
      pat: o.patente||'', aseg: o.aseguradora||'', sin: o.siniestro||'',
      pol: o.poliza||'', obs: o.obs||'', estado: o.estado||'pendiente', turno_id: o.turno_id||'',
      colaborador_id: (o as any).colaborador_id||''
    })
    setFormProd(o.productor_id||'')
    // Preservar posición del vidrio
    setPosVidrio(o.posicion_vidrio ? o.posicion_vidrio.split(',') : [])
    // Filtrar ítems que son posiciones de vidrio (creados con el sistema viejo)
    const POSICIONES = ['Parabrisas','Luneta','Puerta Del. Der.','Puerta Del. Izq.','Puerta Tras. Der.','Puerta Tras. Izq.','Custodia Der.','Custodia Izq.','Aleta']
    setItems((o.items||[]).filter((it:any) => !POSICIONES.includes(it.d)))
    // Preservar el artículo de stock vinculado
    const stockItem = (o.items||[]).find((it:any) => it.stock_id && it.codigo)
    if (stockItem) {
      setStockSel({ id: stockItem.stock_id, codigo: stockItem.codigo, descripcion: stockItem.d, precio_venta: stockItem.p, costo: stockItem.costo })
      setStockQ(stockItem.codigo || '')
    }
    // Si tiene comprobante vinculado, completar datos que puedan faltar en la OS con los del comprobante
    if (o.convertido_comp) {
      supabase.from('comprobantes').select('cliente_nombre,cliente_telefono,vehiculo,patente,siniestro,aseguradora_nombre')
        .eq('orden_id', o.id).maybeSingle()
        .then(({data: comp}) => {
          if (comp) {
            setForm(p => ({
              ...p,
              cli: p.cli || comp.cliente_nombre || '',
              tel: p.tel || comp.cliente_telefono || '',
              veh: p.veh || (comp as any).vehiculo || '',
              pat: p.pat || (comp as any).patente || '',
              sin: p.sin || (comp as any).siniestro || '',
              aseg: p.aseg || comp.aseguradora_nombre || '',
            }))
          }
        })
    }
    setOpen(true)
  }

  async function abrirSancor() {
    setSancorObs('')
    const { data } = await supabase.from('ordenes_servicio')
      .select('*')
      .eq('aseguradora', 'Sancor Seguros')
      .eq('cristal_colocado', true)
      .neq('convertido_comp', true)
      .order('fecha', { ascending: true })
    const os = data || []
    setSancorOS(os)
    const sel: Record<string,boolean> = {}
    const tots: Record<string,number> = {}
    os.forEach((o:any) => { sel[o.id] = true; tots[o.id] = parseFloat(String(o.total||0)) || 0 })
    setSancorSel(sel)
    setSancorTotales(tots)
    const txts: Record<string,string> = {}
    os.forEach((o:any) => { txts[o.id] = String(o.total||0).replace('.',',') })
    setSancorTextos(txts)
    setSancorForm({pv:'',nro:'',cae:'',fecha:todayStr(),vto:''})
    // Umbral FCE MiPyME + CUIT receptor desde config (editable sin deploy)
    const { data: cfg } = await supabase.from('config_fce').select('umbral,cuit_receptor').eq('id',1).maybeSingle()
    const umbral = parseFloat(String(cfg?.umbral ?? 0)) || 0
    setUmbralFce(umbral)
    setSancorCuitReceptor(String(cfg?.cuit_receptor ?? ''))
    // Cuentas bancarias con CBU para la FCE (default: cbu_default_fce)
    const { data: ctas } = await supabase.from('cuentas_banco')
      .select('id,banco,tipo,cbu,cbu_default_fce').eq('activo',true).not('cbu','is',null)
    setCuentasBanco(ctas ?? [])
    setSancorCbuId((ctas ?? []).find((c:any)=>c.cbu_default_fce)?.id ?? (ctas?.[0]?.id ?? ''))
    // Vencimiento de pago por defecto: hoy + 30 días
    const vto30 = new Date(); vto30.setDate(vto30.getDate() + 30)
    setSancorVtoPago(vto30.toISOString().slice(0,10))
    const totalInicial = os.reduce((acc:number,o:any)=>acc+(parseFloat(String(o.total||0))||0),0)
    setSancorTipo(umbral > 0 && totalInicial >= umbral ? 'FCE' : 'FC')
    setSancorTipoTocado(false)
    setSancorModal(true)
  }

  // Emite la factura (A común o FCE MiPyME) directo contra ARCA vía edge function arca-facturar.
  // Flujo: comprobante borrador → ARCA (CAE + nro) → completar comprobante → CC con comprobante_id → marcar OS.
  // Si ARCA rechaza, se elimina el borrador y no queda nada a medias.
  async function emitirArca(modo: 'FC'|'FCE') {
    const selIds = Object.entries(sancorSel).filter(([,v])=>v).map(([id])=>id)
    if (!selIds.length) { alert('Seleccioná al menos una OS'); return }
    const esFce = modo === 'FCE'
    const cta = cuentasBanco.find((c:any)=>c.id===sancorCbuId)
    if (esFce) {
      if (!sancorVtoPago) { alert('Completá la fecha de vencimiento de pago (obligatoria en FCE)'); return }
      if (!cta?.cbu || !/^\d{22}$/.test(String(cta.cbu))) { alert('La cuenta seleccionada no tiene un CBU válido de 22 dígitos'); return }
    }
    if (!/^\d{11}$/.test(sancorCuitReceptor)) { alert('Falta el CUIT de Sancor en config_fce.cuit_receptor (11 dígitos)'); return }
    const total = selIds.reduce((acc,id)=>acc+(sancorTotales[id]||0),0)
    const neto = Math.round((total/1.21)*100)/100
    const iva = Math.round((total-neto)*100)/100
    const etiqueta = esFce ? 'FCE MiPyME' : 'Factura A'
    if (!confirm(`Se va a emitir una ${etiqueta} en ARCA por ${moneyARS2(total)} (${selIds.length} OS).${esFce?`\nCBU informado: ${cta.banco} ${cta.tipo}\nVto de pago: ${sancorVtoPago.split('-').reverse().join('/')}`:''}\n¿Confirmás?`)) return
    setSancorEmitiendo(true)
    const osSel = sancorOS.filter((o:any)=>selIds.includes(o.id))
    // 1) Comprobante borrador (necesario: la edge function lo referencia en facturacion_electronica)
    const { data: nextNumData } = await supabase.rpc('siguiente_numero_comprobante', { p_tipo: esFce ? 'FCE' : 'A', p_categoria: 'factura' })
    const { data: comp, error: errComp } = await supabase.from('comprobantes').insert({
      numero: nextNumData ?? null,
      fecha: todayStr(), tipo: esFce ? 'FCE' : 'A', categoria: 'factura',
      aseguradora_id: '79b592cf-a211-4f39-826a-5e7c0ef594dc',
      aseguradora_nombre: 'Sancor Seguros',
      cliente_nombre: 'Sancor Seguros', cliente_cuit: sancorCuitReceptor,
      cliente_tipo_fiscal: 'responsable_inscripto',
      items: osSel.map((o:any)=>({ d: `OS-${String(o.numero).padStart(4,'0')} · ${o.cliente} · ${o.vehiculo||''}`.trim(), c: 1, p: sancorTotales[o.id]||0, os_id: o.id })),
      pagos: [{ metodo:'Cuenta corriente', monto:String(total) }],
      es_negro: false, es_nc: false,
      neto, iva_pct: 21, iva, total,
      cbu_informado: esFce ? String(cta!.cbu) : null,
      observaciones: sancorObs.trim() || null,
      fce_vto_pago: esFce ? sancorVtoPago : null,
    }).select('id').single()
    if (errComp || !comp) { alert(`⚠ Error al crear comprobante: ${errComp?.message}`); setSancorEmitiendo(false); return }
    // 2) Emisión en ARCA
    let resp: any
    try {
      const { data, error } = await supabase.functions.invoke('arca-facturar', { body: {
        comprobante_id: comp.id, tipoCbte: esFce ? 201 : 1,
        impTotal: total, impNeto: neto, impIva: iva,
        concepto: 1, docTipo: 80, docNro: sancorCuitReceptor, ivaAlicuota: 5,
        ...(esFce ? { fceVtoPago: sancorVtoPago, fceCbu: String(cta!.cbu), fceTransmision: 'SCA' } : {}),
      }})
      resp = error ? { ok:false, error: error.message } : data
    } catch (e:any) { resp = { ok:false, error: e?.message ?? 'Error de red' } }
    if (!resp?.ok) {
      await supabase.from('comprobantes').delete().eq('id', comp.id)
      alert(`⚠ ARCA rechazó la ${etiqueta}:\n${resp?.error ?? 'sin detalle'}\n\nNo se registró nada. Podés reintentar o usar el registro manual.`)
      setSancorEmitiendo(false); return
    }
    // 3) Completar comprobante con lo que devolvió ARCA
    const pvStr = String(resp.punto_venta).padStart(5,'0')
    const nroStr = String(resp.nro_cbte).padStart(8,'0')
    await supabase.from('comprobantes').update({
      nro_cbte_afip: resp.nro_cbte, cae_emitido: resp.cae,
      cae_vencimiento: resp.cae_vencimiento || null,
    }).eq('id', comp.id)
    // 4) CC aseguradoras — con comprobante_id desde el arranque
    const { error: errCC } = await supabase.from('cuenta_corriente_aseguradoras').insert({
      aseguradora_id: '79b592cf-a211-4f39-826a-5e7c0ef594dc',
      comprobante_id: comp.id,
      fecha: todayStr(), tipo: 'factura',
      descripcion: `${esFce?'FCE':'FC A'} Sancor ${pvStr}-${nroStr} · ${selIds.length} OS`,
      debe: total, haber: 0,
    })
    if (errCC) alert(`⚠ ${etiqueta} emitida (CAE ${resp.cae}) pero falló el registro en CC: ${errCC.message}\nCargala a mano en la CC de Sancor.`)
    // 4b) Facturado del día — misma convención que las demás facturas de aseguradora
    // Costo: suma de costos de stock de los items reales de las OS incluidas
    let costoVenta = 0
    for (const o of osSel) for (const it of (o.items||[])) {
      if (it.stock_id) {
        const { data: stk } = await supabase.from('stock').select('costo').eq('id', it.stock_id).maybeSingle()
        costoVenta += ((stk as any)?.costo||0) * (it.c||1)
      }
    }
    await supabase.from('ventas').insert({
      fecha: todayStr(),
      descripcion: `${esFce?'FCE':'FA'}-${pvStr}-${nroStr} - Sancor Seguros`,
      precio: total, costo: costoVenta||null, pendiente: true,
      comprobante_id: comp.id,
      pago: 'Cuenta corriente', cliente: 'Sancor Seguros',
      origen: 'compra', user_id: userId,
    })
    // 5) Marcar OS
    const errsOS: string[] = []
    for (const id of selIds) {
      const { error: errOS } = await supabase.from('ordenes_servicio').update({
        convertido_comp: true, estado: 'facturada',
        factura_manual_cae: resp.cae, factura_manual_nro: nroStr,
        factura_manual_pv: pvStr, factura_manual_fecha: todayStr(),
        factura_manual_vto: resp.cae_vencimiento || null,
        factura_manual_tipo: esFce ? 'FCE' : 'FC',
      }).eq('id', id)
      if (errOS) errsOS.push(`OS ${id.slice(0,8)}: ${errOS.message}`)
    }
    if (errsOS.length) alert(`⚠ ${errsOS.length} OS no se marcaron:\n${errsOS.join('\n')}`)
    alert(`✓ ${etiqueta} ${pvStr}-${nroStr} emitida\nCAE: ${resp.cae}`)
    setSancorEmitiendo(false); setSancorModal(false); load()
  }

  async function save() {
    if(!form.cli && !form.aseg) { alert('Completá al menos el nombre del cliente o la aseguradora'); return }
    setLoading(true)
    const conADAS = tieneADAS(items)
    let numero_adas: number|null = null

    if(conADAS) {
      // Obtener próximo número ADAS
      const { count } = await supabase.from('certificados_adas').select('*',{count:'exact',head:true})
      numero_adas = (count??0) + 1
      // Crear también el certificado ADAS
      await supabase.from('certificados_adas').insert({
        numero: numero_adas, fecha: todayStr(),
        cliente: form.cli||null, vehiculo: form.veh||null,
        patente: form.pat||null, user_id: userId
      })
    }

    const { data: nuevas } = await supabase.from('ordenes_servicio').select('numero').order('numero',{ascending:false}).limit(1)
    const nextNum = (parseInt(String((nuevas?.[0] as any)?.numero ?? '0'), 10) || 0) + 1

    if(editId) {
      const { error: updErr } = await supabase.from('ordenes_servicio').update({
        cliente:form.cli||null, telefono:form.tel||null, vehiculo:form.veh||null,
        patente:form.pat||null, aseguradora:form.aseg||null, siniestro:form.sin||null,
        poliza:form.pol||null, obs:form.obs||null, items, total, iva: iva ?? 0, neto: neto ?? 0,
        posicion_vidrio: posVidrio.length ? posVidrio.join(',') : null,
        stock_codigo: stockSel?.codigo||null,
        colaborador_id: form.colaborador_id||null,
        turno_id: form.turno_id||null,
        productor_id: formProd||null,
      }).eq('id', editId)
      if (updErr) { alert('Error al guardar: ' + updErr.message); return }
      setEditId(null)
    } else {
    await supabase.from('ordenes_servicio').insert({
      numero: nextNum, fecha: todayStr(),
      aseguradora: form.aseg||null, siniestro: form.sin||null, poliza: form.pol||null,
      cliente: form.cli||null, telefono: form.tel||null, vehiculo: form.veh||null,
      patente: form.pat||null, obs: form.obs||null,
      colaborador_id: form.colaborador_id||null,
      items, neto: neto ?? 0, iva_pct:IVA_RATE, iva: iva ?? 0, total: total ?? 0,
      tiene_adas: conADAS, numero_adas, user_id: userId,
      productor_id: formProd || null,
      turno_id: form.turno_id || null,
      estado: 'pendiente',
      posicion_vidrio: posVidrio.length ? posVidrio.join(',') : null,
      stock_codigo: stockSel?.codigo || null,
    })
    // Stock se descuenta solo al facturar, NO al guardar la OS
    // Si viene de un turno, actualizar turnos.os_id con la nueva OS
    if (form.turno_id && !editId) {
      const { data: newOs } = await supabase.from('ordenes_servicio')
        .select('id').eq('turno_id', form.turno_id).order('created_at', {ascending:false}).limit(1).maybeSingle()
      if (newOs?.id) {
        await supabase.from('turnos').update({ os_id: newOs.id }).eq('id', form.turno_id)
      }
    }
    }

    setOpen(false); setItems([]); setForm({aseg:'',sin:'',pol:'',cli:'',tel:'',veh:'',pat:'',obs:'',estado:'pendiente',turno_id:'',colaborador_id:''})
    setStockSel(null); setStockQ(''); setFormProd('')
    setLoading(false); load()
  }

  async function del(id:string) {
    // Verificar si tiene estado realizado o turno asignado
    const { data: os } = await supabase.from('ordenes_servicio')
      .select('estado, turno_id, convertido_comp')
      .eq('id', id).single()
    if (!os) return
    if (os.estado === 'realizado') {
      alert('No se puede borrar una orden ya realizada.'); return
    }
    if (os.turno_id) {
      alert('No se puede borrar una orden con turno asignado. Primero eliminá el turno.'); return
    }
    if (os.convertido_comp) {
      alert('No se puede borrar una orden que ya tiene comprobante emitido.'); return
    }
    if(!confirm('¿Borrar esta orden?')) return
    await supabase.from('ordenes_servicio').delete().eq('id',id); load()
  }

  // ── PDF interno (blanco y negro, sin logo, para taller) ────────────────────
  async function generarPDF(o: OrdenServicio): Promise<Blob> {
    const { jsPDF } = await import('jspdf')
    const doc = new jsPDF({ format: 'a4', unit: 'mm' })
    const W = 210, pad = 15
    let y = 15

    const numOT = `OT-${String((o as any).numero || 0).padStart(4, '0')}`
    const conADAS = (o as any).tiene_adas
    const numADAS = (o as any).numero_adas
    const numDoc = conADAS ? `ADAS-${String(numADAS || 0).padStart(7, '0')}` : numOT
    const tipoDoc = conADAS ? 'CERTIFICADO ADAS' : 'ORDEN DE TRABAJO'

    // Colaborador
    const colab = colaboradores.find(c => c.id === (o as any).colaborador_id)

    // ── Header simple ──────────────────────────────────────────────────────
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(16)
    doc.text('PARABRISAS EL PIAMONTE', pad, y)
    doc.setFontSize(11)
    doc.text(tipoDoc, W - pad, y, { align: 'right' })
    y += 7
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.text('General Pico, La Pampa · Tel: 2302 595969', pad, y)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.text(`N° ${numDoc}`, W - pad, y, { align: 'right' })
    y += 5
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.text(`Fecha: ${o.fecha.split('-').reverse().join('/')}`, W - pad, y, { align: 'right' })
    y += 3

    // Línea separadora
    doc.setDrawColor(0); doc.setLineWidth(0.5)
    doc.line(pad, y, W - pad, y)
    y += 8

    // ── Datos del trabajo ──────────────────────────────────────────────────
    const labelW = 32
    const addRow = (label: string, value: string) => {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10)
      doc.text(label + ':', pad, y)
      doc.setFont('helvetica', 'normal')
      doc.text(value || '—', pad + labelW, y)
      y += 7
    }

    if (o.aseguradora) addRow('Aseguradora', o.aseguradora)
    addRow('Cliente', o.cliente || '—')
    if (o.telefono) addRow('Teléfono', o.telefono)
    addRow('Vehículo', o.vehiculo || '—')
    addRow('Patente', (o as any).patente || '—')
    if (o.siniestro) addRow('Siniestro', o.siniestro)
    if (o.poliza) addRow('Póliza', o.poliza)
    if (colab) addRow('Colaborador', colab.nombre)
    y += 2

    doc.line(pad, y, W - pad, y)
    y += 8

    // ── Vidrio a colocar ───────────────────────────────────────────────────
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9)
    doc.text('VIDRIO A COLOCAR', pad, y)
    y += 10

    // Ítems
    const stockItems = (o.items || []).filter((it: any) => it.stock_id && it.codigo)
    if (stockItems.length > 0) {
      stockItems.forEach((it: any) => {
        doc.setFont('helvetica', 'bold'); doc.setFontSize(28)
        doc.text(it.codigo, pad, y)
        y += 14
        if (it.d) {
          doc.setFont('helvetica', 'normal'); doc.setFontSize(11)
          doc.text(it.d, pad, y); y += 7
        }
      })
    } else if ((o as any).stock_codigo) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(28)
      doc.text((o as any).stock_codigo, pad, y)
      y += 14
    } else {
      // Sin código — espacio para anotar a mano
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10)
      doc.text('Código: ______________________________', pad, y)
      y += 7
      doc.text('Descripción: ___________________________________________', pad, y)
      y += 7
    }

    // Todos los ítems de trabajo
    if ((o.items || []).length > 0) {
      y += 3
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9)
      doc.text('Detalle del trabajo:', pad, y); y += 5
      doc.setFont('helvetica', 'normal')
      ;(o.items as any[]).forEach((it: any) => {
        doc.text(`• ${it.d}  (cant: ${it.c})`, pad + 3, y); y += 5
      })
    }

    if (o.obs) {
      y += 3
      doc.setFont('helvetica', 'italic'); doc.setFontSize(9)
      doc.text(`Obs: ${o.obs}`, pad, y); y += 6
    }

    y = Math.max(y + 10, 180)
    doc.line(pad, y, W - pad, y)
    y += 8

    // ── Sección para el colaborador ────────────────────────────────────────
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11)
    doc.text('PARA EL COLABORADOR', pad, y); y += 8

    doc.setFont('helvetica', 'normal'); doc.setFontSize(10)
    doc.text('Vidrio colocado (N° de pieza / observación):', pad, y); y += 6
    doc.line(pad, y, W - pad, y); y += 8
    doc.line(pad, y, W - pad, y); y += 12

    // Firma
    doc.line(pad, y, pad + 70, y)
    doc.setFontSize(9)
    doc.text(colab ? `Firma: ${colab.nombre}` : 'Firma colaborador', pad, y + 5)
    doc.line(W - pad - 70, y, W - pad, y)
    doc.text('Firma recepción Admin', W - pad - 70, y + 5)
    y += 20

    doc.line(pad, y, W - pad, y)
    doc.setFont('helvetica', 'italic'); doc.setFontSize(8)
    doc.text('Parabrisas El Piamonte · General Pico, La Pampa · 2302 595969', W / 2, y + 5, { align: 'center' })

    return doc.output('blob')
  }

  async function compartirWA(o: OrdenServicio) {
    const blob = await generarPDF(o)
    const conADAS = (o as any).tiene_adas
    const numADAS = (o as any).numero_adas
    const numOS   = `OS-${String((o as any).numero||0).padStart(4,'0')}`
    const nombre  = conADAS ? `ADAS-${String(numADAS||0).padStart(7,'0')}` : numOS
    const file = new File([blob], `${nombre}-${o.cliente?.replace(/\s/g,'-')??'Piamonte'}.pdf`, {type:'application/pdf'})
    if(navigator.canShare?.({files:[file]})) { await navigator.share({files:[file],title:`${conADAS?'Certificado ADAS':'Orden de Servicio'} El Piamonte`}); return }
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href=url; a.download=file.name; a.click(); URL.revokeObjectURL(url)
    const tel = (o.telefono??'').replace(/[^0-9]/g,'')
    const siniestro = (o as any).siniestro
    const patente = (o as any).patente
    const vehiculo = o.vehiculo || ''
    const texto = siniestro
      ? `Hola${o.cliente ? ' ' + o.cliente : ''}! Te escribimos desde El Piamonte para coordinar el turno para el cambio de cristal del siniestro N° ${siniestro}.${patente ? ` Vehículo: ${vehiculo} - Patente ${patente}.` : ''} ¿Cuándo te viene bien?`
      : `Hola${o.cliente ? ' ' + o.cliente : ''}! Te escribimos desde El Piamonte para coordinar el turno para el cambio de cristal.${vehiculo ? ` Vehículo: ${vehiculo}.` : ''} ¿Cuándo te viene bien?`
    setTimeout(()=>window.open(`https://web.whatsapp.com/send?phone=${tel}&text=${encodeURIComponent(texto)}`,'_blank'),800)
  }

  function enviarWA(o: OrdenServicio) {
    const tel = (o.telefono??'').replace(/[^0-9]/g,'')
    if (!tel) { alert('La OS no tiene teléfono cargado.'); return }
    const siniestro = (o as any).siniestro
    const patente = (o as any).patente
    const vehiculo = o.vehiculo || ''
    const texto = siniestro
      ? `Hola${o.cliente ? ' ' + o.cliente : ''}! Te escribimos desde El Piamonte para coordinar el turno para el cambio de cristal del siniestro N° ${siniestro}.${patente ? ` Vehículo: ${vehiculo} - Patente ${patente}.` : ''} ¿Cuándo te viene bien?`
      : `Hola${o.cliente ? ' ' + o.cliente : ''}! Te escribimos desde El Piamonte para coordinar el turno para el cambio de cristal.${vehiculo ? ` Vehículo: ${vehiculo}.` : ''} ¿Cuándo te viene bien?`
    window.open(`https://web.whatsapp.com/send?phone=${tel}&text=${encodeURIComponent(texto)}`, '_blank')
  }

  async function descargarPDF(o: OrdenServicio) {
    const blob = await generarPDF(o)
    const conADAS = (o as any).tiene_adas
    const numADAS = (o as any).numero_adas
    const numOS   = `OS-${String((o as any).numero||0).padStart(4,'0')}`
    const nombre  = conADAS ? `ADAS-${String(numADAS||0).padStart(7,'0')}` : numOS
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href=url; a.download=`${nombre}.pdf`; a.click(); URL.revokeObjectURL(url)
  }

  // Aseguradoras únicas presentes en las órdenes
  const aseguradorasEnUso = Array.from(new Set(ordenes.map(o => o.aseguradora).filter(Boolean))) as string[]

  // Órdenes filtradas
  const ordenesFiltradas = ordenes.filter(o => {
    const asegOk   = !filtroAseg || (filtroAseg === '__sin__' ? !o.aseguradora : o.aseguradora === filtroAseg)
    const nombreOk = !buscarNombre.trim() || (o.cliente||'').toLowerCase().includes(buscarNombre.toLowerCase())
    return asegOk && nombreOk
  }).sort((a,b) => {
    // Cuando filtramos facturadas, ordenar por updated_at (fecha en que se facturó)
    if (filtroEstado === 'facturadas') {
      return new Date((b as any).updated_at||b.created_at).getTime() - new Date((a as any).updated_at||a.created_at).getTime()
    }
    return 0 // mantener orden original (created_at desc desde la DB)
  })

  return (
    <div>
      {/* Filtros de estado */}
      <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:12}}>
        {(['todas','pendiente','realizado','facturada','facturadas'] as const).map((val)=>{
          const labels: Record<string,string> = {todas:'Todas',pendiente:'⏳ Pendientes',realizado:'✅ Realizadas',facturada:'🧾 Pend. facturar',facturadas:'🧾 Facturadas'}
          return (
            <button key={val} onClick={()=>setFiltroEstado(val)}
              style={{...btnSm, background:filtroEstado===val?'#00A550':'#e5e7eb', color:filtroEstado===val?'#fff':'#374151'}}>
              {labels[val]}
            </button>
          )
        })}
      </div>

      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20,gap:12,flexWrap:'wrap'}}>
        {/* Filtro por compañía — todos los tabs del mismo ancho, tooltip con nombre completo */}
        <div style={{display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}}>
          <button onClick={()=>setFiltroAseg('')}
            style={{...btnSm, width:140, background: filtroAseg==='' ? '#00A550' : '#e5e7eb', color: filtroAseg==='' ? '#fff' : '#374151'}}>
            Todas
          </button>
          {aseguradorasEnUso.map(a=>(
            <button key={a} onClick={()=>setFiltroAseg(filtroAseg===a ? '' : a)}
              title={a}
              style={{...btnSm, width:140, overflow:'hidden', whiteSpace:'nowrap', textOverflow:'ellipsis',
                background: filtroAseg===a ? '#00A550' : '#e5e7eb',
                color: filtroAseg===a ? '#fff' : '#374151'}}>
              {a}
            </button>
          ))}
          {ordenes.filter(o=>{
            if(filtroEstado==='todas') return true
            if(filtroEstado==='facturada') return (o as any).estado==='realizado' && !(o as any).convertido_comp
            if(filtroEstado==='facturadas') return !!(o as any).convertido_comp
            return (o as any).estado===filtroEstado
          }).some(o=>!o.aseguradora) && (
            <button onClick={()=>setFiltroAseg('__sin__')}
              style={{...btnSm, width:140, background: filtroAseg==='__sin__' ? '#6b7280' : '#e5e7eb', color: filtroAseg==='__sin__' ? '#fff' : '#374151'}}>
              Sin seguro
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <input value={buscarNombre} onChange={e=>setBuscarNombre(e.target.value)}
            placeholder="Buscar por nombre de cliente…"
            className="flex-1 border border-p-line rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-p-green"/>
          {buscarNombre && <button onClick={()=>setBuscarNombre('')} className="text-p-ink2 text-xs hover:text-p-ink">✕</button>}
        </div>
        {esAdmin && <>
          <button onClick={()=>{ setColocSel(colaboradores.find(c=>c.es_colocador)?.id||''); setColocOSSel({}); setColocModal(true) }}
            className="bg-amber-500 hover:bg-amber-600 text-white font-saira font-bold text-sm px-4 py-2 rounded-xl transition-colors">
            🚚 A colocador
          </button>
          <button onClick={abrirSancor}
            className="bg-purple-600 hover:bg-purple-700 text-white font-saira font-bold text-sm px-4 py-2 rounded-xl transition-colors">
            🏢 Factura Sancor
          </button>
          <button onClick={()=>{
            setForm({aseg:'',sin:'',pol:'',cli:'',tel:'',veh:'',pat:'',obs:'',estado:'pendiente',turno_id:'',colaborador_id:''})
            setItems([]); setItem({d:'',c:'1',p:''}); setEditId(null)
            setStockSel(null); setStockQ(''); setFormProd('')
            setOpen(true)
          }} style={btn}>+ Nueva orden</button>
        </>}
      </div>

      {ordenesFiltradas.length===0 ? <Empty msg="Sin órdenes todavía." /> : (
        <div className="flex flex-col gap-4">
          {ordenesFiltradas.filter(o=>{
            const estadoOk = filtroEstado==='todas' ? true : filtroEstado==='facturada' ? ((o as any).estado==='realizado' && !(o as any).convertido_comp) : filtroEstado==='facturadas' ? (!!(o as any).convertido_comp) : (o as any).estado===filtroEstado
            return estadoOk
          }).map(o => {
            const conADAS = (o as any).tiene_adas
            const numADAS = (o as any).numero_adas
            const numOS   = `OS-${String((o as any).numero||0).padStart(4,'0')}`
            return (
              <div key={o.id}
                onClick={()=>setExpandido(e=>e===o.id?null:o.id)}
                onDoubleClick={()=>{ if(!(o as any).convertido_comp && esAdmin) openEdit(o) }} title="Click para opciones · doble click para editar (solo sin facturar)"
                className="bg-white border border-p-line rounded-xl shadow-sm cursor-pointer hover:border-p-green transition-colors overflow-hidden">
                <div className="flex items-center gap-2.5 px-3.5 py-2.5 flex-wrap">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${conADAS?'bg-blue-100 text-blue-700':'bg-p-light text-p-dark'}`}>
                    {conADAS ? `ADAS N° ${String(numADAS||0).padStart(7,'0')}` : numOS}
                  </span>
                  <p className="font-saira font-bold text-p-ink text-sm truncate" style={{maxWidth:180}}>{o.cliente||'(sin nombre)'}</p>
                  {(o as any).estado && (o as any).estado !== 'pendiente' && (
                    <span style={{
                      fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:99,
                      background: (o as any).convertido_comp ? '#f0fdf4' : (o as any).estado==='realizado' ? '#dcfce7' : '#dbeafe',
                      color: (o as any).convertido_comp ? '#15803d' : (o as any).estado==='realizado' ? '#16a34a' : '#1d4ed8',
                      border: (o as any).convertido_comp ? '1px solid #86efac' : 'none'
                    }}>
                      {(o as any).convertido_comp ? '🧾 Facturado' : (o as any).estado==='realizado' ? '✅ Realizado' : '🧾 Facturada'}
                    </span>
                  )}
                  <span className="text-xs text-p-ink2 shrink-0">{[o.vehiculo,(o as any).patente].filter(Boolean).join(' · ')}</span>
                  {(() => {
                    const stockItems = (o.items||[]).filter((it:any)=>it.stock_id&&it.codigo)
                    return stockItems.length>0 ? stockItems.map((it:any)=>(
                      <span key={it.stock_id} className="text-[10px] font-mono text-p-ink2 shrink-0 bg-p-light px-1.5 py-0.5 rounded max-w-[180px] truncate block" title={it.codigo + (it.d ? ' · ' + it.d : '')}>
                        {it.codigo}{it.d ? ` · ${it.d.slice(0,25)}` : ''}
                      </span>
                    )) : (o as any).stock_codigo ? (
                      <span className="text-[10px] font-mono text-p-ink2 shrink-0 bg-p-light px-1.5 py-0.5 rounded">{(o as any).stock_codigo}</span>
                    ) : null
                  })()}
                  {(o as any).posicion_vidrio && !(o.items||[]).some((it:any)=>it.stock_id) && (
                    <span className="text-[10px] font-semibold text-p-green shrink-0">{(o as any).posicion_vidrio}</span>
                  )}
                  {(o as any)._turno && (
                    <span className="text-[10px] font-bold text-teal-700 bg-teal-50 border border-teal-200 rounded-full px-2 py-0.5 shrink-0">
                      📅 {String((o as any)._turno.fecha||'').split('-').reverse().slice(0,2).join('/')} {(o as any)._turno.hora?.slice(0,5)}
                    </span>
                  )}
                  {(o as any).turno_id && !(o as any)._turno && (
                    <span className="text-[10px] font-bold text-gray-500 bg-gray-100 border border-gray-200 rounded-full px-2 py-0.5 shrink-0">📅 turno eliminado</span>
                  )}
                  {(o as any).cristal_colocado && (
                    <span className="text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 rounded-full px-2 py-0.5 shrink-0">🔩 Colocada ✓</span>
                  )}
                  {(o as any).stock_via_remito && !(o as any).cristal_colocado && (
                    <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 shrink-0">🚚 En colocador</span>
                  )}
                  {(() => {
                    const colab = colaboradores.find(c => c.id === (o as any).colaborador_id)
                    return colab ? (
                      <span className="text-[10px] text-p-ink2 shrink-0">👤 {colab.nombre}</span>
                    ) : null
                  })()}
                  <span className="text-xs text-p-ink2 shrink-0">{o.fecha.split('-').reverse().join('/')}</span>
                  {o.aseguradora && <span className="text-xs text-p-ink2 shrink-0">· {o.aseguradora}</span>}
                  <div className="flex-1 min-w-[8px]"/>
                  <p className="font-saira font-bold text-p-ink shrink-0">{o.total > 0 ? moneyARS2(o.total) : <span className="text-p-ink2 text-xs font-normal">{o.aseguradora ? 'Precio aseguradora' : 'Sin precio'}</span>}</p>
                </div>

                {expandido===o.id && (
                  <div onClick={e=>e.stopPropagation()} className="px-3.5 pb-3 pt-2 border-t border-p-line2 bg-p-light/30">
                    {o.aseguradora && <p className="text-xs text-p-ink2 mb-2">🏢 {o.aseguradora}</p>}
                    <div className="flex gap-2 flex-wrap">
                      {/* Botones siempre visibles */}
                      <button onClick={()=>enviarWA(o)} style={btnWa}>📱 WhatsApp</button>
                      <button onClick={()=>abrirAdjuntos(o)} style={{...btnSm,background:'#7c3aed'}}>
                        📎 {adjModal?.id===o.id?`${adjuntos.length} adj.`:'Fotos'}
                      </button>
                      {!(o as any).convertido_comp && esAdmin && (
                        <button onClick={()=>openEdit(o)} style={{...btnSm,background:'#6b7280'}}>✏ Editar</button>
                      )}
                      {esAdmin && (
                        <button onClick={()=>del(o.id)} style={{...btnSm,background:'#ef4444'}}>🗑 Borrar</button>
                      )}
                      <button onClick={()=>descargarPDF(o)} style={btnSm}>⬇ PDF</button>

                      {/* JERARQUÍA DE ESTADO */}
                      {(o as any).convertido_comp ? (
                        <span className="text-[10px] text-p-ink2 bg-green-50 border border-green-200 rounded-lg px-2 py-1">🔒 Facturada</span>
                      ) : (o as any).cristal_colocado ? (
                        <>
                          {(o.items||[]).filter((it:any)=>it.stock_id).length > 0 && (
                            <button onClick={async()=>{
                              if (!confirm('¿Retirar los productos? Esto devolverá al stock todas las unidades con stock vinculado de esta OS.')) return
                              const stockItems = (o.items||[]).filter((it:any)=>it.stock_id)
                              const fecha = todayStr()
                              for (const it of stockItems) {
                                const { error: errRet } = await supabase.rpc('insertar_movimiento_stock', {
                                  p_stock_id: it.stock_id, p_tipo: 'entrada',
                                  p_cantidad: it.c||1, p_fecha: fecha,
                                  p_descripcion: `Retiro productos OT-${String((o as any).numero||0).padStart(4,'0')} · ${o.aseguradora||o.cliente||''}`,
                                  p_user_id: userId,
                                })
                                if (errRet) { alert(`⚠ Error al devolver stock: ${errRet.message}`); return }
                              }
                              await supabase.from('ordenes_servicio').update({ cristal_colocado: false }).eq('id', o.id)
                              load()
                            }} style={{...btnSm,background:'#f59e0b',color:'#fff'}}>↩ Retirar productos</button>
                          )}
                          {o.aseguradora==='Sancor Seguros' ? (
                            <button onClick={()=>{ setFactManualModal(o);setFactManualForm({cae:'',nro:'',pv:'',vto:'',fecha:todayStr()}) }}
                              style={{...btnSm,background:'#7c3aed'}}>📋 Fact. manual</button>
                          ) : (
                            <button onClick={()=>{
                              if ((o as any).convertido_comp) { alert('⚠ Esta OS ya tiene comprobante emitido.'); return }
                              const params = new URLSearchParams({
                                cli: o.cliente??'', tel: o.telefono??'', veh: o.vehiculo??'', pat: (o as any).patente??'',
                                items: JSON.stringify(o.items), total: String(o.total), iva: String(o.iva??0), oid: o.id,
                                ...(o.aseguradora?{aseguradora:o.aseguradora}:{}),
                                ...((o as any).siniestro?{siniestro:(o as any).siniestro}:{}),
                              })
                              router.push(`/comprobantes?${params.toString()}`)
                            }} style={{...btnSm,background:'#00A550'}}>✓ Comprobante</button>
                          )}
                          <button onClick={()=>{setTurnoModal(o);setTurnoForm({fecha:todayStr(),hora:'09:00',trabajo:o.vehiculo||''})}}
                            style={{...btnSm,background:'#0891b2'}}>📅 Turno</button>
                        </>
                      ) : (o as any).estado==='realizado' ? (
                        <>
                          {(o.items||[]).filter((it:any)=>it.stock_id).length > 0 && (
                            <button onClick={async()=>{
                              const viaRemito = !!(o as any).stock_via_remito
                              if (!confirm(viaRemito
                                ? '¿Confirmar cristal colocado? El stock ya salió por remito al colocador — NO se descuenta de nuevo.'
                                : '¿Confirmar cristal colocado? Esto descontará el stock.')) return
                              if (!viaRemito) {
                                const stockItems = (o.items||[]).filter((it:any)=>it.stock_id)
                                const fecha = todayStr()
                                for (const it of stockItems) {
                                  const { error: errStockOS } = await supabase.rpc('insertar_movimiento_stock', {
                                    p_stock_id: it.stock_id, p_tipo: 'salida',
                                    p_cantidad: it.c||1, p_fecha: fecha,
                                    p_descripcion: `Colocado OT-${String((o as any).numero||0).padStart(4,'0')} · ${o.aseguradora||o.cliente||''}`,
                                    p_user_id: userId,
                                  })
                                  if (errStockOS) { alert(`⚠ Error al descontar stock: ${errStockOS.message}`); return }
                                }
                              }
                              await supabase.from('ordenes_servicio').update({ cristal_colocado: true }).eq('id', o.id)
                              load()
                            }} style={{...btnSm,background:'#0891b2'}}>🔧 Colocada</button>
                          )}
                          {o.aseguradora==='Sancor Seguros' ? (
                            <button onClick={()=>{ setFactManualModal(o);setFactManualForm({cae:'',nro:'',pv:'',vto:'',fecha:todayStr()}) }}
                              style={{...btnSm,background:'#7c3aed'}}>📋 Fact. manual</button>
                          ) : (
                            <button onClick={()=>{
                              if ((o as any).convertido_comp) { alert('⚠ Esta OS ya tiene comprobante emitido.'); return }
                              const params = new URLSearchParams({
                                cli: o.cliente??'', tel: o.telefono??'', veh: o.vehiculo??'', pat: (o as any).patente??'',
                                items: JSON.stringify(o.items), total: String(o.total), iva: String(o.iva??0), oid: o.id,
                                ...(o.aseguradora?{aseguradora:o.aseguradora}:{}),
                                ...((o as any).siniestro?{siniestro:(o as any).siniestro}:{}),
                              })
                              router.push(`/comprobantes?${params.toString()}`)
                            }} style={{...btnSm,background:'#00A550'}}>✓ Comprobante</button>
                          )}
                        </>
                      ) : (
                        <>
                          <button onClick={()=>{setTurnoModal(o);setTurnoForm({fecha:todayStr(),hora:'09:00',trabajo:o.vehiculo||''})}}
                            style={{...btnSm,background:'#0891b2'}}>📅 Turno</button>
                          <button onClick={async()=>{
                            await supabase.from('ordenes_servicio').update({estado:'realizado'}).eq('id',o.id); load()
                          }} style={{...btnSm,background:'#16a34a'}}>✅ Realizado</button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Modal fotos OS */}
      {adjModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={e=>{if(e.target===e.currentTarget)setAdjModal(null)}}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="flex items-start justify-between p-5 border-b border-p-line">
              <div>
                <h2 className="font-saira font-bold text-xl text-p-ink">📸 Fotos del trabajo</h2>
                <p className="text-sm text-p-ink2 mt-0.5">
                  OS {adjModal.numero ? `N° OS-${String(adjModal.numero).padStart(4,'0')}` : 'S/N'} · {adjModal.cliente}
                </p>
                <p className="text-[11px] text-p-green font-semibold mt-1">
                  ✓ Las fotos quedan disponibles en el comprobante vinculado
                </p>
              </div>
              <button onClick={()=>setAdjModal(null)} className="text-p-gray hover:text-p-ink text-2xl leading-none">✕</button>
            </div>
            <div className="overflow-y-auto flex-1 p-5 flex flex-col gap-4">
              {/* Upload fotos */}
              <div>
                <p className="text-[11px] font-bold text-p-ink2 uppercase tracking-wider mb-2">
                  Fotos ({adjuntos.filter(a=>a.tipo==='foto').length}/4)
                </p>
                {adjuntos.filter(a=>a.tipo==='foto').length < 4 && (
                  <label className={`flex items-center justify-center gap-2 border-2 border-dashed border-p-line rounded-xl p-4 cursor-pointer hover:border-p-green transition-colors ${uploading?'opacity-50':''}`}>
                    <span className="text-2xl">📷</span>
                    <span className="text-sm text-p-ink2">{uploading?'Subiendo…':'Agregar foto del trabajo'}</span>
                    <input type="file" accept="image/*" className="hidden" disabled={uploading}
                      onChange={e=>{const f=e.target.files?.[0]; if(f)subirArchivoOS(f,'foto'); e.target.value=''}}/>
                  </label>
                )}
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {adjuntos.filter(a=>a.tipo==='foto').map(a=>(
                    <div key={a.id} className="relative rounded-xl overflow-hidden border border-p-line shadow-sm">
                      <img src={a.url} alt={a.nombre} className="w-full h-32 object-cover"/>
                      <button onClick={()=>eliminarAdjuntoOS(a.id,a.storage_path)}
                        className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs shadow">✕</button>
                    </div>
                  ))}
                </div>
              </div>
              {/* OS firmada */}
              <div>
                <p className="text-[11px] font-bold text-p-ink2 uppercase tracking-wider mb-2">
                  OS firmada por el cliente ({adjuntos.filter(a=>a.tipo==='os_firmada').length}/1)
                </p>
                {adjuntos.filter(a=>a.tipo==='os_firmada').length === 0 ? (
                  <label className={`flex items-center justify-center gap-2 border-2 border-dashed border-blue-200 rounded-xl p-4 cursor-pointer hover:border-blue-400 bg-blue-50 ${uploading?'opacity-50':''}`}>
                    <span className="text-2xl">📄</span>
                    <span className="text-sm text-blue-600">{uploading?'Subiendo…':'Subir OS escaneada'}</span>
                    <input type="file" accept="image/*,application/pdf" className="hidden" disabled={uploading}
                      onChange={e=>{const f=e.target.files?.[0]; if(f)subirArchivoOS(f,'os_firmada'); e.target.value=''}}/>
                  </label>
                ) : (
                  <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl p-3">
                    <span className="text-2xl">📄</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-blue-700 truncate">{adjuntos.find(a=>a.tipo==='os_firmada')?.nombre}</p>
                      <a href={adjuntos.find(a=>a.tipo==='os_firmada')?.url} target="_blank" className="text-[11px] text-blue-500 hover:underline">Ver archivo</a>
                    </div>
                    <button onClick={()=>{const a=adjuntos.find(x=>x.tipo==='os_firmada'); if(a)eliminarAdjuntoOS(a.id,a.storage_path)}}
                      className="text-red-400 hover:text-red-600 text-sm">✕</button>
                  </div>
                )}
              </div>
            </div>
            <div className="p-4 border-t border-p-line flex justify-between items-center">
              {adjuntos.length > 0 ? (
                <button onClick={descargarAdjuntos} disabled={descargando}
                  style={{background:'#1565C0',color:'#fff',border:'none',borderRadius:8,padding:'8px 16px',fontWeight:700,fontSize:13,cursor:'pointer',opacity:descargando?.6:1}}>
                  {descargando?'Descargando…':`⬇ Descargar todo (${adjuntos.length})`}
                </button>
              ) : <span/>}
              <button onClick={()=>setAdjModal(null)}
                style={{background:'#6b7280',color:'#fff',border:'none',borderRadius:8,padding:'8px 20px',fontWeight:700,fontSize:13,cursor:'pointer'}}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      <Modal open={open} onClose={()=>setOpen(false)} title={editId ? "Editar orden de servicio" : "Nueva orden de servicio"}>
        <div className="flex flex-col gap-3">
          {/* Aseguradora — opcional, o puede ser solo cliente */}
          <div className="grid grid-cols-3 gap-3">
            <Field label="Aseguradora">
              <Select value={form.aseg} onChange={e=>setForm(p=>({...p,aseg:e.target.value}))}>
                <option value="">Sin aseguradora</option>
                {aseguradoras.map(a=><option key={a.id} value={a.nombre}>{a.nombre}</option>)}
              </Select>
            </Field>
            <Field label="N° Siniestro"><Input value={form.sin} onChange={e=>setForm(p=>({...p,sin:e.target.value}))} placeholder="000000"/></Field>
            <Field label="Póliza"><Input value={form.pol} onChange={e=>setForm(p=>({...p,pol:e.target.value}))} placeholder="000000"/></Field>
          </div>
          {/* Colaborador asignado */}
          <Field label="Colaborador asignado">
            <Select value={form.colaborador_id} onChange={e=>setForm(p=>({...p,colaborador_id:e.target.value}))}>
              <option value="">Sin asignar</option>
              {colaboradores.map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}
            </Select>
          </Field>
          {/* Asegurado */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Asegurado"><Input value={form.cli} onChange={e=>setForm(p=>({...p,cli:e.target.value}))} placeholder="Nombre"/></Field>
            <Field label="WhatsApp"><Input value={form.tel} onChange={e=>setForm(p=>({...p,tel:e.target.value}))} placeholder="54 9 …"/></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {/* Presupuestos del cliente */}
          {presCli.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
              <p className="text-[11px] font-bold text-blue-800 uppercase tracking-wider mb-2">📋 Presupuestos de este cliente — click para cargar</p>
              <div className="flex flex-col gap-1.5">
                {presCli.map((p:any) => (
                  <button key={p.id} onClick={()=>{
                    setItems(p.items||[])
                    setForm(prev=>({...prev, tel:p.telefono||prev.tel, veh:p.vehiculo||prev.veh}))
                    setPresCli([])
                  }} className="flex items-center gap-3 bg-white rounded-lg px-3 py-2 text-left hover:bg-blue-50 border border-blue-100 w-full">
                    <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full shrink-0">PRES</span>
                    <span className="text-xs text-p-ink flex-1 truncate">{p.vehiculo||'Sin vehículo'} · {p.items?.length||0} ítem(s)</span>
                    <span className="text-xs font-mono font-bold text-p-dark shrink-0">{('$'+Math.round(p.total||0).toLocaleString('es-AR'))}</span>
                    <span className="text-[10px] text-p-ink2 shrink-0">{p.fecha?.split('-').reverse().join('/')}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <Field label="Vehículo"><Input value={form.veh} onChange={e=>setForm(p=>({...p,veh:e.target.value}))} placeholder="VW Gol 2015"/></Field>
            <Field label="Patente"><Input value={form.pat} onChange={e=>setForm(p=>({...p,pat:e.target.value}))} placeholder="AB 123 CD"/></Field>
          </div>

          {/* Ítems */}
          <div className="border-t border-p-line2 pt-3">
            <label className="block text-[11px] font-semibold text-p-ink2 uppercase tracking-wider mb-2">Posición del vidrio</label>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {[
                {pos:'Parabrisas', label:'Parabrisas'},
                {pos:'Luneta', label:'Luneta'},
                {pos:'Puerta Del. Der.', label:'P.D.D'},
                {pos:'Puerta Del. Izq.', label:'P.D.I'},
                {pos:'Puerta Tras. Der.', label:'P.T.D'},
                {pos:'Puerta Tras. Izq.', label:'P.T.I'},
                {pos:'Custodia Der.', label:'Custodia D'},
                {pos:'Custodia Izq.', label:'Custodia I'},
                {pos:'Aleta', label:'Aleta'},
              ].map(v=>(
                <button type="button" key={v.pos}
                  onClick={()=>setPosVidrio(prev=>prev.includes(v.pos)?prev.filter(p=>p!==v.pos):[...prev,v.pos])}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${posVidrio.includes(v.pos)?'border-p-green bg-green-50 text-p-green font-semibold':'border-p-line text-p-ink2 hover:bg-p-light'}`}>
                  {posVidrio.includes(v.pos)?'✓ ':''}{v.label}
                </button>
              ))}
            </div>


          </div>
          {/* Lista ítems */}
          {items.length>0&&(
            <div className="border-t border-p-line2 pt-2">
              {items.map((it,i)=>(
                <div key={i} className={`flex items-center gap-2 py-1.5 border-b border-p-line2 text-sm ${it.d.toLowerCase().includes('adas')?'text-blue-700 font-semibold':''}`}>
                  <span className="flex-1">
                    {(it as any).codigo && <span className="font-mono text-[10px] font-bold bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded mr-1.5">{(it as any).codigo}</span>}
                    {it.d}{it.c>1?` ×${it.c}`:''}
                  </span>
                  <div className="flex items-center gap-1">
                    <input type="text" inputMode="decimal" value={it.p}
                    onChange={e=>setItems(prev=>prev.map((x,j)=>j===i?{...x,p:e.target.value as any}:x))}
                    onBlur={()=>setItems(prev=>prev.map((x,j)=>j===i?{...x,p:parseFloat(String(x.p).replace(',','.'))||0}:x))}
                    className="w-28 border border-p-line rounded px-2 py-1 text-xs font-mono focus:outline-none focus:border-p-green"/>
                    {ivaOn && <span className="text-[9px] text-p-ink2 whitespace-nowrap">s/IVA</span>}
                  </div>
                  <span className="font-mono text-xs w-24 text-right">{moneyARS2(it.c*(parseFloat(String(it.p).replace(',','.'))||0))}</span>
                  <button onClick={()=>setItems(prev=>prev.filter((_,j)=>j!==i))} className="text-red-400 text-xs ml-1">✕</button>
                </div>
              ))}
              {tieneADAS(items)&&(
                <div className="mt-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-700 font-semibold">
                  🛡️ Esta OS incluye calibración ADAS — se generará certificado con numeración ADAS automáticamente.
                </div>
              )}
              <label className="flex items-center gap-2 mt-2 text-sm cursor-pointer">
                <input type="checkbox" checked={ivaOn} onChange={e=>setIvaOn(e.target.checked)} className="accent-p-green"/>Sumar IVA 21%
              </label>
              <div className="bg-p-light rounded-lg p-3 mt-2 text-sm">
                {ivaOn&&<div className="flex justify-between text-p-ink2"><span>Subtotal</span><span className="font-mono">{moneyARS(neto)}</span></div>}
                {ivaOn&&<div className="flex justify-between text-p-ink2"><span>IVA 21%</span><span className="font-mono">{moneyARS(iva)}</span></div>}
                <div className="flex justify-between font-saira font-bold text-p-ink text-lg border-t border-p-line mt-1 pt-1"><span>TOTAL</span><span>{moneyARS2(total)}</span></div>
              </div>
            </div>
          )}
          {/* Productor */}
          <Field label="Productor de seguros (opcional)">
            <Select value={formProd} onChange={e=>setFormProd(e.target.value)}>
              <option value="">Sin productor</option>
              {productores.map((p:any)=><option key={p.id} value={p.id}>{p.nombre}{p.telefono?` · ${p.telefono}`:''}</option>)}
            </Select>
          </Field>
          {/* Stock */}
          <Field label="Artículo de stock (referencia — el stock se descuenta al facturar)">
            <div className="relative">
              <Input value={stockSel?`${stockSel.descripcion} (quedan ${stockSel.cantidad})`:stockQ}
                onChange={e=>{setStockQ(e.target.value);setStockSel(null)}}
                placeholder="Buscar código o descripción…"/>
              {stockSugs.length>0&&!stockSel&&(
                <div className="absolute z-20 top-full left-0 right-0 bg-white border border-p-line rounded-xl shadow-xl max-h-40 overflow-y-auto mt-1">
                  {stockSugs.map((s:any)=>(
                    <button key={s.id}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-p-light border-b border-p-line2 last:border-0"
                      onClick={()=>{
                        setStockSel(s); setStockSugs([]); setStockQ('')
                        setItems(prev=>{
                          // Si ya está en items, no duplicar
                          if(prev.find(x=>x.stock_id===s.id)) return prev
                          return [...prev,{d:s.descripcion,c:1,p:s.precio_venta||0,stock_id:s.id,codigo:s.codigo||null}]
                        })
                        setStockSel(null); setStockQ('')
                      }}>
                      <div className="flex items-center gap-2">
                        {s.codigo && <span className="font-mono text-[10px] font-bold bg-p-light text-p-dark px-1.5 py-0.5 rounded shrink-0">{s.codigo}</span>}
                        <span className="flex-1 truncate">{s.descripcion}</span>
                        {s.pendiente_ingreso
                          ? <span className="text-[10px] text-amber-600 font-bold shrink-0">⏳ Pend.</span>
                          : s.cantidad > 0
                            ? <span className="text-[10px] text-green-600 font-bold shrink-0">{s.cantidad} u.</span>
                            : <span className="text-[10px] text-red-500 shrink-0">sin stock</span>
                        }
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {stockSel&&<button onClick={()=>{setStockSel(null);setStockQ('')}} className="absolute right-2 top-2 text-red-400 text-xs">✕</button>}
            </div>
          </Field>
          <Field label="Observaciones"><Input value={form.obs} onChange={e=>setForm(p=>({...p,obs:e.target.value}))} placeholder="Opcional…"/></Field>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={()=>setOpen(false)} style={btnGray}>Cancelar</button>
            <button onClick={save} disabled={loading} style={{...btn,opacity:loading?.6:1}}>
              {loading?'Guardando…':'Guardar'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal generar turno desde OS */}
      <Modal open={!!turnoModal} onClose={()=>setTurnoModal(null)} title={`Nuevo turno — ${turnoModal?.cliente||''}`}>
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Fecha"><Input type="date" value={turnoForm.fecha} onChange={e=>setTurnoForm(p=>({...p,fecha:e.target.value}))}/></Field>
            <Field label="Hora"><Input type="time" value={turnoForm.hora} onChange={e=>setTurnoForm(p=>({...p,hora:e.target.value}))}/></Field>
          </div>
          <Field label="Trabajo a realizar"><Input value={turnoForm.trabajo} onChange={e=>setTurnoForm(p=>({...p,trabajo:e.target.value}))} placeholder="Descripción del trabajo"/></Field>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={()=>setTurnoModal(null)} style={{...btnGray}}>Cancelar</button>
            <button onClick={async()=>{
              if(!turnoModal) return
              // Si ya tiene turno, ofrecer reemplazarlo (cubre también turnos huérfanos/borrados)
              if (turnoModal.turno_id) {
                const { data: turnoViejo } = await supabase.from('turnos')
                  .select('id,fecha,hora').eq('id', turnoModal.turno_id).maybeSingle()
                const detalle = turnoViejo ? `el turno del ${String(turnoViejo.fecha||'').split('-').reverse().join('/')} ${turnoViejo.hora||''}` : 'un turno anterior (ya eliminado del calendario)'
                if (!confirm(`Esta OS ya tiene ${detalle}.\n¿Reemplazarlo por el nuevo (${turnoForm.fecha.split('-').reverse().join('/')} ${turnoForm.hora})?`)) return
                if (turnoViejo) await supabase.from('turnos').delete().eq('id', turnoViejo.id)
              }
              const { data: nuevoTurno, error: errTurno } = await supabase.from('turnos').insert({
                fecha: turnoForm.fecha, hora: turnoForm.hora,
                cliente: turnoModal.cliente||null, telefono: turnoModal.telefono||null,
                vehiculo: turnoModal.vehiculo||null, trabajo: turnoForm.trabajo||null,
                estado: 'confirmado', user_id: userId,
                os_id: turnoModal.id,  // vincula el turno a la OS
              }).select('id').single()
              if (errTurno || !nuevoTurno) { alert(`⚠ No se pudo crear el turno: ${errTurno?.message||'sin detalle'}`); return }
              // Guardar también el turno_id en la OS
              await supabase.from('ordenes_servicio').update({ turno_id: nuevoTurno.id }).eq('id', turnoModal.id)
              setTurnoModal(null)
              load()
            }} style={btn}>✓ Crear turno</button>
          </div>
        </div>
      </Modal>

      {/* Modal factura manual (Sancor) */}
      <Modal open={!!factManualModal} onClose={()=>setFactManualModal(null)} title={`Factura manual — ${factManualModal?.aseguradora||''}`}>
        <div className="flex flex-col gap-3">
          <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 text-sm text-purple-800">
            OS N° {factManualModal?.numero} · {factManualModal?.cliente} · {moneyARS(factManualModal?.total||0)}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Punto de venta"><Input value={factManualForm.pv} onChange={e=>setFactManualForm(p=>({...p,pv:e.target.value}))} placeholder="00001"/></Field>
            <Field label="N° Factura"><Input value={factManualForm.nro} onChange={e=>setFactManualForm(p=>({...p,nro:e.target.value}))} placeholder="00000001"/></Field>
          </div>
          <Field label="CAE"><Input value={factManualForm.cae} onChange={e=>setFactManualForm(p=>({...p,cae:e.target.value}))} placeholder="00000000000000"/></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Fecha factura"><Input type="date" value={factManualForm.fecha} onChange={e=>setFactManualForm(p=>({...p,fecha:e.target.value}))}/></Field>
            <Field label="Vencimiento CAE"><Input type="date" value={factManualForm.vto} onChange={e=>setFactManualForm(p=>({...p,vto:e.target.value}))}/></Field>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={()=>setFactManualModal(null)} style={btnGray}>Cancelar</button>
            <button onClick={async()=>{
              if(!factManualModal||!factManualForm.cae||!factManualForm.nro) return
              await supabase.from('ordenes_servicio').update({
                factura_manual_cae: factManualForm.cae,
                factura_manual_nro: factManualForm.nro,
                factura_manual_pv: factManualForm.pv,
                factura_manual_vto: factManualForm.vto||null,
                factura_manual_fecha: factManualForm.fecha||null,
                convertido_comp: true,
                estado: 'facturada',
              }).eq('id', factManualModal.id)
              setFactManualModal(null); load()
            }} style={{...btn,background:'#7c3aed'}}>✓ Registrar factura</button>
          </div>
        </div>
      </Modal>

      {/* Modal Envío a colocador externo */}
      <Modal open={colocModal} onClose={()=>setColocModal(false)} title="🚚 Enviar a colocador">
        <div className="flex flex-col gap-3">
          <Field label="Colocador">
            <Select value={colocSel} onChange={e=>setColocSel(e.target.value)}>
              <option value="">— Elegir colocador —</option>
              {colaboradores.filter(c=>c.es_colocador).map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}
            </Select>
          </Field>
          {colaboradores.filter(c=>c.es_colocador).length===0 && (
            <p className="text-xs" style={{color:'#b45309'}}>No hay colaboradores marcados como colocador — tildá "colocador" en la ficha del colaborador.</p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Field label="CUIT del colocador">
              <Input value={colocDatos.cuit} onChange={e=>setColocDatos(p=>({...p,cuit:e.target.value}))} placeholder="20-12345678-3"/>
            </Field>
            <Field label="Condición IVA">
              <Select value={colocDatos.iva} onChange={e=>setColocDatos(p=>({...p,iva:e.target.value}))}>
                <option>Responsable Inscripto</option><option>Monotributo</option>
                <option>Consumidor Final</option><option>Exento</option>
              </Select>
            </Field>
            <Field label="Dirección (destino)">
              <Input value={colocDatos.dir} onChange={e=>setColocDatos(p=>({...p,dir:e.target.value}))} placeholder="Calle 123, Gral. Villegas"/>
            </Field>
            <Field label="Transportista">
              <Input value={colocDatos.trans} onChange={e=>setColocDatos(p=>({...p,trans:e.target.value}))} placeholder="Nombre de quien transporta"/>
            </Field>
            <Field label="DNI transportista">
              <Input value={colocDatos.trans_dni} onChange={e=>setColocDatos(p=>({...p,trans_dni:e.target.value}))} placeholder="30123456"/>
            </Field>
          </div>
          <p className="text-[11px] text-p-ink2">Seleccioná las OS: se genera <b>un solo remito</b> con todos los vidrios, el stock se descuenta ahora (salida del depósito) y al marcar "Colocada" no se vuelve a descontar.</p>
          <div className="flex flex-col gap-1.5 max-h-72 overflow-y-auto">
            {colocCandidatas.length===0 && (
              <p className="text-xs text-p-ink2">{colocSel
                ? 'Este colocador no tiene OS asignadas pendientes de enviar. Asignalo como Colaborador en la OS y volvé acá.'
                : 'Elegí un colocador para ver sus OS.'}</p>
            )}
            {colocCandidatas.map((o:any)=>(
              <label key={o.id} className={`flex items-center gap-2 border rounded-lg px-3 py-2 cursor-pointer ${colocOSSel[o.id]?'border-amber-400 bg-amber-50':'border-p-line'}`}>
                <input type="checkbox" checked={!!colocOSSel[o.id]} onChange={e=>setColocOSSel(p=>({...p,[o.id]:e.target.checked}))}/>
                <span className="text-sm font-semibold shrink-0">OS-{String(o.numero).padStart(4,'0')}</span>
                <span className="text-xs text-p-ink2 truncate">{o.cliente} · {o.vehiculo||''} {o.aseguradora?`· ${o.aseguradora}`:''}</span>
                <span className="ml-auto text-[10px] font-mono text-p-ink2 shrink-0">{(o.items||[]).filter((it:any)=>it.stock_id).map((it:any)=>it.codigo).join(', ')}</span>
              </label>
            ))}
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={()=>setColocModal(false)} style={btnGray}>Cancelar</button>
            <button onClick={confirmarEnvioColocador} disabled={colocEnviando}
              style={{...btn,background:'#f59e0b',opacity:colocEnviando?.6:1}}>
              {colocEnviando?'Generando…':'🚚 Generar remito y enviar'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal Factura Sancor */}
      <Modal open={sancorModal} onClose={()=>setSancorModal(false)} title="Factura Sancor Seguros" size="lg">
        <div className="flex flex-col gap-4">
          {sancorOS.length === 0 ? (
            <p className="text-sm text-p-ink2 text-center py-6">No hay OS de Sancor con cristal colocado pendientes de facturar.</p>
          ) : (
            <>
              <p className="text-xs text-p-ink2">Seleccioná las OS a incluir en esta factura. Podés editar el importe de cada una.</p>
              <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
                {sancorOS.map((o:any) => (
                  <div key={o.id} className={`flex items-center gap-3 p-2.5 rounded-xl border ${sancorSel[o.id]?'border-purple-300 bg-purple-50':'border-p-line bg-white'}`}>
                    <input type="checkbox" checked={!!sancorSel[o.id]}
                      onChange={e=>setSancorSel(p=>({...p,[o.id]:e.target.checked}))}
                      className="w-4 h-4 accent-purple-600"/>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-p-ink truncate">OS-{String(o.numero).padStart(4,'0')} · {o.cliente}</p>
                      <p className="text-xs text-p-ink2">{o.vehiculo} · {o.fecha.split('-').reverse().join('/')}</p>
                    </div>
                    <input
                      type="text"
                      value={sancorTextos[o.id]??''}
                      onChange={e=>{
                        const txt = e.target.value
                        setSancorTextos(p=>({...p,[o.id]:txt}))
                        // Acepta punto o coma como decimal
                        const norm = txt.includes(',') ? txt.replace(/\./g,'').replace(',','.') : txt
                        const v = parseFloat(norm)
                        if (!isNaN(v)) setSancorTotales(p=>({...p,[o.id]:v}))
                      }}
                      className="w-28 border border-p-line rounded-lg px-2 py-1 text-sm font-mono text-right focus:outline-none focus:border-purple-400"
                    />
                  </div>
                ))}
              </div>
              {(() => {
                const totalSel = Object.entries(sancorSel).filter(([,v])=>v).reduce((acc,[id])=>acc+(sancorTotales[id]||0),0)
                const sugerido: 'FC'|'FCE' = (umbralFce > 0 && totalSel >= umbralFce) ? 'FCE' : 'FC'
                const tipoEfectivo = sancorTipoTocado ? sancorTipo : sugerido
                if (!sancorTipoTocado && sancorTipo !== sugerido) setTimeout(() => setSancorTipo(sugerido), 0)
                return (<>
              <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 flex justify-between items-center">
                <span className="text-sm font-semibold text-purple-800">Total seleccionado:</span>
                <span className="font-mono font-bold text-purple-800">{moneyARS2(totalSel)}</span>
              </div>
              {umbralFce > 0 && totalSel >= umbralFce && (
                <div className="border rounded-xl p-2.5 text-xs font-semibold"
                  style={{background:'#fffbeb',borderColor:'#fcd34d',color:'#92400e'}}>
                  ⚠ Supera el tope MiPyME ({moneyARS2(umbralFce)}) — corresponde <b>FCE</b>: emitila como Factura de Crédito Electrónica en el portal de ARCA y registrala acá con ese número.
                </div>
              )}
              <Field label="Tipo de comprobante emitido en ARCA">
                <div className="flex gap-2">
                  {(['FC','FCE'] as const).map(t => (
                    <button key={t} type="button"
                      onClick={() => { setSancorTipo(t); setSancorTipoTocado(true) }}
                      className="flex-1 rounded-lg px-3 py-2 text-sm font-bold border transition-colors"
                      style={tipoEfectivo === t
                        ? {background:'#7c3aed',color:'#fff',borderColor:'#7c3aed'}
                        : {background:'#fff',color:'#6b7280',borderColor:'#e5e7eb'}}>
                      {t === 'FC' ? 'Factura A común' : 'FCE MiPyME'}
                      {sugerido === t ? ' ★' : ''}
                    </button>
                  ))}
                </div>
                {sancorTipoTocado && tipoEfectivo !== sugerido && (
                  <p className="text-[10px] mt-1" style={{color:'#b45309'}}>Elegiste distinto a lo sugerido (★) — confirmá que corresponde.</p>
                )}
              </Field>
              {tipoEfectivo === 'FCE' && (
                <div className="border border-purple-200 rounded-xl p-3 flex flex-col gap-3" style={{background:'#faf5ff'}}>
                  <p className="text-xs font-bold text-purple-800">Emisión FCE directa en ARCA</p>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Cuenta de cobro (CBU informado)">
                      <Select value={sancorCbuId} onChange={e=>setSancorCbuId(e.target.value)}>
                        {cuentasBanco.map((c:any)=>(
                          <option key={c.id} value={c.id}>{c.banco} {c.tipo}{c.cbu_default_fce?' ★':''}</option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Vencimiento de pago">
                      <Input type="date" value={sancorVtoPago} onChange={e=>setSancorVtoPago(e.target.value)}/>
                    </Field>
                  </div>
                  <button disabled={sancorEmitiendo} onClick={()=>emitirArca('FCE')}
                    style={{...btn,background:'#7c3aed',opacity:sancorEmitiendo?0.6:1}}>
                    {sancorEmitiendo?'Emitiendo en ARCA…':'⚡ Emitir FCE en ARCA'}
                  </button>
                  <p className="text-[10px] text-p-ink2">ARCA devuelve N° y CAE automáticamente. Si falla, usá el registro manual de abajo con lo emitido en el portal.</p>
                </div>
              )}
              {tipoEfectivo === 'FC' && (
                <div className="border border-purple-200 rounded-xl p-3 flex flex-col gap-3" style={{background:'#faf5ff'}}>
                  <p className="text-xs font-bold text-purple-800">Emisión directa en ARCA</p>
                  <button disabled={sancorEmitiendo} onClick={()=>emitirArca('FC')}
                    style={{...btn,background:'#7c3aed',opacity:sancorEmitiendo?0.6:1}}>
                    {sancorEmitiendo?'Emitiendo en ARCA…':'⚡ Emitir Factura A en ARCA'}
                  </button>
                  <p className="text-[10px] text-p-ink2">ARCA devuelve N° y CAE automáticamente. Si falla, usá el registro manual de abajo con lo emitido en el portal.</p>
                </div>
              )}
                </>)
              })()}
              <div className="grid grid-cols-2 gap-3">
                <div style={{gridColumn:'1 / -1'}}>
                  <Field label="Observaciones (salen impresas en la factura)">
                    <textarea value={sancorObs} onChange={e=>setSancorObs(e.target.value)} rows={2}
                      placeholder="Siniestros, patentes, referencias…"
                      className="w-full border rounded-lg px-3 py-2 text-sm" />
                  </Field>
                </div>
                <Field label="Punto de venta"><Input value={sancorForm.pv} onChange={e=>setSancorForm(p=>({...p,pv:e.target.value}))} placeholder="00001"/></Field>
                <Field label="N° Factura"><Input value={sancorForm.nro} onChange={e=>setSancorForm(p=>({...p,nro:e.target.value}))} placeholder="00000001"/></Field>
              </div>
              <Field label="CAE"><Input value={sancorForm.cae} onChange={e=>setSancorForm(p=>({...p,cae:e.target.value}))} placeholder="00000000000000"/></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Fecha factura"><Input type="date" value={sancorForm.fecha} onChange={e=>setSancorForm(p=>({...p,fecha:e.target.value}))}/></Field>
                <Field label="Vencimiento CAE"><Input type="date" value={sancorForm.vto} onChange={e=>setSancorForm(p=>({...p,vto:e.target.value}))}/></Field>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button onClick={()=>setSancorModal(false)} style={btnGray}>Cancelar</button>
                <button disabled={sancorLoading||!sancorForm.cae||!sancorForm.nro} onClick={async()=>{
                  const selIds = Object.entries(sancorSel).filter(([,v])=>v).map(([id])=>id)
                  if (!selIds.length) { alert('Seleccioná al menos una OS'); return }
                  if (!sancorForm.cae||!sancorForm.nro) { alert('Completá CAE y N° Factura'); return }
                  setSancorLoading(true)
                  const total = selIds.reduce((acc,id)=>acc+(sancorTotales[id]||0),0)
                  const sugerido: 'FC'|'FCE' = (umbralFce > 0 && total >= umbralFce) ? 'FCE' : 'FC'
                  const tipoFinal = sancorTipoTocado ? sancorTipo : sugerido
                  // Doble confirmación si supera el umbral y eligió FC común igual
                  if (tipoFinal === 'FC' && umbralFce > 0 && total >= umbralFce) {
                    if (!confirm(`El total (${moneyARS2(total)}) supera el tope MiPyME (${moneyARS2(umbralFce)}) y elegiste Factura común.\n¿Confirmás que NO corresponde FCE?`)) { setSancorLoading(false); return }
                  }
                  const desc = `${tipoFinal} Sancor ${sancorForm.pv}-${sancorForm.nro} · ${selIds.length} OS`

                  // Registrar en CC aseguradoras
                  const { error: errCC } = await supabase.from('cuenta_corriente_aseguradoras').insert({
                    aseguradora_id: '79b592cf-a211-4f39-826a-5e7c0ef594dc',
                    fecha: sancorForm.fecha, tipo: 'factura',
                    descripcion: desc, debe: total, haber: 0,
                  })
                  if (errCC) { alert(`⚠ Error al registrar en CC: ${errCC.message}`); setSancorLoading(false); return }

                  // Marcar cada OS como facturada
                  const errsOS: string[] = []
                  for (const id of selIds) {
                    const { error: errOS } = await supabase.from('ordenes_servicio').update({
                      convertido_comp: true, estado: 'facturada',
                      factura_manual_cae: sancorForm.cae,
                      factura_manual_nro: sancorForm.nro,
                      factura_manual_pv: sancorForm.pv,
                      factura_manual_fecha: sancorForm.fecha,
                      factura_manual_vto: sancorForm.vto||null,
                      factura_manual_tipo: tipoFinal,
                    }).eq('id', id)
                    if (errOS) errsOS.push(`OS ${id.slice(0,8)}: ${errOS.message}`)
                  }
                  if (errsOS.length) alert(`⚠ Factura registrada en CC pero ${errsOS.length} OS no se marcaron:\n${errsOS.join('\n')}`)

                  setSancorLoading(false)
                  setSancorModal(false)
                  load()
                }} style={{...btn,background:'#7c3aed',opacity:sancorLoading?0.6:1}}>
                  {sancorLoading?'Registrando…':'✓ Registrar factura'}
                </button>
              </div>
            </>
          )}
        </div>
      </Modal>

    </div>
  )
}
