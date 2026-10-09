import { useMemo } from 'react';
import { useFiscalConfig } from './useFiscalConfig';
import { useGerantConfig } from './useGerantConfig';
import { useResultadoEjercicio } from './useResultadoEjercicio';
import { useAsientosContables } from '../contabilidad/useAsientosContables';
import { calcularCompteResultat } from './useComptaFrancia';
import {
  calcularIS,
  calcularReservaLegal,
  calcularTNS,
  deficitArrastrable,
  imputacionMaximaDeficit,
  limitesEjercicio,
  mesesRemuneradosEjercicio,
  mesesTranscurridosEjercicio,
} from './calculos';

const PRIMER_EJERCICIO = 2026;

// Déficit de ejercicios anteriores todavía sin imputar al empezar `anio` (art. 209-I CGI), desde el
// libro. La liasse ya lo aplicaba; TabIS, el Dashboard y las alertas no, y en 2027 habrían dado un
// IS distinto al de la liasse (auditoría fiscal 2026-10-09).
export function useDeficitAnterior(anio: number) {
  const { data: asientos } = useAsientosContables();
  return useMemo(() => {
    const resultados: number[] = [];
    for (let a = PRIMER_EJERCICIO; a < anio; a++) {
      const lim = limitesEjercicio(a);
      resultados.push(calcularCompteResultat((asientos ?? []).filter((x) => x.fecha >= lim.inicio && x.fecha <= lim.fin)).resultadoAntesIS);
    }
    return deficitArrastrable(resultados);
  }, [asientos, anio]);
}

// Cadena de cálculo del ejercicio (rémunération del gérant → sus cotisations TNS → beneficio neto
// imponible → Impôt sur les Sociétés → resultado neto → reserva legal obligatoria) usada, antes de
// este hook, de forma casi idéntica en DashboardFiscal/TabIS/TabCierreEjercicio/TabLiasseFiscale —
// una sola fuente de verdad para que el prorrateo por meses transcurridos (bug real, corregido
// 2026-08-11/15 por separado en cada sitio) no pueda volver a divergir entre pestañas.
export function useEjercicioFiscal(anio: number = new Date().getFullYear()) {
  const ejercicio = limitesEjercicio(anio);
  const { config, fuente } = useFiscalConfig();
  const { gerantConfig } = useGerantConfig();
  const { ingresosHT, beneficioBruto, remuneracionRegistrada, cotisacionesRegistradas } = useResultadoEjercicio(ejercicio.inicio, ejercicio.fin);

  const mesesTranscurridos = useMemo(() => mesesTranscurridosEjercicio(ejercicio), [ejercicio]);

  const capitalSocial = gerantConfig?.capital_social ?? 1000;
  const compteCourantMedio = gerantConfig?.compte_courant_medio ?? 0;
  const remuneracionAnual = gerantConfig?.remuneracion_anual ?? 0;

  // La rémunération empieza en remuneracion_desde (octubre de 2026, decisión de Gabriel
  // 2026-09-29): solo cuentan los meses desde entonces. Si ya está registrada en el libro (Gastos
  // 641/646), manda lo registrado; si no, se estima con la configurada.
  const mesesRemunerados = useMemo(
    () => mesesRemuneradosEjercicio(ejercicio, gerantConfig?.remuneracion_desde ?? null),
    [ejercicio, gerantConfig?.remuneracion_desde],
  );
  const tns = calcularTNS(remuneracionAnual, config);
  const deficitAnterior = useDeficitAnterior(anio);
  const remuneracionPeriodo = remuneracionRegistrada > 0 ? remuneracionRegistrada : remuneracionAnual * (mesesRemunerados / 12);
  const cotisacionesPeriodo = cotisacionesRegistradas > 0 ? cotisacionesRegistradas : tns.total * (mesesRemunerados / 12);
  // Sin Math.max(0, ...) aquí a propósito (bug real corregido 2026-08-18): un ejercicio con
  // pérdidas reales debe poder mostrar un resultado negativo en la Liasse Fiscale y el bilan, no
  // esconderse como 0€. calcularIS/calcularReservaLegal ya floorean su propia base imponible a 0
  // internamente, así que pasarles un beneficio negativo es seguro y no genera IS ni reserva legal
  // negativos.
  const beneficioNeto = beneficioBruto - remuneracionPeriodo - cotisacionesPeriodo;
  const deficitImputado = Math.min(deficitAnterior, imputacionMaximaDeficit(beneficioNeto));
  const is = calcularIS(beneficioNeto - deficitImputado, ejercicio.meses, config);
  const resultadoNeto = beneficioNeto - is.total;
  const reservaLegal = calcularReservaLegal(resultadoNeto, capitalSocial, config);

  return {
    ejercicio,
    mesesTranscurridos,
    config,
    fuente,
    gerantConfig,
    capitalSocial,
    compteCourantMedio,
    remuneracionAnual,
    ingresosHT,
    beneficioBruto,
    remuneracionPeriodo,
    mesesRemunerados,
    remuneracionRegistrada,
    cotisacionesRegistradas,
    tns,
    cotisacionesPeriodo,
    beneficioNeto,
    deficitImputado,
    is,
    resultadoNeto,
    reservaLegal,
  };
}
