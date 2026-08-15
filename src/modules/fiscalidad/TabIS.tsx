import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Scale, FileText } from 'lucide-react';
import { TOOLTIP_STYLE } from '../../lib/chartStyles';
import { useToast } from '../../hooks/useToast';
import { conAvisoDescarga } from '../../lib/conAvisoDescarga';
import { mensajeError } from '../../lib/mensajeError';
import { generarPdfDecisionAprobacionCuentas } from '../../lib/generarPdfRemuneracion';
import { registrarDecision } from '../../lib/registroDecisiones';
import { Button } from '../../components/ui/Button';
import { useFiscalConfig } from './useFiscalConfig';
import { useGerantConfig } from './useGerantConfig';
import { useResultadoEjercicio } from './useResultadoEjercicio';
import { useEvolucionAcumulada } from './useEvolucionAcumulada';
import { useEcheances } from './useEcheances';
import { calcularIS, calcularTNS, calcularReservaLegal, limitesEjercicio, mesesTranscurridosEjercicio } from './calculos';
import { Fuente } from './Fuente';
import { Faq } from './Faq';

function fmt(n: number) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n);
}

function fmtPct(n: number) {
  return new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 1 }).format(n);
}

function fmtFecha(f: string) {
  return new Date(`${f}T00:00:00`).toLocaleDateString('es', { day: '2-digit', month: 'short', year: '2-digit' });
}

export function TabIS() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [generandoAprobacion, setGenerandoAprobacion] = useState(false);
  const anio = new Date().getFullYear();
  const ejercicio = limitesEjercicio(anio);
  const { config, fuente } = useFiscalConfig();
  const { gerantConfig } = useGerantConfig();
  const { ingresosHT, beneficioBruto } = useResultadoEjercicio(ejercicio.inicio, ejercicio.fin);
  const { echeances, marcarCompletada } = useEcheances();

  const mesesTranscurridos = useMemo(() => mesesTranscurridosEjercicio(ejercicio), [ejercicio]);

  const remuneracionAnual = gerantConfig?.remuneracion_anual ?? 0;
  // Prorrateado por meses TRANSCURRIDOS, no por la duración total del ejercicio — beneficioBruto
  // (useResultadoEjercicio) ya solo refleja lo facturado/gastado hasta hoy, así que restarle el
  // coste de rémunération del ejercicio COMPLETO infla el "beneficio neto" a 0 € casi todo el año
  // y lo dispara de golpe al final (bug real corregido 2026-08-11).
  const remuneracionPeriodo = remuneracionAnual * (mesesTranscurridos / 12);
  const cotisacionesPeriodo = calcularTNS(remuneracionAnual, config).total * (mesesTranscurridos / 12);
  const beneficioNeto = Math.max(0, beneficioBruto - remuneracionPeriodo - cotisacionesPeriodo);
  const is = calcularIS(beneficioNeto, ejercicio.meses, config);
  const tipoEfectivo = beneficioNeto > 0 ? is.total / beneficioNeto : 0;
  const resultadoNeto = Math.max(0, beneficioNeto - is.total);
  const margenNeto = ingresosHT > 0 ? resultadoNeto / ingresosHT : 0;
  const capitalSocial = gerantConfig?.capital_social ?? 1000;
  const reservaLegal = calcularReservaLegal(resultadoNeto, capitalSocial, config);
  const evolucionAcumulada = useEvolucionAcumulada(anio, ejercicio, remuneracionAnual, config);

  const handleAprobacionCuentas = async () => {
    setGenerandoAprobacion(true);
    try {
      await conAvisoDescarga(() => generarPdfDecisionAprobacionCuentas(anio, { resultadoNeto, reservaLegal, capitalSocial }), toast);
      try {
        await registrarDecision({ tipo: 'aprobacion_cuentas', titulo: `Approbation des comptes — exercice ${anio}`, anio_ejercicio: anio });
        queryClient.invalidateQueries({ queryKey: ['decisiones_societarias'] });
      } catch (err) {
        toast.warning(`El documento se generó, pero no se pudo registrar en el "Registre des décisions": ${(err as { message?: string }).message ?? err}`);
      }
    } catch (err) {
      toast.error(mensajeError(err, 'No se pudo generar el documento'));
    } finally {
      setGenerandoAprobacion(false);
    }
  };

  const proyeccion = useMemo(() => {
    const beneficioMedioMensual = beneficioNeto / mesesTranscurridos;
    const beneficioProyectado = beneficioMedioMensual * ejercicio.meses;
    return { beneficioProyectado, is: calcularIS(Math.max(0, beneficioProyectado), ejercicio.meses, config) };
  }, [beneficioNeto, mesesTranscurridos, ejercicio.meses, config]);

  const acomptes = (echeances ?? []).filter((e) => e.tipo === 'ACOMPTE_IS' || e.tipo === 'SOLDE_IS');

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-surface border border-gray-200 rounded-sm p-4">
        <p className="text-sm font-semibold text-gray-900 flex items-center gap-1.5 mb-2">
          <Scale size={14} className="text-brand" /> Impôt sur les Sociétés — dos tramos
        </p>
        <p className="text-xs text-gray-600 leading-relaxed">
          El beneficio imposable tributa al {(config('is_taux_reduit', 0.15) * 100).toFixed(0)}% hasta{' '}
          {fmt(config('is_plafond_reduit', 42500))} anuales (prorrateado según los meses del ejercicio) siempre que la empresa cumpla
          las condiciones PME: CA ≤ 10 M€, capital 100% liberado y ≥75% del capital en manos de personas físicas — Reformas Ordoñez
          cumple las tres. El exceso tributa al {(config('is_taux_normal', 0.25) * 100).toFixed(0)}%.
        </p>
        <p className="text-xs text-gray-500 leading-relaxed mt-2">
          El <strong>beneficio neto estimado</strong> que ves más abajo no es solo "ingresos − gastos": a los ingresos y gastos
          registrados en Facturas y Gastos se le resta también la rémunération del gérant y sus cotisations URSSAF del período
          (configurables en la pestaña "Cotisations URSSAF"), porque ambas reducen el beneficio imposable antes de calcular el IS.
        </p>
        <div className="mt-2">
          <Fuente url={fuente('is_taux_reduit')} />
        </div>
      </div>

      {anio === 2026 && (
        <div className="bg-brand-light border border-gray-200 rounded-sm px-3 py-2 text-xs text-brand">
          Primer ejercicio (01/07/2026 – 31/12/2026, 6 meses): exento de acomptes — no hay ejercicio anterior sobre el que
          calcularlos. Primer pago: solde el 15/05/2027.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-surface border border-gray-200 rounded-sm p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">
            Tramo 15% — hasta {fmt(is.plafondReducido)}
          </p>
          <p className="text-xl font-semibold text-brand">{fmt(is.isReducido)}</p>
          <p className="text-xs text-gray-400 mt-1">sobre base de {fmt(is.baseReducida)}</p>
        </div>
        <div className="bg-surface border border-gray-200 rounded-sm p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Tramo 25% — exceso</p>
          <p className="text-xl font-semibold text-gray-900">{fmt(is.isNormal)}</p>
          <p className="text-xs text-gray-400 mt-1">sobre base de {fmt(is.baseNormal)}</p>
        </div>
        <div className="bg-surface border border-gray-200 rounded-sm p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">IS estimado total</p>
          <p className="text-xl font-semibold text-brand">{fmt(is.total)}</p>
          <p className="text-xs text-gray-400 mt-1">beneficio neto estimado: {fmt(beneficioNeto)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-surface border border-gray-200 rounded-sm p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Tipo efectivo estimado</p>
          <p className="text-xl font-semibold text-gray-900">{fmtPct(tipoEfectivo)}</p>
          <p className="text-xs text-gray-400 mt-1">lo que se lleva hacienda sobre el beneficio neto imponible</p>
        </div>
        <div className="bg-surface border border-gray-200 rounded-sm p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Margen neto tras IS</p>
          <p className="text-xl font-semibold text-gray-900">{fmtPct(margenNeto)}</p>
          <p className="text-xs text-gray-400 mt-1">lo que queda de cada € facturado (Francia) tras rémunération, cotisations e IS</p>
        </div>
      </div>

      <div className="bg-surface border border-gray-200 rounded-sm p-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 border-b border-gray-200 pb-2 mb-1">
          Beneficio imponible acumulado — {anio}
        </p>
        <p className="text-xs text-gray-500 mb-3">
          La línea roja marca el umbral de {fmt(is.plafondReducido)} donde el excedente empieza a tributar al 25% en vez del 15%.
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

      <div className="bg-surface border border-gray-200 rounded-sm p-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 border-b border-gray-200 pb-2 mb-3">
          Proyección fin de ejercicio {anio}
        </p>
        <p className="text-sm text-gray-700">
          Extrapolando el beneficio medio de los {mesesTranscurridos} mes(es) transcurridos a los {ejercicio.meses} meses del
          ejercicio: beneficio proyectado {fmt(proyeccion.beneficioProyectado)} → IS proyectado{' '}
          <span className="font-semibold text-brand">{fmt(proyeccion.is.total)}</span>.
        </p>
      </div>

      <div className="bg-surface border border-gray-200 rounded-sm p-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 border-b border-gray-200 pb-2 mb-3">
          Acomptes y solde
        </p>
        {acomptes.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">
            Aún no se ha generado el calendario fiscal — hazlo desde la pestaña "Calendario".
          </p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <tbody>
              {acomptes.map((e) => (
                <tr key={e.id} className="border-t border-gray-100">
                  <td className="py-1.5 w-8">
                    <input
                      type="checkbox"
                      checked={e.completada}
                      onChange={(ev) => marcarCompletada({ id: e.id, completada: ev.target.checked })}
                    />
                  </td>
                  <td className="py-1.5 text-gray-900">{e.titulo}</td>
                  <td className="py-1.5 text-right text-gray-500">{fmtFecha(e.fecha_limite)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="bg-surface border border-gray-200 rounded-sm p-4">
        <p className="text-sm font-semibold text-gray-900 flex items-center gap-1.5 mb-1">
          <FileText size={14} className="text-brand" /> Documentos del ejercicio
        </p>
        <p className="text-xs text-gray-500 leading-relaxed mb-3">
          Acta de la décision de l'associé unique aprobando las cuentas del ejercicio y la afectación del resultado —
          paso previo obligatorio al dépôt des comptes en el Greffe. Usa el resultado neto estimado de arriba
          ({fmt(resultadoNeto)}) y la dotación a la réserve légale (article 18 des statuts).
        </p>
        <Button onClick={handleAprobacionCuentas} disabled={generandoAprobacion}>
          {generandoAprobacion ? 'Generando...' : `Décision d'approbation des comptes ${anio} (PDF)`}
        </Button>
      </div>

      <Faq
        items={[
          {
            q: '¿Qué es exactamente el "beneficio imposable"?',
            a: 'Es lo que le queda a la empresa después de restar TODOS los gastos deducibles a los ingresos: compras de material, subcontratas, alquileres, seguros, la rémunération del gérant y sus cotisations sociales, amortizaciones, etc. No es lo mismo que el "beneficio bruto" (ingresos − gastos operativos) que ves en el Dashboard de Contabilidad, porque a ese aún hay que restarle el salario del gérant y sus cotisations antes de calcular el IS — el impuesto se paga sobre lo que sobra después de pagarse él mismo.',
          },
          {
            q: '¿Por qué hay dos tramos (15% y 25%)? ¿Y por qué existe ese incentivo?',
            a: 'Es un incentivo fiscal para pymes creado para no penalizar a las empresas pequeñas con el mismo tipo que a las grandes corporaciones. El legislador francés aplica un tipo reducido del 15% sobre los primeros 42.500 € de beneficio anual (prorrateados según los meses del ejercicio) a las empresas que facturan menos de 10 M€, tienen el capital 100% liberado (ya pagado, no pendiente de desembolso) y al menos el 75% del capital en manos de personas físicas (no de otras sociedades). Reformas Ordoñez cumple las tres condiciones. Todo el beneficio que supere ese plafond tributa al tipo normal del 25%.',
          },
          {
            q: 'Ejemplo completo de cálculo del IS',
            a: 'Supongamos un beneficio imposable de 30.000 € en un ejercicio de 6 meses (como el primer ejercicio 2026 de Reformas Ordoñez). El plafond del tramo reducido se prorratea: 42.500 € × (6/12) = 21.250 €. Los primeros 21.250 € tributan al 15% = 3.187,50 €. Los 8.750 € restantes (30.000 − 21.250) tributan al 25% = 2.187,50 €. IS total = 3.187,50 + 2.187,50 = 5.375 €. Es exactamente lo que verías reflejado en las tres tarjetas de arriba con esos números.',
          },
          {
            q: '¿Por qué el plafond del tramo 15% no son 42.500 € completos este año?',
            a: 'Porque el plafond de 42.500 € es un importe ANUAL, y el primer ejercicio de Reformas Ordoñez va del 01/07/2026 al 31/12/2026 (solo 6 meses, no 12). Se prorratea proporcionalmente: 42.500 × (6/12) = 21.250 €. A partir de 2027, con un ejercicio de 12 meses completos, el plafond será el importe completo de 42.500 €.',
          },
          {
            q: '¿Qué son los "acomptes" y en qué se diferencian del "solde"?',
            a: 'Los acomptes son 4 pagos a cuenta del IS que se hacen DURANTE el ejercicio (15 de marzo, junio, septiembre y diciembre), calculados como una estimación basada en el resultado del ejercicio ANTERIOR — es una forma de que el Estado cobre el impuesto de forma escalonada en vez de esperar a que cierre el ejercicio. El solde es la liquidación final: una vez cerrado el ejercicio y calculado el IS real, se paga la diferencia entre lo ya adelantado en acomptes y lo que realmente se debe (o se pide la devolución si se pagó de más), dentro de los 3 meses y 15 días tras el cierre.',
          },
          {
            q: '¿Por qué 2026 no tiene acomptes?',
            a: 'Porque los acomptes se calculan sobre el resultado del ejercicio ANTERIOR, y 2026 es el primer ejercicio de la empresa — no existe un "2025" del que partir. Por eso está exenta de acomptes en su primer año y solo pagará el solde (liquidación completa) el 15/05/2027. A partir del ejercicio 2027 sí tendrá que hacer los 4 acomptes trimestrales basados en el resultado de 2026.',
          },
          {
            q: '¿Qué pasa si el "beneficio neto estimado" es 0 o negativo?',
            a: 'Si los gastos (incluida la rémunération del gérant y sus cotisations) superan a los ingresos, no hay beneficio imposable y el IS estimado es 0 € — no se paga impuesto sobre pérdidas. Ese es el caso de Reformas Ordoñez ahora mismo con los datos de prueba: el ejercicio va en pérdidas, por eso ves 0,00 € en las tres tarjetas. En Francia, además, las pérdidas se pueden compensar con beneficios de ejercicios futuros (report en avant), reduciendo el IS a pagar más adelante — esa parte no está modelada en este simulador.',
          },
          {
            q: 'Los importes que veo no cuadran con lo que espero, ¿qué hago?',
            a: 'Primero revisa que las Facturas y Gastos del período estén bien registrados (fecha, importes) — el cálculo se basa 100% en esos datos reales. Si el problema es un tipo o umbral (15%, 25%, el plafond de 42.500 €, etc.), todos están en la tabla fiscal_config de Supabase, no en el código — edítalos ahí y el cálculo se actualiza solo, sin tocar nada del CRM. Este simulador es orientativo: para una cifra definitiva antes de declarar, consulta siempre a tu expert-comptable.',
          },
        ]}
      />
    </div>
  );
}
