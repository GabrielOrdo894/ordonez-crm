import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { registrarEvento } from './eventos';
import { registrarAsientoFacturaCobro } from './asientosContables';
import { totalConIvaFactura, estadoCobroDePagos } from '../modules/finanzas/facturas/types';
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

/** Facturas que pueden recibir un cobro bancario: ni en papelera ni de la estructura anterior a la
 * EURL (no son ingreso real de la société, ver CLAUDE.md §10). */
export async function facturasPendientesDeCobro(): Promise<Factura[]> {
  const { data, error } = await supabase
    .from('facturas')
    .select('*')
    .is('eliminado_en', null)
    .eq('estructura_anterior', false)
    .in('estado_cobro', ['Pendiente', 'Cobrada parcialmente', 'Vencida'])
    .order('fecha_factura', { ascending: false });
  if (error) throw error;
  return data as Factura[];
}

/** Un movimiento bancario conciliado es un pago real: fila en pagos_factura, campos derivados de
 * la factura recalculados, movimiento marcado Vinculado y, si es de Francia, asiento de cobro. El
 * fallo del asiento no deshace el pago (mismo criterio que RegistrarPagoModal): se devuelve como
 * aviso para enseñarlo al usuario. */
export async function vincularMovimientoAFactura(
  movimiento: Pick<MovimientoBanco, 'id' | 'fecha' | 'importe'>,
  factura: Factura,
  origen: 'manual' | 'automatica',
): Promise<{ pagoId: string; avisoAsiento: string | null }> {
  const { data: nuevoPago, error: errorPago } = await supabase
    .from('pagos_factura')
    .insert({
      factura_id: factura.id,
      fecha: movimiento.fecha,
      monto: movimiento.importe,
      creado_por:
        origen === 'manual' ? 'Conciliación bancaria (OFX)' : 'Conciliación bancaria automática',
    })
    .select()
    .single();
  if (errorPago) throw errorPago;

  const { data: pagosFactura, error: errorPagos } = await supabase
    .from('pagos_factura')
    .select('monto')
    .eq('factura_id', factura.id);
  if (errorPagos) throw errorPagos;
  const totalPagado = Math.round((pagosFactura ?? []).reduce((s, p) => s + p.monto, 0) * 100) / 100;
  const estado_cobro = estadoCobroDePagos(totalPagado, totalConIvaFactura(factura));

  const { error: errorFactura } = await supabase
    .from('facturas')
    .update({ fecha_pago: movimiento.fecha, monto_pagado: totalPagado, estado_cobro })
    .eq('id', factura.id);
  if (errorFactura) throw errorFactura;

  const { error: errorMovimiento } = await supabase
    .from('movimientos_banco')
    .update({ estado: 'Vinculado', factura_id: factura.id, pago_id: nuevoPago.id })
    .eq('id', movimiento.id);
  if (errorMovimiento) throw errorMovimiento;

  await registrarEvento(
    'factura',
    factura.id,
    origen === 'manual'
      ? `Pago de ${formatearPrecio(movimiento.importe)} vinculado desde un movimiento bancario`
      : `Pago de ${formatearPrecio(movimiento.importe)} conciliado automáticamente con el movimiento bancario del ${movimiento.fecha}`,
  );

  let avisoAsiento: string | null = null;
  if (factura.pais === 'Francia' && !factura.estructura_anterior) {
    try {
      await registrarAsientoFacturaCobro(
        { id: factura.id, numero: factura.numero, cliente_nombre: factura.cliente_nombre },
        movimiento.importe,
        movimiento.fecha,
        nuevoPago.id as string,
      );
    } catch (error) {
      avisoAsiento = `Pago vinculado, pero no se pudo registrar en el libro diario: ${(error as Error).message}`;
    }
  }
  return { pagoId: nuevoPago.id as string, avisoAsiento };
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
    const { avisoAsiento } = await vincularMovimientoAFactura(m, factura, 'automatica');
    conciliados++;
    if (avisoAsiento) avisos.push(avisoAsiento);
    // La factura ya ha cambiado (o está cobrada del todo): se relee para el siguiente cobro.
    facturas = await facturasPendientesDeCobro();
  }
  return { conciliados, avisos };
}
