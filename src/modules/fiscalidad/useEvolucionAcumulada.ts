import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { calcularTotales } from '../finanzas/lineas';
import type { Factura } from '../finanzas/facturas/types';
import type { Gasto } from '../finanzas/gastos/types';
import { calcularTNS, type ConfigFn } from './calculos';

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Solo Francia, mismo motivo que useResultadoEjercicio: el IS se calcula únicamente
// sobre la actividad francesa. Beneficio imponible acumulado (no ingresos brutos),
// porque el umbral de tramo del IS se aplica sobre el beneficio, no sobre la facturación.
export function useEvolucionAcumulada(
  anio: number,
  ejercicio: { inicio: string; fin: string; meses: number },
  remuneracionAnual: number,
  config: ConfigFn,
) {
  // Filtrado a nivel de query (país + rango del ejercicio) en vez de traer la tabla entera y
  // filtrar en JS — antes esta query compartía cache con el `['facturas']`/`['gastos']` sin
  // filtrar de useResultadoEjercicio.ts (mismo dataset completo), así que no costaba una petición
  // aparte; ahora es una query más pequeña y con su propia key, más barata a medida que crezcan
  // los datos de varios ejercicios (auditoría 2026-08-15).
  const { data: facturas } = useQuery({
    queryKey: ['facturas', 'francia', ejercicio.inicio, ejercicio.fin],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('facturas')
        .select('*')
        .is('eliminado_en', null)
        .eq('pais', 'Francia')
        .gte('fecha_factura', ejercicio.inicio)
        .lte('fecha_factura', ejercicio.fin);
      if (error) throw error;
      return data as Factura[];
    },
  });
  const { data: gastos } = useQuery({
    queryKey: ['gastos', 'francia', ejercicio.inicio, ejercicio.fin],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('gastos')
        .select('*')
        .eq('pais', 'Francia')
        .gte('fecha', ejercicio.inicio)
        .lte('fecha', ejercicio.fin);
      if (error) throw error;
      return data as Gasto[];
    },
  });

  return useMemo(() => {
    const mesInicio = new Date(`${ejercicio.inicio}T00:00:00`).getMonth();
    const remuneracionMensual = remuneracionAnual / 12;
    const cotisacionesMensual = calcularTNS(remuneracionAnual, config).total / 12;
    let acumIngresos = 0;
    let acumGastos = 0;
    return Array.from({ length: ejercicio.meses }, (_, i) => {
      const mesIndex = mesInicio + i;
      const desde = iso(new Date(anio, mesIndex, 1));
      const hasta = iso(new Date(anio, mesIndex + 1, 0));
      // pais ya viene filtrado por la query — solo queda acotar el mes dentro del ejercicio ya traído.
      const ingresosMes = (facturas ?? [])
        .filter((f) => f.fecha_factura && f.fecha_factura >= desde && f.fecha_factura <= hasta)
        .reduce((s, f) => s + calcularTotales(f.lineas).totalSinIva, 0);
      const gastosMes = (gastos ?? [])
        .filter((g) => g.fecha && g.fecha >= desde && g.fecha <= hasta)
        .reduce((s, g) => s + (g.importe_base ?? 0), 0);
      acumIngresos += ingresosMes;
      acumGastos += gastosMes;
      const beneficioNetoAcumulado = Math.max(
        0,
        acumIngresos - acumGastos - remuneracionMensual * (i + 1) - cotisacionesMensual * (i + 1),
      );
      return { mes: MESES[mesIndex], beneficioNetoAcumulado };
    });
  }, [facturas, gastos, anio, ejercicio, remuneracionAnual, config]);
}
