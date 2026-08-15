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
