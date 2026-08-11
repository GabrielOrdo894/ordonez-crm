import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { cargarConfigCompleta, urlABase64, dimensionesImagen, ajustarCaja, GRIS_BORDE, GRIS_TEXTO, hexARgb, totalPaginasPdf } from './pdfEmpresa';
import { registrarFuentePoppins, FUENTE_PDF } from './fuentePdf';
import type { Proveedor } from '../modules/finanzas/proveedores/types';

/** Genera un único PDF con la ficha de cada proveedor en formato de tabla, para incluir en el
 * ZIP de exportación de Proveedores (no hay un "documento" individual por proveedor). */
export async function generarPdfListadoProveedores(proveedores: Proveedor[], filtrosTexto: string): Promise<Blob> {
  const config = await cargarConfigCompleta();
  const datos = (config?.datos ?? {}) as { logo_oficial_url?: string; logo_url?: string };
  const logoUrl = datos.logo_oficial_url || datos.logo_url;
  const logo = logoUrl ? await urlABase64(logoUrl) : null;

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  await registrarFuentePoppins(doc);
  const margen = 15;
  const colorRgb = hexARgb('#1a5c38');

  let xTexto = margen;
  if (logo) {
    const dim = await dimensionesImagen(logo.dataUrl);
    const caja = ajustarCaja(dim.w, dim.h, 16, 16);
    doc.addImage(logo.dataUrl, logo.formato, margen, 8, caja.w, caja.h);
    xTexto = margen + caja.w + 5;
  }
  doc.setTextColor(30, 30, 30);
  doc.setFont(FUENTE_PDF, 'bold');
  doc.setFontSize(10);
  doc.text('Reformas Ordoñez', xTexto, 13);
  doc.setTextColor(...colorRgb);
  doc.setFont(FUENTE_PDF, 'bold');
  doc.setFontSize(15);
  doc.text('LISTADO DE PROVEEDORES', xTexto, 21);

  doc.setDrawColor(...GRIS_BORDE);
  doc.setLineWidth(0.3);
  doc.line(margen, 26, 210 - margen, 26);

  doc.setFont(FUENTE_PDF, 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...GRIS_TEXTO);
  const fecha = new Date().toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' });
  const resumen = `Generado el ${fecha} · ${proveedores.length} proveedor${proveedores.length === 1 ? '' : 'es'}${filtrosTexto ? ` · ${filtrosTexto}` : ''}`;
  doc.text(resumen, margen, 31);

  autoTable(doc, {
    startY: 36,
    margin: { left: margen, right: margen, bottom: 20 },
    head: [['Razón social', 'País', 'CIF / SIRET', 'Dirección', 'Teléfono', 'Email']],
    body: proveedores.map((p) => [
      p.razon_social ?? '—',
      p.pais ?? '—',
      [p.identificador, p.identificador_extra].filter(Boolean).join(' / ') || '—',
      p.direccion ?? '—',
      p.telefono ?? '—',
      p.email ?? '—',
    ]),
    styles: { font: FUENTE_PDF, fontSize: 8, lineColor: GRIS_BORDE, lineWidth: 0.1, valign: 'middle' },
    headStyles: { fillColor: colorRgb, textColor: 255, fontStyle: 'bold', fontSize: 8.5 },
    alternateRowStyles: { fillColor: [245, 245, 244] },
  });

  const totalPaginas = totalPaginasPdf(doc);
  for (let i = 1; i <= totalPaginas; i++) {
    doc.setPage(i);
    doc.setDrawColor(...GRIS_BORDE);
    doc.line(margen, 285, 210 - margen, 285);
    doc.setFont(FUENTE_PDF, 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...GRIS_TEXTO);
    doc.text('Reformas Ordoñez', margen, 291);
    doc.text(`Página ${i}/${totalPaginas}`, 210 - margen, 291, { align: 'right' });
  }

  return doc.output('blob');
}
