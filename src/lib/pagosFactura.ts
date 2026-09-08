import { supabase } from './supabase';
import { rectificarAsientos } from './asientosContables';
import type { Factura } from '../modules/finanzas/facturas/types';

// Reversa (si hace falta) TODOS los asientos de un evento concreto de una factura de Francia — no
// hace nada para España o estructura_anterior (no tienen asiento) ni si nunca se llegó a
// contabilizar. asientos_contables es insert-only, así que sin esta reversa el importe se queda
// contabilizado para siempre aunque la factura ya no cuente como activa/cobrada en el CRM.
export async function rectificarAsientosFacturaSiHaceFalta(
  f: Pick<Factura, 'id' | 'pais' | 'estructura_anterior'>,
  evento: 'creacion' | 'cobro',
) {
  if (f.pais !== 'Francia' || f.estructura_anterior) return;
  await rectificarAsientos('factura', f.id, evento);
}

// Borra todo el historial de pagos_factura de una o varias facturas y las deja en Pendiente — no
// borra pago por pago (eso vive en RegistrarPagoModal.tsx, con reversa individual por pago vía
// pago_id); esto es la versión "empezar de cero" para una o varias facturas enteras. Único punto
// de esta lógica en todo el CRM — antes existía duplicada (y sin corregir) en
// DocumentoDetalleInline.tsx, causa real de que "Quitar registro de pago" desde la ficha de detalle
// dejara asientos y filas de pagos_factura huérfanos mientras la versión de FacturasPage.tsx ya
// estaba corregida (hallazgo real, auditoría 2026-09-08).
export async function vaciarPagosFactura(ids: string[]) {
  const { error } = await supabase.from('pagos_factura').delete().in('factura_id', ids);
  if (error) throw error;
  const { error: errorFacturas } = await supabase
    .from('facturas')
    .update({ estado_cobro: 'Pendiente', fecha_pago: null, monto_pagado: null })
    .in('id', ids);
  if (errorFacturas) throw errorFacturas;
}
