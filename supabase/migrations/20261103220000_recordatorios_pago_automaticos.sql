-- Recordatorios automáticos de facturas vencidas — 2026-11-03 (decisión de Gabriel: programados y
-- cancelables, en tres pasos a +3, +10 y +20 días del vencimiento). La Edge Function
-- recordatorio-pago-automatico (cron diario) programa el paso que toque y lo envía al día siguiente:
-- esas 24 h son el margen para cancelarlo desde la factura (la campana avisa). Antes de enviar
-- comprueba que la factura sigue con importe pendiente.
create table if not exists public.recordatorios_pago (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  factura_id uuid not null references public.facturas(id),
  paso smallint not null check (paso between 1 and 3),
  estado text not null default 'programado' check (estado in ('programado', 'enviado', 'cancelado')),
  programado_en timestamptz not null default now(),
  enviado_en timestamptz,
  email text,
  importe_pendiente numeric(12, 2),
  motivo_cancelacion text,
  unique (factura_id, paso)
);
create index if not exists recordatorios_pago_estado_idx on public.recordatorios_pago (estado);
alter table public.recordatorios_pago enable row level security;
drop policy if exists "acceso equipo autenticado" on public.recordatorios_pago;
create policy "acceso equipo autenticado" on public.recordatorios_pago
  for all to authenticated using (es_miembro_equipo()) with check (es_miembro_equipo());
comment on table public.recordatorios_pago is 'Recordatorios de pago de facturas vencidas (pasos 1-3 a +3/+10/+20 días). Los programa y envía recordatorio-pago-automatico; se cancelan desde la factura.';

alter table public.facturas add column if not exists recordatorios_desactivados boolean not null default false;
comment on column public.facturas.recordatorios_desactivados is 'true: no se programan recordatorios automáticos de pago para esta factura (acuerdo con el cliente, litigio...).';

select cron.schedule(
  'recordatorio-pago-diario',
  '15 7 * * *',
  $cron$
  select net.http_post(
    url := 'https://mhbicdrquinlwhasrvgo.supabase.co/functions/v1/recordatorio-pago-automatico',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $cron$
);
