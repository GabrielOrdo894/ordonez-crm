import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import JSZip from 'jszip';
import { ArrowLeft, ExternalLink, Images, ImageOff, FileText, Receipt, ClipboardList, Trash2, Pencil } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../hooks/useToast';
import { useConfirmar } from '../../hooks/useConfirm';
import { mensajeError } from '../../lib/mensajeError';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import type { GaleriaProyecto } from './types';

const BUCKET = 'galeria';

function pathDesdeUrl(url: string): string | null {
  const marca = `/storage/v1/object/public/${BUCKET}/`;
  const idx = url.indexOf(marca);
  return idx === -1 ? null : url.slice(idx + marca.length);
}

type FormState = {
  titulo: string;
  tipo_obra: string;
  zona: string;
  fecha_obra: string;
  descripcion: string;
};

type PresupuestoResumen = { id: string; numero: string | null; estado: string };
type FacturaResumen = { id: string; numero: string | null; estado_cobro: string; tipo: string };
type PlanningResumen = { id: string; estado: string; fases: { completada: boolean }[] };

export default function GaleriaDetallePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const confirmar = useConfirmar();
  const queryClient = useQueryClient();
  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState<FormState>({ titulo: '', tipo_obra: '', zona: '', fecha_obra: '', descripcion: '' });
  const [descargandoZip, setDescargandoZip] = useState(false);

  const { data: proyecto, isLoading } = useQuery({
    queryKey: ['galeria', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from('galeria').select('*').eq('id', id).single();
      if (error) throw error;
      return data as GaleriaProyecto;
    },
  });

  useEffect(() => {
    if (!proyecto) return;
    setForm({
      titulo: proyecto.titulo ?? '',
      tipo_obra: proyecto.tipo_obra ?? '',
      zona: proyecto.zona ?? '',
      fecha_obra: proyecto.fecha_obra ?? '',
      descripcion: proyecto.descripcion ?? '',
    });
  }, [proyecto]);

  const { data: presupuesto } = useQuery({
    queryKey: ['galeria', 'presupuesto', proyecto?.presupuesto_id],
    enabled: !!proyecto?.presupuesto_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('presupuestos')
        .select('id, numero, estado')
        .eq('id', proyecto!.presupuesto_id!)
        .single();
      if (error) throw error;
      return data as PresupuestoResumen;
    },
  });

  // Facturas/acomptes de la obra: todas las del mismo presupuesto, o la factura ancla si la obra
  // no viene de un presupuesto (caso "sin coincidencia en el CRM", ver obras.ts).
  const { data: facturas } = useQuery({
    queryKey: ['galeria', 'facturas', proyecto?.presupuesto_id, proyecto?.factura_id],
    enabled: !!proyecto?.presupuesto_id || !!proyecto?.factura_id,
    queryFn: async () => {
      const query = supabase.from('facturas').select('id, numero, estado_cobro, tipo').is('eliminado_en', null);
      const { data, error } = proyecto?.presupuesto_id
        ? await query.eq('presupuesto_id', proyecto.presupuesto_id)
        : await query.eq('id', proyecto!.factura_id!);
      if (error) throw error;
      return data as FacturaResumen[];
    },
  });

  const { data: planning } = useQuery({
    queryKey: ['galeria', 'planning', proyecto?.presupuesto_id],
    enabled: !!proyecto?.presupuesto_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('proyectos')
        .select('id, estado, fases')
        .eq('presupuesto_id', proyecto!.presupuesto_id!)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as PlanningResumen | null;
    },
  });

  const guardarMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('galeria')
        .update({
          titulo: form.titulo || null,
          tipo_obra: form.tipo_obra || null,
          zona: form.zona || null,
          fecha_obra: form.fecha_obra || null,
          descripcion: form.descripcion || null,
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['galeria'] });
      toast.success('Datos guardados');
      setEditando(false);
    },
    onError: (error) => toast.error(error.message),
  });

  const toggleFlagMutation = useMutation({
    mutationFn: async (patch: { destacado?: boolean; publicado?: boolean }) => {
      const { error } = await supabase.from('galeria').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['galeria'] });
      queryClient.invalidateQueries({ queryKey: ['galeria', id] });
    },
    onError: (error) => toast.error(error.message),
  });

  const eliminarProyectoMutation = useMutation({
    mutationFn: async () => {
      if (!proyecto) return { fotosNoEliminadas: 0 };
      let fotosNoEliminadas = 0;
      for (const foto of proyecto.fotos) {
        const path = pathDesdeUrl(foto.url);
        if (!path) continue;
        const { error } = await supabase.storage.from(BUCKET).remove([path]);
        if (error) fotosNoEliminadas += 1;
      }
      const { error } = await supabase.from('galeria').delete().eq('id', proyecto.id);
      if (error) throw error;
      return { fotosNoEliminadas };
    },
    onSuccess: (resultado) => {
      queryClient.invalidateQueries({ queryKey: ['galeria'] });
      if (resultado?.fotosNoEliminadas) {
        toast.warning(`Proyecto eliminado, pero ${resultado.fotosNoEliminadas} foto(s) no se pudieron borrar del almacenamiento`);
      } else {
        toast.success('Proyecto eliminado de la galería');
      }
      navigate('/galeria');
    },
    onError: (error) => toast.error(error.message),
  });

  const handleEliminarProyecto = async () => {
    if (!(await confirmar('¿Eliminar este proyecto de la galería? Se borrarán también sus fotos y vídeos.'))) return;
    eliminarProyectoMutation.mutate();
  };

  const handleDescargarZip = async () => {
    if (!proyecto || proyecto.fotos.length === 0) return;
    setDescargandoZip(true);
    try {
      const zip = new JSZip();
      let i = 0;
      for (const foto of proyecto.fotos) {
        const res = await fetch(foto.url);
        const blob = await res.blob();
        zip.file(`${foto.tipo}_${i}_${foto.nombre}`, blob);
        i += 1;
      }
      const contenido = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(contenido);
      const enlace = document.createElement('a');
      enlace.href = url;
      enlace.download = `${(proyecto.titulo ?? 'galeria').replace(/\s+/g, '_')}.zip`;
      enlace.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(mensajeError(err, 'No se pudo generar el ZIP'));
    } finally {
      setDescargandoZip(false);
    }
  };

  if (isLoading || !proyecto) return null;

  const portada = [...proyecto.fotos].sort((a, b) => a.orden - b.orden).slice(0, 6);

  return (
    <div>
      <button onClick={() => navigate('/galeria')} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 mb-4">
        <ArrowLeft size={15} />
        Volver a Galería
      </button>

      <div className="flex items-start justify-between mb-4 flex-wrap gap-2">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">{proyecto.titulo || 'Sin título'}</h1>
          <p className="text-sm text-gray-500">
            {proyecto.tipo_obra || '—'} · {proyecto.zona || '—'} · {proyecto.fecha_obra || 'Sin fecha'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => toggleFlagMutation.mutate({ destacado: !proyecto.destacado })}
            className="cursor-pointer"
          >
            <Badge variant={proyecto.destacado ? 'realizada' : 'default'}>{proyecto.destacado ? 'Destacado' : 'No destacado'}</Badge>
          </button>
          <button
            onClick={() => toggleFlagMutation.mutate({ publicado: !proyecto.publicado })}
            className="cursor-pointer"
          >
            <Badge variant={proyecto.publicado ? 'confirmada' : 'default'}>{proyecto.publicado ? 'Publicado' : 'No publicado'}</Badge>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5 items-start">
        <div className="flex flex-col gap-4 min-w-0">
          <div className="bg-surface border border-gray-200 rounded-sm p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Datos del proyecto</p>
              {!editando && (
                <button onClick={() => setEditando(true)} className="text-xs text-gray-500 hover:text-brand flex items-center gap-1">
                  <Pencil size={11} />
                  Editar
                </button>
              )}
            </div>
            {editando ? (
              <div className="flex flex-col gap-3">
                <Input label="Título" value={form.titulo} onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))} />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input label="Tipo de obra" value={form.tipo_obra} onChange={(e) => setForm((f) => ({ ...f, tipo_obra: e.target.value }))} />
                  <Input label="Zona" value={form.zona} onChange={(e) => setForm((f) => ({ ...f, zona: e.target.value }))} />
                </div>
                <Input
                  label="Fecha de la obra"
                  type="date"
                  value={form.fecha_obra}
                  onChange={(e) => setForm((f) => ({ ...f, fecha_obra: e.target.value }))}
                />
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Descripción</label>
                  <textarea
                    value={form.descripcion}
                    onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
                    className="w-full border border-gray-200 rounded-sm px-2.5 py-1.5 text-sm min-h-[80px] focus:border-brand focus:outline-none"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={() => guardarMutation.mutate()} disabled={guardarMutation.isPending || !form.titulo.trim()}>
                    {guardarMutation.isPending ? 'Guardando...' : 'Guardar'}
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setEditando(false)}>
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{proyecto.descripcion || 'Sin descripción.'}</p>
            )}
          </div>

          <div className="bg-surface border border-gray-200 rounded-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 flex items-center gap-1.5">
                <Images size={13} />
                Fotos y vídeos ({proyecto.fotos.length})
              </p>
              <Button size="sm" onClick={() => navigate(`/galeria/${id}/media`)}>
                Ver fotos y vídeos
              </Button>
            </div>
            {portada.length > 0 ? (
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {portada.map((f) => (
                  <div key={f.url} className="aspect-square rounded-sm overflow-hidden bg-gray-50">
                    {f.tipo_archivo === 'video' ? (
                      <video src={f.url} muted className="w-full h-full object-cover" />
                    ) : (
                      <img src={f.url} alt={f.nombre} className="w-full h-full object-cover" />
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 text-gray-300 py-8">
                <ImageOff size={24} />
                <p className="text-xs text-gray-400">Sin fotos ni vídeos todavía</p>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="bg-surface border border-gray-200 rounded-sm p-3.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Relaciones</p>
            {presupuesto && (
              <button
                onClick={() => navigate('/finanzas/presupuestos', { state: { verDocId: presupuesto.id, verDocTipo: 'presupuesto' } })}
                className="flex items-center justify-between w-full text-left px-2.5 py-1.5 rounded-sm hover:bg-brand-light text-sm"
              >
                <span className="flex items-center gap-1.5">
                  <FileText size={13} className="text-gray-400" />
                  Presupuesto {presupuesto.numero ?? 'S/N'} <span className="text-gray-400">· {presupuesto.estado}</span>
                </span>
                <ExternalLink size={13} className="text-gray-400" />
              </button>
            )}
            {(facturas ?? []).map((f) => (
              <button
                key={f.id}
                onClick={() => navigate('/finanzas/facturas', { state: { verDocId: f.id, verDocTipo: 'factura' } })}
                className="flex items-center justify-between w-full text-left px-2.5 py-1.5 rounded-sm hover:bg-brand-light text-sm"
              >
                <span className="flex items-center gap-1.5">
                  <Receipt size={13} className="text-gray-400" />
                  {f.tipo === 'acompte' ? 'Acompte' : 'Factura'} {f.numero ?? 'S/N'} <span className="text-gray-400">· {f.estado_cobro}</span>
                </span>
                <ExternalLink size={13} className="text-gray-400" />
              </button>
            ))}
            {planning && (
              <button
                onClick={() => navigate('/planning-obra')}
                className="flex items-center justify-between w-full text-left px-2.5 py-1.5 rounded-sm hover:bg-brand-light text-sm"
              >
                <span className="flex items-center gap-1.5">
                  <ClipboardList size={13} className="text-gray-400" />
                  Planning de obra <span className="text-gray-400">· {planning.estado}</span>
                  {planning.fases.length > 0 && (
                    <span className="text-gray-400">
                      · {planning.fases.filter((f) => f.completada).length}/{planning.fases.length} fases
                    </span>
                  )}
                </span>
                <ExternalLink size={13} className="text-gray-400" />
              </button>
            )}
            {!presupuesto && (facturas ?? []).length === 0 && !planning && (
              <p className="text-sm text-gray-400 px-2.5 py-1.5">Sin presupuesto, factura ni planning vinculados.</p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Button variant="secondary" onClick={handleDescargarZip} disabled={descargandoZip || proyecto.fotos.length === 0}>
              {descargandoZip ? 'Generando ZIP...' : 'Descargar proyecto ZIP'}
            </Button>
            <Button variant="danger" onClick={handleEliminarProyecto}>
              <span className="flex items-center gap-1.5 justify-center">
                <Trash2 size={14} />
                Eliminar proyecto
              </span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
