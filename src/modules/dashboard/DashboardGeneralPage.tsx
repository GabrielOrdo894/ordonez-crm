import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { TOOLTIP_STYLE } from '../../lib/chartStyles';
import { Select } from '../../components/ui/Select';
import { Input } from '../../components/ui/Input';
import { agruparClientes } from '../clientes/types';
import { useNotificaciones } from '../notificaciones/useNotificaciones';
import type { Visita } from '../visitas/types';
import type { Factura } from '../finanzas/facturas/types';
import type { Presupuesto } from '../finanzas/presupuestos/types';
import type { Gasto } from '../finanzas/gastos/types';

const PERIODOS = [
  { value: 'mes', label: 'Este mes' },
  { value: 'trimestre', label: 'Este trimestre' },
  { value: 'anio', label: 'Este año' },
  { value: 'personalizado', label: 'Personalizado' },
];

function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function rangoPeriodo(periodo: string, desdeCustom: string, hastaCustom: string) {
  const hoy = new Date();
  if (periodo === 'personalizado') return { desde: desdeCustom, hasta: hastaCustom };
  if (periodo === 'mes') {
    return { desde: iso(new Date(hoy.getFullYear(), hoy.getMonth(), 1)), hasta: iso(new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0)) };
  }
  if (periodo === 'trimestre') {
    const t = Math.floor(hoy.getMonth() / 3);
    return { desde: iso(new Date(hoy.getFullYear(), t * 3, 1)), hasta: iso(new Date(hoy.getFullYear(), t * 3 + 3, 0)) };
  }
  return { desde: iso(new Date(hoy.getFullYear(), 0, 1)), hasta: iso(new Date(hoy.getFullYear(), 11, 31)) };
}

const anioActual = new Date().getFullYear();

export default function DashboardGeneralPage() {
  const [periodo, setPeriodo] = useState('mes');
  const [desdeCustom, setDesdeCustom] = useState(iso(new Date(anioActual, 0, 1)));
  const [hastaCustom, setHastaCustom] = useState(iso(new Date()));
  const { desde, hasta } = useMemo(() => rangoPeriodo(periodo, desdeCustom, hastaCustom), [periodo, desdeCustom, hastaCustom]);
  const { noLeidas } = useNotificaciones();
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

  const ingresosPorPaisPeriodo = useMemo(() => {
    const facturasPeriodo = (facturas ?? []).filter(
      (f) => f.fecha_pago && f.monto_pagado != null && f.fecha_pago >= desde && f.fecha_pago <= hasta,
    );
    const francia = facturasPeriodo.filter((f) => f.pais === 'Francia').reduce((s, f) => s + (f.monto_pagado ?? 0), 0);
    const espana = facturasPeriodo.filter((f) => f.pais === 'España').reduce((s, f) => s + (f.monto_pagado ?? 0), 0);
    return { francia, espana };
  }, [facturas, desde, hasta]);

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
      <div className="flex items-end gap-2 flex-wrap">
        <Select label="Período" options={PERIODOS} value={periodo} onChange={(e) => setPeriodo(e.target.value)} className="w-44" />
        {periodo === 'personalizado' && (
          <>
            <Input label="Desde" type="date" value={desdeCustom} onChange={(e) => setDesdeCustom(e.target.value)} className="w-40" />
            <Input label="Hasta" type="date" value={hastaCustom} onChange={(e) => setHastaCustom(e.target.value)} className="w-40" />
          </>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-surface border border-gray-200 rounded-sm p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Ingresos Francia (período)</p>
          <p className="text-2xl font-semibold text-brand">{ingresosPorPaisPeriodo.francia.toFixed(2)} €</p>
        </div>
        <div className="bg-surface border border-gray-200 rounded-sm p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Ingresos España (período)</p>
          <p className="text-2xl font-semibold text-gray-900">{ingresosPorPaisPeriodo.espana.toFixed(2)} €</p>
        </div>
      </div>

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
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 border-b border-gray-200 pb-2 mb-3 flex items-center gap-1.5">
          <AlertTriangle size={13} className="text-brand" /> Pendientes urgentes
        </p>
        {noLeidas.length === 0 ? (
          <p className="text-sm text-gray-400 py-8 text-center">Todo al día — sin pendientes urgentes.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {noLeidas.slice(0, 6).map((n) => (
              <Link
                key={n.id}
                to={n.to}
                className="flex items-start justify-between gap-3 border border-gray-100 rounded-sm px-3 py-2 hover:border-brand"
              >
                <div className="min-w-0">
                  <p className="text-sm text-gray-900 truncate">{n.titulo}</p>
                  <p className="text-xs text-gray-500 truncate">{n.resumen}</p>
                </div>
                {n.urgente && (
                  <span className="shrink-0 bg-red-600 text-white text-[10px] font-bold uppercase tracking-wide rounded-sm px-1.5 py-0.5">
                    Urgente
                  </span>
                )}
              </Link>
            ))}
            {noLeidas.length > 6 && <p className="text-xs text-gray-400 text-center">+ {noLeidas.length - 6} más</p>}
          </div>
        )}
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
