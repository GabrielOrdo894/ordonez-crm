import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { ArrowLeft, Sparkles, Copy, Check, X, Link2, Gauge, CalendarPlus, Phone, Mail, Languages, MessageSquareText } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { registrarEventoFunnel } from '../../lib/funnelTracking';
import { useToast } from '../../hooks/useToast';
import { useConfirmar } from '../../hooks/useConfirm';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Select } from '../../components/ui/Select';
import type { VisitaModalContext } from '../../components/layout/AppLayout';
import { formatearTelefonoVisual } from '../clientes/types';
import {
  ESTADOS_SOLICITUD,
  ETIQUETA_ESTADO_SOLICITUD,
  FUENTE_LABEL,
  MODELOS_IA,
  TIPO_SOLICITUD_LABEL,
  estadoSeguimiento,
  parseMensaje,
  type EstadoSolicitud,
  type PresupuestoConRespuesta,
  type Solicitud,
  type TipoSolicitud,
} from './types';

const OPCIONES_TIPO_SOLICITUD = [
  { value: '', label: 'Sin determinar' },
  ...(Object.keys(TIPO_SOLICITUD_LABEL) as TipoSolicitud[]).map((v) => ({ value: v, label: TIPO_SOLICITUD_LABEL[v] })),
];

type SolicitudDetalleProps = {
  tipo: 'solicitud' | 'seguimiento';
  id: string;
  onClose: () => void;
};

type VarianteBadge = 'pendiente' | 'confirmada' | 'realizada' | 'cancelada' | 'vencida' | 'en-espera' | 'default';

const VARIANTE_ESTADO: Record<string, VarianteBadge> = {
  Nueva: 'pendiente',
  Enviada: 'en-espera',
  Aceptada: 'confirmada',
  'No concretada': 'vencida',
  Rechazada: 'cancelada',
  Eliminada: 'default',
};

function fecha(f: string | null) {
  if (!f) return '—';
  return new Date(f).toLocaleDateString('es', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

type PresupuestoResumen = { id: string; numero: string | null; cliente_nombre: string | null };
type VisitaResumen = { id: string; nombre: string | null; apellidos: string | null; direccion: string | null; fecha_visita: string | null };

export function SolicitudDetalle({ tipo, id, onClose }: SolicitudDetalleProps) {
  const toast = useToast();
  const confirmar = useConfirmar();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { abrirNuevaVisita } = useOutletContext<VisitaModalContext>();
  const [modelo, setModelo] = useState(MODELOS_IA[0].value);

  const { data: solicitud, isLoading: cargandoSolicitud } = useQuery({
    queryKey: ['solicitudes', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('solicitudes').select('*').eq('id', id).single();
      if (error) throw error;
      return data as Solicitud;
    },
    enabled: tipo === 'solicitud',
  });

  const { data: presupuesto, isLoading: cargandoPresupuesto } = useQuery({
    queryKey: ['presupuestos', 'seguimiento', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('presupuestos')
        .select(
          'id, numero, cliente_nombre, cliente_email, idioma, ultima_respuesta_cliente_resumen, ultima_respuesta_cliente_fecha, ultima_respuesta_revisada, mensaje_seguimiento_generado, mensaje_seguimiento_enviado, mensaje_seguimiento_enviado_en, seguimiento_concluido, estado, conversacion',
        )
        .eq('id', id)
        .single();
      if (error) throw error;
      return data as PresupuestoConRespuesta;
    },
    enabled: tipo === 'seguimiento',
  });

  // queryKey propia: ['empresa_config'] la comparten el Sidebar y Configuración con select('*').
  const { data: empresaConfig } = useQuery({
    queryKey: ['empresa_config', 'ia-presupuesto-mensual'],
    queryFn: async () => {
      const { data, error } = await supabase.from('empresa_config').select('ia_presupuesto_mensual_usd').eq('id', 1).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: usoIaMes } = useQuery({
    queryKey: ['uso-ia'],
    queryFn: async () => {
      const primerDiaMes = new Date();
      primerDiaMes.setDate(1);
      primerDiaMes.setHours(0, 0, 0, 0);
      const { data, error } = await supabase.from('llamadas_ia').select('costo_usd').gte('created_at', primerDiaMes.toISOString());
      if (error) throw error;
      return (data ?? []).reduce((s, r) => s + Number(r.costo_usd), 0);
    },
  });

  const presupuestoMensual = (empresaConfig?.ia_presupuesto_mensual_usd as number | undefined) ?? 10;
  const porcentajeUso = presupuestoMensual > 0 ? Math.round(((usoIaMes ?? 0) / presupuestoMensual) * 100) : 0;

  const { data: presupuestosDisponibles } = useQuery({
    queryKey: ['presupuestos', 'resumen-para-vincular'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('presupuestos')
        .select('id, numero, cliente_nombre')
        .is('eliminado_en', null)
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return data as PresupuestoResumen[];
    },
    enabled: tipo === 'solicitud',
  });

  // Vinculación manual a una visita (2026-09-16) — el cruce automático por teléfono/email
  // (vincularSolicitudPorVisita, se dispara al crear la visita) no puede alcanzar los casos donde
  // la solicitud ya está Rechazada (p. ej. el rechazo automático a los 14 días llegó antes de que
  // la visita se creara/enlazara) — ahí hace falta revisar caso por caso si de verdad corresponde
  // reabrir, así que se deja como acción manual en vez de automatizarlo. Ver AvisosPanel.tsx para
  // el aviso que señala estos casos.
  const { data: visitasDisponibles } = useQuery({
    queryKey: ['visitas', 'resumen-para-vincular'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('visitas')
        .select('id, nombre, apellidos, direccion, fecha_visita')
        .is('eliminado_en', null)
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return data as VisitaResumen[];
    },
    enabled: tipo === 'solicitud',
  });

  const vincularVisitaMutation = useMutation({
    mutationFn: async (visitaId: string | null) => {
      // Igual que vincularMutation con presupuestos: vincular a mano es también aceptación,
      // desvincular no revierte el estado (es una corrección de vínculo, no una marcha atrás).
      const patch: Record<string, unknown> = { visita_id: visitaId };
      if (visitaId) patch.estado = 'Aceptada';
      const { error } = await supabase.from('solicitudes').update(patch).eq('id', id);
      if (error) throw error;
      // "Visita agendada" solo cuenta visitas con fecha_visita rellena — misma regla que el KPI
      // "Total visitas" de VisitasPage.tsx (hallazgo real, 2026-09-20).
      const visitaVinculada = visitaId ? visitasDisponibles?.find((v) => v.id === visitaId) : null;
      if (visitaId && visitaVinculada?.fecha_visita) {
        await registrarEventoFunnel('visita_agendada', { solicitudId: id, fuente: solicitud?.fuente });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['solicitudes', id] });
      toast.success('Vínculo con la visita actualizado');
    },
    onError: (error) => toast.error(error.message),
  });

  const invalidarListas = () => {
    queryClient.invalidateQueries({ queryKey: ['solicitudes'] });
    queryClient.invalidateQueries({ queryKey: ['presupuestos', 'respuestas-pendientes'] });
    queryClient.invalidateQueries({ queryKey: ['presupuestos', 'seguimiento', id] });
    queryClient.invalidateQueries({ queryKey: ['uso-ia'] });
  };

  const generarMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('generar-mensaje-ia', { body: { tipo, id, modelo } });
      if (error) {
        // supabase-js deja error.message genérico ("Edge Function returned a non-2xx status
        // code") en vez del mensaje real del body — hay que leerlo de error.context (bug real
        // corregido 2026-08-18, notado al añadir el bloqueo de presupuesto de IA agotado, que
        // devuelve 429 con un mensaje explícito que antes nunca llegaba a verse).
        const cuerpo = await (error as { context?: Response }).context?.json?.().catch(() => null);
        throw new Error(cuerpo?.error ?? error.message);
      }
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => invalidarListas(),
    onError: (error) => toast.error(error.message),
  });

  const marcarEnviadoMutation = useMutation({
    mutationFn: async () => {
      if (tipo === 'solicitud') {
        // Sirve para el primer envío (estado pasa a "Enviada") y también para responder a una
        // respuesta posterior del cliente (estado ya era "Enviada" — aquí solo cierra el aviso de
        // "Nueva respuesta" con ultima_respuesta_revisada, sin volver a tocar el embudo).
        const { error } = await supabase
          .from('solicitudes')
          .update({ estado: 'Enviada', mensaje_enviado_en: new Date().toISOString(), ultima_respuesta_revisada: true })
          .eq('id', id);
        if (error) throw error;
        await registrarEventoFunnel('solicitud_respondida', { solicitudId: id, fuente: solicitud?.fuente });
      } else {
        const { error } = await supabase
          .from('presupuestos')
          .update({ mensaje_seguimiento_enviado: true, mensaje_seguimiento_enviado_en: new Date().toISOString(), ultima_respuesta_revisada: true })
          .eq('id', id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      invalidarListas();
      toast.success(tipo === 'solicitud' ? 'Marcado como aceptado y enviado' : 'Respuesta marcada como revisada');
    },
    onError: (error) => toast.error(error.message),
  });

  const cambiarEstadoMutation = useMutation({
    mutationFn: async (estado: EstadoSolicitud) => {
      const patch: Record<string, unknown> = { estado };
      if (estado === 'Enviada') {
        patch.mensaje_enviado_en = new Date().toISOString();
        patch.ultima_respuesta_revisada = true;
      }
      if (estado === 'Nueva') {
        patch.mensaje_generado = null;
        patch.mensaje_generado_en = null;
        patch.mensaje_enviado_en = null;
        patch.ultima_respuesta_revisada = true;
      }
      const { error } = await supabase.from('solicitudes').update(patch).eq('id', id);
      if (error) throw error;
      if (estado === 'Enviada') {
        await registrarEventoFunnel('solicitud_respondida', { solicitudId: id, fuente: solicitud?.fuente });
      }
      if (estado === 'No concretada') {
        await registrarEventoFunnel('solicitud_descartada', { solicitudId: id, fuente: solicitud?.fuente });
      }
    },
    onSuccess: (_data, estado) => {
      invalidarListas();
      toast.success(`Estado cambiado a ${ETIQUETA_ESTADO_SOLICITUD[estado]}`);
    },
    onError: (error) => toast.error(error.message),
  });

  const tipoSolicitudMutation = useMutation({
    mutationFn: async (tipo: TipoSolicitud | null) => {
      const { error } = await supabase.from('solicitudes').update({ tipo_solicitud: tipo }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['solicitudes', id] });
      toast.success('Tipo de solicitud actualizado');
    },
    onError: (error) => toast.error(error.message),
  });

  const vincularMutation = useMutation({
    mutationFn: async (presupuestoId: string | null) => {
      // Vincular a mano un presupuesto es también aceptación (petición de Gabriel 2026-09-15) —
      // desvincular (presupuestoId null) no revierte el estado, es una corrección de vínculo, no
      // una marcha atrás de la decisión ya tomada.
      const patch: Record<string, unknown> = { presupuesto_vinculado_id: presupuestoId };
      if (presupuestoId) patch.estado = 'Aceptada';
      const { error } = await supabase.from('solicitudes').update(patch).eq('id', id);
      if (error) throw error;
      if (presupuestoId && !solicitud?.presupuesto_vinculado_id) {
        // 'solicitud_respondida' primero — el fix de 2026-08-19 en vincularSolicitudPorContacto()
        // (la vía automática) ya lo hace así para que el embudo nunca muestre más "Vinculadas a
        // presupuesto" que "Respondidas". Esta vía MANUAL (el desplegable de esta ficha) se había
        // quedado fuera de ese fix — mismo hueco, misma corrección (hallazgo real, auditoría
        // 2026-09-21). Idempotente, seguro llamarlo aunque ya existiera el evento.
        await registrarEventoFunnel('solicitud_respondida', { solicitudId: id, fuente: solicitud?.fuente });
        await registrarEventoFunnel('solicitud_vinculada_presupuesto', {
          solicitudId: id,
          presupuestoId,
          fuente: solicitud?.fuente,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['solicitudes', id] });
      toast.success('Vínculo actualizado');
    },
    onError: (error) => toast.error(error.message),
  });

  // Cierre manual y DEFINITIVO de la conversación de seguimiento, independiente del estado real
  // del presupuesto (Pendiente/Aceptado/Rechazado) — mismo campo y mismo criterio que las
  // acciones masivas de SolicitudesPage.tsx. revisar-gmail deja de vigilar este presupuesto en
  // cuanto se marca — sin reapertura automática (decisión explícita de Gabriel 2026-08-19).
  // "Reabrir conversación" de abajo es la única forma de volver a activarlo.
  const concluidoMutation = useMutation({
    mutationFn: async (concluido: boolean) => {
      const patch: Record<string, unknown> = { seguimiento_concluido: concluido };
      if (concluido) {
        patch.mensaje_seguimiento_enviado = true;
        patch.mensaje_seguimiento_enviado_en = new Date().toISOString();
        patch.ultima_respuesta_revisada = true;
      }
      const { error } = await supabase.from('presupuestos').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_data, concluido) => {
      invalidarListas();
      toast.success(concluido ? 'Conversación dada por concluida' : 'Vuelto a "Nueva" / no leído');
    },
    onError: (error) => toast.error(error.message),
  });

  const copiar = (texto: string, etiqueta: string) => {
    navigator.clipboard.writeText(texto);
    toast.success(`${etiqueta} copiado`);
  };

  if (cargandoSolicitud || cargandoPresupuesto) return null;

  const estado = tipo === 'solicitud' ? solicitud?.estado : presupuesto ? estadoSeguimiento(presupuesto) : undefined;
  const mensajeRaw = tipo === 'solicitud' ? solicitud?.mensaje_generado ?? null : presupuesto?.mensaje_seguimiento_generado ?? null;
  const mensaje = parseMensaje(mensajeRaw);
  // Si hay una respuesta del cliente sin revisar, se trata como "no enviado" para que reaparezca
  // el flujo de generar/marcar — aunque `estado` siga "Enviada" (ya no se revierte a "Nueva" al
  // llegar una respuesta, decisión de Gabriel 2026-08-26, para no distorsionar el embudo).
  const respuestaSinRevisar = tipo === 'solicitud' && solicitud?.estado === 'Enviada' && solicitud?.ultima_respuesta_revisada === false;
  const enviado = tipo === 'solicitud' ? solicitud?.estado === 'Enviada' && !respuestaSinRevisar : !!presupuesto?.mensaje_seguimiento_enviado;
  const cerrada = tipo === 'solicitud' && (solicitud?.estado === 'No concretada' || solicitud?.estado === 'Rechazada');

  // Cambiar el estado desde la cabecera — los cierres (No concretada/Rechazada) piden confirmación
  // porque dejan de generar mensajes y sacan la solicitud de los avisos.
  const elegirEstado = async (nuevo: EstadoSolicitud) => {
    if (!solicitud || nuevo === solicitud.estado) return;
    if (nuevo === 'No concretada' && !(await confirmar('¿Marcar como No concretada? Indica que no se llegó a acordar una visita.'))) return;
    if (nuevo === 'Rechazada' && !(await confirmar('¿Marcar como Rechazada? Indica que se decidió no seguir después de la visita.'))) return;
    cambiarEstadoMutation.mutate(nuevo);
  };

  const telefono = formatearTelefonoVisual(solicitud?.telefono ?? null);

  return (
    <div>
      <button onClick={onClose} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 mb-4">
        <ArrowLeft size={15} />
        Volver a la lista
      </button>

      <div className="flex items-start justify-between mb-4 flex-wrap gap-2">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-gray-900 truncate">
            {tipo === 'solicitud'
              ? solicitud?.nombre || solicitud?.email || '(sin nombre)'
              : `Respuesta a ${presupuesto?.numero}`}
          </h1>
          <p className="text-sm text-gray-500">
            {tipo === 'solicitud' && solicitud
              ? `Solicitud recibida el ${fecha(solicitud.created_at)} · ${FUENTE_LABEL[solicitud.fuente] ?? solicitud.fuente}`
              : presupuesto?.cliente_nombre}
          </p>
        </div>
        <span className="flex items-center gap-1.5 shrink-0">
          {estado && (
            <Badge variant={VARIANTE_ESTADO[estado] ?? 'default'}>
              {tipo === 'solicitud' ? ETIQUETA_ESTADO_SOLICITUD[estado as EstadoSolicitud] : estado}
            </Badge>
          )}
          {respuestaSinRevisar && <Badge variant="pendiente">Nueva respuesta</Badge>}
        </span>
      </div>

      {tipo === 'solicitud' && solicitud && (
        <div className="bg-surface border border-gray-200 rounded-sm p-3 mb-5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs uppercase tracking-wide text-gray-500 font-semibold mr-1">Estado</span>
            {ESTADOS_SOLICITUD.filter((e) => e !== 'Eliminada').map((e) => (
              <button
                key={e}
                onClick={() => elegirEstado(e)}
                disabled={cambiarEstadoMutation.isPending}
                className={`px-3 py-1.5 rounded-sm text-xs font-semibold border transition-colors ${
                  solicitud.estado === e
                    ? 'bg-brand text-white border-brand'
                    : 'bg-surface border-gray-200 text-gray-600 hover:border-brand hover:text-brand'
                }`}
              >
                {e === 'Rechazada' ? 'Rechazada (tras visita)' : ETIQUETA_ESTADO_SOLICITUD[e]}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-2">
            No concretada: no se llegó a acordar visita. Rechazada: decisión tomada después de la visita.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5 items-start">
        <div className="flex flex-col gap-4 min-w-0">
          {tipo === 'solicitud' && solicitud && (
            <div className="bg-surface border border-gray-200 rounded-sm p-4">
              <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 flex items-center gap-1.5">
                  <MessageSquareText size={13} />
                  Lo que pide el cliente
                </p>
                {solicitud.tipo_reforma && (
                  <span className="text-xs bg-brand-light text-brand font-medium px-2 py-0.5 rounded-full">
                    {solicitud.tipo_reforma}
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed border-l-2 border-brand pl-3">
                {solicitud.comentario_cliente || '(sin comentario)'}
              </p>
              {solicitud.ultima_respuesta_cliente_resumen && (
                <div className="mt-4 pt-3 border-t border-gray-100">
                  <p className="text-xs text-brand font-semibold uppercase tracking-wide mb-1.5">
                    Respuesta del cliente · {fecha(solicitud.ultima_respuesta_cliente_fecha)}
                  </p>
                  <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed bg-brand-light rounded-sm px-3 py-2">
                    {solicitud.ultima_respuesta_cliente_resumen}
                  </p>
                </div>
              )}
            </div>
          )}

          {tipo === 'seguimiento' && presupuesto && (
            <div className="bg-surface border border-gray-200 rounded-sm p-4 text-sm text-gray-700 space-y-1.5">
              <p>
                <span className="text-gray-400">Cliente:</span> {presupuesto.cliente_nombre || '—'} ({presupuesto.cliente_email || '—'})
              </p>
              <p>
                <span className="text-gray-400">Respondió:</span> {fecha(presupuesto.ultima_respuesta_cliente_fecha)}
              </p>
              {presupuesto.conversacion && presupuesto.conversacion.length > 0 ? (
                <div className="border-t border-gray-100 mt-3 pt-3 flex flex-col gap-2.5">
                  <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide">
                    Conversación completa ({presupuesto.conversacion.length} mensaje{presupuesto.conversacion.length > 1 ? 's' : ''})
                  </p>
                  {presupuesto.conversacion.map((m, i) => {
                    const esCliente = m.de === (presupuesto.cliente_email ?? '').toLowerCase();
                    return (
                      <div key={i} className={`flex ${esCliente ? 'justify-start' : 'justify-end'}`}>
                        <div className={`max-w-[85%] rounded-sm px-3 py-2 text-sm ${esCliente ? 'bg-brand-light' : 'bg-gray-100'}`}>
                          <p className="text-[11px] font-semibold text-gray-500 mb-1">
                            {esCliente ? presupuesto.cliente_nombre || m.de : 'Nosotros'}
                            <span className="font-normal text-gray-400"> · {fecha(m.fecha)}</span>
                          </p>
                          <p className="whitespace-pre-wrap leading-relaxed text-gray-800">{m.texto}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="whitespace-pre-wrap pt-1 border-t border-gray-100 mt-2">
                  {presupuesto.ultima_respuesta_cliente_resumen || '—'}
                </p>
              )}
            </div>
          )}

          {cerrada ? (
            <div className="bg-gray-50 border border-gray-200 rounded-sm p-4 text-sm text-gray-500">
              Esta solicitud está cerrada. No se generará ningún mensaje mientras conserve este estado.
            </div>
          ) : (
            <>
              {!mensaje && (
                <div className="bg-surface border border-gray-200 rounded-sm p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3 flex items-center gap-1.5">
                    <Sparkles size={13} />
                    Mensaje de respuesta
                  </p>
                  <div className="flex items-end gap-3 flex-wrap">
                    <div className="w-56">
                      <Select label="Modelo de IA" options={MODELOS_IA} value={modelo} onChange={(e) => setModelo(e.target.value)} />
                    </div>
                    <Button onClick={() => generarMutation.mutate()} disabled={generarMutation.isPending}>
                      <span className="flex items-center gap-1.5">
                        <Sparkles size={14} />
                        {generarMutation.isPending ? 'Generando…' : 'Generar mensaje de respuesta'}
                      </span>
                    </Button>
                  </div>
                  <p className="text-xs text-gray-400 flex items-center gap-1.5 mt-3 pt-3 border-t border-gray-100">
                    <Gauge size={12} className={porcentajeUso >= 90 ? 'text-red-600' : porcentajeUso >= 60 ? 'text-amber-600' : 'text-gray-400'} />
                    Uso de IA este mes: ${(usoIaMes ?? 0).toFixed(2)} de ${presupuestoMensual.toFixed(2)} ({porcentajeUso}%)
                  </p>
                </div>
              )}

              {mensaje && (
                <div className="border border-gray-200 rounded-sm">
                  <div className="bg-brand-light px-3 py-2 flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="text-xs text-gray-500">Asunto</p>
                      <p className="text-sm font-medium text-gray-900 truncate">{mensaje.asunto}</p>
                    </div>
                    <Button size="sm" variant="secondary" onClick={() => copiar(mensaje.asunto, 'Asunto')}>
                      <Copy size={12} />
                    </Button>
                  </div>
                  <div className="p-3">
                    <p className="text-sm text-gray-900 whitespace-pre-wrap leading-relaxed">{mensaje.cuerpo}</p>
                    <Button size="sm" variant="secondary" className="mt-2" onClick={() => copiar(mensaje.cuerpo, 'Mensaje')}>
                      <span className="flex items-center gap-1.5">
                        <Copy size={12} />
                        Copiar mensaje
                      </span>
                    </Button>
                  </div>
                  {!!mensaje.avisos?.length && (
                    <div className="border-t border-gray-200 px-3 py-2 bg-amber-50">
                      <p className="text-xs font-medium text-amber-800 mb-1">Avisos</p>
                      <ul className="text-xs text-amber-800 list-disc pl-4 space-y-0.5">
                        {mensaje.avisos.map((a, i) => (
                          <li key={i}>{a}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {mensaje && !enviado && (
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="w-56">
                    <Select options={MODELOS_IA} value={modelo} onChange={(e) => setModelo(e.target.value)} />
                  </div>
                  <Button variant="secondary" onClick={() => generarMutation.mutate()} disabled={generarMutation.isPending}>
                    <span className="flex items-center gap-1.5">
                      <Sparkles size={14} />
                      {generarMutation.isPending ? 'Generando…' : 'Volver a generar'}
                    </span>
                  </Button>
                  <Button onClick={() => marcarEnviadoMutation.mutate()} disabled={marcarEnviadoMutation.isPending}>
                    <span className="flex items-center gap-1.5">
                      <Check size={14} />
                      {/* Para seguimiento este botón solo marca la respuesta como revisada — no cambia
                          presupuestos.estado a Aceptado (eso solo pasa desde las acciones masivas de
                          SolicitudesPage). Etiqueta distinta para no dar a entender que ya se aceptó
                          el presupuesto (hallazgo real, revisión 2026-08-12). */}
                      {tipo === 'solicitud' ? 'Aceptado y enviado' : 'Marcar respuesta como revisada'}
                    </span>
                  </Button>
                  {tipo === 'solicitud' && (
                    <Button variant="secondary" onClick={() => elegirEstado('No concretada')} disabled={cambiarEstadoMutation.isPending}>
                      <span className="flex items-center gap-1.5">
                        <X size={14} />
                        Marcar como no concretada
                      </span>
                    </Button>
                  )}
                </div>
              )}

              {mensaje && enviado && (
                <p className="text-sm text-brand flex items-center gap-1.5">
                  <Check size={15} />
                  Marcado como enviado{tipo === 'solicitud' ? ` el ${fecha(solicitud?.mensaje_enviado_en ?? null)}` : ''}.
                </p>
              )}
            </>
          )}
        </div>

        <div className="flex flex-col gap-4">
          {tipo === 'solicitud' && solicitud && (
            <div className="bg-surface border border-gray-200 rounded-sm p-4 text-sm text-gray-700">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Contacto</p>
              <p className="font-medium text-gray-900 mb-2">{solicitud.nombre || '(nombre no indicado)'}</p>
              <div className="space-y-1.5">
                <p className="flex items-center gap-2">
                  <Phone size={13} className="text-gray-400 shrink-0" />
                  {telefono ? (
                    <a href={`tel:${solicitud.telefono}`} className="text-brand hover:underline">
                      {telefono}
                    </a>
                  ) : (
                    <span className="text-gray-400">Sin teléfono</span>
                  )}
                </p>
                <p className="flex items-center gap-2 min-w-0">
                  <Mail size={13} className="text-gray-400 shrink-0" />
                  {solicitud.email ? (
                    <a href={`mailto:${solicitud.email}`} className="text-brand hover:underline truncate">
                      {solicitud.email}
                    </a>
                  ) : (
                    <span className="text-gray-400">Sin email</span>
                  )}
                </p>
                <p className="flex items-center gap-2">
                  <Languages size={13} className="text-gray-400 shrink-0" />
                  {solicitud.idioma === 'fr' ? 'Francés' : 'Español'}
                </p>
              </div>
              {!cerrada && (
                <Button
                  variant="secondary"
                  className="w-full mt-3"
                  onClick={() =>
                    abrirNuevaVisita({
                      nombre: solicitud.nombre ?? undefined,
                      telefono: solicitud.telefono ?? undefined,
                      email: solicitud.email ?? undefined,
                      idioma: solicitud.idioma,
                      contacto: 'Formulario',
                      tipo: solicitud.tipo_reforma ?? undefined,
                      descripcion: solicitud.comentario_cliente ?? undefined,
                      solicitudId: solicitud.id,
                    })
                  }
                >
                  <span className="flex items-center justify-center gap-1.5">
                    <CalendarPlus size={14} />
                    Crear visita desde esta solicitud
                  </span>
                </Button>
              )}
            </div>
          )}

          {tipo === 'solicitud' && solicitud && (
            <div className="bg-surface border border-gray-200 rounded-sm p-4 flex flex-col gap-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Gestión</p>
              <Select
                label="Solicita"
                options={OPCIONES_TIPO_SOLICITUD}
                value={solicitud.tipo_solicitud ?? ''}
                disabled={tipoSolicitudMutation.isPending}
                onChange={(e) => tipoSolicitudMutation.mutate((e.target.value || null) as TipoSolicitud | null)}
              />
              <div>
                <Select
                  label="Presupuesto vinculado"
                  options={[
                    { value: '', label: 'Sin vincular' },
                    ...(presupuestosDisponibles ?? []).map((p) => ({
                      value: p.id,
                      label: `${p.numero ?? '(sin número)'} — ${p.cliente_nombre ?? ''}`,
                    })),
                  ]}
                  value={solicitud.presupuesto_vinculado_id ?? ''}
                  // Deshabilitado mientras está pendiente — si no, cambiar de presupuesto vinculado dos
                  // veces seguidas antes de que la primera mutación complete lee presupuesto_vinculado_id
                  // desactualizado (aún null) en ambas y puede registrar el evento de funnel dos veces,
                  // apuntando al presupuesto ya sobrescrito (hallazgo real, revisión 2026-08-12).
                  disabled={vincularMutation.isPending}
                  onChange={(e) => vincularMutation.mutate(e.target.value || null)}
                />
                {solicitud.presupuesto_vinculado_id && (
                  <button
                    onClick={() =>
                      navigate('/finanzas/presupuestos', {
                        state: { verDocId: solicitud.presupuesto_vinculado_id, verDocTipo: 'presupuesto' },
                      })
                    }
                    className="text-xs text-brand hover:underline mt-1 flex items-center gap-1"
                  >
                    <Link2 size={11} />
                    Ver presupuesto
                  </button>
                )}
              </div>
              <div>
                <Select
                  label="Visita vinculada"
                  options={[
                    { value: '', label: 'Sin vincular' },
                    ...(visitasDisponibles ?? []).map((v) => ({
                      value: v.id,
                      label: `${[v.nombre, v.apellidos].filter(Boolean).join(' ') || '(sin nombre)'} — ${fecha(v.fecha_visita)}${v.direccion ? ` · ${v.direccion}` : ''}`,
                    })),
                  ]}
                  value={solicitud.visita_id ?? ''}
                  disabled={vincularVisitaMutation.isPending}
                  onChange={(e) => vincularVisitaMutation.mutate(e.target.value || null)}
                />
                <p className="text-xs text-gray-400 mt-1">
                  Vincular presupuesto o visita marca la solicitud como Aceptada.
                </p>
              </div>
            </div>
          )}

          {tipo === 'seguimiento' && presupuesto && (
            <div className="bg-surface border border-gray-200 rounded-sm p-4 flex flex-col gap-3">
              {presupuesto.seguimiento_concluido ? (
                <Button variant="secondary" onClick={() => concluidoMutation.mutate(false)} disabled={concluidoMutation.isPending}>
                  Reabrir conversación
                </Button>
              ) : (
                <Button onClick={() => concluidoMutation.mutate(true)} disabled={concluidoMutation.isPending}>
                  <span className="flex items-center gap-1.5">
                    <Check size={14} />
                    Marcar como Aceptada (cerrar seguimiento)
                  </span>
                </Button>
              )}
              <span className="text-xs text-gray-400">
                Cierre definitivo — deja de vigilarse por email (presupuesto definitivo, ajustes, facturas van aparte),
                independiente de si el presupuesto en sí queda Pendiente, Aceptado o Rechazado.
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
