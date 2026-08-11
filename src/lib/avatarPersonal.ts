import { supabase } from './supabase';

export async function subirAvatarPersonal(userId: string, blob: Blob): Promise<string> {
  const path = `${userId}_${Date.now()}.jpg`;
  const { error: errorSubida } = await supabase.storage.from('avatares').upload(path, blob, {
    contentType: 'image/jpeg',
    upsert: true,
  });
  if (errorSubida) throw errorSubida;

  // Cada subida usa un nombre con timestamp distinto y el anterior nunca se borraba, acumulando
  // huérfanos en el bucket para siempre. Best-effort: si la limpieza falla no debe tumbar la
  // subida, que ya se hizo con éxito (mismo criterio que las notas/eventos secundarios de la app).
  try {
    const { data: existentes, error: errorListado } = await supabase.storage.from('avatares').list('', { search: userId });
    if (errorListado) throw errorListado;
    const antiguos = (existentes ?? []).filter((f) => f.name !== path).map((f) => f.name);
    if (antiguos.length > 0) {
      const { error: errorBorrado } = await supabase.storage.from('avatares').remove(antiguos);
      if (errorBorrado) throw errorBorrado;
    }
  } catch (error) {
    console.warn('No se pudo limpiar el avatar anterior:', error);
  }

  const { data } = supabase.storage.from('avatares').getPublicUrl(path);
  return data.publicUrl;
}
