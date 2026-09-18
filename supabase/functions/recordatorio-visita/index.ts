// Edge Function: recordatorio-visita
//
// Cron diario (07:00 UTC, ~8h hora local de España/Francia salvo el desfase de temporada propio
// de un cron en UTC — mismo criterio de aproximación ya aceptado en otras partes del CRM, ver
// distanciaEstimada en notificar-visita/index.ts) que manda al CLIENTE un recordatorio corto de su
// visita técnica el mismo día — petición de Gabriel 2026-09-11: la confirmación que ya manda
// notificar-visita se envía al agendar/reprogramar, días antes, y se olvida; un aviso la propia
// mañana es el que de verdad reduce los no-shows.
//
// No requiere body — recorre todas las visitas Pendiente de fecha_visita = hoy. Idempotente por
// visita (columna `recordatorio_enviado_en`, migración 20260911_visitas_recordatorio_enviado_en):
// una vez enviado con éxito no se vuelve a mandar aunque el cron se reinvoque el mismo día.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { SMTPClient } from 'https://deno.land/x/denomailer/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://ordonezrenov.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Duplicado en cada función (el despliegue vía MCP no resuelve imports relativos entre funciones) —
// mismo patrón que notificar-visita/index.ts y alerta-diaria/index.ts.
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
const REMITENTE_ENVIO = Deno.env.get('SMTP_USER') ?? REMITENTE_BASE;
const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Envío por SMTP directo (cuenta info@ordonezrenov.com en Hostinger, solo envío) en vez de la API
// de Gmail (2026-09-19, petición de Gabriel). Credenciales en secretos de Supabase.
async function enviarSmtp(destinatarios: string[], asunto: string, cuerpoHtml: string): Promise<void> {
  const client = new SMTPClient({
    connection: {
      hostname: Deno.env.get('SMTP_HOST')!,
      port: Number(Deno.env.get('SMTP_PORT') ?? '465'),
      tls: true,
      auth: { username: Deno.env.get('SMTP_USER')!, password: Deno.env.get('SMTP_PASS')! },
    },
  });
  try {
    await client.send({
      from: `Reformas Ordoñez <${REMITENTE_ENVIO}>`,
      to: destinatarios,
      subject: asunto,
      content: 'auto',
      html: cuerpoHtml,
    });
  } finally {
    await client.close();
  }
}

function pieCorreoAutomatico(fr: boolean): string {
  const texto = fr
    ? `Courriel automatique — merci de ne pas répondre à cette adresse. Pour toute question, contactez-nous à ${REMITENTE_BASE}.`
    : `Correo automático — no responder a esta dirección. Para cualquier consulta, escríbenos a ${REMITENTE_BASE}.`;
  return `<div style="color:#9ca3af;font-size:10px;margin-top:6px">${esc(texto)}</div>`;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fechaLegible(fecha: string | null): string {
  if (!fecha) return '—';
  return new Date(`${fecha}T00:00:00`).toLocaleDateString('es', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
}

function enlaceMaps(direccion: string, lat: number | null, lng: number | null): string {
  const query = lat != null && lng != null ? `${lat},${lng}` : direccion;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

// Plantilla corta a propósito (sin "Tipo de trabajo" ni datos internos) — es un recordatorio, la
// confirmación completa ya se mandó al agendar/reprogramar (construirHtmlCliente en
// notificar-visita/index.ts), no hace falta repetir todo.
function construirHtmlRecordatorio(opts: {
  fr: boolean;
  nombreCliente: string;
  fechaTxt: string;
  hora: string;
  direccionTexto: string;
  mapsUrl: string | null;
  telefonoEmpresa: string | null;
  emailEmpresa: string;
}): string {
  const viaTelefono = opts.telefonoEmpresa
    ? opts.fr
      ? `au ${esc(opts.telefonoEmpresa)} ou `
      : `al ${esc(opts.telefonoEmpresa)} o `
    : '';
  const t = opts.fr
    ? {
        eyebrow: 'Rappel de visite technique',
        saludo: `Bonjour${opts.nombreCliente ? ' ' + opts.nombreCliente : ''},`,
        intro: "Nous vous rappelons votre visite technique aujourd'hui :",
        adresse: 'Adresse',
        verMaps: 'Voir sur Google Maps',
        contacto: `Besoin de changer la date ou vous avez une question ? Contactez-nous ${viaTelefono}par email à ${esc(opts.emailEmpresa)}.`,
        firma: 'À bientôt,<br/>L\'équipe Reformas Ordoñez',
      }
    : {
        eyebrow: 'Recordatorio de visita técnica',
        saludo: `Hola${opts.nombreCliente ? ' ' + opts.nombreCliente : ''},`,
        intro: 'Te recordamos que hoy tienes tu visita técnica:',
        adresse: 'Dirección',
        verMaps: 'Ver en Google Maps',
        contacto: `¿Necesitas cambiar la fecha o tienes alguna duda? Escríbenos ${viaTelefono}por email a ${esc(opts.emailEmpresa)}.`,
        firma: 'Un saludo,<br/>El equipo de Reformas Ordoñez',
      };
  return `<div style="font-family:Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" style="max-width:560px;margin:0 auto" cellpadding="0" cellspacing="0">
    <tr><td style="background:#0f3d24;padding:20px 24px;border-radius:10px 10px 0 0">
      <div style="color:#ffffff;font-size:16px;font-weight:600">Reformas Ordoñez</div>
      <div style="color:#cdddd5;font-size:12px;margin-top:2px">${esc(t.eyebrow)}</div>
    </td></tr>
    <tr><td style="background:#ffffff;padding:24px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb">
      <p style="font-size:13px;color:#111827;margin:0 0 12px">${t.saludo}</p>
      <p style="font-size:13px;color:#111827;margin:0 0 6px">${esc(t.intro)}</p>
      <div style="background:#eaf2ed;border-radius:10px;padding:14px 16px;margin-bottom:12px">
        <div style="color:#1a5c38;font-weight:600;font-size:15px">${esc(opts.fechaTxt)} · ${esc(opts.hora)}</div>
      </div>

      <div style="font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#9ca3af;font-weight:600;margin:0 0 6px">${esc(t.adresse)}</div>
      <div style="font-size:13px;color:#111827;margin-bottom:10px">${esc(opts.direccionTexto)}</div>
      ${
        opts.mapsUrl
          ? `<a href="${opts.mapsUrl}" style="display:inline-block;background:#1a5c38;color:#ffffff;text-decoration:none;font-size:12px;font-weight:600;padding:8px 14px;border-radius:6px">${esc(t.verMaps)}</a>`
          : ''
      }

      <p style="font-size:12px;color:#6b7280;margin:16px 0 0">${t.contacto}</p>
      <p style="font-size:13px;color:#111827;margin:16px 0 0">${t.firma}</p>
    </td></tr>
    <tr><td style="background:#f8fafc;border:1px solid #e5e7eb;border-top:1px solid #eef2f7;border-radius:0 0 10px 10px;padding:14px 24px;text-align:center">
      <div style="color:#9ca3af;font-size:11px">Reformas Ordoñez</div>
      ${pieCorreoAutomatico(opts.fr)}
    </td></tr>
  </table>
</div>`;
}

type VisitaHoy = {
  id: string;
  nombre: string | null;
  apellidos: string | null;
  telefono: string | null;
  email: string | null;
  idioma: string | null;
  direccion: string | null;
  direccion_extra: string | null;
  lat: number | null;
  lng: number | null;
  fecha_visita: string;
  hora_visita: string;
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (!esLlamadaAutorizada(req)) return jsonResponse({ ok: false, error: 'No autorizado' }, 401);

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const hoy = new Date().toISOString().slice(0, 10);

    const { data: visitasHoy, error: errorVisitas } = await supabase
      .from('visitas')
      .select('id, nombre, apellidos, telefono, email, idioma, direccion, direccion_extra, lat, lng, fecha_visita, hora_visita')
      .eq('estado', 'Pendiente')
      .eq('fecha_visita', hoy)
      .is('eliminado_en', null)
      .is('recordatorio_enviado_en', null);
    if (errorVisitas) return jsonResponse({ ok: false, error: `No se pudieron leer las visitas: ${errorVisitas.message}` }, 500);

    const visitas = (visitasHoy ?? []) as VisitaHoy[];
    if (visitas.length === 0) {
      return jsonResponse({ ok: true, enviados: 0, motivo: 'Sin visitas pendientes hoy sin recordatorio enviado' });
    }

    const { data: empresaRow } = await supabase.from('empresa_config').select('datos').eq('id', 1).maybeSingle();
    const datos = (empresaRow?.datos ?? {}) as { es?: { telefono?: string; email?: string }; fr?: { telefono?: string; email?: string } };

    let enviados = 0;
    const fallidos: string[] = [];
    for (const v of visitas) {
      if (!v.email || !EMAIL_VALIDO.test(v.email)) continue;
      try {
        const fr = v.idioma === 'Français';
        const contactoEmpresa = fr ? datos.fr : datos.es;
        const hora = String(v.hora_visita).slice(0, 5);
        const direccionTexto = [v.direccion, v.direccion_extra].filter(Boolean).join(' — ') || 'No indicada';
        const mapsUrl = v.direccion ? enlaceMaps(v.direccion, v.lat, v.lng) : null;
        const asunto = fr
          ? `Rappel — votre visite technique aujourd'hui à ${hora}`
          : `Recordatorio — tu visita técnica hoy a las ${hora}`;
        const cuerpo = construirHtmlRecordatorio({
          fr,
          nombreCliente: v.nombre ?? '',
          fechaTxt: fechaLegible(v.fecha_visita),
          hora,
          direccionTexto,
          mapsUrl,
          telefonoEmpresa: contactoEmpresa?.telefono || null,
          emailEmpresa: contactoEmpresa?.email || REMITENTE_BASE,
        });
        await enviarSmtp([v.email], asunto, cuerpo);

        const { error: errorMarcar } = await supabase.from('visitas').update({ recordatorio_enviado_en: hoy }).eq('id', v.id);
        if (errorMarcar) console.error(`No se pudo marcar recordatorio_enviado_en para la visita ${v.id}:`, errorMarcar.message);

        enviados++;
      } catch (err) {
        console.error(`No se pudo enviar el recordatorio de la visita ${v.id}:`, String(err instanceof Error ? err.message : err));
        fallidos.push(v.id);
      }
    }

    return jsonResponse({ ok: true, enviados, fallidos });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err instanceof Error ? err.message : err) }, 500);
  }
});
