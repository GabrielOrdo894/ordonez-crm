import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, CalendarClock, ExternalLink } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Fuente } from './Fuente';

const CATEGORIA_SOCIETARIOS = "Documentos societarios — Greffe / associé unique";

type DecisionSocietaria = { id: string; numero: number; tipo: string; titulo: string; anio_ejercicio: number; fecha: string };

function fmtFechaCorta(f: string) {
  return new Date(`${f}T00:00:00`).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' });
}

function RegistreDecisiones() {
  const { data, isLoading } = useQuery({
    queryKey: ['decisiones_societarias'],
    queryFn: async () => {
      const { data, error } = await supabase.from('decisiones_societarias').select('*').order('numero');
      if (error) throw error;
      return data as DecisionSocietaria[];
    },
  });

  if (isLoading) return <p className="text-xs text-gray-400 py-3">Cargando registre des décisions…</p>;

  return (
    <div className="mt-1 border border-gray-100 rounded-sm px-3 py-2.5">
      <p className="text-sm font-medium text-gray-900 mb-2">Registre des décisions — generadas desde el CRM</p>
      {!data || data.length === 0 ? (
        <p className="text-xs text-gray-400">
          Todavía no se ha generado ninguna décision — usa el botón en "Cotisations URSSAF" o "Impôt sur les Sociétés".
        </p>
      ) : (
        <table className="w-full border-collapse text-xs">
          <tbody>
            {data.map((d) => (
              <tr key={d.id} className="border-t border-gray-100">
                <td className="py-1.5 pr-2 text-gray-400 w-10">N° {d.numero}</td>
                <td className="py-1.5 text-gray-900">{d.titulo}</td>
                <td className="py-1.5 pl-2 text-right text-gray-500 whitespace-nowrap">{fmtFechaCorta(d.fecha)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="text-[11px] text-gray-400 mt-1.5">
        Esto es un apoyo digital, no sustituye al libro físico cosido y foliado que hay que conservar en el domicilio social.
      </p>
    </div>
  );
}

type EstadoDocumento = 'generado' | 'recordatorio' | 'externo';

type Documento = {
  nombre: string;
  descripcion: string;
  estado: EstadoDocumento;
  detalle: string;
  ruta?: string;
  rutaLabel?: string;
};

type Categoria = {
  titulo: string;
  intro: string;
  documentos: Documento[];
};

const CATEGORIAS: Categoria[] = [
  {
    titulo: 'Libros contables — a llevar de forma continua',
    intro:
      "Obligatorios para cualquier société (art. L123-12 a L123-24 del Code de commerce). El livre-journal y el grand-livre ya los genera el propio CRM a partir de Facturas y Gastos de Francia (insert-only: un asiento nunca se edita ni se borra, solo se corrige con uno nuevo). El livre d'inventaire sigue siendo tarea del expert-comptable.",
    documentos: [
      { nombre: 'Livre-journal', descripcion: 'Registro cronológico de todos los movimientos económicos de la société.', estado: 'generado', detalle: 'Se genera automáticamente al crear Facturas/Gastos de Francia y al registrar un cobro.', ruta: '/contabilidad/diario', rutaLabel: 'Ir al libro diario' },
      { nombre: 'Grand-livre', descripcion: 'El mismo detalle del livre-journal, agrupado por cuenta contable.', estado: 'generado', detalle: 'Mismos asientos que el libro diario, agrupados por cuenta con saldo.', ruta: '/contabilidad/mayor', rutaLabel: 'Ir al libro mayor' },
      { nombre: 'Tableau des immobilisations et amortissements', descripcion: 'Registro de activos amortizables (vehículos, herramientas, equipos) y su amortización acumulada.', estado: 'generado', detalle: 'Alta/edición de activos y generación de la dotación anual.', ruta: '/fiscalidad/inmovilizado', rutaLabel: 'Ir a Inmovilizado' },
      { nombre: "Livre d'inventaire", descripcion: 'Inventario anual del activo y el pasivo de la société.', estado: 'externo', detalle: 'Lo lleva el expert-comptable, una vez al año.' },
    ],
  },
  {
    titulo: 'Cuentas anuales y declaraciones fiscales',
    intro: 'Todas tienen su fecha límite ya generada en la pestaña "Calendario fiscal" — aquí solo se listan los documentos en sí.',
    documentos: [
      { nombre: 'Comptes annuels (bilan, compte de résultat, annexe)', descripcion: 'El cierre contable del ejercicio.', estado: 'recordatorio', detalle: 'Fecha en Calendario (Liasse/Dépôt des comptes) — documento lo prepara el expert-comptable.', ruta: '/fiscalidad/calendario', rutaLabel: 'Ver fecha en Calendario' },
      { nombre: 'Liasse fiscale (formulario 2065 + anexos)', descripcion: 'Se presenta a la DGFiP tras el cierre del ejercicio.', estado: 'generado', detalle: 'El CRM prepara el compte de résultat, bilan simplificado e inmovilizado — la transmisión real (EDI-TDFC, vía partenaire EDI o expert-comptable) sigue siendo un paso aparte.', ruta: '/fiscalidad/liasse', rutaLabel: 'Ir a preparar' },
      { nombre: '12 declaraciones CA3 (TVA mensual)', descripcion: 'Una por mes, con las líneas calculadas a partir de Facturas y Gastos.', estado: 'generado', detalle: 'Se preparan en la pestaña "TVA" y quedan con fecha en el Calendario fiscal.', ruta: '/fiscalidad/tva', rutaLabel: 'Ir a TVA' },
      { nombre: 'Declaración anual del Impôt sur les Sociétés', descripcion: 'Acomptes trimestrales + solde final.', estado: 'recordatorio', detalle: 'Échéances "ACOMPTE_IS"/"SOLDE_IS" en el Calendario fiscal.', ruta: '/fiscalidad/is', rutaLabel: 'Ir a Impôt sur les Sociétés' },
    ],
  },
  {
    titulo: CATEGORIA_SOCIETARIOS,
    intro: 'Ligados a la vida de la EURL como sociedad, no solo a Hacienda.',
    documentos: [
      { nombre: "Décision de l'associé unique — rémunération del gérant", descripcion: 'Fija formalmente el salario anual de Mario como gérant, con cita a los estatutos reales.', estado: 'generado', detalle: 'Botón "Generar decisión" en la pestaña "Cotisations URSSAF".', ruta: '/fiscalidad/cotisations', rutaLabel: 'Ir a generar' },
      { nombre: "Décision de l'associé unique — aprobación de cuentas", descripcion: 'Aprueba las cuentas del ejercicio y la afectación del resultado antes de poder depositarlas en el Greffe.', estado: 'generado', detalle: 'Botón "Décision d\'approbation des comptes" en la pestaña "Impôt sur les Sociétés".', ruta: '/fiscalidad/is', rutaLabel: 'Ir a generar' },
      { nombre: 'Dépôt des comptes annuels au Greffe', descripcion: 'Deposita las cuentas en el Registre du Commerce et des Sociétés, haciéndolas públicas.', estado: 'recordatorio', detalle: 'Échéance "DEPOT_COMPTES" en el Calendario fiscal.', ruta: '/fiscalidad/calendario', rutaLabel: 'Ver échéance' },
      { nombre: 'Registre des décisions de l\'associé unique', descripcion: 'Libro cosido y foliado donde se consignan y numeran todas las décisions (incluida la de rémunération y la de aprobación de cuentas).', estado: 'generado', detalle: 'El CRM lleva un registro digital de apoyo cada vez que generas una décision — ver tabla abajo.' },
    ],
  },
  {
    titulo: 'Seguros y menciones obligatorias frente al cliente',
    intro: 'Exigidos por la Loi Spinetta (assurance construction) para poder operar como empresa de construcción en Francia.',
    documentos: [
      { nombre: 'Attestation d\'assurance décennale / RC professionnelle', descripcion: 'Póliza que cubre la garantía decenal en cada obra.', estado: 'recordatorio', detalle: 'Vencimiento trackeado en la tarjeta "Assurance décennale" de la pestaña Calendario — avisa 60 días antes.', ruta: '/fiscalidad/calendario', rutaLabel: 'Ver/editar vencimiento' },
      { nombre: 'Mención de la garantía decenal en cada devis/facture', descripcion: 'Referencia obligatoria a la póliza y sus 3 coberturas en todo documento francés.', estado: 'generado', detalle: 'Ya automática en los PDF de Presupuestos y Facturas cuando el país es Francia — nada que hacer.', ruta: '/finanzas/presupuestos', rutaLabel: 'Ir a Presupuestos' },
    ],
  },
  {
    titulo: 'Plazos de conservación',
    intro: 'Cuánto tiempo hay que guardar cada cosa, aunque ya esté declarada.',
    documentos: [
      { nombre: 'Facturas y documentos contables', descripcion: 'Facturas emitidas y recibidas, libros contables, justificantes.', estado: 'externo', detalle: '10 años desde el cierre del ejercicio (art. L123-22 Code de commerce).' },
      { nombre: 'Actas y decisiones societarias', descripcion: 'Registre des décisions, estatutos y sus modificaciones.', estado: 'externo', detalle: 'Durante toda la vida de la société.' },
    ],
  },
];

const ESTILO_ESTADO: Record<EstadoDocumento, { icon: typeof CheckCircle2; texto: string; clase: string }> = {
  generado: { icon: CheckCircle2, texto: 'Generado desde el CRM', clase: 'text-brand' },
  recordatorio: { icon: CalendarClock, texto: 'Fecha en el Calendario fiscal', clase: 'text-amber-700' },
  externo: { icon: ExternalLink, texto: 'Fuera del CRM', clase: 'text-gray-400' },
};

export function TabDocumentos() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-gray-500 leading-relaxed">
        Checklist de los documentos que Reformas Ordoñez, como EURL francesa con actividad en Francia y España, tiene la
        responsabilidad de producir, presentar o conservar de forma recurrente — más allá de las fechas límite ya cubiertas en
        el "Calendario fiscal". Es una referencia orientativa para no perder de vista nada importante, no un listado legal
        cerrado: confírmalo con tu expert-comptable, sobre todo si tu actividad cambia (contratar empleados, superar umbrales
        de facturación, etc.).
      </p>

      {CATEGORIAS.map((cat) => (
        <div key={cat.titulo} className="bg-surface border border-gray-200 rounded-sm p-4">
          <p className="text-sm font-semibold text-gray-900 mb-1">{cat.titulo}</p>
          <p className="text-xs text-gray-500 leading-relaxed mb-3">{cat.intro}</p>
          <div className="flex flex-col gap-2">
            {cat.documentos.map((doc) => {
              const estilo = ESTILO_ESTADO[doc.estado];
              const Icono = estilo.icon;
              return (
                <div key={doc.nombre} className="border border-gray-100 rounded-sm px-3 py-2.5">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900">{doc.nombre}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{doc.descripcion}</p>
                    </div>
                    <span className={`shrink-0 flex items-center gap-1 text-[11px] font-semibold ${estilo.clase}`}>
                      <Icono size={13} />
                      {estilo.texto}
                    </span>
                  </div>
                  <div className="flex items-end justify-between gap-3 mt-1.5">
                    <p className="text-[11px] text-gray-400">{doc.detalle}</p>
                    {doc.ruta && (
                      <button
                        onClick={() => navigate(doc.ruta!)}
                        className="shrink-0 text-[11px] text-brand hover:underline flex items-center gap-1 whitespace-nowrap"
                      >
                        {doc.rutaLabel ?? 'Ir'} <ExternalLink size={11} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {cat.titulo === CATEGORIA_SOCIETARIOS && <RegistreDecisiones />}
        </div>
      ))}

      <Fuente url="https://www.legifrance.gouv.fr/codes/section_lc/LEGITEXT6000005634/LEGISCTA000006158450" />
    </div>
  );
}
