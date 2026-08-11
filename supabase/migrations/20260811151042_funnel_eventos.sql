-- Bloque 6 (rediseño) — tracking del embudo solicitud → presupuesto → firma.
-- Mismo criterio que documento_eventos (src/lib/eventos.ts): registro secundario para analítica,
-- nunca bloquea la acción principal que lo dispara.
create table if not exists funnel_eventos (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  solicitud_id uuid references solicitudes(id) on delete set null,
  presupuesto_id uuid references presupuestos(id) on delete set null,
  etapa text not null,
  fuente text,
  meta jsonb default '{}'
);

create index if not exists idx_funnel_eventos_etapa_created on funnel_eventos(etapa, created_at);
create index if not exists idx_funnel_eventos_solicitud_id on funnel_eventos(solicitud_id);
create index if not exists idx_funnel_eventos_presupuesto_id on funnel_eventos(presupuesto_id);

alter table funnel_eventos enable row level security;
create policy "funnel_eventos_all" on funnel_eventos for all to authenticated using (true) with check (true);
