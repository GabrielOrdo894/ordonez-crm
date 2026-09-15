// Estado puntual de presupuestos pendientes de enviar (borrador nunca enviado + mensaje
// redactado esperando confirmación de envío) — snapshot bajo demanda, no un informe recurrente.
// Uso: node scripts/generar-pdf-pendientes-enviar.mjs salida.pdf
import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { jsPDF } from 'jspdf';
import { tituloSeccion, parrafo, bullets, cajaNota, cabecera, piePaginas } from './pdf-tema.mjs';

const [, , outputPath] = process.argv;
if (!outputPath) {
  console.error('Uso: node scripts/generar-pdf-pendientes-enviar.mjs salida.pdf');
  process.exit(1);
}

const doc = new jsPDF({ unit: 'mm', format: 'a4' });

let y = cabecera(doc, {
  etiqueta: 'Estado de presupuestos',
  titulo: 'Presupuestos pendientes de enviar',
  meta: 'Reformas Ordoñez · Situación a 14/09/2026',
});

y = tituloSeccion(doc, y, 'En Borrador — nunca llegaron a enviarse');
y = bullets(doc, y, [
  'P-2026-0045 — Aitor Mendizabal (orientativo). Tel: 646855461 · Email: aitormend@hotmail.com. Creado el 28/08/2026 — lleva más de 2 semanas sin enviar.',
]);
y += 4;

y = tituloSeccion(doc, y, 'Mensaje redactado, esperando confirmación de envío (WhatsApp/SMS)');
y = parrafo(doc, y, 'Ninguno actualmente — la pestaña "Pendientes de enviar" del CRM está vacía.');
y += 6;

y = cajaNota(doc, y, 'P-2026-0045 lleva el mayor tiempo sin moverse de los dos listados de presupuestos pendientes revisados hoy — conviene decidir si se envía o se descarta.', 'ambar');

piePaginas(doc, 'Reformas Ordoñez · Estado de presupuestos, generado el 14/09/2026');

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, Buffer.from(doc.output('arraybuffer')));
console.log('PDF generado:', outputPath);
