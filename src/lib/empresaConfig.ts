import { supabase } from './supabase';

// Guarda un merge parcial en empresa_config.datos (jsonb), releyendo la fila justo antes de
// fusionar — varias pantallas de Configuración escriben en la misma fila, sin esto el guardado
// de una pantalla podría revertir cambios que otro usuario acaba de hacer en otra sección.
// `parcial` puede ser un objeto (merge superficial) o una función que recibe los datos frescos y
// devuelve el merge — útil cuando hace falta leer/combinar un valor anidado antes de guardar.
export async function guardarConfigDatos(
  parcial: Record<string, unknown> | ((datosActuales: Record<string, unknown>) => Record<string, unknown>),
) {
  const { data: fresco, error: errorFresco } = await supabase.from('empresa_config').select('datos').eq('id', 1).single();
  if (errorFresco) throw errorFresco;
  const datosActuales = (fresco?.datos ?? {}) as Record<string, unknown>;
  const cambios = typeof parcial === 'function' ? parcial(datosActuales) : parcial;
  const { error } = await supabase
    .from('empresa_config')
    .update({ datos: { ...datosActuales, ...cambios } })
    .eq('id', 1);
  if (error) throw error;
}
