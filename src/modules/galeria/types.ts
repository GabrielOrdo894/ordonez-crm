export type TipoFoto = 'antes' | 'durante' | 'despues' | 'detalle';

export const TIPOS_FOTO: { value: TipoFoto; label: string }[] = [
  { value: 'antes', label: 'Antes' },
  { value: 'durante', label: 'Durante' },
  { value: 'despues', label: 'Después' },
  { value: 'detalle', label: 'Detalles' },
];

export type FotoGaleria = {
  url: string;
  nombre: string;
  tipo: TipoFoto;
  orden: number;
};

export type GaleriaProyecto = {
  id: string;
  created_at: string;
  visita_id: string | null;
  proyecto_id: string | null;
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
