export type MovimientoBanco = {
  id: string;
  created_at: string;
  fitid: string | null;
  fecha: string;
  importe: number;
  tipo: 'Credito' | 'Debito';
  descripcion: string | null;
  estado: 'Pendiente' | 'Vinculado' | 'Ignorado';
  factura_id: string | null;
  gasto_id: string | null;
  archivo_origen: string | null;
  // Qué pago de pagos_factura creó este movimiento al vincularlo a una factura — null si nunca se
  // vinculó, o si se vinculó a un gasto en vez de a una factura.
  pago_id: string | null;
};
