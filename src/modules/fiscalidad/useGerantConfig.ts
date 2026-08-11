import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../hooks/useToast';
import type { GerantConfig } from './types';

export function useGerantConfig() {
  const queryClient = useQueryClient();
  const toast = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ['gerant_config'],
    queryFn: async () => {
      const { data, error } = await supabase.from('gerant_config').select('*').eq('id', 1).single();
      if (error) throw error;
      return data as GerantConfig;
    },
  });

  const mutation = useMutation({
    mutationFn: async (cambios: Partial<GerantConfig>) => {
      const { error } = await supabase.from('gerant_config').update(cambios).eq('id', 1);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['gerant_config'] }),
    onError: (error) => toast.error(error.message),
  });

  return { gerantConfig: data, cargando: isLoading, guardar: mutation.mutate, guardando: mutation.isPending };
}
