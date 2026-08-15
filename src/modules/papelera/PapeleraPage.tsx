import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RotateCcw, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { avisoDocumentosActivosDeVisita } from '../../lib/avisoVisita';
import { eliminarEventoVisita } from '../../lib/googleCalendar';
import { fechaVisitaCorta } from '../../lib/fechas';
import { useToast } from '../../hooks/useToast';
import { useConfirmar } from '../../hooks/useConfirm';
import { Table } from '../../components/ui/Table';
import { AccionesFila, type AccionRapida } from '../../components/ui/AccionesFila';
import type { Visita } from '../visitas/types';
import type { Presupuesto } from '../finanzas/presupuestos/types';
import type { Factura } from '../finanzas/facturas/types';

type Tabla = 'visitas' | 'presupuestos' | 'facturas';

function fechaHora(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function useSeccionPapelera<T extends { id: string; eliminado_en?: string | null; eliminado_por?: string | null }>(
  tabla: Tabla,
  limpiarRelacionados: (id: string) => Promise<void>,
  // Aviso adicional a insertar en el mensaje de confirmación antes de purgar (p. ej. si quedan
  // documentos activos vinculados) — devuelve '' si no hay nada que avisar.
  avisoExtra?: (id: string) => Promise<string>,
) {
  const toast = useToast();
  const confirmar = useConfirmar();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: [tabla, 'papelera'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(tabla)
        .select('*')
        .not('eliminado_en', 'is', null)
        .order('eliminado_en', { ascending: false });
      if (error) throw error;
      return data as T[];
    },
  });

  const invalidar = () => {
    queryClient.invalidateQueries({ queryKey: [tabla, 'papelera'] });
    queryClient.invalidateQueries({ queryKey: [tabla] });
  };

  const restaurarMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from(tabla).update({ eliminado_en: null, eliminado_por: null }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidar();
      toast.success('Restaurado');
    },
    onError: (error) => toast.error(error.message),
  });

  const eliminarDefinitivoMutation = useMutation({
    mutationFn: async (id: string) => {
      await limpiarRelacionados(id);
      const { error } = await supabase.from(tabla).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidar();
      toast.success('Eliminado definitivamente');
    },
    onError: (error) => toast.error(error.message),
  });

  const handleRestaurar = (id: string) => restaurarMutation.mutate(id);

  const handleEliminarDefinitivo = async (id: string) => {
    const aviso = avisoExtra ? await avisoExtra(id) : '';
    const confirmado = await confirmar({
      titulo: '¿Eliminar definitivamente?',
      mensaje: `Esta acción no se puede deshacer. El registro y sus notas/eventos vinculados se borrarán para siempre.${aviso}`,
      textoConfirmar: 'Eliminar definitivamente',
      peligroso: true,
    });
    if (!confirmado) return;
    eliminarDefinitivoMutation.mutate(id);
  };

  return { data: data ?? [], isLoading, handleRestaurar, handleEliminarDefinitivo };
}

function nombreVisita(v: Visita) {
  return v.es_empresa && v.empresa_nombre ? v.empresa_nombre : `${v.nombre} ${v.apellidos}`.trim();
}

function TablaVisitas() {
  const { data, isLoading, handleRestaurar, handleEliminarDefinitivo } = useSeccionPapelera<Visita>(
    'visitas',
    async (id) => {
      // El soft-delete (mover a la papelera) no toca el evento de Google Calendar a propósito —
      // si se restaura la visita, el evento debe seguir ahí. Solo se borra aquí, al eliminar
      // definitivamente, que es cuando de verdad no hay vuelta atrás (hallazgo real, revisión
      // 2026-08-13: antes el evento se quedaba huérfano para siempre).
      const { data: visita, error: errorLectura } = await supabase
        .from('visitas')
        .select('google_event_id')
        .eq('id', id)
        .maybeSingle();
      if (errorLectura) throw errorLectura;
      if (visita?.google_event_id) {
        try {
          await eliminarEventoVisita(visita.google_event_id);
        } catch (error) {
          console.warn('No se pudo borrar el evento de Google Calendar al purgar la visita:', (error as Error).message);
        }
      }
      const { error } = await supabase.from('notas_cliente').delete().eq('visita_id', id);
      if (error) throw error;
    },
    async (id) => {
      const aviso = await avisoDocumentosActivosDeVisita(id);
      return aviso ? `${aviso} Se quedarán sin cliente vinculado tras la purga.` : '';
    },
  );

  return (
    <Table<Visita>
      loading={isLoading}
      data={data}
      emptyMessage="No hay visitas en la papelera"
      columns={[
        { key: 'nombre', label: 'Cliente', render: (v) => nombreVisita(v) },
        { key: 'fecha_visita', label: 'Fecha visita', render: (v) => fechaVisitaCorta(v.fecha_visita) },
        { key: 'eliminado_por', label: 'Eliminado por', render: (v) => v.eliminado_por ?? '—' },
        { key: 'eliminado_en', label: 'Eliminado el', render: (v) => fechaHora(v.eliminado_en) },
        {
          key: 'acciones',
          label: '',
          sortable: false,
          render: (v) => (
            <AccionesFila
              rapidas={
                [
                  { icon: RotateCcw, label: 'Restaurar', tono: 'brand', onClick: () => handleRestaurar(v.id) },
                  { icon: Trash2, label: 'Eliminar definitivamente', tono: 'peligro', onClick: () => handleEliminarDefinitivo(v.id) },
                ] as AccionRapida[]
              }
              menu={[]}
            />
          ),
        },
      ]}
    />
  );
}

function TablaPresupuestos() {
  const { data, isLoading, handleRestaurar, handleEliminarDefinitivo } = useSeccionPapelera<Presupuesto>('presupuestos', async (id) => {
    const { error } = await supabase.from('documento_eventos').delete().eq('documento_tipo', 'presupuesto').eq('documento_id', id);
    if (error) throw error;
    const { error: errorFunnel } = await supabase.from('funnel_eventos').delete().eq('presupuesto_id', id);
    if (errorFunnel) throw errorFunnel;
  });

  return (
    <Table<Presupuesto>
      loading={isLoading}
      data={data}
      emptyMessage="No hay presupuestos en la papelera"
      columns={[
        { key: 'numero', label: 'Número', render: (p) => p.numero ?? 'S/N' },
        { key: 'cliente_nombre', label: 'Cliente', render: (p) => p.cliente_nombre ?? '—' },
        { key: 'estado', label: 'Estado', render: (p) => p.estado },
        { key: 'eliminado_por', label: 'Eliminado por', render: (p) => p.eliminado_por ?? '—' },
        { key: 'eliminado_en', label: 'Eliminado el', render: (p) => fechaHora(p.eliminado_en) },
        {
          key: 'acciones',
          label: '',
          sortable: false,
          render: (p) => (
            <AccionesFila
              rapidas={
                [
                  { icon: RotateCcw, label: 'Restaurar', tono: 'brand', onClick: () => handleRestaurar(p.id) },
                  { icon: Trash2, label: 'Eliminar definitivamente', tono: 'peligro', onClick: () => handleEliminarDefinitivo(p.id) },
                ] as AccionRapida[]
              }
              menu={[]}
            />
          ),
        },
      ]}
    />
  );
}

function TablaFacturas() {
  // Sin "Eliminar definitivamente" a propósito: el número de factura es secuencial y sin huecos
  // por ley (Code de commerce art. A123-12 en FR, RD 1619/2012 en ES) — borrar físicamente una
  // factura ya numerada rompe esa secuencia. Solo se puede restaurar; para anular una factura de
  // verdad hay que emitir una factura rectificativa, no borrar el registro.
  const { data, isLoading, handleRestaurar } = useSeccionPapelera<Factura>('facturas', async (id) => {
    const { error } = await supabase.from('documento_eventos').delete().eq('documento_tipo', 'factura').eq('documento_id', id);
    if (error) throw error;
  });

  return (
    <div>
      <p className="text-xs text-gray-500 px-3 pt-3">
        Las facturas no se pueden borrar para siempre — la numeración es correlativa por ley. Solo se pueden restaurar.
      </p>
      <Table<Factura>
        loading={isLoading}
        data={data}
        emptyMessage="No hay facturas en la papelera"
        columns={[
          { key: 'numero', label: 'Número', render: (f) => f.numero ?? 'S/N' },
          { key: 'cliente_nombre', label: 'Cliente', render: (f) => f.cliente_nombre ?? '—' },
          { key: 'estado_cobro', label: 'Estado', render: (f) => f.estado_cobro },
          { key: 'eliminado_por', label: 'Eliminado por', render: (f) => f.eliminado_por ?? '—' },
          { key: 'eliminado_en', label: 'Eliminado el', render: (f) => fechaHora(f.eliminado_en) },
          {
            key: 'acciones',
            label: '',
            sortable: false,
            render: (f) => (
              <AccionesFila
                rapidas={[{ icon: RotateCcw, label: 'Restaurar', tono: 'brand', onClick: () => handleRestaurar(f.id) }] as AccionRapida[]}
                menu={[]}
              />
            ),
          },
        ]}
      />
    </div>
  );
}

export default function PapeleraPage() {
  const [tab, setTab] = useState<Tabla>('visitas');

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold text-gray-900">Papelera</h1>
        <p className="text-sm text-gray-600">
          Visitas, presupuestos y facturas eliminados. Puedes restaurarlos o borrarlos para siempre.
        </p>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {(
          [
            { value: 'visitas', label: 'Visitas' },
            { value: 'presupuestos', label: 'Presupuestos' },
            { value: 'facturas', label: 'Facturas' },
          ] as const
        ).map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`px-3 py-1.5 rounded-sm text-xs font-semibold uppercase tracking-wide border transition-colors ${
              tab === t.value ? 'bg-brand text-white border-brand' : 'bg-surface border-gray-200 text-gray-600 hover:border-brand'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="bg-surface border border-gray-200 rounded-sm overflow-hidden">
        {tab === 'visitas' && <TablaVisitas />}
        {tab === 'presupuestos' && <TablaPresupuestos />}
        {tab === 'facturas' && <TablaFacturas />}
      </div>
    </div>
  );
}
