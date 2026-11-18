-- Test A/B de la página de contacto de ordonezrenov.com (2026-11-18): web-eventos acepta también ese sitio.
alter table public.web_eventos drop constraint if exists web_eventos_sitio_check;
alter table public.web_eventos add constraint web_eventos_sitio_check
  check (sitio = any (array['costabath'::text, 'ordonezfachadas'::text, 'ordonezstudio'::text, 'ordonezrenov'::text]));
