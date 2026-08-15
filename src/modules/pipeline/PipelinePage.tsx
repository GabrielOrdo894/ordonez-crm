import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Calendar, FileText, Wrench, Search, RotateCcw, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { actualizarEtapaPipeline } from '../../lib/pipelineSync';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { agruparClientes, normalizarTelefono, ETAPAS_PIPELINE } from '../clientes/types';
import type { Cliente } from '../clientes/types';
import type { Visita } from '../visitas/types';
import { ClienteFicha } from '../clientes/ClienteFicha';
import { calcularTotales, formatearPrecio } from '../finanzas/lineas';
import type { Presupuesto } from '../finanzas/presupuestos/types';
import type { Proyecto } from '../planning/PlanningObraPage';
import { fechaVisitaCorta } from '../../lib/fechas';
import { KpiRow } from '../../components/ui/Kpi';

// "Perdido" es un estado terminal aparte, no una etapa más del embudo lineal — se queda fuera de
// ETAPAS_PIPELINE a propósito porque el Dashboard y el Inicio calculan sus funnels de conversión
// como "índice de la etapa actual >= índice de la etapa X" (acumulativo): si "Perdido" estuviera
// al final de ese array, cualquier lead perdido contaría como si hubiera alcanzado TODAS las
// etapas (incluida "Presupuesto aceptado"), inflando esas estadísticas de forma falsa.
const ETAPA_PERDIDO = 'Perdido';
const COLUMNAS_PIPELINE = [...ETAPAS_PIPELINE, ETAPA_PERDIDO];

function diasDesde(fechaISO: string) {
  const dias = Math.floor((Date.now() - new Date(fechaISO).getTime()) / 86_400_000);
  return dias;
}

export default function PipelinePage() {
  const { user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [clienteSeleccionado, setClienteSeleccionado] = useState<Cliente | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [columnaSobrevolada, setColumnaSobrevolada] = useState<string | null>(null);

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

  const clientesFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return clientes;
    return clientes.filter((c) => `${c.nombre} ${c.apellidos} ${c.telefono} ${c.zona ?? ''}`.toLowerCase().includes(q));
  }, [clientes, busqueda]);

  const columnas = useMemo(() => {
    const map = new Map<string, Cliente[]>(COLUMNAS_PIPELINE.map((e) => [e, []]));
    for (const c of clientesFiltrados) {
      const etapa = c.visitas[0]?.estado_pipeline;
      if (etapa && map.has(etapa)) map.get(etapa)!.push(c);
    }
    return map;
  }, [clientesFiltrados]);

  const kpis = useMemo(() => {
    const activos = clientes.filter((c) => {
      const etapa = c.visitas[0]?.estado_pipeline;
      return etapa && etapa !== 'Finalizado' && etapa !== ETAPA_PERDIDO;
    });
    const enRiesgo = activos.filter((c) => (infoCliente.get(c.id)?.diasInactivo ?? 0) >= 7);
    const valorPipeline = activos.reduce((suma, c) => {
      const etapa = c.visitas[0]?.estado_pipeline;
      const presupuesto = infoCliente.get(c.id)?.presupuesto;
      if (!presupuesto || (etapa !== 'Presupuesto enviado' && etapa !== 'Presupuesto aceptado')) return suma;
      return suma + calcularTotales(presupuesto.lineas).totalConIva;
    }, 0);
    const ganados = clientes.filter((c) => c.visitas[0]?.estado_pipeline === 'Finalizado').length;
    const perdidos = clientes.filter((c) => c.visitas[0]?.estado_pipeline === ETAPA_PERDIDO).length;
    return [
      { label: 'Leads activos', valor: activos.length, acento: true },
      { label: 'En riesgo (7+ días)', valor: enRiesgo.length },
      { label: 'Valor en pipeline', valor: formatearPrecio(valorPipeline) },
      { label: 'Ganados / Perdidos', valor: `${ganados} ganados`, valorSecundario: `${perdidos} perdidos` },
    ];
  }, [clientes, infoCliente]);

  const moverMutation = useMutation({
    mutationFn: async ({ visitaId, etapa }: { visitaId: string; etapa: string }) => {
      await actualizarEtapaPipeline(visitaId, etapa, nombreUsuarioActual);
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

  const handleDrop = (etapa: string, e: React.DragEvent) => {
    e.preventDefault();
    setColumnaSobrevolada(null);
    const visitaId = e.dataTransfer.getData('text/plain');
    if (visitaId) moverMutation.mutate({ visitaId, etapa });
  };

  if (isLoading) {
    return <div className="h-96 bg-surface border border-gray-200 rounded-sm animate-pulse" />;
  }

  return (
    <div>
      <p className="text-xs text-gray-400 mb-3">
        La etapa se actualiza sola según la visita, el presupuesto, la obra o la factura de cada cliente — puedes moverla
        arrastrando la tarjeta, con las flechas, o a mano si un caso no encaja.
      </p>

      <div className="relative max-w-xs mb-4">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre, teléfono o zona"
          className="w-full border border-gray-200 rounded-sm pl-8 pr-2.5 py-1.5 text-sm focus:border-brand focus:outline-none"
        />
      </div>

      <KpiRow items={kpis} />

      <div className="flex gap-3 overflow-x-auto pb-2">
        {COLUMNAS_PIPELINE.map((etapa) => {
          const items = columnas.get(etapa) ?? [];
          const esPerdido = etapa === ETAPA_PERDIDO;
          return (
            <div
              key={etapa}
              onDragOver={(e) => {
                e.preventDefault();
                setColumnaSobrevolada(etapa);
              }}
              onDragLeave={() => setColumnaSobrevolada((c) => (c === etapa ? null : c))}
              onDrop={(e) => handleDrop(etapa, e)}
              className={`w-64 shrink-0 bg-surface border rounded-sm flex flex-col transition-colors ${
                columnaSobrevolada === etapa ? 'border-brand' : 'border-gray-200'
              }`}
            >
              <div
                className={`text-xs uppercase tracking-wide px-3 py-2 flex items-center justify-between ${
                  esPerdido ? 'bg-gray-500 text-white' : 'bg-brand text-white'
                }`}
              >
                <span>{etapa}</span>
                <span>{items.length}</span>
              </div>
              <div className="flex-1 p-2 flex flex-col gap-2 min-h-[120px]">
                {items.length === 0 && <p className="text-xs text-gray-300 text-center py-4">Vacío</p>}
                {items.map((c) => {
                  const info = infoCliente.get(c.id);
                  const visitaId = c.visitas[0].id;
                  return (
                    <div
                      key={c.id}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData('text/plain', visitaId)}
                      className="border border-gray-200 rounded-sm p-2 cursor-grab active:cursor-grabbing"
                    >
                      <button onClick={() => setClienteSeleccionado(c)} className="text-left w-full">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium text-gray-900">
                            {c.nombre} {c.apellidos}
                          </p>
                          {info && info.diasInactivo >= 7 && !esPerdido && (
                            <span
                              className={`text-[9px] font-semibold shrink-0 ${
                                info.diasInactivo >= 21 ? 'text-red-600' : 'text-amber-600'
                              }`}
                            >
                              {info.diasInactivo}d
                            </span>
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
                        {esPerdido ? (
                          <button
                            onClick={() => moverMutation.mutate({ visitaId, etapa: 'Contacto' })}
                            className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-brand"
                          >
                            <RotateCcw size={11} />
                            Reactivar
                          </button>
                        ) : (
                          <>
                            <div className="flex items-center gap-1">
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
                            <button
                              onClick={() => moverMutation.mutate({ visitaId, etapa: ETAPA_PERDIDO })}
                              className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-red-600"
                            >
                              <X size={11} />
                              Perdido
                            </button>
                          </>
                        )}
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
