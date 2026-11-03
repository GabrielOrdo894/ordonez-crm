-- Confirmación de visita al cliente programada fuera del horario de envío — 2026-11-03 (petición de
-- Gabriel). notificar-visita solo manda la confirmación al cliente entre las 08:00 y las 18:30 hora
-- de Francia; fuera de esa franja la deja aquí programada para las 08:00 siguientes y
-- automatizaciones-crm (cada 30 min) la envía cuando llega la hora. El aviso interno al equipo
-- sale siempre al momento.
alter table public.visitas
  add column if not exists aviso_cliente_programado_en timestamptz,
  add column if not exists aviso_cliente_programado_motivo text;

comment on column public.visitas.aviso_cliente_programado_en is 'Cuándo debe salir la confirmación al cliente que quedó pendiente por crearse la visita fuera del horario de envío (null si ya salió o no hay ninguna pendiente).';
comment on column public.visitas.aviso_cliente_programado_motivo is '''reprogramacion'' si la confirmación pendiente debe decir «nueva fecha» en vez de «confirmación» (la anterior sí llegó al cliente); null en el resto de casos.';
