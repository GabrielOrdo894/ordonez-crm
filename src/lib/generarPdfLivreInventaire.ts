import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { GRIS_BORDE, cabeceraDocumento, piePagina } from './pdfEmpresa';
import { registrarFuentePoppins, FUENTE_PDF } from './fuentePdf';
import { amortizacionAcumulada, valorNetoContable, type ActivoInmovilizado } from './inmovilizado';
import { cuentaLabel } from '../modules/finanzas/gastos/categorias';

function fmt(n: number) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n);
}

function finalY(doc: jsPDF): number {
  return (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
}

type BilanActivo = { tresoreria: number; creancesClients: number; inmovilizadoNeto: number; total: number };
type BilanPasivo = {
  capitalSocial: number;
  reservas: number;
  resultadoEjercicio: number;
  dettesFiscales: number;
  dettesFournisseurs: number;
  total: number;
};

/** Livre d'inventaire (art. L123-12 Code de commerce): inventaire annuel de l'actif et du passif de
 * la société au 31/12. Depuis le décret n° 2015-1478 (2015), le livre coté et paraphé n'est plus
 * obligatoire — il suffit de conserver le support justifiant le contenu de l'inventaire (art.
 * R123-173-1), ce que ce PDF constitue. Reprend les mêmes données que le bilan simplifié de la
 * liasse fiscale (mêmes calculs, pas de logique dupliquée). */
export async function generarPdfLivreInventaire(
  anio: number,
  datos: { bilanActivo: BilanActivo; bilanPasivo: BilanPasivo; activos: ActivoInmovilizado[] },
): Promise<void> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  await registrarFuentePoppins(doc);
  const { colorRgb, margen } = await cabeceraDocumento(doc, "LIVRE D'INVENTAIRE");

  doc.setFillColor(234, 242, 237);
  doc.rect(margen, 33, 210 - margen * 2, 13, 'F');
  doc.setFont(FUENTE_PDF, 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(15, 61, 36);
  const avisoLineas = doc.splitTextToSize(
    `Inventaire de l'actif et du passif au 31/12/${anio} (art. L123-12 Code de commerce). Depuis le décret ` +
      "n° 2015-1478, le livre coté et paraphé n'est plus obligatoire : ce document constitue le support " +
      'justifiant le contenu de l\'inventaire, à conserver 10 ans (art. R123-173-1).',
    210 - margen * 2 - 4,
  );
  doc.text(avisoLineas, margen + 2, 38);

  const columnasImporte = { 1: { halign: 'right' as const, cellWidth: 35 } };

  autoTable(doc, {
    startY: 50,
    margin: { left: margen, right: margen },
    head: [[`Actif — inventaire au 31/12/${anio}`, '']],
    body: [
      ['Trésorerie (512)', fmt(datos.bilanActivo.tresoreria)],
      ['Créances clients', fmt(datos.bilanActivo.creancesClients)],
      ['Immobilisations (valeur nette)', fmt(datos.bilanActivo.inmovilizadoNeto)],
      ['Total actif', fmt(datos.bilanActivo.total)],
    ],
    styles: { font: FUENTE_PDF, fontSize: 8.5, lineColor: GRIS_BORDE, lineWidth: 0.1 },
    headStyles: { fillColor: colorRgb, textColor: 255, fontStyle: 'bold', fontSize: 9 },
    columnStyles: columnasImporte,
    didParseCell: (data) => {
      if (data.row.section === 'body' && (data.row.raw as string[])[0] === 'Total actif') data.cell.styles.fontStyle = 'bold';
    },
  });
  let y = finalY(doc) + 8;

  autoTable(doc, {
    startY: y,
    margin: { left: margen, right: margen },
    head: [[`Passif — inventaire au 31/12/${anio}`, '']],
    body: [
      ['Capital social', fmt(datos.bilanPasivo.capitalSocial)],
      ['Réserves', fmt(datos.bilanPasivo.reservas)],
      ["Résultat de l'exercice", fmt(datos.bilanPasivo.resultadoEjercicio)],
      ['Dettes fiscales (IS)', fmt(datos.bilanPasivo.dettesFiscales)],
      ['Dettes fournisseurs (non suivies dans le CRM — voir note)', fmt(datos.bilanPasivo.dettesFournisseurs)],
      ['Total passif', fmt(datos.bilanPasivo.total)],
    ],
    styles: { font: FUENTE_PDF, fontSize: 8.5, lineColor: GRIS_BORDE, lineWidth: 0.1 },
    headStyles: { fillColor: colorRgb, textColor: 255, fontStyle: 'bold', fontSize: 9 },
    columnStyles: columnasImporte,
    didParseCell: (data) => {
      if (data.row.section === 'body' && (data.row.raw as string[])[0] === 'Total passif') data.cell.styles.fontStyle = 'bold';
    },
  });
  y = finalY(doc) + 8;

  if (y > 230) {
    doc.addPage();
    y = 20;
  }

  if (datos.activos.length > 0) {
    autoTable(doc, {
      startY: y,
      margin: { left: margen, right: margen },
      head: [['Détail des immobilisations', 'Valeur brute', 'Amort. cumulé', 'VNC']],
      body: datos.activos.map((a) => [
        `${a.descripcion} (${cuentaLabel(a.cuenta_pcg)})`,
        fmt(a.valor_adquisicion),
        fmt(amortizacionAcumulada(a, anio)),
        fmt(valorNetoContable(a, anio)),
      ]),
      styles: { font: FUENTE_PDF, fontSize: 8, lineColor: GRIS_BORDE, lineWidth: 0.1 },
      headStyles: { fillColor: colorRgb, textColor: 255, fontStyle: 'bold', fontSize: 8.5 },
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
    });
  } else {
    doc.setFont(FUENTE_PDF, 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(120, 120, 120);
    doc.text('Détail des immobilisations — aucun actif enregistré.', margen, y);
  }

  piePagina(
    doc,
    margen,
    "Généré depuis les calculs de Fiscalité et Comptabilité du CRM (bilan simplifié, registre d'inmovilizado). " +
      'À conserver 10 ans avec les pièces justificatives (art. R123-173-1 Code de commerce).',
  );

  doc.save(`livre-inventaire-${anio}.pdf`);
}
