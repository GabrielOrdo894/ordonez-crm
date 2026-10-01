-- Auditoría 2026-10-01: un acompte cobrado marcaba la obra como "Finalizado" (Florent, Laetitia,
-- Pascale). Solo la factura final (tipo normal) cobrada cierra la obra. Misma corrección en
-- src/lib/pipelineSync.ts. La función completa se redefinió en producción con el cambio en la
-- consulta de v_factura_cobrada:
--   select exists(select 1 from facturas where visita_id = p_visita_id and eliminado_en is null
--                 and estado_cobro = 'Cobrada' and tipo = 'normal') into v_factura_cobrada;
-- (ver pg_get_functiondef('public.sincronizar_pipeline_visita') para el cuerpo entero).

update visitas v set pipeline_etapa_maxima = 'Presupuesto aceptado'
where v.eliminado_en is null and v.pipeline_etapa_maxima = 'Finalizado'
  and not exists (select 1 from facturas f where f.visita_id = v.id and f.eliminado_en is null and f.estado_cobro = 'Cobrada' and f.tipo = 'normal')
  and not exists (select 1 from proyectos p join presupuestos pr on pr.id = p.presupuesto_id where pr.visita_id = v.id and p.estado = 'Finalizado');
select public.sincronizar_pipeline_visita(id) from visitas where eliminado_en is null;
