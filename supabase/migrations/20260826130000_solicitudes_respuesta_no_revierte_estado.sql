alter table solicitudes
  add column ultima_respuesta_revisada boolean not null default true;

comment on column solicitudes.ultima_respuesta_revisada is
  'Igual que presupuestos.ultima_respuesta_revisada: false cuando el cliente respondió y todavía no se ha atendido, sin tocar "estado" (que ya no se revierte a Nueva al llegar una respuesta, decisión de Gabriel 2026-08-26 para no distorsionar el embudo de conversión).';
