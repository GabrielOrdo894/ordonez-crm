import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { Search } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { useConfirmar } from '../../hooks/useConfirm';
import { useSeleccionMultiple } from '../../hooks/useSeleccionMultiple';
import { Table } from '../../components/ui/Table';
import { KpiRow } from '../../components/ui/Kpi';
import { BotonExportar } from '../../components/ui/BotonExportar';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Select';
import { Input } from '../../components/ui/Input';
import { BulkActionsBar } from '../../components/ui/BulkActionsBar';
import { AccionesFila } from '../../components/ui/AccionesFila';
import { agruparClientes } from './types';
import { fechaVisitaCorta } from '../../lib/fechas';
import type { Visita } from '../visitas/types';
import type { VisitaModalContext } from '../../components/layout/AppLayout';

export default function ClientesPage() {
  const { abrirNuevoCliente } = useOutletContext<VisitaModalContext>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const nombreUsuarioActual = (user?.user_metadata?.nombre as string) || user?.email || 'Sistema';
  const toast = useToast();
  const confirmar = useConfirmar();
  const queryClient = useQueryClient();
  const [busqueda, setBusqueda] = useState('');
  const [filtroPais, setFiltroPais] = useState('Todos');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const { seleccion, toggleFila, toggleTodas, limpiar } = useSeleccionMultiple();

  const { data: visitas, isLoading } = useQuery({
    queryKey: ['visitas'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('visitas')
        .select('*')
        .is('eliminado_en', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Visita[];
    },
  });

  const clientes = useMemo(() => agruparClientes(visitas ?? []), [visitas]);

  const eliminarVariosMutation = useMutation({
    mutationFn: async (clienteIds: (string | number)[]) => {
      const idsVisitas = clientes
        .filter((c) => clienteIds.includes(c.id))
        .flatMap((c) => c.visitas.map((v) => v.id));
      const { error } = await supabase
        .from('visitas')
        .update({ eliminado_en: new Date().toISOString(), eliminado_por: nombreUsuarioActual })
        .in('id', idsVisitas as string[]);
      if (error) throw error;
    },
    onSuccess: (_data, clienteIds) => {
      queryClient.invalidateQueries({ queryKey: ['visitas'] });
      toast.success(`${clienteIds.length} cliente(s) movido(s) a la papelera`);
      limpiar();
    },
    onError: (error) => toast.error(error.message),
  });

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return clientes.filter((c) => {
      if (filtroPais !== 'Todos' && c.pais !== filtroPais) return false;
      const ultima = c.visitas[0]?.fecha_visita ?? '';
      if (desde && (!ultima || ultima < desde)) return false;
      if (hasta && (!ultima || ultima > hasta)) return false;
      if (q && !`${c.nombre} ${c.apellidos} ${c.telefono}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [clientes, busqueda, filtroPais, desde, hasta]);

  const kpis = useMemo(() => {
    const hoy = new Date();
    const mesActual = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
    const nuevosEsteMes = clientes.filter((c) => {
      const primera = c.visitas[c.visitas.length - 1];
      return primera?.created_at?.slice(0, 7) === mesActual;
    }).length;
    const pipelineActivo = clientes.filter(
      (c) => c.visitas[0]?.estado_pipeline !== 'Finalizado' && c.visitas[0]?.estado_pipeline !== 'Perdido',
    ).length;
    const pendienteConfirmar = clientes.filter((c) => c.visitas.some((v) => v.estado === 'Pendiente')).length;
    return [
      { label: 'Total clientes', valor: clientes.length },
      { label: 'Nuevos este mes', valor: nuevosEsteMes },
      { label: 'Pipeline activo', valor: pipelineActivo, acento: true },
      { label: 'Con visita pendiente', valor: pendienteConfirmar },
    ];
  }, [clientes]);

  return (
    <div>
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, apellidos o teléfono"
            className="w-full border border-gray-200 rounded-sm pl-8 pr-2.5 py-1.5 text-sm focus:border-brand focus:outline-none"
          />
        </div>
        <span className="text-sm text-gray-500 ml-auto">{filtrados.length} clientes</span>
        <BotonExportar
          nombreArchivo="clientes.csv"
          filas={filtrados}
          columnas={[
            { key: 'nombre', label: 'Nombre' },
            { key: 'apellidos', label: 'Apellidos' },
            { key: 'telefono', label: 'Teléfono' },
            { key: 'email', label: 'Email' },
            { key: 'zona', label: 'Zona' },
            { key: 'pais', label: 'País' },
            { key: 'visitas', label: 'Nº visitas', valor: (c) => c.visitas.length },
            { key: 'ultima', label: 'Última visita', valor: (c) => c.visitas[0]?.fecha_visita ?? '' },
            { key: 'pipeline', label: 'Pipeline', valor: (c) => c.visitas[0]?.estado_pipeline ?? '' },
          ]}
        />
        <Button onClick={() => abrirNuevoCliente()} className="px-4 py-2 text-sm">
          + Nuevo cliente
        </Button>
      </div>

      <div className="flex items-end gap-2 mb-4 flex-wrap">
        <Select
          label="País"
          options={['Todos', 'España', 'Francia'].map((p) => ({ value: p, label: p }))}
          value={filtroPais}
          onChange={(e) => setFiltroPais(e.target.value)}
          className="w-40"
        />
        <Input label="Última visita desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="w-40" />
        <Input label="Última visita hasta" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="w-40" />
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
              if (!(await confirmar(`¿Eliminar ${seleccion.size} cliente(s)? Su historial de visitas se moverá a la Papelera.`))) return;
              eliminarVariosMutation.mutate(Array.from(seleccion));
            },
            disabled: eliminarVariosMutation.isPending,
          },
        ]}
      />

      <div className="bg-surface border border-gray-200 rounded-sm overflow-hidden">
        <Table
          loading={isLoading}
          data={filtrados}
          emptyMessage="No hay clientes registrados"
          onRowClick={(c) => navigate(`/clientes/${encodeURIComponent(c.id)}`)}
          seleccion={seleccion}
          onToggleFila={toggleFila}
          onToggleTodas={toggleTodas}
          columns={[
            {
              key: 'nombre',
              label: 'Nombre + apellidos',
              sortValue: (c) => `${c.nombre} ${c.apellidos}`,
              render: (c) => (
                <div>
                  <p className="font-medium text-gray-900">{c.nombre}</p>
                  <p className="text-xs text-gray-500">{c.apellidos}</p>
                </div>
              ),
            },
            { key: 'telefono', label: 'Teléfono' },
            {
              key: 'zona',
              label: 'Zona / País',
              sortValue: (c) => `${c.zona ?? ''} ${c.pais ?? ''}`,
              render: (c) => `${c.zona ?? ''} · ${c.pais ?? ''}`,
            },
            {
              key: 'visitas',
              label: 'Visitas',
              sortValue: (c) => c.visitas.length,
              render: (c) => c.visitas.length,
            },
            {
              key: 'ultima',
              label: 'Última visita',
              sortValue: (c) => c.visitas[0]?.fecha_visita ?? '',
              render: (c) => fechaVisitaCorta(c.visitas[0]?.fecha_visita),
            },
            {
              key: 'pipeline',
              label: 'Pipeline',
              sortValue: (c) => c.visitas[0]?.estado_pipeline ?? '',
              render: (c) => c.visitas[0]?.estado_pipeline ?? '—',
            },
            {
              key: 'acciones',
              label: '',
              sortable: false,
              render: (c) => (
                <AccionesFila
                  menu={[
                    {
                      label: 'Eliminar',
                      destructivo: true,
                      onClick: async () => {
                        if (!(await confirmar(`¿Eliminar a ${c.nombre} ${c.apellidos}? Su historial de visitas se moverá a la Papelera.`))) return;
                        eliminarVariosMutation.mutate([c.id]);
                      },
                    },
                  ]}
                />
              ),
            },
          ]}
        />
      </div>
    </div>
  );
}
