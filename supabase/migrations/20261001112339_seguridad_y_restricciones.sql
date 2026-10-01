-- Auditoría completa 2026-10-01, Fase 3 — seguridad y restricciones de base de datos.

-- 1. Acceso solo para el equipo. Las políticas eran `authenticated using (true)`: con el registro
--    público de Auth abierto, cualquiera que confirmara un email tenía acceso total. Ahora además
--    hay que estar en usuarios_equipo (los 3 usuarios actuales lo están).
create or replace function public.es_miembro_equipo()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.usuarios_equipo where id = auth.uid());
$$;
revoke execute on function public.es_miembro_equipo() from public, anon;
grant execute on function public.es_miembro_equipo() to authenticated;

do $$
declare
  p record;
begin
  for p in
    select tablename, policyname, cmd, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and roles::text like '%authenticated%'
      and (qual = 'true' or with_check = 'true')
  loop
    if p.tablename = 'usuarios_equipo' then
      -- Cada usuario sigue pudiendo leer su propia fila (el login la consulta).
      execute format('alter policy %I on public.usuarios_equipo using (id = auth.uid() or public.es_miembro_equipo()) with check (public.es_miembro_equipo())', p.policyname);
    elsif p.cmd = 'INSERT' then
      execute format('alter policy %I on public.%I with check (public.es_miembro_equipo())', p.policyname, p.tablename);
    elsif p.cmd = 'SELECT' or p.cmd = 'DELETE' then
      execute format('alter policy %I on public.%I using (public.es_miembro_equipo())', p.policyname, p.tablename);
    else
      execute format('alter policy %I on public.%I using (public.es_miembro_equipo()) with check (public.es_miembro_equipo())', p.policyname, p.tablename);
    end if;
  end loop;
end $$;

-- 2. sincronizar_pipeline_visita es SECURITY DEFINER y se podía llamar como anon por /rest/v1/rpc.
--    Los triggers la siguen ejecutando.
revoke execute on function public.sincronizar_pipeline_visita(uuid) from public, anon, authenticated;
alter function public.pipeline_etapa_maxima set search_path = public;
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as firma from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname like 'trg_pipeline_%'
  loop
    execute format('alter function %s set search_path = public', f.firma);
  end loop;
end $$;

-- 3. Webhook de base de datos sin uso: mandaba la fila entera de cada visita nueva (datos del
--    cliente) a google-oauth-callback, que no la procesa, con un secreto vacío.
drop trigger if exists "Database Webhooks" on public.visitas;

-- 4. Adjuntos de la mensajería interna: bucket privado (el frontend firma las URLs).
update storage.buckets set public = false where id = 'mensajes_adjuntos';

-- 5. Embudo: limpieza de huérfanos y duplicados, y unicidad por etapa (registrarEventoFunnel ya
--    pretendía ser idempotente, pero comprobar-y-luego-insertar no lo es con dos ejecuciones a la vez).
delete from public.funnel_eventos where solicitud_id is null and presupuesto_id is null;
delete from public.funnel_eventos f
using public.funnel_eventos g
where f.etapa = g.etapa and f.presupuesto_id = g.presupuesto_id and f.presupuesto_id is not null
  and (f.created_at, f.id) > (g.created_at, g.id);
delete from public.funnel_eventos f
using public.funnel_eventos g
where f.etapa = g.etapa and f.solicitud_id = g.solicitud_id and f.solicitud_id is not null
  and f.presupuesto_id is null and g.presupuesto_id is null
  and (f.created_at, f.id) > (g.created_at, g.id);
create unique index if not exists funnel_eventos_etapa_presupuesto_uidx
  on public.funnel_eventos (etapa, presupuesto_id) where presupuesto_id is not null;
create unique index if not exists funnel_eventos_etapa_solicitud_uidx
  on public.funnel_eventos (etapa, solicitud_id) where solicitud_id is not null and presupuesto_id is null;

-- 6. Restricciones de estado (los datos actuales ya las cumplen).
alter table public.visitas add constraint visitas_estado_check
  check (estado is null or estado in ('Pendiente', 'Realizada', 'Cancelada')) not valid;
alter table public.visitas validate constraint visitas_estado_check;
alter table public.presupuestos add constraint presupuestos_estado_check
  check (estado in ('Borrador', 'Pendiente', 'Aceptado', 'Rechazado')) not valid;
alter table public.presupuestos validate constraint presupuestos_estado_check;
alter table public.presupuestos add constraint presupuestos_tipo_check
  check (tipo in ('normal', 'orientativo')) not valid;
alter table public.presupuestos validate constraint presupuestos_tipo_check;
alter table public.facturas add constraint facturas_estado_cobro_check
  check (estado_cobro in ('Pendiente', 'Cobrada', 'Cobrada parcialmente', 'Vencida', 'Aplicada', 'Reembolsada')) not valid;
alter table public.facturas validate constraint facturas_estado_cobro_check;
alter table public.facturas add constraint facturas_tipo_check
  check (tipo in ('normal', 'acompte', 'rectificativa')) not valid;
alter table public.facturas validate constraint facturas_tipo_check;
alter table public.facturas add constraint facturas_pais_check
  check (pais in ('Francia', 'España')) not valid;
alter table public.facturas validate constraint facturas_pais_check;
alter table public.facturas add constraint facturas_tipo_iva_check
  check (tipo_iva is null or tipo_iva in ('IVA_21', 'IVA_10', 'TVA_10', 'TVA_20', 'EXENTO')) not valid;
alter table public.facturas validate constraint facturas_tipo_iva_check;
alter table public.gastos add constraint gastos_tipo_iva_check
  check (tipo_iva is null or tipo_iva in ('IVA_21', 'IVA_10', 'TVA_10', 'TVA_20', 'TVA_55', 'EXENTO', 'INTRACOM', 'IMPORTACION')) not valid;
alter table public.gastos validate constraint gastos_tipo_iva_check;
alter table public.asientos_contables add constraint asientos_importes_check
  check (debe >= 0 and haber >= 0 and (debe = 0) <> (haber = 0)) not valid;
alter table public.asientos_contables validate constraint asientos_importes_check;
alter table public.movimientos_banco add constraint movimientos_banco_estado_check
  check (estado in ('Pendiente', 'Vinculado', 'Ignorado')) not valid;
alter table public.movimientos_banco validate constraint movimientos_banco_estado_check;

-- 7. Índices de claves foráneas (advisor) y del documento de cada asiento.
create index if not exists asientos_contables_pago_id_idx on public.asientos_contables (pago_id);
create index if not exists asientos_contables_documento_idx on public.asientos_contables (documento_tipo, documento_id);
create index if not exists movimientos_banco_conexion_id_idx on public.movimientos_banco (conexion_id);
create index if not exists movimientos_banco_pago_id_idx on public.movimientos_banco (pago_id);
create index if not exists visitas_proyecto_id_idx on public.visitas (proyecto_id);

-- 8. El código guarda 'Español'/'Français', no 'es'.
alter table public.presupuestos alter column idioma set default 'Español';
alter table public.facturas alter column idioma set default 'Español';
alter table public.proyectos alter column idioma set default 'Español';

-- 9. Mensajería interna: solo el equipo, y los borradores solo los ve su autor (antes un borrador
--    sin destinatarios lo veían y contaban como no leído todos).
alter policy mensajes_equipo_insert on public.mensajes_equipo
  with check (public.es_miembro_equipo() and autor_id = (select auth.uid()));
alter policy mensajes_equipo_select on public.mensajes_equipo
  using (
    public.es_miembro_equipo() and (
      autor_id = (select auth.uid())
      or (not coalesce(borrador, false) and (destinatario_ids is null or (select auth.uid()) = any (destinatario_ids)))
    )
  );
alter policy mensajes_equipo_update on public.mensajes_equipo
  using (
    public.es_miembro_equipo() and (
      autor_id = (select auth.uid())
      or (not coalesce(borrador, false) and (destinatario_ids is null or (select auth.uid()) = any (destinatario_ids)))
    )
  )
  with check (
    public.es_miembro_equipo() and (
      autor_id = (select auth.uid())
      or (not coalesce(borrador, false) and (destinatario_ids is null or (select auth.uid()) = any (destinatario_ids)))
    )
  );

-- 10. Storage: todas las políticas de storage.objects exigen además ser del equipo (los buckets
--     públicos — galeria, empresa, avatares — se siguen sirviendo por su URL pública).
do $$
declare p record;
begin
  for p in select policyname, cmd, qual, with_check from pg_policies where schemaname = 'storage' and tablename = 'objects'
           and coalesce(qual, '') not like '%es_miembro_equipo%' and coalesce(with_check, '') not like '%es_miembro_equipo%' loop
    if p.cmd = 'INSERT' then
      execute format('alter policy %I on storage.objects with check ((%s) and public.es_miembro_equipo())', p.policyname, p.with_check);
    elsif p.cmd in ('SELECT', 'DELETE', 'UPDATE') then
      execute format('alter policy %I on storage.objects using ((%s) and public.es_miembro_equipo())', p.policyname, p.qual);
    else
      execute format('alter policy %I on storage.objects using ((%s) and public.es_miembro_equipo()) with check ((%s) and public.es_miembro_equipo())', p.policyname, p.qual, coalesce(p.with_check, p.qual));
    end if;
  end loop;
end $$;
