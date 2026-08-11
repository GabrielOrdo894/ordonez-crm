alter table mensajes_equipo add column if not exists destinatario_ids uuid[];

update mensajes_equipo
set destinatario_ids = array[destinatario_id]::uuid[]
where destinatario_id is not null and destinatario_ids is null;
