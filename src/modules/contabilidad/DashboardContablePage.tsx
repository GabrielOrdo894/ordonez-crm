import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { supabase } from '../../lib/supabase';
import { TOOLTIP_STYLE } from '../../lib/chartStyles';
import { Select } from '../../components/ui/Select';
import { Input } from '../../components/ui/Input';
import { calcularTotales } from '../finanzas/lineas';
import { GRUPOS_CATEGORIA } from '../finanzas/gastos/categorias';
import { normalizarTelefono } from '../clientes/types';
import type { Factura } from '../finanzas/facturas/types';
import type { Presupuesto } from '../finanzas/presupuestos/types';
import type { Gasto } from '../finanzas/gastos/types';

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

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

function grupoDeCuenta(cuenta: string | null) {
  if (!cuenta) return null;
  return GRUPOS_CATEGORIA.find((g) => g.cuentas.includes(cuenta)) ?? null;
}

const anioActual = new Date().getFullYear();

export default function DashboardContablePage() {
  const [periodo, setPeriodo] = useState('anio');
  const [desdeCustom, setDesdeCustom] = useState(iso(new Date(anioActual, 0, 1)));
  const [hastaCustom, setHastaCustom] = useState(iso(new Date()));

  const { desde, hasta } = useMemo(() => rangoPeriodo(periodo, desdeCustom, hastaCustom), [periodo, desdeCustom, hastaCustom]);

  const { data: facturas } = useQuery({
    queryKey: ['facturas'],
    queryFn: async () => {
      const { data, error } = await supabase.from('facturas').select('*').is('eliminado_en', null);
      if (error) throw error;
      return data as Factura[];
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

  const { data: presupuestos } = useQuery({
    queryKey: ['presupuestos'],
    queryFn: async () => {
      const { data, error } = await supabase.from('presupuestos').select('*').is('eliminado_en', null);
      if (error) throw error;
      return data as Presupuesto[];
    },
  });

  const facturasPeriodo = useMemo(
    () => (facturas ?? []).filter((f) => f.fecha_pago && f.fecha_pago >= desde && f.fecha_pago <= hasta && f.monto_pagado != null),
    [facturas, desde, hasta],
  );

  const gastosPeriodo = useMemo(
    () => (gastos ?? []).filter((g) => g.fecha && g.fecha >= desde && g.fecha <= hasta),
    [gastos, desde, hasta],
  );

  const kpis = useMemo(() => {
    const ingresos = facturasPeriodo.reduce((s, f) => s + (f.monto_pagado ?? 0), 0);
    const gastosTotal = gastosPeriodo.reduce((s, g) => s + (g.importe_base ?? 0) + (g.importe_iva ?? 0), 0);
    const repercutido = (facturas ?? [])
      .filter((f) => f.fecha_factura && f.fecha_factura >= desde && f.fecha_factura <= hasta)
      .reduce((s, f) => {
        const { totalSinIva, totalConIva } = calcularTotales(f.lineas);
        return s + (totalConIva - totalSinIva);
      }, 0);
    const deducible = gastosPeriodo.reduce((s, g) => s + (g.importe_iva ?? 0), 0);
    const resultado = ingresos - gastosTotal;
    return {
      ingresos,
      gastos: gastosTotal,
      resultado,
      margen: ingresos > 0 ? (resultado / ingresos) * 100 : null,
      ivaRepercutido: repercutido,
      ivaDeducible: deducible,
      ivaSaldo: repercutido - deducible,
    };
  }, [facturasPeriodo, gastosPeriodo, facturas, desde, hasta]);

  const evolucionMensual = useMemo(() => {
    const meses = Array.from({ length: 12 }, (_, i) => {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - (11 - i));
      return { anio: d.getFullYear(), mes: d.getMonth(), etiqueta: `${MESES[d.getMonth()]} ${String(d.getFullYear()).slice(-2)}` };
    });
    return meses.map(({ anio, mes, etiqueta }) => {
      const ingresos = (facturas ?? [])
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
      return { mes: etiqueta, ingresos, gastos: gastosMes, resultado: ingresos - gastosMes };
    });
  }, [facturas, gastos]);

  const gastosPorCategoria = useMemo(() => {
    const map = new Map<string, number>();
    for (const g of gastosPeriodo) {
      const grupo = grupoDeCuenta(g.cuenta_contable);
      const nombre = grupo?.nombre ?? 'Sin categoría';
      map.set(nombre, (map.get(nombre) ?? 0) + (g.importe_base ?? 0) + (g.importe_iva ?? 0));
    }
    return Array.from(map.entries())
      .map(([categoria, total]) => ({ categoria, total }))
      .sort((a, b) => b.total - a.total);
  }, [gastosPeriodo]);

  const porPais = useMemo(() => {
    const ingresosEs = facturasPeriodo.filter((f) => f.pais === 'España').reduce((s, f) => s + (f.monto_pagado ?? 0), 0);
    const ingresosFr = facturasPeriodo.filter((f) => f.pais === 'Francia').reduce((s, f) => s + (f.monto_pagado ?? 0), 0);
    const gastosEs = gastosPeriodo.filter((g) => g.pais === 'España').reduce((s, g) => s + (g.importe_base ?? 0) + (g.importe_iva ?? 0), 0);
    const gastosFr = gastosPeriodo.filter((g) => g.pais === 'Francia').reduce((s, g) => s + (g.importe_base ?? 0) + (g.importe_iva ?? 0), 0);
    return { ingresosEs, ingresosFr, gastosEs, gastosFr };
  }, [facturasPeriodo, gastosPeriodo]);

  const facturasEstado = useMemo(() => {
    const todas = facturas ?? [];
    const pendientes = todas.filter((f) => f.estado_cobro === 'Pendiente' || f.estado_cobro === 'Cobrada parcialmente');
    const vencidas = todas.filter((f) => f.estado_cobro === 'Vencida');
    const montoDe = (lista: Factura[]) => lista.reduce((s, f) => s + (calcularTotales(f.lineas).totalConIva - (f.monto_pagado ?? 0)), 0);
    return {
      pendientes: { count: pendientes.length, monto: montoDe(pendientes) },
      vencidas: { count: vencidas.length, monto: montoDe(vencidas) },
    };
  }, [facturas]);

  const topProveedores = useMemo(() => {
    const map = new Map<string, number>();
    for (const g of gastosPeriodo) {
      const nombre = g.proveedor ?? 'Sin proveedor';
      map.set(nombre, (map.get(nombre) ?? 0) + (g.importe_base ?? 0) + (g.importe_iva ?? 0));
    }
    return Array.from(map.entries())
      .map(([proveedor, total]) => ({ proveedor, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [gastosPeriodo]);

  const topFacturas = useMemo(() => {
    return (facturas ?? [])
      .filter((f) => f.fecha_factura && f.fecha_factura >= desde && f.fecha_factura <= hasta)
      .map((f) => ({ factura: f, total: calcularTotales(f.lineas).totalConIva }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [facturas, desde, hasta]);

  const topClientes = useMemo(() => {
    const map = new Map<string, { nombre: string; total: number }>();
    for (const f of facturas ?? []) {
      if (!f.cliente_tel) continue;
      const clave = normalizarTelefono(f.cliente_tel);
      const actual = map.get(clave) ?? { nombre: f.cliente_nombre ?? clave, total: 0 };
      actual.total += calcularTotales(f.lineas).totalConIva;
      map.set(clave, actual);
    }
    return Array.from(map.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [facturas]);

  const presupuestosResumen = useMemo(() => {
    const todos = presupuestos ?? [];
    const pendientes = todos.filter((p) => p.estado === 'Pendiente');
    const aceptadosSinFacturar = todos.filter((p) => {
      if (p.estado !== 'Aceptado') return false;
      const telAceptado = p.cliente_tel ? normalizarTelefono(p.cliente_tel) : null;
      return !(facturas ?? []).some(
        (f) => f.presupuesto_id === p.id || (telAceptado && f.cliente_tel && normalizarTelefono(f.cliente_tel) === telAceptado),
      );
    });
    const valorPendientes = pendientes.reduce((s, p) => s + calcularTotales(p.lineas).totalConIva, 0);
    const valorAceptadosSinFacturar = aceptadosSinFacturar.reduce((s, p) => s + calcularTotales(p.lineas).totalConIva, 0);
    return {
      pendientes: { count: pendientes.length, monto: valorPendientes },
      aceptadosSinFacturar: { count: aceptadosSinFacturar.length, monto: valorAceptadosSinFacturar },
    };
  }, [presupuestos, facturas]);

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

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-surface border border-gray-200 rounded-sm p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Ingresos del período</p>
          <p className="text-2xl font-semibold text-brand">{kpis.ingresos.toFixed(2)} €</p>
        </div>
        <div className="bg-surface border border-gray-200 rounded-sm p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Gastos del período</p>
          <p className="text-2xl font-semibold text-red-600">{kpis.gastos.toFixed(2)} €</p>
        </div>
        <div className="bg-surface border border-gray-200 rounded-sm p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Resultado del período</p>
          <p className={`text-2xl font-semibold ${kpis.resultado >= 0 ? 'text-brand' : 'text-red-600'}`}>
            {kpis.resultado.toFixed(2)} €
          </p>
          {kpis.margen != null && <p className="text-xs text-gray-400 mt-1">Margen: {kpis.margen.toFixed(0)}%</p>}
        </div>
        <div className="bg-surface border border-gray-200 rounded-sm p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">IVA / TVA del período</p>
          <p className={`text-2xl font-semibold ${kpis.ivaSaldo >= 0 ? 'text-red-600' : 'text-brand'}`}>
            {Math.abs(kpis.ivaSaldo).toFixed(2)} €
          </p>
          <p className="text-xs text-gray-400">{kpis.ivaSaldo >= 0 ? 'a pagar' : 'a favor'}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-surface border border-gray-200 rounded-sm p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Ingresos Francia (período)</p>
          <p className="text-2xl font-semibold text-brand">{porPais.ingresosFr.toFixed(2)} €</p>
        </div>
        <div className="bg-surface border border-gray-200 rounded-sm p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Ingresos España (período)</p>
          <p className="text-2xl font-semibold text-gray-900">{porPais.ingresosEs.toFixed(2)} €</p>
        </div>
        <div className="bg-surface border border-gray-200 rounded-sm p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Gastos Francia (período)</p>
          <p className="text-2xl font-semibold text-red-600">{porPais.gastosFr.toFixed(2)} €</p>
        </div>
        <div className="bg-surface border border-gray-200 rounded-sm p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Gastos España (período)</p>
          <p className="text-2xl font-semibold text-red-600">{porPais.gastosEs.toFixed(2)} €</p>
        </div>
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-surface border border-gray-200 rounded-sm p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 border-b border-gray-200 pb-2 mb-3">
            Gastos por categoría (PCG)
          </p>
          {gastosPorCategoria.length === 0 ? (
            <p className="text-sm text-gray-400 py-10 text-center">Sin gastos en este período</p>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(160, gastosPorCategoria.length * 32)}>
              <BarChart data={gastosPorCategoria} layout="vertical" margin={{ left: 10 }}>
                <XAxis type="number" tick={{ fontSize: 11, fill: '#6b7280' }} />
                <YAxis type="category" dataKey="categoria" width={150} tick={{ fontSize: 11, fill: '#374151' }} />
                <Tooltip formatter={(valor: unknown) => `${Number(valor).toFixed(2)} €`} contentStyle={TOOLTIP_STYLE} />
                <Bar dataKey="total" fill="#1a5c38" radius={[0, 2, 2, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-surface border border-gray-200 rounded-sm p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 border-b border-gray-200 pb-2 mb-3">
            Top 5 proveedores (gasto del período)
          </p>
          <table className="w-full border-collapse text-sm">
            <tbody>
              {topProveedores.length === 0 && (
                <tr>
                  <td className="text-center text-sm text-gray-400 py-6">Sin gastos en este período</td>
                </tr>
              )}
              {topProveedores.map((p) => (
                <tr key={p.proveedor} className="border-t border-gray-100">
                  <td className="py-1.5 text-gray-900">{p.proveedor}</td>
                  <td className="py-1.5 text-right text-gray-700">{p.total.toFixed(2)} €</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-surface border border-gray-200 rounded-sm p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 border-b border-gray-200 pb-2 mb-3">
            Top 5 facturas más grandes (período)
          </p>
          <table className="w-full border-collapse text-sm">
            <tbody>
              {topFacturas.length === 0 && (
                <tr>
                  <td className="text-center text-sm text-gray-400 py-6">Sin facturas en este período</td>
                </tr>
              )}
              {topFacturas.map(({ factura, total }) => (
                <tr key={factura.id} className="border-t border-gray-100">
                  <td className="py-1.5 text-gray-900">
                    {factura.numero} · {factura.cliente_nombre}
                  </td>
                  <td className="py-1.5 text-right text-gray-700">{total.toFixed(2)} €</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="bg-surface border border-gray-200 rounded-sm p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 border-b border-gray-200 pb-2 mb-3">
            Top 5 clientes por facturación (histórico)
          </p>
          <table className="w-full border-collapse text-sm">
            <tbody>
              {topClientes.length === 0 && (
                <tr>
                  <td className="text-center text-sm text-gray-400 py-6">Sin facturas todavía</td>
                </tr>
              )}
              {topClientes.map((c) => (
                <tr key={c.nombre} className="border-t border-gray-100">
                  <td className="py-1.5 text-gray-900">{c.nombre}</td>
                  <td className="py-1.5 text-right text-gray-700">{c.total.toFixed(2)} €</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-surface border border-gray-200 rounded-sm p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 border-b border-gray-200 pb-2 mb-3">
            Resultado por país — período
          </p>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-gray-400">Resultado Francia</p>
              <p className={`font-medium ${porPais.ingresosFr - porPais.gastosFr >= 0 ? 'text-brand' : 'text-red-600'}`}>
                {(porPais.ingresosFr - porPais.gastosFr).toFixed(2)} €
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Resultado España</p>
              <p className={`font-medium ${porPais.ingresosEs - porPais.gastosEs >= 0 ? 'text-brand' : 'text-red-600'}`}>
                {(porPais.ingresosEs - porPais.gastosEs).toFixed(2)} €
              </p>
            </div>
          </div>
        </div>

        <div className="bg-surface border border-gray-200 rounded-sm p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 border-b border-gray-200 pb-2 mb-3">
            Cobros pendientes (todas las facturas)
          </p>
          <div className="flex flex-col gap-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Pendientes ({facturasEstado.pendientes.count})</span>
              <span className="text-amber-600 font-medium">{facturasEstado.pendientes.monto.toFixed(2)} €</span>
            </div>
            <div className="flex justify-between border-t border-gray-100 pt-1.5">
              <span className="text-gray-500">Vencidas ({facturasEstado.vencidas.count})</span>
              <span className="text-red-600 font-medium">{facturasEstado.vencidas.monto.toFixed(2)} €</span>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-surface border border-gray-200 rounded-sm p-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 border-b border-gray-200 pb-2 mb-3">
          Presupuestos (todos, sin filtrar por período)
        </p>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-gray-400">Pendientes de respuesta ({presupuestosResumen.pendientes.count})</p>
            <p className="text-gray-900 font-medium">{presupuestosResumen.pendientes.monto.toFixed(2)} €</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Aceptados sin facturar ({presupuestosResumen.aceptadosSinFacturar.count})</p>
            <p className="text-gray-900 font-medium">{presupuestosResumen.aceptadosSinFacturar.monto.toFixed(2)} €</p>
          </div>
        </div>
      </div>
    </div>
  );
}
