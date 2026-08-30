import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import {
  registrarEventoFunnel,
  contarUnicosEnFunnel,
  ETAPAS_FUNNEL_SOLICITUD,
  ETIQUETA_ETAPA_FUNNEL,
  ETAPA_FUNNEL_POR_ESTADO_PRESUPUESTO,
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
import { SolicitudDetalle } from './SolicitudDetalle';
import { EntradaManualPanel } from './EntradaManualPanel';
import { AvisosPanel } from './AvisosPanel';
import {
  ESTADOS_SOLICITUD,
  FUENTE_LABEL,
  TIPO_SOLICITUD_LABEL,
  estadoSeguimiento,
  type PresupuestoConRespuesta,
  type Solicitud,
} from './types';

type Pestana = 'entrantes' | 'seguimiento' | 'avisos' | 'manual';

const PESTANAS: { value: Pestana; label: string }[] = [
  { value: 'entrantes', label: 'Solicitudes entrantes' },
  { value: 'seguimiento', label: 'Respuestas a presupuestos' },
  { value: 'avisos', label: 'Avisos' },
  { value: 'manual', label: 'Entrada manual' },
];

function fecha(f: string | null) {
  if (!f) return '—';
  return new Date(f).toLocaleDateString('es', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

type VarianteBadge = 'pendiente' | 'confirmada' | 'realizada' | 'cancelada' | 'vencida' | 'default';

const VARIANTE_ESTADO: Record<string, VarianteBadge> = {
  Nueva: 'pendiente',
  Enviada: 'realizada',
  Descartada: 'cancelada',
  Aceptada: 'confirmada',
};

// Estado real del presupuesto, único badge que se muestra en la columna "Estado" de la pestaña
// de seguimiento (fusionada con el pseudo-estado Nueva/Enviada/Aceptada a petición de Gabriel,
// 2026-08-20 — ver el "· cerrado" junto al badge más abajo) — mismo mapeo de colores que
// PresupuestosPage.tsx para que se lea igual en los dos sitios.
const VARIANTE_ESTADO_PRESUPUESTO: Record<string, VarianteBadge> = {
  Borrador: 'default',
  Pendiente: 'pendiente',
  Aceptado: 'realizada',
  Rechazado: 'cancelada',
};

const FILTRO_SOLICITUDES = ['Todas', ...ESTADOS_SOLICITUD];
// 'sin_determinar' es un valor propio del filtro (no un TipoSolicitud real) — cubre las
// solicitudes con tipo_solicitud null, la mayoría de las que llegan por formulario.
const FILTRO_TIPO_SOLICITUD = ['Todas', 'visita', 'presupuesto_orientativo', 'sin_determinar'] as const;
const FILTRO_TIPO_SOLICITUD_LABEL: Record<(typeof FILTRO_TIPO_SOLICITUD)[number], string> = {
  Todas: 'Todas',
  visita: 'Visita',
  presupuesto_orientativo: 'Presupuesto orientativo',
  sin_determinar: 'Sin determinar',
};
// Filtra por el estado real del presupuesto — igual que muestra ahora la columna "Estado" única
// de la tabla (fusionada con el pseudo-estado de seguimiento a petición de Gabriel, 2026-08-20).
const FILTRO_SEGUIMIENTO = ['Todas', 'Pendiente', 'Aceptado', 'Rechazado'];

export default function SolicitudesPage() {
  const toast = useToast();
  const confirmar = useConfirmar();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { tab } = useParams<{ tab: string }>();
  const pestana: Pestana = PESTANAS.some((p) => p.value === tab) ? (tab as Pestana) : 'entrantes';
  const [viendo, setViendo] = useState<{ tipo: 'solicitud' | 'seguimiento'; id: string } | null>(null);
  const [filtroSolicitudes, setFiltroSolicitudes] = useState('Todas');
  const [filtroTipoSolicitud, setFiltroTipoSolicitud] = useState<(typeof FILTRO_TIPO_SOLICITUD)[number]>('Todas');
  const [filtroSeguimiento, setFiltroSeguimiento] = useState('Todas');
  const {
    seleccion: seleccionSolicitudes,
    toggleFila: toggleFilaSolicitud,
    toggleTodas: toggleTodasSolicitudes,
    limpiar: limpiarSeleccionSolicitudes,
  } = useSeleccionMultiple();
  const {
    seleccion: seleccionSeguimiento,
    toggleFila: toggleFilaSeguimiento,
    toggleTodas: toggleTodasSeguimiento,
    limpiar: limpiarSeleccionSeguimiento,
  } = useSeleccionMultiple();

  const { data: solicitudes, isLoading: cargandoSolicitudes } = useQuery({
    queryKey: ['solicitudes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('solicitudes')
        .select('*, presupuesto_vinculado:presupuestos!solicitudes_presupuesto_vinculado_id_fkey(id, numero)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Solicitud[];
    },
  });

  const { data: seguimientos, isLoading: cargandoSeguimiento } = useQuery({
    queryKey: ['presupuestos', 'respuestas-pendientes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('presupuestos')
        .select(
          'id, numero, cliente_nombre, cliente_email, idioma, ultima_respuesta_cliente_resumen, ultima_respuesta_cliente_fecha, ultima_respuesta_revisada, mensaje_seguimiento_generado, mensaje_seguimiento_enviado, mensaje_seguimiento_enviado_en, seguimiento_concluido, estado',
        )
        .is('eliminado_en', null)
        .not('ultima_respuesta_cliente_fecha', 'is', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as PresupuestoConRespuesta[];
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

  const embudo = useMemo(() => {
    const eventos = funnelEventos ?? [];
    const total = contarUnicosEnFunnel(eventos, ETAPAS_FUNNEL_SOLICITUD[0]);
    return ETAPAS_FUNNEL_SOLICITUD.map((etapa) => {
      const count = contarUnicosEnFunnel(eventos, etapa);
      return { etapa, count, pct: total > 0 ? Math.round((count / total) * 100) : 0 };
    });
  }, [funnelEventos]);

  // Refresco automático al ENTRAR a esta sección (no solo al recargar la pestaña entera) — antes
  // la revisión de Gmail solo corría una vez por carga de página (AppLayout.tsx, con un ref que
  // nunca se reinicia), así que salir de Solicitudes y volver a entrar no traía nada nuevo hasta
  // un F5 completo (hallazgo real de Gabriel, 2026-08-26). Este efecto vive en la propia página, así
  // que se dispara cada vez que se MONTA (navegar aquí desde otra sección) sin necesidad de ref de
  // guarda — cambiar de pestaña interna (entrantes/seguimiento/manual) no remonta el componente,
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
      queryClient.invalidateQueries({ queryKey: ['presupuestos', 'respuestas-pendientes'] });
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
      queryClient.invalidateQueries({ queryKey: ['presupuestos', 'respuestas-pendientes'] });
      toast.success(
        `Gmail revisado: ${data.solicitudesNuevas} solicitud(es) nueva(s), ${data.respuestasDetectadas} respuesta(s) detectada(s), ${data.enviosSolicitudes} marcada(s) como enviada(s)`,
      );
    },
    onError: (error) => toast.error(error.message),
  });

  const eliminarSolicitudesMutation = useMutation({
    mutationFn: async (ids: (string | number)[]) => {
      const { error } = await supabase.from('solicitudes').delete().in('id', ids as string[]);
      if (error) throw error;
    },
    onSuccess: (_data, ids) => {
      queryClient.invalidateQueries({ queryKey: ['solicitudes'] });
      toast.success(`${ids.length} solicitud(es) eliminada(s)`);
      limpiarSeleccionSolicitudes();
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
      if (estado === 'Enviada' || estado === 'Descartada') {
        const etapa = estado === 'Enviada' ? 'solicitud_respondida' : 'solicitud_descartada';
        await Promise.all((ids as string[]).map((solicitudId) => registrarEventoFunnel(etapa, { solicitudId })));
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['solicitudes'] });
      toast.success('Estado actualizado');
      limpiarSeleccionSolicitudes();
    },
    onError: (error) => toast.error(error.message),
  });

  // Cierra el aviso de "respuesta sin revisar" sin tocar `estado` (que sigue "Enviada") ni el
  // embudo — mismo criterio que "Marcar como enviada" en la pestaña de seguimiento a presupuestos.
  const marcarRespuestaRevisadaMutation = useMutation({
    mutationFn: async (ids: (string | number)[]) => {
      const { error } = await supabase.from('solicitudes').update({ ultima_respuesta_revisada: true }).in('id', ids as string[]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['solicitudes'] });
      toast.success('Respuesta marcada como revisada');
      limpiarSeleccionSolicitudes();
    },
    onError: (error) => toast.error(error.message),
  });

  const invalidarSeguimiento = () => {
    queryClient.invalidateQueries({ queryKey: ['presupuestos', 'respuestas-pendientes'] });
    queryClient.invalidateQueries({ queryKey: ['presupuestos'] });
  };

  const eliminarSeguimientoMutation = useMutation({
    mutationFn: async (ids: (string | number)[]) => {
      const { error } = await supabase
        .from('presupuestos')
        .update({
          ultima_respuesta_cliente_resumen: null,
          ultima_respuesta_cliente_fecha: null,
          ultima_respuesta_revisada: false,
          mensaje_seguimiento_generado: null,
          mensaje_seguimiento_enviado: false,
          mensaje_seguimiento_enviado_en: null,
          seguimiento_concluido: false,
        })
        .in('id', ids as string[]);
      if (error) throw error;
    },
    onSuccess: (_data, ids) => {
      invalidarSeguimiento();
      toast.success(`${ids.length} respuesta(s) quitada(s) de la bandeja`);
      limpiarSeleccionSeguimiento();
    },
    onError: (error) => toast.error(error.message),
  });

  const marcarEnviadoSeguimientoMutation = useMutation({
    mutationFn: async (ids: (string | number)[]) => {
      const { error } = await supabase
        .from('presupuestos')
        .update({
          mensaje_seguimiento_enviado: true,
          mensaje_seguimiento_enviado_en: new Date().toISOString(),
          ultima_respuesta_revisada: true,
        })
        .in('id', ids as string[]);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidarSeguimiento();
      toast.success('Marcado como enviado');
      limpiarSeleccionSeguimiento();
    },
    onError: (error) => toast.error(error.message),
  });

  // Cierre manual y DEFINITIVO de la conversación de seguimiento — independiente del estado real
  // del presupuesto (Pendiente/Aceptado/Rechazado, que se cambia aparte más abajo). Sirve para dar
  // por zanjada una negociación tras un último mensaje de agradecimiento o aceptación, aunque el
  // presupuesto en sí siga Pendiente o incluso Rechazado. A partir de aquí revisar-gmail deja de
  // vigilar este presupuesto por completo (decisión explícita de Gabriel 2026-08-19: el
  // presupuesto definitivo post-visita, sus ajustes y las facturas siguen por email pero ya no
  // pertenecen a este tracking) — no hay reapertura automática. Para volver a activarlo hay que
  // usar "Volver a Nueva" a mano.
  const marcarAceptadaSeguimientoMutation = useMutation({
    mutationFn: async (ids: (string | number)[]) => {
      const { error } = await supabase
        .from('presupuestos')
        .update({
          seguimiento_concluido: true,
          mensaje_seguimiento_enviado: true,
          mensaje_seguimiento_enviado_en: new Date().toISOString(),
          ultima_respuesta_revisada: true,
        })
        .in('id', ids as string[]);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidarSeguimiento();
      toast.success('Conversación dada por concluida');
      limpiarSeleccionSeguimiento();
    },
    onError: (error) => toast.error(error.message),
  });

  const volverNuevaSeguimientoMutation = useMutation({
    mutationFn: async (ids: (string | number)[]) => {
      const { error } = await supabase
        .from('presupuestos')
        .update({
          mensaje_seguimiento_generado: null,
          mensaje_seguimiento_enviado: false,
          mensaje_seguimiento_enviado_en: null,
          ultima_respuesta_revisada: false,
          seguimiento_concluido: false,
        })
        .in('id', ids as string[]);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidarSeguimiento();
      toast.success('Vuelto a "Nueva" / no leído');
      limpiarSeleccionSeguimiento();
    },
    onError: (error) => toast.error(error.message),
  });

  const cambiarEstadoPresupuestoMutation = useMutation({
    mutationFn: async ({ ids, estado }: { ids: (string | number)[]; estado: string }) => {
      const { error } = await supabase.from('presupuestos').update({ estado }).in('id', ids as string[]);
      if (error) throw error;
      // Tercer sitio (junto a PresupuestosPage.tsx/DocumentoDetalleInline.tsx) donde se cambia
      // presupuestos.estado — sin esto el embudo se quedaba corto cada vez que se gestionaba una
      // respuesta desde aquí en vez de desde Presupuestos (hallazgo real, revisión 2026-08-12).
      const etapaFunnel = ETAPA_FUNNEL_POR_ESTADO_PRESUPUESTO[estado];
      if (etapaFunnel) {
        await Promise.all((ids as string[]).map((presupuestoId) => registrarEventoFunnel(etapaFunnel, { presupuestoId })));
      }
    },
    onSuccess: () => {
      invalidarSeguimiento();
      toast.success('Estado del presupuesto actualizado');
      limpiarSeleccionSeguimiento();
    },
    onError: (error) => toast.error(error.message),
  });

  if (viendo) {
    return <SolicitudDetalle tipo={viendo.tipo} id={viendo.id} onClose={() => setViendo(null)} />;
  }

  const solicitudesFiltradas = (solicitudes ?? []).filter((s) => {
    if (filtroSolicitudes !== 'Todas' && s.estado !== filtroSolicitudes) return false;
    if (filtroTipoSolicitud === 'Todas') return true;
    if (filtroTipoSolicitud === 'sin_determinar') return !s.tipo_solicitud;
    return s.tipo_solicitud === filtroTipoSolicitud;
  });
  const seguimientosFiltrados = (seguimientos ?? []).filter(
    (p) => filtroSeguimiento === 'Todas' || p.estado === filtroSeguimiento,
  );

  const nuevasSolicitudes = (solicitudes ?? []).filter((s) => s.estado === 'Nueva').length;
  // Respuesta de un cliente a una solicitud ya "Enviada", todavía sin atender — no cuenta como
  // "Nueva" (eso revertía estado y distorsionaba el embudo, ver revisar-gmail) pero sigue
  // necesitando acción, así que cuenta aparte para el KPI/contador de la pestaña.
  const respuestasSinRevisarSolicitudes = (solicitudes ?? []).filter(
    (s) => s.estado === 'Enviada' && !s.ultima_respuesta_revisada,
  ).length;
  const pendientesEntrantes = nuevasSolicitudes + respuestasSinRevisarSolicitudes;
  const nuevosSeguimientos = (seguimientos ?? []).filter((p) => estadoSeguimiento(p) === 'Nueva').length;

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Solicitudes & Seguimiento</h1>
          <p className="text-sm text-gray-500">Solicitudes entrantes, respuestas de clientes a presupuestos, avisos de pendientes y entrada manual — todo en un sitio.</p>
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
          { label: 'Respuestas nuevas a presupuestos', valor: nuevosSeguimientos, acento: nuevosSeguimientos > 0 },
        ]}
      />

      <div className="bg-surface border border-gray-200 rounded-sm p-3 mb-6">
        <p className="text-xs uppercase tracking-wide text-gray-400 font-semibold mb-2">
          Embudo de conversión · últimos 90 días
        </p>
        {/* El tracking fino (funnel_eventos) arrancó el 11/08/2026 — las solicitudes anteriores a
            esa fecha no tienen eventos aunque ya estén gestionadas, así que el embudo puede
            parecer bajo/vacío al principio sin que sea un fallo del tracking. */}
        <p className="text-xs text-gray-400 mb-2">Datos desde el 11/08/2026, fecha en la que se activó este seguimiento.</p>
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
          const contador = t.value === 'entrantes' ? pendientesEntrantes : t.value === 'seguimiento' ? nuevosSeguimientos : 0;
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
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xs uppercase tracking-wide text-gray-400 font-semibold">Solicitudes entrantes</h2>
            <div className="flex items-center gap-2">
              <div className="w-48">
                <Select
                  options={FILTRO_TIPO_SOLICITUD.map((v) => ({ value: v, label: FILTRO_TIPO_SOLICITUD_LABEL[v] }))}
                  value={filtroTipoSolicitud}
                  onChange={(e) => setFiltroTipoSolicitud(e.target.value as (typeof FILTRO_TIPO_SOLICITUD)[number])}
                />
              </div>
              <div className="w-48">
                <Select
                  options={FILTRO_SOLICITUDES.map((e) => ({ value: e, label: e }))}
                  value={filtroSolicitudes}
                  onChange={(e) => setFiltroSolicitudes(e.target.value)}
                />
              </div>
            </div>
          </div>
          <BulkActionsBar
            count={seleccionSolicitudes.size}
            onCancelar={limpiarSeleccionSolicitudes}
            acciones={[
              {
                label: 'Marcar como Nueva',
                onClick: () => cambiarEstadoSolicitudesMutation.mutate({ ids: Array.from(seleccionSolicitudes), estado: 'Nueva' }),
                disabled: cambiarEstadoSolicitudesMutation.isPending,
              },
              {
                label: 'Marcar como Enviada',
                onClick: () => cambiarEstadoSolicitudesMutation.mutate({ ids: Array.from(seleccionSolicitudes), estado: 'Enviada' }),
                disabled: cambiarEstadoSolicitudesMutation.isPending,
              },
              {
                label: 'Marcar como Descartada',
                onClick: () => cambiarEstadoSolicitudesMutation.mutate({ ids: Array.from(seleccionSolicitudes), estado: 'Descartada' }),
                disabled: cambiarEstadoSolicitudesMutation.isPending,
              },
              {
                label: 'Marcar respuesta como revisada',
                onClick: () => marcarRespuestaRevisadaMutation.mutate(Array.from(seleccionSolicitudes)),
                disabled: marcarRespuestaRevisadaMutation.isPending,
              },
              {
                label: 'Eliminar',
                variant: 'danger',
                onClick: async () => {
                  // Aviso explícito del riesgo de reingestión (bug real corregido 2026-08-18,
                  // confirmado con duplicados reales en producción): las que vienen de Gmail
                  // (Landbot, noreply@, autoenvíos) tienen un email de origen con id único, y si
                  // se borra la fila el próximo "Comprobar Gmail" la vuelve a crear como Nueva.
                  // "Descartada" es la vía segura para dejar de verla sin ese riesgo.
                  if (
                    !(await confirmar(
                      `¿Eliminar ${seleccionSolicitudes.size} solicitud(es)? Esta acción no se puede deshacer, y si vinieron de Gmail pueden volver a aparecer como "Nueva" en la próxima revisión automática. Para descartarlas sin ese riesgo, usa "Marcar como Descartada" en su lugar.`,
                    ))
                  )
                    return;
                  eliminarSolicitudesMutation.mutate(Array.from(seleccionSolicitudes));
                },
                disabled: eliminarSolicitudesMutation.isPending,
              },
            ]}
          />
          <div className="bg-surface border border-gray-200 rounded-sm overflow-hidden">
            <Table
              loading={cargandoSolicitudes}
              data={solicitudesFiltradas}
              emptyMessage="No hay solicitudes"
              onRowClick={(s) => setViendo({ tipo: 'solicitud', id: s.id })}
              rowClassName={(s) =>
                s.estado === 'Nueva' || (s.estado === 'Enviada' && !s.ultima_respuesta_revisada)
                  ? 'font-semibold text-gray-900'
                  : ''
              }
              seleccion={seleccionSolicitudes}
              onToggleFila={toggleFilaSolicitud}
              onToggleTodas={toggleTodasSolicitudes}
              columns={[
                { key: 'created_at', label: 'Fecha', render: (s) => fecha(s.created_at) },
                { key: 'fuente', label: 'Fuente', render: (s) => FUENTE_LABEL[s.fuente] ?? s.fuente },
                { key: 'nombre', label: 'Cliente', render: (s) => s.nombre || s.email || '—' },
                { key: 'tipo_reforma', label: 'Tipo de reforma', render: (s) => s.tipo_reforma || '—' },
                {
                  key: 'tipo_solicitud',
                  label: 'Solicita',
                  render: (s) => (s.tipo_solicitud ? TIPO_SOLICITUD_LABEL[s.tipo_solicitud] : <span className="text-gray-400">Sin determinar</span>),
                },
                {
                  key: 'presupuesto_vinculado',
                  label: 'Presupuesto',
                  sortable: false,
                  render: (s) =>
                    s.presupuesto_vinculado ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate('/finanzas/presupuestos', {
                            state: { verDocId: s.presupuesto_vinculado!.id, verDocTipo: 'presupuesto' },
                          });
                        }}
                        className="text-brand hover:underline font-medium"
                      >
                        {s.presupuesto_vinculado.numero}
                      </button>
                    ) : (
                      <span className="text-gray-400">—</span>
                    ),
                },
                {
                  key: 'estado',
                  label: 'Estado',
                  render: (s) => (
                    <span className="flex items-center gap-1.5">
                      <Badge variant={VARIANTE_ESTADO[s.estado] ?? 'default'}>{s.estado}</Badge>
                      {s.estado === 'Enviada' && !s.ultima_respuesta_revisada && (
                        <Badge variant="pendiente">Nueva respuesta</Badge>
                      )}
                    </span>
                  ),
                },
              ]}
            />
          </div>
        </>
      )}

      {pestana === 'seguimiento' && (
        <>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xs uppercase tracking-wide text-gray-400 font-semibold">Respuestas a presupuestos enviados</h2>
            <div className="w-48">
              <Select
                options={FILTRO_SEGUIMIENTO.map((e) => ({ value: e, label: e }))}
                value={filtroSeguimiento}
                onChange={(e) => setFiltroSeguimiento(e.target.value)}
              />
            </div>
          </div>
          <BulkActionsBar
            count={seleccionSeguimiento.size}
            onCancelar={limpiarSeleccionSeguimiento}
            acciones={[
              {
                label: 'Marcar como Aceptado',
                onClick: () => cambiarEstadoPresupuestoMutation.mutate({ ids: Array.from(seleccionSeguimiento), estado: 'Aceptado' }),
                disabled: cambiarEstadoPresupuestoMutation.isPending,
              },
              {
                label: 'Marcar como Rechazado',
                onClick: () => cambiarEstadoPresupuestoMutation.mutate({ ids: Array.from(seleccionSeguimiento), estado: 'Rechazado' }),
                disabled: cambiarEstadoPresupuestoMutation.isPending,
              },
              {
                label: 'Marcar como enviada',
                onClick: () => marcarEnviadoSeguimientoMutation.mutate(Array.from(seleccionSeguimiento)),
                disabled: marcarEnviadoSeguimientoMutation.isPending,
              },
              {
                label: 'Marcar como Aceptada (cerrar seguimiento)',
                onClick: () => marcarAceptadaSeguimientoMutation.mutate(Array.from(seleccionSeguimiento)),
                disabled: marcarAceptadaSeguimientoMutation.isPending,
              },
              {
                label: 'Volver a Nueva / no leído',
                onClick: () => volverNuevaSeguimientoMutation.mutate(Array.from(seleccionSeguimiento)),
                disabled: volverNuevaSeguimientoMutation.isPending,
              },
              {
                label: 'Eliminar (quitar respuesta)',
                variant: 'danger',
                onClick: async () => {
                  if (!(await confirmar(`¿Quitar ${seleccionSeguimiento.size} respuesta(s) de esta bandeja? El presupuesto no se elimina.`))) return;
                  eliminarSeguimientoMutation.mutate(Array.from(seleccionSeguimiento));
                },
                disabled: eliminarSeguimientoMutation.isPending,
              },
            ]}
          />
          <div className="bg-surface border border-gray-200 rounded-sm overflow-hidden">
            <Table
              loading={cargandoSeguimiento}
              data={seguimientosFiltrados}
              emptyMessage="No hay respuestas registradas"
              onRowClick={(p) => setViendo({ tipo: 'seguimiento', id: p.id })}
              rowClassName={(p) => (estadoSeguimiento(p) === 'Nueva' ? 'font-semibold text-gray-900' : '')}
              seleccion={seleccionSeguimiento}
              onToggleFila={toggleFilaSeguimiento}
              onToggleTodas={toggleTodasSeguimiento}
              columns={[
                {
                  key: 'numero',
                  label: 'Presupuesto',
                  render: (p) => (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate('/finanzas/presupuestos', { state: { verDocId: p.id, verDocTipo: 'presupuesto' } });
                      }}
                      className="text-brand hover:underline font-medium"
                    >
                      {p.numero}
                    </button>
                  ),
                },
                { key: 'cliente_nombre', label: 'Cliente', render: (p) => p.cliente_nombre || '—' },
                { key: 'ultima_respuesta_cliente_fecha', label: 'Fecha respuesta', render: (p) => fecha(p.ultima_respuesta_cliente_fecha) },
                {
                  key: 'ultima_respuesta_cliente_resumen',
                  label: 'Resumen',
                  sortable: false,
                  render: (p) => (
                    <span className="line-clamp-2 max-w-md block font-normal">{p.ultima_respuesta_cliente_resumen || '—'}</span>
                  ),
                },
                {
                  key: 'estado',
                  label: 'Estado',
                  render: (p) => (
                    <span className="flex items-center gap-1.5">
                      <Badge variant={VARIANTE_ESTADO_PRESUPUESTO[p.estado] ?? 'default'}>{p.estado}</Badge>
                      {p.seguimiento_concluido && (
                        <span className="text-[10px] uppercase tracking-wide text-gray-400">· cerrado</span>
                      )}
                    </span>
                  ),
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
