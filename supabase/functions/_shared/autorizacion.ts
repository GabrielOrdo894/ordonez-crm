import { createClient } from 'jsr:@supabase/supabase-js@2';

// Supabase valida que el JWT esté bien firmado (verify_jwt: true) pero no distingue la clave anon
// (pública, va en el bundle del frontend) de una sesión real — comprobar el rol cierra ese hueco
// (revisión de seguridad 2026-08-11). Desde 2026-10-01 además el usuario tiene que estar en
// usuarios_equipo: con el registro público de Auth abierto, cualquiera que confirmara un email era
// "authenticated" y podía mandar correos desde el dominio, gastar créditos de IA o leer tokens de
// Google. Única copia (antes había 16 idénticas, una por función).
export async function esLlamadaAutorizada(req: Request): Promise<boolean> {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const partes = token.split('.');
  if (partes.length !== 3) return false;
  let payload: { role?: string; sub?: string };
  try {
    payload = JSON.parse(atob(partes[1].replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return false;
  }
  if (payload.role === 'service_role') return true;
  if (payload.role !== 'authenticated' || !payload.sub) return false;

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data, error } = await supabase.from('usuarios_equipo').select('id').eq('id', payload.sub).maybeSingle();
  if (error) {
    console.error('esLlamadaAutorizada: no se pudo comprobar el equipo:', error.message);
    return false;
  }
  return !!data;
}
