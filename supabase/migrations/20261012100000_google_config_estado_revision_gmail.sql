-- Estado de la última revisión de Gmail (revisar-gmail), para que la campana avise cuando el
-- token de Google se revoca y el CRM deja de recibir solicitudes (2026-10-12: estuvo 3 días sin
-- entrar nada y el cron seguía marcando "succeeded" porque solo registra que lanzó la petición).
alter table public.google_config
  add column if not exists gmail_ultima_revision_en timestamptz,
  add column if not exists gmail_ultimo_error text,
  add column if not exists gmail_ultimo_error_en timestamptz;
