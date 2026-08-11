import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../hooks/useToast';
import type { EcheanceFiscal, NuevaEcheance } from './types';

export function useEcheances() {
  const queryClient = useQueryClient();
  const toast = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ['echeances_fiscales'],
    queryFn: async () => {
      const { data, error } = await supabase.from('echeances_fiscales').select('*').order('fecha_limite');
      if (error) throw error;
      return data as EcheanceFiscal[];
    },
  });

  const generar = useMutation({
    mutationFn: async (nuevas: NuevaEcheance[]) => {
      const { error } = await supabase.from('echeances_fiscales').insert(nuevas);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['echeances_fiscales'] });
      toast.success('Calendario fiscal generado');
    },
    onError: (error) => toast.error(error.message),
  });

  const marcarCompletada = useMutation({
    mutationFn: async ({ id, completada }: { id: string; completada: boolean }) => {
      const { error } = await supabase
        .from('echeances_fiscales')
        .update({ completada, completada_at: completada ? new Date().toISOString() : null })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['echeances_fiscales'] }),
    onError: (error) => toast.error(error.message),
  });

  return {
    echeances: data ?? [],
    cargando: isLoading,
    generar: generar.mutate,
    generando: generar.isPending,
    marcarCompletada: marcarCompletada.mutate,
  };
}
