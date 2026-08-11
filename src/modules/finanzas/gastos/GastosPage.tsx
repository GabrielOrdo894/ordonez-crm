import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, Eye, Copy } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useToast } from '../../../hooks/useToast';
import { useConfirmar } from '../../../hooks/useConfirm';
import { useSeleccionMultiple } from '../../../hooks/useSeleccionMultiple';
import { Table } from '../../../components/ui/Table';
import { Select } from '../../../components/ui/Select';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { KpiRow } from '../../../components/ui/Kpi';
import { BotonExportar } from '../../../components/ui/BotonExportar';
import { BulkActionsBar } from '../../../components/ui/BulkActionsBar';
import { AccionesFila } from '../../../components/ui/AccionesFila';
import { fechaCorta } from '../../../lib/fechas';
import type { Gasto } from './types';
import { GastoForm } from './GastoForm';
import { GastoResumen } from './GastoResumen';
import { VistaPreviaAdjunto } from './VistaPreviaAdjunto';

const PAISES_FILTRO = ['Todos', 'España', 'Francia'];

function totalConIva(g: Gasto) {
  return (g.importe_base ?? 0) + (g.importe_iva ?? 0);
}

export default function GastosPage() {
  const toast = useToast();
  const confirmar = useConfirmar();
  const queryClient = useQueryClient();
  const [busqueda, setBusqueda] = useState('');
  const [filtroPais, setFiltroPais] = useState('Todos');
  const [filtroCategoria, setFiltroCategoria] = useState('Todas');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [gastoSeleccionado, setGastoSeleccionado] = useState<Gasto | null>(null);
  const [gastoEnResumen, setGastoEnResumen] = useState<Gasto | null>(null);
  const [duplicandoDesde, setDuplicandoDesde] = useState<Gasto | null>(null);
  const [creandoNuevo, setCreandoNuevo] = useState(false);
  const [previsualizando, setPrevisualizando] = useState<string | null>(null);
  const { seleccion, toggleFila, toggleTodas, limpiar } = useSeleccionMultiple();

  const { data: gastos, isLoading } = useQuery({
    queryKey: ['gastos'],
    queryFn: async () => {
      const { data, error } = await supabase.from('gastos').select('*').order('fecha', { ascending: false });
      if (error) throw error;
      return data as Gasto[];
    },
  });

  const eliminarMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('gastos').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gastos'] });
      toast.success('Gasto eliminado');
    },
    onError: (error) => toast.error(error.message),
  });

  const eliminarVariosMutation = useMutation({
    mutationFn: async (ids: (string | number)[]) => {
      const { error } = await supabase.from('gastos').delete().in('id', ids as string[]);
      if (error) throw error;
    },
    onSuccess: (_data, ids) => {
      queryClient.invalidateQueries({ queryKey: ['gastos'] });
      toast.success(`${ids.length} gasto(s) eliminado(s)`);
      limpiar();
    },
    onError: (error) => toast.error(error.message),
  });

  const categoriasDisponibles = useMemo(() => {
    const set = new Set((gastos ?? []).map((g) => g.categoria).filter((c): c is string => !!c));
    return ['Todas', ...Array.from(set).sort()];
  }, [gastos]);

  const filtrados = useMemo(() => {
    if (!gastos) return [];
    const q = busqueda.trim().toLowerCase();
    return gastos.filter((g) => {
      if (filtroPais !== 'Todos' && g.pais !== filtroPais) return false;
      if (filtroCategoria !== 'Todas' && g.categoria !== filtroCategoria) return false;
      if (desde && (!g.fecha || g.fecha < desde)) return false;
      if (hasta && (!g.fecha || g.fecha > hasta)) return false;
      if (q && !`${g.descripcion ?? ''} ${g.proveedor ?? ''}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [gastos, busqueda, filtroPais, filtroCategoria, desde, hasta]);

  const kpis = useMemo(() => {
    const todos = gastos ?? [];
    const hoyMes = new Date().toISOString().slice(0, 7);
    const totalEsteMes = todos
      .filter((g) => g.fecha?.slice(0, 7) === hoyMes)
      .reduce((s, g) => s + totalConIva(g), 0);
    const totalBase = todos.reduce((s, g) => s + (g.importe_base ?? 0), 0);
    const totalIvaDeducible = todos.reduce((s, g) => s + (g.importe_iva ?? 0), 0);
    return [
      { label: 'Total gastos', valor: todos.length },
      { label: 'Total este mes', valor: `${totalEsteMes.toFixed(0)} €` },
      { label: 'Base deducible', valor: `${totalBase.toFixed(0)} €` },
      { label: 'IVA deducible', valor: `${totalIvaDeducible.toFixed(0)} €`, acento: true },
    ];
  }, [gastos]);

  const handleEliminar = async (g: Gasto) => {
    if (!(await confirmar(`¿Eliminar el gasto "${g.descripcion ?? g.proveedor ?? ''}"?`))) return;
    eliminarMutation.mutate(g.id);
  };

  if (creandoNuevo) {
    return <GastoForm onClose={() => setCreandoNuevo(false)} gasto={null} />;
  }
  if (gastoSeleccionado) {
    return <GastoForm onClose={() => setGastoSeleccionado(null)} gasto={gastoSeleccionado} />;
  }
  if (duplicandoDesde) {
    return <GastoForm onClose={() => setDuplicandoDesde(null)} gasto={null} duplicarDesde={duplicandoDesde} />;
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por descripción o proveedor"
            className="w-full border border-gray-200 rounded-sm pl-8 pr-2.5 py-1.5 text-sm focus:border-brand focus:outline-none"
          />
        </div>
        <span className="text-sm text-gray-500 ml-auto mr-2">{filtrados.length} gastos</span>
        <BotonExportar
          nombreArchivo="libro_gastos.csv"
          filas={filtrados}
          columnas={[
            { key: 'fecha', label: 'Fecha' },
            { key: 'descripcion', label: 'Descripción' },
            { key: 'proveedor', label: 'Proveedor' },
            { key: 'categoria', label: 'Categoría' },
            { key: 'pais', label: 'País' },
            { key: 'cuenta_contable', label: 'Cuenta contable' },
            { key: 'base', label: 'Base (sin IVA)', valor: (g) => (g.importe_base ?? 0).toFixed(2) },
            { key: 'iva', label: 'IVA deducible', valor: (g) => (g.importe_iva ?? 0).toFixed(2) },
            { key: 'total', label: 'Total (con IVA)', valor: (g) => totalConIva(g).toFixed(2) },
            { key: 'num_factura_proveedor', label: 'Nº factura proveedor' },
          ]}
        />
        <Button onClick={() => setCreandoNuevo(true)} className="px-4 py-2 text-sm">
          + Nuevo gasto
        </Button>
      </div>

      <div className="flex items-end gap-2 mb-4 flex-wrap">
        <Select
          label="País"
          options={PAISES_FILTRO.map((p) => ({ value: p, label: p }))}
          value={filtroPais}
          onChange={(e) => setFiltroPais(e.target.value)}
          className="w-36"
        />
        <Select
          label="Categoría"
          options={categoriasDisponibles.map((c) => ({ value: c, label: c }))}
          value={filtroCategoria}
          onChange={(e) => setFiltroCategoria(e.target.value)}
          className="w-56"
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
            label: 'Eliminar',
            variant: 'danger',
            onClick: async () => {
              if (!(await confirmar(`¿Eliminar ${seleccion.size} gasto(s)?`))) return;
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
          emptyMessage="No hay gastos registrados"
          onRowClick={(g) => setGastoEnResumen(g)}
          seleccion={seleccion}
          onToggleFila={toggleFila}
          onToggleTodas={toggleTodas}
          columns={[
            { key: 'fecha', label: 'Fecha', render: (g) => fechaCorta(g.fecha) },
            {
              key: 'descripcion',
              label: 'Descripción',
              render: (g) => (
                <div>
                  <p className="font-medium text-gray-900">{g.descripcion || '—'}</p>
                  <p className="text-xs text-gray-500">{g.proveedor}</p>
                </div>
              ),
            },
            { key: 'categoria', label: 'Categoría' },
            { key: 'pais', label: 'País' },
            { key: 'cuenta_contable', label: 'Cuenta' },
            {
              key: 'base',
              label: 'Base (sin IVA)',
              sortValue: (g) => g.importe_base ?? 0,
              render: (g) => `${(g.importe_base ?? 0).toFixed(2)} €`,
            },
            {
              key: 'total',
              label: 'Total (con IVA)',
              sortValue: (g) => totalConIva(g),
              render: (g) => `${totalConIva(g).toFixed(2)} €`,
            },
            {
              key: 'adjunto',
              label: 'Justificante',
              sortable: false,
              render: (g) =>
                g.adjunto_url ? (
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      const { data, error } = await supabase.storage.from('justificantes').createSignedUrl(g.adjunto_url!, 3600);
                      if (error) {
                        toast.error(error.message);
                        return;
                      }
                      setPrevisualizando(data.signedUrl);
                    }}
                    className="flex items-center gap-1 text-gray-500 hover:text-brand"
                  >
                    <Eye size={15} />
                    <span className="text-xs">Ver</span>
                  </button>
                ) : (
                  <span className="text-gray-300 text-xs">—</span>
                ),
            },
            {
              key: 'acciones',
              label: '',
              sortable: false,
              render: (g) => (
                <AccionesFila
                  rapidas={[{ icon: Copy, label: 'Duplicar', tono: 'neutro', onClick: () => setDuplicandoDesde(g) }]}
                  menu={[
                    { label: 'Editar', onClick: () => setGastoSeleccionado(g) },
                    { label: 'Duplicar', onClick: () => setDuplicandoDesde(g) },
                    { label: 'Eliminar', onClick: () => handleEliminar(g), destructivo: true },
                  ]}
                />
              ),
            },
          ]}
        />
      </div>

      <GastoResumen
        gasto={gastoEnResumen}
        onClose={() => setGastoEnResumen(null)}
        onModificar={() => {
          setGastoSeleccionado(gastoEnResumen);
          setGastoEnResumen(null);
        }}
      />
      <VistaPreviaAdjunto url={previsualizando} onClose={() => setPrevisualizando(null)} />
    </div>
  );
}
