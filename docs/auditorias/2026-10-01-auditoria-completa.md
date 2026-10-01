# Auditoría completa del CRM — 2026-10-01

Auditoría de solo lectura de todo el CRM: ~64.000 líneas en `src/` y `supabase/functions/`, base de datos de
producción, Storage, crons, logs y código desplegado. Se hizo con 9 revisiones en paralelo, una por área.
Los hallazgos críticos se comprobaron después a mano contra el código y la base de datos.

## Estado de los arreglos (2026-10-01, mismo día)

Aplicado en base de datos y Edge Functions (desplegadas). El frontend está en el repo, **pendiente de publicar**
en Hostinger. Comprobado: tipos sin errores, 234 tests (16 nuevos), lint y build.

| Fase | Estado |
|------|--------|
| 0 — Ajustes de Gabriel (registro público, OAuth Google en producción, redirect URL, proyecto antiguo) | **Pendiente de Gabriel** |
| 1 — Integridad contable y legal | Hecho (1.1–1.12) |
| 2 — Cierre del ejercicio | Hecho: OD, bloqueo de periodo, liasse completa, pasivo desde el libro, déficits, L223-42, acta con pérdidas, renta del gérant, calendario, inmovilizado. Sin hacer: TVA del vehículo (decisión de Gabriel: son coches distintos), barème/PASS por año |
| 3 — Seguridad y base de datos | Hecho, salvo el esquema completo de migraciones en el repo (necesita Docker; ver `supabase/migrations/README.md`) |
| 4 — Flujos del día a día | Hecho |
| 5 — Limpieza de datos | Hecho: visita de Bea restaurada y AC-2026-0021 vinculada, pipeline de 3 obras corregido, embudo limpio, 12 teléfonos normalizados, kilometraje sin IVA. Pendiente de Gabriel: 8 teléfonos de 9 dígitos sin prefijo (España o Francia), reclasificar Ventsus (626 → 623x) y el gasto "Travail Biarritz" de Anthropic, borrar el bucket vacío `Justificantes` desde el panel, papelera de prueba |
| 6 — Deuda técnica | Parcial: autorización y codificación MIME de los emails unificadas en `_shared/`; resto (otros helpers duplicados, accesibilidad, dependencias) sin tocar |

Decisiones tomadas por Gabriel: subir el contador de acomptes por encima de AC-0021 (la base de datos ya salta los
números ocupados), las facturas F-0001…0004 y AC-0001…0003 eran pruebas, restaurar la visita de Bea, separar series
por emisor, el carburante es de otros coches, las CA3 de julio y agosto ya están presentadas.

## Línea base

- `tsc -b`: 0 errores.
- Vitest: 218 de 218 tests pasan.
- ESLint: 0 errores y 14 avisos, todos de Fast Refresh.
- **Libro diario**: cuadra al céntimo, en total, por ejercicio, por documento y por lote (226.326,29 €).
  - 0 asientos huérfanos.
  - 411 y 44574 a cero.
  - 4191 igual a los acomptes de la EURL.
  - Los 57 gastos pagados tienen su asiento.
- `facturas.monto_pagado` y `fecha_pago` coinciden con `pagos_factura` en las 8 facturas.
- RLS activo en las 33 tablas. 0 fallos de cron en 14 días.
- Las 19 Edge Functions desplegadas son iguales al código local (solo cambian comentarios).
- Sin XSS: no hay `dangerouslySetInnerHTML`. El `.env` no está en git y en el bundle solo va la clave anon.

---

## Fase 0 — Ajustes que solo puede hacer Gabriel (fuera del código)

| # | Qué | Por qué |
|---|-----|---------|
| 0.1 | **Supabase → Authentication → desactivar "Allow new users to sign up"** | Hoy `disable_signup=false`. Cualquiera que confirme un email entra al CRM con acceso total, porque las políticas son `authenticated using (true)`. En `auth.users` solo están los 3 del equipo. |
| 0.2 | **Google Cloud → pantalla de consentimiento OAuth → "In production"** | Los refresh tokens de Gmail y Calendar se revocan cada ~7 días. Es la caducidad del modo "Testing": hubo reconexiones el 21/09 y el 30/09, y errores "expired or revoked". |
| 0.3 | Localizar el proyecto o rama de Supabase antiguo que llama a `revisar-gmail` y `alerta-diaria` a las 06:00/06:30 desde 3.18.180.123 (pg_net 0.20.3) y borrar sus crons | Hoy se rechaza con 401, pero tiene guardada una service_role antigua de este proyecto. |
| 0.4 | Supabase Auth → añadir `https://ordonezrenov.com/crm/` a las Redirect URLs | Hace falta para el arreglo de "recuperar contraseña" (3.4). |

## Decisiones que necesito de Gabriel antes de tocar datos

1. **Serie de acomptes.** Existen AC-2026-0004…0008 y además AC-2026-0020/0021. El contador está en 8, así que en el
   acompte nº 20 el alta fallará por número duplicado. AC-0021 (07/09) lleva un número mayor que AC-0004 (24/09).
   ¿Qué hacemos: fijar el contador en 21 y documentar el salto, u otra cosa?
2. **Huecos F-0001…0004 y AC-0001…0003.** Según las notas, eran facturas de prueba (visita "gabriel sarango",
   16/07) que se borraron físicamente. ¿Confirmas que ninguna llegó a un cliente? Si es así, se deja constancia
   escrita del hueco.
3. **Visita de Bea Vangheluwe.** Está en la papelera desde el 20/09, en un borrado masivo, pero tiene el presupuesto
   D-2026-0017 aceptado, los acomptes AC-0020/0021/0004 y un planning. ¿La restauro? (Hoy Bea no sale en Clientes
   ni en el Pipeline.)
4. **Series por emisor.** Las facturas FR (EURL) y ES (autónomo Mario Ricardo) comparten contador. La primera
   factura ES dejará huecos en las dos series. ¿Separamos los contadores (`F-` FR / `FE-` ES, o similar)?
5. **Carburante.** Los tickets EasyGas deducen el 100 % de la TVA, y los mismos días hay indemnités kilométriques.
   ¿Es el mismo vehículo (Tiguan particular)? Si lo es, hay doble deducción: el barème ya cubre el carburante.
6. **CA3 de julio y agosto.** En `echeances_fiscales` constan como "completadas", pero según lo hablado no se
   presentaron. ¿Cuál es el estado real?
7. **Visitas sin prefijo.** 26 visitas activas tienen el teléfono sin +33/+34. Los números de 10 dígitos
   06/07 se normalizan solos; los de 9 dígitos son ambiguos. ¿Te paso la lista para decidir uno a uno?

---

## Fase 1 — Integridad contable y legal (lo primero)

| # | Hallazgo | Arreglo |
|---|----------|---------|
| 1.1 | **No se puede borrar ningún pago contabilizado.** Las FK `asientos_contables.pago_id` y `movimientos_banco.pago_id` son `NO ACTION` (comprobado). "Eliminar pago" falla siempre. En Banco, "Deshacer" primero anula el cobro en el libro y luego falla el borrado: libro y factura quedan desalineados para siempre. | Anulación lógica de pagos (`pagos_factura.anulado_en/por`), filtrada en todas las lecturas (CA3, Resultado, Libro de ingresos, dashboards, recálculo de `monto_pagado`). El orden pasa a ser: anular, luego reversa por `pago_id`, luego soltar el movimiento bancario. Un único helper para el recálculo de `monto_pagado`, hoy copiado en 4 sitios. |
| 1.2 | **La factura final de Bea descontará también AC-2026-0020**, que es de la estructura anterior. Esa parte irá a 706 y cargará 4191 por 14.279,63 € que nunca entraron en 4191: ventas infladas y 4191 deudor. Comprobado en `FacturaForm.tsx:160`, que no filtra `estructura_anterior`. | Separar en la deducción los acomptes de la estructura anterior: una línea propia que reduce la venta, no 4191. Test de regresión. |
| 1.3 | **Una factura emitida se puede editar entera**: líneas, fecha, IVA, país, cliente, `estructura_anterior`. El PDF ya no coincide con el que tiene el cliente, y cada guardado reescribe asientos con fechas antiguas. Además, el update pisa `estado_cobro`, `monto_pagado` y los campos de reseña con valores viejos. | Bloquear los campos fiscales en facturas numeradas; las correcciones se hacen con rectificativa. El update no envía campos derivados. `recontabilizarFactura` solo se llama si cambió algo contable. Trigger en la base de datos como defensa. |
| 1.4 | **Escrituras a medias.** `notaSistema` y `congelarTerminosCondiciones` lanzan error después del insert principal. Así quedan facturas sin asiento (`FacturaForm.tsx:443`), cobros sin asiento (`RegistrarPagoModal.tsx:93`) y asientos de cobros ya borrados (`FacturasPage.tsx:163`). El reintento duplica la factura o el pago. Es la misma clase de fallo que AC-2026-0021. | Asiento dentro de `mutationFn`, justo después de la escritura principal. Lo accesorio (nota, funnel, T&C) en try/catch con aviso. Invalidar en `onSettled`. A medio plazo, RPC transaccional para factura + asiento y pago + asiento. El aviso "documentos sin asiento" del Libro diario también debe detectar cobros sin asiento. |
| 1.5 | **Numeración de facturas.** El número se reserva antes del insert, así que una fecha vacía o un fallo de red dejan un hueco. El contador de AC está por debajo de números ya usados. No se controla el orden cronológico. El año sale del reloj del navegador. | Función SQL que asigna el número y hace el insert en la misma transacción, salta números ya ocupados y valida `fecha_factura` ≥ la última de la serie. Contadores por emisor (decisión 4). |
| 1.6 | **Ninguna factura pasa nunca a "Vencida".** No hay código, trigger ni cron que lo haga. El aviso diario de impagos, la campana y los KPI de vencidas no pueden encontrar nada. | Calcular "vencida" (`fecha_vence < hoy` y no cobrada) en un helper común, usado en pantallas y en `alerta-diaria`. |
| 1.7 | **Rectificativa de una factura no cobrada**: la línea 21 de la CA3 deduce TVA que nunca se declaró, y 44574 queda acreedor para siempre. | Prorratear la TVA de la rectificativa entre la parte cobrada (44571 / línea 21) y la no cobrada (44574). |
| 1.8 | **Rectificativas atascadas**: quedan "Pendiente" para siempre, cuentan en "pendiente de cobro", no admiten reembolso y no se puede vincular un débito bancario a una rectificativa. | Estado propio (Aplicada/Reembolsada) y pagos negativos de reembolso (411 → 512) en rectificativas. |
| 1.9 | **La factura final descuenta acomptes ya anulados con rectificativa**, lo que deja la obra subfacturada. | Restar de la deducción los acomptes rectificados. |
| 1.10 | **Vinculación bancaria manual**: permite cobrar más de lo pendiente, vincular a rectificativas o a facturas de España, y no es atómica (movimiento "Vinculado" sin `pago_id`). | Validar importe y tipo, y escribir `pago_id` en el mismo update de la reserva. |
| 1.11 | **Libro insert-only solo por RLS.** `service_role` (Edge Functions, MCP, agentes) puede hacer UPDATE, DELETE y TRUNCATE. | `revoke update, delete, truncate` y un trigger `before update or delete → raise exception`. |
| 1.12 | **FEC**: `EcritureNum` se recalcula en cada exportación (no es estable) y `ValidDate` va en UTC. | Columna `numero_escritura` asignada en la base de datos por diario al insertar. `ValidDate` en hora de París. |

## Fase 2 — Cierre del ejercicio 2026 (antes de diciembre)

Hoy no se puede cerrar 2026 correctamente desde el CRM. Según el libro, el résultat va en −20.500 €, con
38.524,78 € en 4191: casi toda la venta llegará con las facturas finales.

| # | Qué falta o está mal | Arreglo |
|---|----------------------|---------|
| 2.1 | **No existen asientos manuales (OD)**: obras en curso (335/7133), CCA/PCA (486/487), FNP/FAE, provisiones, IS a pagar (695/444), liquidación de la TVA (445x → 44551 → 512) ni pagos a URSSAF/DGFiP, cuenta del gérant o capital. Banco-sync convierte todos esos pagos en "gasto pendiente". | Diario de operaciones diversas, insert-only, con contrapartidas libres y validación debe = haber. |
| 2.2 | **La liasse solo lee 70/76/77 y 60-65/681/66/686/67**: ignora 71-75, 78, 79, 687 y 691. `useResultadoEjercicio` (TabIS) sí suma todo, así que las dos pantallas divergirán con el primer apunte de esas cuentas. | Clases 6 y 7 completas (sin 695), más un test de paridad entre las dos. |
| 2.3 | **Sin à-nouveaux ni affectation del résultat** (110/119, 120/129, 106). El pasivo del bilan no recoge el report à nouveau, así que desde 2027 descuadrará por el résultat 2026. | Asiento de apertura y de affectation. Pasivo construido desde la clase 1 del libro. |
| 2.4 | **Sin bloqueo de periodo**: editar o borrar en 2027 un gasto de 2026 inserta la reversa con fecha de 2026, dentro de una CA3 ya declarada o de un ejercicio ya cerrado. | `fecha_cierre` contable y de TVA. Antes de esa fecha no se edita, o la reversa lleva la fecha de hoy y la diferencia va a la regularización de la CA3 (líneas 15 y 21). |
| 2.5 | **Acta de aprobación con pérdidas**: el PDF dice "reporter 0,00 €" y "réserve légale au plafond", y las dos cosas son falsas. Hay dos PV con cifras distintas (TabIS frente a Cierre), y si se genera primero desde TabIS la reserva legal deja de actualizarse. | Rama específica para pérdidas, y un único generador basado en `useLiasse`. |
| 2.6 | **Report en avant de déficits** y alerta L223-42 (capitaux propres < ½ capital → décision de continuation). | Añadir las dos cosas. |
| 2.7 | **Asistente de renta 2026**: usa 24.000 € de remuneración anual en lugar de lo que realmente se ha cobrado desde octubre (641/646 del libro). Las alertas de tramo IS también ignoran `remuneracion_desde`. Además, probablemente falta el volet social de la 2042-C-PRO. | Calcular desde el libro. Confirmar el volet social y, si aplica, añadirlo al asistente y al calendario. |
| 2.8 | **Inmovilizado**: editar una dotación 681 la desvincula del activo, y "Generar dotación" la vuelve a crear (doble amortización). La baja usa la fecha en UTC y la amortización teórica (no el 28xx real). Se amortiza la cuenta 231. El alta manual no genera asiento. | Mantener `inmovilizado_id` en 681. Generar la dotación complementaria antes de la baja. Excluir 231. Asiento en el alta y la baja. |
| 2.9 | **Calendario fiscal 2027**: siempre pone 4 acomptes de IS (sin umbral de 3.000 €, aunque haya pérdida). La fecha de la declaración de renta sale distinta en 3 sitios. Barème y PASS sin año (se aplicarán a 2027 sin aviso). | Corregir. Claves por año con aviso cuando falte el año en curso. |
| 2.10 | **Vehículo particular**: TVA del carburante al 80 % y peaje no deducible (depende de la decisión 5). | Coeficiente de deducción por gasto o por plantilla. |

## Fase 3 — Seguridad y base de datos

| # | Hallazgo | Arreglo |
|---|----------|---------|
| 3.1 | Políticas RLS `using (true)` | Restringir a `exists(select 1 from usuarios_equipo where id = auth.uid())`, manteniendo la lectura de la propia fila para no romper el login. |
| 3.2 | `sincronizar_pipeline_visita` es SECURITY DEFINER y se puede ejecutar como `anon` | `revoke execute` y `search_path` fijo en las 5 funciones del pipeline. |
| 3.3 | Trigger "Database Webhooks" en `visitas`: manda la fila entera a `google-oauth-callback` (que no lo procesa) con secreto igual al SHA-256 de "" | `drop trigger`. |
| 3.4 | Recuperar contraseña redirige a WordPress (`origin` sin `/crm/`) | Usar `BASE_URL` (más el ajuste 0.4). |
| 3.5 | Cerrar sesión a medianoche en el PC hace `signOut()` global y tumba la sesión del móvil | Usar `scope: 'local'`. Añadir un "cerrar en todos los dispositivos" explícito en Perfil. |
| 3.6 | Bucket `mensajes_adjuntos` público (3 ficheros con nombre adivinable) | Hacerlo privado y usar URLs firmadas. |
| 3.7 | Documenso: al regenerar el enlace, el envelope antiguo sigue vivo y su firma acepta el presupuesto con el precio nuevo | Cancelar el envelope anterior y, en el webhook, rechazar envelopes que no sean el vigente. Al editar un presupuesto enviado, regenerar el enlace. |
| 3.8 | OAuth bancario sin `state` que falle cerrado (latente) | `if (!esperado \|\| esperado !== state)` y `state` guardado en el servidor. |
| 3.9 | HTML sin escapar con el nombre del cliente en 4 funciones de email | Aplicar `esc()`. |
| 3.10 | `revisar-gmail` se lanza en paralelo (AppLayout + página): agota la cuota de Gmail (8 errores 500 el 30/09). Timeout del cron de 20 s cuando la función tarda 25 s | Lock de fila, throttle en el frontend y `timeout` a 60 s. |
| 3.11 | `funnel_eventos`: 8 huérfanos, 2 duplicados y 5 solicitudes sin `solicitud_entrada` | Limpieza, índices únicos parciales, FK en cascada y no registrar etapas sin entrada. |
| 3.12 | CHECKs de estado ausentes (visitas, presupuestos, facturas, gastos, asientos, banco); FKs sin índice; defaults de idioma `'es'` frente a `'Español'` | Migración `not valid` seguida de `validate`. |
| 3.13 | Migraciones del repo desfasadas: 95 en remoto frente a 43 locales | Baseline con el esquema remoto antes de cualquier migración nueva. |
| 3.14 | `enviar-resena-email` no es idempotente; carrera en `automatizaciones-crm` al marcar Realizada | Cortar si ya se envió; añadir `.eq('estado','Pendiente')`. |
| 3.15 | Recordatorio de visita enviado a las 09:00 para visitas de las 08:00 | Adelantar el cron o excluir las horas ya pasadas. |

## Fase 4 — Flujos del día a día

**Visitas, clientes y Calendar**
- Cobrar un **acompte** pasa la obra a "Finalizado" en el pipeline (trigger SQL y `pipelineSync.ts`). Hoy afecta a
  3 obras: Florent, Laetitia y Pascale. Arreglo: contar solo facturas normales y recalcular esas 3.
- Una visita **cancelada** sigue en Calendar. Al editar o reprogramar una cancelada se crea un evento nuevo y se
  manda "visita agendada" al equipo.
- **Arrastrar una visita** en la vista semanal manda a Google una hora de fin anterior a la de inicio: el evento se
  queda en la hora vieja.
- Si falla el borrado del evento, se pierde `google_event_id` igual.
- Al mandar una visita a la papelera, el evento sigue en Calendar.
- No hay una única función `cambiarEstadoVisita()` (hay 4 copias distintas): falta nota, pipeline, Calendar y
  kilometraje coherentes.
- La detección de cliente repetidor (`ilike`) y `ClienteForm` (`eq`) no reconocen el teléfono con formato nuevo.
  `ClienteForm` no exige prefijo. El buscador global tampoco encuentra teléfonos.
- Editar el contacto en la ficha de cliente parte al cliente en dos y deja `lat`/`lng` viejos.
  `MapsAutocomplete` deja coordenadas obsoletas al reescribir la dirección a mano.
- **Purga RGPD incompleta**: no incluye visitas en papelera, presupuestos ni facturas sin visita (localizables por
  contacto), el bucket `fotos-visita`, los eventos de Calendar ni `cliente_etiquetas`.
- Los presupuestos **orientativos** "Aceptado" cuentan como cliente confirmado en Clientes, Planning y Galería.
- No se puede crear una visita directamente como "Realizada" desde la interfaz (la rama de kilometraje es código
  muerto).
- El autoguardado del planning pierde los últimos 600 ms al pulsar "Volver".

**Presupuestos**
- Los botones de descuento de **fidelidad y referidos** generan líneas que impiden guardar. Nunca han funcionado.
- Las facturas y presupuestos no cobrados se imprimen como "Borrador/Brouillon", incluso los que se envían a firmar.
- Un presupuesto firmado puede volver a Borrador y editar sus líneas.
- Aceptar desde la vista de detalle no congela las condiciones (T&C) ni deja nota.
- No se valida que el plan de pago sume el 100 % ni que la suma de acomptes no supere el total.

**Solicitudes, notificaciones y mensajería**
- Las respuestas de clientes a solicitudes **no avisan nunca** (la condición `Nueva && mensaje_enviado_en` es
  imposible). Hoy hay 4 respuestas sin revisar invisibles; una es de una visita de hoy.
- "Marcar como Nueva" se deshace sola.
- El cierre automático a los 14 días cuenta desde la creación, no desde la última actividad.
- "Marcar como enviado" en Pendientes de enviar no pasa el presupuesto a Pendiente ni registra
  `presupuesto_enviado`.
- El contador de mensajes no leídos cuenta borradores y archivados (badge permanente). Los borradores ajenos se ven
  en el hilo.
- El historial de notificaciones resucita avisos. Al eliminar un aviso, reaparece.
- `generar-mensaje-ia` manda la fila entera del presupuesto (con márgenes y nota interna) a la API, y no comprueba
  los errores de directrices ni de visitas ocupadas (puede ofrecer horas ya ocupadas).
- Los KPI mezclan importes con y sin IVA y gastos pendientes. Hay dos cifras distintas de "resultado histórico sin
  IVA".

**App móvil `/rapido`**
- **Sin cobertura con la app abierta no guarda nada**: las mutaciones se pausan (`networkMode 'online'`) y nunca
  llegan a la cola. Arreglo: `networkMode: 'always'`.
- La cola offline no es idempotente: un reintento puede duplicar el gasto o las fotos.
- El kilometraje de `/rapido` solo enlaza con visitas pendientes, lo que duplica el kilometraje automático.
- El service worker puede cachear un HTML como si fuera un chunk JS (rotura permanente). La caché no se purga y no
  se pide `persist()`.
- El bloqueo con huella desmonta la app y se pierden los formularios a medias.

**Transversal**
- No hay un manejador global de errores de lectura: con 186 `useQuery` y solo ~19 leyendo `error`, una tabla que
  falla sale vacía sin aviso. Arreglo: `QueryCache({ onError: toast })`.
- `GastoForm` borra el justificante de Storage antes de guardar (documento que hay que conservar 10 años).
  Configuración hace lo mismo con el logo.
- La lista negra de Configuración borra solicitudes de forma irreversible sin confirmar.
- Purgar un presupuesto desvincula en silencio sus facturas y su planning.
- Colisiones de `queryKey` con orden distinto: `['pagos_factura','ingresos']` (Libro de ingresos),
  `['presupuestos']` (Pipeline) y `['proveedores']` (desplegable de Gastos).
- Fechas en UTC con efecto real: baja de inmovilizado, ejercicio de cotisations, Gantt, PV de réception.
- Recordatorio de pago al cliente con "1234.50€" y fecha ISO.
- `calcularKmIdaYVuelta` tiene dos versiones divergentes: el importe deducible cambia según quién cierre la visita.

## Fase 5 — Limpieza de datos (con confirmación previa, por SQL)

- Restaurar la visita de Bea y vincular AC-2026-0021 (decisión 3).
- Recalcular el pipeline de Florent, Laetitia y Pascale y su `pipeline_etapa_maxima`.
- Limpiar `funnel_eventos`: 8 huérfanos y 2 duplicados.
- Normalizar los teléfonos sin prefijo (decisión 7).
- Reclasificar gastos:
  - Ventsus (marketing y Google Ads): de 626 a 623x.
  - "Travail Biarritz" (1.250 €, proveedor Anthropic): revisar el proveedor.
  - Kilometraje con `tipo_iva` NULL: pasar a EXENTO.
- Cargos anticipados (486) del servicio de marketing anual de 5.000 € al cierre.
- Ficheros huérfanos en Storage:
  - `fotos-visita`: 2
  - `justificantes`: 2
  - `presupuestos-firmados`: 2
- Bucket vacío `Justificantes` (con mayúscula).
- Papelera de más de 30 días: 4 visitas de prueba y P-0039/0040/0041.
- Visita cancelada de Devi con `google_event_id` todavía relleno.

## Fase 6 — Deuda técnica (bajo riesgo)

- Mover a `supabase/functions/_shared/` las ~25 familias de helpers copiados en las Edge Functions
  (`codificarCabeceraMime`, `enviarSmtp`, `esLlamadaAutorizada`, `pieCorreo`…).
- Unificar los helpers de fecha e importe duplicados en el frontend.
- Paginar los listados que crecen: `movimientos_banco`, volcado anual del funnel, `notas_cliente`.
- Invalidaciones que faltan: `['pagos_factura']` al quitar pagos, `['visitas']` tras `sincronizarPipeline`,
  `['proyectos', …]`.
- Accesibilidad: `useConfirm` sin Escape ni foco, Toast sin `aria-live`, labels del login.
- Degradado prohibido en `LoginPage.tsx:158`.
- Dependencias: dompurify (vulnerabilidad baja, transitiva de jspdf) y parches menores.
- Actualizar CLAUDE.md: `normalizarTelefono` ya no está en `documenso-webhook`, y `_shared/` sí existe.

## Huecos funcionales (no son bugs, para decidir)

- Lettrage del 411.
- Un cobro repartido entre varias facturas.
- Conciliación del saldo 512 con el saldo del extracto.
- Background Sync de la cola offline.
- Aviso de "versión nueva" en la app instalada.
- Notificaciones sincronizadas entre dispositivos (hoy están en `localStorage`) y campana fuera de Inicio.
- Mensajería en tiempo real.
- Embudo por cohortes.
- Entidad "cliente" propia: hoy la identidad es el teléfono, origen de varios fallos.
- Campos de factura que faltan: SIREN/TVA del cliente profesional, fecha de prestación, dirección de obra, TVA 5,5 %.
- Menciones legales que faltan en las facturas FR (forma jurídica, capital, RCS/RM, aseguradora con dirección y
  cobertura, mención de exención o autoliquidación) y en las ES (nombre legal del autónomo, etiqueta "NIF").
