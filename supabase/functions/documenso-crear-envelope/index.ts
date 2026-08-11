// Edge Function: crea un envelope en Documenso a partir del PDF de un presupuesto,
// lo distribuye para firma y guarda el enlace de firma en la fila del presupuesto.
// Invocada por el frontend vía supabase.functions.invoke('documenso-crear-envelope')
// desde src/lib/documenso.ts.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Supabase valida que el JWT esté bien firmado (verify_jwt: true) pero no distingue la clave anon
// (pública, va en el bundle del frontend) de una sesión real — comprobar el rol cierra ese hueco
// (revisión de seguridad 2026-08-11). Duplicado en cada función: el despliegue vía MCP no resuelve
// imports relativos entre funciones (a diferencia de `supabase functions deploy` por CLI).
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

const DOCUMENSO_API = 'https://app.documenso.com/api/v2';

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

function base64ABytes(base64: string): Uint8Array {
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

async function llamarDocumenso(path: string, apiKey: string, init: RequestInit) {
  const res = await fetch(`${DOCUMENSO_API}${path}`, {
    ...init,
    headers: { Authorization: apiKey, ...(init.headers ?? {}) },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.message ?? data?.error ?? `Documenso devolvió ${res.status} en ${path}`);
  }
  return data;
}

type Recipient = { email?: string; token?: string; signingUrl?: string };

function extraerSigningUrl(recipientes: Recipient[] | undefined, email: string): string | null {
  if (!recipientes?.length) return null;
  const recipiente = recipientes.find((r) => r.email?.toLowerCase() === email.toLowerCase()) ?? recipientes[0];
  if (recipiente?.signingUrl) return recipiente.signingUrl;
  if (recipiente?.token) return `https://app.documenso.com/sign/${recipiente.token}`;
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (!esLlamadaAutorizada(req)) return jsonResponse({ error: 'No autorizado' }, 401);

  try {
    const apiKey = Deno.env.get('DOCUMENSO_API_KEY');
    if (!apiKey) return jsonResponse({ error: 'Falta el secreto DOCUMENSO_API_KEY en la Edge Function' }, 500);

    const { presupuestoId, numero, clienteNombre, clienteEmail, pdfBase64, campoFirma, regenerar } = await req.json();
    if (!presupuestoId || !clienteEmail || !pdfBase64) {
      return jsonResponse({ error: 'Faltan datos: presupuestoId, clienteEmail o pdfBase64' }, 400);
    }
    if (!campoFirma || typeof campoFirma.pagina !== 'number') {
      return jsonResponse({ error: 'Falta la posición del recuadro de firma (campoFirma) del PDF' }, 400);
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // Idempotencia: si el guardado del envelope falló la vez anterior DESPUÉS de que Documenso ya
    // lo creara y distribuyera, el frontend permitía reintentar y se creaba un SEGUNDO envelope —
    // un segundo email de firma real al mismo cliente (bug real corregido 2026-08-11). Si ya hay
    // un envelope guardado y no se pide explícitamente "regenerar" (botón "Generar nuevo enlace"),
    // se reutiliza el existente en vez de crear otro.
    if (!regenerar) {
      const { data: existente, error: errorExistente } = await supabase
        .from('presupuestos')
        .select('documenso_envelope_id, documenso_signing_url, firmado')
        .eq('id', presupuestoId)
        .maybeSingle();
      if (errorExistente) return jsonResponse({ error: errorExistente.message }, 500);
      if (existente?.firmado) return jsonResponse({ error: 'Este presupuesto ya está firmado' }, 409);
      if (existente?.documenso_envelope_id && existente?.documenso_signing_url) {
        return jsonResponse({ signingUrl: existente.documenso_signing_url, envelopeId: existente.documenso_envelope_id });
      }
    }

    const pdfBytes = base64ABytes(pdfBase64);

    const payloadEnvelope = {
      type: 'DOCUMENT',
      title: `Presupuesto ${numero ?? presupuestoId}`,
      externalId: presupuestoId,
      recipients: [
        {
          email: clienteEmail,
          name: clienteNombre || clienteEmail,
          role: 'SIGNER',
          signingOrder: 1,
          fields: [
            {
              type: 'SIGNATURE',
              page: campoFirma.pagina,
              positionX: campoFirma.positionX,
              positionY: campoFirma.positionY,
              width: campoFirma.width,
              height: campoFirma.height,
            },
          ],
        },
      ],
      meta: {
        subject: `Presupuesto ${numero ?? ''} — Reformas Ordoñez`,
        message: 'Por favor, revisa y firma el presupuesto adjunto para aceptarlo.',
      },
    };

    const formData = new FormData();
    formData.append('payload', JSON.stringify(payloadEnvelope));
    formData.append('files', new Blob([pdfBytes], { type: 'application/pdf' }), `${numero ?? 'presupuesto'}.pdf`);

    const creado = await llamarDocumenso('/envelope/create', apiKey, { method: 'POST', body: formData });
    const envelopeId: string | undefined = creado?.id ?? creado?.envelope?.id ?? creado?.envelopeId;
    if (!envelopeId) throw new Error('Documenso no devolvió el id del envelope creado');

    const distribuido = await llamarDocumenso('/envelope/distribute', apiKey, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ envelopeId }),
    });

    let recipientes: Recipient[] | undefined = distribuido?.recipients ?? distribuido?.envelope?.recipients;
    let signingUrl = extraerSigningUrl(recipientes, clienteEmail);

    if (!signingUrl) {
      const detalle = await llamarDocumenso(`/envelope/${envelopeId}`, apiKey, { method: 'GET' });
      recipientes = detalle?.recipients ?? detalle?.envelope?.recipients;
      signingUrl = extraerSigningUrl(recipientes, clienteEmail);
    }

    if (!signingUrl) throw new Error('No se pudo obtener el enlace de firma de Documenso');

    const { error: updateError } = await supabase
      .from('presupuestos')
      .update({
        documenso_envelope_id: envelopeId,
        documenso_signing_url: signingUrl,
        documenso_estado: 'ENVIADO',
        firma_metodo: 'documenso',
      })
      .eq('id', presupuestoId);
    if (updateError) return jsonResponse({ error: updateError.message }, 500);

    return jsonResponse({ signingUrl, envelopeId });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : 'Error desconocido al conectar con Documenso' }, 500);
  }
});
