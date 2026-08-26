import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, CalendarClock, ExternalLink, Eye, UploadCloud, Download } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../hooks/useToast';
import { conAvisoDescarga } from '../../lib/conAvisoDescarga';
import { mensajeError } from '../../lib/mensajeError';
import { generarPdfNotaGastosPlantilla } from '../../lib/generarPdfNotaGastosPlantilla';
import { Fuente } from './Fuente';
import { fmtFecha } from './format';

const CATEGORIA_SOCIETARIOS = "Documentos societarios — Greffe / associé unique";
const BUCKET_DECISIONES = 'decisiones';

type DecisionSocietaria = {
  id: string;
  numero: number;
  tipo: string;
  titulo: string;
  anio_ejercicio: number;
  fecha: string;
  documento_url: string | null;
  documento_nombre: string | null;
};

function RegistreDecisiones() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [subiendoId, setSubiendoId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['decisiones_societarias'],
    queryFn: async () => {
      const { data, error } = await supabase.from('decisiones_societarias').select('*').order('numero');
      if (error) throw error;
      return data as DecisionSocietaria[];
    },
  });

  const handleVerPdf = async (d: DecisionSocietaria) => {
    if (!d.documento_url) return;
    const { data: firmada, error } = await supabase.storage.from(BUCKET_DECISIONES).createSignedUrl(d.documento_url, 3600);
    if (error) {
      toast.error(error.message);
      return;
    }
    window.open(firmada.signedUrl, '_blank');
  };

  const handleSubir = async (d: DecisionSocietaria, file: File) => {
    if (file.type !== 'application/pdf' && !file.type.startsWith('image/')) {
      toast.error('Solo se admiten PDF o imágenes');
      return;
    }
    setSubiendoId(d.id);
    const extension = file.name.split('.').pop() ?? 'pdf';
    const path = `${d.id}/${crypto.randomUUID()}.${extension}`;
    const { error: errorSubida } = await supabase.storage
      .from(BUCKET_DECISIONES)
      .upload(path, file, { contentType: file.type });
    if (errorSubida) {
      setSubiendoId(null);
      toast.error(errorSubida.message);
      return;
    }
    const { error: errorUpdate } = await supabase
      .from('decisiones_societarias')
      .update({ documento_url: path, documento_nombre: file.name })
      .eq('id', d.id);
    setSubiendoId(null);
    if (errorUpdate) {
      toast.error(errorUpdate.message);
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['decisiones_societarias'] });
    toast.success('Documento adjuntado');
  };

  if (isLoading) return <p className="text-xs text-gray-400 py-3">Cargando registre des décisions…</p>;

  return (
    <div className="mt-1 border border-gray-100 rounded-sm px-3 py-2.5">
      <p className="text-sm font-medium text-gray-900 mb-2">Registre des décisions — generadas desde el CRM o por el agente</p>
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
                <td className="py-1.5 pl-2 text-right text-gray-500 whitespace-nowrap">{fmtFecha(d.fecha)}</td>
                <td className="py-1.5 pl-2 text-right whitespace-nowrap">
                  {d.documento_url ? (
                    <button
                      onClick={() => handleVerPdf(d)}
                      className="text-brand hover:underline flex items-center gap-1 ml-auto"
                    >
                      <Eye size={12} /> Ver PDF
                    </button>
                  ) : (
                    <label className="text-gray-400 hover:text-brand cursor-pointer flex items-center gap-1 ml-auto">
                      <UploadCloud size={12} />
                      {subiendoId === d.id ? 'Subiendo...' : 'Adjuntar PDF'}
                      <input
                        type="file"
                        accept="application/pdf,image/*"
                        className="hidden"
                        disabled={subiendoId === d.id}
                        onChange={(e) => e.target.files?.[0] && handleSubir(d, e.target.files[0])}
                      />
                    </label>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="text-[11px] text-gray-400 mt-1.5">
        Esto es un apoyo digital, no sustituye al libro físico cosido y foliado que hay que conservar en el domicilio social.
        Adjunta aquí el PDF ya firmado (o el generado, si aún no lo has firmado) para poder consultarlo desde el CRM.
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
  descarga?: () => Promise<void>;
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
      "Obligatorios para cualquier société (art. L123-12 a L123-24 del Code de commerce). El livre-journal, el grand-livre y el livre d'inventaire ya los genera el propio CRM (insert-only: un asiento nunca se edita ni se borra, solo se corrige con uno nuevo).",
    documentos: [
      { nombre: 'Livre-journal', descripcion: 'Registro cronológico de todos los movimientos económicos de la société.', estado: 'generado', detalle: 'Se genera automáticamente al crear Facturas/Gastos de Francia y al registrar un cobro.', ruta: '/contabilidad/diario', rutaLabel: 'Ir al libro diario' },
      { nombre: 'Grand-livre', descripcion: 'El mismo detalle del livre-journal, agrupado por cuenta contable.', estado: 'generado', detalle: 'Mismos asientos que el libro diario, agrupados por cuenta con saldo.', ruta: '/contabilidad/mayor', rutaLabel: 'Ir al libro mayor' },
      { nombre: 'Tableau des immobilisations et amortissements', descripcion: 'Registro de activos amortizables (vehículos, herramientas, equipos) y su amortización acumulada.', estado: 'generado', detalle: 'Alta/edición de activos y generación de la dotación anual.', ruta: '/fiscalidad/inmovilizado', rutaLabel: 'Ir a Inmovilizado' },
      { nombre: "Livre d'inventaire", descripcion: 'Inventario anual del activo y el pasivo de la société.', estado: 'generado', detalle: "Desde el décret n° 2015-1478 (2015) ya no hace falta libro físico cosido y foliado — basta con conservar el PDF que justifica el inventario (art. R123-173-1). Botón en 'Liasse fiscale', junto al resumen de liasse.", ruta: '/fiscalidad/liasse', rutaLabel: 'Ir a generar' },
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
    titulo: 'A vigilar según crece la empresa (no aplica hoy)',
    intro:
      'Ninguno de estos tres genera obligación ahora mismo, pero conviene tenerlos localizados para el día que cambien las circunstancias — investigación de 2026-08-15 contra fuentes oficiales/especializadas, no forman parte de ningún cálculo del CRM.',
    documentos: [
      {
        nombre: 'Certification RGE (Reconnu Garant de l\'Environnement)',
        descripcion: 'Requisito real para poder facturar al 5,5% las obras de rénovation énergétique.',
        estado: 'externo',
        detalle: 'Confirmado 2026-08-16: Reformas Ordoñez NO tiene certificación RGE. Por tanto no debe facturar ninguna obra al 5,5% (rénovation énergétique) — solo el 10% (travaux de rénovation genéricos) o el 20% (obra nueva/ampliación), según el tipo de obra. Si algún día se subcontrata a un profesional sí certificado RGE para la parte de rénovation énergétique, es su factura la que llevaría el 5,5% y su propia mención RGE, no la de Reformas Ordoñez.',
      },
      {
        nombre: 'CVAE (Cotisation sur la Valeur Ajoutée des Entreprises)',
        descripcion: 'Impuesto local sobre el valor añadido, aparte del IS.',
        estado: 'externo',
        detalle: 'Sin obligación por debajo de 152.500 € de CA anual (solo declarar sin pagar entre 152.500 € y 500.000 €; se paga a partir de 500.000 €). Su supresión total está aplazada a 2030. Revisar cuando el CA anual se acerque a 152.500 €.',
      },
      {
        nombre: 'Carte d\'identification professionnelle BTP',
        descripcion: 'Tarjeta obligatoria para cada trabajador que hace obra en Francia.',
        estado: 'externo',
        detalle: 'El gérant majoritaire sin contrato de trabajo (el caso de Mario) está exento. Solo pasa a ser obligatoria si Reformas Ordoñez contrata algún día personal asalariado que trabaje en obra — multa de hasta 2.000 € por trabajador sin ella (4.000 € en reincidencia).',
      },
    ],
  },
  {
    titulo: 'Plantillas de apoyo',
    intro: 'Formularios en blanco para imprimir, no ligados a ningún dato del CRM — úsalos cuando haga falta soporte en papel.',
    documentos: [
      {
        nombre: 'Note de frais (plantilla en blanco)',
        descripcion: 'Hoja para anotar a mano gastos puntuales pagados de tu bolsillo (comidas, peajes, pequeño material) antes de registrarlos en el CRM.',
        estado: 'generado',
        detalle: 'No sustituye el registro real — adjunta esta hoja (con sus justificantes) al gasto correspondiente en Finanzas → Gastos.',
        descarga: generarPdfNotaGastosPlantilla,
      },
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
  const toast = useToast();

  const handleDescargar = async (doc: Documento) => {
    if (!doc.descarga) return;
    try {
      await conAvisoDescarga(doc.descarga, toast);
    } catch (err) {
      toast.error(mensajeError(err, 'No se pudo generar el documento'));
    }
  };

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
                    {doc.descarga && (
                      <button
                        onClick={() => handleDescargar(doc)}
                        className="shrink-0 text-[11px] text-brand hover:underline flex items-center gap-1 whitespace-nowrap"
                      >
                        Descargar <Download size={11} />
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
