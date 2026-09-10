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

const DOCUMENSO_API = 'https://app.documenso.com/api/v2';

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
): Promise<void> {
  if (!presupuesto.documenso_envelope_id) return;

  const detalle = await llamarDocumensoJson(`/envelope/${presupuesto.documenso_envelope_id}`, apiKey);
  const items = (detalle.items ?? (detalle.envelope as Record<string, unknown> | undefined)?.items) as
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
}

// --- Envío de email de aviso — mismo patrón de Gmail que supabase/functions/alerta-diaria
// (duplicado a propósito, un Edge Function no puede importar código de otro, ver más arriba). ---

async function obtenerAccessTokenGmail(supabase: SupabaseClient): Promise<string> {
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
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description ?? data.error ?? 'No se pudo renovar el token de Google');
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

const REMITENTE_BASE = 'reformasordonezeus@gmail.com';

async function avisarFirmaPorEmail(
  supabase: SupabaseClient,
  presupuesto: { numero: string | null; cliente_nombre: string | null },
  firmaNombre: string | null,
): Promise<void> {
  const token = await obtenerAccessTokenGmail(supabase);
  const asunto = `Presupuesto ${presupuesto.numero ?? ''} firmado — ${presupuesto.cliente_nombre ?? 'cliente'}`;
  const cuerpo = `<div style="font-family:Helvetica,Arial,sans-serif;font-size:14px;color:#111827">
    <p><strong>${presupuesto.cliente_nombre ?? 'El cliente'}</strong> ha firmado electrónicamente el presupuesto <strong>${
      presupuesto.numero ?? ''
    }</strong> con Documenso${firmaNombre ? ` (firmado por ${firmaNombre})` : ''}.</p>
    <p>El presupuesto ya se ha marcado como Aceptado en el CRM, y el PDF firmado está disponible para descargar desde su ficha.</p>
  </div>`;
  const mensajeMime = [
    `From: ${REMITENTE_BASE}`,
    `To: ${REMITENTE_BASE}`,
    `Subject: ${codificarAsunto(asunto)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset="UTF-8"',
    '',
    cuerpo,
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
    .select('id, numero, visita_id, cliente_tel, cliente_nombre, firmado, documenso_envelope_id')
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
  if (apiKey) {
    try {
      await descargarYGuardarPdfFirmado(supabase, presupuesto, apiKey);
    } catch (err) {
      console.error('No se pudo descargar/guardar el PDF firmado:', err instanceof Error ? err.message : err);
    }
  } else {
    console.error('Falta el secreto DOCUMENSO_API_KEY — no se pudo descargar el PDF firmado');
  }
  try {
    await avisarFirmaPorEmail(supabase, presupuesto, firmaNombre);
  } catch (err) {
    console.error('No se pudo avisar por email de la firma:', err instanceof Error ? err.message : err);
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

      if (nuevaEtapa !== ultimaVisita.estado_pipeline) {
        const { error: pipelineError } = await supabase.from('visitas').update({ estado_pipeline: nuevaEtapa }).eq('id', ultimaVisita.id);
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
