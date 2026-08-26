import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, Eye, Copy, Check, X } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useToast } from '../../../hooks/useToast';
import { useConfirmar } from '../../../hooks/useConfirm';
import { useSeleccionMultiple } from '../../../hooks/useSeleccionMultiple';
import { Table } from '../../../components/ui/Table';
import { Select } from '../../../components/ui/Select';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { KpiRow } from '../../../components/ui/Kpi';
import { BotonExportar } from '../../../components/ui/BotonExportar';
import { BulkActionsBar } from '../../../components/ui/BulkActionsBar';
import { AccionesFila, type AccionRapida } from '../../../components/ui/AccionesFila';
import { fechaCorta } from '../../../lib/fechas';
import { registrarAsientoGasto, rectificarAsientos } from '../../../lib/asientosContables';
import type { Gasto } from './types';
import { GastoForm } from './GastoForm';
import { GastoResumen } from './GastoResumen';
import { VistaPreviaAdjunto } from './VistaPreviaAdjunto';

const PAISES_FILTRO = ['Todos', 'España', 'Francia'];
const SIN_CATEGORIZAR = '__sin_categorizar__';
const ESTADOS_FILTRO = ['Todos', 'Pendientes de revisar', 'Pagados'];

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
  const [filtroEstado, setFiltroEstado] = useState('Todos');
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
      const { data, error } = await supabase.from('gastos').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data as Gasto[];
    },
  });

  // Antes de borrar un gasto ya contabilizado (Francia) hay que rectificar su asiento — si no, el
  // gasto desaparece del CRM pero el asiento se queda huérfano para siempre en el libro diario
  // (asientos_contables es insert-only, sin política de update/delete; bug real corregido
  // 2026-08-18). rectificarAsientos no hace nada si el gasto nunca tuvo asiento (p. ej. seguía
  // pendiente de revisar), así que es seguro llamarla siempre que sea de Francia.
  async function rectificarSiHaceFalta(g: Gasto) {
    if (g.pais !== 'Francia') return;
    await rectificarAsientos('gasto', g.id, 'creacion', g.fecha ?? new Date().toISOString().slice(0, 10));
  }

  const eliminarMutation = useMutation({
    mutationFn: async (g: Gasto) => {
      await rectificarSiHaceFalta(g);
      const { error } = await supabase.from('gastos').delete().eq('id', g.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gastos'] });
      queryClient.invalidateQueries({ queryKey: ['asientos_contables'] });
      toast.success('Gasto eliminado');
    },
    onError: (error) => toast.error(error.message),
  });

  const eliminarVariosMutation = useMutation({
    mutationFn: async (seleccionados: Gasto[]) => {
      for (const g of seleccionados) {
        await rectificarSiHaceFalta(g);
      }
      const { error } = await supabase
        .from('gastos')
        .delete()
        .in('id', seleccionados.map((g) => g.id));
      if (error) throw error;
    },
    onSuccess: (_data, seleccionados) => {
      queryClient.invalidateQueries({ queryKey: ['gastos'] });
      queryClient.invalidateQueries({ queryKey: ['asientos_contables'] });
      toast.success(`${seleccionados.length} gasto(s) eliminado(s)`);
      limpiar();
    },
    onError: (error) => toast.error(error.message),
  });

  // Confirma un gasto de kilometraje automático como real: pasa a 'pagado' y, si es de Francia,
  // genera su asiento contable ahora — nunca antes, para que un gasto rechazado no deje rastro en
  // el libro diario (ver crearGastoKilometricoPendiente.ts).
  const registrarPagoMutation = useMutation({
    mutationFn: async (g: Gasto) => {
      const { error } = await supabase.from('gastos').update({ estado_gasto: 'pagado' }).eq('id', g.id);
      if (error) throw error;
      if (g.pais === 'Francia') {
        await registrarAsientoGasto({
          id: g.id,
          fecha: g.fecha,
          descripcion: g.descripcion,
          proveedor: g.proveedor,
          cuenta_contable: g.cuenta_contable,
          importe_base: g.importe_base ?? 0,
          importe_iva: g.importe_iva ?? 0,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gastos'] });
      queryClient.invalidateQueries({ queryKey: ['gastos', 'kilometrico-pendiente'] });
      queryClient.invalidateQueries({ queryKey: ['asientos_contables'] });
      toast.success('Gasto registrado como pagado');
    },
    onError: (error) => toast.error(error.message),
  });

  // Rechazar borra la fila sin dejar rastro (p.ej. porque la visita fue con la furgoneta, no con
  // el vehículo del cálculo) — nunca llegó a generar asiento, así que no hay nada que rectificar.
  const rechazarPendienteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('gastos').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gastos'] });
      queryClient.invalidateQueries({ queryKey: ['gastos', 'kilometrico-pendiente'] });
      toast.success('Gasto rechazado');
    },
    onError: (error) => toast.error(error.message),
  });

  const categoriasDisponibles = useMemo(() => {
    const set = new Set((gastos ?? []).map((g) => g.categoria).filter((c): c is string => !!c));
    return ['Todas', SIN_CATEGORIZAR, ...Array.from(set).sort()];
  }, [gastos]);

  const filtrados = useMemo(() => {
    if (!gastos) return [];
    const q = busqueda.trim().toLowerCase();
    return gastos.filter((g) => {
      if (filtroPais !== 'Todos' && g.pais !== filtroPais) return false;
      if (filtroCategoria === SIN_CATEGORIZAR) {
        if (g.cuenta_contable) return false;
      } else if (filtroCategoria !== 'Todas' && g.categoria !== filtroCategoria) {
        return false;
      }
      if (filtroEstado === 'Pendientes de revisar' && g.estado_gasto !== 'pendiente') return false;
      if (filtroEstado === 'Pagados' && g.estado_gasto !== 'pagado') return false;
      if (desde && (!g.fecha || g.fecha < desde)) return false;
      if (hasta && (!g.fecha || g.fecha > hasta)) return false;
      if (q && !`${g.descripcion ?? ''} ${g.proveedor ?? ''}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [gastos, busqueda, filtroPais, filtroCategoria, filtroEstado, desde, hasta]);

  const kpis = useMemo(() => {
    const todos = gastos ?? [];
    const hoyMes = new Date().toISOString().slice(0, 7);
    const totalEsteMes = todos
      .filter((g) => g.fecha?.slice(0, 7) === hoyMes)
      .reduce((s, g) => s + totalConIva(g), 0);
    const totalBase = todos.reduce((s, g) => s + (g.importe_base ?? 0), 0);
    const totalIvaDeducible = todos.reduce((s, g) => s + (g.importe_iva ?? 0), 0);
    // Gastos sin cuenta contable asignada caen en la cuenta de espera 471 en el libro diario y
    // desajustan el compte de résultat — este contador ayuda a que no se acumulen sin revisar.
    const sinCategorizar = todos.filter((g) => !g.cuenta_contable).length;
    const pendientesRevisar = todos.filter((g) => g.estado_gasto === 'pendiente').length;
    return [
      { label: 'Total gastos', valor: todos.length },
      { label: 'Total este mes', valor: `${totalEsteMes.toFixed(0)} €` },
      { label: 'Base deducible', valor: `${totalBase.toFixed(0)} €` },
      { label: 'IVA deducible', valor: `${totalIvaDeducible.toFixed(0)} €`, acento: true },
      { label: 'Sin categorizar', valor: sinCategorizar, acento: sinCategorizar > 0 },
      { label: 'Pendientes de revisar', valor: pendientesRevisar, acento: pendientesRevisar > 0 },
    ];
  }, [gastos]);

  const handleEliminar = async (g: Gasto) => {
    if (!(await confirmar(`¿Eliminar el gasto "${g.descripcion ?? g.proveedor ?? ''}"?`))) return;
    eliminarMutation.mutate(g);
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
          label="Estado"
          options={ESTADOS_FILTRO.map((e) => ({ value: e, label: e }))}
          value={filtroEstado}
          onChange={(e) => setFiltroEstado(e.target.value)}
          className="w-44"
        />
        <Select
          label="Categoría"
          options={categoriasDisponibles.map((c) => ({ value: c, label: c === SIN_CATEGORIZAR ? '— Sin categorizar —' : c }))}
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
              const seleccionados = (gastos ?? []).filter((g) => seleccion.has(g.id));
              eliminarVariosMutation.mutate(seleccionados);
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
              key: 'estado_gasto',
              label: 'Estado',
              render: (g) => (g.estado_gasto === 'pendiente' ? <Badge variant="pendiente">Pendiente de revisar</Badge> : null),
            },
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
              render: (g) => {
                const rapidas: AccionRapida[] =
                  g.estado_gasto === 'pendiente'
                    ? [
                        { icon: Check, label: 'Registrar pago', tono: 'brand', onClick: () => registrarPagoMutation.mutate(g) },
                        { icon: X, label: 'Rechazar', tono: 'peligro', onClick: () => rechazarPendienteMutation.mutate(g.id) },
                      ]
                    : [{ icon: Copy, label: 'Duplicar', tono: 'neutro', onClick: () => setDuplicandoDesde(g) }];
                return (
                  <AccionesFila
                    rapidas={rapidas}
                    menu={[
                      ...(g.estado_gasto === 'pendiente'
                        ? [
                            { label: 'Registrar pago', onClick: () => registrarPagoMutation.mutate(g) },
                            { label: 'Rechazar', onClick: () => rechazarPendienteMutation.mutate(g.id), destructivo: true },
                          ]
                        : []),
                      { label: 'Editar', onClick: () => setGastoSeleccionado(g) },
                      { label: 'Duplicar', onClick: () => setDuplicandoDesde(g) },
                      { label: 'Eliminar', onClick: () => handleEliminar(g), destructivo: true },
                    ]}
                  />
                );
              },
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
