import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Calculator, AlertTriangle, Receipt, Trash2, PiggyBank, Users, Landmark, Wallet } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { TOOLTIP_STYLE } from '../../lib/chartStyles';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../hooks/useToast';
import { conAvisoDescarga } from '../../lib/conAvisoDescarga';
import { mensajeError } from '../../lib/mensajeError';
import { generarPdfDecisionRemuneracion } from '../../lib/generarPdfRemuneracion';
import { registrarDecision } from '../../lib/registroDecisiones';
import { useFiscalConfig } from './useFiscalConfig';
import { useGerantConfig } from './useGerantConfig';
import { useResultadoEjercicio } from './useResultadoEjercicio';
import { simularEjercicio, limitesEjercicio, mesesTranscurridosEjercicio, calcularIRGerante } from './calculos';
import { DESGLOSE_REFERENCIA } from './desgloseReferencia';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Faq } from './Faq';
import { fmt, fmtPct } from './format';
import { ResumenTitular } from './ResumenTitular';

const OPCIONES_TVA = [
  { value: '10', label: '10% (travaux rénovation)' },
  { value: '20', label: '20% (taux normal)' },
];

type Escenario = {
  id: string;
  nombre: string;
  ingresos: number;
  gastos: number;
  remuneracion: number;
  pctDividendos: number;
  capitalSocial: number;
  netoReal: number;
  totalPrelevements: number;
  cotisaciones: number;
  is: number;
  irPersonal: number;
};

export function TabSimulador() {
  const toast = useToast();
  const anio = new Date().getFullYear();
  const ejercicioActual = limitesEjercicio(anio);
  const { config } = useFiscalConfig();
  const { gerantConfig, guardar: guardarGerante, guardando: guardandoFamilia } = useGerantConfig();
  const { ingresosHT, gastosHT } = useResultadoEjercicio(ejercicioActual.inicio, ejercicioActual.fin);
  const capitalSocialReal = gerantConfig?.capital_social ?? 1000;
  const compteCourantMedio = gerantConfig?.compte_courant_medio ?? 0;
  const indemniteLocauxMensual = gerantConfig?.indemnite_locaux_mensual ?? 0;

  // Reembolsos reales ya registrados este ejercicio (indemnités kilométriques, ver Gastos → "Indemnité
  // kilométrique") — no son beneficio, son la devolución de un gasto que Mario ya pagó de su bolsillo,
  // por eso se muestran aparte de la tabla "De la facturación al bolsillo" en vez de sumarse ahí.
  const { data: gastosKm } = useQuery({
    queryKey: ['gastos_km_ejercicio', ejercicioActual.inicio, ejercicioActual.fin],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('gastos')
        .select('importe_base, km')
        .not('km', 'is', null)
        .gte('fecha', ejercicioActual.inicio)
        .lte('fecha', ejercicioActual.fin);
      if (error) throw error;
      return data as { importe_base: number | null; km: number | null }[];
    },
  });
  const indemnitesKmAnual = (gastosKm ?? []).reduce((s, g) => s + (g.importe_base ?? 0), 0);

  const [ingresos, setIngresos] = useState(0);
  const [gastos, setGastos] = useState(0);
  const [remuneracion, setRemuneracion] = useState(0);
  // Se descarta repartir dividendos por defecto (con el capital social real de 1.000 €, casi
  // cualquier dividendo acaba pagando cotisations TNS igual que la rémunération, pero sin generar
  // derechos de jubilación/baja — ver FAQ). Hay que activar "Usar dividendos" para poder moverlo.
  const [usarDividendos, setUsarDividendos] = useState(false);
  const [pctDividendos, setPctDividendos] = useState(0);
  const [duracion, setDuracion] = useState<'completo' | 'actual'>('completo');
  const [capitalSocialSim, setCapitalSocialSim] = useState(1000);
  const [tvaVentas, setTvaVentas] = useState(10);
  const [tvaCompras, setTvaCompras] = useState(20);
  const [nombreEscenario, setNombreEscenario] = useState('');
  const [escenarios, setEscenarios] = useState<Escenario[]>([]);
  const [generandoDecision, setGenerandoDecision] = useState(false);
  const [casado, setCasado] = useState(true);
  const [hijosACargo, setHijosACargo] = useState(1);
  const [ingresosConyuge, setIngresosConyuge] = useState(0);
  // Reembolso de la línea de teléfono/internet a nombre personal usada para gestionar Reformas
  // Ordoñez — pendiente de que Gabriel confirme el importe mensual real de cada línea, por eso
  // arranca en 0 y es editable a mano en vez de venir precargado como el resto.
  const [reembolsoTelefono, setReembolsoTelefono] = useState(0);
  const idRef = useRef(0);

  // Precarga una vez con los datos reales del ejercicio en curso como punto de partida — el
  // usuario puede cambiarlos libremente después, es solo para no arrancar desde 0 € cada vez. La
  // rémunération NO se precarga aquí: la calcula sola el efecto de más abajo en cuanto hay
  // ingresos/gastos, sin esperar a que carguen los de gerant_config.
  const [precargado, setPrecargado] = useState(false);
  useEffect(() => {
    if (precargado) return;
    if (ingresosHT === 0 && gastosHT === 0 && !gerantConfig) return;
    setIngresos(Math.round(ingresosHT));
    setGastos(Math.round(gastosHT));
    setCapitalSocialSim(gerantConfig?.capital_social ?? 1000);
    setCasado(gerantConfig?.casado ?? true);
    setHijosACargo(gerantConfig?.hijos_a_cargo ?? 1);
    setIngresosConyuge(gerantConfig?.ingresos_conyuge_anual ?? 0);
    setReembolsoTelefono(gerantConfig?.reembolso_telefono_mensual ?? 0);
    setPrecargado(true);
  }, [ingresosHT, gastosHT, gerantConfig, precargado]);

  // "Ejercicio en curso" usa los meses YA TRANSCURRIDOS, no la duración total del ejercicio — igual
  // que TabIS.tsx/TabSalarioDividendos.tsx, para que el plafond del 15% de IS sea coherente con las
  // demás pestañas cuando se simula con el beneficio real de hoy (bug real, auditoría 2026-08-15).
  // "Año completo" sigue usando 12 meses tal cual: es una proyección explícita a un año entero, no
  // el progreso real del ejercicio actual.
  const meses = duracion === 'completo' ? 12 : mesesTranscurridosEjercicio(ejercicioActual);
  const beneficioBruto = ingresos - gastos;

  // Al no repartir dividendos, todo el margen operativo se declara íntegro como rémunération del
  // gérant (es lo que decidiste: "el margen neto se convierte directamente en el salario anual") —
  // en cuanto cambian ingresos o gastos, la rémunération se ajusta sola a ese mismo importe. Cambiar
  // la rémunération a mano después queda tal cual hasta el siguiente cambio de ingresos/gastos.
  useEffect(() => {
    setRemuneracion(Math.max(0, beneficioBruto));
  }, [beneficioBruto]);

  const resultado = useMemo(
    () => simularEjercicio(remuneracion, pctDividendos, beneficioBruto, capitalSocialSim, compteCourantMedio, meses, config),
    [remuneracion, pctDividendos, beneficioBruto, capitalSocialSim, compteCourantMedio, meses, config],
  );

  // IR del foyer fiscal completo (barème progresivo + quotient familial): rémunération neta del
  // gérant + ingresos propios del cónyuge si los tiene — en Francia el matrimonio implica una única
  // déclaration commune, no declaraciones separadas (ver FAQ). Los dividendos tributan aparte al
  // PFU (ya incluido en resultado.divCalc.total), no entran aquí.
  const irGerante = useMemo(
    () => calcularIRGerante(remuneracion, resultado.tns.total, ingresosConyuge, casado, hijosACargo, config),
    [remuneracion, resultado.tns.total, ingresosConyuge, casado, hijosACargo, config],
  );

  // El neto disponible "de empresa" (resultado.netoDisponible) todavía no resta el impôt sur le
  // revenu personal de Mario — este sí es el importe real que le queda en el bolsillo tras TODO
  // (cotisations TNS + Impôt sur les Sociétés + IR personal + carga sobre dividendos si los hay).
  const netoRealFinal = remuneracion - resultado.tns.total - irGerante.impotFinal + (resultado.dividendos - resultado.divCalc.total);
  const netoRealMensual = netoRealFinal / 12;

  const pctNetoSobreIngresos = ingresos > 0 ? netoRealFinal / ingresos : 0;

  const reembolsosAnual = indemniteLocauxMensual * 12 + indemnitesKmAnual + reembolsoTelefono * 12;
  const netoConReembolsos = netoRealFinal + reembolsosAnual;

  // Reparto orientativo del impôt entre los dos, a prorrata de su base imponible — Hacienda NO
  // divide el impuesto así en la práctica (tributáis solidariamente como hogar, un único pago), es
  // solo para entender de dónde sale cada parte del total antes de verlo todo junto.
  const baseMario = Math.max(0, irGerante.remuneracionNeta - irGerante.abattement);
  const pctImpotMario = irGerante.revenuNetImposable > 0 ? baseMario / irGerante.revenuNetImposable : 1;
  const impotMario = irGerante.impotFinal * pctImpotMario;
  const impotConyuge = irGerante.impotFinal - impotMario;
  const tvaCollectee = Math.max(0, ingresos) * (tvaVentas / 100);
  const tvaDeductible = Math.max(0, gastos) * (tvaCompras / 100);
  const tvaNeta = tvaCollectee - tvaDeductible;

  // Tabla de control financiero — cada etapa con el mismo formato: importe anual, mensual (=
  // anual/12) y % sobre la facturación HT, restas siempre con "−" delante y en rojo. `anual` se
  // guarda siempre en positivo; `negativo` decide el signo y el color al pintarlo.
  const filasCascada = useMemo(() => {
    const netoAntesDeclaracion = Math.max(0, remuneracion - resultado.tns.total) + resultado.dividendos - resultado.divCalc.total;
    const totalRetenciones = resultado.tns.total + resultado.is.total + resultado.divCalc.total;
    const filas: { concepto: string; anual: number; negativo?: boolean; destacado?: boolean; final?: boolean; destino: string }[] = [
      { concepto: 'Facturación total neta (HT)', anual: ingresos, destino: 'Total de ingresos por obras, sin IVA' },
      {
        concepto: 'Costes operativos (HT)',
        anual: gastos,
        negativo: true,
        destino: 'Materiales, subcontratas, seguros, suministros y demás gastos del ejercicio',
      },
      {
        concepto: 'Margen operativo disponible',
        anual: beneficioBruto,
        destacado: true,
        destino: 'Se declara íntegro como rémunération bruta del gérant',
      },
      {
        concepto: 'Cotisations URSSAF (TNS)',
        anual: resultado.tns.total,
        negativo: true,
        destino: 'Cobertura de salud, baja médica y jubilación del gérant',
      },
      {
        concepto: 'Impôt sur les Sociétés',
        anual: resultado.is.total,
        negativo: true,
        destino:
          resultado.is.total === 0
            ? 'En 0 € al imputar todo el margen a rémunération, gasto deducible antes del IS'
            : 'Sobre el beneficio que no se ha llevado como rémunération',
      },
    ];
    if (resultado.divCalc.total > 0) {
      filas.push({
        concepto: 'Carga sobre dividendos (PFU/TNS)',
        anual: resultado.divCalc.total,
        negativo: true,
        destino: 'Impuesto sobre los dividendos repartidos',
      });
    }
    filas.push({
      concepto: 'Total retenciones públicas (empresa)',
      anual: totalRetenciones,
      negativo: true,
      destacado: true,
      destino: 'Suma de cotisations, Impôt sur les Sociétés y carga sobre dividendos — el impôt sur le revenu personal se calcula aparte, más abajo',
    });
    filas.push({
      concepto: 'Dinero limpio en tu bolsillo (antes de tu declaración de la renta)',
      anual: netoAntesDeclaracion,
      destacado: true,
      final: true,
      destino: 'Lo que entra de verdad en tu cuenta personal este ejercicio — ver abajo lo que pagarás al declararlo',
    });
    return filas;
  }, [ingresos, gastos, beneficioBruto, remuneracion, resultado]);

  // Reparto de la facturación en categorías de coste, sin solaparse entre sí a nivel empresa
  // (gastos + rémunération + cotisations + IS + reserva + retenido + dividendos = ingresos, salvo
  // que muevas la rémunération por debajo del margen operativo a mano: entonces cotisations TNS se
  // calcula sobre esa rémunération manual, que ya no agota el margen, y puede quedar algo por debajo
  // del 100% del donut — normal, es la parte que sigue sin asignar todavía).
  // "Neto para Mario" NO es una porción más del donut — es una cifra a nivel PERSONAL (ya neta de
  // sus propias cotisations/impuestos), por eso se muestra aparte, en el centro, no como slice.
  const sliceData = useMemo(() => {
    if (ingresos <= 0) return [];
    const noRepartido = Math.max(0, resultado.beneficioDistribuible - resultado.dividendos);
    return [
      { nombre: 'Gastos operativos (HT)', valor: gastos, color: '#9ca3af' },
      { nombre: 'Rémunération del gérant', valor: remuneracion, color: '#0f3d24' },
      { nombre: 'Cotisations TNS', valor: resultado.tns.total, color: '#b91c1c' },
      { nombre: 'Impôt sur les Sociétés', valor: resultado.is.total, color: '#6b7280' },
      { nombre: 'Reserva legal (retenida)', valor: resultado.reservaLegal.dotacion, color: '#5c8a71' },
      { nombre: 'Beneficio retenido (no repartido)', valor: noRepartido, color: '#a8c9b8' },
      { nombre: 'Dividendos repartidos', valor: resultado.dividendos, color: '#1a5c38' },
    ].filter((s) => s.valor > 0.5);
  }, [ingresos, gastos, remuneracion, resultado]);

  const handleGenerarDecision = async () => {
    setGenerandoDecision(true);
    try {
      await conAvisoDescarga(() => generarPdfDecisionRemuneracion(anio, remuneracion, capitalSocialSim), toast);
      try {
        await registrarDecision({
          tipo: 'remuneracion',
          titulo: `Rémunération du gérant — exercice ${anio} (calculado en el Simulador)`,
          anio_ejercicio: anio,
        });
      } catch (err) {
        toast.warning(`El documento se generó, pero no se pudo registrar en el "Registre des décisions": ${mensajeError(err)}`);
      }
    } catch (err) {
      toast.error(mensajeError(err, 'No se pudo generar el documento'));
    } finally {
      setGenerandoDecision(false);
    }
  };

  const guardarSituacionFamiliar = () => {
    guardarGerante(
      { casado, hijos_a_cargo: hijosACargo, ingresos_conyuge_anual: ingresosConyuge },
      {
        onSuccess: () => toast.success('Situación familiar guardada'),
        onError: (err: Error) => toast.error(err.message),
      },
    );
  };

  const comparativaDividendos = useMemo(
    () =>
      [0, 25, 50, 75, 100].map((pct) => {
        const r = simularEjercicio(remuneracion, pct, beneficioBruto, capitalSocialSim, compteCourantMedio, meses, config);
        return { nombre: `${pct}% div.`, neto: r.netoDisponible, prelevements: r.totalPrelevements };
      }),
    [remuneracion, beneficioBruto, capitalSocialSim, compteCourantMedio, meses, config],
  );

  const guardarEscenario = () => {
    setEscenarios((prev) => [
      ...prev,
      {
        id: String(idRef.current++),
        nombre: nombreEscenario.trim() || `Escenario ${prev.length + 1}`,
        ingresos,
        gastos,
        remuneracion,
        pctDividendos,
        capitalSocial: capitalSocialSim,
        netoReal: netoRealFinal,
        totalPrelevements: resultado.totalPrelevements + irGerante.impotFinal,
        cotisaciones: resultado.tns.total,
        is: resultado.is.total,
        irPersonal: irGerante.impotFinal,
      },
    ]);
    setNombreEscenario('');
  };

  return (
    <div className="flex flex-col gap-4">
      <ResumenTitular icono={Calculator}>
        Con {fmt(ingresos)} de ingresos y {fmt(gastos)} de gastos, a Mario le queda el{' '}
        <strong className="text-brand">{fmtPct(pctNetoSobreIngresos)}</strong> limpio de lo facturado tras pagarlo todo:{' '}
        <strong className="text-brand">{fmt(netoRealFinal)}</strong> ({fmt(netoRealMensual)}/mes), con una rémunération de{' '}
        {fmt(remuneracion)}/año y sin repartir dividendos — tras {fmt(resultado.tns.total)} de cotisations URSSAF y{' '}
        {fmt(irGerante.impotFinal)} de impôt sur le revenu del hogar
        {irGerante.ingresosConyuge > 0 ? ' (declaración conjunta, incluye los ingresos del cónyuge)' : ''}.
      </ResumenTitular>
      <p className="text-xs text-gray-400 px-1">
        Cambia cualquier cifra abajo y el resultado se actualiza al instante — es una simulación en memoria, no afecta a
        ningún dato guardado. La rémunération se recalcula sola en cuanto cambias ingresos o gastos, para no dejar
        beneficio sin repartir pagando Impôt sur les Sociétés de más (ver FAQ).
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <div className="bg-surface border border-gray-200 rounded-sm p-4 flex flex-col gap-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Datos del escenario</p>
          <Input
            label="Ingresos anuales HT (Francia)"
            type="number"
            min={0}
            value={ingresos}
            onChange={(e) => setIngresos(Number(e.target.value))}
          />
          <Input
            label="Gastos anuales HT (Francia)"
            type="number"
            min={0}
            value={gastos}
            onChange={(e) => setGastos(Number(e.target.value))}
          />
          <Select
            label="Duración simulada"
            options={[
              { value: 'completo', label: 'Año completo (12 meses)' },
              { value: 'actual', label: `Ejercicio en curso (${ejercicioActual.meses} meses)` },
            ]}
            value={duracion}
            onChange={(e) => setDuracion(e.target.value as 'completo' | 'actual')}
          />
          <Input
            label="Capital social hipotético"
            type="number"
            min={0}
            value={capitalSocialSim}
            onChange={(e) => setCapitalSocialSim(Number(e.target.value))}
          />
          <div>
            <label className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
              Rémunération anual del gérant <span className="text-gray-900 normal-case">{fmt(remuneracion)}</span>
            </label>
            <input
              type="range"
              min={0}
              max={Math.max(100000, Math.ceil(beneficioBruto / 1000) * 1000)}
              step={1000}
              value={remuneracion}
              onChange={(e) => setRemuneracion(Number(e.target.value))}
              className="w-full accent-brand"
            />
          </div>
          {usarDividendos ? (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  % del beneficio distribuible como dividendos <span className="text-gray-900 normal-case">{pctDividendos}%</span>
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setUsarDividendos(false);
                    setPctDividendos(0);
                  }}
                  className="text-[11px] text-gray-400 hover:text-red-600"
                >
                  Quitar dividendos
                </button>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={pctDividendos}
                onChange={(e) => setPctDividendos(Number(e.target.value))}
                className="w-full accent-brand"
              />
            </div>
          ) : (
            <Button type="button" variant="secondary" size="sm" onClick={() => setUsarDividendos(true)}>
              + Usar dividendos también
            </Button>
          )}
          <p className="text-xs text-gray-400">
            Beneficio bruto: <span className="font-semibold text-gray-700">{fmt(beneficioBruto)}</span> · Capital real
            configurado: {fmt(capitalSocialReal)} (editable en "Salario vs Dividendos") · Compte courant medio: {fmt(compteCourantMedio)}.
          </p>
        </div>

        <div className="bg-surface border border-gray-200 rounded-sm p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Reparto de la facturación</p>
          {sliceData.length === 0 ? (
            <p className="text-sm text-gray-400 py-16 text-center">Introduce ingresos y gastos por encima de 0 para ver el reparto.</p>
          ) : (
            <>
              <div className="relative">
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie data={sliceData} dataKey="valor" nameKey="nombre" innerRadius={82} outerRadius={122} paddingAngle={1.5} strokeWidth={1} stroke="#ffffff">
                      {sliceData.map((s) => (
                        <Cell key={s.nombre} fill={s.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(valor: unknown) => fmt(Number(valor))} contentStyle={TOOLTIP_STYLE} />
                  </PieChart>
                </ResponsiveContainer>
                {/* Ancho fijo al diámetro del agujero del donut (2×innerRadius, con margen) para que
                    el texto haga wrap DENTRO del hueco en vez de invadir el anillo de colores. */}
                <div
                  className="absolute inset-0 m-auto flex flex-col items-center justify-center gap-0.5 pointer-events-none text-center"
                  style={{ width: 132, height: 132 }}
                >
                  <p className="text-[9px] uppercase tracking-wide text-gray-400 leading-tight">Neto real</p>
                  <p className="text-xl font-bold text-brand leading-tight break-words">{fmt(netoRealFinal)}</p>
                  <p className="text-[11px] text-gray-500 leading-tight">{fmtPct(pctNetoSobreIngresos)} de lo facturado</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-xs mt-2">
                {sliceData.map((s) => (
                  <div key={s.nombre} className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.color }} />
                    <span className="text-gray-600 truncate">{s.nombre}</span>
                    <span className="ml-auto font-medium text-gray-900 shrink-0">{fmt(s.valor)}</span>
                  </div>
                ))}
              </div>
              <details className="mt-3">
                <summary className="text-xs text-gray-500 cursor-pointer hover:text-brand">
                  ¿De dónde salen exactamente las cotisations TNS? (desglose orientativo)
                </summary>
                <div className="overflow-x-auto mt-2">
                  <table className="w-full border-collapse text-xs min-w-[420px]">
                    <thead>
                      <tr className="text-[11px] text-gray-400">
                        <th className="text-left py-1 font-medium">Cotisation</th>
                        <th className="text-left py-1 font-medium">Qué cubre</th>
                        <th className="text-right py-1 font-medium">Taux</th>
                      </tr>
                    </thead>
                    <tbody>
                      {DESGLOSE_REFERENCIA.map((d) => (
                        <tr key={d.concepto} className="border-t border-gray-100">
                          <td className="py-1 text-gray-900 font-medium whitespace-nowrap">{d.concepto}</td>
                          <td className="py-1 text-gray-500">{d.cubre}</td>
                          <td className="py-1 text-right text-gray-500 whitespace-nowrap">{d.taux}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </>
          )}
        </div>
      </div>

      {resultado.reservaLegal.dotacion > 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-sm px-3 py-2 flex items-start gap-2 text-xs text-gray-600">
          <AlertTriangle size={14} className="shrink-0 mt-0.5 text-gray-400" />
          <span>
            Reserva legal (Artículo 18 de los estatutos): {fmt(resultado.reservaLegal.dotacion)} de este ejercicio simulado
            van obligatoriamente a la reserva antes de repartir dividendos, hasta acumular {fmt(resultado.reservaLegal.tope)}{' '}
            (10% del capital social simulado).
          </span>
        </div>
      )}

      {resultado.divCalc.superaSeuil && (
        <div className="bg-amber-50 border border-amber-300 rounded-sm px-3 py-2 flex items-start gap-2 text-xs text-amber-800">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <span>
            {fmt(resultado.divCalc.exceso)} de los dividendos superan el umbral libre de {fmt(resultado.divCalc.umbralLibre)} y
            llevan cotisations TNS (~{(config('tns_taux_global', 0.45) * 100).toFixed(0)}%) en vez del PFU del{' '}
            {(config('pfu_total', 0.314) * 100).toFixed(1)}%.
          </span>
        </div>
      )}

      <div className="bg-surface border border-gray-200 rounded-sm p-4">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
            De la facturación al bolsillo — sociedad y declaración personal
          </p>
          <Button size="sm" onClick={handleGenerarDecision} disabled={generandoDecision || remuneracion === 0}>
            {generandoDecision ? 'Generando...' : `Décision de rémunération ${anio} (PDF)`}
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm min-w-[720px]">
            <thead>
              <tr className="text-xs text-gray-400">
                <th className="text-left py-1 font-medium">Concepto</th>
                <th className="text-right py-1 font-medium">Importe anual</th>
                <th className="text-right py-1 font-medium">Importe mensual</th>
                <th className="text-right py-1 font-medium">% facturación HT</th>
                <th className="text-left py-1 font-medium pl-4">Función / destino</th>
              </tr>
            </thead>
            <tbody>
              {filasCascada.map((f) => (
                <tr
                  key={f.concepto}
                  className={f.final ? 'border-t-2 border-brand' : f.destacado ? 'border-t border-gray-300' : 'border-t border-gray-100'}
                >
                  <td className={`py-1.5 ${f.destacado ? 'font-semibold text-gray-900' : 'text-gray-600'}`}>{f.concepto}</td>
                  <td
                    className={`py-1.5 text-right whitespace-nowrap ${
                      f.negativo ? 'text-red-700' : f.final ? 'font-bold text-brand text-base' : f.destacado ? 'font-semibold text-gray-900' : 'text-gray-900'
                    }`}
                  >
                    {f.negativo ? '− ' : ''}
                    {fmt(Math.abs(f.anual))}
                  </td>
                  <td
                    className={`py-1.5 text-right whitespace-nowrap ${
                      f.negativo ? 'text-red-700' : f.final ? 'font-bold text-brand' : f.destacado ? 'font-semibold text-gray-900' : 'text-gray-700'
                    }`}
                  >
                    {f.negativo ? '− ' : ''}
                    {fmt(Math.abs(f.anual) / 12)}
                  </td>
                  <td className="py-1.5 text-right text-xs text-gray-400 whitespace-nowrap">
                    {ingresos > 0 ? fmtPct(f.anual / ingresos) : '—'}
                  </td>
                  <td className="py-1.5 text-xs text-gray-500 pl-4">{f.destino}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-400 mt-3">
          Esto es lo que gestiona la sociedad. Lo que pagarás tú, a título personal, al declarar la renta con este
          dinero, está en la sección "Declaración de la renta personal" de más abajo.
        </p>
      </div>

      <div className="bg-surface border border-gray-200 rounded-sm p-4">
        <p className="text-sm font-semibold text-gray-900 flex items-center gap-1.5 mb-1">
          <Users size={14} className="text-brand" /> Situación familiar (para el IR personal)
        </p>
        <p className="text-xs text-gray-500 leading-relaxed mb-3">
          Determina el quotient familial ({irGerante.parts} partes con estos datos) usado abajo, en "Declaración de
          la renta personal" — cuantas más partes, menos IR paga la misma rémunération. En Francia, estando casados,
          se declara junto con los ingresos del cónyuge en una única déclaration commune (ver FAQ) — indícalos aquí
          si tiene.
        </p>
        <div className="flex items-end gap-4 flex-wrap">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={casado} onChange={(e) => setCasado(e.target.checked)} />
            Casado / declaración conjunta
          </label>
          <Input
            label="Hijos a cargo"
            type="number"
            min={0}
            value={hijosACargo}
            onChange={(e) => setHijosACargo(Math.max(0, Number(e.target.value)))}
            className="w-32"
          />
          {casado && (
            <Input
              label="Ingresos anuales del cónyuge"
              type="number"
              min={0}
              value={ingresosConyuge}
              onChange={(e) => setIngresosConyuge(Math.max(0, Number(e.target.value)))}
              className="w-48"
            />
          )}
          <Button size="sm" onClick={guardarSituacionFamiliar} disabled={guardandoFamilia}>
            {guardandoFamilia ? 'Guardando...' : 'Guardar'}
          </Button>
        </div>
      </div>

      <div className="bg-surface border border-gray-200 rounded-sm p-4">
        <p className="text-sm font-semibold text-gray-900 flex items-center gap-1.5 mb-1">
          <Landmark size={14} className="text-brand" /> Declaración de la renta personal (impôt sur le revenu)
        </p>
        <p className="text-xs text-gray-500 leading-relaxed mb-3">
          Esto es lo que os pedirá Hacienda, a título personal, por lo que ha entrado en vuestras cuentas este
          ejercicio. Estando casados es UNA sola declaración conjunta del hogar (no cada uno por su cuenta — ver
          FAQ): declaráis el 100% cada uno, Hacienda aplica sola el abattement del 10% a cada sueldo (no es un pago,
          solo reduce la base) y después el barème sobre el total con vuestro quotient familial.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm min-w-[420px]">
            <tbody>
              <tr className="border-t border-gray-100">
                <td className="py-1.5 text-gray-600">Declaras tú (100% — lo que entró en tu cuenta)</td>
                <td className="py-1.5 text-right text-gray-900 whitespace-nowrap">{fmt(irGerante.remuneracionNeta)}</td>
              </tr>
              <tr className="border-t border-gray-100">
                <td className="py-1.5 text-gray-600">
                  − Tu abattement automático 10% frais professionnels <span className="text-gray-400">(no es un pago)</span>
                </td>
                <td className="py-1.5 text-right text-red-700 whitespace-nowrap">− {fmt(irGerante.abattement)}</td>
              </tr>
              {irGerante.ingresosConyuge > 0 && (
                <>
                  <tr className="border-t border-gray-100">
                    <td className="py-1.5 text-gray-600">Declara tu cónyuge (100% — sus ingresos)</td>
                    <td className="py-1.5 text-right text-gray-900 whitespace-nowrap">{fmt(irGerante.ingresosConyuge)}</td>
                  </tr>
                  <tr className="border-t border-gray-100">
                    <td className="py-1.5 text-gray-600">
                      − Su abattement automático 10% <span className="text-gray-400">(no es un pago)</span>
                    </td>
                    <td className="py-1.5 text-right text-red-700 whitespace-nowrap">− {fmt(irGerante.abattementConyuge)}</td>
                  </tr>
                </>
              )}
              <tr className="border-t border-gray-200">
                <td className="py-1.5 font-semibold text-gray-900">= Base imponible del hogar (revenu net imposable)</td>
                <td className="py-1.5 text-right font-semibold text-gray-900 whitespace-nowrap">{fmt(irGerante.revenuNetImposable)}</td>
              </tr>
              <tr className="border-t border-gray-100">
                <td className="py-1.5 text-gray-600">− Impôt sur le revenu a pagar (hogar, {irGerante.parts} partes)</td>
                <td className="py-1.5 text-right text-red-700 whitespace-nowrap">− {fmt(irGerante.impotFinal)}</td>
              </tr>
              {irGerante.ingresosConyuge > 0 && (
                <>
                  <tr className="border-t border-gray-200">
                    <td className="py-1.5 text-gray-500 text-xs" colSpan={2}>
                      Reparto orientativo a prorrata (Hacienda no lo divide así, cobra un único pago solidario del
                      hogar — es solo para entender de dónde sale cada parte):
                    </td>
                  </tr>
                  <tr className="border-t border-gray-100">
                    <td className="py-1.5 text-gray-600 pl-3">Te queda a ti (tu neto − tu parte del impôt)</td>
                    <td className="py-1.5 text-right text-gray-900 whitespace-nowrap">
                      {fmt(irGerante.remuneracionNeta - impotMario)}
                    </td>
                  </tr>
                  <tr className="border-t border-gray-100">
                    <td className="py-1.5 text-gray-600 pl-3">Le queda a tu cónyuge (su neto − su parte del impôt)</td>
                    <td className="py-1.5 text-right text-gray-900 whitespace-nowrap">
                      {fmt(irGerante.ingresosConyuge - impotConyuge)}
                    </td>
                  </tr>
                </>
              )}
              <tr className="border-t-2 border-brand">
                <td className="py-2 font-bold text-gray-900">= Os queda al hogar tras la declaración</td>
                <td className="py-2 text-right font-bold text-brand text-base whitespace-nowrap">
                  {fmt(irGerante.remuneracionNeta + irGerante.ingresosConyuge - irGerante.impotFinal)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-400 mt-3">
          Usa el barème 2026 (revenus 2025, el de 2026 aún no está fijado por ley). No incluye tus dividendos
          (tributan aparte al PFU, ya reflejado como "carga sobre dividendos" en la tabla de arriba) ni otros
          ingresos del foyer — ver FAQ para más detalle.
        </p>
      </div>

      <div className="bg-surface border border-gray-200 rounded-sm p-4">
        <p className="text-sm font-semibold text-gray-900 flex items-center gap-1.5 mb-1">
          <Wallet size={14} className="text-brand" /> Reembolsos de gastos (no es beneficio)
        </p>
        <p className="text-xs text-gray-500 leading-relaxed mb-3">
          Esto es dinero que también entra en tu cuenta personal, pero no es rémunération ni beneficio — es la
          devolución de gastos que ya pagaste tú de tu bolsillo (la vivienda, el coche). No tributa ni lleva
          cotisations, así que se muestra aparte, sin mezclarlo con la tabla de arriba.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm min-w-[560px]">
            <tbody>
              <tr className="border-t border-gray-100">
                <td className="py-1.5 text-gray-600">Indemnité d'occupation vivienda (convention de mise à disposition)</td>
                <td className="py-1.5 text-right text-gray-900 whitespace-nowrap">{fmt(indemniteLocauxMensual)}/mes</td>
                <td className="py-1.5 text-right text-gray-500 whitespace-nowrap pl-4">{fmt(indemniteLocauxMensual * 12)}/año</td>
              </tr>
              <tr className="border-t border-gray-100">
                <td className="py-1.5 text-gray-600">Indemnités kilométriques (registradas en Gastos este ejercicio)</td>
                <td className="py-1.5 text-right text-gray-400 whitespace-nowrap">variable</td>
                <td className="py-1.5 text-right text-gray-900 font-medium whitespace-nowrap pl-4">{fmt(indemnitesKmAnual)}/año</td>
              </tr>
              <tr className="border-t border-gray-100">
                <td className="py-1.5 text-gray-600 align-top pt-2.5">
                  Reembolso teléfono/internet (línea personal usada para la société)
                  <p className="text-[11px] text-gray-400 mt-0.5">Pendiente de confirmar el importe real — editable aquí mientras tanto.</p>
                </td>
                <td className="py-1.5 text-right whitespace-nowrap">
                  <div className="flex items-center gap-1.5 justify-end">
                    <Input
                      type="number"
                      min={0}
                      value={reembolsoTelefono}
                      onChange={(e) => setReembolsoTelefono(Math.max(0, Number(e.target.value)))}
                      className="w-24"
                    />
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        guardarGerante(
                          { reembolso_telefono_mensual: reembolsoTelefono },
                          { onSuccess: () => toast.success('Reembolso de teléfono guardado') },
                        )
                      }
                      disabled={guardandoFamilia}
                    >
                      Guardar
                    </Button>
                  </div>
                </td>
                <td className="py-1.5 text-right text-gray-500 whitespace-nowrap pl-4">{fmt(reembolsoTelefono * 12)}/año</td>
              </tr>
              <tr className="border-t-2 border-brand">
                <td className="py-2 font-bold text-gray-900">Total reembolsos este ejercicio</td>
                <td></td>
                <td className="py-2 text-right font-bold text-brand text-base whitespace-nowrap pl-4">{fmt(reembolsosAnual)}</td>
              </tr>
              <tr>
                <td className="py-1.5 font-semibold text-gray-900">
                  = Total real en tu cuenta (tras cotisations, IS, tu declaración de la renta y los reembolsos)
                </td>
                <td></td>
                <td className="py-1.5 text-right font-semibold text-brand whitespace-nowrap pl-4">{fmt(netoConReembolsos)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-400 mt-3">
          Ojo, esta cifra parte del "dinero limpio" YA con el impôt sur le revenu personal restado (a diferencia de la
          fila "antes de tu declaración de la renta" de la tabla de "De la facturación al bolsillo" más arriba, que
          todavía no lo resta) — por eso puede salir por debajo de esa otra cifra aunque le sumes los reembolsos:{' '}
          {fmt(netoRealFinal)} tras la declaración + {fmt(reembolsosAnual)} de reembolsos = {fmt(netoConReembolsos)}.
        </p>
      </div>

      <div className="bg-surface border border-gray-200 rounded-sm p-4">
        <p className="text-sm font-semibold text-gray-900 flex items-center gap-1.5 mb-1">
          <PiggyBank size={14} className="text-brand" /> Guardar y comparar escenarios
        </p>
        <p className="text-xs text-gray-500 leading-relaxed mb-3">
          Guarda el escenario actual con un nombre para compararlo con otros más abajo — solo vive en esta pantalla, no se
          guarda al recargar la página.
        </p>
        <div className="flex items-end gap-2 flex-wrap mb-3">
          <Input
            label="Nombre del escenario"
            value={nombreEscenario}
            onChange={(e) => setNombreEscenario(e.target.value)}
            placeholder={`Escenario ${escenarios.length + 1}`}
            className="w-56"
          />
          <Button size="sm" onClick={guardarEscenario} disabled={escenarios.length >= 5}>
            Guardar este escenario
          </Button>
          {escenarios.length >= 5 && <span className="text-xs text-gray-400">Máximo 5 escenarios guardados a la vez.</span>}
        </div>
        {escenarios.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm min-w-[720px]">
              <thead>
                <tr className="text-xs text-gray-400">
                  <th className="text-left py-1 font-medium">Nombre</th>
                  <th className="text-right py-1 font-medium">Ingresos − gastos</th>
                  <th className="text-right py-1 font-medium">Rémunération</th>
                  <th className="text-right py-1 font-medium">% div.</th>
                  <th className="text-right py-1 font-medium">Cotisations</th>
                  <th className="text-right py-1 font-medium">IS</th>
                  <th className="text-right py-1 font-medium">IR personal</th>
                  <th className="text-right py-1 font-medium">Neto real</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody>
                {escenarios.map((e) => (
                  <tr key={e.id} className="border-t border-gray-100">
                    <td className="py-1.5 text-gray-900 font-medium">{e.nombre}</td>
                    <td className="py-1.5 text-right text-gray-600">{fmt(e.ingresos - e.gastos)}</td>
                    <td className="py-1.5 text-right text-gray-600">{fmt(e.remuneracion)}</td>
                    <td className="py-1.5 text-right text-gray-600">{e.pctDividendos}%</td>
                    <td className="py-1.5 text-right text-gray-600">{fmt(e.cotisaciones)}</td>
                    <td className="py-1.5 text-right text-gray-600">{fmt(e.is)}</td>
                    <td className="py-1.5 text-right text-gray-600">{fmt(e.irPersonal)}</td>
                    <td className="py-1.5 text-right font-semibold text-brand">{fmt(e.netoReal)}</td>
                    <td className="py-1.5 text-right">
                      <button onClick={() => setEscenarios((prev) => prev.filter((x) => x.id !== e.id))} className="text-gray-300 hover:text-red-600">
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-surface border border-gray-200 rounded-sm p-4">
        <p className="text-sm font-semibold text-gray-900 flex items-center gap-1.5 mb-1">
          <Receipt size={14} className="text-brand" /> TVA estimada (informativa, no forma parte del beneficio)
        </p>
        <p className="text-xs text-gray-500 leading-relaxed mb-3">
          La TVA no es un coste ni un ingreso de la empresa — la cobra el cliente y se descuenta la de los proveedores, es
          un flujo de caja aparte que no afecta al beneficio ni al IS de arriba. Se muestra solo para tener una idea de
          la tesorería a reservar. No incluye la Cotisation Foncière des Entreprises (depende de la valeur locative del
          local, dato que este simulador no tiene — el recordatorio de pago está en "Calendario fiscal").
        </p>
        <div className="flex items-end gap-2 flex-wrap mb-3">
          <Select
            label="TVA en ventas"
            options={OPCIONES_TVA}
            value={String(tvaVentas)}
            onChange={(e) => setTvaVentas(Number(e.target.value))}
            className="w-52"
          />
          <Select
            label="TVA en compras"
            options={OPCIONES_TVA}
            value={String(tvaCompras)}
            onChange={(e) => setTvaCompras(Number(e.target.value))}
            className="w-52"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-gray-400">TVA collectée (ventas)</p>
            <p className="text-base font-semibold text-gray-900">{fmt(tvaCollectee)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">TVA déductible (compras)</p>
            <p className="text-base font-semibold text-gray-900">{fmt(tvaDeductible)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">{tvaNeta >= 0 ? 'TVA neta a pagar' : 'Crédit de TVA'}</p>
            <p className="text-base font-semibold text-brand">{fmt(Math.abs(tvaNeta))}</p>
          </div>
        </div>
      </div>

      {usarDividendos && (
        <div className="bg-surface border border-gray-200 rounded-sm p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 border-b border-gray-200 pb-2 mb-3">
            Neto disponible según % de dividendos (misma rémunération y beneficio)
          </p>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={comparativaDividendos}>
              <CartesianGrid stroke="#e5e7eb" vertical={false} />
              <XAxis dataKey="nombre" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={{ stroke: '#e5e7eb' }} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} width={55} />
              <Tooltip formatter={(valor: unknown) => fmt(Number(valor))} contentStyle={TOOLTIP_STYLE} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="neto" name="Neto disponible" fill="#1a5c38" radius={[2, 2, 0, 0]} />
              <Bar dataKey="prelevements" name="Total prélèvements" fill="#b91c1c" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <Faq
        items={[
          {
            q: '¿En qué se diferencia este simulador de "Salario vs Dividendos"?',
            a: '"Salario vs Dividendos" usa el beneficio REAL del ejercicio en curso (calculado a partir de las Facturas y Gastos ya registrados) y solo deja mover la rémunération y el % de dividendos — sirve para decidir con datos reales de este año. Este "Simulador completo" deja editar también los ingresos, gastos y el capital social, así que puedes plantear escenarios totalmente hipotéticos ("¿y si facturamos el doble el año que viene?" o "¿y si amplío el capital social?") sin que dependa de lo que ya está registrado en el CRM. Internamente usan exactamente la misma fórmula (`simularEjercicio`), así que con los mismos números dan el mismo resultado.',
          },
          {
            q: '¿Qué pasos sigue el cálculo, en orden?',
            a: '1) Se calculan las cotisations TNS sobre la rémunération elegida (assiette = rémunération × 74%, cotisations = assiette × ~45%). 2) Se resta la rémunération y sus cotisations al beneficio bruto (ingresos − gastos) para obtener el beneficio imponible. 3) Se calcula el Impôt sur les Sociétés sobre ese beneficio (15% hasta el plafond prorrateado, 25% el exceso). 4) Si activas "Usar dividendos", se detrae la reserva legal obligatoria y se reparte el % elegido como dividendos. Todo esto es lo que ves en la tabla "De la facturación al bolsillo" — es lo que gestiona la sociedad. 5) Aparte, ya a título personal, sobre la rémunération neta de Mario se aplica el abattement del 10% y el impôt sur le revenu con el quotient familial de su foyer fiscal — eso vive en la sección "Declaración de la renta personal", más abajo, porque es un trámite tuyo, no de la sociedad.',
          },
          {
            q: '¿Por qué la rémunération se calcula sola, sin dividendos?',
            a: 'Cualquier beneficio que se quede en la empresa sin repartir paga Impôt sur les Sociétés (15-25%) y, al no repartir dividendos, se queda ahí retenido sin llegar nunca a Mario — así que siempre compensa más convertirlo en rémunération, que solo paga cotisations TNS (~33-45%) y el resto sí le llega. Por eso, en cuanto pones ingresos y gastos, la rémunération se ajusta sola al margen operativo íntegro (ingresos − gastos) — el "Margen operativo disponible" de la tabla es literalmente la rémunération bruta declarada, sin dejar nada retenido en la empresa. Con la rémunération consumiendo todo el margen, el Impôt sur les Sociétés queda en 0 €. Puedes mover el slider a mano después si quieres explorar otro reparto; volverá a recalcularse en cuanto cambies ingresos o gastos.',
          },
          {
            q: '¿Por qué el simulador precarga ingresos y gastos, y de dónde salen?',
            a: 'Al abrir la pestaña se rellenan los ingresos y gastos con los datos REALES del ejercicio en curso (los mismos que ves en "Impôt sur les Sociétés"), y el capital social y la situación familiar con los ya configurados en "Salario vs Dividendos" y aquí mismo — así no empiezas de 0 €. Es solo un punto de partida: puedes cambiar cualquier cifra libremente y no se guarda nada en la base de datos salvo que pulses "Guardar" en capital social/situación familiar, es puramente una simulación en memoria (salvo el propio Décision PDF, que sí queda descargado y registrado).',
          },
          {
            q: '¿Por qué se puede elegir entre "Año completo" y "Ejercicio en curso"?',
            a: 'El plafond del 15% de IS y el resto de topes anuales se prorratean según los meses del ejercicio simulado — un ejercicio de 6 meses (como el primero de Reformas Ordoñez, jul-dic 2026) tiene el plafond del 15% a la mitad que un año completo. "Año completo" simula un ejercicio normal de 12 meses (útil para proyectar "el año que viene"); "Ejercicio en curso" usa la duración real del ejercicio actual, para comparar directamente con lo que ves en las demás pestañas.',
          },
          {
            q: '¿Para qué sirve el capital social hipotético?',
            a: 'El umbral de dividendos que tributan al PFU en vez de a cotisations TNS es el 10% del capital social (+ compte courant). Con el capital real de Reformas Ordoñez (1.000 €), ese umbral es solo 100 € al año — casi cualquier reparto de dividendos supera esa cifra. Cambiando aquí el capital social (por ejemplo a 10.000 €) puedes ver, sin tocar ningún dato real, cuánto cambiaría el neto disponible si en algún momento se decide ampliar capital.',
          },
          {
            q: '¿Para qué sirve "Usar dividendos también"?',
            a: 'Por defecto los dividendos están desactivados y el slider ni siquiera aparece, porque con el capital social real (1.000 €) casi cualquier dividendo acaba pagando cotisations TNS igual que la rémunération, pero sin generarte derechos de jubilación ni de baja médica — rara vez compensa. Si aun así quieres explorar un reparto con dividendos (por ejemplo tras subir el capital social hipotético), pulsa el botón para que aparezcan el slider de % dividendos y el gráfico comparativo al final de la página. "Quitar dividendos" los vuelve a poner a 0% y oculta ambos otra vez.',
          },
          {
            q: '¿Los escenarios guardados se guardan en algún sitio?',
            a: 'No — solo viven en esta pantalla mientras la tengas abierta. Recargar la página o cambiar de pestaña y volver los borra. Es una comparación rápida entre 2 o 3 combinaciones que estés valorando, no un histórico permanente. Si necesitas conservar una decisión de verdad, usa el botón "Décision de rémunération" (aquí o en "Cotisations URSSAF"), que sí queda registrado en el "Registre des décisions".',
          },
          {
            q: '¿Cómo se calcula el impôt sur le revenu personal y el quotient familial?',
            a: 'La rémunération neta de Mario (rémunération − sus cotisations TNS) tributa personalmente en la categoría "traitements et salaires", con un abattement forfaitario del 10% (topado entre 495 € y 14.171 € en 2026, aplicado a CADA declarante por separado — igual con el sueldo del cónyuge si lo tiene). Sobre lo que queda entre los dos ("revenu net imposable" del hogar) se aplica el barème progresivo (0% hasta 11.600 €, 11% hasta 29.579 €, 30% hasta 84.577 €, 41% hasta 181.917 €, 45% en adelante) — pero no directamente: primero se divide entre el número de "partes" del foyer fiscal (quotient familial: 2 partes por estar casado + 0,5 por cada uno de los dos primeros hijos a cargo, configurable en "Situación familiar"), se calcula el impôt de esa cifra por parte, y se multiplica de nuevo por el número de partes. Cuantas más partes, menos impôt para el mismo ingreso — con un tope: el ahorro de cada media parte extra por hijos está limitado a 1.807 € (plafonnement, art. 197 CGI). Por último se aplica la décote, una rebaja adicional automática para impôts brutos bajos. Los dividendos NO entran en este cálculo — tributan aparte al PFU (o TNS si superan el umbral), que ya se ve en la tabla como "carga sobre dividendos".',
          },
          {
            q: '¿Se declara junto con mi mujer, o cada uno por su cuenta?',
            a: 'Junto — estando casados, Francia obliga a UNA sola déclaration commune para todo el hogar (a diferencia de España, donde declarar conjunto o separado es opcional). No hay forma de que cada cónyuge declare "por su cuenta": vuestros dos sueldos se suman en la misma declaración y se reparten entre las mismas partes del quotient familial. Esto está verificado a mano en el simulador oficial de la DGFiP (simulateur-ir-ifi.impots.gouv.fr): con 40.020 € tuyos + 18.000 € de tu mujer y 2,5 partes, la Administración da 2.554 € de droits simples, 327 € de décote y 2.227 € de impôt net — cifras que esta pestaña reproduce exactamente. Sí importa cuánto gana ella: con sus ingresos a 0 €, el mismo caso da 0 € de IR (por debajo del umbral de no-imposición de 2,5 partes); con sus 18.000 € reales, sube a 2.227 €.',
          },
          {
            q: '¿Hay alguna forma de reducir la carga sin tocar rémunération ni dividendos?',
            a: 'Las indemnités kilométriques son un caso real: si Mario usa su vehículo personal para ir a las obras, la empresa puede reembolsarle un importe por kilómetro (barème oficial fijado por Hacienda, sin revalorizar desde 2023) como gasto deducible del beneficio — y ese reembolso no lleva ni cotisations TNS ni impuesto sobre la renta para él, a diferencia de la rémunération. La única regla estricta es no acumularlo con otros gastos ya pagados por la empresa para el mismo vehículo (gasolina, seguro, mantenimiento) — el barème ya los cubre todos a la vez; solo peajes y aparcamiento se pueden añadir aparte con justificante. Este simulador no lo modela (no tiene datos de kilómetros), pero es una palanca real a comentar con el expert-comptable.',
          },
          {
            q: '¿Qué NO tiene en cuenta este simulador?',
            a: 'No modela: pérdidas de ejercicios anteriores compensables (report en avant), la régularisation de cotisations TNS del primer año (que se calcula sobre una base forfaitaria provisional, no sobre la rémunération real), la Cotisation Foncière des Entreprises (depende de datos del ayuntamiento que no tenemos), ni matices de TVA por tipo de trabajo línea a línea. En el IR personal tampoco modela: otros ingresos del hogar aparte del sueldo del cónyuge (alquileres, inversiones...), la opción de tributar los dividendos por barème en vez de PFU (rara vez conviene con estos importes, pero es legalmente posible), ni otras deducciones/créditos de impôt del foyer (donativos, empleo en casa, etc.). El barème usado es el de 2026 sobre revenus 2025 — el barème real de 2026 aún no está fijado por ley y se actualizará en fiscal_config en cuanto se publique. Es una estimación orientativa para comparar escenarios, no una liquidación fiscal — para una cifra definitiva antes de tomar una decisión importante, consulta siempre a tu expert-comptable.',
          },
        ]}
      />
    </div>
  );
}
