import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  GRIS_BORDE,
  GRIS_TEXTO,
  cargarEntidad,
  cargarConfigCompleta,
  hexARgb,
  oscurecerHex,
  aclararHex,
  urlABase64,
  dimensionesImagen,
  ajustarCaja,
  totalPaginasPdf,
} from './pdfEmpresa';
import { configPlantillaDesde } from '../modules/finanzas/DocumentoPreview';
import { renderizarTC, tamanoFuenteTC } from './terminos';
import { porcentajeIva, paisDesdeTipoIva } from '../modules/finanzas/presupuestos/types';
import type { Presupuesto } from '../modules/finanzas/presupuestos/types';
import { parsearTextoEnriquecido, estiloFuente } from './textoEnriquecido';
import { formatearPrecio } from '../modules/finanzas/lineas';
import { formatearUnidadTexto } from '../modules/finanzas/lineas';
import { registrarFuentePoppins, FUENTE_PDF } from './fuentePdf';

type FaseObra = {
  nombre: string;
  descripcion: string | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  completada: boolean;
};

type DossierObraData = {
  nombreObra: string;
  estadoObra: string;
  fechaInicio: string | null;
  fases: FaseObra[];
  presupuesto: Presupuesto;
};

function diasEntre(a: string, b: string) {
  const d1 = new Date(`${a}T00:00:00`);
  const d2 = new Date(`${b}T00:00:00`);
  return Math.round((d2.getTime() - d1.getTime()) / 86_400_000);
}

export async function generarPdfDossierObra(datos: DossierObraData) {
  const { presupuesto: p, fases } = datos;
  const idioma = p.idioma === 'Français' ? 'fr' : 'es';
  const pais = p.pais ?? paisDesdeTipoIva(p.tipo_iva) ?? 'España';
  const { entidad, logoUrl } = await cargarEntidad(pais);
  const config = await cargarConfigCompleta();
  const configPlantilla = configPlantillaDesde((config?.datos as { plantilla_documento?: unknown })?.plantilla_documento);
  const colorRgb = hexARgb(configPlantilla.colorPrimario);
  const colorOscuroRgb = oscurecerHex(configPlantilla.colorPrimario);
  const colorClaroRgb = aclararHex(configPlantilla.colorPrimario);
  const colorPendienteRgb = hexARgb('#d1d5db');

  const logo = configPlantilla.mostrarLogo && logoUrl ? await urlABase64(logoUrl) : null;

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  await registrarFuentePoppins(doc);
  const margen = 15;
  const anchoContenido = 210 - margen * 2;
  const t = idioma === 'fr' ? { presupuesto: 'DEVIS', planning: 'PLANNING DE TRAVAUX', tyc: 'Conditions générales', total: 'TOTAL' } : { presupuesto: 'PRESUPUESTO', planning: 'PLANNING DE OBRA', tyc: 'Términos y condiciones', total: 'TOTAL' };

  // ---- Portada ----
  doc.setFillColor(...colorOscuroRgb);
  doc.rect(0, 0, 210, 297, 'F');

  let yPortada = 85;
  if (logo) {
    const dim = await dimensionesImagen(logo.dataUrl);
    const caja = ajustarCaja(dim.w, dim.h, 34, 34);
    doc.addImage(logo.dataUrl, logo.formato, 105 - caja.w / 2, yPortada, caja.w, caja.h);
    yPortada += caja.h + 12;
  }
  doc.setTextColor(255, 255, 255);
  doc.setFont(FUENTE_PDF, 'bold');
  doc.setFontSize(26);
  doc.text(idioma === 'fr' ? 'DOSSIER DE CHANTIER' : 'DOSSIER DE OBRA', 105, yPortada, { align: 'center' });
  yPortada += 14;
  doc.setFont(FUENTE_PDF, 'normal');
  doc.setFontSize(14);
  doc.text(doc.splitTextToSize(datos.nombreObra, 150), 105, yPortada, { align: 'center' });
  yPortada += 14;
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.3);
  doc.line(80, yPortada, 130, yPortada);
  yPortada += 12;
  doc.setFontSize(12);
  doc.text(p.cliente_nombre ?? '', 105, yPortada, { align: 'center' });
  yPortada += 7;
  doc.setFontSize(9);
  doc.setTextColor(220, 230, 225);
  doc.text(
    [datos.estadoObra, datos.fechaInicio && `Inicio: ${datos.fechaInicio}`].filter(Boolean).join('   ·   '),
    105,
    yPortada,
    { align: 'center' },
  );

  doc.setFont(FUENTE_PDF, 'bold');
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text(entidad.razon_social || 'Reformas Ordoñez', 105, 280, { align: 'center' });

  // ---- Página presupuesto (resumen) ----
  doc.addPage();
  let y = 20;
  doc.setFont(FUENTE_PDF, 'bold');
  doc.setFontSize(15);
  doc.setTextColor(...colorRgb);
  doc.text(t.presupuesto, margen, y);
  y += 8;

  doc.setFillColor(...colorClaroRgb);
  doc.setDrawColor(...GRIS_BORDE);
  doc.roundedRect(margen, y, anchoContenido, 22, 2, 2, 'FD');
  doc.setFont(FUENTE_PDF, 'normal');
  doc.setFontSize(9);
  doc.setTextColor(30, 30, 30);
  doc.text(`Nº ${p.numero ?? ''}   ·   ${p.cliente_nombre ?? ''}   ·   ${p.fecha_emision ?? ''}`, margen + 4, y + 13);
  y += 30;

  const pct = porcentajeIva(p.tipo_iva);
  autoTable(doc, {
    startY: y,
    margin: { left: margen, right: margen },
    head: [['Designación', 'Cant.', 'Precio unit.', 'Total c/IVA']],
    body: p.lineas.map((l) => [
      formatearUnidadTexto(l.designacion),
      String(l.cantidad),
      formatearPrecio(l.precio_unit),
      l.es_incluido ? 'Incluido' : formatearPrecio(l.total_con_iva),
    ]),
    styles: { font: FUENTE_PDF, lineWidth: 0.1, lineColor: GRIS_BORDE, fontSize: 8.5 },
    headStyles: { fillColor: colorRgb, textColor: 255, fontStyle: 'bold' },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
  });

  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  if (y > 270) {
    doc.addPage();
    y = 20;
  }
  const totalConIva = p.lineas.reduce((s, l) => s + (l.es_incluido ? 0 : l.total_con_iva), 0);
  doc.setFont(FUENTE_PDF, 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...colorRgb);
  doc.text(`${t.total}: ${formatearPrecio(totalConIva)} (IVA ${pct}% incl.)`, 210 - margen, y, { align: 'right' });

  // ---- Página planning de obra ----
  doc.addPage();
  y = 20;
  doc.setFont(FUENTE_PDF, 'bold');
  doc.setFontSize(15);
  doc.setTextColor(...colorRgb);
  doc.text(t.planning, margen, y);
  y += 10;

  const fasesConFechas = fases.filter((f) => f.fecha_inicio && f.fecha_fin);
  if (fasesConFechas.length > 0) {
    const inicioProyecto = fasesConFechas.reduce((min, f) => (f.fecha_inicio! < min ? f.fecha_inicio! : min), fasesConFechas[0].fecha_inicio!);
    const finProyecto = fasesConFechas.reduce((max, f) => (f.fecha_fin! > max ? f.fecha_fin! : max), fasesConFechas[0].fecha_fin!);
    const totalDias = Math.max(diasEntre(inicioProyecto, finProyecto), 1);
    const anchoBarra = anchoContenido - 45 - 30;
    const xBarra = margen + 45;

    for (const fase of fasesConFechas) {
      // A diferencia de la tabla de fases de más abajo (autoTable, pagina sola), este Gantt se
      // dibuja fila a fila a mano — sin este chequeo, con muchas fases las últimas se dibujaban
      // fuera del área visible de la página y desaparecían sin avisar.
      if (y + 7 > 270) {
        doc.addPage();
        y = 20;
      }
      const offsetDias = diasEntre(inicioProyecto, fase.fecha_inicio!);
      const duracionDias = Math.max(diasEntre(fase.fecha_inicio!, fase.fecha_fin!), 1);
      const left = xBarra + (offsetDias / totalDias) * anchoBarra;
      const width = Math.max((duracionDias / totalDias) * anchoBarra, 2);

      doc.setFont(FUENTE_PDF, 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(60, 60, 60);
      doc.text(doc.splitTextToSize(fase.nombre, 42), margen, y + 3);

      doc.setFillColor(...colorClaroRgb);
      doc.rect(xBarra, y, anchoBarra, 4, 'F');
      doc.setFillColor(...(fase.completada ? colorRgb : colorPendienteRgb));
      doc.rect(left, y, width, 4, 'F');

      doc.setFont(FUENTE_PDF, 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(...GRIS_TEXTO);
      doc.text(`${fase.fecha_inicio} – ${fase.fecha_fin}`, xBarra + anchoBarra + 2, y + 3);
      y += 7;
    }
    y += 8;
  }

  const ANCHO_FASE = 32;
  const ANCHO_DESCRIPCION_FASE = 68;
  const ANCHO_FECHA_FASE = 24;
  const anchoTextoDescripcionFase = ANCHO_DESCRIPCION_FASE - 3;

  autoTable(doc, {
    startY: y,
    margin: { left: margen, right: margen },
    head: [['Fase', 'Descripción', 'Inicio', 'Fin', 'Estado']],
    body: fases.map((f) => [f.nombre, '', f.fecha_inicio ?? '—', f.fecha_fin ?? '—', f.completada ? 'Completada' : 'Pendiente']),
    styles: { font: FUENTE_PDF, lineWidth: 0.1, lineColor: GRIS_BORDE, fontSize: 8.5, valign: 'top' },
    headStyles: { fillColor: colorRgb, textColor: 255, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: ANCHO_FASE },
      1: { cellWidth: ANCHO_DESCRIPCION_FASE },
      2: { cellWidth: ANCHO_FECHA_FASE },
      3: { cellWidth: ANCHO_FECHA_FASE },
    },
    didParseCell: (data) => {
      if (data.section !== 'body' || data.column.index !== 1) return;
      const f = fases[data.row.index];
      let lineas = 0;
      for (const bloque of parsearTextoEnriquecido(f.descripcion)) {
        lineas += doc.splitTextToSize(bloque.texto, anchoTextoDescripcionFase - (bloque.tipo === 'lista' ? 2 : 0)).length;
      }
      data.cell.text = new Array(Math.max(lineas, 1)).fill('');
    },
    didDrawCell: (data) => {
      if (data.section !== 'body' || data.column.index !== 1) return;
      const f = fases[data.row.index];
      const x = data.cell.x + data.cell.padding('left');
      const LINE_H = 3.6;
      let ty = data.cell.y + 4;
      const bloques = parsearTextoEnriquecido(f.descripcion);
      if (bloques.length === 0) {
        doc.setFont(FUENTE_PDF, 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(30, 30, 30);
        doc.text('—', x, ty);
        return;
      }
      doc.setFontSize(8.5);
      for (const bloque of bloques) {
        const anchoBloque = anchoTextoDescripcionFase - (bloque.tipo === 'lista' ? 2 : 0);
        const xBloque = x + (bloque.tipo === 'lista' ? 2 : 0);
        const subLineas = doc.splitTextToSize(bloque.texto, anchoBloque);
        doc.setFont(FUENTE_PDF, estiloFuente(bloque.negrita, bloque.cursiva));
        doc.setTextColor(30, 30, 30);
        doc.text(subLineas, xBloque, ty);
        ty += subLineas.length * LINE_H;
      }
    },
  });

  // ---- Términos y condiciones ----
  const tcCrudo = idioma === 'fr' ? config?.tc_fr : config?.tc_es;
  if (tcCrudo) {
    const tc = renderizarTC(tcCrudo, p.plan_pago, idioma);
    const { fontSize: fontSizeTc, lineHeight: lineHeightTc } = tamanoFuenteTC(config?.tc_tamano);
    const dibujarCabeceraTC = () => {
      doc.addPage();
      doc.setFillColor(...colorOscuroRgb);
      doc.rect(0, 0, 210, 18, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont(FUENTE_PDF, 'bold');
      doc.setFontSize(11);
      doc.text(t.tyc, margen, 12);
      doc.setTextColor(30, 30, 30);
      doc.setFont(FUENTE_PDF, 'normal');
      doc.setFontSize(fontSizeTc);
    };
    dibujarCabeceraTC();

    const yTcMax = 270;
    let yTc = 30;
    for (const bloque of parsearTextoEnriquecido(tc)) {
      const indent = bloque.tipo === 'lista' ? 2 : 0;
      const lineas = doc.splitTextToSize(bloque.texto, anchoContenido - indent);
      const altoBloque = lineas.length * lineHeightTc + 3;
      if (yTc + altoBloque > yTcMax) {
        dibujarCabeceraTC();
        yTc = 30;
      }
      doc.setFont(FUENTE_PDF, estiloFuente(bloque.negrita, bloque.cursiva));
      doc.text(lineas, margen + indent, yTc);
      yTc += altoBloque;
    }
    doc.setFont(FUENTE_PDF, 'normal');
  }

  // ---- Pie de página ----
  const totalPaginas = totalPaginasPdf(doc);
  for (let i = 2; i <= totalPaginas; i++) {
    doc.setPage(i);
    doc.setDrawColor(...GRIS_BORDE);
    doc.line(margen, 285, 210 - margen, 285);
    doc.setFont(FUENTE_PDF, 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...GRIS_TEXTO);
    doc.text([entidad.razon_social, entidad.telefono].filter(Boolean).join('  ·  '), margen, 291);
    doc.text(`${i}/${totalPaginas}`, 210 - margen, 291, { align: 'right' });
  }

  doc.save(`dossier_${datos.nombreObra.replace(/\s+/g, '_')}.pdf`);
}
