-- Corrige el aviso "Function Search Path Mutable" del linter de Supabase sobre la función creada
-- en la migración anterior: sin search_path fijo, un search_path manipulado en la sesión podría
-- hacer que `format`/`execute` resuelvan objetos de otro schema.
alter function public.siguiente_numero_atomico(text) set search_path = public;
