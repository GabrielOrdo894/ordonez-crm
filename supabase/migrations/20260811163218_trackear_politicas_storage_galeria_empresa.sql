-- Los buckets `galeria` y `empresa` ya funcionan en producción, pero sus políticas de
-- storage.objects se crearon fuera de las migraciones trackeadas (mismo patrón ya conocido para
-- usuarios_equipo) — si el proyecto se restaurara alguna vez solo desde las migraciones, subir
-- fotos a Galería o el logo/portada de empresa fallaría con "new row violates row-level security
-- policy". Se recrean aquí de forma idéntica (drop + create) para que queden versionadas.
-- Revisión de seguridad/consistencia 2026-08-11.

drop policy if exists "galeria_select" on storage.objects;
drop policy if exists "galeria_insert" on storage.objects;
drop policy if exists "galeria_delete" on storage.objects;

create policy "galeria_select" on storage.objects
  for select using (bucket_id = 'galeria');
create policy "galeria_insert" on storage.objects
  for insert with check (bucket_id = 'galeria');
create policy "galeria_delete" on storage.objects
  for delete using (bucket_id = 'galeria');

-- `empresa` tenía dos políticas "ALL" solapadas ("acceso anon" + "acceso app", la segunda ya
-- cubría todo lo de la primera) — se consolidan en 4 políticas por operación, mismo estilo que
-- justificantes/avatares/mensajes_adjuntos.
drop policy if exists "empresa bucket - acceso anon" on storage.objects;
drop policy if exists "empresa bucket - acceso app" on storage.objects;
drop policy if exists "empresa_select" on storage.objects;
drop policy if exists "empresa_insert" on storage.objects;
drop policy if exists "empresa_update" on storage.objects;
drop policy if exists "empresa_delete" on storage.objects;

create policy "empresa_select" on storage.objects
  for select using (bucket_id = 'empresa');
create policy "empresa_insert" on storage.objects
  for insert with check (bucket_id = 'empresa');
create policy "empresa_update" on storage.objects
  for update using (bucket_id = 'empresa');
create policy "empresa_delete" on storage.objects
  for delete using (bucket_id = 'empresa');
