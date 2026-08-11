-- Piso / puerta / referencia adicional junto a la dirección de visitas y clientes.
-- "Clientes" reutiliza la tabla visitas (ver ClienteForm.tsx), así que una sola columna cubre ambos.
alter table visitas add column if not exists direccion_extra text;
