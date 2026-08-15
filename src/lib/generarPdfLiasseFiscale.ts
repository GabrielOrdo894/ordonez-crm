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

type CompteResultat = {
  ventas: number;
  cargasExplotacion: number;
  resultadoExplotacion: number;
  resultadoFinanciero: number;
  resultadoExcepcional: number;
  resultadoAntesIS: number;
};
type BilanActivo = { tresoreria: number; creancesClients: number; inmovilizadoNeto: number; total: number };
type BilanPasivo = {
  capitalSocial: number;
  reservas: number;
  resultadoEjercicio: number;
  dettesFiscales: number;
  dettesFournisseurs: number;
  total: number;
};
type ResultadoIS = { plafondReducido: number; baseReducida: number; baseNormal: number; isReducido: number; isNormal: number; total: number };

/** Resumen de preparación de la liasse fiscale (2058-A/2054/2055/2050/2051/2052/2053) — no es el
 * formulario Cerfa oficial ni sustituye su transmisión EDI-TDFC (trámite manual posterior, con un
 * partenaire EDI o el expert-comptable). Organiza en tablas las cifras ya calculadas en el CRM
 * (compte de résultat del libro diario, bilan simplificado, registro de inmovilizado) para que se
 * puedan entregar directamente a quien haga la transmisión real. */
export async function generarPdfLiasseFiscale(
  anio: number,
  datos: {
    compteResultat: CompteResultat;
    bilanActivo: BilanActivo;
    bilanPasivo: BilanPasivo;
    resultadoNeto: number;
    is: ResultadoIS;
    activos: ActivoInmovilizado[];
  },
): Promise<void> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  await registrarFuentePoppins(doc);
  const { colorRgb, margen } = await cabeceraDocumento(doc, 'RÉSUMÉ DE LIASSE FISCALE');

  doc.setFillColor(254, 243, 199);
  doc.rect(margen, 33, 210 - margen * 2, 9, 'F');
  doc.setFont(FUENTE_PDF, 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(146, 64, 14);
  const avisoLineas = doc.splitTextToSize(
    "DOCUMENT DE PRÉPARATION INTERNE — CE N'EST PAS LE FORMULAIRE CERFA OFFICIEL. À transmettre via un partenaire EDI " +
      'ou à remettre à votre expert-comptable, jamais à envoyer tel quel à la DGFiP.',
    210 - margen * 2 - 4,
  );
  doc.text(avisoLineas, margen + 2, 38);

  const columnasImporte = { 1: { halign: 'right' as const, cellWidth: 35 } };

  autoTable(doc, {
    startY: 48,
    margin: { left: margen, right: margen },
    head: [[`2058-A — Détermination du résultat fiscal (exercice ${anio})`, '']],
    body: [
      ['Résultat comptable avant IS', fmt(datos.compteResultat.resultadoAntesIS)],
      ['Impôt sur les Sociétés', fmt(-datos.is.total)],
      ['Résultat net', fmt(datos.resultadoNeto)],
    ],
    styles: { font: FUENTE_PDF, fontSize: 8.5, lineColor: GRIS_BORDE, lineWidth: 0.1 },
    headStyles: { fillColor: colorRgb, textColor: 255, fontStyle: 'bold', fontSize: 9 },
    columnStyles: columnasImporte,
  });
  let y = finalY(doc) + 3;
  doc.setFont(FUENTE_PDF, 'italic');
  doc.setFontSize(7);
  doc.setTextColor(120, 120, 120);
  doc.text(
    "Sans réintégrations/déductions fiscales détaillées — cette activité n'a pas de charges non déductibles matérielles à ce jour.",
    margen,
    y,
  );
  y += 8;

  autoTable(doc, {
    startY: y,
    margin: { left: margen, right: margen },
    head: [[`2052/2053 — Compte de résultat (exercice ${anio})`, '']],
    body: [
      ['Ventes (706)', fmt(datos.compteResultat.ventas)],
      ["Charges d'exploitation (60-65, 68)", fmt(-datos.compteResultat.cargasExplotacion)],
      ["Résultat d'exploitation", fmt(datos.compteResultat.resultadoExplotacion)],
      ['Résultat financier', fmt(datos.compteResultat.resultadoFinanciero)],
      ['Résultat exceptionnel', fmt(datos.compteResultat.resultadoExcepcional)],
      ['Résultat comptable avant IS', fmt(datos.compteResultat.resultadoAntesIS)],
    ],
    styles: { font: FUENTE_PDF, fontSize: 8.5, lineColor: GRIS_BORDE, lineWidth: 0.1 },
    headStyles: { fillColor: colorRgb, textColor: 255, fontStyle: 'bold', fontSize: 9 },
    columnStyles: columnasImporte,
  });
  y = finalY(doc) + 8;

  autoTable(doc, {
    startY: y,
    margin: { left: margen, right: margen },
    head: [[`2050/2051 — Bilan simplifié (exercice ${anio})`, '']],
    body: [
      ['ACTIF', ''],
      ['Trésorerie (512)', fmt(datos.bilanActivo.tresoreria)],
      ['Créances clients', fmt(datos.bilanActivo.creancesClients)],
      ['Immobilisations (valeur nette)', fmt(datos.bilanActivo.inmovilizadoNeto)],
      ['Total actif', fmt(datos.bilanActivo.total)],
      ['PASSIF', ''],
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
      if (data.row.section === 'body' && (data.row.raw as string[])[0] === 'ACTIF') data.cell.styles.fontStyle = 'bold';
      if (data.row.section === 'body' && (data.row.raw as string[])[0] === 'PASSIF') data.cell.styles.fontStyle = 'bold';
    },
  });
  y = finalY(doc) + 8;

  if (y > 240) {
    doc.addPage();
    y = 20;
  }

  if (datos.activos.length > 0) {
    autoTable(doc, {
      startY: y,
      margin: { left: margen, right: margen },
      head: [['2054/2055 — Immobilisations et amortissements', 'Valeur brute', 'Amort. cumulé', 'VNC']],
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
    doc.text('2054/2055 — Sin activos registrados en el inmovilizado.', margen, y);
  }

  piePagina(
    doc,
    margen,
    'Generado a partir de los cálculos de Fiscalidad y Contabilidad del CRM (libro diario, registro de inmovilizado). ' +
      'Cifras estimadas — confírmalas con tu experto-comptable antes de transmitir la declaración real.',
  );

  doc.save(`liasse-fiscale-resumen-${anio}.pdf`);
}
