# Handoff para trabajar en este proyecto con otra IA (ChatGPT u otra)

Este documento existe porque Gabriel a veces usa otra IA (ChatGPT) cuando se le acaban los
tokens de Claude. Reúne lo que Claude Code hace automáticamente vía sus propias herramientas
(MCP) pero que una IA sin esas herramientas necesita saber hacer a mano: acceder a Supabase,
desplegar el CRM, y las reglas de comportamiento del proyecto. No sustituye a `CLAUDE.md` (leer
ese primero, siempre) — es el complemento operativo de "cómo hacerlo de verdad" cuando no hay
herramientas MCP disponibles.

---

## 1. Acceso a Supabase

**Proyecto**: `mhbicdrquinlwhasrvgo` (URL: `https://mhbicdrquinlwhasrvgo.supabase.co`).

### Sin herramientas MCP (caso de ChatGPT u otra IA de chat normal)

No hay forma de que una IA de chat ejecute SQL directamente salvo que tenga acceso a
herramientas/plugins de terminal o API. Las opciones reales:

1. **Gabriel ejecuta el SQL él mismo**: la IA redacta la consulta, Gabriel la pega en
   **Supabase Dashboard → SQL Editor** (`https://supabase.com/dashboard/project/mhbicdrquinlwhasrvgo/sql`)
   y pega el resultado de vuelta al chat. Es el método más simple y seguro.
2. **Si la IA tiene acceso a terminal/shell** (Code Interpreter, un agente con `curl`, etc.):
   usar la API REST de Supabase (PostgREST) con la `service_role key` (bypassa RLS) o la
   `anon key` (respeta RLS — cualquier usuario logueado en el CRM tiene acceso total, ver más
   abajo). Las credenciales están en `.env` (nunca en git) y también en el propio dashboard de
   Supabase → Settings → API. Formato de llamada:
   ```
   curl "https://mhbicdrquinlwhasrvgo.supabase.co/rest/v1/visitas?select=*&limit=5" \
     -H "apikey: <anon_key o service_role_key>" \
     -H "Authorization: Bearer <la misma key>"
   ```
3. **Cambios de esquema (nuevas columnas/tablas)**: mismo SQL Editor del dashboard, o
   `ALTER TABLE`/`CREATE TABLE` normales. Documentar el cambio en `docs/tecnico/supabase-schema.md`
   después.

### Seguridad — leer antes de tocar nada

- **RLS activado** en las 21 tablas desde 2026-08-04, política uniforme `authenticated`-only:
  cualquier usuario logueado en el CRM tiene acceso completo de lectura/escritura, el rol
  público/anónimo no tiene ninguno. La `service_role key` salta RLS siempre — tratarla como
  una contraseña maestra, nunca pegarla en un mensaje de chat ni en código.
- **Nunca hardcodear credenciales** en ficheros del repo. Todo vía variables de entorno
  (`import.meta.env.VITE_*` en frontend, `Deno.env.get(...)` en Edge Functions, secretos
  gestionados desde Supabase Dashboard → Edge Functions → Secrets).

---

## 2. Desplegar el CRM (build + subida a Hostinger)

El CRM **no está en Netlify ni Vercel** pese a lo que puede sugerir código antiguo — vive en
**Hostinger**, dentro de `ordonezrenov.com/crm/` (una subcarpeta del WordPress principal, NO la
raíz del sitio). Cuenta Hostinger: usuario `u486261052`.

**"Actualizar todo" es un único gesto** (petición explícita de Gabriel): siempre hacer los 4
pasos juntos, nunca solo uno.

1. **Commit + push a `main`** en GitHub (`github.com/GabrielOrdo894/ordonez-crm`, repo privado,
   CI en GitHub Actions con build+test+lint en cada push).
2. **`npm run build`** en la raíz del repo → genera `dist/`.
3. **Subir `dist/` a `crm/` dentro de `public_html`** — nunca a la raíz del sitio (esa es el
   WordPress público, se pisaría). Dos formas:
   - **Manual (sin API)**: Hostinger hPanel → Administrador de archivos → entrar en `crm/` →
     subir/sobrescribir todo el contenido de `dist/` a mano. Es tedioso pero siempre funciona.
   - **Con API de Hostinger** (si la IA tiene acceso a la API de Hostinger — requiere un token de
     API generado en hPanel → API): generar una URL de subida (`POST` al endpoint de generación
     de credenciales TUS de la API de Hostinger, que da `url` + `auth_key` + `rest_auth_key`), y
     subir cada fichero de `dist/` a `{url}/crm/{ruta-relativa}?override=true` con el protocolo
     TUS (`POST` con cabeceras `Upload-Length`/`Upload-Offset: 0` → `201`; `PATCH` con el
     contenido y `Content-Type: application/offset+octet-stream` → `204`; cabeceras `X-Auth`/
     `X-Auth-Rest` en ambas). Las credenciales caducan a las pocas horas (JWT con `exp`), pedir
     unas nuevas si fallan.
4. **Purgar caché** del directorio `crm` (endpoint de limpieza de caché de Hostinger, o desde
   hPanel si es manual).
5. **Verificar**: `curl -I https://ordonezrenov.com/crm/` debe dar `200`, y el hash del bundle
   servido en `index.html` (`assets/index-XXXXXXXX.js`) debe coincidir con el que acaba de
   generar `npm run build`. Si el navegador sigue mostrando la versión vieja, hace falta recarga
   forzada real (Ctrl+Shift+R), la caché del propio navegador puede tardar en soltar el chunk
   viejo aunque el servidor ya sirva el nuevo.

Las **Edge Functions de Supabase** (`supabase/functions/*`) se despliegan aparte, no forman
parte de este build — se suben directamente a Supabase (vía su CLI `supabase functions deploy
<nombre>`, o vía su API/dashboard). Cualquier edición de una función no tiene efecto en
producción hasta que se despliega explícitamente — editar el fichero local no basta.

---

## 2bis. Agentes especializados y lógica de negocio — dónde está de verdad

Los "agentes" (`creador-presupuestos`, `revisor-presupuestos`, `envio-presupuestos`,
`seguimiento-presupuestos`, etc.) que Claude Code usa como subagentes **son solo ficheros de
instrucciones en Markdown**, en `.claude/agents/*.md` — cualquier IA con acceso al repo puede
abrirlos y seguirlos como si fueran un prompt largo. No hay nada mágico ahí, es texto plano.
Antes de crear/revisar/enviar un presupuesto, **leer el fichero del agente correspondiente
entero** — tiene el proceso paso a paso, incluidas las escrituras a `funnel_eventos` que hay que
hacer a mano por SQL (una IA sin la función `registrarEventoFunnel()` del frontend tiene que
replicar ese INSERT ella misma, el propio fichero del agente trae el SQL exacto a copiar).

**Regla fija desde 2026-09-19 (Gabriel): ningún presupuesto se crea sin quedar vinculado a una
visita y su solicitud.** Antes de generar el presupuesto, buscar en `visitas`/`solicitudes` por
cualquier dato disponible del cliente (nombre, dirección — con variantes de grafía, no solo la
grafía exacta que da Gabriel—, teléfono, email) y **confirmar con Gabriel a cuál vincularlo**
antes de seguir. Si confirma que no hay ninguna coincidencia, crear la visita y la solicitud
automáticamente a partir de los datos del propio presupuesto (ver el fichero
`creador-presupuestos.md`, paso 8, para el proceso completo y el SQL exacto de ambos caminos).

Para el embudo de conversión y el pipeline de clientes, la lógica real (no solo el resumen del
punto 3 de abajo) vive en:
- `src/lib/funnelTracking.ts` — etapas del embudo (`ETAPAS_FUNNEL_SOLICITUD`), función
  `registrarEventoFunnel()` (idempotente), `contarUnicosEnFunnel()` (cuenta `solicitud_id`/
  `presupuesto_id` únicos por etapa, sin exigir que se hayan alcanzado las etapas anteriores).
- `src/lib/pipelineSync.ts` — `etapaAutomatica()` (deriva la etapa del pipeline de un cliente a
  partir de su visita/presupuestos/proyecto/factura) y `etapaMaximaAlcanzada()` (el pipeline
  nunca retrocede, ni si el estado actual baja).

---

## 3. Reglas de comportamiento — resumen crítico

Esto es un resumen de lo más importante. **`CLAUDE.md` en la raíz del repo es la fuente
completa y siempre gana si hay contradicción** — leerlo entero antes de tocar código.

- **Manejo de errores de Supabase obligatorio en cada llamada** — nunca silenciar un error,
  siempre mostrar feedback al usuario (`toast.error(error.message)` en frontend, `console.error`
  + no tumbar el flujo principal en Edge Functions best-effort).
- **Código mínimo, cambios quirúrgicos**: sin features no pedidas, sin abstracciones
  especulativas, tocar solo lo necesario. No "mejorar" código adyacente que no está roto.
- **Razonar antes de codificar**: para tareas de varios pasos, exponer un plan breve con
  criterios de verificación antes de tocar código, y esperar confirmación si hay ambigüedad —
  no basta con preguntas puntuales previas si el enfoque cambia por el camino.
- **Papelera (soft-delete)** en `visitas`, `presupuestos` y `facturas`: borrar desde el CRM no
  hace `DELETE`, actualiza `eliminado_en`/`eliminado_por`. Toda lectura activa de estas 3 tablas
  debe filtrar `.is('eliminado_en', null)` salvo búsqueda por id ya conocido.
- **Facturas nunca se eliminan de verdad**, ni siquiera desde la papelera (numeración
  correlativa legal). Para anular una factura real hace falta una factura rectificativa.
- **`solicitudes.estado = 'Eliminada'`** tampoco es un DELETE real — pero SÍ borra de verdad sus
  eventos en `funnel_eventos` (desde 2026-09-19), para que no siga contando en el embudo de
  conversión. La visita/presupuesto vinculados no se tocan.
- **`asientos_contables` es insert-only** (sin política de `update`/`delete`) — un asiento mal
  hecho se corrige insertando su reversa, nunca editando la fila original.
- **`funnel_eventos`**: registro histórico de eventos del embudo de conversión, también
  pensado como append-only en la práctica — no debe editarse ni borrarse salvo limpieza
  explícita de duplicados o purga RGPD. `registrarEventoFunnel()` en `src/lib/funnelTracking.ts`
  es idempotente (comprueba si ya existe el evento antes de insertar).
- **Queries de Tanstack Query con la misma `queryKey` deben compartir exactamente el mismo
  `select`** entre todos los componentes que la usan — Tanstack cachea por `queryKey`, no por
  columnas pedidas, así que un `select` más corto en un sitio pisa en silencio los datos que
  otro componente necesitaba (bug real, ya ha pasado más de una vez en este proyecto).
- **Nota automática del sistema** tras acciones importantes (guardar visita, cambiar estado,
  mover pipeline, firmar, crear evento de Google Calendar) — función `notaSistema()` en
  `src/lib/notaSistema.ts`, inserta en `notas_cliente` con `tipo: 'sistema'`.
- **Diseño**: ver `docs/tecnico/diseno.md` para tokens completos. Verde `#1a5c38` primario,
  `#0f3d24` sidebar, radios de 10px (cards/inputs/botones) y 14px (modales), sin gradientes ni
  sombras decorativas, Poppins como única fuente.
- **RGPD**: la purga de datos de un cliente (`ClientePrivacidadTab.tsx`) SÍ hace borrado duro
  real en cascada — excepción: las facturas nunca se borran, se anonimizan.
- **Bilingüe ES/FR real**: los documentos de cliente (presupuestos, notas, emails) van en el
  idioma real del documento/cliente — nunca traducidos automáticamente desde español salvo que
  sea la traducción interna explícita (`traducir-presupuesto`, marcada como "NO VÁLIDA COMO
  DOCUMENTO OFICIAL").
- **Nunca enviar un email a un cliente directamente** (`send_message`/`reply` sin más) — siempre
  como borrador (`create_draft`), y avisar la fecha/hora exacta de envío programado si la
  herramienta de correo usada la programa en vez de dejarlo inerte (ver limitación conocida de
  Claude con el MCP de Gmail — puede no aplicar igual con otra IA/herramienta de correo).

---

## 3bis. Lo que este documento NO puede darte

Dos cosas que Claude Code hace en este proyecto dependen de herramientas atadas a la cuenta de
Gabriel en claude.ai, no al repo — ninguna otra IA las tiene por leer este documento. Hace falta
montar el equivalente aparte, con su propia autorización de Gabriel:

- **Redactar borradores en el Gmail de `reformasordonezeus@gmail.com`**: Claude lo hace vía un
  conector de Gmail de claude.ai (OAuth ya autorizado por Gabriel a ese conector concreto). Otra
  IA necesitaría su propia integración de Gmail (por ejemplo un GPT personalizado con acción de
  Gmail, o acceso a la API de Gmail con sus propias credenciales OAuth) — sin eso, no puede leer
  ni escribir en esa bandeja.
- **Navegar el CRM en el navegador** (sacar el enlace real de firma de Documenso, hacer capturas,
  verificar visualmente un cambio) — Claude lo hace con la extensión "Claude in Chrome". Otra IA
  necesitaría su propio modo de navegación (agentes tipo "computer use"/"operator") para poder
  hacer lo mismo; sin eso, esas tareas concretas (typicamente: obtener `documenso_signing_url`
  para un presupuesto nuevo, que solo se genera al pulsar el botón en el CRM) no se pueden hacer
  por SQL ni por API, hay que dejárselas a Gabriel o esperar a la próxima sesión con Claude.

---

## 3ter. Cómo montar el acceso equivalente en ChatGPT (para que Gabriel lo haga una vez)

Esto lo tiene que configurar Gabriel manualmente en su cuenta de ChatGPT — no es algo que se
pueda dejar escrito de una vez para siempre en el repo, porque son permisos ligados a su cuenta
personal, igual que el acceso de Gmail de Claude. Se hace una vez y queda disponible en
cualquier chat nuevo.

### A. Gmail (leer/redactar en `reformasordonezeus@gmail.com`)

Necesita un plan de ChatGPT con **Conectores** (Plus, Pro, Team, Enterprise o Edu — no está en
el plan gratuito).

1. En ChatGPT, ir a **Ajustes → Conectores** (in English: *Settings → Connectors*).
2. Buscar **Gmail** en la lista y pulsar **Conectar**.
3. Se abre el flujo de OAuth de Google — iniciar sesión con `reformasordonezeus@gmail.com` (no
   con una cuenta personal de Gabriel) y aceptar los permisos que pida.
4. Una vez conectado, en cualquier chat se puede activar el conector de Gmail (icono de
   herramientas/`+` junto al mensaje, o mencionándolo según la versión de la interfaz) para que
   esa conversación pueda buscar hilos y crear borradores.
5. **Igual que con Claude**: pedirle siempre que redacte en **borrador**, nunca que envíe
   directamente — y comprobar en la propia bandeja de Gmail que el borrador quedó inerte (no
   programado) antes de darlo por hecho, por si la integración de ChatGPT también tuviera algún
   comportamiento inesperado con el envío (no se puede dar por descontado que se comporte igual
   que el conector de Claude solo porque el destino final es el mismo Gmail).

Si el plan de ChatGPT no incluye Conectores, la alternativa es crear un **GPT personalizado**
con una **Action** que llame a la API de Gmail directamente (requiere crear credenciales OAuth
propias en Google Cloud Console para ese GPT) — más trabajo de configuración, solo merece la
pena si el uso va a ser frecuente.

### B. Navegación del CRM (sacar enlaces de Documenso, verificar visualmente)

Necesita el **modo Agente** de ChatGPT (a veces llamado *Agent mode*, antes *Operator* — plan
Plus, Pro o Team; comprobar disponibilidad en la cuenta de Gabriel, no todos los planes lo
tienen activo todavía).

1. Al iniciar un chat, buscar el selector de modo/herramientas y elegir **Agente** (o el nombre
   que tenga en ese momento la opción de navegación con control de pantalla).
2. Pedirle que navegue a `https://ordonezrenov.com/crm/`, inicie sesión (Gabriel debe dar la
   contraseña él mismo cuando el agente se lo pida en pantalla, nunca pegarla en el chat de
   texto) y realice la acción (ej. abrir un presupuesto, pulsar "Obtener enlace de firma", leer
   el enlace completo).
3. Mismo cuidado que con Claude in Chrome: no dejar que interactúe con datos sensibles de pago,
   y verificar el resultado (en este caso, comparando el enlace obtenido con el que quede
   guardado en `presupuestos.documenso_signing_url` vía Supabase) antes de usarlo.

---

## 4. Dónde está cada cosa (mapa rápido)

- **Esquema completo de tablas**: `docs/tecnico/supabase-schema.md`.
- **Datos de empresa, zonas, usuarios**: `docs/negocio/empresa.md`.
- **Precios de referencia**: `docs/negocio/tarifas-referencia.md`.
- **Lógica de IVA/TVA y finanzas**: `docs/negocio/finanzas.md`.
- **Documenso (firma electrónica, autoalojado en `firma.ordonezrenov.com`)**:
  `docs/tecnico/documenso.md`.
- **Cuenta y sitios de Hostinger**: preguntar a Gabriel si hace falta acceso más allá del CRM —
  la cuenta tiene otros sitios ajenos al CRM, no tocar sin permiso explícito.

---

*Creado 2026-09-19 a petición de Gabriel, para poder seguir trabajando en el proyecto con otra
IA cuando no haya tokens de Claude disponibles. Mantener actualizado si cambian los procesos de
despliegue o acceso.*
