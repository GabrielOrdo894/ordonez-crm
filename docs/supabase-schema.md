# Supabase — Esquema de tablas

## SQL de creación (ejecutar en Supabase SQL Editor)

```sql
create extension if not exists "pgcrypto";

create table visitas (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  nombre text not null, apellidos text not null, telefono text not null,
  email text, idioma text, contacto text,
  direccion text, lat float8, lng float8,
  pais text, zona text, tipo text, descripcion text,
  fecha_visita date, hora_visita time,
  empleado text, estado text default 'Pendiente',
  estado_pipeline text default 'Contacto',
  notas text, google_event_id text,
  es_empresa boolean default false, empresa_nombre text, empresa_cif text
);

-- Si la tabla visitas ya existía (Bloques 1-4), añade las columnas de empresa/organización
-- usadas por el formulario "Nuevo cliente" (Bloque 6):
alter table visitas add column if not exists es_empresa boolean default false;
alter table visitas add column if not exists empresa_nombre text;
alter table visitas add column if not exists empresa_cif text;

create table notas_cliente (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  visita_id uuid references visitas(id) on delete cascade,
  tipo text, texto text, autor text
);

create table proyectos (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  visita_id uuid references visitas(id) on delete set null,
  nombre_obra text, fecha_inicio date,
  idioma text default 'es',
  introduccion text, nota_final text,
  estado text default 'Planificado',
  fases jsonb default '[]'
);

create table presupuestos (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  numero text, visita_id uuid references visitas(id) on delete set null,
  cliente_nombre text, cliente_dir text, cliente_email text, cliente_tel text,
  idioma text default 'es', fecha_emision date, fecha_validez date,
  tipo_iva text, lineas jsonb default '[]', plan_pago jsonb default '[]',
  estado text default 'Borrador',
  firmado boolean default false,
  firma_nombre text, firma_fecha timestamptz, firma_base64 text,
  -- Firma electrónica Documenso — ver docs/documenso.md
  firma_metodo text not null default 'manual', -- 'manual' | 'documenso'
  documenso_envelope_id text, documenso_signing_url text, documenso_estado text
);

create table facturas (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  numero text,
  presupuesto_id uuid references presupuestos(id) on delete set null,
  visita_id uuid references visitas(id) on delete set null,
  cliente_nombre text, idioma text default 'es',
  fecha_factura date, fecha_vence date,
  tipo_iva text, lineas jsonb default '[]',
  metodo_pago text, estado_cobro text default 'Pendiente'
);

-- Catálogo de líneas preestablecidas (designación/referencia/descripción/precio/tipo de servicio)
-- para rellenar rápidamente líneas de presupuestos y facturas — ver LineasEditor.tsx.
create table lineas_catalogo (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  designacion text not null,
  referencia text,
  descripcion text,
  unidad text default 'ud',
  tipo_servicio text,
  precio_unit numeric default 0,
  idioma text default 'es' -- 'es' | 'fr' — en qué idioma de documento se sugiere la línea
);

create table gastos (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  fecha date, descripcion text, categoria text, proveedor text,
  importe_base numeric(10,2), tipo_iva text, importe_iva numeric(10,2),
  pais text, cuenta_contable text,
  visita_id uuid references visitas(id) on delete set null,
  adjunto_url text, adjunto_nombre text, adjunto_tipo text,
  num_factura_proveedor text
);

create table empresa_config (
  id int primary key default 1,
  datos jsonb default '{}',
  tc_es text, tc_fr text, tc_modo text default 'bilingue',
  tc_tamano text default 'normal', -- 'normal' | 'grande' | 'muy_grande' — tamaño de letra del bloque T&C en el PDF
  intro_presup_es text, intro_presup_fr text,
  intro_factura_es text, intro_factura_fr text,
  seq_presupuesto int default 0, seq_factura int default 0,
  constraint solo_una_fila check (id = 1)
);
insert into empresa_config (id) values (1) on conflict do nothing;

-- Bloque 5 — Fiscalidad (EURL-IS francesa)

-- Parámetros fiscales editables: nunca hardcodear tipos/umbrales en el código
create table if not exists fiscal_config (
  id uuid primary key default gen_random_uuid(),
  clave text unique not null,
  valor numeric not null,
  descripcion text,
  fuente text,
  vigente_desde date default now(),
  updated_at timestamptz default now()
);

insert into fiscal_config (clave, valor, descripcion, fuente) values
 ('is_taux_reduit', 0.15, 'Tipo IS reducido PME', 'https://www.economie.gouv.fr/entreprises/gerer-sa-fiscalite-et-ses-impots/limpot-sur-les-societes-comment-ca-marche'),
 ('is_taux_normal', 0.25, 'Tipo IS normal', 'https://www.economie.gouv.fr/entreprises/gerer-sa-fiscalite-et-ses-impots/limpot-sur-les-societes-comment-ca-marche'),
 ('is_plafond_reduit', 42500, 'Plafond anual tramo 15% (proratizar por meses de ejercicio)', 'https://www.economie.gouv.fr/entreprises/gerer-sa-fiscalite-et-ses-impots/limpot-sur-les-societes-comment-ca-marche'),
 ('tns_abattement', 0.26, 'Abatimiento assiette unique TNS reforma 2026', 'https://www.urssaf.fr/accueil/outils-documentation/taux-baremes/taux-cotisations-ac-plnr.html'),
 ('tns_taux_global', 0.45, 'Taux global efectivo cotisations TNS (aprox)', 'https://www.urssaf.fr/accueil/outils-documentation/taux-baremes/taux-cotisations-ac-plnr.html'),
 ('pass_2026', 47100, 'PASS 2026 — VERIFICAR en urssaf.fr, fuentes difieren (46.368–48.060)', 'https://www.urssaf.fr/accueil/outils-documentation/taux-baremes/taux-cotisations-ac-plnr.html'),
 ('pfu_total', 0.30, 'Flat tax dividendos (12,8 IR + 17,2 PS)', 'https://www.impots.gouv.fr'),
 ('dividendes_seuil_capital', 0.10, 'Umbral 10% capital para cotisations TNS s/ dividendos', 'https://www.urssaf.fr'),
 ('tva_deadline_dia', 21, 'Día del mes deadline CA3 (ajustar según SIREN)', 'https://www.impots.gouv.fr'),
 ('alerta_tramo_umbral', 0.85, 'Umbral (% del plafond del tramo 15%) a partir del cual avisar en el Home', null),
 ('acompte_is_dia', 15, 'Día del mes deadline de los acomptes IS trimestrales (mar/jun/sep/dic)', null),
 ('cfe_dia', 15, 'Día del mes deadline de la CFE (diciembre)', null),
 ('solde_is_mes', 5, 'Mes de la declaración anual de sociedades (Solde IS) del ejercicio siguiente', null),
 ('solde_is_dia', 15, 'Día del mes de la declaración anual de sociedades (Solde IS)', null)
on conflict (clave) do update set fuente = excluded.fuente;

-- Échéances fiscales del calendario (CA3, acomptes IS, CFE, liasse...) con estado
create table if not exists echeances_fiscales (
  id uuid primary key default gen_random_uuid(),
  tipo text not null,          -- 'CA3' | 'ACOMPTE_IS' | 'SOLDE_IS' | 'CFE' | 'LIASSE' | 'DEPOT_COMPTES' | 'OTRO'
  titulo text not null,
  fecha_limite date not null,
  organismo text,              -- 'DGFiP' | 'URSSAF' | 'Greffe'
  url_oficial text,
  importe_estimado numeric,
  completada boolean default false,
  completada_at timestamptz,
  notas text
);

-- Configuración del gérant para los simuladores (fila única, igual que empresa_config)
-- drop previo por si la tabla quedó creada con el esquema uuid de la guía original (id uuid en vez de id int)
drop table if exists gerant_config;
create table if not exists gerant_config (
  id int primary key default 1,
  remuneracion_anual numeric default 0,
  capital_social numeric default 1000,
  compte_courant_medio numeric default 0,
  updated_at timestamptz default now(),
  constraint solo_una_fila check (id = 1)
);
insert into gerant_config (id) values (1) on conflict do nothing;

-- Refresh_token compartido de Google Calendar (fila única) — ver modificaciones/reparación de inicio de sesion de google.txt
-- Lo escriben las Edge Functions google-oauth-callback / google-token con la service role key.
create table if not exists google_config (
  id int primary key default 1,
  refresh_token text,
  updated_at timestamptz default now(),
  constraint solo_una_fila check (id = 1)
);

-- Supabase activa RLS por defecto en tablas nuevas creadas desde el SQL Editor.
-- El resto del proyecto tiene RLS desactivado (ver CLAUDE.md §10) — igualamos estas tablas.
alter table fiscal_config disable row level security;
alter table echeances_fiscales disable row level security;
alter table gerant_config disable row level security;
alter table google_config disable row level security;

-- Galería de avatares compartida entre los usuarios del CRM (perfil)
create table if not exists avatares_compartidos (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  url text not null,
  creado_por text
);
alter table avatares_compartidos disable row level security;
```

## Mensajería interna
Tablas `usuarios_equipo` y `mensajes_equipo` — creadas fuera de estas migraciones trackeadas
(directamente en Supabase Studio), ver `supabase/migrations/20260713000000_mensajes_multi_destinatario.sql`
y `20260714000001_mensajeria_privada_fix.sql` para los ajustes posteriores. Tipos TS en
`src/modules/mensajeria/MensajeriaPage.tsx`. `mensajes_equipo.destinatario_ids` (uuid[], nullable):
`null` = mensaje público a todo el equipo, con IDs = privado a esos destinatarios + el autor.

## Storage
Bucket: `justificantes` · Carpeta: `gastos/` · Acceso: público
Bucket: `avatares` · Acceso: público (fotos de perfil de los usuarios)
Bucket: `mensajes_adjuntos` · Acceso: público (adjuntos de la mensajería interna)

Políticas necesarias en `storage.objects` (RLS de Storage viene activado por defecto
en todo proyecto Supabase, aunque el resto de la BD la tenga desactivada — sin estas
políticas la subida de justificantes/avatares falla con "new row violates row-level security policy"):
```sql
insert into storage.buckets (id, name, public)
values ('justificantes', 'justificantes', true)
on conflict (id) do update set public = true;

create policy "justificantes_select" on storage.objects
  for select using (bucket_id = 'justificantes');

create policy "justificantes_insert" on storage.objects
  for insert with check (bucket_id = 'justificantes');

create policy "justificantes_update" on storage.objects
  for update using (bucket_id = 'justificantes');

create policy "justificantes_delete" on storage.objects
  for delete using (bucket_id = 'justificantes');

insert into storage.buckets (id, name, public)
values ('avatares', 'avatares', true)
on conflict (id) do update set public = true;

create policy "avatares_select" on storage.objects
  for select using (bucket_id = 'avatares');

create policy "avatares_insert" on storage.objects
  for insert with check (bucket_id = 'avatares');

create policy "avatares_update" on storage.objects
  for update using (bucket_id = 'avatares');

create policy "avatares_delete" on storage.objects
  for delete using (bucket_id = 'avatares');

insert into storage.buckets (id, name, public)
values ('mensajes_adjuntos', 'mensajes_adjuntos', true)
on conflict (id) do update set public = true;

create policy "mensajes_adjuntos_select" on storage.objects
  for select using (bucket_id = 'mensajes_adjuntos');

create policy "mensajes_adjuntos_insert" on storage.objects
  for insert with check (bucket_id = 'mensajes_adjuntos');

create policy "mensajes_adjuntos_update" on storage.objects
  for update using (bucket_id = 'mensajes_adjuntos');

create policy "mensajes_adjuntos_delete" on storage.objects
  for delete using (bucket_id = 'mensajes_adjuntos');
```

## Estados válidos
- `estado` visita: Pendiente · Confirmada · Realizada · Cancelada
- `estado_pipeline`: Contacto · Visita programada · Visita realizada · Presupuesto enviado · Presupuesto aceptado · En obra · Finalizado
- `estado` presupuesto: Borrador · Enviado · Pendiente firma · Aceptado · Rechazado · Facturado
- `estado_cobro` factura: Pendiente · Cobrada · Cobrada parcialmente · Vencida
- `tipo` echeance_fiscal: CA3 · ACOMPTE_IS · SOLDE_IS · CFE · LIASSE · DEPOT_COMPTES · OTRO

## Estructura lineas (jsonb)
```typescript
type Linea = {
  designacion: string;     // "DEM-001"
  referencia: string;      // "DEM001"
  descripcion: string;
  unidad: string;          // "ud" | "m2" | "ml" | "h" | "forfait"
  tipo_servicio: string;   // "Travaux" | "Prestations de services BIC" | "Fournitures" | "Main d'œuvre" | "—"
  cantidad: number;
  precio_unit: number;
  total_sin_iva: number;   // calculado: cantidad * precio_unit
  total_con_iva: number;   // calculado: total_sin_iva * (1 + tipo_iva%)
  es_incluido: boolean;    // true → mostrar "Incluido" / "Inclus", sin cifra
}
```
