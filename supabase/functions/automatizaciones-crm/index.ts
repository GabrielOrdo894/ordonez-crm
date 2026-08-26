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
//
// Reutiliza el patrón de autorización de alerta-diaria/index.ts y el cálculo de distancia
// (Distance Matrix con fallback Haversine) de notificar-visita/index.ts.
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

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

type Oficina = { lat: number; lng: number };
// El kilometraje siempre se calcula desde el taller de Hendaye, sea España o Francia la visita —
// misma regla que ya usa el cálculo manual (src/lib/calcularKmIdaYVuelta.ts, un único origen fijo)
// y consistente con que el gasto resultante siempre se contabiliza en Francia (ver más abajo).
const OFICINA_FR: Oficina = { lat: 43.3546525, lng: -1.7747975 };

// Barème kilométrique 2026 (voitures), tramo hasta 5.000 km/año — misma tabla que
// src/modules/finanzas/gastos/baremoKilometrico.ts, duplicada aquí porque el despliegue de Edge
// Functions vía MCP no resuelve imports relativos entre funciones ni con el frontend (mismo
// motivo documentado en alerta-diaria/index.ts).
const TARIFA_KM_HASTA_5000: Record<number, number> = { 3: 0.529, 4: 0.606, 5: 0.636, 6: 0.665, 7: 0.697 };
const CV_VEHICULO_DEFECTO = 7;
const CUENTA_KILOMETRICO = '6251';

function tarifaPorCv(cv: number): number {
  return TARIFA_KM_HASTA_5000[cv] ?? TARIFA_KM_HASTA_5000[7];
}

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

async function calcularKmIdaYVuelta(lat: number, lng: number): Promise<number> {
  const apiKey = Deno.env.get('GOOGLE_MAPS_API_KEY');
  if (apiKey) {
    try {
      const real = await kmIdaYVueltaReal(OFICINA_FR, lat, lng, apiKey);
      if (real != null) return real;
    } catch {
      // sigue al fallback de abajo
    }
  }
  return kmIdaYVueltaEstimado(OFICINA_FR, lat, lng);
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
    const hora = (v.hora_visita ?? '00:00').slice(0, 5);
    return new Date(`${v.fecha_visita}T${hora}:00`).getTime() + UNA_HORA_MS < ahora;
  }) as (VisitaPendiente & { hora_visita: string | null })[];

  if (pasadas.length === 0) return { completadas: 0, gastosCreados: 0 };

  const { error: errorUpdate } = await supabase
    .from('visitas')
    .update({ estado: 'Realizada' })
    .in('id', pasadas.map((v) => v.id));
  if (errorUpdate) throw new Error(`marcar realizada: ${errorUpdate.message}`);

  let gastosCreados = 0;
  for (const v of pasadas) {
    await supabase
      .from('notas_cliente')
      .insert({ visita_id: v.id, tipo: 'sistema', texto: 'Visita marcada automáticamente como realizada (pasó 1 hora desde la hora prevista)', autor: 'Sistema' });

    // Se aplica a España y Francia por igual (confirmado 2026-08-17) — el barème kilométrique es
    // la deducción de la EURL francesa, existe sea cual sea el país de la visita, por eso el
    // gasto se guarda siempre con pais:'Francia' más abajo, no con v.pais.
    const { data: existente } = await supabase.from('gastos').select('id').eq('visita_id', v.id).limit(1);
    if (existente && existente.length > 0) continue;

    const km = v.lat != null && v.lng != null ? await calcularKmIdaYVuelta(v.lat, v.lng) : null;
    const importeBase = km != null ? Math.round(km * tarifaPorCv(CV_VEHICULO_DEFECTO) * 100) / 100 : 0;
    const { error: errorGasto } = await supabase.from('gastos').insert({
      fecha: v.fecha_visita,
      descripcion: `Indemnité kilométrique — visita ${v.nombre} ${v.apellidos}${km != null ? ` (${km} km)` : ' (km pendiente de completar)'}`,
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
    if (!errorGasto) gastosCreados++;
  }

  return { completadas: pasadas.length, gastosCreados };
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
  const { error: errorUpdate } = await supabase
    .from('presupuestos')
    .update({ estado: 'Rechazado' })
    .in('id', ids)
    .eq('estado', 'Pendiente');
  if (errorUpdate) throw new Error(`rechazar presupuestos: ${errorUpdate.message}`);

  for (const id of ids) {
    await supabase.from('documento_eventos').insert({ documento_tipo: 'presupuesto', documento_id: id, evento: 'Marcado como Rechazado (caducado sin respuesta)' });
    await supabase.from('funnel_eventos').insert({ etapa: 'presupuesto_rechazado', presupuesto_id: id });
  }

  return ids.length;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (!esLlamadaAutorizada(req)) return jsonResponse({ ok: false, error: 'No autorizado' }, 401);

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  try {
    if (!(await intentarAdquirirLock(supabase))) {
      return jsonResponse({ ok: true, saltado: true, motivo: 'ya hay una ejecución en curso' });
    }
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err instanceof Error ? err.message : err) }, 500);
  }

  try {
    const [visitasResultado, presupuestosRechazados] = await Promise.all([
      autocompletarVisitas(supabase),
      rechazarPresupuestosCaducados(supabase),
    ]);
    return jsonResponse({ ok: true, ...visitasResultado, presupuestosRechazados });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err instanceof Error ? err.message : err) }, 500);
  } finally {
    await liberarLock(supabase);
  }
});
