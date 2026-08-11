// Edge Function: notificar-visita
//
// Envía un email de confirmación con los datos de la visita cuando se agenda (fecha + hora
// definidas), a reformasordonezeus@gmail.com y a la lista de emails adicionales configurada
// en empresa_config.datos.notificaciones_visita_emails_extra (Configuración → Notificaciones).
// Usa refresh_token_gmail de `google_config`, separado del de Calendar desde 2026-08-05 —
// ver src/lib/googleCalendar.ts. Ver también docs/bloque6-solicitudes-seguimiento.md.
//
// Body esperado: { "visitaId": "<uuid>" }
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Supabase valida que el JWT esté bien firmado (verify_jwt: true) pero no distingue la clave anon
// (pública, va en el bundle del frontend) de una sesión real — comprobar el rol cierra ese hueco
// (revisión de seguridad 2026-08-11). Duplicado en cada función: el despliegue vía MCP no resuelve
// imports relativos entre funciones (a diferencia de `supabase functions deploy` por CLI).
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

// Oficinas de referencia ("la casa") para estimar distancia — coordenadas de
// docs/empresa.md § Direcciones, geocodificadas una vez con Nominatim/OSM.
type Oficina = { lat: number; lng: number; direccion: string };
const OFICINA_ES: Oficina = { lat: 43.3409811, lng: -1.7985261, direccion: 'Calle Estación n5, 5D, 20301 Irún, España' };
const OFICINA_FR: Oficina = { lat: 43.3546525, lng: -1.7747975, direccion: '4 Avenue des Allées 2ème Étage, 64700 Hendaye, France' };

function enlaceMaps(direccion: string, lat: number | null, lng: number | null): string {
  const query = lat != null && lng != null ? `${lat},${lng}` : direccion;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

// Distancia/tiempo real por carretera vía Google Distance Matrix API, usando el secreto de
// servidor GOOGLE_MAPS_API_KEY. OJO: si esa key tiene restricción de referrer HTTP (la típica
// para uso en frontend, `VITE_GMAPS_API_KEY`), Google la RECHAZA para llamadas servidor-a-servidor
// con "API keys with referer restrictions cannot be used with this API" (comprobado en vivo,
// 2026-07-30) — no hay forma de arreglarlo desde el código, hay que quitar esa restricción (o
// crear una key de servidor sin restricción) en Google Cloud Console → Credenciales. Por eso esta
// función puede devolver null con toda normalidad, y `distanciaEstimada` hace de fallback abajo.
async function distanciaReal(
  oficina: Oficina,
  lat: number,
  lng: number,
  apiKey: string
): Promise<{ texto: string } | null> {
  const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${oficina.lat},${oficina.lng}&destinations=${lat},${lng}&mode=driving&language=es&key=${apiKey}`;
  const res = await fetch(url);
  const data = await res.json();
  const el = data?.rows?.[0]?.elements?.[0];
  if (data.status !== 'OK' || !el || el.status !== 'OK') return null;
  return { texto: `${el.distance.text} · ${el.duration.text} en coche (Google Maps)` };
}

// Estimación por línea recta (Haversine) — fallback cuando `distanciaReal` no está disponible
// (key de servidor sin configurar, restringida por Google, o sin conexión). Se aplica un factor
// de circuidad de carretera típico de zona regional/costera (1.3x la línea recta) y una
// velocidad media conservadora (45 km/h). Se indica en el propio texto que es una estimación.
function distanciaEstimada(oficina: Oficina, lat: number, lng: number): { texto: string } {
  const R = 6371;
  const dLat = ((lat - oficina.lat) * Math.PI) / 180;
  const dLng = ((lng - oficina.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((oficina.lat * Math.PI) / 180) * Math.cos((lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  const lineaRecta = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const carretera = lineaRecta * 1.3;
  const km = Math.round(carretera * 10) / 10;
  const minutos = Math.round((carretera / 45) * 60);
  return { texto: `~${km} km · ~${minutos} min en coche (estimación aproximada, sin Google Maps)` };
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
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function obtenerAccessToken(supabase: SupabaseClient): Promise<string> {
  const { data: config, error } = await supabase
    .from('google_config')
    .select('refresh_token, refresh_token_gmail')
    .eq('id', 1)
    .maybeSingle();
  if (error) throw new Error(`No se pudo leer google_config: ${error.message}`);
  // refresh_token_gmail es el token dedicado a Gmail desde la separación de scopes del 2026-08-05
  // (botón "Conectar Gmail" en Configuración) — hasta que se conecte por separado, se usa el
  // refresh_token combinado antiguo como fallback para no romper esta función mientras tanto.
  const refreshToken = config?.refresh_token_gmail || config?.refresh_token;
  if (!refreshToken) throw new Error('Google no está conectado (falta refresh_token en google_config)');

  const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
  if (!clientId || !clientSecret) throw new Error('Faltan GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET en los secretos');

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
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
  // RFC 2047 — necesario porque el asunto lleva acentos/ñ.
  const utf8 = new TextEncoder().encode(asunto);
  let binario = '';
  for (const byte of utf8) binario += String.fromCharCode(byte);
  return `=?UTF-8?B?${btoa(binario)}?=`;
}

function fechaLegible(fecha: string | null): string {
  if (!fecha) return '—';
  return new Date(`${fecha}T00:00:00`).toLocaleDateString('es', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fila(etiqueta: string, valor: string): string {
  return `<tr>
    <td style="padding:5px 12px 5px 0;color:#9ca3af;font-size:12px;white-space:nowrap;vertical-align:top">${esc(etiqueta)}</td>
    <td style="padding:5px 0;color:#111827;font-size:13px">${esc(valor)}</td>
  </tr>`;
}

function seccion(titulo: string): string {
  return `<div style="font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#9ca3af;font-weight:600;margin:18px 0 6px">${esc(titulo)}</div>`;
}

// Email de marca (colores/tipografía de Reformas Ordoñez, ver CLAUDE.md §4) en vez del texto
// plano anterior — tabla HTML con estilos inline (necesario para que se vea bien en clientes de
// correo, que no soportan CSS externo/embebido de forma fiable).
function construirHtml(opts: {
  fechaTxt: string;
  hora: string;
  nombreCliente: string;
  telefono: string;
  email: string;
  idioma: string;
  direccionTexto: string;
  mapsUrl: string | null;
  distanciaTexto: string | null;
  tipo: string;
  descripcion: string;
  zonaTexto: string;
  empleado: string;
}): string {
  return `<div style="font-family:Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" style="max-width:560px;margin:0 auto" cellpadding="0" cellspacing="0">
    <tr><td style="background:#0f3d24;padding:20px 24px;border-radius:10px 10px 0 0">
      <div style="color:#ffffff;font-size:16px;font-weight:600">Reformas Ordoñez</div>
      <div style="color:#cdddd5;font-size:12px;margin-top:2px">Visita técnica agendada</div>
    </td></tr>
    <tr><td style="background:#ffffff;padding:24px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb">
      <div style="background:#eaf2ed;border-radius:10px;padding:14px 16px;margin-bottom:6px">
        <div style="color:#1a5c38;font-weight:600;font-size:15px">${esc(opts.fechaTxt)} · ${esc(opts.hora)}</div>
      </div>

      ${seccion('Cliente')}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${fila('Nombre', opts.nombreCliente || '—')}
        ${fila('Teléfono', opts.telefono)}
        ${fila('Email', opts.email)}
        ${fila('Idioma', opts.idioma)}
      </table>

      ${seccion('Dirección')}
      <div style="font-size:13px;color:#111827;margin-bottom:10px">${esc(opts.direccionTexto)}</div>
      ${
        opts.mapsUrl
          ? `<a href="${opts.mapsUrl}" style="display:inline-block;background:#1a5c38;color:#ffffff;text-decoration:none;font-size:12px;font-weight:600;padding:8px 14px;border-radius:6px">Ver en Google Maps</a>`
          : ''
      }
      ${opts.distanciaTexto ? `<div style="font-size:12px;color:#6b7280;margin-top:8px">${esc(opts.distanciaTexto)}</div>` : ''}

      ${seccion('Trabajo')}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${fila('Tipo', opts.tipo)}
        ${fila('Descripción', opts.descripcion)}
        ${fila('Zona', opts.zonaTexto)}
        ${fila('Asignado', opts.empleado)}
      </table>
    </td></tr>
    <tr><td style="background:#f8fafc;border:1px solid #e5e7eb;border-top:1px solid #eef2f7;border-radius:0 0 10px 10px;padding:14px 24px;text-align:center">
      <div style="color:#9ca3af;font-size:11px">Notificación automática del CRM Reformas Ordoñez</div>
    </td></tr>
  </table>
</div>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (!esLlamadaAutorizada(req)) return jsonResponse({ error: 'No autorizado' }, 401);

  try {
    const { visitaId } = await req.json();
    if (!visitaId) return jsonResponse({ error: 'Falta "visitaId" en el body' }, 400);

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: v, error } = await supabase.from('visitas').select('*').eq('id', visitaId).maybeSingle();
    if (error || !v) return jsonResponse({ error: 'Visita no encontrada' }, 404);
    if (!v.fecha_visita || !v.hora_visita) return jsonResponse({ error: 'La visita no tiene fecha/hora definidas' }, 400);

    const { data: empresaRow } = await supabase.from('empresa_config').select('datos').eq('id', 1).maybeSingle();
    const datos = (empresaRow?.datos ?? {}) as { notificaciones_visita_emails_extra?: string[] };
    const extra = Array.isArray(datos.notificaciones_visita_emails_extra) ? datos.notificaciones_visita_emails_extra : [];
    const destinatarios = Array.from(new Set([REMITENTE_BASE, ...extra].filter(Boolean)));

    const hora = String(v.hora_visita).slice(0, 5);
    const asunto = `Visita agendada — ${v.nombre ?? ''} ${v.apellidos ?? ''} · ${v.fecha_visita} ${hora}`.trim();

    const direccionTexto = [v.direccion, v.direccion_extra].filter(Boolean).join(' — ') || 'No indicada';
    const tieneCoords = typeof v.lat === 'number' && typeof v.lng === 'number';
    const oficina = v.pais === 'Francia' ? OFICINA_FR : OFICINA_ES;
    const distanciaTexto = tieneCoords ? await calcularDistancia(oficina, v.lat, v.lng) : null;
    const mapsUrl = v.direccion ? enlaceMaps(v.direccion, v.lat, v.lng) : null;

    const cuerpo = construirHtml({
      fechaTxt: fechaLegible(v.fecha_visita),
      hora,
      nombreCliente: `${v.nombre ?? ''} ${v.apellidos ?? ''}`.trim(),
      telefono: v.telefono || 'No indicado',
      email: v.email || 'No indicado',
      idioma: v.idioma || 'No indicado',
      direccionTexto,
      mapsUrl,
      distanciaTexto,
      tipo: v.tipo || 'Sin especificar',
      descripcion: v.descripcion || 'Sin descripción',
      zonaTexto: `${v.zona ?? ''} · ${v.pais ?? ''}`,
      empleado: v.empleado || 'Sin asignar',
    });

    const token = await obtenerAccessToken(supabase);

    const mensajeMime = [
      `From: ${REMITENTE_BASE}`,
      `To: ${destinatarios.join(', ')}`,
      `Subject: ${codificarAsunto(asunto)}`,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset="UTF-8"',
      '',
      cuerpo,
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

    return jsonResponse({ ok: true, destinatarios });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err instanceof Error ? err.message : err) }, 500);
  }
});
