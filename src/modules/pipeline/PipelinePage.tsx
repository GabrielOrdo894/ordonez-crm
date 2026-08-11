import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Calendar, FileText, Wrench } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { notaSistema } from '../../lib/notaSistema';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { agruparClientes, normalizarTelefono, ETAPAS_PIPELINE } from '../clientes/types';
import type { Cliente } from '../clientes/types';
import type { Visita } from '../visitas/types';
import { ClienteFicha } from '../clientes/ClienteFicha';
import { calcularTotales } from '../finanzas/lineas';
import type { Presupuesto } from '../finanzas/presupuestos/types';
import type { Proyecto } from '../planning/PlanningObraPage';
import { fechaVisitaCorta } from '../../lib/fechas';

function diasDesde(fechaISO: string) {
  const dias = Math.floor((Date.now() - new Date(fechaISO).getTime()) / 86_400_000);
  return dias;
}

export default function PipelinePage() {
  const { user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [clienteSeleccionado, setClienteSeleccionado] = useState<Cliente | null>(null);

  const nombreUsuarioActual = (user?.user_metadata?.nombre as string) || user?.email || 'Sistema';

  const { data: visitas, isLoading } = useQuery({
    queryKey: ['visitas'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('visitas')
        .select('*')
        .is('eliminado_en', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Visita[];
    },
  });

  const { data: presupuestos } = useQuery({
    queryKey: ['presupuestos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('presupuestos')
        .select('*')
        .is('eliminado_en', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Presupuesto[];
    },
  });

  const { data: proyectos } = useQuery({
    queryKey: ['proyectos', 'todos'],
    queryFn: async () => {
      const { data, error } = await supabase.from('proyectos').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data as Proyecto[];
    },
  });

  const clientes = useMemo(() => agruparClientes(visitas ?? []), [visitas]);

  const infoCliente = useMemo(() => {
    const mapa = new Map<
      string,
      { presupuesto: Presupuesto | null; proyecto: Proyecto | null; diasInactivo: number }
    >();
    for (const c of clientes) {
      const tel = normalizarTelefono(c.telefono);
      const presupuestosCliente = (presupuestos ?? []).filter((p) => normalizarTelefono(p.cliente_tel ?? '') === tel);
      const presupuestoAceptado = presupuestosCliente.find((p) => p.estado === 'Aceptado');
      const presupuestoRelevante = presupuestoAceptado ?? presupuestosCliente[0] ?? null;
      const proyecto = presupuestoAceptado
        ? (proyectos ?? []).find((pr) => pr.presupuesto_id === presupuestoAceptado.id) ?? null
        : null;
      const ultimaFecha = c.visitas[0]?.created_at;
      mapa.set(c.id, {
        presupuesto: presupuestoRelevante,
        proyecto,
        diasInactivo: ultimaFecha ? diasDesde(ultimaFecha) : 0,
      });
    }
    return mapa;
  }, [clientes, presupuestos, proyectos]);

  const columnas = useMemo(() => {
    const map = new Map<string, Cliente[]>(ETAPAS_PIPELINE.map((e) => [e, []]));
    for (const c of clientes) {
      const etapa = c.visitas[0]?.estado_pipeline;
      if (etapa && map.has(etapa)) map.get(etapa)!.push(c);
    }
    return map;
  }, [clientes]);

  const moverMutation = useMutation({
    mutationFn: async ({ visitaId, etapa }: { visitaId: string; etapa: string }) => {
      const { error } = await supabase.from('visitas').update({ estado_pipeline: etapa }).eq('id', visitaId);
      if (error) throw error;
      await notaSistema(visitaId, `Pipeline movido a ${etapa} por ${nombreUsuarioActual}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['visitas'] }),
    onError: (error) => toast.error(error.message),
  });

  const mover = (cliente: Cliente, direccion: 1 | -1) => {
    const actual = cliente.visitas[0]?.estado_pipeline;
    const idx = ETAPAS_PIPELINE.indexOf(actual as (typeof ETAPAS_PIPELINE)[number]);
    const nuevoIdx = idx + direccion;
    if (idx === -1 || nuevoIdx < 0 || nuevoIdx >= ETAPAS_PIPELINE.length) return;
    moverMutation.mutate({ visitaId: cliente.visitas[0].id, etapa: ETAPAS_PIPELINE[nuevoIdx] });
  };

  if (isLoading) {
    return <div className="h-96 bg-surface border border-gray-200 rounded-sm animate-pulse" />;
  }

  return (
    <div>
      <p className="text-xs text-gray-400 mb-3">
        La etapa se actualiza sola según la visita, el presupuesto, la obra o la factura de cada cliente — puedes moverla a
        mano con las flechas si un caso no encaja.
      </p>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {ETAPAS_PIPELINE.map((etapa) => {
          const items = columnas.get(etapa) ?? [];
          return (
            <div key={etapa} className="w-64 shrink-0 bg-surface border border-gray-200 rounded-sm flex flex-col">
              <div className="bg-brand text-white text-xs uppercase tracking-wide px-3 py-2 flex items-center justify-between">
                <span>{etapa}</span>
                <span>{items.length}</span>
              </div>
              <div className="flex-1 p-2 flex flex-col gap-2 min-h-[120px]">
                {items.length === 0 && <p className="text-xs text-gray-300 text-center py-4">Vacío</p>}
                {items.map((c) => {
                  const info = infoCliente.get(c.id);
                  return (
                    <div key={c.id} className="border border-gray-200 rounded-sm p-2">
                      <button onClick={() => setClienteSeleccionado(c)} className="text-left w-full">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium text-gray-900">
                            {c.nombre} {c.apellidos}
                          </p>
                          {info && info.diasInactivo >= 7 && (
                            <span className="text-[9px] text-amber-600 font-semibold shrink-0">{info.diasInactivo}d</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500">
                          {c.telefono} · {c.zona}
                        </p>
                        {info?.proyecto && (
                          <p className="flex items-center gap-1 text-[10px] text-gray-500 mt-1">
                            <Wrench size={10} className="shrink-0" />
                            Obra: {info.proyecto.estado}
                          </p>
                        )}
                        {!info?.proyecto && info?.presupuesto && (
                          <p className="flex items-center gap-1 text-[10px] text-gray-500 mt-1">
                            <FileText size={10} className="shrink-0" />
                            {info.presupuesto.numero} · {calcularTotales(info.presupuesto.lineas).totalConIva.toFixed(0)} €
                            {' · '}
                            {info.presupuesto.estado}
                          </p>
                        )}
                        {!info?.proyecto && !info?.presupuesto && c.visitas[0]?.fecha_visita && (
                          <p className="flex items-center gap-1 text-[10px] text-gray-500 mt-1">
                            <Calendar size={10} className="shrink-0" />
                            Visita: {fechaVisitaCorta(c.visitas[0].fecha_visita)}
                          </p>
                        )}
                      </button>
                      <div className="flex items-center justify-between mt-1.5">
                        <button
                          onClick={() => mover(c, -1)}
                          disabled={etapa === ETAPAS_PIPELINE[0]}
                          className="text-gray-400 hover:text-brand disabled:opacity-30"
                        >
                          <ChevronLeft size={14} />
                        </button>
                        <button
                          onClick={() => mover(c, 1)}
                          disabled={etapa === ETAPAS_PIPELINE[ETAPAS_PIPELINE.length - 1]}
                          className="text-gray-400 hover:text-brand disabled:opacity-30"
                        >
                          <ChevronRight size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <ClienteFicha cliente={clienteSeleccionado} open={!!clienteSeleccionado} onClose={() => setClienteSeleccionado(null)} />
    </div>
  );
}
