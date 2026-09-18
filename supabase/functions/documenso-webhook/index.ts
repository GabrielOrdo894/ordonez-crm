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

type EstadoVisita = string;
type SenalesPipeline = {
  visitaEstado: EstadoVisita | null;
  visitaTieneFecha: boolean;
  presupuestos: { estado: string }[];
  proyectoEstado: string | null;
  facturaCobrada: boolean;
};

// Misma lógica que src/lib/pipelineSync.ts (etapaAutomatica) — duplicada porque las
// Edge Functions (Deno) no pueden importar código del frontend (Vite/React).
function etapaAutomatica(s: SenalesPipeline): string {
  if (s.proyectoEstado === 'Finalizado' || s.facturaCobrada) return 'Finalizado';
  if (s.proyectoEstado === 'En curso' || s.proyectoEstado === 'Pausado') return 'En obra';
  if (s.presupuestos.some((p) => p.estado === 'Aceptado')) return 'Presupuesto aceptado';
  if (s.presupuestos.some((p) => p.estado === 'Pendiente')) return 'Presupuesto enviado';
  if (s.visitaEstado === 'Realizada') return 'Visita realizada';
  if (s.visitaTieneFecha) return 'Visita programada';
  return 'Contacto';
}

// Mismo orden que ETAPAS_PIPELINE en src/modules/clientes/types.ts — duplicado porque este Edge
// Function no puede importar código del frontend. `etapaMaximaAlcanzada` replica
// src/lib/pipelineSync.ts: la etapa "máxima alcanzada" nunca retrocede, ni siquiera si el pipeline
// actual baja (ver comentario original en pipelineSync.ts). Hallazgo real 2026-09-19: esta función
// solo actualizaba `estado_pipeline` tras una firma, nunca `pipeline_etapa_maxima` — mismo bug de
// desincronización ya corregido en creador-presupuestos.md (ver ese fichero para el caso real que lo
// destapó).
const ETAPAS_PIPELINE = ['Contacto', 'Visita programada', 'Visita realizada', 'Presupuesto enviado', 'Presupuesto aceptado', 'En obra', 'Finalizado'];
function etapaMaximaAlcanzada(nuevaEtapa: string, maximaPrevia: string | null): string {
  const idxNueva = ETAPAS_PIPELINE.indexOf(nuevaEtapa);
  const idxPrevia = ETAPAS_PIPELINE.indexOf(maximaPrevia ?? 'Contacto');
  return ETAPAS_PIPELINE[Math.max(idxNueva, idxPrevia, 0)];
}

function normalizarTelefono(tel: string): string {
  // Se queda con los últimos 9 dígitos, igual que src/modules/clientes/types.ts (Deno no puede
  // importar ese módulo, así que se duplica) — cruza formato nacional e internacional del mismo
  // número (bug real corregido 2026-08-31, esta copia se había quedado desactualizada).
  return tel.replace(/[^\d]/g, '').slice(-9);
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
    .select('id, numero, visita_id, cliente_tel, cliente_nombre, cliente_email, idioma, firmado, documenso_envelope_id')
    .is('eliminado_en', null)
    .limit(1);
  const { data: presupuestos, error: buscarError } = externalId
    ? await busqueda.eq('id', externalId)
    : await busqueda.eq('documenso_envelope_id', envelopeId);
  if (buscarError) return jsonResponse({ error: buscarError.message }, 500);

  const presupuesto = presupuestos?.[0];
  if (!presupuesto) return jsonResponse({ ok: true, ignorado: 'presupuesto no encontrado' });
  if (presupuesto.firmado) return jsonResponse({ ok: true, ignorado: 'ya estaba firmado' });

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

  if (presupuesto.visita_id) {
    await supabase.from('notas_cliente').insert({
      visita_id: presupuesto.visita_id,
      tipo: 'sistema',
      texto: `Presupuesto ${presupuesto.numero ?? ''} firmado electrónicamente con Documenso — marcado como Aceptado`,
      autor: 'Sistema',
    });
  }
  await supabase.from('documento_eventos').insert({
    documento_tipo: 'presupuesto',
    documento_id: presupuesto.id,
    evento: 'Firmado electrónicamente (Documenso) — marcado como Aceptado',
  });
  const { error: errorFunnel } = await supabase.from('funnel_eventos').insert({ etapa: 'presupuesto_firmado', presupuesto_id: presupuesto.id });
  if (errorFunnel) console.error('No se pudo registrar el evento de funnel presupuesto_firmado:', errorFunnel.message);

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

  // Sincroniza la etapa de pipeline del cliente, igual que hace la firma manual en el frontend
  // (sincronizarPipelineCliente) — aquí no hay usuario con sesión abierta que lo dispare.
  const tel = normalizarTelefono(presupuesto.cliente_tel ?? '');
  if (tel) {
    const { data: visitas } = await supabase.from('visitas').select('*').is('eliminado_en', null).order('created_at', { ascending: false });
    const visitasCliente = (visitas ?? []).filter((v: { telefono?: string }) => normalizarTelefono(v.telefono ?? '') === tel);
    const ultimaVisita = visitasCliente[0];

    if (ultimaVisita) {
      // Señales acotadas a ESTA visita (visita_id), no a todo el histórico del teléfono — un
      // cliente repetidor con un proyecto viejo ya cobrado no debe arrastrar su visita nueva a
      // "Finalizado" solo por compartir teléfono con esa obra anterior (bug real corregido
      // 2026-08-11, mismo fix que src/lib/pipelineSync.ts).
      const { data: presupuestosVisita } = await supabase
        .from('presupuestos')
        .select('id, estado')
        .eq('visita_id', ultimaVisita.id)
        .is('eliminado_en', null);
      const delVisita = presupuestosVisita ?? [];

      let proyectoEstado: string | null = null;
      const idsPresupuestos = delVisita.map((p: { id: string }) => p.id);
      if (idsPresupuestos.length > 0) {
        const { data: proyectos } = await supabase.from('proyectos').select('estado, presupuesto_id').in('presupuesto_id', idsPresupuestos);
        const lista = proyectos ?? [];
        const relevante = lista.find((p: { estado: string }) => p.estado === 'Finalizado') ?? lista.find((p: { estado: string }) => p.estado === 'En curso') ?? lista[0];
        proyectoEstado = relevante?.estado ?? null;
      }

      const { data: facturas } = await supabase
        .from('facturas')
        .select('estado_cobro')
        .eq('visita_id', ultimaVisita.id)
        .is('eliminado_en', null);
      const facturaCobrada = (facturas ?? []).some((f: { estado_cobro?: string }) => f.estado_cobro === 'Cobrada');

      const nuevaEtapa = etapaAutomatica({
        visitaEstado: ultimaVisita.estado ?? null,
        visitaTieneFecha: !!ultimaVisita.fecha_visita,
        presupuestos: delVisita,
        proyectoEstado,
        facturaCobrada,
      });

      const etapaMaxima = etapaMaximaAlcanzada(nuevaEtapa, ultimaVisita.pipeline_etapa_maxima ?? null);
      if (nuevaEtapa !== ultimaVisita.estado_pipeline || etapaMaxima !== ultimaVisita.pipeline_etapa_maxima) {
        const { error: pipelineError } = await supabase
          .from('visitas')
          .update({ estado_pipeline: nuevaEtapa, pipeline_etapa_maxima: etapaMaxima })
          .eq('id', ultimaVisita.id);
        if (pipelineError) {
          console.error('No se pudo sincronizar estado_pipeline tras la firma:', pipelineError.message);
        } else {
          await supabase.from('notas_cliente').insert({
            visita_id: ultimaVisita.id,
            tipo: 'sistema',
            texto: `Pipeline actualizado automáticamente a "${nuevaEtapa}"`,
            autor: 'Sistema',
          });
        }
      }
    }
  }

  return jsonResponse({ ok: true });
});
