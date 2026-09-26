const DIAS_LARGO = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES_LARGO = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];
const DIAS_CORTO = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MESES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DIAS_CORTO_FR = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];
const MESES_CORTO_FR = ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc'];

/** "lunes 6 de abril a las 18:00" — para fichas y detalle de visita. */
export function fechaVisitaLarga(fecha: string | null | undefined, hora?: string | null): string {
  if (!fecha) return 'Sin fecha';
  const d = new Date(`${fecha}T00:00:00`);
  const texto = `${DIAS_LARGO[d.getDay()]} ${d.getDate()} de ${MESES_LARGO[d.getMonth()]}`;
  const horaCorta = hora?.slice(0, 5);
  return horaCorta ? `${texto} a las ${horaCorta}` : texto;
}

/** "lun, 6 abr" — para tablas y listados compactos. */
export function fechaVisitaCorta(fecha: string | null | undefined): string {
  if (!fecha) return 'Sin fecha';
  const d = new Date(`${fecha}T00:00:00`);
  return `${DIAS_CORTO[d.getDay()]}, ${d.getDate()} ${MESES_CORTO[d.getMonth()]}`;
}

/** "lun 14, abril" — para columnas de fecha en tablas de presupuestos/facturas/gastos. */
export function fechaCorta(fecha: string | null | undefined): string {
  if (!fecha) return '—';
  const d = new Date(`${fecha}T00:00:00`);
  return `${DIAS_CORTO[d.getDay()]} ${d.getDate()}, ${MESES_LARGO[d.getMonth()]}`;
}

/** "2026-ago-14 (vie)" / "2026-août-14 (ven)" — fechas de fases y cronograma en el planning de
 * obra: se ordena igual que el ISO plano pero de un vistazo se ve el día de la semana. */
export function fechaPlanning(fecha: string | null | undefined, idioma: 'es' | 'fr' = 'es'): string {
  if (!fecha) return '—';
  const d = new Date(`${fecha}T00:00:00`);
  const meses = idioma === 'fr' ? MESES_CORTO_FR : MESES_CORTO;
  const dias = idioma === 'fr' ? DIAS_CORTO_FR : DIAS_CORTO;
  return `${d.getFullYear()}-${meses[d.getMonth()]}-${String(d.getDate()).padStart(2, '0')} (${dias[d.getDay()]})`;
}

/** "14/08" — versión corta (día/mes, sin año ni día de la semana) para anotar el rango de fechas
 * junto a cada barra del Gantt, donde el espacio disponible es de solo unos 30mm: el formato largo
 * de `fechaPlanning` desborda ese hueco (bug real reportado 2026-08-16, captura en
 * `negocio/modificaciones/problema de desborde.png`). Mismo formato que ya usaba `PlanningPreview.tsx` para
 * su Gantt en pantalla — se comparte aquí para que el PDF (planning suelto y dossier de obra, que
 * reutilizan `dibujarGanttYFases`) deje de desbordar también. */
export function fechaPlanningCorta(fecha: string | null | undefined): string {
  if (!fecha) return '—';
  const d = new Date(`${fecha}T00:00:00`);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ── Fechas "YYYY-MM-DD" en hora LOCAL ────────────────────────────────────────────────────────
// `new Date().toISOString().slice(0, 10)` da la fecha en UTC: entre las 00:00 y las 02:00 en
// verano (01:00 en invierno) devuelve el día anterior, y a fin de mes podía meter una factura, un
// cobro o un gasto en el periodo de IVA equivocado (auditoría 2026-09-26). Usar siempre estas.

/** Fecha local de un Date como "YYYY-MM-DD". */
export function isoLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Hoy en hora local, "YYYY-MM-DD". */
export function hoyLocalIso(): string {
  return isoLocal(new Date());
}

/** Hoy ± N días en hora local, "YYYY-MM-DD". */
export function isoHaceDias(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return isoLocal(d);
}

/** Suma días a una fecha "YYYY-MM-DD" sin pasar por la zona horaria (aritmética en UTC puro).
 * La versión anterior de FacturaForm partía de la medianoche local y convertía a UTC: restaba un
 * día, así que "7 días" guardaba 6 y "El mismo día" guardaba el día anterior. */
export function sumarDiasIso(fechaIso: string, dias: number): string {
  const d = new Date(`${fechaIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Días entre dos fechas "YYYY-MM-DD" (hasta − desde), inmune a cambios de hora. */
export function diasEntreIso(desde: string, hasta: string): number {
  return Math.round(
    (Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000,
  );
}

/** Opciones de un selector de plazo en días que incluyen siempre el valor actual: si la fecha
 * guardada no coincide con ninguna opción (se cambió la fecha de emisión después, o viene de un
 * documento antiguo), el selector salía vacío aunque el valor sí estuviera aplicado. */
export function opcionesPlazoConActual(
  opciones: { value: string; label: string }[],
  diasActuales: number,
): { value: string; label: string }[] {
  const valor = String(diasActuales);
  if (opciones.some((o) => o.value === valor)) return opciones;
  const etiqueta =
    diasActuales === 0
      ? 'El mismo día'
      : `${diasActuales} ${Math.abs(diasActuales) === 1 ? 'día' : 'días'}`;
  return [...opciones, { value: valor, label: etiqueta }].sort(
    (a, b) => Number(a.value) - Number(b.value),
  );
}
