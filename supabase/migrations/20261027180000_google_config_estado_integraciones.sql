-- Estado de las integraciones de Google, comprobado cada 30 min por automatizaciones-crm
-- (2026-10-27, petición de Gabriel: cuando Google revoca un token o falla la clave de Maps nadie
-- se entera hasta que hace falta de verdad). Cada integración guarda desde cuándo falla y el
-- último error; la función los limpia sola cuando vuelve a funcionar. Los campos gmail_ultimo_*
-- existentes siguen siendo el resultado de la pasada diaria de revisar-gmail.
alter table public.google_config
  add column if not exists integraciones_comprobadas_en timestamptz,
  add column if not exists calendar_caido_desde timestamptz,
  add column if not exists calendar_ultimo_error text,
  add column if not exists gmail_token_caido_desde timestamptz,
  add column if not exists gmail_token_ultimo_error text,
  add column if not exists maps_caido_desde timestamptz,
  add column if not exists maps_ultimo_error text;
