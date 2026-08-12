import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useOutletContext } from 'react-router-dom';
import { Search, Check, Ban, Clock3 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { avisoDocumentosActivosDeVisita } from '../../lib/avisoVisita';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { useConfirmar } from '../../hooks/useConfirm';
import { useSeleccionMultiple } from '../../hooks/useSeleccionMultiple';
import { Select } from '../../components/ui/Select';
import { Input } from '../../components/ui/Input';
import { Table } from '../../components/ui/Table';
import { Badge, estadoToVariant } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { KpiRow } from '../../components/ui/Kpi';
import { BulkActionsBar } from '../../components/ui/BulkActionsBar';
import { AccionesFila, type AccionRapida } from '../../components/ui/AccionesFila';
import { VisitaResumenModal } from './VisitaResumenModal';
import { fechaVisitaCorta } from '../../lib/fechas';
import type { EstadoVisita, Visita } from './types';
import type { VisitaModalContext } from '../../components/layout/AppLayout';

const ESTADOS = ['Todos', 'Pendiente', 'Realizada', 'Cancelada'];
const PAISES = ['Todos', 'España', 'Francia'];

export default function VisitasPage() {
  const { abrirNuevaVisita, abrirEditarVisita } = useOutletContext<VisitaModalContext>();
  const { user } = useAuth();
  const nombreUsuarioActual = (user?.user_metadata?.nombre as string) || user?.email || 'Sistema';
  const toast = useToast();
  const confirmar = useConfirmar();
  const queryClient = useQueryClient();

  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('Todos');
  const [filtroPais, setFiltroPais] = useState('Todos');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [visitaResumen, setVisitaResumen] = useState<Visita | null>(null);
  const { seleccion, toggleFila, toggleTodas, limpiar } = useSeleccionMultiple();

  const { data: visitas, isLoading } = useQuery({
    queryKey: ['visitas'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('visitas')
        .select('*')
        .is('eliminado_en', null)
        .order('fecha_visita', { ascending: true });
      if (error) throw error;
      return data as Visita[];
    },
  });

  const eliminarMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('visitas')
        .update({ eliminado_en: new Date().toISOString(), eliminado_por: nombreUsuarioActual })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['visitas'] });
      toast.success('Visita movida a la papelera');
    },
    onError: (error) => toast.error(error.message),
  });

  const eliminarVariasMutation = useMutation({
    mutationFn: async (ids: (string | number)[]) => {
      const { error } = await supabase
        .from('visitas')
        .update({ eliminado_en: new Date().toISOString(), eliminado_por: nombreUsuarioActual })
        .in('id', ids as string[]);
      if (error) throw error;
    },
    onSuccess: (_data, ids) => {
      queryClient.invalidateQueries({ queryKey: ['visitas'] });
      toast.success(`${ids.length} visita(s) movida(s) a la papelera`);
      limpiar();
    },
    onError: (error) => toast.error(error.message),
  });

  const cambiarEstadoVariasMutation = useMutation({
    mutationFn: async ({ ids, estado }: { ids: (string | number)[]; estado: string }) => {
      const { error } = await supabase.from('visitas').update({ estado }).in('id', ids as string[]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['visitas'] });
      toast.success('Estado actualizado');
      limpiar();
    },
    onError: (error) => toast.error(error.message),
  });

  const filtradas = useMemo(() => {
    if (!visitas) return [];
    const q = busqueda.trim().toLowerCase();
    return visitas.filter((v) => {
      if (!v.fecha_visita) return false; // clientes creados sin visita programada (ver ClienteForm)
      if (filtroEstado !== 'Todos' && v.estado !== filtroEstado) return false;
      if (filtroPais !== 'Todos' && v.pais !== filtroPais) return false;
      if (desde && (!v.fecha_visita || v.fecha_visita < desde)) return false;
      if (hasta && (!v.fecha_visita || v.fecha_visita > hasta)) return false;
      if (q && !`${v.nombre} ${v.apellidos} ${v.telefono}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [visitas, busqueda, filtroEstado, filtroPais, desde, hasta]);

  const handleEliminar = async (v: Visita) => {
    const aviso = await avisoDocumentosActivosDeVisita(v.id);
    const confirmado = await confirmar({
      titulo: `¿Eliminar la visita de ${v.nombre} ${v.apellidos}?`,
      mensaje:
        'Se moverá a la Papelera (podrás restaurarla desde allí). Mientras esté en la papelera dejará ' +
        'de aparecer en los listados y los presupuestos, facturas, proyectos, solicitudes y fotos de ' +
        `galería vinculados a esta visita quedarán sin visita asociada.${aviso}`,
      textoConfirmar: 'Eliminar',
    });
    if (!confirmado) return;
    eliminarMutation.mutate(v.id);
  };

  const accionesRapidas = (v: Visita): AccionRapida[] => {
    const opciones: Record<EstadoVisita, AccionRapida> = {
      Pendiente: {
        icon: Clock3,
        label: 'Marcar pendiente',
        tono: 'neutro',
        onClick: () => cambiarEstadoVariasMutation.mutate({ ids: [v.id], estado: 'Pendiente' }),
      },
      Realizada: {
        icon: Check,
        label: 'Marcar realizada',
        tono: 'brand',
        onClick: () => cambiarEstadoVariasMutation.mutate({ ids: [v.id], estado: 'Realizada' }),
      },
      Cancelada: {
        icon: Ban,
        label: 'Marcar cancelada',
        tono: 'peligro',
        onClick: () => cambiarEstadoVariasMutation.mutate({ ids: [v.id], estado: 'Cancelada' }),
      },
    };
    return (['Pendiente', 'Realizada', 'Cancelada'] as EstadoVisita[]).filter((e) => e !== v.estado).map((e) => opciones[e]);
  };

  const kpis = useMemo(() => {
    const todas = (visitas ?? []).filter((v) => v.fecha_visita);
    const hoyISO = new Date().toISOString().slice(0, 10);
    const inicioSemana = new Date();
    inicioSemana.setDate(inicioSemana.getDate() - ((inicioSemana.getDay() + 6) % 7));
    const inicioSemanaISO = inicioSemana.toISOString().slice(0, 10);
    const finSemana = new Date(inicioSemana);
    finSemana.setDate(finSemana.getDate() + 6);
    const finSemanaISO = finSemana.toISOString().slice(0, 10);

    const hoy = todas.filter((v) => v.fecha_visita === hoyISO).length;
    const confirmadas = todas.filter((v) => v.estado === 'Realizada').length;
    const estaSemana = todas.filter(
      (v) => v.fecha_visita && v.fecha_visita >= inicioSemanaISO && v.fecha_visita <= finSemanaISO,
    ).length;
    const visitasFrancia = todas.filter((v) => v.pais === 'Francia').length;
    const visitasEspana = todas.filter((v) => v.pais === 'España').length;

    return [
      { label: 'Total visitas', valor: todas.length },
      { label: 'Hoy', valor: hoy, acento: true },
      { label: 'Esta semana', valor: estaSemana },
      { label: 'Visitas confirmadas', valor: confirmadas },
      { label: 'Visitas Francia', valor: visitasFrancia, acento: true },
      { label: 'Visitas España', valor: visitasEspana },
    ];
  }, [visitas]);

  return (
    <div>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, apellidos o teléfono"
            className="w-full border border-gray-200 rounded-sm pl-8 pr-2.5 py-1.5 text-sm focus:border-brand focus:outline-none"
          />
        </div>
        <span className="text-sm text-gray-500 ml-auto">{filtradas.length} visitas</span>
        <Button onClick={() => abrirNuevaVisita()} className="px-4 py-2 text-sm">
          + Nueva visita
        </Button>
      </div>

      <div className="flex items-end gap-2 mb-4 flex-wrap">
        <Select
          label="Estado"
          options={ESTADOS.map((v) => ({ value: v, label: v }))}
          value={filtroEstado}
          onChange={(e) => setFiltroEstado(e.target.value)}
          className="w-40"
        />
        <Select
          label="País"
          options={PAISES.map((v) => ({ value: v, label: v }))}
          value={filtroPais}
          onChange={(e) => setFiltroPais(e.target.value)}
          className="w-40"
        />
        <Input label="Fecha desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="w-40" />
        <Input label="Fecha hasta" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="w-40" />
      </div>

      <KpiRow items={kpis} />

      <BulkActionsBar
        count={seleccion.size}
        onCancelar={limpiar}
        acciones={[
          {
            label: 'Marcar realizadas',
            onClick: () => cambiarEstadoVariasMutation.mutate({ ids: Array.from(seleccion), estado: 'Realizada' }),
            disabled: cambiarEstadoVariasMutation.isPending,
          },
          {
            label: 'Cancelar visitas',
            onClick: () => cambiarEstadoVariasMutation.mutate({ ids: Array.from(seleccion), estado: 'Cancelada' }),
            disabled: cambiarEstadoVariasMutation.isPending,
          },
          {
            label: 'Eliminar',
            variant: 'danger',
            onClick: async () => {
              const confirmado = await confirmar({
                titulo: `¿Eliminar ${seleccion.size} visita(s)?`,
                mensaje:
                  'Se moverán a la Papelera (podrás restaurarlas desde allí). Mientras estén en la papelera ' +
                  'dejarán de aparecer en los listados y los presupuestos, facturas, proyectos, solicitudes y ' +
                  'fotos de galería vinculados quedarán sin visita asociada.',
                textoConfirmar: 'Eliminar',
              });
              if (!confirmado) return;
              eliminarVariasMutation.mutate(Array.from(seleccion));
            },
            disabled: eliminarVariasMutation.isPending,
          },
        ]}
      />

      <div className="bg-surface border border-gray-200 rounded-sm overflow-hidden">
        <Table
          loading={isLoading}
          data={filtradas}
          emptyMessage="No hay visitas registradas"
          onRowClick={(v) => setVisitaResumen(v)}
          seleccion={seleccion}
          onToggleFila={toggleFila}
          onToggleTodas={toggleTodas}
          columns={[
            {
              key: 'nombre',
              label: 'Nombre + apellidos',
              sortValue: (v) => `${v.nombre} ${v.apellidos}`,
              render: (v) => (
                <div>
                  <p className="font-medium text-gray-900">{v.nombre}</p>
                  <p className="text-xs text-gray-500">{v.apellidos}</p>
                </div>
              ),
            },
            {
              key: 'fecha_visita',
              label: 'Fecha y hora',
              sortValue: (v) => `${v.fecha_visita ?? ''} ${v.hora_visita ?? ''}`,
              render: (v) => (
                <div>
                  <p className="font-semibold text-gray-900">{fechaVisitaCorta(v.fecha_visita)}</p>
                  <p className="text-xs text-gray-500">{v.hora_visita?.slice(0, 5) ?? '—'}</p>
                </div>
              ),
            },
            {
              key: 'zona',
              label: 'Lugar',
              sortValue: (v) => v.zona ?? '',
              render: (v) => (
                <div>
                  <p className="font-medium text-gray-900">{v.zona || '—'}</p>
                  <p className="text-xs text-gray-500">{v.pais === 'España' ? '🇪🇸 España' : v.pais === 'Francia' ? '🇫🇷 Francia' : ''}</p>
                </div>
              ),
            },
            { key: 'telefono', label: 'Teléfono' },
            { key: 'tipo', label: 'Tipo reforma' },
            { key: 'empleado', label: 'Empleado' },
            {
              key: 'estado',
              label: 'Estado',
              render: (v) => <Badge variant={estadoToVariant(v.estado)}>{v.estado}</Badge>,
            },
            {
              key: 'acciones',
              label: 'Acciones',
              sortable: false,
              render: (v) => (
                <AccionesFila
                  rapidas={v.estado ? accionesRapidas(v) : []}
                  menu={[
                    { label: 'Modificar', onClick: () => abrirEditarVisita(v) },
                    { label: 'Eliminar', onClick: () => handleEliminar(v), destructivo: true },
                  ]}
                />
              ),
            },
          ]}
        />
      </div>

      <VisitaResumenModal
        visita={visitaResumen}
        onClose={() => setVisitaResumen(null)}
        onModificar={(v) => {
          setVisitaResumen(null);
          abrirEditarVisita(v);
        }}
        onCancelar={async (v) => {
          if (!(await confirmar(`¿Cancelar la visita de ${v.nombre} ${v.apellidos}?`))) return;
          cambiarEstadoVariasMutation.mutate({ ids: [v.id], estado: 'Cancelada' });
          setVisitaResumen(null);
        }}
      />
    </div>
  );
}
