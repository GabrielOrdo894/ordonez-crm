import { totalPaginasPdf } from './pdfEmpresa';
import { FUENTE_PDF } from './fuentePdf';
import { construirPdfPlanning } from './generarPdfPlanning';
import type { FaseObraCronograma } from './planningCronograma';

/** Traducción interna de un planning (Edge Function `traducir-planning`), guardada en
 * `proyectos.traduccion` — solo el texto libre (nombre de la obra, nombre/descripción/sección de
 * cada fase), nunca fechas ni el estado de completada. Mismo patrón que `TraduccionPresupuesto`. */
export type TraduccionPlanning = {
  idioma: string;
  nombre_obra: string;
  fases: FaseObraCronograma[];
  generado_en: string;
};

type DatosPlanningTraducido = {
  clienteNombre: string;
  clienteTelefono: string;
  clienteDir: string;
  pais: string;
  estado: string;
  fechaInicio: string | null;
  presupuestoNumero: string | null;
  presupuestoFecha: string | null;
  presupuestoTotal: number | null;
  traduccion: TraduccionPlanning;
};

async function construirPdfPlanningTraducido(datos: DatosPlanningTraducido) {
  const idioma = datos.traduccion.idioma === 'Français' ? 'fr' : 'es';
  const doc = await construirPdfPlanning({
    clienteNombre: datos.clienteNombre,
    clienteTelefono: datos.clienteTelefono,
    clienteDir: datos.clienteDir,
    pais: datos.pais,
    idioma,
    nombreObra: datos.traduccion.nombre_obra,
    estado: datos.estado,
    fechaInicio: datos.fechaInicio,
    presupuestoNumero: datos.presupuestoNumero,
    presupuestoFecha: datos.presupuestoFecha,
    presupuestoTotal: datos.presupuestoTotal,
    fases: datos.traduccion.fases,
  });

  const AVISO = 'TRADUCCIÓN INTERNA — NO VÁLIDA COMO DOCUMENTO OFICIAL  ·  TRADUCTION INTERNE — NON VALABLE COMME DOCUMENT OFFICIEL';
  const totalPaginas = totalPaginasPdf(doc);
  for (let i = 1; i <= totalPaginas; i++) {
    doc.setPage(i);
    doc.setFillColor(217, 119, 6);
    doc.rect(0, 0, 210, 5, 'F');
    doc.setFont(FUENTE_PDF, 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(255, 255, 255);
    doc.text(AVISO, 105, 3.3, { align: 'center' });
  }

  return doc;
}

export async function generarPdfPlanningTraducido(datos: DatosPlanningTraducido) {
  const doc = await construirPdfPlanningTraducido(datos);
  const sufijoIdioma = datos.traduccion.idioma === 'Français' ? 'fr' : 'es';
  doc.save(`planning_${datos.traduccion.nombre_obra.replace(/\s+/g, '_')}_traduccion_${sufijoIdioma}.pdf`);
}

/** Igual que `generarPdfPlanningTraducido` pero abre el PDF en una pestaña nueva en vez de
 * descargarlo — para el botón "Ver PDF traducido" de la vista previa del planning. */
export async function verPdfPlanningTraducido(datos: DatosPlanningTraducido) {
  const doc = await construirPdfPlanningTraducido(datos);
  const blob = doc.output('blob');
  window.open(URL.createObjectURL(blob), '_blank');
}
