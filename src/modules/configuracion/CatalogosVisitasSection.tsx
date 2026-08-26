import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../hooks/useToast';
import { useAuth } from '../../hooks/useAuth';
import { useHidratarUnaVez } from '../../hooks/useHidratarUnaVez';
import { guardarConfigDatos } from '../../lib/empresaConfig';
import { notificarCambioConfig } from '../../lib/notificaciones';
import { catalogosVisitasDesde, type CatalogosVisitas } from '../visitas/catalogos';
import { Button } from '../../components/ui/Button';
import { CampoLista } from './CampoLista';

export function CatalogosVisitasSection() {
  const toast = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Misma queryKey/select que ConfiguracionPage.tsx y useCatalogosVisitas.ts a propósito —
  // ['empresa_config'] es una key compartida por varias pantallas, y un select más corto aquí
  // arriesgaba el mismo bug de caché ya corregido en asientos_contables (auditoría 2026-08-18).
  const { data: config, error: errorConfig } = useQuery({
    queryKey: ['empresa_config'],
    queryFn: async () => {
      const { data, error } = await supabase.from('empresa_config').select('*').eq('id', 1).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  useEffect(() => {
    if (errorConfig) toast.error(`No se pudieron cargar los catálogos de Visitas: ${errorConfig.message}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [errorConfig]);

  const [zonasEs, setZonasEs] = useState<string[]>([]);
  const [zonasFr, setZonasFr] = useState<string[]>([]);
  const [tiposReforma, setTiposReforma] = useState<string[]>([]);
  const [empleados, setEmpleados] = useState<string[]>([]);
  const [horasHabituales, setHorasHabituales] = useState<string[]>([]);
  const [horasSabado, setHorasSabado] = useState<string[]>([]);

  useHidratarUnaVez(config, (config) => {
    const catalogos = catalogosVisitasDesde((config.datos as { visitas_catalogos?: unknown } | null)?.visitas_catalogos);
    setZonasEs(catalogos.zonasEs);
    setZonasFr(catalogos.zonasFr);
    setTiposReforma(catalogos.tiposReforma);
    setEmpleados(catalogos.empleados);
    setHorasHabituales(catalogos.horasHabituales);
    setHorasSabado(catalogos.horasSabado);
  });

  const guardarMutation = useMutation({
    mutationFn: async () => {
      const limpiar = (arr: string[]) => arr.map((v) => v.trim()).filter(Boolean);
      const nuevo: CatalogosVisitas = {
        zonasEs: limpiar(zonasEs),
        zonasFr: limpiar(zonasFr),
        tiposReforma: limpiar(tiposReforma),
        empleados: limpiar(empleados),
        horasHabituales: limpiar(horasHabituales),
        horasSabado: limpiar(horasSabado),
      };
      const vacio = (Object.entries(nuevo) as [string, string[]][]).find(([, lista]) => lista.length === 0);
      if (vacio) throw new Error(`"${vacio[0]}" no puede quedarse sin ninguna opción — añade al menos una o deja las anteriores.`);
      await guardarConfigDatos({ visitas_catalogos: nuevo });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['empresa_config'] });
      toast.success('Catálogos de Visitas guardados');
      notificarCambioConfig(user, 'actualizó los catálogos de Visitas en Configuración.');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <section className="bg-surface border border-gray-200 rounded-sm p-4">
      <div className="flex items-center justify-between border-b border-gray-200 pb-2 mb-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Catálogos de Visitas</p>
        <Button size="sm" onClick={() => guardarMutation.mutate()} disabled={guardarMutation.isPending}>
          {guardarMutation.isPending ? 'Guardando...' : 'Guardar'}
        </Button>
      </div>
      <p className="text-xs text-gray-400 mb-4">
        Zonas, tipos de reforma, empleados y horas que se ofrecen al crear o editar una visita — antes solo se
        podían cambiar tocando código.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5">
        <CampoLista label="Zonas España" items={zonasEs} onChange={setZonasEs} />
        <CampoLista label="Zonas Francia" items={zonasFr} onChange={setZonasFr} />
        <CampoLista label="Tipos de reforma" items={tiposReforma} onChange={setTiposReforma} />
        <CampoLista label="Empleados" items={empleados} onChange={setEmpleados} />
        <CampoLista label="Horas habituales (lunes a viernes)" items={horasHabituales} onChange={setHorasHabituales} />
        <CampoLista label="Horas de sábado" items={horasSabado} onChange={setHorasSabado} />
      </div>
    </section>
  );
}
