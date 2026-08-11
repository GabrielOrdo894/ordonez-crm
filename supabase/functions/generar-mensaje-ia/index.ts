// Edge Function: generar-mensaje-ia
//
// Genera el mensaje de respuesta a un cliente (solicitud entrante o seguimiento de un
// presupuesto ya enviado) con el mismo razonamiento usado manualmente en Claude Code:
// lee las directrices de negocio de la tabla `directrices`, calcula las próximas 3 opciones
// de visita libres con el algoritmo de horarios, y llama a la API de Anthropic para redactar
// el mensaje siguiendo esas reglas. Nunca envía nada — solo genera el borrador.
//
// Body esperado: { "tipo": "solicitud" | "seguimiento", "id": "<uuid>", "modelo"?: string }
// "modelo" es opcional — "claude-haiku-4-5" (por defecto, económico) o "claude-sonnet-5"
// (más preciso, más caro). Cualquier otro valor cae al modelo por defecto.
// Ver docs/bloque6-solicitudes-seguimiento.md y docs/directrices-respuesta-clientes.md.
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MODELO_DEFECTO = 'claude-haiku-4-5';
const MODELOS_PERMITIDOS = new Set(['claude-haiku-4-5', 'claude-sonnet-5']);

type AnthropicContentBlock = { type: string; name?: string; input?: Record<string, unknown> };
type AnthropicResponse = {
  error?: { message?: string };
  content?: AnthropicContentBlock[];
  usage?: { input_tokens?: number; output_tokens?: number };
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Precio por millón de tokens (USD). Sonnet 5 tiene precio de lanzamiento reducido hasta el
// 31/08/2026 — pasada esa fecha sube automáticamente al precio estándar.
function precioModelo(modelo: string): { input: number; output: number } {
  if (modelo === 'claude-sonnet-5') {
    const introVigente = new Date() < new Date('2026-09-01T00:00:00Z');
    return introVigente ? { input: 2, output: 10 } : { input: 3, output: 15 };
  }
  return { input: 1, output: 5 }; // claude-haiku-4-5
}

// --- Algoritmo de horarios por defecto (idéntico al de docs/directrices-respuesta-clientes.md) ---

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + n);
  return r;
}

function lunesDeSemana(d: Date): Date {
  const dia = d.getUTCDay();
  const diff = (dia === 0 ? -6 : 1) - dia;
  return addDays(d, diff);
}

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const DIAS_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

function siguienteSlot(desde: Date, ocupadas: Set<string>): { fecha: string; hora: string; diaSemana: string } | null {
  const primerLunes = lunesDeSemana(desde);
  for (let semana = 0; semana < 26; semana++) {
    const lunes = addDays(primerLunes, semana * 7);
    for (const offset of [0, 1, 2, 3, 4]) {
      const dia = addDays(lunes, offset);
      if (dia < desde) continue;
      const clave = `${fmt(dia)}|18:00`;
      if (!ocupadas.has(clave)) return { fecha: fmt(dia), hora: '18:00', diaSemana: DIAS_SEMANA[offset] };
    }
    const offsetsPasada2 = [5, 4, 3, 2, 1, 0];
    for (const offset of offsetsPasada2) {
      const dia = addDays(lunes, offset);
      if (dia < desde) continue;
      const clave = `${fmt(dia)}|12:00`;
      if (!ocupadas.has(clave)) return { fecha: fmt(dia), hora: '12:00', diaSemana: DIAS_SEMANA[offset] };
    }
  }
  return null;
}

// Gabriel pidió (2026-07-29) ofrecer siempre 3 opciones de visita al cliente, no una sola —
// se reutiliza `siguienteSlot` sin tocarla, marcando cada slot ya encontrado como "ocupado"
// antes de buscar el siguiente, para que las 3 opciones sean siempre distintas entre sí.
function siguientesSlots(desde: Date, ocupadas: Set<string>, cantidad: number): { fecha: string; hora: string; diaSemana: string }[] {
  const usadas = new Set(ocupadas);
  const resultado: { fecha: string; hora: string; diaSemana: string }[] = [];
  for (let i = 0; i < cantidad; i++) {
    const slot = siguienteSlot(desde, usadas);
    if (!slot) break;
    resultado.push(slot);
    usadas.add(`${slot.fecha}|${slot.hora}`);
  }
  return resultado;
}

// --- Google Calendar (FreeBusy) — evita ofrecer un slot que choque con un evento real del
// Calendar aunque no exista como `visita` en el CRM (ej. algo metido a mano por Gabriel). Usa
// el mismo refresh_token compartido de `google_config` que Gmail/Calendar, scope calendar.events
// ya concedido — no requiere reconectar Google. Si falla (no conectado, etc.) se degrada sin
// romper la generación del mensaje: el slot se calcula solo con `visitas`.
async function obtenerAccessTokenCalendar(supabase: SupabaseClient): Promise<string> {
  const { data: config, error } = await supabase.from('google_config').select('refresh_token').eq('id', 1).maybeSingle();
  if (error || !config?.refresh_token) throw new Error('Google no está conectado');

  const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
  if (!clientId || !clientSecret) throw new Error('Faltan GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET');

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: config.refresh_token,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description ?? data.error ?? 'No se pudo renovar el token de Google');
  return data.access_token;
}

// Convierte una fecha+hora en hora local de Europe/Paris (donde operan las visitas, ver
// `crearEventoVisita` en src/lib/googleCalendar.ts) al instante UTC real — necesario para
// comparar contra los horarios "busy" que devuelve Google, siempre en UTC. Maneja el cambio de
// hora de verano/invierno con el truco estándar de doble conversión (sin depender de librerías).
function parisADate(fechaStr: string, horaStr: string): Date {
  const naive = new Date(`${fechaStr}T${horaStr}:00Z`);
  const enParis = new Date(naive.toLocaleString('en-US', { timeZone: 'Europe/Paris' }));
  return new Date(naive.getTime() * 2 - enParis.getTime());
}

// Devuelve las claves "YYYY-MM-DD|HH:MM" (mismo formato que `ocupadas`) de los slots 12:00/18:00
// (hora de Paris) que se solapan con algún evento real del Calendar entre `desde` y `hasta`.
async function slotsOcupadosPorCalendar(supabase: SupabaseClient, desde: Date, hasta: Date): Promise<Set<string>> {
  const token = await obtenerAccessTokenCalendar(supabase);
  const res = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      timeMin: desde.toISOString(),
      timeMax: hasta.toISOString(),
      items: [{ id: 'primary' }],
    }),
  });
  if (!res.ok) throw new Error(`Google Calendar FreeBusy ${res.status}`);
  const data = await res.json();
  const ocupados: { start: string; end: string }[] = data.calendars?.primary?.busy ?? [];

  const claves = new Set<string>();
  for (let d = new Date(desde); d <= hasta; d = addDays(d, 1)) {
    for (const hora of ['12:00', '18:00']) {
      const inicio = parisADate(fmt(d), hora);
      const fin = new Date(inicio.getTime() + 60 * 60 * 1000);
      const choca = ocupados.some((b) => new Date(b.start) < fin && new Date(b.end) > inicio);
      if (choca) claves.add(`${fmt(d)}|${hora}`);
    }
  }
  return claves;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json();
    const { tipo, id } = body;
    const modelo = MODELOS_PERMITIDOS.has(body.modelo) ? body.modelo : MODELO_DEFECTO;
    if (!['solicitud', 'seguimiento'].includes(tipo) || !id) {
      return jsonResponse({ error: 'Falta "tipo" (solicitud|seguimiento) o "id" en el body' }, 400);
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: directrices } = await supabase
      .from('directrices')
      .select('titulo, contenido')
      .eq('activo', true)
      .order('orden');

    const { data: empresaRow } = await supabase
      .from('empresa_config')
      .select('datos, visitas_disponibles_desde')
      .eq('id', 1)
      .maybeSingle();
    const empresa = (empresaRow?.datos ?? {}) as Record<string, unknown>;

    let caso: Record<string, unknown> = {};
    let idiomaDoc = 'es';
    if (tipo === 'solicitud') {
      const { data: sol, error } = await supabase.from('solicitudes').select('*').eq('id', id).maybeSingle();
      if (error || !sol) return jsonResponse({ error: 'Solicitud no encontrada' }, 404);
      caso = sol;
      idiomaDoc = sol.idioma === 'fr' ? 'fr' : 'es';
    } else {
      const { data: pres, error } = await supabase.from('presupuestos').select('*').eq('id', id).maybeSingle();
      if (error || !pres) return jsonResponse({ error: 'Presupuesto no encontrado' }, 404);
      caso = pres;
      idiomaDoc = pres.idioma === 'fr' || pres.idioma === 'Français' ? 'fr' : 'es';
    }

    // Slot de visita libre según el algoritmo de horarios
    const hoy = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));
    const desdeConfig = empresaRow?.visitas_disponibles_desde ? new Date(empresaRow.visitas_disponibles_desde) : hoy;
    const desde = desdeConfig > hoy ? desdeConfig : hoy;

    const { data: visitas } = await supabase
      .from('visitas')
      .select('fecha_visita, hora_visita')
      .neq('estado', 'Cancelada')
      .not('fecha_visita', 'is', null)
      .gte('fecha_visita', fmt(desde));
    const ocupadas = new Set(
      (visitas ?? []).map((v: { fecha_visita: string; hora_visita: string | null }) => `${v.fecha_visita}|${(v.hora_visita ?? '').slice(0, 5)}`),
    );

    // Además de `visitas`, se comprueba el Google Calendar real (mismo calendario donde ya se
    // crean los eventos de visita) para no ofrecer un hueco bloqueado a mano por Gabriel que no
    // exista como visita en el CRM. Si Google no está conectado o falla, se degrada sin romper
    // la generación — el slot se calcula solo con `visitas` y se avisa en el prompt.
    let calendarComprobado = true;
    try {
      const hasta = addDays(lunesDeSemana(desde), 26 * 7);
      const ocupadasCalendar = await slotsOcupadosPorCalendar(supabase, desde, hasta);
      for (const clave of ocupadasCalendar) ocupadas.add(clave);
    } catch {
      calendarComprobado = false;
    }

    const slots = siguientesSlots(desde, ocupadas, 3);

    const contextoDirectrices = (directrices ?? [])
      .map((d: { titulo: string; contenido: string }) => `## ${d.titulo}\n${d.contenido}`)
      .join('\n\n---\n\n');
    const contacto = idiomaDoc === 'fr' ? empresa.fr ?? {} : empresa.es ?? {};

    const systemPrompt = `Eres el redactor de mensajes a clientes de Reformas Ordoñez, empresa de reformas en la frontera franco-española (más de 25 años de experiencia). Escribes SIEMPRE en ${idiomaDoc === 'fr' ? 'francés' : 'español'}, tono profesional, breve (máximo 8-10 líneas), sin emojis, sin sonar a IA genérica.

Sigues estas directrices de negocio al pie de la letra — mandan sobre cualquier criterio genérico tuyo. Si ninguna encaja con el caso, dilo explícitamente en "avisos" y redacta con tu criterio normal:

${contextoDirectrices || '(no hay directrices activas cargadas)'}

Datos de contacto de la empresa para firmar el mensaje si aplica:
${JSON.stringify(contacto)}

${
  slots.length > 0
    ? `Estas son las próximas ${slots.length} opciones de visita técnica libres, ya calculadas y comprobadas contra el CRM${calendarComprobado ? ' y contra Google Calendar' : ''}:\n${slots
        .map((s, i) => `${i + 1}. ${s.diaSemana} ${s.fecha} a las ${s.hora}`)
        .join('\n')}\nNO las recalcules ni preguntes al cliente qué día prefiere — ofrece SIEMPRE estas ${slots.length} opciones juntas (nunca una sola) si el caso implica ofrecer una visita, para que el cliente elija la que mejor le venga.${
        calendarComprobado
          ? ''
          : ' Aviso: no se pudo comprobar Google Calendar en vivo (solo se comprobó contra las visitas del CRM) — menciónalo en "avisos" para que Gabriel lo revise a mano antes de confirmar.'
      }`
    : 'No se pudo calcular ninguna opción de visita libre — si hace falta ofrecer visita, dilo en "avisos" y no inventes una fecha.'
}

${
  tipo === 'solicitud' && caso.ultima_respuesta_cliente_resumen
    ? `El campo "ultima_respuesta_cliente_resumen" del caso es una respuesta NUEVA del cliente a un mensaje que ya le enviaste antes (mira "mensaje_generado" para ver qué le dijiste). Redacta la respuesta a ESA respuesta nueva, con el contexto de la conversación completa — no repitas el mensaje inicial de nuevo.`
    : ''
}

${
  tipo === 'seguimiento' && Array.isArray(caso.conversacion) && caso.conversacion.length > 0
    ? `El campo "conversacion" del caso es el hilo de Gmail completo con este cliente (más antiguo primero, "de" es el remitente). Redacta la respuesta al ÚLTIMO mensaje del cliente en ese hilo, teniendo en cuenta todo el contexto previo — no repitas cosas ya dichas.`
    : ''
}

Responde SIEMPRE llamando a la herramienta entregar_mensaje.`;

    // El caso puede traer un texto pegado a mano (solicitudes manuales) en comentario_cliente —
    // se manda tal cual, el modelo ya sabe leer un email/WhatsApp completo de ahí.
    const userPrompt = `Caso (${tipo}):\n${JSON.stringify(caso, null, 2)}`;

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) return jsonResponse({ error: 'Falta el secreto ANTHROPIC_API_KEY en la Edge Function' }, 500);

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: modelo,
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        tools: [
          {
            name: 'entregar_mensaje',
            description: 'Entrega el mensaje de respuesta redactado para el cliente',
            strict: true,
            input_schema: {
              type: 'object',
              properties: {
                asunto: { type: 'string', description: 'Asunto del email' },
                cuerpo: { type: 'string', description: 'Cuerpo del mensaje, listo para copiar' },
                avisos: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Avisos para Gabriel: datos que faltan, directriz no encontrada, sugerencias comerciales, etc. Array vacío si no hay ninguno.',
                },
              },
              required: ['asunto', 'cuerpo', 'avisos'],
              additionalProperties: false,
            },
          },
        ],
        tool_choice: { type: 'tool', name: 'entregar_mensaje' },
      }),
    });

    const anthropicData = (await anthropicRes.json()) as AnthropicResponse;
    if (!anthropicRes.ok) {
      return jsonResponse({ error: `Error de la API de Anthropic: ${anthropicData.error?.message ?? anthropicRes.status}` }, 502);
    }

    const toolUse = (anthropicData.content ?? []).find((b) => b.type === 'tool_use' && b.name === 'entregar_mensaje');
    if (!toolUse) return jsonResponse({ error: 'La IA no devolvió un mensaje estructurado' }, 502);

    const mensaje = toolUse.input;

    // Coste de esta llamada, para el indicador de consumo mensual del CRM.
    const inputTokens: number = anthropicData.usage?.input_tokens ?? 0;
    const outputTokens: number = anthropicData.usage?.output_tokens ?? 0;
    const precio = precioModelo(modelo);
    const costoUsd = (inputTokens / 1_000_000) * precio.input + (outputTokens / 1_000_000) * precio.output;

    await supabase.from('llamadas_ia').insert({
      tipo,
      referencia_id: id,
      modelo,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      costo_usd: costoUsd,
    });

    if (tipo === 'solicitud') {
      await supabase
        .from('solicitudes')
        .update({ mensaje_generado: JSON.stringify(mensaje), mensaje_generado_en: new Date().toISOString(), estado: 'Borrador' })
        .eq('id', id);
    } else {
      await supabase.from('presupuestos').update({ mensaje_seguimiento_generado: JSON.stringify(mensaje) }).eq('id', id);
    }

    return jsonResponse({ ok: true, mensaje, slots, modelo, costoUsd });
  } catch (err) {
    return jsonResponse({ error: String(err instanceof Error ? err.message : err) }, 500);
  }
});
