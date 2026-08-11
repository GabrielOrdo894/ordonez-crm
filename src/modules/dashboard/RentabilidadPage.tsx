import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { Table } from '../../components/ui/Table';
import { formatearPrecio } from '../finanzas/lineas';
import type { Visita } from '../visitas/types';
import type { Factura } from '../finanzas/facturas/types';
import type { Gasto } from '../finanzas/gastos/types';

type FilaProyecto = {
  id: string;
  cliente: string;
  facturado: number;
  gastos: number;
  margen: number;
  margenPct: number | null;
};

function nombreVisita(v: Visita): string {
  return v.es_empresa && v.empresa_nombre ? v.empresa_nombre : `${v.nombre} ${v.apellidos}`.trim();
}

export default function RentabilidadPage() {
  const { data: visitas, isLoading: cargandoVisitas } = useQuery({
    queryKey: ['visitas'],
    queryFn: async () => {
      const { data, error } = await supabase.from('visitas').select('*').is('eliminado_en', null);
      if (error) throw error;
      return data as Visita[];
    },
  });

  const { data: facturas, isLoading: cargandoFacturas } = useQuery({
    queryKey: ['facturas'],
    queryFn: async () => {
      const { data, error } = await supabase.from('facturas').select('*').is('eliminado_en', null);
      if (error) throw error;
      return data as Factura[];
    },
  });

  const { data: gastos, isLoading: cargandoGastos } = useQuery({
    queryKey: ['gastos'],
    queryFn: async () => {
      const { data, error } = await supabase.from('gastos').select('*');
      if (error) throw error;
      return data as Gasto[];
    },
  });

  const cargando = cargandoVisitas || cargandoFacturas || cargandoGastos;

  const { filas, gastosSinProyecto } = useMemo(() => {
    const porVisita = new Map<string, { facturado: number; gastos: number }>();
    const asegurar = (id: string) => {
      if (!porVisita.has(id)) porVisita.set(id, { facturado: 0, gastos: 0 });
      return porVisita.get(id)!;
    };

    for (const f of facturas ?? []) {
      if (!f.visita_id) continue;
      const total = (f.lineas ?? []).reduce((s, l) => s + (l.es_incluido ? 0 : l.total_con_iva), 0);
      asegurar(f.visita_id).facturado += total;
    }

    let gastosSinProyecto = 0;
    for (const g of gastos ?? []) {
      const importe = (g.importe_base ?? 0) + (g.importe_iva ?? 0);
      if (!g.visita_id) {
        gastosSinProyecto += importe;
        continue;
      }
      asegurar(g.visita_id).gastos += importe;
    }

    const visitasPorId = new Map((visitas ?? []).map((v) => [v.id, v]));

    const filas: FilaProyecto[] = Array.from(porVisita.entries())
      .filter(([, v]) => v.facturado !== 0 || v.gastos !== 0)
      .map(([visitaId, v]) => {
        const visita = visitasPorId.get(visitaId);
        const margen = v.facturado - v.gastos;
        return {
          id: visitaId,
          cliente: visita ? nombreVisita(visita) : 'Cliente eliminado',
          facturado: v.facturado,
          gastos: v.gastos,
          margen,
          margenPct: v.facturado !== 0 ? (margen / v.facturado) * 100 : null,
        };
      })
      .sort((a, b) => a.margen - b.margen);

    return { filas, gastosSinProyecto };
  }, [visitas, facturas, gastos]);

  const totales = useMemo(
    () => ({
      facturado: filas.reduce((s, f) => s + f.facturado, 0),
      gastos: filas.reduce((s, f) => s + f.gastos, 0),
      margen: filas.reduce((s, f) => s + f.margen, 0),
    }),
    [filas],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-surface border border-gray-200 rounded-sm p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Facturado (proyectos)</p>
          <p className="text-2xl font-semibold text-gray-900">{formatearPrecio(totales.facturado)}</p>
        </div>
        <div className="bg-surface border border-gray-200 rounded-sm p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Gastos (proyectos)</p>
          <p className="text-2xl font-semibold text-red-600">{formatearPrecio(totales.gastos)}</p>
        </div>
        <div className="bg-surface border border-gray-200 rounded-sm p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Margen real</p>
          <p className={`text-2xl font-semibold ${totales.margen >= 0 ? 'text-brand' : 'text-red-600'}`}>
            {formatearPrecio(totales.margen)}
          </p>
        </div>
        <div className="bg-surface border border-gray-200 rounded-sm p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Gastos sin proyecto</p>
          <p className="text-2xl font-semibold text-gray-500">{formatearPrecio(gastosSinProyecto)}</p>
        </div>
      </div>

      <div className="bg-surface border border-gray-200 rounded-sm p-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 border-b border-gray-200 pb-2 mb-3">
          Rentabilidad por proyecto — facturado real vs. gastos reales
        </p>
        <Table<FilaProyecto>
          loading={cargando}
          emptyMessage="Ningún proyecto tiene todavía facturas o gastos vinculados"
          columns={[
            { key: 'cliente', label: 'Cliente' },
            {
              key: 'facturado',
              label: 'Facturado',
              render: (f) => formatearPrecio(f.facturado),
            },
            {
              key: 'gastos',
              label: 'Gastos',
              render: (f) => formatearPrecio(f.gastos),
            },
            {
              key: 'margen',
              label: 'Margen',
              render: (f) => (
                <span className={f.margen >= 0 ? 'text-gray-900' : 'text-red-600 font-medium'}>{formatearPrecio(f.margen)}</span>
              ),
            },
            {
              key: 'margenPct',
              label: '% margen',
              render: (f) =>
                f.margenPct == null ? (
                  '—'
                ) : (
                  <span className={f.margenPct >= 0 ? 'text-gray-900' : 'text-red-600 font-medium'}>{f.margenPct.toFixed(1)}%</span>
                ),
            },
          ]}
          data={filas}
          rowClassName={(f) => (f.margen < 0 ? 'bg-red-50' : '')}
        />
      </div>
    </div>
  );
}
