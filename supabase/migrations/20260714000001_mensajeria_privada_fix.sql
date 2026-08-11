-- Mensajería privada: SelectorDestinatarios necesita leer usuarios_equipo para poder elegir un
-- destinatario individual. Esa tabla se creó fuera de las migraciones trackeadas (a diferencia de
-- mensajes_equipo, nunca se le desactivó RLS) — con RLS activado y sin políticas, la lectura
-- devuelve 0 filas en vez de error, así que el selector queda vacío y todo mensaje se envía
-- sin destinatario_ids (público), aunque el código de envío/filtrado en sí es correcto.
alter table usuarios_equipo disable row level security;

-- Adjuntos de mensajería: el bucket mensajes_adjuntos nunca tuvo políticas de storage.objects
-- (a diferencia de justificantes/avatares, ver docs/supabase-schema.md) — de ahí el error
-- "new row violates row-level security policy" al subir un archivo.
insert into storage.buckets (id, name, public)
values ('mensajes_adjuntos', 'mensajes_adjuntos', true)
on conflict (id) do update set public = true;

drop policy if exists "mensajes_adjuntos_select" on storage.objects;
create policy "mensajes_adjuntos_select" on storage.objects
  for select using (bucket_id = 'mensajes_adjuntos');

drop policy if exists "mensajes_adjuntos_insert" on storage.objects;
create policy "mensajes_adjuntos_insert" on storage.objects
  for insert with check (bucket_id = 'mensajes_adjuntos');

drop policy if exists "mensajes_adjuntos_update" on storage.objects;
create policy "mensajes_adjuntos_update" on storage.objects
  for update using (bucket_id = 'mensajes_adjuntos');

drop policy if exists "mensajes_adjuntos_delete" on storage.objects;
create policy "mensajes_adjuntos_delete" on storage.objects
  for delete using (bucket_id = 'mensajes_adjuntos');
