-- Estado del servidor de firmas autoalojado (firma.ordonezrenov.com, Documenso) — 2026-10-20.
-- El 20/10 devolvía 502 y solo se supo al intentar generar el enlace de firma de un presupuesto.
-- automatizaciones-crm lo comprueba cada 30 min y la campana avisa mientras siga caído.
alter table public.empresa_config
  add column if not exists firma_ultima_comprobacion_en timestamptz,
  add column if not exists firma_caida_desde timestamptz,
  add column if not exists firma_ultimo_error text;

comment on column public.empresa_config.firma_caida_desde is 'Desde cuándo firma.ordonezrenov.com no responde (null si responde).';
comment on column public.empresa_config.firma_ultimo_error is 'Último error de la comprobación (código HTTP o error de red).';
