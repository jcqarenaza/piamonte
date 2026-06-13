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

interface Cert {
  id:string;numero:string;fecha:string;cliente:string|null;razon_social:string|null
  marca:string|null;modelo:string|null;anio:string|null;dominio:string|null
  vin:string|null;kilometraje:string|null;sistemas:string[];otros_sistemas:string|null
  procedimientos:string[];equipo:string;software:string;protocolos:string
  observaciones:string|null;created_at:string
}

export default function AdasClient({ userId }: { userId: string }) {
  const [certs, setCerts] = useState<Cert[]>([])
  const [open, setOpen] = useState(false)
  const supabase = createClient()

  const [form, setForm] = useState({
    fecha: todayStr(), cliente: '', razon_social: '', marca: '', modelo: '',
    anio: '', dominio: '', vin: '', kilometraje: '', otros_sistemas: '',
    equipo: 'MAHLE ADAS', software: 'Actualizado', protocolos: 'Según fabricante',
    observaciones: '',
  })
  const [sistemas, setSistemas] = useState<string[]>([...SISTEMAS_DEFAULT])
  const [procs, setProcs] = useState<string[]>([...PROCEDIMIENTOS_DEFAULT])

  useEffect(() => {
    supabase.from('certificados_adas').select('*').order('created_at', { ascending: false })
      .then(({ data }) => setCerts((data ?? []) as Cert[]))
  }, [supabase])

  function toggleSistema(s: string) {
    setSistemas(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])
  }
  function toggleProc(p: string) {
    setProcs(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p])
  }

  async function save() {
    if (!form.cliente && !form.razon_social) { alert('Ingresá el nombre del cliente.'); return }
    const { data: num } = await supabase.rpc('next_adas_numero')
    const payload = {
      numero: num, fecha: form.fecha, cliente: form.cliente || null,
      razon_social: form.razon_social || null, marca: form.marca || null,
      modelo: form.modelo || null, anio: form.anio || null,
      dominio: form.dominio?.toUpperCase() || null, vin: form.vin || null,
      kilometraje: form.kilometraje || null, sistemas,
      otros_sistemas: form.otros_sistemas || null, procedimientos: procs,
      equipo: form.equipo, software: form.software, protocolos: form.protocolos,
      observaciones: form.observaciones || null, user_id: userId
    }
    await supabase.from('certificados_adas').insert(payload)
    setOpen(false)
    setForm({ fecha: todayStr(), cliente: '', razon_social: '', marca: '', modelo: '',
      anio: '', dominio: '', vin: '', kilometraje: '', otros_sistemas: '',
      equipo: 'MAHLE ADAS', software: 'Actualizado', protocolos: 'Según fabricante', observaciones: '' })
    setSistemas([...SISTEMAS_DEFAULT]); setProcs([...PROCEDIMIENTOS_DEFAULT])
    const { data } = await supabase.from('certificados_adas').select('*').order('created_at', { ascending: false })
    setCerts((data ?? []) as Cert[])
    // Imprimir automáticamente el recién creado
    if (payload.numero) printCert({ ...payload, id: '', created_at: new Date().toISOString() } as Cert)
  }

  function printCert(c: Cert) {
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

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Certificado ADAS N° ${c.numero}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,Helvetica,sans-serif;background:#fff;color:#1a1a1a;width:210mm;margin:0 auto;font-size:12px}
  .header{background:#1a1a1a;color:#fff;padding:14px 20px;display:flex;justify-content:space-between;align-items:center}
  .logo-area{display:flex;flex-direction:column}
  .logo-name{font-size:28px;font-weight:900;letter-spacing:-1px;color:#fff}
  .logo-name span{color:#00A550}
  .logo-sub{font-size:10px;letter-spacing:3px;color:#aaa;margin-top:2px}
  .shield{background:#00A550;color:#fff;border-radius:12px;padding:10px 14px;text-align:center;border:2px solid #fff}
  .shield .sv{font-size:10px;font-weight:bold;letter-spacing:1px}
  .shield .sa{font-size:20px;font-weight:900;line-height:1}
  .shield .sb{font-size:10px;letter-spacing:2px}
  .title-bar{background:#fff;padding:16px 20px 8px;border-bottom:4px solid #00A550}
  .cert-title{font-size:32px;font-weight:900;text-transform:uppercase;line-height:1.1;color:#1a1a1a}
  .cert-title .accent{color:#00A550}
  .cert-num{font-size:13px;font-weight:bold;color:#00A550;margin-top:6px}
  .cert-fecha{font-size:12px;color:#555;margin-top:2px}
  .body{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;padding:12px 20px}
  .section{border:1.5px solid #1a1a1a;border-radius:8px;padding:10px 12px}
  .sec-title{font-size:10.5px;font-weight:900;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;display:flex;align-items:center;gap:6px;color:#1a1a1a}
  .sec-title span{color:#00A550}
  .field-line{border:none;border-bottom:1px solid #888;width:100%;margin:4px 0 8px;display:block;font-size:11.5px;color:#1a1a1a}
  .field-label{font-size:10px;color:#555;margin-top:4px}
  .equip-row{display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:8px 20px}
  .equip-box{border:1.5px solid #1a1a1a;border-radius:8px;padding:10px 12px}
  .result-box{background:#00A550;color:#fff;border-radius:8px;padding:12px 14px;margin-top:8px;text-align:center}
  .result-check{font-size:28px;font-weight:900}
  .result-label{font-size:14px;font-weight:900;text-transform:uppercase;letter-spacing:1px;margin-top:2px}
  .footer-sig{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;padding:8px 20px}
  .sig-box{border:1.5px solid #1a1a1a;border-radius:8px;padding:10px 12px}
  .sig-line{border-bottom:1px solid #888;height:40px;margin:8px 0 4px}
  .footer-bar{background:#1a1a1a;color:#fff;padding:10px 20px;display:flex;justify-content:space-between;align-items:center;margin-top:8px}
  .footer-logo-name{font-size:16px;font-weight:900;color:#fff}
  .footer-logo-name span{color:#00A550}
  .footer-contact{display:flex;gap:20px;font-size:11px}
  .footer-slogan{font-size:9px;color:#aaa;text-align:center;padding:4px 20px;background:#111}
  @media print{body{width:auto;margin:0}@page{margin:6mm;size:A4}*{page-break-inside:avoid!important}.header,.footer{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style></head><body>

<!-- HEADER -->
<div class="header">
  <div class="logo-area">
    <div style="font-size:11px;color:#aaa;letter-spacing:2px;text-transform:uppercase;margin-bottom:4px">★ PARABRISAS ★</div>
    <img src={LOGO_BASE64} alt="El Piamonte" style={{height:40,objectFit:'contain',filter:'brightness(0) invert(1)'}}/>
    <div class="logo-sub">SEGURIDAD • TECNOLOGÍA • CONFIANZA</div>
  </div>
  <div class="shield">
    <div class="sv">VEHÍCULO</div>
    <div class="sv">CALIBRADO</div>
    <div class="sa">ADAS</div>
    <div style="font-size:18px;margin-top:2px">🛡</div>
  </div>
</div>

<!-- TÍTULO -->
<div class="title-bar">
  <div class="cert-title">CERTIFICADO DE<br><span class="accent">CALIBRACIÓN ADAS</span></div>
  <div class="cert-num">N° ${c.numero}</div>
  <div class="cert-fecha">Fecha: ${fechaFmt}</div>
</div>

<!-- CUERPO 3 COLUMNAS -->
<div class="body">
  <!-- Col 1: Cliente + Vehículo -->
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

  <!-- Col 2: Sistemas calibrados -->
  <div class="section">
    <div class="sec-title"><span>🎯</span> SISTEMAS CALIBRADOS</div>
    ${allSist}
    ${otroSist}
    <div style="display:flex;align-items:center;gap:8px;padding:5px 0;font-size:12px">
      <span style="color:#ccc;font-size:16px">☐</span>
      <span>Otro: ${c.otros_sistemas || '_________________'}</span>
    </div>
  </div>

  <!-- Col 3: Procedimiento + Resultado -->
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

<!-- EQUIPO UTILIZADO -->
<div class="equip-row">
  <div class="equip-box">
    <div class="sec-title"><span>⚙</span> EQUIPO UTILIZADO</div>
    <div style="font-size:11px;color:#555">Equipo de calibración:</div>
    <div style="font-size:15px;font-weight:900;color:#1a1a1a;margin:4px 0">${c.equipo}</div>
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

<!-- FIRMA + SELLO + QR -->
<div class="footer-sig">
  <div class="sig-box">
    <div class="sec-title">✍ RESPONSABLE TÉCNICO</div>
    <div class="sig-line"></div>
    <div style="font-size:10px;color:#555">Firma</div>
    <div style="font-size:12px;font-weight:bold;margin-top:4px">Mario Sappa</div>
    <div style="font-size:10px;color:#555">Técnico Especialista en ADAS</div>
  </div>
  <div class="sig-box" style="display:flex;flex-direction:column;align-items:center;justify-content:center">
    <div style="border:3px solid #00A550;border-radius:50%;width:80px;height:80px;display:flex;align-items:center;justify-content:center;text-align:center;font-size:8px;font-weight:900;color:#00A550;line-height:1.3;letter-spacing:.5px">
      PARABRISAS<br>PIAMONTE<br>⚙<br>SERVICIO<br>PROFESIONAL<br>GARANTÍA Y CALIDAD
    </div>
  </div>
  <div class="sig-box" style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px">
    <div style="font-size:10px;font-weight:bold;text-align:center">VERIFICÁ ESTE CERTIFICADO</div>
    <div style="font-size:9px;color:#555;text-align:center">Escaneá el QR o comunicate con nosotros</div>
    <div style="background:#1a1a1a;color:#fff;border-radius:6px;padding:8px 14px;font-size:10px;text-align:center">
      📱 2302 595969
    </div>
    <div style="font-size:9px;color:#00A550;font-weight:bold">N° ${c.numero}</div>
  </div>
</div>

<!-- FOOTER -->
<div class="footer-bar">
  <div>
    <img src={LOGO_BASE64} alt="El Piamonte" style={{height:30,objectFit:'contain',filter:'brightness(0) invert(1)'}}/>
    <div style="font-size:9px;color:#aaa">Especialistas en cristales automotrices.</div>
    <div style="font-size:8px;color:#aaa">INSTALACIÓN PROFESIONAL • DIAGNÓSTICO ELECTRÓNICO • CALIBRACIÓN DE SISTEMAS ADAS</div>
  </div>
  <div class="footer-contact">
    <div><div style="color:#00A550;font-weight:bold;font-size:13px">📞 2302 595969</div><div style="color:#aaa;font-size:9px">WhatsApp</div></div>
    <div><div style="color:#00A550;font-weight:bold;font-size:13px">📍 General Pico, La Pampa</div><div style="color:#aaa;font-size:9px">Calle 17 N° 1224</div></div>
  </div>
</div>
<div class="footer-slogan">NO VENDEMOS UN VIDRIO. DEVOLVEMOS LA SEGURIDAD ORIGINAL DE SU VEHÍCULO.</div>

<script>window.print()<\/script>
</body></html>`
    const w = window.open('', '_blank')!
    w.document.write(html)
    w.document.close()
  }

  return (
    <div>
      <div className="flex justify-end mb-5">
        <button onClick={() => setOpen(true)} style={{background:"#00A550",color:"#fff",border:"none",borderRadius:10,padding:"10px 20px",fontWeight:700,fontSize:14,cursor:"pointer"}}>+ Nuevo certificado ADAS</button>
      </div>

      {certs.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-4xl mb-3">🛡</p>
          <p className="font-saira font-bold text-p-ink text-lg">Sin certificados todavía</p>
          <p className="text-p-ink2 text-sm mt-1">Generá el primero con el botón de arriba.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {certs.map(c => (
            <div key={c.id} className="bg-white border border-p-line rounded-xl p-4 shadow-sm flex items-center gap-4 flex-wrap">
              <div className="bg-p-green text-white font-mono font-bold text-sm px-3 py-1.5 rounded-lg shrink-0">
                N° {c.numero}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-saira font-bold text-p-ink">{c.cliente || c.razon_social || '—'}</p>
                <p className="text-xs text-p-ink2 mt-0.5">
                  {[c.marca, c.modelo, c.anio, c.dominio].filter(Boolean).join(' · ')}
                  {' · '}{c.fecha.split('-').reverse().join('/')}
                </p>
                <p className="text-xs text-p-green mt-0.5 font-semibold">
                  {c.sistemas.length} sistema(s) calibrado(s)
                </p>
              </div>
              <button onClick={() => printCert(c)} style={{background:"#00A550",color:"#fff",border:"none",borderRadius:8,padding:"6px 14px",fontWeight:700,fontSize:13,cursor:"pointer"}}>🖨 Imprimir</button>
            </div>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Nuevo certificado de calibración ADAS">
        <div className="flex flex-col gap-4">

          {/* Fecha */}
          <Field label="Fecha del certificado">
            <Input type="date" value={form.fecha} onChange={e => setForm(p => ({ ...p, fecha: e.target.value }))} />
          </Field>

          {/* Cliente */}
          <div>
            <p className="text-xs font-bold text-p-ink uppercase tracking-wider mb-2">👤 Datos del cliente</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Nombre y apellido"><Input value={form.cliente} onChange={e => setForm(p => ({ ...p, cliente: e.target.value }))} placeholder="Juan García" /></Field>
              <Field label="Razón social (si factura a empresa)"><Input value={form.razon_social} onChange={e => setForm(p => ({ ...p, razon_social: e.target.value }))} placeholder="Empresa S.A." /></Field>
            </div>
          </div>

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

          {/* Sistemas */}
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

          {/* Procedimientos */}
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

          {/* Equipo */}
          <div>
            <p className="text-xs font-bold text-p-ink uppercase tracking-wider mb-2">⚙ Equipo utilizado</p>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Equipo"><Input value={form.equipo} onChange={e => setForm(p => ({ ...p, equipo: e.target.value }))} /></Field>
              <Field label="Software"><Input value={form.software} onChange={e => setForm(p => ({ ...p, software: e.target.value }))} /></Field>
              <Field label="Protocolos"><Input value={form.protocolos} onChange={e => setForm(p => ({ ...p, protocolos: e.target.value }))} /></Field>
            </div>
          </div>

          {/* Observaciones */}
          <Field label="Observaciones"><Input value={form.observaciones} onChange={e => setForm(p => ({ ...p, observaciones: e.target.value }))} placeholder="Observaciones opcionales" /></Field>

          <div className="flex justify-end gap-2 pt-2 border-t border-p-line">
            <button onClick={() => setOpen(false)} style={{background:'#6b7280',color:'#fff',border:'none',borderRadius:8,padding:'9px 20px',fontWeight:700,fontSize:14,cursor:'pointer'}}>Cancelar</button>
            <button onClick={save} style={{background:'#00A550',color:'#fff',border:'none',borderRadius:8,padding:'9px 20px',fontWeight:700,fontSize:14,cursor:'pointer'}}>Guardar e imprimir</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
