// Edge Function: enviar-resena-email
//
// Envía por Gmail (cuenta reformasordonezeus@gmail.com, mismo mecanismo que notificar-visita) el
// mensaje de petición de reseña de Google + invitación al programa de referidos, a la factura
// indicada. Sustituye al mailto: manual del antiguo ResenaGoogleBanner — ahora el envío queda
// registrado de verdad (Enviado en Gmail) en vez de depender de que alguien le dé a "enviar" en la
// pestaña que se abre. El enlace de reseña pasa por resena-redirect para poder medir el clic real.
//
// Body esperado: { "facturaId": "<uuid>" }
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { SMTPClient } from 'https://deno.land/x/denomailer/mod.ts';

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
const REMITENTE_ENVIO = Deno.env.get('SMTP_USER') ?? REMITENTE_BASE;

// Envío por SMTP directo (cuenta info@ordonezrenov.com en Hostinger, solo envío) en vez de la API
// de Gmail (2026-09-19, petición de Gabriel). Credenciales en secretos de Supabase.
// Codificación RFC 2047 de cabeceras con caracteres no ASCII (asunto, nombre del remitente).
// denomailer lo hace mal por su cuenta: usa Q-encoding con espacios sin codificar y, si la palabra
// codificada pasa de 74 caracteres, mete un salto de línea en medio de la cabecera — el servidor
// da por terminadas las cabeceras ahí, From/To/Content-Type acaban dentro del cuerpo y Gmail manda
// el mensaje a spam (caso real: aviso "Visita agendada — Kepa Etxeburua García · ..." del
// 2026-09-21). Aquí se codifica en Base64 por trozos de ≤ 45 bytes (≤ 72 caracteres codificados,
// bajo el límite de 75 de la RFC) separados por espacio, y se inyecta vía un preprocesador de
// denomailer (ver enviarSmtp) porque pasarlo ya codificado a send() no sirve. Misma copia en las
// 6 funciones que envían por SMTP (una Edge Function no puede importar de otra).
function codificarCabeceraMime(texto: string): string {
  if (!/[^ -~]/.test(texto)) return texto; // nada fuera del ASCII imprimible: se deja tal cual
  const enc = new TextEncoder();
  const trozos: string[] = [];
  let actual = '';
  for (const ch of texto) {
    if (enc.encode(actual + ch).length > 45) {
      trozos.push(actual);
      actual = ch;
    } else {
      actual += ch;
    }
  }
  if (actual) trozos.push(actual);
  return trozos.map((t) => `=?UTF-8?B?${btoa(String.fromCharCode(...enc.encode(t)))}?=`).join(' ');
}

async function enviarSmtp(destinatario: string, asunto: string, cuerpoHtml: string): Promise<void> {
  const client = new SMTPClient({
    connection: {
      hostname: Deno.env.get('SMTP_HOST')!,
      port: Number(Deno.env.get('SMTP_PORT') ?? '465'),
      tls: true,
      auth: { username: Deno.env.get('SMTP_USER')!, password: Deno.env.get('SMTP_PASS')! },
    },
    // El asunto y el nombre del remitente se sobrescriben YA codificados en un preprocesador, que
    // denomailer aplica DESPUÉS de resolver la configuración: si se le pasan codificados directamente
    // en send(), la librería los vuelve a codificar (comprueba `startsWith('=?')`) y rompe la cabecera
    // igual que antes (comprobado con un envío real, 2026-09-21).
    client: {
      preprocessors: [
        (mail) => ({
          ...mail,
          subject: codificarCabeceraMime(asunto),
          from: { ...mail.from, name: codificarCabeceraMime('Reformas Ordoñez') },
        }),
      ],
    },
  });
  try {
    await client.send({
      from: `Reformas Ordoñez <${REMITENTE_ENVIO}>`,
      to: [destinatario],
      subject: asunto,
      content: 'auto',
      html: cuerpoHtml,
    });
  } finally {
    await client.close();
  }
}

function pieCorreoAutomatico(fr: boolean): string {
  return fr
    ? `<p style="color:#9ca3af;font-size:11px">Courriel automatique — merci de ne pas répondre à cette adresse. Pour toute question, contactez-nous à ${REMITENTE_BASE}.</p>`
    : `<p style="color:#9ca3af;font-size:11px">Correo automático — no responder a esta dirección. Para cualquier consulta, escríbenos a ${REMITENTE_BASE}.</p>`;
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
    return `<p>Bonjour ${nombre},</p><p>Ce fut un plaisir de travailler sur votre ${tipoObra} à ${zona}.<br>Nous espérons que le résultat a dépassé vos attentes.</p><p>Si vous êtes satisfait(e) de notre travail, nous vous serions très reconnaissants de nous laisser un avis sur Google. Cela ne prendra que 2 minutes :<br><a href="${enlaceResena}">${enlaceResena}</a></p>${parrafoReferidos}<p>Merci beaucoup de votre confiance.<br>Reformas Ordoñez</p>${pieCorreoAutomatico(true)}`;
  }
  return `<p>Estimado/a ${nombre},</p><p>Ha sido un placer trabajar en su ${tipoObra} en ${zona}.<br>Esperamos que el resultado haya superado sus expectativas.</p><p>Si está satisfecho/a con nuestro trabajo, le agradeceríamos mucho que nos dejara su opinión en Google. Solo le llevará 2 minutos:<br><a href="${enlaceResena}">${enlaceResena}</a></p>${parrafoReferidos}<p>Muchas gracias por confiar en nosotros.<br>Reformas Ordoñez</p>${pieCorreoAutomatico(false)}`;
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

    await enviarSmtp(f.cliente_email, asunto, cuerpo);

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
