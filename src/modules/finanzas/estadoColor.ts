export function colorEstadoPdf(estado: string): [number, number, number] {
  switch (estado) {
    case 'Aceptado':
    case 'Pagado':
      return [26, 92, 56];
    case 'Pendiente':
      return [217, 119, 6];
    case 'Rechazado':
      return [185, 28, 28];
    default:
      return [107, 114, 128];
  }
}

export function claseColorEstado(estado: string): string {
  switch (estado) {
    case 'Aceptado':
    case 'Pagado':
      return 'text-brand';
    case 'Pendiente':
      return 'text-amber-600';
    case 'Rechazado':
      return 'text-red-600';
    default:
      return 'text-gray-500';
  }
}
