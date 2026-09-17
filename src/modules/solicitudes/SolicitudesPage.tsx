import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { sincronizarTipoSolicitud } from '../../lib/sincronizarTipoSolicitud';
import { formatearTelefonoVisual } from '../clientes/types';
import {
  registrarEventoFunnel,
  contarUnicosEnFunnel,
  ETAPAS_FUNNEL_SOLICITUD,
  ETIQUETA_ETAPA_FUNNEL,
  type EtapaFunnel,
} from '../../lib/funnelTracking';
import { useToast } from '../../hooks/useToast';
import { useConfirmar } from '../../hooks/useConfirm';
import { useSeleccionMultiple } from '../../hooks/useSeleccionMultiple';
import { Table } from '../../components/ui/Table';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Select } from '../../components/ui/Select';
import { KpiRow } from '../../components/ui/Kpi';
import { BulkActionsBar } from '../../components/ui/BulkActionsBar';
import { InfoTooltip } from '../../components/ui/InfoTooltip';
import { SolicitudDetalle } from './SolicitudDetalle';
import { PendienteEnvioDetalle } from './PendienteEnvioDetalle';
import { EntradaManualPanel } from './EntradaManualPanel';
import { AvisosPanel } from './AvisosPanel';
import {
  ESTADOS_SOLICITUD,
  ETIQUETA_ESTADO_SOLICITUD,
  FUENTE_LABEL,
  SELECT_SOLICITUDES,
  TIPO_SOLICITUD_LABEL,
  type MensajeEnvioFila,
  type PresupuestoPendienteEnvio,
  type Solicitud,
} from './types';

type Pestana = 'entrantes' | 'pendientes' | 'avisos' | 'manual';

const PESTANAS: { value: Pestana; label: string }[] = [
  { value: 'entrantes', label: 'Solicitud de presupuesto' },
  { value: 'pendientes', label: 'Pendientes de enviar' },
  { value: 'avisos', label: 'Avisos' },
  { value: 'manual', label: 'Entrada manual' },
];

function fecha(f: string | null) {
  if (!f) return '—';
  return new Date(f).toLocaleDateString('es', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

type VarianteBadge = 'pendiente' | 'confirmada' | 'realizada' | 'cancelada' | 'vencida' | 'en-espera' | 'default';

const VARIANTE_ESTADO: Record<string, VarianteBadge> = {
  Nueva: 'pendiente',
  Enviada: 'en-espera',
  Aceptada: 'confirmada',
  'No concretada': 'vencida',
  Rechazada: 'cancelada',
  Eliminada: 'default',
};

const FILTRO_SOLICITUDES = ['Todas', ...ESTADOS_SOLICITUD];
// 'sin_determinar' es un valor propio del filtro (no un TipoSolicitud real) — cubre las
// solicitudes con tipo_solicitud null, las que no se pudieron autodetectar.
const FILTRO_TIPO_SOLICITUD = ['Todas', 'visita', 'presupuesto_orientativo', 'sin_determinar'] as const;
const FILTRO_TIPO_SOLICITUD_LABEL: Record<(typeof FILTRO_TIPO_SOLICITUD)[number], string> = {
  Todas: 'Todas',
  visita: 'Visita',
  presupuesto_orientativo: 'Presupuesto orientativo',
  sin_determinar: 'Sin determinar',
};

// Fila de la tabla "Solicitud de presupuesto" — hasta el 2026-09-16 se fusionaba aquí también con
// las respuestas a presupuestos ya enviados (tabla `presupuestos`), pero el estado que se veía en
// esa fila dependía entonces del estado del PRESUPUESTO (Pendiente/Aceptado/Rechazado), no de la
// solicitud — confusión real de Gabriel con un caso donde la visita ya estaba hecha y la fila
// seguía en "Pendiente" porque eso venía del presupuesto, no de la solicitud. Criterio actual: el
// estado que se ve aquí es SIEMPRE el de la solicitud (Nueva/Enviada/Aceptada/Rechazada/Eliminada),
// y "Aceptada" depende solo de si hay visita — los presupuestos no entran en esta cuenta. El
// seguimiento de respuestas a presupuestos sigue existiendo como dato (presupuestos.mensaje_seguimiento_*
// en Supabase) pero ya no tiene vista propia en esta página.
type FilaUnificada = { id: string; solicitud: Solicitud };

function idsPorOrigen(seleccion: Set<string | number>, origen: 'sol'): string[] {
  const prefijo = `${origen}:`;
  return Array.from(seleccion)
    .filter((id): id is string => typeof id === 'string' && id.startsWith(prefijo))
    .map((id) => id.slice(prefijo.length));
}

export default function SolicitudesPage() {
  const toast = useToast();
  const confirmar = useConfirmar();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { tab } = useParams<{ tab: string }>();
  const pestana: Pestana = PESTANAS.some((p) => p.value === tab) ? (tab as Pestana) : 'entrantes';
  const [viendo, setViendo] = useState<{ tipo: 'solicitud' | 'seguimiento'; id: string } | null>(null);
  const [viendoPendienteId, setViendoPendienteId] = useState<string | null>(null);
  const [filtroSolicitudes, setFiltroSolicitudes] = useState('Todas');
  const [filtroTipoSolicitud, setFiltroTipoSolicitud] = useState<(typeof FILTRO_TIPO_SOLICITUD)[number]>('Todas');
  const {
    seleccion: seleccionUnificada,
    toggleFila: toggleFilaUnificada,
    toggleTodas: toggleTodasUnificada,
    limpiar: limpiarSeleccionUnificada,
  } = useSeleccionMultiple();
  const {
    seleccion: seleccionPendientes,
    toggleFila: toggleFilaPendientes,
    toggleTodas: toggleTodasPendientes,
    limpiar: limpiarSeleccionPendientes,
  } = useSeleccionMultiple();

  const { data: solicitudes, isLoading: cargandoSolicitudes } = useQuery({
    queryKey: ['solicitudes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('solicitudes')
        .select(SELECT_SOLICITUDES)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Solicitud[];
    },
  });

  // Solo los que siguen pendientes — alimenta el KPI y el contador de la pestaña, mismo criterio
  // (misma queryKey y mismas columnas) que el badge de Sidebar.tsx, para no repetir el bug de
  // caché compartida documentado en CLAUDE.md.
  const { data: pendientesEnvio } = useQuery({
    queryKey: ['presupuestos', 'pendientes-envio'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('presupuestos')
        .select('id, numero, cliente_nombre, cliente_tel, cliente_email, idioma, mensaje_pendiente_texto, mensaje_pendiente_enviado_en')
        .is('eliminado_en', null)
        .not('mensaje_pendiente_texto', 'is', null)
        .is('mensaje_pendiente_enviado_en', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as PresupuestoPendienteEnvio[];
    },
  });

  // Tabla completa de la pestaña — a diferencia de arriba, incluye también los ya enviados (para
  // que la tabla sirva de historial con columna "Estado") y la zona/país de la visita vinculada.
  // queryKey distinta a propósito (filtro distinto, no solo columnas distintas — mismo motivo que
  // ya obligó a separar claves en el bug de Sidebar.tsx).
  const { data: mensajesEnvio, isLoading: cargandoPendientes } = useQuery({
    queryKey: ['presupuestos', 'mensajes-envio'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('presupuestos')
        .select('id, numero, cliente_nombre, cliente_tel, cliente_email, idioma, visita_id, mensaje_pendiente_texto, mensaje_pendiente_enviado_en')
        .is('eliminado_en', null)
        .not('mensaje_pendiente_texto', 'is', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      const visitaIds = [...new Set((data ?? []).map((p) => p.visita_id).filter((v): v is string => !!v))];
      let zonasPorVisita = new Map<string, { zona: string | null; pais: string | null }>();
      if (visitaIds.length > 0) {
        const { data: visitas, error: errorVisitas } = await supabase.from('visitas').select('id, zona, pais').in('id', visitaIds);
        if (errorVisitas) throw errorVisitas;
        zonasPorVisita = new Map((visitas ?? []).map((v) => [v.id, { zona: v.zona, pais: v.pais }]));
      }
      return (data ?? []).map((p) => ({
        ...p,
        visita_zona: p.visita_id ? (zonasPorVisita.get(p.visita_id)?.zona ?? null) : null,
        visita_pais: p.visita_id ? (zonasPorVisita.get(p.visita_id)?.pais ?? null) : null,
      })) as MensajeEnvioFila[];
    },
  });

  const desdeEmbudo = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 90);
    return d.toISOString();
  }, []);

  const { data: funnelEventos } = useQuery({
    queryKey: ['funnel_eventos', 'ultimos-90-dias'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('funnel_eventos')
        .select('etapa, solicitud_id, presupuesto_id')
        .gte('created_at', desdeEmbudo);
      if (error) throw error;
      return data as { etapa: EtapaFunnel; solicitud_id: string | null; presupuesto_id: string | null }[];
    },
  });

  // Ids de presupuestos orientativos — se excluyen del embudo (no son ingreso real todavía, mismo
  // criterio que el KPI "Aceptados" de PresupuestosPage.tsx), ver contarUnicosEnFunnel.
  const { data: presupuestosOrientativoIds } = useQuery({
    queryKey: ['presupuestos', 'ids-orientativos'],
    queryFn: async () => {
      const { data, error } = await supabase.from('presupuestos').select('id').eq('tipo', 'orientativo').is('eliminado_en', null);
      if (error) throw error;
      return new Set((data ?? []).map((p) => p.id as string));
    },
  });

  const embudo = useMemo(() => {
    const eventos = funnelEventos ?? [];
    const total = contarUnicosEnFunnel(eventos, ETAPAS_FUNNEL_SOLICITUD[0]);
    return ETAPAS_FUNNEL_SOLICITUD.map((etapa) => {
      const count = contarUnicosEnFunnel(eventos, etapa, presupuestosOrientativoIds);
      return { etapa, count, pct: total > 0 ? Math.round((count / total) * 100) : 0 };
    });
  }, [funnelEventos, presupuestosOrientativoIds]);

  // Refresco automático al ENTRAR a esta sección (no solo al recargar la pestaña entera) — antes
  // la revisión de Gmail solo corría una vez por carga de página (AppLayout.tsx, con un ref que
  // nunca se reinicia), así que salir de Solicitudes y volver a entrar no traía nada nuevo hasta
  // un F5 completo (hallazgo real de Gabriel, 2026-08-26). Este efecto vive en la propia página, así
  // que se dispara cada vez que se MONTA (navegar aquí desde otra sección) sin necesidad de ref de
  // guarda — cambiar de pestaña interna (entrantes/pendientes/manual) no remonta el componente,
  // así que no se dispara de más. Silencioso igual que el de AppLayout: si falla, solo consola.
  useEffect(() => {
    supabase.functions.invoke('revisar-gmail').then(({ data, error }) => {
      if (error) {
        console.error('Revisión automática de Gmail:', error.message);
        return;
      }
      if (data?.ok === false) {
        console.error('Revisión automática de Gmail:', data.error);
        return;
      }
      queryClient.invalidateQueries({ queryKey: ['solicitudes'] });
    });
  }, [queryClient]);

  // Reclasifica visita/presupuesto orientativo cada vez que se entra en la sección — mismo
  // criterio de "silencioso si falla" que el efecto de arriba, no bloquea la carga de la página.
  useEffect(() => {
    sincronizarTipoSolicitud().then(() => {
      queryClient.invalidateQueries({ queryKey: ['solicitudes'] });
    });
  }, [queryClient]);

  const comprobarGmail = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('revisar-gmail');
      if (error) throw error;
      if (data?.ok === false) throw new Error(data.error);
      return data as { solicitudesNuevas: number; respuestasDetectadas: number; enviosSolicitudes: number };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['solicitudes'] });
      toast.success(
        `Gmail revisado: ${data.solicitudesNuevas} solicitud(es) nueva(s), ${data.respuestasDetectadas} respuesta(s) detectada(s), ${data.enviosSolicitudes} marcada(s) como enviada(s)`,
      );
    },
    onError: (error) => toast.error(error.message),
  });

  const cambiarEstadoSolicitudesMutation = useMutation({
    mutationFn: async ({ ids, estado }: { ids: (string | number)[]; estado: string }) => {
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
      const { error } = await supabase.from('solicitudes').update(patch).in('id', ids as string[]);
      if (error) throw error;
      if (estado === 'Enviada' || estado === 'No concretada') {
        // 'solicitud_descartada' solo representa que no se concretó una visita. Un rechazo tras
        // visita no añade esta etapa: la visita ya conserva su conversión en el embudo.
        const etapa = estado === 'Enviada' ? 'solicitud_respondida' : 'solicitud_descartada';
        await Promise.all((ids as string[]).map((solicitudId) => registrarEventoFunnel(etapa, { solicitudId })));
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['solicitudes'] });
      toast.success('Estado actualizado');
      limpiarSeleccionUnificada();
    },
    onError: (error) => toast.error(error.message),
  });

  // Dos queryKeys distintas que invalidar juntas (badge/KPI vs. tabla completa con historial) —
  // invalidateQueries solo empareja por PREFIJO exacto del array, así que hace falta llamarlo dos
  // veces, una llamada con ['presupuestos', 'pendientes-envio'] nunca alcanza a
  // ['presupuestos', 'mensajes-envio'].
  const invalidarPendientes = () => {
    queryClient.invalidateQueries({ queryKey: ['presupuestos', 'pendientes-envio'] });
    queryClient.invalidateQueries({ queryKey: ['presupuestos', 'mensajes-envio'] });
  };

  const marcarEnviadoPendienteMutation = useMutation({
    mutationFn: async (ids: (string | number)[]) => {
      const { error } = await supabase
        .from('presupuestos')
        .update({ mensaje_pendiente_enviado_en: new Date().toISOString() })
        .in('id', ids as string[]);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidarPendientes();
      toast.success('Marcado como enviado');
      limpiarSeleccionPendientes();
    },
    onError: (error) => toast.error(error.message),
  });

  const quitarPendienteMutation = useMutation({
    mutationFn: async (ids: (string | number)[]) => {
      const { error } = await supabase
        .from('presupuestos')
        .update({ mensaje_pendiente_texto: null, mensaje_pendiente_enviado_en: null })
        .in('id', ids as string[]);
      if (error) throw error;
    },
    onSuccess: (_data, ids) => {
      invalidarPendientes();
      toast.success(`${ids.length} mensaje(s) quitado(s) de pendientes`);
      limpiarSeleccionPendientes();
    },
    onError: (error) => toast.error(error.message),
  });

  if (viendo) {
    return <SolicitudDetalle tipo={viendo.tipo} id={viendo.id} onClose={() => setViendo(null)} />;
  }
  if (viendoPendienteId) {
    return <PendienteEnvioDetalle id={viendoPendienteId} onClose={() => setViendoPendienteId(null)} />;
  }

  const solicitudesFiltradas = (solicitudes ?? []).filter((s) => {
    if (filtroSolicitudes !== 'Todas' && s.estado !== filtroSolicitudes) return false;
    // "Eliminada" no cuenta como parte de "Todas" — hay que filtrarla explícitamente para verla,
    // mismo criterio que el antiguo botón "Eliminar" pero sin perder el dato (ver types.ts).
    if (filtroSolicitudes === 'Todas' && s.estado === 'Eliminada') return false;
    if (filtroTipoSolicitud === 'Todas') return true;
    if (filtroTipoSolicitud === 'sin_determinar') return !s.tipo_solicitud;
    return s.tipo_solicitud === filtroTipoSolicitud;
  });
  const filasUnificadas: FilaUnificada[] = solicitudesFiltradas
    .map((s): FilaUnificada => ({ id: `sol:${s.id}`, solicitud: s }))
    .sort((a, b) => b.solicitud.created_at.localeCompare(a.solicitud.created_at));

  const nuevasSolicitudes = (solicitudes ?? []).filter((s) => s.estado === 'Nueva').length;
  // Respuesta de un cliente a una solicitud ya "Enviada", todavía sin atender — no cuenta como
  // "Nueva" (eso revertía estado y distorsionaba el embudo, ver revisar-gmail) pero sigue
  // necesitando acción, así que cuenta aparte para el KPI/contador de la pestaña.
  const respuestasSinRevisarSolicitudes = (solicitudes ?? []).filter(
    (s) => s.estado === 'Enviada' && !s.ultima_respuesta_revisada,
  ).length;
  const pendientesEntrantes = nuevasSolicitudes + respuestasSinRevisarSolicitudes;
  const totalPendientesEnvio = (pendientesEnvio ?? []).length;

  // Acciones del desplegable "cambiar estado" separadas por tipo — el desplegable solo muestra el
  // grupo cuyo tipo esté realmente presente en la selección (ver más abajo), en vez de mostrar
  // siempre las 12 aunque la mitad no apliquen a nada seleccionado (confusión real de Gabriel,
  // 2026-09-16).
  // dot: mismo color que el Badge de cada estado en la tabla (ver VARIANTE_ESTADO más arriba), para
  // que el desplegable de "cambiar estado" se lea igual de un vistazo (petición de Gabriel, 2026-09-16).
  const accionesSolicitud = [
    {
      label: 'Marcar como Nueva',
      dot: 'rgb(var(--badge-pendiente-text))',
      onClick: () => cambiarEstadoSolicitudesMutation.mutate({ ids: idsPorOrigen(seleccionUnificada, 'sol'), estado: 'Nueva' }),
      disabled: cambiarEstadoSolicitudesMutation.isPending || idsPorOrigen(seleccionUnificada, 'sol').length === 0,
    },
    {
      label: `Marcar como ${ETIQUETA_ESTADO_SOLICITUD.Enviada}`,
      dot: 'rgb(var(--badge-en-espera-text))',
      onClick: () => cambiarEstadoSolicitudesMutation.mutate({ ids: idsPorOrigen(seleccionUnificada, 'sol'), estado: 'Enviada' }),
      disabled: cambiarEstadoSolicitudesMutation.isPending || idsPorOrigen(seleccionUnificada, 'sol').length === 0,
    },
    {
      label: 'Marcar como Aceptada',
      dot: 'rgb(var(--badge-confirmada-text))',
      onClick: () => cambiarEstadoSolicitudesMutation.mutate({ ids: idsPorOrigen(seleccionUnificada, 'sol'), estado: 'Aceptada' }),
      disabled: cambiarEstadoSolicitudesMutation.isPending || idsPorOrigen(seleccionUnificada, 'sol').length === 0,
    },
    {
      label: 'Marcar como No concretada',
      dot: 'rgb(var(--badge-vencida-text))',
      onClick: () =>
        cambiarEstadoSolicitudesMutation.mutate({ ids: idsPorOrigen(seleccionUnificada, 'sol'), estado: 'No concretada' }),
      disabled: cambiarEstadoSolicitudesMutation.isPending || idsPorOrigen(seleccionUnificada, 'sol').length === 0,
    },
    {
      label: 'Marcar como Rechazada (tras visita)',
      dot: 'rgb(var(--color-gray-500))',
      onClick: () => cambiarEstadoSolicitudesMutation.mutate({ ids: idsPorOrigen(seleccionUnificada, 'sol'), estado: 'Rechazada' }),
      disabled: cambiarEstadoSolicitudesMutation.isPending || idsPorOrigen(seleccionUnificada, 'sol').length === 0,
    },
    {
      label: 'Eliminar solicitud(es)',
      variant: 'danger' as const,
      dot: 'rgb(var(--color-gray-500))',
      onClick: async () => {
        const ids = idsPorOrigen(seleccionUnificada, 'sol');
        if (ids.length === 0) return;
        // Ya no es un DELETE real (2026-09-15) — es solo otro estado, así que no hay riesgo de
        // que Gmail la vuelva a crear como "Nueva" al reingerirla. Se puede recuperar filtrando
        // por "Eliminada" y volviendo a "Nueva"/"Enviada".
        if (!(await confirmar(`¿Eliminar ${ids.length} solicitud(es)? Dejarán de verse en la lista por defecto — puedes recuperarlas filtrando por "Eliminada".`)))
          return;
        cambiarEstadoSolicitudesMutation.mutate({ ids, estado: 'Eliminada' });
      },
      disabled: cambiarEstadoSolicitudesMutation.isPending || idsPorOrigen(seleccionUnificada, 'sol').length === 0,
    },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h1 className="text-lg font-semibold text-gray-900 flex items-center gap-1.5">
            Solicitudes & Seguimiento
            <InfoTooltip>
              Solicitud de presupuesto (incluye respuestas de clientes), pendientes de enviar por WhatsApp/SMS, avisos
              y entrada manual — todo en un sitio.
            </InfoTooltip>
          </h1>
        </div>
        <Button variant="secondary" onClick={() => comprobarGmail.mutate()} disabled={comprobarGmail.isPending}>
          <span className="flex items-center gap-1.5">
            <RefreshCw size={14} className={comprobarGmail.isPending ? 'animate-spin' : ''} />
            Comprobar Gmail ahora
          </span>
        </Button>
      </div>

      <KpiRow
        items={[
          { label: 'Solicitudes nuevas', valor: nuevasSolicitudes, acento: nuevasSolicitudes > 0 },
          {
            label: 'Respuestas de clientes sin revisar',
            valor: respuestasSinRevisarSolicitudes,
            acento: respuestasSinRevisarSolicitudes > 0,
          },
          { label: 'Pendientes de enviar (WhatsApp/SMS)', valor: totalPendientesEnvio, acento: totalPendientesEnvio > 0 },
        ]}
      />

      <div className="bg-surface border border-gray-200 rounded-sm p-3 mb-6">
        {/* El tracking fino (funnel_eventos) arrancó el 11/08/2026 — las solicitudes anteriores a
            esa fecha no tienen eventos aunque ya estén gestionadas, así que el embudo puede
            parecer bajo/vacío al principio sin que sea un fallo del tracking. */}
        <p className="text-xs uppercase tracking-wide text-gray-400 font-semibold mb-2 flex items-center gap-1.5">
          Embudo de conversión · últimos 90 días
          <InfoTooltip>Datos desde el 11/08/2026, fecha en la que se activó este seguimiento.</InfoTooltip>
        </p>
        {embudo[0].count === 0 ? (
          <p className="text-sm text-gray-400 py-2">Sin solicitudes registradas en este período</p>
        ) : (
          <div className="flex items-stretch gap-2 flex-wrap">
            {embudo.map((e, i) => (
              <div key={e.etapa} className="flex items-center gap-2">
                <div className="min-w-[110px]">
                  <p className="text-xs text-gray-400">{ETIQUETA_ETAPA_FUNNEL[e.etapa]}</p>
                  <p className="text-lg font-semibold text-gray-900">
                    {e.count} <span className="text-xs font-normal text-gray-400">({e.pct}%)</span>
                  </p>
                </div>
                {i < embudo.length - 1 && <span className="text-gray-300">→</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {PESTANAS.map((t) => {
          const contador = t.value === 'entrantes' ? pendientesEntrantes : t.value === 'pendientes' ? totalPendientesEnvio : 0;
          return (
            <button
              key={t.value}
              onClick={() => navigate(`/solicitudes/${t.value}`)}
              className={`px-3 py-1.5 rounded-sm text-xs font-semibold uppercase tracking-wide border transition-colors flex items-center gap-1.5 ${
                pestana === t.value
                  ? 'bg-brand text-white border-brand'
                  : 'bg-surface border-gray-200 text-gray-600 hover:border-brand'
              }`}
            >
              {t.label}
              {contador > 0 && (
                <span
                  className={`text-[10px] font-bold rounded-full px-1.5 leading-4 ${
                    pestana === t.value ? 'bg-white/20 text-white' : 'bg-red-600 text-white'
                  }`}
                >
                  {contador}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {pestana === 'entrantes' && (
        <>
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <h2 className="text-xs uppercase tracking-wide text-gray-400 font-semibold">Solicitud de presupuesto</h2>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="w-48">
                <Select
                  options={FILTRO_TIPO_SOLICITUD.map((v) => ({ value: v, label: FILTRO_TIPO_SOLICITUD_LABEL[v] }))}
                  value={filtroTipoSolicitud}
                  onChange={(e) => setFiltroTipoSolicitud(e.target.value as (typeof FILTRO_TIPO_SOLICITUD)[number])}
                />
              </div>
              <div className="w-48">
                <Select
                  options={FILTRO_SOLICITUDES.map((e) => ({
                    value: e,
                    label: e === 'Todas' ? e : ETIQUETA_ESTADO_SOLICITUD[e as Solicitud['estado']],
                  }))}
                  value={filtroSolicitudes}
                  onChange={(e) => setFiltroSolicitudes(e.target.value)}
                />
              </div>
            </div>
          </div>
          <BulkActionsBar count={seleccionUnificada.size} onCancelar={limpiarSeleccionUnificada} acciones={accionesSolicitud} />
          <div className="bg-surface border border-gray-200 rounded-sm overflow-hidden">
            <Table
              loading={cargandoSolicitudes}
              data={filasUnificadas}
              emptyMessage="No hay solicitudes"
              onRowClick={(f) => setViendo({ tipo: 'solicitud', id: f.solicitud.id })}
              rowClassName={(f) =>
                f.solicitud.estado === 'Nueva' || (f.solicitud.estado === 'Enviada' && !f.solicitud.ultima_respuesta_revisada)
                  ? 'font-semibold text-gray-900'
                  : ''
              }
              seleccion={seleccionUnificada}
              onToggleFila={toggleFilaUnificada}
              onToggleTodas={toggleTodasUnificada}
              columns={[
                {
                  key: 'created_at',
                  label: 'Fecha',
                  render: (f) => fecha(f.solicitud.created_at),
                },
                {
                  key: 'fuente',
                  label: 'Fuente',
                  sortable: false,
                  render: (f) => FUENTE_LABEL[f.solicitud.fuente] ?? f.solicitud.fuente,
                },
                {
                  key: 'nombre',
                  label: 'Cliente',
                  render: (f) => f.solicitud.nombre || f.solicitud.email || '—',
                },
                {
                  key: 'tipo_reforma',
                  label: 'Tipo de reforma',
                  render: (f) => f.solicitud.tipo_reforma || '—',
                },
                {
                  key: 'tipo_solicitud',
                  label: 'Solicita',
                  render: (f) =>
                    f.solicitud.tipo_solicitud ? (
                      TIPO_SOLICITUD_LABEL[f.solicitud.tipo_solicitud]
                    ) : (
                      <span className="text-gray-400">Sin determinar</span>
                    ),
                },
                {
                  key: 'presupuesto_vinculado',
                  label: 'Presupuesto',
                  sortable: false,
                  render: (f) => {
                    const vinculo = f.solicitud.presupuesto_vinculado;
                    if (!vinculo) return <span className="text-gray-400">—</span>;
                    return (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate('/finanzas/presupuestos', { state: { verDocId: vinculo.id, verDocTipo: 'presupuesto' } });
                        }}
                        className="text-brand hover:underline font-medium"
                      >
                        {vinculo.numero}
                      </button>
                    );
                  },
                },
                {
                  key: 'estado',
                  label: 'Estado',
                  render: (f) => (
                    <span className="flex items-center gap-1.5">
                      <Badge variant={VARIANTE_ESTADO[f.solicitud.estado] ?? 'default'}>
                        {ETIQUETA_ESTADO_SOLICITUD[f.solicitud.estado]}
                      </Badge>
                      {f.solicitud.estado === 'Enviada' &&
                        !f.solicitud.ultima_respuesta_revisada &&
                        (f.solicitud.respuesta_programada_en ? (
                          <Badge variant="confirmada">Respuesta programada · {fecha(f.solicitud.respuesta_programada_en)}</Badge>
                        ) : (
                          <Badge variant="pendiente">Nueva respuesta</Badge>
                        ))}
                    </span>
                  ),
                },
              ]}
            />
          </div>
        </>
      )}

      {pestana === 'pendientes' && (
        <>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xs uppercase tracking-wide text-gray-400 font-semibold">Pendientes de enviar por WhatsApp/SMS</h2>
          </div>
          <p className="text-xs text-gray-400 mb-2">
            Mensajes ya redactados para clientes que entraron por WhatsApp o llamada — el CRM no los envía, es un
            recordatorio para no perderlos de vista. Márcalos como enviados en cuanto se los mandes de verdad.
          </p>
          <BulkActionsBar
            count={seleccionPendientes.size}
            onCancelar={limpiarSeleccionPendientes}
            acciones={[
              {
                label: 'Marcar como enviado',
                onClick: () => marcarEnviadoPendienteMutation.mutate(Array.from(seleccionPendientes)),
                disabled: marcarEnviadoPendienteMutation.isPending,
              },
              {
                label: 'Quitar de pendientes',
                variant: 'danger',
                onClick: async () => {
                  if (!(await confirmar(`¿Quitar ${seleccionPendientes.size} mensaje(s) de pendientes? El presupuesto no se elimina.`))) return;
                  quitarPendienteMutation.mutate(Array.from(seleccionPendientes));
                },
                disabled: quitarPendienteMutation.isPending,
              },
            ]}
          />
          <div className="bg-surface border border-gray-200 rounded-sm overflow-hidden">
            <Table
              loading={cargandoPendientes}
              data={mensajesEnvio ?? []}
              emptyMessage="No hay mensajes pendientes de enviar"
              onRowClick={(p) => setViendoPendienteId(p.id)}
              rowClassName={(p) => (p.mensaje_pendiente_enviado_en ? 'opacity-60' : '')}
              seleccion={seleccionPendientes}
              onToggleFila={toggleFilaPendientes}
              onToggleTodas={toggleTodasPendientes}
              columns={[
                { key: 'numero', label: 'Presupuesto', render: (p) => <span className="font-medium">{p.numero ?? 'S/N'}</span> },
                { key: 'cliente_nombre', label: 'Cliente', render: (p) => p.cliente_nombre || '—' },
                { key: 'cliente_tel', label: 'Teléfono', render: (p) => formatearTelefonoVisual(p.cliente_tel) || '—' },
                {
                  key: 'visita_zona',
                  label: 'Zona',
                  render: (p) => (p.visita_zona ? `${p.visita_zona}${p.visita_pais ? ` (${p.visita_pais === 'Francia' ? 'FR' : 'ES'})` : ''}` : '—'),
                },
                {
                  key: 'estado_envio',
                  label: 'Estado',
                  render: (p) => <Badge variant={p.mensaje_pendiente_enviado_en ? 'realizada' : 'pendiente'}>{p.mensaje_pendiente_enviado_en ? 'Enviado' : 'Pendiente'}</Badge>,
                },
                {
                  key: 'mensaje_pendiente_texto',
                  label: 'Mensaje',
                  sortable: false,
                  render: (p) => <span className="line-clamp-2 max-w-md block font-normal">{p.mensaje_pendiente_texto}</span>,
                },
              ]}
            />
          </div>
        </>
      )}

      {pestana === 'avisos' && <AvisosPanel onAbrirSolicitud={(id) => setViendo({ tipo: 'solicitud', id })} />}

      {pestana === 'manual' && <EntradaManualPanel onCreada={() => navigate('/solicitudes/entrantes')} />}
    </div>
  );
}
