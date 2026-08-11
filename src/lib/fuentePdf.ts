import type jsPDF from 'jspdf';

export const FUENTE_PDF = 'Poppins';

// Import dinámico — los ~900KB de la fuente en base64 solo se cargan cuando se genera un PDF,
// no como parte del bundle inicial de la app.
export async function registrarFuentePoppins(doc: jsPDF): Promise<void> {
  const { POPPINS_REGULAR_BASE64, POPPINS_BOLD_BASE64, POPPINS_ITALIC_BASE64, POPPINS_BOLDITALIC_BASE64 } = await import(
    './fuentes/poppinsBase64'
  );
  doc.addFileToVFS('Poppins-Regular.ttf', POPPINS_REGULAR_BASE64);
  doc.addFont('Poppins-Regular.ttf', FUENTE_PDF, 'normal');
  doc.addFileToVFS('Poppins-Bold.ttf', POPPINS_BOLD_BASE64);
  doc.addFont('Poppins-Bold.ttf', FUENTE_PDF, 'bold');
  doc.addFileToVFS('Poppins-Italic.ttf', POPPINS_ITALIC_BASE64);
  doc.addFont('Poppins-Italic.ttf', FUENTE_PDF, 'italic');
  doc.addFileToVFS('Poppins-BoldItalic.ttf', POPPINS_BOLDITALIC_BASE64);
  doc.addFont('Poppins-BoldItalic.ttf', FUENTE_PDF, 'bolditalic');
  doc.setFont(FUENTE_PDF, 'normal');
}
