-- El frontend y las Edge Functions distinguen entre solicitudes que no llegaron a
-- concretar una visita y rechazos posteriores a una visita. La restricción anterior
-- no incluía el primer estado, por lo que impedía guardar esa transición válida.
alter table public.solicitudes
  drop constraint if exists solicitudes_estado_check;

alter table public.solicitudes
  add constraint solicitudes_estado_check
  check (estado in ('Nueva', 'Enviada', 'Aceptada', 'No concretada', 'Rechazada', 'Eliminada'));
