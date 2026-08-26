create table declaraciones_renta_gerant (
  anio integer primary key,
  declarado boolean not null default false,
  fecha_declaracion date,
  created_at timestamptz not null default now()
);

comment on table declaraciones_renta_gerant is
  'Seguimiento de la déclaration de revenus (renta personal) del gérant, por año civil de percepción — análogo a declaraciones_iva pero anual. El importe/base no se guarda aquí (se calcula en vivo desde gerant_config + fiscal_config), solo el estado de si ya se presentó.';

alter table declaraciones_renta_gerant enable row level security;

create policy "acceso total" on declaraciones_renta_gerant
  for all to authenticated using (true) with check (true);

insert into fiscal_config (clave, valor, descripcion, fuente, vigente_desde)
values (
  'declaracion_ir_dia',
  28,
  'Déclaration de revenus — día límite online 2026 para el departamento 64 (Pyrénées-Atlantiques, zona depts. 20-54). Cambia cada campaña y por zona — verificar en impots.gouv.fr al abrir cada campaña (suele abrir en abril).',
  'https://www.impots.gouv.fr',
  current_date
)
on conflict (clave) do update set
  valor = excluded.valor,
  descripcion = excluded.descripcion,
  fuente = excluded.fuente,
  vigente_desde = excluded.vigente_desde;
