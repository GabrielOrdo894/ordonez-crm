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
  configPortadaDesde,
  FOTO_PORTADA_DEFECTO,
  dibujarPortada,
} from './pdfEmpresa';
import { configPlanningDesde } from '../modules/planning/configPlanning';
import { configPlantillaDesde } from '../modules/finanzas/DocumentoPreview';
import type { TamanoTitulo } from '../modules/finanzas/DocumentoPreview';
import { parsearTextoEnriquecido, estiloFuente } from './textoEnriquecido';
import { formatearUnidadTexto } from '../modules/finanzas/lineas';
import { registrarFuentePoppins, FUENTE_PDF } from './fuentePdf';

type FaseObra = {
  nombre: string;
  descripcion: string | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  completada: boolean;
};

type PlanningPdfData = {
  clienteNombre: string;
  clienteTelefono: string;
  clienteDir: string;
  pais: string;
  nombreObra: string;
  estado: string;
  fechaInicio: string | null;
  presupuestoNumero: string | null;
  presupuestoFecha: string | null;
  presupuestoTotal: number | null;
  fases: FaseObra[];
};

const TAM_TITULO: Record<TamanoTitulo, number> = { sm: 14, md: 18, lg: 22 };

function diasEntre(a: string, b: string) {
  const d1 = new Date(`${a}T00:00:00`);
  const d2 = new Date(`${b}T00:00:00`);
  return Math.round((d2.getTime() - d1.getTime()) / 86_400_000);
}

export async function generarPdfPlanning(datos: PlanningPdfData) {
  const { entidad, logoUrl } = await cargarEntidad(datos.pais);
  const config = await cargarConfigCompleta();
  const configPlanning = configPlanningDesde((config?.datos as { plantilla_planning?: unknown })?.plantilla_planning);
  const colorRgb = hexARgb(configPlanning.colorPrimario);
  const colorOscuroRgb = oscurecerHex(configPlanning.colorPrimario);
  const colorClaroRgb = aclararHex(configPlanning.colorPrimario);
  const colorPendienteRgb = hexARgb(configPlanning.colorPendiente);

  const logo = configPlanning.mostrarLogo && logoUrl ? await urlABase64(logoUrl) : null;

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  await registrarFuentePoppins(doc);
  const margen = 15;
  const anchoContenido = 210 - margen * 2;

  // ---- Portada (opcional, igual que en los presupuestos) ----
  if (configPlanning.mostrarPortada) {
    const configPortada = configPortadaDesde((config?.datos as { portada?: unknown })?.portada);
    const configPlantilla = configPlantillaDesde((config?.datos as { plantilla_documento?: unknown })?.plantilla_documento);
    const labelCif = datos.pais === 'Francia' ? 'SIRET' : 'CIF';
    await dibujarPortada(doc, {
      margen,
      colorRgb,
      colorOscuroRgb,
      colorSecundarioRgb: colorRgb,
      colorClaroRgb,
      fotoUrl: configPortada.fotoUrl || FOTO_PORTADA_DEFECTO,
      filtroOpacidad: configPortada.filtroOpacidad,
      logoActivo: logo,
      razonSocial: entidad.razon_social || 'Reformas Ordoñez',
      tituloDoc: 'PLANNING DE OBRA',
      tamanoTitulo: 28,
      interlineaTitulo: 10.5,
      proyecto: datos.nombreObra ? { label: 'OBRA', titulo: datos.nombreObra } : undefined,
      descripcion: 'Planning con las fases, fechas y cronograma previstos para la obra.',
      filas: [
        { icono: 'calendario', etiqueta: 'Fecha de inicio', valor: datos.fechaInicio || '—' },
        { icono: 'documento', etiqueta: 'Presupuesto', valor: datos.presupuestoNumero || '—' },
      ],
      entidad,
      pais: datos.pais,
      labelCif,
      labelEmpresa: 'EMPRESA',
      tagline: configPlantilla.portadaTaglineEs,
    });
  }

  // ---- Cabecera ----
  doc.setFillColor(...colorOscuroRgb);
  doc.rect(0, 0, 210, 34, 'F');

  let xTexto = margen;
  if (logo) {
    const dim = await dimensionesImagen(logo.dataUrl);
    const caja = ajustarCaja(dim.w, dim.h, 20, 20);
    doc.addImage(logo.dataUrl, logo.formato, margen, 7, caja.w, caja.h);
    xTexto = margen + caja.w + 6;
  }

  doc.setTextColor(255, 255, 255);
  doc.setFont(FUENTE_PDF, 'bold');
  doc.setFontSize(13);
  doc.text(entidad.razon_social || 'Reformas Ordoñez', xTexto, 15);
  doc.setFont(FUENTE_PDF, 'normal');
  doc.setFontSize(8);
  doc.setTextColor(220, 230, 225);
  doc.text([entidad.direccion, entidad.telefono].filter(Boolean).join('  ·  '), xTexto, 21);

  doc.setTextColor(255, 255, 255);
  doc.setFont(FUENTE_PDF, 'bold');
  doc.setFontSize(TAM_TITULO[configPlanning.tamanoTitulo]);
  doc.text('PLANNING DE OBRA', 195, 16, { align: 'right' });
  doc.setFontSize(9);
  doc.setFont(FUENTE_PDF, 'normal');
  doc.text(datos.estado, 195, 23, { align: 'right' });

  // ---- Cliente / Empresa / Presupuesto ----
  let y = 42;
  const altoCard = 26;
  doc.setDrawColor(...GRIS_BORDE);

  doc.setFillColor(...colorClaroRgb);
  doc.roundedRect(margen, y, 85, altoCard, 2, 2, 'FD');
  doc.setFont(FUENTE_PDF, 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...colorOscuroRgb);
  doc.text('CLIENTE', margen + 4, y + 7);
  doc.setFont(FUENTE_PDF, 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(30, 30, 30);
  doc.text(datos.clienteNombre || '—', margen + 4, y + 14);
  doc.setFontSize(8);
  doc.setTextColor(...GRIS_TEXTO);
  doc.text(doc.splitTextToSize([datos.clienteDir, datos.clienteTelefono].filter(Boolean).join(' · '), 77), margen + 4, y + 20);

  const xCard2 = margen + 95;
  doc.setFillColor(...colorClaroRgb);
  doc.roundedRect(xCard2, y, 85, altoCard, 2, 2, 'FD');
  doc.setFont(FUENTE_PDF, 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...colorOscuroRgb);
  doc.text('OBRA', xCard2 + 4, y + 7);
  doc.setFont(FUENTE_PDF, 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(30, 30, 30);
  doc.text(doc.splitTextToSize(datos.nombreObra, 77), xCard2 + 4, y + 14);
  doc.setFontSize(8);
  doc.setTextColor(...GRIS_TEXTO);
  if (datos.fechaInicio) doc.text(`Inicio: ${datos.fechaInicio}`, xCard2 + 4, y + 20);

  y += altoCard + 6;

  if (configPlanning.mostrarPresupuesto && datos.presupuestoNumero) {
    doc.setFillColor(...colorClaroRgb);
    doc.setDrawColor(...GRIS_BORDE);
    doc.roundedRect(margen, y, anchoContenido, 16, 2, 2, 'FD');
    doc.setFont(FUENTE_PDF, 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...colorOscuroRgb);
    doc.text('PRESUPUESTO', margen + 4, y + 6);
    doc.setFont(FUENTE_PDF, 'normal');
    doc.setFontSize(9);
    doc.setTextColor(30, 30, 30);
    const lineaPresupuesto = [
      datos.presupuestoNumero,
      datos.presupuestoFecha,
      datos.presupuestoTotal != null && `${datos.presupuestoTotal.toFixed(2)} €`,
    ]
      .filter(Boolean)
      .join('   ·   ');
    doc.text(lineaPresupuesto, margen + 4, y + 12);
    y += 22;
  }

  // ---- Gantt visual ----
  const fasesConFechas = datos.fases.filter((f) => f.fecha_inicio && f.fecha_fin);
  if (configPlanning.mostrarGantt && fasesConFechas.length > 0) {
    if (y > 230) {
      doc.addPage();
      y = 20;
    }
    doc.setFont(FUENTE_PDF, 'bold');
    doc.setFontSize(9);
    doc.setTextColor(30, 30, 30);
    doc.text('Cronograma', margen, y);
    y += 5;

    const inicioProyecto = fasesConFechas.reduce(
      (min, f) => (f.fecha_inicio! < min ? f.fecha_inicio! : min),
      fasesConFechas[0].fecha_inicio!,
    );
    const finProyecto = fasesConFechas.reduce(
      (max, f) => (f.fecha_fin! > max ? f.fecha_fin! : max),
      fasesConFechas[0].fecha_fin!,
    );
    const totalDias = Math.max(diasEntre(inicioProyecto, finProyecto), 1);
    const anchoBarra = anchoContenido - 45 - 30;
    const xBarra = margen + 45;

    for (const fase of fasesConFechas) {
      // A diferencia de la tabla de fases de más abajo (autoTable, pagina sola), este Gantt se
      // dibuja fila a fila a mano — el chequeo de antes del bucle solo protege la primera fila;
      // sin este, con muchas fases las últimas se dibujaban fuera del área visible de la página.
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

      const colorBarra = fase.completada ? colorRgb : colorPendienteRgb;
      doc.setFillColor(...colorClaroRgb);
      doc.rect(xBarra, y, anchoBarra, 4, 'F');
      doc.setFillColor(...colorBarra);
      doc.rect(left, y, width, 4, 'F');

      doc.setFont(FUENTE_PDF, 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(...GRIS_TEXTO);
      doc.text(`${fase.fecha_inicio} – ${fase.fecha_fin}`, xBarra + anchoBarra + 2, y + 3);

      y += 7;
    }
    y += 6;
  }

  if (y > 250) {
    doc.addPage();
    y = 20;
  }

  // ---- Tabla de fases ----
  if (configPlanning.mostrarTablaFases) {
    const ANCHO_FASE = 26;
    const ANCHO_DESCRIPCION_FASE = 50;
    const ANCHO_FECHA_FASE = 22;
    const ANCHO_DURACION_FASE = 20;
    const anchoTextoDescripcionFase = ANCHO_DESCRIPCION_FASE - 3;

    autoTable(doc, {
      startY: y,
      margin: { left: margen, right: margen },
      head: [['Fase', 'Descripción', 'Inicio', 'Fin', 'Duración', 'Estado']],
      body: datos.fases.map((f) => [
        f.nombre,
        '',
        f.fecha_inicio ?? '—',
        f.fecha_fin ?? '—',
        f.fecha_inicio && f.fecha_fin ? `${diasEntre(f.fecha_inicio, f.fecha_fin)} días` : '—',
        f.completada ? 'Completada' : 'Pendiente',
      ]),
      styles: { font: FUENTE_PDF, lineWidth: configPlanning.tabla.lineas ? 0.1 : 0, lineColor: GRIS_BORDE, valign: 'top' },
      headStyles: configPlanning.tabla.encabezadoColoreado
        ? { fillColor: colorRgb, textColor: 255, fontStyle: 'bold', fontSize: 8.5 }
        : { fillColor: [255, 255, 255], textColor: GRIS_TEXTO, fontStyle: 'bold', fontSize: 8.5, lineWidth: 0.3, lineColor: [17, 24, 39] },
      bodyStyles: { fontSize: 8.5, textColor: [30, 30, 30] },
      ...(configPlanning.tabla.filasIntercaladas ? { alternateRowStyles: { fillColor: colorClaroRgb } } : {}),
      columnStyles: {
        0: { cellWidth: ANCHO_FASE },
        1: { cellWidth: ANCHO_DESCRIPCION_FASE },
        2: { cellWidth: ANCHO_FECHA_FASE },
        3: { cellWidth: ANCHO_FECHA_FASE },
        4: { cellWidth: ANCHO_DURACION_FASE },
      },
      didParseCell: (data) => {
        if (data.section !== 'body' || data.column.index !== 1) return;
        const f = datos.fases[data.row.index];
        let lineas = 0;
        for (const bloque of parsearTextoEnriquecido(formatearUnidadTexto(f.descripcion ?? ''))) {
          lineas += doc.splitTextToSize(bloque.texto, anchoTextoDescripcionFase - (bloque.tipo === 'lista' ? 2 : 0)).length;
        }
        data.cell.text = new Array(Math.max(lineas, 1)).fill('');
      },
      didDrawCell: (data) => {
        if (data.section !== 'body' || data.column.index !== 1) return;
        const f = datos.fases[data.row.index];
        const x = data.cell.x + data.cell.padding('left');
        const LINE_H = 3.6;
        let ty = data.cell.y + 4;
        const bloques = parsearTextoEnriquecido(formatearUnidadTexto(f.descripcion ?? ''));
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
  }

  // ---- Pie de página ----
  const totalPaginas = totalPaginasPdf(doc);
  const primeraPaginaConPie = configPlanning.mostrarPortada ? 2 : 1;
  for (let i = primeraPaginaConPie; i <= totalPaginas; i++) {
    doc.setPage(i);
    if (configPlanning.piePagina) {
      doc.setFont(FUENTE_PDF, 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...GRIS_TEXTO);
      doc.text(doc.splitTextToSize(configPlanning.piePagina, anchoContenido), 105, 279, { align: 'center' });
    }
    doc.setDrawColor(...GRIS_BORDE);
    doc.line(margen, 285, 210 - margen, 285);
    doc.setFont(FUENTE_PDF, 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...GRIS_TEXTO);
    doc.text([entidad.razon_social, entidad.telefono].filter(Boolean).join('  ·  '), margen, 291);
    doc.text(`Página ${i}/${totalPaginas}`, 210 - margen, 291, { align: 'right' });
  }

  doc.save(`planning_${datos.nombreObra.replace(/\s+/g, '_')}.pdf`);
}
