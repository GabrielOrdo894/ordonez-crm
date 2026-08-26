import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { GRIS_BORDE, GRIS_TEXTO } from './pdfEmpresa';
import { parsearTextoEnriquecido, estiloFuente, type BloqueTexto } from './textoEnriquecido';
import { formatearUnidadTexto } from '../modules/finanzas/lineas';
import { fechaPlanning, fechaPlanningCorta } from './fechas';
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

/** Cuenta los días contando el primero y el último — de lunes a jueves son 4 días (lunes, martes,
 * miércoles, jueves), no 3 (feedback real 2026-08-18). Para toda "duración" que se muestra al
 * usuario (fase, sección, proyecto). `diasEntreFechas` se queda tal cual porque además se usa para
 * calcular offsets/anchos proporcionales en el Gantt, donde la diferencia simple sí es la cuenta
 * correcta — solo se cambia dónde se pinta un número de días como duración. */
export function diasInclusive(a: string, b: string): number {
  return diasEntreFechas(a, b) + 1;
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
      ? conFechas.reduce(
          (min, f) => (f.fecha_inicio! < min ? f.fecha_inicio! : min),
          conFechas[0].fecha_inicio!,
        )
      : null;
    const fin = conFechas.length
      ? conFechas.reduce(
          (max, f) => (f.fecha_fin! > max ? f.fecha_fin! : max),
          conFechas[0].fecha_fin!,
        )
      : null;
    const dias = inicio && fin ? Math.max(diasInclusive(inicio, fin), 1) : null;
    return { nombre: clave, fases: grupo, inicio, fin, dias };
  });
}

export type RangoProyecto = { inicio: string | null; fin: string | null; dias: number | null };

/** Rango de fechas (inicio del primero, fin del último) y duración total del proyecto, a partir
 * de las fases con fecha — la misma cifra de "días en total" que ya se mostraba en las tarjetas. */
export function rangoProyecto(fases: FaseObraCronograma[]): RangoProyecto {
  const conFechas = fases.filter((f) => f.fecha_inicio && f.fecha_fin);
  if (conFechas.length === 0) return { inicio: null, fin: null, dias: null };
  const inicio = conFechas.reduce(
    (min, f) => (f.fecha_inicio! < min ? f.fecha_inicio! : min),
    conFechas[0].fecha_inicio!,
  );
  const fin = conFechas.reduce(
    (max, f) => (f.fecha_fin! > max ? f.fecha_fin! : max),
    conFechas[0].fecha_fin!,
  );
  return { inicio, fin, dias: Math.max(diasInclusive(inicio, fin), 1) };
}

export type TextosCronograma = {
  cronograma: string;
  hoy: string;
  pendiente: string;
  completada: string;
  retrasada: string;
  fasesLabel: string;
  completadoLabel: string;
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
    retrasada: 'Retrasada',
    fasesLabel: 'fases',
    completadoLabel: 'completado',
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
    retrasada: 'En retard',
    fasesLabel: 'phases',
    completadoLabel: 'terminé',
    fase: 'Phase',
    descripcion: 'Description',
    inicio: 'Début',
    fin: 'Fin',
    duracion: 'Durée',
    estado: 'État',
    dias: 'jours',
  },
};

/** Rouge d'alerte para fases retrasadas (fecha_fin ya pasada, sin completar) — distinto del verde
 * "completada" y del gris "pendiente", tanto en el Gantt como en la columna Estado de la tabla. */
export const COLOR_RETRASADA: [number, number, number] = [220, 38, 38];

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
  planPago: string;
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
    planPago: 'Plan de pago',
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
    planPago: 'Plan de paiement',
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
  const {
    margen,
    anchoContenido,
    fases,
    idioma,
    colorRgb,
    colorClaroRgb,
    colorPendienteRgb,
    tablaConfig,
    mostrarGantt,
    mostrarTabla,
  } = opts;
  let y = opts.y;
  const t = TEXTOS_CRONOGRAMA[idioma];
  const grupos = agruparPorSeccion(fases);

  const fasesConFechas = fases.filter((f) => f.fecha_inicio && f.fecha_fin);
  const inicioProyecto = fasesConFechas.length
    ? fasesConFechas.reduce(
        (min, f) => (f.fecha_inicio! < min ? f.fecha_inicio! : min),
        fasesConFechas[0].fecha_inicio!,
      )
    : '';
  const finProyecto = fasesConFechas.length
    ? fasesConFechas.reduce(
        (max, f) => (f.fecha_fin! > max ? f.fecha_fin! : max),
        fasesConFechas[0].fecha_fin!,
      )
    : '';
  const totalDias =
    fasesConFechas.length > 0 ? Math.max(diasInclusive(inicioProyecto, finProyecto), 1) : 1;
  const hoyISO = new Date().toISOString().slice(0, 10);
  const hoyEnRango = fasesConFechas.length > 0 && hoyISO >= inicioProyecto && hoyISO <= finProyecto;
  const pctHoy = hoyEnRango ? (diasEntreFechas(inicioProyecto, hoyISO) / totalDias) * 100 : 0;

  if (mostrarGantt && fasesConFechas.length > 0) {
    if (y > 230) {
      doc.addPage();
      y = 20;
    }
    const hayRetrasadas = fasesConFechas.some((f) => !f.completada && f.fecha_fin! < hoyISO);

    if (opts.tituloCronograma) {
      doc.setFont(FUENTE_PDF, 'bold');
      doc.setFontSize(9);
      doc.setTextColor(30, 30, 30);
      doc.text(t.cronograma, margen, y);
    }

    // % completado global — al lado del título si lo hay (planning suelto), o al margen si no
    // (dossier, que ya imprime su propio título de página justo encima).
    if (fases.length > 0) {
      const completadas = fases.filter((f) => f.completada).length;
      const pctCompletado = Math.round((completadas / fases.length) * 100);
      const xProgreso = opts.tituloCronograma
        ? margen + doc.getTextWidth(t.cronograma) + 6
        : margen;
      doc.setFont(FUENTE_PDF, 'normal');
      doc.setFontSize(7);
      doc.setTextColor(...GRIS_TEXTO);
      doc.text(
        `${completadas}/${fases.length} ${t.fasesLabel} · ${pctCompletado}% ${t.completadoLabel}`,
        xProgreso,
        y,
      );
    }

    // Leyenda, de derecha a izquierda: Hoy (si aplica) · Retrasada (si hay) · Pendiente · Completada
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
    if (hayRetrasadas) dibujarLeyenda(t.retrasada, COLOR_RETRASADA);

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
        const duracionDias = Math.max(diasInclusive(fase.fecha_inicio!, fase.fecha_fin!), 1);
        const width = Math.max((duracionDias / totalDias) * anchoBarra, 2);
        // Sin este ajuste, una fase que empieza en el último día del proyecto (offset = totalDias,
        // p.ej. la recepción de obra) queda con `left` ya en el borde derecho de la pista, y el
        // ancho mínimo de 2mm se dibuja hacia fuera de la pista, invadiendo el texto de fechas de
        // al lado (bug real reportado 2026-08-14). Se desplaza `left` hacia la izquierda lo justo
        // para que la barra quepa entera dentro de la pista, sin recortar su ancho.
        const left = Math.min(
          xBarra + (offsetDias / totalDias) * anchoBarra,
          xBarra + anchoBarra - width,
        );

        doc.setFont(FUENTE_PDF, 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(60, 60, 60);
        const lineasNombre = doc.splitTextToSize(fase.nombre, 42);
        doc.text(lineasNombre, margen, y + 3);

        const retrasada = !fase.completada && fase.fecha_fin! < hoyISO;
        const colorBarra = fase.completada
          ? colorRgb
          : retrasada
            ? COLOR_RETRASADA
            : colorPendienteRgb;
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

        // Formato corto (día/mes, sin año ni día de la semana): el hueco reservado tras la barra
        // es de solo ~30mm, y el formato largo de fechaPlanning ("2026-sept-07 (lun)") desbordaba
        // fuera de la página en cada fila (bug real reportado 2026-08-16 con captura).
        doc.setFont(FUENTE_PDF, 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(...GRIS_TEXTO);
        doc.text(
          `${fechaPlanningCorta(fase.fecha_inicio)} – ${fechaPlanningCorta(fase.fecha_fin)}`,
          xBarra + anchoBarra + 2,
          y + 3,
        );

        // Avanza según el nombre de fase más alto (1 o varias líneas) en vez de un fijo 7mm — un
        // nombre largo que se parte en 2+ líneas invadía la fila siguiente porque el avance no
        // contaba esas líneas extra (solapamiento real, mismo reporte del 2026-08-16).
        y += Math.max(7, lineasNombre.length * 3.3 + 4);
      }
    }
    y += 6;
  }

  if (y > 250) {
    doc.addPage();
    y = 20;
  }

  if (mostrarTabla) {
    const ANCHO_FASE = 30;
    const ANCHO_DESCRIPCION_FASE = 50;
    const ANCHO_FECHA_FASE = 24;
    const ANCHO_DURACION_FASE = 20;
    const ANCHO_ESTADO =
      anchoContenido -
      (ANCHO_FASE + ANCHO_DESCRIPCION_FASE + ANCHO_FECHA_FASE * 2 + ANCHO_DURACION_FASE);
    const anchoTextoDescripcionFase = ANCHO_DESCRIPCION_FASE - 3;
    const NUM_COLUMNAS = 6;
    // Debe coincidir con bodyStyles.fontSize y con el lineHeightFactor por defecto de
    // jspdf-autotable (1.15) — si no, el alto de fila que reserva autoTable (basado en
    // cell.text.length, ver didParseCell) y el avance real que pinta didDrawCell divergen fila a
    // fila hasta que el texto se sale de la celda.
    const FONT_SIZE_DESCRIPCION = 8.5;
    const LINE_H = FONT_SIZE_DESCRIPCION * 0.352778 * 1.15;
    const RADIO_ENCABEZADO = 1.8;
    // Gris neutro (igual que el resto de tablas del CRM, ver Table.tsx: odd:bg-gray-50) en vez del
    // verde clarito de antes — el tinte de marca en cada fila alterna se sentía recargado.
    const GRIS_FILA_ALTERNA: RGB = [249, 250, 251];

    type FilaTabla =
      | { tipo: 'seccion'; nombre: string; dias: number | null }
      | { tipo: 'fase'; fase: FaseObraCronograma };
    const filas: FilaTabla[] = [];
    for (const grupo of grupos) {
      if (grupo.nombre) filas.push({ tipo: 'seccion', nombre: grupo.nombre, dias: grupo.dias });
      for (const fase of grupo.fases) filas.push({ tipo: 'fase', fase });
    }

    const bloquesDescripcion = (descripcion: string | null) =>
      parsearTextoEnriquecido(formatearUnidadTexto(descripcion ?? ''));

    // Fija la misma fuente/tamaño que se usará al dibujar antes de medir el ancho de cada bloque —
    // splitTextToSize mide con la fuente activa del doc, así que medir con un tamaño distinto al
    // de dibujo (p.ej. el que quedó activo tras el Gantt) da un recuento de líneas equivocado.
    const lineasBloque = (bloque: BloqueTexto, ancho: number): string[] => {
      doc.setFont(FUENTE_PDF, estiloFuente(bloque.negrita, bloque.cursiva));
      doc.setFontSize(FONT_SIZE_DESCRIPCION);
      return doc.splitTextToSize(bloque.texto, ancho);
    };

    autoTable(doc, {
      startY: y,
      margin: { left: margen, right: margen },
      // La columna Descripción se dibuja a mano (didDrawCell más abajo, para soportar negrita/
      // listas), que no sabe partir su contenido a la mitad — con el 'auto' por defecto, una fila
      // que no cabe entera en lo que queda de página se parte en dos (jspdf-autotable troceando
      // cell.text) y la segunda mitad se dibuja con un row.index = -1 que no encaja en `filas`, así
      // que nuestro texto no se pinta ahí: la fila se veía cortada a la mitad en una página y en
      // blanco en la siguiente (bug real reportado 2026-08-17). 'avoid' obliga a mover la fila
      // entera a la página siguiente en vez de partirla.
      rowPageBreak: 'avoid',
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
        const retrasada = !f.completada && !!f.fecha_fin && f.fecha_fin < hoyISO;
        return [
          f.nombre,
          '',
          f.fecha_inicio ? fechaPlanning(f.fecha_inicio, idioma) : '—',
          f.fecha_fin ? fechaPlanning(f.fecha_fin, idioma) : '—',
          f.fecha_inicio && f.fecha_fin
            ? `${diasInclusive(f.fecha_inicio, f.fecha_fin)} ${t.dias}`
            : '—',
          f.completada
            ? t.completada
            : retrasada
              ? {
                  content: t.retrasada,
                  styles: { textColor: COLOR_RETRASADA, fontStyle: 'bold' as const },
                }
              : t.pendiente,
        ];
      }),
      styles: {
        font: FUENTE_PDF,
        lineWidth: tablaConfig.lineas ? 0.1 : 0,
        lineColor: GRIS_BORDE,
        valign: 'top',
      },
      headStyles: tablaConfig.encabezadoColoreado
        ? { fillColor: colorRgb, textColor: 255, fontStyle: 'bold', fontSize: 8.5, halign: 'center' }
        : {
            fillColor: [255, 255, 255],
            textColor: GRIS_TEXTO,
            fontStyle: 'bold',
            fontSize: 8.5,
            lineWidth: 0.3,
            lineColor: [17, 24, 39],
            halign: 'center',
          },
      bodyStyles: { fontSize: FONT_SIZE_DESCRIPCION, textColor: [30, 30, 30] },
      ...(tablaConfig.filasIntercaladas
        ? { alternateRowStyles: { fillColor: GRIS_FILA_ALTERNA } }
        : {}),
      columnStyles: {
        // En negrita (no ya más grande que el resto — se sentía demasiado dominante, feedback real
        // 2026-08-18) para distinguir de un vistazo el nombre de la fase de su descripción.
        // Centrado en horizontal y vertical (a diferencia del resto de columnas, alineadas arriba)
        // porque el nombre de la fase suele ocupar 1-2 líneas frente a las 4-6 de la descripción,
        // y quedaba pegado arriba del todo de una celda mucho más alta (mejora real 2026-08-18).
        0: {
          cellWidth: ANCHO_FASE,
          fontSize: 8.5,
          fontStyle: 'bold',
          halign: 'center',
          valign: 'middle',
        },
        1: { cellWidth: ANCHO_DESCRIPCION_FASE },
        2: { cellWidth: ANCHO_FECHA_FASE },
        3: { cellWidth: ANCHO_FECHA_FASE },
        4: { cellWidth: ANCHO_DURACION_FASE },
        5: { cellWidth: ANCHO_ESTADO },
      },
      didParseCell: (data) => {
        if (data.section !== 'body' || data.column.index !== 1) return;
        const fila = filas[data.row.index];
        if (!fila || fila.tipo !== 'fase') return;
        const f = fila.fase;
        let lineas = 0;
        for (const bloque of bloquesDescripcion(f.descripcion)) {
          const ancho = anchoTextoDescripcionFase - (bloque.tipo === 'lista' ? 2 : 0);
          lineas += lineasBloque(bloque, ancho).length;
        }
        // +1 línea "fantasma" (no se dibuja, solo cuenta para el alto que reserva autoTable) para
        // dejar algo de aire debajo del texto — antes la celda medía justo lo que ocupaba el texto
        // y quedaba pegado al borde inferior (feedback real 2026-08-18).
        data.cell.text = new Array(Math.max(lineas, 1) + 1).fill('');
      },
      didDrawCell: (data) => {
        if (data.section !== 'body' || data.column.index !== 1) return;
        const fila = filas[data.row.index];
        if (!fila || fila.tipo !== 'fase') return;
        const f = fila.fase;
        const x = data.cell.x + data.cell.padding('left');
        // +5 en vez de +4 — un poco más de aire respecto al borde superior de la celda, a juego con
        // la línea fantasma añadida abajo (feedback real 2026-08-18).
        let ty = data.cell.y + 5;
        const bloques = bloquesDescripcion(f.descripcion);
        if (bloques.length === 0) {
          doc.setFont(FUENTE_PDF, 'normal');
          doc.setFontSize(FONT_SIZE_DESCRIPCION);
          doc.setTextColor(30, 30, 30);
          doc.text('—', x, ty);
          return;
        }
        for (const bloque of bloques) {
          const ancho = anchoTextoDescripcionFase - (bloque.tipo === 'lista' ? 2 : 0);
          const xBloque = x + (bloque.tipo === 'lista' ? 2 : 0);
          const subLineas = lineasBloque(bloque, ancho);
          doc.setTextColor(30, 30, 30);
          doc.text(subLineas, xBloque, ty);
          ty += subLineas.length * LINE_H;
        }
      },
      willDrawCell: (data) => {
        // Redondea las dos esquinas superiores del encabezado: al llegar a la celda 0 (antes de
        // que autoTable pinte su relleno/texto) se dibuja un único rectángulo redondeado del ancho
        // completo de la tabla, y se desactiva el relleno cuadrado por defecto de la primera y
        // última celda para que ese redondeado quede visible en vez de taparse con su fondo
        // cuadrado — las columnas centrales conservan su relleno normal encima, sin diferencia
        // visible porque ahí el rectángulo redondeado ya es recto.
        if (data.section !== 'head' || !tablaConfig.encabezadoColoreado) return;
        if (data.column.index === 0) {
          doc.setFillColor(...colorRgb);
          doc.roundedRect(
            data.cell.x,
            data.cell.y,
            anchoContenido,
            data.row.height,
            RADIO_ENCABEZADO,
            RADIO_ENCABEZADO,
            'F',
          );
        }
        if (data.column.index === 0 || data.column.index === NUM_COLUMNAS - 1) {
          data.cell.styles.fillColor = false;
        }
      },
    });
  }
}
