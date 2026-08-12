-- El fix de anoche (20260811200000) reapuntó los cron jobs a leer la service_role key desde
-- Vault, pero no tocó el timeout de net.http_post — que por defecto es 5000ms. revisar-gmail
-- (llamadas reales a la API de Gmail) tarda habitualmente 7-9s y a veces más, así que aunque la
-- clave ya sea correcta, el disparo de las 06:00 seguiría fallando (esta vez por timeout, no por
-- 401): comprobado en real hoy, una llamada con el timeout por defecto se cortó a los 5000ms sin
-- completar la inserción, y la misma llamada con 20000ms sí completó (200, solicitud insertada).
-- Se sube el timeout de los 2 cron jobs a 20000ms.
select cron.alter_job(
  (select jobid from cron.job where jobname = 'revisar-gmail-diario'),
  command := $$
  select net.http_post(
    url := 'https://mhbicdrquinlwhasrvgo.supabase.co/functions/v1/revisar-gmail',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
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
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
  $$
);
