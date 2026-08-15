import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, TrendingUp, Landmark } from 'lucide-react';
import { useFiscalConfig } from './useFiscalConfig';
import { useGerantConfig } from './useGerantConfig';
import { useResultadoEjercicio } from './useResultadoEjercicio';
import { simularEjercicio, limitesEjercicio, mesesTranscurridosEjercicio } from './calculos';
import { TOOLTIP_STYLE } from '../../lib/chartStyles';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Fuente } from './Fuente';
import { Faq } from './Faq';

function fmt(n: number) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n);
}

export function TabSalarioDividendos() {
  const anio = new Date().getFullYear();
  const ejercicio = limitesEjercicio(anio);
  const { config, fuente } = useFiscalConfig();
  const { gerantConfig, guardar, guardando } = useGerantConfig();
  const { beneficioBruto } = useResultadoEjercicio(ejercicio.inicio, ejercicio.fin);
  const capitalSocial = gerantConfig?.capital_social ?? 1000;
  // Antes hardcodeado a 0 en todas las llamadas a simularEjercicio() de más abajo — el umbral libre de
  // cotisations TNS sobre dividendos (capitalSocial + compteCourantMedio) × 10% nunca llegaba a
  // contar el compte courant real, así que salía sistemáticamente más bajo de lo real (bug real
  // corregido 2026-08-11).
  const compteCourantMedio = gerantConfig?.compte_courant_medio ?? 0;
  // Igual que TabIS.tsx: `beneficioBruto` (useResultadoEjercicio) solo suma lo facturado/gastado
  // hasta HOY, no el ejercicio completo — usar `ejercicio.meses` para el plafond del 15% de IS
  // infla ese plafond respecto a un beneficio parcial y da una cifra de IS distinta (más optimista)
  // que la que muestra "Impôt sur les Sociétés" para el mismo beneficio real (bug real, auditoría
  // 2026-08-15).
  const mesesTranscurridos = useMemo(() => mesesTranscurridosEjercicio(ejercicio), [ejercicio]);

  const [remuneracion, setRemuneracion] = useState(30000);
  const [pctDividendos, setPctDividendos] = useState(50);
  const [capitalInput, setCapitalInput] = useState('');
  const [compteCourantInput, setCompteCourantInput] = useState('');

  useEffect(() => {
    if (gerantConfig) {
      setCapitalInput(String(gerantConfig.capital_social ?? 1000));
      setCompteCourantInput(String(gerantConfig.compte_courant_medio ?? 0));
    }
  }, [gerantConfig]);

  const resultado = useMemo(
    () => simularEjercicio(remuneracion, pctDividendos, beneficioBruto, capitalSocial, compteCourantMedio, mesesTranscurridos, config),
    [remuneracion, pctDividendos, beneficioBruto, capitalSocial, compteCourantMedio, mesesTranscurridos, config],
  );

  const escenarios = useMemo(() => {
    const todoSalario = simularEjercicio(beneficioBruto, 0, beneficioBruto, capitalSocial, compteCourantMedio, mesesTranscurridos, config);
    const salario30kDiv = simularEjercicio(30000, 100, beneficioBruto, capitalSocial, compteCourantMedio, mesesTranscurridos, config);
    const salario30kReservas = simularEjercicio(30000, 0, beneficioBruto, capitalSocial, compteCourantMedio, mesesTranscurridos, config);
    return [
      { nombre: 'Todo salario', neto: todoSalario.netoDisponible, prelevements: todoSalario.totalPrelevements },
      { nombre: 'Salario 30k + dividendos', neto: salario30kDiv.netoDisponible, prelevements: salario30kDiv.totalPrelevements },
      { nombre: 'Salario 30k + reservas', neto: salario30kReservas.netoDisponible, prelevements: salario30kReservas.totalPrelevements },
    ];
  }, [beneficioBruto, capitalSocial, compteCourantMedio, mesesTranscurridos, config]);

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-surface border border-gray-200 rounded-sm p-4">
        <p className="text-sm font-semibold text-gray-900 flex items-center gap-1.5 mb-1">
          <Landmark size={14} className="text-brand" /> Capital social y compte courant
        </p>
        <p className="text-xs text-gray-500 leading-relaxed mb-3">
          Determinan el umbral libre de cotisations TNS sobre dividendos (10% de capital + compte courant, ver aviso más
          abajo si se supera). Sin formulario propio hasta ahora, solo editables entrando a mano en Supabase.
        </p>
        <div className="flex items-end gap-2 flex-wrap">
          <Input
            label="Capital social"
            type="number"
            min={0}
            value={capitalInput}
            onChange={(e) => setCapitalInput(e.target.value)}
            className="w-48"
          />
          <Input
            label="Compte courant d'associé medio"
            type="number"
            min={0}
            value={compteCourantInput}
            onChange={(e) => setCompteCourantInput(e.target.value)}
            className="w-56"
          />
          <Button
            onClick={() => guardar({ capital_social: Number(capitalInput) || 0, compte_courant_medio: Number(compteCourantInput) || 0 })}
            disabled={guardando}
          >
            {guardando ? 'Guardando...' : 'Guardar'}
          </Button>
        </div>
      </div>

      <div className="bg-surface border border-gray-200 rounded-sm p-4">
        <p className="text-sm font-semibold text-gray-900 flex items-center gap-1.5 mb-1">
          <TrendingUp size={14} className="text-brand" /> Optimizador salario vs dividendos
        </p>
        <p className="text-xs text-gray-500 leading-relaxed mb-3">
          Reparte el beneficio del ejercicio ({fmt(beneficioBruto)} antes de rémunération) entre salario del gérant y
          dividendos, y compara cuánto termina pagando en cotisations, IS y flat tax en cada combinación. El % de dividendos se
          aplica sobre el <strong>beneficio distribuible</strong> (lo que queda del beneficio después de restar la
          rémunération, sus cotisations TNS, el IS y el 5% de reserva legal que exige el Artículo 18 de los estatutos hasta
          que esa reserva llegue al 10% del capital social) — si ese beneficio es 0 o negativo, no hay nada que repartir y el
          slider no cambiará las cifras hasta que la empresa sea rentable en el período.
        </p>
        <div className="flex flex-col gap-3">
          <div>
            <label className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
              Rémunération anual <span className="text-gray-900 normal-case">{fmt(remuneracion)}</span>
            </label>
            <input
              type="range"
              min={0}
              max={100000}
              step={1000}
              value={remuneracion}
              onChange={(e) => setRemuneracion(Number(e.target.value))}
              className="w-full accent-brand"
            />
          </div>
          <div>
            <label className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
              % beneficio restante como dividendos <span className="text-gray-900 normal-case">{pctDividendos}%</span>
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
      </div>

      {resultado.beneficioDistribuible === 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-sm px-3 py-2 flex items-start gap-2 text-xs text-gray-600">
          <AlertTriangle size={14} className="shrink-0 mt-0.5 text-gray-400" />
          <span>
            No hay beneficio distribuible con esta rémunération: tras restar {fmt(remuneracion)} de salario y{' '}
            {fmt(resultado.tns.total)} de sus cotisations{resultado.is.total > 0 ? ` y ${fmt(resultado.is.total)} de IS` : ''} al
            beneficio del ejercicio, queda {fmt(resultado.beneficioTrasSalario - resultado.is.total)}. Mueve el slider de
            rémunération hacia abajo, o espera a que el beneficio del ejercicio crezca, para poder repartir dividendos.
          </span>
        </div>
      )}

      {resultado.reservaLegal.dotacion > 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-sm px-3 py-2 flex items-start gap-2 text-xs text-gray-600">
          <AlertTriangle size={14} className="shrink-0 mt-0.5 text-gray-400" />
          <span>
            Reserva legal (Artículo 18 de los estatutos): {fmt(resultado.reservaLegal.dotacion)} de este ejercicio van
            obligatoriamente a la reserva antes de poder repartir nada, hasta que acumule {fmt(resultado.reservaLegal.tope)} (10%
            del capital social). Reserva ya acumulada de ejercicios anteriores: {fmt(resultado.reservaLegal.reservaAcumuladaPrevia)}
            {' '}— editable en fiscal_config (clave reserva_legal_acumulada) cuando se confirme la cifra real con el
            expert-comptable.
          </span>
        </div>
      )}

      {resultado.divCalc.superaSeuil && (
        <div className="bg-amber-50 border border-amber-300 rounded-sm px-3 py-2 flex items-start gap-2 text-xs text-amber-800">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <span>
            Con un capital social de {fmt(capitalSocial)}, el umbral libre de cotisations TNS es solo{' '}
            {fmt(resultado.divCalc.umbralLibre)}. {fmt(resultado.divCalc.exceso)} de dividendos superan ese umbral y llevan
            cotisations TNS (~{(config('tns_taux_global', 0.45) * 100).toFixed(0)}%) en vez del PFU del 30%. Puede convenir ampliar
            el capital social para elevar el umbral del 10%.
          </span>
        </div>
      )}
      {resultado.divCalc.superaSeuil && (
        <div className="-mt-2">
          <Fuente url={fuente('dividendes_seuil_capital')} />
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-surface border border-gray-200 rounded-sm p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Dividendos a repartir</p>
          <p className="text-lg font-semibold text-gray-900">{fmt(resultado.dividendos)}</p>
          <p className="text-xs text-gray-400 mt-1">{pctDividendos}% de {fmt(resultado.beneficioDistribuible)} distribuibles</p>
        </div>
        <div className="bg-surface border border-gray-200 rounded-sm p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Cotisations TNS (salario)</p>
          <p className="text-lg font-semibold text-gray-900">{fmt(resultado.tns.total)}</p>
        </div>
        <div className="bg-surface border border-gray-200 rounded-sm p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">IS sobre beneficio restante</p>
          <p className="text-lg font-semibold text-gray-900">{fmt(resultado.is.total)}</p>
        </div>
        <div className="bg-surface border border-gray-200 rounded-sm p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Carga sobre dividendos</p>
          <p className="text-lg font-semibold text-gray-900">{fmt(resultado.divCalc.total)}</p>
        </div>
        <div className="bg-surface border border-gray-200 rounded-sm p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Neto disponible Mario</p>
          <p className="text-lg font-semibold text-brand">{fmt(resultado.netoDisponible)}</p>
        </div>
      </div>

      <div className="bg-surface border border-gray-200 rounded-sm p-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 border-b border-gray-200 pb-2 mb-3">
          Comparativa de escenarios
        </p>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={escenarios}>
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
            q: '¿Qué es un dividendo y por qué es distinto de la rémunération?',
            a: 'La rémunération es el salario que se paga el gérant por su trabajo — es un gasto de la empresa (reduce el beneficio antes del IS) y el gérant paga cotisations TNS sobre ella. El dividendo es un reparto del beneficio ya obtenido, DESPUÉS de haber pagado el IS — no es un gasto deducible, sino una distribución del resultado. Por eso este simulador calcula primero salario → cotisations → IS, y solo con lo que sobra de ahí puede haber dividendos.',
          },
          {
            q: '¿Qué es el PFU (flat tax)?',
            a: 'El PFU (Prélèvement Forfaitaire Unique), conocido como "flat tax", es un tipo fijo del 30% que se aplica a los dividendos de personas físicas en Francia: 12,8% de impuesto sobre la renta (IR) + 17,2% de prélèvements sociaux. Es la tributación "normal" de un dividendo — pero solo se aplica a la parte de dividendos que NO supera el umbral del 10% del capital social (ver siguiente pregunta).',
          },
          {
            q: 'Muevo el slider de dividendos y no cambia nada, ¿por qué?',
            a: 'El % se aplica sobre el beneficio distribuible (lo que queda tras salario, sus cotisations e IS), no sobre el beneficio bruto del ejercicio. Si ese beneficio distribuible es 0 — por ejemplo porque la rémunération elegida ya consume todo el beneficio del ejercicio, o porque el ejercicio va en pérdidas — el 0% de 0 € y el 100% de 0 € dan igual: 0 €. Verás un aviso gris explicándolo con las cifras exactas justo encima de las tarjetas cuando esto ocurra. Para ver el slider "funcionando", baja la rémunération o simula con un beneficio del ejercicio mayor (registrando más facturas, por ejemplo).',
          },
          {
            q: '¿Por qué casi todos los dividendos llevan cotisations TNS en vez del PFU del 30%?',
            a: 'Porque el capital social de Reformas Ordoñez es de 1.000 € y el umbral libre de cotisations TNS es el 10% del capital (+ compte courant), es decir solo 100 € al año. Cualquier dividendo por encima de esa cifra se considera "remuneración encubierta" por la Administración francesa (una forma de evitar que los gérants majoritaires se paguen todo en dividendos para esquivar las cotisations sociales) y lleva cotisations TNS (~45%) en la parte que excede, en vez del PFU del 30%. Ampliar el capital social (por ejemplo a 10.000 €) elevaría el umbral libre a 1.000 €/año.',
          },
          {
            q: 'Ejemplo completo con números',
            a: 'Supongamos un beneficio del ejercicio de 50.000 €, una rémunération de 30.000 € y un 50% del resto como dividendos. Cotisations TNS sobre el salario: 30.000 × 0,74 × 45% = 9.990 €. Beneficio tras salario: 50.000 − 30.000 − 9.990 = 10.010 €. IS (ejercicio de 6 meses, plafond 21.250 €): 10.010 × 15% = 1.501,50 €. Beneficio tras IS: 10.010 − 1.501,50 = 8.508,50 €. Reserva legal (Artículo 18 de los estatutos, 5% hasta el 10% del capital social = 100 €, sin reserva acumulada previa): 8.508,50 × 5% = 425,43 €, pero se detrae solo hasta el tope de 100 €. Beneficio distribuible: 8.508,50 − 100 = 8.408,50 €. Dividendos (50%): 4.204,25 €. De esos, solo 100 € quedan bajo el umbral libre (PFU 30% = 30 €); los 4.104,25 € restantes llevan IR del 12,8% (525,34 €) + cotisations TNS del 45% (1.846,91 €) = 2.402,26 € de carga. Total prélèvements: 9.990 + 1.501,50 + 2.402,26 = 13.893,76 €. Neto disponible para Mario: 30.000 − 9.990 + 4.204,25 − 2.402,26 = 21.811,99 €.',
          },
          {
            q: '¿Qué diferencia hay entre "Neto disponible Mario" y "Total prélèvements"?',
            a: 'Neto disponible es lo que Mario recibe realmente en el bolsillo (salario neto de cotisations + dividendos netos de su carga sobre dividendos). Total prélèvements es la suma de todo lo que se ha pagado a la Administración por esa combinación de salario/dividendos: cotisations TNS del salario + IS de la empresa + carga sobre los dividendos. Cuanto más bajo el total de prélèvements para un mismo beneficio de partida, más eficiente fiscalmente es ese reparto — pero no es el único criterio: la rémunération también genera más derechos de jubilación y baja por enfermedad que el dividendo.',
          },
          {
            q: '¿Qué son los tres escenarios de la comparativa?',
            a: '"Todo salario" reparte el 100% del beneficio del ejercicio como rémunération y 0 € de dividendos — maximiza las cotisations sociales pagadas (y por tanto los derechos sociales del gérant) pero suele minimizar el neto disponible por el alto taux del 45%. "Salario 30k + dividendos" fija la rémunération en 30.000 € y reparte TODO el resto del beneficio como dividendos (100%). "Salario 30k + reservas" fija la misma rémunération de 30.000 € pero deja el resto del beneficio SIN repartir, como reservas dentro de la empresa (ni cotisations TNS ni PFU sobre esa parte, pero tampoco disponible para Mario este año). Son puntos de referencia fijos para comparar — no cambian con los sliders de arriba, que controlan el escenario "actual" de las 5 tarjetas.',
          },
          {
            q: '¿Por qué "reservas" puede convenir aunque el neto sea menor este año?',
            a: 'Dejar beneficio como reservas no genera ni cotisations TNS ni PFU ese año — el dinero se queda en la empresa (por ejemplo para comprar herramientas, un vehículo, o como colchón de tesorería) y solo tributará cuando se reparta como dividendo en el futuro, o nunca si se reinvierte. Es una palanca de planificación fiscal a medio plazo, no solo una cuestión de "cuánto cobro este mes".',
          },
        ]}
      />
    </div>
  );
}
