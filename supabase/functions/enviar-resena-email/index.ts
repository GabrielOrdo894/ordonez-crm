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
import { esLlamadaAutorizada } from '../_shared/autorizacion.ts';
import { esc } from '../_shared/html.ts';
import { codificarCabeceraMime, limpiarHtmlCorreo } from '../_shared/correo.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://ordonezrenov.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

const REMITENTE_BASE = 'reformasordonezeus@gmail.com';
const REMITENTE_ENVIO = Deno.env.get('SMTP_USER') ?? REMITENTE_BASE;

// Envío por SMTP directo (cuenta info@ordonezrenov.com en Hostinger, solo envío) en vez de la API
// de Gmail (2026-09-19, petición de Gabriel). Credenciales en secretos de Supabase.
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
      html: limpiarHtmlCorreo(cuerpoHtml),
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
  const { fr, enlaceResena, referidosActivo, descuentoReferente, descuentoReferido } = opts;
  // Escapados: el nombre puede venir del formulario web público (auditoría 2026-10-01).
  const nombre = esc(opts.nombre);
  const tipoObra = esc(opts.tipoObra);
  const zona = esc(opts.zona);

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
  if (!(await esLlamadaAutorizada(req))) return jsonResponse({ error: 'No autorizado' }, 401);

  try {
    const { facturaId, reenviar } = await req.json();
    if (!facturaId) return jsonResponse({ error: 'Falta "facturaId" en el body' }, 400);

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: f, error } = await supabase.from('facturas').select('*').eq('id', facturaId).maybeSingle();
    if (error || !f) return jsonResponse({ error: 'Factura no encontrada' }, 404);
    if (!f.cliente_email) return jsonResponse({ error: 'Esta factura no tiene email de cliente' }, 400);
    // Idempotente (auditoría 2026-10-01): si ya se mandó por email, no se repite salvo que se pida
    // expresamente. Antes, si el envío salía bien pero fallaba la marca, resena-automatica lo
    // volvía a mandar al día siguiente.
    if (!reenviar && (f.resena_canal === 'email' || f.resena_canal === 'ambos')) {
      return jsonResponse({ ok: true, yaEnviado: true });
    }

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

    // Se marca ANTES de enviar y se deshace si el envío falla: así un fallo de la marca nunca deja un
    // email enviado sin registrar (y repetido al día siguiente).
    const nuevoCanal = !f.resena_canal ? 'email' : f.resena_canal === 'whatsapp' ? 'ambos' : f.resena_canal;
    const { error: errorUpdate } = await supabase
      .from('facturas')
      .update({
        resena_token: token,
        resena_canal: nuevoCanal,
        resena_enviado_en: f.resena_enviado_en ?? new Date().toISOString(),
      })
      .eq('id', facturaId);
    if (errorUpdate) throw new Error(`No se pudo marcar la factura antes de enviar: ${errorUpdate.message}`);

    try {
      await enviarSmtp(f.cliente_email, asunto, cuerpo);
    } catch (errorEnvio) {
      const { error: errorVuelta } = await supabase
        .from('facturas')
        .update({ resena_canal: f.resena_canal, resena_enviado_en: f.resena_enviado_en })
        .eq('id', facturaId);
      if (errorVuelta) console.error('enviar-resena-email: no se pudo deshacer la marca:', errorVuelta.message);
      throw errorEnvio;
    }

    return jsonResponse({ ok: true });
  } catch (err) {
    return jsonResponse({ error: String(err instanceof Error ? err.message : err) }, 500);
  }
});
