import jsPDF from 'jspdf';
import { cabeceraDocumento, piePagina } from './pdfEmpresa';
import { registrarFuentePoppins, FUENTE_PDF } from './fuentePdf';
import { calcularTNS } from '../modules/fiscalidad/calculos';
import type { ConfigFn } from '../modules/fiscalidad/calculos';

function fmtEur(n: number) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n);
}

/** Certificado de ingresos del gérant (attestation de rémunération) — para bancos, alquileres o
 * cualquier trámite que pida justificar ingresos anuales. Declara la rémunération BRUTA anual (la
 * misma cifra que la Décision de rémunération ya fijó), y de forma orientativa el neto estimado tras
 * cotisations TNS, para que quien lo lea tenga las dos cifras sin tener que calcularlas. */
export async function generarPdfAttestationRemuneracion(
  anio: number,
  remuneracionAnual: number,
  config: ConfigFn,
): Promise<void> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  await registrarFuentePoppins(doc);
  const { entidad, margen } = await cabeceraDocumento(doc, 'ATTESTATION DE RÉMUNÉRATION');

  const fecha = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  const tns = calcularTNS(remuneracionAnual, config);

  let y = 40;
  doc.setFont(FUENTE_PDF, 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(30, 30, 30);
  const anchoTexto = 210 - margen * 2;

  const parrafo = (texto: string, opts: { negrita?: boolean; espacioAntes?: number; espacioDespues?: number } = {}) => {
    y += opts.espacioAntes ?? 0;
    doc.setFont(FUENTE_PDF, opts.negrita ? 'bold' : 'normal');
    const lineas = doc.splitTextToSize(texto, anchoTexto);
    doc.text(lineas, margen, y);
    y += lineas.length * 5 + (opts.espacioDespues ?? 6);
  };

  parrafo(
    `Je soussigné, ${entidad.nombre_titular || 'Mario Ricardo Ordoñez Quevedo'}, gérant de la société ` +
      `${entidad.razon_social || 'Reformas Ordoñez'}, entreprise unipersonnelle à responsabilité limitée (EURL) au ` +
      `capital social, dont le siège social est situé ${entidad.direccion || ''}, immatriculée au Registre du Commerce ` +
      `et des Sociétés de Bayonne sous le numéro ${entidad.siren || entidad.identificador || ''},`,
  );
  parrafo('ATTESTE PAR LA PRÉSENTE :', { negrita: true, espacioAntes: 4, espacioDespues: 8 });
  parrafo(
    `Que M. ${entidad.nombre_titular || 'Mario Ricardo Ordoñez Quevedo'} perçoit, au titre de son mandat de gérant de ` +
      `la société pour l'exercice ${anio}, une rémunération annuelle nette de ${fmtEur(remuneracionAnual)}, soit ` +
      `${fmtEur(remuneracionAnual / 12)} par mois, versée sur son compte bancaire.`,
  );
  parrafo(
    `Cette rémunération s'entend nette de cotisations sociales : les cotisations des travailleurs non-salariés (TNS) ` +
      `dues auprès de la Sécurité Sociale des Indépendants (SSI), estimées à ${fmtEur(tns.total)} par an, sont prises ` +
      `en charge par la société en sus de cette rémunération.`,
  );
  parrafo(
    "Cette rémunération est fixée par décision de l'associé unique, conformément à l'article 12 des statuts de la " +
      'société, et consignée dans le registre des décisions.',
    { espacioDespues: 20 },
  );
  parrafo('La présente attestation est établie pour servir et valoir ce que de droit.', { espacioDespues: 20 });
  parrafo(`Fait à Hendaye, le ${fecha}.`, { espacioDespues: 20 });
  parrafo('Le gérant,', { espacioDespues: 20 });
  parrafo(entidad.nombre_titular || 'Mario Ricardo Ordoñez Quevedo', { negrita: true });

  piePagina(
    doc,
    margen,
    "Document généré à partir des chiffres de l'onglet Cotisations URSSAF du CRM interne — les montants nets sont une " +
      'estimation (cotisations TNS uniquement, hors impôt sur le revenu), à confirmer si besoin avec votre expert-comptable.',
  );

  doc.save(`attestation-remuneration-${anio}.pdf`);
}
