import { supabase } from './supabase';

export async function subirAvatarPersonal(userId: string, blob: Blob): Promise<string> {
  const path = `${userId}_${Date.now()}.jpg`;
  const { error: errorSubida } = await supabase.storage.from('avatares').upload(path, blob, {
    contentType: 'image/jpeg',
    upsert: true,
  });
  if (errorSubida) throw errorSubida;

  const { data } = supabase.storage.from('avatares').getPublicUrl(path);
  return data.publicUrl;
}
