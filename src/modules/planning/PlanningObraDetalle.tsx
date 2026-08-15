import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { sincronizarPipelineCliente } from '../../lib/pipelineSync';
import { registrarEventoFunnel } from '../../lib/funnelTracking';
import { registrarEvento } from '../../lib/eventos';
import { fechaVisitaCorta } from '../../lib/fechas';
import { useToast } from '../../hooks/useToast';
import { useDebounced } from '../../hooks/useDebounced';
import { Input } from '../../components/ui/Input';
import { EditorTexto } from '../../components/ui/EditorTexto';
import { Select } from '../../components/ui/Select';
import { Button } from '../../components/ui/Button';
import { FechaPicker } from '../../components/ui/FechaPicker';
import { generarPdfPlanning } from '../../lib/generarPdfPlanning';
import { conAvisoDescarga } from '../../lib/conAvisoDescarga';
import { mensajeError } from '../../lib/mensajeError';
import { agruparPorSeccion } from '../../lib/planningCronograma';
import { PlanningPreview } from './PlanningPreview';
import { usePlanningPdfData } from './usePlanningPdfData';
import type { Presupuesto } from '../finanzas/presupuestos/types';
import type { Proyecto, FaseObra } from './PlanningObraPage';

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
  const [nuevaFaseSeccion, setNuevaFaseSeccion] = useState('');
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

  const { pais, idioma, entidadInfo, configPlanning, presupuestoTotal } = usePlanningPdfData(presupuesto);

  const actualizarMutation = useMutation({
    mutationFn: async (cambios: Partial<Proyecto>) => {
      const { error } = await supabase.from('proyectos').update(cambios).eq('id', proyecto.id);
      if (error) throw error;
    },
    onSuccess: async (_data, cambios) => {
      await sincronizarPipelineCliente(presupuesto?.cliente_tel);
      if (cambios.estado) {
        await registrarEvento('proyecto', proyecto.id, `Estado cambiado a "${cambios.estado}"`);
      }
      if (cambios.estado === 'Finalizado' && presupuesto?.id) {
        await registrarEventoFunnel('obra_finalizada', { presupuestoId: presupuesto.id });
      }
      queryClient.invalidateQueries({ queryKey: ['proyecto', proyecto.id] });
      queryClient.invalidateQueries({ queryKey: ['proyectos', 'todos'] });
      queryClient.invalidateQueries({ queryKey: ['documento_eventos', 'proyecto', proyecto.id] });
    },
    onError: (error) => toast.error(error.message),
  });

  // Nombre de la obra y fases se editan en estado LOCAL, no directamente contra `proyecto.fases`
  // (dato de servidor) — antes cada tecla disparaba un UPDATE completo a Supabase y el input,
  // controlado por el dato del servidor, "rebotaba"/perdía pulsaciones mientras ese guardado
  // estaba en vuelo (bug real corregido 2026-08-11). Ahora se guarda solo, con 600ms de debounce,
  // cuando el usuario deja de escribir.
  const [nombreObraLocal, setNombreObraLocal] = useState(proyectoInicial.nombre_obra);
  const [fasesLocal, setFasesLocal] = useState<FaseObra[]>(proyectoInicial.fases);
  const nombreObraDebounced = useDebounced(nombreObraLocal, 600);
  const fasesDebounced = useDebounced(fasesLocal, 600);
  const primerRenderRef = useRef(true);

  // Última versión de nombre_obra/fases que ESTA sesión sabe que hay en el servidor — se
  // actualiza tanto al enviar un guardado propio (antes de que vuelva la respuesta) como al
  // detectar un cambio externo, para no avisar dos veces del mismo cambio ni confundir el eco de
  // nuestro propio guardado (el refetch tras invalidateQueries) con una edición ajena.
  const ultimoConocidoServidorRef = useRef(JSON.stringify({ nombre_obra: proyectoInicial.nombre_obra, fases: proyectoInicial.fases }));
  const avisoConflictoMostradoRef = useRef(false);

  useEffect(() => {
    if (primerRenderRef.current) {
      primerRenderRef.current = false;
      return;
    }
    const payload = { nombre_obra: nombreObraDebounced, fases: fasesDebounced };
    ultimoConocidoServidorRef.current = JSON.stringify(payload);
    actualizarMutation.mutate(payload);
    // actualizarMutation.mutate es estable (Tanstack Query) — no hace falta en las deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nombreObraDebounced, fasesDebounced]);

  // Detección básica de edición concurrente: si al llegar datos nuevos del servidor (tras
  // cualquier guardado, propio o no) el nombre_obra/fases no coincide con lo último que ESTA
  // sesión guardó o vio, es que alguien más lo cambió por otra vía — avisamos en vez de
  // sobrescribirlo en silencio con el próximo autosave. No es un locking real, solo detección con
  // lo que ya está en caché (sin queries de polling nuevas).
  useEffect(() => {
    if (!proyecto) return;
    const actual = JSON.stringify({ nombre_obra: proyecto.nombre_obra, fases: proyecto.fases });
    if (actual !== ultimoConocidoServidorRef.current) {
      if (!avisoConflictoMostradoRef.current) {
        avisoConflictoMostradoRef.current = true;
        toast.warning('Este planning se modificó desde otra sesión — recarga la página antes de seguir editando para no sobrescribir esos cambios.');
      }
      ultimoConocidoServidorRef.current = actual;
    }
  }, [proyecto, toast]);

  const handleAgregarFase = () => {
    if (!nuevaFaseTitulo.trim()) return;
    setFasesLocal((fases) => [
      ...fases,
      {
        nombre: nuevaFaseTitulo.trim(),
        descripcion: nuevaFaseDescripcion.trim() || null,
        seccion: nuevaFaseSeccion.trim() || null,
        fecha_inicio: nuevaFaseInicio || null,
        fecha_fin: nuevaFaseFin || null,
        completada: false,
      },
    ]);
    setNuevaFaseTitulo('');
    setNuevaFaseDescripcion('');
    setNuevaFaseSeccion('');
    setNuevaFaseInicio('');
    setNuevaFaseFin('');
  };

  const handleToggleFase = (index: number) => {
    setFasesLocal((fases) => {
      const nuevas = fases.map((f, i) => (i === index ? { ...f, completada: !f.completada } : f));
      const fase = nuevas[index];
      registrarEvento('proyecto', proyecto.id, `Fase "${fase.nombre}" marcada como ${fase.completada ? 'completada' : 'pendiente'}`).then(() =>
        queryClient.invalidateQueries({ queryKey: ['documento_eventos', 'proyecto', proyecto.id] }),
      );
      return nuevas;
    });
  };

  const handleCampoFase = (index: number, campo: 'nombre' | 'descripcion' | 'seccion' | 'fecha_inicio' | 'fecha_fin', valor: string) => {
    setFasesLocal((fases) =>
      fases.map((f, i) => {
        if (i !== index) return f;
        if (campo === 'nombre') return { ...f, nombre: valor };
        return { ...f, [campo]: valor || null };
      }),
    );
  };

  const handleEliminarFase = (index: number) => {
    setFasesLocal((fases) => fases.filter((_, i) => i !== index));
  };

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
            nombreObra: nombreObraLocal,
            estado: proyecto.estado,
            fechaInicio: proyecto.fecha_inicio,
            presupuestoNumero: presupuesto?.numero ?? null,
            presupuestoFecha: presupuesto?.fecha_emision ?? null,
            presupuestoTotal,
            fases: fasesLocal,
          }),
        toast,
      );
    } catch (err) {
      toast.error(mensajeError(err, 'No se pudo generar el PDF'));
    }
  };

  const fasesCompletadas = fasesLocal.filter((f) => f.completada).length;
  const porcentajeCompletado = fasesLocal.length > 0 ? Math.round((fasesCompletadas / fasesLocal.length) * 100) : 0;
  const fasesConFechasLocal = fasesLocal.filter((f) => f.fecha_inicio && f.fecha_fin);
  const inicioCalculadoLocal = fasesConFechasLocal.length
    ? fasesConFechasLocal.reduce((min, f) => (f.fecha_inicio! < min ? f.fecha_inicio! : min), fasesConFechasLocal[0].fecha_inicio!)
    : null;
  const finPrevistoLocal = fasesConFechasLocal.length
    ? fasesConFechasLocal.reduce((max, f) => (f.fecha_fin! > max ? f.fecha_fin! : max), fasesConFechasLocal[0].fecha_fin!)
    : null;
  const duracionTotalLocal = inicioCalculadoLocal && finPrevistoLocal ? diffDias(inicioCalculadoLocal, finPrevistoLocal) : null;
  const seccionesLocal = useMemo(() => agruparPorSeccion(fasesLocal), [fasesLocal]);
  const hoyISO = new Date().toISOString().slice(0, 10);
  const faseAtrasada = (f: FaseObra) => !f.completada && !!f.fecha_fin && f.fecha_fin < hoyISO;

  return (
    <div className="animate-[scale-in_180ms_ease-out]">
      <div className="flex items-center justify-between gap-2 flex-wrap mb-4">
        <button onClick={onVolver} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
          <ArrowLeft size={15} />
          Volver a la vista previa
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
                value={nombreObraLocal}
                onChange={(e) => setNombreObraLocal(e.target.value)}
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
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Fases de la obra</p>
                {finPrevistoLocal && (
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    Fin previsto: {fechaVisitaCorta(finPrevistoLocal)} · {duracionTotalLocal} días en total
                  </p>
                )}
                {seccionesLocal.some((s) => s.nombre) && (
                  <p className="text-[11px] text-gray-400 mt-0.5 flex flex-wrap gap-x-2">
                    {seccionesLocal
                      .filter((s) => s.nombre)
                      .map((s) => (
                        <span key={s.nombre}>
                          {s.nombre}: {s.dias != null ? `${s.dias} días` : 'sin fechas'}
                        </span>
                      ))}
                  </p>
                )}
              </div>
              {fasesLocal.length > 0 && (
                <div className="flex items-center gap-2">
                  <div className="w-28 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-brand rounded-full" style={{ width: `${porcentajeCompletado}%` }} />
                  </div>
                  <span className="text-xs font-medium text-gray-500">
                    {fasesCompletadas}/{fasesLocal.length} · {porcentajeCompletado}%
                  </span>
                </div>
              )}
            </div>

            <table className="w-full border-collapse text-sm mb-4">
              <thead>
                <tr className="bg-brand text-white text-xs uppercase tracking-wide">
                  <th className="text-left px-3 py-2 font-medium">Título</th>
                  <th className="text-left px-3 py-2 font-medium">Sección</th>
                  <th className="text-left px-3 py-2 font-medium">Descripción</th>
                  <th className="text-left px-3 py-2 font-medium">Inicio</th>
                  <th className="text-left px-3 py-2 font-medium">Fin</th>
                  <th className="text-right px-3 py-2 font-medium">Duración</th>
                  <th className="text-center px-3 py-2 font-medium">Hecha</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {fasesLocal.length === 0 && (
                  <tr>
                    <td colSpan={8} className="text-center text-sm text-gray-400 py-6">
                      Sin fases todavía
                    </td>
                  </tr>
                )}
                {fasesLocal.map((fase, i) => (
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
                    <td className="px-3 py-2">
                      <input
                        value={fase.seccion ?? ''}
                        onChange={(e) => handleCampoFase(i, 'seccion', e.target.value)}
                        placeholder="—"
                        className="w-28 border border-gray-200 rounded-sm px-2 py-1 text-sm focus:border-brand focus:outline-none"
                      />
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
              <Input
                value={nuevaFaseSeccion}
                onChange={(e) => setNuevaFaseSeccion(e.target.value)}
                placeholder="Sección (ej. Obra gruesa)"
                className="w-44 shrink-0"
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
              idioma={idioma}
              entidad={entidadInfo.entidad}
              logoUrl={entidadInfo.logoUrl || undefined}
              clienteNombre={presupuesto?.cliente_nombre ?? ''}
              clienteTelefono={presupuesto?.cliente_tel ?? ''}
              clienteDir={presupuesto?.cliente_dir ?? ''}
              nombreObra={nombreObraLocal}
              estado={proyecto.estado}
              fechaInicio={proyecto.fecha_inicio}
              presupuestoNumero={presupuesto?.numero ?? null}
              presupuestoFecha={presupuesto?.fecha_emision ?? null}
              presupuestoTotal={presupuestoTotal}
              fases={fasesLocal}
            />
          )}
        </div>
      </div>
    </div>
  );
}
