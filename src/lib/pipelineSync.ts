import { supabase } from './supabase';
import { notaSistema } from './notaSistema';
import { normalizarTelefono, ETAPAS_PIPELINE } from '../modules/clientes/types';
import type { EstadoVisita } from '../modules/visitas/types';

type SenalesPipeline = {
  visitaEstado: EstadoVisita | null;
  visitaTieneFecha: boolean;
  presupuestos: { estado: string }[];
  proyectoEstado: string | null;
  facturaCobrada: boolean;
};

export function etapaAutomatica(s: SenalesPipeline): string {
  if (s.proyectoEstado === 'Finalizado' || s.facturaCobrada) return 'Finalizado';
  if (s.proyectoEstado === 'En curso' || s.proyectoEstado === 'Pausado') return 'En obra';
  if (s.presupuestos.some((p) => p.estado === 'Aceptado')) return 'Presupuesto aceptado';
  if (s.presupuestos.some((p) => p.estado === 'Pendiente')) return 'Presupuesto enviado';
  // Todos los presupuestos de esta visita rechazados (y ninguno pendiente/aceptado, ya
  // descartado arriba) → lead perdido, no "Visita realizada" indistinguible de uno sin responder.
  if (s.presupuestos.length > 0 && s.presupuestos.every((p) => p.estado === 'Rechazado')) return 'Perdido';
  if (s.visitaEstado === 'Cancelada') return 'Perdido';
  if (s.visitaEstado === 'Realizada') return 'Visita realizada';
  if (s.visitaTieneFecha) return 'Visita programada';
  return 'Contacto';
}

// "Perdido" no forma parte de ETAPAS_PIPELINE (índice -1) — queda fuera a propósito para no
// inflar los funnels acumulativos de Dashboard/Inicio (ver comentario en PipelinePage.tsx). Pero
// eso significa que, sin este cálculo aparte, marcar un lead como Perdido le "borraría" de golpe
// el haber llegado antes a "Visita realizada" o "Presupuesto enviado" en esos mismos funnels. Esta
// función lleva la cuenta de la etapa MÁS AVANZADA alcanzada de verdad — nunca retrocede, ni
// siquiera cuando la etapa actual pasa a Perdido (bug real corregido 2026-08-13).
export function etapaMaximaAlcanzada(nuevaEtapa: string, maximaPrevia: string | null): string {
  const idxNueva = ETAPAS_PIPELINE.indexOf(nuevaEtapa as (typeof ETAPAS_PIPELINE)[number]);
  const idxPrevia = ETAPAS_PIPELINE.indexOf((maximaPrevia ?? 'Contacto') as (typeof ETAPAS_PIPELINE)[number]);
  const idx = Math.max(idxNueva, idxPrevia, 0);
  return ETAPAS_PIPELINE[idx];
}

// Punto único de escritura de estado_pipeline para los movimientos MANUALES (flechas, arrastrar,
// marcar perdido/reactivar en Pipeline, y el selector de la ficha de cliente) — comparte la misma
// lógica de etapaMaximaAlcanzada que la sincronización automática de abajo, para que ningún camino
// de escritura se salte el tracking del progreso real.
export async function actualizarEtapaPipeline(visitaId: string, nuevaEtapa: string, nombreUsuario: string) {
  const { data: visita, error: errorLectura } = await supabase
    .from('visitas')
    .select('pipeline_etapa_maxima')
    .eq('id', visitaId)
    .single();
  if (errorLectura) throw errorLectura;

  const etapaMaxima = etapaMaximaAlcanzada(nuevaEtapa, visita?.pipeline_etapa_maxima ?? null);
  const { error } = await supabase
    .from('visitas')
    .update({ estado_pipeline: nuevaEtapa, pipeline_etapa_maxima: etapaMaxima })
    .eq('id', visitaId);
  if (error) throw error;

  await notaSistema(visitaId, `Pipeline movido a ${nuevaEtapa} por ${nombreUsuario}`);
}

// Sincronización secundaria en segundo plano tras guardar visitas/presupuestos/proyectos — no
// bloquea ni interrumpe la acción principal (que ya muestra su propio toast de éxito), así que un
// fallo aquí se registra en consola en vez de un toast, igual que registrarEvento/notificarCambioConfig.
// Si falla una de las lecturas, se corta para no calcular una etapa con datos incompletos.
export async function sincronizarPipelineCliente(telefono: string | null | undefined) {
  const tel = normalizarTelefono(telefono ?? '');
  if (!tel) return;

  const { data: visitas, error: errorVisitas } = await supabase
    .from('visitas')
    .select('*')
    .is('eliminado_en', null)
    .order('created_at', { ascending: false });
  if (errorVisitas) {
    console.warn('sincronizarPipelineCliente: no se pudieron leer visitas:', errorVisitas.message);
    return;
  }
  const visitasCliente = (visitas ?? []).filter((v) => normalizarTelefono(v.telefono) === tel);
  const ultimaVisita = visitasCliente[0];
  if (!ultimaVisita) return;

  // Señales acotadas a ESTA visita (visita_id), no a todo el histórico del teléfono — un cliente
  // repetidor con un proyecto viejo ya cobrado no debe arrastrar su visita nueva a "Finalizado"
  // solo porque comparte teléfono con esa obra anterior (bug real corregido 2026-08-11).
  const { data: presupuestos, error: errorPresupuestos } = await supabase
    .from('presupuestos')
    .select('id, estado')
    .eq('visita_id', ultimaVisita.id)
    .is('eliminado_en', null);
  if (errorPresupuestos) {
    console.warn('sincronizarPipelineCliente: no se pudieron leer presupuestos:', errorPresupuestos.message);
    return;
  }
  const presupuestosVisita = presupuestos ?? [];

  let proyectoEstado: string | null = null;
  const idsPresupuestos = presupuestosVisita.map((p) => p.id);
  if (idsPresupuestos.length > 0) {
    const { data: proyectos, error: errorProyectos } = await supabase
      .from('proyectos')
      .select('estado, presupuesto_id')
      .in('presupuesto_id', idsPresupuestos);
    if (errorProyectos) {
      console.warn('sincronizarPipelineCliente: no se pudieron leer proyectos:', errorProyectos.message);
      return;
    }
    const lista = proyectos ?? [];
    const proyectoRelevante = lista.find((p) => p.estado === 'Finalizado') ?? lista.find((p) => p.estado === 'En curso') ?? lista[0];
    proyectoEstado = proyectoRelevante?.estado ?? null;
  }

  const { data: facturas, error: errorFacturas } = await supabase
    .from('facturas')
    .select('estado_cobro')
    .eq('visita_id', ultimaVisita.id)
    .is('eliminado_en', null);
  if (errorFacturas) {
    console.warn('sincronizarPipelineCliente: no se pudieron leer facturas:', errorFacturas.message);
    return;
  }
  const facturaCobrada = (facturas ?? []).some((f) => f.estado_cobro === 'Cobrada');

  const nuevaEtapa = etapaAutomatica({
    visitaEstado: ultimaVisita.estado,
    visitaTieneFecha: !!ultimaVisita.fecha_visita,
    presupuestos: presupuestosVisita,
    proyectoEstado,
    facturaCobrada,
  });

  const etapaMaxima = etapaMaximaAlcanzada(nuevaEtapa, ultimaVisita.pipeline_etapa_maxima ?? null);
  if (nuevaEtapa !== ultimaVisita.estado_pipeline || etapaMaxima !== ultimaVisita.pipeline_etapa_maxima) {
    const { error } = await supabase
      .from('visitas')
      .update({ estado_pipeline: nuevaEtapa, pipeline_etapa_maxima: etapaMaxima })
      .eq('id', ultimaVisita.id);
    if (error) {
      console.warn('sincronizarPipelineCliente: no se pudo actualizar estado_pipeline:', error.message);
      return;
    }
    if (nuevaEtapa !== ultimaVisita.estado_pipeline) {
      await notaSistema(ultimaVisita.id, `Pipeline actualizado automáticamente a "${nuevaEtapa}"`);
    }
  }
}
