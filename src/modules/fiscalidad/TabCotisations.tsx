import { useEffect, useState } from 'react';
import { AlertTriangle, FileText, PiggyBank } from 'lucide-react';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Select';
import { useToast } from '../../hooks/useToast';
import { conAvisoDescarga } from '../../lib/conAvisoDescarga';
import { mensajeError } from '../../lib/mensajeError';
import { generarPdfDecisionRemuneracion, generarPdfResumenTNS } from '../../lib/generarPdfRemuneracion';
import { useFiscalConfig } from './useFiscalConfig';
import { useGerantConfig } from './useGerantConfig';
import { calcularTNS } from './calculos';
import { Fuente } from './Fuente';
import { Faq } from './Faq';

const MESES_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function fmt(n: number) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n);
}

const DESGLOSE_REFERENCIA = [
  { concepto: 'Maladie', taux: '0 – 7,2% (progresivo)', cubre: 'Seguro de enfermedad — consultas, hospitalización, medicamentos' },
  { concepto: 'Indemnités journalières (IJ)', taux: '0,85%', cubre: 'Pago diario si el gérant está de baja por enfermedad' },
  { concepto: 'Retraite de base', taux: '17,75% hasta PASS', cubre: 'Pensión de jubilación del régimen general' },
  { concepto: 'Retraite complémentaire', taux: '7 – 8%', cubre: 'Pensión de jubilación complementaria (encima de la de base)' },
  { concepto: 'Invalidité-décès', taux: '1,3%', cubre: 'Pensión si el gérant queda incapacitado, o para la familia en caso de fallecimiento' },
  { concepto: 'CSG-CRDS', taux: '9,7%', cubre: 'Contribución social generalizada — financia la Sécurité Sociale en general' },
  { concepto: 'CFP', taux: 'forfait', cubre: 'Formation Professionnelle — da derecho a formación continua' },
];

export function TabCotisations() {
  const { config, fuente } = useFiscalConfig();
  const { gerantConfig, guardar, guardando } = useGerantConfig();
  const [remuneracion, setRemuneracion] = useState(0);
  const [mesResumen, setMesResumen] = useState(new Date().getMonth() + 1);
  const [generandoDecision, setGenerandoDecision] = useState(false);
  const [generandoResumen, setGenerandoResumen] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (gerantConfig) setRemuneracion(gerantConfig.remuneracion_anual);
  }, [gerantConfig]);

  const tns = calcularTNS(remuneracion, config);
  const pass = config('pass_2026', 47100);
  const anio = new Date().getFullYear();

  const handleDecision = async () => {
    setGenerandoDecision(true);
    try {
      await conAvisoDescarga(() => generarPdfDecisionRemuneracion(anio, remuneracion, gerantConfig?.capital_social ?? 1000), toast);
    } catch (err) {
      toast.error(mensajeError(err, 'No se pudo generar el documento'));
    } finally {
      setGenerandoDecision(false);
    }
  };

  const handleResumenMensual = async () => {
    setGenerandoResumen(true);
    try {
      await conAvisoDescarga(() => generarPdfResumenTNS(anio, mesResumen, remuneracion, config), toast);
    } catch (err) {
      toast.error(mensajeError(err, 'No se pudo generar el documento'));
    } finally {
      setGenerandoResumen(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-brand-light border border-gray-200 rounded-sm px-3 py-2 text-xs text-brand leading-relaxed">
        <strong>Reforma 2026:</strong> las cotisations TNS del gérant ya no se calculan sobre el revenu bruto, sino sobre una{' '}
        <strong>assiette única con abatimiento del 26%</strong> (assiette = rémunération × 0,74), salvo en la fracción de
        rémunération que supera el 130% del PASS ({fmt(pass * 1.3)}), donde no se aplica el abatimiento.
        <div className="mt-1.5">
          <Fuente url={fuente('tns_abattement')} />
        </div>
      </div>

      {anio === 2026 && (
        <div className="bg-amber-50 border border-amber-300 rounded-sm px-3 py-2 text-xs text-amber-800">
          Primer año: cotisations provisionales sobre base forfaitaria (aprox. 3.000–3.500 €/año), con régularisation en 2027
          sobre los ingresos reales de 2026.
        </div>
      )}

      <div className="bg-surface border border-gray-200 rounded-sm p-4">
        <p className="text-sm font-semibold text-gray-900 flex items-center gap-1.5 mb-3">
          <PiggyBank size={14} className="text-brand" /> Simulador — rémunération del gérant
        </p>
        <div className="flex items-end gap-2 flex-wrap">
          <Input
            label="Rémunération anual"
            type="number"
            min={0}
            value={remuneracion}
            onChange={(e) => setRemuneracion(Number(e.target.value))}
            className="w-48"
          />
          <Button onClick={() => guardar({ remuneracion_anual: remuneracion })} disabled={guardando}>
            {guardando ? 'Guardando...' : 'Guardar'}
          </Button>
        </div>

        {remuneracion === 0 && (
          <div className="mt-3 bg-amber-50 border border-amber-300 rounded-sm px-3 py-2 flex items-center gap-2 text-xs text-amber-800">
            <AlertTriangle size={14} className="shrink-0" />
            Aunque el gérant no se remunere hay cotisations mínimas (retraite base, invalidité-décès) a pagar.
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
          <div>
            <p className="text-xs text-gray-400">Assiette (con abatimiento)</p>
            <p className="text-lg font-semibold text-gray-900">{fmt(tns.assiette)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Cotisations anuales</p>
            <p className="text-lg font-semibold text-brand">{fmt(tns.total)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Cotisations mensuales</p>
            <p className="text-lg font-semibold text-gray-900">{fmt(tns.mensual)}</p>
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-3">
          Cálculo: assiette = {fmt(remuneracion)} × {((1 - config('tns_abattement', 0.26)) * 100).toFixed(0)}% ={' '}
          {fmt(tns.assiette)}. Cotisations = assiette × {(config('tns_taux_global', 0.45) * 100).toFixed(0)}% (taux global
          efectivo) = {fmt(tns.total)}.
        </p>
      </div>

      <div className="bg-surface border border-gray-200 rounded-sm p-4">
        <p className="text-sm font-semibold text-gray-900 flex items-center gap-1.5 mb-1">
          <FileText size={14} className="text-brand" /> Documentos del gérant
        </p>
        <p className="text-xs text-gray-500 leading-relaxed mb-3">
          Como gérant majoritaire TNS, Mario no genera un bulletin de paie legal (no está sujeto al Code du travail) — estos dos
          documentos son el registro real que sí hace falta: el acta que fija la rémunération y un justificante interno mensual.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 flex items-end gap-2 flex-wrap">
            <Button onClick={handleDecision} disabled={generandoDecision || remuneracion === 0}>
              {generandoDecision ? 'Generando...' : `Décision de rémunération ${anio} (PDF)`}
            </Button>
          </div>
          <div className="flex-1 flex items-end gap-2 flex-wrap">
            <Select
              label="Mes"
              options={MESES_ES.map((m, i) => ({ value: String(i + 1), label: m }))}
              value={String(mesResumen)}
              onChange={(e) => setMesResumen(Number(e.target.value))}
              className="w-36"
            />
            <Button onClick={handleResumenMensual} disabled={generandoResumen || remuneracion === 0}>
              {generandoResumen ? 'Generando...' : 'Resumen mensual (PDF)'}
            </Button>
          </div>
        </div>
        {remuneracion === 0 && (
          <p className="text-xs text-gray-400 mt-2">Configura una rémunération mayor que 0 € arriba para poder generarlos.</p>
        )}
      </div>

      <div className="bg-surface border border-gray-200 rounded-sm p-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 border-b border-gray-200 pb-2 mb-3">
          Desglose por cotisation (tasas de referencia, orientativas)
        </p>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm min-w-[560px]">
            <thead>
              <tr className="text-xs text-gray-400">
                <th className="text-left py-1 font-medium">Cotisation</th>
                <th className="text-left py-1 font-medium">Qué cubre</th>
                <th className="text-right py-1 font-medium">Taux</th>
              </tr>
            </thead>
            <tbody>
              {DESGLOSE_REFERENCIA.map((d) => (
                <tr key={d.concepto} className="border-t border-gray-100">
                  <td className="py-1.5 text-gray-900 font-medium whitespace-nowrap">{d.concepto}</td>
                  <td className="py-1.5 text-gray-500">{d.cubre}</td>
                  <td className="py-1.5 text-right text-gray-500 whitespace-nowrap">{d.taux}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Faq
        items={[
          {
            q: '¿Qué es un "gérant TNS"?',
            a: 'TNS son las siglas de Travailleur Non Salarié (trabajador no asalariado). Mario, como gérant majoritaire (socio único con más del 50% del capital) de una EURL, no tiene un contrato laboral como un empleado — se paga a sí mismo una rémunération, y por ello cotiza al régimen de la Sécurité Sociale des Indépendants (SSI) en vez de al régimen general de asalariados. Las reglas de cálculo de sus cotizaciones son distintas de las de un empleado normal, y es justo lo que simula esta pestaña.',
          },
          {
            q: '¿Por qué no hay un "bulletin de paie" para el gérant, y qué son los 2 documentos de arriba?',
            a: 'Un bulletin de paie es un documento del Code du travail francés, obligatorio para quien tiene un contrat de travail — y un gérant majoritaire TNS no lo tiene, cotiza vía la SSI como se explica arriba, no como asalariado. No hay obligación legal de emitirlo. Lo que sí existe: la "Décision de rémunération" es el acta real que fija formalmente cuánto se paga el gérant cada ejercicio (respaldo societario de las cifras de este simulador), y el "Resumen mensual" es un justificante interno de archivo, útil para llevar la cuenta, pero que no sustituye ni pretende ser un bulletin de paie legal. Si en algún momento Reformas Ordoñez contrata personal asalariado real, ahí sí haría falta nómina legal con DSN mensual — un trámite regulado que no cubre este generador.',
          },
          {
            q: '¿Por qué la assiette es menor que la rémunération? Ejemplo con números',
            a: 'Desde la reforma 2026 (LFSS 2024), las cotisations TNS ya no se calculan sobre el salario bruto completo, sino sobre una "assiette única" con un abatimiento del 26% — se asume que ese 26% ya cubre ciertas cargas que antes se calculaban aparte. Por eso assiette = rémunération × 0,74. Ejemplo: con una rémunération de 20.000 €/año, la assiette es 20.000 × 0,74 = 14.800 €, y las cotisations anuales serían 14.800 × 45% = 6.660 €. Con 40.000 €/año, la assiette sube a 29.600 € y las cotisations a 13.320 €. Este abatimiento solo aplica hasta el 130% del PASS; la parte de rémunération que supera ese tope no lleva abatimiento (se cotiza sobre el 100% de esa fracción).',
          },
          {
            q: '¿Qué es el PASS y por qué importa aquí?',
            a: 'El PASS (Plafond Annuel de la Sécurité Sociale) es una cifra de referencia que fija el Estado francés cada año y que se usa como tope o base de cálculo en muchas prestaciones y cotizaciones sociales. Aquí se usa solo para saber a partir de qué rémunération deja de aplicarse el abatimiento del 26% (el 130% del PASS). Las fuentes oficiales para 2026 varían entre 46.368 € y 48.060 €; el valor usado (configurable en fiscal_config, clave pass_2026) está marcado como "a verificar" hasta que se confirme en urssaf.fr.',
          },
          {
            q: '¿Por qué hay cotisations aunque no me pague nada (rémunération = 0)?',
            a: 'La Sécurité Sociale des Indépendants exige unas cotisations mínimas (sobre todo retraite de base e invalidité-décès) incluso con rémunération de 0 €, para garantizar al gérant una cobertura social mínima (que le cuenten trimestres de jubilación, por ejemplo) aunque no se pague ningún salario ese año. En la práctica suelen ser unos pocos cientos de euros al año, no los miles que verías con una rémunération alta — este simulador simplificado no calcula ese mínimo exacto, solo avisa de que existe.',
          },
          {
            q: '¿De dónde sale el 45% de "taux global efectivo"? ¿Por qué no se desglosa exactamente?',
            a: 'El taux real es progresivo (cambia según el nivel de ingresos) y resulta de sumar todas las cotisations individuales de la tabla de abajo (Maladie, ambas jubilaciones, invalidité-décès, CSG-CRDS, CFP...). Sumar ese barème completo da, en la práctica, un taux global entre el 40% y el 45% aproximadamente. El simulador usa ese 45% como aproximación única configurable en vez de replicar el barème progresivo exacto de la URSSAF, que además cambia cada año — así el cálculo se mantiene simple y siempre editable desde fiscal_config sin tocar código.',
          },
          {
            q: '¿Qué es la "régularisation" del primer año?',
            a: 'El primer año de actividad, la URSSAF no conoce aún los ingresos reales del gérant, así que cobra unas cotisations "provisionales" calculadas sobre una base forfaitaria (un importe fijo estándar, aprox. 3.000–3.500 €/año). Un año después (en 2027, sobre los ingresos reales de 2026), hace la "régularisation": compara lo que se pagó de forma provisional con lo que realmente correspondía según la rémunération real, y cobra la diferencia (o la devuelve si se pagó de más). Es importante reservar tesorería para esa posible regularización.',
          },
          {
            q: '¿Qué pasa si subo mucho la rémunération, por encima del PASS?',
            a: 'A partir del 130% del PASS (61.230 € con el valor por defecto de 2026), la fracción de rémunération que supera ese umbral deja de tener el abatimiento del 26% — se cotiza sobre el 100% de esa parte en vez de sobre el 74%. Por eso, a partir de ese punto, la assiette (y las cotisations) crecen más rápido que antes en proporción a la rémunération. Prueba a subir la rémunération por encima de 61.230 € en el simulador de arriba para ver el efecto.',
          },
        ]}
      />

      <p className="text-xs text-gray-400 text-center">
        Herramienta de estimación interna. No sustituye el asesoramiento de un expert-comptable.
      </p>
    </div>
  );
}
