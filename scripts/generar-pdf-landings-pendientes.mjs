// Checklist de landings locales (negocio/equipo-marketing/landings/) pendientes de publicar en
// ordonezrenov.com — verificado contra el sitio en vivo el 14/09/2026 (curl + comparación de
// <title> real vs "Meta title" de cada archivo). Ninguna de las 35 coincide con la versión local.
import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { jsPDF } from 'jspdf';
import { tituloSeccion, parrafo, bullets, cajaNota, cabecera, piePaginas, COLOR, MARGEN, ANCHO_UTIL } from './pdf-tema.mjs';

const [, , outputPath] = process.argv;
if (!outputPath) {
  console.error('Uso: node scripts/generar-pdf-landings-pendientes.mjs salida.pdf');
  process.exit(1);
}

const doc = new jsPDF({ unit: 'mm', format: 'a4' });

let y = cabecera(doc, {
  etiqueta: 'Marketing · Landings',
  titulo: 'Landings pendientes de publicar',
  meta: 'Reformas Ordoñez · Verificado en vivo el 14/09/2026 · 35 páginas, 0 actualizadas',
});

// Layout en dos líneas por fila (archivo+estado arriba, slug debajo) para que un nombre de archivo
// largo nunca se solape con la etiqueta de estado a la derecha — con una sola línea combinada eso
// pasaba en varias filas (bug real, corregido tras verlo en el primer PDF generado).
function filaEstado(y, { archivo, slug, estado, detalle }) {
  const slugLineas = doc.splitTextToSize(`-> ${slug}`, ANCHO_UTIL - 6);
  const alto = 4.3 + slugLineas.length * 4 + (detalle ? doc.splitTextToSize(detalle, ANCHO_UTIL - 6).length * 3.6 : 0) + 4;
  if (y + alto > 280) {
    doc.addPage();
    y = MARGEN;
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...COLOR.gray900);
  doc.text(`[ ] ${archivo}`, MARGEN, y);

  const colorEstado = estado === 'No publicada' ? COLOR.rojo : COLOR.ambar;
  doc.setFontSize(7.5);
  doc.setTextColor(...colorEstado);
  doc.text(estado, 210 - MARGEN, y, { align: 'right' });
  y += 4.3;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...COLOR.gray600);
  doc.text(slugLineas, MARGEN + 6, y);
  y += slugLineas.length * 4;

  if (detalle) {
    doc.setTextColor(...COLOR.gray400);
    const detLineas = doc.splitTextToSize(detalle, ANCHO_UTIL - 6);
    doc.text(detLineas, MARGEN + 6, y);
    y += detLineas.length * 3.6;
  }
  doc.setTextColor(...COLOR.gray900);
  y += 4;
  return y;
}

y = parrafo(
  doc,
  y,
  'Verificación hecha con curl contra ordonezrenov.com el 14/09/2026, comparando el título real publicado con el "Meta title" de cada archivo local. Resultado: ninguna de las 35 coincide — confirma que ninguna se ha actualizado todavía. "No publicada" = la URL da 404, no existe ninguna versión. "Versión antigua" = la URL existe pero con un título/contenido distinto al de tu archivo local, hay que reemplazarlo. "Redirige" = la URL no tiene página propia, reenvía a otra.',
);
y += 4;

y = tituloSeccion(doc, y, 'Nivel 1 — Principales genéricas');
y = filaEstado(y, { archivo: 'pose-de-sol.html', slug: '/fr/pose-de-sol/', estado: 'No publicada' });
y = filaEstado(y, {
  archivo: 'ravalement-de-facade.html',
  slug: '/fr/ravalement-de-facade/',
  estado: 'Redirige',
  detalle: 'Reenvía a /fr/renovation-integrale-hendaye/ravalement-de-facade/ — revisar ese redirect antes de publicar esta genérica, para no crear un conflicto.',
});
y = filaEstado(y, { archivo: 'renovation-maison-pays-basque.html', slug: '/fr/renovation-maison-pays-basque/', estado: 'No publicada' });
y = filaEstado(y, { archivo: 'renovation-salle-de-bain.html', slug: '/fr/renovation-salle-de-bain/', estado: 'No publicada' });
y += 2;

y = tituloSeccion(doc, y, 'Nivel 2 — Principales locales');
y = filaEstado(y, { archivo: 'renovation-biriatou.html', slug: '/fr/renovation-biriatou/', estado: 'No publicada' });
y = filaEstado(y, { archivo: 'renovation-guethary.html', slug: '/fr/renovation-guethary/', estado: 'No publicada' });
y = filaEstado(y, { archivo: 'renovation-integrale-hendaye.html', slug: '/fr/renovation-integrale-hendaye/', estado: 'Versión antigua' });
y = filaEstado(y, { archivo: 'renovation-saint-jean-de-luz.html', slug: '/fr/renovation-saint-jean-de-luz/', estado: 'Versión antigua' });
y = filaEstado(y, { archivo: 'renovation-urrugne.html', slug: '/fr/renovation-urrugne/', estado: 'Versión antigua' });
y += 2;

y = tituloSeccion(doc, y, 'Nivel 3 — Servicios locales · Hendaye');
y = filaEstado(y, { archivo: 'maconnerie.html', slug: '.../maconnerie/', estado: 'Versión antigua' });
y = filaEstado(y, { archivo: 'peintre.html', slug: '.../peintre/', estado: 'Versión antigua' });
y = filaEstado(y, { archivo: 'platrerie.html', slug: '.../platrerie/', estado: 'Versión antigua' });
y = filaEstado(y, { archivo: 'ravalement-de-facade.html', slug: '.../ravalement-de-facade/', estado: 'Versión antigua' });
y = filaEstado(y, { archivo: 'renovation-de-cuisine-a-hendaye.html', slug: '.../renovation-de-cuisine-a-hendaye/', estado: 'Versión antigua' });
y = filaEstado(y, { archivo: 'renovation-de-salle-de-bain-a-hendaye.html', slug: '.../renovation-de-salle-de-bain-a-hendaye/', estado: 'Versión antigua' });
y = filaEstado(y, { archivo: 'renovation-de-toiture.html', slug: '.../renovation-de-toiture/', estado: 'Versión antigua' });
y = filaEstado(y, { archivo: 'revetements-sol.html', slug: '.../revetements-sol/', estado: 'Versión antigua' });
y += 2;

y = tituloSeccion(doc, y, 'Nivel 3 — Servicios locales · Saint-Jean-de-Luz');
y = filaEstado(y, {
  archivo: 'cuisine.html',
  slug: '.../cuisine/',
  estado: 'Versión antigua',
  detalle: 'El título en vivo aparece como solo "Email" — parece un problema real de publicación (quizás un formulario incrustado pisando el <title>), revisar aparte al republicar.',
});
y = filaEstado(y, { archivo: 'exterieur.html', slug: '.../exterieur/', estado: 'Versión antigua' });
y = filaEstado(y, { archivo: 'salle-de-bain.html', slug: '.../salle-de-bain/', estado: 'Versión antigua' });
y = filaEstado(y, { archivo: 'sols.html', slug: '.../sols/', estado: 'Versión antigua' });
y += 2;

y = tituloSeccion(doc, y, 'Nivel 4 — Subservicios locales · Hendaye');
y = filaEstado(y, { archivo: 'toiture/fuite-urgence.html', slug: '.../renovation-de-toiture/fuite-urgence/', estado: 'No publicada' });
y = filaEstado(y, { archivo: 'toiture/gouttiere.html', slug: '.../renovation-de-toiture/gouttiere/', estado: 'No publicada' });
y = filaEstado(y, { archivo: 'toiture/nettoyage.html', slug: '.../renovation-de-toiture/nettoyage/', estado: 'Versión antigua' });
y = filaEstado(y, { archivo: 'ravalement-de-facade/nettoyage.html', slug: '.../ravalement-de-facade/nettoyage/', estado: 'No publicada' });
y = filaEstado(y, { archivo: 'renovation-de-salle-de-bain-a-hendaye/baignoire.html', slug: '.../baignoire/', estado: 'Versión antigua' });
y = filaEstado(y, { archivo: 'renovation-de-salle-de-bain-a-hendaye/baignoire-douche.html', slug: '.../baignoire-douche/', estado: 'Versión antigua' });
y = filaEstado(y, { archivo: 'renovation-de-salle-de-bain-a-hendaye/carrelage.html', slug: '.../carrelage/', estado: 'Versión antigua' });
y = filaEstado(y, { archivo: 'renovation-de-salle-de-bain-a-hendaye/douche.html', slug: '.../douche/', estado: 'Versión antigua' });
y = filaEstado(y, { archivo: 'renovation-de-salle-de-bain-a-hendaye/plomberie.html', slug: '.../plomberie/', estado: 'Versión antigua' });
y = filaEstado(y, { archivo: 'revetements-sol/carrelage.html', slug: '.../revetements-sol/carrelage/', estado: 'Versión antigua' });
y = filaEstado(y, { archivo: 'revetements-sol/parquet.html', slug: '.../revetements-sol/parquet/', estado: 'Versión antigua' });
y += 2;

y = tituloSeccion(doc, y, 'Nivel 4 — Subservicios locales · Saint-Jean-de-Luz');
y = filaEstado(y, {
  archivo: 'exterieur/toiture.html',
  slug: '.../exterieur/toiture/',
  estado: 'Versión antigua',
  detalle: 'El título en vivo también aparece como solo "Email" — mismo caso que cuisine.html de Saint-Jean-de-Luz, revisar.',
});
y = filaEstado(y, { archivo: 'exterieur/ravalement-facade.html', slug: '.../exterieur/ravalement-facade/', estado: 'Versión antigua' });
y = filaEstado(y, { archivo: 'sols/carrelage.html', slug: '.../sols/carrelage/', estado: 'Versión antigua' });

y = cajaNota(
  doc,
  y,
  'Resumen: 35 landings en total — 13 no publicadas todavía (404), 21 con versión antigua distinta ya en vivo, 1 redirige a otra página. Ninguna coincide con el archivo local actual. Dos páginas (cuisine.html y exterieur/toiture.html de Saint-Jean-de-Luz) muestran un título "Email" raro en vivo, revisar ese caso aparte.',
  'ambar',
);

piePaginas(doc, 'Reformas Ordoñez · Checklist de landings, verificado el 14/09/2026');

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, Buffer.from(doc.output('arraybuffer')));
console.log('PDF generado:', outputPath);
