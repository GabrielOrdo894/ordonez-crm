alter table solicitudes
  add column tipo_solicitud text check (tipo_solicitud in ('visita', 'presupuesto_orientativo'));

comment on column solicitudes.tipo_solicitud is
  'Etiqueta filtrable, no obligatoria: qué pide el contacto (visita técnica directa, o presupuesto orientativo sin visita). NULL = sin determinar (la mayoría de las que llegan por formulario, donde el propio CRM decide cuál ofrecer según disponibilidad). Se autodetecta por el asunto del email en conversaciones directas (detectarConversacionesDirectas en revisar-gmail) y se puede corregir a mano en el CRM.';
