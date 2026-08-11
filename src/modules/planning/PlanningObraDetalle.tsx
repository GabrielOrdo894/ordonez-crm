import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { sincronizarPipelineCliente } from '../../lib/pipelineSync';
import { cargarEntidad, cargarConfigCompleta } from '../../lib/pdfEmpresa';
import { useToast } from '../../hooks/useToast';
import { Input } from '../../components/ui/Input';
import { EditorTexto } from '../../components/ui/EditorTexto';
import { Select } from '../../components/ui/Select';
import { Button } from '../../components/ui/Button';
import { FechaPicker } from '../../components/ui/FechaPicker';
import { calcularTotales } from '../finanzas/lineas';
import { generarPdfPlanning } from '../../lib/generarPdfPlanning';
import { conAvisoDescarga } from '../../lib/conAvisoDescarga';
import { mensajeError } from '../../lib/mensajeError';
import { PlanningPreview } from './PlanningPreview';
import { configPlanningDesde } from './configPlanning';
import type { Presupuesto } from '../finanzas/presupuestos/types';
import type { Proyecto } from './PlanningObraPage';

const ESTADOS_PROYECTO = ['Planificado', 'En curso', 'Pausado', 'Finalizado'];

function diffDias(a: string, b: string) {
  const d1 = new Date(`${a}T00:00:00`);
  const d2 = new Date(`${b}T00:00:00`);
  return Math.round((d2.getTime() - d1.getTime()) / 86_400_000);
}

type PlanningObraDetalleProps = {
  proyecto: Proyecto;
  presupuesto: Presupuesto | null;
  onVolver: () => void;
};

export function PlanningObraDetalle({ proyecto: proyectoInicial, presupuesto, onVolver }: PlanningObraDetalleProps) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [nuevaFaseTitulo, setNuevaFaseTitulo] = useState('');
  const [nuevaFaseDescripcion, setNuevaFaseDescripcion] = useState('');
  const [nuevaFaseInicio, setNuevaFaseInicio] = useState('');
  const [nuevaFaseFin, setNuevaFaseFin] = useState('');

  const { data: proyecto } = useQuery({
    queryKey: ['proyecto', proyectoInicial.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('proyectos').select('*').eq('id', proyectoInicial.id).single();
      if (error) throw error;
      return data as Proyecto;
    },
    initialData: proyectoInicial,
  });

  const pais = presupuesto?.pais ?? 'España';

  const { data: entidadInfo } = useQuery({
    queryKey: ['empresa_config', 'entidad', pais],
    queryFn: () => cargarEntidad(pais),
  });

  const { data: config } = useQuery({
    queryKey: ['empresa_config', 'completa'],
    queryFn: cargarConfigCompleta,
  });

  const configPlanning = useMemo(
    () => configPlanningDesde((config?.datos as { plantilla_planning?: unknown })?.plantilla_planning),
    [config],
  );

  const actualizarMutation = useMutation({
    mutationFn: async (cambios: Partial<Proyecto>) => {
      const { error } = await supabase.from('proyectos').update(cambios).eq('id', proyecto.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await sincronizarPipelineCliente(presupuesto?.cliente_tel);
      queryClient.invalidateQueries({ queryKey: ['proyecto', proyecto.id] });
      queryClient.invalidateQueries({ queryKey: ['proyectos', 'todos'] });
    },
    onError: (error) => toast.error(error.message),
  });

  const handleAgregarFase = () => {
    if (!nuevaFaseTitulo.trim()) return;
    actualizarMutation.mutate({
      fases: [
        ...proyecto.fases,
        {
          nombre: nuevaFaseTitulo.trim(),
          descripcion: nuevaFaseDescripcion.trim() || null,
          fecha_inicio: nuevaFaseInicio || null,
          fecha_fin: nuevaFaseFin || null,
          completada: false,
        },
      ],
    });
    setNuevaFaseTitulo('');
    setNuevaFaseDescripcion('');
    setNuevaFaseInicio('');
    setNuevaFaseFin('');
  };

  const handleToggleFase = (index: number) => {
    const fases = proyecto.fases.map((f, i) => (i === index ? { ...f, completada: !f.completada } : f));
    actualizarMutation.mutate({ fases });
  };

  const handleCampoFase = (index: number, campo: 'nombre' | 'descripcion' | 'fecha_inicio' | 'fecha_fin', valor: string) => {
    const fases = proyecto.fases.map((f, i) => {
      if (i !== index) return f;
      if (campo === 'nombre') return { ...f, nombre: valor };
      return { ...f, [campo]: valor || null };
    });
    actualizarMutation.mutate({ fases });
  };

  const handleEliminarFase = (index: number) => {
    actualizarMutation.mutate({ fases: proyecto.fases.filter((_, i) => i !== index) });
  };

  const presupuestoTotal = presupuesto ? calcularTotales(presupuesto.lineas).totalConIva : null;

  const handleDescargarPdf = async () => {
    try {
      await conAvisoDescarga(
        () =>
          generarPdfPlanning({
            clienteNombre: presupuesto?.cliente_nombre ?? '',
            clienteTelefono: presupuesto?.cliente_tel ?? '',
            clienteDir: presupuesto?.cliente_dir ?? '',
            pais,
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

  const fasesCompletadas = proyecto.fases.filter((f) => f.completada).length;
  const porcentajeCompletado = proyecto.fases.length > 0 ? Math.round((fasesCompletadas / proyecto.fases.length) * 100) : 0;
  const hoyISO = new Date().toISOString().slice(0, 10);
  const faseAtrasada = (f: (typeof proyecto.fases)[number]) => !f.completada && !!f.fecha_fin && f.fecha_fin < hoyISO;

  return (
    <div className="animate-[scale-in_180ms_ease-out]">
      <div className="flex items-center justify-between gap-2 flex-wrap mb-4">
        <button onClick={onVolver} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
          <ArrowLeft size={15} />
          Volver a planning de obra
        </button>
        <Button variant="secondary" onClick={handleDescargarPdf}>
          Descargar PDF
        </Button>
      </div>

      <div className="flex flex-col lg:flex-row gap-5 items-start">
        <div className="flex-1 min-w-0 w-full flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-surface border border-gray-200 rounded-sm p-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 border-b border-gray-200 pb-2 mb-2">
                Cliente
              </p>
              {presupuesto ? (
                <>
                  <p className="text-sm font-medium text-gray-900">{presupuesto.cliente_nombre}</p>
                  <p className="text-xs text-gray-500">{presupuesto.cliente_dir}</p>
                  <p className="text-xs text-gray-500">
                    {[presupuesto.cliente_tel, presupuesto.cliente_email].filter(Boolean).join(' · ')}
                  </p>
                </>
              ) : (
                <p className="text-sm text-gray-400">Sin presupuesto vinculado</p>
              )}
            </div>

            <div className="bg-surface border border-gray-200 rounded-sm p-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 border-b border-gray-200 pb-2 mb-2">
                Presupuesto
              </p>
              {presupuesto ? (
                <>
                  <p className="text-sm font-medium text-gray-900">{presupuesto.numero}</p>
                  <p className="text-xs text-gray-500">
                    {presupuesto.fecha_emision} · {presupuestoTotal?.toFixed(2)} €
                  </p>
                </>
              ) : (
                <p className="text-sm text-gray-400">Sin presupuesto vinculado</p>
              )}
            </div>
          </div>

          <div className="bg-surface border border-gray-200 rounded-sm p-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Input
                label="Nombre de la obra"
                value={proyecto.nombre_obra}
                onChange={(e) => actualizarMutation.mutate({ nombre_obra: e.target.value })}
              />
              <Select
                label="Estado"
                options={ESTADOS_PROYECTO.map((e) => ({ value: e, label: e }))}
                value={proyecto.estado}
                onChange={(e) => actualizarMutation.mutate({ estado: e.target.value })}
              />
              <FechaPicker
                label="Fecha de inicio"
                value={proyecto.fecha_inicio ?? ''}
                onChange={(fecha) => actualizarMutation.mutate({ fecha_inicio: fecha || null })}
              />
            </div>
          </div>

          <div className="bg-surface border border-gray-200 rounded-sm p-4">
            <div className="flex items-center justify-between border-b border-gray-200 pb-2 mb-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Fases de la obra</p>
              {proyecto.fases.length > 0 && (
                <div className="flex items-center gap-2">
                  <div className="w-28 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-brand rounded-full" style={{ width: `${porcentajeCompletado}%` }} />
                  </div>
                  <span className="text-xs font-medium text-gray-500">
                    {fasesCompletadas}/{proyecto.fases.length} · {porcentajeCompletado}%
                  </span>
                </div>
              )}
            </div>

            <table className="w-full border-collapse text-sm mb-4">
              <thead>
                <tr className="bg-brand text-white text-xs uppercase tracking-wide">
                  <th className="text-left px-3 py-2 font-medium">Título</th>
                  <th className="text-left px-3 py-2 font-medium">Descripción</th>
                  <th className="text-left px-3 py-2 font-medium">Inicio</th>
                  <th className="text-left px-3 py-2 font-medium">Fin</th>
                  <th className="text-right px-3 py-2 font-medium">Duración</th>
                  <th className="text-center px-3 py-2 font-medium">Hecha</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {proyecto.fases.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center text-sm text-gray-400 py-6">
                      Sin fases todavía
                    </td>
                  </tr>
                )}
                {proyecto.fases.map((fase, i) => (
                  <tr key={i} className={`odd:bg-gray-50 ${faseAtrasada(fase) ? 'border-l-2 border-red-400' : ''}`}>
                    <td className="px-3 py-2">
                      <input
                        value={fase.nombre}
                        onChange={(e) => handleCampoFase(i, 'nombre', e.target.value)}
                        className="w-full border border-gray-200 rounded-sm px-2 py-1 text-sm focus:border-brand focus:outline-none"
                      />
                      {faseAtrasada(fase) && (
                        <span className="inline-block mt-1 text-[10px] font-medium text-red-600 bg-red-50 px-1.5 py-0.5 rounded-sm">
                          Atrasada
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 min-w-[220px]">
                      <EditorTexto
                        compact
                        value={fase.descripcion ?? ''}
                        onChange={(descripcion) => handleCampoFase(i, 'descripcion', descripcion)}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <FechaPicker
                        value={fase.fecha_inicio ?? ''}
                        onChange={(fecha) => handleCampoFase(i, 'fecha_inicio', fecha)}
                        className="w-36"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <FechaPicker
                        value={fase.fecha_fin ?? ''}
                        onChange={(fecha) => handleCampoFase(i, 'fecha_fin', fecha)}
                        min={fase.fecha_inicio ?? undefined}
                        className="w-36"
                      />
                    </td>
                    <td className="px-3 py-2 text-right text-gray-600">
                      {fase.fecha_inicio && fase.fecha_fin ? `${diffDias(fase.fecha_inicio, fase.fecha_fin)} días` : '—'}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <input type="checkbox" checked={fase.completada} onChange={() => handleToggleFase(i)} />
                    </td>
                    <td className="px-3 py-2">
                      <button onClick={() => handleEliminarFase(i)} className="text-gray-300 hover:text-red-600 text-xs">
                        Quitar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex gap-2">
              <Input
                value={nuevaFaseTitulo}
                onChange={(e) => setNuevaFaseTitulo(e.target.value)}
                placeholder="Título de fase (ej. Demolición)"
                className="flex-1"
              />
              <Input
                value={nuevaFaseDescripcion}
                onChange={(e) => setNuevaFaseDescripcion(e.target.value)}
                placeholder="Descripción"
                className="flex-1"
              />
              <FechaPicker value={nuevaFaseInicio} onChange={setNuevaFaseInicio} placeholder="Inicio" className="w-36 shrink-0" />
              <FechaPicker
                value={nuevaFaseFin}
                onChange={setNuevaFaseFin}
                min={nuevaFaseInicio || undefined}
                placeholder="Fin"
                className="w-36 shrink-0"
              />
              <Button size="sm" variant="secondary" onClick={handleAgregarFase} disabled={!nuevaFaseTitulo.trim()}>
                Añadir fase
              </Button>
            </div>
          </div>
        </div>

        <div className="w-full lg:w-[420px] shrink-0 lg:sticky lg:top-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Vista previa en vivo</p>
          {entidadInfo && (
            <PlanningPreview
              config={configPlanning}
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
      </div>
    </div>
  );
}
