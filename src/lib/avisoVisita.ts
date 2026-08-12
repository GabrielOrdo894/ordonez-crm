import { supabase } from './supabase';

// No hay FK real hacia visitas (visita_id es un uuid "suelto"), así que borrar/purgar una visita
// nunca arrastra en cascada sus presupuestos/facturas/proyecto — se quedan con un visita_id
// colgante si esos documentos siguen activos. Se usa tanto al mover a la papelera (VisitasPage)
// como al purgar definitivamente (PapeleraPage) para avisar con el recuento real antes de confirmar
// (hallazgo real, revisión 2026-08-12).
export async function avisoDocumentosActivosDeVisita(visitaId: string): Promise<string> {
  const [presupuestos, facturas, proyectos] = await Promise.all([
    supabase.from('presupuestos').select('id', { count: 'exact', head: true }).eq('visita_id', visitaId).is('eliminado_en', null),
    supabase.from('facturas').select('id', { count: 'exact', head: true }).eq('visita_id', visitaId).is('eliminado_en', null),
    supabase.from('proyectos').select('id', { count: 'exact', head: true }).eq('visita_id', visitaId),
  ]);
  const partes = [
    presupuestos.count ? `${presupuestos.count} presupuesto(s)` : null,
    facturas.count ? `${facturas.count} factura(s)` : null,
    proyectos.count ? `${proyectos.count} planning(s) de obra` : null,
  ].filter(Boolean);
  return partes.length > 0 ? ` Esta visita tiene ${partes.join(', ')} todavía activos.` : '';
}
