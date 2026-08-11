-- Numeración de facturas de acompte (anticipo), separada de la de facturas normales.
alter table empresa_config add column if not exists seq_factura_acompte int default 0;

-- Tipo de factura: 'normal' (factura completa) o 'acompte' (anticipo parcial vinculado a un
-- plazo del plan de pago del presupuesto). Cambia el prefijo de numeración y el título del PDF.
alter table facturas add column if not exists tipo text default 'normal';

-- Mensajería: destacados (por usuario, como leido_por/archivado_por) y borradores (mensaje
-- guardado sin enviar — solo visible para su autor hasta que se envía).
alter table mensajes_equipo add column if not exists destacado_por text[] default '{}';
alter table mensajes_equipo add column if not exists borrador boolean default false;
