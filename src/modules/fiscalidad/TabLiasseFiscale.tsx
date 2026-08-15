import { useMemo, useState } from 'react';
import { FileText, AlertTriangle } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { useToast } from '../../hooks/useToast';
import { conAvisoDescarga } from '../../lib/conAvisoDescarga';
import { mensajeError } from '../../lib/mensajeError';
import { generarPdfLiasseFiscale } from '../../lib/generarPdfLiasseFiscale';
import { useFiscalConfig } from './useFiscalConfig';
import { useGerantConfig } from './useGerantConfig';
import { useResultadoEjercicio } from './useResultadoEjercicio';
import { useComptaFrancia } from './useComptaFrancia';
import { calcularIS, calcularReservaLegal, calcularTNS, limitesEjercicio, mesesTranscurridosEjercicio } from './calculos';
import { Faq } from './Faq';

function fmt(n: number) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n);
}

function Fila({ label, valor, negrita }: { label: string; valor: number; negrita?: boolean }) {
  return (
    <tr className="border-t border-gray-100">
      <td className={`py-1.5 text-gray-700 ${negrita ? 'font-semibold text-gray-900' : ''}`}>{label}</td>
      <td className={`py-1.5 text-right ${negrita ? 'font-semibold text-gray-900' : 'text-gray-600'}`}>{fmt(valor)}</td>
    </tr>
  );
}

export function TabLiasseFiscale() {
  const toast = useToast();
  const [generando, setGenerando] = useState(false);
  const anio = new Date().getFullYear();
  const ejercicio = limitesEjercicio(anio);
  const { config } = useFiscalConfig();
  const { gerantConfig } = useGerantConfig();
  const { beneficioBruto } = useResultadoEjercicio(ejercicio.inicio, ejercicio.fin);
  const { compteResultat, bilanActivo, activos, cargando } = useComptaFrancia(anio);

  const mesesTranscurridos = useMemo(() => mesesTranscurridosEjercicio(ejercicio), [ejercicio]);
  const remuneracionAnual = gerantConfig?.remuneracion_anual ?? 0;
  const remuneracionPeriodo = remuneracionAnual * (mesesTranscurridos / 12);
  const cotisacionesPeriodo = calcularTNS(remuneracionAnual, config).total * (mesesTranscurridos / 12);
  const beneficioNeto = Math.max(0, beneficioBruto - remuneracionPeriodo - cotisacionesPeriodo);
  const is = calcularIS(beneficioNeto, ejercicio.meses, config);
  const resultadoNeto = Math.max(0, beneficioNeto - is.total);
  const capitalSocial = gerantConfig?.capital_social ?? 1000;
  const reservaLegal = calcularReservaLegal(resultadoNeto, capitalSocial, config);

  const bilanPasivo = useMemo(() => {
    const reservas = reservaLegal.reservaAcumuladaPrevia + reservaLegal.dotacion;
    return {
      capitalSocial,
      reservas,
      resultadoEjercicio: resultadoNeto,
      dettesFiscales: is.total,
      dettesFournisseurs: 0,
      total: capitalSocial + reservas + resultadoNeto + is.total,
    };
  }, [capitalSocial, reservaLegal, resultadoNeto, is.total]);

  const descuadre = bilanActivo.total - bilanPasivo.total;

  const handleDescargar = async () => {
    setGenerando(true);
    try {
      await conAvisoDescarga(
        () => generarPdfLiasseFiscale(anio, { compteResultat, bilanActivo, bilanPasivo, resultadoNeto, is, activos }),
        toast,
      );
    } catch (err) {
      toast.error(mensajeError(err, 'No se pudo generar el documento'));
    } finally {
      setGenerando(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-surface border border-gray-200 rounded-sm p-4">
        <p className="text-sm font-semibold text-gray-900 flex items-center gap-1.5 mb-2">
          <FileText size={14} className="text-brand" /> Preparación de la liasse fiscale
        </p>
        <p className="text-xs text-gray-600 leading-relaxed">
          Compte de résultat y bilan simplificado calculados desde el libro diario (
          <code>/contabilidad/diario</code>) y el registro de inmovilizado. Cubre lo esencial para preparar la
          declaración (2058-A/2054/2055/2050/2051/2052/2053) — no sustituye el formulario Cerfa oficial ni su
          transmisión EDI-TDFC, que quedan como paso posterior tuyo (con un partenaire EDI o tu experto-contable).
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-surface border border-gray-200 rounded-sm p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 border-b border-gray-200 pb-2 mb-1">
            Compte de résultat — {anio}
          </p>
          <table className="w-full text-sm">
            <tbody>
              <Fila label="Ventes (706)" valor={compteResultat.ventas} />
              <Fila label="Charges d'exploitation" valor={-compteResultat.cargasExplotacion} />
              <Fila label="Résultat d'exploitation" valor={compteResultat.resultadoExplotacion} negrita />
              <Fila label="Résultat financier" valor={compteResultat.resultadoFinanciero} />
              <Fila label="Résultat exceptionnel" valor={compteResultat.resultadoExcepcional} />
              <Fila label="Résultat comptable avant IS" valor={compteResultat.resultadoAntesIS} negrita />
              <Fila label="Impôt sur les Sociétés" valor={-is.total} />
              <Fila label="Résultat net" valor={resultadoNeto} negrita />
            </tbody>
          </table>
        </div>

        <div className="bg-surface border border-gray-200 rounded-sm p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 border-b border-gray-200 pb-2 mb-1">
            Bilan simplificado — {anio}
          </p>
          <p className="text-xs text-gray-500 mb-2">Actif</p>
          <table className="w-full text-sm mb-3">
            <tbody>
              <Fila label="Trésorerie (512)" valor={bilanActivo.tresoreria} />
              <Fila label="Créances clients" valor={bilanActivo.creancesClients} />
              <Fila label="Immobilisations (valeur nette)" valor={bilanActivo.inmovilizadoNeto} />
              <Fila label="Total actif" valor={bilanActivo.total} negrita />
            </tbody>
          </table>
          <p className="text-xs text-gray-500 mb-2">Passif</p>
          <table className="w-full text-sm">
            <tbody>
              <Fila label="Capital social" valor={bilanPasivo.capitalSocial} />
              <Fila label="Réserves" valor={bilanPasivo.reservas} />
              <Fila label="Résultat de l'exercice" valor={bilanPasivo.resultadoEjercicio} />
              <Fila label="Dettes fiscales (IS)" valor={bilanPasivo.dettesFiscales} />
              <Fila label="Dettes fournisseurs" valor={bilanPasivo.dettesFournisseurs} />
              <Fila label="Total passif" valor={bilanPasivo.total} negrita />
            </tbody>
          </table>
          <p className="text-xs text-gray-400 mt-2">
            "Dettes fournisseurs" siempre a 0 € — los Gastos se registran en el CRM como ya pagados en su fecha, no
            hay estado de pago pendiente a proveedor. Limitación conocida, no un dato real verificado.
          </p>
          {Math.abs(descuadre) > 0.01 && (
            <p className="text-xs text-amber-700 flex items-start gap-1.5 mt-2 bg-amber-50 border border-amber-200 rounded-sm px-2.5 py-2">
              <AlertTriangle size={13} className="shrink-0 mt-0.5" />
              El bilan no cuadra exactamente (diferencia de {fmt(descuadre)}) — normal dado el límite de las dettes
              fournisseurs de arriba y que este simulador no lleva un balance de apertura entre ejercicios.
            </p>
          )}
        </div>
      </div>

      <div className="bg-surface border border-gray-200 rounded-sm p-4">
        <p className="text-sm font-semibold text-gray-900 mb-1">Descargar resumen para transmisión</p>
        <p className="text-xs text-gray-500 leading-relaxed mb-3">
          PDF con estas mismas cifras organizadas por sección (2058-A, 2054/2055, 2050/2051, 2052/2053) y el
          registro de inmovilizado completo — para entregar a un partenaire EDI o a tu experto-contable.
        </p>
        <Button onClick={handleDescargar} disabled={generando || cargando}>
          {generando ? 'Generando...' : `Descargar resumen de liasse fiscale ${anio} (PDF)`}
        </Button>
      </div>

      <Faq
        items={[
          {
            q: '¿Este PDF es la declaración oficial?',
            a: 'No. Es un resumen de preparación interna con las cifras ya calculadas, organizado por las secciones de la liasse fiscale real (2058-A, 2054/2055, 2050/2051, 2052/2053). La declaración oficial se presenta por vía electrónica (EDI-TDFC), un trámite aparte que no hace este documento.',
          },
          {
            q: '¿Por qué el compte de résultat de aquí no coincide exactamente con el de Impôt sur les Sociétés?',
            a: 'El de "Impôt sur les Sociétés" es un cálculo aproximado directo de Facturas y Gastos (ingresos − gastos HT). Este se calcula desde el libro diario (asientos_contables), que solo refleja lo que ya tiene un asiento contable real — si hay gastos de Francia sin cuenta contable asignada, quedan en la cuenta de espera 471 en vez de en su grupo de gasto real, y eso puede generar una pequeña diferencia hasta que todos los gastos estén bien clasificados.',
          },
          {
            q: '¿Qué son las "dettes fournisseurs" y por qué siempre están a 0 €?',
            a: 'Son las facturas de proveedores que la empresa aún no ha pagado. El CRM no lleva ese seguimiento hoy — cada gasto se registra como ya pagado en su fecha. Por eso el bilan puede no cuadrar exactamente: es una limitación real, mostrada explícitamente en vez de disimulada.',
          },
        ]}
      />
    </div>
  );
}
