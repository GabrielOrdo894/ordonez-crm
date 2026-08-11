# Equipo de agentes de presupuestos — Reformas Ordoñez

## Instalación

1. Copia los seis archivos `.md` en la carpeta `.claude/agents/` dentro del proyecto de tu CRM:

```
tu-proyecto-crm/
└── .claude/
    └── agents/
        ├── creador-presupuestos.md
        ├── revisor-presupuestos.md
        ├── envio-presupuestos.md
        ├── seguimiento-presupuestos.md
        ├── vigia-precios-mercado.md
        └── calibrador-tarifas.md
```

2. Los agentes se cargan al arrancar Claude Code. Si ya tenías una sesión abierta, reiníciala.

3. Invocación: automática cuando la petición encaja con la descripción del agente, o explícita ("usa el agente revisor-presupuestos para evaluar el presupuesto #42").

## Documentos compartidos — ESTADO ACTUAL

En `docs/`:

- **`docs/esquema-presupuestos.md`** — hecho, generado directamente del código del CRM (no de una lectura en vivo de
  Supabase — es la misma verdad que usa la app). Revísalo y corrígelo si algo cambia.
- **`docs/terminos-condiciones-plantilla.md`** — hecho, copiado del texto real ya cargado en `empresa_config` (vía
  `docs/empresa.md`). Si editas los T&C desde Configuración → Términos y condiciones, actualiza también este fichero.
- **`docs/tarifas-referencia.md`** — hecho y aprobado (2026-07-25). Cubre demolición/albañilería, fontanería,
  electricidad, alicatado/solado, suelos, fachadas, techos y pintura, en España y Francia. Pendientes de datos:
  carpintería/mobiliario y sanitarios/mampara como partida individual (falta investigación del vigía).
- **`docs/precios-mercado.md`** — lo genera y mantiene el agente `vigia-precios-mercado` investigando en internet
  (fuentes profesionales, barómetros del sector, competidores de zona). Es la referencia de entrada para el
  calibrador. Relánzalo cuando quieras refrescar datos, cubrir carpintería/sanitarios, o un tipo de obra nuevo.

**El equipo ya está operativo** (2026-07-25): a partir de ahora se usa para presupuestos reales y las tarifas se
van refinando poco a poco con el uso (revisor detecta huecos → vigía documenta mercado → calibrador propone precio
propio → Gabriel aprueba), no hace falta tenerlo "completo" antes de empezar.

### Flujo completo de calibración de precios

`vigia-precios-mercado` (investiga mercado) → `docs/precios-mercado.md` → `calibrador-tarifas` (aplica margen
propio) → tu aprobación → `docs/tarifas-referencia.md` → lo usa `revisor-presupuestos` como vara de medir.

## Conexión con Supabase

Ya configurada en `.mcp.json` (raíz del proyecto, sin tokens ni secretos dentro — usa login OAuth, no un access
token pegado a mano) — **dos conexiones separadas**, para que la "regla de oro" de abajo no dependa solo de que el
agente se porte bien, sino que esté bloqueada también a nivel de base de datos:

- `supabase-rw` (lectura/escritura) — solo la usa `creador-presupuestos`.
- `supabase-ro` (**solo lectura, forzado por Postgres**, `read_only=true`) — la usan `revisor`, `envio` y
  `seguimiento`. Aunque el agente intente escribir, la base de datos lo rechaza.

La primera vez que un agente use una herramienta `mcp__supabase-rw__*` o `mcp__supabase-ro__*`, Claude Code abrirá
el navegador para iniciar sesión con tu cuenta de Supabase (OAuth) — solo hace falta una vez por conexión.
`vigia-precios-mercado` no necesita Supabase (solo `docs/`, no tiene tools de MCP).

## Pendientes marcados en los agentes

- `envio-presupuestos`: activar la integración con Documenso cuando el VPS esté desplegado.
- `seguimiento-presupuestos`: decidir dónde se registran los relances en el CRM (columna en presupuestos o tabla `seguimientos`).

## Regla de oro del equipo

Ningún agente envía nada ni cambia estados sin aprobación explícita de Gabriel. El creador inserta solo en estado `borrador`; el resto solo lee y propone.
