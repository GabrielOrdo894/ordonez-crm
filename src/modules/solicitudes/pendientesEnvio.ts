import { supabase } from '../../lib/supabase';
import { registrarEvento } from '../../lib/eventos';
import { registrarEtapaPresupuestoConBackfill } from '../../lib/funnelTracking';

// "Marcar como enviado" en Pendientes de enviar (mensaje de WhatsApp/SMS ya mandado a mano): el
// presupuesto se ha enviado de verdad, así que si seguía en Borrador pasa a Pendiente y cuenta en el
// embudo como enviado. Antes solo se guardaba la fecha del mensaje y el presupuesto seguía saliendo
// como "Borrador sin enviar" en Avisos y en la campana (auditoría 2026-10-01).
export async function marcarMensajesPendientesEnviados(ids: string[]) {
  const { error } = await supabase
    .from('presupuestos')
    .update({ mensaje_pendiente_enviado_en: new Date().toISOString() })
    .in('id', ids);
  if (error) throw error;

  const { data: pasados, error: errorEstado } = await supabase
    .from('presupuestos')
    .update({ estado: 'Pendiente' })
    .in('id', ids)
    .eq('estado', 'Borrador')
    .select('id');
  if (errorEstado) throw errorEstado;
  for (const p of pasados ?? []) {
    await registrarEvento('presupuesto', p.id as string, 'Enviado al cliente por WhatsApp/SMS — pasa a Pendiente');
    await registrarEtapaPresupuestoConBackfill('Pendiente', p.id as string);
  }
}
