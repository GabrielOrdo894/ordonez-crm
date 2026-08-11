-- La migración de RLS de mensajería de hoy (20260811160512) añadió políticas correctas pero no
-- quitó la política genérica antigua "acceso equipo autenticado" (ALL, true, true) que ya existía
-- desde que se activó RLS por primera vez (2026-08-05) — Postgres combina políticas permisivas
-- con OR, así que esa política vieja por sí sola seguía dando acceso completo a cualquier
-- autenticado sobre mensajes privados, dejando el hueco original sin cerrar de verdad.
-- Confirmado por el advisor de Supabase (multiple_permissive_policies). Revisión 2026-08-11.
drop policy "acceso equipo autenticado" on mensajes_equipo;
drop policy "acceso equipo autenticado" on usuarios_equipo;
