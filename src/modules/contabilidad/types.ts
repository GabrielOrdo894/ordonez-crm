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
};
