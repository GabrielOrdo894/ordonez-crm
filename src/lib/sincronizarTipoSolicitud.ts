import { supabase } from './supabase';
import { normalizarTelefono } from '../modules/clientes/types';

// Rellena `tipo_solicitud` ('visita' | 'presupuesto_orientativo') para las solicitudes que
// todavía están "sin determinar" pero ya tienen una señal real: `visita_id` propio (se pulsó
// "Crear visita desde esta solicitud") o una visita real con el mismo teléfono/email normalizado
// para 'visita'; `presupuesto_vinculado_id` para 'presupuesto_orientativo'. Si hay señal de
// ambas, prioriza 'visita' (es la etapa más avanzada del embudo). Si no hay ninguna señal, se
// deja en null — no se fuerza una clasificación sin datos reales (petición de Gabriel
// 2026-09-09). Nunca pisa una solicitud que ya tiene tipo_solicitud puesto (a mano o por la
// detección de asunto/palabras clave de revisar-gmail).
//
// Se llama al entrar en /solicitudes (SolicitudesPage.tsx) y cada mañana desde la Edge Function
// alerta-diaria — best-effort, no bloqueante, mismo criterio que sincronizarPipelineCliente.
export async function sincronizarTipoSolicitud() {
  const { data: solicitudes, error } = await supabase
    .from('solicitudes')
    .select('id, telefono, email, visita_id, presupuesto_vinculado_id')
    .is('tipo_solicitud', null);
  if (error) {
    console.warn('sincronizarTipoSolicitud: no se pudieron leer solicitudes:', error.message);
    return;
  }
  if (!solicitudes || solicitudes.length === 0) return;

  const { data: visitas, error: errorVisitas } = await supabase
    .from('visitas')
    .select('telefono, email')
    .is('eliminado_en', null)
    .neq('estado', 'Cancelada');
  if (errorVisitas) {
    console.warn('sincronizarTipoSolicitud: no se pudieron leer visitas:', errorVisitas.message);
    return;
  }

  const telefonosVisita = new Set(
    (visitas ?? []).map((v) => (v.telefono ? normalizarTelefono(v.telefono) : null)).filter((t): t is string => !!t),
  );
  const emailsVisita = new Set(
    (visitas ?? []).map((v) => (v.email ? v.email.toLowerCase() : null)).filter((e): e is string => !!e),
  );

  for (const s of solicitudes) {
    const tel = s.telefono ? normalizarTelefono(s.telefono) : null;
    const email = s.email ? s.email.toLowerCase() : null;
    const tieneVisita = !!s.visita_id || (!!tel && telefonosVisita.has(tel)) || (!!email && emailsVisita.has(email));
    const tieneOrientativo = !!s.presupuesto_vinculado_id;

    const tipo: 'visita' | 'presupuesto_orientativo' | null = tieneVisita ? 'visita' : tieneOrientativo ? 'presupuesto_orientativo' : null;
    if (!tipo) continue;

    const { error: errorUpdate } = await supabase.from('solicitudes').update({ tipo_solicitud: tipo }).eq('id', s.id);
    if (errorUpdate) console.warn('sincronizarTipoSolicitud: no se pudo actualizar', s.id, errorUpdate.message);
  }
}
