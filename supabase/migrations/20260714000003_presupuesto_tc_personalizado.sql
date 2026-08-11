-- Términos y condiciones personalizados por presupuesto (opcional) — si se rellena, sustituye a
-- los términos generales de Configuración solo para ese documento.
alter table presupuestos add column if not exists terminos_condiciones text;
