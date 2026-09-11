import { useState } from 'react';
import { FileText, AlertTriangle } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Select';
import { InfoTooltip } from '../../components/ui/InfoTooltip';
import { useToast } from '../../hooks/useToast';
import { conAvisoDescarga } from '../../lib/conAvisoDescarga';
import { mensajeError } from '../../lib/mensajeError';
import { generarPdfLiasseFiscale } from '../../lib/generarPdfLiasseFiscale';
import { generarPdfLivreInventaire } from '../../lib/generarPdfLivreInventaire';
import { useComptaFrancia } from './useComptaFrancia';
import { useEjercicioFiscal } from './useEjercicioFiscal';
import { calcularBilanPasivo } from './calculos';
import { fmt } from './format';
import { Faq } from './Faq';
import { ResumenTitular } from './ResumenTitular';

const ANIO_ACTUAL = new Date().getFullYear();
const ANIOS = [ANIO_ACTUAL - 1, ANIO_ACTUAL];

function Fila({ label, valor, negrita }: { label: string; valor: number; negrita?: boolean }) {
  return (
    <tr className="border-t border-gray-100">
      <td className={`py-1.5 text-gray-700 ${negrita ? 'font-semibold text-gray-900' : ''}`}>{label}</td>
      <td className={`py-1.5 text-right ${negrita ? 'font-semibold text-gray-900' : 'text-gray-600'}`}>{fmt(valor)}</td>
    </tr>
  );
}

export function TabLiasseFiscale({ anio, onAnioChange }: { anio: number; onAnioChange: (anio: number) => void }) {
  const toast = useToast();
  const [generando, setGenerando] = useState(false);
  const [generandoInventaire, setGenerandoInventaire] = useState(false);
  const { is, resultadoNeto, capitalSocial, reservaLegal } = useEjercicioFiscal(anio);
  const { compteResultat, bilanActivo, activos, cargando } = useComptaFrancia(anio);

  const bilanPasivo = calcularBilanPasivo(resultadoNeto, reservaLegal, is, capitalSocial);
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

  const handleDescargarInventaire = async () => {
    setGenerandoInventaire(true);
    try {
      await conAvisoDescarga(
        () => generarPdfLivreInventaire(anio, { bilanActivo, bilanPasivo, activos }),
        toast,
      );
    } catch (err) {
      toast.error(mensajeError(err, 'No se pudo generar el documento'));
    } finally {
      setGenerandoInventaire(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Select
        label="Ejercicio"
        options={ANIOS.map((a) => ({ value: String(a), label: String(a) }))}
        value={String(anio)}
        onChange={(e) => onAnioChange(Number(e.target.value))}
        className="w-32"
      />

      <ResumenTitular icono={FileText}>
        Con los datos de {anio}, el resultado neto tras Impôt sur les Sociétés es{' '}
        <strong className="text-brand">{fmt(resultadoNeto)}</strong> (IS de {fmt(is.total)} sobre un resultado antes de
        impuestos de {fmt(compteResultat.resultadoAntesIS)}).
      </ResumenTitular>
      <p className="text-xs text-gray-400 px-1">
        Calculado desde el libro diario (<code>/contabilidad/diario</code>) y el registro de inmovilizado — no
        sustituye el formulario Cerfa oficial ni su transmisión EDI-TDFC, que quedan como paso posterior tuyo (con
        un partenaire EDI o tu experto-contable).
      </p>

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
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 border-b border-gray-200 pb-2 mb-1 flex items-center gap-1.5">
            Bilan simplificado — {anio}
            <InfoTooltip>
              "Dettes fournisseurs" siempre a 0 € — los Gastos se registran en el CRM como ya pagados en su fecha, no
              hay estado de pago pendiente a proveedor. Limitación conocida, no un dato real verificado.
            </InfoTooltip>
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
        <p className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-1.5">
          Descargar resumen para transmisión
          <InfoTooltip>
            PDF con estas mismas cifras organizadas por sección (2058-A, 2054/2055, 2050/2051, 2052/2053) y el
            registro de inmovilizado completo — para entregar a un partenaire EDI o a tu experto-contable.
          </InfoTooltip>
        </p>
        <Button onClick={handleDescargar} disabled={generando || cargando}>
          {generando ? 'Generando...' : `Descargar resumen de liasse fiscale ${anio} (PDF)`}
        </Button>
      </div>

      <div className="bg-surface border border-gray-200 rounded-sm p-4">
        <p className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-1.5">
          Livre d'inventaire
          <InfoTooltip>
            Mismo actif/passif de arriba, en el formato del inventaire anual (art. L123-12 Code de commerce). Desde
            2015 ya no hace falta libro físico cosido y foliado — basta con conservar el soporte que justifique el
            contenido del inventario (art. R123-173-1), que es justo lo que genera este PDF.
          </InfoTooltip>
        </p>
        <Button variant="secondary" onClick={handleDescargarInventaire} disabled={generandoInventaire || cargando}>
          {generandoInventaire ? 'Generando...' : `Descargar livre d'inventaire ${anio} (PDF)`}
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
