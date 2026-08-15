import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { GRIS_BORDE, GRIS_TEXTO, cabeceraDocumento, piePagina } from './pdfEmpresa';
import { registrarFuentePoppins, FUENTE_PDF } from './fuentePdf';
import { calcularTNS } from '../modules/fiscalidad/calculos';
import type { ConfigFn, calcularReservaLegal } from '../modules/fiscalidad/calculos';

const MESES_FR = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];

function fmtEur(n: number) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n);
}

/** "Décision de l'associé unique" fijando la rémunération anual del gérant — el documento
 * societario real que respalda las cifras del simulador de Cotisations URSSAF. No es un bulletin
 * de paie (el gérant majoritaire TNS no está sujeto a esa obligación), es el acta que formaliza la
 * decisión. Las citas (article 12 y 15 des statuts, arts. L223-6/L223-29/R223-26 Code de commerce)
 * están verificadas contra los estatutos reales de Reformas Ordoñez del 24/06/2026 (auditoría
 * 2026-08-12) — el documento queda "oficial" cuando el associé unique lo fecha, lo firma y lo
 * consigna en el registre des décisions, no por generarlo aquí. */
export async function generarPdfDecisionRemuneracion(anio: number, remuneracionAnual: number, capitalSocial: number): Promise<void> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  await registrarFuentePoppins(doc);
  const { entidad, margen } = await cabeceraDocumento(doc, 'DÉCISION DE L’ASSOCIÉ UNIQUE');

  const fecha = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });

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
    `L'associé unique de la société ${entidad.razon_social || 'Reformas Ordoñez'}, entreprise unipersonnelle à responsabilité ` +
      `limitée (EURL) au capital social de ${fmtEur(capitalSocial)}, dont le siège social est situé ${entidad.direccion || ''}, ` +
      `immatriculée au Registre du Commerce et des Sociétés de Bayonne sous le numéro ${entidad.identificador || ''},`,
  );
  parrafo(
    `Représentant l'intégralité du capital social et exerçant les pouvoirs dévolus à l'associé unique par l'article 15 ` +
      `des statuts de la société, après avoir rappelé que la gérance est assurée par ` +
      `${entidad.nombre_titular || 'Mario Ricardo Ordoñez Quevedo'},`,
  );
  parrafo('PREND LA DÉCISION SUIVANTE :', { negrita: true, espacioAntes: 4, espacioDespues: 8 });
  parrafo('Article unique — Rémunération du gérant', { negrita: true, espacioDespues: 4 });
  parrafo(
    `Conformément à l'article 12 des statuts, qui prévoit que la rémunération du gérant est fixée par décision de ` +
      `l'associé unique, la rémunération annuelle brute allouée à ${entidad.nombre_titular || 'Mario Ricardo Ordoñez Quevedo'}, ` +
      `au titre de son mandat de gérant, pour l'exercice ${anio}, est fixée à ${fmtEur(remuneracionAnual)}, soit ` +
      `${fmtEur(remuneracionAnual / 12)} par mois.`,
  );
  parrafo(
    'Cette rémunération est soumise aux cotisations sociales des travailleurs non-salariés (TNS) dues auprès de la ' +
      'Sécurité Sociale des Indépendants (SSI), conformément à la réglementation en vigueur.',
  );
  parrafo(
    "La présente décision constitue une décision collective au sens des articles L223-6 et L223-29 du Code de commerce ; " +
      "elle est consignée et numérotée dans le registre des décisions de l'associé unique, coté et paraphé, tenu au siège " +
      'social conformément aux articles 15 et 22 des statuts et à l’article R223-26 du Code de commerce.',
    { espacioDespues: 20 },
  );
  parrafo(`Fait à Hendaye, le ${fecha}, en un exemplaire original conservé au siège social.`, { espacioDespues: 20 });
  parrafo("L'associé unique,", { espacioDespues: 20 });
  parrafo(entidad.nombre_titular || 'Mario Ricardo Ordoñez Quevedo', { negrita: true });

  piePagina(
    doc,
    margen,
    "Document généré à partir des chiffres saisis dans l'onglet Cotisations URSSAF — il devient la décision officielle une " +
      "fois daté, signé par l'associé unique et consigné dans le registre des décisions, après vérification de sa cohérence " +
      'avec les statuts de la société.',
  );

  doc.save(`decision-remuneration-gerant-${anio}.pdf`);
}

/** "Décision de l'associé unique" aprobando las cuentas anuales del ejercicio y la afectación del
 * resultado — paso previo obligatorio al dépôt des comptes en el Greffe (art. L223-26 Code de
 * commerce: el dépôt exige que las cuentas hayan sido "approuvées par l'associé unique"). Mismo
 * criterio que `generarPdfDecisionRemuneracion`: es un borrador que se vuelve oficial cuando se
 * firma y se consigna en el registre des décisions, no por generarlo aquí. La dotación a la
 * réserve légale (article 18 des statuts) se recibe ya calculada por `calcularReservaLegal`. */
export async function generarPdfDecisionAprobacionCuentas(
  anio: number,
  datos: { resultadoNeto: number; reservaLegal: ReturnType<typeof calcularReservaLegal>; capitalSocial: number },
): Promise<void> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  await registrarFuentePoppins(doc);
  const { entidad, margen } = await cabeceraDocumento(doc, 'DÉCISION DE L’ASSOCIÉ UNIQUE');

  const fecha = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });

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

  const reportANouveau = Math.max(0, datos.resultadoNeto - datos.reservaLegal.dotacion);

  parrafo(
    `L'associé unique de la société ${entidad.razon_social || 'Reformas Ordoñez'}, entreprise unipersonnelle à responsabilité ` +
      `limitée (EURL) au capital social de ${fmtEur(datos.capitalSocial)}, dont le siège social est situé ${entidad.direccion || ''}, ` +
      `immatriculée au Registre du Commerce et des Sociétés de Bayonne sous le numéro ${entidad.identificador || ''},`,
  );
  parrafo(
    "Représentant l'intégralité du capital social et exerçant les pouvoirs dévolus à l'associé unique par l'article 15 " +
      `des statuts de la société, après avoir pris connaissance des comptes annuels de l'exercice clos le 31 décembre ${anio} ` +
      `(bilan, compte de résultat et annexe), tels qu'ils lui ont été présentés,`,
  );
  parrafo('PREND LES DÉCISIONS SUIVANTES :', { negrita: true, espacioAntes: 4, espacioDespues: 8 });

  parrafo('Article 1 — Approbation des comptes', { negrita: true, espacioDespues: 4 });
  parrafo(
    `L'associé unique approuve les comptes annuels de l'exercice clos le 31 décembre ${anio} tels qu'ils lui ont été ` +
      'présentés, ainsi que les opérations traduites dans ces comptes.',
  );

  parrafo('Article 2 — Résultat de l\'exercice', { negrita: true, espacioDespues: 4 });
  parrafo(`L'associé unique constate que le résultat net de l'exercice s'élève à ${fmtEur(datos.resultadoNeto)}.`);

  parrafo("Article 3 — Affectation du résultat", { negrita: true, espacioDespues: 4 });
  parrafo(
    datos.reservaLegal.dotacion > 0
      ? `Conformément à l'article 18 des statuts, l'associé unique décide d'affecter ${fmtEur(datos.reservaLegal.dotacion)} ` +
          `à la réserve légale, et de reporter le solde, soit ${fmtEur(reportANouveau)}, à nouveau.`
      : `La réserve légale ayant déjà atteint le plafond de 10% du capital social prévu à l'article 18 des statuts, ` +
          `l'associé unique décide de reporter la totalité du résultat, soit ${fmtEur(reportANouveau)}, à nouveau.`,
  );

  parrafo("Article 4 — Quitus au gérant", { negrita: true, espacioDespues: 4 });
  parrafo(
    `L'associé unique donne quitus entier et sans réserve à ${entidad.nombre_titular || 'Mario Ricardo Ordoñez Quevedo'} ` +
      'pour sa gestion durant l\'exercice écoulé.',
  );

  parrafo(
    "La présente décision constitue une décision collective au sens des articles L223-6 et L223-29 du Code de commerce ; " +
      "elle est consignée et numérotée dans le registre des décisions de l'associé unique, coté et paraphé, tenu au siège " +
      'social conformément aux articles 15 et 22 des statuts et à l’article R223-26 du Code de commerce.',
    { espacioAntes: 4, espacioDespues: 20 },
  );
  parrafo(`Fait à Hendaye, le ${fecha}, en un exemplaire original conservé au siège social.`, { espacioDespues: 20 });
  parrafo("L'associé unique,", { espacioDespues: 20 });
  parrafo(entidad.nombre_titular || 'Mario Ricardo Ordoñez Quevedo', { negrita: true });

  piePagina(
    doc,
    margen,
    "Document généré à partir des chiffres calculés dans l'onglet Impôt sur les Sociétés — il devient la décision " +
      "officielle une fois daté, signé par l'associé unique et consigné dans le registre des décisions, après vérification " +
      'de sa cohérence avec les comptes annuels réels préparés par votre expert-comptable.',
  );

  doc.save(`decision-approbation-comptes-${anio}.pdf`);
}

/** Resumen mensual interno de rémunération/cotisations TNS del gérant — un justificante archivable
 * aunque, al ser gérant majoritaire TNS, no exista obligación legal de bulletin de paie. */
export async function generarPdfResumenTNS(anio: number, mes: number, remuneracionAnual: number, config: ConfigFn): Promise<void> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  await registrarFuentePoppins(doc);
  const { entidad, colorRgb, margen } = await cabeceraDocumento(doc, 'RÉCAPITULATIF MENSUEL — RÉMUNÉRATION DU GÉRANT');

  doc.setFont(FUENTE_PDF, 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...GRIS_TEXTO);
  doc.text(`${MESES_FR[mes - 1]} ${anio} — ${entidad.nombre_titular || 'Mario Ricardo Ordoñez Quevedo'}, gérant`, margen, 36);

  const tns = calcularTNS(remuneracionAnual, config);
  const abattement = config('tns_abattement', 0.26);
  const tauxGlobal = config('tns_taux_global', 0.45);
  const remuneracionMensual = remuneracionAnual / 12;
  const cotisacionesMensuales = tns.mensual;

  autoTable(doc, {
    startY: 42,
    margin: { left: margen, right: margen },
    head: [['Concepto', 'Cálculo', 'Importe']],
    body: [
      ['Rémunération brute mensuelle', `${fmtEur(remuneracionAnual)} / 12`, fmtEur(remuneracionMensual)],
      ['Assiette TNS (abattement)', `${fmtEur(remuneracionAnual)} × ${((1 - abattement) * 100).toFixed(0)}%`, fmtEur(tns.assiette)],
      ['Cotisations TNS (mensuel)', `Assiette × ${(tauxGlobal * 100).toFixed(0)}% ÷ 12`, fmtEur(cotisacionesMensuales)],
      ['Net avant impôt sur le revenu', 'Rémunération − cotisations', fmtEur(remuneracionMensual - cotisacionesMensuales)],
    ],
    styles: { font: FUENTE_PDF, fontSize: 8.5, lineColor: GRIS_BORDE, lineWidth: 0.1, valign: 'middle' },
    headStyles: { fillColor: colorRgb, textColor: 255, fontStyle: 'bold', fontSize: 9 },
    alternateRowStyles: { fillColor: [245, 245, 244] },
  });

  piePagina(
    doc,
    margen,
    "Document interne de suivi, généré à partir des taux configurés dans fiscal_config — ne constitue pas un bulletin de " +
      'paie légal. En tant que gérant majoritaire TNS, il ne relève pas du Code du travail et n’est pas soumis à cette obligation.',
  );

  doc.save(`recapitulatif-remuneration-${String(mes).padStart(2, '0')}-${anio}.pdf`);
}
