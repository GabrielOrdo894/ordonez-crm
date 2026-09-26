// Edge Function: recibe el webhook de Documenso cuando un presupuesto se firma
// y lo marca automáticamente como firmado + Aceptado. Se registra en Documenso
// (Settings → Webhooks) apuntando a esta función. Ver docs/tecnico/documenso.md.
//
// Desde 2026-09-10 también: (1) descarga el PDF ya firmado de Documenso y lo guarda en el bucket
// privado `presupuestos-firmados` para poder descargarlo desde el CRM, y (2) avisa por email a
// reformasordonezeus@gmail.com — hasta ahora la firma solo se veía si alguien entraba al CRM
// (hallazgo real de Gabriel: presupuestos enviados sin el enlace de firma y sin ningún aviso al
// firmarse). Ambos pasos son best-effort: si fallan, se loguean pero no revierten el
// firmado/Aceptado ya guardado, que es lo importante.
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { SMTPClient } from 'https://deno.land/x/denomailer/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-documenso-secret',
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

// Compara hasheando ambos valores (SHA-256, longitud fija) byte a byte sin cortocircuitar, en vez
// de `!==` directo sobre las cadenas — un timing attack sobre un `!==` normal podría, en teoría,
// deducir el secreto carácter a carácter por cuánto tarda en fallar la comparación (riesgo bajo en
// un webhook de bajo volumen, pero barato de cerrar del todo). Corregido 2026-09-10.
async function igualesEnTiempoConstante(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [hashA, hashB] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ]);
  const viewA = new Uint8Array(hashA);
  const viewB = new Uint8Array(hashB);
  let diff = 0;
  for (let i = 0; i < viewA.length; i++) diff |= viewA[i] ^ viewB[i];
  return diff === 0;
}

// Autoalojado desde 2026-09-14 (antes app.documenso.com de pago) — ver docs/tecnico/documenso.md.
const DOCUMENSO_API = 'https://firma.ordonezrenov.com/api/v2';

async function llamarDocumensoJson(path: string, apiKey: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${DOCUMENSO_API}${path}`, { headers: { Authorization: apiKey } });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.message ?? data?.error ?? `Documenso devolvió ${res.status} en ${path}`);
  return data;
}

// Descarga el PDF ya firmado (con firma + audit trail) y lo guarda en el bucket privado
// `presupuestos-firmados` — el enlace de firma de Documenso deja de servir el documento una vez
// completado, así que sin esto no había forma de recuperar el PDF firmado desde el CRM.
async function descargarYGuardarPdfFirmado(
  supabase: SupabaseClient,
  presupuesto: { id: string; documenso_envelope_id: string | null },
  apiKey: string,
): Promise<string> {
  if (!presupuesto.documenso_envelope_id) throw new Error('El presupuesto no tiene envelope de Documenso');

  const detalle = await llamarDocumensoJson(`/envelope/${presupuesto.documenso_envelope_id}`, apiKey);
  // La API del self-hosted devuelve la clave `envelopeItems` (no `items`, que sí usaba
  // app.documenso.com) — bug real encontrado 2026-09-14: fallaba en silencio (best-effort) y
  // dejaba `documenso_pdf_firmado_path` en null tras cada firma.
  const items = (detalle.envelopeItems ?? detalle.items ?? (detalle.envelope as Record<string, unknown> | undefined)?.items) as
    | { id: string }[]
    | undefined;
  const itemId = items?.[0]?.id;
  if (!itemId) throw new Error('El envelope no tiene ningún item para descargar');

  const res = await fetch(`${DOCUMENSO_API}/envelope/item/${itemId}/download?version=signed`, {
    headers: { Authorization: apiKey },
  });
  if (!res.ok) throw new Error(`No se pudo descargar el PDF firmado (${res.status})`);
  const pdfBytes = new Uint8Array(await res.arrayBuffer());

  const path = `${presupuesto.id}.pdf`;
  const { error: errorSubida } = await supabase.storage
    .from('presupuestos-firmados')
    .upload(path, pdfBytes, { contentType: 'application/pdf', upsert: true });
  if (errorSubida) throw new Error(`No se pudo guardar el PDF firmado en Storage: ${errorSubida.message}`);

  const { error: errorUpdate } = await supabase
    .from('presupuestos')
    .update({ documenso_pdf_firmado_path: path })
    .eq('id', presupuesto.id);
  if (errorUpdate) throw new Error(`No se pudo guardar la ruta del PDF firmado: ${errorUpdate.message}`);

  return path;
}

// --- Envío de email de aviso — SMTP directo (cuenta info@ordonezrenov.com), mismo patrón que
// supabase/functions/notificar-visita (duplicado a propósito, un Edge Function no puede importar
// código de otro, ver más arriba). ---

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

async function enviarSmtp(destinatarios: string[], asunto: string, cuerpoHtml: string): Promise<void> {
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
      from: `Reformas Ordoñez <${Deno.env.get('SMTP_USER') ?? REMITENTE_BASE}>`,
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

// Misma plantilla de marca (cabecera verde oscuro + tarjeta blanca + botón de acción) que ya usa
// notificar-visita para el email de confirmación de visita al cliente — evita que este quede como
// un texto plano suelto, y pone el enlace en un botón en vez de la URL entera visible (petición de
// Gabriel 2026-09-14).
function htmlAvisoFirmaCliente(opts: { fr: boolean; nombre: string; numero: string; signedUrl: string }): string {
  const t = opts.fr
    ? {
        eyebrow: 'Devis signé',
        saludo: `Bonjour${opts.nombre ? ' ' + opts.nombre : ''},`,
        intro: `Nous confirmons la réception de votre signature électronique du devis <strong>${esc(opts.numero)}</strong>.`,
        boton: 'Télécharger ma copie signée',
        firma: 'Cordialement,<br/>L\'équipe Reformas Ordoñez',
      }
    : {
        eyebrow: 'Presupuesto firmado',
        saludo: `Hola${opts.nombre ? ' ' + opts.nombre : ''},`,
        intro: `Confirmamos que hemos recibido tu firma electrónica del presupuesto <strong>${esc(opts.numero)}</strong>.`,
        boton: 'Descargar mi copia firmada',
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
      <p style="font-size:13px;color:#111827;margin:0 0 16px">${t.intro}</p>
      <a href="${opts.signedUrl}" style="display:inline-block;background:#1a5c38;color:#ffffff;text-decoration:none;font-size:13px;font-weight:600;padding:10px 18px;border-radius:6px">${esc(t.boton)}</a>
      <p style="font-size:13px;color:#111827;margin:20px 0 0">${t.firma}</p>
    </td></tr>
    <tr><td style="background:#f8fafc;border:1px solid #e5e7eb;border-top:1px solid #eef2f7;border-radius:0 0 10px 10px;padding:14px 24px;text-align:center">
      <div style="color:#9ca3af;font-size:11px">Reformas Ordoñez</div>
      ${pieCorreoAutomatico(opts.fr)}
    </td></tr>
  </table>
</div>`;
}

const REMITENTE_BASE = 'reformasordonezeus@gmail.com';

// Desde 2026-09-14 los checkboxes de notificación propios de Documenso están desactivados
// (Gabriel: "sacar el enlace y luego nosotros lo enviamos, eso es justo lo que nosotros
// hacemos") — el cliente ya no recibe ningún email de Documenso ni al firmar. Sin esto, la
// firma quedaba confirmada solo en el CRM y el cliente nunca se enteraba ni podía descargar su
// copia firmada. Sustituye esa notificación con un email propio, ya en el idioma real del
// presupuesto (mismo criterio bilingüe que el resto de documentos del CRM).
async function avisarFirmaAlClientePorEmail(
  supabase: SupabaseClient,
  presupuesto: { numero: string | null; cliente_nombre: string | null; cliente_email: string | null; idioma: string | null },
  pdfPath: string,
): Promise<void> {
  if (!presupuesto.cliente_email) throw new Error('El presupuesto no tiene email de cliente');

  const { data: signedUrlData, error: errorSignedUrl } = await supabase.storage
    .from('presupuestos-firmados')
    .createSignedUrl(pdfPath, 60 * 60 * 24 * 30); // 30 días — tiempo de sobra para que el cliente lo descargue
  if (errorSignedUrl || !signedUrlData) throw new Error(`No se pudo generar el enlace de descarga: ${errorSignedUrl?.message}`);

  const esFrances = presupuesto.idioma === 'Français';
  const numero = presupuesto.numero ?? '';
  const nombre = presupuesto.cliente_nombre ?? '';

  const asunto = esFrances ? `Devis ${numero} signé — copie pour vos dossiers` : `Presupuesto ${numero} firmado — copia para tus archivos`;
  const cuerpo = htmlAvisoFirmaCliente({ fr: esFrances, nombre, numero, signedUrl: signedUrlData.signedUrl });

  await enviarSmtp([presupuesto.cliente_email], asunto, cuerpo);
}

async function avisarFirmaPorEmail(
  presupuesto: { numero: string | null; cliente_nombre: string | null },
  firmaNombre: string | null,
): Promise<void> {
  const asunto = `Presupuesto ${presupuesto.numero ?? ''} firmado — ${presupuesto.cliente_nombre ?? 'cliente'}`;
  const cuerpo = `<div style="font-family:Helvetica,Arial,sans-serif;font-size:14px;color:#111827">
    <p><strong>${presupuesto.cliente_nombre ?? 'El cliente'}</strong> ha firmado electrónicamente el presupuesto <strong>${
      presupuesto.numero ?? ''
    }</strong> con Documenso${firmaNombre ? ` (firmado por ${firmaNombre})` : ''}.</p>
    <p>El presupuesto ya se ha marcado como Aceptado en el CRM, y el PDF firmado está disponible para descargar desde su ficha.</p>
    ${pieCorreoAutomatico(false)}
  </div>`;
  await enviarSmtp([REMITENTE_BASE], asunto, cuerpo);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // Falla cerrado: si el secreto no está configurado como secret de la función, se rechaza toda
  // petición en vez de aceptarlas todas sin comprobar nada (ver docs/tecnico/documenso.md § 4 y 6).
  const secretoEsperado = Deno.env.get('DOCUMENSO_WEBHOOK_SECRET');
  const secretoRecibido = req.headers.get('x-documenso-secret');
  if (!secretoEsperado || !secretoRecibido || !(await igualesEnTiempoConstante(secretoRecibido, secretoEsperado))) {
    return jsonResponse({ error: 'Firma de webhook inválida' }, 401);
  }

  const body = await req.json().catch(() => null);
  if (!body) return jsonResponse({ error: 'Cuerpo de la petición inválido' }, 400);

  const evento = body.event ?? body.type;
  if (evento !== 'DOCUMENT_COMPLETED' && evento !== 'ENVELOPE_COMPLETED') {
    return jsonResponse({ ok: true, ignorado: evento ?? 'sin evento' });
  }

  const payload = body.payload ?? body.data ?? {};
  const externalId: string | null = payload.externalId ?? payload.document?.externalId ?? payload.envelope?.externalId ?? null;
  const envelopeIdRaw = payload.id ?? payload.envelopeId ?? payload.document?.id ?? null;
  const envelopeId = envelopeIdRaw != null ? String(envelopeIdRaw) : null;

  if (!externalId && !envelopeId) {
    return jsonResponse({ ok: true, ignorado: 'sin externalId ni envelopeId en el payload' });
  }

  const recipientes: { name?: string; email?: string; signingStatus?: string }[] = payload.recipients ?? [];
  const firmante = recipientes.find((r) => r.signingStatus === 'SIGNED') ?? recipientes[0];
  const firmaNombre = firmante?.name ?? firmante?.email ?? null;

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // .is('eliminado_en', null): un presupuesto en la papelera (soft-delete, no purgado todavía)
  // no debe poder marcarse Aceptado/firmado mientras sigue oculto ahí — quedaría "aceptado y
  // firmado" de verdad sin que nadie lo vea salvo que entre a la papelera a propósito (bug real
  // corregido 2026-08-18).
  const busqueda = supabase
    .from('presupuestos')
    .select('id, numero, visita_id, cliente_nombre, cliente_email, idioma, firmado, documenso_envelope_id, estado')
    .is('eliminado_en', null)
    .limit(1);
  const { data: presupuestos, error: buscarError } = externalId
    ? await busqueda.eq('id', externalId)
    : await busqueda.eq('documenso_envelope_id', envelopeId);
  if (buscarError) return jsonResponse({ error: buscarError.message }, 500);

  const presupuesto = presupuestos?.[0];
  if (!presupuesto) return jsonResponse({ ok: true, ignorado: 'presupuesto no encontrado' });
  if (presupuesto.firmado) return jsonResponse({ ok: true, ignorado: 'ya estaba firmado' });
  // Un presupuesto ya Rechazado a mano no debe revertirse a Aceptado solo porque el cliente firma
  // más tarde con un enlace todavía activo (nunca se cancela el envelope en Documenso al rechazar,
  // no existe esa integración) — hallazgo real de seguridad/negocio, auditoría 2026-09-21: caso
  // real P-2026-0066, Rechazado pero con documenso_estado='ENVIADO' sin firmar. Se ignora el
  // webhook y se deja constancia para revisión manual en vez de sobrescribir la decisión.
  if (presupuesto.estado === 'Rechazado') {
    const { error: errorEventoIgnorado } = await supabase.from('documento_eventos').insert({
      documento_tipo: 'presupuesto',
      documento_id: presupuesto.id,
      evento: 'Firma de Documenso recibida pero IGNORADA — el presupuesto ya estaba Rechazado. Revisar a mano si corresponde.',
    });
    if (errorEventoIgnorado) console.error('No se pudo registrar el evento de firma ignorada:', errorEventoIgnorado.message);
    return jsonResponse({ ok: true, ignorado: 'presupuesto ya estaba Rechazado, no se sobrescribe' });
  }

  const { error: updateError } = await supabase
    .from('presupuestos')
    .update({
      firmado: true,
      firma_nombre: firmaNombre,
      firma_fecha: new Date().toISOString(),
      firma_metodo: 'documenso',
      documenso_estado: 'COMPLETED',
      estado: 'Aceptado',
    })
    .eq('id', presupuesto.id);
  if (updateError) return jsonResponse({ error: updateError.message }, 500);

  // Registros secundarios: un fallo no revierte la firma ya guardada, pero ahora queda en el log de la
  // función en vez de perderse en silencio (auditoría 2026-09-26).
  if (presupuesto.visita_id) {
    const { error: errorNota } = await supabase.from('notas_cliente').insert({
      visita_id: presupuesto.visita_id,
      tipo: 'sistema',
      texto: `Presupuesto ${presupuesto.numero ?? ''} firmado electrónicamente con Documenso — marcado como Aceptado`,
      autor: 'Sistema',
    });
    if (errorNota) console.error('No se pudo registrar la nota de sistema de la firma:', errorNota.message);
  }
  const { error: errorEvento } = await supabase.from('documento_eventos').insert({
    documento_tipo: 'presupuesto',
    documento_id: presupuesto.id,
    evento: 'Firmado electrónicamente (Documenso) — marcado como Aceptado',
  });
  if (errorEvento) console.error('No se pudo registrar el evento de firma:', errorEvento.message);
  // "Aceptado" implica que antes se envió — se registra también esa etapa si no existía todavía
  // (mismo criterio que registrarEtapaPresupuestoConBackfill del frontend, duplicado aquí porque
  // Deno no puede importar funnelTracking.ts). presupuesto_firmado ya no es una etapa del embudo
  // desde el rediseño 2026-09-16 (sustituida por presupuesto_aceptado) — este webhook se había
  // quedado desactualizado y un presupuesto firmado por Documenso no contaba en ningún escalón
  // visible del embudo (hallazgo real, 2026-09-20).
  const registrarFunnelPresupuesto = async (etapa: string) => {
    const { data: existente, error: errorExistente } = await supabase
      .from('funnel_eventos')
      .select('id')
      .eq('etapa', etapa)
      .eq('presupuesto_id', presupuesto.id)
      .limit(1);
    if (errorExistente) {
      console.error(`No se pudo comprobar el evento de funnel ${etapa}:`, errorExistente.message);
      return;
    }
    if (existente && existente.length > 0) return;
    const { error: errorFunnel } = await supabase.from('funnel_eventos').insert({ etapa, presupuesto_id: presupuesto.id });
    if (errorFunnel) console.error(`No se pudo registrar el evento de funnel ${etapa}:`, errorFunnel.message);
  };
  await registrarFunnelPresupuesto('presupuesto_enviado');
  await registrarFunnelPresupuesto('presupuesto_aceptado');

  // Best-effort: el presupuesto ya quedó firmado/Aceptado arriba pase lo que pase aquí abajo.
  const apiKey = Deno.env.get('DOCUMENSO_API_KEY');
  let pdfPath: string | null = null;
  if (apiKey) {
    try {
      pdfPath = await descargarYGuardarPdfFirmado(supabase, presupuesto, apiKey);
    } catch (err) {
      console.error('No se pudo descargar/guardar el PDF firmado:', err instanceof Error ? err.message : err);
    }
  } else {
    console.error('Falta el secreto DOCUMENSO_API_KEY — no se pudo descargar el PDF firmado');
  }
  try {
    await avisarFirmaPorEmail(presupuesto, firmaNombre);
  } catch (err) {
    console.error('No se pudo avisar por email de la firma:', err instanceof Error ? err.message : err);
  }
  if (pdfPath) {
    try {
      await avisarFirmaAlClientePorEmail(supabase, presupuesto, pdfPath);
    } catch (err) {
      console.error('No se pudo avisar al cliente por email de la firma:', err instanceof Error ? err.message : err);
    }
  }

  // El pipeline ya se sincroniza solo: el UPDATE de `presupuestos.estado` de más arriba dispara el
  // trigger `pipeline_sync_presupuestos` (migración `pipeline_recalculo_automatico_trigger`,
  // 2026-09-21) que recalcula estado_pipeline/pipeline_etapa_maxima de la visita exacta enlazada
  // por presupuesto.visita_id — sustituye este bloque manual, que hacía lo mismo pero buscando "la
  // visita más reciente por teléfono" (menos preciso) y solo se ejecutaba en este webhook, no en
  // el resto de caminos que cambian un presupuesto (ver hallazgo de la auditoría 2026-09-21: el
  // pipeline se quedaba desincronizado en la mayoría de sitios por depender de que cada uno
  // recordara sincronizarlo a mano).
  return jsonResponse({ ok: true });
});
