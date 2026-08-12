-- Los 2 cron jobs diarios llamaban a sus Edge Functions con la clave anon, que la revisión de
-- seguridad de hoy (esLlamadaAutorizada en revisar-gmail/alerta-diaria) ahora rechaza — el
-- siguiente disparo (mañana 06:00/06:30 UTC) habría fallado en silencio con 401. Se reapuntan
-- para leer la service_role key desde Vault en vez de llevarla embebida en el comando. Falta
-- un único paso manual (no se puede hacer por SQL/MCP): ejecutar en el SQL Editor de Supabase
--   select vault.create_secret('<service_role_key real>', 'service_role_key');
-- con la clave real de Settings → API → service_role. Hasta que exista ese secreto, el
-- Authorization quedará vacío y seguirá fallando igual que antes — no lo empeora.
select cron.alter_job(
  (select jobid from cron.job where jobname = 'revisar-gmail-diario'),
  command := $$
  select net.http_post(
    url := 'https://mhbicdrquinlwhasrvgo.supabase.co/functions/v1/revisar-gmail',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

select cron.alter_job(
  (select jobid from cron.job where jobname = 'alerta-diaria-urgentes'),
  command := $$
  select net.http_post(
    url := 'https://mhbicdrquinlwhasrvgo.supabase.co/functions/v1/alerta-diaria',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
