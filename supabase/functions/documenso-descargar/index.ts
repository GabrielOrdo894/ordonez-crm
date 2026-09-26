// Edge Function: documenso-descargar
//
// Devuelve un enlace temporal (1 h) al PDF firmado o al certificado de firma ("attestation") de un
// presupuesto firmado con Documenso (petición de Gabriel 2026-09-26: no había forma de descargar
// ninguno de los dos desde el CRM). body: { presupuestoId, tipo: 'firmado' | 'certificado' }.
//
// Caché en el bucket privado `presupuestos-firmados`: si el fichero ya está guardado (el webhook
// guarda el firmado al firmarse) se sirve de ahí; si no, se descarga de Documenso una vez y se
// guarda. Así también se recuperan los firmados que el webhook no llegó a guardar.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const DOCUMENSO_API = 'https://firma.ordonezrenov.com/api/v2';
const BUCKET = 'presupuestos-firmados';

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://ordonezrenov.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Mismo patrón que el resto de funciones (duplicado a propósito: el despliegue vía MCP no resuelve
// imports relativos entre funciones).
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
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function descargarDeDocumenso(ruta: string, apiKey: string): Promise<Uint8Array> {
  const res = await fetch(`${DOCUMENSO_API}${ruta}`, { headers: { Authorization: apiKey } });
  if (!res.ok) {
    const texto = await res.text().catch(() => '');
    throw new Error(
      `Documenso devolvió ${res.status} en ${ruta}${texto ? `: ${texto.slice(0, 200)}` : ''}`,
    );
  }
  return new Uint8Array(await res.arrayBuffer());
}

async function idPrimerItem(envelopeId: string, apiKey: string): Promise<string> {
  const res = await fetch(`${DOCUMENSO_API}/envelope/${envelopeId}`, {
    headers: { Authorization: apiKey },
  });
  const detalle = await res.json().catch(() => null);
  if (!res.ok)
    throw new Error(detalle?.message ?? `Documenso devolvió ${res.status} al leer el envelope`);
  // La API autoalojada usa `envelopeItems` (app.documenso.com usaba `items`) — ver documenso-webhook.
  const items = (detalle?.envelopeItems ?? detalle?.items ?? detalle?.envelope?.items) as
    { id: string }[] | undefined;
  const itemId = items?.[0]?.id;
  if (!itemId) throw new Error('El envelope de Documenso no tiene ningún documento');
  return itemId;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (!esLlamadaAutorizada(req)) return jsonResponse({ error: 'No autorizado' }, 401);

  let body: { presupuestoId?: string; tipo?: string } = {};
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Cuerpo de la petición no válido' }, 400);
  }
  const tipo = body.tipo === 'certificado' ? 'certificado' : 'firmado';
  if (!body.presupuestoId) return jsonResponse({ error: 'Falta presupuestoId' }, 400);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    const { data: p, error } = await supabase
      .from('presupuestos')
      .select('id, numero, firmado, documenso_envelope_id, documenso_pdf_firmado_path')
      .eq('id', body.presupuestoId)
      .single();
    if (error) throw new Error(error.message);
    if (!p.firmado) return jsonResponse({ error: 'Este presupuesto todavía no está firmado' }, 409);

    const ruta =
      tipo === 'firmado'
        ? (p.documenso_pdf_firmado_path ?? `${p.id}.pdf`)
        : `${p.id}-certificado.pdf`;
    const nombre = `${p.numero ?? 'presupuesto'}-${tipo === 'firmado' ? 'firmado' : 'certificado-firma'}.pdf`;

    // ¿Ya está guardado? createSignedUrl falla si el objeto no existe.
    const existente = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(ruta, 3600, { download: nombre });
    if (!existente.error && existente.data) {
      return jsonResponse({ ok: true, url: existente.data.signedUrl, nombre });
    }

    if (!p.documenso_envelope_id) {
      return jsonResponse(
        {
          error:
            'Este presupuesto no se firmó con Documenso desde el CRM: no hay documento que descargar.',
        },
        409,
      );
    }
    const apiKey = Deno.env.get('DOCUMENSO_API_KEY');
    if (!apiKey) return jsonResponse({ error: 'Falta el secreto DOCUMENSO_API_KEY' }, 500);

    const bytes =
      tipo === 'firmado'
        ? await descargarDeDocumenso(
            `/envelope/item/${await idPrimerItem(p.documenso_envelope_id, apiKey)}/download?version=signed`,
            apiKey,
          )
        : await descargarDeDocumenso(
            `/envelope/${p.documenso_envelope_id}/certificate/download`,
            apiKey,
          );

    const { error: errorSubida } = await supabase.storage
      .from(BUCKET)
      .upload(ruta, bytes, { contentType: 'application/pdf', upsert: true });
    if (errorSubida) throw new Error(`No se pudo guardar el PDF: ${errorSubida.message}`);
    if (tipo === 'firmado' && !p.documenso_pdf_firmado_path) {
      const { error: errorRuta } = await supabase
        .from('presupuestos')
        .update({ documenso_pdf_firmado_path: ruta })
        .eq('id', p.id);
      if (errorRuta)
        throw new Error(`No se pudo guardar la ruta del PDF firmado: ${errorRuta.message}`);
    }

    const nuevo = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(ruta, 3600, { download: nombre });
    if (nuevo.error || !nuevo.data)
      throw new Error(nuevo.error?.message ?? 'No se pudo generar el enlace');
    return jsonResponse({ ok: true, url: nuevo.data.signedUrl, nombre });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 502);
  }
});
