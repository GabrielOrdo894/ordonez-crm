import { useMemo } from 'react';
import { useAsientosContables } from '../contabilidad/useAsientosContables';
import { calcularTNS, type ConfigFn } from './calculos';
import { saldoNetoCuentas } from './useComptaFrancia';

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const CUENTAS_GERANTE_E_IS = ['641', '645', '646', '695'];

function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Beneficio imponible acumulado mes a mes del ejercicio, desde el libro diario (misma fuente que
// useResultadoEjercicio y la liasse — ya sin acomptes como venta, sin estructura_anterior ni gastos
// pendientes; auditoría 2026-09-29). La rémunération y las cotisations del gérant se descuentan desde
// `remuneracionDesde` (octubre de 2026) o, si ya están registradas en el libro (641/646), por su
// importe real.
export function useEvolucionAcumulada(
  anio: number,
  ejercicio: { inicio: string; fin: string; meses: number },
  remuneracionAnual: number,
  config: ConfigFn,
  remuneracionDesde: string | null = null,
) {
  const { data: asientos } = useAsientosContables();

  return useMemo(() => {
    const mesInicio = new Date(`${ejercicio.inicio}T00:00:00`).getMonth();
    const remuneracionMensual = remuneracionAnual / 12;
    const cotisacionesMensual = calcularTNS(remuneracionAnual, config).total / 12;
    let acumulado = 0;
    return Array.from({ length: ejercicio.meses }, (_, i) => {
      const mesIndex = mesInicio + i;
      const desde = iso(new Date(anio, mesIndex, 1));
      const hasta = iso(new Date(anio, mesIndex + 1, 0));
      const delMes = (asientos ?? []).filter((a) => a.fecha >= desde && a.fecha <= hasta);
      const ingresos = -saldoNetoCuentas(delMes, ['7']);
      const cargas = saldoNetoCuentas(delMes, ['6']) - saldoNetoCuentas(delMes, CUENTAS_GERANTE_E_IS);
      const remuneracionRegistrada = saldoNetoCuentas(delMes, ['641']) + saldoNetoCuentas(delMes, ['645', '646']);
      const cobraEsteMes = !remuneracionDesde || hasta >= remuneracionDesde;
      const remuneracion = remuneracionRegistrada > 0 ? remuneracionRegistrada : cobraEsteMes ? remuneracionMensual + cotisacionesMensual : 0;
      acumulado += ingresos - cargas - remuneracion;
      return { mes: MESES[mesIndex], beneficioNetoAcumulado: Math.max(0, acumulado) };
    });
  }, [asientos, anio, ejercicio, remuneracionAnual, config, remuneracionDesde]);
}
