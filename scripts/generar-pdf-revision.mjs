// Genera el PDF de revisión de un presupuesto a partir de un JSON estructurado.
// Uso: node scripts/generar-pdf-revision.mjs entrada.json salida.pdf
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { COLOR, MARGEN, ANCHO_UTIL, badgeColor, cabecera, tituloSeccion, parrafo, bullets, cajaNota, piePaginas } from './pdf-tema.mjs';

const [, , inputPath, outputPath] = process.argv;
if (!inputPath || !outputPath) {
  console.error('Uso: node scripts/generar-pdf-revision.mjs entrada.json salida.pdf');
  process.exit(1);
}

const d = JSON.parse(readFileSync(inputPath, 'utf-8'));
const doc = new jsPDF({ unit: 'mm', format: 'a4' });

let y = cabecera(doc, {
  etiqueta: 'Revisión de presupuesto',
  titulo: `${d.numero} — ${d.cliente}`,
  meta: `${d.obra}   ·   Total: ${d.totalMin} – ${d.totalMax} €   ·   ${d.ratio || ''}`,
});

// Veredicto global como badge grande
const vb = badgeColor(d.veredicto);
doc.setFillColor(...vb.fondo);
doc.setDrawColor(...vb.texto);
doc.roundedRect(MARGEN, y, 60, 9, 1.5, 1.5, 'FD');
doc.setTextColor(...vb.texto);
doc.setFont('helvetica', 'bold');
doc.setFontSize(10);
doc.text(d.veredicto.toUpperCase(), MARGEN + 30, y + 6, { align: 'center' });
doc.setTextColor(...COLOR.gray900);
doc.setFont('helvetica', 'normal');
y += 15;

if (d.resumen) {
  doc.setFontSize(9.5);
  y = parrafo(doc, y, d.resumen);
  y += 4;
}

// Tabla de líneas
y = tituloSeccion(doc, y, 'Valoración línea por línea');
autoTable(doc, {
  startY: y,
  margin: { left: MARGEN, right: MARGEN },
  head: [['Ref.', 'Designación', 'Precio (horquilla)', 'Valoración', 'Comentario']],
  body: d.lineas.map((l) => [l.referencia, l.designacion, l.precio, l.valoracion, l.comentario]),
  styles: { font: 'helvetica', fontSize: 8, cellPadding: 2.2, valign: 'top', textColor: COLOR.gray900 },
  headStyles: { fillColor: COLOR.brand, textColor: COLOR.blanco, fontStyle: 'bold', fontSize: 8 },
  alternateRowStyles: { fillColor: [250, 250, 249] },
  columnStyles: {
    0: { cellWidth: 16, fontStyle: 'bold' },
    1: { cellWidth: 32 },
    2: { cellWidth: 26 },
    3: { cellWidth: 22, fontStyle: 'bold' },
    4: { cellWidth: 'auto' },
  },
  didParseCell: (data) => {
    if (data.section === 'body' && data.column.index === 3) {
      const c = badgeColor(data.cell.raw);
      data.cell.styles.fillColor = c.fondo;
      data.cell.styles.textColor = c.texto;
    }
  },
});
y = doc.lastAutoTable.finalY + 10;

if (d.partidasOlvidadas?.length) {
  y = tituloSeccion(doc, y, 'Partidas olvidadas / riesgos');
  y = bullets(doc, y, d.partidasOlvidadas);
  y += 4;
}

if (d.recomendaciones?.length) {
  y = tituloSeccion(doc, y, 'Recomendaciones');
  y = bullets(doc, y, d.recomendaciones);
  y += 4;
}

if (d.opinionGeneral) {
  y = tituloSeccion(doc, y, 'Opinión general');
  y = cajaNota(doc, y, d.opinionGeneral, 'verde');
}

if (d.correccionAplicada) {
  y = cajaNota(doc, y, `CORRECCIÓN APLICADA EN EL CRM: ${d.correccionAplicada}`, 'ambar');
}

piePaginas(doc, `Fuentes: ${d.fuentes || '—'}`);

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, Buffer.from(doc.output('arraybuffer')));
console.log('PDF generado:', outputPath);
