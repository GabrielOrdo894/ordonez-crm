import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { calcularTotales } from '../finanzas/lineas';
import type { Factura } from '../finanzas/facturas/types';
import type { Gasto } from '../finanzas/gastos/types';

export function useResultadoEjercicio(desde: string, hasta: string) {
  const { data: facturas, isLoading: cargandoFacturas } = useQuery({
    queryKey: ['facturas'],
    queryFn: async () => {
      const { data, error } = await supabase.from('facturas').select('*').is('eliminado_en', null);
      if (error) throw error;
      return data as Factura[];
    },
  });

  const { data: gastos, isLoading: cargandoGastos } = useQuery({
    queryKey: ['gastos'],
    queryFn: async () => {
      const { data, error } = await supabase.from('gastos').select('*');
      if (error) throw error;
      return data as Gasto[];
    },
  });

  // Solo Francia: la EURL declara el Impôt sur les Sociétés únicamente sobre la actividad
  // francesa, así que todo lo fiscal (IS, cotisations, salario/dividendos, alertas de tramo)
  // debe ignorar las facturas/gastos de España. Se filtra aquí en memoria, no en la query
  // Supabase — 'facturas'/'gastos' son las mismas claves de caché que usan Facturas/Gastos
  // (que sí necesitan ver los dos países), así que filtrar en la query rompería esas páginas.
  const facturasPeriodo = (facturas ?? []).filter(
    (f) => f.pais === 'Francia' && f.fecha_factura && f.fecha_factura >= desde && f.fecha_factura <= hasta,
  );
  const gastosPeriodo = (gastos ?? []).filter(
    (g) => g.pais === 'Francia' && g.fecha && g.fecha >= desde && g.fecha <= hasta,
  );

  const ingresosHT = facturasPeriodo.reduce((s, f) => s + calcularTotales(f.lineas).totalSinIva, 0);
  const gastosHT = gastosPeriodo.reduce((s, g) => s + (g.importe_base ?? 0), 0);

  return {
    ingresosHT,
    gastosHT,
    beneficioBruto: ingresosHT - gastosHT,
    cargando: cargandoFacturas || cargandoGastos,
  };
}
