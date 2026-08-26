import { supabase } from './supabase';
import { normalizarTelefono } from '../modules/clientes/types';

export type EtapaFunnel =
  | 'solicitud_entrada'
  | 'solicitud_respondida'
  | 'solicitud_descartada'
  | 'visita_agendada'
  | 'solicitud_vinculada_presupuesto'
  | 'presupuesto_enviado'
  | 'presupuesto_aceptado'
  | 'presupuesto_firmado'
  | 'presupuesto_rechazado'
  | 'obra_finalizada'
  | 'factura_cobrada';

// Antes el embudo se quedaba corto en "Firmado" — no reflejaba el resto del recorrido real hasta
// que la obra se entrega y se cobra (auditoría 2026-08-13). "obra_finalizada" se dispara al marcar
// el proyecto como Finalizado en Planning de obra, "factura_cobrada" al registrar un pago completo
// (o marcar Cobrada a mano) en Facturas — ver registrarEventoFunnel en PlanningObraDetalle.tsx,
// RegistrarPagoModal.tsx y FacturaForm.tsx.
export const ETAPAS_FUNNEL_SOLICITUD: EtapaFunnel[] = [
  'solicitud_entrada',
  'solicitud_respondida',
  'solicitud_vinculada_presupuesto',
  'presupuesto_enviado',
  'presupuesto_firmado',
  'obra_finalizada',
  'factura_cobrada',
];

// Mapeo estado de presupuesto → etapa de funnel, compartido entre los 3 sitios donde se cambia
// el estado de un presupuesto: PresupuestosPage.tsx, DocumentoDetalleInline.tsx y
// SolicitudesPage.tsx (pestaña "Respuestas a presupuestos").
export const ETAPA_FUNNEL_POR_ESTADO_PRESUPUESTO: Partial<Record<string, EtapaFunnel>> = {
  Pendiente: 'presupuesto_enviado',
  Aceptado: 'presupuesto_aceptado',
  Rechazado: 'presupuesto_rechazado',
};

// visita_agendada (2026-08-26) se registra al crear una visita desde una solicitud (ver
// PrefillVisita.solicitudId en VisitaForm.tsx) — a propósito NO entra en ETAPAS_FUNNEL_SOLICITUD
// (el embudo visual de barras de /solicitudes y Dashboard), solo se usa para calcular la duración
// solicitud→visita en la exportación completa del Dashboard (Ajustes), sin tocar un gráfico que ya
// funciona y que Gabriel no pidió cambiar.
export const ETIQUETA_ETAPA_FUNNEL: Record<EtapaFunnel, string> = {
  solicitud_entrada: 'Entradas',
  solicitud_respondida: 'Respondidas',
  solicitud_descartada: 'Descartadas',
  visita_agendada: 'Visita agendada',
  solicitud_vinculada_presupuesto: 'Vinculadas a presupuesto',
  presupuesto_enviado: 'Presupuesto enviado',
  presupuesto_aceptado: 'Presupuesto aceptado',
  presupuesto_firmado: 'Firmado',
  presupuesto_rechazado: 'Rechazado',
  obra_finalizada: 'Obra finalizada',
  factura_cobrada: 'Factura cobrada',
};

export type FunnelEventoBase = { etapa: EtapaFunnel; solicitud_id: string | null; presupuesto_id: string | null };

// "obra_finalizada"/"factura_cobrada" cuelgan del proyecto/factura, no directamente de la
// solicitud — se vinculan por presupuesto_id igual que el resto de etapas post-presupuesto.
const ETAPAS_POR_PRESUPUESTO_ID = new Set<EtapaFunnel>(['obra_finalizada', 'factura_cobrada']);

// Único punto de conteo de eventos únicos por etapa — usado por el Dashboard (Marketing) y por
// Solicitudes (embudo de 90 días). Antes cada pantalla tenía su propia copia de este cálculo y
// solo una se actualizó al añadir obra_finalizada/factura_cobrada, dejando la otra con el campo
// equivocado y contando siempre 0 en esas dos etapas (hallazgo real, revisión 2026-08-13).
export function contarUnicosEnFunnel<T extends FunnelEventoBase>(eventos: T[], etapa: EtapaFunnel): number {
  const campo = etapa.startsWith('presupuesto_') || ETAPAS_POR_PRESUPUESTO_ID.has(etapa) ? 'presupuesto_id' : 'solicitud_id';
  return new Set(eventos.filter((e) => e.etapa === etapa).map((e) => e[campo]).filter(Boolean)).size;
}

// No lanza si falla el insert — es un registro secundario para analítica, no debe tumbar la
// acción principal (que ya tiene su propio toast de éxito/error). Mismo criterio que registrarEvento
// en src/lib/eventos.ts.
//
// Idempotente por (etapa, solicitud_id|presupuesto_id): comprueba si ya existe un evento igual
// antes de insertar. Sin esto, dos disparadores distintos del mismo cambio de estado (p. ej. la
// acción manual "Marcar como Enviada" y la detección automática de revisar-gmail) podían insertar
// el mismo evento dos veces — confirmado con duplicados reales en producción, auditoría
// 2026-08-18. `funnelTracking.ts` no lo evita del todo por sí solo porque `revisar-gmail` corre en
// Deno y no puede importar este fichero — tiene su propia comprobación gemela, ver su código.
export async function registrarEventoFunnel(
  etapa: EtapaFunnel,
  opts: { solicitudId?: string | null; presupuestoId?: string | null; fuente?: string | null } = {},
) {
  const idRelevante = opts.presupuestoId ?? opts.solicitudId;
  if (idRelevante) {
    const campo = opts.presupuestoId ? 'presupuesto_id' : 'solicitud_id';
    const { data: existente } = await supabase.from('funnel_eventos').select('id').eq('etapa', etapa).eq(campo, idRelevante).limit(1);
    if (existente && existente.length > 0) return;
  }
  const { error } = await supabase.from('funnel_eventos').insert({
    etapa,
    solicitud_id: opts.solicitudId ?? null,
    presupuesto_id: opts.presupuestoId ?? null,
    fuente: opts.fuente ?? null,
  });
  if (error) console.warn('No se pudo registrar el evento de funnel:', error.message);
}

// Auto-vinculación al crear un presupuesto: cruza por teléfono/email normalizado contra
// solicitudes sin vincular todavía, mismo criterio que datosContactoCliente() en
// ClientePrivacidadTab.tsx/pipelineSync.ts. Antes esto solo se hacía a mano desde el desplegable
// "Vincular a presupuesto" de SolicitudDetalle.tsx, y casi nunca se hacía — la inmensa mayoría de
// presupuestos se quedaban sin vincular y el escalón "Vinculadas a presupuesto" del embudo salía
// vacío aunque los escalones de después (enviado, firmado...) tuvieran números normales (hallazgo
// real, auditoría 2026-08-19). Si hay varias solicitudes candidatas, se vincula la más reciente.
// Best-effort, no bloqueante — igual que sincronizarPipelineCliente: un fallo aquí no debe tumbar
// la creación del presupuesto, que ya tiene su propio toast de éxito/error.
export async function vincularSolicitudPorContacto(
  presupuestoId: string,
  contacto: { telefono?: string | null; email?: string | null },
) {
  const tel = contacto.telefono ? normalizarTelefono(contacto.telefono) : null;
  const email = contacto.email ? contacto.email.toLowerCase() : null;
  if (!tel && !email) return;

  const { data: solicitudes, error } = await supabase
    .from('solicitudes')
    .select('id, telefono, email, fuente')
    .is('presupuesto_vinculado_id', null)
    .neq('estado', 'Descartada')
    .order('created_at', { ascending: false });
  if (error) {
    console.warn('vincularSolicitudPorContacto: no se pudieron leer solicitudes:', error.message);
    return;
  }

  const match = (solicitudes ?? []).find((s) => {
    const sTel = s.telefono ? normalizarTelefono(s.telefono) : null;
    const sEmail = s.email ? String(s.email).toLowerCase() : null;
    return (tel && sTel === tel) || (email && sEmail === email);
  });
  if (!match) return;

  const { error: errorUpdate } = await supabase
    .from('solicitudes')
    .update({ presupuesto_vinculado_id: presupuestoId })
    .eq('id', match.id);
  if (errorUpdate) {
    console.warn('vincularSolicitudPorContacto: no se pudo vincular la solicitud:', errorUpdate.message);
    return;
  }
  // El embudo espera que "Respondidas" nunca sea menor que "Vinculadas a presupuesto" (llegar a
  // un presupuesto implica que hubo contacto antes) — si la solicitud nunca se marcó "Enviada"
  // desde el CRM (p. ej. el presupuesto se creó directo sin pasar por Solicitudes), regístralo
  // aquí también. Idempotente (registrarEventoFunnel no duplica si ya existe), así que es seguro
  // llamarlo aunque el evento ya estuviera. Hallazgo real, auditoría 2026-08-19: 3 solicitudes
  // vinculadas se quedaron sin este evento y el embudo mostraba más vinculadas que respondidas.
  await registrarEventoFunnel('solicitud_respondida', { solicitudId: match.id, fuente: match.fuente });
  await registrarEventoFunnel('solicitud_vinculada_presupuesto', {
    solicitudId: match.id,
    presupuestoId,
    fuente: match.fuente,
  });
}
