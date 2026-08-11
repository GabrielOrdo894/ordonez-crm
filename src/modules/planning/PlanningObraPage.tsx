import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Sliders } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../hooks/useToast';
import { useConfirmar } from '../../hooks/useConfirm';
import { useSeleccionMultiple } from '../../hooks/useSeleccionMultiple';
import { Table } from '../../components/ui/Table';
import { KpiRow } from '../../components/ui/Kpi';
import { Select } from '../../components/ui/Select';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { BulkActionsBar } from '../../components/ui/BulkActionsBar';
import { AccionesFila } from '../../components/ui/AccionesFila';
import { fechaVisitaCorta } from '../../lib/fechas';
import { generarPdfDossierObra } from '../../lib/generarPdfDossierObra';
import { conAvisoDescarga } from '../../lib/conAvisoDescarga';
import { mensajeError } from '../../lib/mensajeError';
import type { Presupuesto } from '../finanzas/presupuestos/types';
import { PlanningObraDetalle } from './PlanningObraDetalle';
import { IniciarPlanningPage } from './IniciarPlanningPage';

export type FaseObra = {
  nombre: string;
  descripcion: string | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  completada: boolean;
};

export type Proyecto = {
  id: string;
  visita_id: string | null;
  presupuesto_id: string | null;
  nombre_obra: string;
  fecha_inicio: string | null;
  estado: string;
  fases: FaseObra[];
};

const ESTADOS_FILTRO = ['Todos', 'Planificado', 'En curso', 'Pausado', 'Finalizado'];

export default function PlanningObraPage() {
  const toast = useToast();
  const confirmar = useConfirmar();
  const queryClient = useQueryClient();
  const [filtroEstado, setFiltroEstado] = useState('Todos');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [proyectoAbierto, setProyectoAbierto] = useState<Proyecto | null>(null);
  const [creandoPlanning, setCreandoPlanning] = useState(false);
  const { seleccion, toggleFila, toggleTodas, limpiar } = useSeleccionMultiple();

  const { data: proyectos, isLoading: cargandoProyectos } = useQuery({
    queryKey: ['proyectos', 'todos'],
    queryFn: async () => {
      const { data, error } = await supabase.from('proyectos').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data as Proyecto[];
    },
  });

  const { data: presupuestos } = useQuery({
    queryKey: ['presupuestos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('presupuestos')
        .select('*')
        .is('eliminado_en', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Presupuesto[];
    },
  });

  const presupuestosSinPlanning = useMemo(() => {
    const yaUsados = new Set((proyectos ?? []).map((p) => p.presupuesto_id).filter(Boolean));
    return (presupuestos ?? []).filter((p) => p.estado === 'Aceptado' && !yaUsados.has(p.id));
  }, [presupuestos, proyectos]);

  const crearMutation = useMutation({
    mutationFn: async ({
      presupuesto,
      nombreObra,
      fechaInicio,
    }: {
      presupuesto: Presupuesto;
      nombreObra: string;
      fechaInicio: string | null;
    }) => {
      const { data, error } = await supabase
        .from('proyectos')
        .insert({
          visita_id: presupuesto.visita_id,
          presupuesto_id: presupuesto.id,
          nombre_obra: nombreObra,
          estado: 'Planificado',
          fecha_inicio: fechaInicio,
          fases: [],
        })
        .select()
        .single();
      if (error) throw error;
      return data as Proyecto;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['proyectos', 'todos'] });
      setCreandoPlanning(false);
      setProyectoAbierto(data);
      toast.success('Planning de obra creado');
    },
    onError: (error) => toast.error(error.message),
  });

  const eliminarVariosMutation = useMutation({
    mutationFn: async (ids: (string | number)[]) => {
      const { error } = await supabase.from('proyectos').delete().in('id', ids as string[]);
      if (error) throw error;
    },
    onSuccess: (_data, ids) => {
      queryClient.invalidateQueries({ queryKey: ['proyectos', 'todos'] });
      toast.success(`${ids.length} obra(s) eliminada(s)`);
      limpiar();
    },
    onError: (error) => toast.error(error.message),
  });

  const filas = useMemo(
    () =>
      (proyectos ?? []).filter((p) => {
        if (filtroEstado !== 'Todos' && p.estado !== filtroEstado) return false;
        if (desde && (!p.fecha_inicio || p.fecha_inicio < desde)) return false;
        if (hasta && (!p.fecha_inicio || p.fecha_inicio > hasta)) return false;
        return true;
      }),
    [proyectos, filtroEstado, desde, hasta],
  );

  const kpis = useMemo(() => {
    const todos = proyectos ?? [];
    return [
      { label: 'Total obras', valor: todos.length },
      { label: 'En curso', valor: todos.filter((p) => p.estado === 'En curso').length, acento: true },
      { label: 'Planificadas', valor: todos.filter((p) => p.estado === 'Planificado').length },
      { label: 'Finalizadas', valor: todos.filter((p) => p.estado === 'Finalizado').length },
    ];
  }, [proyectos]);

  const presupuestoPorId = (id: string | null) => (id ? (presupuestos?.find((p) => p.id === id) ?? null) : null);

  const handleEliminar = async (p: Proyecto) => {
    if (!(await confirmar(`¿Eliminar el planning de obra "${p.nombre_obra}"?`))) return;
    eliminarVariosMutation.mutate([p.id]);
  };

  const handleDescargarDossier = async (p: Proyecto) => {
    const presupuesto = presupuestoPorId(p.presupuesto_id);
    if (!presupuesto || p.fases.length === 0) return;
    try {
      await conAvisoDescarga(
        () => generarPdfDossierObra({ nombreObra: p.nombre_obra, estadoObra: p.estado, fechaInicio: p.fecha_inicio, fases: p.fases, presupuesto }),
        toast,
      );
    } catch (err) {
      toast.error(mensajeError(err, 'No se pudo generar el dossier'));
    }
  };

  if (proyectoAbierto) {
    return (
      <PlanningObraDetalle
        proyecto={proyectoAbierto}
        presupuesto={presupuestoPorId(proyectoAbierto.presupuesto_id)}
        onVolver={() => setProyectoAbierto(null)}
      />
    );
  }

  if (creandoPlanning) {
    return (
      <IniciarPlanningPage
        presupuestosSinPlanning={presupuestosSinPlanning}
        onCancelar={() => setCreandoPlanning(false)}
        onCrear={(datos) => crearMutation.mutate(datos)}
        creando={crearMutation.isPending}
      />
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <Link
          to="/configuracion/planning"
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-brand"
        >
          <Sliders size={14} />
          Personalizar plantilla PDF
        </Link>
        <span className="text-sm text-gray-500 ml-auto">{filas.length} obras</span>
        <Button size="sm" onClick={() => setCreandoPlanning(true)}>
          + Crear planning de obra
        </Button>
      </div>

      <div className="flex items-end gap-2 mb-4 flex-wrap">
        <Select
          label="Estado"
          options={ESTADOS_FILTRO.map((e) => ({ value: e, label: e }))}
          value={filtroEstado}
          onChange={(e) => setFiltroEstado(e.target.value)}
          className="w-44"
        />
        <Input label="Inicio desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="w-40" />
        <Input label="Inicio hasta" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="w-40" />
      </div>

      <KpiRow items={kpis} />

      <BulkActionsBar
        count={seleccion.size}
        onCancelar={limpiar}
        acciones={[
          {
            label: 'Eliminar',
            variant: 'danger',
            onClick: async () => {
              if (!(await confirmar(`¿Eliminar ${seleccion.size} obra(s)?`))) return;
              eliminarVariosMutation.mutate(Array.from(seleccion));
            },
            disabled: eliminarVariosMutation.isPending,
          },
        ]}
      />

      <div className="bg-surface border border-gray-200 rounded-sm overflow-hidden">
        <Table
          loading={cargandoProyectos}
          data={filas}
          emptyMessage="No hay obras con planning creado todavía"
          onRowClick={(p) => setProyectoAbierto(p)}
          seleccion={seleccion}
          onToggleFila={toggleFila}
          onToggleTodas={toggleTodas}
          columns={[
            { key: 'obra', label: 'Obra', sortValue: (p) => p.nombre_obra, render: (p) => p.nombre_obra },
            {
              key: 'cliente',
              label: 'Cliente',
              sortValue: (p) => presupuestoPorId(p.presupuesto_id)?.cliente_nombre ?? '',
              render: (p) => presupuestoPorId(p.presupuesto_id)?.cliente_nombre ?? '—',
            },
            { key: 'estado', label: 'Estado', render: (p) => p.estado },
            {
              key: 'inicio',
              label: 'Fecha inicio',
              sortValue: (p) => p.fecha_inicio ?? '',
              render: (p) => fechaVisitaCorta(p.fecha_inicio),
            },
            {
              key: 'progreso',
              label: 'Progreso',
              sortValue: (p) => (p.fases.length === 0 ? -1 : p.fases.filter((f) => f.completada).length / p.fases.length),
              render: (p) => {
                const total = p.fases.length;
                const completadas = p.fases.filter((f) => f.completada).length;
                return total === 0 ? 'Sin fases' : `${completadas}/${total} fases`;
              },
            },
            {
              key: 'acciones',
              label: '',
              sortable: false,
              render: (p) => {
                const tieneDossierCompleto = !!presupuestoPorId(p.presupuesto_id) && p.fases.length > 0;
                return (
                  <AccionesFila
                    menu={[
                      { label: 'Abrir', onClick: () => setProyectoAbierto(p) },
                      {
                        label: 'Descargar dossier completo (PDF)',
                        onClick: () => handleDescargarDossier(p),
                        oculto: !tieneDossierCompleto,
                      },
                      { label: 'Eliminar', onClick: () => handleEliminar(p), destructivo: true },
                    ]}
                  />
                );
              },
            },
          ]}
        />
      </div>
    </div>
  );
}
