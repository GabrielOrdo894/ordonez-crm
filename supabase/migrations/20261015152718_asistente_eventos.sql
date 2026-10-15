-- Eventos del asistente web de ordonezrenov.com (2026-10-15, petición de Gabriel): cada paso que
-- da un visitante (aviso, apertura, opción elegida, volver, cerrar, WhatsApp, envío) para ver en
-- Solicitudes → Asistente web el embudo y las rutas. Anónimo: `sesion` es un código aleatorio que
-- solo vive mientras la página está abierta (sin cookies ni almacenamiento), sin datos personales.
-- Solo escribe la Edge Function asistente-eventos (service role); el equipo solo lee.
create table public.asistente_eventos (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  sesion text not null,
  evento text not null,
  paso smallint,
  valor text,
  pagina text,
  idioma text,
  dispositivo text,
  solicitud_id uuid references public.solicitudes(id) on delete set null
);

create index asistente_eventos_created_at_idx on public.asistente_eventos (created_at);
create index asistente_eventos_sesion_idx on public.asistente_eventos (sesion);
create index asistente_eventos_solicitud_idx on public.asistente_eventos (solicitud_id) where solicitud_id is not null;

alter table public.asistente_eventos enable row level security;

create policy "asistente_eventos lectura equipo" on public.asistente_eventos
  for select to authenticated using (public.es_miembro_equipo());

revoke all on public.asistente_eventos from anon;
