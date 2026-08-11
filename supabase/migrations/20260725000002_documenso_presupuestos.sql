-- Firma electrónica con Documenso para presupuestos.
alter table presupuestos
  add column if not exists firma_metodo text not null default 'manual',
  add column if not exists documenso_envelope_id text,
  add column if not exists documenso_signing_url text,
  add column if not exists documenso_estado text;
