import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase';

// Avisa a los 3 usuarios (destinatario_ids: null = para todos) de un cambio en Configuración.
// No lanza si falla el insert — es un aviso secundario, no debe tumbar el guardado principal
// (que ya tiene su propio toast de éxito/error).
export async function notificarCambioConfig(user: User | null, texto: string) {
  if (!user) return;
  const nombre = (user.user_metadata?.nombre as string) || user.email || 'Alguien';
  const { error } = await supabase.from('mensajes_equipo').insert({
    autor_id: user.id,
    autor_nombre: nombre,
    destinatario_ids: null,
    asunto: 'Cambio en Configuración',
    texto: `${nombre} ${texto}`,
    automatico: true,
  });
  if (error) console.warn('No se pudo enviar la notificación de cambio de configuración:', error.message);
}
