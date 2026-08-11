-- Nota adicional opcional (comentarios internos, observaciones del cliente...) que se puede
-- activar por documento. Si está rellena, se imprime en el PDF después del resumen de pago y del
-- bloque de seguro y garantía — en presupuestos (normales y orientativos) y en facturas.
alter table presupuestos add column if not exists nota text;
alter table facturas add column if not exists nota text;
