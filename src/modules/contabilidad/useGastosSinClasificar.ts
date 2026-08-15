import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';

// Aviso compartido entre LibroDiarioPage y LibroMayorPage: gastos de Francia sin cuenta_contable
// asignada caen en la cuenta de espera 471 del libro diario en vez de su cuenta real — no se
// pierden, pero conviene clasificarlos. Ver plan "Contabilidad francesa — Libro diario y mayor".
export function useGastosSinClasificar() {
  const { data: total } = useQuery({
    queryKey: ['gastos', 'sin_clasificar', 'francia'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('gastos')
        .select('id', { count: 'exact', head: true })
        .eq('pais', 'Francia')
        .is('cuenta_contable', null);
      if (error) throw error;
      return count ?? 0;
    },
  });

  if (!total) return { mensaje: null };
  return {
    mensaje: `${total} gasto${total === 1 ? '' : 's'} de Francia sin cuenta contable asignada — quedan en la cuenta de espera 471 del libro diario.`,
  };
}
