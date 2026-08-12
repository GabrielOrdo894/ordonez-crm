import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { cargarEntidad, cargarConfigCompleta, GRIS_BORDE, GRIS_TEXTO, hexARgb } from './pdfEmpresa';
import { configPlantillaDesde } from '../modules/finanzas/DocumentoPreview';
import { registrarFuentePoppins, FUENTE_PDF } from './fuentePdf';
import { calcularTNS } from '../modules/fiscalidad/calculos';
import type { ConfigFn } from '../modules/fiscalidad/calculos';

const MESES_FR = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];

function fmtEur(n: number) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n);
}

async function cabeceraDocumento(doc: jsPDF, titulo: string) {
  const config = await cargarConfigCompleta();
  const { entidad } = await cargarEntidad('Francia');
  const configPlantilla = configPlantillaDesde((config?.datos as { plantilla_documento?: unknown })?.plantilla_documento);
  const colorRgb = hexARgb(configPlantilla.colorPrimario);
  const margen = 15;

  doc.setTextColor(30, 30, 30);
  doc.setFont(FUENTE_PDF, 'bold');
  doc.setFontSize(10);
  doc.text(entidad.razon_social || 'Reformas Ordoñez', margen, 15);
  doc.setTextColor(...colorRgb);
  doc.setFontSize(15);
  doc.text(titulo, margen, 24);

  doc.setDrawColor(...GRIS_BORDE);
  doc.setLineWidth(0.3);
  doc.line(margen, 29, 210 - margen, 29);

  return { config, entidad, colorRgb, margen };
}

function piePagina(doc: jsPDF, margen: number, disclaimer: string) {
  doc.setDrawColor(...GRIS_BORDE);
  doc.line(margen, 280, 210 - margen, 280);
  doc.setFont(FUENTE_PDF, 'italic');
  doc.setFontSize(7.5);
  doc.setTextColor(...GRIS_TEXTO);
  const lineas = doc.splitTextToSize(disclaimer, 210 - margen * 2);
  doc.text(lineas, margen, 286);
}

/** "Décision de l'associé unique" fijando la rémunération anual del gérant — el documento
 * societario real que respalda las cifras del simulador de Cotisations URSSAF. No es un bulletin
 * de paie (el gérant majoritaire TNS no está sujeto a esa obligación), es el acta que formaliza la
 * decisión — modelo a usar como borrador, no como texto legal definitivo (auditoría 2026-08-12). */
export async function generarPdfDecisionRemuneracion(anio: number, remuneracionAnual: number): Promise<void> {
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
      `limitée (EURL), dont le siège social est situé ${entidad.direccion || ''}, immatriculée au Registre du Commerce et des ` +
      `Sociétés de Bayonne sous le numéro ${entidad.identificador || ''},`,
  );
  parrafo(`Après avoir rappelé que la gérance de la société est assurée par ${entidad.nombre_titular || 'Mario Ordoñez Quevedo'},`);
  parrafo('DÉCIDE :', { negrita: true, espacioAntes: 4, espacioDespues: 8 });
  parrafo('Article unique — Rémunération du gérant', { negrita: true, espacioDespues: 4 });
  parrafo(
    `La rémunération annuelle brute allouée à ${entidad.nombre_titular || 'Mario Ordoñez Quevedo'}, au titre de son mandat ` +
      `de gérant, pour l'exercice ${anio}, est fixée à ${fmtEur(remuneracionAnual)}.`,
  );
  parrafo(
    'Cette rémunération est soumise aux cotisations sociales des travailleurs non-salariés (TNS) dues auprès de la ' +
      'Sécurité Sociale des Indépendants (SSI), conformément à la réglementation en vigueur.',
    { espacioDespues: 20 },
  );
  parrafo(`Fait à Hendaye, le ${fecha}.`, { espacioDespues: 20 });
  parrafo("L'associé unique,", { espacioDespues: 20 });
  parrafo(entidad.nombre_titular || 'Mario Ordoñez Quevedo', { negrita: true });

  piePagina(
    doc,
    margen,
    "Modèle à usage interne, généré automatiquement à partir des chiffres saisis dans l'onglet Cotisations URSSAF — " +
      "à faire valider par l'expert-comptable avant signature. Ne remplace pas un procès-verbal rédigé par un professionnel.",
  );

  doc.save(`decision-remuneration-gerant-${anio}.pdf`);
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
  doc.text(`${MESES_FR[mes - 1]} ${anio} — ${entidad.nombre_titular || 'Mario Ordoñez Quevedo'}, gérant`, margen, 36);

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
