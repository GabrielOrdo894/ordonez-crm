// Edge Function: asistente-eventos
//
// Recibe los eventos del asistente web de ordonezrenov.com (2026-10-15) y los guarda en
// `asistente_eventos` para la pestaña Solicitudes → Asistente web del CRM: aviso mostrado,
// apertura, cada paso y opción elegida, volver, cerrar, WhatsApp y envío.
//
// Pública a propósito (verify_jwt: false, desplegar con --no-verify-jwt): la llama el asistente
// sin sesión. El asistente envía el cuerpo como text/plain (fetch keepalive o sendBeacon al salir
// de la página) para no disparar la petición previa de CORS. Defensas: solo el origen
// ordonezrenov.com, lista cerrada de eventos, longitudes acotadas, como mucho 40 eventos por
// petición y 400 por sesión. No guarda datos personales: la sesión es un código aleatorio que
// solo vive mientras la página está abierta.
//
// Body: { s: sesion, p: ruta, i: 'es'|'fr', d: 'movil'|'escritorio', e: [{ t, n?, v? }] }
import { createClient } from 'jsr:@supabase/supabase-js@2';

const ORIGENES = ['https://ordonezrenov.com', 'https://www.ordonezrenov.com'];
const EVENTOS = new Set([
  'vista',
  'aviso',
  'aviso_cerrado',
  'abierto',
  'paso',
  'opcion',
  'volver',
  'cerrado',
  'whatsapp',
  'error_validacion',
  'enviado',
  'error_envio',
]);
const MAX_POR_PETICION = 40;
const MAX_POR_SESION = 400;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Robots que ejecutan JavaScript (Googlebot renderiza las páginas con un aleatorio fijo, así que
// sus visitas compartían sesión y alternaban móvil/escritorio): se descartan sin guardar nada.
const ROBOT = /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|facebookexternalhit|bingpreview|ahrefs|semrush/i;

function cabecerasCors(req: Request): Record<string, string> {
  const origen = req.headers.get('origin') ?? '';
  return {
    'Access-Control-Allow-Origin': ORIGENES.includes(origen) ? origen : ORIGENES[0],
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

function texto(v: unknown, max: number): string | null {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;
}

Deno.serve(async (req: Request) => {
  const cors = cabecerasCors(req);
  const responder = (cuerpo: unknown, status = 200) =>
    new Response(JSON.stringify(cuerpo), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return responder({ error: 'Método no permitido' }, 405);
  if (!ORIGENES.includes(req.headers.get('origin') ?? '')) return responder({ error: 'Origen no permitido' }, 403);
  if (ROBOT.test(req.headers.get('user-agent') ?? '')) return responder({ ok: true, robot: true });

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(await req.text());
  } catch {
    return responder({ error: 'JSON inválido' }, 400);
  }

  const sesion = typeof body.s === 'string' && /^[a-z0-9]{8,40}$/i.test(body.s) ? body.s : null;
  if (!sesion) return responder({ error: 'Sesión no válida' }, 400);
  const pagina = texto(body.p, 300);
  const idioma = body.i === 'fr' ? 'fr' : 'es';
  const dispositivo = body.d === 'movil' ? 'movil' : 'escritorio';
  const lista = Array.isArray(body.e) ? body.e.slice(0, MAX_POR_PETICION) : [];

  const filas = lista
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
    .filter((x) => typeof x.t === 'string' && EVENTOS.has(x.t))
    .map((x) => {
      const paso = typeof x.n === 'number' && Number.isInteger(x.n) && x.n >= 0 && x.n <= 5 ? x.n : null;
      const valor = texto(x.v, 120);
      return {
        sesion,
        evento: x.t as string,
        paso,
        valor: x.t === 'enviado' ? null : valor,
        pagina,
        idioma,
        dispositivo,
        solicitud_id: x.t === 'enviado' && valor && UUID.test(valor) ? valor : null,
      };
    });
  if (filas.length === 0) return responder({ ok: true });

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { count, error: errorCuenta } = await supabase
    .from('asistente_eventos')
    .select('id', { count: 'exact', head: true })
    .eq('sesion', sesion);
  if (errorCuenta) return responder({ error: errorCuenta.message }, 500);
  if ((count ?? 0) + filas.length > MAX_POR_SESION) return responder({ ok: true, limitado: true });

  // El id de solicitud lo devuelve solicitud-web al asistente; se comprueba que existe para que
  // un valor inventado no rompa la inserción por la clave foránea.
  for (const f of filas) {
    if (!f.solicitud_id) continue;
    const { data, error } = await supabase.from('solicitudes').select('id').eq('id', f.solicitud_id).maybeSingle();
    if (error) return responder({ error: error.message }, 500);
    if (!data) f.solicitud_id = null;
  }

  const { error } = await supabase.from('asistente_eventos').insert(filas);
  if (error) return responder({ error: error.message }, 500);
  return responder({ ok: true });
});
