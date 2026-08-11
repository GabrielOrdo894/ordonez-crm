// Genera el PDF de respuesta a una solicitud de presupuesto entrante (formulario web / Landbot, primer contacto)
// a partir de un JSON estructurado.
// Uso: node scripts/generar-pdf-solicitud.mjs entrada.json salida.pdf
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { jsPDF } from 'jspdf';
import { COLOR, MARGEN, ANCHO_UTIL, cabecera, parrafo, cajaNota, piePaginas } from './pdf-tema.mjs';

const [, , inputPath, outputPath] = process.argv;
if (!inputPath || !outputPath) {
  console.error('Uso: node scripts/generar-pdf-solicitud.mjs entrada.json salida.pdf');
  process.exit(1);
}

const d = JSON.parse(readFileSync(inputPath, 'utf-8'));
const doc = new jsPDF({ unit: 'mm', format: 'a4' });

let y = cabecera(doc, {
  etiqueta: 'Solicitud entrante · Respuesta',
  titulo: d.clienteNombre || '(nombre sin confirmar)',
  meta: `Fuente: ${d.fuente}   ·   Fecha solicitud: ${d.fechaSolicitud}   ·   Idioma: ${d.idioma}`,
});

y += 4;

if (d.resumenSolicitud) {
  y = cajaNota(doc, y, `Solicitud recibida: ${d.resumenSolicitud}`, 'ambar');
  y += 2;
}

// Tarjeta tipo email
const inicioTarjeta = y;
doc.setDrawColor(...COLOR.gray200);
doc.setFillColor(...COLOR.blanco);
doc.setLineWidth(0.3);

doc.setFillColor(...COLOR.brandLight);
doc.rect(MARGEN, y, ANCHO_UTIL, 16, 'F');
doc.setFontSize(8);
doc.setTextColor(...COLOR.gray600);
doc.setFont('helvetica', 'bold');
doc.text('PARA', MARGEN + 3, y + 5);
doc.text('ASUNTO', MARGEN + 3, y + 12);
doc.setFont('helvetica', 'normal');
doc.setTextColor(...COLOR.gray900);
doc.setFontSize(9.5);
const paraTexto = d.clienteEmail
  ? `${d.clienteNombre || d.clienteEmail}  <${d.clienteEmail}>`
  : (d.clienteNombre || '(sin datos de contacto)');
doc.text(paraTexto, MARGEN + 22, y + 5);
doc.setFont('helvetica', 'bold');
doc.text(d.asunto, MARGEN + 22, y + 12);
doc.setFont('helvetica', 'normal');
y += 20;

doc.setFontSize(9.5);
const parrafos = d.cuerpo.split('\n\n');
for (const p of parrafos) {
  y = parrafo(doc, y, p, { fontSize: 10, lineH: 5.2 });
  y += 4;
}

const alturaTarjeta = y - inicioTarjeta;
doc.setDrawColor(...COLOR.gray200);
doc.rect(MARGEN, inicioTarjeta, ANCHO_UTIL, alturaTarjeta, 'S');
y += 6;

if (d.avisos?.length) {
  for (const aviso of d.avisos) {
    y = cajaNota(doc, y, aviso, 'ambar');
    y += 2;
  }
}

piePaginas(doc, `Solicitud entrante · borrador de respuesta, no enviado`);

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, Buffer.from(doc.output('arraybuffer')));
console.log('PDF generado:', outputPath);
