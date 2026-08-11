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
  DECENNALE_BULLETS_FR,
} from './pdfEmpresa';
import { configPlantillaDesde } from '../modules/finanzas/DocumentoPreview';
import type { TamanoTitulo, AlineacionEncabezado } from '../modules/finanzas/DocumentoPreview';
import { parsearTextoEnriquecido, estiloFuente } from './textoEnriquecido';
import { renderizarTC, tamanoFuenteTC } from './terminos';
import { mencionIvaReducida } from '../modules/finanzas/iva';
import { colorEstadoPdf } from '../modules/finanzas/estadoColor';
import { porcentajeIva, paisDesdeTipoIva, calcularTotalesRango, totalLineaMax } from '../modules/finanzas/presupuestos/types';
import { formatearUnidadTexto, formatearPrecio, formatearRangoPrecio } from '../modules/finanzas/lineas';
import { direccionEnDosLineas } from './direcciones';
import { registrarFuentePoppins, FUENTE_PDF } from './fuentePdf';
import type { Presupuesto } from '../modules/finanzas/presupuestos/types';

export type CajaFirma = { pagina: number; x: number; y: number; width: number; height: number };

const TAM_TITULO_DOC: Record<TamanoTitulo, number> = { sm: 10, md: 12, lg: 15 };
const HALIGN_DESDE_ALINEACION: Record<Exclude<AlineacionEncabezado, 'auto'>, 'left' | 'center' | 'right'> = {
  izquierda: 'left',
  centro: 'center',
  derecha: 'right',
};
const TAM_TITULO_REFORMA: Record<TamanoTitulo, number> = { sm: 7, md: 8, lg: 10 };

const NOTA_ORIENTATIVO: Record<'es' | 'fr', string> = {
  es: 'Presupuesto orientativo — los precios son estimados y pueden variar tras la visita técnica.',
  fr: 'Devis indicatif — les prix sont estimés et peuvent varier après la visite technique.',
};

const ESTADO_FR: Record<string, string> = {
  Borrador: 'Brouillon',
  Pendiente: 'En attente',
  Aceptado: 'Accepté',
  Rechazado: 'Refusé',
};

const TEXTOS = {
  es: {
    titulo: 'PRESUPUESTO',
    cliente: 'CLIENTE',
    emisor: 'EMISOR',
    datosDocumento: 'PRESUPUESTO',
    numero: 'Número',
    emision: 'Emisión',
    validez: 'Válido hasta',
    tipoImpuesto: 'Impuesto',
    columnas: ['Nº', 'Designación', 'Descripción', 'Ud.', 'Cant.', 'Precio unit. (s/IVA)', 'Total', 'Total con Impuestos'],
    estado: 'Estado',
    totalSinIva: 'Base imponible',
    iva: 'IVA',
    total: 'TOTAL',
    totalOrientativo: 'TOTAL',
    notaSinIva: 'IVA no incluido — se determinará en el presupuesto definitivo tras la visita técnica.',
    planPago: 'Plan de pago',
    columnasPago: ['Concepto', '%', 'Importe'],
    incluido: 'Incluido',
    tyc: 'Términos y condiciones',
    firmadoPor: 'Firmado por',
    firma: 'Firma del cliente',
    pendienteFirma: 'Pendiente de firma del cliente',
    formaPago: 'Forma de pago',
    titular: 'Titular',
    banco: 'Banco',
    seguro: 'Seguro y garantía',
    nota: 'Nota',
    pagina: 'Página',
  },
  fr: {
    titulo: 'DEVIS',
    cliente: 'CLIENT',
    emisor: 'ÉMETTEUR',
    datosDocumento: 'DEVIS',
    numero: 'Numéro',
    emision: 'Émission',
    validez: "Valable jusqu'au",
    tipoImpuesto: 'Taxe',
    columnas: ['Nº', 'Désignation', 'Description', 'Unit', 'Qt', 'Prix unit. (HT)', 'Total', 'Total TTC'],
    estado: 'État',
    totalSinIva: 'Base HT',
    iva: 'TVA',
    total: 'TOTAL',
    totalOrientativo: 'TOTAL',
    notaSinIva: 'TVA non incluse — sera déterminée dans le devis définitif après la visite technique.',
    planPago: 'Plan de paiement',
    columnasPago: ['Concept', '%', 'Montant'],
    incluido: 'Inclus',
    tyc: 'Conditions générales',
    firmadoPor: 'Signé par',
    firma: 'Signature du client',
    pendienteFirma: 'En attente de signature du client',
    formaPago: 'Modalités de paiement',
    titular: 'Titulaire',
    banco: 'Banque',
    seguro: 'Assurance et garantie',
    nota: 'Note',
    pagina: 'Page',
  },
};

export async function generarPdfPresupuesto(p: Presupuesto) {
  const { doc } = await construirPdfPresupuesto(p);
  doc.save(`${p.numero ?? 'presupuesto'}.pdf`);
}

/** Igual que generarPdfPresupuesto pero devuelve el PDF como Blob en vez de descargarlo (para subirlo a
 * Documenso), junto con la posición exacta del recuadro de firma del cliente en el PDF. */
export async function generarPdfPresupuestoBlob(p: Presupuesto): Promise<{ blob: Blob; cajaFirma: CajaFirma | null }> {
  const { doc, cajaFirma } = await construirPdfPresupuesto(p);
  return { blob: doc.output('blob'), cajaFirma };
}

async function construirPdfPresupuesto(p: Presupuesto) {
  const idioma = p.idioma === 'Français' ? 'fr' : 'es';
  const t = TEXTOS[idioma];
  const esOrientativo = p.tipo === 'orientativo';
  const pais = p.pais ?? paisDesdeTipoIva(p.tipo_iva) ?? 'España';
  // La etiqueta del identificador fiscal depende del país del cliente, no del idioma del documento
  // (un presupuesto en español para un cliente francés sigue mostrando SIRET, no CIF).
  const labelCif = pais === 'Francia' ? 'SIRET' : 'CIF';
  const { entidad: entidadBase, logoUrl } = await cargarEntidad(pais);
  const entidad = {
    ...entidadBase,
    nombre_titular: p.banco_titular || entidadBase.nombre_titular,
    banco: p.banco_nombre || entidadBase.banco,
    iban: p.banco_iban || entidadBase.iban,
    bic: p.banco_bic || entidadBase.bic,
  };
  const config = await cargarConfigCompleta();
  const configPlantilla = configPlantillaDesde((config?.datos as { plantilla_documento?: unknown })?.plantilla_documento);
  const configPortada = configPortadaDesde((config?.datos as { portada?: unknown })?.portada);
  const condPagoDatos = p.condiciones_pago ?? (config?.datos as { condicionesPago?: Record<string, string> })?.condicionesPago;
  const condicionesPago = condPagoDatos
    ? {
        delai: idioma === 'fr' ? condPagoDatos.delaiFr : condPagoDatos.delaiEs,
        penalizacion: idioma === 'fr' ? condPagoDatos.penalizacionFr : condPagoDatos.penalizacionEs,
        medio: idioma === 'fr' ? condPagoDatos.medioFr : condPagoDatos.medioEs,
      }
    : null;
  const plantilla = configPlantilla.estructura;
  const colorRgb = hexARgb(configPlantilla.colorPrimario);
  const colorOscuroRgb = oscurecerHex(configPlantilla.colorPrimario);
  const colorClaroRgb = aclararHex(configPlantilla.colorPrimario);
  const colorSecundarioRgb = hexARgb(configPlantilla.colorSecundario);

  const logo = logoUrl ? await urlABase64(logoUrl) : null;
  const logoActivo = configPlantilla.mostrarLogo ? logo : null;

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  await registrarFuentePoppins(doc);
  const margen = 15;
  const anchoContenido = 210 - margen * 2;
  // Posición (en mm, página A4) del recuadro de firma del cliente — se rellena al dibujarlo más
  // abajo, y se usa para colocar el campo de firma de Documenso en el sitio correcto del PDF.
  let cajaFirmaDocumenso: CajaFirma | null = null;

  const etiquetaOrientativo = idioma === 'fr' ? 'INDICATIF' : 'ORIENTATIVO';
  // Si es orientativo, la etiqueta va pegada al título ("PRESUPUESTO ORIENTATIVO"), no suelta
  // debajo — así no compite por espacio con el subtítulo ni se corta.
  const tituloDoc = esOrientativo ? `${t.titulo} ${etiquetaOrientativo}` : t.titulo;

  // ---- Portada (solo formato completo) ----
  if (p.formato === 'completo') {
    const descripcionPortada = esOrientativo
      ? idioma === 'fr'
        ? 'Proposition de prix indicative pour votre projet, à préciser lors de la visite technique.'
        : 'Propuesta de precios orientativa para su proyecto, a concretar tras la visita técnica.'
      : idioma === 'fr'
        ? "Devis détaillé incluant matériaux, main-d'œuvre et finitions pour votre projet."
        : 'Presupuesto detallado con materiales, mano de obra y acabados para su proyecto.';

    await dibujarPortada(doc, {
      margen,
      colorRgb,
      colorOscuroRgb,
      colorSecundarioRgb,
      colorClaroRgb,
      fotoUrl: p.portada_foto_url || configPortada.fotoUrl || FOTO_PORTADA_DEFECTO,
      filtroOpacidad: configPortada.filtroOpacidad,
      logoActivo,
      razonSocial: entidad.razon_social || 'Reformas Ordoñez',
      tituloDoc,
      tamanoTitulo: esOrientativo ? 25 : 30,
      interlineaTitulo: esOrientativo ? 9 : 10.5,
      proyecto: p.titulo ? { label: idioma === 'fr' ? 'PROJET' : 'PROYECTO', titulo: p.titulo } : undefined,
      descripcion: descripcionPortada,
      filas: [
        { icono: 'calendario', etiqueta: t.emision, valor: p.fecha_emision || '—' },
        { icono: 'documento', etiqueta: t.numero, valor: p.numero || '—' },
      ],
      entidad,
      pais,
      labelCif,
      labelEmpresa: idioma === 'fr' ? 'ENTREPRISE' : 'EMPRESA',
      tagline: idioma === 'fr' ? configPlantilla.portadaTaglineFr : configPlantilla.portadaTaglineEs,
    });
  }

  // ---- Cabecera ----
  let yCards: number;
  if (plantilla === 'elegante') {
    let y = 14;
    if (logoActivo) {
      const dim = await dimensionesImagen(logoActivo.dataUrl);
      const caja = ajustarCaja(dim.w, dim.h, 20, 20);
      doc.addImage(logoActivo.dataUrl, logoActivo.formato, 105 - caja.w / 2, y, caja.w, caja.h);
      y += caja.h + 3;
    }
    doc.setTextColor(30, 30, 30);
    doc.setFont(FUENTE_PDF, 'bold');
    doc.setFontSize(13);
    doc.text(entidad.razon_social || 'Reformas Ordoñez', 105, y, { align: 'center' });
    y += 7;
    doc.setDrawColor(...colorRgb);
    doc.setLineWidth(0.8);
    doc.line(margen, y, 210 - margen, y);
    y += 1.3;
    doc.line(margen, y, 210 - margen, y);
    doc.setLineWidth(0.2);
    y += 6;
    doc.setFont(FUENTE_PDF, 'bold');
    doc.setFontSize(15);
    doc.setTextColor(...colorRgb);
    doc.text(tituloDoc, 105, y, { align: 'center' });
    y += 5;
    if (p.titulo) {
      doc.setFont(FUENTE_PDF, 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...GRIS_TEXTO);
      doc.text(p.titulo, 105, y, { align: 'center' });
      y += 4.5;
    }
    yCards = y + 8;
  } else if (plantilla === 'francesa') {
    let xTexto = margen;
    const y = 18;
    if (logoActivo) {
      const dim = await dimensionesImagen(logoActivo.dataUrl);
      const caja = ajustarCaja(dim.w, dim.h, 18, 18);
      doc.addImage(logoActivo.dataUrl, logoActivo.formato, margen, y - 12, caja.w, caja.h);
      xTexto = margen + caja.w + 5;
    }
    doc.setTextColor(30, 30, 30);
    doc.setFont(FUENTE_PDF, 'bold');
    doc.setFontSize(11);
    doc.text(entidad.razon_social || 'Reformas Ordoñez', xTexto, y - 2);

    doc.setTextColor(...colorRgb);
    doc.setFont(FUENTE_PDF, 'bold');
    doc.setFontSize(esOrientativo ? 17 : 24);
    doc.text(tituloDoc, 195, 18, { align: 'right' });
    let yTituloFr = 25;
    if (p.titulo) {
      doc.setFont(FUENTE_PDF, 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...GRIS_TEXTO);
      doc.text(p.titulo, 195, yTituloFr, { align: 'right' });
      yTituloFr += 5.5;
    }
    yCards = 34;
  } else if (plantilla === 'minimalista') {
    let xTexto = margen;
    if (logoActivo) {
      const dim = await dimensionesImagen(logoActivo.dataUrl);
      const caja = ajustarCaja(dim.w, dim.h, 12, 12);
      doc.addImage(logoActivo.dataUrl, logoActivo.formato, margen, 8, caja.w, caja.h);
      xTexto = margen + caja.w + 4;
    }
    doc.setTextColor(60, 60, 60);
    doc.setFont(FUENTE_PDF, 'bold');
    doc.setFontSize(9);
    doc.text((entidad.razon_social || 'Reformas Ordoñez').toUpperCase(), xTexto, 13);

    doc.setTextColor(...colorRgb);
    doc.setFont(FUENTE_PDF, 'bold');
    doc.setFontSize(esOrientativo ? TAM_TITULO_DOC[configPlantilla.tamanoTituloDocumento] - 2 : TAM_TITULO_DOC[configPlantilla.tamanoTituloDocumento]);
    doc.text(tituloDoc, 195, 13, { align: 'right' });
    let yTituloMin = 19;
    if (p.titulo) {
      doc.setFont(FUENTE_PDF, 'normal');
      doc.setFontSize(TAM_TITULO_REFORMA[configPlantilla.tamanoTituloReforma]);
      doc.setTextColor(...GRIS_TEXTO);
      doc.text(p.titulo, 195, yTituloMin, { align: 'right' });
      yTituloMin += 5;
    }
    doc.setDrawColor(...GRIS_BORDE);
    doc.setLineWidth(0.3);
    doc.line(margen, 22, 210 - margen, 22);
    yCards = 28;
  } else if (plantilla === 'ejecutiva') {
    doc.setFillColor(...colorOscuroRgb);
    doc.rect(0, 0, 210, 34, 'F');
    doc.setFillColor(...colorSecundarioRgb);
    doc.rect(0, 34, 210, 3, 'F');

    let xTexto = margen;
    if (logoActivo) {
      const dim = await dimensionesImagen(logoActivo.dataUrl);
      const caja = ajustarCaja(dim.w, dim.h, 22, 22);
      doc.addImage(logoActivo.dataUrl, logoActivo.formato, margen, 6, caja.w, caja.h);
      xTexto = margen + caja.w + 6;
    }
    doc.setTextColor(255, 255, 255);
    doc.setFont(FUENTE_PDF, 'bold');
    doc.setFontSize(13);
    doc.text(entidad.razon_social || 'Reformas Ordoñez', xTexto, 19);

    doc.setTextColor(255, 255, 255);
    doc.setFont(FUENTE_PDF, 'bold');
    doc.setFontSize(esOrientativo ? 16 : 23);
    doc.text(tituloDoc, 195, 17, { align: 'right' });
    let yTituloEj = 24;
    if (p.titulo) {
      doc.setFontSize(9);
      doc.setFont(FUENTE_PDF, 'normal');
      doc.text(p.titulo, 195, yTituloEj, { align: 'right' });
      yTituloEj += 5;
    }
    yCards = 41;
  } else if (plantilla === 'creativa') {
    doc.setFillColor(...colorRgb);
    doc.rect(0, 0, 6, 297, 'F');
    doc.setFillColor(...colorSecundarioRgb);
    doc.rect(6, 0, 2, 297, 'F');

    let xTexto = margen + 3;
    const y = 16;
    if (logoActivo) {
      const dim = await dimensionesImagen(logoActivo.dataUrl);
      const caja = ajustarCaja(dim.w, dim.h, 22, 22);
      doc.addImage(logoActivo.dataUrl, logoActivo.formato, xTexto, y - 8, caja.w, caja.h);
      xTexto += caja.w + 6;
    }
    doc.setTextColor(30, 30, 30);
    doc.setFont(FUENTE_PDF, 'bold');
    doc.setFontSize(13);
    doc.text(entidad.razon_social || 'Reformas Ordoñez', xTexto, y - 2);

    doc.setTextColor(...colorRgb);
    doc.setFont(FUENTE_PDF, 'bold');
    doc.setFontSize(esOrientativo ? 13 : 19);
    doc.text(tituloDoc, 200, y, { align: 'right' });
    doc.setDrawColor(...colorSecundarioRgb);
    doc.setLineWidth(1);
    doc.line(160, y + 3, 200, y + 3);
    doc.setLineWidth(0.2);
    let yTituloCr = y + 9;
    if (p.titulo) {
      doc.setFont(FUENTE_PDF, 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...GRIS_TEXTO);
      doc.text(p.titulo, 200, yTituloCr, { align: 'right' });
      yTituloCr += 5;
    }
    yCards = y + 16;
  } else {
    if (plantilla === 'moderna') {
      doc.setDrawColor(...colorRgb);
      doc.setLineWidth(1);
      doc.line(0, 28, 210, 28);
      doc.setLineWidth(0.2);
    } else {
      doc.setFillColor(...colorOscuroRgb);
      doc.rect(0, 0, 210, 30, 'F');
    }

    const colorPrincipal: [number, number, number] = plantilla === 'moderna' ? [30, 30, 30] : [255, 255, 255];

    let xTexto = margen;
    if (logoActivo) {
      const dim = await dimensionesImagen(logoActivo.dataUrl);
      const caja = ajustarCaja(dim.w, dim.h, 20, 20);
      doc.addImage(logoActivo.dataUrl, logoActivo.formato, margen, 5, caja.w, caja.h);
      xTexto = margen + caja.w + 6;
    }

    doc.setTextColor(...colorPrincipal);
    doc.setFont(FUENTE_PDF, 'bold');
    doc.setFontSize(13);
    doc.text(entidad.razon_social || 'Reformas Ordoñez', xTexto, 17);

    doc.setTextColor(...(plantilla === 'moderna' ? colorRgb : ([255, 255, 255] as [number, number, number])));
    doc.setFont(FUENTE_PDF, 'bold');
    doc.setFontSize(esOrientativo ? 17 : 24);
    doc.text(tituloDoc, 195, 18, { align: 'right' });
    let yTituloCm = 25;
    if (p.titulo) {
      doc.setFontSize(9);
      doc.setFont(FUENTE_PDF, 'normal');
      doc.setTextColor(...colorPrincipal);
      doc.text(p.titulo, 195, yTituloCm, { align: 'right' });
      yTituloCm += 5;
    }
    yCards = 38;
  }

  // ---- Bloque bajo la cabecera, encima de las tarjetas ----
  // En minimalista son los datos propios del presupuesto, en dos columnas: emisión/validez/IVA a
  // la izquierda, número/estado a la derecha. Los datos legales de la empresa se muestran en la
  // tarjeta "Emisor" (ver más abajo). El resto de plantillas mantiene una columna, una línea por dato.
  if (plantilla === 'minimalista') {
    const xDerDatos = margen + 95;
    doc.setFont(FUENTE_PDF, 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...GRIS_TEXTO);

    let yIzqDatos = yCards;
    doc.text(`${t.emision}: ${p.fecha_emision ?? ''}`, margen, yIzqDatos);
    yIzqDatos += 4.5;
    doc.text(`${t.validez}: ${p.fecha_validez ?? ''}`, margen, yIzqDatos);
    yIzqDatos += 4.5;
    if (!esOrientativo) {
      doc.text(`${t.iva} : ${porcentajeIva(p.tipo_iva)}%`, margen, yIzqDatos);
      yIzqDatos += 4.5;
    }

    let yDerDatos = yCards;
    doc.text(`${t.numero}: ${p.numero ?? ''}`, xDerDatos, yDerDatos);
    yDerDatos += 4.5;
    doc.setFont(FUENTE_PDF, 'bold');
    doc.setTextColor(...colorEstadoPdf(p.estado));
    doc.text(`${t.estado} : ${idioma === 'fr' ? (ESTADO_FR[p.estado] ?? p.estado) : p.estado}`, xDerDatos, yDerDatos);
    doc.setFont(FUENTE_PDF, 'normal');
    doc.setTextColor(...GRIS_TEXTO);
    yDerDatos += 4.5;

    yCards = Math.max(yIzqDatos, yDerDatos) + 3;
  } else {
    const [direccionL1, direccionL2] = direccionEnDosLineas(entidad.direccion);
    const lineasCabecera = [
      direccionL1,
      direccionL2,
      entidad.telefono,
      entidad.web,
      entidad.identificador && `${labelCif}: ${entidad.identificador}`,
      entidad.identificador_extra && (pais === 'Francia' ? `TVA: ${entidad.identificador_extra}` : entidad.identificador_extra),
    ].filter(Boolean) as string[];
    if (lineasCabecera.length > 0) {
      doc.setFont(FUENTE_PDF, 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...GRIS_TEXTO);
      for (const linea of lineasCabecera) {
        doc.text(linea, margen, yCards);
        yCards += 4.5;
      }
      yCards += 3;
    }
  }

  // ---- Tarjetas cliente / presupuesto ----
  const altoCard = 46;
  doc.setDrawColor(...GRIS_BORDE);

  let yTabla: number;

  if (plantilla === 'francesa') {
    const xDer = 210 - margen;
    let yInfo = yCards;
    doc.setFont(FUENTE_PDF, 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...GRIS_TEXTO);
    doc.text(t.cliente, xDer, yInfo, { align: 'right' });
    yInfo += 5.5;
    doc.setFont(FUENTE_PDF, 'bold');
    doc.setFontSize(10);
    doc.setTextColor(30, 30, 30);
    doc.text(p.cliente_nombre ?? '', xDer, yInfo, { align: 'right' });
    yInfo += 5;
    doc.setFont(FUENTE_PDF, 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...GRIS_TEXTO);
    for (const dirLinea of direccionEnDosLineas(p.cliente_dir).filter(Boolean)) {
      const dirLineas = doc.splitTextToSize(dirLinea, 95);
      doc.text(dirLineas, xDer, yInfo, { align: 'right' });
      yInfo += dirLineas.length * 4.2;
    }
    if (p.cliente_dir_extra) {
      const dirExtraLineas = doc.splitTextToSize(p.cliente_dir_extra, 95);
      doc.text(dirExtraLineas, xDer, yInfo, { align: 'right' });
      yInfo += dirExtraLineas.length * 4.2;
    }
    yInfo += 1;
    if (p.cliente_tel) {
      doc.text(p.cliente_tel, xDer, yInfo, { align: 'right' });
      yInfo += 4.5;
    }
    if (p.cliente_email) {
      doc.text(p.cliente_email, xDer, yInfo, { align: 'right' });
      yInfo += 4.5;
    }
    yInfo += 3.5;

    doc.setFont(FUENTE_PDF, 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...GRIS_TEXTO);
    doc.text(t.datosDocumento, xDer, yInfo, { align: 'right' });
    yInfo += 5;
    doc.setFont(FUENTE_PDF, 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(30, 30, 30);
    doc.text(`${t.numero}: ${p.numero ?? ''}`, xDer, yInfo, { align: 'right' });
    yInfo += 5;
    doc.text(`${t.emision}: ${p.fecha_emision ?? ''}`, xDer, yInfo, { align: 'right' });
    yInfo += 5;
    doc.text(`${t.validez}: ${p.fecha_validez ?? ''}`, xDer, yInfo, { align: 'right' });
    yInfo += 5;
    if (!esOrientativo) {
      doc.text(`${t.iva} : ${porcentajeIva(p.tipo_iva)}%`, xDer, yInfo, { align: 'right' });
      yInfo += 5;
    }
    doc.setFont(FUENTE_PDF, 'bold');
    doc.setTextColor(...colorEstadoPdf(p.estado));
    doc.text(`${t.estado} : ${idioma === 'fr' ? (ESTADO_FR[p.estado] ?? p.estado) : p.estado}`, xDer, yInfo, { align: 'right' });
    doc.setFont(FUENTE_PDF, 'normal');
    doc.setTextColor(30, 30, 30);
    yInfo += 8;
    yTabla = yInfo;
  } else {
    const xIzq = margen;
    const xDerCard = margen + 95;

    const dibujarCliente = (x: number, y: number) => {
      doc.setFillColor(...colorClaroRgb);
      doc.roundedRect(x, y, 85, altoCard, 2, 2, 'FD');
      doc.setTextColor(...colorOscuroRgb);
      doc.setFont(FUENTE_PDF, 'bold');
      doc.setFontSize(8);
      doc.text(t.cliente, x + 4, y + 7);
      doc.setTextColor(30, 30, 30);
      doc.setFontSize(10);
      doc.text(p.cliente_nombre ?? '', x + 4, y + 14);
      doc.setFont(FUENTE_PDF, 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(...GRIS_TEXTO);
      let yc = y + 20;
      for (const dirLinea of direccionEnDosLineas(p.cliente_dir).filter(Boolean)) {
        const dirLineas = doc.splitTextToSize(dirLinea, 77);
        doc.text(dirLineas, x + 4, yc);
        yc += dirLineas.length * 4.2;
      }
      if (p.cliente_dir_extra) {
        const dirExtraLineas = doc.splitTextToSize(p.cliente_dir_extra, 77);
        doc.text(dirExtraLineas, x + 4, yc);
        yc += dirExtraLineas.length * 4.2;
      }
      yc += 0.8;
      if (p.cliente_tel) {
        doc.text(p.cliente_tel, x + 4, yc);
        yc += 5;
      }
      if (p.cliente_email) doc.text(p.cliente_email, x + 4, yc);
    };

    if (plantilla === 'minimalista') {
      const dibujarEmisor = (x: number, y: number) => {
        doc.setFillColor(...colorClaroRgb);
        doc.roundedRect(x, y, 85, altoCard, 2, 2, 'FD');
        doc.setTextColor(...colorOscuroRgb);
        doc.setFont(FUENTE_PDF, 'bold');
        doc.setFontSize(8);
        doc.text(t.emisor, x + 4, y + 7);
        doc.setTextColor(30, 30, 30);
        doc.setFontSize(10);
        doc.text(entidad.razon_social || 'Reformas Ordoñez', x + 4, y + 14);
        doc.setFont(FUENTE_PDF, 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(...GRIS_TEXTO);
        let yy = y + 20;
        for (const dirLinea of direccionEnDosLineas(entidad.direccion).filter(Boolean)) {
          const dirLineas = doc.splitTextToSize(dirLinea, 77);
          doc.text(dirLineas, x + 4, yy);
          yy += dirLineas.length * 4.2;
        }
        if (entidad.telefono) {
          doc.text(entidad.telefono, x + 4, yy);
          yy += 5;
        }
        if (entidad.identificador) {
          doc.text(`${labelCif}: ${entidad.identificador}`, x + 4, yy);
          yy += 5;
        }
        if (entidad.identificador_extra) {
          doc.text(pais === 'Francia' ? `TVA: ${entidad.identificador_extra}` : entidad.identificador_extra, x + 4, yy);
        }
      };

      if (configPlantilla.empresaClienteIzquierda) {
        dibujarEmisor(xIzq, yCards);
        dibujarCliente(xDerCard, yCards);
      } else {
        dibujarCliente(xIzq, yCards);
        dibujarEmisor(xDerCard, yCards);
      }
    } else {
      const dibujarDocumento = (x: number, y: number) => {
        doc.setFillColor(...colorClaroRgb);
        doc.roundedRect(x, y, 85, altoCard, 2, 2, 'FD');
        doc.setFont(FUENTE_PDF, 'bold');
        doc.setFontSize(8);
        doc.setTextColor(...colorOscuroRgb);
        doc.text(t.datosDocumento, x + 4, y + 7);
        doc.setFont(FUENTE_PDF, 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(30, 30, 30);
        doc.text(`${t.numero}: ${p.numero ?? ''}`, x + 4, y + 13);
        doc.text(`${t.emision}: ${p.fecha_emision ?? ''}`, x + 4, y + 19);
        doc.text(`${t.validez}: ${p.fecha_validez ?? ''}`, x + 4, y + 25);
        let yEstado = y + 31;
        if (!esOrientativo) {
          doc.text(`${t.iva} : ${porcentajeIva(p.tipo_iva)}%`, x + 4, yEstado);
          yEstado += 6;
        }
        doc.setFont(FUENTE_PDF, 'bold');
        doc.setTextColor(...colorEstadoPdf(p.estado));
        doc.text(`${t.estado} : ${idioma === 'fr' ? (ESTADO_FR[p.estado] ?? p.estado) : p.estado}`, x + 4, yEstado);
        doc.setFont(FUENTE_PDF, 'normal');
        doc.setTextColor(30, 30, 30);
      };
      dibujarCliente(xIzq, yCards);
      dibujarDocumento(xDerCard, yCards);
    }
    yTabla = yCards + altoCard + 6;
  }

  if (esOrientativo) {
    doc.setFillColor(255, 251, 235);
    doc.setDrawColor(252, 211, 77);
    doc.roundedRect(margen, yTabla, anchoContenido, 8, 1.5, 1.5, 'FD');
    doc.setFont(FUENTE_PDF, 'normal');
    doc.setFontSize(8);
    doc.setTextColor(146, 64, 14);
    doc.text(NOTA_ORIENTATIVO[idioma], margen + 3, yTabla + 5.5);
    doc.setTextColor(30, 30, 30);
    yTabla += 12;
  }

  // ---- Tabla de líneas ----
  const pct = porcentajeIva(p.tipo_iva);
  const colTabla = configPlantilla.columnas;
  // En orientativo el precio siempre es sin IVA por normativa — no tiene sentido mostrar
  // "Total con Impuestos" (induciría a error sobre un importe que aún no aplica).
  const mostrarTotalImpuestos = !esOrientativo;
  const cabecerasTabla = [t.columnas[0], t.columnas[1]];
  if (colTabla.unidad) cabecerasTabla.push(t.columnas[3]);
  cabecerasTabla.push(t.columnas[4], t.columnas[5], t.columnas[6]);
  if (mostrarTotalImpuestos) cabecerasTabla.push(t.columnas[7]);

  const idxDesignacion = 1;
  const idxNumerica = colTabla.unidad ? 3 : 2;
  const ANCHO_NUM = 8;
  // En orientativo no hay "forfait" y la cantidad está limitada a 2 dígitos (máx. 99) — unidad y
  // cantidad pueden ir más estrechas, dejando ese ancho libre para precio y total (que muestran un
  // rango "505.00 – 1292.00 €" y necesitan más espacio para no partirse en dos líneas).
  const ANCHO_UNIDAD = esOrientativo ? 10 : 14;
  const ANCHO_CANT = esOrientativo ? 8 : 10;
  const ANCHO_PRECIO = esOrientativo ? 37 : 28;
  const ANCHO_TOTAL = esOrientativo ? 35 : 24;
  const ANCHO_TOTAL_IMP = 28;
  const anchoDesignacion =
    anchoContenido -
    ANCHO_NUM -
    (colTabla.unidad ? ANCHO_UNIDAD : 0) -
    ANCHO_CANT -
    ANCHO_PRECIO -
    ANCHO_TOTAL -
    (mostrarTotalImpuestos ? ANCHO_TOTAL_IMP : 0);
  const anchoTextoDesignacion = anchoDesignacion - 3;

  const anchoLineaH = configPlantilla.tabla.lineas ? 0.1 : 0;
  const anchoLineaV = configPlantilla.tabla.lineasVerticales ? 0.1 : 0;
  const lineWidthTabla = { top: anchoLineaH, bottom: anchoLineaH, left: anchoLineaV, right: anchoLineaV };

  autoTable(doc, {
    startY: yTabla,
    // bottom: 27 reserva hasta y=270 (297 - 27) — el mismo límite que usan más abajo el bloque de
    // seguro, el pie de página y los T&C — para que ninguna fila entre en la franja del pie fijo
    // (mensaje de agradecimiento a y=280, línea a y=285, paginación a y=291).
    margin: { left: margen, right: margen, top: margen, bottom: 27 },
    // Por defecto autoTable puede partir una fila muy alta entre dos páginas (dibuja lo que cabe
    // y "continúa" el resto en la siguiente) — pero didDrawCell de abajo dibuja siempre el
    // contenido completo de la celda de una vez, sin saber de ese reparto, así que una fila con
    // mucho texto quedaba cortada contra el pie de página en vez de pasar entera a la página
    // siguiente. 'avoid' fuerza a que la fila entera se mueva de bloque si no cabe.
    rowPageBreak: 'avoid',
    head: [cabecerasTabla],
    body: p.lineas.map((l, i) => {
      const max = totalLineaMax(l, pct);
      const fila: string[] = [String(i + 1), formatearUnidadTexto(l.designacion)];
      if (colTabla.unidad) fila.push(formatearUnidadTexto(l.unidad));
      fila.push(
        String(l.cantidad),
        esOrientativo ? formatearRangoPrecio(l.precio_unit, l.precio_unit_max ?? l.precio_unit) : formatearPrecio(l.precio_unit),
        l.es_incluido ? t.incluido : esOrientativo ? formatearRangoPrecio(l.total_sin_iva, max.sinIva) : formatearPrecio(l.total_sin_iva),
      );
      if (mostrarTotalImpuestos) fila.push(l.es_incluido ? t.incluido : formatearPrecio(l.total_con_iva));
      return fila;
    }),
    styles: { font: FUENTE_PDF, lineWidth: lineWidthTabla, lineColor: GRIS_BORDE, valign: 'top' },
    headStyles: configPlantilla.tabla.encabezadoColoreado
      ? { fillColor: colorRgb, textColor: 255, fontStyle: 'bold', fontSize: 8.5 }
      : {
          fillColor: [255, 255, 255],
          textColor: GRIS_TEXTO,
          fontStyle: 'bold',
          fontSize: 8.5,
          lineWidth: { top: 0, bottom: 0.3, left: anchoLineaV, right: anchoLineaV },
          lineColor: [17, 24, 39],
        },
    bodyStyles: { fontSize: 8.5, textColor: [30, 30, 30] },
    ...(configPlantilla.tabla.filasIntercaladas ? { alternateRowStyles: { fillColor: colorClaroRgb } } : {}),
    columnStyles: {
      0: { halign: 'right', cellWidth: ANCHO_NUM },
      [idxDesignacion]: { cellWidth: anchoDesignacion },
      ...(colTabla.unidad ? { 2: { cellWidth: ANCHO_UNIDAD } } : {}),
      [idxNumerica]: { halign: 'right', cellWidth: ANCHO_CANT },
      [idxNumerica + 1]: { halign: 'right', cellWidth: ANCHO_PRECIO },
      [idxNumerica + 2]: { halign: 'right', cellWidth: ANCHO_TOTAL },
      ...(mostrarTotalImpuestos ? { [idxNumerica + 3]: { halign: 'right', cellWidth: ANCHO_TOTAL_IMP } } : {}),
    },
    didParseCell: (data) => {
      // Alineación forzada de encabezados (izquierda/centro/derecha) — 'auto' deja la alineación
      // por columna de columnStyles tal cual (que tiene prioridad sobre headStyles.halign).
      if (data.section === 'head') {
        const alineacion = configPlantilla.tabla.alineacionEncabezado;
        if (alineacion !== 'auto') data.cell.styles.halign = HALIGN_DESDE_ALINEACION[alineacion];
        return;
      }
      if (data.section !== 'body' || data.column.index !== idxDesignacion) return;
      const l = p.lineas[data.row.index];
      if (!l) return;
      // splitTextToSize mide con la fuente/tamaño activos en `doc` en este momento — deben
      // coincidir exactamente con los que usa didDrawCell al dibujar. En vez de convertir el
      // recuento de líneas en un array de celdas vacías (autoTable calcularía la altura con el
      // fontSize de bodyStyles, que no es el real y con descripciones largas queda por debajo de
      // lo que didDrawCell dibuja de verdad, así la fila invade el pie de página en vez de saltar),
      // se calcula aquí la altura real en mm con la misma geometría que usa didDrawCell
      // (LINE_H por línea) y se fuerza directamente vía minCellHeight.
      const LINE_H = 3.6;
      const GAP_TIPO_DESC = 1.2; // aire extra entre el tipo de servicio y la descripción — sin esto quedan pegados
      let lineas = 0;
      let alturaExtra = 0;
      if (colTabla.referencia && l.referencia) lineas += 1;
      doc.setFont(FUENTE_PDF, 'bold');
      doc.setFontSize(9.5);
      lineas += doc.splitTextToSize(formatearUnidadTexto(l.designacion) || '—', anchoTextoDesignacion).length;
      if (colTabla.descripcion && l.tipo_servicio && l.tipo_servicio !== '—') {
        lineas += 1;
        if (l.descripcion) alturaExtra += GAP_TIPO_DESC;
      }
      if (colTabla.descripcion && l.descripcion) {
        doc.setFontSize(7.5);
        for (const bloque of parsearTextoEnriquecido(formatearUnidadTexto(l.descripcion))) {
          doc.setFont(FUENTE_PDF, estiloFuente(bloque.negrita, bloque.cursiva));
          lineas += doc.splitTextToSize(bloque.texto, anchoTextoDesignacion - (bloque.tipo === 'lista' ? 2 : 0)).length;
        }
      }
      doc.setFont(FUENTE_PDF, 'normal');
      data.cell.styles.minCellHeight = 4.5 + Math.max(lineas, 1) * LINE_H + alturaExtra + 2;
      data.cell.text = [''];
    },
    didDrawCell: (data) => {
      if (data.section !== 'body' || data.column.index !== idxDesignacion) return;
      const l = p.lineas[data.row.index];
      if (!l) return;
      const x = data.cell.x + data.cell.padding('left');
      const LINE_H = 3.6;
      const GAP_TIPO_DESC = 1.2; // aire extra entre el tipo de servicio y la descripción — sin esto quedan pegados
      let ty = data.cell.y + 4.5;
      if (colTabla.referencia && l.referencia) {
        doc.setFont(FUENTE_PDF, 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(...GRIS_TEXTO);
        doc.text(l.referencia.toUpperCase(), x, ty);
        ty += LINE_H;
      }
      doc.setFont(FUENTE_PDF, 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(30, 30, 30);
      const desigLineas = doc.splitTextToSize(formatearUnidadTexto(l.designacion) || '—', anchoTextoDesignacion);
      doc.text(desigLineas, x, ty);
      ty += desigLineas.length * LINE_H;
      if (colTabla.descripcion && l.tipo_servicio && l.tipo_servicio !== '—') {
        doc.setFont(FUENTE_PDF, 'italic');
        doc.setFontSize(7.5);
        doc.setTextColor(...GRIS_TEXTO);
        doc.text(l.tipo_servicio, x, ty);
        ty += LINE_H;
        if (l.descripcion) ty += GAP_TIPO_DESC;
      }
      if (colTabla.descripcion && l.descripcion) {
        doc.setFontSize(7.5);
        doc.setTextColor(...GRIS_TEXTO);
        for (const bloque of parsearTextoEnriquecido(formatearUnidadTexto(l.descripcion))) {
          const anchoBloque = anchoTextoDesignacion - (bloque.tipo === 'lista' ? 2 : 0);
          const xBloque = x + (bloque.tipo === 'lista' ? 2 : 0);
          const subLineas = doc.splitTextToSize(bloque.texto, anchoBloque);
          doc.setFont(FUENTE_PDF, estiloFuente(bloque.negrita, bloque.cursiva));
          doc.text(subLineas, xBloque, ty);
          ty += subLineas.length * LINE_H;
        }
      }
      doc.setFont(FUENTE_PDF, 'normal');
      doc.setTextColor(30, 30, 30);
    },
  });

  let y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

  // El bloque de resumen/firma/plan de pago tiene una altura fija (~70mm en la columna de la
  // firma) que jsPDF no pagina automáticamente como sí hace autoTable — si no cabe entera se
  // cortaba contra el borde inferior de la página. Si no queda sitio, se pasa a una nueva página.
  if (y > 210) {
    doc.addPage();
    y = 20;
  }

  // Página donde arranca el resumen de pago con los datos bancarios — el mensaje de agradecimiento
  // solo debe pintarse a partir de aquí (nunca en las páginas de líneas del presupuesto).
  const paginaResumenPago = totalPaginasPdf(doc);

  // ---- Resumen de pago (izquierda) + Plan de pago / Forma de pago (derecha) ----
  const totalSinIva = p.lineas.reduce((s, l) => s + (l.es_incluido ? 0 : l.total_sin_iva), 0);
  const totalConIva = p.lineas.reduce((s, l) => s + (l.es_incluido ? 0 : l.total_con_iva), 0);
  const rangoTotales = esOrientativo ? calcularTotalesRango(p.lineas, pct) : null;

  const gapCol = 10;
  const anchoCol = (anchoContenido - gapCol) / 2;
  const xPlanForma = margen;
  const xResumenFirma = margen + anchoCol + gapCol;
  const yInicioColumnas = y;

  // Derecha: resumen de pago
  doc.setFillColor(...colorClaroRgb);
  doc.setDrawColor(...GRIS_BORDE);
  doc.roundedRect(xResumenFirma, y, anchoCol, 26, 2, 2, 'FD');
  doc.setFont(FUENTE_PDF, 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...GRIS_TEXTO);
  if (rangoTotales) {
    // Orientativo: nunca se muestra un importe "con IVA" — por normativa el IVA se determina en
    // el presupuesto normal tras la visita técnica. Las dos cifras (Base y TOTAL) son siempre sin
    // IVA, calculadas directamente de cantidad × precio de cada línea (no dependen del tipo de
    // IVA guardado) — la nota de debajo aclara que el IVA no está incluido.
    const rangoSinIva = formatearRangoPrecio(rangoTotales.totalSinIvaMin, rangoTotales.totalSinIvaMax);
    doc.text(t.totalSinIva, xResumenFirma + 4, y + 10);
    doc.text(rangoSinIva, xResumenFirma + anchoCol - 4, y + 10, { align: 'right' });
    doc.setDrawColor(...GRIS_BORDE);
    doc.line(xResumenFirma + 4, y + 16, xResumenFirma + anchoCol - 4, y + 16);
    doc.setFont(FUENTE_PDF, 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...colorRgb);
    doc.text(t.totalOrientativo, xResumenFirma + 4, y + 23);
    doc.text(rangoSinIva, xResumenFirma + anchoCol - 4, y + 23, { align: 'right' });
  } else {
    doc.text(t.totalSinIva, xResumenFirma + 4, y + 7);
    doc.text(formatearPrecio(totalSinIva), xResumenFirma + anchoCol - 4, y + 7, { align: 'right' });
    doc.text(`${t.iva} (${porcentajeIva(p.tipo_iva)}%)`, xResumenFirma + 4, y + 13);
    doc.text(formatearPrecio(totalConIva - totalSinIva), xResumenFirma + anchoCol - 4, y + 13, { align: 'right' });
    doc.setDrawColor(...GRIS_BORDE);
    doc.line(xResumenFirma + 4, y + 16, xResumenFirma + anchoCol - 4, y + 16);
    doc.setFont(FUENTE_PDF, 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...colorRgb);
    doc.text(t.total, xResumenFirma + 4, y + 23);
    doc.text(formatearPrecio(totalConIva), xResumenFirma + anchoCol - 4, y + 23, { align: 'right' });
  }

  let yResumenFirma = y + 26 + 6;

  if (esOrientativo) {
    doc.setFont(FUENTE_PDF, 'italic');
    doc.setFontSize(7.5);
    doc.setTextColor(...GRIS_TEXTO);
    const notaLineas = doc.splitTextToSize(t.notaSinIva, anchoCol);
    doc.text(notaLineas, xResumenFirma + anchoCol, yResumenFirma, { align: 'right' });
    yResumenFirma += notaLineas.length * 3.6 + 2;
  }

  const mencionIva = mencionIvaReducida(p.tipo_iva);
  if (mencionIva) {
    doc.setFont(FUENTE_PDF, 'italic');
    doc.setFontSize(7.5);
    doc.setTextColor(...GRIS_TEXTO);
    doc.text(mencionIva, xResumenFirma + anchoCol, yResumenFirma, { align: 'right' });
    yResumenFirma += 6;
  }

  yResumenFirma += 4;

  // Derecha: firma (debajo del resumen de pago)
  if (!esOrientativo) {
    doc.setDrawColor(...GRIS_BORDE);
    doc.roundedRect(xResumenFirma, yResumenFirma, anchoCol, 32, 2, 2);
    doc.setFont(FUENTE_PDF, 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...colorRgb);
    doc.text(t.firma, xResumenFirma + 4, yResumenFirma + 7);

    // Mismo rectángulo donde se pinta la firma manual (firma_base64) — se reutiliza como
    // posición del campo de firma en Documenso para que ambos métodos firmen en el mismo sitio.
    cajaFirmaDocumenso = { pagina: paginaResumenPago, x: xResumenFirma + 4, y: yResumenFirma + 10, width: 55, height: 18 };

    if (p.firmado && p.firma_base64) {
      doc.addImage(p.firma_base64, 'PNG', xResumenFirma + 4, yResumenFirma + 10, 55, 18);
      doc.setFont(FUENTE_PDF, 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...GRIS_TEXTO);
      doc.text(
        doc.splitTextToSize(`${t.firmadoPor} ${p.firma_nombre ?? ''} — ${p.firma_fecha?.slice(0, 10) ?? ''}`, anchoCol - 8),
        xResumenFirma + 4,
        yResumenFirma + 30,
      );
    } else {
      doc.setFont(FUENTE_PDF, 'italic');
      doc.setFontSize(9);
      doc.setTextColor(...GRIS_TEXTO);
      doc.text(t.pendienteFirma, xResumenFirma + 4, yResumenFirma + 20);
    }
    yResumenFirma += 32;
  }

  // Izquierda: plan de pago
  let yPlanForma = yInicioColumnas;
  if (p.plan_pago.length > 0) {
    autoTable(doc, {
      startY: yPlanForma,
      margin: { left: xPlanForma, right: 210 - xPlanForma - anchoCol },
      tableWidth: anchoCol,
      head: [[t.planPago, ...t.columnasPago.slice(1)]],
      body: p.plan_pago.map((plazo) => [plazo.concepto, `${plazo.porcentaje}%`, formatearPrecio(plazo.importe)]),
      styles: { font: FUENTE_PDF, lineWidth: configPlantilla.tabla.lineas ? 0.1 : 0, lineColor: GRIS_BORDE },
      headStyles: { fillColor: colorClaroRgb, textColor: colorOscuroRgb, fontStyle: 'bold', fontSize: 8.5 },
      bodyStyles: { fontSize: 8.5, textColor: [30, 30, 30] },
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
    });
    yPlanForma = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
  }

  // Izquierda: condiciones de pago (encima de forma de pago) — sin caja, en blanco
  if (condicionesPago && (condicionesPago.delai || condicionesPago.penalizacion || condicionesPago.medio)) {
    const camposCond: [string, string][] = [];
    if (condicionesPago.delai) camposCond.push([idioma === 'fr' ? 'Délai de paiement' : 'Plazo de pago', condicionesPago.delai]);
    if (condicionesPago.penalizacion)
      camposCond.push([idioma === 'fr' ? 'Pénalité de retard' : 'Penalización por retraso', condicionesPago.penalizacion]);
    if (condicionesPago.medio) camposCond.push([idioma === 'fr' ? 'Moyens de paiement' : 'Medio de pago', condicionesPago.medio]);

    // Igual que el bloque de nota/seguro más abajo: si el bloque no cabe entero en lo que queda
    // de página, se pasa a una nueva en vez de dejarlo pintado a caballo entre el contenido y el
    // pie de página fijo (era el bug reportado: "forma de pago" se veía cortado abajo del todo).
    doc.setFont(FUENTE_PDF, 'normal');
    doc.setFontSize(7.5);
    let altoCond = 11;
    for (const [, valor] of camposCond) {
      altoCond += 4 + doc.splitTextToSize(valor, anchoCol).length * 4 + 2;
    }
    if (yPlanForma + altoCond > 270) {
      doc.addPage();
      yPlanForma = 20;
    }

    doc.setFont(FUENTE_PDF, 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...colorRgb);
    doc.text(idioma === 'fr' ? 'Conditions de paiement' : 'Condiciones de pago', xPlanForma, yPlanForma + 4);
    let yCond = yPlanForma + 11;
    for (const [label, valor] of camposCond) {
      doc.setFont(FUENTE_PDF, 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(30, 30, 30);
      doc.text(label, xPlanForma, yCond);
      yCond += 4;
      doc.setFont(FUENTE_PDF, 'normal');
      doc.setTextColor(...GRIS_TEXTO);
      const lineasValor = doc.splitTextToSize(valor, anchoCol);
      doc.text(lineasValor, xPlanForma, yCond);
      yCond += lineasValor.length * 4 + 2;
    }
    yPlanForma = yCond + 2;
  }

  // Izquierda: forma de pago (titular / IBAN / BIC / banco) — sin caja, en blanco
  if (entidad.iban) {
    const camposBanco = [
      entidad.nombre_titular && [`${t.titular}: `, entidad.nombre_titular],
      ['IBAN: ', entidad.iban],
      entidad.bic && ['BIC: ', entidad.bic],
      entidad.banco && [`${t.banco}: `, entidad.banco],
    ].filter(Boolean) as [string, string][];

    const altoBanco = 11 + camposBanco.length * 5.5;
    if (yPlanForma + altoBanco > 270) {
      doc.addPage();
      yPlanForma = 20;
    }

    doc.setFont(FUENTE_PDF, 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...colorRgb);
    doc.text(t.formaPago, xPlanForma, yPlanForma + 4);
    doc.setFontSize(8.5);
    camposBanco.forEach(([etiqueta, valor], i) => {
      const yLinea = yPlanForma + 11 + i * 5.5;
      doc.setFont(FUENTE_PDF, 'bold');
      doc.setTextColor(...colorRgb);
      doc.text(etiqueta, xPlanForma, yLinea);
      doc.setFont(FUENTE_PDF, 'normal');
      doc.setTextColor(30, 30, 30);
      // +1mm además del ancho medido — el espacio final de "etiqueta" no siempre se mide con
      // fiabilidad y el valor quedaba pegado a los dos puntos en algunos casos.
      doc.text(valor, xPlanForma + doc.getTextWidth(etiqueta) + 1, yLinea);
    });
    yPlanForma += 11 + camposBanco.length * 5.5;
  }

  y = Math.max(yResumenFirma, yPlanForma) + 4;

  // ---- Seguro y garantía ----
  // En Francia, el seguro de obra es la "garantie décennale" — legalmente incluye estas 3
  // coberturas. Se aclara solo en documentos franceses; en España no aplica este concepto.
  if (entidad.seguro || entidad.num_attestation) {
    const esFrancia = pais === 'Francia';
    const lineaSeguro = [
      entidad.seguro,
      entidad.num_attestation && (esFrancia ? `Police n° ${entidad.num_attestation}` : `Nº ${entidad.num_attestation}`),
    ]
      .filter(Boolean)
      .join('   ·   ');
    const lineasSeguro = doc.splitTextToSize(lineaSeguro, anchoContenido - 8);
    const alto = esFrancia ? 15 + lineasSeguro.length * 4.2 + DECENNALE_BULLETS_FR.length * 4 + 4 : 20;

    if (y + alto > 270) {
      doc.addPage();
      y = 20;
    }
    doc.setFillColor(...colorClaroRgb);
    doc.setDrawColor(...GRIS_BORDE);
    doc.roundedRect(margen, y, anchoContenido, alto, 2, 2, 'FD');
    doc.setFont(FUENTE_PDF, 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...colorRgb);
    doc.text(esFrancia ? 'GARANTIE DÉCENNALE' : t.seguro, margen + 4, y + 7);
    doc.setFont(FUENTE_PDF, 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(30, 30, 30);
    doc.text(lineasSeguro, margen + 4, y + 13);
    let ySeguro = y + 13 + lineasSeguro.length * 4.2;
    if (esFrancia) {
      doc.setFontSize(7.5);
      doc.setTextColor(...GRIS_TEXTO);
      for (const bullet of DECENNALE_BULLETS_FR) {
        doc.text(`•  ${bullet}`, margen + 4, ySeguro);
        ySeguro += 4;
      }
    }
    y += alto + 8;
  }

  // ---- Nota adicional (opcional) ----
  if (p.nota) {
    if (y + 12 > 270) {
      doc.addPage();
      y = 20;
    }
    doc.setFont(FUENTE_PDF, 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...colorRgb);
    doc.text(t.nota, margen, y + 4);
    y += 9;
    doc.setFontSize(8.5);
    for (const bloque of parsearTextoEnriquecido(p.nota)) {
      const indent = bloque.tipo === 'lista' ? 2 : 0;
      const lineas = doc.splitTextToSize(bloque.texto, anchoContenido - indent);
      const altoBloque = lineas.length * 5 + 3;
      if (y + altoBloque > 270) {
        doc.addPage();
        y = 20;
      }
      doc.setFont(FUENTE_PDF, estiloFuente(bloque.negrita, bloque.cursiva));
      doc.setTextColor(30, 30, 30);
      doc.text(lineas, margen + indent, y);
      y += altoBloque;
    }
    doc.setFont(FUENTE_PDF, 'normal');
    y += 4;
  }

  // Mensaje de agradecimiento — se pinta como pie de página fijo en cada página (ver más abajo),
  // tanto en la del presupuesto como en la de términos y condiciones.
  const mensajeGracias = idioma === 'fr' ? config?.mensaje_gracias_fr : config?.mensaje_gracias_es;

  // ---- Pie de página personalizado ----
  if (configPlantilla.piePagina) {
    let yPie = esOrientativo ? y + 10 : y + 40;
    if (yPie > 270) {
      doc.addPage();
      yPie = 20;
    }
    doc.setFont(FUENTE_PDF, 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...GRIS_TEXTO);
    doc.text(doc.splitTextToSize(configPlantilla.piePagina, anchoContenido), 105, yPie, { align: 'center' });
  }

  // ---- Términos y condiciones ----
  // Si el presupuesto trae unos términos propios (pestaña "Condiciones"), sustituyen a los
  // generales de Configuración solo para este documento.
  const tcCrudo =
    p.terminos_condiciones ||
    (esOrientativo
      ? idioma === 'fr'
        ? config?.tc_fr_orientativo || config?.tc_fr
        : config?.tc_es_orientativo || config?.tc_es
      : idioma === 'fr'
        ? config?.tc_fr
        : config?.tc_es);
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

    // Deja hueco por debajo (el mensaje de agradecimiento y el pie de página fijos se dibujan a
    // partir de y=280 en cada página) — si un bloque no cabe entero, pasa a una página nueva en
    // vez de seguir escribiendo fuera del área visible.
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
  const primeraPaginaConPie = p.formato === 'completo' ? 2 : 1;
  for (let i = primeraPaginaConPie; i <= totalPaginas; i++) {
    doc.setPage(i);
    if (mensajeGracias && i >= paginaResumenPago) {
      doc.setFont(FUENTE_PDF, 'italic');
      doc.setFontSize(11);
      doc.setTextColor(...colorRgb);
      doc.text(doc.splitTextToSize(mensajeGracias, anchoContenido), 105, 280, { align: 'center' });
    }
    doc.setDrawColor(...GRIS_BORDE);
    doc.line(margen, 285, 210 - margen, 285);
    doc.setFont(FUENTE_PDF, 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...GRIS_TEXTO);
    doc.text(entidad.razon_social ?? '', margen, 291);
    doc.text(`${t.pagina} ${i}/${totalPaginas}`, 210 - margen, 291, { align: 'right' });
  }

  return { doc, cajaFirma: cajaFirmaDocumenso };
}
