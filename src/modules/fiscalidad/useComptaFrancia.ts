import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { calcularTotales } from '../finanzas/lineas';
import type { Linea } from '../finanzas/lineas';
import { valorNetoContable, type ActivoInmovilizado } from '../../lib/inmovilizado';
import { limitesEjercicio } from './calculos';

export type AsientoContable = { cuenta: string; debe: number; haber: number; fecha?: string };
export type FacturaPendiente = { lineas: Linea[]; monto_pagado: number | null };

// Saldo NETO (debe − haber) de las cuentas que empiecen por alguno de los prefijos — nunca solo un
// lado. Una rectificación inserta su reversa en la MISMA cuenta con debe/haber invertidos, así que
// sumar solo "debe" o solo "haber" cuenta dos veces el importe original y ninguna la reversa (bug
// real encontrado al probar la edición de un gasto ya contabilizado, sesión 2026-08-14).
export function saldoNetoCuentas(asientos: AsientoContable[], prefijos: string[]): number {
  return asientos.filter((a) => prefijos.some((p) => a.cuenta.startsWith(p))).reduce((s, a) => s + (a.debe - a.haber), 0);
}

// Compte de résultat calculado directamente del libro diario (agrupado por prefijo de cuenta PCG)
// — puede diferir ligeramente del "beneficio bruto" aproximado que ya muestra useResultadoEjercicio
// en Fiscalidad, porque ese suma facturas/gastos en bruto y este solo cuenta lo que de verdad tiene
// un asiento contable (p. ej. gastos sin cuenta_contable van a la cuenta de espera 471, no a un
// grupo de gasto real). Se muestra así a propósito, no se oculta la diferencia.
export function calcularCompteResultat(asientos: AsientoContable[]) {
  const saldoNeto = (prefijos: string[]) => saldoNetoCuentas(asientos, prefijos);
  // Cuentas de venta/producto son de saldo acreedor (haber > debe en condiciones normales) — se
  // niega el saldo neto para mostrarlas en positivo. Cuentas de gasto son de saldo deudor, el
  // saldo neto ya sale en positivo directamente.
  const ventas = -saldoNeto(['70']);
  const cargasExplotacion = saldoNeto(['60', '61', '62', '63', '64', '65', '68']);
  const resultadoExplotacion = ventas - cargasExplotacion;
  const productosFinancieros = -saldoNeto(['76']);
  const cargasFinancieras = saldoNeto(['66']);
  const resultadoFinanciero = productosFinancieros - cargasFinancieras;
  const productosExcepcionales = -saldoNeto(['77']);
  const cargasExcepcionales = saldoNeto(['67']);
  const resultadoExcepcional = productosExcepcionales - cargasExcepcionales;
  return {
    ventas,
    cargasExplotacion,
    resultadoExplotacion,
    productosFinancieros,
    cargasFinancieras,
    resultadoFinanciero,
    productosExcepcionales,
    cargasExcepcionales,
    resultadoExcepcional,
    resultadoAntesIS: resultadoExplotacion + resultadoFinanciero + resultadoExcepcional,
  };
}

export function calcularBilanActivo(
  asientos: AsientoContable[],
  facturasPendientes: FacturaPendiente[],
  activos: ActivoInmovilizado[],
  anio: number,
) {
  const tresoreria = saldoNetoCuentas(asientos, ['512']);
  const creancesClients = facturasPendientes.reduce((s, f) => {
    const { totalConIva } = calcularTotales(f.lineas);
    return s + Math.max(0, totalConIva - (f.monto_pagado ?? 0));
  }, 0);
  const inmovilizadoNeto = activos.reduce((s, a) => s + valorNetoContable(a, anio), 0);
  return { tresoreria, creancesClients, inmovilizadoNeto, total: tresoreria + creancesClients + inmovilizadoNeto };
}

export function useComptaFrancia(anio: number) {
  const ejercicio = limitesEjercicio(anio);

  const { data: asientos, isLoading: cargandoAsientos } = useQuery({
    queryKey: ['asientos_contables'],
    queryFn: async () => {
      const { data, error } = await supabase.from('asientos_contables').select('cuenta, debe, haber, fecha');
      if (error) throw error;
      return data as AsientoContable[];
    },
  });

  // El compte de résultat es del EJERCICIO (ventas/cargas del período), no acumulado — sin este
  // filtro, como `asientos_contables` es insert-only y nunca se borra, un ejercicio posterior
  // arrastraría también las ventas/cargas de todos los ejercicios anteriores (bug real, auditoría
  // 2026-08-15). El bilan sí es acumulado por naturaleza (tesorería histórica), por eso
  // `calcularBilanActivo` sigue recibiendo `asientos` sin filtrar, no `asientosEjercicio`.
  const asientosEjercicio = useMemo(
    () => (asientos ?? []).filter((a) => !a.fecha || (a.fecha >= ejercicio.inicio && a.fecha <= ejercicio.fin)),
    [asientos, ejercicio.inicio, ejercicio.fin],
  );

  const { data: facturasPendientes, isLoading: cargandoFacturas } = useQuery({
    queryKey: ['facturas', 'pendientes_francia'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('facturas')
        .select('lineas, monto_pagado')
        .eq('pais', 'Francia')
        .is('eliminado_en', null)
        .neq('estado_cobro', 'Cobrada');
      if (error) throw error;
      return data as FacturaPendiente[];
    },
  });

  const { data: activos, isLoading: cargandoActivos } = useQuery({
    queryKey: ['inmovilizado'],
    queryFn: async () => {
      const { data, error } = await supabase.from('inmovilizado').select('*');
      if (error) throw error;
      return data as ActivoInmovilizado[];
    },
  });

  const compteResultat = useMemo(() => calcularCompteResultat(asientosEjercicio), [asientosEjercicio]);

  const bilanActivo = useMemo(
    () => calcularBilanActivo(asientos ?? [], facturasPendientes ?? [], activos ?? [], anio),
    [asientos, facturasPendientes, activos, anio],
  );

  return { compteResultat, bilanActivo, activos: activos ?? [], cargando: cargandoAsientos || cargandoFacturas || cargandoActivos };
}
