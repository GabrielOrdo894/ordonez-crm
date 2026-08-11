-- Bandeja de entrada tipo email: leído/archivado/eliminado son estados por usuario (un mensaje
-- público lo puede tener un usuario archivado y otro no), así que se guardan como arrays de
-- uuid en la propia fila en vez de un booleano — mismo patrón que destinatario_ids.
alter table mensajes_equipo add column if not exists leido_por uuid[] default '{}';
alter table mensajes_equipo add column if not exists archivado_por uuid[] default '{}';
alter table mensajes_equipo add column if not exists eliminado_por uuid[] default '{}';
