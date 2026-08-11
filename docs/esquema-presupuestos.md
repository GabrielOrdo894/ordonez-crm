# Esquema de presupuestos — referencia para el equipo de agentes

Generado directamente desde el código del CRM (`docs/supabase-schema.md`, `src/modules/finanzas/presupuestos/types.ts`,
`src/modules/finanzas/lineas.ts`, `src/lib/numeracion.ts`), no desde una lectura en vivo de Supabase — es la misma
verdad que usa la aplicación. Revísalo tú y corrígelo si algo ha cambiado desde entonces.

## Tabla `presupuestos`

| Columna | Tipo | Valores / formato |
|---|---|---|
| `id` | uuid, PK | generado automáticamente |
| `created_at` | timestamptz | automático |
| `numero` | text | `P-AAAA-NNNN` (ver "Numeración" abajo) |
| `visita_id` | uuid, FK → `visitas` | puede ser `null` si el presupuesto no viene de una visita registrada |
| `pais` | text | `'España'` \| `'Francia'` |
| `titulo` | text | título del presupuesto, sin localidad (ej. "Reforma Integral de Baño") |
| `cliente_nombre` | text | |
| `cliente_dir` | text | dirección de la obra |
| `cliente_dir_extra` | text | piso/puerta/referencia, opcional |
| `cliente_email` | text | obligatorio si se va a enviar a firmar con Documenso |
| `cliente_tel` | text | |
| `idioma` | text | `'Español'` \| `'Français'` (determina TVA/IVA y el idioma del documento) |
| `fecha_emision` | date | `AAAA-MM-DD` |
| `fecha_validez` | date | `AAAA-MM-DD`, normalmente emisión + 30 días |
| `tipo_iva` | text | `'IVA_21'` \| `'IVA_10'` \| `'TVA_10'` \| `'TVA_20'` \| `'EXENTO'` (ver tabla de IVA abajo) |
| `tipo` | text | `'normal'` (precios cerrados) \| `'orientativo'` (horquilla min–max, sin IVA) |
| `formato` | text | `'completo'` \| `'rapido'` — no afecta a los datos, solo a qué pestañas se muestran en el formulario |
| `presupuesto_origen_id` | uuid, FK → `presupuestos` | si este normal nace de un orientativo, apunta a él |
| `banco_titular` / `banco_nombre` / `banco_iban` / `banco_bic` | text | opcional, sobrescribe los datos bancarios por defecto de la entidad |
| `lineas` | jsonb | array de `Linea` (ver abajo) |
| `plan_pago` | jsonb | array de `{ concepto: text, porcentaje: number, importe: number }` — **solo presupuestos, nunca facturas** |
| `terminos_condiciones` | text | si se rellena, sobrescribe la plantilla general de `empresa_config` solo para este documento |
| `condiciones_pago` | jsonb | `{ delaiEs, delaiFr, penalizacionEs, penalizacionFr, medioEs, medioFr }`, opcional |
| `nota` | text | nota interna, no sale en el PDF |
| `estado` | text | `'Borrador'` \| `'Pendiente'` \| `'Aceptado'` \| `'Rechazado'` |
| `firmado` | boolean | `true` una vez firmado (manual o Documenso) |
| `firma_nombre` / `firma_fecha` / `firma_base64` | | datos de la firma manual histórica (canvas) — ya no se usa para presupuestos nuevos |
| `firma_metodo` | text | `'manual'` \| `'documenso'` |
| `documenso_envelope_id` / `documenso_signing_url` / `documenso_estado` | text | datos del envío a firmar por Documenso |

### Tipo `Linea` (cada elemento del array `lineas`)

```ts
{
  designacion: string,       // nombre corto de la partida — OBLIGATORIO
  referencia: string,        // código interno del catálogo, "—" si no existe — OBLIGATORIO
  descripcion: string,       // detalle, materiales, medidas
  unidad: string,            // 'ud' | 'm2' | 'ml' | 'h' | 'forfait'
  tipo_servicio: string,     // 'Travaux' | 'Prestations de services BIC' | 'Fournitures' | "Main d'œuvre" | '—' — OBLIGATORIO (≠ '—')
  cantidad: number,
  precio_unit: number,       // precio unitario SIN IVA
  precio_unit_max?: number,  // solo en presupuestos orientativos — precio máximo de la horquilla
  total_sin_iva: number,     // cantidad × precio_unit (0 si es_incluido)
  total_con_iva: number,     // total_sin_iva × (1 + %IVA/100)
  es_incluido: boolean,      // true = línea "Incluido/Inclus", precio 0, no suma al total (ej. limpieza final)
}
```

Los totales (`total_sin_iva`, `total_con_iva`) los calcula la aplicación al vuelo con `calcularLinea()` — al insertar
manualmente, calcúlalos tú mismo con la misma fórmula de arriba para que el documento no se vea descuadrado hasta que
alguien reabra el formulario en el CRM (que sí los recalcula siempre).

### Tabla de IVA/TVA (columna `tipo_iva`)

| Valor | Significado | % |
|---|---|---|
| `IVA_21` | España, obra nueva | 21% |
| `IVA_10` | España, reforma > 2 años (Art. 91 LIVA) | 10% |
| `TVA_10` | Francia, rénovation (Art. 279-0 bis CGI) | 10% |
| `TVA_20` | Francia, taux normal | 20% |
| `EXENTO` | Sin IVA — **siempre** en presupuestos `orientativo` (se determina en el normal tras la visita técnica) | 0% |

## Numeración

El número (`numero`, formato `P-AAAA-NNNN`) sale de `empresa_config.seq_presupuesto` (fila única `id = 1`):

1. Lee `seq_presupuesto` de `empresa_config`.
2. `siguiente = seq_presupuesto + 1`.
3. Actualiza `empresa_config.seq_presupuesto = siguiente`.
4. `numero = "P-" + año_actual + "-" + siguiente con 4 dígitos (0034, no 34)`.

No hay lock/transacción — si dos procesos numeran a la vez pueden chocar. Como el agente creador solo trabaja bajo
petición explícita de Gabriel (nunca en paralelo consigo mismo), no debería ser un problema práctico, pero comprueba
que el número no exista ya antes de insertar.

## Presupuesto orientativo — cómo se guarda

- `tipo = 'orientativo'`, `tipo_iva = 'EXENTO'` siempre.
- Cada línea lleva `precio_unit` (mínimo) y `precio_unit_max` (máximo de la horquilla).
- No lleva `plan_pago` (los orientativos no tienen plan de pagos ni firma).
- El PDF muestra el total como rango (mínimo–máximo), nunca un número cerrado.

## Estados y transiciones

`Borrador → Pendiente → Aceptado | Rechazado`. El agente **creador** solo inserta en `Borrador`. Ningún otro agente
cambia el estado — lo hace Gabriel desde el CRM, o el webhook de Documenso automáticamente cuando el cliente firma
(pasa a `Aceptado` + `firmado = true`).

## Tabla `lineas_catalogo` — catálogo de referencias internas

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid, PK | |
| `designacion` | text | obligatorio |
| `referencia` | text | código `FAM-NNN` (3 letras + 3 dígitos), ej. `DEM-001`, `FON-002` |
| `descripcion` | text | |
| `unidad` | text | por defecto `'ud'` |
| `tipo_servicio` | text | |
| `precio_unit` | numeric | por defecto `0` — **precio de ejemplo, no la tarifa real de la empresa**, ver `docs/tarifas-referencia.md` |
| `idioma` | text | `'es'` \| `'fr'` — en qué idioma de documento se sugiere esta línea |

Antes de fijar un código de referencia nuevo, consulta esta tabla para no duplicar familias/números ya usados.

## Notas de sistema y eventos (opcional, no obligatorio para los agentes)

La aplicación registra automáticamente una nota (tabla `notas_cliente`) y un evento (tabla `documento_eventos`) en
acciones importantes (crear, cambiar estado, firmar). Los agentes no necesitan replicarlo — es una mejora de
trazabilidad que Gabriel puede pedir aparte si quiere que el creador también dejara constancia.

## Acceso — RLS desactivado

No hay Row Level Security activo en ninguna tabla de este proyecto (ver `CLAUDE.md` §10) — el MCP de Supabase, una
vez conectado, puede leer e insertar libremente. Precisamente por eso el creador **solo inserta en `Borrador`** y
ningún otro agente escribe: es la única barrera de seguridad real hasta que Gabriel apruebe.
