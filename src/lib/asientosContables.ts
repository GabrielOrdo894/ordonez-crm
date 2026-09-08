import { supabase } from './supabase';
import { calcularTotales } from '../modules/finanzas/lineas';
import type { Linea } from '../modules/finanzas/lineas';
import { cuentaLabel } from '../modules/finanzas/gastos/categorias';
import { porcentajeIva } from '../modules/finanzas/iva';

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
  // Solo para tipo_evento 'cobro' de una factura con más de un pago (ver pagos_factura) — permite
  // reversar/regenerar UN pago concreto sin tocar los demás cobros ya contabilizados de la misma
  // factura. null en el resto de casos (creación, gastos, cobros de antes de que existiera esta
  // trazabilidad).
  pago_id?: string | null;
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
// Autoliquidación (adquisición intracomunitaria UE o importación fuera de UE, art. 283-2 CGI):
// el proveedor no cobra IVA, pero la empresa se autoliquida el IVA que le correspondería a tipo
// general francés — se registra a la vez como "debido" (4452) y "deducible" (445662/445661), con
// efecto neto en caja de 0 € pero visible en el libro mayor (hallazgo real, auditoría 2026-08-21:
// antes esta autoliquidación no generaba ningún asiento, dejando esas cuentas del libro mayor
// siempre a 0 aunque hubiera compras intracomunitarias reales). Se deriva de TIPOS_IVA (iva.ts) en
// vez de un literal propio — AsistenteIvaPage.tsx usa la misma fuente para la casilla 17 de la CA3,
// así que una tasa nueva solo se cambia en un sitio (bug de diseño corregido 2026-09-08: antes eran
// dos literales `0.2` independientes, con riesgo real de divergir).
const TASA_TVA_AUTOLIQUIDACION = porcentajeIva('TVA_20') / 100;

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
  // contrapartida es el compte global de amortissements acumulados, no 512. Ojo: solo 681x, no
  // toda la familia 68x — 686 (dotations financières) es un gasto distinto, sí sale del banco
  // como cualquier otro (bug real corregido 2026-08-31, confundía ambas cuentas).
  const esAmortizacion = cuenta.startsWith('681');

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

// Apunte en el lado NATURAL del movimiento (p. ej. Clients es de saldo deudor: un importe positivo
// va a debe) salvo que el importe venga negativo, en cuyo caso se registra en el lado contrario con
// el valor absoluto — nunca un debe/haber negativo, eso no existe en un libro contable real. Hace
// falta para las facturas rectificativas (nota de crédito): sus totales salen negados de
// calcularTotales (lineasRectificativa niega cantidad), así que el asiento de una rectificativa es
// exactamente el de una factura normal con debe/haber intercambiados. Bug real corregido
// 2026-09-08: antes se guardaban esos importes negativos tal cual en el lado "normal" (un
// `debe: -1100` en vez de `haber: 1100`), y la línea de TVA collectée (con guard `iva > 0`) se
// omitía del todo en vez de invertirse, dejando el asiento descuadrado por el importe exacto del
// IVA en toda rectificativa que llevara IVA.
function apunte(
  cuenta: string,
  monto: number,
  ladoNormal: 'debe' | 'haber',
  base: Pick<NuevoAsiento, 'fecha' | 'concepto' | 'documento_tipo' | 'documento_id' | 'tipo_evento'>,
): NuevoAsiento {
  const importe = Math.abs(monto);
  const enDebe = ladoNormal === 'debe' ? monto >= 0 : monto < 0;
  return { ...base, cuenta, debe: enDebe ? importe : 0, haber: enDebe ? 0 : importe };
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
  const base = { fecha, concepto, documento_tipo: 'factura' as const, documento_id: factura.id, tipo_evento: 'creacion' as const };

  const asientos: NuevoAsiento[] = [apunte(CUENTA_CLIENTES, totalConIva, 'debe', base), apunte(CUENTA_VENTAS, totalSinIva, 'haber', base)];
  if (iva !== 0) {
    asientos.push(apunte(CUENTA_IVA_COLECTADA, iva, 'haber', base));
  }

  return asientos;
}

export function construirAsientosFacturaCobro(
  factura: { id: string; numero: string | null; cliente_nombre: string | null },
  monto: number,
  fecha: string,
  // Ver NuevoAsiento.pago_id — se pasa cuando el cobro corresponde a una fila de pagos_factura
  // concreta, para poder reversar/regenerar ese pago sin tocar los demás.
  pagoId: string | null = null,
): NuevoAsiento[] {
  const concepto = [factura.numero, factura.cliente_nombre].filter(Boolean).join(' — ') || 'Cobro de factura';
  const base = { fecha, concepto, documento_tipo: 'factura' as const, documento_id: factura.id, tipo_evento: 'cobro' as const, pago_id: pagoId };
  return [
    { ...base, cuenta: CUENTA_BANCO, debe: monto, haber: 0 },
    { ...base, cuenta: CUENTA_CLIENTES, debe: 0, haber: monto },
  ];
}

// Reversa (debe/haber invertidos) de asientos ya existentes — cada línea usa la fecha REAL del
// apunte original que anula (leída de la propia fila, nunca una fecha aproximada pasada por quien
// llama), para que la reversa cuadre siempre en el mismo ejercicio exacto que lo que está
// anulando, apunte por apunte, aunque el evento tenga varias fechas distintas (p. ej. varios
// cobros de una misma factura en meses distintos — bug real corregido 2026-09-08: antes se pasaba
// una única fecha para reversar todo el evento, que solo era correcta cuando había un único
// apunte por evento).
export function construirAsientosRectificacion(
  previos: { cuenta: string; debe: number; haber: number; concepto: string; fecha: string; pago_id?: string | null }[],
  documentoTipo: 'factura' | 'gasto',
  documentoId: string,
  tipoEvento: TipoEvento,
): NuevoAsiento[] {
  return previos.map((a) => ({
    fecha: a.fecha,
    cuenta: a.cuenta,
    debe: a.haber,
    haber: a.debe,
    concepto: `${a.concepto} (rectificación)`,
    documento_tipo: documentoTipo,
    documento_id: documentoId,
    tipo_evento: tipoEvento,
    pago_id: a.pago_id ?? null,
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

// Al registrar un pago de Factura: Débit Banco / Crédit Clients, por el importe de ESE pago
// concreto (una factura puede tener varios, ver pagos_factura) — nunca el total acumulado.
export async function registrarAsientoFacturaCobro(
  factura: { id: string; numero: string | null; cliente_nombre: string | null },
  monto: number,
  fecha: string,
  pagoId: string | null = null,
) {
  await insertarAsientos(construirAsientosFacturaCobro(factura, monto, fecha, pagoId));
}

// Inserta la reversa (debe/haber invertidos) de los asientos de un evento concreto ya
// contabilizado — nunca toca las filas existentes (asientos_contables es insert-only por RLS,
// sin política de update/delete). Se usa antes de volver a registrar el asiento correcto cuando
// se edita una Factura/Gasto ya contabilizado, o antes de eliminar un pago concreto.
//
// Sin argumento de fecha a propósito (bug real corregido 2026-09-08): cada línea se reversa con
// SU PROPIA fecha original, leída de la fila, nunca una fecha aproximada pasada por quien llama —
// necesario ahora que un mismo evento ('cobro') puede tener varios apuntes en fechas distintas.
//
// `pagoId`: si se da, solo reversa los apuntes de ESE pago concreto (deja los demás cobros de la
// misma factura intactos). Si se omite, reversa TODOS los apuntes del evento (usado al editar una
// factura/gasto entero, o al vaciar todos los pagos de una factura).
export async function rectificarAsientos(
  documentoTipo: 'factura' | 'gasto',
  documentoId: string,
  tipoEvento: TipoEvento = 'creacion',
  pagoId?: string,
) {
  let query = supabase
    .from('asientos_contables')
    .select('cuenta, debe, haber, concepto, fecha')
    .eq('documento_tipo', documentoTipo)
    .eq('documento_id', documentoId)
    .eq('tipo_evento', tipoEvento);
  if (pagoId) query = query.eq('pago_id', pagoId);
  const { data: previos, error } = await query;
  if (error) throw error;
  if (!previos || previos.length === 0) return;

  await insertarAsientos(construirAsientosRectificacion(previos, documentoTipo, documentoId, tipoEvento));
}
