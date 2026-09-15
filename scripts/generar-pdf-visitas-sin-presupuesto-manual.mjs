// Réplica en Node del PDF "Visitas sin presupuesto todavía" que ya genera el botón de descarga en
// la campana de Avisos del CRM (src/lib/generarPdfVisitasSinPresupuesto.ts) — mismo criterio (visita
// Realizada sin presupuesto vinculado, excluyendo solicitudes Descartadas), con el tema visual
// compartido de los PDFs generados por script. Incluye además Laetitia Navarron (2026-09-14, a
// petición de Gabriel): ya se le envió presupuesto, pero pidió añadir cosas antes de confirmar, así
// que merece seguir en la lista de "hace falta actuar" aunque no sea un "sin presupuesto" real.
import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { jsPDF } from 'jspdf';
import { tituloSeccion, parrafo, bullets, cajaNota, cabecera, piePaginas, COLOR, MARGEN, ANCHO_UTIL } from './pdf-tema.mjs';

const [, , outputPath] = process.argv;
if (!outputPath) {
  console.error('Uso: node scripts/generar-pdf-visitas-sin-presupuesto-manual.mjs salida.pdf');
  process.exit(1);
}

const doc = new jsPDF({ unit: 'mm', format: 'a4' });

let y = cabecera(doc, {
  etiqueta: 'Aviso · CRM',
  titulo: 'Visitas sin presupuesto todavía',
  meta: 'Reformas Ordoñez · Generado el 14/09/2026 · 4 visitas sin presupuesto + 1 caso añadido a mano',
});

function tarjeta(y, { nombre, fecha, direccion, tipo, descripcion, nota }) {
  const lineasDesc = doc.splitTextToSize(descripcion, ANCHO_UTIL);
  let alto = 5.5 + 5 + (tipo ? 5 : 0) + lineasDesc.length * 4.6 + (nota ? 10 : 0) + 6;
  if (y + alto > 280) {
    doc.addPage();
    y = MARGEN;
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11.5);
  doc.setTextColor(...COLOR.gray900);
  doc.text(nombre, MARGEN, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...COLOR.brand);
  doc.text(`Visita: ${fecha}`, 210 - MARGEN, y, { align: 'right' });
  y += 5.5;

  doc.setFontSize(9);
  doc.setTextColor(...COLOR.gray600);
  doc.text(direccion, MARGEN, y);
  y += 5;

  if (tipo) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...COLOR.brand);
    doc.text(tipo.toUpperCase(), MARGEN, y);
    y += 5;
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...COLOR.gray900);
  doc.text(lineasDesc, MARGEN, y);
  y += lineasDesc.length * 4.6 + 2;

  if (nota) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...COLOR.ambar);
    const notaLineas = doc.splitTextToSize(`AVISO: ${nota}`, ANCHO_UTIL);
    doc.text(notaLineas, MARGEN, y);
    y += notaLineas.length * 4.2 + 2;
  }

  doc.setDrawColor(...COLOR.gray200);
  doc.setLineWidth(0.2);
  y += 2;
  doc.line(MARGEN, y, MARGEN + ANCHO_UTIL, y);
  y += 6;
  doc.setTextColor(...COLOR.gray900);
  return y;
}

y = tituloSeccion(doc, y, 'Visitas realizadas sin presupuesto enviado');

y = tarjeta(y, {
  nombre: 'Devi Gruenenberger',
  fecha: '12/09/2026',
  direccion: '22 Bis Rue de Subernoa, 64700 Hendaye, France',
  tipo: 'Otro',
  descripcion: 'Aislamiento de paredes de dos habitaciones.',
});

y = tarjeta(y, {
  nombre: 'Aitor Mendizabal',
  fecha: '11/09/2026',
  direccion: 'Iñigo de Loyola Kalea, 18, 20303 Irún, Gipuzkoa, España — 1°izq',
  tipo: 'Otro',
  descripcion: 'Alicatado de baño (34 m² de pared, 30x90cm), alicatado de frontal de cocina (9 m²), suelo porcelánico (70 m², 23x120cm).',
});

y = tarjeta(y, {
  nombre: 'Javier Rodríguez Molowny',
  fecha: '10/09/2026',
  direccion: '42 Rue Marguerizahar, 64700 Urrugne, France',
  tipo: 'Otro',
  descripcion: 'Eliminar arbustos y valla, levantar murete con sistema de desagüe, subir el nivel del suelo del jardín.',
});

y = tarjeta(y, {
  nombre: 'Marc Simorre',
  fecha: '07/09/2026',
  direccion: '23 Les Hameaux d\'Aguerria, 64700 Hendaye, France',
  tipo: 'Otro',
  descripcion: 'Reforma de terraza (15 m²) para convertirla en habitación habitable. Presupuesto antiguo de mayo — contactó de nuevo para retomarlo, quiere cambiar algunas cosas.',
});

y = tituloSeccion(doc, y, 'Añadido a petición de Gabriel — presupuesto ya enviado, pide más cosas');

y = tarjeta(y, {
  nombre: 'Laetitia Navarron (P-2026-0057)',
  fecha: '10/09/2026',
  direccion: '15 Rue de la Gare, Hendaye, France',
  tipo: 'Cocina',
  descripcion: 'Devis — Rénovation partielle de cuisine : structure, sol et cloisons.',
});

y = parrafo(
  doc,
  y,
  'El presupuesto se envió el 12/09/2026 por 8.690 €. Sigue en estado Pendiente — la clienta no lo ha rechazado, pero antes de confirmar mandó dos emails pidiendo cambios y aclaraciones.',
);
y += 3;

doc.setFont('helvetica', 'bold');
doc.setFontSize(9.5);
doc.setTextColor(...COLOR.brand);
doc.text('Email del 12/09 — primera respuesta al presupuesto', MARGEN, y);
doc.setTextColor(...COLOR.gray900);
doc.setFont('helvetica', 'normal');
y += 6;
y = bullets(doc, y, [
  'Confirma que quiere seguir adelante con el presupuesto.',
  'Antes de firmar necesita la aprobación de su comunidad de propietarios — dice que ya la ha solicitado.',
  'Pide añadir la demolición de la chimenea.',
  'Pregunta si también nos encargamos de renovar el circuito eléctrico, para añadir un interruptor en la nueva habitación creada.',
  'Pregunta por el calendario aproximado de la obra: fecha de inicio y duración.',
]);
y += 3;

doc.setFont('helvetica', 'bold');
doc.setFontSize(9.5);
doc.setTextColor(...COLOR.brand);
doc.text('Email del 14/09 — aclaraciones tras darle más vueltas', MARGEN, y);
doc.setTextColor(...COLOR.gray900);
doc.setFont('helvetica', 'normal');
y += 6;
y = bullets(doc, y, [
  'El muro que hay que derribar contiene 3 tomas de corriente y una caja de control del calentador de agua — pide reubicar estas conexiones en los otros muros y que se incluya en el presupuesto.',
  'Envía una foto del marco de las antiguas puertas del comedor y la cocina, y pregunta si forma parte del muro a derribar (foto disponible en el email, en Gmail).',
  'Se disculpa por las preguntas tardías y se ofrece a una nueva visita si hiciera falta.',
]);
y += 3;

doc.setFont('helvetica', 'bold');
doc.setFontSize(9.5);
doc.setTextColor(...COLOR.brand);
doc.text('Qué falta por hacer', MARGEN, y);
doc.setTextColor(...COLOR.gray900);
doc.setFont('helvetica', 'normal');
y += 6;
y = bullets(doc, y, [
  'Añadir al presupuesto: demolición de la chimenea + reubicación del circuito eléctrico (3 tomas + caja del calentador + interruptor nuevo en la habitación creada).',
  'Aclarar si el marco de las puertas antiguas entra en la demolición del muro.',
  'Responder sobre el calendario aproximado de la obra.',
  'La aprobación de su comunidad de propietarios sigue pendiente por su parte — no depende de nosotros.',
]);
y += 2;

y = cajaNota(
  doc,
  y,
  'La traducción completa al español de ambos emails ya está guardada en la nota interna del presupuesto P-2026-0057 en el CRM, lista para pasar a Ricardo.',
  'verde',
);

piePaginas(doc, 'Reformas Ordoñez · Aviso generado manualmente el 14/09/2026');

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, Buffer.from(doc.output('arraybuffer')));
console.log('PDF generado:', outputPath);
