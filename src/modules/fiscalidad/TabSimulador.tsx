import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Calculator, AlertTriangle, Receipt, Building2 } from 'lucide-react';
import { TOOLTIP_STYLE } from '../../lib/chartStyles';
import { useFiscalConfig } from './useFiscalConfig';
import { useGerantConfig } from './useGerantConfig';
import { useResultadoEjercicio } from './useResultadoEjercicio';
import { simularEjercicio, limitesEjercicio, mesesTranscurridosEjercicio } from './calculos';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Faq } from './Faq';

function fmt(n: number) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n);
}

function fmtPct(n: number) {
  return new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 1 }).format(n);
}

const OPCIONES_TVA = [
  { value: '10', label: '10% (travaux rénovation)' },
  { value: '20', label: '20% (taux normal)' },
];

export function TabSimulador() {
  const anio = new Date().getFullYear();
  const ejercicioActual = limitesEjercicio(anio);
  const { config } = useFiscalConfig();
  const { gerantConfig } = useGerantConfig();
  const { ingresosHT, gastosHT } = useResultadoEjercicio(ejercicioActual.inicio, ejercicioActual.fin);
  const capitalSocial = gerantConfig?.capital_social ?? 1000;
  const compteCourantMedio = gerantConfig?.compte_courant_medio ?? 0;

  const [ingresos, setIngresos] = useState(0);
  const [gastos, setGastos] = useState(0);
  const [remuneracion, setRemuneracion] = useState(0);
  const [pctDividendos, setPctDividendos] = useState(50);
  const [duracion, setDuracion] = useState<'completo' | 'actual'>('completo');
  const [tvaVentas, setTvaVentas] = useState(10);
  const [tvaCompras, setTvaCompras] = useState(20);

  // Precarga una vez con los datos reales del ejercicio en curso como punto de partida — el
  // usuario puede cambiarlos libremente después, es solo para no arrancar desde 0 € cada vez.
  const [precargado, setPrecargado] = useState(false);
  useEffect(() => {
    if (precargado) return;
    if (ingresosHT === 0 && gastosHT === 0 && !gerantConfig) return;
    setIngresos(Math.round(ingresosHT));
    setGastos(Math.round(gastosHT));
    setRemuneracion(Math.round(gerantConfig?.remuneracion_anual ?? 0));
    setPrecargado(true);
  }, [ingresosHT, gastosHT, gerantConfig, precargado]);

  // "Ejercicio en curso" usa los meses YA TRANSCURRIDOS, no la duración total del ejercicio — igual
  // que TabIS.tsx/TabSalarioDividendos.tsx, para que el plafond del 15% de IS sea coherente con las
  // demás pestañas cuando se simula con el beneficio real de hoy (bug real, auditoría 2026-08-15).
  // "Año completo" sigue usando 12 meses tal cual: es una proyección explícita a un año entero, no
  // el progreso real del ejercicio actual.
  const meses = duracion === 'completo' ? 12 : mesesTranscurridosEjercicio(ejercicioActual);
  const beneficioBruto = ingresos - gastos;

  const resultado = useMemo(
    () => simularEjercicio(remuneracion, pctDividendos, beneficioBruto, capitalSocial, compteCourantMedio, meses, config),
    [remuneracion, pctDividendos, beneficioBruto, capitalSocial, compteCourantMedio, meses, config],
  );

  const tipoEfectivoGlobal = ingresos > 0 ? resultado.totalPrelevements / ingresos : 0;
  const tvaCollectee = Math.max(0, ingresos) * (tvaVentas / 100);
  const tvaDeductible = Math.max(0, gastos) * (tvaCompras / 100);
  const tvaNeta = tvaCollectee - tvaDeductible;

  const comparativaDividendos = useMemo(
    () =>
      [0, 25, 50, 75, 100].map((pct) => {
        const r = simularEjercicio(remuneracion, pct, beneficioBruto, capitalSocial, compteCourantMedio, meses, config);
        return { nombre: `${pct}% div.`, neto: r.netoDisponible, prelevements: r.totalPrelevements };
      }),
    [remuneracion, beneficioBruto, capitalSocial, compteCourantMedio, meses, config],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-surface border border-gray-200 rounded-sm p-4">
        <p className="text-sm font-semibold text-gray-900 flex items-center gap-1.5 mb-2">
          <Calculator size={14} className="text-brand" /> Simulador completo — Reformas Ordoñez (EURL, Francia)
        </p>
        <p className="text-xs text-gray-600 leading-relaxed">
          Introduce una cifra hipotética de ingresos y gastos (por ejemplo, "¿cuánto pagaríamos si facturamos 150.000 €
          con 90.000 € de gastos?") y este simulador encadena exactamente el mismo cálculo real que usa el resto de
          Fiscalidad: rémunération y cotisations TNS del gérant → Impôt sur les Sociétés → reserva legal obligatoria →
          reparto de dividendos. Empieza precargado con los datos reales del ejercicio en curso — cámbialos libremente,
          no afecta a ningún dato guardado.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-surface border border-gray-200 rounded-sm p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">Ingresos y gastos hipotéticos</p>
          <div className="flex flex-col gap-3">
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
          </div>
          <p className="text-xs text-gray-400 mt-3">
            Beneficio bruto (antes de rémunération del gérant): <span className="font-semibold text-gray-700">{fmt(beneficioBruto)}</span>
          </p>
        </div>

        <div className="bg-surface border border-gray-200 rounded-sm p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">Rémunération y dividendos</p>
          <div className="flex flex-col gap-3">
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
            <div>
              <label className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
                % del beneficio distribuible como dividendos <span className="text-gray-900 normal-case">{pctDividendos}%</span>
              </label>
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
          </div>
          <p className="text-xs text-gray-400 mt-3">
            Capital social {fmt(capitalSocial)} y compte courant medio {fmt(compteCourantMedio)} — editables en la pestaña
            "Salario vs Dividendos".
          </p>
        </div>
      </div>

      {resultado.reservaLegal.dotacion > 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-sm px-3 py-2 flex items-start gap-2 text-xs text-gray-600">
          <AlertTriangle size={14} className="shrink-0 mt-0.5 text-gray-400" />
          <span>
            Reserva legal (Artículo 18 de los estatutos): {fmt(resultado.reservaLegal.dotacion)} de este ejercicio simulado
            van obligatoriamente a la reserva antes de repartir dividendos, hasta acumular {fmt(resultado.reservaLegal.tope)}{' '}
            (10% del capital social).
          </span>
        </div>
      )}

      {resultado.divCalc.superaSeuil && (
        <div className="bg-amber-50 border border-amber-300 rounded-sm px-3 py-2 flex items-start gap-2 text-xs text-amber-800">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <span>
            {fmt(resultado.divCalc.exceso)} de los dividendos superan el umbral libre de {fmt(resultado.divCalc.umbralLibre)} y
            llevan cotisations TNS (~{(config('tns_taux_global', 0.45) * 100).toFixed(0)}%) en vez del PFU del 30%.
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-surface border border-gray-200 rounded-sm p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Cotisations TNS (rémunération)</p>
          <p className="text-lg font-semibold text-gray-900">{fmt(resultado.tns.total)}</p>
        </div>
        <div className="bg-surface border border-gray-200 rounded-sm p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Impôt sur les Sociétés</p>
          <p className="text-lg font-semibold text-gray-900">{fmt(resultado.is.total)}</p>
        </div>
        <div className="bg-surface border border-gray-200 rounded-sm p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Dividendos brutos repartidos</p>
          <p className="text-lg font-semibold text-gray-900">{fmt(resultado.dividendos)}</p>
        </div>
        <div className="bg-surface border border-gray-200 rounded-sm p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Carga sobre dividendos</p>
          <p className="text-lg font-semibold text-gray-900">{fmt(resultado.divCalc.total)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-brand-light border border-gray-200 rounded-sm p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-brand mb-2">Total impuestos y cotisations</p>
          <p className="text-xl font-semibold text-brand">{fmt(resultado.totalPrelevements)}</p>
        </div>
        <div className="bg-brand-light border border-gray-200 rounded-sm p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-brand mb-2">Neto disponible para Mario</p>
          <p className="text-xl font-semibold text-brand">{fmt(resultado.netoDisponible)}</p>
        </div>
        <div className="bg-surface border border-gray-200 rounded-sm p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Tipo efectivo sobre ingresos</p>
          <p className="text-xl font-semibold text-gray-900">{fmtPct(tipoEfectivoGlobal)}</p>
          <p className="text-xs text-gray-400 mt-1">total impuestos y cotisations ÷ ingresos</p>
        </div>
      </div>

      <div className="bg-surface border border-gray-200 rounded-sm p-4">
        <p className="text-sm font-semibold text-gray-900 flex items-center gap-1.5 mb-1">
          <Receipt size={14} className="text-brand" /> TVA estimada (informativa, no forma parte del beneficio)
        </p>
        <p className="text-xs text-gray-500 leading-relaxed mb-3">
          La TVA no es un coste ni un ingreso de la empresa — la cobra el cliente y se descuenta la de los proveedores, es
          un flujo de caja aparte que no afecta al beneficio ni al IS de arriba. Se muestra solo para tener una idea de
          la tesorería a reservar cada trimestre.
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
        <p className="text-xs text-gray-400 mt-3">
          Estimación simplificada con un único tipo por lado — una factura real puede mezclar tipos (10%/20%) según la
          línea. Para el detalle real mes a mes, usa la pestaña "TVA".
        </p>
      </div>

      <div className="bg-surface border border-gray-200 rounded-sm p-4">
        <p className="text-sm font-semibold text-gray-900 flex items-center gap-1.5 mb-1">
          <Building2 size={14} className="text-brand" /> Cotisation Foncière des Entreprises (CFE) — no incluida
        </p>
        <p className="text-xs text-gray-500 leading-relaxed">
          La CFE depende de la valeur locative del local donde se ejerce la actividad y de la tasa que fija cada
          ayuntamiento — datos que este simulador no tiene, así que no se estima aquí para no dar una cifra inventada.
          El recordatorio de pago está en la pestaña "Calendario fiscal".
        </p>
      </div>

      <div className="bg-surface border border-gray-200 rounded-sm p-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 border-b border-gray-200 pb-2 mb-3">
          Neto disponible según % de dividendos (misma rémunención y beneficio)
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

      <Faq
        items={[
          {
            q: '¿En qué se diferencia este simulador de "Salario vs Dividendos"?',
            a: '"Salario vs Dividendos" usa el beneficio REAL del ejercicio en curso (calculado a partir de las Facturas y Gastos ya registrados) y solo deja mover la rémunención y el % de dividendos — sirve para decidir con datos reales de este año. Este "Simulador completo" deja editar también los ingresos y gastos, así que puedes plantear escenarios totalmente hipotéticos ("¿y si facturamos el doble el año que viene?") sin que dependa de lo que ya está registrado en el CRM. Internamente usan exactamente la misma fórmula (`simularEjercicio`), así que con los mismos números dan el mismo resultado.',
          },
          {
            q: '¿Qué pasos sigue el cálculo, en orden?',
            a: '1) Se calculan las cotisations TNS sobre la rémunención elegida. 2) Se resta la rémunención y sus cotisations al beneficio bruto (ingresos − gastos) para obtener el beneficio imponible. 3) Se calcula el Impôt sur les Sociétés sobre ese beneficio (15% hasta el plafond prorrateado, 25% el exceso). 4) Se detrae la reserva legal obligatoria (5% del beneficio tras IS, hasta el 10% del capital social — Artículo 18 de los estatutos). 5) Lo que queda es el "beneficio distribuible", del que se reparte el % elegido como dividendos. 6) Los dividendos que superan el umbral libre (10% de capital social + compte courant) tributan como cotisations TNS en vez del PFU del 30%.',
          },
          {
            q: '¿Por qué el simulador precarga cifras y de dónde salen?',
            a: 'Al abrir la pestaña se rellenan los ingresos y gastos con los datos REALES del ejercicio en curso (los mismos que ves en "Impôt sur les Sociétés"), y la rémunención con la que ya está configurada en "Salario vs Dividendos" — así no empiezas de 0 €. Es solo un punto de partida: puedes cambiar cualquier cifra libremente y no se guarda nada en la base de datos, es puramente una simulación en memoria.',
          },
          {
            q: '¿Por qué se puede elegir entre "Año completo" y "Ejercicio en curso"?',
            a: 'El plafond del 15% de IS y el resto de topes anuales se prorratean según los meses del ejercicio simulado — un ejercicio de 6 meses (como el primero de Reformas Ordoñez, jul-dic 2026) tiene el plafond del 15% a la mitad que un año completo. "Año completo" simula un ejercicio normal de 12 meses (útil para proyectar "el año que viene"); "Ejercicio en curso" usa la duración real del ejercicio actual, para comparar directamente con lo que ves en las demás pestañas.',
          },
          {
            q: '¿Qué NO tiene en cuenta este simulador?',
            a: 'No modela: pérdidas de ejercicios anteriores compensables (report en avant), la régularisation de cotisations TNS del primer año (que se calcula sobre una base forfaitaria provisional, no sobre la rémunención real), la Cotisation Foncière des Entreprises (depende de datos del ayuntamiento que no tenemos), ni matices de TVA por tipo de trabajo línea a línea. Es una estimación orientativa para comparar escenarios, no una liquidación fiscal — para una cifra definitiva antes de tomar una decisión importante, consulta siempre a tu expert-comptable.',
          },
        ]}
      />
    </div>
  );
}
