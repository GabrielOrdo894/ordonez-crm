import { supabase } from './supabase';
import { normalizarNombre, normalizarTelefono } from '../modules/clientes/types';

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
  | 'factura_cobrada'
  | 'primer_acompte_cobrado'
  | 'factura_final_cobrada';

// Recorrido rediseñado el 2026-09-16 (petición de Gabriel) para reflejar mejor el avance real del
// cliente hacia la obra:
// - "Visita agendada" sustituye a "Respondida" como 2º escalón.
// - Se quita "Vinculada a presupuesto" (paso administrativo interno, no un avance real del
//   cliente).
// - "Aceptado" sustituye a "Firmado" (el cliente ya decidió que sí en cuanto acepta — la firma es
//   solo el trámite formal posterior).
// - Se quita "Obra finalizada" — depende de marcar el proyecto como Finalizado en Planning de
//   obra, un paso que en la práctica casi nunca se usa, así que no hay forma fiable de trackearlo
//   (confirmado por Gabriel, no es un hallazgo de auditoría esta vez).
// - "Primer acompte cobrado" y "Factura final cobrada" sustituyen a "Factura cobrada": Reformas
//   Ordoñez siempre pide un primer acompte del 50% antes de empezar, así que ese cobro merece su
//   propio escalón en vez de mezclarse con el de la factura final — ver registrarEventoFunnel en
//   RegistrarPagoModal.tsx y FacturaForm.tsx, que ahora miran factura.tipo ('acompte' vs 'normal')
//   para decidir cuál de las dos etapas registrar.
// Las etapas de presupuesto de aquí para abajo solo cuentan presupuestos `normal` (ver
// excluirPresupuestoIds en contarUnicosEnFunnel) para que el embudo siga siendo descendente — un
// orientativo aceptado no es ingreso real todavía. "Visita agendada" depende de que la visita quede
// enlazada a su solicitud de origen — ver vincularSolicitudPorVisita en VisitaForm.tsx (antes solo
// se enlazaba desde el botón "Crear visita desde esta solicitud", lo que dejaba fuera la mayoría de
// visitas reales).
export const ETAPAS_FUNNEL_SOLICITUD: EtapaFunnel[] = [
  'solicitud_entrada',
  'visita_agendada',
  'presupuesto_enviado',
  'presupuesto_aceptado',
  'primer_acompte_cobrado',
  'factura_final_cobrada',
];

// Mapeo estado de presupuesto → etapa de funnel, compartido entre los 3 sitios donde se cambia
// el estado de un presupuesto: PresupuestosPage.tsx, DocumentoDetalleInline.tsx y
// SolicitudesPage.tsx (pestaña "Respuestas a presupuestos").
export const ETAPA_FUNNEL_POR_ESTADO_PRESUPUESTO: Partial<Record<string, EtapaFunnel>> = {
  Pendiente: 'presupuesto_enviado',
  Aceptado: 'presupuesto_aceptado',
  Rechazado: 'presupuesto_rechazado',
};

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
  primer_acompte_cobrado: 'Primer acompte cobrado',
  factura_final_cobrada: 'Factura final cobrada',
};

export type FunnelEventoBase = { etapa: EtapaFunnel; solicitud_id: string | null; presupuesto_id: string | null };

// "obra_finalizada"/"factura_cobrada"/"primer_acompte_cobrado"/"factura_final_cobrada" cuelgan del
// proyecto/factura, no directamente de la solicitud — se vinculan por presupuesto_id igual que el
// resto de etapas post-presupuesto.
const ETAPAS_POR_PRESUPUESTO_ID = new Set<EtapaFunnel>([
  'obra_finalizada',
  'factura_cobrada',
  'primer_acompte_cobrado',
  'factura_final_cobrada',
]);

// Único punto de conteo de eventos únicos por etapa — usado por el Dashboard (Marketing) y por
// Solicitudes (embudo de 90 días). Antes cada pantalla tenía su propia copia de este cálculo y
// solo una se actualizó al añadir obra_finalizada/factura_cobrada, dejando la otra con el campo
// equivocado y contando siempre 0 en esas dos etapas (hallazgo real, revisión 2026-08-13).
//
// excluirPresupuestoIds (2026-09-16): ids de presupuestos `orientativo` a ignorar — un orientativo
// no es ingreso real todavía (mismo criterio que el KPI "Aceptados" de PresupuestosPage.tsx), así
// que no debe contar en ningún escalón del embudo relacionado con presupuestos. Sin este filtro
// "Vinculadas a presupuesto" podía salir más alto que "Visita agendada" (un orientativo se puede
// vincular sin pasar por visita), rompiendo el orden descendente del embudo.
export function contarUnicosEnFunnel<T extends FunnelEventoBase>(
  eventos: T[],
  etapa: EtapaFunnel,
  excluirPresupuestoIds?: Set<string>,
): number {
  const campo = etapa.startsWith('presupuesto_') || ETAPAS_POR_PRESUPUESTO_ID.has(etapa) ? 'presupuesto_id' : 'solicitud_id';
  const relevantes = eventos.filter(
    (e) => e.etapa === etapa && !(excluirPresupuestoIds && e.presupuesto_id && excluirPresupuestoIds.has(e.presupuesto_id)),
  );
  return new Set(relevantes.map((e) => e[campo]).filter(Boolean)).size;
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

// Auto-vinculación al crear un presupuesto: cruza por teléfono/email normalizado y, como último
// recurso, por nombre completo normalizado contra
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
  contacto: { telefono?: string | null; email?: string | null; nombre?: string | null },
) {
  const tel = contacto.telefono ? normalizarTelefono(contacto.telefono) : null;
  const email = contacto.email ? contacto.email.trim().toLowerCase() : null;
  // Nombre completo exacto (normalizado) como tercer criterio — encuentra coincidencias cuando el
  // mismo cliente da un teléfono/email distinto en cada sitio (petición de Gabriel, 2026-09-16).
  const nombre = contacto.nombre ? normalizarNombre(contacto.nombre) : null;
  if (!tel && !email && !nombre) return;

  const { data: solicitudes, error } = await supabase
    .from('solicitudes')
    .select('id, nombre, telefono, email, fuente')
    .is('presupuesto_vinculado_id', null)
    .not('estado', 'in', '(No concretada,Rechazada,Eliminada)')
    .order('created_at', { ascending: false });
  if (error) {
    console.warn('vincularSolicitudPorContacto: no se pudieron leer solicitudes:', error.message);
    return;
  }

  const match = seleccionarSolicitudPorContacto(
    solicitudes ?? [],
    { tel, email, nombre },
    'vincularSolicitudPorContacto',
  );
  if (!match) return;

  // Vincular un presupuesto sin pasar por una visita (Ricardo lo hace directo, ver petición de
  // Gabriel 2026-09-15) es también un camino de aceptación válido — se marca Aceptada aquí mismo.
  const { error: errorUpdate } = await supabase
    .from('solicitudes')
    .update({ presupuesto_vinculado_id: presupuestoId, estado: 'Aceptada' })
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

// Mismo cruce por contacto que vincularSolicitudPorContacto, pero para visitas — se llama al crear
// una visita que NO viene del botón "Crear visita desde esta solicitud" (que ya enlaza a mano, ver
// VisitaForm.tsx). Sin esto, una visita creada buscando el cliente directamente (la vía más
// habitual en la práctica) nunca quedaba enlazada a su solicitud de origen, así que "Visita
// agendada" del embudo se quedaba muy por debajo de la realidad — 6 eventos registrados en 90 días
// frente a 25 visitas reales, la mayoría con una solicitud coincidente sin enlazar (hallazgo real
// de Gabriel, 2026-09-16, con un backfill único sobre las 9 solicitudes ya afectadas en producción).
// Best-effort, no bloqueante — igual que vincularSolicitudPorContacto.
export async function vincularSolicitudPorVisita(
  visitaId: string,
  contacto: { telefono?: string | null; email?: string | null; nombre?: string | null },
) {
  const tel = contacto.telefono ? normalizarTelefono(contacto.telefono) : null;
  const email = contacto.email ? contacto.email.trim().toLowerCase() : null;
  // Nombre completo exacto (normalizado) como tercer criterio — mismo motivo que en
  // vincularSolicitudPorContacto (petición de Gabriel, 2026-09-16).
  const nombre = contacto.nombre ? normalizarNombre(contacto.nombre) : null;
  if (!tel && !email && !nombre) return;

  const { data: solicitudes, error } = await supabase
    .from('solicitudes')
    .select('id, nombre, telefono, email, fuente')
    .is('visita_id', null)
    .not('estado', 'in', '(No concretada,Rechazada,Eliminada)')
    .order('created_at', { ascending: false });
  if (error) {
    console.warn('vincularSolicitudPorVisita: no se pudieron leer solicitudes:', error.message);
    return;
  }

  const match = seleccionarSolicitudPorContacto(
    solicitudes ?? [],
    { tel, email, nombre },
    'vincularSolicitudPorVisita',
  );
  if (!match) return;

  const { error: errorUpdate } = await supabase.from('solicitudes').update({ visita_id: visitaId, estado: 'Aceptada' }).eq('id', match.id);
  if (errorUpdate) {
    console.warn('vincularSolicitudPorVisita: no se pudo enlazar la solicitud:', errorUpdate.message);
    return;
  }
  await registrarEventoFunnel('visita_agendada', { solicitudId: match.id, fuente: match.fuente });
}

type SolicitudParaCruce = {
  id: string;
  nombre: string | null;
  telefono: string | null;
  email: string | null;
  fuente: string | null;
};

type ContactoNormalizado = { tel: string | null; email: string | null; nombre: string | null };

// Las solicitudes ya llegan ordenadas de la más reciente a la más antigua. La prioridad es
// deliberada: teléfono, después email y solo entonces nombre completo. Un nombre por sí solo no
// identifica de forma segura a una persona si hay más de una solicitud candidata.
function seleccionarSolicitudPorContacto(
  solicitudes: SolicitudParaCruce[],
  contacto: ContactoNormalizado,
  contexto: string,
): SolicitudParaCruce | undefined {
  if (contacto.tel) {
    const porTelefono = solicitudes.find((s) => normalizarTelefono(s.telefono ?? '') === contacto.tel);
    if (porTelefono) return porTelefono;
  }

  if (contacto.email) {
    const porEmail = solicitudes.find((s) => s.email?.trim().toLowerCase() === contacto.email);
    if (porEmail) return porEmail;
  }

  if (!contacto.nombre) return undefined;
  const porNombre = solicitudes.filter((s) => normalizarNombre(s.nombre ?? '') === contacto.nombre);
  if (porNombre.length > 1) {
    console.warn(
      `${contexto}: se omitió la vinculación automática; hay ${porNombre.length} solicitudes con el nombre completo "${contacto.nombre}".`,
    );
    return undefined;
  }
  return porNombre[0];
}
