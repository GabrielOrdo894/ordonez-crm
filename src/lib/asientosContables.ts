import { supabase } from './supabase';
import { calcularTotales } from '../modules/finanzas/lineas';
import type { Linea } from '../modules/finanzas/lineas';
import { cuentaLabel } from '../modules/finanzas/gastos/categorias';
import { porcentajeIva } from '../modules/finanzas/iva';
import { hoyLocalIso } from './fechas';

// Cuentas del libro diario que no están en CUENTAS_FR (gastos/types.ts) porque no son cuentas de
// gasto — son las de cliente/banco/venta/TVA/espera que usan las funciones de este fichero.
const ETIQUETAS_CUENTA_EXTRA: Record<string, string> = {
  '411': '411 · Clients',
  '512': '512 · Banque',
  '706': '706 · Prestations de services',
  '44571': '44571 · TVA collectée',
  '44574': '44574 · TVA collectée en attente (encaissements)',
  '4191': '4191 · Clients — avances et acomptes reçus sur commandes',
  '455': '455 · Associés — comptes courants',
  '467': '467 · Autres comptes débiteurs (capital déposé, en attente de libération)',
  '1013': '1013 · Capital souscrit, appelé, versé',
  '44566': '44566 · TVA déductible sur autres biens et services',
  '471': '471 · Compte d’attente (sin clasificar)',
  '2801': '2801 · Amortissements des immobilisations (compte global)',
  '4452': '4452 · TVA due intracommunautaire',
  '445662': '445662 · TVA déductible intracommunautaire',
  '445661': '445661 · TVA déductible sur importations',
};

export function etiquetaCuenta(codigo: string): string {
  if (ETIQUETAS_CUENTA_EXTRA[codigo]) return ETIQUETAS_CUENTA_EXTRA[codigo];
  if (codigo.startsWith('28')) return `${codigo} · Amortissements des immobilisations`;
  return cuentaLabel(codigo);
}

// Cuenta de amortizaciones acumuladas de un activo según el PCG: '28' + la cuenta del activo sin su
// '2' inicial (2154 → 28154, 2183 → 28183, 201 → 2801). Hasta 2026-09-29 todo iba a 2801, que en el
// PCG es solo la de frais d'établissement (hallazgo de la auditoría contable de esa fecha).
export function cuentaAmortizacionDe(cuentaActivo: string | null | undefined): string {
  return cuentaActivo && cuentaActivo.startsWith('2') ? `28${cuentaActivo.slice(1)}` : CUENTA_AMORTIZACIONES_ACUMULADAS;
}

export type TipoEvento = 'creacion' | 'cobro';

export type NuevoAsiento = {
  fecha: string;
  cuenta: string;
  debe: number;
  haber: number;
  concepto: string;
  documento_tipo: 'factura' | 'gasto' | 'inmovilizado';
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
const CUENTA_VALEUR_COMPTABLE_CEDEE = '675';
const CUENTA_CLIENTES = '411';
const CUENTA_VENTAS = '706';
const CUENTA_IVA_COLECTADA = '44571';
// TVA sur encaissements (régimen de la EURL): al EMITIR, la TVA de la factura queda en espera en
// 44574 y pasa a 44571 (exigible) al COBRAR, en proporción a cada pago — así 44571 cuadra siempre
// con la CA3 del mes, también con facturas pendientes (auditoría contable 2026-09-29).
const CUENTA_IVA_COLECTADA_ESPERA = '44574';
// Acomptes recibidos antes de terminar la obra: no son venta (706) sino un anticipo del cliente
// (4191) hasta la factura final, que los descuenta con la línea 'ACOMPTE' (art. 38-2 bis CGI,
// auditoría fiscal 2026-09-29 — antes iban directos a 706 e inflaban el résultat y el IS).
const CUENTA_ACOMPTES_RECIBIDOS = '4191';
// Indemnités kilométriques del gérant por su vehículo personal: la EURL se las debe a él, no salen
// del banco — cuenta corriente del asociado (455) en vez de 512 (auditoría contable 2026-09-29).
const CUENTA_CORRIENTE_ASOCIADO = '455';
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
  // Gasto de kilometraje (indemnité kilométrique): contrapartida 455 en vez de banco.
  km?: number | null;
  // Solo dotaciones (681): cuenta 28xx del activo amortizado (ver cuentaAmortizacionDe).
  cuenta_amortizacion?: string | null;
}): NuevoAsiento[] {
  const fecha = gasto.fecha ?? hoyLocalIso();
  const cuenta = gasto.cuenta_contable ?? CUENTA_SIN_CLASIFICAR;
  const base = gasto.importe_base ?? 0;
  const iva = gasto.importe_iva ?? 0;
  const concepto = [gasto.descripcion, gasto.proveedor].filter(Boolean).join(' — ') || 'Gasto';
  // Las cuentas 681x (amortización, ya sin IVA por diseño de GastoForm) no salen del banco — su
  // contrapartida es el compte global de amortissements acumulados, no 512. Ojo: solo 681x, no
  // toda la familia 68x — 686 (dotations financières) es un gasto distinto, sí sale del banco
  // como cualquier otro (bug real corregido 2026-08-31, confundía ambas cuentas).
  const esAmortizacion = cuenta.startsWith('681');

  // Guarda de importe 0 en cada línea (mismo motivo que apunte() más abajo) — un gasto con
  // importe_base 0 (p. ej. compuesto solo de IVA, o mal introducido) no debe generar una fila
  // fantasma 0/0 en un libro insert-only.
  const asientos: NuevoAsiento[] = [];
  if (base !== 0) {
    asientos.push({ fecha, cuenta, debe: base, haber: 0, concepto, documento_tipo: 'gasto', documento_id: gasto.id, tipo_evento: 'creacion' });
  }
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
  if (base + iva !== 0) {
    asientos.push({
      fecha,
      cuenta: esAmortizacion
        ? (gasto.cuenta_amortizacion ?? CUENTA_AMORTIZACIONES_ACUMULADAS)
        : gasto.km != null
          ? CUENTA_CORRIENTE_ASOCIADO
          : CUENTA_BANCO,
      debe: 0,
      haber: base + iva,
      concepto,
      documento_tipo: 'gasto',
      documento_id: gasto.id,
      tipo_evento: 'creacion',
    });
  }

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
// Devuelve null si el importe es 0 — sin esto, una factura con todas las líneas a 0€ (permitido
// desde el editor, que solo clampa negativos, no ceros) insertaría una fila fantasma 0/0 en un
// libro insert-only que no se puede corregir después (hallazgo real, auditoría 2026-09-21, no
// manifestado en producción pero posible desde el editor de líneas actual).
function apunte(
  cuenta: string,
  monto: number,
  ladoNormal: 'debe' | 'haber',
  base: Pick<NuevoAsiento, 'fecha' | 'concepto' | 'documento_tipo' | 'documento_id' | 'tipo_evento'>,
): NuevoAsiento | null {
  if (monto === 0) return null;
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
  // 'normal' | 'acompte' | 'rectificativa' (facturas.tipo). Sin él se trata como normal.
  tipo?: string | null;
}): NuevoAsiento[] {
  const fecha = factura.fecha_factura ?? hoyLocalIso();
  const { totalSinIva, totalConIva } = calcularTotales(factura.lineas);
  const iva = totalConIva - totalSinIva;
  const concepto = [factura.numero, factura.cliente_nombre].filter(Boolean).join(' — ') || 'Factura';
  const base = { fecha, concepto, documento_tipo: 'factura' as const, documento_id: factura.id, tipo_evento: 'creacion' as const };

  const asientos = [apunte(CUENTA_CLIENTES, totalConIva, 'debe', base)];
  if (factura.tipo === 'acompte') {
    asientos.push(apunte(CUENTA_ACOMPTES_RECIBIDOS, totalSinIva, 'haber', base));
  } else {
    // Factura final: la línea 'ACOMPTE' (negativa, ver lineaDeduccionAcomptes) salda el anticipo de
    // 4191 en vez de restar de la venta — la venta (706) es el importe total de la obra.
    const deduccionAcomptes = calcularTotales(factura.lineas.filter((l) => l.referencia === 'ACOMPTE')).totalSinIva;
    asientos.push(apunte(CUENTA_VENTAS, totalSinIva - deduccionAcomptes, 'haber', base));
    asientos.push(apunte(CUENTA_ACOMPTES_RECIBIDOS, deduccionAcomptes, 'haber', base));
  }
  if (iva !== 0) {
    // Una rectificativa corrige TVA ya declarada al emitirse (no se "cobra"), así que va directa a
    // 44571; el resto espera en 44574 hasta el cobro.
    const cuentaIva = factura.tipo === 'rectificativa' ? CUENTA_IVA_COLECTADA : CUENTA_IVA_COLECTADA_ESPERA;
    asientos.push(apunte(cuentaIva, iva, 'haber', base));
  }

  return asientos.filter((a): a is NuevoAsiento => a !== null);
}

// TVA incluida en un cobro (monto con IVA) — la parte que pasa de 44574 a 44571 al cobrar.
export function tvaDeCobro(monto: number, tipoIva: string | null | undefined): number {
  const pct = porcentajeIva(tipoIva ?? null);
  return pct > 0 ? Math.round(((monto * pct) / (100 + pct)) * 100) / 100 : 0;
}

export function construirAsientosFacturaCobro(
  // tipo_iva: para traspasar de 44574 a 44571 la TVA contenida en este cobro.
  factura: { id: string; numero: string | null; cliente_nombre: string | null; tipo_iva: string | null },
  monto: number,
  fecha: string,
  // Ver NuevoAsiento.pago_id — se pasa cuando el cobro corresponde a una fila de pagos_factura
  // concreta, para poder reversar/regenerar ese pago sin tocar los demás.
  pagoId: string | null = null,
): NuevoAsiento[] {
  const concepto = [factura.numero, factura.cliente_nombre].filter(Boolean).join(' — ') || 'Cobro de factura';
  const base = { fecha, concepto, documento_tipo: 'factura' as const, documento_id: factura.id, tipo_evento: 'cobro' as const, pago_id: pagoId };
  const asientos: NuevoAsiento[] = [
    { ...base, cuenta: CUENTA_BANCO, debe: monto, haber: 0 },
    { ...base, cuenta: CUENTA_CLIENTES, debe: 0, haber: monto },
  ];
  const tva = tvaDeCobro(monto, factura.tipo_iva);
  if (tva !== 0) {
    asientos.push(
      { ...base, cuenta: CUENTA_IVA_COLECTADA_ESPERA, debe: tva, haber: 0 },
      { ...base, cuenta: CUENTA_IVA_COLECTADA, debe: 0, haber: tva },
    );
  }
  return asientos;
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

// Reversa por SALDO NETO: agrupa todo el histórico del evento por (pago, cuenta, fecha) y anula solo
// lo que siga teniendo saldo. Sustituye (2026-09-29) al criterio anterior de "reversar el último
// lote", que no distinguía si ese lote ya era una anulación: guardar AC-2026-0020 (cuya última
// escritura es su propia reversa) volvía a contabilizar 15.707,59 €, y un duplicado nunca se
// corregía solo (auditoría contable 2026-09-29). Con el neto, rectificar dos veces seguidas o un
// documento ya anulado no inserta nada.
export function construirAsientosRectificacionNeta(
  historico: { cuenta: string; debe: number; haber: number; concepto: string; fecha: string; pago_id?: string | null }[],
  documentoTipo: 'factura' | 'gasto',
  documentoId: string,
  tipoEvento: TipoEvento,
): NuevoAsiento[] {
  const grupos = new Map<string, { cuenta: string; fecha: string; pago_id: string | null; concepto: string; neto: number }>();
  for (const a of historico) {
    const clave = `${a.pago_id ?? ''}|${a.cuenta}|${a.fecha}`;
    const g = grupos.get(clave) ?? { cuenta: a.cuenta, fecha: a.fecha, pago_id: a.pago_id ?? null, concepto: a.concepto, neto: 0 };
    g.neto += Number(a.debe) - Number(a.haber);
    if (!a.concepto.endsWith('(rectificación)')) g.concepto = a.concepto;
    grupos.set(clave, g);
  }
  const reversa: NuevoAsiento[] = [];
  for (const g of grupos.values()) {
    const neto = Math.round(g.neto * 100) / 100;
    if (neto === 0) continue;
    reversa.push({
      fecha: g.fecha,
      cuenta: g.cuenta,
      debe: neto < 0 ? -neto : 0,
      haber: neto > 0 ? neto : 0,
      concepto: `${g.concepto.replace(/ \(rectificación\)$/, '')} (rectificación)`,
      documento_tipo: documentoTipo,
      documento_id: documentoId,
      tipo_evento: tipoEvento,
      pago_id: g.pago_id,
    });
  }
  return reversa;
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

// Baja (mise au rebut) de un activo de Inmovilizado — hasta 2026-09-21 no generaba ningún asiento:
// el valor neto contable quedaba congelado en el punto de la baja y se seguía arrastrando para
// siempre en el Bilan/Liasse Fiscale (useComptaFrancia.ts suma directamente valorNetoContable() de
// TODOS los activos de la tabla `inmovilizado`, dados de baja o no), sin ningún mecanismo para
// corregirlo (hallazgo real, auditoría 2026-09-21). Tratamiento PCG estándar de una baja sin
// contraprestación (no se modela precio de venta, solo "dado de baja"):
//   Débit 2801 (amortissements cumulés) — limpia lo ya amortizado de este activo.
//   Débit 675 (valeur comptable des éléments d'actif cédés) — el VNC restante, como gasto.
//   Crédit <cuenta_pcg del activo> — saca el valor bruto del activo del balance.
// `amortizacionAcumuladaActivo`/`valorNetoContableActivo` se calculan en el caller (TabInmovilizado.tsx,
// vía amortizacionAcumulada()/valorNetoContable() de inmovilizado.ts) y se pasan ya calculados para
// evitar un import circular (inmovilizado.ts ya importa de este fichero).
export function construirAsientosBajaInmovilizado(
  activo: { id: string; descripcion: string; cuenta_pcg: string },
  amortizacionAcumuladaActivo: number,
  valorNetoContableActivo: number,
  fecha: string,
): NuevoAsiento[] {
  const concepto = `Baja de inmovilizado — ${activo.descripcion}`;
  const base = { fecha, concepto, documento_tipo: 'inmovilizado' as const, documento_id: activo.id, tipo_evento: 'creacion' as const };
  const asientos = [
    apunte(cuentaAmortizacionDe(activo.cuenta_pcg), amortizacionAcumuladaActivo, 'debe', base),
    apunte(CUENTA_VALEUR_COMPTABLE_CEDEE, valorNetoContableActivo, 'debe', base),
    apunte(activo.cuenta_pcg, amortizacionAcumuladaActivo + valorNetoContableActivo, 'haber', base),
  ];
  return asientos.filter((a): a is NuevoAsiento => a !== null);
}

export async function registrarAsientoBajaInmovilizado(
  activo: { id: string; descripcion: string; cuenta_pcg: string },
  amortizacionAcumuladaActivo: number,
  valorNetoContableActivo: number,
  fecha: string,
) {
  await insertarAsientos(construirAsientosBajaInmovilizado(activo, amortizacionAcumuladaActivo, valorNetoContableActivo, fecha));
}

// Al registrar un pago de Factura: Débit Banco / Crédit Clients, por el importe de ESE pago
// concreto (una factura puede tener varios, ver pagos_factura) — nunca el total acumulado.
export async function registrarAsientoFacturaCobro(
  factura: Parameters<typeof construirAsientosFacturaCobro>[0],
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
// misma factura intactos). Si se omite, reversa TODOS los pagos del evento — usado al editar una
// factura/gasto entero, al vaciar todos los pagos de una factura, o al papelerizarla.
export async function rectificarAsientos(
  documentoTipo: 'factura' | 'gasto',
  documentoId: string,
  tipoEvento: TipoEvento = 'creacion',
  pagoId?: string,
) {
  let query = supabase
    .from('asientos_contables')
    .select('cuenta, debe, haber, concepto, fecha, pago_id')
    .eq('documento_tipo', documentoTipo)
    .eq('documento_id', documentoId)
    .eq('tipo_evento', tipoEvento);
  if (pagoId) query = query.eq('pago_id', pagoId);
  const { data: historico, error } = await query;
  if (error) throw error;
  if (!historico || historico.length === 0) return;

  // Saldo neto de todo el histórico (agrupado por pago, cuenta y fecha), no el "último lote" — ver
  // construirAsientosRectificacionNeta.
  const reversa = construirAsientosRectificacionNeta(historico, documentoTipo, documentoId, tipoEvento);
  if (reversa.length > 0) await insertarAsientos(reversa);
}
