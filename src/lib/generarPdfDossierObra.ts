import jsPDF from 'jspdf';
import { GRIS_TEXTO, cargarEntidad, cargarConfigCompleta, hexARgb, oscurecerHex, aclararHex, urlABase64, dimensionesImagen, ajustarCaja, totalPaginasPdf, piePaginaNumerado } from './pdfEmpresa';
import { configPlantillaDesde } from '../modules/finanzas/DocumentoPreview';
import { renderizarTC, tamanoFuenteTC } from './terminos';
import { paisDesdeTipoIva } from '../modules/finanzas/presupuestos/types';
import type { Presupuesto } from '../modules/finanzas/presupuestos/types';
import { parsearTextoEnriquecido, estiloFuente } from './textoEnriquecido';
import { registrarFuentePoppins, FUENTE_PDF } from './fuentePdf';
import { construirPdfPresupuesto } from './generarPdfPresupuesto';
import { fechaPlanning } from './fechas';
import { dibujarGanttYFases, rangoProyecto, estadoProyectoTexto, type FaseObraCronograma } from './planningCronograma';

type FaseObra = FaseObraCronograma;

type DossierObraData = {
  nombreObra: string;
  estadoObra: string;
  fechaInicio: string | null;
  fases: FaseObra[];
  presupuesto: Presupuesto;
};

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

  const logoActivo = configPlantilla.mostrarLogo && logoUrl ? await urlABase64(logoUrl) : null;

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  await registrarFuentePoppins(doc);
  const margen = 15;
  const anchoContenido = 210 - margen * 2;
  const t =
    idioma === 'fr'
      ? {
          planning: 'PLANNING DE TRAVAUX',
          tyc: 'Conditions générales',
          inicio: 'Début',
          finPrevisto: 'Fin prévue',
          dias: 'jours',
        }
      : {
          planning: 'PLANNING DE OBRA',
          tyc: 'Términos y condiciones',
          inicio: 'Inicio',
          finPrevisto: 'Fin previsto',
          dias: 'días',
        };

  // ---- Portada ----
  doc.setFillColor(...colorOscuroRgb);
  doc.rect(0, 0, 210, 297, 'F');

  let yPortada = 85;
  if (logoActivo) {
    const dim = await dimensionesImagen(logoActivo.dataUrl);
    const caja = ajustarCaja(dim.w, dim.h, 34, 34);
    doc.addImage(logoActivo.dataUrl, logoActivo.formato, 105 - caja.w / 2, yPortada, caja.w, caja.h);
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
    [estadoProyectoTexto(datos.estadoObra, idioma), datos.fechaInicio && `${t.inicio}: ${fechaPlanning(datos.fechaInicio, idioma)}`]
      .filter(Boolean)
      .join('   ·   '),
    105,
    yPortada,
    { align: 'center' },
  );

  doc.setFont(FUENTE_PDF, 'bold');
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text(entidad.razon_social || 'Reformas Ordoñez', 105, 280, { align: 'center' });

  // ---- Presupuesto — formato completo real (tabla, resumen, plan de pago y firma), sin su
  // propia portada ni sus propios T&C: el dossier ya tiene los suyos, uno para todo el documento. ----
  doc.addPage();
  await construirPdfPresupuesto(p, { doc, incluirPortada: false, incluirTyC: false, incluirPie: false });

  // ---- Página planning de obra ----
  doc.addPage();
  let y = 20;
  doc.setFont(FUENTE_PDF, 'bold');
  doc.setFontSize(15);
  doc.setTextColor(...colorRgb);
  doc.text(t.planning, margen, y);

  const { fin: finProyecto, dias: totalDias } = rangoProyecto(fases);
  if (finProyecto) {
    doc.setFont(FUENTE_PDF, 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...GRIS_TEXTO);
    doc.text(`${t.finPrevisto}: ${fechaPlanning(finProyecto, idioma)} (${totalDias} ${t.dias})`, 210 - margen, y, { align: 'right' });
  }
  y += 10;

  dibujarGanttYFases(doc, {
    margen,
    anchoContenido,
    y,
    fases,
    idioma,
    colorRgb,
    colorClaroRgb,
    colorPendienteRgb,
    tablaConfig: { lineas: true, filasIntercaladas: false, encabezadoColoreado: true },
    mostrarGantt: true,
    mostrarTabla: true,
    tituloCronograma: false,
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
    piePaginaNumerado(doc, margen, [entidad.razon_social, entidad.telefono].filter(Boolean).join('  ·  '), i, totalPaginas);
  }

  doc.save(`dossier_${datos.nombreObra.replace(/\s+/g, '_')}.pdf`);
}
