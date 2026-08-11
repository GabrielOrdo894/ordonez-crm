-- mensajes_equipo tenía RLS desactivado desde su creación (20260713000001_mensajes_equipo_rls_off.sql)
-- — el filtro de "mensaje privado a estos destinatarios" solo vivía en el cliente
-- (MensajeriaPage.tsx/useNotificaciones.ts), así que cualquier usuario autenticado podía leer la
-- tabla completa vía la API REST directamente, saltándose el filtro. Revisión de seguridad 2026-08-11.
alter table mensajes_equipo enable row level security;

create policy "mensajes_equipo_select" on mensajes_equipo
  for select to authenticated
  using (destinatario_ids is null or auth.uid() = any(destinatario_ids) or autor_id = auth.uid());

create policy "mensajes_equipo_insert" on mensajes_equipo
  for insert to authenticated
  with check (autor_id = auth.uid());

-- update cubre marcar leído/archivar/destacar/eliminar-para-mí (arrays *_por) tanto de mensajes
-- propios como de mensajes recibidos — mismo criterio de visibilidad que select.
create policy "mensajes_equipo_update" on mensajes_equipo
  for update to authenticated
  using (destinatario_ids is null or auth.uid() = any(destinatario_ids) or autor_id = auth.uid())
  with check (destinatario_ids is null or auth.uid() = any(destinatario_ids) or autor_id = auth.uid());

-- usuarios_equipo solo expone id+nombre (para mostrar el remitente en mensajería) — sin RLS desde
-- su creación, baja severidad pero se cierra por consistencia con el resto del proyecto.
alter table usuarios_equipo enable row level security;
create policy "usuarios_equipo_all" on usuarios_equipo for all to authenticated using (true) with check (true);
