// Reseñas por CLIENTE, no por factura (2026-10-20) — misma regla que src/modules/finanzas/facturas/
// resenasCliente.ts: una obra con varias facturas finales (Pascale Uzcudun, F-2026-0007 a 0011) no
// debe recibir una petición de reseña por factura. En el servidor el cliente se identifica por email
// (la reseña automática solo sale por email).
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';

export function claveEmail(email: string | null | undefined): string | null {
  const e = email?.trim().toLowerCase();
  return e || null;
}

/** Da la reseña por pedida en las demás facturas del cliente y cancela su reseña automática. */
export async function marcarResenaPedidaCliente(
  supabase: SupabaseClient,
  facturaId: string,
  email: string,
  fecha: string,
): Promise<number> {
  const clave = claveEmail(email);
  if (!clave) return 0;
  const { data, error } = await supabase
    .from('facturas')
    .select('id, cliente_email')
    .is('eliminado_en', null)
    .is('resena_enviado_en', null)
    .neq('id', facturaId)
    .ilike('cliente_email', email.trim());
  if (error) throw error;
  const ids = ((data ?? []) as { id: string; cliente_email: string | null }[])
    .filter((f) => claveEmail(f.cliente_email) === clave)
    .map((f) => f.id);
  if (ids.length === 0) return 0;
  const { error: errorUpdate } = await supabase
    .from('facturas')
    .update({ resena_enviado_en: fecha, resena_auto_estado: 'cancelada' })
    .in('id', ids)
    .is('resena_enviado_en', null);
  if (errorUpdate) throw errorUpdate;
  return ids.length;
}
