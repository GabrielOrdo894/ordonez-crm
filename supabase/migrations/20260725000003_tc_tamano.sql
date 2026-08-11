-- Tamaño de letra de los términos y condiciones en el PDF (normal / grande / muy_grande).
alter table empresa_config add column if not exists tc_tamano text default 'normal';
