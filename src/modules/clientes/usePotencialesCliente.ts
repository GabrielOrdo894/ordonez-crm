import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { agruparPotenciales } from './types';
import type {
  Cliente,
  ClientePotencial,
  OrientativoPotencialRow,
  SolicitudPotencialRow,
} from './types';

// Combina solicitudes (sin descartar) y presupuestos orientativos aún sin cliente real en la
// misma lista de "potenciales" que usa SelectorClienteInline, excluyendo a quien ya es cliente
// real (mismo teléfono/email en `clientesReales`) para no mostrar duplicados.
export function usePotencialesCliente(
  clientesReales: Cliente[],
  enabled: boolean = true,
): ClientePotencial[] {
  const { data: solicitudes } = useQuery({
    queryKey: ['solicitudes', 'potenciales'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('solicitudes')
        .select('id, nombre, telefono, email, idioma, tipo_reforma, estado')
        .neq('estado', 'Descartada');
      if (error) throw error;
      return data as SolicitudPotencialRow[];
    },
    enabled,
  });

  const { data: orientativos } = useQuery({
    queryKey: ['presupuestos', 'orientativos-sin-cliente'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('presupuestos')
        .select('id, cliente_nombre, cliente_tel, cliente_email, idioma, numero')
        .eq('tipo', 'orientativo')
        .is('visita_id', null)
        .is('eliminado_en', null);
      if (error) throw error;
      return data as OrientativoPotencialRow[];
    },
    enabled,
  });

  return useMemo(
    () => agruparPotenciales(solicitudes ?? [], orientativos ?? [], clientesReales),
    [solicitudes, orientativos, clientesReales],
  );
}
