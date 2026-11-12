import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Table } from '../../components/ui/Table';
import { KpiRow } from '../../components/ui/Kpi';
import { Badge } from '../../components/ui/Badge';
import { BulkActionsBar } from '../../components/ui/BulkActionsBar';
import { BotonExportar } from '../../components/ui/BotonExportar';
import { useSeleccionMultiple } from '../../hooks/useSeleccionMultiple';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { fechaVisitaCorta, hoyLocalIso } from '../../lib/fechas';
import { formatearPrecio } from '../finanzas/lineas';

// Comisión del 10 % sobre cada cobro de cliente, IVA incluido: 5 % Gabriel + 5 % Santiago
// (petición de Gabriel, 2026-11-12). Cuentan todos los cobros (acomptes y facturas, Francia y
// España). Registro interno, sin efecto contable: una fila en comisiones_cobros = la comisión de
// ese cobro ya se ha recibido; sin fila = pendiente de recibir.
const PORCENTAJE_COMISION = 0.1;

type PagoComision = {
  id: string;
  fecha: string;
  monto: number;
  facturas: { numero: string | null; cliente_nombre: string | null };
};

type FilaComision = {
  id: string;
  fecha: string;
  titulo: string;
  cobrado: number;
  comision: number;
  recibidaEn: string | null;
};

const FILTROS = ['Todas', 'Pendientes', 'Recibidas'] as const;
type Filtro = (typeof FILTROS)[number];

export default function ComisionesPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();
  const nombreUsuarioActual = (user?.user_metadata?.nombre as string) || user?.email || 'Sistema';
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('Pendientes');
  const { seleccion, toggleFila, toggleTodas, limpiar } = useSeleccionMultiple();

  const { data: pagos, isLoading } = useQuery({
    queryKey: ['pagos_factura', 'comisiones'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pagos_factura')
        .select('id, fecha, monto, facturas!inner(numero, cliente_nombre, eliminado_en)')
        .is('anulado_en', null)
        .is('facturas.eliminado_en', null);
      if (error) throw error;
      // PostgREST devuelve un único objeto en el embed (FK many-to-one), TS lo infiere como array.
      return data as unknown as PagoComision[];
    },
  });

  const { data: recibidas } = useQuery({
    queryKey: ['comisiones_cobros'],
    queryFn: async () => {
      const { data, error } = await supabase.from('comisiones_cobros').select('pago_id, recibida_en');
      if (error) throw error;
      return data as { pago_id: string; recibida_en: string }[];
    },
  });

  const filas = useMemo<FilaComision[]>(() => {
    const recibidaPorPago = new Map((recibidas ?? []).map((r) => [r.pago_id, r.recibida_en]));
    return [...(pagos ?? [])]
      .sort((a, b) => b.fecha.localeCompare(a.fecha))
      .map((p) => ({
        id: p.id,
        fecha: p.fecha,
        titulo: `${p.facturas.numero ?? ''} · ${p.facturas.cliente_nombre ?? ''}`,
        cobrado: p.monto,
        comision: p.monto * PORCENTAJE_COMISION,
        recibidaEn: recibidaPorPago.get(p.id) ?? null,
      }));
  }, [pagos, recibidas]);

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return filas.filter((f) => {
      if (filtro === 'Pendientes' && f.recibidaEn) return false;
      if (filtro === 'Recibidas' && !f.recibidaEn) return false;
      return !q || f.titulo.toLowerCase().includes(q);
    });
  }, [filas, busqueda, filtro]);

  const kpis = useMemo(() => {
    const suma = (lista: FilaComision[]) => lista.reduce((s, f) => s + f.comision, 0);
    const pendientes = filas.filter((f) => !f.recibidaEn);
    const pendiente = suma(pendientes);
    const recibido = suma(filas.filter((f) => f.recibidaEn));
    return [
      {
        label: 'Pendiente de recibir',
        valor: formatearPrecio(pendiente),
        valorSecundario: `${pendientes.length} cobro${pendientes.length === 1 ? '' : 's'}`,
        acento: true,
      },
      { label: 'Pendiente · Gabriel (5 %)', valor: formatearPrecio(pendiente / 2) },
      { label: 'Pendiente · Santiago (5 %)', valor: formatearPrecio(pendiente / 2) },
      { label: 'Ya recibido', valor: formatearPrecio(recibido) },
    ];
  }, [filas]);

  const marcarMutation = useMutation({
    mutationFn: async ({ ids, recibida }: { ids: string[]; recibida: boolean }) => {
      if (recibida) {
        const { error } = await supabase.from('comisiones_cobros').upsert(
          ids.map((pago_id) => ({ pago_id, recibida_en: hoyLocalIso(), marcada_por: nombreUsuarioActual })),
          { onConflict: 'pago_id', ignoreDuplicates: true },
        );
        if (error) throw error;
      } else {
        const { error } = await supabase.from('comisiones_cobros').delete().in('pago_id', ids);
        if (error) throw error;
      }
    },
    onSuccess: (_data, { ids, recibida }) => {
      queryClient.invalidateQueries({ queryKey: ['comisiones_cobros'] });
      toast.success(
        recibida ? `${ids.length} comisión(es) marcada(s) como recibida(s)` : `${ids.length} comisión(es) de vuelta a pendiente`,
      );
      limpiar();
    },
    onError: (error) => toast.error(error.message),
  });

  const idsSeleccionados = filas.filter((f) => seleccion.has(f.id)).map((f) => f.id);

  return (
    <div>
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por cliente o número"
            className="w-full border border-gray-200 rounded-sm pl-8 pr-2.5 py-1.5 text-sm focus:border-brand focus:outline-none"
          />
        </div>
        <div className="flex border border-gray-200 rounded-sm overflow-hidden text-sm">
          {FILTROS.map((f) => (
            <button
              key={f}
              onClick={() => {
                setFiltro(f);
                limpiar();
              }}
              className={`px-2.5 py-1.5 ${filtro === f ? 'bg-brand text-white' : 'bg-surface text-gray-600 hover:bg-gray-50'}`}
            >
              {f}
            </button>
          ))}
        </div>
        <span className="text-sm text-gray-500 ml-auto mr-2">{filtradas.length} cobros</span>
        <BotonExportar
          nombreArchivo="comisiones.csv"
          filas={filtradas}
          columnas={[
            { key: 'fecha', label: 'Fecha de cobro' },
            { key: 'titulo', label: 'Factura y cliente' },
            { key: 'cobrado', label: 'Cobrado con IVA', valor: (f) => f.cobrado.toFixed(2) },
            { key: 'comision', label: 'Comisión 10 %', valor: (f) => f.comision.toFixed(2) },
            { key: 'cadaUno', label: 'Cada uno 5 %', valor: (f) => (f.comision / 2).toFixed(2) },
            { key: 'estado', label: 'Estado', valor: (f) => (f.recibidaEn ? 'Recibida' : 'Pendiente') },
            { key: 'recibidaEn', label: 'Recibida el', valor: (f) => f.recibidaEn ?? '' },
          ]}
        />
      </div>

      <KpiRow items={kpis} />

      <p className="text-xs text-gray-500 mb-3">
        10 % de cada cobro de cliente, IVA incluido: 5 % para Gabriel y 5 % para Santiago. Es un registro interno, no
        genera asientos ni gastos en la contabilidad.
      </p>

      <BulkActionsBar
        count={seleccion.size}
        onCancelar={limpiar}
        acciones={[
          {
            label: 'Marcar como recibidas',
            onClick: () => marcarMutation.mutate({ ids: idsSeleccionados, recibida: true }),
            disabled: marcarMutation.isPending,
          },
          {
            label: 'Volver a pendiente',
            onClick: () => marcarMutation.mutate({ ids: idsSeleccionados, recibida: false }),
            disabled: marcarMutation.isPending,
          },
        ]}
      />

      <div className="bg-surface border border-gray-200 rounded-sm overflow-hidden">
        <Table
          loading={isLoading}
          data={filtradas}
          emptyMessage={filtro === 'Pendientes' ? 'No hay comisiones pendientes de recibir' : 'Sin cobros registrados'}
          seleccion={seleccion}
          onToggleFila={toggleFila}
          onToggleTodas={toggleTodas}
          columns={[
            { key: 'fecha', label: 'Fecha de cobro', render: (f) => fechaVisitaCorta(f.fecha), sortValue: (f) => f.fecha },
            { key: 'titulo', label: 'Factura y cliente' },
            { key: 'cobrado', label: 'Cobrado con IVA', render: (f) => formatearPrecio(f.cobrado), sortValue: (f) => f.cobrado },
            { key: 'comision', label: 'Comisión 10 %', render: (f) => formatearPrecio(f.comision), sortValue: (f) => f.comision },
            { key: 'cadaUno', label: 'Cada uno 5 %', render: (f) => formatearPrecio(f.comision / 2) },
            {
              key: 'estado',
              label: 'Estado',
              render: (f) =>
                f.recibidaEn ? (
                  <Badge variant="realizada">Recibida · {fechaVisitaCorta(f.recibidaEn)}</Badge>
                ) : (
                  <Badge variant="pendiente">Pendiente</Badge>
                ),
            },
          ]}
        />
      </div>
    </div>
  );
}
