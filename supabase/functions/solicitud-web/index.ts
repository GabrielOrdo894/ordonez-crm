// Edge Function: solicitud-web
//
// Recibe el formulario por pasos de ordonezfachadas.com (2026-10-02) y el asistente web de
// ordonezrenov.com (2026-10-14, sustituye a Landbot) y los convierte en una solicitud del CRM
// (`solicitudes`, fuente `ordonezfachadas` o `asistente_web_es`/`asistente_web_fr`) + evento
// `solicitud_entrada` del embudo + aviso por email a reformasordonezeus@gmail.com.
//
// Pública a propósito (verify_jwt: false, desplegar con --no-verify-jwt): la llama un formulario
// web sin sesión. Defensas: CORS solo para los dos dominios, campo trampa `web` que un humano
// nunca rellena, validación de longitudes y un envío por teléfono cada 10 minutos.
//
// costabath.com (2026-10-20) usa el mismo formulario que Fachadas, con fuente `costabath`. Las dos webs
// filiales mandan `version` (versión de plantilla, son webs de experimento) → solicitudes.version_plantilla.
// ordonezstudio.com (2026-10-27, estudio de arquitectura de Francisco Ordoñez) manda el formulario de contacto de
// su portada (tipo de proyecto, nombre, teléfono, email y descripción; sin municipio ni plazo), fuente `ordonezstudio`.
//
// Body: { tipo, municipio, plazo, nombre, telefono, email?, descripcion?, idioma, pagina, version?, hueco?, fuente?, web }
// La página de contacto de ordonezrenov.com (2026-11-18) manda fuente `pagina_contacto`, version `contacto-A`/`contacto-B`
// (test A/B) y, en la variante B, el hueco de visita elegido de los que devuelve `huecos-visita`.
// Las entradas de proyecto (plantilla B, 2026-11-19) mandan fuente `pagina_proyecto` y version `proyecto-<slug>`.
// Variante B con hueco y dirección (2026-11-20, decisión de Gabriel): además de la solicitud se crea la visita
// como en VisitaForm.tsx (evento de Calendar + notificar-visita, que manda la confirmación al cliente). Campos
// opcionales nuevos: direccion, direccion_extra, lat, lng, ciudad, pais_direccion ('España' | 'Francia').
// Sin dirección no se crea visita: solo la solicitud, con el aviso de que hay que pedírsela.
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { SMTPClient } from 'https://deno.land/x/denomailer/mod.ts';
import { codificarCabeceraMime, limpiarHtmlCorreo } from '../_shared/correo.ts';
import { esc } from '../_shared/html.ts';
import {
  construirEventoPayload,
  deducirPaisZona,
  dividirNombreCompleto,
  empleadoPorIdioma,
  formatearTelefonoVisual,
  sumarMinutos,
  textoFechaHora,
  tipoVisitaDesdeWeb,
  type EventoVisita,
} from '../_shared/visitaWeb.ts';

const ORIGENES_FACHADAS = ['https://ordonezfachadas.com', 'https://www.ordonezfachadas.com'];
const ORIGENES_RENOV = ['https://ordonezrenov.com', 'https://www.ordonezrenov.com'];
const ORIGENES_COSTABATH = ['https://costabath.com', 'https://www.costabath.com'];
const ORIGENES_STUDIO = ['https://ordonezstudio.com', 'https://www.ordonezstudio.com'];
const ORIGENES = [...ORIGENES_FACHADAS, ...ORIGENES_RENOV, ...ORIGENES_COSTABATH, ...ORIGENES_STUDIO];
const FUENTES_RENOV = ['calculadora_bano', 'calculadora_general', 'pdf_bano_4m2', 'foto_web', 'estimador_plazos', 'pagina_contacto', 'pagina_proyecto'];
const ETIQUETA_FUENTE_RENOV: Record<string, string> = {
  pagina_contacto: 'la página de contacto',
  pagina_proyecto: 'una página de proyecto',
  calculadora_bano: 'la calculadora de baño',
  calculadora_general: 'la calculadora de reformas',
  pdf_bano_4m2: 'el PDF del artículo del baño de 4 m²',
  foto_web: 'el formulario de fotos del blog',
  estimador_plazos: 'el estimador de plazos del blog',
};
const DESTINATARIO = 'reformasordonezeus@gmail.com';
const REMITENTE_ENVIO = Deno.env.get('SMTP_USER') ?? DESTINATARIO;
const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cabecerasCors(req: Request): Record<string, string> {
  const origen = req.headers.get('origin') ?? '';
  return {
    'Access-Control-Allow-Origin': ORIGENES.includes(origen) ? origen : ORIGENES[0],
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

function texto(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

async function enviarAviso(remitente: string, asunto: string, cuerpoHtml: string): Promise<void> {
  const client = new SMTPClient({
    connection: {
      hostname: Deno.env.get('SMTP_HOST')!,
      port: Number(Deno.env.get('SMTP_PORT') ?? '465'),
      tls: true,
      auth: { username: Deno.env.get('SMTP_USER')!, password: Deno.env.get('SMTP_PASS')! },
    },
    // Asunto y nombre del remitente codificados en un preprocesador: ver codificarCabeceraMime.
    client: {
      preprocessors: [
        (mail) => ({
          ...mail,
          subject: codificarCabeceraMime(asunto),
          from: { ...mail.from, name: codificarCabeceraMime(remitente) },
        }),
      ],
    },
  });
  try {
    await client.send({ from: `${remitente} <${REMITENTE_ENVIO}>`, to: [DESTINATARIO], subject: asunto, content: 'auto', html: limpiarHtmlCorreo(cuerpoHtml) });
  } finally {
    await client.close();
  }
}

function numero(v: unknown, min: number, max: number): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

function mensajeError(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'object' && e && 'message' in e) return String((e as { message: unknown }).message);
  return String(e);
}

async function notaSistema(supabase: SupabaseClient, visitaId: string, texto: string): Promise<void> {
  const { error } = await supabase.from('notas_cliente').insert({ visita_id: visitaId, tipo: 'sistema', texto, autor: 'Sistema' });
  if (error) console.error('notas_cliente:', error.message);
}

// Mismo token que la Edge Function google-token: refresh_token de Calendar en google_config.
async function crearEventoCalendar(supabase: SupabaseClient, visita: EventoVisita): Promise<string> {
  const { data: config, error } = await supabase.from('google_config').select('refresh_token').eq('id', 1).maybeSingle();
  if (error) throw new Error(error.message);
  if (!config?.refresh_token) throw new Error('Google Calendar no está conectado');
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
  if (!clientId || !clientSecret) throw new Error('Faltan GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET');

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: config.refresh_token, grant_type: 'refresh_token' }),
  });
  const tokenData = await tokenRes.json().catch(() => ({}));
  if (!tokenRes.ok || !tokenData.access_token) {
    throw new Error(tokenData.error_description ?? 'No se pudo renovar el token de Google Calendar');
  }

  const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenData.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(construirEventoPayload(visita)),
  });
  if (!res.ok) throw new Error(`No se pudo crear el evento en Google Calendar (${res.status}): ${await res.text().catch(() => '')}`);
  const evento = await res.json();
  if (!evento.id) throw new Error('Google Calendar no devolvió el id del evento');
  return evento.id as string;
}

type DatosReserva = {
  solicitudId: string;
  fuente: string;
  fecha: string;
  hora: string;
  nombreCompleto: string;
  telefono: string;
  email: string;
  idioma: 'es' | 'fr';
  tipo: string;
  descripcion: string;
  municipio: string;
  direccion: string;
  direccionExtra: string;
  lat: number | null;
  lng: number | null;
  ciudad: string;
  paisDireccion: string;
};

// Crea la visita del hueco elegido en la web y devuelve las líneas para el aviso interno. Los fallos
// no se propagan: la solicitud ya está guardada y la respuesta al navegador no depende de esto.
async function reservarVisitaWeb(supabase: SupabaseClient, d: DatosReserva): Promise<string[]> {
  // 1. El hueco sigue libre (mismo criterio que huecos-visita).
  const { data: ocupadas, error: errorOcupadas } = await supabase
    .from('visitas')
    .select('id')
    .eq('fecha_visita', d.fecha)
    .eq('hora_visita', `${d.hora}:00`)
    .neq('estado', 'Cancelada')
    .is('eliminado_en', null)
    .limit(1);
  if (errorOcupadas) {
    console.error('Comprobar hueco:', errorOcupadas.message);
    return [`No se ha creado la visita: no se pudo comprobar si el hueco estaba libre (${errorOcupadas.message})`];
  }
  if ((ocupadas ?? []).length > 0) {
    const aviso = 'El hueco elegido ya estaba ocupado, hay que proponerle otro';
    const { data: sol, error: errorLeer } = await supabase.from('solicitudes').select('comentario_cliente').eq('id', d.solicitudId).single();
    if (errorLeer) console.error('Leer comentario:', errorLeer.message);
    else {
      const { error: errorComentario } = await supabase
        .from('solicitudes')
        .update({ comentario_cliente: [sol.comentario_cliente, aviso].filter(Boolean).join('\n') })
        .eq('id', d.solicitudId);
      if (errorComentario) console.error('Comentario hueco ocupado:', errorComentario.message);
    }
    return [aviso];
  }

  // 2. La visita, con los mismos valores que el alta de VisitaForm.tsx.
  const { pais, zona } = deducirPaisZona({ municipio: d.municipio, ciudad: d.ciudad, paisDireccion: d.paisDireccion, idioma: d.idioma });
  const { nombre, apellidos } = dividirNombreCompleto(d.nombreCompleto);
  const nueva = {
    nombre,
    apellidos,
    telefono: formatearTelefonoVisual(d.telefono),
    email: d.email || null,
    idioma: d.idioma === 'fr' ? 'Français' : 'Español',
    contacto: 'Formulario',
    referido_por: null,
    direccion: d.direccion,
    direccion_extra: d.direccionExtra || null,
    lat: d.lat,
    lng: d.lng,
    pais,
    zona,
    tipo: tipoVisitaDesdeWeb(d.tipo),
    descripcion: d.descripcion || null,
    fecha_visita: d.fecha,
    hora_visita: d.hora,
    hora_fin_visita: sumarMinutos(d.hora, 60),
    empleado: empleadoPorIdioma(d.idioma),
    estado: 'Pendiente',
    notas: null,
    fotos_previas: [],
    google_event_id: null,
    estado_pipeline: 'Contacto',
    pipeline_etapa_maxima: 'Contacto',
    proyecto_id: null,
  };
  const { data: visita, error: errorVisita } = await supabase.from('visitas').insert(nueva).select('id').single();
  if (errorVisita) {
    console.error('Crear visita:', errorVisita.message);
    return [`No se pudo crear la visita automáticamente (${errorVisita.message}): hay que darla de alta a mano`];
  }
  const lineas = [`Visita creada automáticamente: ${textoFechaHora(d.fecha, d.hora)}`];

  // 3. Solicitud enlazada y Aceptada (como «Crear visita desde esta solicitud») + etapa visita_agendada.
  const { error: errorEnlace } = await supabase.from('solicitudes').update({ visita_id: visita.id, estado: 'Aceptada' }).eq('id', d.solicitudId);
  if (errorEnlace) {
    console.error('Enlazar solicitud:', errorEnlace.message);
    lineas.push(`No se pudo enlazar la solicitud con la visita: ${errorEnlace.message}`);
  }
  const { error: errorFunnel } = await supabase
    .from('funnel_eventos')
    .insert({ etapa: 'visita_agendada', solicitud_id: d.solicitudId, fuente: d.fuente });
  // 23505: ya existía (índice único por etapa), no es un error.
  if (errorFunnel && errorFunnel.code !== '23505') console.error('funnel visita_agendada:', errorFunnel.message);

  // 4. Nota del sistema.
  await notaSistema(supabase, visita.id, 'Visita reservada por el cliente desde la página de contacto (hueco elegido en la web)');

  // 5. Evento de Calendar. Si falla, la visita se queda y se anota el error.
  try {
    const eventId = await crearEventoCalendar(supabase, nueva);
    const { error: errorEvento } = await supabase.from('visitas').update({ google_event_id: eventId }).eq('id', visita.id);
    if (errorEvento) {
      console.error('Guardar google_event_id:', errorEvento.message);
      await notaSistema(supabase, visita.id, `Evento creado en Google Calendar, pero no se pudo guardar su ID: ${errorEvento.message}`);
      lineas.push('Evento de Calendar creado, pero no se guardó su ID en la visita');
    }
  } catch (e) {
    console.error('Google Calendar:', mensajeError(e));
    await notaSistema(supabase, visita.id, `No se pudo crear el evento de Google Calendar: ${mensajeError(e)}`);
    lineas.push(`No se pudo crear el evento de Google Calendar: ${mensajeError(e)}`);
  }

  // 6. Confirmación al cliente y aviso al equipo: notificar-visita con la service role (esLlamadaAutorizada la acepta).
  try {
    const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/notificar-visita`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ visitaId: visita.id }),
    });
    const r = await res.json().catch(() => ({}));
    if (!res.ok || r?.ok === false) throw new Error(r?.error ?? `HTTP ${res.status}`);
  } catch (e) {
    console.error('notificar-visita:', mensajeError(e));
    await notaSistema(supabase, visita.id, `No se pudo enviar el email de confirmación de la visita: ${mensajeError(e)}`);
    lineas.push(`No se pudo enviar la confirmación de la visita: ${mensajeError(e)}`);
  }
  return lineas;
}

Deno.serve(async (req: Request) => {
  const cors = cabecerasCors(req);
  const responder = (cuerpo: unknown, status = 200) =>
    new Response(JSON.stringify(cuerpo), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return responder({ error: 'Método no permitido' }, 405);
  const origen = req.headers.get('origin') ?? '';
  if (!ORIGENES.includes(origen)) return responder({ error: 'Origen no permitido' }, 403);
  const esRenov = ORIGENES_RENOV.includes(origen);
  const esCostabath = ORIGENES_COSTABATH.includes(origen);
  const esStudio = ORIGENES_STUDIO.includes(origen);

  // JSON normal, o multipart/form-data cuando el formulario de fotos del blog adjunta imágenes (campo `fotos`, máx. 3).
  let body: Record<string, unknown>;
  const fotos: File[] = [];
  if ((req.headers.get('content-type') ?? '').includes('multipart/form-data')) {
    try {
      const fd = await req.formData();
      body = {};
      for (const [k, v] of fd.entries()) {
        if (v instanceof File) { if (k === 'fotos' && fotos.length < 3 && v.size > 0) fotos.push(v); } else body[k] = v;
      }
    } catch {
      return responder({ error: 'Formulario inválido' }, 400);
    }
  } else {
    try {
      body = await req.json();
    } catch {
      return responder({ error: 'JSON inválido' }, 400);
    }
  }

  // Campo trampa: los bots rellenan todos los campos. Se responde OK para no darles pistas.
  if (texto(body.web, 200)) return responder({ ok: true });

  const nombre = texto(body.nombre, 120);
  const telefono = texto(body.telefono, 40);
  const email = texto(body.email, 160);
  const tipo = texto(body.tipo, 40);
  const municipio = texto(body.municipio, 80);
  const plazo = texto(body.plazo, 20);
  const descripcion = texto(body.descripcion, 2000);
  const pagina = texto(body.pagina, 300);
  const idioma = body.idioma === 'fr' ? 'fr' : 'es';
  const version = texto(body.version, 40);
  // Página de contacto (test A/B, 2026-11-18): hueco de visita que el cliente prefiere, «AAAA-MM-DD HH:MM».
  const hueco = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(texto(body.hueco, 16)) ? texto(body.hueco, 16) : '';
  const huecoTexto = hueco
    ? `${new Date(`${hueco.slice(0, 10)}T12:00:00`).toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })}, ${hueco.slice(11)} (a confirmar)`
    : '';
  // Desde ordonezrenov.com también envían las calculadoras, el PDF del blog y los formularios del blog
  // (2026-10-27): mandan su `fuente` en el cuerpo; cualquier otro valor se trata como el asistente web.
  const fuenteRenov = FUENTES_RENOV.includes(texto(body.fuente, 40)) ? texto(body.fuente, 40) : `asistente_web_${idioma}`;
  const fuente = esRenov ? fuenteRenov : esCostabath ? 'costabath' : esStudio ? 'ordonezstudio' : 'ordonezfachadas';
  const origenTexto = esRenov ? (ETIQUETA_FUENTE_RENOV[fuenteRenov] ?? 'el asistente de ordonezrenov.com') : null;
  const marca = esRenov ? 'Reformas Ordoñez' : esCostabath ? 'Costabath' : esStudio ? 'Ordoñez Studio' : 'Ordoñez Fachadas';
  const dominio = esCostabath ? 'costabath.com' : esStudio ? 'ordonezstudio.com' : 'ordonezfachadas.com';
  const digitos = telefono.replace(/\D/g, '');
  // Dirección de la obra (variante B, 2026-11-20): opcional; sin ella no se crea la visita.
  const direccion = texto(body.direccion, 300);
  const direccionExtra = texto(body.direccion_extra, 120);
  const lat = numero(body.lat, -90, 90);
  const lng = numero(body.lng, -180, 180);
  const ciudad = texto(body.ciudad, 120);
  const paisDireccion = ['España', 'Francia'].includes(texto(body.pais_direccion, 20)) ? texto(body.pais_direccion, 20) : '';

  // El PDF del blog solo pide el email: entra como solicitud sin teléfono para no perder el contacto.
  const soloEmail = fuente === 'pdf_bano_4m2';
  if (soloEmail ? !EMAIL_VALIDO.test(email) : !nombre || digitos.length < 9) return responder({ error: soloEmail ? 'Email obligatorio' : 'Nombre y teléfono obligatorios' }, 400);
  if (email && !EMAIL_VALIDO.test(email)) return responder({ error: 'Email no válido' }, 400);

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // Un envío por teléfono cada 10 minutos (doble clic, reenvíos, abuso simple).
  const haceDiezMin = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data: recientes, error: errorRecientes } = await supabase
    .from('solicitudes')
    .select('id, telefono, email')
    .eq('fuente', fuente)
    .gte('created_at', haceDiezMin);
  if (errorRecientes) return responder({ error: errorRecientes.message }, 500);
  const mismoContacto = (s: { telefono: string | null; email?: string | null }) =>
    digitos ? (s.telefono ?? '').replace(/\D/g, '').slice(-9) === digitos.slice(-9) : (s.email ?? '').toLowerCase() === email.toLowerCase();
  if ((recientes ?? []).some(mismoContacto)) {
    return responder({ ok: true, duplicada: true });
  }

  const etiquetaPlazo: Record<string, string> = { urgente: 'Urgente', urgent: 'Urgente', meses: 'Próximos meses', mois: 'Próximos meses', info: 'Solo se informa' };
  // El formulario de Studio no pregunta municipio ni plazo: no se añaden líneas «sin indicar» al comentario.
  // La variante B de la página de contacto tampoco (2026-11-20): municipio = ciudad de la dirección o vacío.
  const sinMunicipioNiPlazo = esStudio || (fuente === 'pagina_contacto' && version === 'contacto-B');
  const comentario = [
    descripcion,
    sinMunicipioNiPlazo && !municipio ? '' : `Municipio: ${municipio || 'sin indicar'}`,
    sinMunicipioNiPlazo && !plazo ? '' : `Plazo: ${etiquetaPlazo[plazo] ?? 'sin indicar'}`,
    huecoTexto ? `Visita preferida: ${huecoTexto}` : '',
  ].filter(Boolean).join('\n');

  const { data: fila, error } = await supabase
    .from('solicitudes')
    .insert({
      fuente,
      nombre,
      telefono,
      email: email || null,
      tipo_reforma: tipo || null,
      comentario_cliente: comentario,
      pagina_origen: pagina || null,
      idioma,
      estado: 'Nueva',
      // Quien termina una calculadora pide un orientativo; el resto de formularios piden visita.
      tipo_solicitud: fuente.startsWith('calculadora') ? 'presupuesto_orientativo' : 'visita',
      version_plantilla: version || null,
    })
    .select('id')
    .single();
  if (error) return responder({ error: error.message }, 500);

  const { error: errorFunnel } = await supabase
    .from('funnel_eventos')
    .insert({ etapa: 'solicitud_entrada', solicitud_id: fila.id, fuente });
  if (errorFunnel) console.error('funnel_eventos:', errorFunnel.message);

  // Fotos del formulario del blog: al bucket privado `solicitudes-fotos` (carpeta = id de la solicitud) y
  // enlaces firmados de un año en el comentario, para verlas desde el CRM. Un fallo no invalida la solicitud.
  const enlacesFotos: string[] = [];
  if (fotos.length) {
    for (const foto of fotos) {
      if (!/^image\/(jpeg|png|webp)$/.test(foto.type) || foto.size > 8 * 1024 * 1024) continue;
      const ext = foto.type === 'image/png' ? 'png' : foto.type === 'image/webp' ? 'webp' : 'jpg';
      const ruta = `${fila.id}/${crypto.randomUUID()}.${ext}`;
      const { error: errorSubida } = await supabase.storage.from('solicitudes-fotos').upload(ruta, foto, { contentType: foto.type });
      if (errorSubida) { console.error('foto:', errorSubida.message); continue; }
      const { data: firmada } = await supabase.storage.from('solicitudes-fotos').createSignedUrl(ruta, 60 * 60 * 24 * 365);
      if (firmada?.signedUrl) enlacesFotos.push(firmada.signedUrl);
    }
    const notaFotos = enlacesFotos.length
      ? `Fotos (${enlacesFotos.length}):\n${enlacesFotos.join('\n')}`
      : `Fotos: el cliente adjuntó ${fotos.length}, pero no se pudieron guardar (formato o tamaño).`;
    const { error: errorFotos } = await supabase.from('solicitudes').update({ comentario_cliente: `${comentario}\n\n${notaFotos}` }).eq('id', fila.id);
    if (errorFotos) console.error('comentario con fotos:', errorFotos.message);
  }

  // Variante B de la página de contacto con hueco: visita reservada al momento si hay dirección.
  let lineasVisita: string[] = [];
  if (fuente === 'pagina_contacto' && version === 'contacto-B' && hueco) {
    if (!direccion) lineasVisita = ['Sin dirección: no se ha creado la visita, hay que pedírsela'];
    else {
      try {
        lineasVisita = await reservarVisitaWeb(supabase, {
          solicitudId: fila.id, fuente, fecha: hueco.slice(0, 10), hora: hueco.slice(11), nombreCompleto: nombre, telefono, email,
          idioma, tipo, descripcion, municipio, direccion, direccionExtra, lat, lng, ciudad, paisDireccion,
        });
      } catch (e) {
        console.error('reservarVisitaWeb:', mensajeError(e));
        lineasVisita = [`No se pudo crear la visita automáticamente: ${mensajeError(e)}`];
      }
    }
  }

  // El aviso por email nunca hace fallar la solicitud: ya está guardada en el CRM.
  try {
    const urgente = plazo === 'urgente' || plazo === 'urgent';
    const filas = [
      ['Trabajo', tipo], ['Municipio', municipio], ['Plazo', etiquetaPlazo[plazo] ?? ''], ['Nombre', nombre],
      ['Teléfono', telefono], ['Email', email], ['Idioma', idioma === 'fr' ? 'Francés' : 'Español'], ['Página', pagina], ['Plantilla', version], ['Visita preferida', huecoTexto],
      ['Dirección', [direccion, direccionExtra].filter(Boolean).join(' — ')], ...lineasVisita.map((l) => ['Visita', l]),
    ].filter(([, v]) => v).map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#666">${k}</td><td style="padding:4px 0"><b>${esc(v)}</b></td></tr>`).join('');
    await enviarAviso(
      marca,
      `${urgente ? 'URGENTE · ' : ''}Nueva solicitud ${esRenov ? (fuenteRenov.startsWith('asistente') ? 'web' : `· ${origenTexto}`) : marca} · ${tipo || 'Sin tipo'}${sinMunicipioNiPlazo && !municipio ? '' : ` · ${municipio || 'sin municipio'}`}`,
      `<p>Ha entrado una solicitud desde ${esRenov ? origenTexto : dominio}. Ya está en Solicitudes del CRM.</p>
<table style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px">${filas}</table>
${descripcion ? `<p style="margin-top:12px"><b>Descripción:</b><br>${esc(descripcion).replace(/\n/g, '<br>')}</p>` : ''}
${enlacesFotos.length ? `<p style="margin-top:12px"><b>Fotos:</b><br>${enlacesFotos.map((u, i) => `<a href="${esc(u)}">Foto ${i + 1}</a>`).join('<br>')}</p>` : ''}`,
    );
  } catch (e) {
    console.error('Aviso por email:', e instanceof Error ? e.message : String(e));
  }

  // El asistente reenvía el id a asistente-eventos para enlazar su ruta con la solicitud.
  return responder({ ok: true, id: fila.id });
});
