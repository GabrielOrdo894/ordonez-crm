# Bloque 6 — Solicitudes & Seguimiento asistido

Objetivo: que Gabriel pueda hacer desde el CRM lo mismo que hoy hace pidiéndoselo a Claude
en el chat — revisar solicitudes de presupuesto entrantes y respuestas de clientes a
presupuestos enviados, y generar el mensaje de respuesta con el mismo razonamiento y las
mismas reglas de negocio — sin salir de la aplicación.

**Estado: 🟡 En curso — implementado y reestructurado, pendiente de verificación de
Gabriel.** El Bloque 5 (Fiscalidad) pasó a ✅ Hecho el 2026-07-28 y ese mismo día se
implementó todo lo que se podía hacer sin intervención de Gabriel, incluida una
reestructuración completa pedida el mismo día (ver "Estado de implementación" al final del
documento). Falta que Gabriel haga su parte (reconectar Google — una vez, cubre todos los
scopes añadidos) y pruebe el flujo end-to-end antes de marcarlo ✅ Hecho.

**Reestructuración (2026-07-28, mismo día):** página completa en vez de popup al abrir una
solicitud/seguimiento, generación de mensaje solo bajo demanda, estados
`Nueva/Borrador/Enviada/Descartada` con la nueva en negrita en la lista, entrada manual de
solicitudes pegando texto (WhatsApp/email que Gmail no detectó), vínculo de una solicitud a
un presupuesto real para analítica futura, selector de modelo Haiku/Sonnet por generación, y
tabla `llamadas_ia` con indicador de % de presupuesto mensual de IA consumido. Además, en la
misma sesión: email de confirmación al agendar una visita (a `reformasordonezeus@gmail.com`
+ lista configurable en Configuración), recordatorios de Calendar personalizados (1 día
antes + mismo día a las 8:00), y reorganización de toda la pestaña Configuración en un
acordeón de 5 categorías (arregla también un bug real de móvil donde la navegación interna
quedaba inutilizable).

## Qué hace hoy el flujo manual (lo que hay que igualar)

1. Se busca en Gmail (cuenta `reformasordonezeus@gmail.com`) solicitudes nuevas — llegan por
   cuatro fuentes distintas, ver `docs/directrices-respuesta-clientes.md` y
   `docs/bloque6-solicitudes-seguimiento.md` más abajo — o respuestas a presupuestos
   `Pendiente` ya enviados.
2. Se cruza con Supabase: tabla `presupuestos` (estado, tipo, cliente_email, fecha_emision)
   y tabla `visitas` (huecos ya ocupados) para saber a qué slot de visita ofrecer.
3. Se aplican las reglas de `docs/directrices-respuesta-clientes.md`: orden del mensaje
   (visita arriba, orientativo después, pedir datos si falta info, aclarar que no somos
   empresa de diseño si hace falta), tono según cliente nuevo/conocido, idioma es/fr, y el
   algoritmo de horarios por defecto (18:00 llenando de lunes a viernes, 12:00 llenando de
   sábado hacia atrás).
4. Se redacta el mensaje, nunca se envía solo — Gabriel aprueba.
5. Se guarda un PDF de referencia (`equipo-presupuestos/revisiones/.../seguimiento/` o
   `solicitudes-presupuesto/...`).

## Por qué no se puede hacer solo con lo que hay hoy en el CRM

El CRM es una SPA (React + Vite) sin backend propio. Dos piezas no pueden vivir en el
navegador:

- **Comprobación periódica ("una vez al día")**: nada corre si nadie tiene el CRM abierto.
  Necesita algo que se dispare solo.
- **Leer Gmail**: requiere un token OAuth de Gmail que no se puede guardar de forma segura
  en el cliente (clave anon de Supabase visible en el navegador).

## Piezas necesarias

1. **Tabla `solicitudes` en Supabase** — para que las solicitudes vivan en el CRM y no solo
   en la bandeja de Gmail. Columnas orientativas: `id`, `created_at`, `fuente`
   (`landbot` / `web_wordpress` / `autoenvio_gabriel` / `email_directo`), `nombre`, `email`,
   `telefono`, `tipo_reforma`, `comentario_cliente`, `gmail_message_id` (para no duplicar al
   volver a escanear), `estado` (`Nueva` / `Revisada` / `Convertida a presupuesto` /
   `Descartada`), `mensaje_generado`, `mensaje_enviado boolean`.
2. **Ingesta de solicitudes — vía Gmail, no webhook.** Confirmado 2026-07-28: hay cuatro
   fuentes (ver `docs/directrices-respuesta-clientes.md`), y dos de ellas (autoenvíos de
   Gabriel y clientes que escriben directo) **no tienen remitente/asunto fijo**, así que un
   webhook de Landbot/WordPress solo cubriría 2 de las 4 y de todos modos habría que seguir
   leyendo Gmail para las otras dos. Como además el punto 3 de abajo ya necesita Gmail
   conectado sí o sí, la ingesta vive en la misma Edge Function que la revisión de
   respuestas. **v1 implementada:** solo detecta automáticamente las 2 fuentes con
   remitente fijo (Landbot y `noreply@ordonezrenov.com`), parseadas con regex sobre el
   formato conocido de cada una — no se usa clasificación por IA sobre el resto de la
   bandeja (habría que revisar cada email de la cuenta, no solo los de remitente conocido,
   lo cual sale caro y es más propenso a falsos positivos). Los autoenvíos de Gabriel y los
   emails directos de clientes de momento se siguen revisando manualmente (pidiéndomelo a
   mí en el chat, o mirando el CRM y Gmail a la vez) — ampliar esto a v2 si hace falta,
   probablemente con una llamada a la IA solo bajo demanda ("¿esta solicitud entrante que
   te pego es una solicitud de presupuesto?") en vez de escanear toda la bandeja a diario.
3. **Gmail para seguimiento de presupuestos enviados** — misma Edge Function/conexión que el
   punto 2, para saber si el cliente respondió a un presupuesto ya enviado. Requiere:
   - App OAuth de Gmail registrada en Google Cloud (ver `docs/google-apis.md`, ya se usa
     Google para Maps/Calendar — mismo proyecto `ordonez-crm`).
   - Refresh token guardado como secreto de Supabase (Edge Function `secrets`), nunca en
     el cliente.
   - Edge Function `revisar-gmail` que: (a) detecta solicitudes nuevas de las 4 fuentes y
     las inserta en `solicitudes`, (b) busca hilos de los `cliente_email` de presupuestos
     `Pendiente` y, si el cliente respondió, actualiza una columna nueva en `presupuestos`
     (ej. `ultima_respuesta_cliente_resumen`, `ultima_respuesta_cliente_fecha`).
   - Se puede disparar por cron (Supabase Scheduled Functions / pg_cron) una vez al día, y
     también manualmente con un botón "Comprobar ahora" en el CRM.
4. **Generación del mensaje con el mismo razonamiento** — confirmado con Gabriel
   (2026-07-28): **IA real**, no plantillas deterministas. Una Edge Function llama a la
   API de Anthropic (ver `docs/google-apis.md` y la skill `claude-api` del repo de
   Claude Code para referencia de la API) pasándole el contenido de
   `docs/directrices-respuesta-clientes.md` (mover a una tabla `directrices` editable
   desde el CRM en vez de un fichero markdown, para que Gabriel pueda seguir ajustándolas
   sin tocar código) + los datos del caso concreto (solicitud o presupuesto + historial de
   Gmail). Implica: guardar `ANTHROPIC_API_KEY` como secreto de la Edge Function (nunca en
   el cliente/`VITE_*`), y asumir el coste por llamada (bajo para este volumen — un mensaje
   corto por solicitud/seguimiento, no por visita al CRM).
5. **Algoritmo de horarios** — se puede portar tal cual a una función JS (`src/lib/
   horariosVisita.ts`) reutilizable tanto por el flujo determinista como por el prompt de
   la IA si se usa: consulta `visitas` (fecha_visita, hora_visita, estado ≠ Cancelada) y
   devuelve el primer slot libre según el algoritmo ya documentado.
6. **UI** — pestaña nueva (¿dentro de Visitas, o "Solicitudes" aparte en el sidebar?) con
   dos secciones:
   - **Solicitudes nuevas**: lista de `solicitudes` en estado `Nueva`, botón "Generar
     respuesta" → modal con el borrador (editable) → "Copiar" / "Marcar como respondida".
   - **Presupuestos pendientes de revisar**: presupuestos `Pendiente` con
     `ultima_respuesta_cliente_resumen` reciente sin marcar como visto, mismo patrón de
     modal con borrador.
   - Nunca un botón de "enviar" automático sin pasar por Gabriel — como mínimo, copiar al
     portapapeles; si se decide enviar de verdad desde el CRM, sería vía Gmail API (draft o
     send) con confirmación explícita en el momento, igual que hoy en el chat.

## Decisiones ya confirmadas (2026-07-28)

- **IA real**, no plantillas deterministas — ver punto 4 de arriba.
- **Secuencia**: se espera a que el Bloque 5 esté ✅ Hecho antes de empezar a implementar.

## Decisiones aún pendientes de Gabriel

- Ninguna bloqueante por ahora. Las cuatro fuentes de solicitudes ya están confirmadas
  (ver `docs/directrices-respuesta-clientes.md`). El webhook de Landbot/WordPress queda
  como optimización opcional, no bloquea el diseño (ingesta vía Gmail cubre las 4 fuentes).

## Estado de implementación (2026-07-28)

Hecho por Claude directamente en el proyecto real de Supabase (sin entorno de pruebas
intermedio — ver riesgos al final):

- **Migraciones aplicadas:** tabla `solicitudes`, columnas nuevas en `presupuestos`
  (`ultima_respuesta_cliente_resumen`, `ultima_respuesta_cliente_fecha`,
  `ultima_respuesta_revisada`, `mensaje_seguimiento_generado`), tabla `directrices` (con
  el contenido de `docs/directrices-respuesta-clientes.md` ya migrado, 3 filas), y columna
  `empresa_config.visitas_disponibles_desde` (hoy en `2026-09-07`, actualizar cuando
  cambie la disponibilidad real — sustituye la fecha en texto libre que había antes).
- **Scope de Google ampliado:** `src/lib/googleCalendar.ts` pide ahora también
  `gmail.readonly`, reutilizando el `refresh_token` compartido de `google_config`. No se
  ha creado ninguna app OAuth nueva.
- **Edge Function `revisar-gmail`** (desplegada): ingiere solicitudes nuevas de Landbot y
  `noreply@ordonezrenov.com` de los últimos 7 días, y revisa si los clientes con
  presupuesto `Pendiente` han respondido (últimos 60 días). Invocable manualmente
  (`supabase.functions.invoke('revisar-gmail')`, botón "Comprobar Gmail ahora" en el CRM)
  y programada por cron.
- **Edge Function `generar-mensaje-ia`** (desplegada): calcula el slot de visita libre en
  JS (algoritmo determinista, no se lo pide a la IA) y llama a la API de Anthropic con las
  directrices de la tabla `directrices` para redactar el mensaje, forzando salida
  estructurada (`asunto`, `cuerpo`, `avisos`) vía tool use. Guarda el resultado en
  `solicitudes.mensaje_generado` / `presupuestos.mensaje_seguimiento_generado`.
- **UI:** módulo `src/modules/solicitudes/SolicitudesPage.tsx`, nueva sección
  "Solicitudes" en el Sidebar, ruta `/solicitudes` en `App.tsx`. Lista solicitudes nuevas y
  presupuestos con respuesta sin revisar, botón para generar/regenerar el borrador con IA,
  copiar asunto/cuerpo, marcar como gestionada. `npx tsc -b` pasa sin errores y la app
  arranca sin errores de consola — **no se ha podido verificar visualmente la pantalla ya
  autenticada** (no tengo credenciales de acceso al CRM).
- **Cron diario:** `pg_cron` + `pg_net` activados, job `revisar-gmail-diario` a las 06:00
  UTC llamando a `revisar-gmail` vía HTTP con la clave anon (pública, la misma que usa el
  frontend) como token — no hace falta guardar ningún secreto adicional para el cron.

**Pendiente por parte de Gabriel** (no lo puede hacer Claude):

1. En el CRM → Configuración → Google Calendar, pulsar "Conectar Google" de nuevo (aunque
   ya estuviera conectado) para regenerar el `refresh_token` con el scope `gmail.readonly`
   incluido. Si la pantalla de consentimiento de Google no ofrece ese scope, revisar en
   Google Cloud Console → APIs & Services → OAuth consent screen que esté en la lista de
   scopes del proyecto, y en APIs & Services → Library que "Gmail API" esté habilitada.
2. ~~Crear API key de Anthropic y configurarla como secreto~~ — **hecho (2026-07-28).**
   `ANTHROPIC_API_KEY` ya está configurada como secreto de las Edge Functions y
   `generar-mensaje-ia` se probó de extremo a extremo con un caso real (la solicitud de
   Rosarito): calculó el slot correctamente (lunes 7 de septiembre, 18:00), llamó a la API
   de Anthropic con salida estructurada (`strict: true` en la tool, ya corregido tras un
   primer intento en el que `avisos` volvía como texto en vez de lista), y guardó el
   resultado en `solicitudes.mensaje_generado`. Modelo por defecto: `claude-sonnet-5`;
   cambiar a `claude-haiku-4-5` (más barato) con el secreto opcional `ANTHROPIC_MODEL` si
   se quiere probar sin tocar código.
3. Probar en el navegador: entrar en `/solicitudes` en el CRM, pulsar "Comprobar Gmail
   ahora" (esto sí necesita el paso 1 hecho primero) y confirmar que aparecen
   solicitudes/respuestas reales. Ya se comprobó por separado que la generación del mensaje
   con IA funciona (paso 2) — falta verificar visualmente la pantalla, que no se pudo
   probar sin credenciales de acceso al CRM.
4. Una vez probado y conforme, actualizar el estado del Bloque 6 a ✅ Hecho en `CLAUDE.md`.

**Riesgos de haber implementado directo en producción** (sin rama de pruebas ni review
antes de aplicar): las migraciones y Edge Functions ya están viviendo en el proyecto real.
Antes de dar el bloque por ✅ Hecho, probar con casos reales (alguna solicitud/respuesta ya
conocida) y revisar los logs (`get_logs`) de las Edge Functions si algo falla.

**Actualización posterior (misma fecha, ver `MEMORY.md` → project_bloque6_solicitudes_seguimiento
para el detalle completo de todas las pasadas):** la página se reestructuró varias veces
(pestañas → rutas independientes en el Sidebar, entrada manual con selector de idioma,
bloque de solicitudes en la Home) y `revisar-gmail` ganó dos capacidades nuevas:

- **Respuestas a solicitudes sin presupuesto:** antes solo se comprobaban respuestas de
  clientes contra `presupuestos` en estado `Pendiente`. Ahora también revisa el hilo de
  Gmail (`gmail_thread_id`) de cada solicitud en estado `Enviada` sin `presupuesto_vinculado_id`,
  y si el cliente respondió, la guarda en `solicitudes.ultima_respuesta_cliente_resumen` /
  `_fecha` y la devuelve a `Nueva` — sigue resolviéndose desde "Solicitudes entrantes", sin
  pasar por "Respuestas a presupuestos".
- **Detección de las fuentes 3 y 4 (autoenvíos y clientes directos) — implementada y luego
  revertida el mismo día.** Se llegó a construir una clasificación por IA (Claude Haiku,
  lote único, tabla `gmail_mensajes_revisados` para no reclasificar) pero Gabriel decidió
  no usarla: quiere que Claude se dedique solo a redactar mensajes, y revisar estas dos
  fuentes él mismo a mano, sin gastar tokens en una tarea que considera simple. Se quitó el
  código, la tabla y la llamada del handler — `revisar-gmail` solo hace los 3 puntos de
  arriba. Ver `reference_fuentes_solicitudes_web` para el detalle de las 4 fuentes.
