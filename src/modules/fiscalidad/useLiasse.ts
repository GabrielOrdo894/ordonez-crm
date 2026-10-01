import { useMemo } from 'react';
import { useComptaFrancia, calcularCompteResultat } from './useComptaFrancia';
import { useEjercicioFiscal } from './useEjercicioFiscal';
import {
  calcularBilanPasivo,
  calcularIS,
  calcularReservaLegal,
  capitauxPropresInferioresMitadCapital,
  deficitArrastrable,
  imputacionMaximaDeficit,
  limitesEjercicio,
} from './calculos';

const PRIMER_EJERCICIO = 2026;

// Liasse y cierre del ejercicio con UNA sola fuente: el libro diario. El IS se calcula sobre el
// résultat comptable del libro (que ya incluye la rémunération y las cotisations registradas en
// Gastos 641/646), y el résultat net y el bilan salen de ahí (auditoría fiscal 2026-09-29).
// Desde 2026-10-01 además: déficits de ejercicios anteriores imputados (art. 209-I CGI), IS ya
// registrado en el libro (OD 695/444) en vez del calculado, report à nouveau en el pasivo y aviso
// de capitaux propres por debajo de la mitad del capital (art. L223-42 Code de commerce).
export function useLiasse(anio: number) {
  const fiscal = useEjercicioFiscal(anio);
  const { compteResultat, bilanActivo, asientosBalance, activos, cargando } = useComptaFrancia(anio);

  return useMemo(() => {
    const ejercicio = limitesEjercicio(anio);
    const resultadosAnteriores: number[] = [];
    for (let a = PRIMER_EJERCICIO; a < anio; a++) {
      const lim = limitesEjercicio(a);
      const delAnio = asientosBalance.filter((x) => x.fecha >= lim.inicio && x.fecha <= lim.fin);
      resultadosAnteriores.push(calcularCompteResultat(delAnio).resultadoAntesIS);
    }
    const deficitPendiente = deficitArrastrable(resultadosAnteriores);
    const deficitImputado = Math.min(deficitPendiente, imputacionMaximaDeficit(compteResultat.resultadoAntesIS));
    const baseImponible = compteResultat.resultadoAntesIS - deficitImputado;

    const is = calcularIS(baseImponible, fiscal.ejercicio.meses, fiscal.config);
    // Si el IS ya se registró en el libro (OD 695/444 al cierre), manda el registrado.
    const isRegistrado = compteResultat.isRegistrado;
    const isDelEjercicio = Math.abs(isRegistrado) >= 0.005 ? isRegistrado : is.total;
    const resultadoNeto = compteResultat.resultadoAntesIS - isDelEjercicio;

    const reservaEnLibro = Math.max(0, -asientosBalance.filter((a) => a.cuenta.startsWith('106')).reduce((s, a) => s + a.debe - a.haber, 0));
    const pasivoPrevio = calcularBilanPasivo(0, calcularReservaLegal(0, fiscal.capitalSocial, fiscal.config), 0, fiscal.capitalSocial, asientosBalance, ejercicio.inicio);
    const reservaLegal = calcularReservaLegal(
      resultadoNeto,
      fiscal.capitalSocial,
      fiscal.config,
      reservaEnLibro || undefined,
      Math.max(0, -pasivoPrevio.reportANouveau),
    );
    const bilanPasivo = calcularBilanPasivo(
      resultadoNeto,
      reservaLegal,
      Math.abs(isRegistrado) >= 0.005 ? 0 : is.total,
      fiscal.capitalSocial,
      asientosBalance,
      ejercicio.inicio,
    );
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
      isRegistrado,
      deficitPendiente,
      deficitImputado,
      baseImponible,
      resultadoNeto,
      reservaLegal,
      capitalSocial: bilanPasivo.capitalSocial,
      capitauxPropresBajos: capitauxPropresInferioresMitadCapital(bilanPasivo.capitauxPropres, bilanPasivo.capitalSocial),
      activos,
      pendienteRegistrar,
      descuadre: bilanActivo.total - bilanPasivo.total,
      cargando,
    };
  }, [anio, compteResultat, bilanActivo, asientosBalance, activos, cargando, fiscal]);
}
