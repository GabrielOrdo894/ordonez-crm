// Tema visual compartido para los PDFs de revisión/envío de presupuestos.
// Colores tomados de CLAUDE.md (paleta corporativa Reformas Ordoñez).
export const COLOR = {
  brand: [26, 92, 56],       // #1a5c38
  brandDark: [15, 61, 36],   // #0f3d24
  brandLight: [234, 242, 237], // #eaf2ed
  gray900: [17, 24, 39],
  gray600: [75, 85, 99],
  gray400: [156, 163, 175],
  gray200: [229, 231, 235],
  verde: [22, 101, 52],
  verdeBg: [220, 245, 225],
  ambar: [146, 64, 14],
  ambarBg: [254, 237, 200],
  rojo: [153, 27, 27],
  rojoBg: [253, 226, 226],
  blanco: [255, 255, 255],
};

export const MARGEN = 15;
export const ANCHO_UTIL = 210 - MARGEN * 2;

export function badgeColor(valor) {
  const v = (valor || '').toLowerCase();
  if (v.includes('correcto')) return { texto: COLOR.verde, fondo: COLOR.verdeBg };
  if (v.includes('bajo') || v.includes('alto') || v.includes('riesgo')) return { texto: COLOR.rojo, fondo: COLOR.rojoBg };
  if (v.includes('ajustado') || v.includes('holgado') || v.includes('pendiente')) return { texto: COLOR.ambar, fondo: COLOR.ambarBg };
  return { texto: COLOR.gray600, fondo: COLOR.gray200 };
}

export function cabecera(doc, { etiqueta, titulo, meta }) {
  doc.setFillColor(...COLOR.brandDark);
  doc.rect(0, 0, 210, 30, 'F');
  doc.setTextColor(...COLOR.blanco);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('REFORMAS ORDOÑEZ', MARGEN, 10);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(etiqueta.toUpperCase(), 210 - MARGEN, 10, { align: 'right' });
  doc.setFontSize(15);
  doc.setFont('helvetica', 'bold');
  doc.text(titulo, MARGEN, 20);
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'normal');
  doc.text(meta, MARGEN, 26);
  doc.setTextColor(...COLOR.gray900);
  return 38;
}

export function tituloSeccion(doc, y, texto) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...COLOR.brand);
  doc.text(texto.toUpperCase(), MARGEN, y);
  doc.setDrawColor(...COLOR.brand);
  doc.setLineWidth(0.5);
  doc.line(MARGEN, y + 1.5, MARGEN + ANCHO_UTIL, y + 1.5);
  doc.setTextColor(...COLOR.gray900);
  doc.setFont('helvetica', 'normal');
  return y + 8;
}

export function parrafo(doc, y, texto, opts = {}) {
  const { fontSize = 9.5, color = COLOR.gray900, x = MARGEN, ancho = ANCHO_UTIL, lineH = 4.8 } = opts;
  doc.setFontSize(fontSize);
  doc.setTextColor(...color);
  const lineas = doc.splitTextToSize(texto, ancho);
  for (const l of lineas) {
    if (y > 280) { doc.addPage(); fondoPagina(doc); y = MARGEN; }
    doc.text(l, x, y);
    y += lineH;
  }
  return y;
}

export function bullets(doc, y, items, opts = {}) {
  for (const item of items) {
    if (y > 275) { doc.addPage(); fondoPagina(doc); y = MARGEN; }
    doc.setFontSize(9.5);
    doc.setTextColor(...COLOR.brand);
    doc.text('–', MARGEN, y);
    doc.setTextColor(...(opts.color || COLOR.gray900));
    const lineas = doc.splitTextToSize(item, ANCHO_UTIL - 5);
    doc.text(lineas, MARGEN + 4, y);
    y += lineas.length * 4.8 + 1.2;
  }
  return y;
}

export function cajaNota(doc, y, texto, tipo = 'ambar') {
  const colores = tipo === 'ambar'
    ? { borde: COLOR.ambar, fondo: COLOR.ambarBg, texto: COLOR.ambar }
    : tipo === 'verde'
      ? { borde: COLOR.verde, fondo: COLOR.verdeBg, texto: COLOR.verde }
      : { borde: COLOR.gray400, fondo: COLOR.gray200, texto: COLOR.gray600 };
  doc.setFontSize(9);
  const lineas = doc.splitTextToSize(texto, ANCHO_UTIL - 8);
  const alto = lineas.length * 4.6 + 6;
  if (y + alto > 280) { doc.addPage(); fondoPagina(doc); y = MARGEN; }
  doc.setFillColor(...colores.fondo);
  doc.setDrawColor(...colores.borde);
  doc.setLineWidth(0.8);
  doc.roundedRect(MARGEN, y, ANCHO_UTIL, alto, 2, 2, 'FD');
  doc.setTextColor(...colores.texto);
  doc.text(lineas, MARGEN + 4, y + 6);
  doc.setTextColor(...COLOR.gray900);
  return y + alto + 6;
}

export function fondoPagina(doc) {
  // Franja de color sutil al pie, coherente con el resto de páginas.
  doc.setDrawColor(...COLOR.gray200);
  doc.setLineWidth(0.2);
  doc.line(MARGEN, 285, 210 - MARGEN, 285);
}

export function piePaginas(doc, notaIzquierda) {
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    fondoPagina(doc);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...COLOR.gray400);
    doc.text(notaIzquierda, MARGEN, 290);
    doc.text(`${i} / ${total}`, 210 - MARGEN, 290, { align: 'right' });
  }
}
