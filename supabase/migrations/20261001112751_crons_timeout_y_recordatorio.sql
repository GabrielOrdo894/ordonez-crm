-- Auditoría 2026-10-01: revisar-gmail tarda ~25 s y pg_net cortaba a los 20 s (resultado perdido
-- aunque la función terminara). Todos los crons de Edge Functions a 60 s, como banco-sync y
-- resena-automatica.
select cron.alter_job(jobid, command := replace(command, 'timeout_milliseconds := 20000', 'timeout_milliseconds := 60000'))
from cron.job where command like '%timeout_milliseconds := 20000%';
-- Recordatorio de visita antes de las primeras visitas del día (07:30 en verano, 06:30 en invierno).
select cron.alter_job(jobid, schedule := '30 5 * * *') from cron.job where jobname = 'recordatorio-visita-diario';

-- Lock de revisar-gmail (una ejecución a la vez, mínimo 2 minutos entre pasadas).
insert into public.automatizacion_lock (nombre, corriendo, iniciado_en) values ('revisar-gmail', false, now() - interval '1 hour') on conflict (nombre) do nothing;
