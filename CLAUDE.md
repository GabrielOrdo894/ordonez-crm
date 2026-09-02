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
Para datos de empresa, usuarios, zonas y T&C → leer `docs/negocio/empresa.md`.

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
(`negocio/guias/inspiracion de pantalla de home...png`). Tarjetas más redondeadas y tipografía
más suave que la versión inicial — ya no "minimalista seca".

```
Fuente:    'Poppins' (Google Fonts, pesos 400/500/600/700) — ver docs/tecnico/diseno.md
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

Para tokens completos y estados visuales → leer `docs/tecnico/diseno.md`.

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

Para esquema completo de tablas y SQL → leer `docs/tecnico/supabase-schema.md`.

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
│       ├── mensajeria/           ← mensajería interna entre los usuarios del CRM (mensajes_equipo), no con clientes
│       ├── notificaciones/       ← campana de notificaciones
│       ├── planning/             ← plan de obra / cronograma imprimible
│       ├── configuracion/        ← plantillas, portada, directrices, catálogo de líneas
│       ├── papelera/             ← restaurar/purgar visitas, presupuestos, facturas
│       ├── perfil/               ← datos y avatar del usuario
│       │
│       └── dashboard/            ← Solo admin — DashboardHubPage, DashboardGeneralPage, RentabilidadPage
│
├── docs/                          ← reorganizado en subcarpetas temáticas 2026-08-18
│   ├── tecnico/                   ← diseno.md, documenso.md, esquema-presupuestos.md, google-apis.md, supabase-schema.md
│   ├── negocio/                   ← directrices-respuesta-clientes.md, empresa.md, finanzas.md, precios-mercado.md, tarifas-referencia.md, terminos-condiciones-plantilla.md, tc-plantillas/
│   ├── fiscal/                    ← remuneracion-gerant-contexto.md
│   └── producto/                  ← bloque6-solicitudes-seguimiento.md
│
├── negocio/                       ← datos de negocio, fuera de git (avatares, catalogo, equipo-marketing,
│                                     equipo-presupuestos, guias, modificaciones, plantillas..., solicitudes-presupuesto)
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
| 5 | Fiscalidad & État (IS, TNS, calendario fiscal) | ✅ Hecho    | —     | negocio/guias/Bloque5_Fiscalidad_CRM_Reformas_Ordonez.html |
| 6 | Solicitudes & Seguimiento: bandeja + generación de mensajes con IA + tracking del embudo solicitud→firma para el dashboard de Marketing | ✅ Hecho — rediseñado 2026-08-11, verificado por Gabriel 2026-08-14 | —     | docs/producto/bloque6-solicitudes-seguimiento.md |

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
  2026-08-11 no existe. Las carpetas de negocio están excluidas del repo a propósito (datos de
  clientes, no son código) — siguen solo en disco local, todas agrupadas bajo `negocio/` desde
  2026-08-18 (`negocio/avatares/`, `negocio/catalogo/` —renombrada desde `catalogos/`—,
  `negocio/equipo-marketing/`, `negocio/equipo-presupuestos/`, `negocio/guias/`,
  `negocio/modificaciones/`, `negocio/nueva solicitud de presupuesto/`,
  `negocio/plantilla de presupuesto/`, `negocio/plantillas-email/`,
  `negocio/solicitudes-presupuesto/`, `negocio/documentos legales/`).
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
  real entregado por Edifiscale en `negocio/documentos legales/edifiscale/modele-balance.csv`, no inventado): columnas
  `Compte;Libellé;Débit;Crédit`, cuenta PCG rellenada a 6 dígitos con ceros a la derecha (`512`→
  `512000`), libellé sin el código, importes con coma decimal. **Sin probar contra su importador
  real** (no tengo cuenta en Edifiscale) — Gabriel debe confirmarlo con una prueba antes de depender de
  él para la declaración real; si el CSV entrecomillado (así lo genera `exportarCSV.ts` para todo el
  CRM) da problemas, es un ajuste trivial.
- **Vinculación automática solicitud ↔ presupuesto en el embudo de conversión** (2026-08-19): antes el
  escalón "Vinculadas a presupuesto" del embudo (`/solicitudes`) dependía por completo de que alguien
  entrara a la solicitud y eligiera el presupuesto a mano en el desplegable de `SolicitudDetalle.tsx` —
  casi nunca se hacía, así que ese escalón salía vacío aunque los escalones de después (enviado,
  firmado...) tuvieran números normales, porque esos se cuentan por `presupuesto_id` sin pasar por la
  solicitud (hallazgo real de Gabriel, auditoría 2026-08-19). `vincularSolicitudPorContacto()`
  (`src/lib/funnelTracking.ts`) cruza `cliente_tel`/`cliente_email` del presupuesto recién creado contra
  `solicitudes` sin vincular por teléfono normalizado o email en minúsculas — mismo criterio que
  `datosContactoCliente()` en `ClientePrivacidadTab.tsx`/`pipelineSync.ts` — y si hay coincidencia
  (la solicitud más reciente si hay varias) actualiza `presupuesto_vinculado_id` y registra el evento de
  funnel, sin intervención manual. Se llama desde `PresupuestoForm.tsx` al crear un presupuesto nuevo
  (best-effort, no bloqueante, igual que `sincronizarPipelineCliente`) y desde el agente
  `creador-presupuestos` (paso 7 de su proceso) cuando inserta por SQL directo, que es la vía más
  habitual. El desplegable manual de `SolicitudDetalle.tsx` sigue existiendo para los casos que no
  cruzan (contacto distinto al de la visita, presupuesto de un cliente recurrente sin solicitud
  rastreada). Se hizo también un backfill único sobre datos existentes: 6 solicitudes antiguas
  vinculadas retroactivamente por este mismo cruce. **Corrección del mismo día**: el cruce vinculaba
  la solicitud sin exigir que ya tuviera el evento `solicitud_respondida` — si una solicitud llegaba
  a `solicitud_vinculada_presupuesto` sin haber pasado antes por "Enviada" en el CRM (presupuesto
  creado directo, sin tocar Solicitudes), el embudo mostraba más "Vinculadas a presupuesto" que
  "Respondidas" (hallazgo real de Gabriel, 3 casos reales: rosarito.olabe@gmail.com, isabel
  (holaiza@gmail.com), ludogadois@gmail.com). `vincularSolicitudPorContacto()` ahora registra también
  `solicitud_respondida` (idempotente, no duplica si ya existía) antes de `solicitud_vinculada_presupuesto`
  — mismo fix aplicado al paso 7 del agente `creador-presupuestos`. La tabla de "Solicitudes entrantes" y la ficha de
  la solicitud muestran ahora el número de presupuesto vinculado como enlace directo a su vista previa
  (`navigate('/finanzas/presupuestos', { state: { verDocId, verDocTipo: 'presupuesto' } })`, mismo
  patrón que ya usaba `BuscadorGlobal.tsx`).
- **Corrección puntual del embudo — entradas backdateadas** (2026-08-19): 6 solicitudes creadas antes
  del 11/08/2026 (fecha en la que arrancó `funnel_eventos`) nunca tuvieron su evento
  `solicitud_entrada` pero sí llegaron a etapas posteriores después de esa fecha (p. ej. marcadas
  "Enviada"), lo que producía un embudo sin sentido — más "Respondidas" que "Entradas" (hallazgo real
  de Gabriel, auditoría 2026-08-19: 5 entradas / 6 respondidas). Se insertó a mano el evento
  `solicitud_entrada` que faltaba para esas 6, con `created_at` igual a la fecha real de creación de
  la solicitud — no hace falta ningún cambio de código, es un hueco histórico único de antes de que
  el tracking existiera.
- **Estados simplificados en Solicitudes & Seguimiento, y deduplicación real de solicitudes**
  (2026-08-19): `solicitudes.estado` pierde el valor `Borrador` (quedan solo `Nueva` / `Enviada` /
  `Descartada`, CHECK constraint actualizado) — antes lo ponía automáticamente
  `generar-mensaje-ia` al redactar un mensaje con IA y casi nadie lo usaba a mano; ahora redactar
  un mensaje ya no cambia el estado, la solicitud sigue en `Nueva` hasta marcarse `Enviada` de
  verdad. El pseudo-estado de "Respuestas a presupuestos" (`estadoSeguimiento()` en
  `solicitudes/types.ts`) pasa de `Nueva/Borrador/Enviada` a **`Nueva/Enviada/Aceptada`** — columna
  nueva `presupuestos.seguimiento_concluido` (independiente del estado real
  Pendiente/Aceptado/Rechazado del presupuesto, que sigue gestionándose aparte y sí afecta al
  embudo). "Marcar como Aceptada" (bulk action en `SolicitudesPage.tsx` y botón en
  `SolicitudDetalle.tsx`) es un **cierre definitivo**, no una casilla que se reabre sola: decisión
  explícita de Gabriel — el objetivo de esta sección es rastrear hasta conseguir la visita (ya sea
  ofreciéndola directamente o vía presupuesto orientativo); todo lo de después (presupuesto
  definitivo post-visita, ajustes, facturas) sigue por email pero pertenece a
  Presupuestos/Facturas, no a este tracking. Por eso `revisarRespuestasPresupuestos` en
  `revisar-gmail` excluye directamente de su barrido (`eq('seguimiento_concluido', false)`)
  cualquier presupuesto ya marcado Aceptada — deja de vigilarlo por completo, sin reapertura
  automática (solo "Volver a Nueva"/"Reabrir conversación" a mano lo reactiva).
  **Deduplicación real de solicitudes** (mismo hallazgo de Gabriel): el fallback
  `detectarConversacionesDirectas` de `revisar-gmail` (fuente `email_directo`) dedupeaba solo por
  `gmail_thread_id` — como la notificación automática del formulario web y la conversación real
  con el cliente casi siempre viven en hilos de Gmail distintos, un cliente que ya tenía una
  solicitud (o un presupuesto) y luego respondía por email generaba una segunda solicitud
  duplicada (casos reales: florent.courally@yahoo.fr, rosarito.olabe@gmail.com — la primera
  encontrada tras la corrección de 5 entradas/6 respondidas de arriba). Ahora, antes de crear una
  solicitud nueva, se comprueba por email si ya existe un presupuesto en curso (se ignora, ya lo
  cubre `revisarRespuestasPresupuestos`) o una solicitud sin descartar (se actualiza esa fila —
  `gmail_thread_id`, resumen, y si estaba `Enviada` vuelve a `Nueva` — en vez de crear otra). Los 2
  duplicados históricos ya existentes se marcaron `Descartada` con nota explicativa y se limpió su
  `funnel_eventos`/`presupuesto_vinculado_id` para no inflar el embudo.
- **`facturas.estructura_anterior`** (2026-08-22): antes de constituirse en EURL, Gabriel operaba
  como autónomo — algunas facturas/acomptes de esa etapa (ej. `AC-2026-0020`, Bea Vangheluwe) se
  registran igualmente en el CRM porque forman parte de una serie de pagos/acomptes de un proyecto
  cuya factura final sí es ya de la société, y `lineaDeduccionAcomptes` necesita esa factura previa
  para descontarla correctamente. Pero su importe **no es ingreso real de la EURL**: el checkbox
  "Cobro de una estructura anterior a la EURL actual" en `FacturaForm.tsx` marca esa factura con
  `estructura_anterior = true`, y entonces no genera (ni regenera al editar) apuntes en
  `asientos_contables`, y queda excluida de `AsistenteIvaPage.tsx` (Asistente de IVA),
  `RentabilidadPage.tsx`, `DashboardGeneralPage.tsx` y `VincularFacturaModal.tsx`. Las facturas
  marcadas así que ya habían generado apuntes por error antes de que existiera el checkbox se
  corrigen insertando la reversa exacta de esos apuntes (mismo patrón que `rectificarAsientos`,
  hecho a mano para esas facturas puntuales) — el libro sigue cuadrando y sigue siendo insert-only,
  simplemente el efecto neto de esa factura en la contabilidad de la société es cero. **Auditoría
  2026-08-31:** una revisión encontró exactamente este patrón en `AC-2026-0020` (asientos del
  14/08 revertidos el 22/08) y lo marcó como hallazgo crítico por no estar documentado aquí — no es
  un error, es este mecanismo funcionando como está diseñado.
- **Cuenta PCG 686 (dotations financières) no es amortización** (corregido 2026-08-31): tanto
  `asientosContables.ts` (`esAmortizacion`) como `useComptaFrancia.ts` (`cargasExplotacion`)
  trataban cualquier cuenta que empezara por `68` como amortización de inmovilizado (contrapartida
  2801, dentro del resultado de explotación) — la 686 sí existe como opción real en
  `categorias.ts` y es una dotation financière, no de explotación: su contrapartida debe ser el
  banco (512) como cualquier gasto, y en el compte de résultat va en `cargasFinancieras`, no en
  `cargasExplotacion`. Corregido a comprobar `681` exactamente en vez de `68` como prefijo; añadido
  test de regresión en ambos ficheros.
- **Cita legal del IVA reducido español corregida** (2026-08-31): `mencionIvaReducida('IVA_10')`
  en `src/modules/finanzas/iva.ts` citaba *"artículo 279-0 bis del Código Fiscal Español"* — ese
  artículo es del Code Général des Impôts **francés** (copy-paste de la línea de TVA_10 sin
  actualizar), España no tiene un "Código Fiscal Español" con ese número. Corregido a
  **artículo 91.Uno.2.10º de la Ley 37/1992 del IVA**, la base legal real del tipo reducido para
  obras de renovación de vivienda en España. Este texto sale impreso en facturas/presupuestos
  reales con IVA_10 — revisar si algún documento ya enviado a un cliente español con IVA_10 antes
  de esta fecha lleva la cita antigua.
- **`normalizarTelefono` unifica formato nacional e internacional** (corregido 2026-08-31): antes
  solo quitaba caracteres no numéricos (`tel.replace(/\D/g, '')`), así que un mismo cliente
  guardado como `"0612345678"` en un sitio y `"+33612345678"` en otro generaba dos claves
  distintas y no cruzaba — la misma categoría de bug que ya se corrigió varias veces en el funnel
  de Solicitudes (ver más arriba, 2026-08-19). Ahora se queda con los últimos 9 dígitos (núcleo
  del número, igual en España y Francia), lo que unifica automáticamente nacional/internacional de
  ambos países sin necesidad de detectar el prefijo.
- **Auditoría profunda del CRM, primera ronda** (2026-08-31): primera auditoría completa (código +
  seguridad + integridad de datos + lógica de negocio + fiscalidad) hecha con 4 subagentes en
  paralelo. Sin hallazgos críticos ni altos de seguridad (RLS, CORS, secretos, inyección — todo
  limpio). Corregido en esta ronda, además de lo ya documentado arriba: precio unitario negativo
  sin validar en líneas de presupuesto/factura normal (ahora clamped a 0, igual que ya se hacía con
  cantidad); export anual del embudo (`DashboardPage.tsx`, `exportarRegistroCompleto`) no filtraba
  `eliminado_en` en presupuestos, podía sacar nombre/email real de un presupuesto ya en papelera;
  3 sitios que limpian `visitas.google_event_id` sin comprobar el error de Supabase (violaba la
  regla obligatoria del §1 de este documento); Inmovilizado no validaba `duracion_anios > 0` en el
  formulario (podía romper "Generar dotación" con un error de división por cero). **Documentado
  como ya conocido, no se tocó:** `documento_eventos`/`movimientos_banco` de una factura no se
  borran en la purga RGPD (`ClientePrivacidadTab.tsx`) a propósito, ligados a la factura
  anonimizada en vez de eliminarse — mismo criterio que "facturas nunca se borran" de arriba.
- **`/code-review ultra` en la misma auditoría** (2026-08-31): encontró además una regresión real
  del propio fix de precio negativo de arriba — `lineaDeduccionAcomptes` (factura final tras
  acomptes) inserta a propósito una línea con `precio_unit` negativo y `referencia: 'ACOMPTE'`
  incluso en una factura `normal`, y la validación nueva la bloqueaba; corregido excluyendo esa
  referencia del check tanto en `validarLineas` como en el clamp de `LineasEditor.tsx`. También:
  mismo problema de `precio_unit_max` (input "Precio hasta" de un presupuesto orientativo) sin
  clamp ni validación — corregido igual que `precio_unit`, más el check de que el máximo no sea
  menor que el mínimo. Y `documenso-webhook/index.ts` tiene su propia copia de
  `normalizarTelefono` (Deno no puede importar `clientes/types.ts`) que se había quedado con la
  versión antigua sin `.slice(-9)` — corregida igual que el resto.
  **Falso positivo del review en la nube, a corregir por higiene de git:** marcó
  `src/modules/visitas/horarioVisita.ts` y `VisitaReprogramarPage.tsx` como inexistentes/build
  roto — ambos existen y compilan bien en local (`tsc -b` + `vite build` verificados), pero nunca
  se han comiteado (`git status` los marca `??`); el review en la nube solo ve lo comiteado. Si se
  hace push tal cual sin añadirlos, CI y el despliegue sí fallarían de verdad por esto — hay que
  comitearlos antes de empujar la rama.
- **Recuadro de cliente/potencial editable en VisitaForm.tsx, y división automática de
  nombre/apellidos** (2026-09-02): antes, al elegir un cliente o potencial ya existente, el
  recuadro resumen era de solo lectura (para un potencial completo solo se podía rellenar el
  campo "Apellidos", que `ClientePotencial` nunca trae) — la única forma de corregir un dato mal
  escrito era "Cambiar", que borra la selección entera (hallazgo real de Gabriel). Ahora el
  recuadro tiene un botón "Modificar" que pide confirmación (`useConfirmar`, "el cambio se
  guardará de forma permanente en esta visita") y, al aceptar, despliega los 4 campos
  (nombre/apellidos/teléfono/email) editables ahí mismo, con "Listo" para volver al resumen. Si
  a un potencial solo le falta el apellido, se sigue pidiendo sin confirmación (no es "modificar"
  un dato correcto, es completar uno que falta). Nuevo `dividirNombreCompleto()` en
  `clientes/types.ts` (primera palabra = nombre, resto = apellidos — sin mejor heurística
  disponible sin depender de un servicio externo) aplicado tanto al elegir un potencial
  (`aplicarPotencial`) como al `prefill.nombre` que llega de una solicitud/planning, para no tener
  que rellenar los apellidos a mano en la mayoría de los casos.
- **Aviso previo de "visita mañana" en la campana de notificaciones, y recordatorios de Calendar
  por popup en vez de email** (2026-09-02): hasta ahora el único aviso de que había una visita
  agendada era el email que manda `notificar-visita` al equipo al crearla/reprogramarla — ningún
  recordatorio cercano a la fecha, ni en la app ni en el móvil (hallazgo real de Gabriel: le llegó
  un email de aviso en vez de la notificación normal del móvil que le salía antes al poner un
  recordatorio a mano en Google Calendar). Dos correcciones independientes: (1) la campana
  (`useNotificaciones.ts`) tiene ahora un aviso "Visita mañana: Nombre — HH:MM — Dirección" para
  cualquier visita `Pendiente` con `fecha_visita` = mañana (se autocompleta solo al día siguiente,
  igual que el resto de avisos) — solo visible con el CRM abierto en el navegador, no es una
  notificación push del sistema. (2) `recordatoriosVisita()` en `googleCalendar.ts` creaba los
  recordatorios del evento (1 día antes + el mismo día a las 8:00) con `method: 'email'` en vez de
  `method: 'popup'` — por eso llegaba un correo en vez de la notificación nativa de la app de
  Calendar en el móvil. Corregido a `'popup'`, pero **solo afecta a visitas creadas o
  editadas/reprogramadas a partir de ahora** — los eventos ya existentes en Calendar se quedan con
  el recordatorio por email tal cual (decisión explícita de Gabriel: no merece la pena tocarlos a
  mano uno a uno).
