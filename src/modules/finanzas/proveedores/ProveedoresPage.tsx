import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, Archive } from 'lucide-react';
import JSZip from 'jszip';
import { mensajeError } from '../../../lib/mensajeError';
import { supabase } from '../../../lib/supabase';
import { useToast } from '../../../hooks/useToast';
import { useConfirmar } from '../../../hooks/useConfirm';
import { useSeleccionMultiple } from '../../../hooks/useSeleccionMultiple';
import { Table } from '../../../components/ui/Table';
import { Button } from '../../../components/ui/Button';
import { Select } from '../../../components/ui/Select';
import { Input } from '../../../components/ui/Input';
import { KpiRow } from '../../../components/ui/Kpi';
import { BotonExportar } from '../../../components/ui/BotonExportar';
import { BulkActionsBar } from '../../../components/ui/BulkActionsBar';
import { AccionesFila } from '../../../components/ui/AccionesFila';
import { DescargarZipModal } from '../../../components/ui/DescargarZipModal';
import { generarPdfListadoProveedores } from '../../../lib/generarPdfListadoProveedores';
import type { Proveedor } from './types';
import { ProveedorForm } from './ProveedorForm';

const PAISES_FILTRO = [
  { value: 'Todos', label: 'Todos' },
  { value: 'España', label: 'España' },
  { value: 'Francia', label: 'Francia' },
];

export default function ProveedoresPage() {
  const toast = useToast();
  const confirmar = useConfirmar();
  const queryClient = useQueryClient();
  const [busqueda, setBusqueda] = useState('');
  const [proveedorSeleccionado, setProveedorSeleccionado] = useState<Proveedor | null>(null);
  const [creandoNuevo, setCreandoNuevo] = useState(false);
  const { seleccion, toggleFila, toggleTodas, limpiar } = useSeleccionMultiple();

  const [zipAbierto, setZipAbierto] = useState(false);
  const [zipBusqueda, setZipBusqueda] = useState('');
  const [zipPais, setZipPais] = useState('Todos');
  const [generandoZip, setGenerandoZip] = useState(false);

  const { data: proveedores, isLoading } = useQuery({
    queryKey: ['proveedores'],
    queryFn: async () => {
      const { data, error } = await supabase.from('proveedores').select('*').order('razon_social', { ascending: true });
      if (error) throw error;
      return data as Proveedor[];
    },
  });

  const eliminarMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('proveedores').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['proveedores'] });
      toast.success('Proveedor eliminado');
    },
    onError: (error) => toast.error(error.message),
  });

  const eliminarVariosMutation = useMutation({
    mutationFn: async (ids: (string | number)[]) => {
      const { error } = await supabase.from('proveedores').delete().in('id', ids as string[]);
      if (error) throw error;
    },
    onSuccess: (_data, ids) => {
      queryClient.invalidateQueries({ queryKey: ['proveedores'] });
      toast.success(`${ids.length} proveedor(es) eliminado(s)`);
      limpiar();
    },
    onError: (error) => toast.error(error.message),
  });

  const filtrados = useMemo(() => {
    if (!proveedores) return [];
    const q = busqueda.trim().toLowerCase();
    if (!q) return proveedores;
    return proveedores.filter((p) => `${p.razon_social ?? ''} ${p.identificador ?? ''}`.toLowerCase().includes(q));
  }, [proveedores, busqueda]);

  const paraZip = useMemo(() => {
    if (!proveedores) return [];
    const q = zipBusqueda.trim().toLowerCase();
    return proveedores.filter((p) => {
      if (zipPais !== 'Todos' && (p.pais ?? '') !== zipPais) return false;
      if (q && !`${p.razon_social ?? ''} ${p.identificador ?? ''}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [proveedores, zipBusqueda, zipPais]);

  const kpis = useMemo(() => {
    const todos = proveedores ?? [];
    return [
      { label: 'Total proveedores', valor: todos.length },
      { label: 'España', valor: todos.filter((p) => p.pais === 'España').length },
      { label: 'Francia', valor: todos.filter((p) => p.pais === 'Francia').length, acento: true },
    ];
  }, [proveedores]);

  const handleEliminar = async (p: Proveedor) => {
    const { count, error } = await supabase
      .from('gastos')
      .select('id', { count: 'exact', head: true })
      .eq('proveedor_id', p.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    const aviso = count
      ? ` Tiene ${count} gasto(s) vinculado(s) — no se borrarán, pero dejarán de mostrar el nombre del proveedor.`
      : '';
    if (!(await confirmar(`¿Eliminar el proveedor "${p.razon_social ?? ''}"?${aviso}`))) return;
    eliminarMutation.mutate(p.id);
  };

  const abrirZip = () => {
    setZipBusqueda(busqueda);
    setZipPais('Todos');
    setZipAbierto(true);
  };

  const handleDescargarZip = async () => {
    if (paraZip.length === 0) return;
    setGenerandoZip(true);
    try {
      const filtrosTexto = [zipPais !== 'Todos' ? `País: ${zipPais}` : null, zipBusqueda ? `Búsqueda: "${zipBusqueda}"` : null]
        .filter(Boolean)
        .join(' · ');
      const blob = await generarPdfListadoProveedores(paraZip, filtrosTexto);
      const zip = new JSZip();
      zip.file('proveedores.pdf', blob);
      const contenido = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(contenido);
      const enlace = document.createElement('a');
      enlace.href = url;
      enlace.download = `proveedores_${new Date().toISOString().slice(0, 10)}.zip`;
      enlace.click();
      URL.revokeObjectURL(url);
      toast.success(`${paraZip.length} proveedor(es) descargado(s) en ZIP`);
      setZipAbierto(false);
    } catch (err) {
      toast.error(mensajeError(err, 'No se pudo generar el ZIP'));
    } finally {
      setGenerandoZip(false);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre o identificador fiscal"
            className="w-full border border-gray-200 rounded-sm pl-8 pr-2.5 py-1.5 text-sm focus:border-brand focus:outline-none"
          />
        </div>
        <span className="text-sm text-gray-500 ml-auto mr-2">{filtrados.length} proveedores</span>
        <BotonExportar
          nombreArchivo="proveedores.csv"
          filas={filtrados}
          columnas={[
            { key: 'razon_social', label: 'Razón social' },
            { key: 'pais', label: 'País' },
            { key: 'identificador', label: 'CIF / SIRET' },
            { key: 'identificador_extra', label: 'TVA / Identificador adicional' },
            { key: 'direccion', label: 'Dirección' },
            { key: 'telefono', label: 'Teléfono' },
            { key: 'email', label: 'Email' },
          ]}
        />
        <Button variant="secondary" onClick={abrirZip} className="px-3 py-2 text-sm">
          <span className="flex items-center gap-1.5">
            <Archive size={14} />
            Descargar
          </span>
        </Button>
        <Button onClick={() => setCreandoNuevo(true)} className="px-4 py-2 text-sm">
          + Nuevo proveedor
        </Button>
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
              if (!(await confirmar(`¿Eliminar ${seleccion.size} proveedor(es)?`))) return;
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
          emptyMessage="No hay proveedores registrados"
          onRowClick={(p) => setProveedorSeleccionado(p)}
          seleccion={seleccion}
          onToggleFila={toggleFila}
          onToggleTodas={toggleTodas}
          columns={[
            { key: 'razon_social', label: 'Razón social' },
            { key: 'pais', label: 'País' },
            { key: 'identificador', label: 'CIF / SIRET' },
            { key: 'telefono', label: 'Teléfono' },
            { key: 'email', label: 'Email' },
            {
              key: 'acciones',
              label: '',
              sortable: false,
              render: (p) => (
                <AccionesFila
                  menu={[
                    { label: 'Editar', onClick: () => setProveedorSeleccionado(p) },
                    { label: 'Eliminar', onClick: () => handleEliminar(p), destructivo: true },
                  ]}
                />
              ),
            },
          ]}
        />
      </div>

      <ProveedorForm open={!!proveedorSeleccionado} onClose={() => setProveedorSeleccionado(null)} proveedor={proveedorSeleccionado} />
      <ProveedorForm open={creandoNuevo} onClose={() => setCreandoNuevo(false)} proveedor={null} />

      <DescargarZipModal
        open={zipAbierto}
        onClose={() => setZipAbierto(false)}
        titulo="Descargar proveedores en ZIP"
        cantidad={paraZip.length}
        generando={generandoZip}
        onDescargar={handleDescargarZip}
      >
        <div className="grid grid-cols-2 gap-3">
          <Select label="País" options={PAISES_FILTRO} value={zipPais} onChange={(e) => setZipPais(e.target.value)} />
          <Input
            label="Buscar por nombre o identificador"
            value={zipBusqueda}
            onChange={(e) => setZipBusqueda(e.target.value)}
          />
        </div>
        <p className="text-xs text-gray-400">
          El ZIP incluye un único PDF con el listado de los proveedores que coincidan (proveedores no tiene un
          documento individual como presupuestos o facturas).
        </p>
      </DescargarZipModal>
    </div>
  );
}
