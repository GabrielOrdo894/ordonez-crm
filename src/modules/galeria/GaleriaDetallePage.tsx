import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { downloadZip } from 'client-zip';
import { ArrowLeft, ClipboardList, Download, ExternalLink, FileText, Globe, Images, Pencil, Receipt, Share2, Star, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../hooks/useToast';
import { useConfirmar } from '../../hooks/useConfirm';
import { useSeleccionMultiple } from '../../hooks/useSeleccionMultiple';
import { mensajeError } from '../../lib/mensajeError';
import { fechaCorta } from '../../lib/fechas';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Modal } from '../../components/ui/Modal';
import { BulkActionsBar } from '../../components/ui/BulkActionsBar';
import type { AccionMenu } from '../../components/ui/DropdownMenu';
import { borrarArchivos, comoJpeg, completarMiniaturas, descargarBlob, guardarFotos, moverACategoria, reordenarCategoria } from './media';
import { SubidaFotos } from './SubidaFotos';
import { RejillaFotos } from './RejillaFotos';
import { VisorFotos } from './VisorFotos';
import { ComparadorAntesDespues } from './ComparadorAntesDespues';
import { etiquetaTipoObra, portadaDe, TIPOS_FOTO, TIPOS_OBRA, type FotoGaleria, type GaleriaProyecto, type TipoFoto } from './types';

// Ficha de obra de la Galería (v2, 2026-10-10): toda la obra en una sola página — subida, rejilla por
// categoría con selección múltiple y reordenación, visor a pantalla completa, comparador
// antes/después, y en el lateral los datos, los interruptores de destacada/web, las relaciones y
// las acciones de descarga, compartir y eliminar. Sustituye a la pareja ficha + /media.

type FormState = { titulo: string; tipo_obra_clave: string; zona: string; fecha_obra: string; descripcion: string };
type PresupuestoResumen = { id: string; numero: string | null; estado: string };
type FacturaResumen = { id: string; numero: string | null; estado_cobro: string; tipo: string };
type PlanningResumen = { id: string; estado: string; fases: { completada: boolean }[] };
type Categoria = TipoFoto | 'todas';

export default function GaleriaDetallePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const confirmar = useConfirmar();
  const queryClient = useQueryClient();
  const [categoria, setCategoria] = useState<Categoria>('todas');
  const [categoriaSubida, setCategoriaSubida] = useState<TipoFoto>('durante');
  const [indiceVisor, setIndiceVisor] = useState<number | null>(null);
  const [editandoDatos, setEditandoDatos] = useState(false);
  const [form, setForm] = useState<FormState>({ titulo: '', tipo_obra_clave: '', zona: '', fecha_obra: '', descripcion: '' });
  const [fotoEnEdicion, setFotoEnEdicion] = useState<FotoGaleria | null>(null);
  const [metaTitulo, setMetaTitulo] = useState('');
  const [metaDescripcion, setMetaDescripcion] = useState('');
  const [progresoZip, setProgresoZip] = useState<{ hecho: number; total: number } | null>(null);
  const [compartiendo, setCompartiendo] = useState(false);
  const { seleccion, toggleFila, limpiar } = useSeleccionMultiple();
  const miniaturasRevisadas = useRef(false);

  const { data: proyecto, isLoading } = useQuery({
    queryKey: ['galeria', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from('galeria').select('*').eq('id', id).single();
      if (error) throw error;
      return data as GaleriaProyecto;
    },
  });

  const invalidar = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['galeria', id] });
    queryClient.invalidateQueries({ queryKey: ['galeria'], exact: true });
  }, [queryClient, id]);

  // Fotos de antes de la v2: se les genera la miniatura la primera vez que se abre la obra.
  useEffect(() => {
    if (!proyecto || miniaturasRevisadas.current) return;
    miniaturasRevisadas.current = true;
    completarMiniaturas(proyecto)
      .then((cambio) => cambio && invalidar())
      .catch((err) => console.warn('Miniaturas:', err));
  }, [proyecto, invalidar]);

  useEffect(() => {
    if (!proyecto) return;
    setForm({
      titulo: proyecto.titulo ?? '',
      tipo_obra_clave: proyecto.tipo_obra_clave ?? '',
      zona: proyecto.zona ?? '',
      fecha_obra: proyecto.fecha_obra ?? '',
      descripcion: proyecto.descripcion ?? '',
    });
  }, [proyecto]);

  const { data: presupuesto } = useQuery({
    queryKey: ['galeria', 'presupuesto', proyecto?.presupuesto_id],
    enabled: !!proyecto?.presupuesto_id,
    queryFn: async () => {
      const { data, error } = await supabase.from('presupuestos').select('id, numero, estado').eq('id', proyecto!.presupuesto_id!).single();
      if (error) throw error;
      return data as PresupuestoResumen;
    },
  });

  const { data: facturas } = useQuery({
    queryKey: ['galeria', 'facturas', proyecto?.presupuesto_id, proyecto?.factura_id],
    enabled: !!proyecto?.presupuesto_id || !!proyecto?.factura_id,
    queryFn: async () => {
      const query = supabase.from('facturas').select('id, numero, estado_cobro, tipo').is('eliminado_en', null);
      const { data, error } = proyecto?.presupuesto_id ? await query.eq('presupuesto_id', proyecto.presupuesto_id) : await query.eq('id', proyecto!.factura_id!);
      if (error) throw error;
      return data as FacturaResumen[];
    },
  });

  const { data: planning } = useQuery({
    queryKey: ['galeria', 'planning', proyecto?.presupuesto_id],
    enabled: !!proyecto?.presupuesto_id,
    queryFn: async () => {
      const { data, error } = await supabase.from('proyectos').select('id, estado, fases').eq('presupuesto_id', proyecto!.presupuesto_id!).limit(1).maybeSingle();
      if (error) throw error;
      return data as PlanningResumen | null;
    },
  });

  // ---- Mutaciones ----------------------------------------------------------------------------

  const fotosMutation = useMutation({
    mutationFn: async ({ mutar, mensaje }: { mutar: (fotos: FotoGaleria[]) => FotoGaleria[]; mensaje?: string }) => {
      await guardarFotos(id!, proyecto?.updated_at ?? null, mutar);
      return mensaje;
    },
    onSuccess: (mensaje) => {
      invalidar();
      if (mensaje) toast.success(mensaje);
    },
    onError: (error) => toast.error(mensajeError(error, 'No se pudo guardar')),
  });

  const fichaMutation = useMutation({
    mutationFn: async (patch: Partial<GaleriaProyecto>) => {
      const { error } = await supabase.from('galeria').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => invalidar(),
    onError: (error) => toast.error(mensajeError(error, 'No se pudo guardar')),
  });

  const eliminarFotosMutation = useMutation({
    mutationFn: async (fotos: FotoGaleria[]) => {
      const urls = new Set(fotos.map((f) => f.url));
      // Primero la ficha, después los archivos: un archivo huérfano no molesta, una foto rota sí.
      await guardarFotos(id!, proyecto?.updated_at ?? null, (actuales) => actuales.filter((f) => !urls.has(f.url)));
      if (proyecto?.portada_url && urls.has(proyecto.portada_url)) {
        const { error } = await supabase.from('galeria').update({ portada_url: null }).eq('id', id);
        if (error) throw error;
      }
      return borrarArchivos(fotos);
    },
    onSuccess: (fallidas, fotos) => {
      invalidar();
      limpiar();
      setIndiceVisor(null);
      if (fallidas > 0) toast.warning(`${fotos.length} eliminada(s) de la ficha, pero ${fallidas} archivo(s) no se pudieron borrar del almacenamiento`);
      else toast.success(fotos.length === 1 ? 'Foto eliminada' : `${fotos.length} fotos eliminadas`);
    },
    onError: (error) => toast.error(mensajeError(error, 'No se pudo eliminar')),
  });

  const eliminarProyectoMutation = useMutation({
    mutationFn: async () => {
      if (!proyecto) return 0;
      const { error } = await supabase.from('galeria').delete().eq('id', proyecto.id);
      if (error) throw error;
      return borrarArchivos(proyecto.fotos);
    },
    onSuccess: (fallidas) => {
      queryClient.invalidateQueries({ queryKey: ['galeria'] });
      if (fallidas) toast.warning(`Obra eliminada de la galería, pero ${fallidas} archivo(s) no se pudieron borrar del almacenamiento`);
      else toast.success('Obra eliminada de la galería');
      navigate('/galeria');
    },
    onError: (error) => toast.error(mensajeError(error, 'No se pudo eliminar')),
  });

  // ---- Derivados -----------------------------------------------------------------------------

  const fotosOrdenadas = useMemo(() => {
    if (!proyecto) return [];
    const orden = (f: FotoGaleria) => TIPOS_FOTO.findIndex((t) => t.value === f.tipo) * 1000 + f.orden;
    return [...proyecto.fotos].sort((a, b) => orden(a) - orden(b));
  }, [proyecto]);
  const fotosVisibles = useMemo(() => (categoria === 'todas' ? fotosOrdenadas : fotosOrdenadas.filter((f) => f.tipo === categoria)), [fotosOrdenadas, categoria]);
  const seleccionadas = useMemo(() => fotosOrdenadas.filter((f) => seleccion.has(f.url)), [fotosOrdenadas, seleccion]);
  const portada = proyecto ? portadaDe(proyecto) : null;

  // ---- Acciones ------------------------------------------------------------------------------

  const abrirEditorFoto = (f: FotoGaleria) => {
    setFotoEnEdicion(f);
    setMetaTitulo(f.titulo ?? '');
    setMetaDescripcion(f.descripcion ?? '');
  };

  const guardarTextoFoto = () => {
    if (!fotoEnEdicion) return;
    const url = fotoEnEdicion.url;
    const titulo = metaTitulo.trim() || null;
    const descripcion = metaDescripcion.trim() || null;
    fotosMutation.mutate({ mutar: (fotos) => fotos.map((f) => (f.url === url ? { ...f, titulo, descripcion } : f)), mensaje: 'Texto guardado' });
    setFotoEnEdicion(null);
  };

  const moverSeleccion = (tipo: TipoFoto, fotos: FotoGaleria[]) => {
    const urls = new Set(fotos.map((f) => f.url));
    const etiqueta = TIPOS_FOTO.find((t) => t.value === tipo)?.label ?? tipo;
    fotosMutation.mutate({ mutar: (actuales) => moverACategoria(actuales, urls, tipo), mensaje: `Movida(s) a «${etiqueta}»` });
    limpiar();
  };

  const eliminarFotos = async (fotos: FotoGaleria[]) => {
    const texto = fotos.length === 1 ? '¿Eliminar esta foto o vídeo? No se puede deshacer.' : `¿Eliminar ${fotos.length} fotos/vídeos? No se puede deshacer.`;
    if (!(await confirmar({ mensaje: texto, peligroso: true, textoConfirmar: 'Eliminar' }))) return;
    eliminarFotosMutation.mutate(fotos);
  };

  const descargarFoto = async (f: FotoGaleria) => {
    try {
      const blob = await descargarBlob(f.url);
      const enlace = document.createElement('a');
      enlace.href = URL.createObjectURL(blob);
      enlace.download = f.nombre;
      enlace.click();
      URL.revokeObjectURL(enlace.href);
    } catch (err) {
      toast.error(mensajeError(err, 'No se pudo descargar'));
    }
  };

  const descargarZip = async (fotos: FotoGaleria[]) => {
    if (!proyecto || fotos.length === 0) return;
    setProgresoZip({ hecho: 0, total: fotos.length });
    try {
      let hecho = 0;
      const entradas: { name: string; input: Blob; lastModified?: Date }[] = [];
      for (const f of fotos) {
        const blob = await descargarBlob(f.url);
        const etiqueta = TIPOS_FOTO.find((t) => t.value === f.tipo)?.label ?? f.tipo;
        entradas.push({ name: `${etiqueta}/${String(f.orden + 1).padStart(2, '0')}_${f.nombre}`, input: blob });
        hecho += 1;
        setProgresoZip({ hecho, total: fotos.length });
      }
      const zip = await downloadZip(entradas).blob();
      const enlace = document.createElement('a');
      enlace.href = URL.createObjectURL(zip);
      enlace.download = `${(proyecto.titulo ?? 'galeria').replace(/[^\p{L}\p{N}]+/gu, '_').slice(0, 60)}.zip`;
      enlace.click();
      URL.revokeObjectURL(enlace.href);
    } catch (err) {
      toast.error(mensajeError(err, 'No se pudo generar el ZIP'));
    } finally {
      setProgresoZip(null);
    }
  };

  const puedeCompartir = typeof navigator !== 'undefined' && typeof navigator.share === 'function' && typeof navigator.canShare === 'function';

  const compartir = async (fotos: FotoGaleria[]) => {
    const soloFotos = fotos.filter((f) => f.tipo_archivo === 'foto').slice(0, 10);
    if (soloFotos.length === 0) {
      toast.warning('Selecciona alguna foto (los vídeos no se comparten desde aquí)');
      return;
    }
    setCompartiendo(true);
    try {
      const files = await Promise.all(soloFotos.map(comoJpeg));
      if (!navigator.canShare({ files })) throw new Error('Este dispositivo no permite compartir archivos');
      await navigator.share({ files, title: proyecto?.titulo ?? 'Reformas Ordoñez' });
    } catch (err) {
      if (!(err instanceof Error && err.name === 'AbortError')) toast.error(mensajeError(err, 'No se pudo compartir'));
    } finally {
      setCompartiendo(false);
    }
  };

  const copiarEnlaces = async (fotos: FotoGaleria[]) => {
    try {
      await navigator.clipboard.writeText(fotos.map((f) => f.url).join('\n'));
      toast.success(fotos.length === 1 ? 'Enlace copiado' : `${fotos.length} enlaces copiados`);
    } catch {
      toast.error('No se pudo copiar al portapapeles');
    }
  };

  const accionesDeFoto = (f: FotoGaleria): AccionMenu[] => {
    const lista = fotosOrdenadas.filter((x) => x.tipo === f.tipo).sort((a, b) => a.orden - b.orden);
    const pos = lista.findIndex((x) => x.url === f.url);
    return [
      { label: 'Ver', onClick: () => setIndiceVisor(fotosVisibles.findIndex((x) => x.url === f.url)) },
      { label: 'Editar título y descripción', onClick: () => abrirEditorFoto(f) },
      {
        label: proyecto?.portada_url === f.url ? 'Quitar como portada' : 'Usar como portada',
        onClick: () => fichaMutation.mutate({ portada_url: proyecto?.portada_url === f.url ? null : f.url }),
        oculto: f.tipo_archivo === 'video',
      },
      ...TIPOS_FOTO.filter((t) => t.value !== f.tipo).map((t) => ({ label: `Mover a «${t.label}»`, onClick: () => moverSeleccion(t.value, [f]) })),
      {
        label: 'Mover antes',
        oculto: pos <= 0,
        onClick: () => fotosMutation.mutate({ mutar: (fotos) => reordenarCategoria(fotos, f.tipo, f.url, lista[pos - 1].url) }),
      },
      {
        label: 'Mover después',
        oculto: pos === -1 || pos >= lista.length - 1,
        onClick: () => fotosMutation.mutate({ mutar: (fotos) => reordenarCategoria(fotos, f.tipo, f.url, lista[pos + 1].url) }),
      },
      { label: 'Descargar', onClick: () => descargarFoto(f) },
      { label: 'Copiar enlace', onClick: () => copiarEnlaces([f]) },
      { label: 'Eliminar', destructivo: true, onClick: () => eliminarFotos([f]) },
    ];
  };

  const guardarDatos = () => {
    if (!form.titulo.trim()) {
      toast.error('El título es obligatorio');
      return;
    }
    fichaMutation.mutate(
      {
        titulo: form.titulo.trim(),
        tipo_obra_clave: form.tipo_obra_clave || null,
        tipo_obra: etiquetaTipoObra(form.tipo_obra_clave) ?? proyecto?.tipo_obra ?? null,
        zona: form.zona.trim() || null,
        fecha_obra: form.fecha_obra || null,
        descripcion: form.descripcion.trim() || null,
      },
      { onSuccess: () => { setEditandoDatos(false); toast.success('Datos guardados'); } },
    );
  };

  const empezarEdicion = async () => {
    if (!(await confirmar({ mensaje: 'Vas a modificar los datos de esta obra. El cambio se guardará de forma permanente al pulsar Guardar.', textoConfirmar: 'Modificar' }))) return;
    setEditandoDatos(true);
  };

  if (isLoading || !proyecto) return null;

  const fotoVisor = indiceVisor !== null ? fotosVisibles[indiceVisor] ?? null : null;
  const contador = (t: Categoria) => (t === 'todas' ? proyecto.fotos.length : proyecto.fotos.filter((f) => f.tipo === t).length);

  return (
    <div>
      <button onClick={() => navigate('/galeria')} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 mb-4">
        <ArrowLeft size={15} />
        Volver a Galería
      </button>

      <div className="flex items-start justify-between mb-4 flex-wrap gap-2">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-gray-900 truncate">{proyecto.titulo || 'Sin título'}</h1>
          <p className="text-sm text-gray-500">
            {[etiquetaTipoObra(proyecto.tipo_obra_clave) ?? proyecto.tipo_obra, proyecto.zona, proyecto.fecha_obra ? fechaCorta(proyecto.fecha_obra) : null]
              .filter(Boolean)
              .join(' · ') || 'Sin datos'}
            {' · '}
            {proyecto.fotos.length} {proyecto.fotos.length === 1 ? 'archivo' : 'archivos'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fichaMutation.mutate({ destacado: !proyecto.destacado })}
            aria-pressed={proyecto.destacado}
            className={`px-2.5 py-1.5 rounded-sm text-xs border flex items-center gap-1.5 ${
              proyecto.destacado ? 'bg-amber-50 border-amber-300 text-amber-700' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-400'
            }`}
            title="Las obras destacadas salen primero en la lista"
          >
            <Star size={13} fill={proyecto.destacado ? 'currentColor' : 'none'} />
            {proyecto.destacado ? 'Destacada' : 'Destacar'}
          </button>
          <button
            type="button"
            onClick={() => fichaMutation.mutate({ publicado: !proyecto.publicado })}
            aria-pressed={proyecto.publicado}
            className={`px-2.5 py-1.5 rounded-sm text-xs border flex items-center gap-1.5 ${
              proyecto.publicado ? 'bg-brand-light border-brand text-brand' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-400'
            }`}
            title="Marca la obra como lista para mostrarse en la web (ordonezrenov.com)"
          >
            <Globe size={13} />
            {proyecto.publicado ? 'Visible en la web' : 'Mostrar en la web'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5 items-start">
        <div className="flex flex-col gap-4 min-w-0">
          <SubidaFotos galeriaId={proyecto.id} fotos={proyecto.fotos} categoria={categoriaSubida} onCategoria={setCategoriaSubida} onSubida={invalidar} />

          <div className="bg-surface border border-gray-200 rounded-sm p-4">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 flex items-center gap-1.5">
                <Images size={13} />
                Fotos y vídeos
              </p>
              <div className="flex gap-1 flex-wrap">
                {([{ value: 'todas', label: 'Todas' }, ...TIPOS_FOTO] as { value: Categoria; label: string }[]).map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => {
                      setCategoria(t.value);
                      limpiar();
                    }}
                    aria-pressed={categoria === t.value}
                    className={`px-2.5 py-1 rounded-sm text-xs border ${
                      categoria === t.value ? 'bg-brand text-white border-brand' : 'bg-white text-gray-700 border-gray-200 hover:border-brand'
                    }`}
                  >
                    {t.label} <span className={categoria === t.value ? 'text-white/80' : 'text-gray-400'}>{contador(t.value)}</span>
                  </button>
                ))}
              </div>
            </div>

            <BulkActionsBar
              count={seleccion.size}
              onCancelar={limpiar}
              acciones={[
                ...TIPOS_FOTO.map((t) => ({ label: `Mover a «${t.label}»`, onClick: () => moverSeleccion(t.value, seleccionadas) })),
                { label: 'Descargar ZIP', onClick: () => descargarZip(seleccionadas), disabled: !!progresoZip },
                { label: 'Copiar enlaces', onClick: () => copiarEnlaces(seleccionadas) },
                ...(puedeCompartir ? [{ label: 'Compartir (WhatsApp…)', onClick: () => compartir(seleccionadas), disabled: compartiendo }] : []),
                { label: 'Eliminar', variant: 'danger' as const, onClick: () => eliminarFotos(seleccionadas) },
              ]}
            />

            {fotosVisibles.length > 0 ? (
              <>
                <RejillaFotos
                  fotos={fotosVisibles}
                  seleccion={seleccion}
                  onToggleSeleccion={toggleFila}
                  onAbrir={setIndiceVisor}
                  onReordenar={
                    categoria === 'todas'
                      ? null
                      : (desde, hasta) => fotosMutation.mutate({ mutar: (fotos) => reordenarCategoria(fotos, categoria, desde, hasta) })
                  }
                  portadaUrl={portada?.url ?? null}
                  accionesDe={accionesDeFoto}
                />
                <p className="text-xs text-gray-400 mt-3">
                  {categoria === 'todas'
                    ? 'Elige una categoría para cambiar el orden de sus fotos. Pulsa una foto para verla en grande; usa la casilla para seleccionar varias.'
                    : 'Mantén pulsada una foto y arrástrala para cambiar el orden. Pulsa una foto para verla en grande; usa la casilla para seleccionar varias.'}
                </p>
              </>
            ) : (
              <div className="flex flex-col items-center gap-2 text-gray-300 py-10 text-center">
                <Images size={28} />
                <p className="text-sm text-gray-500">
                  {proyecto.fotos.length === 0
                    ? 'Esta obra todavía no tiene fotos.'
                    : `Ninguna foto en «${TIPOS_FOTO.find((t) => t.value === categoria)?.label}».`}
                </p>
                <p className="text-xs text-gray-400 max-w-sm">
                  {proyecto.fotos.length === 0
                    ? 'Sube fotos del antes, durante y después desde el bloque de arriba o desde el móvil en Acciones rápidas. Las de «Después» son las que luego sirven para la web.'
                    : 'Elige esa categoría en el bloque de subida para añadir fotos ahí.'}
                </p>
                {proyecto.fotos.length > 0 && (
                  <button type="button" onClick={() => setCategoria('todas')} className="text-xs text-brand hover:underline">
                    Ver todas
                  </button>
                )}
              </div>
            )}
          </div>

          <ComparadorAntesDespues fotos={proyecto.fotos} />
        </div>

        <div className="flex flex-col gap-4">
          <div className="bg-surface border border-gray-200 rounded-sm p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Datos de la obra</p>
              {!editandoDatos && (
                <button onClick={empezarEdicion} className="text-xs text-gray-500 hover:text-brand flex items-center gap-1">
                  <Pencil size={11} />
                  Modificar
                </button>
              )}
            </div>
            {editandoDatos ? (
              <div className="flex flex-col gap-3">
                <Input label="Título" value={form.titulo} onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))} />
                <Select
                  label="Tipo de obra"
                  options={[{ value: '', label: 'Sin clasificar' }, ...TIPOS_OBRA]}
                  value={form.tipo_obra_clave}
                  onChange={(e) => setForm((f) => ({ ...f, tipo_obra_clave: e.target.value }))}
                />
                <Input label="Zona" value={form.zona} onChange={(e) => setForm((f) => ({ ...f, zona: e.target.value }))} />
                <Input label="Fecha de la obra" type="date" value={form.fecha_obra} onChange={(e) => setForm((f) => ({ ...f, fecha_obra: e.target.value }))} />
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Descripción</label>
                  <textarea
                    value={form.descripcion}
                    onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
                    className="w-full border border-gray-200 rounded-sm px-2.5 py-1.5 text-sm min-h-[80px] focus:border-brand focus:outline-none"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={guardarDatos} disabled={fichaMutation.isPending}>
                    {fichaMutation.isPending ? 'Guardando…' : 'Guardar'}
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setEditandoDatos(false)}>
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : (
              <dl className="text-sm grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                <dt className="text-gray-400">Tipo</dt>
                <dd className="text-gray-800">{etiquetaTipoObra(proyecto.tipo_obra_clave) ?? <span className="text-amber-600">Sin clasificar</span>}</dd>
                <dt className="text-gray-400">Zona</dt>
                <dd className="text-gray-800">{proyecto.zona || '—'}</dd>
                <dt className="text-gray-400">Fecha</dt>
                <dd className="text-gray-800">{proyecto.fecha_obra ? fechaCorta(proyecto.fecha_obra) : '—'}</dd>
                <dt className="text-gray-400">Portada</dt>
                <dd className="text-gray-800">{proyecto.portada_url ? 'Elegida a mano' : portada ? 'Automática (primera de «Después»)' : '—'}</dd>
                <dt className="text-gray-400 col-span-2 mt-1">Descripción</dt>
                <dd className="text-gray-700 col-span-2 whitespace-pre-wrap">{proyecto.descripcion || <span className="text-gray-400">Sin descripción.</span>}</dd>
              </dl>
            )}
          </div>

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
                  {f.tipo === 'acompte' ? 'Anticipo' : 'Factura'} {f.numero ?? 'S/N'} <span className="text-gray-400">· {f.estado_cobro}</span>
                </span>
                <ExternalLink size={13} className="text-gray-400" />
              </button>
            ))}
            {planning && (
              <button onClick={() => navigate('/planning-obra')} className="flex items-center justify-between w-full text-left px-2.5 py-1.5 rounded-sm hover:bg-brand-light text-sm">
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
            <Button variant="secondary" onClick={() => descargarZip(fotosOrdenadas)} disabled={!!progresoZip || proyecto.fotos.length === 0}>
              <span className="flex items-center gap-1.5 justify-center">
                <Download size={14} />
                {progresoZip ? `Preparando ${progresoZip.hecho}/${progresoZip.total}…` : 'Descargar todo en ZIP'}
              </span>
            </Button>
            {puedeCompartir && (
              <Button variant="secondary" onClick={() => compartir(fotosOrdenadas.filter((f) => f.tipo === 'despues'))} disabled={compartiendo || proyecto.fotos.length === 0}>
                <span className="flex items-center gap-1.5 justify-center">
                  <Share2 size={14} />
                  {compartiendo ? 'Preparando…' : 'Compartir fotos de «Después»'}
                </span>
              </Button>
            )}
            <Button variant="danger" onClick={async () => (await confirmar({ mensaje: '¿Eliminar esta obra de la galería? Se borrarán también todas sus fotos y vídeos. No se puede deshacer.', peligroso: true, textoConfirmar: 'Eliminar' })) && eliminarProyectoMutation.mutate()}>
              <span className="flex items-center gap-1.5 justify-center">
                <Trash2 size={14} />
                Eliminar obra de la galería
              </span>
            </Button>
          </div>
        </div>
      </div>

      <VisorFotos
        fotos={fotosVisibles}
        indice={indiceVisor}
        onCerrar={() => setIndiceVisor(null)}
        onCambio={setIndiceVisor}
        botones={
          fotoVisor
            ? [
                <button key="editar" type="button" className="yarl__button" title="Editar título y descripción" onClick={() => abrirEditorFoto(fotoVisor)}>
                  <Pencil size={20} />
                </button>,
                <button key="descargar" type="button" className="yarl__button" title="Descargar" onClick={() => descargarFoto(fotoVisor)}>
                  <Download size={20} />
                </button>,
                <button key="eliminar" type="button" className="yarl__button" title="Eliminar" onClick={() => eliminarFotos([fotoVisor])}>
                  <Trash2 size={20} />
                </button>,
              ]
            : []
        }
      />

      <Modal
        open={!!fotoEnEdicion}
        onClose={() => setFotoEnEdicion(null)}
        title="Título y descripción"
        footer={
          <>
            <Button variant="secondary" onClick={() => setFotoEnEdicion(null)}>
              Cancelar
            </Button>
            <Button onClick={guardarTextoFoto} disabled={fotosMutation.isPending}>
              Guardar
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <Input label="Título" value={metaTitulo} onChange={(e) => setMetaTitulo(e.target.value)} placeholder="Ej. Baño antes de la reforma" autoFocus />
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Descripción</label>
            <textarea
              value={metaDescripcion}
              onChange={(e) => setMetaDescripcion(e.target.value)}
              className="w-full border border-gray-200 rounded-sm px-2.5 py-1.5 text-sm min-h-[70px] focus:border-brand focus:outline-none"
              placeholder="Detalle opcional de esta foto o vídeo"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
