export type TipoFoto = 'antes' | 'durante' | 'despues' | 'detalle';

export const TIPOS_FOTO: { value: TipoFoto; label: string }[] = [
  { value: 'antes', label: 'Antes' },
  { value: 'durante', label: 'Durante' },
  { value: 'despues', label: 'Después' },
  { value: 'detalle', label: 'Detalles' },
];

export type TipoArchivo = 'foto' | 'video';

export type FotoGaleria = {
  url: string;
  nombre: string;
  tipo: TipoFoto;
  orden: number;
  tipo_archivo: TipoArchivo;
  titulo: string | null;
  descripcion: string | null;
};

export type GaleriaProyecto = {
  id: string;
  created_at: string;
  visita_id: string | null;
  proyecto_id: string | null;
  // Ancla a la obra real (2026-09-09): exactamente uno de los dos, nunca ambos — presupuesto_id
  // cuando la obra viene de un presupuesto Aceptado (o del presupuesto de origen de una
  // factura/acompte), factura_id cuando es una factura suelta sin presupuesto vinculado (caso
  // "sin coincidencia" de Ricardo). Ver src/modules/galeria/obras.ts.
  presupuesto_id: string | null;
  factura_id: string | null;
  titulo: string | null;
  tipo_obra: string | null;
  zona: string | null;
  fecha_obra: string | null;
  descripcion: string | null;
  fotos: FotoGaleria[];
  destacado: boolean;
  publicado: boolean;
};

export type NuevaGaleriaProyecto = Omit<GaleriaProyecto, 'id' | 'created_at'>;
