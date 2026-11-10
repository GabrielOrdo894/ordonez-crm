-- Acompte automático al aceptarse un presupuesto (2026-11-10, petición de Gabriel).
-- Al pasar un presupuesto a Aceptado (firma de Documenso, a mano en el CRM o por SQL), el trigger
-- llama por pg_net a la Edge Function `acompte-automatico`, que crea la factura del primer plazo del
-- plan de pago con crear_acompte_automatico().

alter table public.facturas
  add column if not exists acompte_auto_creado_en timestamptz;

comment on column public.facturas.acompte_auto_creado_en is
  'Acompte creado automáticamente al aceptarse el presupuesto (Edge Function acompte-automatico). La campana avisa de enviarlo.';

-- Comprueba y crea con la fila del presupuesto bloqueada: dos llamadas seguidas no pueden crear dos
-- acomptes. Devuelve null si el presupuesto ya tiene alguna factura viva.
create or replace function public.crear_acompte_automatico(p_presupuesto_id uuid, p_fila jsonb)
returns public.facturas
language plpgsql
set search_path = public
as $$
declare
  v_factura public.facturas;
begin
  perform 1 from presupuestos where id = p_presupuesto_id for update;
  if exists (select 1 from facturas where presupuesto_id = p_presupuesto_id and eliminado_en is null) then
    return null;
  end if;

  insert into facturas (
    tipo, presupuesto_id, visita_id, titulo, cliente_nombre, cliente_dir, cliente_tel, cliente_email,
    idioma, pais, tipo_iva, lineas, fecha_factura, fecha_vence, metodo_pago, estado_cobro,
    estructura_anterior, acompte_auto_creado_en
  )
  select
    r.tipo, p_presupuesto_id, r.visita_id, r.titulo, r.cliente_nombre, r.cliente_dir, r.cliente_tel, r.cliente_email,
    r.idioma, r.pais, r.tipo_iva, r.lineas, r.fecha_factura, r.fecha_vence, r.metodo_pago, r.estado_cobro,
    coalesce(r.estructura_anterior, false), r.acompte_auto_creado_en
  from jsonb_populate_record(null::public.facturas, p_fila) r
  returning * into v_factura;

  return v_factura;
end;
$$;

revoke all on function public.crear_acompte_automatico(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.crear_acompte_automatico(uuid, jsonb) to service_role;

-- Encola la llamada a la Edge Function (pg_net la envía después del commit). Nunca hace fallar el
-- cambio de estado del presupuesto: cualquier error se queda en un WARNING.
create or replace function public.encolar_acompte_automatico()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.estado <> 'Aceptado'
     or (tg_op = 'UPDATE' and old.estado is not distinct from 'Aceptado')
     or new.tipo = 'orientativo'
     or new.avenant_de_id is not null
     or new.eliminado_en is not null then
    return new;
  end if;

  begin
    perform net.http_post(
      url := 'https://mhbicdrquinlwhasrvgo.supabase.co/functions/v1/acompte-automatico',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object('presupuesto_id', new.id),
      timeout_milliseconds := 30000
    );
  exception when others then
    raise warning 'acompte automático: no se pudo encolar la llamada para %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

revoke all on function public.encolar_acompte_automatico() from public, anon, authenticated;

drop trigger if exists presupuestos_acompte_automatico on public.presupuestos;
create trigger presupuestos_acompte_automatico
  after insert or update of estado on public.presupuestos
  for each row
  when (new.estado = 'Aceptado')
  execute function public.encolar_acompte_automatico();
