// Edge Function: solicitud-web
//
// Recibe el formulario por pasos de ordonezfachadas.com (2026-10-02) y lo convierte en una
// solicitud del CRM (`solicitudes`, fuente `ordonezfachadas`) + evento `solicitud_entrada` del
// embudo + aviso por email a reformasordonezeus@gmail.com (petición de Gabriel).
//
// Pública a propósito (verify_jwt: false, desplegar con --no-verify-jwt): la llama un formulario
// web sin sesión. Defensas: CORS solo para el dominio de Fachadas, campo trampa `web` que un humano
// nunca rellena, validación de longitudes y un envío por teléfono cada 10 minutos.
//
// Body: { tipo, municipio, plazo, nombre, telefono, email?, descripcion?, idioma, pagina, web }
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { SMTPClient } from 'https://deno.land/x/denomailer/mod.ts';
import { codificarCabeceraMime, limpiarHtmlCorreo } from '../_shared/correo.ts';
import { esc } from '../_shared/html.ts';

const ORIGENES = ['https://ordonezfachadas.com', 'https://www.ordonezfachadas.com'];
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

async function enviarAviso(asunto: string, cuerpoHtml: string): Promise<void> {
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
          from: { ...mail.from, name: codificarCabeceraMime('Ordoñez Fachadas') },
        }),
      ],
    },
  });
  try {
    await client.send({ from: `Ordoñez Fachadas <${REMITENTE_ENVIO}>`, to: [DESTINATARIO], subject: asunto, content: 'auto', html: limpiarHtmlCorreo(cuerpoHtml) });
  } finally {
    await client.close();
  }
}

Deno.serve(async (req: Request) => {
  const cors = cabecerasCors(req);
  const responder = (cuerpo: unknown, status = 200) =>
    new Response(JSON.stringify(cuerpo), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return responder({ error: 'Método no permitido' }, 405);
  if (!ORIGENES.includes(req.headers.get('origin') ?? '')) return responder({ error: 'Origen no permitido' }, 403);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return responder({ error: 'JSON inválido' }, 400);
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
  const digitos = telefono.replace(/\D/g, '');

  if (!nombre || digitos.length < 9) return responder({ error: 'Nombre y teléfono obligatorios' }, 400);
  if (email && !EMAIL_VALIDO.test(email)) return responder({ error: 'Email no válido' }, 400);

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // Un envío por teléfono cada 10 minutos (doble clic, reenvíos, abuso simple).
  const haceDiezMin = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data: recientes, error: errorRecientes } = await supabase
    .from('solicitudes')
    .select('id, telefono')
    .eq('fuente', 'ordonezfachadas')
    .gte('created_at', haceDiezMin);
  if (errorRecientes) return responder({ error: errorRecientes.message }, 500);
  if ((recientes ?? []).some((s) => (s.telefono ?? '').replace(/\D/g, '').slice(-9) === digitos.slice(-9))) {
    return responder({ ok: true, duplicada: true });
  }

  const etiquetaPlazo: Record<string, string> = { urgente: 'Urgente', urgent: 'Urgente', meses: 'Próximos meses', mois: 'Próximos meses', info: 'Solo se informa' };
  const comentario = [
    descripcion,
    `Municipio: ${municipio || 'sin indicar'}`,
    `Plazo: ${etiquetaPlazo[plazo] ?? 'sin indicar'}`,
  ].filter(Boolean).join('\n');

  const { data: fila, error } = await supabase
    .from('solicitudes')
    .insert({
      fuente: 'ordonezfachadas',
      nombre,
      telefono,
      email: email || null,
      tipo_reforma: tipo || null,
      comentario_cliente: comentario,
      pagina_origen: pagina || null,
      idioma,
      estado: 'Nueva',
      tipo_solicitud: 'visita',
    })
    .select('id')
    .single();
  if (error) return responder({ error: error.message }, 500);

  const { error: errorFunnel } = await supabase
    .from('funnel_eventos')
    .insert({ etapa: 'solicitud_entrada', solicitud_id: fila.id, fuente: 'ordonezfachadas' });
  if (errorFunnel) console.error('funnel_eventos:', errorFunnel.message);

  // El aviso por email nunca hace fallar la solicitud: ya está guardada en el CRM.
  try {
    const urgente = plazo === 'urgente' || plazo === 'urgent';
    const filas = [
      ['Trabajo', tipo], ['Municipio', municipio], ['Plazo', etiquetaPlazo[plazo] ?? ''], ['Nombre', nombre],
      ['Teléfono', telefono], ['Email', email], ['Idioma', idioma === 'fr' ? 'Francés' : 'Español'], ['Página', pagina],
    ].filter(([, v]) => v).map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#666">${k}</td><td style="padding:4px 0"><b>${esc(v)}</b></td></tr>`).join('');
    await enviarAviso(
      `${urgente ? 'URGENTE · ' : ''}Nueva solicitud Ordoñez Fachadas · ${tipo || 'Sin tipo'} · ${municipio || 'sin municipio'}`,
      `<p>Ha entrado una solicitud desde ordonezfachadas.com. Ya está en Solicitudes del CRM.</p>
<table style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px">${filas}</table>
${descripcion ? `<p style="margin-top:12px"><b>Descripción:</b><br>${esc(descripcion).replace(/\n/g, '<br>')}</p>` : ''}`,
    );
  } catch (e) {
    console.error('Aviso por email:', e instanceof Error ? e.message : String(e));
  }

  return responder({ ok: true });
});
