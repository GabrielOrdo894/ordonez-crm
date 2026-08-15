import { supabase } from './supabase';

export type EtapaFunnel =
  | 'solicitud_entrada'
  | 'solicitud_respondida'
  | 'solicitud_descartada'
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

export const ETIQUETA_ETAPA_FUNNEL: Record<EtapaFunnel, string> = {
  solicitud_entrada: 'Entradas',
  solicitud_respondida: 'Respondidas',
  solicitud_descartada: 'Descartadas',
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
export async function registrarEventoFunnel(
  etapa: EtapaFunnel,
  opts: { solicitudId?: string | null; presupuestoId?: string | null; fuente?: string | null } = {},
) {
  const { error } = await supabase.from('funnel_eventos').insert({
    etapa,
    solicitud_id: opts.solicitudId ?? null,
    presupuesto_id: opts.presupuestoId ?? null,
    fuente: opts.fuente ?? null,
  });
  if (error) console.warn('No se pudo registrar el evento de funnel:', error.message);
}
