import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { Table } from '../../components/ui/Table';
import { KpiRow } from '../../components/ui/Kpi';

// Mismo criterio de umbral que useNotificaciones.ts / alerta-diaria (2026-08-30): un borrador
// (orientativo o normal) que lleva 2+ días sin marcarse como enviado se considera "olvidado".
const LIMITE_DIAS_BORRADOR = 2;

function isoHaceDias(dias: number) {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return d.toISOString().slice(0, 10);
}

function fecha(f: string | null) {
  if (!f) return '—';
  return new Date(f).toLocaleDateString('es', { day: '2-digit', month: 'short', year: '2-digit' });
}

type VisitaRealizada = { id: string; nombre: string; apellidos: string; fecha_visita: string | null };
type PresupuestoAviso = {
  id: string;
  numero: string | null;
  cliente_nombre: string | null;
  estado: string;
  visita_id: string | null;
  created_at: string;
  fecha_validez: string | null;
};
type SolicitudOrientativa = { id: string; nombre: string | null; email: string | null; created_at: string; estado: string };

export function AvisosPanel({ onAbrirSolicitud }: { onAbrirSolicitud: (id: string) => void }) {
  const navigate = useNavigate();

  const { data: visitas, isLoading: cargandoVisitas } = useQuery({
    queryKey: ['visitas', 'realizadas', 'avisos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('visitas')
        .select('id, nombre, apellidos, fecha_visita')
        .eq('estado', 'Realizada')
        .is('eliminado_en', null);
      if (error) throw error;
      return data as VisitaRealizada[];
    },
  });

  const { data: presupuestos, isLoading: cargandoPresupuestos } = useQuery({
    queryKey: ['presupuestos', 'avisos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('presupuestos')
        .select('id, numero, cliente_nombre, estado, visita_id, created_at, fecha_validez')
        .is('eliminado_en', null);
      if (error) throw error;
      return data as PresupuestoAviso[];
    },
  });

  const { data: solicitudes, isLoading: cargandoSolicitudes } = useQuery({
    queryKey: ['solicitudes', 'orientativas-sin-vincular'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('solicitudes')
        .select('id, nombre, email, created_at, estado')
        .eq('tipo_solicitud', 'presupuesto_orientativo')
        .is('presupuesto_vinculado_id', null)
        .neq('estado', 'Descartada');
      if (error) throw error;
      return data as SolicitudOrientativa[];
    },
  });

  // 1. Visita Realizada sin ningún presupuesto no-Borrador vinculado — mismo criterio que la
  // campanita/alerta-diaria: un borrador ya creado para esa visita no cuenta como "enviado".
  const visitaIdsConPresupuestoEnviado = new Set(
    (presupuestos ?? []).filter((p) => p.estado !== 'Borrador' && p.visita_id).map((p) => p.visita_id as string),
  );
  const visitasSinPresupuesto = (visitas ?? []).filter((v) => !visitaIdsConPresupuestoEnviado.has(v.id));

  // 2. Presupuesto en Borrador (cualquier tipo) sin marcar como enviado, 2+ días desde su creación.
  const limiteBorrador = isoHaceDias(LIMITE_DIAS_BORRADOR);
  const borradoresSinEnviar = (presupuestos ?? []).filter(
    (p) => p.estado === 'Borrador' && p.created_at.slice(0, 10) <= limiteBorrador,
  );

  // 3. Solicitud que ya se marcó como "quiere presupuesto orientativo" pero todavía no tiene
  // ningún presupuesto vinculado — vinculación automática por contacto (funnelTracking.ts) o
  // manual desde SolicitudDetalle.tsx.
  const orientativosSinVincular = solicitudes ?? [];

  // 4. Presupuestos ya enviados (Pendiente) cuya validez ya pasó o está a punto — mismo criterio
  // que useNotificaciones.ts/alerta-diaria, aquí como bandeja de trabajo en vez de solo aviso.
  const hoy = isoHaceDias(0);
  const limite7d = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  })();
  const presupuestosPorCerrar = (presupuestos ?? []).filter(
    (p) => p.estado === 'Pendiente' && p.fecha_validez && p.fecha_validez <= limite7d,
  );

  const totalAvisos =
    visitasSinPresupuesto.length + borradoresSinEnviar.length + orientativosSinVincular.length + presupuestosPorCerrar.length;

  const irAPresupuesto = (id: string) => navigate('/finanzas/presupuestos', { state: { verDocId: id, verDocTipo: 'presupuesto' } });

  return (
    <div>
      <KpiRow
        items={[
          { label: 'Visitas sin presupuesto', valor: visitasSinPresupuesto.length, acento: visitasSinPresupuesto.length > 0 },
          { label: 'Borradores sin enviar', valor: borradoresSinEnviar.length, acento: borradoresSinEnviar.length > 0 },
          { label: 'Orientativos sin vincular', valor: orientativosSinVincular.length, acento: orientativosSinVincular.length > 0 },
          { label: 'Por caducar / caducados', valor: presupuestosPorCerrar.length, acento: presupuestosPorCerrar.length > 0 },
        ]}
      />

      {totalAvisos === 0 && !cargandoVisitas && !cargandoPresupuestos && !cargandoSolicitudes && (
        <p className="text-sm text-gray-400 py-6 text-center">No hay ningún aviso pendiente ahora mismo.</p>
      )}

      <div className="space-y-6">
        <div>
          <h2 className="text-xs uppercase tracking-wide text-gray-400 font-semibold mb-2">
            Visitas realizadas sin presupuesto enviado ({visitasSinPresupuesto.length})
          </h2>
          <div className="bg-surface border border-gray-200 rounded-sm overflow-hidden">
            <Table
              loading={cargandoVisitas || cargandoPresupuestos}
              data={visitasSinPresupuesto}
              emptyMessage="Ninguna"
              onRowClick={(v) => navigate(`/visitas/${v.id}`)}
              columns={[
                { key: 'nombre', label: 'Cliente', render: (v) => `${v.nombre} ${v.apellidos}` },
                { key: 'fecha_visita', label: 'Fecha de la visita', render: (v) => fecha(v.fecha_visita) },
              ]}
            />
          </div>
        </div>

        <div>
          <h2 className="text-xs uppercase tracking-wide text-gray-400 font-semibold mb-2">
            Presupuestos en Borrador sin enviar, {LIMITE_DIAS_BORRADOR}+ días ({borradoresSinEnviar.length})
          </h2>
          <div className="bg-surface border border-gray-200 rounded-sm overflow-hidden">
            <Table
              loading={cargandoPresupuestos}
              data={borradoresSinEnviar}
              emptyMessage="Ninguno"
              onRowClick={(p) => irAPresupuesto(p.id)}
              columns={[
                { key: 'numero', label: 'Presupuesto', render: (p) => p.numero ?? 'S/N' },
                { key: 'cliente_nombre', label: 'Cliente', render: (p) => p.cliente_nombre || '—' },
                { key: 'created_at', label: 'En Borrador desde', render: (p) => fecha(p.created_at) },
              ]}
            />
          </div>
        </div>

        <div>
          <h2 className="text-xs uppercase tracking-wide text-gray-400 font-semibold mb-2">
            Solicitudes que quieren orientativo, sin presupuesto vinculado ({orientativosSinVincular.length})
          </h2>
          <div className="bg-surface border border-gray-200 rounded-sm overflow-hidden">
            <Table
              loading={cargandoSolicitudes}
              data={orientativosSinVincular}
              emptyMessage="Ninguna"
              onRowClick={(s) => onAbrirSolicitud(s.id)}
              columns={[
                { key: 'nombre', label: 'Cliente', render: (s) => s.nombre || s.email || 'Sin nombre' },
                { key: 'created_at', label: 'Recibida', render: (s) => fecha(s.created_at) },
                { key: 'estado', label: 'Estado', render: (s) => s.estado },
              ]}
            />
          </div>
        </div>

        <div>
          <h2 className="text-xs uppercase tracking-wide text-gray-400 font-semibold mb-2">
            Presupuestos enviados por caducar o ya caducados, 7 días ({presupuestosPorCerrar.length})
          </h2>
          <div className="bg-surface border border-gray-200 rounded-sm overflow-hidden">
            <Table
              loading={cargandoPresupuestos}
              data={presupuestosPorCerrar}
              emptyMessage="Ninguno"
              onRowClick={(p) => irAPresupuesto(p.id)}
              columns={[
                { key: 'numero', label: 'Presupuesto', render: (p) => p.numero ?? 'S/N' },
                { key: 'cliente_nombre', label: 'Cliente', render: (p) => p.cliente_nombre || '—' },
                {
                  key: 'fecha_validez',
                  label: 'Válido hasta',
                  render: (p) => (
                    <span className={p.fecha_validez! < hoy ? 'text-red-600 font-medium' : ''}>{fecha(p.fecha_validez)}</span>
                  ),
                },
              ]}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
