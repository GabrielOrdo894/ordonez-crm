-- Auditoría completa 2026-10-01, Fase 1 — integridad contable y legal de facturas, pagos y libro.
-- Compatible con la versión anterior del frontend (solo añade columnas, triggers y permisos).

-- 1. Pagos: anulación lógica en vez de DELETE. asientos_contables.pago_id y movimientos_banco.pago_id
--    apuntan a pagos_factura sin ON DELETE, así que un pago contabilizado no se podía borrar nunca
--    ("Eliminar pago" fallaba y "Deshacer" en Banco dejaba el libro a medias).
alter table public.pagos_factura
  add column if not exists anulado_en timestamptz,
  add column if not exists anulado_por text;
-- Reembolsos de facturas rectificativas = pagos negativos.
alter table public.pagos_factura drop constraint if exists pagos_factura_monto_check;
alter table public.pagos_factura add constraint pagos_factura_monto_check check (monto <> 0);
create index if not exists pagos_factura_factura_activos_idx on public.pagos_factura (factura_id) where anulado_en is null;

-- 2. Rectificativas: parte de su TVA que corrige TVA ya exigible (cobrada) de la factura original.
--    El resto anula TVA en espera (44574) que nunca se declaró. Se fija al emitirla.
alter table public.facturas add column if not exists fraccion_tva_exigible numeric;

-- 3. Numeración en la base de datos, dentro de la misma transacción que el INSERT: un fallo ya no
--    deja huecos, se saltan números ocupados, el año sale de fecha_factura, series separadas por
--    emisor (EURL Francia: F / AC / R — autónomo España: FE / ACE / RE) y orden cronológico.
alter table public.empresa_config
  add column if not exists seq_factura_es integer not null default 0,
  add column if not exists seq_factura_acompte_es integer not null default 0,
  add column if not exists seq_factura_rectificativa_es integer not null default 0;

create or replace function public.asignar_numero_factura()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_campo text;
  v_prefijo text;
  v_valor int;
  v_numero text;
  v_ultima record;
begin
  if new.numero is not null then
    return new;
  end if;
  if new.fecha_factura is null then
    raise exception 'La factura necesita fecha para poder numerarse.';
  end if;
  if new.pais is null or new.pais not in ('Francia', 'España') then
    raise exception 'La factura necesita país (Francia o España) para elegir su serie de numeración.';
  end if;

  v_campo := case new.tipo when 'acompte' then 'seq_factura_acompte' when 'rectificativa' then 'seq_factura_rectificativa' else 'seq_factura' end;
  v_prefijo := case new.tipo when 'acompte' then 'AC' when 'rectificativa' then 'R' else 'F' end;
  if new.pais = 'España' then
    v_campo := v_campo || '_es';
    v_prefijo := v_prefijo || 'E';
  end if;

  -- Orden cronológico dentro de la serie (las de estructura_anterior son de otro emisor y no cuentan).
  if not coalesce(new.estructura_anterior, false) then
    select numero, fecha_factura into v_ultima
    from facturas
    where numero like v_prefijo || '-%' and not coalesce(estructura_anterior, false)
    order by fecha_factura desc
    limit 1;
    if found and v_ultima.fecha_factura > new.fecha_factura then
      raise exception 'La fecha de la factura (%) es anterior a la de la última factura de la serie % (% del %). Las facturas deben numerarse en orden cronológico.',
        to_char(new.fecha_factura, 'DD/MM/YYYY'), v_prefijo, v_ultima.numero, to_char(v_ultima.fecha_factura, 'DD/MM/YYYY');
    end if;
  end if;

  loop
    execute format('update empresa_config set %I = coalesce(%I, 0) + 1 where id = 1 returning %I', v_campo, v_campo, v_campo)
      into v_valor;
    v_numero := v_prefijo || '-' || to_char(new.fecha_factura, 'YYYY') || '-' || lpad(v_valor::text, 4, '0');
    exit when not exists (select 1 from facturas where numero = v_numero);
  end loop;

  new.numero := v_numero;
  return new;
end;
$$;

drop trigger if exists asignar_numero_factura on public.facturas;
create trigger asignar_numero_factura before insert on public.facturas
  for each row execute function public.asignar_numero_factura();

-- 4. Una factura numerada no se modifica: los cambios de importe, fecha, IVA, país o tipo se hacen
--    con una factura rectificativa (art. 242 nonies A ann. II CGI / RD 1619/2012).
create or replace function public.proteger_factura_emitida()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.numero is not null and (
       new.numero is distinct from old.numero
    or new.tipo is distinct from old.tipo
    or new.fecha_factura is distinct from old.fecha_factura
    or new.lineas is distinct from old.lineas
    or new.tipo_iva is distinct from old.tipo_iva
    or new.pais is distinct from old.pais
    or new.estructura_anterior is distinct from old.estructura_anterior
    or new.factura_original_id is distinct from old.factura_original_id
    or new.fraccion_tva_exigible is distinct from old.fraccion_tva_exigible
  ) then
    raise exception 'La factura % ya está emitida: no se pueden cambiar importes, fechas, IVA, país ni tipo. Corrígela con una factura rectificativa.', old.numero;
  end if;
  return new;
end;
$$;

drop trigger if exists proteger_factura_emitida on public.facturas;
create trigger proteger_factura_emitida before update on public.facturas
  for each row execute function public.proteger_factura_emitida();

-- 5. Libro diario inalterable también a nivel de permisos (antes solo por RLS: service_role podía
--    modificarlo o vaciarlo).
revoke update, delete, truncate on public.asientos_contables from anon, authenticated, service_role;

create or replace function public.libro_inalterable()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'El libro diario es inalterable: un apunte se corrige con otro apunte, nunca editándolo ni borrándolo.';
end;
$$;

drop trigger if exists libro_inalterable_filas on public.asientos_contables;
create trigger libro_inalterable_filas before update or delete on public.asientos_contables
  for each row execute function public.libro_inalterable();
drop trigger if exists libro_inalterable_truncate on public.asientos_contables;
create trigger libro_inalterable_truncate before truncate on public.asientos_contables
  for each statement execute function public.libro_inalterable();

-- 6. Facturas vencidas: nada pasaba nunca una factura a 'Vencida', así que el aviso diario de impagos
--    y los KPI de vencidas no encontraban nada. Las rectificativas no vencen.
create or replace function public.marcar_facturas_vencidas()
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_n integer;
begin
  update facturas
  set estado_cobro = 'Vencida'
  where estado_cobro in ('Pendiente', 'Cobrada parcialmente')
    and tipo <> 'rectificativa'
    and eliminado_en is null
    and fecha_vence < (now() at time zone 'Europe/Paris')::date;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke execute on function public.marcar_facturas_vencidas() from public, anon, authenticated;

select cron.unschedule('marcar-facturas-vencidas') where exists (select 1 from cron.job where jobname = 'marcar-facturas-vencidas');
-- 05:00 UTC: antes del aviso diario (alerta-diaria, 06:35 UTC).
select cron.schedule('marcar-facturas-vencidas', '0 5 * * *', 'select public.marcar_facturas_vencidas()');
select public.marcar_facturas_vencidas();
