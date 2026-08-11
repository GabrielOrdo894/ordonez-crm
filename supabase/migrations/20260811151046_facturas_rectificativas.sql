-- Facturas rectificativas: mismo patrón que 'acompte' (20260715000000) — tipo de factura nuevo
-- con su propia numeración correlativa, vinculada a la factura original que corrige.
alter table empresa_config add column if not exists seq_factura_rectificativa int default 0;
alter table facturas add column if not exists factura_original_id uuid references facturas(id) on delete set null;
