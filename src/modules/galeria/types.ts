export type TipoFoto = 'antes' | 'durante' | 'despues' | 'detalle';

export const TIPOS_FOTO: { value: TipoFoto; label: string }[] = [
  { value: 'antes', label: 'Antes' },
  { value: 'durante', label: 'Durante' },
  { value: 'despues', label: 'Después' },
  { value: 'detalle', label: 'Detalles' },
];

export type TipoArchivo = 'foto' | 'video';

// Tipos de obra en lista cerrada (galería v2, 2026-10-10). Antes `tipo_obra` era el título del
// presupuesto copiado tal cual, así que el filtro por tipo no servía para nada.
export const TIPOS_OBRA: { value: string; label: string }[] = [
  { value: 'bano', label: 'Baño' },
  { value: 'cocina', label: 'Cocina' },
  { value: 'suelos', label: 'Suelos' },
  { value: 'fachada', label: 'Fachada' },
  { value: 'tejado', label: 'Tejado' },
  { value: 'aislamiento', label: 'Aislamiento' },
  { value: 'integral', label: 'Reforma integral' },
  { value: 'exterior', label: 'Exterior' },
  { value: 'pintura', label: 'Pintura' },
  { value: 'otro', label: 'Otro' },
];

export function etiquetaTipoObra(clave: string | null | undefined): string | null {
  if (!clave) return null;
  return TIPOS_OBRA.find((t) => t.value === clave)?.label ?? clave;
}

export type FotoGaleria = {
  url: string;
  nombre: string;
  tipo: TipoFoto;
  orden: number;
  tipo_archivo: TipoArchivo;
  titulo: string | null;
  descripcion: string | null;
  // Galería v2 (2026-10-10). Opcionales porque las fotos subidas antes no los tienen: se completan
  // la primera vez que se abre la obra (ver completarMiniaturas en media.ts).
  thumb_url?: string | null; // miniatura 480 px (foto) — para rejillas y tarjetas
  poster_url?: string | null; // fotograma del vídeo, misma función que thumb_url
  ancho?: number | null;
  alto?: number | null;
  duracion?: number | null; // segundos, solo vídeo
  fecha_captura?: string | null; // ISO, de los metadatos EXIF si existen
};

export type GaleriaProyecto = {
  id: string;
  created_at: string;
  updated_at: string;
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
  tipo_obra_clave: string | null;
  zona: string | null;
  fecha_obra: string | null;
  descripcion: string | null;
  fotos: FotoGaleria[];
  portada_url: string | null;
  destacado: boolean;
  publicado: boolean;
};

export type NuevaGaleriaProyecto = Omit<GaleriaProyecto, 'id' | 'created_at' | 'updated_at'>;

/** Imagen ligera para rejillas: miniatura, póster del vídeo o, si aún no existen, el original. */
export function miniaturaDe(f: FotoGaleria): string {
  return f.thumb_url || f.poster_url || f.url;
}

/** Portada de la obra: la elegida, o la primera foto de "después", o la primera que haya. */
export function portadaDe(p: Pick<GaleriaProyecto, 'fotos' | 'portada_url'>): FotoGaleria | null {
  if (p.fotos.length === 0) return null;
  const elegida = p.portada_url ? p.fotos.find((f) => f.url === p.portada_url) : null;
  if (elegida) return elegida;
  const orden = [...p.fotos].sort((a, b) => a.orden - b.orden);
  return orden.find((f) => f.tipo === 'despues' && f.tipo_archivo === 'foto') ?? orden.find((f) => f.tipo_archivo === 'foto') ?? orden[0];
}

export function formatearDuracion(segundos: number | null | undefined): string | null {
  if (!segundos || !Number.isFinite(segundos)) return null;
  const s = Math.round(segundos);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
