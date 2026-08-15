import { supabase } from './supabase';

export async function registrarDecision(datos: { tipo: string; titulo: string; anio_ejercicio: number }) {
  const { error } = await supabase.from('decisiones_societarias').insert(datos);
  if (error) throw error;
}
