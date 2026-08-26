import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { GRIS_BORDE, cabeceraDocumento, piePagina } from './pdfEmpresa';
import { registrarFuentePoppins, FUENTE_PDF } from './fuentePdf';

const FILAS_VACIAS = 12;

/** Plantilla en blanco de "Note de frais" — para gastos puntuales pagados de tu bolsillo (comidas,
 * peajes, pequeño material) que quieras justificar en papel antes de meterlos en Gastos, o para que
 * la rellene a mano quien no tenga acceso al CRM. No sustituye el registro real en Gastos — es un
 * soporte físico de apoyo, igual que el resto de plantillas de Documentos. */
export async function generarPdfNotaGastosPlantilla(): Promise<void> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  await registrarFuentePoppins(doc);
  const { entidad, colorRgb, margen } = await cabeceraDocumento(doc, 'NOTE DE FRAIS');

  const anchoTexto = 210 - margen * 2;
  let y = 38;
  doc.setFont(FUENTE_PDF, 'normal');
  doc.setFontSize(9);
  doc.setTextColor(30, 30, 30);
  doc.text('Nom / Prénom : ______________________________', margen, y);
  doc.text('Mois : ____________________', margen + 110, y);
  y += 8;
  doc.text('Motif général (chantier, déplacement...) : ______________________________________________', margen, y);
  y += 10;

  const filasVacias = Array.from({ length: FILAS_VACIAS }, () => ['', '', '', '']);

  autoTable(doc, {
    startY: y,
    margin: { left: margen, right: margen },
    head: [['Date', 'Motif / description', 'Catégorie', 'Montant TTC']],
    body: filasVacias,
    styles: { font: FUENTE_PDF, fontSize: 9, lineColor: GRIS_BORDE, lineWidth: 0.15, minCellHeight: 9 },
    headStyles: { fillColor: colorRgb, textColor: 255, fontStyle: 'bold', fontSize: 9 },
    columnStyles: {
      0: { cellWidth: 28 },
      1: { cellWidth: anchoTexto - 28 - 40 - 30 },
      2: { cellWidth: 40 },
      3: { cellWidth: 30, halign: 'right' },
    },
  });

  const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  let yFinal = finalY + 8;
  doc.setFont(FUENTE_PDF, 'bold');
  doc.setFontSize(10);
  doc.text('Total : _______________ €', 210 - margen - 60, yFinal);
  yFinal += 20;

  doc.setFont(FUENTE_PDF, 'normal');
  doc.setFontSize(9);
  doc.text('Fait à _____________________, le ____ / ____ / ________', margen, yFinal);
  yFinal += 20;
  doc.text('Signature :', margen, yFinal);

  piePagina(
    doc,
    margen,
    "Plantilla de apoyo — adjunta esta hoja (con sus justificantes) al registrar el gasto correspondiente en el CRM " +
      `(Finanzas → Gastos). No sustituye ese registro digital. ${entidad.razon_social || 'Reformas Ordoñez'}.`,
  );

  doc.save('nota-de-gastos-plantilla.pdf');
}
