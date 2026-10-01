-- Los triggers de pipeline llaman a sincronizar_pipeline_visita, cuyo EXECUTE se revocó a authenticated
-- en 20261001112339_seguridad_y_restricciones. Como los triggers eran SECURITY INVOKER, cualquier
-- INSERT/UPDATE en visitas/presupuestos/facturas/proyectos fallaba con "permission denied".
-- Pasan a SECURITY DEFINER (search_path ya fijado a public); los triggers no necesitan EXECUTE para dispararse.
alter function public.trg_pipeline_sync_visitas() security definer;
alter function public.trg_pipeline_sync_presupuestos() security definer;
alter function public.trg_pipeline_sync_facturas() security definer;
alter function public.trg_pipeline_sync_proyectos() security definer;
revoke execute on function public.trg_pipeline_sync_visitas() from public, anon, authenticated;
revoke execute on function public.trg_pipeline_sync_presupuestos() from public, anon, authenticated;
revoke execute on function public.trg_pipeline_sync_facturas() from public, anon, authenticated;
revoke execute on function public.trg_pipeline_sync_proyectos() from public, anon, authenticated;
