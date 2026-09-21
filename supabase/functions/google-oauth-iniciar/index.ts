// Edge Function: emite un token de estado de un solo uso ANTES de mandar al usuario a la pantalla
// de consentimiento de Google — protección CSRF del flujo OAuth (auditoría de seguridad
// 2026-09-21, ver comentario grande en la migración `google_oauth_state_csrf` y en
// google-oauth-callback/index.ts). Solo un usuario autenticado del CRM puede llamar a esta
// función (verify_jwt: true + esLlamadaAutorizada), así que solo un usuario autenticado puede
// generar un `state` que google-oauth-callback vaya a aceptar.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://ordonezrenov.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Supabase valida que el JWT esté bien firmado (verify_jwt: true) pero no distingue la clave anon
// (pública, va en el bundle del frontend) de una sesión real — comprobar el rol cierra ese hueco
// (revisión de seguridad 2026-08-11). Duplicado en cada función: el despliegue vía MCP no resuelve
// imports relativos entre funciones.
function esLlamadaAutorizada(req: Request): boolean {
  const auth = req.headers.get('Authorization') ?? '';
  const token = auth.replace(/^Bearer\s+/i, '');
  const partes = token.split('.');
  if (partes.length !== 3) return false;
  try {
    const payload = JSON.parse(atob(partes[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload.role === 'authenticated' || payload.role === 'service_role';
  } catch {
    return false;
  }
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (!esLlamadaAutorizada(req)) return jsonResponse({ error: 'No autorizado' }, 401);

  try {
    const { purpose, volverA } = await req.json();
    if (purpose !== 'calendar' && purpose !== 'gmail') return jsonResponse({ error: 'purpose inválido' }, 400);
    if (!volverA || typeof volverA !== 'string') return jsonResponse({ error: 'Falta volverA' }, 400);

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data, error } = await supabase
      .from('google_oauth_state')
      .insert({ purpose, volver_a: volverA })
      .select('token')
      .single();
    if (error) return jsonResponse({ error: error.message }, 500);

    return jsonResponse({ token: data.token });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : 'Error desconocido' }, 500);
  }
});
