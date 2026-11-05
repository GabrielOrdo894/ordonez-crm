-- Medición propia de las webs filiales (2026-11-05, petición de Gabriel): costabath.com,
-- ordonezfachadas.com y ordonezstudio.com. Cada fila es un evento de una visita: página vista,
-- scroll, tiempo visible, clic en WhatsApp/teléfono/email/botón de contacto, pasos y envío del
-- formulario. Se ve en Solicitudes → Webs filiales. Sin cookies ni datos personales: `sesion` es
-- un código aleatorio que vive en sessionStorage de la pestaña (se borra al cerrarla); `vista_n`
-- numera las páginas vistas dentro de esa sesión. Solo escribe la Edge Function web-eventos
-- (service role); el equipo solo lee.
create table public.web_eventos (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  sitio text not null check (sitio in ('costabath', 'ordonezfachadas', 'ordonezstudio')),
  sesion text not null,
  vista_n smallint not null,
  evento text not null,
  numero integer,
  valor text,
  pagina text,
  idioma text,
  dispositivo text,
  referente text,
  utm_fuente text,
  utm_medio text,
  utm_campana text,
  solicitud_id uuid references public.solicitudes(id) on delete set null
);

create index web_eventos_created_at_idx on public.web_eventos (created_at);
create index web_eventos_sesion_idx on public.web_eventos (sesion);
create index web_eventos_solicitud_idx on public.web_eventos (solicitud_id) where solicitud_id is not null;

alter table public.web_eventos enable row level security;

create policy "web_eventos lectura equipo" on public.web_eventos
  for select to authenticated using (public.es_miembro_equipo());

revoke all on public.web_eventos from anon;
revoke insert, update, delete, truncate on public.web_eventos from authenticated;
