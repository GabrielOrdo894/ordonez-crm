import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import type { FiscalConfig } from './types';

export function useFiscalConfig() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['fiscal_config'],
    queryFn: async () => {
      const { data, error } = await supabase.from('fiscal_config').select('*');
      if (error) throw error;
      return data as FiscalConfig[];
    },
  });

  const mapa = new Map((data ?? []).map((c) => [c.clave, c.valor]));
  const config = (clave: string, porDefecto: number) => mapa.get(clave) ?? porDefecto;

  const fuentesPorClave = new Map((data ?? []).map((c) => [c.clave, c.fuente]));
  const fuente = (clave: string) => fuentesPorClave.get(clave) || null;

  const guardarMutation = useMutation({
    mutationFn: async (valores: { clave: string; valor: number; descripcion?: string }[]) => {
      const { error } = await supabase.from('fiscal_config').upsert(valores, { onConflict: 'clave' });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['fiscal_config'] }),
  });

  return {
    config,
    fuente,
    cargando: isLoading,
    filas: data ?? [],
    guardar: guardarMutation.mutate,
    guardando: guardarMutation.isPending,
  };
}
