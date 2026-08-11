// Edge Function: recibe el webhook de Documenso cuando un presupuesto se firma
// y lo marca automáticamente como firmado + Aceptado. Se registra en Documenso
// (Settings → Webhooks) apuntando a esta función. Ver docs/documenso.md.
import { createClient } from 'jsr:@supabase/supabase-js@2';

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
  return tel.replace(/[^\d]/g, '');
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // Falla cerrado: si el secreto no está configurado como secret de la función, se rechaza toda
  // petición en vez de aceptarlas todas sin comprobar nada (ver docs/documenso.md § 4 y 6).
  const secretoEsperado = Deno.env.get('DOCUMENSO_WEBHOOK_SECRET');
  const secretoRecibido = req.headers.get('x-documenso-secret');
  if (!secretoEsperado || secretoRecibido !== secretoEsperado) {
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

  const busqueda = supabase.from('presupuestos').select('id, numero, visita_id, cliente_tel, firmado').limit(1);
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
  await supabase.from('funnel_eventos').insert({ etapa: 'presupuesto_firmado', presupuesto_id: presupuesto.id });

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
        if (!pipelineError) {
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
