import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { registrarEventoFunnel } from '../../lib/funnelTracking';
import { useToast } from '../../hooks/useToast';
import { useConfirmar } from '../../hooks/useConfirm';
import { Table } from '../../components/ui/Table';
import { Button } from '../../components/ui/Button';
import { KpiRow } from '../../components/ui/Kpi';
import { normalizarNombre, normalizarTelefono } from '../clientes/types';
import { ETIQUETA_ESTADO_SOLICITUD, type EstadoSolicitud } from './types';
import { isoLocal } from '../../lib/fechas';

// Mismo criterio de umbral que useNotificaciones.ts / alerta-diaria (2026-08-30): un borrador
// (orientativo o normal) que lleva 2+ días sin marcarse como enviado se considera "olvidado".
const LIMITE_DIAS_BORRADOR = 2;

function isoHaceDias(dias: number) {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return isoLocal(d);
}

function fecha(f: string | null) {
  if (!f) return '—';
  return new Date(f).toLocaleDateString('es', { day: '2-digit', month: 'short', year: '2-digit' });
}

type VisitaRealizada = {
  id: string;
  nombre: string;
  apellidos: string;
  fecha_visita: string | null;
  email: string | null;
  telefono: string | null;
  idioma: string | null;
  contacto: string | null;
};
type SolicitudContacto = {
  id: string;
  nombre: string | null;
  email: string | null;
  telefono: string | null;
  visita_id: string | null;
  fuente: string;
};
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
type SolicitudDescartada = {
  id: string;
  nombre: string | null;
  email: string | null;
  telefono: string | null;
  created_at: string;
  visita_id: string | null;
  estado: string;
};

// Solicitud creada al cerrar desde Avisos una visita que no tenía ninguna — mismo vocabulario de
// fuente que EntradaManualPanel.tsx, deducido de cómo llegó el cliente según la visita.
function fuenteDesdeContacto(contacto: string | null) {
  if (contacto === 'WhatsApp') return 'whatsapp';
  if (contacto === 'Llamada') return 'llamada';
  if (contacto === 'SMS') return 'sms';
  if (contacto === 'Email') return 'email_directo';
  return 'manual';
}

export function AvisosPanel({ onAbrirSolicitud }: { onAbrirSolicitud: (id: string) => void }) {
  const navigate = useNavigate();
  const toast = useToast();
  const confirmar = useConfirmar();
  const queryClient = useQueryClient();

  const { data: visitas, isLoading: cargandoVisitas } = useQuery({
    queryKey: ['visitas', 'realizadas', 'avisos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('visitas')
        .select('id, nombre, apellidos, fecha_visita, email, telefono, idioma, contacto')
        .eq('estado', 'Realizada')
        .is('eliminado_en', null);
      if (error) throw error;
      return data as VisitaRealizada[];
    },
  });

  // Solicitudes no concretadas/rechazadas (mismo criterio de cruce por contacto que funnelTracking.ts /
  // pipelineSync.ts) — una visita cuya solicitud de origen se marcó como cerrada (Gabriel decidió no
  // presupuestar esa obra) no debe seguir apareciendo indefinidamente como "sin presupuesto
  // enviado": no es que se haya olvidado, es que ya se decidió no enviar nada (hallazgo real de
  // Gabriel 2026-09-07, caso Raphael Szuba — declinado por riesgo estructural pese a insistir el
  // cliente, la solicitud se marcó Descartada —ahora Rechazada— pero la visita seguía en este panel).
  // 'Eliminada' excluida a propósito (bug real, 2026-09-21, caso Mickaël Maystre): es un borrado
  // definitivo (sustituye al DELETE real), no una decisión de negocio de no presupuestar — si se
  // incluye aquí, una visita real que coincide por contacto con una solicitud duplicada/errónea ya
  // eliminada queda invisible como "necesita presupuesto" en este panel, la campana y el email
  // diario, aunque nadie haya decidido de verdad no presupuestarla.
  const { data: solicitudesDescartadas } = useQuery({
    queryKey: ['solicitudes', 'descartadas-contacto'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('solicitudes')
        .select('id, nombre, email, telefono, created_at, visita_id, estado')
        .in('estado', ['No concretada', 'Rechazada']);
      if (error) throw error;
      return data as SolicitudDescartada[];
    },
  });

  // Solicitudes aún abiertas — para cerrar desde la tabla de visitas sin presupuesto la solicitud
  // de ese cliente (petición de Gabriel 2026-09-27), sin tener que buscarla en la pestaña Solicitud.
  const { data: solicitudesAbiertas } = useQuery({
    queryKey: ['solicitudes', 'abiertas-contacto'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('solicitudes')
        .select('id, nombre, email, telefono, visita_id, fuente')
        .in('estado', ['Nueva', 'Enviada', 'Aceptada']);
      if (error) throw error;
      return data as SolicitudContacto[];
    },
  });

  // Mismo cruce que el resto del panel: visita_id enlazado primero, luego teléfono, email y nombre
  // (este último solo si identifica una única solicitud).
  const solicitudDeVisita = (v: VisitaRealizada) => {
    const candidatas = solicitudesAbiertas ?? [];
    const porVisita = candidatas.find((s) => s.visita_id === v.id);
    if (porVisita) return porVisita;
    const telefono = v.telefono ? normalizarTelefono(v.telefono) : '';
    const porTelefono = telefono ? candidatas.find((s) => s.telefono && normalizarTelefono(s.telefono) === telefono) : undefined;
    if (porTelefono) return porTelefono;
    const email = v.email?.trim().toLowerCase();
    const porEmail = email ? candidatas.find((s) => s.email?.trim().toLowerCase() === email) : undefined;
    if (porEmail) return porEmail;
    const nombre = normalizarNombre(`${v.nombre} ${v.apellidos}`);
    const porNombre = nombre ? candidatas.filter((s) => normalizarNombre(s.nombre ?? '') === nombre) : [];
    return porNombre.length === 1 ? porNombre[0] : undefined;
  };

  const cerrarVisitaMutation = useMutation({
    mutationFn: async ({ visita, estado }: { visita: VisitaRealizada; estado: 'No concretada' | 'Rechazada' }) => {
      const existente = solicitudDeVisita(visita);
      if (existente) {
        const patch: Record<string, unknown> = { estado };
        if (!existente.visita_id) patch.visita_id = visita.id;
        const { error } = await supabase.from('solicitudes').update(patch).eq('id', existente.id);
        if (error) throw error;
        // Mismo criterio que SolicitudesPage/SolicitudDetalle: solo "No concretada" es una etapa del embudo.
        if (estado === 'No concretada') {
          await registrarEventoFunnel('solicitud_descartada', { solicitudId: existente.id, fuente: existente.fuente });
        }
        return;
      }
      // Visita sin solicitud (WhatsApp, llamada, visita registrada a mano…): se crea una ya cerrada
      // y enlazada, para dejar rastro de la decisión (decisión de Gabriel 2026-09-27). Sin eventos de
      // embudo a propósito: no es una entrada real, es el registro a posteriori de un cierre.
      const { error } = await supabase.from('solicitudes').insert({
        fuente: fuenteDesdeContacto(visita.contacto),
        idioma: visita.idioma === 'Français' ? 'fr' : 'es',
        nombre: `${visita.nombre} ${visita.apellidos}`.trim() || null,
        email: visita.email,
        telefono: visita.telefono,
        estado,
        visita_id: visita.id,
        ultima_respuesta_revisada: true,
        notas: 'Creada desde Avisos para registrar el cierre de una visita que no tenía solicitud.',
      });
      if (error) throw error;
    },
    onSuccess: (_data, { estado }) => {
      queryClient.invalidateQueries({ queryKey: ['solicitudes'] });
      toast.success(`Marcada como ${ETIQUETA_ESTADO_SOLICITUD[estado]}`);
    },
    onError: (error) => toast.error(error.message),
  });

  const cerrarVisita = async (visita: VisitaRealizada, estado: 'No concretada' | 'Rechazada') => {
    const nombre = `${visita.nombre} ${visita.apellidos}`.trim();
    const texto =
      estado === 'No concretada'
        ? `¿Marcar la solicitud de ${nombre} como No concretada? Dejará de aparecer en este aviso.`
        : `¿Marcar la solicitud de ${nombre} como Rechazada (tras visita)? Dejará de aparecer en este aviso.`;
    if (await confirmar(texto)) cerrarVisitaMutation.mutate({ visita, estado });
  };

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
        .not('estado', 'in', '(No concretada,Rechazada,Eliminada)');
      if (error) throw error;
      return data as SolicitudOrientativa[];
    },
  });

  // 1. Visita Realizada sin ningún presupuesto no-Borrador vinculado — mismo criterio que la
  // campanita/alerta-diaria: un borrador ya creado para esa visita no cuenta como "enviado".
  const visitaIdsConPresupuestoEnviado = new Set(
    (presupuestos ?? []).filter((p) => p.estado !== 'Borrador' && p.visita_id).map((p) => p.visita_id as string),
  );
  const emailsDescartados = new Set(
    (solicitudesDescartadas ?? []).map((s) => s.email?.trim().toLowerCase()).filter((e): e is string => !!e),
  );
  const telefonosDescartados = new Set(
    (solicitudesDescartadas ?? [])
      .map((s) => (s.telefono ? normalizarTelefono(s.telefono) : ''))
      .filter((t) => t.length > 0),
  );
  const nombresDescartados = new Set(
    (solicitudesDescartadas ?? [])
      .map((s) => (s.nombre ? normalizarNombre(s.nombre) : ''))
      .filter(
        (n, _indice, nombres) => n.length > 0 && nombres.filter((otro) => otro === n).length === 1,
      ),
  );
  const visitaIdsDescartadas = new Set(
    (solicitudesDescartadas ?? []).map((s) => s.visita_id).filter((id): id is string => !!id),
  );
  const visitasSinPresupuesto = (visitas ?? []).filter((v) => {
    if (visitaIdsConPresupuestoEnviado.has(v.id)) return false;
    if (visitaIdsDescartadas.has(v.id)) return false;
    if (v.email && emailsDescartados.has(v.email.trim().toLowerCase())) return false;
    if (v.telefono && telefonosDescartados.has(normalizarTelefono(v.telefono))) return false;
    if (nombresDescartados.has(normalizarNombre(`${v.nombre} ${v.apellidos}`))) return false;
    return true;
  });

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
    return isoLocal(d);
  })();
  const presupuestosPorCerrar = (presupuestos ?? []).filter(
    (p) => p.estado === 'Pendiente' && p.fecha_validez && p.fecha_validez <= limite7d,
  );

  // 5. Visita Realizada cuyo contacto coincide con una solicitud cerrada que todavía
  // no tiene visita_id — el cruce automático (vincularSolicitudPorVisita, VisitaForm.tsx) solo
  // enlaza solicitudes activas a propósito, para no reabrir sin más una que Gabriel rechazó de
  // verdad (p. ej. Raphael Szuba, declinado por riesgo estructural pese a la visita ya hecha — ver
  // comentario más arriba). Aquí se deja como revisión manual: puede que sea un rechazo legítimo
  // pese a la visita, o puede que sea el mismo hueco que dejó "Vinculadas a presupuesto" antes del
  // rediseño del embudo (2026-09-16) — vincular desde la ficha de la solicitud (SolicitudDetalle.tsx,
  // selector "Vincular a visita") si corresponde.
  // Excluye estado 'Eliminada' a propósito (bug real de Gabriel, 2026-09-21, casos Sra Lourdes y
  // Mickaël Maystre): "Eliminada" sustituye al DELETE real (ver types.ts) — es un descarte
  // definitivo, no un cierre que siga necesitando revisión manual, así que no debe generar este
  // aviso indefinidamente solo porque su contacto coincide con una visita ya hecha. La query de
  // solicitudesDescartadas de arriba ya excluye 'Eliminada' desde origen (extendido 2026-09-21 a
  // todos sus consumidores, no solo este) — 'No concretada' y 'Rechazada' son los únicos cierres
  // reales que pueden merecer vincularse a mano.
  const solicitudesRechazadasConVisita = (visitas ?? [])
    .map((v): { id: string; visita: VisitaRealizada; solicitud: SolicitudDescartada } | null => {
      const candidatas = (solicitudesDescartadas ?? []).filter((s) => !s.visita_id);
      const telefono = v.telefono ? normalizarTelefono(v.telefono) : '';
      const email = v.email?.trim().toLowerCase();
      const nombre = normalizarNombre(`${v.nombre} ${v.apellidos}`);
      const matchTelefono = telefono
        ? candidatas.find((s) => normalizarTelefono(s.telefono ?? '') === telefono)
        : undefined;
      const matchEmail = email
        ? candidatas.find((s) => s.email?.trim().toLowerCase() === email)
        : undefined;
      const porNombre = nombre ? candidatas.filter((s) => normalizarNombre(s.nombre ?? '') === nombre) : [];
      // El nombre solo sirve para este aviso manual cuando identifica una única solicitud. Con dos
      // homónimos no se muestra una relación arbitraria que podría inducir a enlazar el caso errado.
      const match = matchTelefono ?? matchEmail ?? (porNombre.length === 1 ? porNombre[0] : undefined);
      return match ? { id: v.id, visita: v, solicitud: match } : null;
    })
    .filter((x): x is { id: string; visita: VisitaRealizada; solicitud: SolicitudDescartada } => !!x);

  const totalAvisos =
    visitasSinPresupuesto.length +
    borradoresSinEnviar.length +
    orientativosSinVincular.length +
    presupuestosPorCerrar.length +
    solicitudesRechazadasConVisita.length;

  const irAPresupuesto = (id: string) => navigate('/finanzas/presupuestos', { state: { verDocId: id, verDocTipo: 'presupuesto' } });

  return (
    <div>
      <KpiRow
        items={[
          { label: 'Visitas sin presupuesto', valor: visitasSinPresupuesto.length, acento: visitasSinPresupuesto.length > 0 },
          { label: 'Borradores sin enviar', valor: borradoresSinEnviar.length, acento: borradoresSinEnviar.length > 0 },
          { label: 'Orientativos sin vincular', valor: orientativosSinVincular.length, acento: orientativosSinVincular.length > 0 },
          { label: 'Por caducar / caducados', valor: presupuestosPorCerrar.length, acento: presupuestosPorCerrar.length > 0 },
          {
            label: 'Cerradas con visita sin vincular',
            valor: solicitudesRechazadasConVisita.length,
            acento: solicitudesRechazadasConVisita.length > 0,
          },
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
          <p className="text-xs text-gray-400 mb-2">
            Bandeja de trabajo: solo visitas con estado Realizada que todavía no tienen un presupuesto enviado.
            No es el total de visitas agendadas del funnel.
          </p>
          <div className="bg-surface border border-gray-200 rounded-sm overflow-hidden">
            <Table
              loading={cargandoVisitas || cargandoPresupuestos}
              data={visitasSinPresupuesto}
              emptyMessage="Ninguna"
              onRowClick={(v) => navigate(`/visitas/${v.id}`)}
              columns={[
                { key: 'nombre', label: 'Cliente', render: (v) => `${v.nombre} ${v.apellidos}` },
                { key: 'fecha_visita', label: 'Fecha de la visita', render: (v) => fecha(v.fecha_visita) },
                {
                  key: 'acciones',
                  label: 'Cerrar solicitud',
                  render: (v) => (
                    <span className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={cerrarVisitaMutation.isPending}
                        onClick={() => cerrarVisita(v, 'No concretada')}
                      >
                        No concretada
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={cerrarVisitaMutation.isPending}
                        onClick={() => cerrarVisita(v, 'Rechazada')}
                      >
                        Rechazada
                      </Button>
                    </span>
                  ),
                },
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
                { key: 'estado', label: 'Estado', render: (s) => ETIQUETA_ESTADO_SOLICITUD[s.estado as EstadoSolicitud] },
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

        <div>
          <h2 className="text-xs uppercase tracking-wide text-gray-400 font-semibold mb-2">
            Solicitudes cerradas con una visita real hecha, sin vincular ({solicitudesRechazadasConVisita.length})
          </h2>
          <p className="text-xs text-gray-400 mb-2">
            El teléfono/email coincide con una visita ya realizada. Puede que el cierre sea correcto (revisar caso por
            caso) o que solo falte enlazarla a mano desde "Vincular a visita" en la ficha de la solicitud.
          </p>
          <div className="bg-surface border border-gray-200 rounded-sm overflow-hidden">
            <Table
              loading={cargandoVisitas}
              data={solicitudesRechazadasConVisita}
              emptyMessage="Ninguna"
              onRowClick={(f) => onAbrirSolicitud(f.solicitud.id)}
              columns={[
                { key: 'nombre', label: 'Cliente', render: (f) => f.solicitud.nombre || `${f.visita.nombre} ${f.visita.apellidos}` },
                { key: 'fecha_visita', label: 'Fecha de la visita', render: (f) => fecha(f.visita.fecha_visita) },
                { key: 'created_at', label: 'Solicitud recibida', render: (f) => fecha(f.solicitud.created_at) },
              ]}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
