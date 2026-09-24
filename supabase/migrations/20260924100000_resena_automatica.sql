-- Petición de reseña automática al cerrar una obra (Edge Function resena-automatica, cron diario).
-- resena_auto_estado: 'programada' (se enviará en la siguiente ejecución, ≥ 24 h después — margen
-- para cancelarla desde la factura) · 'enviada' · 'cancelada' (a mano desde la factura, o porque la
-- factura dejó de estar cobrada / se papelerizó) · 'revisar' (no se programó: hay una rectificativa
-- posterior o notas de cliente recientes, la campana avisa para decidirlo a mano).
alter table public.facturas
  add column if not exists resena_auto_estado text
    check (resena_auto_estado in ('programada', 'enviada', 'cancelada', 'revisar')),
  add column if not exists resena_auto_programada_en timestamptz;

comment on column public.facturas.resena_auto_estado is
  'Reseña automática (resena-automatica): programada | enviada | cancelada | revisar. NULL = todavía no evaluada.';
comment on column public.facturas.resena_auto_programada_en is
  'Momento en que resena-automatica programó (o dejó en revisar) la petición de reseña; el envío ocurre ≥ 20 h después.';
