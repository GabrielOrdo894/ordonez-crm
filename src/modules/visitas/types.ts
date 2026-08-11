export type EstadoVisita = 'Pendiente' | 'Realizada' | 'Cancelada';

export type Visita = {
  id: string;
  created_at: string;
  nombre: string;
  apellidos: string;
  telefono: string;
  email: string | null;
  idioma: string | null;
  contacto: string | null;
  direccion: string | null;
  direccion_extra: string | null;
  lat: number | null;
  lng: number | null;
  pais: string | null;
  zona: string | null;
  tipo: string | null;
  descripcion: string | null;
  fecha_visita: string | null;
  hora_visita: string | null;
  empleado: string | null;
  estado: EstadoVisita | null;
  estado_pipeline: string;
  notas: string | null;
  google_event_id: string | null;
  es_empresa?: boolean | null;
  empresa_nombre?: string | null;
  empresa_cif?: string | null;
  eliminado_en?: string | null;
  eliminado_por?: string | null;
};

export type NuevaVisita = Omit<Visita, 'id' | 'created_at'>;
