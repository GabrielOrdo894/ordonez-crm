# Migraciones

Las migraciones de la base de datos se aplican en producción (Supabase) y se guardan aquí. Hasta el
2026-10-01 muchas se aplicaron solo desde el panel o el MCP sin guardar su SQL en el repo: la lista
de abajo son las que existen en producción y NO tienen fichero aquí (auditoría 2026-10-01). El
esquema real de producción manda sobre estos ficheros.

Para tener el esquema completo en el repo hace falta Docker y `npx supabase db pull`
(proyecto `mhbicdrquinlwhasrvgo`). A partir de ahora, toda migración nueva se guarda también aquí
con el mismo nombre que en producción.

## Aplicadas en producción sin fichero en el repo

- `20260728160525` bloque6_solicitudes_seguimiento
- `20260728161022` bloque6_disponibilidad_visitas
- `20260728162625` bloque6_cron_revisar_gmail
- `20260728172122` bloque6_solicitudes_v2_estados_costes
- `20260728190318` solicitudes_respuestas_y_deteccion_ia
- `20260728193155` quitar_gmail_mensajes_revisados
- `20260729012941` presupuestos_conversacion_gmail
- `20260805005828` enable_rls_tablas_expuestas
- `20260805010302` restringir_rls_a_autenticados
- `20260805013059` crear_tabla_movimientos_banco
- `20260805014256` completar_rls_tablas_restantes
- `20260805120639` privatizar_bucket_justificantes
- `20260805120708` privatizar_bucket_justificantes_duplicado
- `20260805130123` google_config_refresh_token_gmail
- `20260806134701` papelera_soft_delete_visitas_presupuestos_facturas
- `20260806180536` alerta_diaria_urgentes_cron
- `20260813141749` add_traduccion_presupuestos
- `20260813144938` create_decisiones_societarias
- `20260813150544` add_pipeline_etapa_maxima
- `20260814034056` crea_asientos_contables
- `20260814043950` crea_inmovilizado
- `20260814044305` asientos_contables_tipo_evento
- `20260814225734` add_traduccion_a_proyectos
- `20260815195439` indices_filtros_frecuentes
- `20260816023455` situacion_familiar_gerant_config
- `20260816035747` ingresos_conyuge_gerant_config
- `20260817005541` decisiones_societarias_documento
- `20260817011330` gerant_config_indemnite_locaux
- `20260817012916` gerant_config_reembolso_telefono
- `20260818001348` gastos_estado_gasto_pendiente_pagado
- `20260818001752` cron_automatizaciones_crm
- `20260818144823` automatizacion_lock_crm
- `20260818150228` alerta_diaria_idempotencia
- `20260818182730` check_constraints_solicitudes_funnel
- `20260818183126` desfasar_cron_alerta_diaria
- `20260818185318` visitas_referido_por
- `20260818191105` visitas_proyecto_id_checklist
- `20260818193629` visitas_hora_fin
- `20260818200839` cliente_etiquetas
- `20260818201058` proyectos_fecha_fin_garantia
- `20260818201653` notas_cliente_fecha_seguimiento
- `20260819125749` add_seguimiento_concluido_a_presupuestos
- `20260819125803` quitar_borrador_de_estado_solicitudes
- `20260822131427` facturas_estructura_anterior
- `20260828195334` fotos_previas_visita
- `20260901133313` visitas_fotos_previas_a_jsonb_con_etiqueta
- `20260906225458` add_mensaje_pendiente_presupuestos
- `20260907194051` add_respuesta_programada_solicitudes
- `20260908111110` pagos_factura_y_trazabilidad_asientos
- `20260908141016` movimientos_banco_pago_id
- `20260909072734` galeria_vincular_obra_real
- `20260909075644` presupuestos_plan_pago_not_null
- `20260910141304` documenso_pdf_firmado
- `20260911103446` visitas_recordatorio_enviado_en
- `20260911103543` cron_recordatorio_visita_diario
- `20260912145458` cron_agenda_diaria_ricardo
- `20260913095206` rediseno_resenas_y_referidos
- `20260915191052` solicitudes_estado_5_valores_aceptada_rechazada_eliminada
- `20260916111944` add_acompte_y_factura_final_a_funnel_eventos
- `20260921101321` pipeline_recalculo_automatico_trigger
- `20260921101439` google_oauth_state_csrf
- `20260921102046` galeria_fk_on_delete_set_null
- `20260921102655` presupuestos_formato_check_constraint
- `20260929163625` gerant_remuneracion_desde
