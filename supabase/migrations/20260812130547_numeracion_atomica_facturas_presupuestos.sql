-- Corrige la numeración no atómica de facturas/presupuestos (auditoría 2026-08-12): pese al
-- nombre "seq_factura"/"seq_presupuesto", esas columnas de empresa_config nunca fueron secuencias
-- de Postgres — src/lib/numeracion.ts leía el contador, sumaba 1 en JS y volvía a escribirlo.
-- Dos creaciones casi simultáneas (dos sesiones distintas) podían leer el mismo valor y generar
-- el mismo número dos veces, algo especialmente grave aquí por la numeración correlativa legal
-- (Code de commerce art. A123-12 FR / RD 1619/2012 ES). El UPDATE...RETURNING de esta función es
-- atómico (el row lock de la fila id=1 serializa las llamadas concurrentes), así que sustituye
-- por completo al patrón SELECT+UPDATE del frontend.
create or replace function public.siguiente_numero_atomico(p_campo text)
returns int
language plpgsql
as $$
declare
  v_valor int;
begin
  if p_campo not in ('seq_presupuesto', 'seq_factura', 'seq_factura_acompte', 'seq_factura_rectificativa') then
    raise exception 'Campo de numeración no permitido: %', p_campo;
  end if;

  execute format(
    'update empresa_config set %I = coalesce(%I, 0) + 1 where id = 1 returning %I',
    p_campo, p_campo, p_campo
  ) into v_valor;

  return v_valor;
end;
$$;

revoke execute on function public.siguiente_numero_atomico(text) from public;
revoke execute on function public.siguiente_numero_atomico(text) from anon;
grant execute on function public.siguiente_numero_atomico(text) to authenticated;

-- Red de seguridad: si algo (un bug futuro, una llamada manual) vuelve a generar un número
-- repetido, que falle con un error visible en vez de colarse en silencio. No había ninguna
-- restricción a nivel de BD hasta ahora, solo la PK sobre id.
alter table public.facturas add constraint facturas_numero_key unique (numero);
alter table public.presupuestos add constraint presupuestos_numero_key unique (numero);
