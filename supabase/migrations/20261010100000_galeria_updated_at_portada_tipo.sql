-- Galería v2 (auditoría 2026-10-10): control de concurrencia optimista sobre el array `fotos`
-- (updated_at), portada elegible y tipo de obra en lista cerrada (antes `tipo_obra` era texto libre
-- copiado del título del presupuesto).
alter table public.galeria
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists portada_url text,
  add column if not exists tipo_obra_clave text;

create or replace function public.galeria_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists galeria_updated_at on public.galeria;
create trigger galeria_updated_at
  before update on public.galeria
  for each row execute function public.galeria_set_updated_at();
