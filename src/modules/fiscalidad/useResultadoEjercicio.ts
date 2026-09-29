import { useMemo } from 'react';
import { useAsientosContables } from '../contabilidad/useAsientosContables';
import { saldoNetoCuentas } from './useComptaFrancia';

// Cuentas que la cadena fiscal trata aparte (useEjercicioFiscal): rémunération del gérant (641),
// cargas sociales (645/646) e impôt sur les sociétés (695). Quedan fuera del "beneficio bruto" para
// no restarlas dos veces cuando ya estén registradas en el libro.
const CUENTAS_GERANTE_E_IS = ['641', '645', '646', '695'];

// Resultado del período DESDE EL LIBRO DIARIO (2026-09-29) — la misma fuente que el compte de
// résultat de la liasse. Antes se sumaban facturas y gastos en bruto por fecha, lo que:
// - contaba los acomptes como venta (ahora van a 4191 hasta la factura final),
// - deducía entera la compra de un inmovilizado (en el libro va al activo y se amortiza),
// - contaba gastos pendientes de revisar (sin asiento),
// y hacía que el IS y la liasse no cuadraran entre sí (auditoría fiscal 2026-09-29).
// Solo Francia y sin estructura_anterior: el libro diario ya solo recoge eso.
export function useResultadoEjercicio(desde: string, hasta: string) {
  const { data: asientos, isLoading } = useAsientosContables();

  return useMemo(() => {
    const periodo = (asientos ?? []).filter((a) => a.fecha >= desde && a.fecha <= hasta);
    const ingresosHT = -saldoNetoCuentas(periodo, ['7']);
    const cargasTotales = saldoNetoCuentas(periodo, ['6']);
    const cargasGerenteEIs = saldoNetoCuentas(periodo, CUENTAS_GERANTE_E_IS);
    const gastosHT = cargasTotales - cargasGerenteEIs;
    return {
      ingresosHT,
      gastosHT,
      beneficioBruto: ingresosHT - gastosHT,
      // Lo ya registrado en el libro en el período (Gastos con cuenta 641/646).
      remuneracionRegistrada: saldoNetoCuentas(periodo, ['641']),
      cotisacionesRegistradas: saldoNetoCuentas(periodo, ['645', '646']),
      cargando: isLoading,
    };
  }, [asientos, desde, hasta, isLoading]);
}
