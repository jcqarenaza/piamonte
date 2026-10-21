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
const WSREM_URL = ARCA_ENV === 'produccion'
  ? 'https://serviciosjava.afip.gob.ar/wsreman/services/RemElectManAREA'
  : 'https://wswhomo.afip.gob.ar/wsreman/services/RemElectManAREA';
const WSREM_NS = 'http://impl.service.wsrem.comercio.wsbizcomm.afip.gov.ar/';

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
  <service>wsreman</service>
</loginTicketRequest>`;
}

async function getARCAToken(): Promise<{ token: string; sign: string }> {
  const { data: cached } = await supabase.from('arca_tokens').select('token,sign,expira_at').eq('id',2).maybeSingle();
  if (cached && new Date(cached.expira_at) > new Date(Date.now()+5*60*1000)) {
    return { token: cached.token, sign: cached.sign };
  }
  const cms = await signTRA(buildTRA());
  const soap = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov.ar">
  <soapenv:Header/><soapenv:Body><wsaa:loginCms><wsaa:in0>${cms}</wsaa:in0></wsaa:loginCms></soapenv:Body>
</soapenv:Envelope>`;
  const resp = await fetch(WSAA_URL, { method:'POST', headers:{'Content-Type':'text/xml; charset=utf-8','SOAPAction':'""'}, body:soap });
  const rawXml = await resp.text();
  if (!resp.ok) throw new Error(`WSAA HTTP ${resp.status}: ${rawXml.slice(0,400)}`);
  const returnMatch = rawXml.match(/<loginCmsReturn[^>]*>([\s\S]*?)<\/loginCmsReturn>/);
  if (!returnMatch) throw new Error(`Sin loginCmsReturn. XML: ${rawXml.slice(0,400)}`);
  const innerXml = decodeHtmlEntities(returnMatch[1]);
  const token = extractXmlTag(innerXml, 'token');
  const sign  = extractXmlTag(innerXml, 'sign');
  const expTime = extractXmlTag(innerXml, 'expirationTime');
  if (!token || !sign) throw new Error(`Sin token/sign: ${innerXml.slice(0,300)}`);
  const expiraAt = expTime ? new Date(expTime).toISOString() : new Date(Date.now()+11*3600*1000).toISOString();
  await supabase.from('arca_tokens').upsert({ id:2, token, sign, expira_at:expiraAt, updated_at:new Date().toISOString() });
  return { token, sign };
}

async function wsremCall(action: string, body: string): Promise<string> {
  const resp = await fetch(WSREM_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      'SOAPAction': `"${WSREM_NS}${action}"`,
    },
    body: `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:rem="${WSREM_NS}">
  <soapenv:Header/><soapenv:Body>${body}</soapenv:Body>
</soapenv:Envelope>`,
  });
  const xml = await resp.text();
  console.log(`${action} response:`, xml.slice(0,800));
  return xml;
}

interface RemitoItem { descripcion: string; cantidad: number; unidad?: string; }
interface RemitoParams {
  remito_id: string;
  destinatario_cuit: string;
  destinatario_nombre: string;
  destinatario_direccion?: string;
  items: RemitoItem[];
  transportista_cuit?: string;
  transportista_nombre?: string;
}

async function solicitarCAERemito(token: string, sign: string, p: RemitoParams) {
  const fecha = new Date().toISOString().slice(0,10).replace(/-/g,'');
  const itemsXml = p.items.map((it, i) => `
    <rem:item>
      <rem:nroOrden>${i+1}</rem:nroOrden>
      <rem:descripcion>${it.descripcion.slice(0,30)}</rem:descripcion>
      <rem:cantidad>${it.cantidad}</rem:cantidad>
      <rem:unidadMedida>${it.unidad ?? 'UNI'}</rem:unidadMedida>
    </rem:item>`).join('');

  const transporte = p.transportista_cuit
    ? `<rem:transporte><rem:cuit>${p.transportista_cuit.replace(/-/g,'')}</rem:cuit><rem:nombreApellido>${p.transportista_nombre ?? ''}</rem:nombreApellido></rem:transporte>`
    : '';

  const xml = await wsremCall('generarRemito',
    `<rem:generarRemito>
      <rem:authRequest>
        <rem:token>${token}</rem:token>
        <rem:sign>${sign}</rem:sign>
        <rem:cuitRepresentada>${ARCA_CUIT}</rem:cuitRepresentada>
      </rem:authRequest>
      <rem:remito>
        <rem:fechaEmision>${fecha}</rem:fechaEmision>
        <rem:emisor>
          <rem:cuit>${ARCA_CUIT}</rem:cuit>
          <rem:puntoVenta>${ARCA_PUNTO_VENTA}</rem:puntoVenta>
        </rem:emisor>
        <rem:receptor>
          <rem:cuit>${p.destinatario_cuit.replace(/-/g,'')}</rem:cuit>
          <rem:nombreApellido>${p.destinatario_nombre}</rem:nombreApellido>
          ${p.destinatario_direccion ? `<rem:domicilio>${p.destinatario_direccion}</rem:domicilio>` : ''}
        </rem:receptor>
        ${transporte}
        <rem:items>${itemsXml}</rem:items>
      </rem:remito>
    </rem:generarRemito>`);

  const cae = extractXmlTag(xml, 'cae') ?? extractXmlTag(xml, 'CAE');
  if (!cae) throw new Error(`Sin CAE en respuesta WSREM. XML: ${xml.slice(0,600)}`);
  const vto = extractXmlTag(xml, 'fechaVencimientoCAE') ?? extractXmlTag(xml, 'CAEFchVto') ?? '';
  const nroRemito = parseInt(extractXmlTag(xml, 'nroRemito') ?? extractXmlTag(xml, 'nroComprobante') ?? '0');
  return { cae, caeVencimiento: vto ? `${vto.slice(0,4)}-${vto.slice(4,6)}-${vto.slice(6,8)}` : '', nroRemito };
}

Deno.serve(async (req: Request) => {
  if (req.method==='OPTIONS') return new Response(null,{headers:CORS});

  // Solo usuarios logueados (la clave publica anon NO alcanza)
  const _tok = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: _au, error: _auErr } = _tok
    ? await supabase.auth.getUser(_tok)
    : { data: null, error: new Error('sin token') };
  if (_auErr || !_au?.user) return json({ error: 'No autorizado' }, 401);

  if (req.method==='GET') return json({ok:true,env:ARCA_ENV,cuit:ARCA_CUIT,servicio:'wsreman'});
  if (req.method!=='POST') return json({error:'Metodo no permitido'},405);
  let params: RemitoParams;
  try { params = await req.json(); } catch { return json({error:'JSON invalido'},400); }
  if (!params.remito_id || !params.destinatario_cuit || !params.items?.length) {
    return json({error:'Faltan campos: remito_id, destinatario_cuit, items'},400);
  }
  try {
    const {token,sign} = await getARCAToken();
    const {cae,caeVencimiento,nroRemito} = await solicitarCAERemito(token,sign,params);
    await supabase.from('remitos_salida')
      .update({ cae, cae_vencimiento: caeVencimiento||null, nro_remito_afip: nroRemito||null })
      .eq('id', params.remito_id);
    return json({ok:true,cae,cae_vencimiento:caeVencimiento,nro_remito_afip:nroRemito});
  } catch(err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Error wsrem:',msg);
    return json({ok:false,error:msg},500);
  }
});
