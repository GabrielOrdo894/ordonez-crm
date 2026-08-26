import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  LayoutDashboard,
  Calculator,
  CalendarClock,
  Landmark,
  ClipboardCheck,
  type LucideIcon,
} from 'lucide-react';
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

const ETIQUETAS: Record<Pestana, string> = {
  dashboard: 'Resumen',
  tva: 'TVA',
  is: 'Impôt sur les Sociétés',
  cotisations: 'Cotisations URSSAF',
  salario: 'Salario vs Dividendos',
  simulador: 'Simulador completo',
  calendario: 'Calendario fiscal',
  documentos: 'Documentos obligatorios',
  inmovilizado: 'Inmovilizado',
  liasse: 'Liasse fiscale',
  cierre: 'Cierre de ejercicio',
};

// Las 11 pestañas de siempre, agrupadas por la pregunta real que responden en vez de por orden de
// creación — mismo patrón de datos que GRUPOS_NAV en ConfiguracionPage.tsx, adaptado a pills de 2
// filas (categoría → subpestaña) porque aquí cada pestaña sustituye todo el contenido, no es una
// página larga de scroll. Ninguna ruta /fiscalidad/:tab cambia, solo cómo se llega a ellas.
type ItemStandalone = { tipo: 'standalone'; value: Pestana; icon: LucideIcon };
type ItemGrupo = { tipo: 'grupo'; id: string; label: string; icon: LucideIcon; tabs: Pestana[] };
type ItemNav = ItemStandalone | ItemGrupo;

function esGrupo(item: ItemNav): item is ItemGrupo {
  return item.tipo === 'grupo';
}

const NAV: ItemNav[] = [
  { tipo: 'standalone', value: 'dashboard', icon: LayoutDashboard },
  { tipo: 'grupo', id: 'obligaciones', label: 'Obligaciones mensuales', icon: CalendarClock, tabs: ['tva', 'cotisations', 'calendario'] },
  { tipo: 'grupo', id: 'is', label: 'Impôt sur les Sociétés', icon: Landmark, tabs: ['is', 'salario'] },
  { tipo: 'standalone', value: 'simulador', icon: Calculator },
  { tipo: 'grupo', id: 'cierre', label: 'Cierre y documentación', icon: ClipboardCheck, tabs: ['inmovilizado', 'cierre', 'liasse', 'documentos'] },
];

const TODAS_LAS_PESTANAS = Object.keys(ETIQUETAS) as Pestana[];

export default function FiscalidadPage() {
  const { tab } = useParams<{ tab: string }>();
  const navigate = useNavigate();
  const pestana: Pestana = TODAS_LAS_PESTANAS.includes(tab as Pestana) ? (tab as Pestana) : 'dashboard';

  // El ejercicio elegido vive aquí (no en cada pestaña) para que se recuerde al moverte entre
  // Impôt sur les Sociétés, Cotisations, Salario vs Dividendos y Liasse fiscale.
  const [anioFiscal, setAnioFiscal] = useState(new Date().getFullYear());

  const grupoActivo = NAV.filter(esGrupo).find((item) => item.tabs.includes(pestana));

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900 mb-1">Fiscalidad</h1>
      <p className="text-sm text-gray-500 mb-4">
        Impôt sur les Sociétés, cotisations TNS del gérant, TVA, calendario de échéances, inmovilizado, preparación de
        la liasse fiscale y asistente de cierre de ejercicio — EURL Reformas Ordoñez.
      </p>

      <div className={`flex items-center gap-2 flex-wrap ${grupoActivo ? 'mb-2' : 'mb-4'}`}>
        {NAV.map((item) => {
          const activo = item.tipo === 'standalone' ? pestana === item.value : grupoActivo?.id === item.id;
          const destino = item.tipo === 'standalone' ? item.value : item.tabs[0];
          const label = item.tipo === 'standalone' ? ETIQUETAS[item.value] : item.label;
          return (
            <button
              key={item.tipo === 'standalone' ? item.value : item.id}
              onClick={() => navigate(`/fiscalidad/${destino}`)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-semibold uppercase tracking-wide border transition-colors ${
                activo ? 'bg-brand text-white border-brand' : 'bg-surface border-gray-200 text-gray-600 hover:border-brand'
              }`}
            >
              <item.icon size={13} />
              {label}
            </button>
          );
        })}
      </div>

      {grupoActivo && (
        <div className="flex items-center gap-1.5 mb-4 flex-wrap">
          {grupoActivo.tabs.map((t) => (
            <button
              key={t}
              onClick={() => navigate(`/fiscalidad/${t}`)}
              className={`px-2.5 py-1 rounded-sm text-[11px] font-medium border transition-colors ${
                pestana === t ? 'bg-brand-light text-brand border-brand' : 'bg-surface border-gray-200 text-gray-500 hover:border-brand'
              }`}
            >
              {ETIQUETAS[t]}
            </button>
          ))}
        </div>
      )}

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
      {pestana === 'is' && <TabIS anio={anioFiscal} onAnioChange={setAnioFiscal} />}
      {pestana === 'cotisations' && <TabCotisations anio={anioFiscal} onAnioChange={setAnioFiscal} />}
      {pestana === 'salario' && <TabSalarioDividendos anio={anioFiscal} onAnioChange={setAnioFiscal} />}
      {pestana === 'simulador' && <TabSimulador />}
      {pestana === 'calendario' && <TabCalendario />}
      {pestana === 'documentos' && <TabDocumentos />}
      {pestana === 'inmovilizado' && <TabInmovilizado />}
      {pestana === 'liasse' && <TabLiasseFiscale anio={anioFiscal} onAnioChange={setAnioFiscal} />}
      {pestana === 'cierre' && <TabCierreEjercicio />}

      <p className="text-xs text-gray-400 text-center mt-4">
        Herramienta de estimación interna. No sustituye el asesoramiento de un expert-comptable.
      </p>
    </div>
  );
}
