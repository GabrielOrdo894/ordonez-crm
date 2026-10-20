// Reseñas por CLIENTE, no por factura (2026-10-20): una obra con varios presupuestos acaba en varias
// facturas finales (caso real: Pascale Uzcudun, F-2026-0007 a 0011) y el CRM pedía la reseña y avisaba
// una vez por factura — la campana repetía el aviso y la reseña automática iba a mandar 4 emails más
// a la misma clienta. Una vez pedida (o hecha la cortesía de los 6 meses) a un cliente, vale para
// todas sus facturas.
import { supabase } from '../../../lib/supabase';
import { normalizarTelefono } from '../../clientes/types';
import type { Factura } from './types';

type ContactoFactura = Pick<Factura, 'id' | 'cliente_email' | 'cliente_tel'>;

/** Email en minúsculas si lo hay; si no, el teléfono normalizado; si no, la propia factura. */
export function claveClienteFactura(f: ContactoFactura): string {
  const email = f.cliente_email?.trim().toLowerCase();
  if (email) return `e:${email}`;
  const tel = f.cliente_tel ? normalizarTelefono(f.cliente_tel) : '';
  return tel ? `t:${tel}` : `f:${f.id}`;
}

/** Deja una sola factura por cliente: la de cobro más reciente. */
export function unaPorCliente<T extends ContactoFactura & Pick<Factura, 'fecha_pago'>>(facturas: T[]): T[] {
  const porCliente = new Map<string, T>();
  for (const f of facturas) {
    const clave = claveClienteFactura(f);
    const actual = porCliente.get(clave);
    if (!actual || (f.fecha_pago ?? '') > (actual.fecha_pago ?? '')) porCliente.set(clave, f);
  }
  return [...porCliente.values()];
}

/** Otras facturas (no papelera) del mismo cliente que `f`. */
async function otrasFacturasDelCliente(f: ContactoFactura): Promise<Factura[]> {
  const clave = claveClienteFactura(f);
  if (clave.startsWith('f:')) return [];
  let consulta = supabase.from('facturas').select('*').is('eliminado_en', null).neq('id', f.id);
  consulta = clave.startsWith('e:')
    ? consulta.ilike('cliente_email', f.cliente_email!.trim())
    : consulta.not('cliente_tel', 'is', null);
  const { data, error } = await consulta;
  if (error) throw error;
  return ((data ?? []) as Factura[]).filter((o) => claveClienteFactura(o) === clave);
}

/** Tras pedir la reseña a un cliente, la da por pedida en el resto de sus facturas (y cancela la
 *  reseña automática que pudieran tener programada). */
export async function marcarResenaPedidaCliente(f: ContactoFactura, fecha: string): Promise<void> {
  const ids = (await otrasFacturasDelCliente(f)).filter((o) => !o.resena_enviado_en).map((o) => o.id);
  if (ids.length === 0) return;
  const { error } = await supabase
    .from('facturas')
    .update({ resena_enviado_en: fecha, resena_auto_estado: 'cancelada' })
    .in('id', ids)
    .is('resena_enviado_en', null);
  if (error) throw error;
}

/** Igual para el mensaje de cortesía de los 6 meses. */
export async function marcarCortesiaCliente(f: ContactoFactura, fecha: string): Promise<void> {
  const ids = (await otrasFacturasDelCliente(f)).filter((o) => !o.resena_cortesia_enviada_en).map((o) => o.id);
  if (ids.length === 0) return;
  const { error } = await supabase
    .from('facturas')
    .update({ resena_cortesia_enviada_en: fecha })
    .in('id', ids)
    .is('resena_cortesia_enviada_en', null);
  if (error) throw error;
}
