import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../hooks/useToast';
import type { FiscalConfig } from './types';

export function useFiscalConfig() {
  const queryClient = useQueryClient();
  const toast = useToast();

  const { data, isLoading, error } = useQuery({
    queryKey: ['fiscal_config'],
    queryFn: async () => {
      const { data, error } = await supabase.from('fiscal_config').select('*');
      if (error) throw error;
      return data as FiscalConfig[];
    },
  });
  // Si falla, `config(clave, porDefecto)` cae siempre al valor por defecto hardcodeado, sin avisar
  // de que los tipos/umbrales reales de fiscal_config no cargaron (CLAUDE.md: nunca silenciar
  // errores). Tanstack Query v5 quitó `onError` de useQuery, así que se dispara vía efecto.
  useEffect(() => {
    if (error) toast.error(`No se pudo cargar la configuración fiscal: ${error.message}`);
    // toast no es estable entre renders (ver GastoResumen.tsx) — incluirlo repetiría el aviso
    // cada vez que se dispare CUALQUIER toast en la app mientras este error siga activo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);

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
