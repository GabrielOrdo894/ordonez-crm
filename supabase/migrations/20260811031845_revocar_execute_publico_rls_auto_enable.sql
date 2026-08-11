-- rls_auto_enable() es un event trigger interno (auto-activa RLS en tablas nuevas de public).
-- No necesita ser invocable vía RPC (/rest/v1/rpc/rls_auto_enable) por anon/authenticated.
-- Revocar EXECUTE no afecta al event trigger, que lo invoca directamente sin pasar por PostgREST.
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM authenticated;
