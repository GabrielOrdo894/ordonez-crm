export type EstadoSolicitud = 'Nueva' | 'Enviada' | 'Descartada';

export const ESTADOS_SOLICITUD: EstadoSolicitud[] = ['Nueva', 'Enviada', 'Descartada'];

// Etiqueta filtrable, no obligatoria (2026-08-26) — null = "sin determinar". Se autodetecta por el
// asunto del email en conversaciones directas (detectarTipoSolicitud en revisar-gmail) y, desde
// 2026-09-06, también por palabras clave en el propio comentario/tipo de reforma para los
// formularios (Landbot/WordPress/EmailJS — detectarTipoSolicitudDesdeTexto en revisar-gmail); si
// el texto no trae ninguna señal clara sigue quedando null, y es el propio CRM (Gabriel) quien
// decide más tarde si ofrece visita u orientativo según disponibilidad. Siempre se puede corregir
// a mano sin que la autodetección la vuelva a pisar.
export type TipoSolicitud = 'visita' | 'presupuesto_orientativo';

export const TIPO_SOLICITUD_LABEL: Record<TipoSolicitud, string> = {
  visita: 'Visita',
  presupuesto_orientativo: 'Presupuesto orientativo',
};

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
  // Embebido vía FK solicitudes_presupuesto_vinculado_id_fkey — solo lo trae la consulta de
  // SolicitudesPage.tsx (lista), no la de SolicitudDetalle.tsx (que ya tiene su propio desplegable).
  presupuesto_vinculado?: { id: string; numero: string } | null;
  notas: string | null;
  ultima_respuesta_cliente_resumen: string | null;
  ultima_respuesta_cliente_fecha: string | null;
  // false cuando el cliente respondió y todavía no se ha atendido — a diferencia del pseudo-estado
  // de las respuestas a presupuestos, aquí NO revierte `estado` a "Nueva" (decisión de Gabriel
  // 2026-08-26, para no distorsionar el embudo de conversión: una vez "Enviada", una solicitud ya
  // contactada no debe volver a contar como "sin responder").
  ultima_respuesta_revisada: boolean;
  tipo_solicitud: TipoSolicitud | null;
};

export type MensajeConversacion = { de: string; fecha: string; texto: string };

export type PresupuestoConRespuesta = {
  id: string;
  numero: string;
  cliente_nombre: string | null;
  cliente_email: string | null;
  idioma: string | null;
  // Estado real del presupuesto (Pendiente/Aceptado/Rechazado/Borrador) — distinto del pseudo-estado
  // de seguimiento de abajo (Nueva/Enviada/Aceptada). Se muestra en columna separada en
  // SolicitudesPage.tsx porque antes "Marcar como Aceptado/Rechazado" cambiaba este campo sin que
  // se reflejara visualmente en ningún sitio de esa tabla (confusión real de Gabriel, 2026-08-20).
  estado: string;
  ultima_respuesta_cliente_resumen: string | null;
  ultima_respuesta_cliente_fecha: string | null;
  ultima_respuesta_revisada: boolean;
  mensaje_seguimiento_generado: string | null;
  mensaje_seguimiento_enviado: boolean;
  mensaje_seguimiento_enviado_en: string | null;
  conversacion: MensajeConversacion[] | null;
  // Cierre manual de la conversación de seguimiento (2026-08-19) — independiente del estado real
  // del presupuesto (Pendiente/Aceptado/Rechazado, que se cambia aparte con "Marcar como
  // Aceptado/Rechazado" y sí afecta al embudo). Se usa para dar por concluidas negociaciones ya
  // cerradas con un último mensaje, aunque el presupuesto siga técnicamente Pendiente/Rechazado.
  seguimiento_concluido: boolean;
};

// El seguimiento no tiene una columna "estado" propia — se deriva de las columnas existentes,
// con un vocabulario parecido al de las solicitudes pero no idéntico: "Aceptada" aquí es el cierre
// manual de la conversación (seguimiento_concluido), no el estado real Aceptado/Rechazado del
// presupuesto — un presupuesto Rechazado puede acabar igualmente en seguimiento "Aceptada" si
// Gabriel ya mandó su último mensaje y da la negociación por zanjada.
export type EstadoSeguimiento = 'Nueva' | 'Enviada' | 'Aceptada';

export function estadoSeguimiento(p: PresupuestoConRespuesta): EstadoSeguimiento {
  if (p.seguimiento_concluido) return 'Aceptada';
  if (p.mensaje_seguimiento_enviado) return 'Enviada';
  return 'Nueva';
}

// Presupuestos con un mensaje de WhatsApp/SMS preparado pero sin marcar como enviado — canales sin
// envío automatizable desde el CRM (a diferencia del email, que sí se manda como borrador real de
// Gmail). Pestaña "Pendientes de enviar" en Solicitudes (2026-09-06): ayuda a no perder de vista a
// los clientes que entran por WhatsApp o llamada, que hasta ahora no dejaban ningún rastro en el
// CRM entre "se redactó el mensaje" y "se envió de verdad" salvo la propia conversación de chat.
export type PresupuestoPendienteEnvio = {
  id: string;
  numero: string | null;
  cliente_nombre: string | null;
  cliente_tel: string | null;
  cliente_email: string | null;
  idioma: string | null;
  mensaje_pendiente_texto: string;
  mensaje_pendiente_enviado_en: string | null;
};

// Fila de la TABLA de "Pendientes de enviar" — a diferencia de PresupuestoPendienteEnvio (usado
// para el badge/KPI, que solo cuenta los que siguen pendientes), esta incluye también los ya
// marcados como enviados (para que la tabla sirva de historial, con columna "Estado") y la zona de
// la obra de la visita vinculada (2026-09-07, petición de Gabriel) — `visita_zona`/`visita_pais`
// se rellenan aparte con una segunda consulta a `visitas` en SolicitudesPage.tsx, no vía embed de
// PostgREST (para no arriesgarse a un error de relación ambigua).
export type MensajeEnvioFila = PresupuestoPendienteEnvio & {
  visita_zona: string | null;
  visita_pais: string | null;
};

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
