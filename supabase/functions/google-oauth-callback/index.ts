// Edge Function: recibe el redirect de Google tras el consentimiento OAuth,
// intercambia el "code" por tokens y guarda el refresh_token en la tabla `google_config` —
// en la columna `refresh_token` (Calendar) o `refresh_token_gmail` (Gmail) según el `purpose`
// codificado en el parámetro `state` (ver src/lib/googleCalendar.ts, separación de scopes 2026-08-05).
import { createClient } from 'jsr:@supabase/supabase-js@2';

// El frontend manda `volverA` como URL absoluta (window.location.origin + path, ver
// iniciarConexionGoogle en src/lib/googleCalendar.ts) porque el redirect tiene que salir del
// dominio de la Edge Function (*.supabase.co) hacia el dominio real del CRM. Sin validar el
// origen, `volverA` es un open redirect (CWE-601) sobre un dominio *.supabase.co de confianza —
// alcanzable con solo `?error=x&state=volverA=https://evil.com`, sin completar el OAuth siquiera
// (revisión de seguridad 2026-08-11). Solo se permite redirigir al dominio real del CRM.
const ORIGEN_CRM = 'https://ordonezrenov.com';
const VOLVER_A_POR_DEFECTO = 'https://ordonezrenov.com/crm/';

function volverASeguro(valor: string | null): string {
  if (!valor) return VOLVER_A_POR_DEFECTO;
  try {
    const u = new URL(valor);
    if (u.origin === ORIGEN_CRM || u.hostname === 'localhost' || u.hostname === '127.0.0.1') return valor;
  } catch {
    // no era una URL absoluta válida — cae al valor por defecto
  }
  return VOLVER_A_POR_DEFECTO;
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const errorParam = url.searchParams.get('error');
  const stateParams = new URLSearchParams(url.searchParams.get('state') || '');
  const purpose = stateParams.get('purpose') === 'gmail' ? 'gmail' : 'calendar';
  const volverA = volverASeguro(stateParams.get('volverA'));

  if (errorParam || !code) {
    return Response.redirect(`${volverA}?gcal=error`, 302);
  }

  const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
  if (!clientId || !clientSecret) {
    return new Response('Faltan GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET en los secretos de la función', { status: 500 });
  }

  // OJO: no derivar esto de `url.origin` — dentro del runtime de Edge Functions el origen de la
  // request puede no coincidir con la URL pública del proyecto, y Google exige que el redirect_uri
  // del intercambio de token sea idéntico, carácter a carácter, al usado en la pantalla de consentimiento.
  const redirectUri = `${Deno.env.get('SUPABASE_URL')}/functions/v1/google-oauth-callback`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  const tokenData = await tokenRes.json();

  if (!tokenRes.ok || !tokenData.refresh_token) {
    // Nunca loguear tokenData completo: si Google devuelve un access_token sin refresh_token (p.
    // ej. consentimiento ya otorgado antes sin prompt=consent), ese access_token quedaría en
    // texto plano en los logs de la Edge Function, accesibles desde el dashboard de Supabase
    // (hallazgo de la auditoría de seguridad 2026-08-15). Solo se loguea el motivo del error.
    console.error('Error obteniendo refresh_token de Google', {
      status: tokenRes.status,
      error: tokenData.error,
      error_description: tokenData.error_description,
      tuvoRefreshToken: Boolean(tokenData.refresh_token),
    });
    return Response.redirect(`${volverA}?gcal=error`, 302);
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const columna = purpose === 'gmail' ? 'refresh_token_gmail' : 'refresh_token';
  const { error } = await supabase
    .from('google_config')
    .upsert({ id: 1, [columna]: tokenData.refresh_token, updated_at: new Date().toISOString() });

  if (error) {
    console.error('Error guardando refresh_token', error);
    return Response.redirect(`${volverA}?gcal=error`, 302);
  }

  return Response.redirect(`${volverA}?gcal=connected&purpose=${purpose}`, 302);
});
