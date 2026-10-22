// Consulta el padron de ARCA con el certificado propio. Devuelve razon social, condicion IVA y domicilio fiscal.
// Usa Constancia de Inscripcion (trae condicion IVA); si el certificado no la tiene habilitada, cae a Padron A13 (solo nombre/domicilio).
//   GET ?cuit=20123456789   (requiere usuario logueado)
// Respuesta: { ok, cuit, razon, condicion, condicion_label, condicion_verificada, domicilio, localidad, provincia, cp, tipo_persona, fuente }
//   condicion: 'responsable_inscripto' | 'monotributo' | 'exento' | 'consumidor_final' | 'no_inscripto' | null (A13)
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ARCA_CERT_P12_BASE64 = Deno.env.get('ARCA_CERT_P12_BASE64') ?? '';
const ARCA_CERT_PASSWORD = Deno.env.get('ARCA_CERT_PASSWORD') ?? '';
const ARCA_CUIT = Deno.env.get('ARCA_CUIT') ?? '27242657174';
const ARCA_ENV = Deno.env.get('ARCA_ENV') ?? 'homologacion';

// Dos servicios del padron. La constancia trae la condicion IVA; A13 solo nombre y domicilio.
// Se intenta primero la constancia y, si el certificado no esta autorizado, se cae a A13.
type Srv = { nombre: string; tokenId: number; url: string; ns: string; metodo: string };
const SRV_CONSTANCIA: Srv = { nombre: 'ws_sr_constancia_inscripcion', tokenId: 3, metodo: 'getPersona_v2',
  url: ARCA_ENV === 'produccion' ? 'https://aws.afip.gov.ar/sr-padron/webservices/personaServiceA5' : 'https://awshomo.afip.gov.ar/sr-padron/webservices/personaServiceA5',
  ns: 'http://a5.soap.ws.server.puc.sr/' };
const SRV_A13: Srv = { nombre: 'ws_sr_padron_a13', tokenId: 4, metodo: 'getPersona',
  url: ARCA_ENV === 'produccion' ? 'https://aws.afip.gov.ar/sr-padron/webservices/personaServiceA13' : 'https://awshomo.afip.gov.ar/sr-padron/webservices/personaServiceA13',
  ns: 'http://a13.soap.ws.server.puc.sr/' };

const WSAA_URL = ARCA_ENV === 'produccion'
  ? 'https://wsaa.afip.gov.ar/ws/services/LoginCms'
  : 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms';

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
function tag(xml: string, t: string): string | null {
  const m = xml.match(new RegExp(`<(?:[^:>]*:)?${t}[^>]*>([\\s\\S]*?)<\\/(?:[^:>]*:)?${t}>`));
  return m ? m[1].trim() : null;
}
function tags(xml: string, t: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`<(?:[^:>]*:)?${t}[^>]*>([\\s\\S]*?)<\\/(?:[^:>]*:)?${t}>`, 'g');
  let m; while ((m = re.exec(xml)) !== null) out.push(m[1]);
  return out;
}

async function signTRA(tra: string): Promise<string> {
  if (!ARCA_CERT_P12_BASE64 || !ARCA_CERT_PASSWORD) throw new Error('Secrets no configurados');
  const forgeModule = await import('npm:node-forge@1.3.1');
  const forge = forgeModule.default ?? forgeModule;
  const p12Der = forge.util.decode64(ARCA_CERT_P12_BASE64);
  const p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(p12Der), ARCA_CERT_PASSWORD);
  const keyBag  = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0];
  const certBag = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag]?.[0];
  if (!keyBag?.key || !certBag?.cert) throw new Error('No se pudo extraer clave/cert del .p12');
  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(tra, 'utf8');
  p7.addCertificate(certBag.cert);
  p7.addSigner({
    key: keyBag.key, certificate: certBag.cert, digestAlgorithm: forge.pki.oids.sha1,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: new Date() },
    ],
  });
  p7.sign();
  return forge.util.encode64(forge.asn1.toDer(p7.toAsn1()).getBytes());
}

function fmtDate(d: Date): string {
  const p = (n: number) => n.toString().padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth()+1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}+00:00`;
}

async function getToken(srv: Srv): Promise<{ token: string; sign: string }> {
  const { data: cached } = await supabase.from('arca_tokens').select('token,sign,expira_at').eq('id', srv.tokenId).maybeSingle();
  if (cached && new Date(cached.expira_at) > new Date(Date.now() + 5*60*1000)) return { token: cached.token, sign: cached.sign };
  const now = new Date();
  const tra = `<?xml version="1.0" encoding="UTF-8"?>
<loginTicketRequest version="1.0">
  <header>
    <uniqueId>${Math.floor(now.getTime()/1000)}</uniqueId>
    <generationTime>${fmtDate(new Date(now.getTime()-10*60*1000))}</generationTime>
    <expirationTime>${fmtDate(new Date(now.getTime()+10*60*1000))}</expirationTime>
  </header>
  <service>${srv.nombre}</service>
</loginTicketRequest>`;
  const cms = await signTRA(tra);
  const soap = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov.ar">
  <soapenv:Header/><soapenv:Body><wsaa:loginCms><wsaa:in0>${cms}</wsaa:in0></wsaa:loginCms></soapenv:Body>
</soapenv:Envelope>`;
  const resp = await fetch(WSAA_URL, { method:'POST', headers:{ 'Content-Type':'text/xml; charset=utf-8', 'SOAPAction':'""' }, body: soap });
  const raw = await resp.text();
  if (!resp.ok) {
    const fault = tag(raw, 'faultstring') ?? raw.slice(0, 300);
    throw new Error(`WSAA ${resp.status}: ${fault}`);
  }
  const ret = raw.match(/<loginCmsReturn[^>]*>([\s\S]*?)<\/loginCmsReturn>/);
  if (!ret) throw new Error(`WSAA sin loginCmsReturn: ${raw.slice(0, 300)}`);
  const inner = decodeHtmlEntities(ret[1]);
  const token = tag(inner, 'token'), sign = tag(inner, 'sign'), exp = tag(inner, 'expirationTime');
  if (!token || !sign) throw new Error(`WSAA sin token/sign: ${inner.slice(0, 300)}`);
  const expiraAt = exp ? new Date(exp).toISOString() : new Date(Date.now() + 11*3600*1000).toISOString();
  await supabase.from('arca_tokens').upsert({ id: srv.tokenId, token, sign, expira_at: expiraAt, updated_at: new Date().toISOString() });
  return { token, sign };
}

interface Persona {
  ok: true; cuit: string; razon: string;
  condicion: 'responsable_inscripto' | 'monotributo' | 'exento' | 'consumidor_final' | 'no_inscripto' | null;
  condicion_label: string; condicion_verificada: boolean; domicilio: string; localidad: string; provincia: string; cp: string;
  tipo_persona: string; fuente: string;
}

async function soapPersona(srv: Srv, cuit: string): Promise<string> {
  const { token, sign } = await getToken(srv);
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:p="${srv.ns}">
  <soapenv:Header/>
  <soapenv:Body>
    <p:${srv.metodo}>
      <token>${token}</token>
      <sign>${sign}</sign>
      <cuitRepresentada>${ARCA_CUIT}</cuitRepresentada>
      <idPersona>${cuit}</idPersona>
    </p:${srv.metodo}>
  </soapenv:Body>
</soapenv:Envelope>`;
  const resp = await fetch(srv.url, { method:'POST', headers:{ 'Content-Type':'text/xml; charset=utf-8', 'SOAPAction':'""' }, body, signal: AbortSignal.timeout(15000) });
  const xml = decodeHtmlEntities(await resp.text());
  console.log(srv.nombre, 'status', resp.status, xml.slice(0, 600));
  const fault = tag(xml, 'faultstring');
  if (fault) throw new Error(`${srv.nombre}: ${fault}`);
  if (!resp.ok) throw new Error(`${srv.nombre} HTTP ${resp.status}: ${xml.slice(0, 300)}`);
  return xml;
}

const LABELS: Record<string, string> = {
  responsable_inscripto: 'Responsable Inscripto', monotributo: 'Monotributo', exento: 'Exento',
  consumidor_final: 'Consumidor Final', no_inscripto: 'Sin inscripción vigente',
};

// Constancia de Inscripcion: nombre, domicilio e impuestos -> condicion IVA real
function parseConstancia(xml: string, cuit: string): Persona {
  const gen = tag(xml, 'datosGenerales') ?? '';
  const errConst = tag(xml, 'errorConstancia');
  if (!gen) throw new Error('ARCA: ' + (errConst ? (tag(errConst, 'error') ?? 'Sin constancia') : 'No encontrado'));
  const apellido = tag(gen, 'apellido') ?? '', nombre = tag(gen, 'nombre') ?? '';
  const razon = tag(gen, 'razonSocial') || [apellido, nombre].filter(Boolean).join(', ');
  const dom = tag(gen, 'domicilioFiscal') ?? '';
  const mono = tag(xml, 'datosMonotributo');
  const regGen = tag(xml, 'datosRegimenGeneral') ?? '';
  const impuestos = tags(regGen, 'impuesto').map(i => ({
    id: parseInt(tag(i, 'idImpuesto') ?? '0'),
    desc: tag(i, 'descripcionImpuesto') ?? '',
    estado: (tag(i, 'estadoImpuesto') ?? 'ACTIVO').toUpperCase(),
  })).filter(i => i.estado.startsWith('AC'));
  const tieneIva = impuestos.some(i => i.id === 30);
  const ivaExento = impuestos.some(i => i.id === 32 || /IVA EXENTO/i.test(i.desc));
  let condicion: Persona['condicion'];
  if (mono && (tag(mono, 'categoriaMonotributo') || tag(mono, 'descripcionCategoriaMonotributo'))) condicion = 'monotributo';
  else if (tieneIva) condicion = 'responsable_inscripto';
  else if (ivaExento) condicion = 'exento';
  else if (regGen && impuestos.length) condicion = 'exento';   // inscripto en otros impuestos, no en IVA
  else condicion = errConst ? 'no_inscripto' : 'consumidor_final';
  return { ok: true, cuit, razon, condicion, condicion_label: LABELS[condicion], condicion_verificada: true,
    domicilio: tag(dom, 'direccion') ?? '', localidad: tag(dom, 'localidad') ?? '', provincia: tag(dom, 'descripcionProvincia') ?? '',
    cp: tag(dom, 'codPostal') ?? '', tipo_persona: tag(gen, 'tipoPersona') ?? '', fuente: 'ARCA constancia de inscripción' };
}

// Padron A13: solo nombre y domicilio (sin impuestos) -> condicion queda sin verificar
function parseA13(xml: string, cuit: string): Persona {
  const p = tag(xml, 'persona') ?? '';
  if (!p) throw new Error('ARCA: No encontrado');
  const apellido = tag(p, 'apellido') ?? '', nombre = tag(p, 'nombre') ?? '';
  const razon = tag(p, 'razonSocial') || [apellido, nombre].filter(Boolean).join(', ');
  const doms = tags(p, 'domicilio');
  const dom = doms.find(d => /FISCAL/i.test(tag(d, 'tipoDomicilio') ?? '')) ?? doms[0] ?? '';
  return { ok: true, cuit, razon, condicion: null, condicion_label: 'Sin verificar (habilitar Constancia de Inscripción en ARCA)',
    condicion_verificada: false,
    domicilio: tag(dom, 'direccion') ?? '', localidad: tag(dom, 'localidad') ?? '', provincia: tag(dom, 'descripcionProvincia') ?? '',
    cp: tag(dom, 'codPostal') ?? tag(dom, 'codigoPostal') ?? '', tipo_persona: tag(p, 'tipoPersona') ?? '', fuente: 'ARCA padrón A13' };
}

async function consultar(cuit: string): Promise<Persona> {
  try {
    return parseConstancia(await soapPersona(SRV_CONSTANCIA, cuit), cuit);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Certificado sin el servicio de constancia -> respaldo con A13
    if (!/no autorizado|not authorized|cee00/i.test(msg)) throw e;
    console.warn('Constancia no autorizada, usando A13:', msg);
    return parseA13(await soapPersona(SRV_A13, cuit), cuit);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  // Solo usuarios logueados (la clave publica anon NO alcanza)
  const tok = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: au, error: auErr } = tok ? await supabase.auth.getUser(tok) : { data: null, error: new Error('sin token') };
  if (auErr || !au?.user) return json({ ok: false, error: 'No autorizado' }, 401);

  let cuit = new URL(req.url).searchParams.get('cuit') ?? '';
  if (req.method === 'POST') { try { cuit = (await req.json())?.cuit ?? cuit; } catch { /* sin body */ } }
  cuit = String(cuit).replace(/\D/g, '');
  if (cuit.length !== 11) return json({ ok: false, error: 'CUIT inválido (11 dígitos)' }, 400);

  try {
    return json(await consultar(cuit));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('padron-arca:', msg);
    return json({ ok: false, error: msg }, 502);
  }
});
