import { supabase } from '../../lib/supabase';
import { notaSistema } from '../../lib/notaSistema';
import { eliminarEventoVisita, sincronizarGoogleCalendarVisita } from '../../lib/googleCalendar';
import { crearGastoKilometricoPendiente } from '../../lib/gastoKilometrico';
import type { EstadoVisita, Visita } from './types';

// Único camino para cambiar el estado de una visita a mano (auditoría 2026-10-01: había cuatro
// copias — Visitas, ficha de visita, Inicio y el formulario — y cada una hacía una parte distinta).
// Deja siempre nota de sistema y mantiene Calendar coherente:
//   · Cancelada → borra el evento (y solo entonces vacía google_event_id: si el borrado falla, el ID
//     se conserva para poder reintentarlo, antes se perdía y el evento quedaba huérfano).
//   · Realizada → actualiza el color del evento y genera el gasto de kilometraje si falta.
//   · Pendiente (reactivar) → vuelve a crear el evento si no lo tiene, sin email de "visita agendada".
// El pipeline lo recalcula el trigger de la base de datos al cambiar el estado.
// Devuelve avisos (no lanza por fallos de Calendar o kilometraje: el estado ya quedó guardado).
export async function cambiarEstadoVisita(
  visita: Visita,
  estado: EstadoVisita,
  opts: { motivo?: string; usuario: string },
): Promise<string[]> {
  const avisos: string[] = [];
  const { error } = await supabase.from('visitas').update({ estado }).eq('id', visita.id);
  if (error) throw error;

  const textoNota =
    estado === 'Cancelada'
      ? `Visita cancelada${opts.motivo ? ` — motivo: ${opts.motivo}` : ''} por ${opts.usuario}`
      : estado === 'Realizada'
        ? `Visita marcada como realizada por ${opts.usuario}`
        : `Visita reactivada (Pendiente) por ${opts.usuario}`;
  try {
    await notaSistema(visita.id, textoNota);
  } catch (e) {
    avisos.push(`No se pudo anotar el cambio en el historial: ${(e as Error).message}`);
  }

  if (estado === 'Cancelada') {
    if (visita.google_event_id) {
      try {
        await eliminarEventoVisita(visita.google_event_id);
        const { error: errorLimpiar } = await supabase.from('visitas').update({ google_event_id: null }).eq('id', visita.id);
        if (errorLimpiar) avisos.push(`Evento borrado, pero no se pudo limpiar su ID en la visita: ${errorLimpiar.message}`);
      } catch (e) {
        avisos.push(`No se pudo borrar el evento de Google Calendar (se reintentará al volver a cancelar): ${(e as Error).message}`);
      }
    }
    return avisos;
  }

  // Realizada / Pendiente: el evento refleja el estado nuevo (color) o se recrea si se había borrado.
  avisos.push(
    ...(await sincronizarGoogleCalendarVisita({
      visitaId: visita.id,
      googleEventId: visita.google_event_id,
      visita: { ...visita, estado },
      notificar: false,
    })),
  );

  if (estado === 'Realizada') {
    try {
      await crearGastoKilometricoPendiente({ ...visita, estado });
    } catch (e) {
      avisos.push(`No se pudo generar el gasto de kilometraje de ${visita.nombre}: ${(e as Error).message}`);
    }
  }
  return avisos;
}

// Al mandar visitas a la papelera se borra su evento de Calendar (antes seguía ahí con sus avisos y
// el equipo podía presentarse a una visita "eliminada" — auditoría 2026-10-01). Al restaurarlas,
// restaurarEventoVisita lo vuelve a crear si la visita sigue pendiente y no ha pasado.
export async function retirarEventosDeVisitas(ids: string[]): Promise<string[]> {
  const avisos: string[] = [];
  if (ids.length === 0) return avisos;
  const { data, error } = await supabase.from('visitas').select('id, google_event_id').in('id', ids).not('google_event_id', 'is', null);
  if (error) return [`No se pudieron leer los eventos de Calendar: ${error.message}`];
  for (const v of data ?? []) {
    try {
      await eliminarEventoVisita(v.google_event_id as string);
      const { error: errorLimpiar } = await supabase.from('visitas').update({ google_event_id: null }).eq('id', v.id);
      if (errorLimpiar) avisos.push(`Evento borrado, pero no se pudo limpiar su ID: ${errorLimpiar.message}`);
    } catch (e) {
      avisos.push(`No se pudo borrar un evento de Google Calendar: ${(e as Error).message}`);
    }
  }
  return avisos;
}

export async function restaurarEventoVisita(visita: Visita, hoy: string): Promise<string[]> {
  if (visita.estado !== 'Pendiente' || !visita.fecha_visita || visita.fecha_visita < hoy) return [];
  return sincronizarGoogleCalendarVisita({ visitaId: visita.id, googleEventId: visita.google_event_id, visita, notificar: false });
}
