// Consulta el padron de ARCA (Constancia de Inscripcion, ws_sr_constancia_inscripcion)
// con el certificado propio. Devuelve razon social, condicion IVA real y domicilio fiscal.
//   GET ?cuit=20123456789   (requiere usuario logueado)
// Respuesta: { ok, cuit, razon, condicion, condicion_label, domicilio, localidad, provincia, cp, tipo_persona, fuente }
//   condicion: 'responsable_inscripto' | 'monotributo' | 'exento' | 'consumidor_final' | 'no_inscripto'
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ARCA_CERT_P12_BASE64 = Deno.env.get('ARCA_CERT_P12_BASE64') ?? '';
const ARCA_CERT_PASSWORD = Deno.env.get('ARCA_CERT_PASSWORD') ?? '';
const ARCA_CUIT = Deno.env.get('ARCA_CUIT') ?? '27242657174';
const ARCA_ENV = Deno.env.get('ARCA_ENV') ?? 'homologacion';

const SERVICIO = 'ws_sr_constancia_inscripcion';
const TOKEN_ID = 3; // fila en arca_tokens (1 = wsfe, 2 = wsreman)

const WSAA_URL = ARCA_ENV === 'produccion'
  ? 'https://wsaa.afip.gov.ar/ws/services/LoginCms'
  : 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms';
const PADRON_URL = ARCA_ENV === 'produccion'
  ? 'https://aws.afip.gov.ar/sr-padron/webservices/personaServiceA5'
  : 'https://awshomo.afip.gov.ar/sr-padron/webservices/personaServiceA5';
const PADRON_NS = 'http://a5.soap.ws.server.puc.sr/';

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

async function getToken(): Promise<{ token: string; sign: string }> {
  const { data: cached } = await supabase.from('arca_tokens').select('token,sign,expira_at').eq('id', TOKEN_ID).maybeSingle();
  if (cached && new Date(cached.expira_at) > new Date(Date.now() + 5*60*1000)) return { token: cached.token, sign: cached.sign };
  const now = new Date();
  const tra = `<?xml version="1.0" encoding="UTF-8"?>
<loginTicketRequest version="1.0">
  <header>
    <uniqueId>${Math.floor(now.getTime()/1000)}</uniqueId>
    <generationTime>${fmtDate(new Date(now.getTime()-10*60*1000))}</generationTime>
    <expirationTime>${fmtDate(new Date(now.getTime()+10*60*1000))}</expirationTime>
  </header>
  <service>${SERVICIO}</service>
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
  await supabase.from('arca_tokens').upsert({ id: TOKEN_ID, token, sign, expira_at: expiraAt, updated_at: new Date().toISOString() });
  return { token, sign };
}

interface Persona {
  ok: true; cuit: string; razon: string;
  condicion: 'responsable_inscripto' | 'monotributo' | 'exento' | 'consumidor_final' | 'no_inscripto';
  condicion_label: string; domicilio: string; localidad: string; provincia: string; cp: string;
  tipo_persona: string; fuente: string;
}

async function consultar(cuit: string): Promise<Persona> {
  const { token, sign } = await getToken();
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:a5="${PADRON_NS}">
  <soapenv:Header/>
  <soapenv:Body>
    <a5:getPersona_v2>
      <token>${token}</token>
      <sign>${sign}</sign>
      <cuitRepresentada>${ARCA_CUIT}</cuitRepresentada>
      <idPersona>${cuit}</idPersona>
    </a5:getPersona_v2>
  </soapenv:Body>
</soapenv:Envelope>`;
  const resp = await fetch(PADRON_URL, { method:'POST', headers:{ 'Content-Type':'text/xml; charset=utf-8', 'SOAPAction':'""' }, body, signal: AbortSignal.timeout(15000) });
  const xml = decodeHtmlEntities(await resp.text());
  console.log('padron status', resp.status, xml.slice(0, 600));
  const fault = tag(xml, 'faultstring');
  if (fault) throw new Error(`Padron ARCA: ${fault}`);
  if (!resp.ok) throw new Error(`Padron HTTP ${resp.status}: ${xml.slice(0, 300)}`);

  const gen = tag(xml, 'datosGenerales') ?? '';
  const errConst = tag(xml, 'errorConstancia');
  if (!gen) {
    const msg = errConst ? (tag(errConst, 'error') ?? 'Sin constancia') : 'No encontrado';
    throw new Error(`ARCA: ${msg}`);
  }

  const apellido = tag(gen, 'apellido') ?? '', nombre = tag(gen, 'nombre') ?? '';
  const razon = tag(gen, 'razonSocial') || [apellido, nombre].filter(Boolean).join(', ');
  const tipoPersona = tag(gen, 'tipoPersona') ?? '';
  const dom = tag(gen, 'domicilioFiscal') ?? '';
  const domicilio = tag(dom, 'direccion') ?? '';
  const localidad = tag(dom, 'localidad') ?? '';
  const provincia = tag(dom, 'descripcionProvincia') ?? '';
  const cp = tag(dom, 'codPostal') ?? '';

  // Condicion IVA:
  //  - datosMonotributo presente          -> monotributo
  //  - impuesto 30 (IVA) activo           -> responsable inscripto
  //  - impuesto 32 (IVA exento) activo    -> exento
  //  - inscripto sin IVA (p.ej. solo Ganancias) -> exento / no alcanzado  (se informa como 'exento')
  //  - sin inscripcion en regimen general ni mono -> consumidor final
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
  else if (regGen && impuestos.length) condicion = 'exento';        // inscripto en otros impuestos, no en IVA
  else condicion = errConst ? 'no_inscripto' : 'consumidor_final';

  const labels: Record<Persona['condicion'], string> = {
    responsable_inscripto: 'Responsable Inscripto', monotributo: 'Monotributo', exento: 'Exento',
    consumidor_final: 'Consumidor Final', no_inscripto: 'Sin inscripción vigente',
  };
  return { ok: true, cuit, razon, condicion, condicion_label: labels[condicion], domicilio, localidad, provincia, cp,
    tipo_persona: tipoPersona, fuente: 'ARCA ' + SERVICIO };
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
