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
// Body: { tipo, municipio, plazo, nombre, telefono, email?, descripcion?, idioma, pagina, version?, web }
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { SMTPClient } from 'https://deno.land/x/denomailer/mod.ts';
import { codificarCabeceraMime, limpiarHtmlCorreo } from '../_shared/correo.ts';
import { esc } from '../_shared/html.ts';

const ORIGENES_FACHADAS = ['https://ordonezfachadas.com', 'https://www.ordonezfachadas.com'];
const ORIGENES_RENOV = ['https://ordonezrenov.com', 'https://www.ordonezrenov.com'];
const ORIGENES_COSTABATH = ['https://costabath.com', 'https://www.costabath.com'];
const ORIGENES_STUDIO = ['https://ordonezstudio.com', 'https://www.ordonezstudio.com'];
const ORIGENES = [...ORIGENES_FACHADAS, ...ORIGENES_RENOV, ...ORIGENES_COSTABATH, ...ORIGENES_STUDIO];
const FUENTES_RENOV = ['calculadora_bano', 'calculadora_general', 'pdf_bano_4m2', 'foto_web', 'estimador_plazos'];
const ETIQUETA_FUENTE_RENOV: Record<string, string> = {
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
  const version = texto(body.version, 40);
  // Desde ordonezrenov.com también envían las calculadoras, el PDF del blog y los formularios del blog
  // (2026-10-27): mandan su `fuente` en el cuerpo; cualquier otro valor se trata como el asistente web.
  const fuenteRenov = FUENTES_RENOV.includes(texto(body.fuente, 40)) ? texto(body.fuente, 40) : `asistente_web_${idioma}`;
  const fuente = esRenov ? fuenteRenov : esCostabath ? 'costabath' : esStudio ? 'ordonezstudio' : 'ordonezfachadas';
  const origenTexto = esRenov ? (ETIQUETA_FUENTE_RENOV[fuenteRenov] ?? 'el asistente de ordonezrenov.com') : null;
  const marca = esRenov ? 'Reformas Ordoñez' : esCostabath ? 'Costabath' : esStudio ? 'Ordoñez Studio' : 'Ordoñez Fachadas';
  const dominio = esCostabath ? 'costabath.com' : esStudio ? 'ordonezstudio.com' : 'ordonezfachadas.com';
  const digitos = telefono.replace(/\D/g, '');

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
  const comentario = [
    descripcion,
    esStudio && !municipio ? '' : `Municipio: ${municipio || 'sin indicar'}`,
    esStudio && !plazo ? '' : `Plazo: ${etiquetaPlazo[plazo] ?? 'sin indicar'}`,
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

  // El aviso por email nunca hace fallar la solicitud: ya está guardada en el CRM.
  try {
    const urgente = plazo === 'urgente' || plazo === 'urgent';
    const filas = [
      ['Trabajo', tipo], ['Municipio', municipio], ['Plazo', etiquetaPlazo[plazo] ?? ''], ['Nombre', nombre],
      ['Teléfono', telefono], ['Email', email], ['Idioma', idioma === 'fr' ? 'Francés' : 'Español'], ['Página', pagina], ['Plantilla', version],
    ].filter(([, v]) => v).map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#666">${k}</td><td style="padding:4px 0"><b>${esc(v)}</b></td></tr>`).join('');
    await enviarAviso(
      marca,
      `${urgente ? 'URGENTE · ' : ''}Nueva solicitud ${esRenov ? (fuenteRenov.startsWith('asistente') ? 'web' : `· ${origenTexto}`) : marca} · ${tipo || 'Sin tipo'}${esStudio && !municipio ? '' : ` · ${municipio || 'sin municipio'}`}`,
      `<p>Ha entrado una solicitud desde ${esRenov ? origenTexto : dominio}. Ya está en Solicitudes del CRM.</p>
<table style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px">${filas}</table>
${descripcion ? `<p style="margin-top:12px"><b>Descripción:</b><br>${esc(descripcion).replace(/\n/g, '<br>')}</p>` : ''}`,
    );
  } catch (e) {
    console.error('Aviso por email:', e instanceof Error ? e.message : String(e));
  }

  // El asistente reenvía el id a asistente-eventos para enlazar su ruta con la solicitud.
  return responder({ ok: true, id: fila.id });
});
