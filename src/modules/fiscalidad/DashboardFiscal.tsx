import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AlertTriangle, CalendarClock, Landmark, PiggyBank } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { TOOLTIP_STYLE } from '../../lib/chartStyles';
import { calcularTotales } from '../finanzas/lineas';
import type { Factura } from '../finanzas/facturas/types';
import type { Gasto } from '../finanzas/gastos/types';
import { useFiscalConfig } from './useFiscalConfig';
import { useGerantConfig } from './useGerantConfig';
import { useResultadoEjercicio } from './useResultadoEjercicio';
import { useEvolucionAcumulada } from './useEvolucionAcumulada';
import { useEcheances } from './useEcheances';
import { calcularIS, calcularTNS, limitesEjercicio, mesesTranscurridosEjercicio } from './calculos';
import { Faq } from './Faq';

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function fmt(n: number) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n);
}

function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function diasRestantes(fecha: string) {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const limite = new Date(`${fecha}T00:00:00`);
  return Math.round((limite.getTime() - hoy.getTime()) / 86_400_000);
}

export function DashboardFiscal() {
  const anioActual = new Date().getFullYear();
  const ejercicio = limitesEjercicio(anioActual);
  const { config } = useFiscalConfig();
  const { gerantConfig } = useGerantConfig();
  const { beneficioBruto } = useResultadoEjercicio(ejercicio.inicio, ejercicio.fin);
  const { echeances } = useEcheances();

  const remuneracionAnual = gerantConfig?.remuneracion_anual ?? 0;
  // Prorrateado por meses transcurridos, no por la duración total del ejercicio — ver comentario
  // en TabIS.tsx (bug real corregido 2026-08-11).
  const mesesTranscurridos = useMemo(() => mesesTranscurridosEjercicio(ejercicio), [ejercicio]);
  const remuneracionPeriodo = remuneracionAnual * (mesesTranscurridos / 12);
  const cotisacionesPeriodo = calcularTNS(remuneracionAnual, config).total * (mesesTranscurridos / 12);
  const beneficioNeto = Math.max(0, beneficioBruto - remuneracionPeriodo - cotisacionesPeriodo);
  const is = calcularIS(beneficioNeto, ejercicio.meses, config);
  const progresoTramo = is.plafondReducido > 0 ? Math.min(100, (is.baseReducida / is.plafondReducido) * 100) : 0;
  const evolucionAcumulada = useEvolucionAcumulada(anioActual, ejercicio, remuneracionAnual, config);

  const hoyDate = new Date();
  const inicioMes = iso(new Date(hoyDate.getFullYear(), hoyDate.getMonth(), 1));
  const finMes = iso(new Date(hoyDate.getFullYear(), hoyDate.getMonth() + 1, 0));

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

  const tvaMes = useMemo(() => {
    const facturasMes = (facturas ?? []).filter(
      (f) => f.pais === 'Francia' && f.fecha_factura && f.fecha_factura >= inicioMes && f.fecha_factura <= finMes,
    );
    const gastosMes = (gastos ?? []).filter(
      (g) => g.pais === 'Francia' && g.fecha && g.fecha >= inicioMes && g.fecha <= finMes,
    );
    const collectee = facturasMes.reduce((s, f) => {
      const { totalSinIva, totalConIva } = calcularTotales(f.lineas);
      return s + (totalConIva - totalSinIva);
    }, 0);
    const deductible = gastosMes.reduce((s, g) => s + (g.importe_iva ?? 0), 0);
    return { collectee, deductible, saldo: collectee - deductible };
  }, [facturas, gastos, inicioMes, finMes]);

  const proximaCA3 = (echeances ?? []).find((e) => e.tipo === 'CA3' && !e.completada);

  const proximasEcheances = useMemo(
    () =>
      (echeances ?? [])
        .filter((e) => !e.completada)
        .map((e) => ({ ...e, dias: diasRestantes(e.fecha_limite) }))
        .filter((e) => e.dias >= 0)
        .sort((a, b) => a.dias - b.dias)
        .slice(0, 3),
    [echeances],
  );

  const evolucionAnual = useMemo(() => {
    return Array.from({ length: 12 }, (_, mes) => {
      const desde = iso(new Date(anioActual, mes, 1));
      const hasta = iso(new Date(anioActual, mes + 1, 0));
      const ingresosMes = (facturas ?? [])
        .filter((f) => f.pais === 'Francia' && f.fecha_factura && f.fecha_factura >= desde && f.fecha_factura <= hasta)
        .reduce((s, f) => s + calcularTotales(f.lineas).totalSinIva, 0);
      const gastosMesHT = (gastos ?? [])
        .filter((g) => g.pais === 'Francia' && g.fecha && g.fecha >= desde && g.fecha <= hasta)
        .reduce((s, g) => s + (g.importe_base ?? 0), 0);
      const beneficioMes = Math.max(0, ingresosMes - gastosMesHT);
      const cargaFiscal = calcularIS(beneficioMes, 1, config).total;
      return { mes: MESES[mes], ingresos: ingresosMes, gastos: gastosMesHT, cargaFiscal };
    });
  }, [facturas, gastos, anioActual, config]);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-gray-500 leading-relaxed">
        Vista general del ejercicio {anioActual} ({limitesEjercicio(anioActual).meses} meses): las cifras se calculan en vivo a
        partir de tus Facturas y Gastos, y de la rémunération del gérant configurada en "Cotisations URSSAF". Cada pestaña de
        arriba explica su cálculo en detalle, con la fuente oficial y un apartado de preguntas frecuentes.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-surface border border-gray-200 rounded-sm p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2 flex items-center gap-1.5">
            <Landmark size={13} className="text-brand" /> IS del ejercicio {anioActual}
          </p>
          <p className="text-2xl font-semibold text-brand">{fmt(is.total)}</p>
          <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-brand" style={{ width: `${progresoTramo}%` }} />
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Tramo 15% hasta {fmt(is.plafondReducido)} · exceso al 25%
          </p>
        </div>

        <div className="bg-surface border border-gray-200 rounded-sm p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">TVA del mes</p>
          <p className={`text-2xl font-semibold ${tvaMes.saldo >= 0 ? 'text-red-600' : 'text-brand'}`}>
            {fmt(Math.abs(tvaMes.saldo))}
          </p>
          <p className="text-xs text-gray-400">{tvaMes.saldo >= 0 ? 'a pagar' : 'crédito a favor'}</p>
          {proximaCA3 && (
            <p className="text-xs text-gray-500 mt-1">
              Próxima CA3: {new Date(`${proximaCA3.fecha_limite}T00:00:00`).toLocaleDateString('es', { day: '2-digit', month: 'short' })}
            </p>
          )}
        </div>

        <div className="bg-surface border border-gray-200 rounded-sm p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2 flex items-center gap-1.5">
            <PiggyBank size={13} className="text-brand" /> Cotisations URSSAF
          </p>
          <p className="text-2xl font-semibold text-gray-900">{fmt(cotisacionesPeriodo)}</p>
          <p className="text-xs text-gray-400">estimado del ejercicio · {fmt(cotisacionesPeriodo / ejercicio.meses)}/mes</p>
        </div>

        <div className="bg-surface border border-gray-200 rounded-sm p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2 flex items-center gap-1.5">
            <CalendarClock size={13} className="text-brand" /> Próximas échéances
          </p>
          {proximasEcheances.length === 0 ? (
            <p className="text-xs text-gray-400">Sin échéances pendientes generadas.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {proximasEcheances.map((e) => (
                <div key={e.id} className="flex items-center justify-between text-xs">
                  <span className="text-gray-700 truncate">{e.titulo}</span>
                  <span className={`shrink-0 font-semibold ${e.dias < 7 ? 'text-red-600' : 'text-gray-500'}`}>
                    {e.dias === 0 ? 'hoy' : `${e.dias} d`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {gerantConfig && remuneracionAnual === 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded-sm px-3 py-2 flex items-center gap-2 text-xs text-amber-800">
          <AlertTriangle size={14} className="shrink-0" />
          El gérant no tiene rémunération configurada — ve a la pestaña "Salario vs Dividendos" para simular escenarios.
        </div>
      )}

      <div className="bg-surface border border-gray-200 rounded-sm p-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 border-b border-gray-200 pb-2 mb-3">
          CA HT, gastos HT y carga fiscal estimada — {anioActual}
        </p>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={evolucionAnual}>
            <CartesianGrid stroke="#e5e7eb" vertical={false} />
            <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={{ stroke: '#e5e7eb' }} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} width={55} />
            <Tooltip formatter={(valor: unknown) => fmt(Number(valor))} contentStyle={TOOLTIP_STYLE} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="ingresos" name="CA HT" fill="#1a5c38" radius={[2, 2, 0, 0]} />
            <Bar dataKey="gastos" name="Gastos HT" fill="#b91c1c" radius={[2, 2, 0, 0]} />
            <Bar dataKey="cargaFiscal" name="Carga fiscal est." fill="#9ca3af" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-surface border border-gray-200 rounded-sm p-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 border-b border-gray-200 pb-2 mb-1">
          Beneficio imponible acumulado — {anioActual}
        </p>
        <p className="text-xs text-gray-500 mb-3">
          Suma mes a mes del beneficio (Facturas − Gastos de Francia, menos rémunération y cotisations del gérant). La línea roja
          marca el umbral de {fmt(is.plafondReducido)} donde el IS pasa del tramo 15% al 25%.
        </p>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={evolucionAcumulada}>
            <CartesianGrid stroke="#e5e7eb" vertical={false} />
            <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={{ stroke: '#e5e7eb' }} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} width={55} />
            <Tooltip formatter={(valor: unknown) => fmt(Number(valor))} contentStyle={TOOLTIP_STYLE} />
            <Area
              type="monotone"
              dataKey="beneficioNetoAcumulado"
              name="Beneficio imponible acum."
              stroke="#1a5c38"
              fill="#1a5c38"
              fillOpacity={0.15}
              strokeWidth={2}
            />
            {is.plafondReducido > 0 && (
              <ReferenceLine
                y={is.plafondReducido}
                stroke="#b91c1c"
                strokeDasharray="4 4"
                label={{ value: `Tramo 25% desde ${fmt(is.plafondReducido)}`, position: 'insideTopRight', fill: '#b91c1c', fontSize: 11 }}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <Faq
        items={[
          {
            q: '¿Qué es el Impôt sur les Sociétés (IS)?',
            a: 'Es el impuesto francés sobre el beneficio de las sociedades (el equivalente al Impuesto de Sociedades español). Reformas Ordoñez, al ser una EURL que ha optado por tributar como sociedad (régimen IS), paga este impuesto sobre lo que le queda de beneficio después de pagar todos los gastos, incluida la rémunération del gérant. Se calcula y se paga una vez al año (con acomptes a cuenta durante el ejercicio siguiente), a diferencia de la TVA que es mensual.',
          },
          {
            q: '¿Qué es la TVA?',
            a: 'Es el IVA francés (Taxe sur la Valeur Ajoutée). Reformas Ordoñez la repercute en cada factura a sus clientes (TVA collectée, al 10%, 20% o 5,5% según el tipo de obra) y la recupera en cada gasto con factura (TVA déductible). Cada mes se declara la diferencia a la DGFiP: si has repercutido más de lo que has deducido, pagas la diferencia; si es al revés, tienes un crédito a tu favor.',
          },
          {
            q: '¿Qué son las "cotisations URSSAF"?',
            a: 'Son las cotizaciones sociales que paga el gérant (Mario) por su propia cobertura social — el equivalente francés a la cuota de autónomos española, pero calculadas de forma distinta (ver la pestaña "Cotisations URSSAF" para el detalle). Cubren la sanidad, la jubilación, las bajas por enfermedad, etc. Se calculan sobre la rémunération que se paga el gérant, no sobre el beneficio de la empresa.',
          },
          {
            q: '¿Cómo se calcula exactamente el "IS del ejercicio"?',
            a: 'Ejemplo con números: si en el ejercicio hay 60.000 € de ingresos (Facturas) y 20.000 € de gastos (Gastos), el beneficio bruto es 40.000 €. Si el gérant se paga 25.000 € de rémunération y sus cotisations son 8.325 € (25.000 × 74% × 45%), el beneficio neto imposable es 40.000 − 25.000 − 8.325 = 6.675 €. Ese importe tributa al 15% (o al 15%/25% combinado si supera el plafond del tramo) — ver el desglose completo con el mismo cálculo en la pestaña "Impôt sur les Sociétés". La barra verde de la tarjeta muestra qué parte del tramo del 15% ya se ha "llenado" con ese beneficio.',
          },
          {
            q: '¿Por qué "TVA del mes" no coincide exactamente con la pestaña TVA?',
            a: 'Esta tarjeta es un resumen rápido del mes en curso: suma la TVA de todas las facturas y gastos con fecha dentro del mes. La pestaña TVA hace la declaración CA3 mes a mes con más detalle (líneas A1-A3 por tipo de operación, crédito de TVA reportado de meses anteriores, exportación a CSV para la contabilidad) y puede dar una cifra ligeramente distinta si hay ajustes manuales o crédito arrastrado.',
          },
          {
            q: '¿Qué significa "crédito a favor" en la tarjeta de TVA?',
            a: 'Que la TVA déductible de tus gastos (lo que has pagado de IVA a tus proveedores) es mayor que la TVA collectée de tus facturas (lo que has cobrado de IVA a tus clientes) ese mes. En ese caso no pagas nada a la DGFiP — el exceso se arrastra como crédito al mes siguiente, o puedes pedir su devolución (remboursement) si el crédito acumulado supera 760 €.',
          },
          {
            q: '¿Qué son las "Próximas échéances"?',
            a: 'Son los 3 trámites o pagos fiscales con la fecha límite más próxima, sacados del calendario que generas en la pestaña "Calendario fiscal" (CA3 mensual, acomptes/solde de IS, CFE, liasse fiscale...). Aparecen en rojo si quedan menos de 7 días. Si no ves ninguna, es porque aún no has generado el calendario para el año en curso — hazlo desde esa pestaña.',
          },
          {
            q: '¿De dónde salen exactamente las cifras del gráfico anual?',
            a: 'Cada barra mensual se calcula por separado con los datos reales de Facturas y Gastos de ese mes: "CA HT" es la suma de las bases sin IVA de las facturas con fecha en ese mes, "Gastos HT" la suma de las bases sin IVA de los gastos, y "Carga fiscal est." aplica la fórmula del IS (15%/25%) a ese beneficio mensual como si fuera un mini-ejercicio de un mes — es solo una forma visual de repartir la carga fiscal a lo largo del año, el cálculo real y válido es el anual de la pestaña "Impôt sur les Sociétés".',
          },
          {
            q: '¿Puedo confiar en estas cifras para declarar impuestos?',
            a: 'Son estimaciones internas para ayudarte a planificar tesorería y anticipar cuánto vas a tener que pagar — no son declaraciones oficiales ni las presenta el CRM ante la DGFiP o la URSSAF. Todos los tipos y umbrales usados (15%, 25%, 42.500 €, 26%, 45%, PASS, 30%, 10%...) vienen de la tabla fiscal_config (editable desde Supabase, con su fuente oficial enlazada en cada pestaña) para que nunca queden desactualizados en el código si cambia la ley. La cifra final para declarar siempre debe validarla tu expert-comptable.',
          },
        ]}
      />

      <p className="text-xs text-gray-400 text-center">
        Herramienta de estimación interna. No sustituye el asesoramiento de un expert-comptable.
      </p>
    </div>
  );
}
