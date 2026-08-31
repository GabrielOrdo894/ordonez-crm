export type EstadoVisita = 'Pendiente' | 'Realizada' | 'Cancelada';

// Checklist simple de lo que hay que comprobar/medir durante la visita — antes no se capturaba
// nada estructurado, solo texto libre en descripción/notas (mejora real, auditoría de Visitas
// 2026-08-18).
export type ChecklistItem = { texto: string; hecho: boolean };

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
  // Antes las visitas no tenían duración, así que ninguna vista podía dibujar bloques de tiempo
  // proporcionales ni detectar solapamientos entre dos visitas seguidas (mejora real, auditoría de
  // Calendario 2026-08-18). Null en visitas antiguas — se trata como 1h por defecto donde hace falta.
  hora_fin_visita: string | null;
  empleado: string | null;
  estado: EstadoVisita | null;
  estado_pipeline: string;
  // Etapa más avanzada que la visita alcanzó de verdad en el embudo lineal (ETAPAS_PIPELINE) —
  // nunca retrocede, ni siquiera cuando estado_pipeline pasa a "Perdido" (ver pipelineSync.ts).
  pipeline_etapa_maxima: string | null;
  notas: string | null;
  google_event_id: string | null;
  es_empresa?: boolean | null;
  empresa_nombre?: string | null;
  empresa_cif?: string | null;
  referido_por?: string | null;
  // Visita de seguimiento vinculada a una obra ya en curso (agendada desde Planning), distinta de
  // la visita técnica comercial inicial — antes no había forma de agendar una inspección a mitad
  // de obra o de entrega final dentro del mismo sistema de calendario (mejora real, auditoría de
  // Visitas 2026-08-18).
  proyecto_id?: string | null;
  checklist?: ChecklistItem[] | null;
  eliminado_en?: string | null;
  eliminado_por?: string | null;
  // Fotos del estado preliminar que el cliente manda antes de la visita (WhatsApp/email) — paths
  // del bucket privado `fotos-visita`, subidas a mano desde VisitaForm.tsx (2026-08-28). Se enlazan
  // en el email de confirmación (notificar-visita) y en la descripción del evento de Calendar.
  fotos_previas?: string[] | null;
};

export type NuevaVisita = Omit<Visita, 'id' | 'created_at'>;

// Datos con los que se puede abrir el formulario de "Nueva visita" ya rellenado —
// desde el calendario (solo fecha) o desde una Solicitud entrante (datos de contacto).
export type PrefillVisita = {
  fecha?: string;
  nombre?: string;
  telefono?: string;
  email?: string;
  idioma?: string;
  contacto?: string;
  tipo?: string;
  descripcion?: string;
  // Añadidos para "Agendar visita de seguimiento" desde Planning — sin dirección/país precargados,
  // esa mejora apenas ahorraba nada frente a un formulario en blanco.
  direccion?: string;
  direccionExtra?: string;
  pais?: string;
  proyectoId?: string;
  // Id de la solicitud que originó esta visita (botón "Crear visita desde esta solicitud" en
  // SolicitudDetalle.tsx) — al crear la visita, VisitaForm enlaza solicitudes.visita_id y registra
  // el evento de funnel 'visita_agendada' para poder medir cuánto tarda una solicitud en convertirse
  // en visita agendada (2026-08-26).
  solicitudId?: string;
};
