-- Historial de eventos por documento (presupuesto/factura) para la línea de tiempo del previsualizador.
create table if not exists documento_eventos (
  id uuid primary key default gen_random_uuid(),
  documento_tipo text not null,
  documento_id uuid not null,
  evento text not null,
  created_at timestamptz default now()
);
create index if not exists idx_documento_eventos_doc on documento_eventos(documento_tipo, documento_id);
alter table documento_eventos disable row level security;

-- Vincula un presupuesto normal con el presupuesto orientativo del que se creó (si aplica).
alter table presupuestos add column if not exists presupuesto_origen_id uuid references presupuestos(id) on delete set null;

-- Marca los mensajes de equipo generados automáticamente (p.ej. avisos de cambios en Configuración)
-- para que la Mensajería impida responder directamente a ellos.
alter table mensajes_equipo add column if not exists automatico boolean default false;
