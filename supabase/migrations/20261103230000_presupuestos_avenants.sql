-- Avenants firmados — 2026-11-03 (decisión de Gabriel: suman al presupuesto original).
alter table public.presupuestos add column if not exists avenant_de_id uuid references public.presupuestos(id);
create index if not exists presupuestos_avenant_de_idx on public.presupuestos (avenant_de_id) where avenant_de_id is not null;
comment on column public.presupuestos.avenant_de_id is 'Avenant (2026-11-03): presupuesto original al que completa. El avenant lleva solo los trabajos añadidos, se firma aparte y su importe se factura con la factura final del original (no tiene acomptes ni factura propios). Número: <número del original>-A<n>.';

-- (aplicada aparte en producción como funnel_ignora_avenants)
create or replace function public.funnel_ignorar_avenants()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.presupuesto_id is not null
     and exists (select 1 from presupuestos where id = new.presupuesto_id and avenant_de_id is not null) then
    return null;
  end if;
  return new;
end;
$$;
revoke execute on function public.funnel_ignorar_avenants() from public, anon, authenticated;
drop trigger if exists funnel_eventos_ignorar_avenants on public.funnel_eventos;
create trigger funnel_eventos_ignorar_avenants before insert on public.funnel_eventos
  for each row execute function public.funnel_ignorar_avenants();
