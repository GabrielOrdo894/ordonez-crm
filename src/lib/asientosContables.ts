import { supabase } from './supabase';
import { calcularTotales } from '../modules/finanzas/lineas';
import type { Linea } from '../modules/finanzas/lineas';
import { cuentaLabel } from '../modules/finanzas/gastos/categorias';

// Cuentas del libro diario que no están en CUENTAS_FR (gastos/types.ts) porque no son cuentas de
// gasto — son las de cliente/banco/venta/TVA/espera que usan las funciones de este fichero.
const ETIQUETAS_CUENTA_EXTRA: Record<string, string> = {
  '411': '411 · Clients',
  '512': '512 · Banque',
  '706': '706 · Prestations de services',
  '44571': '44571 · TVA collectée',
  '44566': '44566 · TVA déductible sur autres biens et services',
  '471': '471 · Compte d’attente (sin clasificar)',
  '2801': '2801 · Amortissements des immobilisations (compte global)',
  '4452': '4452 · TVA due intracommunautaire',
  '445662': '445662 · TVA déductible intracommunautaire',
  '445661': '445661 · TVA déductible sur importations',
};

export function etiquetaCuenta(codigo: string): string {
  return ETIQUETAS_CUENTA_EXTRA[codigo] ?? cuentaLabel(codigo);
}

export type TipoEvento = 'creacion' | 'cobro';

export type NuevoAsiento = {
  fecha: string;
  cuenta: string;
  debe: number;
  haber: number;
  concepto: string;
  documento_tipo: 'factura' | 'gasto';
  documento_id: string;
  tipo_evento: TipoEvento;
};

async function insertarAsientos(asientos: NuevoAsiento[]) {
  const { error } = await supabase.from('asientos_contables').insert(asientos);
  if (error) throw error;
}

// Cuenta de espera para gastos sin cuenta_contable asignada — el importe no se pierde del libro,
// pero queda visible como pendiente de clasificar en vez de adivinarle una cuenta (ver plan
// "Contabilidad francesa — Libro diario y Libro mayor").
const CUENTA_SIN_CLASIFICAR = '471';
const CUENTA_BANCO = '512';
const CUENTA_IVA_DEDUCIBLE = '44566';
const CUENTA_AMORTIZACIONES_ACUMULADAS = '2801';
const CUENTA_CLIENTES = '411';
const CUENTA_VENTAS = '706';
const CUENTA_IVA_COLECTADA = '44571';
const CUENTA_TVA_DUE_INTRACOM = '4452';
const CUENTA_TVA_DEDUCIBLE_INTRACOM = '445662';
const CUENTA_TVA_DEDUCIBLE_IMPORTACION = '445661';
// Mismo valor que TASA_ESTANDAR en AsistenteIvaPage.tsx (duplicado a propósito — ese fichero
// calcula la casilla 17 de la CA3 de forma independiente a partir de importe_base, no lee estos
// asientos; mantener los dos en sync es responsabilidad de quien toque cualquiera de las dos tasas).
// Autoliquidación (adquisición intracomunitaria UE o importación fuera de UE, art. 283-2 CGI):
// el proveedor no cobra IVA, pero la empresa se autoliquida el IVA que le correspondería a tipo
// general francés — se registra a la vez como "debido" (4452) y "deducible" (445662/445661), con
// efecto neto en caja de 0 € pero visible en el libro mayor (hallazgo real, auditoría 2026-08-21:
// antes esta autoliquidación no generaba ningún asiento, dejando esas cuentas del libro mayor
// siempre a 0 aunque hubiera compras intracomunitarias reales).
const TASA_TVA_AUTOLIQUIDACION = 0.2;

// --- Lógica pura (sin Supabase) — testeable sin mocks, ver asientosContables.test.ts. Cada
// función solo calcula QUÉ asientos harían falta; las funciones exportadas más abajo son
// wrappers finos que además los insertan. ---

export function construirAsientosGasto(gasto: {
  id: string;
  fecha: string | null;
  descripcion: string | null;
  proveedor: string | null;
  cuenta_contable: string | null;
  importe_base: number | null;
  importe_iva: number | null;
  // 'INTRACOM' | 'IMPORTACION' | cualquier otro valor de tipo_iva (nacional, exento...) — ver
  // GastoForm.tsx. Solo estos dos valores disparan la autoliquidación de más abajo.
  tipo_iva?: string | null;
}): NuevoAsiento[] {
  const fecha = gasto.fecha ?? new Date().toISOString().slice(0, 10);
  const cuenta = gasto.cuenta_contable ?? CUENTA_SIN_CLASIFICAR;
  const base = gasto.importe_base ?? 0;
  const iva = gasto.importe_iva ?? 0;
  const concepto = [gasto.descripcion, gasto.proveedor].filter(Boolean).join(' — ') || 'Gasto';
  // Las cuentas 681x (amortización, ya sin IVA por diseño de GastoForm) no salen del banco — su
  // contrapartida es el compte global de amortissements acumulados, no 512.
  const esAmortizacion = cuenta.startsWith('68');

  const asientos: NuevoAsiento[] = [
    { fecha, cuenta, debe: base, haber: 0, concepto, documento_tipo: 'gasto', documento_id: gasto.id, tipo_evento: 'creacion' },
  ];
  if (iva > 0) {
    asientos.push({
      fecha,
      cuenta: CUENTA_IVA_DEDUCIBLE,
      debe: iva,
      haber: 0,
      concepto,
      documento_tipo: 'gasto',
      documento_id: gasto.id,
      tipo_evento: 'creacion',
    });
  }
  if (gasto.tipo_iva === 'INTRACOM' || gasto.tipo_iva === 'IMPORTACION') {
    const tvaAutoliquidada = Math.round(base * TASA_TVA_AUTOLIQUIDACION * 100) / 100;
    const cuentaDeducible = gasto.tipo_iva === 'INTRACOM' ? CUENTA_TVA_DEDUCIBLE_INTRACOM : CUENTA_TVA_DEDUCIBLE_IMPORTACION;
    asientos.push(
      {
        fecha,
        cuenta: cuentaDeducible,
        debe: tvaAutoliquidada,
        haber: 0,
        concepto,
        documento_tipo: 'gasto',
        documento_id: gasto.id,
        tipo_evento: 'creacion',
      },
      {
        fecha,
        cuenta: CUENTA_TVA_DUE_INTRACOM,
        debe: 0,
        haber: tvaAutoliquidada,
        concepto,
        documento_tipo: 'gasto',
        documento_id: gasto.id,
        tipo_evento: 'creacion',
      },
    );
  }
  asientos.push({
    fecha,
    cuenta: esAmortizacion ? CUENTA_AMORTIZACIONES_ACUMULADAS : CUENTA_BANCO,
    debe: 0,
    haber: base + iva,
    concepto,
    documento_tipo: 'gasto',
    documento_id: gasto.id,
    tipo_evento: 'creacion',
  });

  return asientos;
}

export function construirAsientosFacturaEmision(factura: {
  id: string;
  numero: string | null;
  cliente_nombre: string | null;
  fecha_factura: string | null;
  lineas: Linea[];
}): NuevoAsiento[] {
  const fecha = factura.fecha_factura ?? new Date().toISOString().slice(0, 10);
  const { totalSinIva, totalConIva } = calcularTotales(factura.lineas);
  const iva = totalConIva - totalSinIva;
  const concepto = [factura.numero, factura.cliente_nombre].filter(Boolean).join(' — ') || 'Factura';

  const asientos: NuevoAsiento[] = [
    { fecha, cuenta: CUENTA_CLIENTES, debe: totalConIva, haber: 0, concepto, documento_tipo: 'factura', documento_id: factura.id, tipo_evento: 'creacion' },
    { fecha, cuenta: CUENTA_VENTAS, debe: 0, haber: totalSinIva, concepto, documento_tipo: 'factura', documento_id: factura.id, tipo_evento: 'creacion' },
  ];
  if (iva > 0) {
    asientos.push({
      fecha,
      cuenta: CUENTA_IVA_COLECTADA,
      debe: 0,
      haber: iva,
      concepto,
      documento_tipo: 'factura',
      documento_id: factura.id,
      tipo_evento: 'creacion',
    });
  }

  return asientos;
}

export function construirAsientosFacturaCobro(
  factura: { id: string; numero: string | null; cliente_nombre: string | null },
  monto: number,
  fecha: string,
): NuevoAsiento[] {
  const concepto = [factura.numero, factura.cliente_nombre].filter(Boolean).join(' — ') || 'Cobro de factura';
  return [
    { fecha, cuenta: CUENTA_BANCO, debe: monto, haber: 0, concepto, documento_tipo: 'factura', documento_id: factura.id, tipo_evento: 'cobro' },
    { fecha, cuenta: CUENTA_CLIENTES, debe: 0, haber: monto, concepto, documento_tipo: 'factura', documento_id: factura.id, tipo_evento: 'cobro' },
  ];
}

// Reversa (debe/haber invertidos) de asientos ya existentes — misma fecha que el asiento
// original que anulan (nunca "hoy"), para que la reversa cuadre en el mismo ejercicio que lo que
// está anulando y no deje un movimiento huérfano en el ejercicio en el que se hizo la corrección.
// `previos` son filas ya leídas de asientos_contables (solo necesita cuenta/debe/haber/concepto).
export function construirAsientosRectificacion(
  previos: { cuenta: string; debe: number; haber: number; concepto: string }[],
  documentoTipo: 'factura' | 'gasto',
  documentoId: string,
  tipoEvento: TipoEvento,
  fecha: string,
): NuevoAsiento[] {
  return previos.map((a) => ({
    fecha,
    cuenta: a.cuenta,
    debe: a.haber,
    haber: a.debe,
    concepto: `${a.concepto} (rectificación)`,
    documento_tipo: documentoTipo,
    documento_id: documentoId,
    tipo_evento: tipoEvento,
  }));
}

// --- Wrappers con efecto (Supabase) — llamados desde GastoForm/FacturaForm/RegistrarPagoModal ---

// Al crear un Gasto de Francia: Débit <cuenta> + Débit IVA deducible / Crédit Banco (o Crédit
// amortissements acumulados si es una cuenta 68x).
export async function registrarAsientoGasto(gasto: Parameters<typeof construirAsientosGasto>[0]) {
  await insertarAsientos(construirAsientosGasto(gasto));
}

// Al emitir una Factura de Francia: Débit Clients (total con IVA) / Crédit Ventas (base) + Crédit
// TVA collectée (iva).
export async function registrarAsientoFacturaEmision(factura: Parameters<typeof construirAsientosFacturaEmision>[0]) {
  await insertarAsientos(construirAsientosFacturaEmision(factura));
}

// Al registrar un cobro de Factura: Débit Banco / Crédit Clients, por el importe realmente
// cobrado (puede ser parcial).
export async function registrarAsientoFacturaCobro(
  factura: { id: string; numero: string | null; cliente_nombre: string | null },
  monto: number,
  fecha: string,
) {
  await insertarAsientos(construirAsientosFacturaCobro(factura, monto, fecha));
}

// Inserta la reversa (debe/haber invertidos) de los asientos de un evento concreto ya
// contabilizado — nunca toca las filas existentes (asientos_contables es insert-only por RLS,
// sin política de update/delete). Se usa antes de volver a registrar el asiento correcto cuando
// se edita una Factura/Gasto ya contabilizado, para que el libro diario conserve el rastro
// completo (original + reversa + corregido) y el libro mayor quede con el saldo neto correcto.
//
// `fecha` debe ser la fecha ORIGINAL del asiento que se está rectificando (no la fecha de hoy ni
// la fecha nueva del documento corregido) — así la reversa cuadra en el mismo ejercicio que el
// asiento que anula. Bug real corregido 2026-08-18: usar `new Date()` por defecto podía dejar un
// ejercicio ya cerrado con el importe erróneo para siempre y contaminar el ejercicio en curso con
// un movimiento que no le correspondía.
export async function rectificarAsientos(documentoTipo: 'factura' | 'gasto', documentoId: string, tipoEvento: TipoEvento = 'creacion', fecha: string) {
  const { data: previos, error } = await supabase
    .from('asientos_contables')
    .select('cuenta, debe, haber, concepto')
    .eq('documento_tipo', documentoTipo)
    .eq('documento_id', documentoId)
    .eq('tipo_evento', tipoEvento);
  if (error) throw error;
  if (!previos || previos.length === 0) return;

  await insertarAsientos(construirAsientosRectificacion(previos, documentoTipo, documentoId, tipoEvento, fecha));
}
