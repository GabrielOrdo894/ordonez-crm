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
//      presupuesto vinculado, y guardar el resumen de la respuesta con `ultima_respuesta_revisada
//      = false` — SIN tocar `estado` (antes se revertía a `Nueva`, pero eso contaba de nuevo como
//      "solicitud sin responder" en el embudo de conversión; decisión de Gabriel 2026-08-26).
//   4. Detectar conversaciones directas (autoenvíos manuales de Gabriel y clientes que
//      escriben directo, ver reference_fuentes_solicitudes_web) que aún no están vinculadas
//      a ninguna solicitud/presupuesto: la regla de Gabriel es que si él escribe o responde
//      a alguien y esa persona responde en el mismo hilo, es prácticamente seguro que sea un
//      cliente real — se crea una solicitud nueva (fuente `email_directo`) para que aparezca
//      en el CRM y se triage a mano.
//
// Ver docs/producto/bloque6-solicitudes-seguimiento.md y docs/negocio/directrices-respuesta-clientes.md.
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
  'Access-Control-Allow-Origin': 'https://ordonezrenov.com',
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

// El nombre para mostrar del From ("Ainhoa Etxeberria <correo@dominio.com>") — null si el cliente
// escribe sin nombre visible (p. ej. "correo@dominio.com" a secas). Landbot nunca captura el nombre
// del cliente (ver parseLandbot) y WordPress solo a veces, así que esta es la única forma de
// rellenarlo después: cuando el cliente responde por email, Gmail suele traer su nombre real en el
// From aunque el formulario no lo haya pedido.
function extraerNombreDesdeFrom(campoDe: string): string | null {
  const match = campoDe.match(/^"?([^"<]+?)"?\s*<[^>]+>$/);
  return match ? match[1].trim() : null;
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

    // Gabriel pidió (2026-08-22, caso real: sandra.ramos.94@hotmail.com) que cada solicitud sea
    // única — si el formulario reenvía/duplica el mismo envío (mismo contenido exacto, gmail_message_id
    // distinto porque es un correo nuevo de verdad, no el mismo que onConflict ya cubre), no se cree
    // una segunda fila: se ignora y se deja la solicitud existente tal cual, sea cual sea su estado
    // (incluida una ya Descartada — no se reabre, solo no se duplica). El contenido se compara por
    // email + tipo_reforma + comentario_cliente normalizados; si ambos campos de contenido vienen
    // vacíos no hay nada fiable que comparar, así que en ese caso se inserta igual.
    const normaliza = (v: string | null | undefined) => (v ?? '').trim().toLowerCase();
    const contenidoVacio = !normaliza(datos.tipo_reforma) && !normaliza(datos.comentario_cliente);
    if (datos.email && !contenidoVacio) {
      const { data: posiblesDuplicados, error: errorDup } = await supabase
        .from('solicitudes')
        .select('id, tipo_reforma, comentario_cliente')
        .ilike('email', datos.email);
      if (errorDup) {
        log.push(`Error comprobando duplicados para ${datos.email}: ${errorDup.message}`);
      } else if (
        (posiblesDuplicados ?? []).some(
          (s) => normaliza(s.tipo_reforma) === normaliza(datos.tipo_reforma) && normaliza(s.comentario_cliente) === normaliza(datos.comentario_cliente),
        )
      ) {
        log.push(`Solicitud duplicada (mismo contenido exacto) de ${datos.email} — se ignora, no se crea una segunda fila.`);
        continue;
      }
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
          tipo_solicitud: detectarTipoSolicitudDesdeTexto(datos.comentario_cliente, datos.tipo_reforma),
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
// negocio/modificaciones/plantilla de mensajeria por email de la empresa de refomas ordoñez.png. Gabriel
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
  //
  // `seguimiento_concluido = true` (cierre manual "Marcar como Aceptada") también se excluye a
  // propósito, y esta vez para siempre — decisión explícita de Gabriel 2026-08-19: el fin de
  // "Solicitudes & Seguimiento" es rastrear hasta conseguir la visita/negociación inicial: una
  // vez cerrada, el presupuesto definitivo post-visita, sus ajustes y las facturas son
  // conversación real que sigue por email pero pertenece a Presupuestos/Facturas, no a este
  // tracking — así que este barrido dejar de tocar la fila es exactamente lo que se busca (antes
  // se reabría sola si el cliente volvía a escribir; ya no).
  const { data: presupuestos, error } = await supabase
    .from('presupuestos')
    .select(
      'id, numero, cliente_email, fecha_emision, ultima_respuesta_cliente_fecha, gmail_thread_id, mensaje_seguimiento_enviado, mensaje_seguimiento_enviado_en'
    )
    .in('estado', ['Pendiente', 'Aceptado'])
    .eq('seguimiento_concluido', false)
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

// Solicitudes "Nueva" — busca directamente en Gmail si ya existe un correo NUESTRO
// dirigido al email del cliente, posterior a la creación de la solicitud, y si lo hay la marca
// como "Enviada" (mismo efecto que el botón manual "Marcar como enviado" de SolicitudDetalle.tsx).
// OJO: no se puede reusar el `gmail_thread_id` guardado al ingerir la solicitud — ese hilo es la
// notificación automática del formulario (de landbot@.../noreply@ordonezrenov.com hacia nosotros),
// no la conversación real con el cliente; la respuesta real de Gabriel casi seguro vive en un hilo
// nuevo, distinto (salvo que esos formularios configuren "Responder a" con el email del cliente,
// algo que no se puede confirmar sin verlo). Por eso se busca por destinatario en vez de por hilo
// — mismo patrón de búsqueda por email que ya usa revisarRespuestasPresupuestos cuando no hay
// thread_id todavía, pero aplicado siempre aquí, no solo como fallback.
//
// OJO — una solicitud "Nueva" puede ser genuinamente nueva (nunca contestada) o una solicitud
// que YA se había marcado "Enviada" y `revisarRespuestasSolicitudes` volvió a poner en "Nueva"
// porque el cliente respondió en el mismo hilo. En ese segundo caso, comparar solo contra
// `created_at` (fecha de creación de la solicitud, no de la respuesta que la reabrió) hacía que
// el correo ANTIGUO que ya la había marcado "Enviada" la primera vez volviera a contar como
// respuesta válida en la misma pasada — la solicitud pasaba a "Enviada" otra vez sin que Gabriel
// hubiera contestado de verdad al mensaje nuevo del cliente (bug real, 2026-08-19). Se compara
// en su lugar contra la fecha más reciente entre `created_at` y `ultima_respuesta_cliente_fecha`,
// para que "ya hay una respuesta nuestra" se evalúe siempre contra lo último que dijo el cliente.
async function revisarEnviosSolicitudes(token: string, supabase: SupabaseClient, log: string[]) {
  const { data: solicitudes, error } = await supabase
    .from('solicitudes')
    .select('id, email, fuente, created_at, ultima_respuesta_cliente_fecha')
    .eq('estado', 'Nueva')
    .not('email', 'is', null);

  if (error) {
    log.push(`Error leyendo solicitudes Nueva: ${error.message}`);
    return 0;
  }
  log.push(`Solicitudes Nueva con email a revisar: ${solicitudes.length}.`);

  let actualizadas = 0;
  for (const s of solicitudes) {
    const query = `from:${NUESTRO_EMAIL} to:${s.email} newer_than:30d`;
    let listado: { messages?: { id: string; threadId: string }[] };
    try {
      listado = await gmailFetch<{ messages?: { id: string; threadId: string }[] }>(
        `messages?q=${encodeURIComponent(query)}&maxResults=3`,
        token,
      );
    } catch (err) {
      log.push(`Error buscando envíos a ${s.email}: ${String(err)}`);
      continue;
    }
    const mensajes = listado.messages ?? [];
    if (mensajes.length === 0) continue;

    // Línea base: lo último que dijo el cliente si ya reabrió el hilo, si no la creación de la
    // solicitud. Nos quedamos con el más antiguo de los correos NUESTROS posteriores a esa fecha
    // — si solo hay correos anteriores (respuesta vieja, o cliente recurrente con historial
    // previo), no cuenta como respuesta a lo que el cliente dijo ahora.
    const desde = s.ultima_respuesta_cliente_fecha && s.ultima_respuesta_cliente_fecha > s.created_at
      ? s.ultima_respuesta_cliente_fecha
      : s.created_at;
    let fechaEnvio: string | null = null;
    let threadIdEnvio: string | null = null;
    for (const { id, threadId } of mensajes) {
      let msg: GmailMessage;
      try {
        msg = await gmailFetch<GmailMessage>(`messages/${id}?format=minimal`, token);
      } catch (err) {
        log.push(`Error leyendo mensaje ${id} (solicitud ${s.id}): ${String(err)}`);
        continue;
      }
      const fechaMsg = new Date(Number(msg.internalDate)).toISOString();
      if (fechaMsg > desde && (!fechaEnvio || fechaMsg < fechaEnvio)) {
        fechaEnvio = fechaMsg;
        threadIdEnvio = threadId;
      }
    }
    if (!fechaEnvio) continue;

    // Guarda también el hilo real de esta conversación (distinto del hilo de la notificación
    // del formulario con el que se ingirió la solicitud) — sin esto, revisarRespuestasSolicitudes
    // seguía mirando el hilo equivocado y nunca encontraba la respuesta del cliente (bug real,
    // corregido 2026-08-26; hasta ahora la respuesta solo se detectaba vía detectarConversacionesDirectas).
    const { error: updError } = await supabase
      .from('solicitudes')
      .update({ estado: 'Enviada', mensaje_enviado_en: fechaEnvio, gmail_thread_id: threadIdEnvio })
      .eq('id', s.id);
    if (updError) {
      log.push(`Error actualizando solicitud ${s.id}: ${updError.message}`);
      continue;
    }
    // Evita duplicar el evento si esta misma solicitud ya se marcó "Enviada" por otra vía (p. ej.
    // la acción manual "Marcar como Enviada" en SolicitudesPage.tsx) — confirmado con duplicados
    // reales en producción, auditoría 2026-08-18. Mismo criterio que registrarEventoFunnel en
    // src/lib/funnelTracking.ts, duplicado aquí porque esta función Deno no puede importarlo.
    const { data: yaRegistrado } = await supabase
      .from('funnel_eventos')
      .select('id')
      .eq('etapa', 'solicitud_respondida')
      .eq('solicitud_id', s.id)
      .limit(1);
    if (!yaRegistrado || yaRegistrado.length === 0) {
      const { error: errorFunnel } = await supabase
        .from('funnel_eventos')
        .insert({ etapa: 'solicitud_respondida', solicitud_id: s.id, fuente: s.fuente });
      if (errorFunnel) {
        log.push(`Error registrando funnel_eventos para solicitud ${s.id}: ${errorFunnel.message}`);
      }
    }
    actualizadas++;
    log.push(`Solicitud ${s.id}: correo nuestro a ${s.email} detectado, se marca como Enviada.`);
  }
  return actualizadas;
}

// Solicitudes ya enviadas (Gabriel ya contestó) que aún no se han convertido en un
// presupuesto real — comprueba si el cliente respondió dentro del mismo hilo de Gmail y, si
// es así, guarda el resumen y marca `ultima_respuesta_revisada: false` para que se vea como
// pendiente de atender en el CRM. NO toca `estado` (sigue "Enviada") — antes se revertía a
// "Nueva", pero eso hacía que el embudo contara otra vez la solicitud como sin responder pese a
// que ya se había contactado al cliente (decisión de Gabriel 2026-08-26).
async function revisarRespuestasSolicitudes(token: string, supabase: SupabaseClient, log: string[]) {
  const { data: solicitudes, error } = await supabase
    .from('solicitudes')
    .select('id, nombre, gmail_thread_id, ultima_respuesta_cliente_fecha, ultima_respuesta_revisada, respuesta_programada_en')
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
    const campoDe = cabecera(headers, 'From');
    const de = extraerEmail(campoDe);
    const fechaUltimoMsg = new Date(Number(ultimoMsg.internalDate)).toISOString();

    if (de === NUESTRO_EMAIL) {
      // El último mensaje del hilo ya es nuestro — si respondimos DESPUÉS de la última respuesta
      // del cliente, el aviso "Nueva respuesta"/"Respuesta programada" ya está atendido de
      // verdad y hay que limpiarlo. Antes esto no pasaba nunca solo (bug real de Gabriel,
      // 2026-09-08): ni siquiera al enviar la respuesta real se apagaba el badge, la única forma
      // era tocarlo a mano ("Marcar como revisada") o cambiar el estado de la solicitud.
      const yaRespondimosDeVerdad =
        !s.ultima_respuesta_cliente_fecha || fechaUltimoMsg > s.ultima_respuesta_cliente_fecha;
      if (yaRespondimosDeVerdad && (s.ultima_respuesta_revisada === false || s.respuesta_programada_en)) {
        const { error: updError } = await supabase
          .from('solicitudes')
          .update({ ultima_respuesta_revisada: true, respuesta_programada_en: null })
          .eq('id', s.id);
        if (updError) {
          log.push(`Error limpiando el aviso de la solicitud ${s.id} tras responder: ${updError.message}`);
        } else {
          log.push(`Solicitud ${s.id}: respuesta real ya enviada tras el mensaje del cliente — aviso limpiado.`);
        }
      }
      continue;
    }

    const fechaMsg = fechaUltimoMsg;
    const esRespuestaNueva =
      !s.ultima_respuesta_cliente_fecha || new Date(fechaMsg).getTime() > new Date(s.ultima_respuesta_cliente_fecha).getTime();
    // Landbot nunca trae el nombre del cliente (parseLandbot) y WordPress solo a veces — si el
    // email de respuesta sí trae un nombre visible en el From, se rellena aquí aunque el mensaje
    // ya estuviera registrado (no hace falta que sea una respuesta nueva para completar el dato).
    const nombreDetectado = !s.nombre ? extraerNombreDesdeFrom(campoDe) : null;
    if (!esRespuestaNueva && !nombreDetectado) continue; // ya la teníamos registrada, nada que completar

    const patch: Record<string, unknown> = {};
    if (esRespuestaNueva) {
      const texto = htmlATexto(extraerCuerpo(ultimoMsg.payload));
      patch.ultima_respuesta_cliente_resumen = (ultimoMsg.snippet || texto).slice(0, 500);
      patch.ultima_respuesta_cliente_fecha = fechaMsg;
      patch.ultima_respuesta_revisada = false;
      // Un programado anterior respondía al mensaje viejo del cliente, no a este nuevo — se
      // limpia, revisarRespuestasProgramadas detectará uno nuevo si Gabriel programa otra
      // respuesta para este mensaje.
      patch.respuesta_programada_en = null;
    }
    if (nombreDetectado) patch.nombre = nombreDetectado;

    const { error: updError } = await supabase.from('solicitudes').update(patch).eq('id', s.id);
    if (updError) {
      log.push(`Error actualizando solicitud ${s.id}: ${updError.message}`);
      continue;
    }
    if (esRespuestaNueva) {
      actualizadas++;
      log.push(`Solicitud ${s.id}: respuesta del cliente detectada, pendiente de revisar.`);
    } else {
      log.push(`Solicitud ${s.id}: nombre completado a partir del email (${nombreDetectado}).`);
    }
  }
  return actualizadas;
}

// Respuestas de cliente pendientes de revisar (badge "Nueva respuesta") para las que Gabriel ya
// dejó un email programado ("Schedule send" de Gmail, no un simple Draft) — Gabriel programa sus
// respuestas para la mañana siguiente en vez de dejarlas como Draft o mandarlas al momento (ver
// [[feedback_badge_respuesta_programada]], hallazgo real 2026-09-07/08). Sin esto el badge se
// quedaba en "Nueva respuesta" indefinidamente aunque la respuesta ya estuviera lista para salir,
// dando la falsa impresión de que nadie la había atendido todavía.
async function revisarRespuestasProgramadas(token: string, supabase: SupabaseClient, log: string[]) {
  const { data: solicitudes, error } = await supabase
    .from('solicitudes')
    .select('id, email, ultima_respuesta_cliente_fecha, respuesta_programada_en')
    .eq('estado', 'Enviada')
    .eq('ultima_respuesta_revisada', false)
    .not('email', 'is', null);

  if (error) {
    log.push(`Error leyendo solicitudes con respuesta pendiente: ${error.message}`);
    return 0;
  }
  log.push(`Respuestas pendientes a comprobar si hay envío programado: ${solicitudes.length}.`);

  let actualizadas = 0;
  for (const s of solicitudes) {
    const query = `from:${NUESTRO_EMAIL} to:${s.email} in:scheduled`;
    let listado: { messages?: { id: string }[] };
    try {
      listado = await gmailFetch<{ messages?: { id: string }[] }>(`messages?q=${encodeURIComponent(query)}&maxResults=5`, token);
    } catch (err) {
      log.push(`Error buscando envíos programados para ${s.email}: ${String(err)}`);
      continue;
    }
    const mensajes = listado.messages ?? [];

    if (mensajes.length === 0) {
      // No hay (ya) ningún envío programado — si antes sí lo había, es que Gabriel lo canceló
      // (o ya se envió y revisarRespuestasSolicitudes se encargará de limpiar el aviso del todo
      // en cuanto detecte el mensaje real). Se limpia solo esta columna, sin tocar
      // ultima_respuesta_revisada.
      if (s.respuesta_programada_en) {
        const { error: updError } = await supabase.from('solicitudes').update({ respuesta_programada_en: null }).eq('id', s.id);
        if (updError) log.push(`Error limpiando respuesta_programada_en de la solicitud ${s.id}: ${updError.message}`);
        else log.push(`Solicitud ${s.id}: el envío programado ya no existe — se limpia el aviso.`);
      }
      continue;
    }

    // De los candidatos programados a ese email, el más próximo que responda de verdad al
    // último mensaje del cliente (posterior a su fecha, no un programado antiguo suelto).
    let fechaProgramada: string | null = null;
    for (const { id } of mensajes) {
      let msg: GmailMessage;
      try {
        msg = await gmailFetch<GmailMessage>(`messages/${id}?format=minimal`, token);
      } catch (err) {
        log.push(`Error leyendo mensaje programado ${id} (solicitud ${s.id}): ${String(err)}`);
        continue;
      }
      const fechaMsg = new Date(Number(msg.internalDate)).toISOString();
      const respondeAlUltimoMensaje = !s.ultima_respuesta_cliente_fecha || fechaMsg > s.ultima_respuesta_cliente_fecha;
      if (respondeAlUltimoMensaje && (!fechaProgramada || fechaMsg < fechaProgramada)) {
        fechaProgramada = fechaMsg;
      }
    }

    if (fechaProgramada && fechaProgramada !== s.respuesta_programada_en) {
      const { error: updError } = await supabase.from('solicitudes').update({ respuesta_programada_en: fechaProgramada }).eq('id', s.id);
      if (updError) {
        log.push(`Error guardando respuesta_programada_en de la solicitud ${s.id}: ${updError.message}`);
      } else {
        actualizadas++;
        log.push(`Solicitud ${s.id}: envío programado detectado para ${fechaProgramada}.`);
      }
    } else if (!fechaProgramada && s.respuesta_programada_en) {
      // Había un programado guardado pero ninguno de los candidatos actuales responde ya al
      // último mensaje del cliente (p. ej. el cliente volvió a escribir después) — se limpia.
      const { error: updError } = await supabase.from('solicitudes').update({ respuesta_programada_en: null }).eq('id', s.id);
      if (updError) log.push(`Error limpiando respuesta_programada_en de la solicitud ${s.id}: ${updError.message}`);
    }
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

// Convención de asunto (2026-08-26, a petición de Gabriel): cuando el primer contacto es un email
// NUEVO nuestro (no respuesta a un hilo existente — típicamente un `email_directo` que arranca la
// propia Gabriel/Claude, no un formulario), el asunto debe empezar por "Solicitud de visita" /
// "Demande de visite" o "Presupuesto orientativo" / "Devis indicatif" para poder clasificar el tipo
// de contacto automáticamente. El asunto sobrevive en las respuestas ("Re: ..."), así que basta con
// buscar la frase en cualquier parte, sin anclar al principio. Los formularios (Landbot/WordPress)
// se dejan siempre sin clasificar (`null`, "sin determinar") — ahí es el propio CRM quien decide más
// tarde si ofrece visita u orientativo según disponibilidad, no algo que el cliente elige al pedirlo.
function detectarTipoSolicitud(asunto: string): 'visita' | 'presupuesto_orientativo' | null {
  const a = asunto.toLowerCase();
  if (/solicitud de visita|demande de visite/.test(a)) return 'visita';
  if (/presupuesto orientativo|devis indicatif/.test(a)) return 'presupuesto_orientativo';
  return null;
}

// Autodetección por contenido para los formularios (Landbot/WordPress/EmailJS) — hasta ahora se
// dejaban siempre sin clasificar (null, "sin determinar") y Gabriel lo hacía a mano en el CRM
// (petición 2026-09-06: automatizarlo "de algún modo"). Solo clasifica cuando el propio texto trae
// una señal explícita y razonablemente inequívoca; si no encuentra ninguna, sigue devolviendo null
// para no forzar una clasificación dudosa — se corrige a mano igual que antes en esos casos.
function detectarTipoSolicitudDesdeTexto(comentario: string | null, tipoReforma: string | null): 'visita' | 'presupuesto_orientativo' | null {
  const texto = `${comentario ?? ''} ${tipoReforma ?? ''}`.toLowerCase();
  if (!texto.trim()) return null;
  if (/presupuesto orientativo|precio orientativo|precio aproximado|presupuesto aproximado|sin necesidad de visita|devis indicatif|devis approximatif|estimation (?:de )?prix|combien co[uû]terait|combien [cç]a co[uû]te|cu[aá]nto costar[ií]a|cu[aá]nto (?:me )?cuesta/.test(texto)) {
    return 'presupuesto_orientativo';
  }
  if (/visita t[eé]cnica|que vengan a ver|venir a ver|pasar a ver|ver el espacio|ver la obra|visite technique|venir voir|passer voir/.test(texto)) {
    return 'visita';
  }
  return null;
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

    const nombre = extraerNombreDesdeFrom(cabecera(headersUltimo, 'From'));
    const asunto = cabecera(headersUltimo, 'Subject');
    const texto = htmlATexto(extraerCuerpo(ultimoMsg.payload));
    const resumen = (ultimoMsg.snippet || texto).slice(0, 500);
    const fechaUltimo = new Date(Number(ultimoMsg.internalDate)).toISOString();

    // Antes de crear una solicitud nueva, comprueba que este email no tenga YA una solicitud o
    // un presupuesto en curso — la notificación del formulario web (o el hilo con el que se
    // ingirió la solicitud) casi siempre vive en un hilo de Gmail distinto al de esta
    // conversación real, así que dedupear solo por gmail_thread_id (como hacía esto antes)
    // dejaba pasar duplicados reales del mismo contacto (hallazgo real, auditoría 2026-08-19:
    // florent.courally@yahoo.fr y rosarito.olabe@gmail.com aparecían dos veces en Solicitudes).
    // Solo se compara por email — es el único dato fiable que da esta función en este punto (el
    // teléfono no siempre aparece en la cabecera del email).
    const { data: presupuestoExistente } = await supabase
      .from('presupuestos')
      .select('id')
      .ilike('cliente_email', deUltimo)
      .is('eliminado_en', null)
      .limit(1);
    if (presupuestoExistente && presupuestoExistente.length > 0) {
      hilosYaTracked.add(threadId);
      log.push(`Conversación directa de ${deUltimo} (hilo ${threadId}) ya tiene un presupuesto en curso — no se crea solicitud duplicada.`);
      continue;
    }

    const { data: solicitudExistente } = await supabase
      .from('solicitudes')
      .select('id, nombre, estado, ultima_respuesta_cliente_fecha, tipo_solicitud')
      .ilike('email', deUltimo)
      .neq('estado', 'Descartada')
      .order('created_at', { ascending: false })
      .limit(1);
    if (solicitudExistente && solicitudExistente.length > 0) {
      const existente = solicitudExistente[0];
      const esMasReciente = !existente.ultima_respuesta_cliente_fecha || fechaUltimo > existente.ultima_respuesta_cliente_fecha;
      const patch: Record<string, unknown> = {
        gmail_thread_id: threadId,
        gmail_message_id: ultimoMsg.id,
        ultima_respuesta_cliente_resumen: resumen,
      };
      // Solo rellena tipo_solicitud si todavía no tenía uno — nunca pisa una corrección manual
      // hecha a mano en el CRM.
      if (!existente.tipo_solicitud) {
        const tipoDetectado = detectarTipoSolicitud(asunto);
        if (tipoDetectado) patch.tipo_solicitud = tipoDetectado;
      }
      // Igual con el nombre — Landbot nunca lo trae, WordPress solo a veces; si el email de
      // respuesta sí trae un nombre visible en el From, se completa el dato que faltaba.
      if (!existente.nombre && nombre) patch.nombre = nombre;
      if (esMasReciente) {
        patch.ultima_respuesta_cliente_fecha = fechaUltimo;
        // No revierte `estado` a "Nueva" (decisión de Gabriel 2026-08-26, mismo criterio que
        // revisarRespuestasSolicitudes) — solo marca la respuesta como pendiente de revisar.
        if (existente.estado === 'Enviada') patch.ultima_respuesta_revisada = false;
      }
      const { error: errorUpdate } = await supabase.from('solicitudes').update(patch).eq('id', existente.id);
      if (errorUpdate) {
        log.push(`Error actualizando solicitud existente ${existente.id} (dedupe email_directo): ${errorUpdate.message}`);
      } else {
        log.push(`Conversación directa de ${deUltimo} (hilo ${threadId}) enlazada a la solicitud existente ${existente.id} en vez de duplicarla.`);
      }
      hilosYaTracked.add(threadId);
      continue;
    }

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
          tipo_solicitud: detectarTipoSolicitud(asunto),
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
    const programadosDetectados = await revisarRespuestasProgramadas(token, supabase, log);
    const enviosSolicitudes = await revisarEnviosSolicitudes(token, supabase, log);
    const conversacionesDirectas = await detectarConversacionesDirectas(token, supabase, log, listaNegra);
    const solicitudesNuevas = solicitudesFormulario + conversacionesDirectas;
    const respuestasDetectadas = respuestasPresupuestos + respuestasSolicitudes;

    return jsonResponse({ ok: true, solicitudesNuevas, respuestasDetectadas, enviosSolicitudes, programadosDetectados, log });
  } catch (err) {
    // console.error (no solo el body de la respuesta) para poder ver el error real en
    // function_logs — el body de una respuesta no-2xx no queda guardado en los logs de Supabase,
    // así que sin esto un fallo aquí es invisible salvo que se reproduzca con curl a mano.
    console.error('revisar-gmail error:', err);
    log.push(String(err instanceof Error ? err.message : err));
    return jsonResponse({ ok: false, error: String(err instanceof Error ? err.message : err), log }, 500);
  }
});
