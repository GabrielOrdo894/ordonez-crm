export function fmt(n: number) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n);
}

export function fmtPct(n: number) {
  return new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 1 }).format(n);
}

export function fmtFecha(f: string) {
  return new Date(`${f}T00:00:00`).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function fmtFechaCorta(f: string) {
  return new Date(`${f}T00:00:00`).toLocaleDateString('es', { day: '2-digit', month: 'short', year: '2-digit' });
}
