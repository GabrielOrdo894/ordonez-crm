-- Sincronización bancaria automática vía Enable Banking (Edge Function banco-sync, 2026-09-25).
-- Una fila por cuenta autorizada: la sesión de Enable Banking caduca (consentimiento PSD2, máx.
-- 180 días) y hay que reconectar desde Contabilidad → Movimientos bancarios cuando pasa.
create table if not exists public.banco_conexiones (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  proveedor text not null default 'enablebanking',
  aspsp_nombre text not null,
  aspsp_pais text not null,
  session_id text not null,
  account_uid text not null,
  iban text,
  valido_hasta timestamptz,
  estado text not null default 'activa' check (estado in ('activa', 'caducada', 'desconectada')),
  ultima_sincronizacion timestamptz,
  ultimo_error text
);

alter table public.banco_conexiones enable row level security;
drop policy if exists "authenticated_all" on public.banco_conexiones;
create policy "authenticated_all" on public.banco_conexiones
  for all to authenticated using (true) with check (true);

-- origen: 'ofx' (importación manual, lo que ya existía) | 'sincronizacion' (banco-sync).
alter table public.movimientos_banco
  add column if not exists origen text not null default 'ofx' check (origen in ('ofx', 'sincronizacion')),
  add column if not exists conexion_id uuid references public.banco_conexiones(id) on delete set null,
  add column if not exists contraparte text;

comment on column public.movimientos_banco.contraparte is
  'Nombre del ordenante (cobro) o beneficiario (pago) que devuelve el banco — solo movimientos sincronizados.';

-- Sincronización diaria a las 05:30 UTC (antes de alerta-diaria, 06:35), mismo patrón que el resto
-- de cron del proyecto (service_role_key desde Vault).
select cron.unschedule('banco-sync-diario') where exists (select 1 from cron.job where jobname = 'banco-sync-diario');
select cron.schedule(
  'banco-sync-diario',
  '30 5 * * *',
  $$
  select net.http_post(
    url := 'https://mhbicdrquinlwhasrvgo.supabase.co/functions/v1/banco-sync',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{"accion":"sincronizar"}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
