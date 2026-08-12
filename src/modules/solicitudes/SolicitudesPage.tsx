import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import {
  registrarEventoFunnel,
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
import {
  ESTADOS_SOLICITUD,
  FUENTE_LABEL,
  estadoSeguimiento,
  type EstadoSeguimiento,
  type PresupuestoConRespuesta,
  type Solicitud,
} from './types';

type Pestana = 'entrantes' | 'seguimiento' | 'manual';

const PESTANAS: { value: Pestana; label: string }[] = [
  { value: 'entrantes', label: 'Solicitudes entrantes' },
  { value: 'seguimiento', label: 'Respuestas a presupuestos' },
  { value: 'manual', label: 'Entrada manual' },
];

function fecha(f: string | null) {
  if (!f) return '—';
  return new Date(f).toLocaleDateString('es', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

type VarianteBadge = 'pendiente' | 'confirmada' | 'realizada' | 'cancelada' | 'vencida' | 'default';

const VARIANTE_ESTADO: Record<string, VarianteBadge> = {
  Nueva: 'pendiente',
  Borrador: 'confirmada',
  Enviada: 'realizada',
  Descartada: 'cancelada',
};

const FILTRO_SOLICITUDES = ['Todas', ...ESTADOS_SOLICITUD];
const FILTRO_SEGUIMIENTO = ['Todas', 'Nueva', 'Borrador', 'Enviada'];

export default function SolicitudesPage() {
  const toast = useToast();
  const confirmar = useConfirmar();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { tab } = useParams<{ tab: string }>();
  const pestana: Pestana = PESTANAS.some((p) => p.value === tab) ? (tab as Pestana) : 'entrantes';
  const [viendo, setViendo] = useState<{ tipo: 'solicitud' | 'seguimiento'; id: string } | null>(null);
  const [filtroSolicitudes, setFiltroSolicitudes] = useState('Todas');
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
      const { data, error } = await supabase.from('solicitudes').select('*').order('created_at', { ascending: false });
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
          'id, numero, cliente_nombre, cliente_email, idioma, ultima_respuesta_cliente_resumen, ultima_respuesta_cliente_fecha, ultima_respuesta_revisada, mensaje_seguimiento_generado, mensaje_seguimiento_enviado, mensaje_seguimiento_enviado_en',
        )
        .is('eliminado_en', null)
        .not('ultima_respuesta_cliente_fecha', 'is', null)
        .order('ultima_respuesta_cliente_fecha', { ascending: false });
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
    const contarUnicos = (etapa: EtapaFunnel) => {
      const campo = etapa.startsWith('presupuesto_') ? 'presupuesto_id' : 'solicitud_id';
      return new Set(eventos.filter((e) => e.etapa === etapa).map((e) => e[campo]).filter(Boolean)).size;
    };
    const base = ETAPAS_FUNNEL_SOLICITUD[0];
    const total = contarUnicos(base);
    return ETAPAS_FUNNEL_SOLICITUD.map((etapa) => {
      const count = contarUnicos(etapa);
      return { etapa, count, pct: total > 0 ? Math.round((count / total) * 100) : 0 };
    });
  }, [funnelEventos]);

  const comprobarGmail = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('revisar-gmail');
      if (error) throw error;
      if (data?.ok === false) throw new Error(data.error);
      return data as { solicitudesNuevas: number; respuestasDetectadas: number };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['solicitudes'] });
      queryClient.invalidateQueries({ queryKey: ['presupuestos', 'respuestas-pendientes'] });
      toast.success(`Gmail revisado: ${data.solicitudesNuevas} solicitud(es) nueva(s), ${data.respuestasDetectadas} respuesta(s) detectada(s)`);
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
      if (estado === 'Enviada') patch.mensaje_enviado_en = new Date().toISOString();
      if (estado === 'Nueva') {
        patch.mensaje_generado = null;
        patch.mensaje_generado_en = null;
        patch.mensaje_enviado_en = null;
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

  const volverNuevaSeguimientoMutation = useMutation({
    mutationFn: async (ids: (string | number)[]) => {
      const { error } = await supabase
        .from('presupuestos')
        .update({
          mensaje_seguimiento_generado: null,
          mensaje_seguimiento_enviado: false,
          mensaje_seguimiento_enviado_en: null,
          ultima_respuesta_revisada: false,
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

  const solicitudesFiltradas = (solicitudes ?? []).filter((s) => filtroSolicitudes === 'Todas' || s.estado === filtroSolicitudes);
  const seguimientosFiltrados = (seguimientos ?? []).filter(
    (p) => filtroSeguimiento === 'Todas' || estadoSeguimiento(p) === filtroSeguimiento,
  );

  const nuevasSolicitudes = (solicitudes ?? []).filter((s) => s.estado === 'Nueva').length;
  const borradoresSolicitudes = (solicitudes ?? []).filter((s) => s.estado === 'Borrador').length;
  const nuevosSeguimientos = (seguimientos ?? []).filter((p) => estadoSeguimiento(p) === 'Nueva').length;

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Solicitudes & Seguimiento</h1>
          <p className="text-sm text-gray-500">Solicitudes entrantes, respuestas de clientes a presupuestos y entrada manual — todo en un sitio.</p>
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
          { label: 'Borradores sin enviar', valor: borradoresSolicitudes },
          { label: 'Respuestas nuevas a revisar', valor: nuevosSeguimientos, acento: nuevosSeguimientos > 0 },
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
          const contador = t.value === 'entrantes' ? nuevasSolicitudes : t.value === 'seguimiento' ? nuevosSeguimientos : 0;
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
            <div className="w-48">
              <Select
                options={FILTRO_SOLICITUDES.map((e) => ({ value: e, label: e }))}
                value={filtroSolicitudes}
                onChange={(e) => setFiltroSolicitudes(e.target.value)}
              />
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
                label: 'Marcar como Borrador',
                onClick: () => cambiarEstadoSolicitudesMutation.mutate({ ids: Array.from(seleccionSolicitudes), estado: 'Borrador' }),
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
                label: 'Eliminar',
                variant: 'danger',
                onClick: async () => {
                  if (!(await confirmar(`¿Eliminar ${seleccionSolicitudes.size} solicitud(es)? Esta acción no se puede deshacer.`))) return;
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
              rowClassName={(s) => (s.estado === 'Nueva' ? 'font-semibold text-gray-900' : '')}
              seleccion={seleccionSolicitudes}
              onToggleFila={toggleFilaSolicitud}
              onToggleTodas={toggleTodasSolicitudes}
              columns={[
                { key: 'created_at', label: 'Fecha', render: (s) => fecha(s.created_at) },
                { key: 'fuente', label: 'Fuente', render: (s) => FUENTE_LABEL[s.fuente] ?? s.fuente },
                { key: 'nombre', label: 'Cliente', render: (s) => s.nombre || s.email || '—' },
                { key: 'tipo_reforma', label: 'Tipo de reforma', render: (s) => s.tipo_reforma || '—' },
                {
                  key: 'estado',
                  label: 'Estado',
                  render: (s) => <Badge variant={VARIANTE_ESTADO[s.estado] ?? 'default'}>{s.estado}</Badge>,
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
                { key: 'numero', label: 'Presupuesto' },
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
                  sortValue: (p) => estadoSeguimiento(p),
                  render: (p) => {
                    const e: EstadoSeguimiento = estadoSeguimiento(p);
                    return <Badge variant={VARIANTE_ESTADO[e] ?? 'default'}>{e}</Badge>;
                  },
                },
              ]}
            />
          </div>
        </>
      )}

      {pestana === 'manual' && <EntradaManualPanel onCreada={() => navigate('/solicitudes/entrantes')} />}
    </div>
  );
}
