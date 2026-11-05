// Edge Function: web-eventos
//
// Medición propia de las webs filiales (2026-11-05, petición de Gabriel): costabath.com,
// ordonezfachadas.com y ordonezstudio.com mandan aquí, con assets/medicion.js, cada página vista,
// el scroll, el tiempo visible, los clics en WhatsApp/teléfono/email/botones de contacto y los
// pasos y el envío del formulario. Se guarda en `web_eventos` para Solicitudes → Webs filiales.
//
// Pública a propósito (verify_jwt: false, desplegar con --no-verify-jwt): la llaman las webs sin
// sesión. El cuerpo llega como text/plain (sendBeacon o fetch keepalive) para no disparar la
// petición previa de CORS. Defensas: solo los orígenes de las tres webs (el sitio se deduce del
// origen, nunca del cuerpo), lista cerrada de eventos, longitudes acotadas, como mucho 40 eventos
// por petición y 600 por sesión, y robots descartados. Sin datos personales: la sesión es un código
// aleatorio de la pestaña y del referente solo se guarda el dominio.
//
// Body: { s: sesion, n: nº de página vista en la sesión, p: ruta, i: idioma, d: dispositivo,
//         r?: dominio de procedencia, u?: { s, m, c } utm, e: [{ t, n?, v? }] }
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SITIOS: Record<string, string> = {
  'https://costabath.com': 'costabath',
  'https://www.costabath.com': 'costabath',
  'https://ordonezfachadas.com': 'ordonezfachadas',
  'https://www.ordonezfachadas.com': 'ordonezfachadas',
  'https://ordonezstudio.com': 'ordonezstudio',
  'https://www.ordonezstudio.com': 'ordonezstudio',
};
const EVENTOS = new Set([
  'vista',
  'scroll',
  'tiempo',
  'whatsapp',
  'telefono',
  'email',
  'cta',
  'form_inicio',
  'form_paso',
  'form_error',
  'enviado',
  'error_envio',
]);
const MAX_POR_PETICION = 40;
const MAX_POR_SESION = 600;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROBOT = /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|facebookexternalhit|bingpreview|ahrefs|semrush/i;
const DISPOSITIVOS = new Set(['movil', 'tablet', 'escritorio']);

function cabecerasCors(req: Request): Record<string, string> {
  const origen = req.headers.get('origin') ?? '';
  return {
    'Access-Control-Allow-Origin': SITIOS[origen] ? origen : 'https://costabath.com',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

function texto(v: unknown, max: number): string | null {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;
}

function entero(v: unknown, min: number, max: number): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : null;
}

Deno.serve(async (req: Request) => {
  const cors = cabecerasCors(req);
  const responder = (cuerpo: unknown, status = 200) =>
    new Response(JSON.stringify(cuerpo), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return responder({ error: 'Método no permitido' }, 405);
  const sitio = SITIOS[req.headers.get('origin') ?? ''];
  if (!sitio) return responder({ error: 'Origen no permitido' }, 403);
  if (ROBOT.test(req.headers.get('user-agent') ?? '')) return responder({ ok: true, robot: true });

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(await req.text());
  } catch {
    return responder({ error: 'JSON inválido' }, 400);
  }

  const sesion = typeof body.s === 'string' && /^[a-z0-9]{8,40}$/i.test(body.s) ? body.s : null;
  const vistaN = entero(body.n, 1, 500);
  if (!sesion || !vistaN) return responder({ error: 'Sesión no válida' }, 400);
  const pagina = texto(body.p, 300);
  const idioma = body.i === 'fr' ? 'fr' : body.i === 'eu' ? 'eu' : 'es';
  const dispositivo = typeof body.d === 'string' && DISPOSITIVOS.has(body.d) ? body.d : 'escritorio';
  const referente = texto(body.r, 120)?.toLowerCase() ?? null;
  const utm = body.u && typeof body.u === 'object' ? (body.u as Record<string, unknown>) : {};
  const lista = Array.isArray(body.e) ? body.e.slice(0, MAX_POR_PETICION) : [];

  const filas = lista
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
    .filter((x) => typeof x.t === 'string' && EVENTOS.has(x.t))
    .map((x) => {
      const evento = x.t as string;
      const valor = texto(x.v, 120);
      const esVista = evento === 'vista';
      return {
        sitio,
        sesion,
        vista_n: vistaN,
        evento,
        numero: entero(x.n, 0, 86400),
        valor: evento === 'enviado' ? null : valor,
        pagina,
        idioma,
        dispositivo,
        referente: esVista ? referente : null,
        utm_fuente: esVista ? texto(utm.s, 80) : null,
        utm_medio: esVista ? texto(utm.m, 80) : null,
        utm_campana: esVista ? texto(utm.c, 120) : null,
        solicitud_id: evento === 'enviado' && valor && UUID.test(valor) ? valor : null,
      };
    });
  if (filas.length === 0) return responder({ ok: true });

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { count, error: errorCuenta } = await supabase
    .from('web_eventos')
    .select('id', { count: 'exact', head: true })
    .eq('sesion', sesion);
  if (errorCuenta) return responder({ error: errorCuenta.message }, 500);
  if ((count ?? 0) + filas.length > MAX_POR_SESION) return responder({ ok: true, limitado: true });

  // El id de solicitud lo devuelve solicitud-web a la web; se comprueba que existe para que un
  // valor inventado no rompa la inserción por la clave foránea.
  for (const f of filas) {
    if (!f.solicitud_id) continue;
    const { data, error } = await supabase.from('solicitudes').select('id').eq('id', f.solicitud_id).maybeSingle();
    if (error) return responder({ error: error.message }, 500);
    if (!data) f.solicitud_id = null;
  }

  const { error } = await supabase.from('web_eventos').insert(filas);
  if (error) return responder({ error: error.message }, 500);
  return responder({ ok: true });
});
