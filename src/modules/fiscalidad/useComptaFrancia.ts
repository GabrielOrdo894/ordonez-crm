import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAsientosContables } from '../contabilidad/useAsientosContables';
import { supabase } from '../../lib/supabase';
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
  // Solo 681 (dotations amortissements d'exploitation) es carga de explotación — 686 (dotations
  // financières) va en cargasFinancieras de abajo, no aquí (bug real corregido 2026-08-31, "68"
  // como prefijo metía las dos cuentas juntas).
  const cargasExplotacion = saldoNeto(['60', '61', '62', '63', '64', '65', '681']);
  const resultadoExplotacion = ventas - cargasExplotacion;
  const productosFinancieros = -saldoNeto(['76']);
  const cargasFinancieras = saldoNeto(['66', '686']);
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

// Bilan desde el libro diario (saldos acumulados hasta el cierre del ejercicio) — antes créances
// clients salía de las facturas pendientes y el pasivo no recogía ni la TVA a pagar, ni los acomptes
// recibidos, ni la cuenta corriente del asociado, así que no cuadraba (auditoría 2026-09-29).
export function calcularBilanActivo(asientos: AsientoContable[], activos: ActivoInmovilizado[], anio: number) {
  const tresoreria = saldoNetoCuentas(asientos, ['512']);
  const creancesClients = Math.max(0, saldoNetoCuentas(asientos, ['411']));
  // TVA: saldo deudor de las cuentas 445 = crédito a favor de la empresa.
  const creditoTva = Math.max(0, saldoNetoCuentas(asientos, ['445']));
  // Un activo dado de baja antes del cierre del ejercicio ya salió del balance (asiento de baja,
  // ver registrarAsientoBajaInmovilizado en asientosContables.ts) — su VNC ya no debe sumar aquí.
  // Antes se seguía sumando valorNetoContable(a, anio), que se queda "congelado" en el valor que
  // tuviera hasta el mes de la baja para siempre (calcularDotacionAnual devuelve 0 en años
  // posteriores, así que amortizacionAcumulada deja de crecer): un activo vendido/desechado
  // aparecía con un VNC fantasma indefinidamente en el Bilan (hallazgo real, auditoría 2026-09-21).
  const inmovilizadoNeto = activos.reduce((s, a) => {
    if (a.dado_de_baja_en && a.dado_de_baja_en <= `${anio}-12-31`) return s;
    return s + valorNetoContable(a, anio);
  }, 0);
  return {
    tresoreria,
    creancesClients,
    creditoTva,
    inmovilizadoNeto,
    total: tresoreria + creancesClients + creditoTva + inmovilizadoNeto,
  };
}

export function useComptaFrancia(anio: number) {
  const ejercicio = limitesEjercicio(anio);

  // Paginado y compartido con el Libro diario/mayor (useAsientosContables).
  const { data: asientos, isLoading: cargandoAsientos } = useAsientosContables();

  // El compte de résultat es del EJERCICIO (ventas/cargas del período), no acumulado — sin este
  // filtro, como `asientos_contables` es insert-only y nunca se borra, un ejercicio posterior
  // arrastraría también las ventas/cargas de todos los ejercicios anteriores (bug real, auditoría
  // 2026-08-15). El bilan sí es acumulado por naturaleza (tesorería histórica), por eso
  // `calcularBilanActivo` sigue recibiendo `asientos` sin filtrar, no `asientosEjercicio`.
  const asientosEjercicio = useMemo(
    () => (asientos ?? []).filter((a) => !a.fecha || (a.fecha >= ejercicio.inicio && a.fecha <= ejercicio.fin)),
    [asientos, ejercicio.inicio, ejercicio.fin],
  );

  const { data: activos, isLoading: cargandoActivos } = useQuery({
    queryKey: ['inmovilizado'],
    queryFn: async () => {
      const { data, error } = await supabase.from('inmovilizado').select('*');
      if (error) throw error;
      return data as ActivoInmovilizado[];
    },
  });

  const compteResultat = useMemo(() => calcularCompteResultat(asientosEjercicio), [asientosEjercicio]);

  // Balance: saldos acumulados hasta el cierre del ejercicio (sin los de años posteriores).
  const asientosBalance = useMemo(() => (asientos ?? []).filter((a) => a.fecha <= ejercicio.fin), [asientos, ejercicio.fin]);

  const bilanActivo = useMemo(() => calcularBilanActivo(asientosBalance, activos ?? [], anio), [asientosBalance, activos, anio]);

  return { compteResultat, bilanActivo, asientosBalance, activos: activos ?? [], cargando: cargandoAsientos || cargandoActivos };
}
