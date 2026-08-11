import { useState } from 'react';
import { CalendarClock, ExternalLink } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Select';
import { useFiscalConfig } from './useFiscalConfig';
import { useEcheances } from './useEcheances';
import { generarEcheances } from './calculos';
import { Faq } from './Faq';

const TIPO_LABEL: Record<string, string> = {
  CA3: 'Declaración mensual de TVA',
  ACOMPTE_IS: 'Pago a cuenta del Impôt sur les Sociétés',
  SOLDE_IS: 'Liquidación final del IS del ejercicio',
  CFE: 'Cotisation Foncière des Entreprises (impuesto local)',
  LIASSE: 'Liasse fiscale — cuentas anuales a la DGFiP',
  DEPOT_COMPTES: 'Depósito de cuentas anuales en el Greffe',
  OTRO: 'Otro trámite',
};

function fmtFecha(f: string) {
  return new Date(`${f}T00:00:00`).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' });
}

function diasRestantes(fecha: string) {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const limite = new Date(`${fecha}T00:00:00`);
  return Math.round((limite.getTime() - hoy.getTime()) / 86_400_000);
}

const ANIO_ACTUAL = new Date().getFullYear();
const ANIOS = [ANIO_ACTUAL, ANIO_ACTUAL + 1];

export function TabCalendario() {
  const [anio, setAnio] = useState(ANIO_ACTUAL);
  const { config } = useFiscalConfig();
  const { echeances, generar, generando, marcarCompletada } = useEcheances();

  const delAnio = echeances.filter((e) => e.fecha_limite.startsWith(String(anio)));

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-gray-500 leading-relaxed">
        Genera automáticamente las 12 declaraciones mensuales de TVA (CA3) del año elegido más las échéances anuales (acomptes
        e IS, CFE, liasse fiscale, depósito de cuentas). Marca cada una como hecha con la casilla — queda registrado con fecha
        y no vuelve a aparecer como pendiente en el Dashboard.
      </p>
      <div className="flex items-center justify-between">
        <Select label="Año" options={ANIOS.map((a) => ({ value: String(a), label: String(a) }))} value={String(anio)} onChange={(e) => setAnio(Number(e.target.value))} className="w-32" />
        {delAnio.length === 0 && (
          <Button onClick={() => generar(generarEcheances(anio, config))} disabled={generando}>
            {generando ? 'Generando...' : `Generar calendario fiscal ${anio}`}
          </Button>
        )}
      </div>

      <div className="bg-surface border border-gray-200 rounded-sm p-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 border-b border-gray-200 pb-2 mb-3">
          Échéances {anio}
        </p>
        {delAnio.length === 0 ? (
          <p className="text-sm text-gray-400 py-8 text-center">
            Sin échéances generadas para {anio}. Pulsa "Generar calendario fiscal {anio}" arriba.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {delAnio.map((e) => {
              const dias = diasRestantes(e.fecha_limite);
              const urgente = !e.completada && dias >= 0 && dias < 7;
              return (
                <div key={e.id} className="flex items-center gap-3 border border-gray-100 rounded-sm px-3 py-2">
                  <input
                    type="checkbox"
                    checked={e.completada}
                    onChange={(ev) => marcarCompletada({ id: e.id, completada: ev.target.checked })}
                  />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${e.completada ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{e.titulo}</p>
                    <p className="text-xs text-gray-400">{TIPO_LABEL[e.tipo] ?? e.tipo}{e.notas ? ` — ${e.notas}` : ''}</p>
                  </div>
                  <span className="text-xs text-gray-500 shrink-0">{e.organismo}</span>
                  <span className="text-xs text-gray-700 font-medium shrink-0 flex items-center gap-1">
                    <CalendarClock size={12} />
                    {fmtFecha(e.fecha_limite)}
                  </span>
                  {urgente && (
                    <span className="bg-red-600 text-white text-[10px] font-bold uppercase tracking-wide rounded-sm px-1.5 py-0.5 shrink-0">
                      Urgente
                    </span>
                  )}
                  {e.url_oficial && (
                    <a href={e.url_oficial} target="_blank" rel="noreferrer" className="text-gray-400 hover:text-brand shrink-0">
                      <ExternalLink size={13} />
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Faq
        items={[
          {
            q: '¿Qué es la CA3?',
            a: 'Es el formulario mensual con el que se declara la TVA a la DGFiP (Direction Générale des Finances Publiques): resume la TVA collectée de tus facturas del mes y la TVA déductible de tus gastos, y calcula si hay que pagar la diferencia o si queda un crédito a favor. Se presenta online en impots.gouv.fr. Reformas Ordoñez, al estar en régimen "réel normal", tiene que presentarla todos los meses (no trimestral).',
          },
          {
            q: '¿Qué son los acomptes y el solde de IS?',
            a: 'Son las dos formas de pagar el Impôt sur les Sociétés. Los acomptes son 4 pagos a cuenta durante el ejercicio (15 de marzo, junio, septiembre, diciembre), calculados sobre el resultado del ejercicio ANTERIOR. El solde es la liquidación final una vez cerrado el ejercicio y calculado el IS real: se paga la diferencia entre lo adelantado y lo que corresponde de verdad, dentro de los 3 meses y 15 días tras el cierre. Ver la pestaña "Impôt sur les Sociétés" para el detalle con ejemplos.',
          },
          {
            q: '¿Qué es la CFE?',
            a: 'La Cotisation Foncière des Entreprises es un impuesto local (lo cobra el ayuntamiento/intercommunalité, no el Estado) que pagan casi todas las empresas por el simple hecho de ejercer una actividad en un local o terreno, independientemente del beneficio. Se calcula sobre el valor locatif de los locales que usa la empresa. Las empresas de nueva creación están exoneradas el año de su creación (por eso Reformas Ordoñez no paga CFE en 2026) pero deben presentar una declaración inicial (formulario 1447-C) antes del 31 de diciembre de ese primer año para que la administración tenga sus datos.',
          },
          {
            q: '¿Qué es la liasse fiscale?',
            a: 'Es el conjunto de documentos contables y fiscales (balance, cuenta de resultados, formulario 2065 y sus anexos) que toda sociedad debe presentar a la DGFiP tras el cierre de cada ejercicio, para que la Administración pueda verificar el cálculo del IS declarado. La prepara normalmente el expert-comptable. Se presenta dentro de los 3 meses tras el cierre del ejercicio (con una tolerancia adicional de 15 días si se hace por télédéclaration).',
          },
          {
            q: '¿Qué es el "dépôt des comptes" en el Greffe?',
            a: 'Es la obligación de depositar las cuentas anuales (bilan, compte de résultat, annexes) en el Registre du Commerce et des Sociétés, gestionado por el Greffe du Tribunal de Commerce. A diferencia de la liasse fiscale (que es para Hacienda), este depósito hace las cuentas de la empresa públicas y consultables por terceros (bancos, proveedores, competidores). El plazo es de 7 meses tras el cierre del ejercicio (6 meses para que la asamblea del socio único apruebe las cuentas + 1 mes para depositarlas).',
          },
          {
            q: '¿Qué pasa si me salto una fecha límite?',
            a: 'Depende del trámite: la TVA (CA3) fuera de plazo genera un recargo (majoration) del 10% sobre el importe adeudado, que sube si se repite. El IS fuera de plazo también lleva intereses de demora y recargos. El depósito de cuentas fuera de plazo puede acarrear una multa y, en casos repetidos, sanciones más serias. Por eso el badge "Urgente" (rojo) aparece cuando quedan menos de 7 días y la échéance no está marcada como hecha — para que no se pase la fecha.',
          },
          {
            q: '¿De dónde salen exactamente estas fechas?',
            a: 'Las 12 CA3 se generan el día configurado en fiscal_config (clave tva_deadline_dia, por defecto el día 21 del mes siguiente al declarado — ajústalo si tu SIREN tiene un día de vencimiento distinto). Las échéances anuales usan las fechas oficiales: acomptes IS el 15 de marzo/junio/septiembre/diciembre, solde IS a los 3 meses y 15 días del cierre, CFE el 15 de diciembre, liasse fiscale y depósito de cuentas dentro de los plazos legales tras el cierre del ejercicio — ver las preguntas de arriba para el detalle de cada una.',
          },
          {
            q: '¿Por qué 2026 no tiene acomptes ni CFE a pagar?',
            a: 'Los acomptes de IS se calculan sobre el resultado del ejercicio ANTERIOR, y 2026 es el primer ejercicio de Reformas Ordoñez — no hay ejercicio anterior sobre el que calcularlos. La CFE está exonerada el año de creación de la empresa (una ventaja fiscal estándar para startups); la primera CFE a pagar será en diciembre de 2027. En ambos casos verás un aviso informativo en vez de una échéance de pago, con la explicación y la fecha del primer pago real.',
          },
          {
            q: '¿Qué pasa si marco algo como hecho por error?',
            a: 'Puedes desmarcar la casilla en cualquier momento — no borra la échéance, solo cambia su estado. Al desmarcarla, vuelve a contar como pendiente y puede volver a aparecer como urgente (si quedan menos de 7 días) o en las "Próximas échéances" del Dashboard.',
          },
          {
            q: '¿Puedo generar el calendario de más de un año?',
            a: 'Sí, cambia el selector "Año" y pulsa "Generar calendario fiscal" para ese año — cada año se genera de forma independiente (12 CA3 + échéances anuales propias) y puedes tener varios años generados a la vez, consultables cambiando el selector.',
          },
        ]}
      />

      <p className="text-xs text-gray-400 text-center">
        Herramienta de estimación interna. No sustituye el asesoramiento de un expert-comptable.
      </p>
    </div>
  );
}
