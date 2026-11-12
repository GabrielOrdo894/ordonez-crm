-- Seguimiento de la comisión del 10 % sobre cada cobro de cliente (5 % Gabriel + 5 % Santiago),
-- 2026-11-12, petición de Gabriel. Registro interno, fuera de la contabilidad: una fila = la
-- comisión de ese cobro ya se ha recibido; sin fila = pendiente de recibir. Tabla aparte (y no una
-- columna de pagos_factura) para no chocar con el bloqueo de periodo de los cobros.
create table if not exists public.comisiones_cobros (
  pago_id uuid primary key references public.pagos_factura(id),
  recibida_en date not null default current_date,
  marcada_por text,
  created_at timestamptz not null default now()
);
alter table public.comisiones_cobros enable row level security;
drop policy if exists "acceso equipo autenticado" on public.comisiones_cobros;
create policy "acceso equipo autenticado" on public.comisiones_cobros
  for all to authenticated using (es_miembro_equipo()) with check (es_miembro_equipo());
comment on table public.comisiones_cobros is 'Comisión del 10 % (5 % Gabriel + 5 % Santiago) sobre cada cobro: una fila = comisión de ese cobro ya recibida. Registro interno, sin efecto contable.';

-- Arranque: todo lo cobrado hasta hoy está al día (Gabriel, 2026-11-12).
insert into public.comisiones_cobros (pago_id, recibida_en, marcada_por)
select p.id, current_date, 'Arranque (todo al día a 12/11/2026)'
from public.pagos_factura p
where p.anulado_en is null
on conflict (pago_id) do nothing;
