import { Fragment, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { KpiRow } from '../../components/ui/Kpi';
import { BotonExportar } from '../../components/ui/BotonExportar';
import { porcentajeIva } from '../finanzas/iva';

type FacturaCobrada = {
  numero: string | null;
  cliente_nombre: string | null;
  fecha_pago: string | null;
  monto_pagado: number | null;
  tipo_iva: string | null;
};

type GastoFila = {
  fecha: string | null;
  categoria: string | null;
  proveedor: string | null;
  importe_base: number | null;
};

type DesgloseItem = { etiqueta: string; importe: number; n: number };

type FilaMes = {
  mes: string;
  ingresos: number;
  gastos: number;
  resultado: number;
  ingresosPorCliente: DesgloseItem[];
  gastosPorCategoria: DesgloseItem[];
};

function nombreMes(mesISO: string) {
  const [anio, mes] = mesISO.split('-');
  const nombres = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
  ];
  return `${nombres[Number(mes) - 1]} ${anio}`;
}

export default function ResultadoPage() {
  const { data: facturas, isLoading: cargandoFacturas } = useQuery({
    queryKey: ['facturas', 'cobradas'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('facturas')
        .select('numero, cliente_nombre, fecha_pago, monto_pagado, tipo_iva')
        .is('eliminado_en', null)
        .not('monto_pagado', 'is', null);
      if (error) throw error;
      return data as FacturaCobrada[];
    },
  });

  const { data: gastos, isLoading: cargandoGastos } = useQuery({
    queryKey: ['gastos', 'resultado'],
    queryFn: async () => {
      const { data, error } = await supabase.from('gastos').select('fecha, categoria, proveedor, importe_base');
      if (error) throw error;
      return data as GastoFila[];
    },
  });

  const filas = useMemo<FilaMes[]>(() => {
    type Acumulado = { ingresos: number; gastos: number; porCliente: Map<string, DesgloseItem>; porCategoria: Map<string, DesgloseItem> };
    const porMes = new Map<string, Acumulado>();

    const obtenerMes = (mes: string): Acumulado => {
      const existente = porMes.get(mes);
      if (existente) return existente;
      const nuevo: Acumulado = { ingresos: 0, gastos: 0, porCliente: new Map(), porCategoria: new Map() };
      porMes.set(mes, nuevo);
      return nuevo;
    };

    for (const f of facturas ?? []) {
      if (!f.fecha_pago) continue;
      const mes = f.fecha_pago.slice(0, 7);
      const pct = porcentajeIva(f.tipo_iva);
      const conIva = f.monto_pagado ?? 0;
      const sinIva = pct > 0 ? conIva / (1 + pct / 100) : conIva;
      const actual = obtenerMes(mes);
      actual.ingresos += sinIva;
      const clave = f.cliente_nombre ?? 'Sin cliente';
      const item = actual.porCliente.get(clave) ?? { etiqueta: clave, importe: 0, n: 0 };
      item.importe += sinIva;
      item.n += 1;
      actual.porCliente.set(clave, item);
    }

    for (const g of gastos ?? []) {
      if (!g.fecha) continue;
      const mes = g.fecha.slice(0, 7);
      const actual = obtenerMes(mes);
      const importe = g.importe_base ?? 0;
      actual.gastos += importe;
      const clave = g.categoria ?? g.proveedor ?? 'Sin categoría';
      const item = actual.porCategoria.get(clave) ?? { etiqueta: clave, importe: 0, n: 0 };
      item.importe += importe;
      item.n += 1;
      actual.porCategoria.set(clave, item);
    }

    return Array.from(porMes.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([mes, v]) => ({
        mes,
        ingresos: v.ingresos,
        gastos: v.gastos,
        resultado: v.ingresos - v.gastos,
        ingresosPorCliente: Array.from(v.porCliente.values()).sort((a, b) => b.importe - a.importe),
        gastosPorCategoria: Array.from(v.porCategoria.values()).sort((a, b) => b.importe - a.importe),
      }));
  }, [facturas, gastos]);

  const [mesesExpandidos, setMesesExpandidos] = useState<Set<string>>(new Set());

  const toggleMes = (mes: string) => {
    setMesesExpandidos((actual) => {
      const siguiente = new Set(actual);
      if (siguiente.has(mes)) siguiente.delete(mes);
      else siguiente.add(mes);
      return siguiente;
    });
  };

  const totales = useMemo(() => {
    const ingresos = filas.reduce((s, f) => s + f.ingresos, 0);
    const gastosTotal = filas.reduce((s, f) => s + f.gastos, 0);
    return { ingresos, gastos: gastosTotal, resultado: ingresos - gastosTotal };
  }, [filas]);

  const kpis = [
    { label: 'Ingresos totales (sin IVA)', valor: `${totales.ingresos.toFixed(0)} €` },
    { label: 'Gastos totales (sin IVA)', valor: `${totales.gastos.toFixed(0)} €` },
    {
      label: 'Resultado total',
      valor: `${totales.resultado.toFixed(0)} €`,
      acento: totales.resultado >= 0,
    },
  ];

  if (cargandoFacturas || cargandoGastos) {
    return <div className="h-96 bg-surface border border-gray-200 rounded-sm animate-pulse" />;
  }

  return (
    <div>
      <div className="flex justify-end mb-4">
        <BotonExportar
          nombreArchivo="resultado.csv"
          filas={[...filas, { mes: 'TOTAL', ingresos: totales.ingresos, gastos: totales.gastos, resultado: totales.resultado }]}
          columnas={[
            { key: 'mes', label: 'Mes', valor: (f) => (f.mes === 'TOTAL' ? 'TOTAL' : nombreMes(f.mes)) },
            { key: 'ingresos', label: 'Ingresos (sin IVA)', valor: (f) => f.ingresos.toFixed(2) },
            { key: 'gastos', label: 'Gastos (sin IVA)', valor: (f) => f.gastos.toFixed(2) },
            { key: 'resultado', label: 'Resultado', valor: (f) => f.resultado.toFixed(2) },
          ]}
        />
      </div>

      <KpiRow items={kpis} />

      <div className="bg-surface border border-gray-200 rounded-sm overflow-x-auto">
        <table className="w-full border-collapse min-w-[560px]">
          <thead>
            <tr className="bg-brand text-white text-xs uppercase tracking-wide">
              <th className="text-left px-3 py-2 font-medium w-8"></th>
              <th className="text-left px-3 py-2 font-medium">Mes</th>
              <th className="text-right px-3 py-2 font-medium">Ingresos (sin IVA)</th>
              <th className="text-right px-3 py-2 font-medium">Gastos (sin IVA)</th>
              <th className="text-right px-3 py-2 font-medium">Resultado</th>
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center text-sm text-gray-400 py-6">
                  Sin datos todavía
                </td>
              </tr>
            )}
            {filas.map((f) => {
              const expandido = mesesExpandidos.has(f.mes);
              return (
                <Fragment key={f.mes}>
                  <tr
                    onClick={() => toggleMes(f.mes)}
                    className="odd:bg-gray-50 text-sm cursor-pointer hover:bg-brand-light"
                  >
                    <td className="px-3 py-2 text-gray-400">
                      {expandido ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </td>
                    <td className="px-3 py-2 text-gray-900">{nombreMes(f.mes)}</td>
                    <td className="px-3 py-2 text-right text-gray-700">{f.ingresos.toFixed(2)} €</td>
                    <td className="px-3 py-2 text-right text-gray-700">{f.gastos.toFixed(2)} €</td>
                    <td className={`px-3 py-2 text-right font-medium ${f.resultado >= 0 ? 'text-brand' : 'text-red-600'}`}>
                      {f.resultado.toFixed(2)} €
                    </td>
                  </tr>
                  {expandido && (
                    <tr key={`${f.mes}-detalle`}>
                      <td></td>
                      <td colSpan={4} className="px-3 pb-4 pt-1 bg-gray-50">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">
                              Ingresos por cliente
                            </p>
                            {f.ingresosPorCliente.length === 0 ? (
                              <p className="text-xs text-gray-400">Sin ingresos este mes</p>
                            ) : (
                              <div className="flex flex-col gap-1">
                                {f.ingresosPorCliente.map((item) => (
                                  <div key={item.etiqueta} className="flex justify-between text-xs">
                                    <span className="text-gray-600 truncate">
                                      {item.etiqueta} <span className="text-gray-400">({item.n})</span>
                                    </span>
                                    <span className="text-gray-900 font-medium shrink-0 ml-2">{item.importe.toFixed(2)} €</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">
                              Gastos por categoría
                            </p>
                            {f.gastosPorCategoria.length === 0 ? (
                              <p className="text-xs text-gray-400">Sin gastos este mes</p>
                            ) : (
                              <div className="flex flex-col gap-1">
                                {f.gastosPorCategoria.map((item) => (
                                  <div key={item.etiqueta} className="flex justify-between text-xs">
                                    <span className="text-gray-600 truncate">
                                      {item.etiqueta} <span className="text-gray-400">({item.n})</span>
                                    </span>
                                    <span className="text-gray-900 font-medium shrink-0 ml-2">{item.importe.toFixed(2)} €</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
          {filas.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-gray-200 text-sm font-semibold">
                <td></td>
                <td className="px-3 py-2 text-gray-900">Total</td>
                <td className="px-3 py-2 text-right text-gray-900">{totales.ingresos.toFixed(2)} €</td>
                <td className="px-3 py-2 text-right text-gray-900">{totales.gastos.toFixed(2)} €</td>
                <td className={`px-3 py-2 text-right ${totales.resultado >= 0 ? 'text-brand' : 'text-red-600'}`}>
                  {totales.resultado.toFixed(2)} €
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
