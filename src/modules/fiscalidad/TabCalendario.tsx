import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CalendarClock, ExternalLink, ShieldCheck } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { supabase } from '../../lib/supabase';
import { guardarConfigDatos } from '../../lib/empresaConfig';
import { useToast } from '../../hooks/useToast';
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
  ASAMBLEA: 'Aprobación de cuentas del socio único',
  COTISATIONS_TNS: 'Régularisation de cotisations TNS del gérant',
  DECLARACION_IR_GERANT: 'Declaración de la renta personal del gérant',
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

// La assurance décennale es una póliza (fecha mutable, no una fórmula calendario como el resto de
// échéances) — no hay forma de calcular su vencimiento, así que se guarda a mano en
// empresa_config.datos en vez de generarse como échéance (auditoría 2026-08-12: no estaba
// trackeada en ningún sitio del CRM, pese a ser obligatoria para operar como constructora en FR).
function useAssuranceDecennale() {
  const queryClient = useQueryClient();
  const toast = useToast();

  const { data, isLoading, error } = useQuery({
    queryKey: ['empresa_config', 'assurance_decennale'],
    queryFn: async () => {
      const { data, error } = await supabase.from('empresa_config').select('datos').eq('id', 1).single();
      if (error) throw error;
      return ((data?.datos as { assurance_decennale_vencimiento?: string })?.assurance_decennale_vencimiento) ?? null;
    },
  });
  useEffect(() => {
    if (error) toast.error(`No se pudo cargar la assurance décennale: ${error.message}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);

  const guardar = useMutation({
    mutationFn: async (vencimiento: string) => guardarConfigDatos({ assurance_decennale_vencimiento: vencimiento || null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['empresa_config', 'assurance_decennale'] });
      toast.success('Vencimiento guardado');
    },
    onError: (error) => toast.error(error.message),
  });

  return { vencimiento: data ?? null, cargando: isLoading, guardar: guardar.mutate, guardando: guardar.isPending };
}

function AssuranceDecennaleCard() {
  const { vencimiento, guardar, guardando } = useAssuranceDecennale();
  const [input, setInput] = useState('');

  useEffect(() => {
    setInput(vencimiento ?? '');
  }, [vencimiento]);

  const dias = vencimiento ? diasRestantes(vencimiento) : null;
  let estado: { texto: string; clase: string } = { texto: 'Sin configurar', clase: 'text-gray-400' };
  if (dias !== null) {
    if (dias < 0) estado = { texto: 'Vencida', clase: 'text-red-600' };
    else if (dias < 60) estado = { texto: `Vence en ${dias} días`, clase: 'text-amber-700' };
    else estado = { texto: 'Vigente', clase: 'text-brand' };
  }

  return (
    <div className="bg-surface border border-gray-200 rounded-sm p-4">
      <p className="text-sm font-semibold text-gray-900 flex items-center gap-1.5 mb-1">
        <ShieldCheck size={14} className="text-brand" /> Assurance décennale / RC professionnelle
      </p>
      <p className="text-xs text-gray-500 leading-relaxed mb-3">
        Seguro obligatorio para operar como empresa de construcción en Francia — no es un trámite ante la Administración, es
        una póliza, así que su vencimiento se guarda aquí en vez de generarse automáticamente.
      </p>
      {!vencimiento && (
        <div className="mb-3 bg-amber-50 border border-amber-300 rounded-sm px-3 py-2 flex items-start gap-2 text-xs text-amber-800">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          Sin fecha de vencimiento configurada — confirma con la aseguradora que la póliza está vigente y rellena la fecha
          abajo para que este CRM pueda avisar antes de que caduque.
        </div>
      )}
      <div className="flex items-end gap-2 flex-wrap">
        <Input label="Vencimiento de la póliza" type="date" value={input} onChange={(e) => setInput(e.target.value)} className="w-48" />
        <Button onClick={() => guardar(input)} disabled={guardando}>
          {guardando ? 'Guardando...' : 'Guardar'}
        </Button>
        <span className={`text-xs font-semibold ${estado.clase}`}>{estado.texto}</span>
      </div>
    </div>
  );
}

export function TabCalendario() {
  const [anio, setAnio] = useState(ANIO_ACTUAL);
  const { config } = useFiscalConfig();
  const { echeances, generar, generando, marcarCompletada } = useEcheances();

  const delAnio = echeances.filter((e) => e.fecha_limite.startsWith(String(anio)));

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-gray-500 leading-relaxed">
        Genera automáticamente las 12 declaraciones mensuales de TVA (CA3) del año elegido más las échéances anuales (acomptes
        e IS, CFE, liasse fiscale, depósito de cuentas, aprobación de cuentas, régularisation TNS y declaración de la renta del
        gérant). Marca cada una como hecha con la casilla — queda registrado con fecha y no vuelve a aparecer como pendiente en
        el Dashboard.
      </p>
      <AssuranceDecennaleCard />
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
            a: 'Son las dos formas de pagar el Impôt sur les Sociétés. Los acomptes son 4 pagos a cuenta durante el ejercicio (15 de marzo, junio, septiembre, diciembre), calculados sobre el resultado del ejercicio ANTERIOR. El solde es la liquidación final una vez cerrado el ejercicio y calculado el IS real: se paga la diferencia entre lo adelantado y lo que corresponde de verdad. La fecha se genera desde fiscal_config (claves solde_is_mes/solde_is_dia, por defecto el 15 de mayo del año siguiente — la fecha estándar cuando el ejercicio cierra el 31 de diciembre) — confirma con tu expert-comptable si tu SIREN tiene una fecha distinta. Ver la pestaña "Impôt sur les Sociétés" para el detalle con ejemplos.',
          },
          {
            q: '¿Qué es la CFE?',
            a: 'La Cotisation Foncière des Entreprises es un impuesto local (lo cobra el ayuntamiento/intercommunalité, no el Estado) que pagan casi todas las empresas por el simple hecho de ejercer una actividad en un local o terreno, independientemente del beneficio. Se calcula sobre el valor locatif de los locales que usa la empresa. Las empresas de nueva creación están exoneradas el año de su creación (por eso Reformas Ordoñez no paga CFE en 2026) pero deben presentar una declaración inicial (formulario 1447-C) antes del 31 de diciembre de ese primer año para que la administración tenga sus datos.',
          },
          {
            q: '¿Qué es la liasse fiscale?',
            a: 'Es el conjunto de documentos contables y fiscales (balance, cuenta de resultados, formulario 2065 y sus anexos) que toda sociedad debe presentar a la DGFiP tras el cierre de cada ejercicio, para que la Administración pueda verificar el cálculo del IS declarado. La prepara normalmente el expert-comptable. La fecha se genera desde fiscal_config (claves liasse_mes/liasse_dia, por defecto el 31 de mayo del año siguiente) — confirma con tu expert-comptable si tu caso tiene una fecha distinta.',
          },
          {
            q: '¿Qué es el "dépôt des comptes" en el Greffe?',
            a: 'Es la obligación de depositar las cuentas anuales (bilan, compte de résultat, annexes) en el Registre du Commerce et des Sociétés, gestionado por el Greffe du Tribunal de Commerce. A diferencia de la liasse fiscale (que es para Hacienda), este depósito hace las cuentas de la empresa públicas y consultables por terceros (bancos, proveedores, competidores). El plazo es de 7 meses tras el cierre del ejercicio (6 meses para que la asamblea del socio único apruebe las cuentas + 1 mes para depositarlas) — la aprobación de cuentas tiene su propia échéance justo antes en el calendario.',
          },
          {
            q: '¿Qué son las 3 échéances nuevas — asamblea, cotisations TNS y declaración de la renta del gérant?',
            a: '"Aprobación de cuentas del socio único" es la décision de l\'associé unique que aprueba formalmente las cuentas del ejercicio, paso previo obligatorio al depósito en el Greffe — hoy no genera ningún documento por sí sola, solo el recordatorio de la fecha. "Régularisation de cotisations TNS" es el ajuste anual que hace la URSSAF entre lo que el gérant pagó de forma provisional y lo que correspondía según sus ingresos reales — la fecha exacta depende del régimen de pago elegido al darse de alta (mensual o trimestral), así que está marcada como estimada. "Declaración de la renta personal del gérant" es la 2042-C-PRO de Mario — es personal, no de la société, pero incluye la rémunération TNS y los dividendos del ejercicio, así que se incluye aquí como recordatorio.',
          },
          {
            q: '¿Qué pasa si me salto una fecha límite?',
            a: 'Depende del trámite: la TVA (CA3) fuera de plazo genera un recargo (majoration) del 10% sobre el importe adeudado, que sube si se repite. El IS fuera de plazo también lleva intereses de demora y recargos. El depósito de cuentas fuera de plazo puede acarrear una multa y, en casos repetidos, sanciones más serias. Por eso el badge "Urgente" (rojo) aparece cuando quedan menos de 7 días y la échéance no está marcada como hecha — para que no se pase la fecha.',
          },
          {
            q: '¿De dónde salen exactamente estas fechas?',
            a: 'Las 12 CA3 se generan el día configurado en fiscal_config (clave tva_deadline_dia, por defecto el día 21 del mes siguiente al declarado — ajústalo si tu SIREN tiene un día de vencimiento distinto). El resto usa claves propias en fiscal_config con valores por defecto razonables (acomptes IS el 15 de marzo/junio/septiembre/diciembre, solde IS y liasse en mayo, CFE el 15 de diciembre, asamblea en junio, régularisation TNS en septiembre, declaración de renta en mayo) — todas editables sin tocar código si tu caso concreto tiene una fecha distinta. Confírmalas con tu expert-comptable, especialmente las marcadas como "estimada" en sus notas.',
          },
          {
            q: '¿Por qué 2026 no tiene acomptes ni CFE a pagar?',
            a: 'Los acomptes de IS se calculan sobre el resultado del ejercicio ANTERIOR, y 2026 es el primer ejercicio de Reformas Ordoñez — no hay ejercicio anterior sobre el que calcularlos. La CFE está exonerada el año de creación de la empresa (una ventaja fiscal estándar para startups); la primera CFE a pagar será en diciembre de 2027. En ambos casos verás un aviso informativo en vez de una échéance de pago, con la explicación y la fecha del primer pago real. La asamblea, la régularisation TNS y la declaración de la renta del gérant sí aplican desde el primer ejercicio.',
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
    </div>
  );
}
