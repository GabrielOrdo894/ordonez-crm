// Edge Function: enviar-resena-email
//
// Envía por Gmail (cuenta reformasordonezeus@gmail.com, mismo mecanismo que notificar-visita) el
// mensaje de petición de reseña de Google + invitación al programa de referidos, a la factura
// indicada. Sustituye al mailto: manual del antiguo ResenaGoogleBanner — ahora el envío queda
// registrado de verdad (Enviado en Gmail) en vez de depender de que alguien le dé a "enviar" en la
// pestaña que se abre. El enlace de reseña pasa por resena-redirect para poder medir el clic real.
//
// Body esperado: { "facturaId": "<uuid>" }
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://ordonezrenov.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Duplicado a propósito en cada función — el despliegue vía MCP no resuelve imports relativos
// entre funciones (a diferencia de `supabase functions deploy` por CLI). Ver notificar-visita.
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

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

const REMITENTE_BASE = 'reformasordonezeus@gmail.com';

async function obtenerAccessToken(supabase: SupabaseClient): Promise<string> {
  const { data: config, error } = await supabase
    .from('google_config')
    .select('refresh_token, refresh_token_gmail')
    .eq('id', 1)
    .maybeSingle();
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

async function enviarGmail(token: string, destinatario: string, asunto: string, cuerpoHtml: string): Promise<void> {
  const mensajeMime = [
    `From: ${REMITENTE_BASE}`,
    `To: ${destinatario}`,
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

function construirCuerpo(opts: {
  fr: boolean;
  nombre: string;
  tipoObra: string;
  zona: string;
  enlaceResena: string;
  referidosActivo: boolean;
  descuentoReferente: number;
  descuentoReferido: number;
}): string {
  const { fr, nombre, tipoObra, zona, enlaceResena, referidosActivo, descuentoReferente, descuentoReferido } = opts;

  const parrafoReferidos = referidosActivo
    ? fr
      ? `<p>Au fait — si vous connaissez quelqu'un qui envisage des travaux de rénovation, nous serions ravis de l'aider. En remerciement, vous recevriez ${descuentoReferente}% de remise sur vos prochains travaux avec nous, et cette personne ${descuentoReferido}% sur les siens. Il suffit de nous dire qui vous a recommandés quand elle nous contactera.</p>`
      : `<p>Por cierto — si conoce a alguien que esté pensando en reformar, nos encantaría ayudarle. Como agradecimiento, usted recibiría un ${descuentoReferente}% de descuento en su próxima obra con nosotros, y esa persona un ${descuentoReferido}% en la suya. Solo tiene que decirnos quién le recomendó cuando nos contacte.</p>`
    : '';

  if (fr) {
    return `<p>Bonjour ${nombre},</p><p>Ce fut un plaisir de travailler sur votre ${tipoObra} à ${zona}.<br>Nous espérons que le résultat a dépassé vos attentes.</p><p>Si vous êtes satisfait(e) de notre travail, nous vous serions très reconnaissants de nous laisser un avis sur Google. Cela ne prendra que 2 minutes :<br><a href="${enlaceResena}">${enlaceResena}</a></p>${parrafoReferidos}<p>Merci beaucoup de votre confiance.<br>Reformas Ordoñez</p>`;
  }
  return `<p>Estimado/a ${nombre},</p><p>Ha sido un placer trabajar en su ${tipoObra} en ${zona}.<br>Esperamos que el resultado haya superado sus expectativas.</p><p>Si está satisfecho/a con nuestro trabajo, le agradeceríamos mucho que nos dejara su opinión en Google. Solo le llevará 2 minutos:<br><a href="${enlaceResena}">${enlaceResena}</a></p>${parrafoReferidos}<p>Muchas gracias por confiar en nosotros.<br>Reformas Ordoñez</p>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (!esLlamadaAutorizada(req)) return jsonResponse({ error: 'No autorizado' }, 401);

  try {
    const { facturaId } = await req.json();
    if (!facturaId) return jsonResponse({ error: 'Falta "facturaId" en el body' }, 400);

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: f, error } = await supabase.from('facturas').select('*').eq('id', facturaId).maybeSingle();
    if (error || !f) return jsonResponse({ error: 'Factura no encontrada' }, 404);
    if (!f.cliente_email) return jsonResponse({ error: 'Esta factura no tiene email de cliente' }, 400);

    let visita: { tipo: string | null; zona: string | null } | null = null;
    if (f.visita_id) {
      const { data: v } = await supabase.from('visitas').select('tipo, zona').eq('id', f.visita_id).maybeSingle();
      visita = v ?? null;
    }

    const { data: empresaRow } = await supabase.from('empresa_config').select('datos').eq('id', 1).maybeSingle();
    const datos = (empresaRow?.datos ?? {}) as {
      referidos?: { activo?: boolean; descuentoReferente?: number; descuentoReferido?: number };
    };
    const referidosConfig = {
      activo: datos.referidos?.activo ?? false,
      descuentoReferente: datos.referidos?.descuentoReferente ?? 5,
      descuentoReferido: datos.referidos?.descuentoReferido ?? 5,
    };

    const token = f.resena_token || crypto.randomUUID();
    const enlaceResena = `${Deno.env.get('SUPABASE_URL')}/functions/v1/resena-redirect?t=${token}`;

    const fr = f.idioma === 'Français';
    const asunto = fr
      ? "Comment s'est passée votre rénovation ? Votre avis nous intéresse"
      : '¿Cómo fue su experiencia con Reformas Ordoñez? Nos gustaría conocer su opinión';
    const cuerpo = construirCuerpo({
      fr,
      nombre: (f.cliente_nombre ?? '').split(' ')[0] || f.cliente_nombre || '',
      tipoObra: visita?.tipo || (fr ? 'projet' : 'obra'),
      zona: visita?.zona || '',
      enlaceResena,
      referidosActivo: referidosConfig.activo,
      descuentoReferente: referidosConfig.descuentoReferente,
      descuentoReferido: referidosConfig.descuentoReferido,
    });

    const accessToken = await obtenerAccessToken(supabase);
    await enviarGmail(accessToken, f.cliente_email, asunto, cuerpo);

    const nuevoCanal = !f.resena_canal ? 'email' : f.resena_canal === 'whatsapp' ? 'ambos' : f.resena_canal;
    const { error: errorUpdate } = await supabase
      .from('facturas')
      .update({
        resena_token: token,
        resena_canal: nuevoCanal,
        resena_enviado_en: f.resena_enviado_en ?? new Date().toISOString(),
      })
      .eq('id', facturaId);
    if (errorUpdate) throw new Error(`Email enviado pero no se pudo actualizar la factura: ${errorUpdate.message}`);

    return jsonResponse({ ok: true });
  } catch (err) {
    return jsonResponse({ error: String(err instanceof Error ? err.message : err) }, 500);
  }
});
