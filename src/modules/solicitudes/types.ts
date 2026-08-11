export type EstadoSolicitud = 'Nueva' | 'Borrador' | 'Enviada' | 'Descartada';

export const ESTADOS_SOLICITUD: EstadoSolicitud[] = ['Nueva', 'Borrador', 'Enviada', 'Descartada'];

export type Solicitud = {
  id: string;
  created_at: string;
  fuente: string;
  nombre: string | null;
  email: string | null;
  telefono: string | null;
  tipo_reforma: string | null;
  comentario_cliente: string | null;
  pagina_origen: string | null;
  idioma: string;
  estado: EstadoSolicitud;
  mensaje_generado: string | null;
  mensaje_generado_en: string | null;
  mensaje_enviado_en: string | null;
  presupuesto_vinculado_id: string | null;
  notas: string | null;
  ultima_respuesta_cliente_resumen: string | null;
  ultima_respuesta_cliente_fecha: string | null;
};

export type MensajeConversacion = { de: string; fecha: string; texto: string };

export type PresupuestoConRespuesta = {
  id: string;
  numero: string;
  cliente_nombre: string | null;
  cliente_email: string | null;
  idioma: string | null;
  ultima_respuesta_cliente_resumen: string | null;
  ultima_respuesta_cliente_fecha: string | null;
  ultima_respuesta_revisada: boolean;
  mensaje_seguimiento_generado: string | null;
  mensaje_seguimiento_enviado: boolean;
  mensaje_seguimiento_enviado_en: string | null;
  conversacion: MensajeConversacion[] | null;
};

// El seguimiento no tiene una columna "estado" propia — se deriva de las columnas existentes,
// con el mismo vocabulario que las solicitudes para que la lista se lea igual.
export type EstadoSeguimiento = 'Nueva' | 'Borrador' | 'Enviada';

export function estadoSeguimiento(p: PresupuestoConRespuesta): EstadoSeguimiento {
  if (p.mensaje_seguimiento_enviado) return 'Enviada';
  if (p.mensaje_seguimiento_generado) return 'Borrador';
  return 'Nueva';
}

export type MensajeGenerado = {
  asunto: string;
  cuerpo: string;
  avisos?: string[];
};

export function parseMensaje(raw: string | null): MensajeGenerado | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as MensajeGenerado;
  } catch {
    return null;
  }
}

export const FUENTE_LABEL: Record<string, string> = {
  landbot: 'Landbot (web)',
  web_wordpress: 'Formulario web',
  web_emailjs: 'Formulario de contacto',
  autoenvio_gabriel: 'Autoenvío Gabriel',
  email_directo: 'Email directo',
  whatsapp: 'WhatsApp (manual)',
  manual: 'Añadida a mano',
  desconocida: 'Desconocida',
};

export const MODELOS_IA: { value: string; label: string; descripcion: string }[] = [
  { value: 'claude-haiku-4-5', label: 'Económico (Haiku)', descripcion: 'Más barato, rápido — recomendado para el día a día' },
  { value: 'claude-sonnet-5', label: 'Preciso (Sonnet)', descripcion: 'Más caro, más matizado — para casos que lo merezcan' },
];
