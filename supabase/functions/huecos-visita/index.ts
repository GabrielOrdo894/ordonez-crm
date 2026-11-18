// Edge Function: huecos-visita
//
// Próximos huecos libres para la visita técnica (2026-11-18, test A/B de la página de contacto de
// ordonezrenov.com, variante B «elige día»). Horario de visitas de la empresa: lunes a viernes a las
// 12:00 y a las 18:00, sábados solo a las 12:00, domingo cerrado. Un hueco está ocupado si ya hay una
// visita no cancelada ni en la papelera a esa fecha y hora. Desde mañana y hasta 21 días vista.
//
// Pública a propósito (verify_jwt: false, desplegar con --no-verify-jwt): la consulta la página sin
// sesión. Solo devuelve fechas y horas, ningún dato de clientes. CORS limitado a ordonezrenov.com.
//
// GET → { huecos: [{ fecha: 'AAAA-MM-DD', hora: 'HH:MM' }] } (como mucho 12)
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { hoyEnParis, siguientesHuecos } from './huecos.ts';

const ORIGENES = ['https://ordonezrenov.com', 'https://www.ordonezrenov.com'];

function cabecerasCors(req: Request): Record<string, string> {
  const origen = req.headers.get('origin') ?? '';
  return {
    'Access-Control-Allow-Origin': ORIGENES.includes(origen) ? origen : ORIGENES[0],
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    Vary: 'Origin',
    'Cache-Control': 'public, max-age=300',
  };
}

Deno.serve(async (req: Request) => {
  const cors = cabecerasCors(req);
  const responder = (cuerpo: unknown, status = 200) =>
    new Response(JSON.stringify(cuerpo), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'GET') return responder({ error: 'Método no permitido' }, 405);

  const hoy = hoyEnParis(new Date());
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data, error } = await supabase
    .from('visitas')
    .select('fecha_visita, hora_visita')
    .gt('fecha_visita', hoy)
    .neq('estado', 'Cancelada')
    .is('eliminado_en', null);
  if (error) return responder({ error: error.message }, 500);

  const ocupados = new Set(
    (data ?? [])
      .filter((v) => v.fecha_visita && v.hora_visita)
      .map((v) => `${v.fecha_visita} ${String(v.hora_visita).slice(0, 5)}`),
  );
  return responder({ huecos: siguientesHuecos(hoy, ocupados, 21, 12) });
});
