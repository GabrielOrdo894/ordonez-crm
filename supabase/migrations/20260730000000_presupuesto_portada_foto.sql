-- Foto de portada específica de este presupuesto (formato completo) — si está vacía, se usa la
-- foto por defecto configurada en el Constructor de portadas (empresa_config.datos.portada).
alter table presupuestos add column if not exists portada_foto_url text;
