import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from './supabase';
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
  DECENNALE_BULLETS_FR,
} from './pdfEmpresa';
import { configPlantillaDesde } from '../modules/finanzas/DocumentoPreview';
import type { TamanoTitulo, AlineacionEncabezado } from '../modules/finanzas/DocumentoPreview';
import { renderizarTC, tamanoFuenteTC } from './terminos';
import { mencionIvaReducida } from '../modules/finanzas/iva';
import { colorEstadoPdf } from '../modules/finanzas/estadoColor';
import { porcentajeIva, paisDesdeTipoIva } from '../modules/finanzas/facturas/types';
import type { Factura } from '../modules/finanzas/facturas/types';
import { parsearTextoEnriquecido, estiloFuente } from './textoEnriquecido';
import { formatearUnidadTexto } from '../modules/finanzas/lineas';
import { direccionEnDosLineas } from './direcciones';
import { registrarFuentePoppins, FUENTE_PDF } from './fuentePdf';

const TAM_TITULO_DOC: Record<TamanoTitulo, number> = { sm: 10, md: 12, lg: 15 };
const TAM_TITULO_REFORMA: Record<TamanoTitulo, number> = { sm: 7, md: 8, lg: 10 };
const HALIGN_DESDE_ALINEACION: Record<Exclude<AlineacionEncabezado, 'auto'>, 'left' | 'center' | 'right'> = {
  izquierda: 'left',
  centro: 'center',
  derecha: 'right',
};

const TEXTOS = {
  es: {
    titulo: 'FACTURA',
    cliente: 'CLIENTE',
    emisor: 'EMISOR',
    titular: 'Titular',
    banco: 'Banco',
    datosDocumento: 'FACTURA',
    numero: 'Número',
    emision: 'Fecha factura',
    vencimiento: 'Vencimiento',
    tipoImpuesto: 'Impuesto',
    estadoCobro: 'Estado de cobro',
    estado: 'Estado',
    metodoPago: 'Método de pago',
    columnas: ['Nº', 'Designación', 'Descripción', 'Ud.', 'Cant.', 'Precio unit. (s/IVA)', 'Total', 'Total con Impuestos'],
    totalSinIva: 'Base imponible',
    iva: 'IVA',
    total: 'TOTAL',
    incluido: 'Incluido',
    formaPago: 'Forma de pago',
    seguro: 'Seguro y garantía',
    nota: 'Nota',
    pagina: 'Página',
    notaIva: 'IVA aplicado según normativa vigente.',
    tyc: 'Términos y condiciones',
  },
  fr: {
    titulo: 'FACTURE',
    cliente: 'CLIENT',
    emisor: 'ÉMETTEUR',
    titular: 'Titulaire',
    banco: 'Banque',
    datosDocumento: 'FACTURE',
    numero: 'Numéro',
    emision: 'Date facture',
    vencimiento: 'Échéance',
    tipoImpuesto: 'Taxe',
    estadoCobro: 'État de paiement',
    estado: 'État',
    metodoPago: 'Mode de paiement',
    columnas: ['Nº', 'Désignation', 'Description', 'Unit', 'Qt', 'Prix unit. (HT)', 'Total', 'Total TTC'],
    totalSinIva: 'Base HT',
    iva: 'TVA',
    total: 'TOTAL',
    incluido: 'Inclus',
    formaPago: 'Modalités de paiement',
    seguro: 'Assurance et garantie',
    nota: 'Note',
    pagina: 'Page',
    notaIva: '',
    tyc: 'Conditions générales',
  },
};

export function notasLegales(idioma: 'es' | 'fr', tipoIva: string | null): string[] {
  const notas: string[] = [];
  if (idioma === 'es') {
    notas.push('IVA aplicado según normativa vigente.');
  } else {
    if (tipoIva === 'TVA_10') notas.push('TVA sur les travaux de rénovation selon article 279-0 bis du CGI.');
    notas.push("En cas de retard de paiement, indemnité forfaitaire de 40€ (décret n°2012-1115), en sus des pénalités légales.");
  }
  return notas;
}

export async function generarPdfFactura(f: Factura) {
  const { doc } = await construirPdfFactura(f);
  doc.save(`${f.numero ?? 'factura'}.pdf`);
}

/** Igual que generarPdfFactura pero devuelve el PDF como Blob en vez de descargarlo (para
 * exportaciones en lote a ZIP). */
export async function generarPdfFacturaBlob(f: Factura): Promise<{ blob: Blob }> {
  const { doc } = await construirPdfFactura(f);
  return { blob: doc.output('blob') };
}

async function construirPdfFactura(f: Factura) {
  const idioma = f.idioma === 'Français' ? 'fr' : 'es';
  const t = TEXTOS[idioma];
  const pais = f.pais ?? paisDesdeTipoIva(f.tipo_iva) ?? 'España';
  // La etiqueta del identificador fiscal depende del país del cliente, no del idioma del documento
  // (un devis en español para un cliente francés sigue mostrando SIRET, no CIF).
  const labelCif = pais === 'Francia' ? 'SIRET' : 'CIF';
  const esAcompte = f.tipo === 'acompte';
  const tituloDoc = esAcompte ? (idioma === 'fr' ? "FACTURE D'ACOMPTE" : 'FACTURA DE ANTICIPO') : t.titulo;
  const { entidad, logoUrl } = await cargarEntidad(pais);
  const config = await cargarConfigCompleta();
  const configPlantilla = configPlantillaDesde((config?.datos as { plantilla_documento?: unknown })?.plantilla_documento);

  // Devis associé + condiciones de pago del presupuesto (si tiene anulación propia) + anticipos ya facturados
  // (para el resumen de pago de la factura final).
  let devisNumero: string | null = null;
  let condPagoPresupuesto: Record<string, string> | null = null;
  let acomptesPrevios: { numero: string | null; total: number }[] = [];
  if (f.presupuesto_id) {
    const { data: presupuestoOrigen } = await supabase
      .from('presupuestos')
      .select('numero, condiciones_pago')
      .eq('id', f.presupuesto_id)
      .single();
    devisNumero = presupuestoOrigen?.numero ?? null;
    condPagoPresupuesto = presupuestoOrigen?.condiciones_pago ?? null;
    if (f.tipo === 'normal') {
      const { data: acomptesData } = await supabase
        .from('facturas')
        .select('numero, lineas')
        .eq('presupuesto_id', f.presupuesto_id)
        .eq('tipo', 'acompte')
        .neq('id', f.id)
        .is('eliminado_en', null);
      acomptesPrevios = (acomptesData ?? []).map((a) => ({
        numero: a.numero,
        total: ((a.lineas ?? []) as Factura['lineas']).reduce((s, l) => s + (l.es_incluido ? 0 : l.total_con_iva), 0),
      }));
    }
  }

  const condPagoDatos = condPagoPresupuesto ?? (config?.datos as { condicionesPago?: Record<string, string> })?.condicionesPago;
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

  const lineaContacto = [entidad.direccion, entidad.telefono, entidad.web].filter(Boolean).join('  ·  ');
  const lineaFiscal = [
    entidad.identificador && `${labelCif}: ${entidad.identificador}`,
    entidad.identificador_extra && (pais === 'Francia' ? `TVA: ${entidad.identificador_extra}` : entidad.identificador_extra),
  ]
    .filter(Boolean)
    .join('  ·  ');

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
    y += 2;
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
    if (f.titulo) {
      doc.setFont(FUENTE_PDF, 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...GRIS_TEXTO);
      doc.text(f.titulo, 105, y, { align: 'center' });
      y += 4.5;
    }
    doc.setFont(FUENTE_PDF, 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...GRIS_TEXTO);
    doc.text(`${t.numero}: ${f.numero ?? ''}`, 105, y, { align: 'center' });
    yCards = y + 8;
  } else if (plantilla === 'francesa') {
    const y = 18;
    if (logoActivo) {
      const dim = await dimensionesImagen(logoActivo.dataUrl);
      const caja = ajustarCaja(dim.w, dim.h, 18, 18);
      doc.addImage(logoActivo.dataUrl, logoActivo.formato, margen, y - 12, caja.w, caja.h);
    }

    doc.setTextColor(...colorRgb);
    doc.setFont(FUENTE_PDF, 'bold');
    doc.setFontSize(24);
    doc.text(tituloDoc, 195, 18, { align: 'right' });
    doc.setFont(FUENTE_PDF, 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...GRIS_TEXTO);
    let yNumFr = 25;
    if (f.titulo) {
      doc.text(f.titulo, 195, yNumFr, { align: 'right' });
      yNumFr += 5.5;
    }
    doc.text(`${t.numero}: ${f.numero ?? ''}`, 195, yNumFr, { align: 'right' });
    yCards = 38;
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
    doc.setFontSize(TAM_TITULO_DOC[configPlantilla.tamanoTituloDocumento]);
    doc.text(tituloDoc, 195, 13, { align: 'right' });
    let yTituloFact = 19;
    if (f.titulo) {
      doc.setFont(FUENTE_PDF, 'normal');
      doc.setFontSize(TAM_TITULO_REFORMA[configPlantilla.tamanoTituloReforma]);
      doc.setTextColor(...GRIS_TEXTO);
      doc.text(f.titulo, 195, yTituloFact, { align: 'right' });
      yTituloFact += 5;
    }
    doc.setDrawColor(...GRIS_BORDE);
    doc.setLineWidth(0.3);
    doc.line(margen, 22, 210 - margen, 22);
    yCards = 28;
  } else if (plantilla === 'ejecutiva') {
    doc.setFillColor(...colorOscuroRgb);
    doc.rect(0, 0, 210, 42, 'F');
    doc.setFillColor(...colorSecundarioRgb);
    doc.rect(0, 42, 210, 3, 'F');

    if (logoActivo) {
      const dim = await dimensionesImagen(logoActivo.dataUrl);
      const caja = ajustarCaja(dim.w, dim.h, 24, 24);
      doc.addImage(logoActivo.dataUrl, logoActivo.formato, margen, 8, caja.w, caja.h);
    }

    doc.setTextColor(255, 255, 255);
    doc.setFont(FUENTE_PDF, 'bold');
    doc.setFontSize(23);
    doc.text(tituloDoc, 195, 19, { align: 'right' });
    doc.setFontSize(10);
    doc.setFont(FUENTE_PDF, 'normal');
    let yNumEj = 27;
    if (f.titulo) {
      doc.text(f.titulo, 195, yNumEj, { align: 'right' });
      yNumEj += 6;
    }
    doc.text(`${t.numero}: ${f.numero ?? ''}`, 195, yNumEj, { align: 'right' });
    yCards = 55;
  } else if (plantilla === 'creativa') {
    doc.setFillColor(...colorRgb);
    doc.rect(0, 0, 6, 297, 'F');
    doc.setFillColor(...colorSecundarioRgb);
    doc.rect(6, 0, 2, 297, 'F');

    const xTexto = margen + 3;
    const y = 16;
    if (logoActivo) {
      const dim = await dimensionesImagen(logoActivo.dataUrl);
      const caja = ajustarCaja(dim.w, dim.h, 22, 22);
      doc.addImage(logoActivo.dataUrl, logoActivo.formato, xTexto, y - 8, caja.w, caja.h);
    }

    doc.setTextColor(...colorRgb);
    doc.setFont(FUENTE_PDF, 'bold');
    doc.setFontSize(19);
    doc.text(tituloDoc, 200, y, { align: 'right' });
    doc.setDrawColor(...colorSecundarioRgb);
    doc.setLineWidth(1);
    doc.line(160, y + 3, 200, y + 3);
    doc.setLineWidth(0.2);
    doc.setFont(FUENTE_PDF, 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...GRIS_TEXTO);
    let yNumCr = y + 9;
    if (f.titulo) {
      doc.text(f.titulo, 200, yNumCr, { align: 'right' });
      yNumCr += 5;
    }
    doc.text(`${t.numero}: ${f.numero ?? ''}`, 200, yNumCr, { align: 'right' });
    yCards = y + 32;
  } else {
    if (plantilla === 'moderna') {
      doc.setDrawColor(...colorRgb);
      doc.setLineWidth(1);
      doc.line(0, 38, 210, 38);
      doc.setLineWidth(0.2);
    } else {
      doc.setFillColor(...colorOscuroRgb);
      doc.rect(0, 0, 210, 40, 'F');
    }

    const colorPrincipal: [number, number, number] = plantilla === 'moderna' ? [30, 30, 30] : [255, 255, 255];

    if (logoActivo) {
      const dim = await dimensionesImagen(logoActivo.dataUrl);
      const caja = ajustarCaja(dim.w, dim.h, 24, 24);
      doc.addImage(logoActivo.dataUrl, logoActivo.formato, margen, 8, caja.w, caja.h);
    }

    doc.setTextColor(...(plantilla === 'moderna' ? colorRgb : ([255, 255, 255] as [number, number, number])));
    doc.setFont(FUENTE_PDF, 'bold');
    doc.setFontSize(22);
    doc.text(tituloDoc, 195, 18, { align: 'right' });
    doc.setFontSize(10);
    doc.setFont(FUENTE_PDF, 'normal');
    doc.setTextColor(...colorPrincipal);
    let yNumCm = 26;
    if (f.titulo) {
      doc.text(f.titulo, 195, yNumCm, { align: 'right' });
      yNumCm += 6;
    }
    doc.text(`${t.numero}: ${f.numero ?? ''}`, 195, yNumCm, { align: 'right' });
    yCards = 50;
  }

  // ---- Datos de la factura, bajo la cabecera y encima de las tarjetas (solo minimalista) ----
  // Los datos legales de la empresa se muestran ahora en la tarjeta "Emisor" (ver más abajo).
  if (plantilla === 'minimalista') {
    doc.setFont(FUENTE_PDF, 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...GRIS_TEXTO);
    doc.text(`${t.numero}: ${f.numero ?? ''}`, margen, yCards);
    yCards += 4.5;
    doc.text(`${t.emision}: ${f.fecha_factura ?? ''}`, margen, yCards);
    yCards += 4.5;
    doc.text(`${t.vencimiento}: ${f.fecha_vence ?? ''}`, margen, yCards);
    yCards += 4.5;
    if (devisNumero) {
      doc.text(`${idioma === 'fr' ? 'Devis associé' : 'Presupuesto asociado'}: ${devisNumero}`, margen, yCards);
      yCards += 4.5;
    }
    const estadoCanonicoTop = f.estado_cobro === 'Cobrada' ? 'Pagado' : 'Borrador';
    const estadoDocumentoTop = idioma === 'fr' ? (estadoCanonicoTop === 'Pagado' ? 'Payé' : 'Brouillon') : estadoCanonicoTop;
    doc.setFont(FUENTE_PDF, 'bold');
    doc.setTextColor(...colorEstadoPdf(estadoCanonicoTop));
    doc.text(`${t.estado} : ${estadoDocumentoTop}`, margen, yCards);
    doc.setFont(FUENTE_PDF, 'normal');
    doc.setTextColor(...GRIS_TEXTO);
    yCards += 4.5;
    if (f.metodo_pago) {
      doc.text(`${t.metodoPago}: ${f.metodo_pago}`, margen, yCards);
      yCards += 4.5;
    }
    yCards += 3;
  }

  // ---- Tarjetas cliente / factura ----
  const altoCard = 44;
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
    doc.text(f.cliente_nombre ?? '', xDer, yInfo, { align: 'right' });
    yInfo += 5;
    doc.setFont(FUENTE_PDF, 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...GRIS_TEXTO);
    for (const dirLinea of direccionEnDosLineas(f.cliente_dir).filter(Boolean)) {
      const dirLineas = doc.splitTextToSize(dirLinea, 95);
      doc.text(dirLineas, xDer, yInfo, { align: 'right' });
      yInfo += dirLineas.length * 4.2;
    }
    yInfo += 1;
    if (f.cliente_tel) {
      doc.text(f.cliente_tel, xDer, yInfo, { align: 'right' });
      yInfo += 4.5;
    }
    if (f.cliente_email) {
      doc.text(f.cliente_email, xDer, yInfo, { align: 'right' });
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
    doc.text(`${t.emision}: ${f.fecha_factura ?? ''}`, xDer, yInfo, { align: 'right' });
    yInfo += 5;
    doc.text(`${t.vencimiento}: ${f.fecha_vence ?? ''}`, xDer, yInfo, { align: 'right' });
    yInfo += 5;
    const estadoCanonicoFr = f.estado_cobro === 'Cobrada' ? 'Pagado' : 'Borrador';
    const estadoDocumentoFr = idioma === 'fr' ? (estadoCanonicoFr === 'Pagado' ? 'Payé' : 'Brouillon') : estadoCanonicoFr;
    doc.setFont(FUENTE_PDF, 'bold');
    doc.setTextColor(...colorEstadoPdf(estadoCanonicoFr));
    doc.text(`${t.estado} : ${estadoDocumentoFr}`, xDer, yInfo, { align: 'right' });
    doc.setFont(FUENTE_PDF, 'normal');
    doc.setTextColor(30, 30, 30);
    yInfo += 5;
    if (f.metodo_pago) doc.text(`${t.metodoPago}: ${f.metodo_pago}`, xDer, yInfo, { align: 'right' });
    yInfo += 8;
    yTabla = yInfo;
  } else {
    const xIzq = margen;
    const xDer = margen + 95;

    const dibujarCliente = (x: number) => {
      doc.setFillColor(...colorClaroRgb);
      doc.roundedRect(x, yCards, 85, altoCard, 2, 2, 'FD');
      doc.setTextColor(...colorOscuroRgb);
      doc.setFont(FUENTE_PDF, 'bold');
      doc.setFontSize(8);
      doc.text(t.cliente, x + 4, yCards + 7);
      doc.setTextColor(30, 30, 30);
      doc.setFontSize(10);
      doc.text(f.cliente_nombre ?? '', x + 4, yCards + 14);
      doc.setFont(FUENTE_PDF, 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(...GRIS_TEXTO);
      let yc = yCards + 20;
      for (const dirLinea of direccionEnDosLineas(f.cliente_dir).filter(Boolean)) {
        const dirLineas = doc.splitTextToSize(dirLinea, 77);
        doc.text(dirLineas, x + 4, yc);
        yc += dirLineas.length * 4.2;
      }
      yc += 0.8;
      if (f.cliente_tel) {
        doc.text(f.cliente_tel, x + 4, yc);
        yc += 5;
      }
      if (f.cliente_email) doc.text(f.cliente_email, x + 4, yc);
    };

    if (plantilla === 'minimalista') {
      const dibujarEmisor = (x: number) => {
        doc.setFillColor(...colorClaroRgb);
        doc.roundedRect(x, yCards, 85, altoCard, 2, 2, 'FD');
        doc.setTextColor(...colorOscuroRgb);
        doc.setFont(FUENTE_PDF, 'bold');
        doc.setFontSize(8);
        doc.text(t.emisor, x + 4, yCards + 7);
        doc.setTextColor(30, 30, 30);
        doc.setFontSize(10);
        doc.text(entidad.razon_social || 'Reformas Ordoñez', x + 4, yCards + 14);
        doc.setFont(FUENTE_PDF, 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(...GRIS_TEXTO);
        let yy = yCards + 20;
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
        dibujarEmisor(xIzq);
        dibujarCliente(xDer);
      } else {
        dibujarCliente(xIzq);
        dibujarEmisor(xDer);
      }
    } else {
      dibujarCliente(xIzq);

      doc.setFillColor(...colorClaroRgb);
      doc.roundedRect(xDer, yCards, 85, altoCard, 2, 2, 'FD');
      doc.setFont(FUENTE_PDF, 'bold');
      doc.setFontSize(8);
      doc.setTextColor(...colorOscuroRgb);
      doc.text(t.datosDocumento, xDer + 4, yCards + 7);
      doc.setFont(FUENTE_PDF, 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(30, 30, 30);
      doc.text(`${t.emision}: ${f.fecha_factura ?? ''}`, xDer + 4, yCards + 14);
      doc.text(`${t.vencimiento}: ${f.fecha_vence ?? ''}`, xDer + 4, yCards + 20);
      const estadoCanonico = f.estado_cobro === 'Cobrada' ? 'Pagado' : 'Borrador';
      const estadoDocumento = idioma === 'fr' ? (estadoCanonico === 'Pagado' ? 'Payé' : 'Brouillon') : estadoCanonico;
      doc.setFont(FUENTE_PDF, 'bold');
      doc.setTextColor(...colorEstadoPdf(estadoCanonico));
      doc.text(`${t.estado} : ${estadoDocumento}`, xDer + 4, yCards + 26);
      doc.setFont(FUENTE_PDF, 'normal');
      doc.setTextColor(30, 30, 30);
      if (f.metodo_pago) doc.text(`${t.metodoPago}: ${f.metodo_pago}`, xDer + 4, yCards + 32);
    }
    yTabla = yCards + altoCard + 10;
  }

  // ---- Tabla de líneas ----
  const colTabla = configPlantilla.columnas;
  const cabecerasTabla = [t.columnas[0], t.columnas[1]];
  if (colTabla.unidad) cabecerasTabla.push(t.columnas[3]);
  cabecerasTabla.push(t.columnas[4], t.columnas[5], t.columnas[6], t.columnas[7]);

  const idxDesignacion = 1;
  const idxNumerica = colTabla.unidad ? 3 : 2;
  const ANCHO_NUM = 8;
  const ANCHO_UNIDAD = 14;
  const ANCHO_CANT = 14;
  const ANCHO_PRECIO = 28;
  const ANCHO_TOTAL = 24;
  const ANCHO_TOTAL_IMP = 28;
  const anchoDesignacion =
    anchoContenido - ANCHO_NUM - (colTabla.unidad ? ANCHO_UNIDAD : 0) - ANCHO_CANT - ANCHO_PRECIO - ANCHO_TOTAL - ANCHO_TOTAL_IMP;
  const anchoTextoDesignacion = anchoDesignacion - 3;

  const anchoLineaH = configPlantilla.tabla.lineas ? 0.1 : 0;
  const anchoLineaV = configPlantilla.tabla.lineasVerticales ? 0.1 : 0;
  const lineWidthTabla = { top: anchoLineaH, bottom: anchoLineaH, left: anchoLineaV, right: anchoLineaV };

  autoTable(doc, {
    startY: yTabla,
    // bottom: 27 reserva hasta y=270 (297 - 27) — el mismo límite que usa el pie de página fijo
    // (línea a y=285, paginación a y=291) — para que ninguna fila entre en esa franja.
    margin: { left: margen, right: margen, top: margen, bottom: 27 },
    // Por defecto autoTable puede partir una fila muy alta entre dos páginas (dibuja lo que cabe
    // y "continúa" el resto en la siguiente) — pero didDrawCell de abajo dibuja siempre el
    // contenido completo de la celda de una vez, sin saber de ese reparto, así que una fila con
    // mucho texto quedaba cortada contra el pie de página en vez de pasar entera a la página
    // siguiente. 'avoid' fuerza a que la fila entera se mueva de bloque si no cabe.
    rowPageBreak: 'avoid',
    head: [cabecerasTabla],
    body: f.lineas.map((l, i) => {
      const fila: string[] = [String(i + 1), formatearUnidadTexto(l.designacion)];
      if (colTabla.unidad) fila.push(formatearUnidadTexto(l.unidad));
      fila.push(
        String(l.cantidad),
        `${l.precio_unit.toFixed(2)} €`,
        l.es_incluido ? t.incluido : `${l.total_sin_iva.toFixed(2)} €`,
        l.es_incluido ? t.incluido : `${l.total_con_iva.toFixed(2)} €`,
      );
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
      [idxNumerica + 3]: { halign: 'right', cellWidth: ANCHO_TOTAL_IMP },
    },
    didParseCell: (data) => {
      if (data.section === 'head') {
        const alineacion = configPlantilla.tabla.alineacionEncabezado;
        if (alineacion !== 'auto') data.cell.styles.halign = HALIGN_DESDE_ALINEACION[alineacion];
        return;
      }
      if (data.section !== 'body' || data.column.index !== idxDesignacion) return;
      const l = f.lineas[data.row.index];
      if (!l) return;
      // splitTextToSize mide con la fuente/tamaño activos en `doc` en este momento — deben
      // coincidir exactamente con los que usa didDrawCell al dibujar. En vez de convertir el
      // recuento de líneas en un array de celdas vacías (autoTable calcularía la altura con el
      // fontSize de bodyStyles, que no es el real y con descripciones largas queda por debajo de
      // lo que didDrawCell dibuja de verdad, así la fila invade el pie de página en vez de saltar),
      // se calcula aquí la altura real en mm con la misma geometría que usa didDrawCell
      // (LINE_H por línea) y se fuerza directamente vía minCellHeight.
      let lineas = 0;
      if (colTabla.referencia && l.referencia) lineas += 1;
      doc.setFont(FUENTE_PDF, 'bold');
      doc.setFontSize(9);
      lineas += doc.splitTextToSize(formatearUnidadTexto(l.designacion) || '—', anchoTextoDesignacion).length;
      if (colTabla.descripcion && l.descripcion) {
        doc.setFontSize(7.5);
        for (const bloque of parsearTextoEnriquecido(formatearUnidadTexto(l.descripcion))) {
          doc.setFont(FUENTE_PDF, estiloFuente(bloque.negrita, bloque.cursiva));
          lineas += doc.splitTextToSize(bloque.texto, anchoTextoDesignacion - (bloque.tipo === 'lista' ? 2 : 0)).length;
        }
      }
      doc.setFont(FUENTE_PDF, 'normal');
      const LINE_H = 3.6;
      data.cell.styles.minCellHeight = 4.5 + Math.max(lineas, 1) * LINE_H + 2;
      data.cell.text = [''];
    },
    didDrawCell: (data) => {
      if (data.section !== 'body' || data.column.index !== idxDesignacion) return;
      const l = f.lineas[data.row.index];
      if (!l) return;
      const x = data.cell.x + data.cell.padding('left');
      const LINE_H = 3.6;
      let ty = data.cell.y + 4.5;
      if (colTabla.referencia && l.referencia) {
        doc.setFont(FUENTE_PDF, 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(...GRIS_TEXTO);
        doc.text(l.referencia.toUpperCase(), x, ty);
        ty += LINE_H;
      }
      doc.setFont(FUENTE_PDF, 'bold');
      doc.setFontSize(9);
      doc.setTextColor(30, 30, 30);
      const desigLineas = doc.splitTextToSize(formatearUnidadTexto(l.designacion) || '—', anchoTextoDesignacion);
      doc.text(desigLineas, x, ty);
      ty += desigLineas.length * LINE_H;
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

  // ---- Resumen de pago (izquierda) + Forma de pago (derecha) ----
  const totalSinIva = f.lineas.reduce((s, l) => s + (l.es_incluido ? 0 : l.total_sin_iva), 0);
  const totalConIva = f.lineas.reduce((s, l) => s + (l.es_incluido ? 0 : l.total_con_iva), 0);

  const gapCol = 6;
  const anchoCol = (anchoContenido - gapCol) / 2;
  const xColIzq = margen;
  const xColDer = margen + anchoCol + gapCol;
  const yInicioColumnas = y;

  const tieneAcomptes = acomptesPrevios.length > 0;
  doc.setDrawColor(...GRIS_BORDE);

  // Si la factura ya incluye la línea de deducción de anticipos (ver lineaDeduccionAcomptes /
  // FacturaForm.tsx), f.lineas y por tanto totalConIva/totalSinIva YA son el resto a pagar neto —
  // no hay que volver a restar los acomptes, solo sumarlos de vuelta para mostrar el total original
  // del proyecto como referencia. Si por algún motivo la línea no está (factura antigua o creada a
  // mano sin pasar por el formulario), se mantiene el cálculo anterior por restar como fallback.
  const textoDeduccion = idioma === 'fr' ? 'Déduction acompte(s)' : 'Deducción de anticipo(s)';
  const tieneLineaDeduccion = f.lineas.some((l) => l.designacion === textoDeduccion);

  let yIzq: number;
  if (tieneAcomptes) {
    const acomptesTotalTtc = acomptesPrevios.reduce((s, a) => s + a.total, 0);
    const resteTtc = tieneLineaDeduccion ? totalConIva : totalConIva - acomptesTotalTtc;
    const totalOriginalTtc = tieneLineaDeduccion ? totalConIva + acomptesTotalTtc : totalConIva;
    const pctIva = porcentajeIva(f.tipo_iva);
    const resteHt = pctIva > 0 ? resteTtc / (1 + pctIva / 100) : resteTtc;
    const resteTva = resteTtc - resteHt;
    const filas = 2 + 1 + acomptesPrevios.length + 2 + 1 + 1;
    const altoResumen = 8 + filas * 5;

    doc.setFillColor(...colorClaroRgb);
    doc.roundedRect(xColIzq, y, anchoCol, altoResumen, 2, 2, 'FD');
    let yy = y + 6;
    const fila = (label: string, valor: string, opts?: { bold?: boolean; small?: boolean; indent?: boolean; color?: [number, number, number] }) => {
      doc.setFont(FUENTE_PDF, opts?.bold ? 'bold' : 'normal');
      doc.setFontSize(opts?.small ? 7.5 : 9);
      doc.setTextColor(...(opts?.color ?? GRIS_TEXTO));
      doc.text(label, xColIzq + 4 + (opts?.indent ? 3 : 0), yy);
      doc.text(valor, xColIzq + anchoCol - 4, yy, { align: 'right' });
      yy += 5;
    };
    fila(idioma === 'fr' ? 'Total HT' : 'Total base', `${(pctIva > 0 ? totalOriginalTtc / (1 + pctIva / 100) : totalOriginalTtc).toFixed(2)} €`);
    fila(idioma === 'fr' ? 'Total TTC' : 'Total con IVA', `${totalOriginalTtc.toFixed(2)} €`);
    fila(idioma === 'fr' ? 'Acomptes versés' : 'Anticipos cobrados', `${acomptesTotalTtc.toFixed(2)} €`);
    for (const a of acomptesPrevios) {
      fila(a.numero ?? '—', `${a.total.toFixed(2)} €`, { small: true, indent: true });
    }
    fila(idioma === 'fr' ? 'Reste à payer HT' : 'Resto a pagar (base)', `${resteHt.toFixed(2)} €`);
    fila(t.iva, `${resteTva.toFixed(2)} €`);
    fila(`${idioma === 'fr' ? 'Dont' : 'De los cuales'} ${pctIva}%`, `${resteTva.toFixed(2)} €`, { small: true, indent: true });
    doc.line(xColIzq + 4, yy - 2, xColIzq + anchoCol - 4, yy - 2);
    fila(idioma === 'fr' ? 'Reste à payer TTC' : 'Resto a pagar', `${resteTtc.toFixed(2)} €`, { bold: true, color: colorRgb });
    yIzq = y + altoResumen + 5;
  } else {
    doc.setFillColor(...colorClaroRgb);
    doc.roundedRect(xColIzq, y, anchoCol, 26, 2, 2, 'FD');
    doc.setFont(FUENTE_PDF, 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...GRIS_TEXTO);
    doc.text(t.totalSinIva, xColIzq + 4, y + 7);
    doc.text(`${totalSinIva.toFixed(2)} €`, xColIzq + anchoCol - 4, y + 7, { align: 'right' });
    doc.text(`${t.iva} (${porcentajeIva(f.tipo_iva)}%)`, xColIzq + 4, y + 13);
    doc.text(`${(totalConIva - totalSinIva).toFixed(2)} €`, xColIzq + anchoCol - 4, y + 13, { align: 'right' });
    doc.setDrawColor(...GRIS_BORDE);
    doc.line(xColIzq + 4, y + 16, xColIzq + anchoCol - 4, y + 16);
    doc.setFont(FUENTE_PDF, 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...colorRgb);
    doc.text(t.total, xColIzq + 4, y + 23);
    doc.text(`${totalConIva.toFixed(2)} €`, xColIzq + anchoCol - 4, y + 23, { align: 'right' });
    yIzq = y + 26 + 5;
  }

  const mencionIva = mencionIvaReducida(f.tipo_iva);
  if (mencionIva) {
    doc.setFont(FUENTE_PDF, 'italic');
    doc.setFontSize(7.5);
    doc.setTextColor(...GRIS_TEXTO);
    doc.text(mencionIva, xColIzq + anchoCol, yIzq, { align: 'right' });
    yIzq += 6;
  }

  // Derecha: condiciones de pago (encima) + forma de pago (titular / IBAN / BIC / banco)
  let yDer = yInicioColumnas;
  if (condicionesPago && (condicionesPago.delai || condicionesPago.penalizacion || condicionesPago.medio)) {
    const campos: [string, string][] = [];
    if (condicionesPago.delai) campos.push([idioma === 'fr' ? 'Délai de paiement' : 'Plazo de pago', condicionesPago.delai]);
    if (condicionesPago.penalizacion) campos.push([idioma === 'fr' ? 'Pénalité de retard' : 'Penalización por retraso', condicionesPago.penalizacion]);
    if (condicionesPago.medio) campos.push([idioma === 'fr' ? 'Moyens de paiement' : 'Medio de pago', condicionesPago.medio]);
    const altoCond = 9 + campos.length * 9;

    // Igual que el bloque de "Seguro y garantía" más abajo: si no cabe entero en lo que queda de
    // página, se pasa a una nueva en vez de dejarlo pintado a caballo con el pie de página fijo.
    if (yDer + altoCond > 270) {
      doc.addPage();
      yDer = 20;
    }

    doc.setFillColor(...colorClaroRgb);
    doc.setDrawColor(...GRIS_BORDE);
    doc.roundedRect(xColDer, yDer, anchoCol, altoCond, 2, 2, 'FD');
    doc.setFont(FUENTE_PDF, 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...colorRgb);
    doc.text(idioma === 'fr' ? 'Conditions de paiement' : 'Condiciones de pago', xColDer + 4, yDer + 7);
    let yyCond = yDer + 13;
    for (const [label, valor] of campos) {
      doc.setFont(FUENTE_PDF, 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(30, 30, 30);
      doc.text(label, xColDer + 4, yyCond);
      yyCond += 4;
      doc.setFont(FUENTE_PDF, 'normal');
      doc.setTextColor(...GRIS_TEXTO);
      doc.text(valor, xColDer + 4, yyCond);
      yyCond += 5;
    }
    yDer += altoCond + 8;
  }
  if (entidad.iban) {
    const camposBanco = [
      entidad.nombre_titular && `${t.titular}: ${entidad.nombre_titular}`,
      `IBAN: ${entidad.iban}`,
      entidad.bic && `BIC: ${entidad.bic}`,
      entidad.banco && `${t.banco}: ${entidad.banco}`,
    ].filter(Boolean) as string[];
    const altoForma = 10 + camposBanco.length * 5;

    if (yDer + altoForma > 270) {
      doc.addPage();
      yDer = 20;
    }

    doc.setFillColor(...colorClaroRgb);
    doc.setDrawColor(...GRIS_BORDE);
    doc.roundedRect(xColDer, yDer, anchoCol, altoForma, 2, 2, 'FD');
    doc.setFont(FUENTE_PDF, 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...colorRgb);
    doc.text(t.formaPago, xColDer + 4, yDer + 7);
    doc.setFont(FUENTE_PDF, 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(30, 30, 30);
    camposBanco.forEach((campo, i) => {
      doc.text(campo, xColDer + 4, yDer + 13 + i * 5);
    });
    yDer += altoForma + 8;
  }

  y = Math.max(yIzq, yDer) + 2;

  // ---- Seguro y garantía ----
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
  if (f.nota) {
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
    for (const bloque of parsearTextoEnriquecido(f.nota)) {
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

  // ---- Notas legales ----
  const notas = notasLegales(idioma, f.tipo_iva);
  if (notas.length > 0) {
    if (y > 260) {
      doc.addPage();
      y = 20;
    }
    doc.setFont(FUENTE_PDF, 'italic');
    doc.setFontSize(8);
    doc.setTextColor(...GRIS_TEXTO);
    for (const nota of notas) {
      const lineas = doc.splitTextToSize(nota, anchoContenido);
      doc.text(lineas, margen, y);
      y += lineas.length * 4.5 + 2;
    }
  }

  // ---- Datos de la empresa (movidos fuera de la cabecera) ----
  // En minimalista ya se muestran en la tarjeta "Emisor", así que este bloque se omite.
  if (plantilla !== 'minimalista') {
    if (y > 265) {
      doc.addPage();
      y = 20;
    }
    doc.setDrawColor(...GRIS_BORDE);
    doc.line(margen, y, 210 - margen, y);
    y += 5;
    doc.setFont(FUENTE_PDF, 'bold');
    doc.setFontSize(9);
    doc.setTextColor(60, 60, 60);
    doc.text(entidad.razon_social || 'Reformas Ordoñez', 105, y, { align: 'center' });
    y += 4.5;
    doc.setFont(FUENTE_PDF, 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...GRIS_TEXTO);
    if (lineaContacto) {
      doc.text(lineaContacto, 105, y, { align: 'center' });
      y += 4.5;
    }
    if (lineaFiscal) {
      doc.text(lineaFiscal, 105, y, { align: 'center' });
      y += 4.5;
    }
    y += 4;
  }

  // Mensaje de agradecimiento — se pinta como pie de página fijo en cada página (ver más abajo),
  // tanto en la de la factura como en la de términos y condiciones.
  const mensajeGracias = idioma === 'fr' ? config?.mensaje_gracias_fr : config?.mensaje_gracias_es;

  // ---- Pie de página personalizado ----
  if (configPlantilla.piePagina) {
    if (y > 270) {
      doc.addPage();
      y = 20;
    }
    doc.setFont(FUENTE_PDF, 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...GRIS_TEXTO);
    doc.text(doc.splitTextToSize(configPlantilla.piePagina, anchoContenido), 105, y, { align: 'center' });
  }

  // ---- Términos y condiciones ----
  const tcCrudo = idioma === 'fr' ? config?.tc_fr : config?.tc_es;
  if (tcCrudo) {
    const tc = renderizarTC(tcCrudo, undefined, idioma);
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
  for (let i = 1; i <= totalPaginas; i++) {
    doc.setPage(i);
    if (mensajeGracias) {
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

  return { doc };
}
