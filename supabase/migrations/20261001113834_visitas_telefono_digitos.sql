-- Últimos 9 dígitos del teléfono (mismo criterio que normalizarTelefono en el frontend): permite
-- buscar un cliente por teléfono sin depender del formato guardado ("+34 659 88 47 06",
-- "0659884706"...). Desde que se guarda formateado, la detección de cliente repetido y el buscador
-- no encontraban los números (auditoría 2026-10-01).
alter table public.visitas
  add column if not exists telefono_digitos text
  generated always as (nullif(right(regexp_replace(coalesce(telefono, ''), '\D', '', 'g'), 9), '')) stored;
create index if not exists visitas_telefono_digitos_idx on public.visitas (telefono_digitos);
