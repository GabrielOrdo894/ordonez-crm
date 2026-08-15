import jsPDF from 'jspdf';
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
  piePaginaNumerado,
} from './pdfEmpresa';
import { configPlanningDesde } from '../modules/planning/configPlanning';
import { configPlantillaDesde } from '../modules/finanzas/DocumentoPreview';
import type { TamanoTitulo } from '../modules/finanzas/DocumentoPreview';
import { registrarFuentePoppins, FUENTE_PDF } from './fuentePdf';
import { fechaPlanning } from './fechas';
import { dibujarGanttYFases, rangoProyecto, estadoProyectoTexto, TEXTOS_PLANNING, type FaseObraCronograma } from './planningCronograma';

type FaseObra = FaseObraCronograma;

export type PlanningPdfData = {
  clienteNombre: string;
  clienteTelefono: string;
  clienteDir: string;
  pais: string;
  idioma: 'es' | 'fr';
  nombreObra: string;
  estado: string;
  fechaInicio: string | null;
  presupuestoNumero: string | null;
  presupuestoFecha: string | null;
  presupuestoTotal: number | null;
  fases: FaseObra[];
};

const TAM_TITULO: Record<TamanoTitulo, number> = { sm: 14, md: 18, lg: 22 };

export async function generarPdfPlanning(datos: PlanningPdfData) {
  const doc = await construirPdfPlanning(datos);
  doc.save(`planning_${datos.nombreObra.replace(/\s+/g, '_')}.pdf`);
}

/** Construye el PDF del planning y devuelve el documento sin descargarlo — usado tanto por
 * `generarPdfPlanning` (descarga directa) como por `generarPdfPlanningTraducido` (añade el aviso
 * de traducción interna antes de guardar/mostrar). */
export async function construirPdfPlanning(datos: PlanningPdfData): Promise<jsPDF> {
  const t = TEXTOS_PLANNING[datos.idioma];
  const { entidad, logoUrl } = await cargarEntidad(datos.pais);
  const config = await cargarConfigCompleta();
  const configPlanning = configPlanningDesde((config?.datos as { plantilla_planning?: unknown })?.plantilla_planning);
  const colorRgb = hexARgb(configPlanning.colorPrimario);
  const colorOscuroRgb = oscurecerHex(configPlanning.colorPrimario);
  const colorClaroRgb = aclararHex(configPlanning.colorPrimario);
  const colorPendienteRgb = hexARgb(configPlanning.colorPendiente);

  const logo = configPlanning.mostrarLogo && logoUrl ? await urlABase64(logoUrl) : null;

  const { fin: finProyecto, dias: totalDias } = rangoProyecto(datos.fases);

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
      tituloDoc: t.titulo,
      tamanoTitulo: 28,
      interlineaTitulo: 10.5,
      proyecto: datos.nombreObra ? { label: t.proyectoLabel, titulo: datos.nombreObra } : undefined,
      descripcion: t.descripcionPortada,
      filas: [
        { icono: 'calendario', etiqueta: t.inicio, valor: datos.fechaInicio ? fechaPlanning(datos.fechaInicio, datos.idioma) : '—' },
        { icono: 'documento', etiqueta: t.presupuesto, valor: datos.presupuestoNumero || '—' },
      ],
      entidad,
      pais: datos.pais,
      labelCif,
      labelEmpresa: t.empresaLabel,
      tagline: datos.idioma === 'fr' ? configPlantilla.portadaTaglineFr : configPlantilla.portadaTaglineEs,
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
  doc.text(t.titulo, 195, 16, { align: 'right' });
  doc.setFontSize(9);
  doc.setFont(FUENTE_PDF, 'normal');
  doc.text(estadoProyectoTexto(datos.estado, datos.idioma), 195, 23, { align: 'right' });

  // ---- Cliente / Empresa / Presupuesto ----
  let y = 42;
  const altoCard = 26;
  doc.setDrawColor(...GRIS_BORDE);

  doc.setFillColor(...colorClaroRgb);
  doc.roundedRect(margen, y, 85, altoCard, 2, 2, 'FD');
  doc.setFont(FUENTE_PDF, 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...colorOscuroRgb);
  doc.text(t.cliente, margen + 4, y + 7);
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
  doc.text(t.obra, xCard2 + 4, y + 7);
  doc.setFont(FUENTE_PDF, 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(30, 30, 30);
  doc.text(doc.splitTextToSize(datos.nombreObra, 77), xCard2 + 4, y + 14);
  doc.setFontSize(8);
  doc.setTextColor(...GRIS_TEXTO);
  const lineaFechasObra = [
    datos.fechaInicio && `${t.inicio}: ${fechaPlanning(datos.fechaInicio, datos.idioma)}`,
    finProyecto && `${t.finPrevisto}: ${fechaPlanning(finProyecto, datos.idioma)} (${totalDias} ${datos.idioma === 'fr' ? 'jours' : 'días'})`,
  ]
    .filter(Boolean)
    .join(' · ');
  if (lineaFechasObra) doc.text(doc.splitTextToSize(lineaFechasObra, 77), xCard2 + 4, y + 20);

  y += altoCard + 6;

  if (configPlanning.mostrarPresupuesto && datos.presupuestoNumero) {
    doc.setFillColor(...colorClaroRgb);
    doc.setDrawColor(...GRIS_BORDE);
    doc.roundedRect(margen, y, anchoContenido, 16, 2, 2, 'FD');
    doc.setFont(FUENTE_PDF, 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...colorOscuroRgb);
    doc.text(t.presupuesto, margen + 4, y + 6);
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

  // ---- Gantt y tabla de fases (agrupados por sección si las fases la tienen) ----
  dibujarGanttYFases(doc, {
    margen,
    anchoContenido,
    y,
    fases: datos.fases,
    idioma: datos.idioma,
    colorRgb,
    colorClaroRgb,
    colorPendienteRgb,
    tablaConfig: configPlanning.tabla,
    mostrarGantt: configPlanning.mostrarGantt,
    mostrarTabla: configPlanning.mostrarTablaFases,
    tituloCronograma: true,
  });

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
    piePaginaNumerado(doc, margen, [entidad.razon_social, entidad.telefono].filter(Boolean).join('  ·  '), i, totalPaginas, t.pagina);
  }

  return doc;
}
