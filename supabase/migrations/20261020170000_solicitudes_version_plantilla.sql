-- Versión de plantilla de la web filial (ordonezfachadas.com, costabath.com) que generó la solicitud.
-- Esas webs son experimentos: se comparan plantillas por conversión (Gabriel, 2026-10-20).
alter table public.solicitudes add column if not exists version_plantilla text;
