-- Seguimiento de la entrega del aviso de visita (notificar-visita) — 2026-10-19.
-- El 19/10 Hostinger aceptó dos avisos por SMTP y los entregó más de una hora tarde (al equipo y
-- a la clienta), sin rebote ni error: la Edge Function creyó que habían salido bien. Desde ahora notificar-visita
-- anota cuándo envió y con qué asunto, y automatizaciones-crm (cada 30 min) busca ese asunto en el
-- Gmail de reformasordonezeus@gmail.com (destinatario del aviso interno, que sale por el mismo
-- SMTP que la confirmación al cliente). Si a los 15 minutos no ha llegado, marca la visita y la
-- campana del CRM avisa para reenviarlo.
alter table public.visitas
  add column if not exists aviso_enviado_en timestamptz,
  add column if not exists aviso_asunto text,
  add column if not exists aviso_cliente_email text,
  add column if not exists aviso_verificado_en timestamptz,
  add column if not exists aviso_no_llegado_en timestamptz;

comment on column public.visitas.aviso_enviado_en is 'Último envío del aviso de visita (notificar-visita) aceptado por el SMTP.';
comment on column public.visitas.aviso_asunto is 'Asunto exacto del aviso interno enviado, para buscarlo en Gmail.';
comment on column public.visitas.aviso_cliente_email is 'Email del cliente al que salió la confirmación en ese envío (null si no tenía email).';
comment on column public.visitas.aviso_verificado_en is 'Cuándo automatizaciones-crm encontró el aviso interno en Gmail (entrega confirmada).';
comment on column public.visitas.aviso_no_llegado_en is 'Cuándo se detectó que el aviso no llegó a Gmail 15 min después del envío.';
