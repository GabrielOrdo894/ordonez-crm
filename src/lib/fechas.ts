const DIAS_LARGO = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES_LARGO = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];
const DIAS_CORTO = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MESES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

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
