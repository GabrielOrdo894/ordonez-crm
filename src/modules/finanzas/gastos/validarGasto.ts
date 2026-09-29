// Datos mínimos para que un gasto entre en la contabilidad (estado 'pagado') con respaldo legal —
// decisión de Gabriel 2026-09-29. Antes GastoForm guardaba sin proveedor, cuenta, importe ni
// justificante, y "Registrar pago" confirmaba un ticket de /rapido sin importe con asiento a 0 €.
//
// Umbral de 150 € HT: por debajo, un ticket de caja vale como justificante sin nº de factura ni
// identificador fiscal del proveedor (régimen francés de factura simplificada para importes
// ≤ 150 € HT — gasolina, peaje, comida). Por encima, o en una autoliquidación intracom/importación,
// hacen falta.
export const UMBRAL_FACTURA_COMPLETA_HT = 150;

export type DatosValidacionGasto = {
  fecha: string | null;
  importe_base: number | null;
  importe_iva: number | null;
  tipo_iva: string | null;
  cuenta_contable: string | null;
  proveedor: string | null;
  num_factura_proveedor: string | null;
  adjunto_url: string | null;
  km: number | null;
  // Identificador fiscal (SIRET / nº TVA / NIF) del proveedor vinculado, si lo hay.
  proveedorIdentificador: string | null;
};

// Devuelve la lista de lo que falta, en español y listo para mostrar; vacía si el gasto es válido.
export function validarGasto(g: DatosValidacionGasto): string[] {
  const faltan: string[] = [];
  const esKilometrico = g.km != null;
  // Dotación a amortizaciones: apunte interno, sin factura de proveedor detrás.
  const esAmortizacion = (g.cuenta_contable ?? '').startsWith('681');
  const base = g.importe_base ?? 0;
  const total = base + (g.importe_iva ?? 0);

  if (!g.fecha) faltan.push('la fecha');
  if (!g.cuenta_contable) faltan.push('la categoría contable');
  if (!(total > 0)) faltan.push('el importe');
  if (esKilometrico || esAmortizacion) return faltan;

  if (!g.proveedor?.trim()) faltan.push('el proveedor');
  if (!g.adjunto_url) faltan.push('el justificante (foto o PDF)');

  const autoliquidacion = g.tipo_iva === 'INTRACOM' || g.tipo_iva === 'IMPORTACION';
  if (base > UMBRAL_FACTURA_COMPLETA_HT || autoliquidacion) {
    if (!g.num_factura_proveedor?.trim()) faltan.push('el nº de factura del proveedor');
    if (!g.proveedorIdentificador?.trim()) faltan.push('el SIRET / nº de TVA / NIF del proveedor (en su ficha)');
  }
  return faltan;
}

export function mensajeFaltanDatos(faltan: string[]): string {
  return `Falta ${faltan.join(', ')}.`;
}
