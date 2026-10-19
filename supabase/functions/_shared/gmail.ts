// Acceso de solo lectura al Gmail del equipo (reformasordonezeus@gmail.com) con el token guardado en
// google_config. Misma lógica que obtenerAccessToken/gmailFetch de revisar-gmail (que conserva su
// propia copia); aquí para las funciones que solo necesitan consultar el buzón.
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';

export async function obtenerTokenGmail(supabase: SupabaseClient): Promise<string> {
  const { data: config, error } = await supabase
    .from('google_config')
    .select('refresh_token, refresh_token_gmail')
    .eq('id', 1)
    .maybeSingle();
  if (error) throw new Error(`No se pudo leer google_config: ${error.message}`);
  const refreshToken = config?.refresh_token_gmail || config?.refresh_token;
  if (!refreshToken) throw new Error('Gmail no está conectado (falta refresh_token en google_config)');

  const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
  if (!clientId || !clientSecret) throw new Error('Faltan GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET en los secretos');

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`No se pudo renovar el token de Gmail: ${data.error_description ?? data.error}`);
  return data.access_token;
}

export async function gmailFetch<T = unknown>(path: string, token: string): Promise<T> {
  const res = await fetch(`https://www.googleapis.com/gmail/v1/users/me/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const detalle = await res.text().catch(() => '');
    throw new Error(`Gmail API ${path} → ${res.status}: ${detalle}`);
  }
  return res.json();
}
