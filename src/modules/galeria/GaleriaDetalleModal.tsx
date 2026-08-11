import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import JSZip from 'jszip';
import { mensajeError } from '../../lib/mensajeError';
import { ChevronLeft, ChevronRight, Download, ImageOff, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../hooks/useToast';
import { useConfirmar } from '../../hooks/useConfirm';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Select';
import { Badge } from '../../components/ui/Badge';
import { TIPOS_FOTO } from './types';
import type { FotoGaleria, GaleriaProyecto, TipoFoto } from './types';
import { GaleriaForm } from './GaleriaForm';

const BUCKET = 'galeria';

function pathDesdeUrl(url: string): string | null {
  const marca = `/storage/v1/object/public/${BUCKET}/`;
  const idx = url.indexOf(marca);
  return idx === -1 ? null : url.slice(idx + marca.length);
}

type GaleriaDetalleModalProps = {
  proyectoId: string | null;
  onClose: () => void;
  onEliminado: () => void;
};

export function GaleriaDetalleModal({ proyectoId, onClose, onEliminado }: GaleriaDetalleModalProps) {
  const toast = useToast();
  const confirmar = useConfirmar();
  const queryClient = useQueryClient();
  const [tabActiva, setTabActiva] = useState<TipoFoto>('antes');
  const [indiceActual, setIndiceActual] = useState(0);
  const [categoriaSubida, setCategoriaSubida] = useState<TipoFoto>('antes');
  const [subiendo, setSubiendo] = useState(false);
  const [descargandoZip, setDescargandoZip] = useState(false);
  const [editando, setEditando] = useState(false);
  const [arrastrando, setArrastrando] = useState<number | null>(null);

  const { data: proyecto } = useQuery({
    queryKey: ['galeria', proyectoId],
    enabled: !!proyectoId,
    queryFn: async () => {
      const { data, error } = await supabase.from('galeria').select('*').eq('id', proyectoId).single();
      if (error) throw error;
      return data as GaleriaProyecto;
    },
  });

  const actualizarFotosMutation = useMutation({
    mutationFn: async (fotos: FotoGaleria[]) => {
      if (!proyecto) return;
      const { error } = await supabase.from('galeria').update({ fotos }).eq('id', proyecto.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['galeria', proyecto?.id] });
      queryClient.invalidateQueries({ queryKey: ['galeria'] });
    },
    onError: (error) => toast.error(error.message),
  });

  const eliminarProyectoMutation = useMutation({
    mutationFn: async () => {
      if (!proyecto) return { fotosNoEliminadas: 0 };
      // No abortamos el borrado del proyecto si falla el borrado de alguna foto en Storage —
      // avisamos después de cuántas quedaron huérfanas en vez de bloquear la acción principal.
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
      onEliminado();
    },
    onError: (error) => toast.error(error.message),
  });

  const fotosPorTab = useMemo(() => {
    if (!proyecto) return [];
    return proyecto.fotos.filter((f) => f.tipo === tabActiva).sort((a, b) => a.orden - b.orden);
  }, [proyecto, tabActiva]);

  const fotoActual = fotosPorTab[indiceActual] ?? null;

  const cambiarTab = (tipo: TipoFoto) => {
    setTabActiva(tipo);
    setIndiceActual(0);
  };

  const handleSubirFotos = async (files: FileList) => {
    if (!proyecto) return;
    const listaActual = proyecto.fotos.filter((f) => f.tipo === categoriaSubida);
    if (listaActual.length + files.length > 20 || proyecto.fotos.length + files.length > 20) {
      toast.error('Máximo 20 fotos por proyecto');
      return;
    }
    setSubiendo(true);
    const nuevas: FotoGaleria[] = [];
    let ordenSiguiente = listaActual.length > 0 ? Math.max(...listaActual.map((f) => f.orden)) + 1 : 0;

    for (const file of Array.from(files)) {
      const path = `${proyecto.id}/${Date.now()}_${file.name}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type });
      if (error) {
        toast.error(error.message);
        continue;
      }
      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
      nuevas.push({ url: data.publicUrl, nombre: file.name, tipo: categoriaSubida, orden: ordenSiguiente });
      ordenSiguiente += 1;
    }

    setSubiendo(false);
    if (nuevas.length > 0) {
      actualizarFotosMutation.mutate([...proyecto.fotos, ...nuevas]);
      toast.success(`${nuevas.length} foto(s) subida(s)`);
    }
  };

  const handleEliminarFoto = async (foto: FotoGaleria) => {
    if (!proyecto) return;
    if (!(await confirmar('¿Eliminar esta foto?'))) return;
    const path = pathDesdeUrl(foto.url);
    if (path) {
      const { error } = await supabase.storage.from(BUCKET).remove([path]);
      if (error) {
        toast.error(error.message);
        return;
      }
    }
    setIndiceActual(0);
    actualizarFotosMutation.mutate(proyecto.fotos.filter((f) => f.url !== foto.url));
  };

  const handleSoltar = (indiceDestino: number) => {
    if (arrastrando === null || arrastrando === indiceDestino || !proyecto) {
      setArrastrando(null);
      return;
    }
    const reordenadas = [...fotosPorTab];
    const [movida] = reordenadas.splice(arrastrando, 1);
    reordenadas.splice(indiceDestino, 0, movida);
    const conNuevoOrden = reordenadas.map((f, i) => ({ ...f, orden: i }));
    const otrasTabs = proyecto.fotos.filter((f) => f.tipo !== tabActiva);
    setArrastrando(null);
    actualizarFotosMutation.mutate([...otrasTabs, ...conNuevoOrden]);
  };

  const handleDescargarFoto = (foto: FotoGaleria) => {
    const enlace = document.createElement('a');
    enlace.href = foto.url;
    enlace.download = foto.nombre;
    enlace.target = '_blank';
    enlace.rel = 'noopener noreferrer';
    enlace.click();
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

  const handleEliminarProyecto = async () => {
    if (!(await confirmar('¿Eliminar este proyecto de la galería? Se borrarán también sus fotos.'))) return;
    eliminarProyectoMutation.mutate();
  };

  if (!proyectoId || !proyecto) return null;

  return (
    <>
      <Modal
        open={!!proyectoId}
        onClose={onClose}
        title={proyecto.titulo ?? 'Proyecto'}
        footer={
          <>
            <Button variant="secondary" onClick={handleDescargarZip} disabled={descargandoZip || proyecto.fotos.length === 0}>
              {descargandoZip ? 'Generando ZIP...' : 'Descargar proyecto ZIP'}
            </Button>
            <Button variant="danger" onClick={handleEliminarProyecto}>
              Eliminar proyecto
            </Button>
            <Button onClick={() => setEditando(true)}>Editar datos</Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            {proyecto.destacado && <Badge variant="realizada">Destacado</Badge>}
            <Badge variant={proyecto.publicado ? 'confirmada' : 'default'}>{proyecto.publicado ? 'Publicado' : 'No publicado'}</Badge>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div>
              <p className="text-gray-400 uppercase tracking-wide">Tipo de obra</p>
              <p className="text-gray-800">{proyecto.tipo_obra || '—'}</p>
            </div>
            <div>
              <p className="text-gray-400 uppercase tracking-wide">Zona</p>
              <p className="text-gray-800">{proyecto.zona || '—'}</p>
            </div>
            <div>
              <p className="text-gray-400 uppercase tracking-wide">Fecha</p>
              <p className="text-gray-800">{proyecto.fecha_obra || '—'}</p>
            </div>
          </div>

          {proyecto.descripcion && <p className="text-sm text-gray-700">{proyecto.descripcion}</p>}

          <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
            {TIPOS_FOTO.map((t) => (
              <button
                key={t.value}
                onClick={() => cambiarTab(t.value)}
                className={`shrink-0 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide border-b-2 ${
                  tabActiva === t.value ? 'border-brand text-brand' : 'border-transparent text-gray-400 hover:text-gray-600'
                }`}
              >
                {t.label} ({proyecto.fotos.filter((f) => f.tipo === t.value).length})
              </button>
            ))}
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded-sm h-64 flex items-center justify-center relative overflow-hidden">
            {fotoActual ? (
              <>
                <img src={fotoActual.url} alt={fotoActual.nombre} className="max-w-full max-h-full object-contain" />
                <button
                  onClick={() => handleDescargarFoto(fotoActual)}
                  className="absolute top-2 right-2 bg-surface/90 hover:bg-surface text-gray-700 rounded-sm p-1.5"
                  title="Descargar foto"
                >
                  <Download size={14} />
                </button>
                <button
                  onClick={() => handleEliminarFoto(fotoActual)}
                  className="absolute top-2 right-10 bg-surface/90 hover:bg-surface text-red-600 rounded-sm p-1.5"
                  title="Eliminar foto"
                >
                  <Trash2 size={14} />
                </button>
                {fotosPorTab.length > 1 && (
                  <>
                    <button
                      onClick={() => setIndiceActual((i) => (i === 0 ? fotosPorTab.length - 1 : i - 1))}
                      className="absolute left-2 top-1/2 -translate-y-1/2 bg-surface/90 hover:bg-surface text-gray-700 rounded-sm p-1.5"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <button
                      onClick={() => setIndiceActual((i) => (i === fotosPorTab.length - 1 ? 0 : i + 1))}
                      className="absolute right-2 top-1/2 -translate-y-1/2 bg-surface/90 hover:bg-surface text-gray-700 rounded-sm p-1.5"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center gap-2 text-gray-300">
                <ImageOff size={28} />
                <p className="text-xs text-gray-400">Sin fotos en "{TIPOS_FOTO.find((t) => t.value === tabActiva)?.label}"</p>
              </div>
            )}
          </div>

          {fotosPorTab.length > 0 && (
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {fotosPorTab.map((f, i) => (
                <div
                  key={f.url}
                  draggable
                  onDragStart={() => setArrastrando(i)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => handleSoltar(i)}
                  onClick={() => setIndiceActual(i)}
                  className={`w-14 h-14 shrink-0 rounded-sm overflow-hidden border-2 cursor-pointer ${
                    i === indiceActual ? 'border-brand' : 'border-transparent'
                  }`}
                >
                  <img src={f.url} alt={f.nombre} className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2 border-t border-gray-200 pt-3">
            <Select
              options={TIPOS_FOTO.map((t) => ({ value: t.value, label: t.label }))}
              value={categoriaSubida}
              onChange={(e) => setCategoriaSubida(e.target.value as TipoFoto)}
              className="w-36"
            />
            <input
              type="file"
              accept="image/*"
              multiple
              disabled={subiendo}
              onChange={(e) => e.target.files && handleSubirFotos(e.target.files)}
              className="text-xs flex-1"
            />
          </div>
          <p className="text-xs text-gray-400 -mt-2">Máximo 20 fotos por proyecto. Arrastra las miniaturas para reordenarlas.</p>
        </div>
      </Modal>

      <GaleriaForm open={editando} onClose={() => setEditando(false)} proyecto={proyecto} />
    </>
  );
}
