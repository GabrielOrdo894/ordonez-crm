alter table funnel_eventos drop constraint funnel_eventos_etapa_check;

alter table funnel_eventos add constraint funnel_eventos_etapa_check
  check (etapa = ANY (ARRAY[
    'solicitud_entrada'::text,
    'solicitud_respondida'::text,
    'solicitud_descartada'::text,
    'visita_agendada'::text,
    'solicitud_vinculada_presupuesto'::text,
    'presupuesto_enviado'::text,
    'presupuesto_aceptado'::text,
    'presupuesto_firmado'::text,
    'presupuesto_rechazado'::text,
    'obra_finalizada'::text,
    'factura_cobrada'::text
  ]));
