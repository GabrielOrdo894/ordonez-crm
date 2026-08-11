-- La tabla proveedores existía en producción pero nunca se había trackeado en las migraciones
-- del repo (mismo hueco ya encontrado y corregido para las políticas de Storage de galeria/empresa).
-- Se recrea aquí con create table if not exists + su política RLS ya existente, solo para
-- documentar el esquema real en git (revisión 2026-08-11).
create table if not exists proveedores (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  pais text,
  razon_social text,
  identificador text,
  identificador_extra text,
  direccion text,
  telefono text,
  email text
);
alter table proveedores enable row level security;
drop policy if exists "acceso equipo autenticado" on proveedores;
create policy "acceso equipo autenticado" on proveedores for all to authenticated using (true) with check (true);
