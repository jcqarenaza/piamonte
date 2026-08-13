'use client'
import { FIRMA_SAPPA } from '@/lib/firma'
import { LOGO_BASE64 } from '@/lib/logo'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Btn, Modal, Field, Input, Empty } from '@/components/ui'
import { todayStr } from '@/lib/utils/format'

const SISTEMAS_DEFAULT = [
  'Cámara frontal','Radar frontal','Asistente de mantenimiento de carril',
  'Frenado autónomo de emergencia','Control crucero adaptativo',
  'Reconocimiento de señales','Detector de punto ciego',
]
const PROCEDIMIENTOS_DEFAULT = [
  'Diagnóstico electrónico previo.','Verificación de códigos de falla.',
  'Instalación del parabrisas.',
  'Calibración estática/dinámica según especificación del fabricante.',
  'Diagnóstico posterior.','Verificación de correcto funcionamiento.',
]

// Datos fijos del equipo de calibración — no editables desde el formulario, así el
// certificado siempre refleja el equipo real instalado en el taller (MAHLE ST-9400).
const EQUIPO_MODELO = 'MAHLE ST-9400'
const EQUIPO_SERIE = '201111000229'

// Mismo criterio que ya usa OrdenesClient para decidir si una OS lleva certificado ADAS —
// se reusa acá para decidir, a partir de lo efectivamente facturado, qué versión del
// certificado corresponde emitir. Para el usuario esto es un solo "Certificado": el sistema
// decide internamente si incluye la parte de calibración ADAS o no.
function facturaTieneADAS(items: any[]): boolean {
  return (items ?? []).some((it:any) => (it.d||'').toLowerCase().includes('adas') || (it.d||'').toLowerCase().includes('calibración') || (it.d||'').toLowerCase().includes('calibracion'))
}

// Conceptos que son insumos o servicios facturados, no la pieza física de vidrio — nunca
// van listados en el certificado. El certificado documenta qué vidrio se instaló (si hay
// alguno en la factura), no cómo se cobró el trabajo.
const CONCEPTOS_NO_PIEZA = ['mano de obra', 'pegamento', 'activador', 'primer', 'gel', 'sensor', 'calibración adas', 'calibracion adas']

function esPiezaFisica(descripcion: string): boolean {
  const d = (descripcion || '').toLowerCase()
  return !CONCEPTOS_NO_PIEZA.some(c => d.includes(c))
}

// De toda la factura, devuelve solo las piezas de vidrio reales — puede ser ninguna
// (ej: el cliente solo pagó la calibración ADAS sin cambiar el vidrio).
function piezasFisicasDe(items: any[]): {d:string; c:number}[] {
  return (items ?? []).filter((it:any) => esPiezaFisica(it.d)).map((it:any) => ({ d: it.d, c: it.c }))
}

interface Cert {
  id:string;numero:string;fecha:string;cliente:string|null;razon_social:string|null
  marca:string|null;modelo:string|null;anio:string|null;dominio:string|null
  vin:string|null;kilometraje:string|null;sistemas:string[];otros_sistemas:string|null
  procedimientos:string[];equipo:string;software:string;protocolos:string
  observaciones:string|null;created_at:string;comprobante_id?:string|null
  piezas_instaladas?: {d:string;c:number}[] | null
}
interface CertInstalacion {
  id:string;numero:string;fecha:string;cliente:string|null;razon_social:string|null
  marca:string|null;modelo:string|null;anio:string|null;dominio:string|null
  vin:string|null;kilometraje:string|null;piezas_instaladas:any[]|null
  observaciones:string|null;created_at:string;comprobante_id?:string|null
}
interface ComprobanteMin {
  id:string;numero:number|null;fecha:string;cliente_nombre:string|null;cliente_cuit:string|null
  vehiculo:string|null;items:any[];total:number
}

type OrigenCert = 'manual' | 'comprobante'

export default function AdasClient({ userId }: { userId: string }) {
  const [certs, setCerts] = useState<Cert[]>([])
  const [certsInstalacion, setCertsInstalacion] = useState<CertInstalacion[]>([])
  const [open, setOpen] = useState(false)
  const supabase = createClient()

  // Origen del certificado — manual (como siempre) o derivado de una factura
  const [origen, setOrigen] = useState<OrigenCert>('manual')
  const [compQ, setCompQ] = useState('')
  const [compSugs, setCompSugs] = useState<ComprobanteMin[]>([])
  const [compSel, setCompSel] = useState<ComprobanteMin|null>(null)
  // Si el certificado incluye o no la calibración ADAS — se decide solo al elegir la factura,
  // pero en carga manual el operador lo marca con un simple toggle, no como una categoría aparte.
  const [incluyeAdas, setIncluyeAdas] = useState(false)

  // Búsqueda de OS para autocompletar código de pieza
  const [osQ, setOsQ] = useState('')
  const [osSugs, setOsSugs] = useState<any[]>([])

  const [form, setForm] = useState({
    fecha: todayStr(), cliente: '', razon_social: '', marca: '', modelo: '',
    anio: '', dominio: '', vin: '', kilometraje: '', otros_sistemas: '',
    equipo: EQUIPO_MODELO, software: 'Actualizado', protocolos: 'Según fabricante',
    observaciones: '', codigo_pieza: '',
  })
  const [sistemas, setSistemas] = useState<string[]>([...SISTEMAS_DEFAULT])
  const [procs, setProcs] = useState<string[]>([...PROCEDIMIENTOS_DEFAULT])

  useEffect(() => {
    supabase.from('certificados_adas').select('*').order('created_at', { ascending: false })
      .then(({ data }) => setCerts((data ?? []) as Cert[]))
    supabase.from('certificados_instalacion').select('*').order('created_at', { ascending: false })
      .then(({ data }) => setCertsInstalacion((data ?? []) as CertInstalacion[]))
  }, [supabase])

  useEffect(() => {
    if (osQ.length < 2) { setOsSugs([]); return }
    const qNum = parseInt(osQ)
    const filtro = !isNaN(qNum) ? `numero.eq.${qNum}` : `cliente.ilike.*${osQ}*`
    supabase.from('ordenes_servicio')
      .select('id, numero, cliente, stock_codigo, marca, modelo, anio, dominio')
      .or(filtro)
      .not('stock_codigo', 'is', null)
      .order('fecha', { ascending: false }).limit(8)
      .then(({ data }) => setOsSugs(data ?? []))
  }, [osQ, supabase])

  // Buscar comprobantes (facturas) por número o nombre de cliente
  useEffect(() => {
    if (compQ.trim().length < 2) { setCompSugs([]); return }
    const esNumero = /^\d+$/.test(compQ.trim())
    const query = supabase.from('comprobantes').select('id,numero,fecha,cliente_nombre,cliente_cuit,vehiculo,items,total')
      .order('created_at', { ascending: false }).limit(8)
    if (esNumero) query.eq('numero', parseInt(compQ.trim()))
    else query.ilike('cliente_nombre', `%${compQ}%`)
    query.then(({ data }) => setCompSugs((data ?? []) as ComprobanteMin[]))
  }, [compQ, supabase])

  // Al elegir el comprobante, se decide automáticamente si el certificado incluye la calibración
  // ADAS según el concepto facturado, y se precargan los datos del cliente/vehículo.
  function elegirComprobante(c: ComprobanteMin) {
    setCompSel(c)
    setCompSugs([])
    setIncluyeAdas(facturaTieneADAS(c.items))
    setForm(p => ({
      ...p,
      cliente: c.cliente_nombre || '',
      marca: '', modelo: c.vehiculo || '',
    }))
  }

  function cambiarOrigen(o: OrigenCert) {
    setOrigen(o)
    setCompSel(null); setCompQ(''); setCompSugs([])
    if (o === 'manual') setIncluyeAdas(false)
  }

  function toggleSistema(s: string) {
    setSistemas(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])
  }
  function toggleProc(p: string) {
    setProcs(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p])
  }

  async function save() {
    if (!form.cliente && !form.razon_social) { alert('Ingresá el nombre del cliente.'); return }
    if (origen === 'comprobante' && !compSel) { alert('Buscá y elegí la factura de origen.'); return }

    // Pieza(s) de vidrio reales de la factura — puede no haber ninguna si el cliente solo
    // pagó la calibración ADAS sin cambiar el vidrio.
    const piezas = compSel ? piezasFisicasDe(compSel.items) : []

    // Certificado con calibración ADAS — mismo flujo que ya existía, ahora con la pieza
    // de vidrio (si la hay) guardada junto al certificado.
    if (incluyeAdas) {
      const { data: num } = await supabase.rpc('next_adas_numero')
      const payload = {
        numero: num, fecha: form.fecha, cliente: form.cliente || null,
        razon_social: form.razon_social || null, marca: form.marca || null,
        modelo: form.modelo || null, anio: form.anio || null,
        codigo_pieza: form.codigo_pieza || null,
        dominio: form.dominio?.toUpperCase() || null, vin: form.vin || null,
        kilometraje: form.kilometraje || null, sistemas,
        otros_sistemas: form.otros_sistemas || null, procedimientos: procs,
        equipo: form.equipo, software: form.software, protocolos: form.protocolos,
        observaciones: form.observaciones || null, user_id: userId,
        comprobante_id: compSel?.id || null,
        piezas_instaladas: piezas.length ? piezas : null,
      }
      await supabase.from('certificados_adas').insert(payload)
      setOpen(false)
      resetForm()
      const { data } = await supabase.from('certificados_adas').select('*').order('created_at', { ascending: false })
      setCerts((data ?? []) as Cert[])
      if (payload.numero) printCertAdas({ ...payload, id: '', created_at: new Date().toISOString() } as Cert)
      return
    }

    // Certificado sin calibración ADAS (de instalación) — numeración propia, con la pieza
    // tomada directo de la factura de origen.
    const { data: num } = await supabase.rpc('next_instalacion_numero')
    const payload = {
      numero: num, fecha: form.fecha, cliente: form.cliente || null,
      razon_social: form.razon_social || null, marca: form.marca || null,
      modelo: form.modelo || null, anio: form.anio || null,
      codigo_pieza: form.codigo_pieza || null,
      dominio: form.dominio?.toUpperCase() || null, vin: form.vin || null,
      kilometraje: form.kilometraje || null,
      piezas_instaladas: piezas.length ? piezas : null,
      observaciones: form.observaciones || null, user_id: userId,
      comprobante_id: compSel?.id || null,
    }
    await supabase.from('certificados_instalacion').insert(payload)
    setOpen(false)
    resetForm()
    const { data } = await supabase.from('certificados_instalacion').select('*').order('created_at', { ascending: false })
    setCertsInstalacion((data ?? []) as CertInstalacion[])
    if (payload.numero) printCertInstalacion({ ...payload, id: '', created_at: new Date().toISOString() } as CertInstalacion)
  }

  function resetForm() {
    setForm({ fecha: todayStr(), cliente: '', razon_social: '', marca: '', modelo: '',
      anio: '', dominio: '', vin: '', kilometraje: '', otros_sistemas: '',
      equipo: EQUIPO_MODELO, software: 'Actualizado', protocolos: 'Según fabricante', observaciones: '' })
    setSistemas([...SISTEMAS_DEFAULT]); setProcs([...PROCEDIMIENTOS_DEFAULT])
    setOrigen('manual'); setCompSel(null); setCompQ(''); setCompSugs([]); setIncluyeAdas(false)
  }

  function printCertAdas(c: Cert) {
    const checked = (v: boolean) => v
      ? `<span style="color:#00A550;font-weight:bold;font-size:16px">✔</span>`
      : `<span style="color:#ccc;font-size:16px">☐</span>`
    const sistRow = (s: string, on: boolean) =>
      `<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid #eee;font-size:12px">
        ${checked(on)} <span>${s}</span></div>`
    const procRow = (s: string, on: boolean) =>
      `<div style="display:flex;align-items:flex-start;gap:8px;padding:4px 0;font-size:11.5px">
        ${checked(on)} <span>${s}</span></div>`

    const allSist = SISTEMAS_DEFAULT.map(s => sistRow(s, c.sistemas.includes(s))).join('')
    const otroSist = c.otros_sistemas
      ? `<div style="display:flex;align-items:center;gap:8px;padding:5px 0;font-size:12px">${checked(true)} <span>${c.otros_sistemas}</span></div>` : ''
    const allProc = PROCEDIMIENTOS_DEFAULT.map(p => procRow(p, c.procedimientos.includes(p))).join('')
    const fechaFmt = c.fecha.split('-').reverse().join('/')

    // Si la factura incluía una pieza de vidrio real, se muestra cuál es. Si el cliente
    // solo pagó la calibración ADAS sin cambiar el vidrio, esta sección no se imprime.
    const piezas = c.piezas_instaladas ?? []
    const codigoPiezaHtml = c.codigo_pieza
      ? `<div style="font-size:10px;color:#555;margin-top:2px">Código: <strong>${c.codigo_pieza}</strong></div>` : ''
    const piezaHtml = piezas.length || c.codigo_pieza
      ? `<div class="section" style="margin-top:10px">
          <div class="sec-title"><span>🪟</span> VIDRIO INSTALADO</div>
          ${piezas.map(p => `<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #eee;font-size:11px"><span>${p.d}</span><span style="font-weight:bold">×${p.c}</span></div>`).join('')}
          ${codigoPiezaHtml}
        </div>`
      : ''

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Certificado N° ${c.numero}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,Helvetica,sans-serif;background:#fff;color:#1a1a1a;width:210mm;margin:0 auto;font-size:11px}
  .header{background:#fff;color:#1a1a1a;padding:10px 20px;display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #00A550}
  .logo-area{display:flex;flex-direction:column}
  .logo-name{font-size:28px;font-weight:900;letter-spacing:-1px;color:#fff}
  .logo-name span{color:#00A550}
  .logo-sub{font-size:10px;letter-spacing:3px;color:#555;margin-top:2px}
  .shield{background:#00A550;color:#fff;border-radius:12px;padding:10px 14px;text-align:center;border:2px solid #fff}
  .shield .sv{font-size:10px;font-weight:bold;letter-spacing:1px}
  .shield .sa{font-size:20px;font-weight:900;line-height:1}
  .shield .sb{font-size:10px;letter-spacing:2px}
  .title-bar{background:#fff;padding:10px 16px 6px;border-bottom:4px solid #00A550}
  .cert-title{font-size:26px;font-weight:900;text-transform:uppercase;line-height:1.1;color:#1a1a1a}
  .cert-title .accent{color:#00A550}
  .cert-num{font-size:13px;font-weight:bold;color:#00A550;margin-top:4px}
  .cert-fecha{font-size:12px;color:#555;margin-top:2px}
  .body{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;padding:8px 16px}
  .section{border:1.5px solid #1a1a1a;border-radius:8px;padding:10px 12px}
  .sec-title{font-size:10.5px;font-weight:900;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;display:flex;align-items:center;gap:6px;color:#1a1a1a}
  .sec-title span{color:#00A550}
  .field-line{border:none;border-bottom:1px solid #888;width:100%;margin:4px 0 8px;display:block;font-size:11.5px;color:#1a1a1a}
  .field-label{font-size:10px;color:#555;margin-top:4px}
  .equip-row{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:6px 16px}
  .equip-box{border:1.5px solid #1a1a1a;border-radius:8px;padding:10px 12px}
  .result-box{background:#00A550;color:#fff;border-radius:8px;padding:12px 14px;margin-top:8px;text-align:center}
  .result-check{font-size:28px;font-weight:900}
  .result-label{font-size:14px;font-weight:900;text-transform:uppercase;letter-spacing:1px;margin-top:2px}
  .footer-sig{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;padding:6px 16px}
  .sig-box{border:1.5px solid #1a1a1a;border-radius:8px;padding:10px 12px}
  .sig-line{border-bottom:1px solid #888;height:40px;margin:8px 0 4px}
  .footer-bar{background:#f5f5f5;color:#1a1a1a;padding:8px 20px;display:flex;justify-content:space-between;align-items:center;margin-top:6px;border-top:2px solid #00A550}
  .footer-logo-name{font-size:16px;font-weight:900;color:#fff}
  .footer-logo-name span{color:#00A550}
  .footer-contact{display:flex;gap:20px;font-size:11px}
  .footer-slogan{font-size:9px;color:#555;text-align:center;padding:3px 20px;background:#f0f0f0}
  @media print{body{width:auto;margin:0;font-size:10px}@page{margin:48mm 10mm 28mm 10mm;size:A4}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}.page{width:100%;max-width:none}}
</style></head><body>

<div class="header">
  <div class="logo-area">
    <img src="${LOGO_BASE64}" alt="El Piamonte" style="height:40px;object-fit:contain;"/>
    <div class="logo-sub">SEGURIDAD • TECNOLOGÍA • CONFIANZA</div>
  </div>
  <div class="shield">
    <div class="sv">VEHÍCULO</div>
    <div class="sv">CALIBRADO</div>
    <div class="sa">ADAS</div>
    <div style="font-size:18px;margin-top:2px">🛡</div>
  </div>
</div>

<div class="title-bar">
  <div class="cert-title">CERTIFICADO DE<br><span class="accent">CALIBRACIÓN ADAS</span></div>
  <div class="cert-num">N° ${c.numero}</div>
  <div class="cert-fecha">Fecha: ${fechaFmt}</div>
</div>

<div class="body">
  <div>
    <div class="section" style="margin-bottom:10px">
      <div class="sec-title"><span>👤</span> DATOS DEL CLIENTE</div>
      <div class="field-label">Nombre y Apellido / Razón Social:</div>
      <div class="field-line">${c.cliente || c.razon_social || ''}</div>
    </div>
    <div class="section">
      <div class="sec-title"><span>🚗</span> DATOS DEL VEHÍCULO</div>
      ${[['Marca', c.marca],['Modelo', c.modelo],['Año', c.anio],['Dominio', c.dominio],['VIN (N° de chasis)', c.vin],['Kilometraje', c.kilometraje]].map(([l,v]) =>
        `<div class="field-label">${l}:</div><div class="field-line">${v || ''}</div>`).join('')}
    </div>
    ${piezaHtml}
  </div>

  <div class="section">
    <div class="sec-title"><span>🎯</span> SISTEMAS CALIBRADOS</div>
    ${allSist}
    ${otroSist}
    <div style="display:flex;align-items:center;gap:8px;padding:5px 0;font-size:12px">
      <span style="color:#ccc;font-size:16px">☐</span>
      <span>Otro: ${c.otros_sistemas || '_________________'}</span>
    </div>
  </div>

  <div>
    <div class="section" style="margin-bottom:10px">
      <div class="sec-title"><span>🔧</span> PROCEDIMIENTO REALIZADO</div>
      ${allProc}
    </div>
    <div class="section">
      <div class="sec-title">📊 RESULTADO</div>
      <div class="result-box">
        <div class="result-check">✔</div>
        <div class="result-label">CALIBRACIÓN<br>EXITOSA</div>
      </div>
      <div style="font-size:10px;color:#555;margin-top:8px">El vehículo cumple con los parámetros establecidos por el fabricante para los sistemas ADAS instalados.</div>
      ${c.observaciones ? `<div style="font-size:10.5px;margin-top:8px"><b>Observaciones:</b><br>${c.observaciones}</div>` : ''}
    </div>
  </div>
</div>

<div class="equip-row">
  <div class="equip-box">
    <div class="sec-title"><span>⚙</span> EQUIPO UTILIZADO</div>
    <div style="font-size:11px;color:#555">Equipo de calibración:</div>
    <div style="font-size:15px;font-weight:900;color:#1a1a1a;margin:4px 0">${c.equipo}</div>
    <div style="font-size:11px;color:#555">N° de serie: <b>${EQUIPO_SERIE}</b></div>
    <div style="font-size:11px;color:#555">Software: <b>${c.software}</b></div>
    <div style="font-size:11px;color:#555">Protocolos: <b>${c.protocolos}</b></div>
  </div>
  <div style="border:1.5px solid #1a1a1a;border-radius:8px;display:flex;align-items:center;justify-content:center">
    <div style="text-align:center;padding:20px">
      <div style="font-size:40px">🚗</div>
      <div style="font-size:10px;color:#555;margin-top:4px">Sistema de calibración ADAS</div>
    </div>
  </div>
</div>

<div class="footer-sig">
  <div class="sig-box">
    <div class="sec-title">✍ RESPONSABLE TÉCNICO</div>
    <div style="margin:4px 0">
      <img src="${FIRMA_SAPPA}" alt="firma" style="height:44px;object-fit:contain;max-width:120px"/>
    </div>
    <div style="font-size:12px;font-weight:bold;margin-top:4px">Mario Sappa</div>
    <div style="font-size:10px;color:#555">Técnico Especialista en ADAS</div>
  </div>
  <div class="sig-box" style="display:flex;flex-direction:column;align-items:center;justify-content:center">
    <div style="border:3px solid #00A550;border-radius:50%;width:88px;height:88px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:2px">
      <div style="font-size:7px;font-weight:900;color:#00A550;letter-spacing:.5px;line-height:1.2">PARABRISAS<br>EL PIAMONTE</div>
      <div style="color:#00A550;font-size:16px">🛡</div>
      <div style="font-size:6.5px;font-weight:700;color:#555;letter-spacing:.3px">GARANTÍA Y CALIDAD</div>
    </div>
  </div>
  <div class="sig-box" style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px">
    <div style="font-size:10px;font-weight:bold;text-align:center;color:#1a1a1a">CONSULTAS Y GARANTÍA</div>
    <div style="font-size:9px;color:#555;text-align:center">Parabrisas El Piamonte</div>
    <div style="background:#00A550;color:#fff;border-radius:6px;padding:6px 14px;font-size:10px;text-align:center;font-weight:bold">
      📱 2302 595969
    </div>
    <div style="font-size:9px;color:#555;text-align:center">General Pico, La Pampa</div>
    <div style="font-size:9px;color:#00A550;font-weight:bold">Cert. N° ${c.numero.toString().padStart(7,'0')}</div>
  </div>
</div>

<div class="footer-bar">
  <div>
    <img src="${LOGO_BASE64}" alt="El Piamonte" style="height:30px;object-fit:contain;"/>
    <div style="font-size:9px;color:#aaa">Especialistas en cristales automotrices.</div>
    <div style="font-size:8px;color:#aaa">INSTALACIÓN PROFESIONAL • DIAGNÓSTICO ELECTRÓNICO • CALIBRACIÓN DE SISTEMAS ADAS</div>
  </div>
  <div class="footer-contact">
    <div><div style="color:#00A550;font-weight:bold;font-size:13px">📞 2302 595969</div><div style="color:#aaa;font-size:9px">WhatsApp</div></div>
    <div><div style="color:#00A550;font-weight:bold;font-size:13px">📍 General Pico, La Pampa</div><div style="color:#aaa;font-size:9px">Calle 17 N° 1224</div></div>
  </div>
</div>
<div class="footer-slogan">NO VENDEMOS UN VIDRIO. DEVOLVEMOS LA SEGURIDAD ORIGINAL DE SU VEHÍCULO.</div>

<script>window.onload=function(){setTimeout(function(){window.print()},400)}<\/script>
</body></html>`
    const w = window.open('', '_blank')!
    w.document.write(html)
    w.document.close()
  }

  // Certificado sin calibración ADAS — mismos colores, escudo y logo que el de ADAS, para
  // mantener una sola identidad visual. Muestra la pieza de vidrio instalada y la garantía
  // de 12 meses sobre la colocación.
  function printCertInstalacion(c: CertInstalacion) {
    const fechaFmt = c.fecha.split('-').reverse().join('/')
    const piezas = (c.piezas_instaladas ?? [])
    const codigoHtmlInst = c.codigo_pieza
      ? `<div style="font-size:10px;color:#555;margin-top:4px">Código: <strong>${c.codigo_pieza}</strong></div>` : ''
    const piezasHtml = piezas.length
      ? piezas.map((p:any) =>
          `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #eee;font-size:12px">
            <span>${p.d}</span><span style="font-weight:bold">×${p.c}</span></div>`).join('') + codigoHtmlInst
      : c.codigo_pieza
        ? codigoHtmlInst
        : '<p style="font-size:11px;color:#888">Sin detalle de pieza</p>'

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Certificado N° ${c.numero}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,Helvetica,sans-serif;background:#fff;color:#1a1a1a;width:210mm;margin:0 auto;font-size:11px}
  .header{background:#fff;color:#1a1a1a;padding:10px 20px;display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #00A550}
  .logo-area{display:flex;flex-direction:column}
  .logo-sub{font-size:10px;letter-spacing:3px;color:#555;margin-top:2px}
  .shield{background:#00A550;color:#fff;border-radius:12px;padding:10px 14px;text-align:center;border:2px solid #fff}
  .shield .sv{font-size:10px;font-weight:bold;letter-spacing:1px}
  .shield .sa{font-size:16px;font-weight:900;line-height:1}
  .title-bar{background:#fff;padding:10px 16px 6px;border-bottom:4px solid #00A550}
  .cert-title{font-size:26px;font-weight:900;text-transform:uppercase;line-height:1.1;color:#1a1a1a}
  .cert-title .accent{color:#00A550}
  .cert-num{font-size:13px;font-weight:bold;color:#00A550;margin-top:4px}
  .cert-fecha{font-size:12px;color:#555;margin-top:2px}
  .body{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:10px 16px}
  .section{border:1.5px solid #1a1a1a;border-radius:8px;padding:10px 12px}
  .sec-title{font-size:10.5px;font-weight:900;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;display:flex;align-items:center;gap:6px;color:#00A550}
  .field-line{border:none;border-bottom:1px solid #888;width:100%;margin:4px 0 8px;display:block;font-size:11.5px;color:#1a1a1a}
  .field-label{font-size:10px;color:#555;margin-top:4px}
  .garantia-box{background:#00A550;color:#fff;border-radius:8px;padding:10px 12px}
  .footer-sig{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;padding:6px 16px}
  .sig-box{border:1.5px solid #1a1a1a;border-radius:8px;padding:10px 12px}
  .footer-bar{background:#f5f5f5;color:#1a1a1a;padding:8px 20px;display:flex;justify-content:space-between;align-items:center;margin-top:6px;border-top:2px solid #00A550}
  .footer-contact{display:flex;gap:20px;font-size:11px}
  .footer-slogan{font-size:9px;color:#555;text-align:center;padding:3px 20px;background:#f0f0f0}
  @media print{body{width:auto;margin:0;font-size:10px}@page{margin:48mm 10mm 28mm 10mm;size:A4}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style></head><body>

<div class="header">
  <div class="logo-area">
    <img src="${LOGO_BASE64}" alt="El Piamonte" style="height:40px;object-fit:contain;"/>
    <div class="logo-sub">SEGURIDAD • TECNOLOGÍA • CONFIANZA</div>
  </div>
  <div class="shield">
    <div class="sv">PIEZA</div>
    <div class="sv">INSTALADA</div>
    <div class="sa">✔</div>
  </div>
</div>

<div class="title-bar">
  <div class="cert-title">CERTIFICADO DE<br><span class="accent">INSTALACIÓN</span></div>
  <div class="cert-num">N° ${c.numero}</div>
  <div class="cert-fecha">Fecha: ${fechaFmt}</div>
</div>

<div class="body">
  <div>
    <div class="section" style="margin-bottom:10px">
      <div class="sec-title"><span>👤</span> DATOS DEL CLIENTE</div>
      <div class="field-label">Nombre y Apellido / Razón Social:</div>
      <div class="field-line">${c.cliente || c.razon_social || ''}</div>
    </div>
    <div class="section">
      <div class="sec-title"><span>🚗</span> DATOS DEL VEHÍCULO</div>
      ${[['Marca', c.marca],['Modelo', c.modelo],['Año', c.anio],['Dominio', c.dominio],['VIN (N° de chasis)', c.vin],['Kilometraje', c.kilometraje]].map(([l,v]) =>
        `<div class="field-label">${l}:</div><div class="field-line">${v || ''}</div>`).join('')}
    </div>
  </div>
  <div>
    <div class="section" style="margin-bottom:10px">
      <div class="sec-title"><span>🪟</span> VIDRIO INSTALADO</div>
      ${piezasHtml}
      ${c.observaciones ? `<div style="font-size:10.5px;margin-top:10px"><b>Observaciones:</b><br>${c.observaciones}</div>` : ''}
    </div>
    <div class="garantia-box">
      <div style="font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Garantía</div>
      <div style="font-size:15px;font-weight:900">12 meses</div>
      <div style="font-size:9px;margin-top:4px;line-height:1.4;opacity:.95">Sobre la instalación realizada, contra filtraciones o defectos de colocación. No cubre roturas por impacto.</div>
    </div>
  </div>
</div>

<div class="footer-sig">
  <div class="sig-box">
    <div class="sec-title" style="color:#1a1a1a">✍ RESPONSABLE TÉCNICO</div>
    <div style="margin:4px 0"><img src="${FIRMA_SAPPA}" alt="firma" style="height:44px;object-fit:contain;max-width:120px"/></div>
    <div style="font-size:12px;font-weight:bold;margin-top:4px">Mario Sappa</div>
    <div style="font-size:10px;color:#555">Técnico Especialista en Cristales Automotrices</div>
  </div>
  <div class="sig-box" style="display:flex;flex-direction:column;align-items:center;justify-content:center">
    <div style="border:3px solid #00A550;border-radius:50%;width:88px;height:88px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:2px">
      <div style="font-size:7px;font-weight:900;color:#00A550;letter-spacing:.5px;line-height:1.2">PARABRISAS<br>EL PIAMONTE</div>
      <div style="color:#00A550;font-size:16px">🛡</div>
      <div style="font-size:6.5px;font-weight:700;color:#555;letter-spacing:.3px">GARANTÍA Y CALIDAD</div>
    </div>
  </div>
  <div class="sig-box" style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px">
    <div style="font-size:10px;font-weight:bold;text-align:center;color:#1a1a1a">CONSULTAS Y GARANTÍA</div>
    <div style="font-size:9px;color:#555;text-align:center">Parabrisas El Piamonte</div>
    <div style="background:#00A550;color:#fff;border-radius:6px;padding:6px 14px;font-size:10px;text-align:center;font-weight:bold">📱 2302 595969</div>
    <div style="font-size:9px;color:#555;text-align:center">General Pico, La Pampa</div>
    <div style="font-size:9px;color:#00A550;font-weight:bold">Cert. N° ${c.numero}</div>
  </div>
</div>

<div class="footer-bar">
  <div>
    <img src="${LOGO_BASE64}" alt="El Piamonte" style="height:30px;object-fit:contain;"/>
    <div style="font-size:9px;color:#aaa">Especialistas en cristales automotrices.</div>
  </div>
  <div class="footer-contact">
    <div><div style="color:#00A550;font-weight:bold;font-size:13px">📞 2302 595969</div><div style="color:#aaa;font-size:9px">WhatsApp</div></div>
    <div><div style="color:#00A550;font-weight:bold;font-size:13px">📍 General Pico, La Pampa</div><div style="color:#aaa;font-size:9px">Calle 17 N° 1224</div></div>
  </div>
</div>
<div class="footer-slogan">NO VENDEMOS UN VIDRIO. DEVOLVEMOS LA SEGURIDAD ORIGINAL DE SU VEHÍCULO.</div>

<script>window.onload=function(){setTimeout(function(){window.print()},400)}<\/script>
</body></html>`
    const w = window.open('', '_blank')!
    w.document.write(html)
    w.document.close()
  }

  // Un solo listado de "Certificados" — el tipo (con o sin ADAS) es solo una etiqueta,
  // no una categoría que el usuario tenga que elegir de antemano.
  const todosCerts = [
    ...certs.map(c => ({ ...c, _tipo: 'adas' as const })),
    ...certsInstalacion.map(c => ({ ...c, _tipo: 'instalacion' as const })),
  ].sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  return (
    <div>
      <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
        <div>
          <h1 className="font-saira font-bold text-xl text-p-ink">Certificados</h1>
          <p className="text-xs text-p-ink2 mt-0.5">Se generan a partir de una factura o se cargan a mano. Incluyen la calibración ADAS automáticamente cuando corresponde.</p>
        </div>
        <button onClick={() => setOpen(true)} style={{background:"#00A550",color:"#fff",border:"none",borderRadius:10,padding:"10px 20px",fontWeight:700,fontSize:14,cursor:"pointer"}}>+ Nuevo certificado</button>
      </div>

      {todosCerts.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-4xl mb-3">🛡</p>
          <p className="font-saira font-bold text-p-ink text-lg">Sin certificados todavía</p>
          <p className="text-p-ink2 text-sm mt-1">Generá el primero con el botón de arriba.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {todosCerts.map((c:any) => (
            <div key={`${c._tipo}-${c.id}`} className="bg-white border border-p-line rounded-xl p-4 shadow-sm flex items-center gap-4 flex-wrap">
              <div className="font-mono font-bold text-sm px-3 py-1.5 rounded-lg shrink-0 text-white" style={{background:'#00A550'}}>
                N° {c.numero}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-saira font-bold text-p-ink">{c.cliente || c.razon_social || '—'}</p>
                <p className="text-xs text-p-ink2 mt-0.5">
                  {[c.marca, c.modelo, c.anio, c.dominio].filter(Boolean).join(' · ')}
                  {' · '}{c.fecha.split('-').reverse().join('/')}
                </p>
                <p className="text-xs mt-0.5 font-semibold" style={{color:'#00A550'}}>
                  {c._tipo === 'adas' ? 'Incluye calibración ADAS' : 'Instalación'}
                  {c.piezas_instaladas?.length ? ` · ${c.piezas_instaladas[0].d}` : ''}
                </p>
              </div>
              <button onClick={() => c._tipo === 'adas' ? printCertAdas(c) : printCertInstalacion(c)}
                style={{background:'#00A550',color:"#fff",border:"none",borderRadius:8,padding:"6px 14px",fontWeight:700,fontSize:13,cursor:"pointer"}}>
                🖨 Imprimir
              </button>
            </div>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Nuevo certificado">
        <div className="flex flex-col gap-4">

          {/* Origen del certificado */}
          <div>
            <p className="text-xs font-bold text-p-ink uppercase tracking-wider mb-2">¿De dónde sale este certificado?</p>
            <div className="flex gap-2">
              <button onClick={()=>cambiarOrigen('manual')}
                style={{background:origen==='manual'?'#0C1810':'#fff',color:origen==='manual'?'#fff':'#4A6655',border:`1.5px solid ${origen==='manual'?'#0C1810':'#C2DDD0'}`,borderRadius:10,padding:'8px 16px',fontWeight:700,fontSize:13,cursor:'pointer'}}>
                ✍ Cargar a mano
              </button>
              <button onClick={()=>cambiarOrigen('comprobante')}
                style={{background:origen==='comprobante'?'#00A550':'#fff',color:origen==='comprobante'?'#fff':'#4A6655',border:`1.5px solid ${origen==='comprobante'?'#00A550':'#C2DDD0'}`,borderRadius:10,padding:'8px 16px',fontWeight:700,fontSize:13,cursor:'pointer'}}>
                🧾 Buscar factura
              </button>
            </div>
          </div>

          {origen === 'comprobante' && (
            <div>
              <Field label="Buscar factura por número o cliente">
                <div className="relative">
                  <Input value={compQ} onChange={e=>{setCompQ(e.target.value); setCompSel(null)}} placeholder="N° de factura o nombre del cliente…" />
                  {compSugs.length > 0 && (
                    <div className="absolute z-20 top-full left-0 right-0 bg-white border border-p-line rounded-xl shadow-xl max-h-56 overflow-y-auto mt-1">
                      {compSugs.map(c => (
                        <button key={c.id} onClick={()=>elegirComprobante(c)}
                          className="w-full text-left px-3 py-2.5 text-sm hover:bg-p-light border-b border-p-line2 last:border-0">
                          <p className="font-medium text-p-ink">FA-{String(c.numero||0).padStart(8,'0')} · {c.cliente_nombre || 'Consumidor Final'}</p>
                          <p className="text-[10px] text-p-ink2">{c.vehiculo || 'Sin vehículo'} · {c.fecha?.split('-').reverse().join('/')} · {facturaTieneADAS(c.items) ? '🛡 incluye ADAS' : '🔧 sin ADAS'}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </Field>
              {compSel && (
                <div className="mt-2 rounded-xl p-3 border bg-green-50 border-green-200">
                  <p className="text-sm font-semibold text-green-800">
                    ✓ FA-{String(compSel.numero||0).padStart(8,'0')} — {compSel.cliente_nombre || 'Consumidor Final'}
                  </p>
                  <p className="text-xs mt-1 text-green-700">
                    {incluyeAdas
                      ? '🛡 Esta factura incluye Calibración ADAS — el certificado la va a incluir.'
                      : '🔧 Esta factura no incluye Calibración ADAS.'}
                  </p>
                  {piezasFisicasDe(compSel.items).length > 0 ? (
                    <p className="text-xs mt-1 text-green-700">
                      🪟 Vidrio detectado: {piezasFisicasDe(compSel.items).map(p=>p.d).join(', ')}
                    </p>
                  ) : (
                    <p className="text-xs mt-1 text-green-700">⚠ Sin vidrio en esta factura — solo servicio.</p>
                  )}
                  <label className="flex items-center gap-2 mt-2 text-xs cursor-pointer text-green-800">
                    <input type="checkbox" checked={incluyeAdas}
                      onChange={e => setIncluyeAdas(e.target.checked)}
                      className="accent-p-green" />
                    Incluye calibración ADAS (corregir manualmente si hace falta)
                  </label>
                </div>
              )}
            </div>
          )}

          {origen === 'manual' && (
            <label className="flex items-center gap-2.5 cursor-pointer bg-p-light rounded-xl p-3">
              <input type="checkbox" checked={incluyeAdas} onChange={e => setIncluyeAdas(e.target.checked)} className="w-4 h-4 accent-p-green rounded" />
              <span className="text-sm font-medium text-p-ink">Este certificado incluye calibración ADAS</span>
            </label>
          )}

          {/* Fecha */}
          <Field label="Fecha del certificado">
            <Input type="date" value={form.fecha} onChange={e => setForm(p => ({ ...p, fecha: e.target.value }))} />
          </Field>

          {/* Buscar OS para autocompletar código de pieza */}
          <div className="relative">
            <label className="block text-[11px] font-semibold text-p-ink2 uppercase tracking-wider mb-1">Buscar OS (autocompleta código de pieza)</label>
            <Input value={osQ} onChange={e=>setOsQ(e.target.value)} placeholder="Número de OS o cliente…"/>
            {osSugs.length > 0 && (
              <div className="absolute z-20 top-full left-0 right-0 bg-white border border-p-line rounded-xl shadow-xl max-h-48 overflow-y-auto mt-1">
                {osSugs.map((o:any)=>(
                  <button key={o.id} onClick={()=>{
                    setForm(p=>({...p,
                      cliente: o.cliente||p.cliente,
                      marca: o.marca||p.marca,
                      modelo: o.modelo||p.modelo,
                      anio: o.anio||p.anio,
                      dominio: o.dominio||p.dominio,
                      codigo_pieza: o.stock_codigo||p.codigo_pieza,
                    }))
                    setOsQ(''); setOsSugs([])
                  }} className="w-full text-left px-3 py-2 hover:bg-p-light border-b border-p-line last:border-0 text-sm">
                    <span className="font-semibold">OS #{o.numero}</span> — {o.cliente}
                    {o.stock_codigo && <span className="ml-2 text-xs font-mono text-p-green font-bold">{o.stock_codigo}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Cliente */}
          <div>
            <p className="text-xs font-bold text-p-ink uppercase tracking-wider mb-2">👤 Datos del cliente</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Nombre y apellido"><Input value={form.cliente} onChange={e => setForm(p => ({ ...p, cliente: e.target.value }))} placeholder="Juan García" /></Field>
              <Field label="Razón social (si factura a empresa)"><Input value={form.razon_social} onChange={e => setForm(p => ({ ...p, razon_social: e.target.value }))} placeholder="Empresa S.A." /></Field>
            </div>
          </div>
          
          {/* Código de pieza */}
          <Field label="Código de pieza (se imprime en el certificado)">
            <Input value={form.codigo_pieza} onChange={e=>setForm(p=>({...p,codigo_pieza:e.target.value.toUpperCase()}))} placeholder="Ej: 420934VSLI"/>
          </Field>

          {/* Vehículo */}
          <div>
            <p className="text-xs font-bold text-p-ink uppercase tracking-wider mb-2">🚗 Datos del vehículo</p>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Marca"><Input value={form.marca} onChange={e => setForm(p => ({ ...p, marca: e.target.value }))} placeholder="Toyota" /></Field>
              <Field label="Modelo"><Input value={form.modelo} onChange={e => setForm(p => ({ ...p, modelo: e.target.value }))} placeholder="Hilux" /></Field>
              <Field label="Año"><Input value={form.anio} onChange={e => setForm(p => ({ ...p, anio: e.target.value }))} placeholder="2023" /></Field>
            </div>
            <div className="grid grid-cols-3 gap-3 mt-2">
              <Field label="Dominio (patente)"><Input value={form.dominio} onChange={e => setForm(p => ({ ...p, dominio: e.target.value.toUpperCase() }))} placeholder="AB123CD" /></Field>
              <Field label="VIN / N° de chasis"><Input value={form.vin} onChange={e => setForm(p => ({ ...p, vin: e.target.value }))} /></Field>
              <Field label="Kilometraje"><Input value={form.kilometraje} onChange={e => setForm(p => ({ ...p, kilometraje: e.target.value }))} placeholder="45.000 km" /></Field>
            </div>
          </div>

          {/* Sistemas y procedimientos — solo aplican si el certificado incluye calibración ADAS */}
          {incluyeAdas && (
            <>
              <div>
                <p className="text-xs font-bold text-p-ink uppercase tracking-wider mb-2">🎯 Sistemas calibrados</p>
                <div className="grid grid-cols-1 gap-1.5">
                  {SISTEMAS_DEFAULT.map(s => (
                    <label key={s} className="flex items-center gap-2.5 cursor-pointer text-sm py-1">
                      <input type="checkbox" checked={sistemas.includes(s)} onChange={() => toggleSistema(s)}
                        className="w-4 h-4 accent-p-green rounded" />
                      {s}
                    </label>
                  ))}
                  <div className="mt-1">
                    <Field label="Otro (especificar)">
                      <Input value={form.otros_sistemas} onChange={e => setForm(p => ({ ...p, otros_sistemas: e.target.value }))} placeholder="Sistema adicional" />
                    </Field>
                  </div>
                </div>
              </div>

              <div>
                <p className="text-xs font-bold text-p-ink uppercase tracking-wider mb-2">🔧 Procedimiento realizado</p>
                <div className="grid grid-cols-1 gap-1.5">
                  {PROCEDIMIENTOS_DEFAULT.map(p => (
                    <label key={p} className="flex items-center gap-2.5 cursor-pointer text-sm py-1">
                      <input type="checkbox" checked={procs.includes(p)} onChange={() => toggleProc(p)}
                        className="w-4 h-4 accent-p-green rounded" />
                      {p}
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-bold text-p-ink uppercase tracking-wider mb-2">⚙ Equipo utilizado</p>
                <div className="bg-p-light rounded-xl p-3 mb-3">
                  <p className="text-[10px] text-p-ink2 uppercase tracking-wider">Equipo de calibración (fijo)</p>
                  <p className="text-sm font-bold text-p-ink mt-0.5">{EQUIPO_MODELO}</p>
                  <p className="text-[11px] text-p-ink2 mt-1">N° de serie: <span className="font-mono font-semibold">{EQUIPO_SERIE}</span></p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Software"><Input value={form.software} onChange={e => setForm(p => ({ ...p, software: e.target.value }))} /></Field>
                  <Field label="Protocolos"><Input value={form.protocolos} onChange={e => setForm(p => ({ ...p, protocolos: e.target.value }))} /></Field>
                </div>
              </div>
            </>
          )}

          {/* Vidrio a certificar — se muestra siempre que venga de factura, sea o no ADAS;
              si no hay ninguna pieza física en la factura, simplemente no aparece nada acá. */}
          {origen === 'comprobante' && compSel && piezasFisicasDe(compSel.items).length > 0 && (
            <div>
              <p className="text-xs font-bold text-p-ink uppercase tracking-wider mb-2">🪟 Vidrio a certificar (de la factura)</p>
              <div className="bg-p-light rounded-xl p-3">
                {piezasFisicasDe(compSel.items).map((it, i) => (
                  <div key={i} className="flex justify-between text-sm py-1">
                    <span>{it.d}</span><span className="font-mono font-bold">×{it.c}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Field label="Observaciones"><Input value={form.observaciones} onChange={e => setForm(p => ({ ...p, observaciones: e.target.value }))} placeholder="Observaciones opcionales" /></Field>

          <div className="flex justify-end gap-2 pt-2 border-t border-p-line">
            <button onClick={() => setOpen(false)} style={{background:'#6b7280',color:'#fff',border:'none',borderRadius:8,padding:'9px 20px',fontWeight:700,fontSize:14,cursor:'pointer'}}>Cancelar</button>
            <button onClick={save} style={{background:'#00A550',color:'#fff',border:'none',borderRadius:8,padding:'9px 20px',fontWeight:700,fontSize:14,cursor:'pointer'}}>
              Guardar e imprimir
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}