import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../hooks/useToast';
import type { EtiquetaCliente } from './etiquetas';

type FilaEtiqueta = { clave: string; etiqueta: EtiquetaCliente };

// Tabla pequeña (una fila por etiqueta puesta) — se trae entera de una vez, tanto para el listado
// de ClientesPage como para la ficha individual, en vez de una consulta por cliente.
export function useEtiquetasClientes() {
  const toast = useToast();
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ['cliente_etiquetas'],
    queryFn: async () => {
      const { data, error } = await supabase.from('cliente_etiquetas').select('clave, etiqueta');
      if (error) throw error;
      return data as FilaEtiqueta[];
    },
  });

  const porClave = useMemo(() => {
    const map = new Map<string, EtiquetaCliente[]>();
    for (const fila of data ?? []) {
      (map.get(fila.clave) ?? map.set(fila.clave, []).get(fila.clave)!).push(fila.etiqueta);
    }
    return map;
  }, [data]);

  const alternarMutation = useMutation({
    mutationFn: async ({
      clave,
      etiqueta,
      activa,
    }: {
      clave: string;
      etiqueta: EtiquetaCliente;
      activa: boolean;
    }) => {
      if (activa) {
        const { error } = await supabase
          .from('cliente_etiquetas')
          .delete()
          .eq('clave', clave)
          .eq('etiqueta', etiqueta);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('cliente_etiquetas').insert({ clave, etiqueta });
        if (error) throw error;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cliente_etiquetas'] }),
    onError: (error: Error) => toast.error(error.message),
  });

  return {
    etiquetasDe: (clave: string) => porClave.get(clave) ?? [],
    alternar: (clave: string, etiqueta: EtiquetaCliente, activa: boolean) =>
      alternarMutation.mutate({ clave, etiqueta, activa }),
  };
}
