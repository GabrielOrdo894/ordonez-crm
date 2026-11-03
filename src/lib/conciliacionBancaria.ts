import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { registrarEvento } from './eventos';
import { registrarPagoFactura, anularPagoFactura } from './pagosFactura';
import { totalConIvaFactura } from '../modules/finanzas/facturas/types';
import type { Factura } from '../modules/finanzas/facturas/types';
import type { MovimientoBanco } from '../modules/contabilidad/types';
import { formatearPrecio } from '../modules/finanzas/lineas';
import { porcentajeIva } from '../modules/finanzas/iva';
import { cuentaLabel } from '../modules/finanzas/gastos/categorias';
import { anularOperacionDiversa, registrarOperacionDiversa } from './asientosContables';
import { hoyLocalIso, sumarDiasIso } from './fechas';
import {
  comercioDeMovimiento,
  sugerenciaAutomatica,
  sugerirParaCobro,
  sugerirParaPago,
  type FacturaPendiente,
  type GastoLibre,
  type PagoLibre,
  type ReglaBanco,
} from './sugerenciasConciliacion';

/** Llama a la Edge Function `banco-sync` (Enable Banking) y devuelve su respuesta, o lanza el
 * mensaje de error real que devolvió la función en vez del genérico de supabase-js. */
export async function invocarBancoSync<T = Record<string, unknown>>(
  body: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke('banco-sync', { body });
  if (error) {
    let mensaje = error.message;
    if (error instanceof FunctionsHttpError) {
      try {
        const cuerpo = await error.context.json();
        if (cuerpo?.error) mensaje = cuerpo.error;
      } catch {
        // el cuerpo no era JSON — se usa el mensaje genérico
      }
    }
    throw new Error(mensaje);
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}

/** Importe que falta por cobrar de una factura. */
export function pendienteDeCobro(f: Pick<Factura, 'lineas' | 'monto_pagado'>): number {
  return Math.round((totalConIvaFactura(f) - (f.monto_pagado ?? 0)) * 100) / 100;
}

/** La factura a la que corresponde un cobro SOLO si hay exactamente una cuyo importe pendiente
 * coincide al céntimo — con dos o más candidatas (p. ej. dos acomptes iguales) no se adivina y el
 * movimiento se queda Pendiente para vincularlo a mano. */
export function facturaUnicaParaCobro<F extends Pick<Factura, 'lineas' | 'monto_pagado' | 'tipo'>>(
  importe: number,
  facturas: F[],
): F | null {
  if (importe <= 0) return null;
  const coincidentes = facturas.filter(
    (f) => f.tipo !== 'rectificativa' && Math.abs(pendienteDeCobro(f) - importe) < 0.01,
  );
  return coincidentes.length === 1 ? coincidentes[0] : null;
}

/** Facturas que pueden recibir un cobro en la cuenta de la EURL: de Francia, ni en papelera, ni
 * rectificativas, ni de la estructura anterior a la EURL (no son ingreso real de la société, ver
 * CLAUDE.md §10). Antes entraban también las de España y las rectificativas (auditoría 2026-10-01). */
export async function facturasPendientesDeCobro(): Promise<Factura[]> {
  const { data, error } = await supabase
    .from('facturas')
    .select('*')
    .is('eliminado_en', null)
    .eq('pais', 'Francia')
    .eq('estructura_anterior', false)
    .neq('tipo', 'rectificativa')
    .in('estado_cobro', ['Pendiente', 'Cobrada parcialmente', 'Vencida'])
    .order('fecha_factura', { ascending: false });
  if (error) throw error;
  return data as Factura[];
}

async function soltarMovimiento(movimientoId: string) {
  const { error } = await supabase
    .from('movimientos_banco')
    .update({ estado: 'Pendiente', factura_id: null, pago_id: null })
    .eq('id', movimientoId);
  if (error) throw error;
}

/** Un movimiento bancario conciliado es un pago real (registrarPagoFactura: pago + asiento juntos,
 * sin pasar de lo pendiente). Si algo falla a mitad, se deshace lo hecho: nunca queda un movimiento
 * "Vinculado" sin pago ni un pago sin su movimiento. */
export async function vincularMovimientoAFactura(
  movimiento: Pick<MovimientoBanco, 'id' | 'fecha' | 'importe'>,
  factura: Factura,
  origen: 'manual' | 'automatica',
): Promise<{ pagoId: string; avisoAsiento: string | null }> {
  if (factura.tipo === 'rectificativa')
    throw new Error('Un cobro no se puede vincular a una factura rectificativa.');
  // Se "reserva" el movimiento antes de crear el pago: solo una pestaña o dispositivo puede pasarlo de
  // Pendiente a Vinculado (auditoría 2026-09-29).
  const { data: reservado, error: errorReserva } = await supabase
    .from('movimientos_banco')
    .update({ estado: 'Vinculado', factura_id: factura.id })
    .eq('id', movimiento.id)
    .eq('estado', 'Pendiente')
    .is('pago_id', null)
    .select('id');
  if (errorReserva) throw errorReserva;
  if (!reservado || reservado.length === 0)
    throw new Error('Este movimiento ya se ha vinculado desde otra sesión.');

  let pagoId: string;
  try {
    const { pago } = await registrarPagoFactura(factura, {
      fecha: movimiento.fecha,
      importe: movimiento.importe,
      creadoPor:
        origen === 'manual' ? 'Conciliación bancaria (OFX)' : 'Conciliación bancaria automática',
    });
    pagoId = pago.id;
  } catch (error) {
    await soltarMovimiento(movimiento.id);
    throw error;
  }

  const { error: errorMovimiento } = await supabase
    .from('movimientos_banco')
    .update({ pago_id: pagoId })
    .eq('id', movimiento.id);
  if (errorMovimiento) {
    await anularPagoFactura(factura, pagoId, 'Sistema (fallo al vincular el movimiento bancario)');
    await soltarMovimiento(movimiento.id);
    throw errorMovimiento;
  }

  let avisoAsiento: string | null = null;
  try {
    await registrarEvento(
      'factura',
      factura.id,
      origen === 'manual'
        ? `Pago de ${formatearPrecio(movimiento.importe)} vinculado desde un movimiento bancario`
        : `Pago de ${formatearPrecio(movimiento.importe)} conciliado automáticamente con el movimiento bancario del ${movimiento.fecha}`,
    );
  } catch (error) {
    avisoAsiento = `Pago vinculado, pero no se pudo anotar en el historial de la factura: ${(error as Error).message}`;
  }
  return { pagoId, avisoAsiento };
}

/** Recorre los cobros bancarios pendientes y los vincula a su factura cuando la coincidencia es
 * única y exacta. Devuelve cuántos concilió y los avisos de asiento que hubiera. */
export async function conciliarCobrosAutomaticos(): Promise<{
  conciliados: number;
  avisos: string[];
}> {
  const { data: cobros, error } = await supabase
    .from('movimientos_banco')
    .select('id, fecha, importe')
    .eq('estado', 'Pendiente')
    .gt('importe', 0)
    .order('fecha');
  if (error) throw error;
  if (!cobros || cobros.length === 0) return { conciliados: 0, avisos: [] };

  let facturas = await facturasPendientesDeCobro();
  let conciliados = 0;
  const avisos: string[] = [];
  for (const m of cobros) {
    const factura = facturaUnicaParaCobro(m.importe, facturas);
    if (!factura) continue;
    // Un fallo en un movimiento no corta la conciliación de los demás.
    try {
      const { avisoAsiento } = await vincularMovimientoAFactura(m, factura, 'automatica');
      conciliados++;
      if (avisoAsiento) avisos.push(avisoAsiento);
    } catch (error) {
      avisos.push(`No se pudo conciliar el cobro del ${m.fecha}: ${(error as Error).message}`);
    }
    // La factura ya ha cambiado (o está cobrada del todo): se relee para el siguiente cobro.
    facturas = await facturasPendientesDeCobro();
  }
  return { conciliados, avisos };
}

// ── Conciliación v2 (2026-11-03): enlaces múltiples, cobros/gastos ya registrados, operaciones
// diversas y reglas. Las sugerencias son lógica pura en sugerenciasConciliacion.ts; aquí solo lo que
// toca la base de datos. Cada acción "reserva" el movimiento (Pendiente → Vinculado) antes de crear
// nada, igual que vincularMovimientoAFactura, y lo suelta si algo falla a mitad.

export type EnlaceMovimiento = {
  id: string;
  movimiento_id: string;
  factura_id: string | null;
  pago_id: string | null;
  gasto_id: string | null;
  operacion_id: string | null;
  importe: number;
  pago_previo: boolean;
  concepto: string | null;
  facturas?: { numero: string | null; cliente_nombre: string | null } | null;
  gastos?: {
    proveedor: string | null;
    descripcion: string | null;
    adjunto_url: string | null;
    estado_gasto: string | null;
    num_factura_proveedor: string | null;
  } | null;
};

export type MovimientoConEnlaces = MovimientoBanco & {
  movimientos_banco_enlaces: EnlaceMovimiento[];
};

export const SELECT_MOVIMIENTO_CON_ENLACES =
  '*, movimientos_banco_enlaces(*, facturas(numero, cliente_nombre), gastos(proveedor, descripcion, adjunto_url, estado_gasto, num_factura_proveedor))';

const centimos = (n: number) => Math.round(n * 100);

async function reservarMovimiento(movimientoId: string, cambios: Record<string, unknown> = {}) {
  const { data, error } = await supabase
    .from('movimientos_banco')
    .update({ estado: 'Vinculado', ...cambios })
    .eq('id', movimientoId)
    .eq('estado', 'Pendiente')
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0)
    throw new Error('Este movimiento ya no está pendiente (¿se ha conciliado desde otra sesión?).');
}

async function liberarMovimiento(movimientoId: string) {
  const { error } = await supabase
    .from('movimientos_banco_enlaces')
    .delete()
    .eq('movimiento_id', movimientoId);
  if (error) throw error;
  const { error: e2 } = await supabase
    .from('movimientos_banco')
    .update({ estado: 'Pendiente', factura_id: null, gasto_id: null, pago_id: null })
    .eq('id', movimientoId);
  if (e2) throw e2;
}

/** Cobros registrados a mano (no anulados, positivos) que ningún movimiento ha conciliado todavía. */
export async function cargarPagosLibres(): Promise<PagoLibre[]> {
  const { data, error } = await supabase
    .from('pagos_factura')
    .select('id, factura_id, fecha, monto, facturas(numero, cliente_nombre)')
    .is('anulado_en', null)
    .gt('monto', 0)
    .order('fecha', { ascending: false });
  if (error) throw error;
  const { data: usados, error: e2 } = await supabase
    .from('movimientos_banco_enlaces')
    .select('pago_id')
    .not('pago_id', 'is', null);
  if (e2) throw e2;
  const ocupados = new Set((usados ?? []).map((u) => u.pago_id));
  type Fila = {
    id: string;
    factura_id: string;
    fecha: string;
    monto: number;
    facturas: { numero: string | null; cliente_nombre: string | null } | null;
  };
  return ((data ?? []) as unknown as Fila[])
    .filter((p) => !ocupados.has(p.id))
    .map((p) => ({
      id: p.id,
      factura_id: p.factura_id,
      fecha: p.fecha,
      monto: Number(p.monto),
      numero: p.facturas?.numero ?? null,
      cliente_nombre: p.facturas?.cliente_nombre ?? null,
    }));
}

/** Gastos que ningún movimiento ha conciliado todavía. Sin los de kilometraje: no se pagan desde el
 * banco (van a la cuenta del gérant, 455). */
export async function cargarGastosLibres(desde: string): Promise<GastoLibre[]> {
  const { data, error } = await supabase
    .from('gastos')
    .select('id, fecha, importe_base, importe_iva, proveedor, proveedor_id, descripcion, km')
    .gte('fecha', desde)
    .is('km', null)
    .order('fecha', { ascending: false });
  if (error) throw error;
  const { data: usados, error: e2 } = await supabase
    .from('movimientos_banco_enlaces')
    .select('gasto_id')
    .not('gasto_id', 'is', null);
  if (e2) throw e2;
  const ocupados = new Set((usados ?? []).map((u) => u.gasto_id));
  return (data ?? [])
    .filter((g) => !ocupados.has(g.id))
    .map((g) => ({
      id: g.id,
      fecha: g.fecha,
      total: Math.round(((Number(g.importe_base) || 0) + (Number(g.importe_iva) || 0)) * 100) / 100,
      proveedor: g.proveedor,
      proveedor_id: g.proveedor_id,
      descripcion: g.descripcion,
    }));
}

export function facturasParaSugerir(facturas: Factura[]): FacturaPendiente[] {
  return facturas.map((f) => ({
    id: f.id,
    numero: f.numero,
    cliente_nombre: f.cliente_nombre,
    pendiente: pendienteDeCobro(f),
  }));
}

export async function cargarReglas(): Promise<ReglaBanco[]> {
  const { data, error } = await supabase.from('reglas_banco').select('*').order('patron');
  if (error) throw error;
  return (data ?? []) as ReglaBanco[];
}

/** Enlaza un ingreso con cobros que ya estaban registrados a mano (uno o varios): no crea ningún
 * pago ni asiento, y deshacerlo no los anula. La suma tiene que ser exactamente el ingreso. */
export async function vincularACobrosExistentes(
  movimiento: Pick<MovimientoBanco, 'id' | 'importe'>,
  pagos: PagoLibre[],
) {
  if (pagos.length === 0) throw new Error('Elige al menos un cobro.');
  const suma = pagos.reduce((s, p) => s + centimos(p.monto), 0);
  if (suma !== centimos(movimiento.importe)) {
    throw new Error(
      `Los cobros elegidos suman ${formatearPrecio(suma / 100)} y el ingreso es de ${formatearPrecio(movimiento.importe)}.`,
    );
  }
  await reservarMovimiento(movimiento.id);
  const { error } = await supabase
    .from('movimientos_banco_enlaces')
    .insert(
      pagos.map((p) => ({
        movimiento_id: movimiento.id,
        factura_id: p.factura_id,
        pago_id: p.id,
        importe: p.monto,
        pago_previo: true,
      })),
    );
  if (error) {
    await liberarMovimiento(movimiento.id);
    throw error.code === '23505'
      ? new Error('Alguno de esos cobros ya está conciliado con otro movimiento.')
      : error;
  }
  if (pagos.length === 1) {
    const { error: e2 } = await supabase
      .from('movimientos_banco')
      .update({ factura_id: pagos[0].factura_id, pago_id: pagos[0].id })
      .eq('id', movimiento.id);
    if (e2) throw e2;
  }
  for (const p of pagos) {
    await registrarEvento(
      'factura',
      p.factura_id,
      `Cobro de ${formatearPrecio(p.monto)} del ${p.fecha} conciliado con el movimiento bancario`,
    );
  }
}

/** Enlaza un pago con gastos ya registrados (uno o varios). La suma tiene que ser exactamente el pago. */
export async function vincularAGastos(
  movimiento: Pick<MovimientoBanco, 'id' | 'importe'>,
  gastos: GastoLibre[],
) {
  if (gastos.length === 0) throw new Error('Elige al menos un gasto.');
  const suma = gastos.reduce((s, g) => s + centimos(g.total), 0);
  if (suma !== centimos(Math.abs(movimiento.importe))) {
    throw new Error(
      `Los gastos elegidos suman ${formatearPrecio(suma / 100)} y el pago es de ${formatearPrecio(Math.abs(movimiento.importe))}.`,
    );
  }
  if (gastos.length === 1) {
    // Una sola fila: basta la columna gasto_id, el trigger crea su enlace.
    await reservarMovimiento(movimiento.id, { gasto_id: gastos[0].id });
    return;
  }
  await reservarMovimiento(movimiento.id);
  const { error } = await supabase
    .from('movimientos_banco_enlaces')
    .insert(
      gastos.map((g) => ({ movimiento_id: movimiento.id, gasto_id: g.id, importe: g.total })),
    );
  if (error) {
    await liberarMovimiento(movimiento.id);
    throw error.code === '23505'
      ? new Error('Alguno de esos gastos ya está conciliado con otro movimiento.')
      : error;
  }
}

/** Movimientos que no son ni una venta ni un gasto con factura: aportaciones del socio, préstamo,
 * pago de la TVA o del IS, comisiones... Se registran como operación diversa contra el banco (512). */
export const CONTRAPARTIDAS_BANCO: {
  cuenta: string;
  sentido: 'pago' | 'cobro';
  etiqueta: string;
}[] = [
  { cuenta: '455', sentido: 'cobro', etiqueta: '455 · Aportación del socio a su cuenta corriente' },
  { cuenta: '164', sentido: 'cobro', etiqueta: '164 · Préstamo recibido (con devolución pactada)' },
  {
    cuenta: '58',
    sentido: 'cobro',
    etiqueta: '58 · Transferencia interna desde otra cuenta de la empresa',
  },
  { cuenta: '44551', sentido: 'pago', etiqueta: '44551 · Pago de la TVA (CA3)' },
  { cuenta: '444', sentido: 'pago', etiqueta: '444 · Pago del impuesto de sociedades (IS)' },
  { cuenta: '627', sentido: 'pago', etiqueta: '627 · Comisión o cuota bancaria' },
  { cuenta: '6251', sentido: 'pago', etiqueta: '6251 · Peaje de autopista sin justificante' },
  { cuenta: '646', sentido: 'pago', etiqueta: '646 · Cotisations sociales del gérant (URSSAF)' },
  { cuenta: '641', sentido: 'pago', etiqueta: '641 · Rémunération del gérant (neta)' },
  { cuenta: '455', sentido: 'pago', etiqueta: '455 · Reembolso o retirada del socio' },
  { cuenta: '164', sentido: 'pago', etiqueta: '164 · Devolución del préstamo' },
  { cuenta: '53', sentido: 'pago', etiqueta: '53 · Retirada de efectivo a la caja de la empresa' },
  {
    cuenta: '58',
    sentido: 'pago',
    etiqueta: '58 · Transferencia interna a otra cuenta de la empresa',
  },
];

export async function registrarComoOperacion(
  movimiento: Pick<MovimientoBanco, 'id' | 'importe' | 'fecha'>,
  cuenta: string,
  concepto: string,
) {
  const importe = Math.abs(movimiento.importe);
  const lineas =
    movimiento.importe >= 0
      ? [
          { cuenta: '512', debe: importe, haber: 0 },
          { cuenta, debe: 0, haber: importe },
        ]
      : [
          { cuenta, debe: importe, haber: 0 },
          { cuenta: '512', debe: 0, haber: importe },
        ];
  await reservarMovimiento(movimiento.id);
  let operacionId: string;
  try {
    operacionId = await registrarOperacionDiversa(lineas, concepto, movimiento.fecha);
  } catch (error) {
    await liberarMovimiento(movimiento.id);
    throw error;
  }
  const { error } = await supabase
    .from('movimientos_banco_enlaces')
    .insert({
      movimiento_id: movimiento.id,
      operacion_id: operacionId,
      importe,
      concepto: `${concepto} (${cuenta})`,
    });
  if (error) {
    await anularOperacionDiversa(operacionId, hoyLocalIso());
    await liberarMovimiento(movimiento.id);
    throw error;
  }
}

/** Gasto pendiente de revisar creado desde un pago del banco (con los datos de la regla si la hay):
 * no genera asiento hasta confirmarlo en Gastos con su justificante, igual que los de banco-sync. */
export async function crearGastoPendienteDesdeMovimiento(
  movimiento: Pick<MovimientoBanco, 'id' | 'importe' | 'fecha' | 'descripcion' | 'contraparte'>,
  regla?: ReglaBanco | null,
): Promise<string> {
  const total = Math.abs(movimiento.importe);
  const tipoIva = regla?.tipo_iva || 'EXENTO';
  const base = Math.round((total / (1 + porcentajeIva(tipoIva) / 100)) * 100) / 100;
  let proveedor = movimiento.contraparte || comercioDeMovimiento(movimiento.descripcion) || null;
  if (regla?.proveedor_id) {
    const { data, error } = await supabase
      .from('proveedores')
      .select('razon_social')
      .eq('id', regla.proveedor_id)
      .maybeSingle();
    if (error) throw error;
    if (data?.razon_social) proveedor = data.razon_social;
  }
  const cuenta = regla?.cuenta_contable || null;
  const { data: gasto, error } = await supabase
    .from('gastos')
    .insert({
      fecha: movimiento.fecha,
      descripcion:
        regla?.descripcion ||
        `${comercioDeMovimiento(movimiento.descripcion) || 'Pago bancario'} — pago bancario (falta justificante)`,
      categoria: cuenta ? cuentaLabel(cuenta) : null,
      proveedor,
      proveedor_id: regla?.proveedor_id ?? null,
      importe_base: base,
      tipo_iva: tipoIva,
      importe_iva: Math.round((total - base) * 100) / 100,
      pais: 'Francia',
      cuenta_contable: cuenta,
      estado_gasto: 'pendiente',
    })
    .select('id')
    .single();
  if (error) throw error;
  try {
    await reservarMovimiento(movimiento.id, { gasto_id: gasto.id });
  } catch (errorReserva) {
    const { error: errorBorrar } = await supabase.from('gastos').delete().eq('id', gasto.id);
    if (errorBorrar)
      console.error('No se pudo borrar el gasto pendiente huérfano:', errorBorrar.message);
    throw errorReserva;
  }
  return gasto.id as string;
}

/** Aplica una regla a un movimiento pendiente. */
export async function aplicarRegla(movimiento: MovimientoBanco, regla: ReglaBanco) {
  if (regla.accion === 'gasto') await crearGastoPendienteDesdeMovimiento(movimiento, regla);
  else if (regla.accion === 'operacion') {
    if (!regla.contrapartida)
      throw new Error(`La regla «${regla.patron}» no tiene cuenta de contrapartida.`);
    await registrarComoOperacion(
      movimiento,
      regla.contrapartida,
      regla.descripcion || comercioDeMovimiento(movimiento.descripcion),
    );
  } else {
    const { error } = await supabase
      .from('movimientos_banco')
      .update({ estado: 'Ignorado' })
      .eq('id', movimiento.id)
      .eq('estado', 'Pendiente');
    if (error) throw error;
  }
  const { error } = await supabase
    .from('reglas_banco')
    .update({ veces_aplicada: regla.veces_aplicada + 1 })
    .eq('id', regla.id);
  if (error) console.warn('No se pudo contar el uso de la regla:', error.message);
}

/** Crea una regla o sustituye la que ya hubiera con el mismo texto y sentido. */
export async function guardarRegla(regla: Omit<ReglaBanco, 'id' | 'veces_aplicada'>) {
  const patron = regla.patron.trim();
  if (patron.length < 3)
    throw new Error('El texto de la regla tiene que tener al menos 3 caracteres.');
  const { error: errorBorrar } = await supabase
    .from('reglas_banco')
    .delete()
    .ilike('patron', patron)
    .eq('sentido', regla.sentido);
  if (errorBorrar) throw errorBorrar;
  const { error } = await supabase.from('reglas_banco').insert({ ...regla, patron });
  if (error) throw error;
}

export async function borrarRegla(id: string) {
  const { error } = await supabase.from('reglas_banco').delete().eq('id', id);
  if (error) throw error;
}

/** Deshace la conciliación de un movimiento: anula los cobros que se crearon desde el banco (no los
 * que ya estaban registrados a mano) y las operaciones diversas creadas desde él, y lo deja
 * Pendiente. Los gastos se conservan: si hay que corregirlos, se hace en Gastos. */
export async function deshacerConciliacion(movimiento: MovimientoConEnlaces, usuario: string) {
  const enlaces = movimiento.movimientos_banco_enlaces ?? [];
  for (const e of enlaces) {
    if (e.pago_id && e.factura_id && !e.pago_previo)
      await anularPagoFactura({ id: e.factura_id }, e.pago_id, usuario);
    if (e.operacion_id) await anularOperacionDiversa(e.operacion_id, hoyLocalIso());
  }
  await liberarMovimiento(movimiento.id);
}

/** Concilia sin preguntar lo que es seguro: enlaces a cobros o gastos que ya existen con una única
 * coincidencia exacta (sugerenciaAutomatica) y, después, los cobros que casan al céntimo con lo
 * pendiente de una sola factura (conciliarCobrosAutomaticos). Se ejecuta al abrir el CRM y tras
 * importar un OFX. */
export async function conciliarAutomaticos(): Promise<{ conciliados: number; avisos: string[] }> {
  const { data: pendientes, error } = await supabase
    .from('movimientos_banco')
    .select('*')
    .eq('estado', 'Pendiente')
    .order('fecha');
  if (error) throw error;
  let conciliados = 0;
  const avisos: string[] = [];
  const lista = (pendientes ?? []) as MovimientoBanco[];
  if (lista.length > 0) {
    let pagos = await cargarPagosLibres();
    let gastos = await cargarGastosLibres(sumarDiasIso(lista[0].fecha, -60));
    const reglas = await cargarReglas();
    for (const m of lista) {
      const sugerencias =
        m.importe >= 0
          ? sugerirParaCobro(m, pagos, [], reglas)
          : sugerirParaPago(m, gastos, reglas);
      const s = sugerenciaAutomatica(sugerencias);
      if (!s) continue;
      try {
        if (s.tipo === 'pagos') {
          await vincularACobrosExistentes(m, s.pagos);
          const usados = new Set(s.pagos.map((p) => p.id));
          pagos = pagos.filter((p) => !usados.has(p.id));
        } else if (s.tipo === 'gastos') {
          await vincularAGastos(m, s.gastos);
          const usados = new Set(s.gastos.map((g) => g.id));
          gastos = gastos.filter((g) => !usados.has(g.id));
        }
        conciliados++;
      } catch (e) {
        avisos.push(`No se pudo conciliar el movimiento del ${m.fecha}: ${(e as Error).message}`);
      }
    }
  }
  const cobros = await conciliarCobrosAutomaticos();
  return { conciliados: conciliados + cobros.conciliados, avisos: [...avisos, ...cobros.avisos] };
}
