import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ChevronLeft, ChevronRight, Download, ImageOff, Pencil, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../hooks/useToast';
import { useConfirmar } from '../../hooks/useConfirm';
import { optimizarImagen } from '../../lib/optimizarImagen';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { TIPOS_FOTO } from './types';
import type { FotoGaleria, GaleriaProyecto, TipoFoto } from './types';

const BUCKET = 'galeria';

function pathDesdeUrl(url: string): string | null {
  const marca = `/storage/v1/object/public/${BUCKET}/`;
  const idx = url.indexOf(marca);
  return idx === -1 ? null : url.slice(idx + marca.length);
}

const TAMANO_MAX_FOTO = 10 * 1024 * 1024; // 10 MB (antes de optimizar)
const TAMANO_MAX_VIDEO = 100 * 1024 * 1024; // 100 MB

export default function GaleriaMediaPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const confirmar = useConfirmar();
  const queryClient = useQueryClient();

  const [tabActiva, setTabActiva] = useState<TipoFoto>('antes');
  const [indiceActual, setIndiceActual] = useState(0);
  const [categoriaSubida, setCategoriaSubida] = useState<TipoFoto>('antes');
  const [subiendo, setSubiendo] = useState(false);
  const [arrastrando, setArrastrando] = useState<number | null>(null);
  const [editandoUrl, setEditandoUrl] = useState<string | null>(null);
  const [metaTitulo, setMetaTitulo] = useState('');
  const [metaTipo, setMetaTipo] = useState<TipoFoto>('antes');
  const [metaDescripcion, setMetaDescripcion] = useState('');

  const { data: proyecto } = useQuery({
    queryKey: ['galeria', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from('galeria').select('*').eq('id', id).single();
      if (error) throw error;
      return data as GaleriaProyecto;
    },
  });

  const actualizarFotosMutation = useMutation({
    mutationFn: async (fotos: FotoGaleria[]) => {
      const { error } = await supabase.from('galeria').update({ fotos }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['galeria', id] });
      queryClient.invalidateQueries({ queryKey: ['galeria'] });
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
    setEditandoUrl(null);
  };

  const abrirEditor = (foto: FotoGaleria, indice: number) => {
    setIndiceActual(indice);
    setEditandoUrl(foto.url);
    setMetaTitulo(foto.titulo ?? '');
    setMetaTipo(foto.tipo);
    setMetaDescripcion(foto.descripcion ?? '');
  };

  const handleGuardarMeta = () => {
    if (!proyecto || !editandoUrl) return;
    const titulo = metaTitulo.trim() || null;
    const descripcion = metaDescripcion.trim() || null;
    actualizarFotosMutation.mutate(
      proyecto.fotos.map((f) => (f.url === editandoUrl ? { ...f, titulo, descripcion, tipo: metaTipo } : f)),
    );
    // Si cambió de categoría, seguimos viéndola: nos movemos a su nueva pestaña.
    if (metaTipo !== tabActiva) {
      setTabActiva(metaTipo);
      setIndiceActual(0);
    }
    setEditandoUrl(null);
  };

  const handleSubirFotos = async (files: FileList) => {
    if (!proyecto) return;
    const listaActual = proyecto.fotos.filter((f) => f.tipo === categoriaSubida);
    if (listaActual.length + files.length > 20 || proyecto.fotos.length + files.length > 20) {
      toast.error('Máximo 20 fotos/vídeos por proyecto');
      return;
    }
    setSubiendo(true);
    const nuevas: FotoGaleria[] = [];
    let ordenSiguiente = listaActual.length > 0 ? Math.max(...listaActual.map((f) => f.orden)) + 1 : 0;

    for (const fileOriginal of Array.from(files)) {
      const esVideo = fileOriginal.type.startsWith('video/');
      if (!esVideo && !fileOriginal.type.startsWith('image/')) {
        toast.error(`"${fileOriginal.name}": solo se admiten imágenes o vídeos`);
        continue;
      }
      const tamanoMax = esVideo ? TAMANO_MAX_VIDEO : TAMANO_MAX_FOTO;
      if (fileOriginal.size > tamanoMax) {
        toast.error(`"${fileOriginal.name}" pesa demasiado (máximo ${tamanoMax / 1024 / 1024} MB)`);
        continue;
      }
      // Las imágenes se redimensionan/recomprimen aquí antes de subir — los vídeos se suben tal
      // cual (ver optimizarImagen.ts).
      const file = esVideo ? fileOriginal : await optimizarImagen(fileOriginal);
      const path = `${proyecto.id}/${crypto.randomUUID()}_${file.name}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type });
      if (error) {
        toast.error(error.message);
        continue;
      }
      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
      nuevas.push({
        url: data.publicUrl,
        nombre: file.name,
        tipo: categoriaSubida,
        orden: ordenSiguiente,
        tipo_archivo: esVideo ? 'video' : 'foto',
        titulo: null,
        descripcion: null,
      });
      ordenSiguiente += 1;
    }

    setSubiendo(false);
    if (nuevas.length > 0) {
      actualizarFotosMutation.mutate([...proyecto.fotos, ...nuevas]);
      toast.success(`${nuevas.length} archivo(s) subido(s) y optimizado(s)`);
      if (categoriaSubida !== tabActiva) cambiarTab(categoriaSubida);
    }
  };

  const handleEliminarFoto = async (foto: FotoGaleria) => {
    if (!proyecto) return;
    if (!(await confirmar('¿Eliminar esta foto o vídeo?'))) return;
    const path = pathDesdeUrl(foto.url);
    if (path) {
      const { error } = await supabase.storage.from(BUCKET).remove([path]);
      if (error) {
        toast.error(error.message);
        return;
      }
    }
    setIndiceActual(0);
    if (editandoUrl === foto.url) setEditandoUrl(null);
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

  useEffect(() => {
    setEditandoUrl(null);
  }, [id]);

  if (!proyecto) return null;

  return (
    <div>
      <button
        onClick={() => navigate(`/galeria/${id}`)}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 mb-4"
      >
        <ArrowLeft size={15} />
        Volver a la ficha
      </button>

      <h1 className="text-lg font-semibold text-gray-900 mb-1">{proyecto.titulo || 'Sin título'}</h1>
      <p className="text-sm text-gray-500 mb-4">Fotos y vídeos — {proyecto.fotos.length} en total</p>

      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto mb-4">
        {TIPOS_FOTO.map((t) => (
          <button
            key={t.value}
            onClick={() => cambiarTab(t.value)}
            className={`shrink-0 px-4 py-2 text-xs font-semibold uppercase tracking-wide border-b-2 ${
              tabActiva === t.value ? 'border-brand text-brand' : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}
          >
            {t.label} ({proyecto.fotos.filter((f) => f.tipo === t.value).length})
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5 items-start">
        <div className="flex flex-col gap-3 min-w-0">
          <div className="bg-gray-50 border border-gray-200 rounded-sm h-[28rem] flex items-center justify-center relative overflow-hidden">
            {fotoActual ? (
              <>
                {fotoActual.tipo_archivo === 'video' ? (
                  <video src={fotoActual.url} controls className="max-w-full max-h-full" />
                ) : (
                  <img src={fotoActual.url} alt={fotoActual.nombre} className="max-w-full max-h-full object-contain" />
                )}
                <div className="absolute top-2 right-2 flex gap-1.5">
                  <button
                    onClick={() => abrirEditor(fotoActual, indiceActual)}
                    className="bg-surface/90 hover:bg-surface text-gray-700 rounded-sm p-1.5"
                    title="Editar"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => handleDescargarFoto(fotoActual)}
                    className="bg-surface/90 hover:bg-surface text-gray-700 rounded-sm p-1.5"
                    title="Descargar"
                  >
                    <Download size={14} />
                  </button>
                  <button
                    onClick={() => handleEliminarFoto(fotoActual)}
                    className="bg-surface/90 hover:bg-surface text-red-600 rounded-sm p-1.5"
                    title="Eliminar"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                {(fotoActual.titulo || fotoActual.descripcion) && (
                  <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white px-3 py-2">
                    {fotoActual.titulo && <p className="text-sm font-medium">{fotoActual.titulo}</p>}
                    {fotoActual.descripcion && <p className="text-xs text-white/80">{fotoActual.descripcion}</p>}
                  </div>
                )}
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
                <ImageOff size={32} />
                <p className="text-sm text-gray-400">Sin fotos ni vídeos en "{TIPOS_FOTO.find((t) => t.value === tabActiva)?.label}"</p>
              </div>
            )}
          </div>

          {fotosPorTab.length > 0 && (
            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
              {fotosPorTab.map((f, i) => (
                <div
                  key={f.url}
                  draggable
                  onDragStart={() => setArrastrando(i)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => handleSoltar(i)}
                  className={`relative aspect-square rounded-sm overflow-hidden border-2 cursor-pointer group ${
                    i === indiceActual ? 'border-brand' : 'border-transparent'
                  }`}
                >
                  <div onClick={() => setIndiceActual(i)} className="w-full h-full">
                    {f.tipo_archivo === 'video' ? (
                      <video src={f.url} muted className="w-full h-full object-cover pointer-events-none" />
                    ) : (
                      <img src={f.url} alt={f.nombre} className="w-full h-full object-cover" />
                    )}
                  </div>
                  <button
                    onClick={() => abrirEditor(f, i)}
                    className="absolute top-1 right-1 bg-surface/90 text-gray-700 rounded-sm p-1 opacity-0 group-hover:opacity-100"
                    title="Editar"
                  >
                    <Pencil size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {editandoUrl && (
            <div className="bg-surface border border-brand rounded-sm p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">Editar foto/vídeo</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                <Input
                  label="Título"
                  value={metaTitulo}
                  onChange={(e) => setMetaTitulo(e.target.value)}
                  placeholder="Ej. Baño antes de la reforma"
                />
                <Select
                  label="Tipo"
                  options={TIPOS_FOTO.map((t) => ({ value: t.value, label: t.label }))}
                  value={metaTipo}
                  onChange={(e) => setMetaTipo(e.target.value as TipoFoto)}
                />
              </div>
              <div className="mb-3">
                <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Descripción</label>
                <textarea
                  value={metaDescripcion}
                  onChange={(e) => setMetaDescripcion(e.target.value)}
                  className="w-full border border-gray-200 rounded-sm px-2.5 py-1.5 text-sm min-h-[70px] focus:border-brand focus:outline-none"
                  placeholder="Detalle opcional de esta foto/vídeo"
                />
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={handleGuardarMeta} disabled={actualizarFotosMutation.isPending}>
                  Guardar
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setEditandoUrl(null)}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <div className="bg-surface border border-gray-200 rounded-sm p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">Subir fotos/vídeos</p>
            <Select
              label="Categoría"
              options={TIPOS_FOTO.map((t) => ({ value: t.value, label: t.label }))}
              value={categoriaSubida}
              onChange={(e) => setCategoriaSubida(e.target.value as TipoFoto)}
              className="mb-2"
            />
            <input
              type="file"
              accept="image/*,video/*"
              multiple
              disabled={subiendo}
              onChange={(e) => e.target.files && handleSubirFotos(e.target.files)}
              className="text-xs w-full"
            />
            <p className="text-xs text-gray-400 mt-2">
              Máximo 20 fotos/vídeos por proyecto (vídeo hasta {TAMANO_MAX_VIDEO / 1024 / 1024} MB). Las fotos se optimizan
              automáticamente al subirlas. Arrastra las miniaturas para reordenarlas.
            </p>
            {subiendo && <p className="text-xs text-brand mt-2">Optimizando y subiendo...</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
