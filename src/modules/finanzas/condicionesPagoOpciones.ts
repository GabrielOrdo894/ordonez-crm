export type OpcionCondicionPago = { value: string; labelEs: string; labelFr: string };

export const OPCIONES_DELAI_PAGO: OpcionCondicionPago[] = [
  { value: 'contado', labelEs: 'Al contado', labelFr: 'À réception' },
  { value: '15dias', labelEs: '15 días', labelFr: '15 jours' },
  { value: '30dias', labelEs: '30 días', labelFr: '30 jours' },
  { value: '45dias_fin_mes', labelEs: '45 días fin de mes', labelFr: '45 jours fin de mois' },
  { value: 'plan_pago', labelEs: 'Según plan de pago acordado', labelFr: 'Selon échéancier convenu' },
];

export const OPCIONES_PENALIZACION: OpcionCondicionPago[] = [
  { value: '3x_legal', labelEs: '3 veces el tipo de interés legal (mínimo legal)', labelFr: "3 fois le taux d'intérêt légal (minimum légal)" },
  { value: 'bce_10', labelEs: 'Tipo BCE + 10 puntos', labelFr: 'Taux BCE + 10 points' },
  { value: 'legal_simple', labelEs: 'Tipo de interés legal simple', labelFr: "Taux d'intérêt légal simple" },
  { value: 'a_convenir', labelEs: 'A convenir entre las partes', labelFr: 'À convenir entre les parties' },
];

export const OPCIONES_MEDIO_PAGO: OpcionCondicionPago[] = [
  { value: 'transferencia', labelEs: 'Transferencia', labelFr: 'Virement' },
  { value: 'cheque', labelEs: 'Cheque', labelFr: 'Chèque' },
  { value: 'efectivo', labelEs: 'Efectivo', labelFr: 'Espèces' },
  { value: 'tarjeta', labelEs: 'Tarjeta', labelFr: 'Carte bancaire' },
  { value: 'domiciliacion', labelEs: 'Domiciliación', labelFr: 'Prélèvement' },
];

export function opcionPorLabelFr(opciones: OpcionCondicionPago[], labelFr: string): OpcionCondicionPago | undefined {
  return opciones.find((o) => o.labelFr === labelFr);
}
