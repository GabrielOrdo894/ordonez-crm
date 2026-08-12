-- Advisory de performance de Supabase (auth_rls_initplan, auditoría 2026-08-12): las 3 políticas de
-- mensajes_equipo reevaluaban auth.uid() fila a fila en vez de una sola vez por consulta. No es un
-- fallo de seguridad, solo ineficiente a escala — se corrige envolviendo auth.uid() en un subselect,
-- mismo patrón recomendado por Supabase y ya aplicado al resto de políticas del proyecto.
alter policy mensajes_equipo_select on public.mensajes_equipo
  using (destinatario_ids is null or (select auth.uid()) = any (destinatario_ids) or autor_id = (select auth.uid()));

alter policy mensajes_equipo_insert on public.mensajes_equipo
  with check (autor_id = (select auth.uid()));

alter policy mensajes_equipo_update on public.mensajes_equipo
  using (destinatario_ids is null or (select auth.uid()) = any (destinatario_ids) or autor_id = (select auth.uid()))
  with check (destinatario_ids is null or (select auth.uid()) = any (destinatario_ids) or autor_id = (select auth.uid()));
