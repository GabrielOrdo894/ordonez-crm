-- Catálogo de líneas preestablecidas — para reutilizar rápidamente designación/referencia/
-- descripción/precio/tipo de servicio al crear líneas de presupuestos y facturas.
create table lineas_catalogo (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  designacion text not null,
  referencia text,
  descripcion text,
  unidad text default 'ud',
  tipo_servicio text,
  precio_unit numeric default 0
);
