// Edge Function: revisar-gmail
//
// Escanea el Gmail de reformasordonezeus@gmail.com (refresh_token_gmail de `google_config`,
// separado del de Calendar desde 2026-08-05 — ver src/lib/googleCalendar.ts) para:
//   1. Detectar solicitudes de presupuesto nuevas (Landbot / formulario web WordPress de
//      ordonezrenov.com / formulario de contacto EmailJS, asunto fijo "New message from")
//      e insertarlas en la tabla `solicitudes`.
//   2. Comprobar si clientes con presupuesto en estado `Pendiente` han respondido, y
//      actualizar `presupuestos.ultima_respuesta_cliente_resumen` / `_fecha`.
//   3. Comprobar si clientes han respondido a una solicitud YA ENVIADA que todavía no tiene
//      presupuesto vinculado, y devolverla a estado `Nueva` con el resumen de la respuesta.
//   4. Detectar conversaciones directas (autoenvíos manuales de Gabriel y clientes que
//      escriben directo, ver reference_fuentes_solicitudes_web) que aún no están vinculadas
//      a ninguna solicitud/presupuesto: la regla de Gabriel es que si él escribe o responde
//      a alguien y esa persona responde en el mismo hilo, es prácticamente seguro que sea un
//      cliente real — se crea una solicitud nueva (fuente `email_directo`) para que aparezca
//      en el CRM y se triage a mano.
//
// Ver docs/bloque6-solicitudes-seguimiento.md y docs/directrices-respuesta-clientes.md.
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

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

type GmailHeader = { name: string; value: string };
type GmailMessagePart = {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailMessagePart[];
  headers?: GmailHeader[];
};
type GmailMessage = {
  id: string;
  threadId: string;
  internalDate: string;
  snippet?: string;
  payload?: GmailMessagePart;
};

const LANDBOT_SENDER = '8c3d549c-46cd-4773-9027-31b23bc30704@landbot.email';
const WORDPRESS_SENDER = 'noreply@ordonezrenov.com';
const NUESTRO_EMAIL = 'reformasordonezeus@gmail.com';
// Formulario de contacto de ordonezrenov.com montado con EmailJS: se envía a sí mismo
// (from y to son NUESTRO_EMAIL) con este asunto fijo siempre igual — no es un autoenvío
// manual de Gabriel, es automático, así que se puede parsear igual que Landbot/WordPress.
const EMAILJS_ASUNTO = 'new message from';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function obtenerAccessToken(): Promise<string> {
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
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
    throw new Error(`No se pudo renovar el token de Google (¿falta el scope gmail.readonly? conectar Gmail en Configuración): ${data.error_description ?? data.error}`);
  }
  return data.access_token;
}

async function gmailFetch<T = unknown>(path: string, token: string): Promise<T> {
  const res = await fetch(`https://www.googleapis.com/gmail/v1/users/me/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const detalle = await res.text().catch(() => '');
    throw new Error(`Gmail API ${path} → ${res.status}: ${detalle}`);
  }
  return res.json();
}

function base64UrlDecode(data: string): string {
  const normalizado = data.replace(/-/g, '+').replace(/_/g, '/');
  const binario = atob(normalizado);
  const bytes = Uint8Array.from(binario, (c) => c.charCodeAt(0));
  return new TextDecoder('utf-8').decode(bytes);
}

function extraerCuerpo(payload: GmailMessagePart | undefined): string {
  if (!payload) return '';
  if (payload.body?.data) return base64UrlDecode(payload.body.data);
  const partes = payload.parts ?? [];
  const textoPlano = partes.find((p) => p.mimeType === 'text/plain');
  if (textoPlano?.body?.data) return base64UrlDecode(textoPlano.body.data);
  const html = partes.find((p) => p.mimeType === 'text/html');
  if (html?.body?.data) return base64UrlDecode(html.body.data);
  for (const p of partes) {
    const anidado = extraerCuerpo(p);
    if (anidado) return anidado;
  }
  return '';
}

function htmlATexto(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|li|tr|div|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function cabecera(headers: GmailHeader[], nombre: string): string {
  return headers?.find((h) => h.name.toLowerCase() === nombre.toLowerCase())?.value ?? '';
}

function extraerEmail(campoDe: string): string {
  const match = campoDe.match(/<([^>]+)>/);
  return (match ? match[1] : campoDe).trim().toLowerCase();
}

// --- Parsers por formato conocido ---

function parseLandbot(texto: string) {
  const buscar = (etiqueta: string) => {
    const m = texto.match(new RegExp(`${etiqueta}:\\s*\\n?\\s*(.+)`, 'i'));
    return m ? m[1].trim() : null;
  };
  return {
    tipo_reforma: buscar('Tipo de reforma'),
    telefono: buscar('Teléfono'),
    email: buscar('Email'),
    comentario_cliente: buscar('Comentario del cliente'),
    nombre: null as string | null,
    pagina_origen: null as string | null,
  };
}

// OJO con dos bugs reales vistos en producción (solicitud de "isabel", 2026-07-29):
// 1. Un `.+` normal no cruza saltos de línea — si la Descripción ocupa varias líneas
//    (caso normal, el cliente escribe un párrafo) solo se guardaba la primera línea
//    ("Buenos días," y nada más). Descripción necesita su propio regex que capture
//    todo hasta el siguiente campo conocido ("Enviado desde:") o el final del texto.
// 2. `\s*` es un `\s` cualquiera, incluye saltos de línea — si un campo de una sola
//    línea (p.ej. Teléfono) viene vacío en el formulario, `\s*(.+)` se comía la línea
//    en blanco y capturaba la línea siguiente entera (el teléfono se guardó como
//    "Email: holaiza@gmail.com"). `buscarLinea` restringe la captura a la misma línea.
function parseWordPress(texto: string) {
  const buscarLinea = (etiqueta: string) => {
    const m = texto.match(new RegExp(`^[ \\t]*${etiqueta}:[ \\t]*(.*)$`, 'im'));
    const valor = m ? m[1].trim() : '';
    return valor || null;
  };
  const descripcion = texto.match(/Descripci[oó]n:[ \t]*([\s\S]*?)(?=\n[ \t]*Enviado desde:|$)/i);
  const origen = texto.match(/Enviado desde:\s*(\S+)/i);
  return {
    nombre: buscarLinea('Nombre'),
    telefono: buscarLinea('Teléfono'),
    email: buscarLinea('Email'),
    tipo_reforma: buscarLinea('Tipo de reforma'),
    comentario_cliente: descripcion ? descripcion[1].trim() || null : null,
    pagina_origen: origen ? origen[1].trim() : null,
  };
}

// Formulario de contacto EmailJS de ordonezrenov.com (asunto fijo "New message from") — se envía
// a sí mismo, con formato de texto plano fijo (Gmail entrega el text/plain, no el HTML). Igual
// que parseWordPress, el campo "Detalles del proyecto" puede ser multilínea.
function parseFormularioEmailJS(texto: string) {
  const buscarLinea = (etiqueta: string) => {
    const m = texto.match(new RegExp(`^[ \\t]*${etiqueta}:[ \\t]*(.*)$`, 'im'));
    const valor = m ? m[1].replace(/\(opcional\)/i, '').trim() : '';
    return valor || null;
  };
  const detalle = texto.match(/Detalles del proyecto:[ \t]*\r?\n*([\s\S]*?)(?=\n-{5,}|\nEste mensaje fue enviado|$)/i);
  const presupuestoEstimado = buscarLinea('Presupuesto estimado');
  const descripcion = detalle ? detalle[1].trim() : null;
  return {
    nombre: null as string | null,
    telefono: buscarLinea('Teléfono'),
    email: buscarLinea('Cliente'),
    tipo_reforma: null as string | null,
    comentario_cliente:
      presupuestoEstimado && descripcion
        ? `Presupuesto estimado indicado por el cliente: ${presupuestoEstimado}\n\n${descripcion}`
        : descripcion,
    pagina_origen: null as string | null,
  };
}

async function ingerirSolicitudesNuevas(token: string, supabase: SupabaseClient, log: string[]) {
  const query = `(from:${LANDBOT_SENDER} OR from:${WORDPRESS_SENDER} OR (from:${NUESTRO_EMAIL} to:${NUESTRO_EMAIL} subject:"${EMAILJS_ASUNTO}")) newer_than:7d`;
  const listado = await gmailFetch<{ messages?: { id: string; threadId: string }[] }>(
    `messages?q=${encodeURIComponent(query)}&maxResults=30`,
    token,
  );
  const mensajes = listado.messages ?? [];
  log.push(`Solicitudes: ${mensajes.length} mensajes candidatos (últimos 7 días).`);

  let insertadas = 0;
  for (const { id, threadId } of mensajes) {
    const msg = await gmailFetch<GmailMessage>(`messages/${id}?format=full`, token);
    const headers = msg.payload?.headers ?? [];
    const de = extraerEmail(cabecera(headers, 'From'));
    const asunto = cabecera(headers, 'Subject');
    const cuerpoRaw = extraerCuerpo(msg.payload);
    const texto = htmlATexto(cuerpoRaw);

    let datos;
    let fuente: string;
    if (de === LANDBOT_SENDER) {
      fuente = 'landbot';
      datos = parseLandbot(texto);
    } else if (de === WORDPRESS_SENDER) {
      fuente = 'web_wordpress';
      datos = parseWordPress(texto);
    } else if (de === NUESTRO_EMAIL && asunto.trim().toLowerCase().startsWith(EMAILJS_ASUNTO)) {
      fuente = 'web_emailjs';
      datos = parseFormularioEmailJS(texto);
    } else {
      continue;
    }

    const { data: filaInsertada, error } = await supabase
      .from('solicitudes')
      .upsert(
        {
          gmail_message_id: id,
          gmail_thread_id: threadId,
          fuente,
          nombre: datos.nombre,
          email: datos.email,
          telefono: datos.telefono,
          tipo_reforma: datos.tipo_reforma,
          comentario_cliente: datos.comentario_cliente,
          pagina_origen: datos.pagina_origen,
          estado: 'Nueva',
        },
        { onConflict: 'gmail_message_id', ignoreDuplicates: true }
      )
      .select();

    if (error) {
      log.push(`Error insertando solicitud (asunto "${asunto}"): ${error.message}`);
      continue;
    }
    // ignoreDuplicates hace que un conflicto no devuelva fila — filaInsertada solo trae algo
    // cuando el insert fue real. `count` de supabase-js viene null si no se pide `{ count: 'exact' }`
    // explícitamente, así que `count !== 0` daba siempre true y contaba duplicados como nuevos.
    const nuevaId = filaInsertada?.[0]?.id;
    if (nuevaId) {
      insertadas++;
      const { error: errorFunnel } = await supabase
        .from('funnel_eventos')
        .insert({ etapa: 'solicitud_entrada', solicitud_id: nuevaId, fuente });
      if (errorFunnel) {
        log.push(`Error registrando funnel_eventos para solicitud ${nuevaId}: ${errorFunnel.message}`);
      }
    }
  }
  log.push(`Solicitudes nuevas insertadas: ${insertadas}.`);
  return insertadas;
}

// Los clientes de email meten la respuesta anterior citada debajo de la nueva ("El ... escribió:",
// "Le ... a écrit :", "On ... wrote:", "-----Mensaje original-----", cabeceras "De :/Envoyé :/À :"
// del propio Gmail/Outlook francés, líneas con "> ") — como cada mensaje del hilo ya se guarda por
// separado, esa cita es pura redundancia (y duplicaba nuestro propio mensaje entero). Se corta en
// la primera línea que la delata, quedándose solo con el texto nuevo de ese mensaje.
// OJO: "De :"/"Envoyé :" llevan espacio antes de los dos puntos en el formato francés — el patrón
// tiene que admitirlo o no corta nada (bug real visto con la respuesta de Vinatier).
function quitarCitas(texto: string): string {
  const patrones = [
    /^el .+ escribi[oó]:?\s*$/im,
    /^le .+ a écrit\s*:?\s*$/im,
    /^on .+ wrote:?\s*$/im,
    /^-{2,}\s*mensaje original\s*-{2,}/im,
    /^-{2,}\s*original message\s*-{2,}/im,
    /^-{3,}\s*$/m,
    /^de\s*:\s*.+$/im,
    /^from\s*:\s*.+$/im,
    /^envoy[ée]\s*:/im,
    /^enviado\s*:/im,
    /^sent\s*:/im,
    /^>/m,
  ];
  let corte = texto.length;
  for (const patron of patrones) {
    const m = texto.match(patron);
    if (m && m.index !== undefined && m.index < corte) corte = m.index;
  }
  return texto.slice(0, corte).trim();
}

// Nuestros propios envíos siempre usan la plantilla con cabecera (logo + "Reformas integrales •
// Albañileria & Aislamientos") y pie (datos de contacto + redes) — ver
// modificaciones/plantilla de mensajeria por email de la empresa de refomas ordoñez.png. Gabriel
// pidió no mostrar nunca esa cabecera/pie, solo el cuerpo real: desde el saludo hasta "Cordialement".
function limpiarPlantillaPropia(texto: string): string {
  let t = texto;
  const cabecera = t.match(/^.*reformas integrales.*$/im);
  if (cabecera && cabecera.index !== undefined) {
    t = t.slice(cabecera.index + cabecera[0].length);
  }
  // Admite variantes como "Bien cordialement," o "Cordialement !" — la línea entera se corta,
  // no solo si la palabra está sola (bug real: "Bien cordialement," no cortaba nada).
  const cierre = t.match(/^.*\b(cordialement|cordialmente|atentamente)\b.*$/im);
  if (cierre && cierre.index !== undefined) {
    t = t.slice(0, cierre.index + cierre[0].length);
  }
  return t.trim();
}

type MensajeConversacion = { de: string; fecha: string; texto: string };

async function extraerConversacion(threadId: string, token: string): Promise<MensajeConversacion[]> {
  const hilo = await gmailFetch<{ messages?: GmailMessage[] }>(`threads/${threadId}?format=full`, token);
  const mensajes = hilo.messages ?? [];
  return mensajes.map((msg) => {
    const headers = msg.payload?.headers ?? [];
    const de = extraerEmail(cabecera(headers, 'From'));
    let texto = quitarCitas(htmlATexto(extraerCuerpo(msg.payload)));
    if (de === NUESTRO_EMAIL) texto = limpiarPlantillaPropia(texto);
    return {
      de,
      fecha: new Date(Number(msg.internalDate)).toISOString(),
      // Tope generoso por mensaje — evita que un hilo largo dispare el tamaño del prompt de la IA.
      texto: (texto || '(mensaje vacío)').slice(0, 3000),
    };
  });
}

async function revisarRespuestasPresupuestos(token: string, supabase: SupabaseClient, log: string[]) {
  // OJO: antes solo se comprobaban los presupuestos `Pendiente` — en cuanto Gabriel marcaba
  // uno como `Aceptado` dejaba de revisarse para siempre, así que una respuesta nueva del
  // cliente DESPUÉS de aceptar nunca se detectaba (bug real, 2026-07-29). `Aceptado` entra
  // también en el barrido; `Borrador` (nunca enviado) y `Rechazado` (cerrado) se quedan fuera.
  const { data: presupuestos, error } = await supabase
    .from('presupuestos')
    .select(
      'id, numero, cliente_email, fecha_emision, ultima_respuesta_cliente_fecha, gmail_thread_id, mensaje_seguimiento_enviado, mensaje_seguimiento_enviado_en'
    )
    .in('estado', ['Pendiente', 'Aceptado'])
    .not('cliente_email', 'is', null)
    .is('eliminado_en', null);

  if (error) {
    log.push(`Error leyendo presupuestos Pendiente: ${error.message}`);
    return 0;
  }
  log.push(`Presupuestos Pendiente con email a revisar: ${presupuestos.length}.`);

  let actualizados = 0;
  for (const p of presupuestos) {
    let threadId: string | null = p.gmail_thread_id;

    // Primera vez que se revisa este presupuesto — hay que localizar el hilo por búsqueda.
    // A partir de aquí, con el thread_id guardado, se lee el hilo directamente y se trae la
    // conversación completa (no solo el último mensaje).
    if (!threadId) {
      const query = `${p.cliente_email} newer_than:60d`;
      const listado = await gmailFetch<{ messages?: { id: string; threadId: string }[] }>(
        `messages?q=${encodeURIComponent(query)}&maxResults=10`,
        token,
      );
      const mensajes = listado.messages ?? [];
      if (mensajes.length === 0) continue;
      threadId = mensajes[0].threadId;
    }

    let conversacion: MensajeConversacion[];
    try {
      conversacion = await extraerConversacion(threadId!, token);
    } catch (err) {
      log.push(`Error leyendo hilo del presupuesto ${p.numero}: ${String(err)}`);
      continue;
    }
    if (conversacion.length === 0) continue;

    // OJO: el último mensaje del HILO no siempre es del cliente (puede ser nuestra propia
    // respuesta) — el resumen tiene que reflejar siempre lo último que dijo EL CLIENTE, si no
    // se pisa con nuestro propio texto en cuanto contestamos. Se busca desde el final.
    const ultimoDelCliente = [...conversacion].reverse().find((m) => m.de === p.cliente_email.toLowerCase());
    const esRespuestaNuevaDelCliente =
      !!ultimoDelCliente &&
      (!p.ultima_respuesta_cliente_fecha || new Date(ultimoDelCliente.fecha).getTime() > new Date(p.ultima_respuesta_cliente_fecha).getTime());

    // El resumen se refresca siempre que haya mensaje del cliente en el hilo (es solo texto de
    // apoyo para la lista, sale del mismo `conversacion` ya limpio) — pero fecha/revisada solo
    // cambian si de verdad hay mensaje nuevo, para no reactivar el aviso de "sin leer" en cada
    // pasada de revisar-gmail.
    const patch: Record<string, unknown> = { gmail_thread_id: threadId, conversacion };
    if (ultimoDelCliente) {
      patch.ultima_respuesta_cliente_resumen = ultimoDelCliente.texto.slice(0, 500);
    }
    if (esRespuestaNuevaDelCliente) {
      patch.ultima_respuesta_cliente_fecha = ultimoDelCliente!.fecha;
      patch.ultima_respuesta_revisada = false;

      // Si ya había un seguimiento marcado "enviado" pero el cliente ha vuelto a escribir
      // DESPUÉS de ese envío, el mensaje enviado ya no responde a lo último que dice el
      // cliente — se reabre igual que el botón manual "Volver a Nueva" (si no,
      // `estadoSeguimiento()` en el frontend sigue leyendo `mensaje_seguimiento_enviado`
      // y la fila se queda en "Enviada" para siempre, aunque haya una respuesta sin leer).
      const seguimientoRespondeALaUltima =
        p.mensaje_seguimiento_enviado_en &&
        new Date(p.mensaje_seguimiento_enviado_en).getTime() >= new Date(ultimoDelCliente!.fecha).getTime();
      if (p.mensaje_seguimiento_enviado && !seguimientoRespondeALaUltima) {
        patch.mensaje_seguimiento_generado = null;
        patch.mensaje_seguimiento_enviado = false;
        patch.mensaje_seguimiento_enviado_en = null;
        log.push(`${p.numero}: respuesta nueva tras un seguimiento ya enviado — se reabre.`);
      }
    }

    const { error: updError } = await supabase.from('presupuestos').update(patch).eq('id', p.id);
    if (updError) {
      log.push(`Error actualizando ${p.numero}: ${updError.message}`);
      continue;
    }
    if (esRespuestaNuevaDelCliente) {
      actualizados++;
      log.push(`${p.numero}: nueva respuesta del cliente detectada.`);
    }
  }
  return actualizados;
}

// Solicitudes ya enviadas (Gabriel ya contestó) que aún no se han convertido en un
// presupuesto real — comprueba si el cliente respondió dentro del mismo hilo de Gmail y, si
// es así, guarda el resumen y la devuelve a "Nueva" para que vuelva a aparecer como pendiente.
async function revisarRespuestasSolicitudes(token: string, supabase: SupabaseClient, log: string[]) {
  const { data: solicitudes, error } = await supabase
    .from('solicitudes')
    .select('id, gmail_thread_id, ultima_respuesta_cliente_fecha')
    .eq('estado', 'Enviada')
    .is('presupuesto_vinculado_id', null)
    .not('gmail_thread_id', 'is', null);

  if (error) {
    log.push(`Error leyendo solicitudes Enviada: ${error.message}`);
    return 0;
  }
  log.push(`Solicitudes enviadas con hilo de Gmail a revisar: ${solicitudes.length}.`);

  let actualizadas = 0;
  for (const s of solicitudes) {
    let hilo: { messages?: GmailMessage[] } | undefined;
    try {
      hilo = await gmailFetch<{ messages?: GmailMessage[] }>(`threads/${s.gmail_thread_id}?format=full`, token);
    } catch (err) {
      log.push(`Error leyendo hilo de la solicitud ${s.id}: ${String(err)}`);
      continue;
    }
    const mensajes = hilo.messages ?? [];
    if (mensajes.length === 0) continue;

    const ultimoMsg = mensajes[mensajes.length - 1];
    const headers = ultimoMsg.payload?.headers ?? [];
    const de = extraerEmail(cabecera(headers, 'From'));
    if (de === NUESTRO_EMAIL) continue; // el último mensaje del hilo lo escribimos nosotros

    const fechaMsg = new Date(Number(ultimoMsg.internalDate)).toISOString();
    if (s.ultima_respuesta_cliente_fecha && new Date(s.ultima_respuesta_cliente_fecha).getTime() >= new Date(fechaMsg).getTime()) {
      continue; // ya la teníamos registrada
    }

    const texto = htmlATexto(extraerCuerpo(ultimoMsg.payload));
    const resumen = (ultimoMsg.snippet || texto).slice(0, 500);

    const { error: updError } = await supabase
      .from('solicitudes')
      .update({
        estado: 'Nueva',
        ultima_respuesta_cliente_resumen: resumen,
        ultima_respuesta_cliente_fecha: fechaMsg,
      })
      .eq('id', s.id);

    if (updError) {
      log.push(`Error actualizando solicitud ${s.id}: ${updError.message}`);
      continue;
    }
    actualizadas++;
    log.push(`Solicitud ${s.id}: respuesta del cliente detectada, vuelve a "Nueva".`);
  }
  return actualizadas;
}

// Lista negra configurable en Configuración → IA y mensajes de clientes → Lista negra de emails
// (empresa_config.datos.solicitudes_emails_excluidos) — para que hilos con la aseguradora,
// proveedores, gestoría, etc. no se cuelen como solicitud nueva solo por haber ida y vuelta.
// Admite email completo o dominio entero con el formato "@dominio.com".
function estaExcluido(email: string, listaNegra: string[]): boolean {
  const e = email.toLowerCase();
  return listaNegra.some((entry) => {
    const v = entry.toLowerCase().trim();
    if (!v) return false;
    return v.startsWith('@') ? e.endsWith(v) : e === v;
  });
}

// Conversaciones directas: hilos donde Gabriel escribió (mensaje desde NUESTRO_EMAIL) y la otra
// persona respondió después, dentro del mismo hilo, y que todavía no están vinculados a ninguna
// solicitud ni presupuesto existente. Regla de Gabriel: esa ida y vuelta es prácticamente 100%
// señal de que es un cliente real, así que se crea una solicitud nueva (fuente `email_directo`)
// para que aparezca en el CRM y se triage a mano — cubre justo lo que las otras pasadas se
// pierden porque dependen de que el hilo ya tenga un gmail_thread_id guardado de antemano.
async function detectarConversacionesDirectas(token: string, supabase: SupabaseClient, log: string[], listaNegra: string[]) {
  const query = `in:sent newer_than:60d`;
  const listado = await gmailFetch<{ messages?: { threadId: string }[] }>(
    `messages?q=${encodeURIComponent(query)}&maxResults=100`,
    token,
  );
  const mensajes = listado.messages ?? [];
  const threadIds = [...new Set(mensajes.map((m) => m.threadId))];
  log.push(`Conversaciones directas: ${threadIds.length} hilo(s) con mensajes nuestros (últimos 60 días).`);

  const [{ data: solicitudesTracked }, { data: presupuestosTracked }] = await Promise.all([
    supabase.from('solicitudes').select('gmail_thread_id').not('gmail_thread_id', 'is', null),
    supabase.from('presupuestos').select('gmail_thread_id').not('gmail_thread_id', 'is', null).is('eliminado_en', null),
  ]);
  const hilosYaTracked = new Set<string>([
    ...((solicitudesTracked ?? []) as { gmail_thread_id: string }[]).map((s) => s.gmail_thread_id),
    ...((presupuestosTracked ?? []) as { gmail_thread_id: string }[]).map((p) => p.gmail_thread_id),
  ]);

  let creadas = 0;
  let excluidas = 0;
  for (const threadId of threadIds) {
    if (hilosYaTracked.has(threadId)) continue;

    let hilo: { messages?: GmailMessage[] } | undefined;
    try {
      hilo = await gmailFetch<{ messages?: GmailMessage[] }>(`threads/${threadId}?format=full`, token);
    } catch (err) {
      log.push(`Error leyendo hilo directo ${threadId}: ${String(err)}`);
      continue;
    }
    const mensajesHilo = hilo.messages ?? [];
    if (mensajesHilo.length < 2) continue; // hace falta al menos ida y vuelta

    const tieneMensajeNuestro = mensajesHilo.some(
      (m) => extraerEmail(cabecera(m.payload?.headers ?? [], 'From')) === NUESTRO_EMAIL,
    );
    if (!tieneMensajeNuestro) continue;

    const ultimoMsg = mensajesHilo[mensajesHilo.length - 1];
    const headersUltimo = ultimoMsg.payload?.headers ?? [];
    const deUltimo = extraerEmail(cabecera(headersUltimo, 'From'));
    if (deUltimo === NUESTRO_EMAIL) continue; // el último mensaje del hilo lo escribimos nosotros

    if (estaExcluido(deUltimo, listaNegra)) {
      excluidas++;
      continue;
    }

    const nombreMatch = cabecera(headersUltimo, 'From').match(/^"?([^"<]+?)"?\s*<[^>]+>$/);
    const nombre = nombreMatch ? nombreMatch[1].trim() : null;
    const asunto = cabecera(headersUltimo, 'Subject');
    const texto = htmlATexto(extraerCuerpo(ultimoMsg.payload));
    const resumen = (ultimoMsg.snippet || texto).slice(0, 500);
    const fechaUltimo = new Date(Number(ultimoMsg.internalDate)).toISOString();

    const { data: filaInsertada, error } = await supabase
      .from('solicitudes')
      .upsert(
        {
          gmail_message_id: ultimoMsg.id,
          gmail_thread_id: threadId,
          fuente: 'email_directo',
          nombre,
          email: deUltimo,
          comentario_cliente: asunto ? `Asunto: ${asunto}\n\n${resumen}` : resumen,
          estado: 'Nueva',
          ultima_respuesta_cliente_resumen: resumen,
          ultima_respuesta_cliente_fecha: fechaUltimo,
        },
        { onConflict: 'gmail_message_id', ignoreDuplicates: true }
      )
      .select();

    if (error) {
      log.push(`Error creando solicitud directa (hilo ${threadId}): ${error.message}`);
      continue;
    }
    // Mismo fix que en la ingesta de las 3 fuentes de arriba: filaInsertada, no `count`
    // (siempre null sin `{ count: 'exact' }`), es lo único fiable para saber si hubo insert real.
    const nuevaId = filaInsertada?.[0]?.id;
    if (nuevaId) {
      creadas++;
      hilosYaTracked.add(threadId);
      log.push(`Conversación directa detectada y añadida: ${deUltimo} (hilo ${threadId}).`);
      const { error: errorFunnel } = await supabase
        .from('funnel_eventos')
        .insert({ etapa: 'solicitud_entrada', solicitud_id: nuevaId, fuente: 'email_directo' });
      if (errorFunnel) {
        log.push(`Error registrando funnel_eventos para solicitud ${nuevaId}: ${errorFunnel.message}`);
      }
    }
  }
  log.push(`Conversaciones directas nuevas creadas: ${creadas}${excluidas ? ` (${excluidas} descartadas por lista negra)` : ''}.`);
  return creadas;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (!esLlamadaAutorizada(req)) return jsonResponse({ ok: false, error: 'No autorizado' }, 401);

  const log: string[] = [];
  try {
    const token = await obtenerAccessToken();
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: empresaRow } = await supabase.from('empresa_config').select('datos').eq('id', 1).maybeSingle();
    const listaNegra = Array.isArray(empresaRow?.datos?.solicitudes_emails_excluidos)
      ? (empresaRow.datos.solicitudes_emails_excluidos as string[])
      : [];

    const solicitudesFormulario = await ingerirSolicitudesNuevas(token, supabase, log);
    const respuestasPresupuestos = await revisarRespuestasPresupuestos(token, supabase, log);
    const respuestasSolicitudes = await revisarRespuestasSolicitudes(token, supabase, log);
    const conversacionesDirectas = await detectarConversacionesDirectas(token, supabase, log, listaNegra);
    const solicitudesNuevas = solicitudesFormulario + conversacionesDirectas;
    const respuestasDetectadas = respuestasPresupuestos + respuestasSolicitudes;

    return jsonResponse({ ok: true, solicitudesNuevas, respuestasDetectadas, log });
  } catch (err) {
    log.push(String(err instanceof Error ? err.message : err));
    return jsonResponse({ ok: false, error: String(err instanceof Error ? err.message : err), log }, 500);
  }
});
