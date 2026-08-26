import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { GRIS_BORDE, cabeceraDocumento, piePagina } from './pdfEmpresa';
import { registrarFuentePoppins, FUENTE_PDF } from './fuentePdf';
import { fechaVisitaCorta } from './fechas';

function fmt(n: number) {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n);
}

function finalY(doc: jsPDF): number {
  return (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
}

type FichaClienteData = {
  nombre: string;
  apellidos: string;
  telefono: string;
  email: string | null;
  zona: string | null;
  pais: string | null;
  clienteDesde: string | null;
  etapaPipeline: string | null;
  etiquetas: string[];
  visitas: {
    fecha: string | null;
    hora: string | null;
    tipo: string | null;
    estado: string | null;
  }[];
  presupuestos: { numero: string | null; fecha: string | null; estado: string; total: number }[];
  facturas: { numero: string | null; fecha: string | null; estado: string; total: number }[];
  totalFacturado: number;
  notas: { fecha: string; texto: string; autor: string }[];
};

// Resumen imprimible de una ficha de cliente para consulta rápida fuera del CRM (reunión, llamada
// desde el coche, etc.) — antes no había forma de sacar la ficha de la pantalla (mejora real,
// auditoría de Clientes 2026-08-18). Documento interno, no una comunicación al cliente.
export async function generarPdfFichaCliente(d: FichaClienteData): Promise<void> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  await registrarFuentePoppins(doc);
  const { colorRgb, margen } = await cabeceraDocumento(
    doc,
    `FICHA DE CLIENTE — ${d.nombre} ${d.apellidos}`.toUpperCase(),
  );

  let y = 38;
  doc.setFont(FUENTE_PDF, 'normal');
  doc.setFontSize(9);
  doc.setTextColor(60, 60, 60);
  const datos = [
    `Teléfono: ${d.telefono}`,
    `Email: ${d.email ?? '—'}`,
    `Zona: ${d.zona ?? '—'} · ${d.pais ?? '—'}`,
    `Cliente desde: ${d.clienteDesde ? fechaVisitaCorta(d.clienteDesde) : '—'}`,
    `Etapa pipeline: ${d.etapaPipeline ?? '—'}`,
    `Total facturado: ${fmt(d.totalFacturado)}`,
  ];
  for (const linea of datos) {
    doc.text(linea, margen, y);
    y += 5.5;
  }
  if (d.etiquetas.length > 0) {
    doc.text(`Etiquetas: ${d.etiquetas.join(', ')}`, margen, y);
    y += 5.5;
  }
  y += 4;

  const columnasImporte = { 3: { halign: 'right' as const, cellWidth: 28 } };

  if (d.visitas.length > 0) {
    autoTable(doc, {
      startY: y,
      margin: { left: margen, right: margen },
      head: [['Visitas', 'Hora', 'Tipo', 'Estado']],
      body: d.visitas.map((v) => [
        v.fecha ? fechaVisitaCorta(v.fecha) : '—',
        v.hora?.slice(0, 5) ?? '—',
        v.tipo ?? '—',
        v.estado ?? '—',
      ]),
      styles: { font: FUENTE_PDF, fontSize: 8, lineColor: GRIS_BORDE, lineWidth: 0.1 },
      headStyles: { fillColor: colorRgb, textColor: 255, fontStyle: 'bold', fontSize: 8.5 },
    });
    y = finalY(doc) + 8;
  }

  if (d.presupuestos.length > 0) {
    autoTable(doc, {
      startY: y,
      margin: { left: margen, right: margen },
      head: [['Presupuesto', 'Fecha', 'Estado', 'Total']],
      body: d.presupuestos.map((p) => [
        p.numero ?? '—',
        p.fecha ? fechaVisitaCorta(p.fecha) : '—',
        p.estado,
        fmt(p.total),
      ]),
      styles: { font: FUENTE_PDF, fontSize: 8, lineColor: GRIS_BORDE, lineWidth: 0.1 },
      headStyles: { fillColor: colorRgb, textColor: 255, fontStyle: 'bold', fontSize: 8.5 },
      columnStyles: columnasImporte,
    });
    y = finalY(doc) + 8;
  }

  if (d.facturas.length > 0) {
    autoTable(doc, {
      startY: y,
      margin: { left: margen, right: margen },
      head: [['Factura', 'Fecha', 'Estado', 'Total']],
      body: d.facturas.map((f) => [
        f.numero ?? '—',
        f.fecha ? fechaVisitaCorta(f.fecha) : '—',
        f.estado,
        fmt(f.total),
      ]),
      styles: { font: FUENTE_PDF, fontSize: 8, lineColor: GRIS_BORDE, lineWidth: 0.1 },
      headStyles: { fillColor: colorRgb, textColor: 255, fontStyle: 'bold', fontSize: 8.5 },
      columnStyles: columnasImporte,
    });
    y = finalY(doc) + 8;
  }

  if (d.notas.length > 0) {
    if (y > 250) {
      doc.addPage();
      y = 20;
    }
    autoTable(doc, {
      startY: y,
      margin: { left: margen, right: margen },
      head: [['Notas recientes', '']],
      body: d.notas.slice(0, 15).map((n) => [`${fechaVisitaCorta(n.fecha)} · ${n.autor}`, n.texto]),
      styles: { font: FUENTE_PDF, fontSize: 8, lineColor: GRIS_BORDE, lineWidth: 0.1 },
      headStyles: { fillColor: colorRgb, textColor: 255, fontStyle: 'bold', fontSize: 8.5 },
      columnStyles: { 0: { cellWidth: 40 } },
    });
  }

  piePagina(
    doc,
    margen,
    'Documento interno generado desde el CRM — no es una comunicación oficial al cliente.',
  );

  doc.save(`ficha-cliente-${d.nombre}-${d.apellidos}.pdf`.replace(/\s+/g, '-').toLowerCase());
}
