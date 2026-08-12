import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Inbox, Layers, Send, Star, FileEdit, Archive, Trash2, Paperclip, PenSquare, Search, User as UserIcon, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { useSeleccionMultiple } from '../../hooks/useSeleccionMultiple';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { EditorTexto } from '../../components/ui/EditorTexto';
import { SelectorDestinatarios } from '../../components/ui/SelectorDestinatarios';
import { BulkActionsBar } from '../../components/ui/BulkActionsBar';
import { MensajeRow } from './MensajeRow';
import { MensajeDetalleFull } from './MensajeDetalleFull';
import {
  conId,
  sinId,
  enArchivo,
  enBandeja,
  enGeneral,
  enPapelera,
  enEnviados,
  enBorradores,
  enDestacados,
  deCompanero,
  noLeido,
  raizHilo,
  participantesHilo,
  mensajesDelHilo,
  adjuntosDe,
  type MensajeEquipo,
  type UsuarioEquipo,
} from './types';

const TEMATICAS = ['Visita', 'Presupuesto', 'Aviso general', 'Urgente', 'Recordatorio', 'Incidencia'];

type Carpeta = 'general' | 'bandeja' | 'enviados' | 'destacados' | 'borradores' | 'archivo' | 'papelera' | `companero:${string}`;

export default function MensajeriaPage() {
  const { user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [carpeta, setCarpeta] = useState<Carpeta>('bandeja');
  const [abiertoId, setAbiertoId] = useState<string | null>(null);
  const [redactando, setRedactando] = useState(false);
  const [borradorId, setBorradorId] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [para, setPara] = useState<string[]>([]);
  const [asunto, setAsunto] = useState('');
  const [texto, setTexto] = useState('');
  const [adjuntos, setAdjuntos] = useState<{ url: string; nombre: string }[]>([]);
  const [subiendo, setSubiendo] = useState(false);
  const [hiloId, setHiloId] = useState<string | null>(null);
  const { seleccion, toggleFila, toggleTodas, limpiar: limpiarSeleccion } = useSeleccionMultiple();

  const cambiarCarpeta = (c: Carpeta) => {
    setCarpeta(c);
    limpiarSeleccion();
  };

  const nombre = (user?.user_metadata?.nombre as string) || user?.email || 'Sistema';

  const { data: equipo } = useQuery({
    queryKey: ['usuarios_equipo'],
    queryFn: async () => {
      const { data, error } = await supabase.from('usuarios_equipo').select('*').order('nombre', { ascending: true });
      if (error) throw error;
      return data as UsuarioEquipo[];
    },
  });

  const companeros = useMemo(() => (equipo ?? []).filter((u) => u.id !== user?.id), [equipo, user]);

  const nombrePorId = useMemo(() => {
    const map = new Map<string, string>();
    for (const u of equipo ?? []) map.set(u.id, u.nombre);
    return map;
  }, [equipo]);

  const { data: mensajes, isFetching, refetch } = useQuery({
    queryKey: ['mensajes_equipo', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('mensajes_equipo')
        .select('*')
        .or(`destinatario_ids.is.null,destinatario_ids.cs.{${user.id}},autor_id.eq.${user.id}`)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as MensajeEquipo[];
    },
    enabled: !!user,
    refetchInterval: 4000,
  });

  // Se deriva del listado en vez de guardar una copia — así el detalle siempre refleja el
  // estado real tras destacar/archivar/marcar leído, sin quedarse con datos obsoletos.
  const abierto = useMemo(() => mensajes?.find((m) => m.id === abiertoId) ?? null, [mensajes, abiertoId]);

  const filtroCarpeta = (m: MensajeEquipo): boolean => {
    if (!user) return false;
    if (carpeta === 'general') return enGeneral(m, user.id);
    if (carpeta === 'bandeja') return enBandeja(m, user.id);
    if (carpeta === 'enviados') return enEnviados(m, user.id);
    if (carpeta === 'destacados') return enDestacados(m, user.id);
    if (carpeta === 'borradores') return enBorradores(m, user.id);
    if (carpeta === 'archivo') return enArchivo(m, user.id);
    if (carpeta === 'papelera') return enPapelera(m, user.id);
    return deCompanero(m, carpeta.slice('companero:'.length)) && !enPapelera(m, user.id);
  };

  const listaCarpeta = useMemo(() => {
    if (!user || !mensajes) return [];
    let lista = mensajes.filter(filtroCarpeta);
    const q = busqueda.trim().toLowerCase();
    if (q) {
      lista = lista.filter(
        (m) => m.asunto?.toLowerCase().includes(q) || m.texto.toLowerCase().includes(q) || m.autor_nombre.toLowerCase().includes(q),
      );
    }
    return lista;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mensajes, carpeta, busqueda, user]);

  const noLeidosBandeja = useMemo(() => {
    if (!user || !mensajes) return 0;
    return mensajes.filter((m) => enBandeja(m, user.id) && noLeido(m, user.id)).length;
  }, [mensajes, user]);

  const noLeidosPorCompanero = useMemo(() => {
    const map = new Map<string, number>();
    if (!user || !mensajes) return map;
    for (const c of companeros) {
      map.set(c.id, mensajes.filter((m) => deCompanero(m, c.id) && !enPapelera(m, user.id) && noLeido(m, user.id)).length);
    }
    return map;
  }, [mensajes, companeros, user]);

  const actualizarMutation = useMutation({
    mutationFn: async ({ id, cambios }: { id: string; cambios: Partial<MensajeEquipo> }) => {
      const { error } = await supabase.from('mensajes_equipo').update(cambios).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['mensajes_equipo'] }),
    onError: (error) => toast.error(error.message),
  });

  const marcarLeido = (m: MensajeEquipo, leido: boolean) => {
    if (!user) return;
    actualizarMutation.mutate({ id: m.id, cambios: { leido_por: leido ? conId(m.leido_por, user.id) : sinId(m.leido_por, user.id) } });
  };
  const archivar = (m: MensajeEquipo) => {
    if (!user) return;
    actualizarMutation.mutate({ id: m.id, cambios: { archivado_por: conId(m.archivado_por, user.id) } });
  };
  const desarchivar = (m: MensajeEquipo) => {
    if (!user) return;
    actualizarMutation.mutate({ id: m.id, cambios: { archivado_por: sinId(m.archivado_por, user.id) } });
  };
  const eliminar = (m: MensajeEquipo) => {
    if (!user) return;
    actualizarMutation.mutate({ id: m.id, cambios: { eliminado_por: conId(m.eliminado_por, user.id) } });
    if (abiertoId === m.id) setAbiertoId(null);
  };
  const restaurar = (m: MensajeEquipo) => {
    if (!user) return;
    actualizarMutation.mutate({ id: m.id, cambios: { eliminado_por: sinId(m.eliminado_por, user.id) } });
  };
  const destacar = (m: MensajeEquipo, destacado: boolean) => {
    if (!user) return;
    actualizarMutation.mutate({ id: m.id, cambios: { destacado_por: destacado ? conId(m.destacado_por, user.id) : sinId(m.destacado_por, user.id) } });
  };

  // Acción en lote: cada mensaje seleccionado puede tener un array (leido_por/archivado_por/...)
  // distinto, así que `calcularCambios` se evalúa por mensaje en vez de mandar un único PATCH.
  const accionMasivaMutation = useMutation({
    mutationFn: async ({ ids, calcularCambios }: { ids: (string | number)[]; calcularCambios: (m: MensajeEquipo) => Partial<MensajeEquipo> }) => {
      const objetivo = (mensajes ?? []).filter((m) => ids.includes(m.id));
      const resultados = await Promise.all(
        objetivo.map((m) => supabase.from('mensajes_equipo').update(calcularCambios(m)).eq('id', m.id)),
      );
      const conError = resultados.find((r) => r.error);
      if (conError?.error) throw conError.error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mensajes_equipo'] });
      limpiarSeleccion();
    },
    onError: (error) => toast.error(error.message),
  });

  const accionesMasivas = (() => {
    if (!user) return [];
    const ids = Array.from(seleccion);
    return [
      {
        label: 'Marcar como leídos',
        onClick: () =>
          accionMasivaMutation.mutate({ ids, calcularCambios: (m) => ({ leido_por: conId(m.leido_por, user.id) }) }),
      },
      {
        label: 'Marcar como no leídos',
        onClick: () =>
          accionMasivaMutation.mutate({ ids, calcularCambios: (m) => ({ leido_por: sinId(m.leido_por, user.id) }) }),
      },
      carpeta === 'archivo'
        ? {
            label: 'Sacar del archivo',
            onClick: () =>
              accionMasivaMutation.mutate({ ids, calcularCambios: (m) => ({ archivado_por: sinId(m.archivado_por, user.id) }) }),
          }
        : {
            label: 'Archivar',
            onClick: () =>
              accionMasivaMutation.mutate({ ids, calcularCambios: (m) => ({ archivado_por: conId(m.archivado_por, user.id) }) }),
          },
      carpeta === 'papelera'
        ? {
            label: 'Restaurar',
            onClick: () =>
              accionMasivaMutation.mutate({ ids, calcularCambios: (m) => ({ eliminado_por: sinId(m.eliminado_por, user.id) }) }),
          }
        : {
            label: 'Eliminar',
            variant: 'danger' as const,
            onClick: () =>
              accionMasivaMutation.mutate({ ids, calcularCambios: (m) => ({ eliminado_por: conId(m.eliminado_por, user.id) }) }),
          },
    ];
  })();

  const abrirMensaje = (m: MensajeEquipo) => {
    if (m.borrador) {
      entrarRedactar(m);
      return;
    }
    setAbiertoId(m.id);
    if (user && noLeido(m, user.id)) marcarLeido(m, true);
  };

  const TAMANO_MAX_ADJUNTO = 10 * 1024 * 1024; // 10 MB

  const handleSubirAdjuntos = async (files: FileList) => {
    setSubiendo(true);
    const subidos: { url: string; nombre: string }[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
        toast.error(`"${file.name}": solo se admiten imágenes o PDF`);
        continue;
      }
      if (file.size > TAMANO_MAX_ADJUNTO) {
        toast.error(`"${file.name}" pesa demasiado (máximo ${TAMANO_MAX_ADJUNTO / 1024 / 1024} MB)`);
        continue;
      }
      const extension = file.name.split('.').pop() ?? 'jpg';
      // crypto.randomUUID() en vez de Date.now()+Math.random() (~20 bits de entropía) — este bucket
      // es público, así que un nombre adivinable exponía adjuntos de mensajes privados a quien
      // conociera aproximadamente la hora de envío (hallazgo real, revisión 2026-08-12).
      const path = `${crypto.randomUUID()}.${extension}`;
      const { error } = await supabase.storage.from('mensajes_adjuntos').upload(path, file, { contentType: file.type });
      if (error) {
        toast.error(error.message);
        continue;
      }
      const { data } = supabase.storage.from('mensajes_adjuntos').getPublicUrl(path);
      subidos.push({ url: data.publicUrl, nombre: file.name });
    }
    setSubiendo(false);
    setAdjuntos((prev) => [...prev, ...subidos]);
  };

  const quitarAdjunto = (url: string) => {
    setAdjuntos((prev) => prev.filter((a) => a.url !== url));
  };

  const limpiarCompose = () => {
    setPara([]);
    setAsunto('');
    setTexto('');
    setAdjuntos([]);
    setBorradorId(null);
    setHiloId(null);
    setRedactando(false);
  };

  const entrarRedactar = (borrador?: MensajeEquipo) => {
    setAbiertoId(null);
    if (borrador) {
      setPara(borrador.destinatario_ids ?? []);
      setAsunto(borrador.asunto ?? '');
      setTexto(borrador.texto);
      setAdjuntos(adjuntosDe(borrador));
      setBorradorId(borrador.id);
      setHiloId(borrador.hilo_id);
    } else {
      setPara([]);
      setAsunto('');
      setTexto('');
      setAdjuntos([]);
      setBorradorId(null);
      setHiloId(null);
    }
    setRedactando(true);
  };

  const responderMensaje = (m: MensajeEquipo) => {
    setAbiertoId(null);
    const hilo = mensajesDelHilo(mensajes ?? [], m);
    const destinatarios = participantesHilo(hilo, user!.id);
    setPara(destinatarios.length > 0 ? destinatarios : [m.autor_id]);
    setAsunto(m.asunto ? `Re: ${m.asunto}` : '');
    setTexto('');
    setAdjuntos([]);
    setBorradorId(null);
    setHiloId(raizHilo(m));
    setRedactando(true);
  };

  const datosMensaje = () => ({
    autor_id: user!.id,
    autor_nombre: nombre,
    destinatario_ids: para.length > 0 ? para : null,
    asunto: asunto.trim() || null,
    texto: texto.trim(),
    adjunto_url: null,
    adjunto_nombre: null,
    adjuntos: adjuntos.length > 0 ? adjuntos : null,
    hilo_id: hiloId,
  });

  const enviarMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Sesión no válida');
      if (borradorId) {
        const { error } = await supabase.from('mensajes_equipo').update({ ...datosMensaje(), borrador: false }).eq('id', borradorId);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from('mensajes_equipo').insert({ ...datosMensaje(), borrador: false });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Mensaje enviado');
      queryClient.invalidateQueries({ queryKey: ['mensajes_equipo'] });
      const volverAlHilo = hiloId;
      limpiarCompose();
      if (volverAlHilo) {
        setAbiertoId(volverAlHilo);
      } else {
        setCarpeta('bandeja');
      }
    },
    onError: (error) => toast.error(error.message),
  });

  const guardarBorradorMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Sesión no válida');
      if (borradorId) {
        const { error } = await supabase.from('mensajes_equipo').update({ ...datosMensaje(), borrador: true }).eq('id', borradorId);
        if (error) throw error;
        return;
      }
      const { data, error } = await supabase
        .from('mensajes_equipo')
        .insert({ ...datosMensaje(), borrador: true })
        .select()
        .single();
      if (error) throw error;
      setBorradorId(data.id);
    },
    onSuccess: () => {
      toast.success('Borrador guardado');
      queryClient.invalidateQueries({ queryKey: ['mensajes_equipo'] });
    },
    onError: (error) => toast.error(error.message),
  });

  const handleEnviar = () => {
    if (!texto.trim() || enviarMutation.isPending) return;
    enviarMutation.mutate();
  };

  const carpetaAccion: 'bandeja' | 'archivo' | 'papelera' | 'otro' =
    carpeta === 'archivo' || carpeta === 'papelera' || carpeta === 'bandeja' ? carpeta : 'otro';

  const FOLDERS: { id: Carpeta; label: string; icon: typeof Inbox }[] = [
    { id: 'general', label: 'General', icon: Layers },
    { id: 'bandeja', label: 'Bandeja de entrada', icon: Inbox },
    { id: 'enviados', label: 'Enviados', icon: Send },
    { id: 'destacados', label: 'Destacados', icon: Star },
    { id: 'borradores', label: 'Borradores', icon: FileEdit },
    { id: 'archivo', label: 'Archivados', icon: Archive },
    { id: 'papelera', label: 'Papelera', icon: Trash2 },
  ];

  if (!user) return null;

  return (
    <div className="flex flex-col md:flex-row gap-4 md:h-[calc(100vh-140px)]">
      {!redactando && !abierto && (
        <div className="w-full md:w-56 md:shrink-0 flex flex-col gap-3">
          <Button onClick={() => entrarRedactar()} className="w-full">
            <span className="flex items-center justify-center gap-2">
              <PenSquare size={15} />
              Redactar
            </span>
          </Button>

          <nav className="flex gap-1 overflow-x-auto md:flex-col md:gap-0.5 md:overflow-visible bg-surface border border-gray-200 rounded-sm p-1.5">
            {FOLDERS.map((f) => {
              const Icon = f.icon;
              return (
                <button
                  key={f.id}
                  onClick={() => cambiarCarpeta(f.id)}
                  className={`flex items-center gap-2 px-2.5 py-1.5 text-sm rounded-sm text-left shrink-0 whitespace-nowrap md:shrink md:whitespace-normal ${
                    carpeta === f.id ? 'bg-brand-light text-brand font-medium' : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <Icon size={14} className="shrink-0" />
                  <span className="md:flex-1 md:truncate">{f.label}</span>
                  {f.id === 'bandeja' && noLeidosBandeja > 0 && (
                    <span className="bg-brand text-white text-[10px] leading-none rounded-full px-1.5 py-0.5">{noLeidosBandeja}</span>
                  )}
                </button>
              );
            })}

            {companeros.length > 0 && (
              <>
                <div className="hidden md:block border-t border-gray-100 my-1.5" />
                <p className="hidden md:block px-2.5 pt-1 pb-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                  Por compañero
                </p>
                {companeros.map((c) => {
                  const carpetaId = `companero:${c.id}` as const;
                  const noLeidos = noLeidosPorCompanero.get(c.id) ?? 0;
                  return (
                    <button
                      key={c.id}
                      onClick={() => cambiarCarpeta(carpetaId)}
                      className={`flex items-center gap-2 px-2.5 py-1.5 text-sm rounded-sm text-left shrink-0 whitespace-nowrap md:shrink md:whitespace-normal ${
                        carpeta === carpetaId ? 'bg-brand-light text-brand font-medium' : 'text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      <UserIcon size={14} className="shrink-0" />
                      <span className="md:flex-1 md:truncate">{c.nombre}</span>
                      {noLeidos > 0 && (
                        <span className="bg-brand text-white text-[10px] leading-none rounded-full px-1.5 py-0.5">{noLeidos}</span>
                      )}
                    </button>
                  );
                })}
              </>
            )}
          </nav>
        </div>
      )}

      <div className="flex-1 min-w-0">
        {redactando ? (
          <div className="bg-surface border border-gray-200 rounded-sm p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-gray-200 pb-2">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                {borradorId ? 'Editar borrador' : 'Redactar mensaje'}
              </p>
              <button onClick={limpiarCompose} className="text-xs text-gray-400 hover:text-gray-700">
                Cancelar
              </button>
            </div>
            <SelectorDestinatarios personas={companeros} seleccionados={para} onChange={setPara} />

            <div>
              <Input label="Asunto (opcional)" value={asunto} onChange={(e) => setAsunto(e.target.value)} />
              <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                {TEMATICAS.map((tema) => (
                  <button
                    key={tema}
                    type="button"
                    onClick={() => setAsunto(tema)}
                    className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                      asunto === tema
                        ? 'bg-brand text-white border-brand'
                        : 'bg-surface text-gray-600 border-gray-200 hover:border-brand hover:text-brand'
                    }`}
                  >
                    {tema}
                  </button>
                ))}
              </div>
            </div>
            <EditorTexto value={texto} onChange={setTexto} placeholder="Escribe tu mensaje..." rows={10} />
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                {adjuntos.map((a) => (
                  <span
                    key={a.url}
                    className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 text-gray-700 px-2 py-1 rounded-sm text-xs"
                  >
                    <Paperclip size={12} />
                    <a href={a.url} target="_blank" rel="noreferrer" className="hover:underline max-w-[140px] truncate">
                      {a.nombre}
                    </a>
                    <button type="button" onClick={() => quitarAdjunto(a.url)} className="text-gray-400 hover:text-red-600">
                      <X size={12} />
                    </button>
                  </span>
                ))}
                <label className="flex items-center gap-1.5 bg-surface border border-gray-200 text-gray-600 px-2.5 py-1.5 rounded-sm text-xs cursor-pointer hover:border-brand hover:text-brand transition-colors">
                    <Paperclip size={13} />
                    {subiendo ? 'Subiendo...' : 'Adjuntar archivos'}
                    <input
                      type="file"
                      multiple
                      accept="image/*,.pdf"
                      onChange={(e) => e.target.files && e.target.files.length > 0 && handleSubirAdjuntos(e.target.files)}
                      disabled={subiendo}
                      className="hidden"
                    />
                  </label>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="secondary" onClick={() => guardarBorradorMutation.mutate()} disabled={guardarBorradorMutation.isPending || !texto.trim()}>
                  {guardarBorradorMutation.isPending ? 'Guardando...' : 'Guardar borrador'}
                </Button>
                <Button onClick={handleEnviar} disabled={enviarMutation.isPending || !texto.trim() || subiendo}>
                  <span className="flex items-center gap-1.5">
                    <Send size={14} />
                    {enviarMutation.isPending ? 'Enviando...' : 'Enviar'}
                  </span>
                </Button>
              </div>
            </div>
          </div>
        ) : abierto ? (
          <MensajeDetalleFull
            mensaje={abierto}
            hilo={mensajesDelHilo(mensajes ?? [], abierto)}
            userId={user.id}
            nombrePorId={nombrePorId}
            carpeta={carpetaAccion}
            onVolver={() => setAbiertoId(null)}
            onMarcarNoLeido={() => marcarLeido(abierto, false)}
            onArchivar={() => archivar(abierto)}
            onDesarchivar={() => desarchivar(abierto)}
            onEliminar={() => eliminar(abierto)}
            onRestaurar={() => restaurar(abierto)}
            onDestacar={(destacado) => destacar(abierto, destacado)}
            onResponder={() => responderMensaje(abierto)}
          />
        ) : (
          <div className="flex flex-col h-full">
            <div className="flex items-center gap-2 mb-2 shrink-0">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar por asunto, texto o remitente..."
                  className="w-full border border-gray-200 rounded-sm pl-8 pr-3 py-1.5 text-sm focus:border-brand focus:outline-none"
                />
              </div>
              <button
                onClick={() => refetch()}
                disabled={isFetching}
                className="text-xs text-gray-500 hover:text-brand disabled:opacity-50 shrink-0"
              >
                Actualizar
              </button>
            </div>
            <div className="flex items-center gap-2 mb-2 shrink-0">
              <input
                type="checkbox"
                checked={listaCarpeta.length > 0 && listaCarpeta.every((m) => seleccion.has(m.id))}
                onChange={() => toggleTodas(listaCarpeta.map((m) => m.id))}
              />
              <p className="text-xs text-gray-400">{listaCarpeta.length} mensajes</p>
            </div>
            <BulkActionsBar count={seleccion.size} onCancelar={limpiarSeleccion} acciones={accionesMasivas} />
            <div className="flex-1 min-h-0 overflow-y-auto bg-surface border border-gray-200 rounded-sm">
              {listaCarpeta.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-10">Sin mensajes en esta carpeta.</p>
              )}
              {listaCarpeta.map((m) => (
                <MensajeRow
                  key={m.id}
                  mensaje={m}
                  userId={user.id}
                  nombrePorId={nombrePorId}
                  carpeta={carpetaAccion}
                  seleccionado={seleccion.has(m.id)}
                  onToggleSeleccion={() => toggleFila(m.id)}
                  onAbrir={() => abrirMensaje(m)}
                  onMarcarLeido={(leido) => marcarLeido(m, leido)}
                  onArchivar={() => archivar(m)}
                  onDesarchivar={() => desarchivar(m)}
                  onEliminar={() => eliminar(m)}
                  onRestaurar={() => restaurar(m)}
                  onDestacar={(destacado) => destacar(m, destacado)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
