import { useNavigate, useParams } from 'react-router-dom';
import AsistenteIvaPage from '../contabilidad/AsistenteIvaPage';
import { DashboardFiscal } from './DashboardFiscal';
import { TabIS } from './TabIS';
import { TabCotisations } from './TabCotisations';
import { TabSalarioDividendos } from './TabSalarioDividendos';
import { TabSimulador } from './TabSimulador';
import { TabCalendario } from './TabCalendario';
import { TabDocumentos } from './TabDocumentos';
import { TabInmovilizado } from './TabInmovilizado';
import { TabLiasseFiscale } from './TabLiasseFiscale';
import { TabCierreEjercicio } from './TabCierreEjercicio';
import { Faq } from './Faq';

type Pestana =
  | 'dashboard'
  | 'tva'
  | 'is'
  | 'cotisations'
  | 'salario'
  | 'simulador'
  | 'calendario'
  | 'documentos'
  | 'inmovilizado'
  | 'liasse'
  | 'cierre';

const PESTANAS: { value: Pestana; label: string }[] = [
  { value: 'dashboard', label: 'Dashboard' },
  { value: 'tva', label: 'TVA' },
  { value: 'is', label: 'Impôt sur les Sociétés' },
  { value: 'cotisations', label: 'Cotisations URSSAF' },
  { value: 'salario', label: 'Salario vs Dividendos' },
  { value: 'simulador', label: 'Simulador completo' },
  { value: 'calendario', label: 'Calendario fiscal' },
  { value: 'documentos', label: 'Documentos obligatorios' },
  { value: 'inmovilizado', label: 'Inmovilizado' },
  { value: 'liasse', label: 'Liasse fiscale' },
  { value: 'cierre', label: 'Cierre de ejercicio' },
];

export default function FiscalidadPage() {
  const { tab } = useParams<{ tab: string }>();
  const navigate = useNavigate();
  const pestana: Pestana = PESTANAS.some((p) => p.value === tab) ? (tab as Pestana) : 'dashboard';

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900 mb-1">Fiscalidad</h1>
      <p className="text-sm text-gray-500 mb-4">
        Impôt sur les Sociétés, cotisations TNS del gérant, TVA, calendario de échéances, inmovilizado, preparación de
        la liasse fiscale y asistente de cierre de ejercicio — EURL Reformas Ordoñez.
      </p>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {PESTANAS.map((t) => (
          <button
            key={t.value}
            onClick={() => navigate(`/fiscalidad/${t.value}`)}
            className={`px-3 py-1.5 rounded-sm text-xs font-semibold uppercase tracking-wide border transition-colors ${
              pestana === t.value
                ? 'bg-brand text-white border-brand'
                : 'bg-surface border-gray-200 text-gray-600 hover:border-brand'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {pestana === 'dashboard' && <DashboardFiscal />}
      {pestana === 'tva' && (
        <div className="flex flex-col gap-4">
          <p className="text-xs text-gray-500 leading-relaxed">
            Declaración mensual de TVA (CA3): elige el mes, revisa las líneas calculadas automáticamente a partir de tus
            Facturas y Gastos, y márcalo como declarado una vez presentado en impots.gouv.fr. Es la misma pestaña que
            "Contabilidad → IVA" — cualquier cambio se ve reflejado en ambos sitios.
          </p>
          <AsistenteIvaPage />
          <Faq
            items={[
              {
                q: '¿Qué son las líneas A1 y A3?',
                a: 'Son las casillas del formulario oficial CA3. A1 ("Ventes, prestations de services") es la base sin IVA de todo lo que has facturado ese mes. A3 ("Achats de prestations de services intracommunautaires") recoge compras a proveedores de otros países de la UE con autoliquidación de IVA — en el caso de Reformas Ordoñez normalmente estará a 0 salvo que compres servicios a un proveedor francés/europeo fuera de España con ese régimen especial.',
              },
              {
                q: '¿Qué es el "crédit reporté" (línea 22)?',
                a: 'Si en un mes la TVA déductible supera a la collectée, el excedente no se pierde: se "arrastra" (reporte) al mes siguiente como crédito a tu favor, reduciendo lo que tengas que pagar entonces. Este campo te deja introducir manualmente ese crédito heredado del mes anterior si no coincide con lo que calcula el CRM automáticamente.',
              },
              {
                q: '¿Los tres tipos de TVA (10%, 20%, 5,5%) cuándo se aplican?',
                a: 'El 10% se aplica a la rénovation de viviendas de más de 2 años de antigüedad (el caso más habitual en la actividad de Reformas Ordoñez), siempre que el cliente firme una "attestation" confirmando la antigüedad. El 20% es el tipo general, para obra nueva o cuando no aplica ningún tipo reducido. El 5,5% es para obras de rénovation énergétique (aislamiento, calderas eficientes, etc.) que cumplan los requisitos específicos. Se elige por factura, no por cliente ni por mes.',
              },
              {
                q: '¿Qué pasa si declaro tarde una CA3?',
                a: 'La DGFiP aplica un recargo (majoration) del 10% sobre el importe de TVA a pagar, que puede subir si el retraso es largo o se repite. Por eso conviene marcar cada CA3 en el "Calendario fiscal" en cuanto se declara, y vigilar el badge "Urgente" que aparece cuando quedan menos de 7 días.',
              },
            ]}
          />
        </div>
      )}
      {pestana === 'is' && <TabIS />}
      {pestana === 'cotisations' && <TabCotisations />}
      {pestana === 'salario' && <TabSalarioDividendos />}
      {pestana === 'simulador' && <TabSimulador />}
      {pestana === 'calendario' && <TabCalendario />}
      {pestana === 'documentos' && <TabDocumentos />}
      {pestana === 'inmovilizado' && <TabInmovilizado />}
      {pestana === 'liasse' && <TabLiasseFiscale />}
      {pestana === 'cierre' && <TabCierreEjercicio />}

      <p className="text-xs text-gray-400 text-center mt-4">
        Herramienta de estimación interna. No sustituye el asesoramiento de un expert-comptable.
      </p>
    </div>
  );
}
