import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Funnel,
  FunnelChart,
  LabelList,
  Legend,
  Pie,
  PieChart,
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
import { ETAPAS_PIPELINE } from '../clientes/types';
import type { Visita } from '../visitas/types';
import type { Presupuesto } from '../finanzas/presupuestos/types';
import type { Factura } from '../finanzas/facturas/types';
import type { Gasto } from '../finanzas/gastos/types';

type NotaAceptado = { visita_id: string; created_at: string };
type ProyectoResumen = { presupuesto_id: string | null; estado: string };

const COLORES_DONUT = ['#1a5c38', '#0f3d24', '#5b8f74', '#94b8a6', '#c8ddd0', '#6b7280', '#9ca3af'];
const COLORES_FUNNEL = ['#1a5c38', '#3d7a5a', '#5f9878', '#94b8a6'];
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const ETAPAS_FUNNEL = ['Visita realizada', 'Presupuesto enviado', 'Presupuesto aceptado', 'Finalizado'];

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

export default function DashboardPage() {
  const [periodo, setPeriodo] = useState('anio');
  const [desdeCustom, setDesdeCustom] = useState(iso(new Date(anioActual, 0, 1)));
  const [hastaCustom, setHastaCustom] = useState(iso(new Date()));
  const [zona, setZona] = useState('Todas');

  const { desde, hasta } = useMemo(() => rangoPeriodo(periodo, desdeCustom, hastaCustom), [periodo, desdeCustom, hastaCustom]);

  const { data: visitas } = useQuery({
    queryKey: ['visitas'],
    queryFn: async () => {
      const { data, error } = await supabase.from('visitas').select('*').is('eliminado_en', null);
      if (error) throw error;
      return data as Visita[];
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

  const { data: notasAceptado } = useQuery({
    queryKey: ['notas_cliente', 'aceptados'],
    queryFn: async () => {
      const { data, error } = await supabase.from('notas_cliente').select('visita_id, created_at').ilike('texto', '%marcado como Aceptado%');
      if (error) throw error;
      return data as NotaAceptado[];
    },
  });

  const { data: proyectos } = useQuery({
    queryKey: ['proyectos', 'todos'],
    queryFn: async () => {
      const { data, error } = await supabase.from('proyectos').select('presupuesto_id, estado');
      if (error) throw error;
      return data as ProyectoResumen[];
    },
  });

  const zonasDisponibles = useMemo(() => {
    const set = new Set((visitas ?? []).map((v) => v.zona).filter((z): z is string => !!z));
    return ['Todas', 'España', 'Francia', ...Array.from(set).sort()];
  }, [visitas]);

  const visitaPorId = useMemo(() => {
    const map = new Map<string, Visita>();
    for (const v of visitas ?? []) map.set(v.id, v);
    return map;
  }, [visitas]);

  const coincideZonaRegistro = (pais: string | null, visitaId: string | null) => {
    if (zona === 'Todas') return true;
    if (zona === 'España' || zona === 'Francia') return pais === zona;
    const zonaVisita = visitaId ? (visitaPorId.get(visitaId)?.zona ?? null) : null;
    return zonaVisita === zona;
  };

  const visitasFiltradas = useMemo(() => {
    return (visitas ?? []).filter((v) => {
      if (v.fecha_visita && (v.fecha_visita < desde || v.fecha_visita > hasta)) return false;
      if (zona === 'España' || zona === 'Francia') return v.pais === zona;
      if (zona !== 'Todas') return v.zona === zona;
      return true;
    });
  }, [visitas, desde, hasta, zona]);

  const presupuestosFiltrados = useMemo(() => {
    return (presupuestos ?? []).filter((p) => {
      if (p.fecha_emision && (p.fecha_emision < desde || p.fecha_emision > hasta)) return false;
      return coincideZonaRegistro(p.pais, p.visita_id);
    });
  }, [presupuestos, desde, hasta, zona, visitaPorId]);

  const facturasFiltradas = useMemo(() => {
    return (facturas ?? []).filter((f) => {
      if (f.fecha_factura && (f.fecha_factura < desde || f.fecha_factura > hasta)) return false;
      return coincideZonaRegistro(f.pais, f.visita_id);
    });
  }, [facturas, desde, hasta, zona, visitaPorId]);

  const gastosFiltrados = useMemo(() => {
    return (gastos ?? []).filter((g) => {
      if (g.fecha && (g.fecha < desde || g.fecha > hasta)) return false;
      return coincideZonaRegistro(g.pais, g.visita_id);
    });
  }, [gastos, desde, hasta, zona, visitaPorId]);

  // 1. Origen de clientes
  const origenClientes = useMemo(() => {
    const conteo = new Map<string, number>();
    for (const v of visitasFiltradas) {
      const key = v.contacto ?? 'Otro';
      conteo.set(key, (conteo.get(key) ?? 0) + 1);
    }
    return Array.from(conteo.entries()).map(([nombre, valor]) => ({ nombre, valor }));
  }, [visitasFiltradas]);

  // 2. Tasa de conversión (funnel)
  const funnel = useMemo(() => {
    const etapas = ETAPAS_PIPELINE as readonly string[];
    const base = ETAPAS_FUNNEL.map((etapa) => {
      const idxEtapa = etapas.indexOf(etapa);
      const count = visitasFiltradas.filter((v) => etapas.indexOf(v.estado_pipeline) >= idxEtapa).length;
      return { etapa, count };
    });
    const total = base[0]?.count ?? 0;
    return base.map((f) => ({ ...f, pct: total > 0 ? Math.round((f.count / total) * 100) : 0 }));
  }, [visitasFiltradas]);

  // 3. Facturación por zona
  const facturacionPorZona = useMemo(() => {
    const map = new Map<string, { total: number; obras: Set<string> }>();
    for (const f of facturasFiltradas) {
      const z = (f.visita_id ? visitaPorId.get(f.visita_id)?.zona : null) ?? 'Sin zona';
      const actual = map.get(z) ?? { total: 0, obras: new Set<string>() };
      actual.total += calcularTotales(f.lineas).totalConIva;
      if (f.visita_id) actual.obras.add(f.visita_id);
      map.set(z, actual);
    }
    return Array.from(map.entries())
      .map(([zonaNombre, v]) => ({ zona: zonaNombre, total: v.total, obras: v.obras.size }))
      .sort((a, b) => b.total - a.total);
  }, [facturasFiltradas, visitaPorId]);

  // 4. Tipo de obra más rentable
  const rentabilidadPorTipo = useMemo(() => {
    const map = new Map<string, { totalPresupuestos: number; obras: Set<string> }>();
    for (const p of presupuestosFiltrados) {
      if (p.estado !== 'Aceptado' || !p.visita_id) continue;
      const tipo = visitaPorId.get(p.visita_id)?.tipo ?? 'Otro';
      const actual = map.get(tipo) ?? { totalPresupuestos: 0, obras: new Set<string>() };
      actual.totalPresupuestos += calcularTotales(p.lineas).totalConIva;
      actual.obras.add(p.visita_id);
      map.set(tipo, actual);
    }
    return Array.from(map.entries())
      .map(([tipo, v]) => {
        const gastosTipo = gastosFiltrados
          .filter((g) => g.visita_id && v.obras.has(g.visita_id))
          .reduce((s, g) => s + (g.importe_base ?? 0) + (g.importe_iva ?? 0), 0);
        const nObras = v.obras.size;
        return {
          tipo,
          nObras,
          facturacionMedia: nObras > 0 ? v.totalPresupuestos / nObras : 0,
          margenMedio: nObras > 0 ? (v.totalPresupuestos - gastosTipo) / nObras : 0,
        };
      })
      .sort((a, b) => b.margenMedio - a.margenMedio);
  }, [presupuestosFiltrados, gastosFiltrados, visitaPorId]);

  // 5. Tiempo medio de cierre
  const tiempoCierre = useMemo(() => {
    const idsFiltrados = new Set(visitasFiltradas.map((v) => v.id));
    const registros = (notasAceptado ?? [])
      .filter((n) => idsFiltrados.has(n.visita_id))
      .map((n) => {
        const v = visitaPorId.get(n.visita_id);
        if (!v || !v.fecha_visita) return null;
        const dias = Math.round((new Date(n.created_at).getTime() - new Date(`${v.fecha_visita}T00:00:00`).getTime()) / 86_400_000);
        return dias >= 0 ? { tipo: v.tipo ?? 'Otro', dias } : null;
      })
      .filter((r): r is { tipo: string; dias: number } => r !== null);

    const media = registros.length > 0 ? registros.reduce((s, r) => s + r.dias, 0) / registros.length : null;

    const porTipo = new Map<string, number[]>();
    for (const r of registros) porTipo.set(r.tipo, [...(porTipo.get(r.tipo) ?? []), r.dias]);

    return {
      media,
      n: registros.length,
      porTipo: Array.from(porTipo.entries()).map(([tipo, dias]) => ({
        tipo,
        media: dias.reduce((s, d) => s + d, 0) / dias.length,
      })),
    };
  }, [notasAceptado, visitaPorId, visitasFiltradas]);

  // 6. Previsión de tesorería
  const tesoreria = useMemo(() => {
    const facturasZona = (facturas ?? []).filter((f) => coincideZonaRegistro(f.pais, f.visita_id));
    const presupuestosZona = (presupuestos ?? []).filter((p) => coincideZonaRegistro(p.pais, p.visita_id));

    const pendienteCobro = facturasZona
      .filter((f) => f.estado_cobro !== 'Cobrada')
      .reduce((s, f) => s + (calcularTotales(f.lineas).totalConIva - (f.monto_pagado ?? 0)), 0);

    const idsPresupuestoEnCurso = new Set((proyectos ?? []).filter((p) => p.estado === 'En curso').map((p) => p.presupuesto_id));
    const obrasEnCurso = presupuestosZona
      .filter((p) => idsPresupuestoEnCurso.has(p.id))
      .reduce((s, p) => s + calcularTotales(p.lineas).totalConIva, 0);

    const hayVencidas = facturasZona.some((f) => f.estado_cobro === 'Vencida');

    return { pendienteCobro, obrasEnCurso, total: pendienteCobro + obrasEnCurso, hayVencidas };
  }, [facturas, presupuestos, proyectos, zona, visitaPorId]);

  // 7. Comparativa anual
  const comparativaAnual = useMemo(() => {
    const porMes = (anio: number) => {
      const meses = Array(12).fill(0);
      for (const f of facturas ?? []) {
        if (!f.fecha_pago || f.monto_pagado == null) continue;
        if (!coincideZonaRegistro(f.pais, f.visita_id)) continue;
        const d = new Date(`${f.fecha_pago}T00:00:00`);
        if (d.getFullYear() === anio) meses[d.getMonth()] += f.monto_pagado;
      }
      return meses;
    };
    const esteAnio = porMes(anioActual);
    const anioAnterior = porMes(anioActual - 1);
    return MESES.map((mes, i) => ({
      mes,
      [String(anioActual)]: Math.round(esteAnio[i] * 100) / 100,
      [String(anioActual - 1)]: Math.round(anioAnterior[i] * 100) / 100,
    }));
  }, [facturas, zona, visitaPorId]);

  // 8. Visitas conseguidas por semana
  const visitasPorSemana = useMemo(() => {
    const coincideZonaVisita = (v: Visita) => {
      if (zona === 'Todas') return true;
      if (zona === 'España' || zona === 'Francia') return v.pais === zona;
      return v.zona === zona;
    };

    const lunesActual = new Date();
    lunesActual.setDate(lunesActual.getDate() - ((lunesActual.getDay() + 6) % 7));
    lunesActual.setHours(0, 0, 0, 0);

    const semanas = Array.from({ length: 12 }, (_, i) => {
      const inicio = new Date(lunesActual);
      inicio.setDate(lunesActual.getDate() - (11 - i) * 7);
      const fin = new Date(inicio);
      fin.setDate(inicio.getDate() + 6);
      return { inicio, fin, etiqueta: `${inicio.getDate()}/${inicio.getMonth() + 1}` };
    });

    return semanas.map(({ inicio, fin, etiqueta }) => {
      const inicioISO = iso(inicio);
      const finISO = iso(fin);
      const count = (visitas ?? []).filter(
        (v) => v.fecha_visita && v.fecha_visita >= inicioISO && v.fecha_visita <= finISO && coincideZonaVisita(v),
      ).length;
      return { semana: etiqueta, visitas: count };
    });
  }, [visitas, zona]);

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
        <Select
          label="Zona"
          options={zonasDisponibles.map((z) => ({ value: z, label: z }))}
          value={zona}
          onChange={(e) => setZona(e.target.value)}
          className="w-48"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-surface border border-gray-200 rounded-sm p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 border-b border-gray-200 pb-2 mb-3">
            Origen de clientes
          </p>
          {origenClientes.length === 0 ? (
            <p className="text-sm text-gray-400 py-10 text-center">Sin datos en este período</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={origenClientes} dataKey="valor" nameKey="nombre" innerRadius={45} outerRadius={80} paddingAngle={2}>
                  {origenClientes.map((_, i) => (
                    <Cell key={i} fill={COLORES_DONUT[i % COLORES_DONUT.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-surface border border-gray-200 rounded-sm p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 border-b border-gray-200 pb-2 mb-3">
            Tasa de conversión
          </p>
          {funnel[0].count === 0 ? (
            <p className="text-sm text-gray-400 py-10 text-center">Sin datos en este período</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <FunnelChart margin={{ left: 90, right: 40 }}>
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Funnel dataKey="count" data={funnel} isAnimationActive nameKey="etapa">
                    <LabelList position="left" dataKey="etapa" fill="#374151" stroke="none" fontSize={11} />
                    <LabelList position="right" dataKey="count" fill="#374151" stroke="none" fontSize={11} fontWeight={600} />
                    <LabelList
                      position="center"
                      dataKey="pct"
                      fill="#fff"
                      stroke="none"
                      fontSize={12}
                      fontWeight={600}
                      formatter={(v) => `${v}%`}
                    />
                    {funnel.map((_, i) => (
                      <Cell key={i} fill={COLORES_FUNNEL[i % COLORES_FUNNEL.length]} />
                    ))}
                  </Funnel>
                </FunnelChart>
              </ResponsiveContainer>
              <div className="flex items-center justify-center gap-4 mt-1">
                {funnel.slice(1).map((f, i) => {
                  const anterior = funnel[i].count;
                  const pct = anterior > 0 ? Math.round((f.count / anterior) * 100) : 0;
                  return (
                    <span key={f.etapa} className="text-xs text-gray-500">
                      → <span className="font-semibold text-gray-800">{pct}%</span>
                    </span>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-surface border border-gray-200 rounded-sm p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 border-b border-gray-200 pb-2 mb-3">
            Facturación por zona
          </p>
          {facturacionPorZona.length === 0 ? (
            <p className="text-sm text-gray-400 py-10 text-center">Sin datos en este período</p>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(160, facturacionPorZona.length * 34)}>
              <BarChart data={facturacionPorZona} layout="vertical" margin={{ left: 10 }}>
                <XAxis type="number" tick={{ fontSize: 11, fill: '#6b7280' }} />
                <YAxis type="category" dataKey="zona" width={110} tick={{ fontSize: 11, fill: '#374151' }} />
                <Tooltip formatter={(valor: unknown) => `${Number(valor).toFixed(2)} €`} contentStyle={TOOLTIP_STYLE} />
                <Bar dataKey="total" name="Facturado" fill="#1a5c38" radius={[0, 2, 2, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-surface border border-gray-200 rounded-sm p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 border-b border-gray-200 pb-2 mb-3">
            Tipo de obra más rentable
          </p>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-xs text-gray-400">
                <th className="text-left py-1 font-medium">Tipo</th>
                <th className="text-right py-1 font-medium">Nº obras</th>
                <th className="text-right py-1 font-medium">Facturación media</th>
                <th className="text-right py-1 font-medium">Margen medio</th>
              </tr>
            </thead>
            <tbody>
              {rentabilidadPorTipo.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-center text-sm text-gray-400 py-6">
                    Sin presupuestos aceptados en este período
                  </td>
                </tr>
              )}
              {rentabilidadPorTipo.map((r) => (
                <tr key={r.tipo} className="border-t border-gray-100">
                  <td className="py-1.5 text-gray-900">{r.tipo}</td>
                  <td className="py-1.5 text-right text-gray-600">{r.nObras}</td>
                  <td className="py-1.5 text-right text-gray-600">{r.facturacionMedia.toFixed(2)} €</td>
                  <td className={`py-1.5 text-right font-medium ${r.margenMedio >= 0 ? 'text-brand' : 'text-red-600'}`}>
                    {r.margenMedio.toFixed(2)} €
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-surface border border-gray-200 rounded-sm p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 border-b border-gray-200 pb-2 mb-3">
            Tiempo medio de cierre
          </p>
          {tiempoCierre.media == null ? (
            <p className="text-sm text-gray-400 py-6 text-center">Sin presupuestos aceptados registrados todavía</p>
          ) : (
            <>
              <p className="text-2xl font-semibold text-gray-900">
                {tiempoCierre.media.toFixed(1)} <span className="text-sm font-normal text-gray-500">días de media</span>
              </p>
              <p className="text-xs text-gray-400 mb-3">basado en {tiempoCierre.n} presupuesto(s) aceptado(s)</p>
              <div className="flex flex-col gap-1">
                {tiempoCierre.porTipo.map((t) => (
                  <div key={t.tipo} className="flex justify-between text-xs">
                    <span className="text-gray-600">{t.tipo}</span>
                    <span className="text-gray-800 font-medium">{t.media.toFixed(1)} días</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className={`border rounded-sm p-4 ${tesoreria.hayVencidas ? 'bg-amber-50 border-amber-200' : 'bg-surface border-gray-200'}`}>
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 border-b border-gray-200 pb-2 mb-3">
            Previsión de tesorería · próximo mes
          </p>
          <p className="text-2xl font-semibold text-gray-900 mb-2">{tesoreria.total.toFixed(2)} €</p>
          <div className="flex flex-col gap-1 text-xs text-gray-600">
            <div className="flex justify-between">
              <span>Facturas pendientes de cobro</span>
              <span>{tesoreria.pendienteCobro.toFixed(2)} €</span>
            </div>
            <div className="flex justify-between">
              <span>Obras en curso (presupuesto aceptado)</span>
              <span>{tesoreria.obrasEnCurso.toFixed(2)} €</span>
            </div>
          </div>
          {tesoreria.hayVencidas && <p className="text-xs text-amber-700 font-medium mt-2">Hay facturas vencidas pendientes de cobro</p>}
        </div>
      </div>

      <div className="bg-surface border border-gray-200 rounded-sm p-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 border-b border-gray-200 pb-2 mb-3">
          Comparativa anual · {anioActual - 1} vs {anioActual}
        </p>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={comparativaAnual}>
            <CartesianGrid stroke="#e5e7eb" vertical={false} />
            <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={{ stroke: '#e5e7eb' }} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} width={55} />
            <Tooltip formatter={(valor: unknown) => `${Number(valor).toFixed(2)} €`} contentStyle={TOOLTIP_STYLE} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey={String(anioActual - 1)} name={String(anioActual - 1)} fill="#9ca3af" radius={[2, 2, 0, 0]} />
            <Bar dataKey={String(anioActual)} name={String(anioActual)} fill="#1a5c38" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-surface border border-gray-200 rounded-sm p-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 border-b border-gray-200 pb-2 mb-3">
          Visitas conseguidas por semana (últimas 12 semanas)
        </p>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={visitasPorSemana}>
            <CartesianGrid stroke="#e5e7eb" vertical={false} />
            <XAxis dataKey="semana" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={{ stroke: '#e5e7eb' }} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} width={40} allowDecimals={false} />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Bar dataKey="visitas" name="Visitas" fill="#1a5c38" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
