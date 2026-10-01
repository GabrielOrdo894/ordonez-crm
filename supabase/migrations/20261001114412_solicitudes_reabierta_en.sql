-- "Marcar como Nueva" a mano: revisar-gmail solo cuenta como respuesta nuestra un correo posterior a
-- esta fecha (antes el correo antiguo la volvía a marcar Enviada en la siguiente pasada — auditoría
-- 2026-10-01).
alter table public.solicitudes add column if not exists reabierta_en timestamptz;
