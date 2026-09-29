import { useMemo } from 'react';
import { useComptaFrancia } from './useComptaFrancia';
import { useEjercicioFiscal } from './useEjercicioFiscal';
import { calcularBilanPasivo, calcularIS, calcularReservaLegal } from './calculos';

// Liasse y cierre del ejercicio con UNA sola fuente: el libro diario. El IS se calcula sobre el
// résultat comptable del libro (que ya incluye la rémunération y las cotisations registradas en
// Gastos 641/646), y el résultat net y el bilan salen de ahí — antes el résultat avant IS venía del
// libro pero el IS y el résultat net de una estimación que descontaba una rémunération teórica sin
// asiento, y la liasse no cuadraba consigo misma (auditoría fiscal 2026-09-29).
export function useLiasse(anio: number) {
  const fiscal = useEjercicioFiscal(anio);
  const { compteResultat, bilanActivo, asientosBalance, activos, cargando } = useComptaFrancia(anio);

  return useMemo(() => {
    const is = calcularIS(compteResultat.resultadoAntesIS, fiscal.ejercicio.meses, fiscal.config);
    const resultadoNeto = compteResultat.resultadoAntesIS - is.total;
    const reservaLegal = calcularReservaLegal(resultadoNeto, fiscal.capitalSocial, fiscal.config);
    const bilanPasivo = calcularBilanPasivo(resultadoNeto, reservaLegal, is, fiscal.capitalSocial, asientosBalance);
    // Rémunération y cotisations que según la configuración ya se deberían haber registrado en Gastos
    // (641/646) y todavía no están en el libro — sin ellas el résultat sale inflado.
    const pendienteRegistrar = Math.max(
      0,
      fiscal.remuneracionPeriodo + fiscal.cotisacionesPeriodo - fiscal.remuneracionRegistrada - fiscal.cotisacionesRegistradas,
    );
    return {
      compteResultat,
      bilanActivo,
      bilanPasivo,
      is,
      resultadoNeto,
      reservaLegal,
      capitalSocial: fiscal.capitalSocial,
      activos,
      pendienteRegistrar,
      descuadre: bilanActivo.total - bilanPasivo.total,
      cargando,
    };
  }, [compteResultat, bilanActivo, asientosBalance, activos, cargando, fiscal]);
}
