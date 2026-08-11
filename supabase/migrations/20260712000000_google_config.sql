create table if not exists google_config (
  id int primary key default 1,
  refresh_token text,
  updated_at timestamptz default now(),
  constraint solo_una_fila check (id = 1)
);

alter table google_config disable row level security;
