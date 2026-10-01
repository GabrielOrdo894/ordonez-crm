// Edge Function: automatizaciones-crm
//
// Cron cada 30 min — red de seguridad de las automatizaciones que ya corren en el frontend
// (AppLayout.tsx auto-completa visitas 1h después de su hora y genera el gasto de kilometraje
// pendiente) para los días en los que nadie tiene el CRM abierto. Además hace lo que solo tiene
// sentido en servidor:
//   1. Auto-completa visitas Pendiente cuya fecha_visita+hora_visita+1h ya pasó → Realizada, y
//      genera su gasto de kilometraje pendiente de revisar (España o Francia, siempre contabilizado
//      como gasto de Francia — ver comentario junto a OFICINA_FR más abajo).
//   2. Marca como Rechazado los presupuestos Pendiente cuya fecha_validez ya pasó.
//   3. Marca como No concretada cualquier solicitud Nueva/Enviada que lleve 14 días sin convertirse en
//      visita ni vincularse a un presupuesto (petición de Gabriel 2026-09-15) — el resto de caminos
//      de aceptación son inmediatos (VisitaForm.tsx, funnelTracking.ts), este es el único que
//      necesita paso del tiempo, de ahí que viva aquí y no en el frontend.
//
// Reutiliza el patrón de autorización de alerta-diaria/index.ts y el cálculo de distancia
// (Distance Matrix con fallback Haversine) de notificar-visita/index.ts.
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { CV_VEHICULO_DEFECTO, CUENTA_KILOMETRICO, calcularIndemnizacionKm } from '../_shared/baremoKilometrico.ts';
import { esLlamadaAutorizada } from '../_shared/autorizacion.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://ordonezrenov.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

const NOMBRE_LOCK = 'automatizaciones-crm';
const LOCK_ATASCADO_MS = 10 * 60 * 1000;

// Lock de fila (no advisory lock de Postgres a propósito: PostgREST no garantiza la misma sesión
// entre dos llamadas HTTP separadas, así que lock/unlock de sesión podría no liberarse nunca).
// Evita que dos ejecuciones solapadas dupliquen el gasto de kilometraje de una visita o el
// rechazo de un presupuesto caducado si el cron se dispara mientras la anterior sigue corriendo.
async function intentarAdquirirLock(supabase: SupabaseClient): Promise<boolean> {
  const umbralAtascado = new Date(Date.now() - LOCK_ATASCADO_MS).toISOString();
  const { data, error } = await supabase
    .from('automatizacion_lock')
    .update({ corriendo: true, iniciado_en: new Date().toISOString() })
    .eq('nombre', NOMBRE_LOCK)
    .or(`corriendo.eq.false,iniciado_en.lt.${umbralAtascado}`)
    .select('nombre')
    .maybeSingle();
  if (error) throw new Error(`lock: ${error.message}`);
  return !!data;
}

async function liberarLock(supabase: SupabaseClient): Promise<void> {
  await supabase.from('automatizacion_lock').update({ corriendo: false }).eq('nombre', NOMBRE_LOCK);
}

const UNA_HORA_MS = 60 * 60 * 1000;

// fecha_visita/hora_visita están en hora de Francia/España. Deno corre en UTC, así que
// `new Date('2026-09-26T18:00:00')` se leía como 18:00 UTC = 20:00 en París y la visita se
// autocompletaba 2 horas tarde en verano (1 en invierno) — auditoría 2026-09-26.
function instanteEnParis(fecha: string, hora: string): number {
  const comoUtc = Date.parse(`${fecha}T${hora}:00Z`);
  const enParis = new Date(comoUtc).toLocaleString('sv-SE', { timeZone: 'Europe/Paris' }).replace(' ', 'T');
  const desfase = Date.parse(`${enParis}Z`) - comoUtc;
  return comoUtc - desfase;
}

type Oficina = { lat: number; lng: number };
// El kilometraje siempre se calcula desde el taller de Hendaye, sea España o Francia la visita —
// misma regla que ya usa el cálculo manual (src/lib/calcularKmIdaYVuelta.ts, un único origen fijo)
// y consistente con que el gasto resultante siempre se contabiliza en Francia (ver más abajo).
const OFICINA_FR: Oficina = { lat: 43.3546525, lng: -1.7747975 };

// Ver el mismo comentario en notificar-visita/index.ts: si GOOGLE_MAPS_API_KEY tiene restricción
// de referrer HTTP, Google la rechaza para llamadas servidor-a-servidor — por eso esta función
// puede devolver null con normalidad y el Haversine de abajo hace de fallback.
async function kmIdaYVueltaReal(oficina: Oficina, lat: number, lng: number, apiKey: string): Promise<number | null> {
  const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${oficina.lat},${oficina.lng}&destinations=${lat},${lng}&mode=driving&key=${apiKey}`;
  const res = await fetch(url);
  const data = await res.json();
  const el = data?.rows?.[0]?.elements?.[0];
  if (data.status !== 'OK' || !el || el.status !== 'OK' || !el.distance) return null;
  return Math.round((el.distance.value / 1000) * 2 * 10) / 10;
}

function kmIdaYVueltaEstimado(oficina: Oficina, lat: number, lng: number): number {
  const R = 6371;
  const dLat = ((lat - oficina.lat) * Math.PI) / 180;
  const dLng = ((lng - oficina.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((oficina.lat * Math.PI) / 180) * Math.cos((lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  const lineaRecta = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(lineaRecta * 1.3 * 2 * 10) / 10;
}

// Distancia real por carretera; si Google no responde desde el servidor, estimación en línea recta
// ×1,3. La estimación se marca en la descripción del gasto ("km estimados, revisar") para que al
// confirmarlo en Gastos se vea que no es la ruta real — antes no se distinguía y el importe podía
// diferir del calculado en el navegador sin que nadie lo supiera (auditoría 2026-10-01).
async function calcularKmIdaYVuelta(lat: number, lng: number): Promise<{ km: number; estimado: boolean }> {
  const apiKey = Deno.env.get('GOOGLE_MAPS_API_KEY');
  if (apiKey) {
    try {
      const real = await kmIdaYVueltaReal(OFICINA_FR, lat, lng, apiKey);
      if (real != null) return { km: real, estimado: false };
    } catch {
      // sigue a la estimación
    }
  }
  return { km: kmIdaYVueltaEstimado(OFICINA_FR, lat, lng), estimado: true };
}

type VisitaPendiente = {
  id: string;
  nombre: string;
  apellidos: string;
  fecha_visita: string | null;
  pais: string | null;
  lat: number | null;
  lng: number | null;
};

async function autocompletarVisitas(supabase: SupabaseClient): Promise<{ completadas: number; gastosCreados: number }> {
  const { data: visitas, error } = await supabase
    .from('visitas')
    .select('id, nombre, apellidos, fecha_visita, hora_visita, pais, lat, lng')
    .eq('estado', 'Pendiente')
    .is('eliminado_en', null)
    .not('fecha_visita', 'is', null);
  if (error) throw new Error(`visitas: ${error.message}`);

  const ahora = Date.now();
  const pasadas = (visitas ?? []).filter((v: { fecha_visita: string; hora_visita: string | null }) => {
    // Sin hora, se da por hecha al terminar el día (antes contaba como las 00:00 y se marcaba
    // Realizada a la 01:00 del mismo día — auditoría 2026-10-01).
    const hora = (v.hora_visita ?? '23:00').slice(0, 5);
    return instanteEnParis(v.fecha_visita, hora) + UNA_HORA_MS < ahora;
  }) as (VisitaPendiente & { hora_visita: string | null })[];

  if (pasadas.length === 0) return { completadas: 0, gastosCreados: 0 };

  // .eq('estado','Pendiente') otra vez en el UPDATE: una visita cancelada (o ya completada desde el
  // navegador, AppLayout) entre la lectura y la escritura no se toca, y solo las filas que este
  // proceso cambió reciben nota y kilometraje (auditoría 2026-10-01: había notas duplicadas).
  const { data: actualizadas, error: errorUpdate } = await supabase
    .from('visitas')
    .update({ estado: 'Realizada' })
    .in('id', pasadas.map((v) => v.id))
    .eq('estado', 'Pendiente')
    .select('id');
  if (errorUpdate) throw new Error(`marcar realizada: ${errorUpdate.message}`);
  const idsActualizadas = new Set((actualizadas ?? []).map((v) => v.id as string));

  let gastosCreados = 0;
  for (const v of pasadas.filter((p) => idsActualizadas.has(p.id))) {
    const { error: errorNota } = await supabase
      .from('notas_cliente')
      .insert({ visita_id: v.id, tipo: 'sistema', texto: 'Visita marcada automáticamente como realizada (pasó 1 hora desde la hora prevista)', autor: 'Sistema' });
    if (errorNota) console.error(`autocompletarVisitas: no se pudo insertar la nota de sistema de ${v.id}:`, errorNota.message);

    // Se aplica a España y Francia por igual (confirmado 2026-08-17) — el barème kilométrique es
    // la deducción de la EURL francesa, existe sea cual sea el país de la visita, por eso el
    // gasto se guarda siempre con pais:'Francia' más abajo, no con v.pais.
    const { data: existente, error: errorExistente } = await supabase.from('gastos').select('id').eq('visita_id', v.id).limit(1);
    // Si no se puede comprobar, no se crea: un fallo aquí creaba un gasto duplicado (auditoría 2026-09-26).
    if (errorExistente) {
      console.error(`autocompletarVisitas: no se pudo comprobar el gasto existente de ${v.id}:`, errorExistente.message);
      continue;
    }
    if (existente && existente.length > 0) continue;

    const ruta = v.lat != null && v.lng != null ? await calcularKmIdaYVuelta(v.lat, v.lng) : null;
    const km = ruta?.km ?? null;
    // Misma fórmula del barème que el navegador (calcularIndemnizacionKm), no km × tarifa a secas.
    const importeBase = km != null ? Math.round(calcularIndemnizacionKm(km, CV_VEHICULO_DEFECTO) * 100) / 100 : 0;
    const { error: errorGasto } = await supabase.from('gastos').insert({
      fecha: v.fecha_visita,
      descripcion: `Indemnité kilométrique — visita ${v.nombre} ${v.apellidos}${
        km != null ? ` (${km} km${ruta?.estimado ? ' estimados, revisar' : ''})` : ' (km pendiente de completar)'
      }`,
      categoria: '6251 · Voyages et déplacements',
      pais: 'Francia',
      cuenta_contable: CUENTA_KILOMETRICO,
      tipo_iva: 'EXENTO',
      importe_base: importeBase,
      importe_iva: 0,
      visita_id: v.id,
      km,
      vehiculo_cv: CV_VEHICULO_DEFECTO,
      estado_gasto: 'pendiente',
    });
    if (errorGasto) console.error(`autocompletarVisitas: no se pudo crear el gasto kilométrico de ${v.id}:`, errorGasto.message);
    else gastosCreados++;
  }

  return { completadas: idsActualizadas.size, gastosCreados };
}

async function rechazarPresupuestosCaducados(supabase: SupabaseClient): Promise<number> {
  const hoy = new Date().toISOString().slice(0, 10);
  const { data: presupuestos, error } = await supabase
    .from('presupuestos')
    .select('id')
    .eq('estado', 'Pendiente')
    .not('fecha_validez', 'is', null)
    .lt('fecha_validez', hoy)
    .is('eliminado_en', null);
  if (error) throw new Error(`presupuestos: ${error.message}`);
  if (!presupuestos || presupuestos.length === 0) return 0;

  const ids = presupuestos.map((p: { id: string }) => p.id);
  // .eq('estado','Pendiente') también en el UPDATE, no solo en el SELECT de arriba — sin esto,
  // un presupuesto firmado por el cliente justo en el hueco entre leer y escribir (p.ej. vía
  // documenso-webhook) podía sobrescribirse a Rechazado (condición de carrera real, corregida
  // 2026-08-18).
  const { data: rechazados, error: errorUpdate } = await supabase
    .from('presupuestos')
    .update({ estado: 'Rechazado' })
    .in('id', ids)
    .eq('estado', 'Pendiente')
    .select('id');
  if (errorUpdate) throw new Error(`rechazar presupuestos: ${errorUpdate.message}`);
  // Solo los que este proceso cambió de verdad reciben evento (antes también los que se habían
  // firmado en el hueco entre leer y escribir — auditoría 2026-10-01).
  const idsRechazados = (rechazados ?? []).map((p: { id: string }) => p.id);

  for (const id of idsRechazados) {
    const { error: errorEvento } = await supabase
      .from('documento_eventos')
      .insert({ documento_tipo: 'presupuesto', documento_id: id, evento: 'Marcado como Rechazado (caducado sin respuesta)' });
    if (errorEvento) console.error(`rechazarPresupuestosCaducados: no se pudo insertar documento_eventos de ${id}:`, errorEvento.message);
    const { error: errorFunnel } = await supabase.from('funnel_eventos').insert({ etapa: 'presupuesto_rechazado', presupuesto_id: id });
    if (errorFunnel && errorFunnel.code !== '23505') console.error(`rechazarPresupuestosCaducados: no se pudo insertar funnel_eventos de ${id}:`, errorFunnel.message);
  }

  return idsRechazados.length;
}

const CATORCE_DIAS_MS = 14 * 24 * 60 * 60 * 1000;

async function marcarSolicitudesNoConcretadas(supabase: SupabaseClient): Promise<number> {
  const limite = new Date(Date.now() - CATORCE_DIAS_MS).toISOString();
  const { data: candidatas, error } = await supabase
    .from('solicitudes')
    .select('id, created_at, mensaje_enviado_en, ultima_respuesta_cliente_fecha, ultima_respuesta_revisada, reabierta_en')
    .in('estado', ['Nueva', 'Enviada'])
    .is('visita_id', null)
    .is('presupuesto_vinculado_id', null)
    .lt('created_at', limite);
  if (error) throw new Error(`solicitudes: ${error.message}`);
  // 14 días desde la ÚLTIMA actividad (creación, nuestro mensaje, respuesta del cliente o reapertura),
  // no desde la creación, y nunca con una respuesta del cliente sin revisar: antes se cerraba una
  // solicitud a la que el cliente acababa de contestar (auditoría 2026-10-01).
  type Candidata = {
    id: string;
    created_at: string;
    mensaje_enviado_en: string | null;
    ultima_respuesta_cliente_fecha: string | null;
    ultima_respuesta_revisada: boolean | null;
    reabierta_en: string | null;
  };
  const ids = ((candidatas ?? []) as Candidata[])
    .filter((s) => s.ultima_respuesta_revisada !== false)
    .filter((s) => {
      const ultima = [s.created_at, s.mensaje_enviado_en, s.ultima_respuesta_cliente_fecha, s.reabierta_en]
        .filter((f): f is string => !!f)
        .reduce((max, f) => (f > max ? f : max));
      return ultima < limite;
    })
    .map((s) => s.id);
  if (ids.length === 0) return 0;
  // Mismos filtros repetidos en el UPDATE que en el SELECT (no solo .in('id', ids)) — misma razón
  // que rechazarPresupuestosCaducados: evita pisar una solicitud que se vinculó a una visita o un
  // presupuesto justo en el hueco entre leer y escribir.
  const { error: errorUpdate } = await supabase
    .from('solicitudes')
    .update({ estado: 'No concretada' })
    .in('id', ids)
    .in('estado', ['Nueva', 'Enviada'])
    .is('visita_id', null)
    .is('presupuesto_vinculado_id', null);
  if (errorUpdate) throw new Error(`marcar solicitudes no concretadas: ${errorUpdate.message}`);

  // Esta etapa representa solicitudes que no llegaron a concretar una visita, no un rechazo
  // posterior a una visita ya realizada.
  // Índice único parcial (etapa, solicitud_id): si el evento ya existía, el insert falla con 23505
  // sin duplicar, y eso no es un error.
  for (const id of ids) {
    const { error: errorFunnel } = await supabase.from('funnel_eventos').insert({ etapa: 'solicitud_descartada', solicitud_id: id });
    if (errorFunnel && errorFunnel.code !== '23505') console.error(`marcarSolicitudesNoConcretadas: no se pudo insertar funnel_eventos de ${id}:`, errorFunnel.message);
  }

  return ids.length;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (!(await esLlamadaAutorizada(req))) return jsonResponse({ ok: false, error: 'No autorizado' }, 401);

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  try {
    if (!(await intentarAdquirirLock(supabase))) {
      return jsonResponse({ ok: true, saltado: true, motivo: 'ya hay una ejecución en curso' });
    }
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err instanceof Error ? err.message : err) }, 500);
  }

  try {
    const [visitasResultado, presupuestosRechazados, solicitudesNoConcretadas] = await Promise.all([
      autocompletarVisitas(supabase),
      rechazarPresupuestosCaducados(supabase),
      marcarSolicitudesNoConcretadas(supabase),
    ]);
    return jsonResponse({ ok: true, ...visitasResultado, presupuestosRechazados, solicitudesNoConcretadas });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err instanceof Error ? err.message : err) }, 500);
  } finally {
    await liberarLock(supabase);
  }
});
