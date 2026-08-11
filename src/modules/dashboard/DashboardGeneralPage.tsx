import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { supabase } from '../../lib/supabase';
import { TOOLTIP_STYLE } from '../../lib/chartStyles';
import { agruparClientes } from '../clientes/types';
import type { Visita } from '../visitas/types';
import type { Factura } from '../finanzas/facturas/types';
import type { Presupuesto } from '../finanzas/presupuestos/types';
import type { Gasto } from '../finanzas/gastos/types';

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

export default function DashboardGeneralPage() {
  const { data: visitas } = useQuery({
    queryKey: ['visitas'],
    queryFn: async () => {
      const { data, error } = await supabase.from('visitas').select('*').is('eliminado_en', null);
      if (error) throw error;
      return data as Visita[];
    },
  });

  const { data: facturas } = useQuery({
    queryKey: ['facturas'],
    queryFn: async () => {
      const { data, error } = await supabase.from('facturas').select('*').is('eliminado_en', null);
      if (error) throw error;
      return data as Factura[];
    },
  });

  const { data: presupuestos } = useQuery({
    queryKey: ['presupuestos'],
    queryFn: async () => {
      const { data, error } = await supabase.from('presupuestos').select('*').is('eliminado_en', null);
      if (error) throw error;
      return data as Presupuesto[];
    },
  });

  const { data: gastos } = useQuery({
    queryKey: ['gastos'],
    queryFn: async () => {
      const { data, error } = await supabase.from('gastos').select('*');
      if (error) throw error;
      return data as Gasto[];
    },
  });

  const clientes = useMemo(() => agruparClientes(visitas ?? []), [visitas]);

  const kpis = useMemo(() => {
    const ingresos = (facturas ?? []).filter((f) => f.monto_pagado != null).reduce((s, f) => s + (f.monto_pagado ?? 0), 0);
    const gastosTotal = (gastos ?? []).reduce((s, g) => s + (g.importe_base ?? 0) + (g.importe_iva ?? 0), 0);
    const presupuestosPendientes = (presupuestos ?? []).filter((p) => p.estado === 'Pendiente').length;
    const facturasPendientes = (facturas ?? []).filter(
      (f) => f.estado_cobro === 'Pendiente' || f.estado_cobro === 'Cobrada parcialmente',
    ).length;
    const facturasVencidas = (facturas ?? []).filter((f) => f.estado_cobro === 'Vencida').length;
    return {
      totalClientes: clientes.length,
      totalVisitas: (visitas ?? []).length,
      ingresos,
      gastos: gastosTotal,
      resultado: ingresos - gastosTotal,
      presupuestosPendientes,
      facturasPendientes,
      facturasVencidas,
    };
  }, [clientes, visitas, facturas, gastos, presupuestos]);

  const evolucionMensual = useMemo(() => {
    const meses = Array.from({ length: 12 }, (_, i) => {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - (11 - i));
      return { anio: d.getFullYear(), mes: d.getMonth(), etiqueta: `${MESES[d.getMonth()]} ${String(d.getFullYear()).slice(-2)}` };
    });
    return meses.map(({ anio, mes, etiqueta }) => {
      const ingresosMes = (facturas ?? [])
        .filter((f) => f.fecha_pago && f.monto_pagado != null)
        .filter((f) => {
          const d = new Date(`${f.fecha_pago}T00:00:00`);
          return d.getFullYear() === anio && d.getMonth() === mes;
        })
        .reduce((s, f) => s + (f.monto_pagado ?? 0), 0);
      const gastosMes = (gastos ?? [])
        .filter((g) => g.fecha)
        .filter((g) => {
          const d = new Date(`${g.fecha}T00:00:00`);
          return d.getFullYear() === anio && d.getMonth() === mes;
        })
        .reduce((s, g) => s + (g.importe_base ?? 0) + (g.importe_iva ?? 0), 0);
      return { mes: etiqueta, ingresos: ingresosMes, gastos: gastosMes, resultado: ingresosMes - gastosMes };
    });
  }, [facturas, gastos]);

  const visitasPorPipeline = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of clientes) {
      const etapa = c.visitas[0]?.estado_pipeline ?? 'Sin etapa';
      map.set(etapa, (map.get(etapa) ?? 0) + 1);
    }
    return Array.from(map.entries()).map(([etapa, valor]) => ({ etapa, valor }));
  }, [clientes]);

  const accesos = [
    { to: '/visitas', label: 'Visitas', valor: kpis.totalVisitas },
    { to: '/clientes', label: 'Clientes', valor: kpis.totalClientes },
    { to: '/finanzas/presupuestos', label: 'Presupuestos pendientes', valor: kpis.presupuestosPendientes },
    { to: '/finanzas/facturas', label: 'Facturas pendientes/vencidas', valor: kpis.facturasPendientes + kpis.facturasVencidas },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-surface border border-gray-200 rounded-sm p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Ingresos históricos</p>
          <p className="text-2xl font-semibold text-brand">{kpis.ingresos.toFixed(2)} €</p>
        </div>
        <div className="bg-surface border border-gray-200 rounded-sm p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Gastos históricos</p>
          <p className="text-2xl font-semibold text-red-600">{kpis.gastos.toFixed(2)} €</p>
        </div>
        <div className="bg-surface border border-gray-200 rounded-sm p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Resultado histórico</p>
          <p className={`text-2xl font-semibold ${kpis.resultado >= 0 ? 'text-brand' : 'text-red-600'}`}>
            {kpis.resultado.toFixed(2)} €
          </p>
        </div>
        <div className="bg-surface border border-gray-200 rounded-sm p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Clientes totales</p>
          <p className="text-2xl font-semibold text-gray-900">{kpis.totalClientes}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {accesos.map((a) => (
          <Link
            key={a.to}
            to={a.to}
            className="bg-surface border border-gray-200 rounded-sm p-4 hover:border-brand flex items-center justify-between"
          >
            <span className="text-sm text-gray-600">{a.label}</span>
            <span className="text-lg font-semibold text-gray-900">{a.valor}</span>
          </Link>
        ))}
      </div>

      <div className="bg-surface border border-gray-200 rounded-sm p-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 border-b border-gray-200 pb-2 mb-3">
          Ingresos, gastos y resultado — últimos 12 meses
        </p>
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={evolucionMensual}>
            <CartesianGrid stroke="#e5e7eb" vertical={false} />
            <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={{ stroke: '#e5e7eb' }} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} width={55} />
            <Tooltip formatter={(valor: unknown) => `${Number(valor).toFixed(2)} €`} contentStyle={TOOLTIP_STYLE} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="ingresos" name="Ingresos" fill="#1a5c38" radius={[2, 2, 0, 0]} />
            <Bar dataKey="gastos" name="Gastos" fill="#b91c1c" radius={[2, 2, 0, 0]} />
            <Line dataKey="resultado" name="Resultado" stroke="#4b5563" strokeWidth={2} dot={{ r: 3 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-surface border border-gray-200 rounded-sm p-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 border-b border-gray-200 pb-2 mb-3">
          Clientes por etapa de pipeline
        </p>
        <ResponsiveContainer width="100%" height={Math.max(160, visitasPorPipeline.length * 34)}>
          <BarChart data={visitasPorPipeline} layout="vertical" margin={{ left: 10 }}>
            <XAxis type="number" tick={{ fontSize: 11, fill: '#6b7280' }} allowDecimals={false} />
            <YAxis type="category" dataKey="etapa" width={140} tick={{ fontSize: 11, fill: '#374151' }} />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Bar dataKey="valor" fill="#1a5c38" radius={[0, 2, 2, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
