// Compartido entre VisitaForm.tsx y VisitaReprogramarPage.tsx — mismo catálogo de horas y
// duraciones para que "Modificar" y "Reprogramar" no puedan desincronizarse entre sí.
export const OTRO_HORARIO = 'otro';

export function esSabado(fecha: string) {
  if (!fecha) return false;
  return new Date(`${fecha}T00:00:00`).getDay() === 6;
}

// Duraciones ofrecidas para "Duración" — 60 min es el valor por defecto/histórico.
export const DURACIONES_MIN = [30, 60, 90, 120];

export function etiquetaDuracion(min: number) {
  if (min < 60) return `${min} min`;
  const horas = Math.floor(min / 60);
  const resto = min % 60;
  return resto ? `${horas} h ${resto} min` : `${horas} h`;
}
