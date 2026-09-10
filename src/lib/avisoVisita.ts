import { supabase } from './supabase';

// presupuestos/facturas/proyectos/gastos/galeria/solicitudes.visita_id sí tienen FK real hacia
// visitas con ON DELETE SET NULL (corregido el comentario 2026-08-18, antes decía lo contrario) —
// borrar/purgar una visita no los arrastra en cascada, pero SÍ les deja el visita_id a NULL
// automáticamente, perdiendo el vínculo con el cliente. Se usa tanto al mover a la papelera
// (VisitasPage) como al purgar definitivamente (PapeleraPage) para avisar con el recuento real
// antes de confirmar (hallazgo real, revisión 2026-08-12; gastos y galería sumados 2026-08-18 —
// antes solo se avisaba de presupuestos/facturas/proyectos, dejando fotos y gastos de kilometraje
// huérfanos sin ningún aviso).
export async function avisoDocumentosActivosDeVisita(visitaId: string): Promise<string> {
  const resultados = await Promise.all([
    supabase.from('presupuestos').select('id', { count: 'exact', head: true }).eq('visita_id', visitaId).is('eliminado_en', null),
    supabase.from('facturas').select('id', { count: 'exact', head: true }).eq('visita_id', visitaId).is('eliminado_en', null),
    supabase.from('proyectos').select('id', { count: 'exact', head: true }).eq('visita_id', visitaId),
    supabase.from('gastos').select('id', { count: 'exact', head: true }).eq('visita_id', visitaId),
    supabase.from('galeria').select('id', { count: 'exact', head: true }).eq('visita_id', visitaId),
  ]);
  const [presupuestos, facturas, proyectos, gastos, galeria] = resultados;
  // Si alguna de las 5 comprobaciones falla, NO se puede asumir "0 documentos" — decir eso sería
  // mentir en el diálogo de confirmación justo antes de borrar/purgar (bug real, corregido
  // 2026-09-10). Se avisa explícitamente en vez de callar el fallo.
  const conError = resultados.some((r) => r.error);
  if (conError) {
    resultados.forEach((r) => r.error && console.error('avisoDocumentosActivosDeVisita:', r.error.message));
    return ' No se pudo comprobar si esta visita tiene documentos vinculados (presupuestos, facturas, planning, gastos o galería) — revísalo a mano antes de continuar.';
  }
  const partes = [
    presupuestos.count ? `${presupuestos.count} presupuesto(s)` : null,
    facturas.count ? `${facturas.count} factura(s)` : null,
    proyectos.count ? `${proyectos.count} planning(s) de obra` : null,
    gastos.count ? `${gastos.count} gasto(s)` : null,
    galeria.count ? `${galeria.count} proyecto(s) de galería` : null,
  ].filter(Boolean);
  return partes.length > 0 ? ` Esta visita tiene ${partes.join(', ')} todavía activos.` : '';
}
