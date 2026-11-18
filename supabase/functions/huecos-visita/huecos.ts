// Lógica pura de huecos de visita (sin imports: la usan la Edge Function y Vitest).

/** «Hoy» en hora de Francia, AAAA-MM-DD. */
export function hoyEnParis(ahora: Date): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(ahora);
  return p; // en-CA ya da AAAA-MM-DD
}

/** Horas de visita de un día de la semana (0 = domingo). */
export function horasDelDia(diaSemana: number): string[] {
  if (diaSemana === 0) return [];
  if (diaSemana === 6) return ['12:00'];
  return ['12:00', '18:00'];
}

/** Huecos libres desde mañana hasta `dias` días vista, en orden, como mucho `max`. */
export function siguientesHuecos(hoy: string, ocupados: Set<string>, dias: number, max: number): { fecha: string; hora: string }[] {
  const [y, m, d] = hoy.split('-').map(Number);
  const res: { fecha: string; hora: string }[] = [];
  for (let i = 1; i <= dias && res.length < max; i++) {
    const f = new Date(Date.UTC(y, m - 1, d + i));
    const fecha = f.toISOString().slice(0, 10);
    for (const hora of horasDelDia(f.getUTCDay())) {
      if (res.length >= max) break;
      if (!ocupados.has(`${fecha} ${hora}`)) res.push({ fecha, hora });
    }
  }
  return res;
}
