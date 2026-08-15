import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { GRIS_BORDE, GRIS_TEXTO } from './pdfEmpresa';
import { parsearTextoEnriquecido, estiloFuente } from './textoEnriquecido';
import { formatearUnidadTexto } from '../modules/finanzas/lineas';
import { fechaPlanning } from './fechas';
import { FUENTE_PDF } from './fuentePdf';

export type FaseObraCronograma = {
  nombre: string;
  descripcion: string | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  completada: boolean;
  seccion?: string | null;
};

export type SeccionCronograma = {
  nombre: string;
  fases: FaseObraCronograma[];
  inicio: string | null;
  fin: string | null;
  dias: number | null;
};

export function diasEntreFechas(a: string, b: string): number {
  const d1 = new Date(`${a}T00:00:00`);
  const d2 = new Date(`${b}T00:00:00`);
  return Math.round((d2.getTime() - d1.getTime()) / 86_400_000);
}

/** Agrupa las fases por el campo libre `seccion` — conserva el orden de primera aparición de
 * cada nombre. Las fases sin sección quedan en grupo(s) sin nombre (`nombre: ''`), que se
 * dibujan sin cabecera de grupo — así un planning que nunca usó secciones se ve igual que antes. */
export function agruparPorSeccion(fases: FaseObraCronograma[]): SeccionCronograma[] {
  const orden: string[] = [];
  const mapa = new Map<string, FaseObraCronograma[]>();
  for (const f of fases) {
    const clave = f.seccion?.trim() || '';
    if (!mapa.has(clave)) {
      mapa.set(clave, []);
      orden.push(clave);
    }
    mapa.get(clave)!.push(f);
  }
  return orden.map((clave) => {
    const grupo = mapa.get(clave)!;
    const conFechas = grupo.filter((f) => f.fecha_inicio && f.fecha_fin);
    const inicio = conFechas.length
      ? conFechas.reduce((min, f) => (f.fecha_inicio! < min ? f.fecha_inicio! : min), conFechas[0].fecha_inicio!)
      : null;
    const fin = conFechas.length
      ? conFechas.reduce((max, f) => (f.fecha_fin! > max ? f.fecha_fin! : max), conFechas[0].fecha_fin!)
      : null;
    const dias = inicio && fin ? Math.max(diasEntreFechas(inicio, fin), 1) : null;
    return { nombre: clave, fases: grupo, inicio, fin, dias };
  });
}

export type RangoProyecto = { inicio: string | null; fin: string | null; dias: number | null };

/** Rango de fechas (inicio del primero, fin del último) y duración total del proyecto, a partir
 * de las fases con fecha — la misma cifra de "días en total" que ya se mostraba en las tarjetas. */
export function rangoProyecto(fases: FaseObraCronograma[]): RangoProyecto {
  const conFechas = fases.filter((f) => f.fecha_inicio && f.fecha_fin);
  if (conFechas.length === 0) return { inicio: null, fin: null, dias: null };
  const inicio = conFechas.reduce((min, f) => (f.fecha_inicio! < min ? f.fecha_inicio! : min), conFechas[0].fecha_inicio!);
  const fin = conFechas.reduce((max, f) => (f.fecha_fin! > max ? f.fecha_fin! : max), conFechas[0].fecha_fin!);
  return { inicio, fin, dias: Math.max(diasEntreFechas(inicio, fin), 1) };
}

export type TextosCronograma = {
  cronograma: string;
  hoy: string;
  pendiente: string;
  completada: string;
  fase: string;
  descripcion: string;
  inicio: string;
  fin: string;
  duracion: string;
  estado: string;
  dias: string;
};

export const TEXTOS_CRONOGRAMA: Record<'es' | 'fr', TextosCronograma> = {
  es: {
    cronograma: 'Cronograma',
    hoy: 'Hoy',
    pendiente: 'Pendiente',
    completada: 'Completada',
    fase: 'Fase',
    descripcion: 'Descripción',
    inicio: 'Inicio',
    fin: 'Fin',
    duracion: 'Duración',
    estado: 'Estado',
    dias: 'días',
  },
  fr: {
    cronograma: 'Planning',
    hoy: "Aujourd'hui",
    pendiente: 'En attente',
    completada: 'Terminée',
    fase: 'Phase',
    descripcion: 'Description',
    inicio: 'Début',
    fin: 'Fin',
    duracion: 'Durée',
    estado: 'État',
    dias: 'jours',
  },
};

export type TextosPlanning = {
  titulo: string;
  cliente: string;
  obra: string;
  presupuesto: string;
  inicio: string;
  finPrevisto: string;
  proyectoLabel: string;
  empresaLabel: string;
  descripcionPortada: string;
  pagina: string;
};

export const TEXTOS_PLANNING: Record<'es' | 'fr', TextosPlanning> = {
  es: {
    titulo: 'PLANNING DE OBRA',
    cliente: 'CLIENTE',
    obra: 'OBRA',
    presupuesto: 'PRESUPUESTO',
    inicio: 'Inicio',
    finPrevisto: 'Fin previsto',
    proyectoLabel: 'OBRA',
    empresaLabel: 'EMPRESA',
    descripcionPortada: 'Planning con las fases, fechas y cronograma previstos para la obra.',
    pagina: 'Página',
  },
  fr: {
    titulo: 'PLANNING DE TRAVAUX',
    cliente: 'CLIENT',
    obra: 'CHANTIER',
    presupuesto: 'DEVIS',
    inicio: 'Début',
    finPrevisto: 'Fin prévue',
    proyectoLabel: 'PROJET',
    empresaLabel: 'ENTREPRISE',
    descripcionPortada: 'Planning avec les phases, dates et calendrier prévus pour le chantier.',
    pagina: 'Page',
  },
};

const ESTADO_PROYECTO_FR: Record<string, string> = {
  Planificado: 'Planifié',
  'En curso': 'En cours',
  Pausado: 'En pause',
  Finalizado: 'Terminé',
};

/** Traduce el estado del proyecto (Planificado/En curso/Pausado/Finalizado) al francés cuando el
 * planning es de un cliente francés — igual que ESTADO_FR ya hace para presupuestos y facturas. */
export function estadoProyectoTexto(estado: string, idioma: 'es' | 'fr'): string {
  return idioma === 'fr' ? (ESTADO_PROYECTO_FR[estado] ?? estado) : estado;
}

type RGB = [number, number, number];

type OpcionesCronograma = {
  margen: number;
  anchoContenido: number;
  y: number;
  fases: FaseObraCronograma[];
  idioma: 'es' | 'fr';
  colorRgb: RGB;
  colorClaroRgb: RGB;
  colorPendienteRgb: RGB;
  tablaConfig: { lineas: boolean; filasIntercaladas: boolean; encabezadoColoreado: boolean };
  mostrarGantt: boolean;
  mostrarTabla: boolean;
  /** Dibuja el subtítulo "Cronograma"/"Planning" encima del Gantt — no en el dossier, que ya
   * tiene el título de página justo encima. */
  tituloCronograma?: boolean;
};

/** Dibuja el Gantt y la tabla de fases de un planning de obra, agrupando por `seccion` cuando la
 * fase la tiene (con una fila de cabecera con el nombre y la duración del grupo) y dejando las
 * fases sin sección tal cual, sin cabecera — usado tanto por el planning suelto como por el
 * dossier de obra para no mantener dos copias de este dibujo. */
export function dibujarGanttYFases(doc: jsPDF, opts: OpcionesCronograma): void {
  const { margen, anchoContenido, fases, idioma, colorRgb, colorClaroRgb, colorPendienteRgb, tablaConfig, mostrarGantt, mostrarTabla } = opts;
  let y = opts.y;
  const t = TEXTOS_CRONOGRAMA[idioma];
  const grupos = agruparPorSeccion(fases);

  const fasesConFechas = fases.filter((f) => f.fecha_inicio && f.fecha_fin);
  const inicioProyecto = fasesConFechas.length
    ? fasesConFechas.reduce((min, f) => (f.fecha_inicio! < min ? f.fecha_inicio! : min), fasesConFechas[0].fecha_inicio!)
    : '';
  const finProyecto = fasesConFechas.length
    ? fasesConFechas.reduce((max, f) => (f.fecha_fin! > max ? f.fecha_fin! : max), fasesConFechas[0].fecha_fin!)
    : '';
  const totalDias = fasesConFechas.length > 0 ? Math.max(diasEntreFechas(inicioProyecto, finProyecto), 1) : 1;
  const hoyISO = new Date().toISOString().slice(0, 10);
  const hoyEnRango = fasesConFechas.length > 0 && hoyISO >= inicioProyecto && hoyISO <= finProyecto;
  const pctHoy = hoyEnRango ? (diasEntreFechas(inicioProyecto, hoyISO) / totalDias) * 100 : 0;

  if (mostrarGantt && fasesConFechas.length > 0) {
    if (y > 230) {
      doc.addPage();
      y = 20;
    }
    if (opts.tituloCronograma) {
      doc.setFont(FUENTE_PDF, 'bold');
      doc.setFontSize(9);
      doc.setTextColor(30, 30, 30);
      doc.text(t.cronograma, margen, y);
    }

    // Leyenda, de derecha a izquierda: Hoy (si aplica) · Pendiente · Completada
    doc.setFont(FUENTE_PDF, 'normal');
    doc.setFontSize(7);
    let xLeyenda = margen + anchoContenido;
    const dibujarLeyenda = (texto: string, color: RGB | null) => {
      xLeyenda -= doc.getTextWidth(texto);
      doc.setTextColor(90, 90, 90);
      doc.text(texto, xLeyenda, y);
      xLeyenda -= 4;
      if (color) {
        doc.setFillColor(...color);
        doc.rect(xLeyenda, y - 2.4, 2.4, 2.4, 'F');
        xLeyenda -= 4;
      }
    };
    if (hoyEnRango) dibujarLeyenda(t.hoy, null);
    dibujarLeyenda(t.pendiente, colorPendienteRgb);
    dibujarLeyenda(t.completada, colorRgb);

    y += 5;

    const anchoBarra = anchoContenido - 45 - 30;
    const xBarra = margen + 45;

    for (const grupo of grupos) {
      const fasesGrupo = grupo.fases.filter((f) => f.fecha_inicio && f.fecha_fin);
      if (fasesGrupo.length === 0) continue;
      if (grupo.nombre) {
        if (y + 7 > 270) {
          doc.addPage();
          y = 20;
        }
        doc.setFont(FUENTE_PDF, 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(...colorRgb);
        doc.text(`${grupo.nombre.toUpperCase()}  —  ${grupo.dias} ${t.dias}`, margen, y + 3);
        y += 6;
      }
      for (const fase of fasesGrupo) {
        // Sin este chequeo por fila, con muchas fases las últimas se dibujaban fuera del área
        // visible de la página en vez de saltar a una nueva (bug real corregido en el original).
        if (y + 7 > 270) {
          doc.addPage();
          y = 20;
        }
        const offsetDias = diasEntreFechas(inicioProyecto, fase.fecha_inicio!);
        const duracionDias = Math.max(diasEntreFechas(fase.fecha_inicio!, fase.fecha_fin!), 1);
        const width = Math.max((duracionDias / totalDias) * anchoBarra, 2);
        // Sin este ajuste, una fase que empieza en el último día del proyecto (offset = totalDias,
        // p.ej. la recepción de obra) queda con `left` ya en el borde derecho de la pista, y el
        // ancho mínimo de 2mm se dibuja hacia fuera de la pista, invadiendo el texto de fechas de
        // al lado (bug real reportado 2026-08-14). Se desplaza `left` hacia la izquierda lo justo
        // para que la barra quepa entera dentro de la pista, sin recortar su ancho.
        const left = Math.min(xBarra + (offsetDias / totalDias) * anchoBarra, xBarra + anchoBarra - width);

        doc.setFont(FUENTE_PDF, 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(60, 60, 60);
        doc.text(doc.splitTextToSize(fase.nombre, 42), margen, y + 3);

        const colorBarra = fase.completada ? colorRgb : colorPendienteRgb;
        doc.setFillColor(...colorClaroRgb);
        doc.rect(xBarra, y, anchoBarra, 4, 'F');
        doc.setFillColor(...colorBarra);
        doc.rect(left, y, width, 4, 'F');

        if (hoyEnRango) {
          doc.setDrawColor(30, 30, 30);
          doc.setLineWidth(0.25);
          const xHoy = xBarra + (pctHoy / 100) * anchoBarra;
          doc.line(xHoy, y, xHoy, y + 4);
        }

        doc.setFont(FUENTE_PDF, 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(...GRIS_TEXTO);
        doc.text(`${fechaPlanning(fase.fecha_inicio, idioma)} – ${fechaPlanning(fase.fecha_fin, idioma)}`, xBarra + anchoBarra + 2, y + 3);

        y += 7;
      }
    }
    y += 6;
  }

  if (y > 250) {
    doc.addPage();
    y = 20;
  }

  if (mostrarTabla) {
    const ANCHO_FASE = 26;
    const ANCHO_DESCRIPCION_FASE = 50;
    const ANCHO_FECHA_FASE = 24;
    const ANCHO_DURACION_FASE = 20;
    const anchoTextoDescripcionFase = ANCHO_DESCRIPCION_FASE - 3;
    const NUM_COLUMNAS = 6;

    type FilaTabla = { tipo: 'seccion'; nombre: string; dias: number | null } | { tipo: 'fase'; fase: FaseObraCronograma };
    const filas: FilaTabla[] = [];
    for (const grupo of grupos) {
      if (grupo.nombre) filas.push({ tipo: 'seccion', nombre: grupo.nombre, dias: grupo.dias });
      for (const fase of grupo.fases) filas.push({ tipo: 'fase', fase });
    }

    autoTable(doc, {
      startY: y,
      margin: { left: margen, right: margen },
      head: [[t.fase, t.descripcion, t.inicio, t.fin, t.duracion, t.estado]],
      body: filas.map((fila) => {
        if (fila.tipo === 'seccion') {
          return [
            {
              content: `${fila.nombre.toUpperCase()}${fila.dias != null ? `  —  ${fila.dias} ${t.dias}` : ''}`,
              colSpan: NUM_COLUMNAS,
              styles: { fontStyle: 'bold' as const, fillColor: colorClaroRgb, textColor: colorRgb },
            },
          ];
        }
        const f = fila.fase;
        return [
          f.nombre,
          '',
          f.fecha_inicio ? fechaPlanning(f.fecha_inicio, idioma) : '—',
          f.fecha_fin ? fechaPlanning(f.fecha_fin, idioma) : '—',
          f.fecha_inicio && f.fecha_fin ? `${diasEntreFechas(f.fecha_inicio, f.fecha_fin)} ${t.dias}` : '—',
          f.completada ? t.completada : t.pendiente,
        ];
      }),
      styles: { font: FUENTE_PDF, lineWidth: tablaConfig.lineas ? 0.1 : 0, lineColor: GRIS_BORDE, valign: 'top' },
      headStyles: tablaConfig.encabezadoColoreado
        ? { fillColor: colorRgb, textColor: 255, fontStyle: 'bold', fontSize: 8.5 }
        : { fillColor: [255, 255, 255], textColor: GRIS_TEXTO, fontStyle: 'bold', fontSize: 8.5, lineWidth: 0.3, lineColor: [17, 24, 39] },
      bodyStyles: { fontSize: 8.5, textColor: [30, 30, 30] },
      ...(tablaConfig.filasIntercaladas ? { alternateRowStyles: { fillColor: colorClaroRgb } } : {}),
      columnStyles: {
        0: { cellWidth: ANCHO_FASE },
        1: { cellWidth: ANCHO_DESCRIPCION_FASE },
        2: { cellWidth: ANCHO_FECHA_FASE },
        3: { cellWidth: ANCHO_FECHA_FASE },
        4: { cellWidth: ANCHO_DURACION_FASE },
      },
      didParseCell: (data) => {
        if (data.section !== 'body' || data.column.index !== 1) return;
        const fila = filas[data.row.index];
        if (!fila || fila.tipo !== 'fase') return;
        const f = fila.fase;
        let lineas = 0;
        for (const bloque of parsearTextoEnriquecido(formatearUnidadTexto(f.descripcion ?? ''))) {
          lineas += doc.splitTextToSize(bloque.texto, anchoTextoDescripcionFase - (bloque.tipo === 'lista' ? 2 : 0)).length;
        }
        data.cell.text = new Array(Math.max(lineas, 1)).fill('');
      },
      didDrawCell: (data) => {
        if (data.section !== 'body' || data.column.index !== 1) return;
        const fila = filas[data.row.index];
        if (!fila || fila.tipo !== 'fase') return;
        const f = fila.fase;
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
}
