// Edge Function: agenda-diaria-ricardo
//
// Cron diario (07:00 hora local aprox., ver cron.job) que manda a Ricardo (mariordonez_81@yahoo.es)
// un resumen de sus visitas técnicas de HOY y de MAÑANA: dirección, descripción, hora, idioma,
// enlace a Google Maps y tiempo/distancia estimados desde la oficina correspondiente (ES/FR según
// el país de la visita) — petición de Gabriel 2026-09-12, para que Ricardo tenga de un vistazo por
// la mañana el plan del día (y el de mañana) sin tener que abrir el CRM.
//
// Reutiliza los mismos patrones que notificar-visita/index.ts (oficinas de referencia,
// calcularDistancia con Google Distance Matrix + fallback Haversine, envío por Gmail) y
// alerta-diaria/index.ts (estructura de email en tarjetas). No requiere body.
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://ordonezrenov.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Supabase valida que el JWT esté bien firmado (verify_jwt: true) pero no distingue la clave anon
// (pública, va en el bundle del frontend) de una sesión real — comprobar el rol cierra ese hueco
// (revisión de seguridad 2026-08-11). Duplicado en cada función: el despliegue vía MCP no resuelve
// imports relativos entre funciones.
function esLlamadaAutorizada(req: Request): boolean {
  const auth = req.headers.get('Authorization') ?? '';
  const token = auth.replace(/^Bearer\s+/i, '');
  const partes = token.split('.');
  if (partes.length !== 3) return false;
  try {
    const payload = JSON.parse(atob(partes[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload.role === 'authenticated' || payload.role === 'service_role';
  } catch {
    return false;
  }
}

const REMITENTE_BASE = 'reformasordonezeus@gmail.com';
const DESTINATARIO_RICARDO = 'mariordonez_81@yahoo.es';

// Oficinas de referencia ("la casa") para estimar distancia — mismas coordenadas que
// notificar-visita/index.ts (docs/negocio/empresa.md § Direcciones).
type Oficina = { lat: number; lng: number; direccion: string };
const OFICINA_ES: Oficina = { lat: 43.3409811, lng: -1.7985261, direccion: 'Calle Estación n5, 5D, 20301 Irún, España' };
const OFICINA_FR: Oficina = { lat: 43.3546525, lng: -1.7747975, direccion: '4 Avenue des Allées 2ème Étage, 64700 Hendaye, France' };

function enlaceMaps(direccion: string, lat: number | null, lng: number | null): string {
  const query = lat != null && lng != null ? `${lat},${lng}` : direccion;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

// Distancia/tiempo real por carretera vía Google Distance Matrix API. Si la key de servidor
// GOOGLE_MAPS_API_KEY no está disponible o Google la rechaza (restricción de referrer, ver el
// mismo comentario en notificar-visita/index.ts), cae al fallback Haversine de abajo — nunca
// bloquea el envío del email por esto.
async function distanciaReal(oficina: Oficina, lat: number, lng: number, apiKey: string): Promise<{ texto: string } | null> {
  const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${oficina.lat},${oficina.lng}&destinations=${lat},${lng}&mode=driving&language=es&key=${apiKey}`;
  const res = await fetch(url);
  const data = await res.json();
  const el = data?.rows?.[0]?.elements?.[0];
  if (data.status !== 'OK' || !el || el.status !== 'OK') return null;
  return { texto: `${el.distance.text} · ${el.duration.text} en coche` };
}

function distanciaEstimada(oficina: Oficina, lat: number, lng: number): { texto: string } {
  const R = 6371;
  const dLat = ((lat - oficina.lat) * Math.PI) / 180;
  const dLng = ((lng - oficina.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos((oficina.lat * Math.PI) / 180) * Math.cos((lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  const lineaRecta = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const carretera = lineaRecta * 1.3;
  const km = Math.round(carretera * 10) / 10;
  const minutos = Math.round((carretera / 45) * 60);
  return { texto: `~${km} km · ~${minutos} min en coche (estimación aproximada)` };
}

async function calcularDistancia(oficina: Oficina, lat: number, lng: number): Promise<string> {
  const apiKey = Deno.env.get('GOOGLE_MAPS_API_KEY');
  if (apiKey) {
    try {
      const real = await distanciaReal(oficina, lat, lng, apiKey);
      if (real) return real.texto;
    } catch {
      // sigue al fallback de abajo
    }
  }
  return distanciaEstimada(oficina, lat, lng).texto;
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

async function obtenerAccessToken(supabase: SupabaseClient): Promise<string> {
  const { data: config, error } = await supabase.from('google_config').select('refresh_token, refresh_token_gmail').eq('id', 1).maybeSingle();
  if (error) throw new Error(`No se pudo leer google_config: ${error.message}`);
  const refreshToken = config?.refresh_token_gmail || config?.refresh_token;
  if (!refreshToken) throw new Error('Google no está conectado (falta refresh_token en google_config)');

  const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
  if (!clientId || !clientSecret) throw new Error('Faltan GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET en los secretos');

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`No se pudo renovar el token de Google (¿falta el scope gmail.send? conectar Gmail en Configuración): ${data.error_description ?? data.error}`);
  }
  return data.access_token;
}

function base64UrlEncodeUtf8(texto: string): string {
  const utf8 = new TextEncoder().encode(texto);
  let binario = '';
  for (const byte of utf8) binario += String.fromCharCode(byte);
  return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function codificarAsunto(asunto: string): string {
  const utf8 = new TextEncoder().encode(asunto);
  let binario = '';
  for (const byte of utf8) binario += String.fromCharCode(byte);
  return `=?UTF-8?B?${btoa(binario)}?=`;
}

async function enviarGmail(token: string, destinatarios: string[], asunto: string, cuerpoHtml: string): Promise<void> {
  const mensajeMime = [
    `From: ${REMITENTE_BASE}`,
    `To: ${destinatarios.join(', ')}`,
    `Subject: ${codificarAsunto(asunto)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset="UTF-8"',
    '',
    cuerpoHtml,
  ].join('\r\n');

  const res = await fetch('https://www.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: base64UrlEncodeUtf8(mensajeMime) }),
  });
  if (!res.ok) {
    const detalle = await res.text().catch(() => '');
    throw new Error(`Gmail no aceptó el envío (${res.status}): ${detalle}`);
  }
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fechaLegible(fecha: string): string {
  return new Date(`${fecha}T00:00:00`).toLocaleDateString('es', { weekday: 'long', day: '2-digit', month: 'long' });
}

type VisitaAgenda = {
  id: string;
  nombre: string | null;
  apellidos: string | null;
  direccion: string | null;
  direccion_extra: string | null;
  lat: number | null;
  lng: number | null;
  hora_visita: string;
  tipo: string | null;
  descripcion: string | null;
  idioma: string | null;
  pais: string | null;
};

async function tarjetaVisita(v: VisitaAgenda): Promise<string> {
  const nombreCliente = `${v.nombre ?? ''} ${v.apellidos ?? ''}`.trim() || 'Sin nombre';
  const hora = String(v.hora_visita).slice(0, 5);
  const direccionTexto = [v.direccion, v.direccion_extra].filter(Boolean).join(' — ') || 'Dirección no indicada';
  const mapsUrl = v.direccion ? enlaceMaps(v.direccion, v.lat, v.lng) : null;
  const tieneCoords = typeof v.lat === 'number' && typeof v.lng === 'number';
  const oficina = v.pais === 'Francia' ? OFICINA_FR : OFICINA_ES;
  const distanciaTexto = tieneCoords ? await calcularDistancia(oficina, v.lat as number, v.lng as number) : null;
  const idiomaTexto = v.idioma === 'Français' ? 'Francés' : 'Español';
  const descripcionTexto = [v.tipo, v.descripcion].filter(Boolean).join(' — ') || 'Sin descripción';

  return `<div style="border:1px solid #e5e7eb;border-radius:10px;padding:14px 16px;margin-bottom:10px">
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px">
      <div style="color:#1a5c38;font-weight:600;font-size:14px">${esc(hora)} · ${esc(nombreCliente)}</div>
      <div style="color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:.03em">${esc(idiomaTexto)}</div>
    </div>
    <div style="font-size:13px;color:#111827;margin-bottom:4px">${esc(direccionTexto)}</div>
    <div style="font-size:12px;color:#6b7280;margin-bottom:8px">${esc(descripcionTexto)}</div>
    ${
      mapsUrl
        ? `<a href="${mapsUrl}" style="display:inline-block;background:#1a5c38;color:#ffffff;text-decoration:none;font-size:12px;font-weight:600;padding:7px 12px;border-radius:6px">Ver en Google Maps</a>`
        : ''
    }
    ${distanciaTexto ? `<div style="font-size:12px;color:#6b7280;margin-top:8px">${esc(distanciaTexto)} desde ${esc(oficina.direccion)}</div>` : ''}
  </div>`;
}

async function seccionDia(titulo: string, fecha: string, visitas: VisitaAgenda[]): Promise<string> {
  const cabecera = `<div style="font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#9ca3af;font-weight:600;margin:20px 0 8px">${esc(titulo)} — ${esc(fechaLegible(fecha))}</div>`;
  if (visitas.length === 0) {
    return `${cabecera}<div style="font-size:13px;color:#9ca3af;font-style:italic;margin-bottom:6px">Sin visitas.</div>`;
  }
  const tarjetas = await Promise.all(visitas.map(tarjetaVisita));
  return `${cabecera}${tarjetas.join('')}`;
}

function construirHtml(seccionHoy: string, seccionManana: string): string {
  return `<div style="font-family:Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" style="max-width:560px;margin:0 auto" cellpadding="0" cellspacing="0">
    <tr><td style="background:#0f3d24;padding:20px 24px;border-radius:10px 10px 0 0">
      <div style="color:#ffffff;font-size:16px;font-weight:600">Reformas Ordoñez</div>
      <div style="color:#cdddd5;font-size:12px;margin-top:2px">Agenda de visitas</div>
    </td></tr>
    <tr><td style="background:#ffffff;padding:24px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb">
      ${seccionHoy}
      ${seccionManana}
    </td></tr>
    <tr><td style="background:#f8fafc;border:1px solid #e5e7eb;border-top:1px solid #eef2f7;border-radius:0 0 10px 10px;padding:14px 24px;text-align:center">
      <div style="color:#9ca3af;font-size:11px">Notificación automática del CRM Reformas Ordoñez</div>
    </td></tr>
  </table>
</div>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (!esLlamadaAutorizada(req)) return jsonResponse({ ok: false, error: 'No autorizado' }, 401);

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const ahora = new Date();
    const hoy = ahora.toISOString().slice(0, 10);
    const manana = new Date(ahora.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const columnas = 'id, nombre, apellidos, direccion, direccion_extra, lat, lng, hora_visita, tipo, descripcion, idioma, pais, fecha_visita';
    const { data: visitasConFecha, error } = await supabase
      .from('visitas')
      .select(columnas)
      .eq('estado', 'Pendiente')
      .is('eliminado_en', null)
      .in('fecha_visita', [hoy, manana])
      .order('hora_visita', { ascending: true });
    if (error) return jsonResponse({ ok: false, error: `No se pudieron leer las visitas: ${error.message}` }, 500);

    const visitas = (visitasConFecha ?? []) as (VisitaAgenda & { fecha_visita: string })[];
    const visitasHoy = visitas.filter((v) => v.fecha_visita === hoy);
    const visitasManana = visitas.filter((v) => v.fecha_visita === manana);

    if (visitasHoy.length === 0 && visitasManana.length === 0) {
      return jsonResponse({ ok: true, enviado: false, motivo: 'Sin visitas hoy ni mañana' });
    }

    const [seccionHoy, seccionManana] = await Promise.all([
      seccionDia('Hoy', hoy, visitasHoy),
      seccionDia('Mañana', manana, visitasManana),
    ]);

    const cuerpo = construirHtml(seccionHoy, seccionManana);
    const asunto = `Agenda de visitas — ${visitasHoy.length} hoy, ${visitasManana.length} mañana`;

    const token = await obtenerAccessToken(supabase);
    await enviarGmail(token, [DESTINATARIO_RICARDO], asunto, cuerpo);

    return jsonResponse({ ok: true, enviado: true, visitasHoy: visitasHoy.length, visitasManana: visitasManana.length });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err instanceof Error ? err.message : err) }, 500);
  }
});
