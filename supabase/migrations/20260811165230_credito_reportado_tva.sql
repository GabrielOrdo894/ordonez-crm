-- El "crédit reporté" (ligne 22) del Asistente IVA nunca se guardaba — era estado de componente
-- puro que se reseteaba a 0 en cada cambio de mes, así que Gabriel tenía que recordar y volver a
-- teclear a mano el crédito arrastrado del mes anterior cada vez (bug real corregido 2026-08-11).
-- Se guarda la ligne 27 (crédit à reporter) calculada de cada mes, para que el mes siguiente la
-- cargue sola como su ligne 22.
alter table declaraciones_iva add column if not exists credito_reportado numeric default 0;
