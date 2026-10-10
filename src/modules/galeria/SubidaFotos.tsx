import { useEffect, useRef, useState } from 'react';
import { Camera, CheckCircle2, FolderOpen, RefreshCw, Upload, Video, X } from 'lucide-react';
import { useToast } from '../../hooks/useToast';
import { mensajeError } from '../../lib/mensajeError';
import { errorDeCupo, guardarFotos, siguienteOrden, subirArchivo, validarArchivo, MAX_FOTOS_PROYECTO, TAMANO_MAX_VIDEO } from './media';
import { TIPOS_FOTO, type FotoGaleria, type TipoFoto } from './types';

// Zona de subida de la ficha de obra (galería v2, 2026-10-10): arrastrar y soltar, elegir archivos o
// hacer una foto con la cámara; validación antes de subir con el motivo concreto; vista previa y
// estado por archivo; reintento del que falle. Cada archivo se procesa (original + miniatura o
// póster), se sube y se añade a la ficha de uno en uno, así lo ya subido no se pierde si falla el
// siguiente o se cierra la pestaña.

type Estado = 'esperando' | 'subiendo' | 'hecho' | 'error';
type Item = { id: string; file: File; preview: string | null; estado: Estado; error?: string };

type Props = {
  galeriaId: string;
  fotos: FotoGaleria[];
  categoria: TipoFoto;
  onCategoria: (t: TipoFoto) => void;
  onSubida: () => void;
};

export function SubidaFotos({ galeriaId, fotos, categoria, onCategoria, onSubida }: Props) {
  const toast = useToast();
  const [items, setItems] = useState<Item[]>([]);
  const [arrastrando, setArrastrando] = useState(false);
  const inputArchivos = useRef<HTMLInputElement>(null);
  const inputCamara = useRef<HTMLInputElement>(null);
  const procesando = useRef(false);

  const enCola = items.filter((i) => i.estado === 'esperando' || i.estado === 'subiendo').length;
  const quedan = Math.max(0, MAX_FOTOS_PROYECTO - fotos.length - enCola);

  useEffect(() => () => items.forEach((i) => i.preview && URL.revokeObjectURL(i.preview)), [items]);

  const anadir = (lista: FileList | File[]) => {
    const archivos = Array.from(lista);
    const validos: File[] = [];
    for (const f of archivos) {
      const v = validarArchivo(f);
      if (v.ok) validos.push(f);
      else toast.error(v.motivo);
    }
    if (validos.length === 0) return;
    const cupo = errorDeCupo(fotos, enCola + validos.length);
    if (cupo) {
      toast.error(cupo);
      return;
    }
    const nuevos: Item[] = validos.map((file) => ({
      id: crypto.randomUUID(),
      file,
      preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
      estado: 'esperando',
    }));
    setItems((actual) => [...actual.filter((i) => i.estado !== 'hecho'), ...nuevos]);
  };

  // Procesa la cola de uno en uno. Se vuelve a lanzar cada vez que cambia la lista.
  useEffect(() => {
    if (procesando.current) return;
    const siguiente = items.find((i) => i.estado === 'esperando');
    if (!siguiente) return;
    procesando.current = true;
    const tipo = categoria;
    (async () => {
      setItems((a) => a.map((i) => (i.id === siguiente.id ? { ...i, estado: 'subiendo' } : i)));
      try {
        const nueva = await subirArchivo(galeriaId, { archivo: siguiente.file, nombre: siguiente.file.name, mime: siguiente.file.type, lastModified: siguiente.file.lastModified }, tipo, 0);
        await guardarFotos(galeriaId, null, (actuales) => {
          const cupo = errorDeCupo(actuales, 1);
          if (cupo) throw new Error(cupo);
          return [...actuales, { ...nueva, orden: siguienteOrden(actuales, tipo) }];
        });
        setItems((a) => a.map((i) => (i.id === siguiente.id ? { ...i, estado: 'hecho' } : i)));
        onSubida();
      } catch (err) {
        setItems((a) => a.map((i) => (i.id === siguiente.id ? { ...i, estado: 'error', error: mensajeError(err, 'No se pudo subir') } : i)));
      } finally {
        procesando.current = false;
        // Fuerza una pasada más por si quedan elementos esperando.
        setItems((a) => [...a]);
      }
    })();
  }, [items, galeriaId, categoria, onSubida]);

  const reintentar = (id: string) => setItems((a) => a.map((i) => (i.id === id ? { ...i, estado: 'esperando', error: undefined } : i)));
  const quitar = (id: string) => setItems((a) => a.filter((i) => i.id !== id));
  const hechos = items.filter((i) => i.estado === 'hecho').length;

  return (
    <div className="bg-surface border border-gray-200 rounded-sm p-4">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 flex items-center gap-1.5">
          <Upload size={13} />
          Subir fotos y vídeos
        </p>
        <span className="text-xs text-gray-500">
          {quedan === 0 ? `Obra completa (${MAX_FOTOS_PROYECTO} máx.)` : `Quedan ${quedan} de ${MAX_FOTOS_PROYECTO}`}
        </span>
      </div>

      <div className="mb-3">
        <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Momento de la obra</span>
        <div className="grid grid-cols-4 gap-1.5">
          {TIPOS_FOTO.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => onCategoria(t.value)}
              aria-pressed={categoria === t.value}
              className={`px-2 py-1.5 rounded-sm text-xs border ${
                categoria === t.value ? 'bg-brand text-white border-brand' : 'bg-white text-gray-700 border-gray-200 hover:border-brand'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setArrastrando(true);
        }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastrando(false);
          if (quedan > 0) anadir(e.dataTransfer.files);
        }}
        className={`border-2 border-dashed rounded-sm p-4 text-center transition-colors ${
          arrastrando ? 'border-brand bg-brand-light' : 'border-gray-200 bg-gray-50'
        }`}
      >
        <p className="text-sm text-gray-600 mb-3">Arrastra aquí las fotos o vídeos, o elige cómo añadirlos:</p>
        <div className="flex items-center justify-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => inputArchivos.current?.click()}
            disabled={quedan === 0}
            className="bg-brand text-white px-3 py-2 rounded-sm text-sm flex items-center gap-2 disabled:opacity-60"
          >
            <FolderOpen size={15} />
            Elegir archivos
          </button>
          <button
            type="button"
            onClick={() => inputCamara.current?.click()}
            disabled={quedan === 0}
            className="bg-white border border-gray-200 text-gray-700 px-3 py-2 rounded-sm text-sm flex items-center gap-2 disabled:opacity-60 md:hidden"
          >
            <Camera size={15} />
            Hacer foto
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-3">
          JPG, PNG o WebP (se optimizan solas) · vídeo MP4, MOV o WebM hasta {TAMANO_MAX_VIDEO / 1024 / 1024} MB · las fotos HEIC del iPhone no se admiten
        </p>
        {/* Sin image/heic en accept: Safari 17 convertiría a HEIC todo lo elegido. */}
        <input
          ref={inputArchivos}
          type="file"
          accept="image/*,video/mp4,video/quicktime,video/webm"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) anadir(e.target.files);
            e.target.value = '';
          }}
        />
        <input
          ref={inputCamara}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            if (e.target.files) anadir(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {items.length > 0 && (
        <ul role="list" className="mt-3 flex flex-col gap-1.5">
          {items.map((i) => (
            <li key={i.id} className="flex items-center gap-2.5 text-sm border border-gray-200 rounded-sm px-2 py-1.5 bg-white">
              <div className="w-10 h-10 rounded-sm bg-gray-100 overflow-hidden shrink-0 flex items-center justify-center text-gray-400">
                {i.preview ? <img src={i.preview} alt="" className="w-full h-full object-cover" /> : <Video size={16} />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-gray-800">{i.file.name}</p>
                <p className={`text-xs ${i.estado === 'error' ? 'text-red-600' : 'text-gray-400'}`}>
                  {i.estado === 'esperando' && 'En cola'}
                  {i.estado === 'subiendo' && 'Optimizando y subiendo…'}
                  {i.estado === 'hecho' && 'Subida'}
                  {i.estado === 'error' && i.error}
                </p>
              </div>
              {i.estado === 'subiendo' && <RefreshCw size={15} className="text-brand animate-spin shrink-0" />}
              {i.estado === 'hecho' && <CheckCircle2 size={16} className="text-brand shrink-0" />}
              {i.estado === 'error' && (
                <button type="button" onClick={() => reintentar(i.id)} className="text-xs text-brand hover:underline shrink-0">
                  Reintentar
                </button>
              )}
              {i.estado !== 'subiendo' && (
                <button type="button" onClick={() => quitar(i.id)} className="text-gray-400 hover:text-gray-700 shrink-0" aria-label="Quitar de la lista">
                  <X size={14} />
                </button>
              )}
            </li>
          ))}
          {hechos > 0 && hechos === items.length && (
            <li className="text-right">
              <button type="button" onClick={() => setItems([])} className="text-xs text-gray-500 hover:text-gray-900">
                Limpiar lista
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
