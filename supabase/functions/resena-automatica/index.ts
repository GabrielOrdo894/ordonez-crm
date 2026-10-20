// Edge Function: resena-automatica
//
// Cron diario a las 07:00 UTC (09:00 hora local) — petición de reseña automática al cerrar una obra
// (petición de Gabriel, 2026-09-24). Dos pasos, siempre en este orden:
//   1. ENVÍA las peticiones programadas la víspera: facturas con resena_auto_estado = 'programada'
//      desde hace ≥ 20 h (el cron corre cada 24 h, el margen absorbe el jitter). El envío lo hace
//      enviar-resena-email (misma plantilla, mismo enlace medible resena-redirect, misma marca
//      resena_enviado_en que el botón manual del banner de Inicio) — aquí no se redacta nada. Si
//      entre medias se canceló desde la factura, se envió a mano, se papelerizó o dejó de estar
//      cobrada, no se envía.
//   2. PROGRAMA las nuevas: facturas normales cobradas hace exactamente `resenas.diasEspera` días
//      (5 — decisión de Gabriel, el mismo valor que usan el banner y la campana), con email de
//      cliente y sin reseña pedida por ningún canal. El envío real queda para la ejecución del día
//      siguiente: esas 24 h son el margen para cancelarlo desde la factura (la campana avisa). Si la
//      obra tiene una factura rectificativa posterior o notas de cliente (no de sistema) en los
//      últimos 7 días, NO se programa — queda en 'revisar' y la campana pide decidirlo a mano.
//
// La ventana de fecha_pago admite hasta VENTANA_DIAS días de retraso del cron sin ponerse a
// rastrear facturas antiguas (las cobradas antes de que existiera esto siguen solo por el banner).
//
// Reutiliza el patrón de autorización de alerta-diaria/index.ts (duplicado a propósito: una Edge
// Function no puede importar de otra en el despliegue vía MCP).
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { esLlamadaAutorizada } from '../_shared/autorizacion.ts';
import { claveEmail } from '../_shared/resenasCliente.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://ordonezrenov.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

const HORAS_MARGEN = 20;
const VENTANA_DIAS = 3;
const DIAS_ESPERA_DEFECTO = 5;

function fechaHaceDias(dias: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}

type FacturaProgramada = {
  id: string;
  numero: string | null;
  estado_cobro: string;
  resena_enviado_en: string | null;
  eliminado_en: string | null;
  cliente_email: string | null;
};

async function enviarProgramadas(
  supabase: SupabaseClient,
  urlBase: string,
  serviceKey: string,
): Promise<{ enviadas: number; omitidas: number; errores: string[] }> {
  const limite = new Date(Date.now() - HORAS_MARGEN * 3600 * 1000).toISOString();
  const { data, error } = await supabase
    .from('facturas')
    .select('id, numero, estado_cobro, resena_enviado_en, eliminado_en, cliente_email')
    .eq('resena_auto_estado', 'programada')
    .lte('resena_auto_programada_en', limite);
  if (error) throw error;

  let enviadas = 0;
  let omitidas = 0;
  const errores: string[] = [];
  const emailsEnviados = new Set<string>(); // una por cliente aunque tenga varias programadas
  for (const f of (data ?? []) as FacturaProgramada[]) {
    const clave = claveEmail(f.cliente_email);
    if (clave && emailsEnviados.has(clave)) {
      // enviar-resena-email ya la dio por pedida al enviar la otra factura del cliente.
      const { error: e } = await supabase.from('facturas').update({ resena_auto_estado: 'cancelada' }).eq('id', f.id);
      if (e) throw e;
      omitidas++;
      continue;
    }
    // Ya se mandó a mano (banner de Inicio / WhatsApp) entre la programación y hoy: no repetir.
    if (f.resena_enviado_en) {
      const { error: e } = await supabase.from('facturas').update({ resena_auto_estado: 'enviada' }).eq('id', f.id);
      if (e) throw e;
      omitidas++;
      continue;
    }
    if (f.eliminado_en || f.estado_cobro !== 'Cobrada') {
      const { error: e } = await supabase.from('facturas').update({ resena_auto_estado: 'cancelada' }).eq('id', f.id);
      if (e) throw e;
      omitidas++;
      continue;
    }
    const res = await fetch(`${urlBase}/functions/v1/enviar-resena-email`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ facturaId: f.id }),
    });
    if (!res.ok) {
      errores.push(`${f.numero ?? f.id}: ${await res.text()}`);
      continue; // se queda 'programada' y se reintenta mañana
    }
    const { error: e } = await supabase.from('facturas').update({ resena_auto_estado: 'enviada' }).eq('id', f.id);
    if (e) throw e;
    enviadas++;
    if (clave) emailsEnviados.add(clave);
  }
  return { enviadas, omitidas, errores };
}

type FacturaCandidata = { id: string; numero: string | null; visita_id: string | null; resena_token: string | null; cliente_email: string | null };

async function programarNuevas(supabase: SupabaseClient, diasEspera: number): Promise<{ programadas: number; aRevisar: number }> {
  const { data, error } = await supabase
    .from('facturas')
    .select('id, numero, visita_id, resena_token, cliente_email')
    .is('eliminado_en', null)
    .eq('tipo', 'normal')
    .eq('estado_cobro', 'Cobrada')
    .is('resena_enviado_en', null)
    .is('resena_auto_estado', null)
    .not('cliente_email', 'is', null)
    .gte('fecha_pago', fechaHaceDias(diasEspera + VENTANA_DIAS - 1))
    .lte('fecha_pago', fechaHaceDias(diasEspera));
  if (error) throw error;

  const hace7Dias = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  let programadas = 0;
  let aRevisar = 0;

  // Una reseña por CLIENTE (2026-10-20, ver _shared/resenasCliente.ts): si a ese email ya se le pidió
  // o tiene otra factura programada, esta no se programa — se cancela (y se da por pedida si ya salió).
  const candidatas = (data ?? []) as FacturaCandidata[];
  const emails = [...new Set(candidatas.map((f) => claveEmail(f.cliente_email)).filter((e): e is string => !!e))];
  const yaPedida = new Map<string, string | null>(); // email → fecha de la petición (null si solo programada)
  if (emails.length > 0) {
    const { data: previas, error: errorPrevias } = await supabase
      .from('facturas')
      .select('cliente_email, resena_enviado_en, resena_auto_estado')
      .is('eliminado_en', null)
      .not('cliente_email', 'is', null)
      .or('resena_enviado_en.not.is.null,resena_auto_estado.eq.programada');
    if (errorPrevias) throw errorPrevias;
    for (const p of (previas ?? []) as { cliente_email: string | null; resena_enviado_en: string | null }[]) {
      const clave = claveEmail(p.cliente_email);
      if (clave && emails.includes(clave)) yaPedida.set(clave, p.resena_enviado_en ?? yaPedida.get(clave) ?? null);
    }
  }

  for (const f of candidatas) {
    const clave = claveEmail(f.cliente_email);
    if (clave && yaPedida.has(clave)) {
      const fecha = yaPedida.get(clave);
      const { error: e } = await supabase
        .from('facturas')
        .update(fecha ? { resena_auto_estado: 'cancelada', resena_enviado_en: fecha } : { resena_auto_estado: 'cancelada' })
        .eq('id', f.id);
      if (e) throw e;
      continue;
    }
    let motivoRevisar: string | null = null;

    const { data: rectificativas, error: errorRect } = await supabase
      .from('facturas')
      .select('id')
      .eq('factura_original_id', f.id)
      .is('eliminado_en', null)
      .limit(1);
    if (errorRect) throw errorRect;
    if ((rectificativas ?? []).length > 0) motivoRevisar = 'rectificativa posterior';

    if (!motivoRevisar && f.visita_id) {
      const { data: notas, error: errorNotas } = await supabase
        .from('notas_cliente')
        .select('id')
        .eq('visita_id', f.visita_id)
        .neq('tipo', 'sistema')
        .gte('created_at', hace7Dias)
        .limit(1);
      if (errorNotas) throw errorNotas;
      if ((notas ?? []).length > 0) motivoRevisar = 'notas recientes';
    }

    const ahora = new Date().toISOString();
    if (motivoRevisar) {
      const { error: e } = await supabase
        .from('facturas')
        .update({ resena_auto_estado: 'revisar', resena_auto_programada_en: ahora })
        .eq('id', f.id);
      if (e) throw e;
      aRevisar++;
      if (clave) yaPedida.set(clave, null);
    } else {
      // El token se fija ya aquí para que el enlace que verá el cliente sea el mismo que registra
      // resena-redirect (mismo criterio que CierreObraBanner al mostrar el mensaje).
      const { error: e } = await supabase
        .from('facturas')
        .update({ resena_auto_estado: 'programada', resena_auto_programada_en: ahora, resena_token: f.resena_token ?? crypto.randomUUID() })
        .eq('id', f.id);
      if (e) throw e;
      programadas++;
      if (clave) yaPedida.set(clave, null);
    }
  }
  return { programadas, aRevisar };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (!(await esLlamadaAutorizada(req))) return jsonResponse({ ok: false, error: 'No autorizado' }, 401);

  const urlBase = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(urlBase, serviceKey);

  try {
    const { data: empresaRow, error: errorConfig } = await supabase.from('empresa_config').select('datos').eq('id', 1).maybeSingle();
    if (errorConfig) throw errorConfig;
    const resenas = ((empresaRow?.datos ?? {}) as { resenas?: { activo?: boolean; diasEspera?: number } }).resenas;
    if (!resenas?.activo) return jsonResponse({ ok: true, saltado: true, motivo: 'sistema de reseñas desactivado en Configuración' });
    const diasEspera = resenas.diasEspera ?? DIAS_ESPERA_DEFECTO;

    const envio = await enviarProgramadas(supabase, urlBase, serviceKey);
    const programacion = await programarNuevas(supabase, diasEspera);
    return jsonResponse({ ok: true, diasEspera, ...envio, ...programacion });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err instanceof Error ? err.message : err) }, 500);
  }
});
