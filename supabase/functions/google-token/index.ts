// Edge Function: devuelve un access_token de Google Calendar fresco,
// renovado en segundo plano a partir del refresh_token compartido guardado
// en `google_config`. Invocada por el frontend vía supabase.functions.invoke('google-token').
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data: config, error } = await supabase
    .from('google_config')
    .select('refresh_token')
    .eq('id', 1)
    .maybeSingle();

  if (error) return jsonResponse({ error: error.message });
  if (!config?.refresh_token) {
    return jsonResponse({ error: 'Google Calendar no está conectado. Pide a un administrador que lo conecte desde Configuración.' });
  }

  const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
  if (!clientId || !clientSecret) {
    return jsonResponse({ error: 'Faltan GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET en los secretos de la función' });
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: config.refresh_token,
      grant_type: 'refresh_token',
    }),
  });
  const tokenData = await tokenRes.json();

  if (!tokenRes.ok) {
    return jsonResponse({ error: tokenData.error_description ?? 'No se pudo renovar el token de Google Calendar' });
  }

  return jsonResponse({ access_token: tokenData.access_token, expires_in: tokenData.expires_in });
});
