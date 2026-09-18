import jsPDF from 'jspdf';
import { cargarConfigCompleta, GRIS_BORDE, GRIS_TEXTO, hexARgb, oscurecerHex, piePaginaNumerado, totalPaginasPdf } from './pdfEmpresa';
import { configPlantillaDesde } from '../modules/finanzas/DocumentoPreview';
import { registrarFuentePoppins, FUENTE_PDF } from './fuentePdf';
import type { Visita } from '../modules/visitas/types';

function fechaVisitaFmt(fecha: string | null): string {
  if (!fecha) return 'Sin fecha';
  return new Date(fecha).toLocaleDateString('es', { day: '2-digit', month: 'short', year: '2-digit' });
}

function mensajeSeguimiento(v: Visita): string {
  const nombre = v.nombre.trim() || 'hola';
  const fecha = fechaVisitaFmt(v.fecha_visita);
  const esFrances = v.idioma?.toLowerCase().startsWith('fr') || v.pais === 'Francia';
  return esFrances
    ? `Bonjour ${nombre}, suite à notre visite du ${fecha}, votre projet est-il toujours d’actualité ? Je peux vous envoyer le devis ou répondre à vos questions si besoin.`
    : `Hola ${nombre}, tras la visita del ${fecha}, ¿sigues interesado/a en el proyecto? Puedo enviarte el presupuesto o resolver cualquier duda que tengas.`;
}

function urlGmail(email: string): string {
  return `https://mail.google.com/mail/u/0/#search/${encodeURIComponent(email)}`;
}

function dibujarEnlace(doc: jsPDF, texto: string, url: string, x: number, y: number): void {
  doc.setTextColor(16, 96, 56);
  doc.text(texto, x, y);
  doc.link(x, y - 3.5, doc.getTextWidth(texto), 4.5, { url });
}

// Plantilla del listado "Visitas mañana: le enviamos este PDF a mi padre para que se acuerde de
// pasar presupuesto" (petición de Gabriel, 2026-09-11) — mismo criterio que ya usa el aviso
// "Envía el presupuesto a..." de la campana (useNotificaciones.ts): visita Realizada sin ningún
// presupuesto vinculado, excluyendo las que vienen de una solicitud ya Rechazada/Eliminada.
export async function generarPdfVisitasSinPresupuesto(visitas: Visita[]): Promise<void> {
  const config = await cargarConfigCompleta();
  const configPlantilla = configPlantillaDesde((config?.datos as { plantilla_documento?: unknown })?.plantilla_documento);
  const colorRgb = hexARgb(configPlantilla.colorPrimario);
  const colorOscuroRgb = oscurecerHex(configPlantilla.colorPrimario);

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  await registrarFuentePoppins(doc);
  const margen = 15;
  const anchoUtil = 210 - margen * 2;

  doc.setFont(FUENTE_PDF, 'bold');
  doc.setFontSize(10);
  doc.setTextColor(30, 30, 30);
  doc.text('Reformas Ordoñez', margen, 15);

  doc.setTextColor(...colorRgb);
  doc.setFontSize(16);
  doc.text('Visitas sin presupuesto todavía', margen, 24);

  doc.setFont(FUENTE_PDF, 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...GRIS_TEXTO);
  const fechaGeneracion = new Date().toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' });
  doc.text(`Generado el ${fechaGeneracion} · ${visitas.length} cliente${visitas.length === 1 ? '' : 's'}`, margen, 30);

  doc.setDrawColor(...GRIS_BORDE);
  doc.setLineWidth(0.3);
  doc.line(margen, 33, 210 - margen, 33);

  const ordenadas = [...visitas].sort((a, b) => (b.fecha_visita ?? '').localeCompare(a.fecha_visita ?? ''));

  let y = 41;
  const lineHeight = 4.6;

  ordenadas.forEach((v, i) => {
    const direccion = [v.direccion, v.direccion_extra].filter(Boolean).join(' — ') || 'Sin dirección';
    const descripcion = v.descripcion?.trim() || 'Sin descripción registrada.';
    const descLineas = doc.splitTextToSize(descripcion, anchoUtil);
    const contacto = [v.telefono, v.email].filter(Boolean).join(' · ') || 'Sin teléfono ni email registrados';
    const mensajeLineas = doc.splitTextToSize(mensajeSeguimiento(v), anchoUtil - 4);
    const bloqueAlto = 5.5 + 5 + 5 + descLineas.length * lineHeight + 5 + 5 + mensajeLineas.length * lineHeight + 12;

    if (y + bloqueAlto > 280) {
      doc.addPage();
      y = 20;
    }

    doc.setFont(FUENTE_PDF, 'bold');
    doc.setFontSize(11.5);
    doc.setTextColor(30, 30, 30);
    doc.text(`${v.nombre} ${v.apellidos}`.trim(), margen, y);

    doc.setFont(FUENTE_PDF, 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...colorOscuroRgb);
    doc.text(`Visita: ${fechaVisitaFmt(v.fecha_visita)}`, 210 - margen, y, { align: 'right' });
    y += 5.5;

    doc.setFont(FUENTE_PDF, 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...GRIS_TEXTO);
    doc.text(direccion, margen, y);
    y += 5;

    if (v.tipo) {
      doc.setFont(FUENTE_PDF, 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(...colorRgb);
      doc.text(v.tipo.toUpperCase(), margen, y);
      y += 5;
    }

    doc.setFont(FUENTE_PDF, 'normal');
    doc.setFontSize(9);
    doc.setTextColor(60, 60, 60);
    doc.text(descLineas, margen, y);
    y += descLineas.length * lineHeight;

    y += 3;
    doc.setFont(FUENTE_PDF, 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...GRIS_TEXTO);
    doc.text(contacto, margen, y);
    y += 5;

    doc.setFont(FUENTE_PDF, 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...colorRgb);
    doc.text('MENSAJE SUGERIDO', margen, y);
    y += 4.5;
    doc.setFont(FUENTE_PDF, 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(60, 60, 60);
    doc.text(mensajeLineas, margen + 2, y);
    y += mensajeLineas.length * lineHeight + 3;

    doc.setFont(FUENTE_PDF, 'normal');
    doc.setFontSize(8.5);
    dibujarEnlace(doc, 'Abrir ficha de visita en CRM', `https://ordonezrenov.com/crm/visitas/${v.id}`, margen, y);
    if (v.email) {
      dibujarEnlace(doc, 'Buscar conversación en Gmail', urlGmail(v.email), margen + 58, y);
    }
    y += 5;

    if (i < ordenadas.length - 1) {
      doc.setDrawColor(...GRIS_BORDE);
      doc.setLineWidth(0.2);
      doc.line(margen, y, 210 - margen, y);
      y += 6;
    }
  });

  const totalPaginas = totalPaginasPdf(doc);
  for (let i = 1; i <= totalPaginas; i++) {
    doc.setPage(i);
    piePaginaNumerado(doc, margen, 'CRM interno — Reformas Ordoñez', i, totalPaginas);
  }

  const fechaArchivo = new Date().toISOString().slice(0, 10);
  doc.save(`visitas_sin_presupuesto_${fechaArchivo}.pdf`);
}
