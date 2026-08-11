import { supabase } from './supabase';

export async function notaSistema(visitaId: string, texto: string) {
  const { error } = await supabase.from('notas_cliente').insert({
    visita_id: visitaId,
    tipo: 'sistema',
    texto,
    autor: 'Sistema',
  });
  if (error) throw error;
}
