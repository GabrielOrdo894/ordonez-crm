-- Piso / puerta / referencia del cliente (opcional) — igual que direccion_extra en visitas, pero
-- para el presupuesto (el cliente puede editarse por documento, sin depender de la visita).
alter table presupuestos add column if not exists cliente_dir_extra text;
