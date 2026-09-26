import { calcularTotales } from '../lineas';
import type { Linea } from '../lineas';

// Estado de cobro de un presupuesto aceptado, calculado a partir de sus facturas (acomptes + factura
// final) — petición de Gabriel 2026-09-26: ver de un vistazo si ya entró el primer pago y cuándo
// está todo pagado, sin abrir cada factura. No es un estado guardado en la base de datos (el
// estado real del presupuesto sigue siendo Aceptado para el embudo, el pipeline y los informes).
export type EstadoCobroPresupuesto = 'Aceptado' | 'Primer pago recibido' | 'Pagado';

export type FacturaParaCobro = {
  presupuesto_id: string | null;
  tipo: string;
  estado_cobro: string;
  monto_pagado: number | null;
};

export const SELECT_FACTURAS_COBRO = 'presupuesto_id, tipo, estado_cobro, monto_pagado';

export function estadoCobroPresupuesto(
  presupuesto: { id: string; estado: string; lineas: Linea[] },
  facturas: FacturaParaCobro[],
): EstadoCobroPresupuesto | null {
  if (presupuesto.estado !== 'Aceptado') return null;
  // Las rectificativas corrigen una factura, no son un cobro del cliente.
  const suyas = facturas.filter(
    (f) => f.presupuesto_id === presupuesto.id && f.tipo !== 'rectificativa',
  );
  const cobrado = Math.round(suyas.reduce((s, f) => s + (f.monto_pagado ?? 0), 0) * 100) / 100;
  if (cobrado <= 0.01) return 'Aceptado';
  const total = calcularTotales(presupuesto.lineas).totalConIva;
  // "Pagado" si se ha cobrado todo el presupuesto, o si ya existe la factura final y todas las
  // facturas del presupuesto están cobradas (cubre avenants que cambian el total final).
  const hayFinal = suyas.some((f) => f.tipo === 'normal');
  const todasCobradas = suyas.every((f) => f.estado_cobro === 'Cobrada');
  if (cobrado >= total - 0.01 || (hayFinal && todasCobradas)) return 'Pagado';
  return 'Primer pago recibido';
}
