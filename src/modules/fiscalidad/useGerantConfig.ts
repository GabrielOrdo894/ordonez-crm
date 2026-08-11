import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../hooks/useToast';
import type { GerantConfig } from './types';

export function useGerantConfig() {
  const queryClient = useQueryClient();
  const toast = useToast();

  const { data, isLoading, error } = useQuery({
    queryKey: ['gerant_config'],
    queryFn: async () => {
      const { data, error } = await supabase.from('gerant_config').select('*').eq('id', 1).single();
      if (error) throw error;
      return data as GerantConfig;
    },
  });
  // Si falla, `data` queda undefined y los `?? 0` de los consumidores (capital social,
  // rémunération...) lo esconden mostrando 0 € como si no hubiera nada que declarar, en vez de
  // avisar — contra la regla del proyecto (CLAUDE.md: nunca silenciar errores). Tanstack Query v5
  // quitó `onError` de useQuery, así que se dispara aquí vía efecto.
  useEffect(() => {
    if (error) toast.error(`No se pudo cargar la configuración del gérant: ${error.message}`);
    // toast no es estable entre renders (ver GastoResumen.tsx) — incluirlo repetiría el aviso
    // cada vez que se dispare CUALQUIER toast en la app mientras este error siga activo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);

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
