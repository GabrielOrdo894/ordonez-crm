import { supabase } from './supabase';
import { notaSistema } from './notaSistema';
import { normalizarTelefono } from '../modules/clientes/types';
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
  if (s.visitaEstado === 'Realizada') return 'Visita realizada';
  if (s.visitaTieneFecha) return 'Visita programada';
  return 'Contacto';
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

  const { data: presupuestos, error: errorPresupuestos } = await supabase
    .from('presupuestos')
    .select('id, estado, cliente_tel')
    .is('eliminado_en', null);
  if (errorPresupuestos) {
    console.warn('sincronizarPipelineCliente: no se pudieron leer presupuestos:', errorPresupuestos.message);
    return;
  }
  const presupuestosCliente = (presupuestos ?? []).filter((p) => normalizarTelefono(p.cliente_tel ?? '') === tel);

  let proyectoEstado: string | null = null;
  const idsPresupuestos = presupuestosCliente.map((p) => p.id);
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
    .select('estado_cobro, cliente_tel')
    .is('eliminado_en', null);
  if (errorFacturas) {
    console.warn('sincronizarPipelineCliente: no se pudieron leer facturas:', errorFacturas.message);
    return;
  }
  const facturaCobrada = (facturas ?? []).some(
    (f) => normalizarTelefono(f.cliente_tel ?? '') === tel && f.estado_cobro === 'Cobrada',
  );

  const nuevaEtapa = etapaAutomatica({
    visitaEstado: ultimaVisita.estado,
    visitaTieneFecha: !!ultimaVisita.fecha_visita,
    presupuestos: presupuestosCliente,
    proyectoEstado,
    facturaCobrada,
  });

  if (nuevaEtapa !== ultimaVisita.estado_pipeline) {
    const { error } = await supabase.from('visitas').update({ estado_pipeline: nuevaEtapa }).eq('id', ultimaVisita.id);
    if (error) {
      console.warn('sincronizarPipelineCliente: no se pudo actualizar estado_pipeline:', error.message);
      return;
    }
    await notaSistema(ultimaVisita.id, `Pipeline actualizado automáticamente a "${nuevaEtapa}"`);
  }
}
