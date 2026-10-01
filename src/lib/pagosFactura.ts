import { supabase } from './supabase';
import { rectificarAsientos, registrarAsientoFacturaEmision, registrarAsientoFacturaCobro } from './asientosContables';
import { hoyLocalIso } from './fechas';
import { totalConIvaFactura, estadoCobroDePagos } from '../modules/finanzas/facturas/types';
import type { Factura, PagoFactura } from '../modules/finanzas/facturas/types';
import type { Linea } from '../modules/finanzas/lineas';
import { formatearPrecio } from '../modules/finanzas/lineas';

// Único punto de la lógica de pagos de facturas (auditoría 2026-10-01): antes el registro, la baja
// y el recálculo de monto_pagado/fecha_pago/estado_cobro estaban copiados en RegistrarPagoModal,
// BancoPage, conciliacionBancaria y aquí, cada uno con su variante.
//
// Un pago nunca se borra: asientos_contables.pago_id y movimientos_banco.pago_id lo referencian, así
// que se anula (anulado_en). Todas las lecturas de pagos_factura filtran anulado_en is null.

type FacturaContable = Pick<Factura, 'id' | 'numero' | 'cliente_nombre' | 'tipo' | 'tipo_iva' | 'pais' | 'estructura_anterior'>;

function vaAlLibro(f: Pick<Factura, 'pais' | 'estructura_anterior'>) {
  return f.pais === 'Francia' && !f.estructura_anterior;
}

export async function pagosActivosDe(facturaId: string): Promise<PagoFactura[]> {
  const { data, error } = await supabase
    .from('pagos_factura')
    .select('*')
    .eq('factura_id', facturaId)
    .is('anulado_en', null)
    .order('fecha', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((p) => ({ ...p, monto: Number(p.monto) })) as PagoFactura[];
}

// Recalcula los campos derivados de la factura desde sus pagos activos, leídos de la base de datos
// (nunca de una caché del navegador que puede estar desfasada).
export async function recalcularCobroFactura(facturaId: string) {
  const { data: factura, error } = await supabase
    .from('facturas')
    .select('id, lineas, tipo, fecha_vence')
    .eq('id', facturaId)
    .single();
  if (error) throw error;
  const pagos = await pagosActivosDe(facturaId);
  const totalPagado = Math.round(pagos.reduce((s, p) => s + p.monto, 0) * 100) / 100;
  const estado_cobro = estadoCobroDePagos(totalPagado, totalConIvaFactura(factura as { lineas: Linea[] }), {
    tipo: factura.tipo,
    fechaVence: factura.fecha_vence,
    hoy: hoyLocalIso(),
  });
  const ultimaFecha = pagos.reduce<string | null>((max, p) => (!max || p.fecha > max ? p.fecha : max), null);
  const { error: errorUpdate } = await supabase
    .from('facturas')
    .update({ monto_pagado: totalPagado !== 0 ? totalPagado : null, fecha_pago: ultimaFecha, estado_cobro })
    .eq('id', facturaId);
  if (errorUpdate) throw errorUpdate;
  return { totalPagado, estado_cobro };
}

// Lo que falta por cobrar (o, en una rectificativa, por reembolsar), en valor absoluto.
export async function pendienteDeFactura(factura: Pick<Factura, 'id' | 'lineas'>): Promise<number> {
  const pagos = await pagosActivosDe(factura.id);
  const pagado = Math.abs(pagos.reduce((s, p) => s + p.monto, 0));
  return Math.max(0, Math.round((Math.abs(totalConIvaFactura(factura)) - pagado) * 100) / 100);
}

// Registra un pago (o el reembolso de una rectificativa: importe positivo que se guarda en
// negativo) con su asiento. Si el asiento falla, el pago se anula y se lanza el error: nunca queda
// un cobro sin asiento (así se perdió el de AC-2026-0021). Lo accesorio (notas, embudo) es cosa de
// quien llama, después de esto.
export async function registrarPagoFactura(
  factura: FacturaContable & Pick<Factura, 'lineas'>,
  datos: { fecha: string; importe: number; creadoPor: string },
): Promise<{ pago: PagoFactura; estado_cobro: string }> {
  if (!(datos.importe > 0)) throw new Error('El importe debe ser mayor que 0.');
  if (!datos.fecha) throw new Error('Falta la fecha del pago.');
  const pendiente = await pendienteDeFactura(factura);
  if (datos.importe > pendiente + 0.005) {
    throw new Error(
      factura.tipo === 'rectificativa'
        ? `El reembolso (${formatearPrecio(datos.importe)}) supera lo pendiente de reembolsar (${formatearPrecio(pendiente)}).`
        : `El pago (${formatearPrecio(datos.importe)}) supera lo pendiente de cobro (${formatearPrecio(pendiente)}).`,
    );
  }
  const monto = factura.tipo === 'rectificativa' ? -datos.importe : datos.importe;
  const { data: pago, error } = await supabase
    .from('pagos_factura')
    .insert({ factura_id: factura.id, fecha: datos.fecha, monto, creado_por: datos.creadoPor })
    .select()
    .single();
  if (error) throw error;

  if (vaAlLibro(factura)) {
    try {
      await registrarAsientoFacturaCobro(factura, monto, datos.fecha, pago.id);
    } catch (errorAsiento) {
      const { error: errorAnular } = await supabase
        .from('pagos_factura')
        .update({ anulado_en: new Date().toISOString(), anulado_por: 'Sistema (fallo del asiento contable)' })
        .eq('id', pago.id);
      if (errorAnular) {
        throw new Error(
          `El pago se guardó pero su asiento contable falló y no se pudo anular: ${(errorAnular as Error).message}. Revisa la factura ${factura.numero}.`,
        );
      }
      throw new Error(`No se ha registrado el pago: falló el asiento contable (${(errorAsiento as Error).message}).`);
    }
  }
  const { estado_cobro } = await recalcularCobroFactura(factura.id);
  return { pago: { ...pago, monto: Number(pago.monto) } as PagoFactura, estado_cobro };
}

// Anula un pago: primero la reversa de su asiento (idempotente por saldo neto), luego la marca de
// anulado y por último suelta el movimiento bancario que lo creó. Cada paso se puede repetir sin
// efectos dobles, así que un fallo a medias se arregla reintentando.
export async function anularPagoFactura(factura: Pick<Factura, 'id'>, pagoId: string, anuladoPor: string) {
  await rectificarAsientos('factura', factura.id, 'cobro', pagoId);
  const { error } = await supabase
    .from('pagos_factura')
    .update({ anulado_en: new Date().toISOString(), anulado_por: anuladoPor })
    .eq('id', pagoId)
    .is('anulado_en', null);
  if (error) throw error;
  const { error: errorMovimiento } = await supabase
    .from('movimientos_banco')
    .update({ estado: 'Pendiente', factura_id: null, pago_id: null })
    .eq('pago_id', pagoId);
  if (errorMovimiento) throw errorMovimiento;
  return recalcularCobroFactura(factura.id);
}

// Anula todos los pagos activos de una o varias facturas.
export async function vaciarPagosFactura(ids: string[], anuladoPor: string) {
  for (const id of ids) {
    const pagos = await pagosActivosDe(id);
    for (const p of pagos) await anularPagoFactura({ id }, p.id, anuladoPor);
    if (pagos.length === 0) await recalcularCobroFactura(id);
  }
}

// Anula lo que siga vivo (saldo neto) de un evento de una factura. Sin filtro de país ni de
// estructura_anterior desde 2026-09-29: con la anulación por saldo neto no inserta nada si no hay
// saldo, y así también limpia una factura que se contabilizó y luego pasó a España o a
// estructura_anterior.
export async function rectificarAsientosFacturaSiHaceFalta(f: Pick<Factura, 'id'>, evento: 'creacion' | 'cobro') {
  await rectificarAsientos('factura', f.id, evento);
}

// Tipo de la factura que corrige una rectificativa (una rectificativa de un acompte anula anticipo
// en 4191, no venta).
async function tipoFacturaOriginal(f: Pick<Factura, 'tipo' | 'factura_original_id'>): Promise<string | null> {
  if (f.tipo !== 'rectificativa' || !f.factura_original_id) return null;
  const { data, error } = await supabase.from('facturas').select('tipo').eq('id', f.factura_original_id).single();
  if (error) throw error;
  return data.tipo as string;
}

// Deja la contabilidad de una factura exactamente como dicen sus datos actuales: anula emisión y
// cobros vivos y, si es de Francia y no estructura_anterior, vuelve a registrar la emisión y un
// cobro por cada pago activo. Se usa al crearla y al restaurarla de la papelera.
export async function recontabilizarFactura(
  f: Pick<
    Factura,
    'id' | 'numero' | 'cliente_nombre' | 'fecha_factura' | 'lineas' | 'tipo' | 'tipo_iva' | 'pais' | 'estructura_anterior'
  > &
    Partial<Pick<Factura, 'factura_original_id' | 'fraccion_tva_exigible'>>,
) {
  await rectificarAsientos('factura', f.id, 'creacion');
  await rectificarAsientos('factura', f.id, 'cobro');
  if (!vaAlLibro(f)) return;
  await registrarAsientoFacturaEmision({
    id: f.id,
    numero: f.numero,
    cliente_nombre: f.cliente_nombre,
    fecha_factura: f.fecha_factura,
    lineas: f.lineas,
    tipo: f.tipo,
    tipo_original: await tipoFacturaOriginal({ tipo: f.tipo, factura_original_id: f.factura_original_id ?? null }),
    fraccion_tva_exigible: f.fraccion_tva_exigible ?? null,
  });
  for (const pago of await pagosActivosDe(f.id)) {
    await registrarAsientoFacturaCobro(f, pago.monto, pago.fecha, pago.id);
  }
}

// Acomptes ya facturados de un presupuesto, más las rectificativas que los anularon (con sus
// líneas negativas) — base de la deducción de la factura final. Cada uno con su estructura_anterior.
export async function cargarAcomptesDeducibles(
  presupuestoId: string,
  excluirFacturaId: string | null,
): Promise<{ numero: string | null; lineas: Linea[]; estructura_anterior: boolean }[]> {
  const { data: acomptes, error } = await supabase
    .from('facturas')
    .select('id, numero, lineas, estructura_anterior')
    .eq('presupuesto_id', presupuestoId)
    .eq('tipo', 'acompte')
    .neq('id', excluirFacturaId ?? '00000000-0000-0000-0000-000000000000')
    .is('eliminado_en', null);
  if (error) throw error;
  if (!acomptes || acomptes.length === 0) return [];
  const { data: rectificativas, error: errorRect } = await supabase
    .from('facturas')
    .select('numero, lineas, estructura_anterior')
    .eq('tipo', 'rectificativa')
    .in(
      'factura_original_id',
      acomptes.map((a) => a.id),
    )
    .is('eliminado_en', null);
  if (errorRect) throw errorRect;
  return [...acomptes, ...(rectificativas ?? [])].map((d) => ({
    numero: d.numero as string | null,
    lineas: (d.lineas ?? []) as Linea[],
    estructura_anterior: !!d.estructura_anterior,
  }));
}
