import { supabase } from './supabase';
import { rectificarAsientos, registrarAsientoFacturaEmision, registrarAsientoFacturaCobro } from './asientosContables';
import type { Factura } from '../modules/finanzas/facturas/types';

// Anula lo que siga vivo (saldo neto) de un evento de una factura. Sin filtro de país ni de
// estructura_anterior desde 2026-09-29: con la anulación por saldo neto no inserta nada si no hay
// saldo, y así también limpia una factura que se contabilizó y luego pasó a España o a
// estructura_anterior. asientos_contables es insert-only: sin esta anulación el importe quedaría
// contabilizado aunque la factura ya no cuente como activa/cobrada en el CRM.
export async function rectificarAsientosFacturaSiHaceFalta(f: Pick<Factura, 'id'>, evento: 'creacion' | 'cobro') {
  await rectificarAsientos('factura', f.id, evento);
}

// Deja la contabilidad de una factura exactamente como dicen sus datos actuales: anula emisión y
// cobros vivos y, si es de Francia y no estructura_anterior, vuelve a registrar la emisión y un
// cobro por cada pago real de pagos_factura. Única vía al guardar (FacturaForm) y al restaurar de
// la papelera — antes solo se regeneraba la emisión, y un cambio de tipo de IVA o de país dejaba los
// cobros con el criterio antiguo (auditoría contable 2026-09-29).
export async function recontabilizarFactura(
  f: Pick<Factura, 'id' | 'numero' | 'cliente_nombre' | 'fecha_factura' | 'lineas' | 'tipo' | 'tipo_iva' | 'pais' | 'estructura_anterior'>,
) {
  await rectificarAsientos('factura', f.id, 'creacion');
  await rectificarAsientos('factura', f.id, 'cobro');
  if (f.pais !== 'Francia' || f.estructura_anterior) return;
  await registrarAsientoFacturaEmision({
    id: f.id,
    numero: f.numero,
    cliente_nombre: f.cliente_nombre,
    fecha_factura: f.fecha_factura,
    lineas: f.lineas,
    tipo: f.tipo,
  });
  const { data: pagos, error } = await supabase.from('pagos_factura').select('id, fecha, monto').eq('factura_id', f.id);
  if (error) throw error;
  for (const pago of pagos ?? []) {
    await registrarAsientoFacturaCobro(
      { id: f.id, numero: f.numero, cliente_nombre: f.cliente_nombre, tipo_iva: f.tipo_iva },
      Number(pago.monto),
      pago.fecha,
      pago.id,
    );
  }
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
