alter table public.visitas add column if not exists telefono_extra text, add column if not exists telefono_extra_titular text;
comment on column public.visitas.telefono_extra is 'Segundo teléfono de contacto del cliente (p. ej. del cónyuge). No identifica al cliente: la ficha se agrupa solo por visitas.telefono.';
comment on column public.visitas.telefono_extra_titular is 'De quién es el teléfono extra (p. ej. «Marido»).';
