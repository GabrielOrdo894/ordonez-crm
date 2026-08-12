-- avatares/empresa/galeria/mensajes_adjuntos permitían insert/update/delete al rol public (sin
-- login) — cualquiera con la clave anon (pública, va en el bundle del frontend) podía subir,
-- sobrescribir o borrar archivos en esos 4 buckets sin iniciar sesión en el CRM. justificantes ya
-- estaba bien (authenticated). Revisión de seguridad 2026-08-12.
-- avatares/empresa/galeria siguen con SELECT público a propósito (avatares mostrados por URL
-- pública en toda la app, logo/imágenes de empresa e imágenes de galería son contenido pensado
-- para verse sin login). mensajes_adjuntos es distinto: son adjuntos de mensajes internos del
-- equipo, cuya tabla mensajes_equipo ya tiene RLS estricto (solo destinatarios) — dejar sus
-- adjuntos con SELECT público socava esa privacidad, así que aquí las 4 operaciones pasan a
-- authenticated.
drop policy if exists "avatares_insert" on storage.objects;
create policy "avatares_insert" on storage.objects for insert to authenticated with check (bucket_id = 'avatares');
drop policy if exists "avatares_update" on storage.objects;
create policy "avatares_update" on storage.objects for update to authenticated using (bucket_id = 'avatares');
drop policy if exists "avatares_delete" on storage.objects;
create policy "avatares_delete" on storage.objects for delete to authenticated using (bucket_id = 'avatares');

drop policy if exists "empresa_insert" on storage.objects;
create policy "empresa_insert" on storage.objects for insert to authenticated with check (bucket_id = 'empresa');
drop policy if exists "empresa_update" on storage.objects;
create policy "empresa_update" on storage.objects for update to authenticated using (bucket_id = 'empresa');
drop policy if exists "empresa_delete" on storage.objects;
create policy "empresa_delete" on storage.objects for delete to authenticated using (bucket_id = 'empresa');

drop policy if exists "galeria_insert" on storage.objects;
create policy "galeria_insert" on storage.objects for insert to authenticated with check (bucket_id = 'galeria');
drop policy if exists "galeria_update" on storage.objects;
create policy "galeria_update" on storage.objects for update to authenticated using (bucket_id = 'galeria');
drop policy if exists "galeria_delete" on storage.objects;
create policy "galeria_delete" on storage.objects for delete to authenticated using (bucket_id = 'galeria');

drop policy if exists "mensajes_adjuntos_select" on storage.objects;
create policy "mensajes_adjuntos_select" on storage.objects for select to authenticated using (bucket_id = 'mensajes_adjuntos');
drop policy if exists "mensajes_adjuntos_insert" on storage.objects;
create policy "mensajes_adjuntos_insert" on storage.objects for insert to authenticated with check (bucket_id = 'mensajes_adjuntos');
drop policy if exists "mensajes_adjuntos_update" on storage.objects;
create policy "mensajes_adjuntos_update" on storage.objects for update to authenticated using (bucket_id = 'mensajes_adjuntos');
drop policy if exists "mensajes_adjuntos_delete" on storage.objects;
create policy "mensajes_adjuntos_delete" on storage.objects for delete to authenticated using (bucket_id = 'mensajes_adjuntos');
