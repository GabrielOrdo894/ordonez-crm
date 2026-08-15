import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Download, Pencil, Languages, Eye } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../hooks/useToast';
import { fechaVisitaCorta, fechaCorta } from '../../lib/fechas';
import { cargarEventos } from '../../lib/eventos';
import { generarPdfPlanning } from '../../lib/generarPdfPlanning';
import { generarPdfPlanningTraducido, verPdfPlanningTraducido } from '../../lib/generarPdfPlanningTraducido';
import { conAvisoDescarga } from '../../lib/conAvisoDescarga';
import { mensajeError } from '../../lib/mensajeError';
import { agruparPorSeccion, rangoProyecto } from '../../lib/planningCronograma';
import { agruparClientes, normalizarTelefono } from '../clientes/types';
import { ClienteFicha } from '../clientes/ClienteFicha';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { PlanningPreview } from './PlanningPreview';
import { usePlanningPdfData } from './usePlanningPdfData';
import type { Visita } from '../visitas/types';
import type { Presupuesto } from '../finanzas/presupuestos/types';
import type { Proyecto } from './PlanningObraPage';

const VARIANTE_ESTADO_PROYECTO: Record<string, 'pendiente' | 'confirmada' | 'realizada' | 'cancelada' | 'default'> = {
  Planificado: 'default',
  'En curso': 'confirmada',
  Pausado: 'pendiente',
  Finalizado: 'realizada',
};

type PlanningVistaPreviaProps = {
  proyecto: Proyecto;
  presupuesto: Presupuesto | null;
  onVolver: () => void;
  onEditar: () => void;
};

export function PlanningVistaPrevia({ proyecto: proyectoInicial, presupuesto, onVolver, onEditar }: PlanningVistaPreviaProps) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [clienteAbierto, setClienteAbierto] = useState(false);

  const { data: proyecto } = useQuery({
    queryKey: ['proyecto', proyectoInicial.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('proyectos').select('*').eq('id', proyectoInicial.id).single();
      if (error) throw error;
      return data as Proyecto;
    },
    initialData: proyectoInicial,
  });

  const { pais, idioma, entidadInfo, configPlanning, presupuestoTotal } = usePlanningPdfData(presupuesto);

  const { data: eventos } = useQuery({
    queryKey: ['documento_eventos', 'proyecto', proyecto.id],
    queryFn: () => cargarEventos('proyecto', proyecto.id),
  });

  const { data: visitas } = useQuery({
    queryKey: ['visitas'],
    queryFn: async () => {
      const { data, error } = await supabase.from('visitas').select('*').is('eliminado_en', null).order('created_at', { ascending: false });
      if (error) throw error;
      return data as Visita[];
    },
  });

  const clientes = useMemo(() => agruparClientes(visitas ?? []), [visitas]);
  const cliente = useMemo(() => {
    if (!presupuesto?.cliente_tel) return null;
    const tel = normalizarTelefono(presupuesto.cliente_tel);
    return clientes.find((c) => normalizarTelefono(c.telefono) === tel) ?? null;
  }, [clientes, presupuesto?.cliente_tel]);

  const { fin: finProyecto, dias: totalDias } = rangoProyecto(proyecto.fases);
  const secciones = useMemo(() => agruparPorSeccion(proyecto.fases).filter((s) => s.nombre), [proyecto.fases]);

  const traducirMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('traducir-planning', { body: { id: proyecto.id } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['proyecto', proyecto.id] });
      toast.success('Traducción generada — uso interno, revisa el PDF antes de compartirlo');
    },
    onError: (error) => toast.error(mensajeError(error, 'No se pudo generar la traducción')),
  });

  const handleDescargarPdf = async () => {
    try {
      await conAvisoDescarga(
        () =>
          generarPdfPlanning({
            clienteNombre: presupuesto?.cliente_nombre ?? '',
            clienteTelefono: presupuesto?.cliente_tel ?? '',
            clienteDir: presupuesto?.cliente_dir ?? '',
            pais,
            idioma,
            nombreObra: proyecto.nombre_obra,
            estado: proyecto.estado,
            fechaInicio: proyecto.fecha_inicio,
            presupuestoNumero: presupuesto?.numero ?? null,
            presupuestoFecha: presupuesto?.fecha_emision ?? null,
            presupuestoTotal,
            fases: proyecto.fases,
          }),
        toast,
      );
    } catch (err) {
      toast.error(mensajeError(err, 'No se pudo generar el PDF'));
    }
  };

  const datosTraduccion = () => ({
    clienteNombre: presupuesto?.cliente_nombre ?? '',
    clienteTelefono: presupuesto?.cliente_tel ?? '',
    clienteDir: presupuesto?.cliente_dir ?? '',
    pais,
    estado: proyecto.estado,
    fechaInicio: proyecto.fecha_inicio,
    presupuestoNumero: presupuesto?.numero ?? null,
    presupuestoFecha: presupuesto?.fecha_emision ?? null,
    presupuestoTotal,
    traduccion: proyecto.traduccion!,
  });

  const handleVerPdfTraducido = async () => {
    try {
      await conAvisoDescarga(() => verPdfPlanningTraducido(datosTraduccion()), toast);
    } catch (err) {
      toast.error(mensajeError(err, 'No se pudo generar el PDF traducido'));
    }
  };

  const handleDescargarPdfTraducido = async () => {
    try {
      await conAvisoDescarga(() => generarPdfPlanningTraducido(datosTraduccion()), toast);
    } catch (err) {
      toast.error(mensajeError(err, 'No se pudo generar el PDF traducido'));
    }
  };

  return (
    <div className="animate-[scale-in_180ms_ease-out]">
      <button onClick={onVolver} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-3">
        <ArrowLeft size={15} />
        Volver a planning de obra
      </button>

      <div className="flex items-start justify-between gap-3 flex-wrap mb-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Planning de obra</p>
          <h1 className="text-lg font-semibold text-gray-900">{proyecto.nombre_obra}</h1>
          <div className="flex items-center gap-2 mt-1.5">
            <Badge variant={VARIANTE_ESTADO_PROYECTO[proyecto.estado] ?? 'default'}>{proyecto.estado}</Badge>
            {proyecto.fecha_inicio && <span className="text-xs text-gray-400">Inicio: {fechaVisitaCorta(proyecto.fecha_inicio)}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="secondary" onClick={handleDescargarPdf}>
            <span className="flex items-center gap-1.5">
              <Download size={14} />
              Descargar PDF
            </span>
          </Button>
          <Button variant="primary" onClick={onEditar}>
            <span className="flex items-center gap-1.5">
              <Pencil size={14} />
              Editar
            </span>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5 items-start">
        <div>
          {entidadInfo && (
            <PlanningPreview
              config={configPlanning}
              idioma={idioma}
              entidad={entidadInfo.entidad}
              logoUrl={entidadInfo.logoUrl || undefined}
              clienteNombre={presupuesto?.cliente_nombre ?? ''}
              clienteTelefono={presupuesto?.cliente_tel ?? ''}
              clienteDir={presupuesto?.cliente_dir ?? ''}
              nombreObra={proyecto.nombre_obra}
              estado={proyecto.estado}
              fechaInicio={proyecto.fecha_inicio}
              presupuestoNumero={presupuesto?.numero ?? null}
              presupuestoFecha={presupuesto?.fecha_emision ?? null}
              presupuestoTotal={presupuestoTotal}
              fases={proyecto.fases}
            />
          )}
        </div>

        <div className="flex flex-col gap-4">
          <section className="bg-surface border border-gray-200 rounded-sm p-3.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Presupuesto vinculado</p>
            {presupuesto ? (
              <div className="border border-gray-200 rounded-sm px-3 py-2.5">
                <p className="text-sm font-semibold text-gray-900">{presupuesto.numero}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {presupuesto.fecha_emision} · {presupuestoTotal?.toFixed(2)} €
                </p>
              </div>
            ) : (
              <p className="text-sm text-gray-400">Sin presupuesto vinculado.</p>
            )}
          </section>

          <section className="bg-surface border border-gray-200 rounded-sm p-3.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Duración</p>
            {finProyecto ? (
              <>
                <p className="text-sm text-gray-800">
                  Fin previsto: <span className="font-medium">{fechaVisitaCorta(finProyecto)}</span>
                </p>
                <p className="text-xs text-gray-500 mt-0.5">{totalDias} días en total · {proyecto.fases.length} fases</p>
                {secciones.length > 0 && (
                  <div className="flex flex-wrap gap-x-2 mt-2 text-xs text-gray-500">
                    {secciones.map((s) => (
                      <span key={s.nombre}>
                        {s.nombre}: {s.dias != null ? `${s.dias} días` : 'sin fechas'}
                      </span>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-gray-400">Sin fases con fechas todavía.</p>
            )}
          </section>

          <section className="bg-surface border border-gray-200 rounded-sm p-3.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">Eventos</p>
            {!eventos || eventos.length === 0 ? (
              <p className="text-sm text-gray-400">Sin eventos registrados.</p>
            ) : (
              <ol className="flex flex-col gap-3">
                {eventos.map((e, i) => (
                  <li key={e.id} className="flex gap-2.5">
                    <div className="flex flex-col items-center shrink-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-brand mt-1.5" />
                      {i < eventos.length - 1 && <span className="flex-1 w-px bg-gray-200 mt-1" />}
                    </div>
                    <div className="pb-1">
                      <p className="text-sm text-gray-800">{e.evento}</p>
                      <p className="text-xs text-gray-400">
                        {new Date(e.created_at).toLocaleString('es', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className="bg-surface border border-gray-200 rounded-sm p-3.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Cliente</p>
            {presupuesto ? (
              cliente ? (
                <button
                  onClick={() => setClienteAbierto(true)}
                  className="w-full text-left border border-gray-200 rounded-sm px-3 py-2.5 hover:border-brand transition-colors"
                >
                  <p className="text-sm font-semibold text-gray-900">{presupuesto.cliente_nombre}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{presupuesto.cliente_dir || '—'}</p>
                  <p className="text-xs text-gray-500">{[presupuesto.cliente_tel, presupuesto.cliente_email].filter(Boolean).join(' · ')}</p>
                  <p className="text-xs text-brand mt-1.5">Ver ficha completa del cliente</p>
                </button>
              ) : (
                <div className="border border-gray-200 rounded-sm px-3 py-2.5">
                  <p className="text-sm font-semibold text-gray-900">{presupuesto.cliente_nombre || '—'}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{presupuesto.cliente_dir || '—'}</p>
                  <p className="text-xs text-gray-500">{[presupuesto.cliente_tel, presupuesto.cliente_email].filter(Boolean).join(' · ')}</p>
                </div>
              )
            ) : (
              <p className="text-sm text-gray-400">Sin presupuesto vinculado.</p>
            )}
          </section>

          <section className="bg-surface border border-gray-200 rounded-sm p-3.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2 flex items-center gap-1.5">
              <Languages size={13} />
              Traducción (uso interno)
            </p>
            {proyecto.traduccion ? (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-gray-500">
                  {proyecto.traduccion.idioma} · generada {fechaCorta(proyecto.traduccion.generado_en?.slice(0, 10))}
                </p>
                <div className="flex gap-2 flex-wrap">
                  <Button size="sm" variant="secondary" onClick={handleVerPdfTraducido}>
                    <span className="flex items-center gap-1.5">
                      <Eye size={13} />
                      Ver PDF
                    </span>
                  </Button>
                  <Button size="sm" variant="secondary" onClick={handleDescargarPdfTraducido}>
                    <span className="flex items-center gap-1.5">
                      <Download size={13} />
                      Descargar
                    </span>
                  </Button>
                </div>
                <button
                  onClick={() => traducirMutation.mutate()}
                  disabled={traducirMutation.isPending}
                  className="text-xs text-gray-400 hover:text-brand text-left"
                >
                  {traducirMutation.isPending ? 'Generando…' : 'Volver a traducir'}
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <p className="text-sm text-gray-400">Sin traducción generada.</p>
                <Button size="sm" variant="secondary" onClick={() => traducirMutation.mutate()} disabled={traducirMutation.isPending}>
                  {traducirMutation.isPending ? 'Generando…' : `Traducir a ${idioma === 'fr' ? 'español' : 'francés'}`}
                </Button>
              </div>
            )}
          </section>
        </div>
      </div>

      <ClienteFicha cliente={cliente} open={clienteAbierto} onClose={() => setClienteAbierto(false)} />
    </div>
  );
}
