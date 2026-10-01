import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { registrarEvento } from './eventos';
import { registrarPagoFactura, anularPagoFactura } from './pagosFactura';
import { totalConIvaFactura } from '../modules/finanzas/facturas/types';
import type { Factura } from '../modules/finanzas/facturas/types';
import type { MovimientoBanco } from '../modules/contabilidad/types';
import { formatearPrecio } from '../modules/finanzas/lineas';

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
  if (factura.tipo === 'rectificativa') throw new Error('Un cobro no se puede vincular a una factura rectificativa.');
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
  if (!reservado || reservado.length === 0) throw new Error('Este movimiento ya se ha vinculado desde otra sesión.');

  let pagoId: string;
  try {
    const { pago } = await registrarPagoFactura(factura, {
      fecha: movimiento.fecha,
      importe: movimiento.importe,
      creadoPor: origen === 'manual' ? 'Conciliación bancaria (OFX)' : 'Conciliación bancaria automática',
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
