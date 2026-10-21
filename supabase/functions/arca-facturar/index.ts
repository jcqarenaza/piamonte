import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ARCA_CERT_P12_BASE64 = Deno.env.get('ARCA_CERT_P12_BASE64') ?? '';
const ARCA_CERT_PASSWORD = Deno.env.get('ARCA_CERT_PASSWORD') ?? '';
const ARCA_CUIT = Deno.env.get('ARCA_CUIT') ?? '27242657174';
const ARCA_PUNTO_VENTA = parseInt(Deno.env.get('ARCA_PUNTO_VENTA') ?? '6');
const ARCA_ENV = Deno.env.get('ARCA_ENV') ?? 'homologacion';

const WSAA_URL = ARCA_ENV === 'produccion'
  ? 'https://wsaa.afip.gov.ar/ws/services/LoginCms'
  : 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms';
const WSFE_URL = ARCA_ENV === 'produccion'
  ? 'https://servicios1.afip.gov.ar/wsfev1/service.asmx'
  : 'https://wswhomo.afip.gob.ar/wsfev1/service.asmx';
const WSFE_NS = 'http://ar.gov.afip.dif.FEV1/';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info',
  'Content-Type': 'application/json',
};
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), { status, headers: CORS });
}

function decodeHtmlEntities(str: string): string {
  return str.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&apos;/g,"'");
}

function extractXmlTag(xml: string, tag: string): string | null {
  const decoded = decodeHtmlEntities(xml);
  const match = decoded.match(new RegExp(`<(?:[^:>]*:)?${tag}[^>]*>([\\s\\S]*?)<\/(?:[^:>]*:)?${tag}>`, 's'));
  return match ? match[1].trim() : null;
}

async function signTRA(tra: string): Promise<string> {
  if (!ARCA_CERT_P12_BASE64 || !ARCA_CERT_PASSWORD) throw new Error('Secrets no configurados');
  const forgeModule = await import('npm:node-forge@1.3.1');
  const forge = forgeModule.default ?? forgeModule;
  const p12Der = forge.util.decode64(ARCA_CERT_P12_BASE64);
  const p12Asn1 = forge.asn1.fromDer(p12Der);
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, ARCA_CERT_PASSWORD);
  const keyBags  = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
  const keyBag   = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0];
  const certBag  = certBags[forge.pki.oids.certBag]?.[0];
  if (!keyBag?.key || !certBag?.cert) throw new Error('No se pudo extraer clave/cert del .p12');
  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(tra, 'utf8');
  p7.addCertificate(certBag.cert);
  p7.addSigner({
    key: keyBag.key, certificate: certBag.cert,
    digestAlgorithm: forge.pki.oids.sha1,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: new Date() },
    ],
  });
  p7.sign();
  return forge.util.encode64(forge.asn1.toDer(p7.toAsn1()).getBytes());
}

function formatARCADate(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}+00:00`;
}

function buildTRA(): string {
  const now = new Date();
  return `<?xml version="1.0" encoding="UTF-8"?>
<loginTicketRequest version="1.0">
  <header>
    <uniqueId>${Math.floor(now.getTime()/1000)}</uniqueId>
    <generationTime>${formatARCADate(new Date(now.getTime()-10*60*1000))}</generationTime>
    <expirationTime>${formatARCADate(new Date(now.getTime()+10*60*1000))}</expirationTime>
  </header>
  <service>wsfe</service>
</loginTicketRequest>`;
}

async function getARCAToken(): Promise<{ token: string; sign: string }> {
  const { data: cached } = await supabase.from('arca_tokens').select('token,sign,expira_at').eq('id',1).maybeSingle();
  if (cached && new Date(cached.expira_at) > new Date(Date.now()+5*60*1000)) {
    console.log('Token desde cache'); return { token: cached.token, sign: cached.sign };
  }
  const cms = await signTRA(buildTRA());
  const soap = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov.ar">
  <soapenv:Header/><soapenv:Body><wsaa:loginCms><wsaa:in0>${cms}</wsaa:in0></wsaa:loginCms></soapenv:Body>
</soapenv:Envelope>`;
  const resp = await fetch(WSAA_URL, { method:'POST', headers:{'Content-Type':'text/xml; charset=utf-8','SOAPAction':'""'}, body:soap });
  const rawXml = await resp.text();
  console.log('WSAA status:', resp.status, rawXml.slice(0,600));
  if (!resp.ok) throw new Error(`WSAA HTTP ${resp.status}: ${rawXml.slice(0,400)}`);
  const returnMatch = rawXml.match(/<loginCmsReturn[^>]*>([\s\S]*?)<\/loginCmsReturn>/);
  if (!returnMatch) throw new Error(`Sin loginCmsReturn. XML: ${rawXml.slice(0,400)}`);
  const innerXml = decodeHtmlEntities(returnMatch[1]);
  const token = extractXmlTag(innerXml, 'token');
  const sign  = extractXmlTag(innerXml, 'sign');
  const expTime = extractXmlTag(innerXml, 'expirationTime');
  if (!token || !sign) throw new Error(`Sin token/sign: ${innerXml.slice(0,300)}`);
  const expiraAt = expTime ? new Date(expTime).toISOString() : new Date(Date.now()+11*3600*1000).toISOString();
  await supabase.from('arca_tokens').upsert({ id:1, token, sign, expira_at:expiraAt, updated_at:new Date().toISOString() });
  console.log('Token OK, expira:', expiraAt);
  return { token, sign };
}

async function wsfeCall(action: string, body: string): Promise<string> {
  const resp = await fetch(WSFE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      'SOAPAction': `"${WSFE_NS}${action}"`,
    },
    body: `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="${WSFE_NS}">
  <soapenv:Header/><soapenv:Body>${body}</soapenv:Body>
</soapenv:Envelope>`,
  });
  const xml = await resp.text();
  console.log(`${action} response:`, xml.slice(0,500));
  return xml;
}

async function ultimoNroCbte(token: string, sign: string, tipoCbte: number, ptoVta: number): Promise<number> {
  const xml = await wsfeCall('FECompUltimoAutorizado',
    `<ar:FECompUltimoAutorizado>
      <ar:Auth><ar:Token>${token}</ar:Token><ar:Sign>${sign}</ar:Sign><ar:Cuit>${ARCA_CUIT}</ar:Cuit></ar:Auth>
      <ar:PtoVta>${ptoVta}</ar:PtoVta><ar:CbteTipo>${tipoCbte}</ar:CbteTipo>
    </ar:FECompUltimoAutorizado>`);
  return parseInt(extractXmlTag(xml, 'CbteNro') ?? '0');
}

// Consultar un comprobante YA AUTORIZADO en ARCA — para recuperar facturas
// cuya respuesta se perdió (p.ej. timeout de ARCA después de autorizar)
function extractExactTag(xml: string, tag: string): string | null {
  const decoded = decodeHtmlEntities(xml);
  const match = decoded.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
  return match ? match[1].trim() : null;
}

async function consultarComprobante(token: string, sign: string, tipoCbte: number, nro: number) {
  const xml = await wsfeCall('FECompConsultar',
    `<ar:FECompConsultar>
      <ar:Auth><ar:Token>${token}</ar:Token><ar:Sign>${sign}</ar:Sign><ar:Cuit>${ARCA_CUIT}</ar:Cuit></ar:Auth>
      <ar:FeCompConsReq>
        <ar:CbteTipo>${tipoCbte}</ar:CbteTipo>
        <ar:CbteNro>${nro}</ar:CbteNro>
        <ar:PtoVta>${ARCA_PUNTO_VENTA}</ar:PtoVta>
      </ar:FeCompConsReq>
    </ar:FECompConsultar>`);
  const err = extractExactTag(xml, 'Msg');
  const fch = extractExactTag(xml, 'CbteFch');
  if (!fch) return { existe: false, error: err ?? 'Sin datos', raw: decodeHtmlEntities(xml).slice(0, 800) };
  const fmt = (d: string|null) => d && d.length===8 ? `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}` : d;
  return {
    existe: true,
    tipo_cbte: tipoCbte, punto_venta: ARCA_PUNTO_VENTA, nro,
    fecha: fmt(fch),
    doc_tipo: extractExactTag(xml, 'DocTipo'),
    doc_nro: extractExactTag(xml, 'DocNro'),
    imp_total: extractExactTag(xml, 'ImpTotal'),
    imp_neto: extractExactTag(xml, 'ImpNeto'),
    imp_iva: extractExactTag(xml, 'ImpIVA'),
    cae: extractExactTag(xml, 'CodAutorizacion'),
    cae_vto: fmt(extractExactTag(xml, 'FchVto')),
    resultado: extractExactTag(xml, 'Resultado'),
    emision: extractExactTag(xml, 'EmisionTipo'),
  };
}

// FCE MiPyME: tipos 201 (FCE A), 202 (NDE A), 203 (NCE A), 206 (FCE B), 211 (FCE C)
const TIPOS_FCE = new Set([201, 202, 203, 206, 207, 208, 211, 212, 213]);

interface FacturaParams {
  comprobante_id: string; tipoCbte: number; impTotal: number;
  impNeto: number; impIva: number; concepto?: number;
  docTipo?: number; docNro?: string; ivaAlicuota?: number;
  cbteAsoc?: { tipo: number; ptoVta?: number; nro: number };
  // Condición IVA del receptor (RG 5616 — obligatorio desde 01/09/2026):
  // 1=Resp. Inscripto, 4=Exento, 5=Consumidor Final, 6=Monotributo, 13=Monotributista Social
  condIvaReceptor?: number;
  // --- FCE MiPyME ---
  fceVtoPago?: string;   // 'YYYY-MM-DD' — fecha de vencimiento de pago (obligatoria en FCE)
  fceCbu?: string;       // CBU emisor a informar (opcional 2101, obligatorio en FCE)
  fceTransmision?: 'SCA' | 'ADC'; // opcional 27 — Sistema de Circulación Abierta / Agente de Depósito Colectivo
  // --- Acción consultar ---
  accion?: 'facturar' | 'consultar';
  nro?: number;          // número de comprobante a consultar
}

async function solicitarCAE(token: string, sign: string, p: FacturaParams, nro: number) {
  const fecha = new Date().toISOString().slice(0,10).replace(/-/g,'');
  const esFCE = TIPOS_FCE.has(p.tipoCbte);
  if (esFCE) {
    if (!p.fceVtoPago) throw new Error('FCE requiere fceVtoPago (fecha de vencimiento de pago)');
    if (!p.fceCbu) throw new Error('FCE requiere fceCbu (CBU emisor)');
    if (!p.docNro || p.docTipo !== 80) throw new Error('FCE requiere docTipo 80 (CUIT) y docNro del receptor');
  }
  const iva = p.ivaAlicuota
    ? `<ar:Iva><ar:AlicIva><ar:Id>${p.ivaAlicuota}</ar:Id><ar:BaseImp>${p.impNeto.toFixed(2)}</ar:BaseImp><ar:Importe>${p.impIva.toFixed(2)}</ar:Importe></ar:AlicIva></ar:Iva>` : '';
  const cbteAsoc = p.cbteAsoc
    ? `<ar:CbtesAsoc><ar:CbteAsoc><ar:Tipo>${p.cbteAsoc.tipo}</ar:Tipo><ar:PtoVta>${p.cbteAsoc.ptoVta ?? ARCA_PUNTO_VENTA}</ar:PtoVta><ar:Nro>${p.cbteAsoc.nro}</ar:Nro></ar:CbteAsoc></ar:CbtesAsoc>`
    : '';
  // FchVtoPago: obligatoria en FCE (formato YYYYMMDD)
  const fchVtoPago = esFCE
    ? `<ar:FchVtoPago>${p.fceVtoPago!.replace(/-/g,'')}</ar:FchVtoPago>` : '';
  // Opcionales FCE: 2101 = CBU emisor, 27 = SCA/ADC (Sistema de Circulación Abierta por defecto)
  const opcionales = esFCE
    ? `<ar:Opcionales>
        <ar:Opcional><ar:Id>2101</ar:Id><ar:Valor>${p.fceCbu}</ar:Valor></ar:Opcional>
        <ar:Opcional><ar:Id>27</ar:Id><ar:Valor>${p.fceTransmision ?? 'SCA'}</ar:Valor></ar:Opcional>
      </ar:Opcionales>` : '';
  // Condición IVA receptor (RG 5616): si no viene, default por tipo de doc —
  // con CUIT (80) asumimos Responsable Inscripto (1); sin CUIT, Consumidor Final (5)
  const condIva = p.condIvaReceptor ?? ((p.docTipo === 80) ? 1 : 5);
  const xml = await wsfeCall('FECAESolicitar',
    `<ar:FECAESolicitar>
      <ar:Auth><ar:Token>${token}</ar:Token><ar:Sign>${sign}</ar:Sign><ar:Cuit>${ARCA_CUIT}</ar:Cuit></ar:Auth>
      <ar:FeCAEReq>
        <ar:FeCabReq><ar:CantReg>1</ar:CantReg><ar:PtoVta>${ARCA_PUNTO_VENTA}</ar:PtoVta><ar:CbteTipo>${p.tipoCbte}</ar:CbteTipo></ar:FeCabReq>
        <ar:FeDetReq><ar:FECAEDetRequest>
          <ar:Concepto>${p.concepto??1}</ar:Concepto>
          <ar:DocTipo>${p.docTipo??99}</ar:DocTipo><ar:DocNro>${p.docNro??0}</ar:DocNro>
          <ar:CbteDesde>${nro}</ar:CbteDesde><ar:CbteHasta>${nro}</ar:CbteHasta>
          <ar:CbteFch>${fecha}</ar:CbteFch>
          <ar:ImpTotal>${p.impTotal.toFixed(2)}</ar:ImpTotal>
          <ar:ImpTotConc>0.00</ar:ImpTotConc><ar:ImpNeto>${p.ivaAlicuota ? p.impNeto.toFixed(2) : '0.00'}</ar:ImpNeto>
          <ar:ImpOpEx>${p.ivaAlicuota ? '0.00' : p.impNeto.toFixed(2)}</ar:ImpOpEx><ar:ImpIVA>${p.impIva.toFixed(2)}</ar:ImpIVA><ar:ImpTrib>0.00</ar:ImpTrib>
          ${fchVtoPago}
          <ar:MonId>PES</ar:MonId><ar:MonCotiz>1</ar:MonCotiz>
          <ar:CondicionIVAReceptorId>${condIva}</ar:CondicionIVAReceptorId>
          ${iva}
          ${cbteAsoc}
          ${opcionales}
        </ar:FECAEDetRequest></ar:FeDetReq>
      </ar:FeCAEReq>
    </ar:FECAESolicitar>`);
  if (extractXmlTag(xml,'Resultado')==='R') {
    // Juntar todos los mensajes de error/observación para diagnóstico
    const errs = decodeHtmlEntities(xml).match(/<Msg>([\s\S]*?)<\/Msg>/g)?.map(m=>m.replace(/<\/?Msg>/g,'')).join(' | ');
    throw new Error(`WSFE rechazó: ${errs ?? xml.slice(0,300)}`);
  }
  const cae = extractXmlTag(xml,'CAE');
  if (!cae) throw new Error(`Sin CAE. XML: ${xml.slice(0,400)}`);
  const vto = extractXmlTag(xml,'CAEFchVto')??'';
  return { cae, caeVencimiento: vto?`${vto.slice(0,4)}-${vto.slice(4,6)}-${vto.slice(6,8)}`:'', nroCbte:nro };
}

Deno.serve(async (req: Request) => {
  if (req.method==='OPTIONS') return new Response(null,{headers:CORS});

  // Solo usuarios logueados (la clave publica anon NO alcanza)
  const _tok = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: _au, error: _auErr } = _tok
    ? await supabase.auth.getUser(_tok)
    : { data: null, error: new Error('sin token') };
  if (_auErr || !_au?.user) return json({ error: 'No autorizado' }, 401);

  if (req.method==='GET') return json({ok:true,env:ARCA_ENV,cuit:ARCA_CUIT,punto_venta:ARCA_PUNTO_VENTA,secrets:!!ARCA_CERT_P12_BASE64});
  if (req.method!=='POST') return json({error:'Metodo no permitido'},405);
  let params: FacturaParams;
  try { params = await req.json(); } catch { return json({error:'JSON invalido'},400); }

  // ── Acción CONSULTAR: recuperar un comprobante ya autorizado en ARCA ──
  if (params.accion === 'consultar') {
    if (!params.tipoCbte || !params.nro) return json({error:'consultar requiere tipoCbte y nro'},400);
    try {
      const {token,sign} = await getARCAToken();
      const info = await consultarComprobante(token, sign, params.tipoCbte, params.nro);
      return json({ok:true, ...info});
    } catch(err) {
      const msg = err instanceof Error ? err.message : String(err);
      return json({ok:false,error:msg},500);
    }
  }

  if (!params.comprobante_id||!params.tipoCbte||params.impTotal==null) return json({error:'Faltan campos'},400);
  const {data:feRow,error:insertErr} = await supabase.from('facturacion_electronica')
    .insert({comprobante_id:params.comprobante_id,tipo_cbte:params.tipoCbte,punto_venta:ARCA_PUNTO_VENTA,estado:'pendiente'})
    .select('id').single();
  if (insertErr||!feRow) return json({error:'Error DB',detail:insertErr?.message},500);
  try {
    const {token,sign} = await getARCAToken();
    const ultimo = await ultimoNroCbte(token,sign,params.tipoCbte,ARCA_PUNTO_VENTA);
    let resultado;
    try {
      resultado = await solicitarCAE(token,sign,params,ultimo+1);
    } catch(errCAE) {
      const msgCAE = errCAE instanceof Error ? errCAE.message : String(errCAE);
      // Rechazo explícito de ARCA = error real, no hay nada que recuperar
      if (msgCAE.startsWith('WSFE rechazó')) throw errCAE;
      // BLINDAJE ANTI-TIMEOUT: si el error fue de red/caída, puede que ARCA
      // haya AUTORIZADO igual y la respuesta se perdió (caso FA-73).
      // Consultamos: ¿el último autorizado avanzó al número que pedimos?
      console.log('Error de CAE, verificando si ARCA autorizó igual:', msgCAE);
      try {
        const nuevoUltimo = await ultimoNroCbte(token,sign,params.tipoCbte,ARCA_PUNTO_VENTA);
        if (nuevoUltimo === ultimo + 1) {
          const info = await consultarComprobante(token,sign,params.tipoCbte,nuevoUltimo);
          // Verificar que sea NUESTRA factura (mismo importe) antes de adoptarla
          if (info.existe && Math.abs(parseFloat(info.imp_total||'0') - params.impTotal) < 0.01) {
            console.log('RECUPERADA: ARCA la había autorizado. CAE:', info.cae);
            resultado = { cae: info.cae!, caeVencimiento: info.cae_vto||'', nroCbte: nuevoUltimo };
          }
        }
      } catch(errRec) { console.error('Recuperación falló:', errRec); }
      if (!resultado) throw errCAE;  // no se pudo recuperar: error original
    }
    const {cae,caeVencimiento,nroCbte} = resultado;
    await supabase.from('facturacion_electronica')
      .update({cae,cae_vencimiento:caeVencimiento||null,nro_cbte:nroCbte,estado:'emitida'}).eq('id',feRow.id);
    return json({ok:true,cae,cae_vencimiento:caeVencimiento,nro_cbte:nroCbte,punto_venta:ARCA_PUNTO_VENTA,tipo_cbte:params.tipoCbte});
  } catch(err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Error:',msg);
    await supabase.from('facturacion_electronica').update({estado:'error',error_msg:msg}).eq('id',feRow.id);
    return json({ok:false,error:msg},500);
  }
});
