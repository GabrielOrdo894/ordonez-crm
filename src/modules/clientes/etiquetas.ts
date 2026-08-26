// Segmentación de cartera con lista fija (no texto libre) para que el color y el significado de
// cada etiqueta sean consistentes en toda la cartera y se puedan filtrar — antes no había forma de
// marcar "VIP", "solo pide presupuesto", etc. (mejora real, auditoría de Clientes 2026-08-18).
export type EtiquetaCliente = 'VIP' | 'Solo presupuesto' | 'Moroso' | 'Referente';

export const ETIQUETAS_DISPONIBLES: EtiquetaCliente[] = [
  'VIP',
  'Solo presupuesto',
  'Moroso',
  'Referente',
];

export const COLOR_ETIQUETA: Record<EtiquetaCliente, string> = {
  VIP: 'bg-amber-50 text-amber-700 border-amber-200',
  'Solo presupuesto': 'bg-gray-100 text-gray-600 border-gray-200',
  Moroso: 'bg-red-50 text-red-700 border-red-200',
  Referente: 'bg-brand-light text-brand border-brand-hover',
};
