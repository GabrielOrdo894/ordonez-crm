import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { catalogosVisitasDesde, CATALOGOS_VISITAS_DEFECTO } from './catalogos';

// select('*') a propósito, no select('datos') — ['empresa_config'] es una queryKey compartida por
// varias pantallas con distintos select() (ConfiguracionPage.tsx usa '*'), y Tanstack Query cachea
// por key, no por select; un select más corto aquí arriesgaba el mismo bug de caché ya corregido
// en asientos_contables/Contabilidad (auditoría 2026-08-18).
export function useCatalogosVisitas() {
  const { data } = useQuery({
    queryKey: ['empresa_config'],
    queryFn: async () => {
      const { data, error } = await supabase.from('empresa_config').select('*').eq('id', 1).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const datos = (data?.datos ?? {}) as { visitas_catalogos?: unknown };
  return data ? catalogosVisitasDesde(datos.visitas_catalogos) : CATALOGOS_VISITAS_DEFECTO;
}
