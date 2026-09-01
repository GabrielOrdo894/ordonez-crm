import { supabase } from './supabase';

const CLIENT_ID = import.meta.env.VITE_GCAL_CLIENT_ID;

// Desde el 2026-08-05 el scope de Calendar y el de Gmail se piden por separado, con dos
// conexiones OAuth independientes (dos refresh_token en `google_config`: `refresh_token` para
// Calendar, `refresh_token_gmail` para Gmail) — antes era un único refresh_token combinado, lo
// que hacía que el access_token que el navegador recibe para crear eventos de Calendar
// (Edge Function `google-token`) también sirviera para leer/enviar Gmail, mucho más privilegio
// del que ese uso necesita. La Edge Function `google-token` (la única que expone el token al
// navegador) usa `refresh_token` — por eso ahora ese token solo lleva scope de Calendar.
// `revisar-gmail`/`notificar-visita` (server-side, nunca exponen el token) usan
// `refresh_token_gmail`, con fallback al `refresh_token` combinado antiguo mientras no se haya
// reconectado Gmail por separado.
const SCOPE_CALENDAR = 'https://www.googleapis.com/auth/calendar.events';
const SCOPE_GMAIL = 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send';

// Token de acceso compartido, renovado en segundo plano vía la Edge Function
// `google-token` a partir del refresh_token guardado en la tabla `google_config`.
// Ver docs/tecnico/google-apis.md — flujo de autorización persistente.
let tokenEnMemoria: { access_token: string; expires_at: number } | null = null;

function iniciarConexionGoogle(purpose: 'calendar' | 'gmail', scope: string, volverA: string) {
  const redirectUri = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-oauth-callback`;
  const state = new URLSearchParams({ purpose, volverA: `${window.location.origin}${volverA}` }).toString();
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    scope,
    state,
  });
  window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export function iniciarConexionGoogleCalendar(volverA: string = window.location.pathname) {
  iniciarConexionGoogle('calendar', SCOPE_CALENDAR, volverA);
}

export function iniciarConexionGmail(volverA: string = window.location.pathname) {
  iniciarConexionGoogle('gmail', SCOPE_GMAIL, volverA);
}

async function obtenerAccessToken(forzarRenovacion = false): Promise<string> {
  if (!forzarRenovacion && tokenEnMemoria && Date.now() < tokenEnMemoria.expires_at - 30_000) {
    return tokenEnMemoria.access_token;
  }
  const { data, error } = await supabase.functions.invoke('google-token');
  if (error) {
    // google-token ahora devuelve status codes reales (401/409/500/502) en vez de siempre 200
    // (bug real corregido 2026-08-18, arregla la observabilidad en el dashboard de Supabase) —
    // supabase-js deja error.message genérico en ese caso, hay que leer el mensaje real del body.
    const cuerpo = await (error as { context?: Response }).context?.json?.().catch(() => null);
    throw new Error(cuerpo?.error ?? 'No se pudo contactar con Google Calendar');
  }
  if (!data?.access_token) {
    throw new Error(data?.error ?? 'Google Calendar no está conectado. Pide a un administrador que lo conecte desde Configuración.');
  }
  tokenEnMemoria = { access_token: data.access_token, expires_at: Date.now() + (data.expires_in ?? 3600) * 1000 };
  return tokenEnMemoria.access_token;
}

export type EventoDelDia = { inicio: string; fin: string; titulo: string };

function horaLocal(dateTime: string) {
  // Los eventos se crean con timeZone: 'Europe/Paris' (construirEventoPayload). Usar
  // d.getHours()/d.getMinutes() aquí mostraba la hora según el huso horario del dispositivo
  // que ejecuta el navegador, no la hora real de la visita, si ese huso no era Europe/Paris.
  return new Date(dateTime).toLocaleTimeString('es', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Europe/Paris',
  });
}

export async function listarEventosDelMes(desde: Date, hasta: Date): Promise<Record<string, EventoDelDia[]>> {
  let token = await obtenerAccessToken();

  const params = new URLSearchParams({
    timeMin: desde.toISOString(),
    timeMax: hasta.toISOString(),
    singleEvents: 'true',
    maxResults: '250',
  });

  let res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 401) {
    token = await obtenerAccessToken(true);
    res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }
  if (!res.ok) throw new Error('No se pudo consultar Google Calendar');

  const data = await res.json();
  const porDia: Record<string, EventoDelDia[]> = {};
  for (const evento of data.items ?? []) {
    const inicioRaw = evento.start?.dateTime ?? evento.start?.date;
    const finRaw = evento.end?.dateTime ?? evento.end?.date;
    if (!inicioRaw) continue;
    const fecha = inicioRaw.slice(0, 10);
    const esDiaCompleto = !evento.start?.dateTime;
    porDia[fecha] = porDia[fecha] ?? [];
    porDia[fecha].push({
      inicio: esDiaCompleto ? 'Todo el día' : horaLocal(inicioRaw),
      fin: esDiaCompleto || !finRaw ? '' : horaLocal(finRaw),
      titulo: evento.summary ?? 'Sin título',
    });
  }
  for (const fecha in porDia) porDia[fecha].sort((a, b) => a.inicio.localeCompare(b.inicio));
  return porDia;
}

type EventoVisita = {
  tipo: string | null;
  nombre: string;
  apellidos: string;
  telefono: string;
  email: string | null;
  idioma: string | null;
  descripcion: string | null;
  direccion: string | null;
  direccion_extra: string | null;
  zona: string | null;
  pais: string | null;
  empleado: string | null;
  estado: string | null;
  fecha_visita: string | null;
  hora_visita: string | null;
  hora_fin_visita?: string | null;
  fotos_previas?: string[] | null;
};

// Calendar no admite adjuntar imágenes/PDFs directamente sin pasar por Google Drive, así que los
// archivos previos del cliente (bucket privado `fotos-visita`, imágenes y PDF) se enlazan como
// URLs firmadas de larga duración (1 año) en la descripción del evento. La descripción de un
// evento de Calendar admite un subconjunto de HTML — un <a href> se ve como texto clicable
// normal en vez del enlace en bruto (2026-09-01, antes salía el CSV entero de la URL firmada,
// ilegible). Cada uno lleva "Imagen N"/"Documento N" como texto del enlace — con varios seguidos
// y sin nombre de archivo legible, no había forma de saber cuál era cuál (bug real corregido
// 2026-09-01, ampliado a PDF el mismo día).
async function urlsFotosPrevias(paths: string[] | null | undefined): Promise<string[]> {
  if (!paths || paths.length === 0) return [];
  const { data, error } = await supabase.storage.from('fotos-visita').createSignedUrls(paths, 60 * 60 * 24 * 365);
  if (error || !data) {
    // Best-effort: si fallan las URLs firmadas, el evento de Calendar se crea igual sin la sección
    // de fotos en vez de bloquear toda la visita — pero se deja rastro en consola (antes se
    // silenciaba del todo, bug real corregido 2026-08-31).
    if (error) console.error('urlsFotosPrevias: no se pudieron firmar las URLs de fotos-visita', error);
    return [];
  }
  let numImagen = 0;
  let numDocumento = 0;
  return paths
    .map((path, i) => {
      const url = data[i]?.signedUrl;
      if (!url) return null;
      const esPdf = path.toLowerCase().endsWith('.pdf');
      const etiqueta = esPdf ? `Documento ${++numDocumento} (abrir PDF)` : `Imagen ${++numImagen} (abrir imagen)`;
      return `<a href="${url}">${etiqueta}</a>`;
    })
    .filter((linea): linea is string => !!linea);
}

function horaFinDefecto(hora: string) {
  const [h, m] = hora.split(':').map(Number);
  const fin = new Date(2000, 0, 1, h, m);
  fin.setHours(fin.getHours() + 1);
  return `${String(fin.getHours()).padStart(2, '0')}:${String(fin.getMinutes()).padStart(2, '0')}`;
}

// Recordatorios de cada visita: un día antes, y ese mismo día a las 8:00 — en vez del
// recordatorio por defecto de Google Calendar (media hora antes). El segundo se calcula como
// minutos-antes-del-evento porque la API de Calendar no admite una hora de reloj fija.
function recordatoriosVisita(hora: string) {
  const [h, m] = hora.split(':').map(Number);
  const minutosDesdeMedianoche = h * 60 + m;
  const minutosHasta8am = minutosDesdeMedianoche - 8 * 60;
  const overrides = [{ method: 'email' as const, minutes: 24 * 60 }];
  if (minutosHasta8am > 0) overrides.push({ method: 'email' as const, minutes: minutosHasta8am });
  return { useDefault: false, overrides };
}

// Payload compartido entre crear y actualizar — antes solo existía para crear, así que reprogramar
// una visita que ya tenía evento (fecha, hora o dirección distintas) dejaba el Calendar con los
// datos viejos y el equipo podía llegar al sitio o a la hora equivocada (mejora real, auditoría de
// Visitas 2026-08-18).
function construirEventoPayload(v: EventoVisita, hora: string, fotosUrls: string[] = []) {
  return {
    summary: `Visita Tecnica - ${v.tipo ?? 'Sin especificar'}`,
    location: v.direccion ?? '',
    description: [
      'CLIENTE',
      `Nombre: ${v.nombre} ${v.apellidos}`,
      `Tel: ${v.telefono}`,
      `Email: ${v.email || 'No indicado'}`,
      `Idioma: ${v.idioma || 'No indicado'}`,
      `Dirección: ${[v.direccion, v.direccion_extra].filter(Boolean).join(' — ') || 'No indicada'}`,
      `Zona: ${v.zona ?? ''} · ${v.pais ?? ''}`,
      '',
      'TRABAJO',
      `Tipo: ${v.tipo ?? 'Sin especificar'}`,
      `Descripción: ${v.descripcion || 'Sin descripción'}`,
      '',
      `Asignado: ${v.empleado ?? 'Sin asignar'}`,
      ...(fotosUrls.length > 0 ? ['', 'FOTOS Y DOCUMENTOS PREVIOS DEL CLIENTE', ...fotosUrls] : []),
    ].join('\n'),
    start: { dateTime: `${v.fecha_visita}T${hora}:00`, timeZone: 'Europe/Paris' },
    end: { dateTime: `${v.fecha_visita}T${(v.hora_fin_visita?.slice(0, 5)) || horaFinDefecto(hora)}:00`, timeZone: 'Europe/Paris' },
    colorId: v.estado === 'Realizada' ? '10' : v.estado === 'Cancelada' ? '8' : '5',
    reminders: recordatoriosVisita(hora),
  };
}

export async function crearEventoVisita(v: EventoVisita): Promise<string | null> {
  if (!v.fecha_visita || !v.hora_visita) return null;
  const token = await obtenerAccessToken();

  // Supabase/PostgREST devuelve las columnas `time` como "HH:MM:SS" — hay que recortar
  // los segundos antes de componer el dateTime ISO, si no la API de Google la rechaza.
  const hora = v.hora_visita.slice(0, 5);
  const fotosUrls = await urlsFotosPrevias(v.fotos_previas);
  const evento = construirEventoPayload(v, hora, fotosUrls);

  const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(evento),
  });

  if (!res.ok) {
    const detalle = await res.text().catch(() => '');
    throw new Error(`No se pudo crear el evento en Google Calendar (${res.status}): ${detalle}`);
  }
  const data = await res.json();
  return data.id ?? null;
}

// Actualiza un evento ya existente (reprogramación) — mismo payload que crearEventoVisita, PATCH
// en vez de POST. Si el evento ya no existe en Google (borrado a mano), 404/410 se trata como
// "no hay nada que actualizar", no como error — igual que ya hace eliminarEventoVisita.
export async function actualizarEventoVisita(eventId: string, v: EventoVisita): Promise<void> {
  if (!v.fecha_visita || !v.hora_visita) return;
  let token = await obtenerAccessToken();
  const hora = v.hora_visita.slice(0, 5);
  const fotosUrls = await urlsFotosPrevias(v.fotos_previas);
  const evento = construirEventoPayload(v, hora, fotosUrls);

  const hacerPatch = (t: string) =>
    fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(evento),
    });

  let res = await hacerPatch(token);
  if (res.status === 401) {
    token = await obtenerAccessToken(true);
    res = await hacerPatch(token);
  }
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    const detalle = await res.text().catch(() => '');
    throw new Error(`No se pudo actualizar el evento en Google Calendar (${res.status}): ${detalle}`);
  }
}

// Borra el evento de una visita cancelada — 404/410 significan que ya no existe (borrado a mano
// por Gabriel, por ejemplo), no es un error real, así que se ignoran igual que un éxito.
export async function eliminarEventoVisita(eventId: string): Promise<void> {
  let token = await obtenerAccessToken();

  let res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 401) {
    token = await obtenerAccessToken(true);
    res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
  }
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    const detalle = await res.text().catch(() => '');
    throw new Error(`No se pudo borrar el evento en Google Calendar (${res.status}): ${detalle}`);
  }
}
