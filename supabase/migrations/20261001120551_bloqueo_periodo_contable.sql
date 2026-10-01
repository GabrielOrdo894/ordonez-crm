-- Auditoría 2026-10-01, Fase 2 — cierre de periodos. Hasta fecha_bloqueo_contable (incluida) no se
-- puede crear, cambiar ni anular nada con efecto contable: ni asientos, ni gastos pagados, ni
-- cobros, ni facturas. Antes, editar en 2027 un gasto de 2026 insertaba su corrección con fecha de
-- 2026 y cambiaba un ejercicio cerrado o una CA3 ya presentada. Las correcciones de un periodo
-- cerrado se hacen con una operación diversa (OD) en el periodo abierto.
-- Se fija sola al marcar una CA3 como declarada (fin de ese mes) y al cerrar el ejercicio.
alter table public.empresa_config add column if not exists fecha_bloqueo_contable date;

create or replace function public.periodo_bloqueado(p_fecha date)
returns boolean
language sql
stable
set search_path = public
as $$
  select p_fecha is not null
     and p_fecha <= coalesce((select fecha_bloqueo_contable from empresa_config where id = 1), '-infinity'::date);
$$;

create or replace function public.mensaje_periodo_bloqueado(p_fecha date)
returns text
language sql
stable
set search_path = public
as $$
  select format('El periodo contable está cerrado hasta el %s (CA3 declarada o ejercicio cerrado) y no se puede modificar lo del %s. Corrígelo con una operación diversa en el periodo abierto (Contabilidad → Operaciones diversas).',
    to_char((select fecha_bloqueo_contable from empresa_config where id = 1), 'DD/MM/YYYY'),
    to_char(p_fecha, 'DD/MM/YYYY'));
$$;

-- Libro diario
create or replace function public.bloqueo_asientos()
returns trigger language plpgsql set search_path = public as $$
begin
  if periodo_bloqueado(new.fecha) then
    raise exception '%', mensaje_periodo_bloqueado(new.fecha);
  end if;
  return new;
end;
$$;
drop trigger if exists bloqueo_asientos on public.asientos_contables;
create trigger bloqueo_asientos before insert on public.asientos_contables
  for each row execute function public.bloqueo_asientos();

-- Gastos pagados (los pendientes no están contabilizados)
create or replace function public.bloqueo_gastos()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.estado_gasto = 'pagado' and periodo_bloqueado(old.fecha) then
      raise exception '%', mensaje_periodo_bloqueado(old.fecha);
    end if;
    return old;
  end if;
  if tg_op = 'INSERT' then
    if new.estado_gasto = 'pagado' and periodo_bloqueado(new.fecha) then
      raise exception '%', mensaje_periodo_bloqueado(new.fecha);
    end if;
    return new;
  end if;
  if (old.fecha, old.importe_base, old.importe_iva, old.cuenta_contable, old.tipo_iva, old.estado_gasto, old.pais, old.km)
     is distinct from
     (new.fecha, new.importe_base, new.importe_iva, new.cuenta_contable, new.tipo_iva, new.estado_gasto, new.pais, new.km) then
    if old.estado_gasto = 'pagado' and periodo_bloqueado(old.fecha) then
      raise exception '%', mensaje_periodo_bloqueado(old.fecha);
    end if;
    if new.estado_gasto = 'pagado' and periodo_bloqueado(new.fecha) then
      raise exception '%', mensaje_periodo_bloqueado(new.fecha);
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists bloqueo_gastos on public.gastos;
create trigger bloqueo_gastos before insert or update or delete on public.gastos
  for each row execute function public.bloqueo_gastos();

-- Cobros
create or replace function public.bloqueo_pagos()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' and periodo_bloqueado(new.fecha) then
    raise exception '%', mensaje_periodo_bloqueado(new.fecha);
  end if;
  if tg_op = 'UPDATE' and (old.fecha, old.monto, old.anulado_en) is distinct from (new.fecha, new.monto, new.anulado_en)
     and (periodo_bloqueado(old.fecha) or periodo_bloqueado(new.fecha)) then
    raise exception '%', mensaje_periodo_bloqueado(least(old.fecha, new.fecha));
  end if;
  return new;
end;
$$;
drop trigger if exists bloqueo_pagos on public.pagos_factura;
create trigger bloqueo_pagos before insert or update on public.pagos_factura
  for each row execute function public.bloqueo_pagos();

-- Facturas nuevas con fecha de un periodo cerrado
create or replace function public.bloqueo_facturas()
returns trigger language plpgsql set search_path = public as $$
begin
  if periodo_bloqueado(new.fecha_factura) then
    raise exception '%', mensaje_periodo_bloqueado(new.fecha_factura);
  end if;
  return new;
end;
$$;
drop trigger if exists bloqueo_facturas on public.facturas;
create trigger bloqueo_facturas before insert on public.facturas
  for each row execute function public.bloqueo_facturas();
