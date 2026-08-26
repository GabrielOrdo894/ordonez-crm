// Aritmética simple sobre horas "HH:MM" (o "HH:MM:SS" tal como las devuelve Supabase para
// columnas `time`, que se recortan igual que en el resto del código con .slice(0, 5)).

export function sumarMinutos(hora: string, minutos: number): string {
  const [h, m] = hora.slice(0, 5).split(':').map(Number);
  const total = (((h * 60 + m + minutos) % 1440) + 1440) % 1440;
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export function minutosEntre(inicio: string, fin: string): number {
  const [h1, m1] = inicio.slice(0, 5).split(':').map(Number);
  const [h2, m2] = fin.slice(0, 5).split(':').map(Number);
  return h2 * 60 + m2 - (h1 * 60 + m1);
}

export function minutosDesdeMedianoche(hora: string): number {
  const [h, m] = hora.slice(0, 5).split(':').map(Number);
  return h * 60 + m;
}
