-- Conciliación bancaria v2 — 2026-11-03 (petición de Gabriel).
--
-- 1. movimientos_banco_enlaces: un movimiento puede cubrir varios documentos (una transferencia que
--    paga cuatro facturas, una transferencia a un proveedor que salda varios tickets) y puede
--    enlazarse a un cobro YA registrado a mano (pago_previo = true: deshacer el vínculo solo lo suelta,
--    no anula el pago). También enlaza un movimiento con una operación diversa (aportación del socio,
--    pago de la TVA, comisión...), por su documento_id en asientos_contables.
--    Las columnas factura_id/gasto_id/pago_id de movimientos_banco se mantienen para el caso de un
--    solo documento (las usan banco-sync, la conciliación automática y la purga RGPD); el trigger de
--    abajo crea o borra su enlace equivalente, así la tabla de enlaces es siempre la lista completa.
create table if not exists public.movimientos_banco_enlaces (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  movimiento_id uuid not null references public.movimientos_banco(id) on delete cascade,
  factura_id uuid references public.facturas(id),
  pago_id uuid references public.pagos_factura(id),
  gasto_id uuid references public.gastos(id) on delete cascade,
  operacion_id uuid,
  importe numeric(12, 2) not null check (importe > 0),
  pago_previo boolean not null default false,
  constraint movimientos_banco_enlaces_un_destino check (
    (pago_id is not null)::int + (gasto_id is not null)::int + (operacion_id is not null)::int = 1
  )
);
create index if not exists movimientos_banco_enlaces_movimiento_idx on public.movimientos_banco_enlaces (movimiento_id);
create unique index if not exists movimientos_banco_enlaces_pago_uk on public.movimientos_banco_enlaces (pago_id) where pago_id is not null;
create unique index if not exists movimientos_banco_enlaces_gasto_uk on public.movimientos_banco_enlaces (gasto_id) where gasto_id is not null;

alter table public.movimientos_banco_enlaces enable row level security;
drop policy if exists "acceso equipo autenticado" on public.movimientos_banco_enlaces;
create policy "acceso equipo autenticado" on public.movimientos_banco_enlaces
  for all to authenticated using (es_miembro_equipo()) with check (es_miembro_equipo());

comment on table public.movimientos_banco_enlaces is 'Documentos que concilia cada movimiento bancario (cobros de factura, gastos, operaciones diversas). Fuente completa de la conciliación; las columnas factura_id/gasto_id/pago_id de movimientos_banco solo cubren el caso de un único documento.';
comment on column public.movimientos_banco_enlaces.pago_previo is 'true si el cobro ya estaba registrado a mano antes de conciliarlo: deshacer el vínculo no anula el pago.';
comment on column public.movimientos_banco_enlaces.operacion_id is 'documento_id de la operación diversa (asientos_contables.documento_tipo = operacion) creada desde el movimiento.';

-- 2. reglas_banco: «si la descripción contiene X → …», aprendidas al conciliar a mano.
create table if not exists public.reglas_banco (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  patron text not null check (length(trim(patron)) >= 3),
  sentido text not null default 'pago' check (sentido in ('pago', 'cobro')),
  accion text not null check (accion in ('gasto', 'operacion', 'ignorar')),
  proveedor_id uuid references public.proveedores(id) on delete set null,
  cuenta_contable text,
  tipo_iva text,
  descripcion text,
  contrapartida text,
  veces_aplicada integer not null default 0
);
create unique index if not exists reglas_banco_patron_uk on public.reglas_banco (lower(patron), sentido);
alter table public.reglas_banco enable row level security;
drop policy if exists "acceso equipo autenticado" on public.reglas_banco;
create policy "acceso equipo autenticado" on public.reglas_banco
  for all to authenticated using (es_miembro_equipo()) with check (es_miembro_equipo());
comment on table public.reglas_banco is 'Reglas de conciliación bancaria: si la descripción del movimiento contiene `patron`, se propone crear un gasto (cuenta, proveedor, IVA), una operación diversa contra `contrapartida`, o ignorarlo.';

-- 3. Sincronía columnas simples → enlaces.
create or replace function public.sincronizar_enlace_movimiento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if old.pago_id is not null and new.pago_id is distinct from old.pago_id then
      delete from movimientos_banco_enlaces where movimiento_id = new.id and pago_id = old.pago_id;
    end if;
    if old.gasto_id is not null and new.gasto_id is distinct from old.gasto_id then
      delete from movimientos_banco_enlaces where movimiento_id = new.id and gasto_id = old.gasto_id;
    end if;
  end if;
  if new.pago_id is not null and (tg_op = 'INSERT' or new.pago_id is distinct from old.pago_id) then
    insert into movimientos_banco_enlaces (movimiento_id, factura_id, pago_id, importe)
    select new.id, new.factura_id, new.pago_id, abs(new.importe)
    where not exists (select 1 from movimientos_banco_enlaces e where e.pago_id = new.pago_id);
  end if;
  if new.gasto_id is not null and (tg_op = 'INSERT' or new.gasto_id is distinct from old.gasto_id) then
    insert into movimientos_banco_enlaces (movimiento_id, gasto_id, importe)
    select new.id, new.gasto_id, abs(new.importe)
    where not exists (select 1 from movimientos_banco_enlaces e where e.gasto_id = new.gasto_id);
  end if;
  return new;
end;
$$;

drop trigger if exists movimientos_banco_sincronizar_enlace on public.movimientos_banco;
create trigger movimientos_banco_sincronizar_enlace
  after insert or update of pago_id, gasto_id on public.movimientos_banco
  for each row execute function public.sincronizar_enlace_movimiento();

-- 4. Enlaces de lo ya conciliado. Los cobros de Uzcudun (F-2026-0007) y Lamouret (AC-2026-0011)
--    del 03/11 se conciliaron contra pagos registrados a mano: pago_previo = true.
insert into public.movimientos_banco_enlaces (movimiento_id, factura_id, pago_id, importe, pago_previo)
select m.id, m.factura_id, m.pago_id, abs(m.importe),
       m.id in ('d5082023-820b-45ce-9b7c-b2729a329cf8', '5b348e6d-cbf4-49d2-8638-9bcae32911a1')
from public.movimientos_banco m
where m.pago_id is not null
  and not exists (select 1 from public.movimientos_banco_enlaces e where e.pago_id = m.pago_id);

insert into public.movimientos_banco_enlaces (movimiento_id, gasto_id, importe)
select m.id, m.gasto_id, abs(m.importe)
from public.movimientos_banco m
where m.gasto_id is not null
  and not exists (select 1 from public.movimientos_banco_enlaces e where e.gasto_id = m.gasto_id);

revoke execute on function public.sincronizar_enlace_movimiento() from public, anon, authenticated;

-- (aplicada aparte en producción como 20261103_movimientos_banco_enlaces_concepto)
alter table public.movimientos_banco_enlaces add column if not exists concepto text;
comment on column public.movimientos_banco_enlaces.concepto is 'Texto que se muestra del documento enlazado cuando no es una factura ni un gasto (concepto y cuenta de la operación diversa).';
