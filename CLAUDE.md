# CLAUDE.md — Reformas Ordoñez · CRM interno

## 1. Comportamiento

**Razona antes de codificar.**
- Expón suposiciones explícitamente. Si hay ambigüedad, pregunta antes de implementar.
- Para tareas de múltiples pasos, escribe un plan breve con criterios de verificación:
  ```
  1. [Paso] → verificar: [cómo saber que está bien]
  2. [Paso] → verificar: [cómo saber que está bien]
  ```
- Si un enfoque más simple resuelve el problema, dilo. Haz pushback cuando tenga sentido.

**Código mínimo que resuelve el problema.**
- Sin features no pedidas. Sin abstracciones especulativas.
- Si escribes 200 líneas y podrían ser 50, reescríbelo.
- Cada línea modificada debe trazarse directamente a lo que se pidió.

**Cambios quirúrgicos.**
- Toca solo lo que debes. No mejores código adyacente que no está roto.
- Mantén el estilo existente. Si ves código muerto no relacionado, menciónalo — no lo borres.

**Manejo de errores Supabase — obligatorio en cada llamada.**
```typescript
const { data, error } = await supabase.from('visitas').select('*');
if (error) { toast.error(error.message); return; }
```
Nunca silenciar errores. Siempre mostrar feedback al usuario.

---

## 2. El proyecto

CRM interno para **Reformas Ordoñez** (empresa de reformas, frontera franco-española).
Para datos de empresa, usuarios, zonas y T&C → leer `docs/empresa.md`.

**Stack:**
- React 18 + Vite — sin Next.js, sin SSR
- TypeScript — tipado estricto desde el inicio
- Supabase — base de datos PostgreSQL + Auth + Storage
- React Router v7 — navegación entre secciones
- Tanstack Query — fetching y caché de datos del servidor
- Tailwind CSS — estilos utilitarios, sin CSS-in-JS
- Lucide React — iconos (únicos iconos permitidos)

**Lo que no se usa:** Redux, MobX, Zustand, Axios, moment.js, jQuery,
styled-components, Sass, Bootstrap, Material UI, Ant Design, ni ningún
component library externo salvo las indicadas arriba.

---

## 3. Credenciales — rellenar antes del Bloque 1

En el fichero `.env` (nunca subir a Git — ni siquiera aquí, ver nota de más abajo):
```
VITE_SUPABASE_URL=       # supabase.com → proyecto → Settings → API (URL base, sin /rest/v1/)
VITE_SUPABASE_ANON_KEY=  # supabase.com → proyecto → Settings → API
VITE_GCAL_CLIENT_ID=     # console.cloud.google.com → proyecto "ordonez-crm"
VITE_GMAPS_API_KEY=      # console.cloud.google.com → proyecto "ordonez-crm"
```

> Este documento vive en git. No pegar aquí valores reales de `.env`, ni siquiera el anon key
> (es público de por sí, pero mezclar plantilla y credencial real en un fichero versionado
> invita a que algún día se pegue ahí algo que sí importa). El `.env` real del proyecto ya
> tiene los cuatro valores correctos.

---

## 4. Diseño — reglas no negociables

Estética **corporativa pero cercana**, inspirada en el diseño de referencia de la Home
(`guias/inspiracion de pantalla de home...png`). Tarjetas más redondeadas y tipografía
más suave que la versión inicial — ya no "minimalista seca".

```
Fuente:    'Poppins' (Google Fonts, pesos 400/500/600/700) — ver docs/diseno.md
Base:      text-sm (13px) · labels: text-xs uppercase tracking-wide
Fondo:     bg-[#f4f4f2] página · bg-white cards
Bordes:    border border-gray-200
Verde:     #1a5c38 primario · #0f3d24 sidebar · #eaf2ed fondos suaves
Textos:    text-gray-900 · text-gray-600 · text-gray-400
Radius:    rounded-sm (10px) cards, inputs y botones · rounded (14px) modales · rounded-full pills/avatares
Sombras:   shadow-sm solo funcional — sin sombras decorativas
```

**Tailwind custom en `tailwind.config.js`:**
```js
colors: {
  brand: {
    DEFAULT: '#1a5c38',
    dark:    '#0f3d24',
    light:   '#eaf2ed',
    hover:   '#cdddd5',
  }
},
borderRadius: {
  sm: '0.625rem',      // 10px — antes 2px
  DEFAULT: '0.875rem', // 14px — antes 4px
}
```

**Prohibido siempre:** gradientes · animaciones decorativas · emojis en botones ·
colores vivos saturados · negro puro.

Ya no está prohibido usar Google Fonts (Poppins) ni radios grandes — eso pasó a ser
el estándar del CRM tras esta actualización de diseño.

```
Botón primario:    bg-brand text-white px-3 py-1.5 rounded-sm text-sm
Botón secundario:  bg-white border border-gray-200 text-gray-700 px-3 py-1.5 rounded-sm text-sm
Input:             border border-gray-200 rounded-sm focus:border-brand focus:outline-none text-sm
Tabla header:      bg-brand text-white text-xs uppercase tracking-wide
Tabla filas:       odd:bg-gray-50 hover:bg-brand-light
Sidebar:           bg-brand-dark · items text-white/65 · activo: text-white border-l-2 border-green-400
```

Para tokens completos y estados visuales → leer `docs/diseno.md`.

---

## 5. Arquitectura

### Supabase client
```typescript
// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);
```

### Patrón de fetching con Tanstack Query
```typescript
// Leer
const { data: visitas, isLoading } = useQuery({
  queryKey: ['visitas'],
  queryFn: async () => {
    const { data, error } = await supabase.from('visitas').select('*').order('fecha_visita');
    if (error) throw error;
    return data;
  }
});

// Mutar
const mutation = useMutation({
  mutationFn: async (nueva: NuevaVisita) => {
    const { data, error } = await supabase.from('visitas').insert(nueva).select().single();
    if (error) throw error;
    return data;
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['visitas'] });
    toast.success('Visita registrada');
  },
  onError: (error) => toast.error(error.message)
});
```

### Auth
```typescript
// Login
const { error } = await supabase.auth.signInWithPassword({ email, password });

// Sesión activa
const { data: { session } } = await supabase.auth.getSession();

// Escuchar cambios
supabase.auth.onAuthStateChange((event, session) => { ... });
```

Para esquema completo de tablas y SQL → leer `docs/supabase-schema.md`.

### Storage (adjuntos de gastos)
```typescript
const { data, error } = await supabase.storage
  .from('justificantes')
  .upload(`gastos/${id}_${Date.now()}.jpg`, file, { contentType: file.type });

const { data: { publicUrl } } = supabase.storage
  .from('justificantes').getPublicUrl(path);
```

---

## 6. Estructura del proyecto

```
ordonez-crm/
├── CLAUDE.md
├── .env                          ← credenciales (no subir a Git)
├── .env.example                  ← plantilla sin valores reales
├── .gitignore
├── index.html
├── package.json
├── vite.config.ts
├── tailwind.config.js
├── tsconfig.json
│
├── public/
│   └── favicon.ico
│
├── src/
│   ├── main.tsx                  ← punto de entrada
│   ├── App.tsx                   ← router principal + auth guard
│   │
│   ├── lib/
│   │   ├── supabase.ts           ← cliente Supabase
│   │   └── queryClient.ts        ← instancia de Tanstack Query
│   │
│   ├── hooks/
│   │   ├── useAuth.ts            ← sesión, rol, logout
│   │   └── useToast.ts           ← notificaciones
│   │
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx       ← navegación lateral
│   │   │   ├── Topbar.tsx        ← cabecera con botones de acción
│   │   │   └── AppLayout.tsx     ← wrapper sidebar + contenido
│   │   └── ui/
│   │       ├── Button.tsx
│   │       ├── Input.tsx
│   │       ├── Modal.tsx
│   │       ├── Table.tsx
│   │       ├── Badge.tsx
│   │       └── Toast.tsx
│   │
│   ├── styles/
│   │   └── globals.css
│   │
│   └── modules/
│       ├── auth/
│       │   └── LoginPage.tsx
│       │
│       ├── visitas/              ← Bloque 1
│       │   ├── VisitasPage.tsx
│       │   ├── VisitaForm.tsx
│       │   ├── VisitaTable.tsx
│       │   └── CalendarioPage.tsx
│       │
│       ├── clientes/             ← Bloque 3
│       │   ├── ClientesPage.tsx
│       │   ├── ClienteTable.tsx
│       │   └── ClienteFicha.tsx  ← modal con 5 pestañas
│       │
│       ├── pipeline/             ← Bloque 3
│       │   └── PipelinePage.tsx
│       │
│       ├── google/               ← Bloque 2
│       │   ├── MapsAutocomplete.tsx
│       │   └── CalendarPicker.tsx
│       │
│       ├── finanzas/
│       │   ├── presupuestos/     ← Bloque 4
│       │   ├── facturas/         ← Bloque 4
│       │   ├── gastos/           ← Bloque 4
│       │   ├── proveedores/      ← Bloque 4
│       │   └── iva.ts            ← lógica de IVA (el asistente vive en contabilidad/)
│       │
│       ├── contabilidad/         ← AsistenteIvaPage, BancoPage, DashboardContablePage, LibroIngresosPage, ResultadoPage,
│       │                           LibroDiarioPage, LibroMayorPage (libro diario/mayor PCG, solo Francia)
│       ├── fiscalidad/           ← Bloque 5 — IS, TNS, calendario fiscal, TabInmovilizado, TabLiasseFiscale
│       ├── solicitudes/          ← Bloque 6 — solicitudes web + seguimiento asistido por IA
│       ├── mensajeria/           ← hilos de email vinculados a clientes
│       ├── notificaciones/       ← campana de notificaciones
│       ├── planning/             ← plan de obra / cronograma imprimible
│       ├── configuracion/        ← plantillas, portada, directrices, catálogo de líneas
│       ├── papelera/             ← restaurar/purgar visitas, presupuestos, facturas
│       ├── perfil/               ← datos y avatar del usuario
│       │
│       └── dashboard/            ← Solo admin — DashboardHubPage, DashboardGeneralPage, RentabilidadPage
│
├── docs/
│   ├── empresa.md
│   ├── diseno.md
│   ├── supabase-schema.md
│   ├── finanzas.md
│   └── google-apis.md
│
└── data/
    └── seed.sql
```

---

## 7. Bloques de desarrollo

| # | Bloque                       | Estado      | Sem   | Doc de referencia     |
|---|------------------------------|-------------|-------|-----------------------|
| 1 | Base: auth + visitas + inicio | ✅ Hecho    | 1–2   | empresa.md, diseno.md |
| 2 | Google Maps + Calendar        | ✅ Hecho    | 2–4   | google-apis.md        |
| 3 | Clientes + Pipeline + Seguimiento (sin PDF, ver §9) | ✅ Hecho — Clientes y Pipeline; el "Plan de seguimiento de obra" (`seguimiento/SeguimientoPage.tsx`, `PlanForm.tsx`) descrito en la estructura de carpetas (§6) nunca se implementó, auditoría 2026-08-05 | 4–6   | supabase-schema.md    |
| 4 | Finanzas + IVA + Firma        | ✅ Hecho    | 6–12  | finanzas.md           |
| 5 | Fiscalidad & État (IS, TNS, calendario fiscal) | ✅ Hecho    | —     | guias/Bloque5_Fiscalidad_CRM_Reformas_Ordonez.html |
| 6 | Solicitudes & Seguimiento: bandeja + generación de mensajes con IA + tracking del embudo solicitud→firma para el dashboard de Marketing | ✅ Hecho — rediseñado 2026-08-11, verificado por Gabriel 2026-08-14 | —     | docs/bloque6-solicitudes-seguimiento.md |

Actualizar: ⬜ Pendiente → 🟡 En curso → ✅ Hecho

**Nunca empezar un bloque sin el anterior funcionando y verificado.**

---

## 8. Convenciones de código

**Ficheros:** un componente por fichero. Nombre en PascalCase para componentes,
camelCase para hooks y utilidades. Extensión `.tsx` para componentes, `.ts` para el resto.

**Tipos:** definir tipos en el mismo fichero si son locales. Si se reutilizan
entre módulos, crear `types.ts` dentro del módulo correspondiente.

**Fechas:** guardar en BD como `YYYY-MM-DD`. Mostrar con:
```typescript
new Date(fecha).toLocaleDateString('es', { day: '2-digit', month: 'short', year: '2-digit' })
```

**Nota automática del sistema** (llamar tras acciones importantes):
```typescript
async function notaSistema(visitaId: string, texto: string) {
  await supabase.from('notas_cliente').insert({
    visita_id: visitaId, tipo: 'sistema', texto, autor: 'Sistema'
  });
}
// Usar en: guardar visita · cambiar estado · mover pipeline · firmar · crear evento Google Cal
```

**Variables de entorno:** acceder siempre como `import.meta.env.VITE_*`.
Nunca hardcodear credenciales en el código.

---

## 9. Dependencias — package.json base

```json
{
  "dependencies": {
    "@supabase/supabase-js": "^2",
    "@tanstack/react-query": "^5",
    "lucide-react": "^0.383.0",
    "react": "^18",
    "react-dom": "^18",
    "react-router-dom": "^7"
  },
  "devDependencies": {
    "@types/react": "^18",
    "@types/react-dom": "^18",
    "@vitejs/plugin-react": "^6",
    "autoprefixer": "^10",
    "postcss": "^8",
    "tailwindcss": "^3",
    "typescript": "^5",
    "vite": "^8"
  }
}
```

Para PDFs → `jspdf` + `jspdf-autotable` (añadir en Bloque 4).
Para gráficos → `recharts` (añadir en Bloque 4, solo Dashboard admin).

---

## 10. Notas importantes

- **`.env` nunca va a Git.** El `.gitignore` debe incluirlo desde el inicio.
- **RLS activado** en Supabase (2026-08-04) en las 21 tablas, con política uniforme `authenticated`-only
  (`for all to authenticated using (true) with check (true)`): cualquier usuario logueado en el CRM tiene acceso
  completo, el rol público/anon no tiene ninguno. Las Edge Functions usan `SUPABASE_SERVICE_ROLE_KEY` (saltan RLS
  siempre), así que no se ven afectadas.
- **Google APIs opcionales:** sin Maps → input texto normal. Sin Calendar → `<input type="date">`.
- **PDFs:** A4, márgenes 15mm, fuente Helvetica. Estructura: portada → contenido → T&C.
- **Bilingüe ES/FR:** documentos financieros y planes de obra en el idioma del documento.
  La interfaz del programa es siempre en español.
- **Adjuntos de gastos:** Supabase Storage (bucket `justificantes`). No en base64 en la BD.
- **Despliegue:** Netlify o Vercel con `npm run build`. El plan gratuito es suficiente.
- **Papelera (soft-delete)** en `visitas`, `presupuestos` y `facturas` (2026-08-06): borrar desde el CRM ya no
  hace `DELETE`, actualiza `eliminado_en`/`eliminado_por` y la fila deja de aparecer en listados/dashboards/pipeline
  (todas las lecturas activas filtran `.is('eliminado_en', null)`). Recuperar o borrar definitivamente desde
  `/papelera`. Al añadir una lectura nueva de estas 3 tablas, aplicar siempre ese filtro salvo que sea una
  búsqueda por id ya conocido o una actualización dirigida.
  - **Excepción — facturas nunca se borran definitivamente** (2026-08-06): la numeración es correlativa sin
    huecos por ley (Code de commerce art. A123-12 en FR, RD 1619/2012 en ES). Desde `/papelera` una factura
    solo se puede restaurar, nunca eliminar de verdad. Para anular una factura real hace falta una factura
    rectificativa (implementada 2026-08-11, ver más abajo), no un borrado.
- **Tests:** Vitest (`npm run test`) cubre la lógica financiera crítica (`lineas.ts`, `iva.ts`,
  `lineaDeduccionAcomptes`/`lineasRectificativa` en `facturas/types.ts`, `ofx.ts`) más `fiscalidad/calculos.ts`,
  `filtroTexto.ts`, `numeracion.ts` (`numeroOrdenable`) y `pipelineSync.ts` (`etapaAutomatica`). Añadir tests ahí
  al tocar cálculos de totales/IVA/acomptes o esta lógica de negocio.
- **RGPD — pestaña "Privacidad" en la ficha de cliente** (`ClientePrivacidadTab.tsx`, 2026-08-06, corregido
  2026-08-09 y 2026-08-11): exporta a JSON o purga en cascada (borrado duro real, irreversible) todo lo
  vinculado a un cliente en `visitas`, `notas_cliente`, `proyectos`, `presupuestos`, `gastos`, `galeria`, más
  `documento_eventos`/`movimientos_banco` indirectos. **Excepción — facturas**: nunca se borran, ni siquiera
  aquí, por la misma razón que en `/papelera` (numeración correlativa legal, ver nota de arriba); el derecho al
  olvido se cumple anonimizando `cliente_nombre`/`cliente_dir`/`cliente_email`/`cliente_tel` en la factura en
  vez de eliminar la fila. Cumple el derecho de acceso/eliminación que el T&C promete al cliente. Las fotos de
  galería en Storage se borran también (corrección 2026-08-12, best-effort — un fallo no aborta la purga del
  resto), igual que los justificantes de gastos en Storage (corrección 2026-08-14, mismo best-effort —
  `gastos.adjunto_url` ya guarda el path del bucket privado `justificantes` directamente, sin recorte de URL).
  **Corrección 2026-08-11**: `solicitudes` (Bloque 6 — llega antes de que exista una visita, así que no
  cuelga de `visita_id` como el resto) se había quedado fuera tanto de la exportación como de la purga desde
  que existe la tabla (28 julio) — un cliente que escribió por el formulario web mantenía su nombre/email/
  teléfono/mensaje en `solicitudes` aunque se "purgaran" todos sus datos. Ahora se localiza por
  teléfono/email normalizado del cliente (cruzando todas sus visitas, mismo criterio que
  `pipelineSync.ts`/`documenso-webhook`) y se incluye en ambos flujos, junto con sus `funnel_eventos`.
- **Buscador global** (`Ctrl/Cmd+K`, `BuscadorGlobal.tsx`, 2026-08-06): busca clientes/presupuestos/facturas
  desde cualquier pantalla.
- **Aviso diario por email** (`supabase/functions/alerta-diaria`, cron `alerta-diaria-urgentes` a las 06:30 UTC,
  2026-08-06): si hay facturas vencidas, presupuestos caducados/a punto de caducar (7 días) o solicitudes
  nuevas sin revisar, manda un resumen a reformasordonezeus@gmail.com. Si no hay nada urgente, no envía nada
  (evita ruido diario). Reutiliza el envío por Gmail de `notificar-visita`. No cubre alertas fiscales (fuera
  de alcance a propósito, esas ya se ven en Fiscalidad).
- **Control de versiones** (2026-08-11): el proyecto vive en git desde esta fecha, repo privado en
  `github.com/GabrielOrdo894/ordonez-crm`, con CI en GitHub Actions (build + test + lint en cada push a
  `main`). Antes de esto no había historial — cualquier referencia a "commits antiguos" antes del
  2026-08-11 no existe. Las carpetas de negocio (`avatares/`, `catalogos/`, `equipo-marketing/`,
  `equipo-presupuestos/`, `guias/`, `modificaciones/`, `nueva solicitud de presupuesto/`,
  `plantilla de presupuesto/`, `plantillas-email/`, `solicitudes-presupuesto/`) están excluidas del repo a
  propósito (datos de clientes, no son código) — siguen solo en disco local.
- **Vite 8 y React Router 7** (2026-08-11): actualizados desde Vite 5 y React Router 6 para corregir
  vulnerabilidades de `npm audit` (alta en esbuild, moderadas en react-router). El routing sigue siendo
  declarativo clásico (`BrowserRouter`/`Routes`/`Route`/`useNavigate`/`Link`, sin rutas splat ni data
  routers) — es el modo con menos cambios de comportamiento entre v6 y v7.
- **ESLint + Prettier** (2026-08-11): `npm run lint` / `npm run format`. Tipado estricto también en las
  Edge Functions de `supabase/functions/` (antes tenían 36 usos de `any`) — ojo, esos ficheros no están
  cubiertos por `tsc -b` (fuera de `tsconfig.app.json`), así que un error de tipos ahí solo lo pilla el
  lint o Deno, no el build.
- **Tracking del embudo de Solicitudes** (`funnel_eventos`, 2026-08-11): tabla nueva que registra,
  con fecha, cada etapa por la que pasa una solicitud entrante hacia convertirse en negocio real:
  `solicitud_entrada` · `solicitud_respondida` · `solicitud_descartada` ·
  `solicitud_vinculada_presupuesto` · `presupuesto_enviado` · `presupuesto_aceptado` ·
  `presupuesto_firmado` · `presupuesto_rechazado` (constantes en `src/lib/funnelTracking.ts`,
  función `registrarEventoFunnel`). Se inserta desde los mismos sitios donde ya cambia el estado
  real (`SolicitudDetalle.tsx`, `SolicitudesPage.tsx`, `PresupuestosPage.tsx`,
  `DocumentoDetalleInline.tsx`, y las Edge Functions `revisar-gmail`/`documenso-webhook` para lo
  que ocurre sin que haya nadie con el CRM abierto) — nunca por trigger de base de datos, para
  mantener el mismo estilo del resto del proyecto (llamadas explícitas, como `notaSistema`/
  `registrarEvento`). Se visualiza en `/solicitudes` (embudo de los últimos 90 días) y en
  Dashboard → Marketing (mismo embudo + desglose de conversión a firma por `fuente`, filtrado por
  el período ya seleccionado en ese dashboard). El generador de mensajes con IA sigue existiendo
  tal cual (Gabriel ya paga los créditos de la API) pero vive solo en la ficha de detalle de cada
  solicitud (`SolicitudDetalle.tsx`), no en la pantalla principal — esa quedó dedicada al tracking.
- **Facturas rectificativas** (2026-08-11): `facturas.tipo` admite ahora `'rectificativa'` además de
  `'normal'`/`'acompte'`, con su propia secuencia de numeración (`seq_factura_rectificativa`,
  prefijo `R-`) y columna `factura_original_id` apuntando a la factura que corrige — mismo patrón
  que las facturas `acompte`. Acción "Crear factura rectificativa" en el menú de cada fila de
  `/finanzas/facturas`: abre `FacturaForm` con las líneas de la original en negativo
  (`lineasRectificativa` en `facturas/types.ts`) y nota de referencia automática. El PDF y las
  vistas previas la titulan "FACTURA RECTIFICATIVA"/"FACTURE RECTIFICATIVE"
  (`tituloDocumentoFactura` en `facturas/types.ts`). Igual que el resto de facturas, nunca se
  borra de verdad (numeración correlativa legal, ver nota de arriba).
- **2 avisos de seguridad de Supabase pendientes, aceptados a propósito** (revisión 2026-08-11):
  *Leaked Password Protection* desactivada — no se puede activar con las herramientas MCP
  disponibles (es un toggle de Auth en el dashboard de Supabase, no una migración SQL), pendiente
  de que Gabriel lo active en Authentication → Policies. Extensión `pg_net` instalada en el
  schema `public` — Postgres no permite `ALTER EXTENSION ... SET SCHEMA` para `pg_net`
  (`ERROR 0A000`); moverla exigiría recrearla y arriesgaría los cron jobs que dependen de ella
  (`alerta-diaria`, `revisar-gmail-diario`), así que se deja como está.
- **CORS de las Edge Functions restringido a `https://ordonezrenov.com`** (2026-08-12): las 6 funciones con
  `verify_jwt: true` (`google-token`, `documenso-crear-envelope`, `revisar-gmail`, `generar-mensaje-ia`,
  `notificar-visita`, `alerta-diaria`) tenían `Access-Control-Allow-Origin: '*'` — endurecido al dominio real
  donde vive el CRM. La autorización de verdad ya la hacía `esLlamadaAutorizada()` comprobando el rol del JWT
  (no solo que esté firmado), así que esto es defensa en profundidad, no el cierre de un agujero explotable.
  `google-oauth-callback` y `documenso-webhook` (`verify_jwt: false`) se quedan en `'*'` a propósito — son
  webhooks públicos por diseño (redirect de Google, callback de Documenso), no los llama el frontend del CRM.
- **Traducción interna de presupuestos ES↔FR** (columna `traduccion` jsonb, Edge Function
  `traducir-presupuesto`, 2026-08-13): acción "Traducir a español/francés" en el menú de 3 puntos de
  `/finanzas/presupuestos` — pensada para que Gabriel o su especialista puedan leer un presupuesto en el
  otro idioma (ej. un presupuesto en francés revisado por un especialista que solo lee español), no para
  enviarlo al cliente. La IA (Sonnet, se prioriza precisión sobre coste) traduce únicamente el texto libre
  que Gabriel redactó a mano — designación/descripción de cada línea, `nota` del documento y los conceptos
  del plan de pago — nunca precios, cantidades, IVA ni el país. Los Términos y Condiciones **nunca se
  traducen con IA**: el PDF traducido (`generarPdfPresupuestoTraducido` en `generarPdfPresupuesto.ts`)
  simplemente construye el documento con `idioma` invertido, reutilizando el T&C real ya redactado en
  Configuración para ese idioma — por eso ignora a propósito un T&C propio del presupuesto (pestaña
  "Condiciones"), que solo existiría en el idioma original y no se puede traducir sin riesgo. El PDF
  resultante lleva una franja de aviso en cada página ("TRADUCCIÓN INTERNA — NO VÁLIDA COMO DOCUMENTO
  OFICIAL") para que nunca se confunda con el documento real. La traducción se guarda en el presupuesto
  (se puede volver a generar si las líneas cambian) — no se descarga hasta que existe.
- **Libro diario y Libro mayor (PCG, solo Francia)** (tabla `asientos_contables`, 2026-08-14): primera
  pieza de la contabilidad legal francesa (Code de commerce art. L123-12 a L123-24) construida dentro del
  CRM — confirmado régimen **réel normal IS + réel normal TVA** en el documento de síntesis del Guichet
  Unique, lo que descarta la vía EFI gratuita para la liasse fiscale (queda para una ronda futura, ver
  abajo). `asientos_contables` es **insert-only a propósito** (RLS solo `select`+`insert`, sin política de
  `update`/`delete`) para que la inalterabilidad legal se cumpla a nivel de base de datos, no solo de
  buena fe en el código — un asiento mal hecho se corrige con uno nuevo, nunca editando la fila. Los
  asientos se generan automáticamente (`src/lib/asientosContables.ts`, mismo patrón que
  `notaSistema`/`registrarDecision`) al **crear** un Gasto o Factura de `pais = 'Francia'` y al
  **registrar un cobro** — nunca al editar un documento ya contabilizado (limitación conocida: si se
  edita un Gasto/Factura después de que su asiento ya existe, el asiento queda desactualizado; no hay
  rectificación automática todavía). Gastos usa la cuenta PCG ya existente en `cuenta_contable`
  (`CUENTAS_FR`); si no tiene una asignada cae en la cuenta de espera `471` en vez de perderse. Facturas
  no tiene campo de cuenta propio — la venta (`706`)/TVA collectée (`44571`) se derivan de `tipo_iva` y
  `lineas` en el momento de generar el asiento. `/contabilidad/diario` (cronológico) y
  `/contabilidad/mayor` (agrupado por cuenta, con saldo) son de solo lectura. **Fuera de esta ronda**:
  registro de inmovilizado/amortizaciones por activo individual (hoy la amortización es un gasto
  agregado en cuenta `68x`), y la liasse fiscale (2065 + tableaux 2050-2059-G) con su transmisión
  EDI-TDFC obligatoria — necesita un partenaire EDI barato o que el CRM se acredite como partenaire EDI
  ante la DGFiP (proyecto aparte).
- **Inmovilizado, rectificación de asientos y liasse fiscale (ronda 2)** (2026-08-14): tabla
  `inmovilizado` (RLS `authenticated for all`, a diferencia de `asientos_contables` sí es editable —
  es un registro, no un libro contable) + columna `gastos.inmovilizado_id`. `src/lib/inmovilizado.ts`
  (`calcularDotacionAnual` lineal con prorrateo por meses completos, `generarDotacionEjercicio`
  idempotente por año) + pestaña Fiscalidad → "Inmovilizado" (`TabInmovilizado.tsx`): alta/edición/baja
  de activos y botón "Generar dotación del ejercicio" por activo, que crea el `gasto` (cuenta `681`) y
  su asiento igual que si se hiciera a mano en Gastos — cero lógica duplicada.
  **Rectificación de asientos**: `asientos_contables` ganó una columna `tipo_evento`
  (`'creacion' | 'cobro'`, distingue la emisión/gasto del cobro de una Factura, ambos comparten
  `documento_tipo='factura'`) y `rectificarAsientos()` en `asientosContables.ts` — al editar un
  Gasto/Factura de Francia ya contabilizado, inserta la reversa (debe/haber invertidos) del evento
  correspondiente y registra uno nuevo con los valores corregidos; nunca toca la fila original (sigue
  sin política de update/delete). Cierra la limitación documentada en la ronda 1.
  **Liasse fiscale**: `cabeceraDocumento`/`piePagina` (antes locales de `generarPdfRemuneracion.ts`)
  se movieron a `pdfEmpresa.ts` para reutilizarlos. `useComptaFrancia.ts` calcula el compte de résultat
  agrupando `asientos_contables` por prefijo de cuenta PCG — **siempre por saldo neto (`debe − haber`),
  nunca sumando un solo lado**, porque una rectificación inserta su reversa en la misma cuenta y sumar
  solo `debe` (o solo `haber`) contaría el importe original dos veces y la reversa ninguna (bug real
  encontrado y corregido en la verificación de esta ronda) — y el bilan simplificado (trésorerie desde
  `512`, créances clients desde Facturas pendientes de Francia, inmovilizado neto desde el registro).
  Pestaña "Liasse fiscale" (`TabLiasseFiscale.tsx`) muestra ambos y descarga un PDF resumen
  (`generarPdfLiasseFiscale.ts`) organizado por tableau (2058-A/2054-2055/2050-2051/2052-2053), con
  una franja de aviso "documento de preparación interna, no es el Cerfa oficial". **Dettes
  fournisseurs siempre a 0€**, mostrado explícitamente en la UI y el PDF — los Gastos no llevan estado
  de pago pendiente, así que el bilan puede no cuadrar exactamente y se avisa en vez de disimularlo.
  **Sigue fuera de alcance a propósito** (decisión explícita con Gabriel): la transmisión EDI-TDFC real
  (partenaire EDI de pago o acreditación del CRM ante la DGFiP) — el PDF resumen es para entregar a
  quien haga esa transmisión, no la sustituye. Gabriel eligió **Edifiscale** (R&N Solutions SAS,
  partenaire EDI n° 7500810) como partenaire EDI — 60€ HT por declaración, sin abono anual, y admite
  importar un CSV de la "balance comptable" para auto-rellenar importes. `/contabilidad/mayor` tiene un
  segundo botón "Exportar para Edifiscale (CSV)" que genera ese fichero en su formato exacto (modelo
  real entregado por Edifiscale en `documentos legales/modele-balance.csv`, no inventado): columnas
  `Compte;Libellé;Débit;Crédit`, cuenta PCG rellenada a 6 dígitos con ceros a la derecha (`512`→
  `512000`), libellé sin el código, importes con coma decimal. **Sin probar contra su importador
  real** (no tengo cuenta en Edifiscale) — Gabriel debe confirmarlo con una prueba antes de depender de
  él para la declaración real; si el CSV entrecomillado (así lo genera `exportarCSV.ts` para todo el
  CRM) da problemas, es un ajuste trivial.
