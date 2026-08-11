create table if not exists avatares_compartidos (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  url text not null,
  creado_por text
);

alter table avatares_compartidos disable row level security;
