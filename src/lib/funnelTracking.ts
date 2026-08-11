import { supabase } from './supabase';

export type EtapaFunnel =
  | 'solicitud_entrada'
  | 'solicitud_respondida'
  | 'solicitud_descartada'
  | 'solicitud_vinculada_presupuesto'
  | 'presupuesto_enviado'
  | 'presupuesto_aceptado'
  | 'presupuesto_firmado'
  | 'presupuesto_rechazado';

export const ETAPAS_FUNNEL_SOLICITUD: EtapaFunnel[] = [
  'solicitud_entrada',
  'solicitud_respondida',
  'solicitud_vinculada_presupuesto',
  'presupuesto_enviado',
  'presupuesto_firmado',
];

// Mapeo estado de presupuesto → etapa de funnel, compartido entre PresupuestosPage.tsx y
// DocumentoDetalleInline.tsx (los dos sitios donde se cambia el estado de un presupuesto).
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
};

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
