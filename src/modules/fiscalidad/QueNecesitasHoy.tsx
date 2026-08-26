import { useNavigate } from 'react-router-dom';
import { Receipt, Landmark, Wallet, Calculator, CalendarClock, ClipboardCheck } from 'lucide-react';

const OPCIONES = [
  { icono: Receipt, pregunta: '¿Cuánto IVA pago este mes?', respuesta: 'Declaración CA3 mes a mes', tab: 'tva' },
  { icono: Landmark, pregunta: '¿Cuánto Impôt sur les Sociétés me toca?', respuesta: 'Tramos 15% / 25% del ejercicio', tab: 'is' },
  { icono: Wallet, pregunta: '¿Cuánto puedo pagarme a mí mismo?', respuesta: 'Salario vs dividendos, con datos reales', tab: 'salario' },
  { icono: Calculator, pregunta: 'Simular un año o escenario distinto', respuesta: 'Ingresos y gastos hipotéticos, versión optimizada', tab: 'simulador' },
  { icono: CalendarClock, pregunta: '¿Qué fechas tengo que vigilar?', respuesta: 'CA3, acomptes, CFE, liasse fiscale...', tab: 'calendario' },
  { icono: ClipboardCheck, pregunta: 'Preparar el cierre del ejercicio', respuesta: 'Checklist paso a paso', tab: 'cierre' },
] as const;

/** Puerta de entrada de Fiscalidad: en vez de obligar a entender qué pestaña de las 11 hace falta,
 * pregunta directamente qué necesitas y te lleva ahí. Las pestañas menos frecuentes (Cotisations,
 * Documentos, Inmovilizado, Liasse fiscale) siguen accesibles desde la barra de arriba — esto
 * cubre solo lo que se consulta más a menudo. */
export function QueNecesitasHoy() {
  const navigate = useNavigate();

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">¿Qué necesitas hoy?</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {OPCIONES.map((o) => (
          <button
            key={o.tab}
            onClick={() => navigate(`/fiscalidad/${o.tab}`)}
            className="flex items-start gap-3 text-left bg-surface border border-gray-200 rounded-sm p-3.5 hover:border-brand hover:bg-brand-light transition-colors"
          >
            <span className="w-9 h-9 rounded-sm bg-brand-light flex items-center justify-center shrink-0 text-brand">
              <o.icono size={17} />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-gray-900">{o.pregunta}</span>
              <span className="block text-xs text-gray-500 mt-0.5">{o.respuesta}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
