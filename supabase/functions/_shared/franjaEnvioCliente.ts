// Franja horaria de envío de la confirmación de visita al CLIENTE (petición de Gabriel, 2026-11-03):
// de 08:00 a 18:30 hora de Francia, todos los días de la semana. Fuera de esa franja, notificar-visita
// no manda la confirmación al momento: la deja programada (visitas.aviso_cliente_programado_en) para
// las 08:00 siguientes y automatizaciones-crm (cada 30 min) la envía cuando llega la hora. Así se
// puede registrar o reprogramar una visita a medianoche sin que el cliente reciba el email a esa
// hora. El aviso interno al equipo sale siempre al momento.
//
// Sin imports a propósito: lo usan las Edge Functions (Deno) y lo cubre Vitest desde el repo.

export const ZONA_HORARIA = 'Europe/Paris';
export const FRANJA_INICIO_MIN = 8 * 60;
export const FRANJA_FIN_MIN = 18 * 60 + 30;
// Si entre la hora programada de envío y la propia visita quedan menos de 3 h, esperar no tiene
// sentido (visita creada a las 23:00 para mañana a las 09:00): se envía al momento.
export const MARGEN_MINIMO_MS = 3 * 60 * 60 * 1000;

type PartesLocales = { y: number; m: number; d: number; h: number; min: number };

function partesLocales(fecha: Date): PartesLocales {
  const partes = new Intl.DateTimeFormat('en-GB', {
    timeZone: ZONA_HORARIA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(fecha);
  const v = (t: string) => Number(partes.find((p) => p.type === t)?.value ?? 0);
  // Algunos runtimes devuelven "24" a medianoche con hour12: false.
  return { y: v('year'), m: v('month'), d: v('day'), h: v('hour') % 24, min: v('minute') };
}

// Instante UTC de una fecha/hora local de Francia, sin librerías: se parte del mismo reloj leído
// como UTC y se corrige por el desfase que marca la zona horaria en ese momento (vale con cambio
// de hora de verano/invierno).
export function localParisAUtc(y: number, m: number, d: number, h: number, min: number): Date {
  const base = Date.UTC(y, m - 1, d, h, min);
  const p = partesLocales(new Date(base));
  const desfase = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min) - base;
  return new Date(base - desfase);
}

export function instanteVisita(fechaVisita: string, horaVisita: string): Date {
  const [y, m, d] = fechaVisita.split('-').map(Number);
  const [h, min] = horaVisita.split(':').map(Number);
  return localParisAUtc(y, m, d, h, min);
}

/** Cuándo debe salir la confirmación al cliente, o null si debe salir ahora mismo. */
export function calcularEnvioProgramado(
  ahora: Date,
  fechaVisita: string,
  horaVisita: string,
): Date | null {
  const p = partesLocales(ahora);
  const minutos = p.h * 60 + p.min;
  if (minutos >= FRANJA_INICIO_MIN && minutos <= FRANJA_FIN_MIN) return null;
  // Antes de las 08:00 → hoy a las 08:00; después de las 18:30 → mañana a las 08:00.
  const diaObjetivo = new Date(Date.UTC(p.y, p.m - 1, p.d + (minutos > FRANJA_FIN_MIN ? 1 : 0)));
  const programado = localParisAUtc(
    diaObjetivo.getUTCFullYear(),
    diaObjetivo.getUTCMonth() + 1,
    diaObjetivo.getUTCDate(),
    Math.floor(FRANJA_INICIO_MIN / 60),
    FRANJA_INICIO_MIN % 60,
  );
  if (instanteVisita(fechaVisita, horaVisita).getTime() - programado.getTime() < MARGEN_MINIMO_MS)
    return null;
  return programado;
}

/** "miércoles, 04 de noviembre, 08:00" en hora de Francia — para notas de sistema y avisos. */
export function fechaHoraLegible(fecha: Date): string {
  return fecha.toLocaleString('es', {
    timeZone: ZONA_HORARIA,
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });
}
