// Edge Function: acompte-automatico
//
// Crea la factura del primer plazo del plan de pago (el acompte «à la signature») en cuanto un
// presupuesto pasa a Aceptado — por firma de Documenso, a mano desde el CRM o por SQL (2026-11-10,
// petición de Gabriel). La llama el trigger `presupuestos_acompte_automatico` vía pg_net con la
// service role; también admite una llamada de un usuario del equipo.
//
// Nunca envía nada al cliente: crea la factura (numerada por asignar_numero_factura), sus apuntes de
// emisión si es de Francia, deja nota/historial y avisa a Gabriel por email (y la campana del CRM,
// columna facturas.acompte_auto_creado_en) para que se la mande él.
//
// No crea nada si el presupuesto ya tiene alguna factura, es orientativo o avenant, o su plan de pago
// no tiene un acompte (ver motivoSinAcompte). La comprobación y el INSERT van dentro de la función
// SQL crear_acompte_automatico, que bloquea la fila del presupuesto: dos llamadas seguidas no pueden
// crear dos acomptes.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { SMTPClient } from 'https://deno.land/x/denomailer/mod.ts';
import { esLlamadaAutorizada } from '../_shared/autorizacion.ts';
import { codificarCabeceraMime, limpiarHtmlCorreo } from '../_shared/correo.ts';
import { esc } from '../_shared/html.ts';
import {
  construirAsientosAcompte,
  construirFacturaAcompte,
  hoyParis,
  motivoSinAcompte,
  type LineaAcompte,
  type PresupuestoParaAcompte,
} from '../_shared/acompteAutomatico.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://ordonezrenov.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const REMITENTE_BASE = 'reformasordonezeus@gmail.com';
const REMITENTE_ENVIO = Deno.env.get('SMTP_USER') ?? REMITENTE_BASE;

async function avisarGabriel(asunto: string, cuerpoHtml: string): Promise<void> {
  const client = new SMTPClient({
    connection: {
      hostname: Deno.env.get('SMTP_HOST')!,
      port: Number(Deno.env.get('SMTP_PORT') ?? '465'),
      tls: true,
      auth: { username: Deno.env.get('SMTP_USER')!, password: Deno.env.get('SMTP_PASS')! },
    },
    client: {
      preprocessors: [
        (mail) => ({
          ...mail,
          subject: codificarCabeceraMime(asunto),
          from: { ...mail.from, name: codificarCabeceraMime('CRM Reformas Ordoñez') },
        }),
      ],
    },
  });
  try {
    await client.send({
      from: `CRM Reformas Ordoñez <${REMITENTE_ENVIO}>`,
      to: [REMITENTE_BASE],
      subject: asunto,
      content: 'auto',
      html: limpiarHtmlCorreo(
        `<div style="font-family:Helvetica,Arial,sans-serif;font-size:14px;color:#111827">${cuerpoHtml}</div>`,
      ),
    });
  } finally {
    await client.close();
  }
}

const formatoEuros = (n: number) =>
  new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n).replace(/\s/g, ' ') + ' €';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (!(await esLlamadaAutorizada(req))) return jsonResponse({ error: 'No autorizado' }, 401);

  const body = await req.json().catch(() => null);
  const presupuestoId = body?.presupuesto_id;
  if (typeof presupuestoId !== 'string') return jsonResponse({ error: 'Falta presupuesto_id' }, 400);

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data: presupuesto, error: errorPresupuesto } = await supabase
    .from('presupuestos')
    .select(
      'id, numero, titulo, tipo, avenant_de_id, eliminado_en, estado, visita_id, cliente_nombre, cliente_dir, cliente_tel, cliente_email, idioma, pais, tipo_iva, plan_pago',
    )
    .eq('id', presupuestoId)
    .maybeSingle<PresupuestoParaAcompte>();
  if (errorPresupuesto) return jsonResponse({ error: errorPresupuesto.message }, 500);
  if (!presupuesto) return jsonResponse({ ok: true, ignorado: 'presupuesto no encontrado' });

  // Primer filtro sin bloquear (la función SQL vuelve a comprobar las facturas con la fila bloqueada).
  const motivo = motivoSinAcompte(presupuesto, 0);
  if (motivo) return jsonResponse({ ok: true, ignorado: motivo });

  const fila = { ...construirFacturaAcompte(presupuesto, hoyParis()), acompte_auto_creado_en: new Date().toISOString() };
  const { data: creada, error: errorCrear } = await supabase.rpc('crear_acompte_automatico', {
    p_presupuesto_id: presupuesto.id,
    p_fila: fila,
  });

  if (errorCrear) {
    // Típicamente: periodo contable bloqueado o una factura de la serie con fecha posterior. No se
    // reintenta solo: se avisa a Gabriel para que lo cree a mano.
    console.error(`acompte-automatico: no se pudo crear el acompte de ${presupuesto.numero}:`, errorCrear.message);
    try {
      await avisarGabriel(
        `No se pudo crear el acompte de ${presupuesto.numero ?? ''} — ${presupuesto.cliente_nombre ?? 'cliente'}`,
        `<p>El presupuesto <strong>${esc(presupuesto.numero ?? '')}</strong> se ha aceptado, pero el acompte automático ha fallado:</p>
         <p style="color:#b91c1c">${esc(errorCrear.message)}</p>
         <p>Créalo a mano desde Presupuestos → «Crear anticipo (acompte)».</p>`,
      );
    } catch (err) {
      console.error('acompte-automatico: tampoco se pudo avisar por email:', err instanceof Error ? err.message : err);
    }
    return jsonResponse({ error: errorCrear.message }, 500);
  }

  // Si la función SQL devuelve null (ya había facturas), PostgREST entrega una fila con todos los
  // campos a null, no un null: hay que mirar el id.
  const factura = creada as { id: string | null; numero: string; cliente_nombre: string | null; fecha_factura: string; lineas: LineaAcompte[] } | null;
  if (!factura?.id) return jsonResponse({ ok: true, ignorado: 'el presupuesto ya tiene facturas' });

  const avisos: string[] = [];

  if (presupuesto.pais === 'Francia') {
    const { error: errorAsientos } = await supabase.from('asientos_contables').insert(construirAsientosAcompte(factura));
    if (errorAsientos) {
      console.error(`acompte-automatico: sin apuntes para ${factura.numero}:`, errorAsientos.message);
      avisos.push(
        `No se pudieron registrar sus apuntes en el libro diario (${esc(errorAsientos.message)}). Ábrela y guárdala en el CRM para contabilizarla.`,
      );
    }
  }

  const { error: errorEventoFactura } = await supabase.from('documento_eventos').insert([
    { documento_tipo: 'factura', documento_id: factura.id, evento: `Creada automáticamente al aceptarse ${presupuesto.numero ?? ''}` },
    { documento_tipo: 'presupuesto', documento_id: presupuesto.id, evento: `Factura ${factura.numero} generada automáticamente (anticipo)` },
  ]);
  if (errorEventoFactura) console.error('acompte-automatico: no se pudo registrar el historial:', errorEventoFactura.message);

  if (presupuesto.visita_id) {
    const { error: errorNota } = await supabase.from('notas_cliente').insert({
      visita_id: presupuesto.visita_id,
      tipo: 'sistema',
      texto: `Acompte ${factura.numero} creado automáticamente al aceptarse el presupuesto ${presupuesto.numero ?? ''}`,
      autor: 'Sistema',
    });
    if (errorNota) console.error('acompte-automatico: no se pudo registrar la nota de sistema:', errorNota.message);
  }

  const total = factura.lineas.reduce((s, l) => s + (l.es_incluido ? 0 : l.total_con_iva), 0);
  try {
    await avisarGabriel(
      `Acompte ${factura.numero} creado — envíaselo a ${presupuesto.cliente_nombre ?? 'el cliente'}`,
      `<p>El presupuesto <strong>${esc(presupuesto.numero ?? '')}</strong> de <strong>${esc(presupuesto.cliente_nombre ?? '')}</strong> se ha aceptado y el CRM ha creado su acompte:</p>
       <p><strong>${esc(factura.numero)}</strong> · ${formatoEuros(total)} (IVA incluido) · vence a los 7 días.</p>
       ${avisos.map((a) => `<p style="color:#b91c1c">${a}</p>`).join('')}
       <p>No se ha enviado nada al cliente: descarga el PDF desde Facturas y mándaselo.</p>`,
    );
  } catch (err) {
    console.error('acompte-automatico: no se pudo avisar por email:', err instanceof Error ? err.message : err);
  }

  return jsonResponse({ ok: true, factura: factura.numero });
});
