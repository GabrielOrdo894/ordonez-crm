# Auditoría de fiscalidad — 9 de octubre de 2026

Auditoría de solo lectura, en tres frentes: TVA y asistente CA3; IS, cotizaciones TNS y renta del gérant; liasse, cierre e inmovilizado. Cada hallazgo indica si está **confirmado** (leyendo el código o los datos) o es **sospecha** (hay que contrastarlo con la fuente oficial). No se ha corregido nada salvo el punto T1, que se pidió aparte.

## Estado de partida

- Tests: pasan todos (164 en `src/lib` y fiscalidad; 64 en fiscalidad).
- Libro: 526 apuntes, debe = haber = 249.169,89 €; ningún lote descuadrado; cuenta 471 a 0; ningún gasto pagado de Francia sin asiento.
- Bilan 2026: cuadra (activo = pasivo = 22.360,77 €). Résultat 2026: −19.221,32 €; capitaux propres: −18.221,32 € (hay 38.524,78 € de acomptes en 4191 a la espera de factura final).
- Septiembre: el asistente de TVA y el libro coinciden (44571 = 3.907,48 €; 44566 = 2.689,90 €; línea 17 = 1.779,96 € frente a 1.779,97 € en 4452).
- Sin datos reales todavía de inmovilizado, reserva legal ni aprobación de cuentas: todo lo de amortizaciones y cierre es análisis de código.

## Crítico

### C1. «Rémunération» se usa como neta y como bruta a la vez — confirmado
- `fiscalidad/calculos.ts:74` (`calcularTNS`) y `:162` (`simularEjercicio`), `useEjercicioFiscal.ts:39`: la tratan como **neta** (la sociedad paga las cotizaciones aparte).
- `calculos.ts:170` (`netoDisponible`), `:267` (`remuneracionNeta`), `TabSimulador.tsx:158,181`, `lib/generarPdfAttestationRemuneracion.ts:26,51`, `lib/generarPdfRemuneracion.ts:208-211`: la tratan como **bruta** y le restan las cotizaciones otra vez.
- Efecto: las cotizaciones se cuentan dos veces. Con la configuración real (24.000 €/año, 45 %, abattement 26 %) el CRM muestra 11.982 € de cotizaciones y 12.018 € de neto. Lectura neta coherente: 24.000 € de neto. Lectura bruta coherente: 7.992 € de cotizaciones y 16.008 € de neto. La cifra mostrada no sale con ninguna.
- Afecta a: Simulador, «Salario vs Dividendos» (sesgado contra el salario), casilla 1GB del asistente de renta, attestation de remuneración, resumen mensual TNS; y, si la lectura buena es la bruta, a TabIS, Dashboard y alertas (IS bajo).
- El test de `simularEjercicio` fija la cifra errónea (15.928,57), así que blinda el fallo.
- **Requiere decisión de Gabriel:** si los 2.000 €/mes de la décision son netos o brutos.

## Alto

### TVA
- **T1. Totales de la CA3 calculados sin redondear** — confirmado, **corregido el 9 de octubre**. En septiembre la línea 28 salía 1.218 € redondeando el total y 1.217 € sumando líneas redondeadas, que es como lo calcula impots.gouv. Ahora cada línea se redondea al euro y los totales suman líneas redondeadas (`AsistenteIvaPage.tsx`, `iva.ts: euroEntero`).
- **T2. El crédito de TVA (línea 22) se pierde sin aviso si falta la fila del mes anterior** — confirmado. `AsistenteIvaPage.tsx:270-273`. Si un mes no se marca como declarado, el siguiente arranca con línea 22 = 0. También se arrastra el crédito de una fila con `declarado = false`.
- **T3. El valor tecleado en la línea 22 se pisa al declarar** — confirmado. Al marcar la declaración se recarga y el campo vuelve al valor del mes anterior; la pantalla avisa de «líneas cambiadas» en una declaración recién hecha. Lo guardado es correcto.

### IS y calendario
- **I1. El calendario fiscal de 2027 no se puede generar** — confirmado (código y datos). `TabCalendario.tsx:122,155`: el botón solo aparece si no hay ninguna échéance con fecha en ese año, y al generar 2026 ya se crearon 7 con fecha de 2027. Faltarán las 12 CA3 de 2027, los acomptes de IS y la CFE, con sus alertas.
- **I2. TabIS, Dashboard y alertas no imputan los déficits anteriores; la liasse sí** — confirmado. `useEjercicioFiscal.ts:40`, `useAlertasFiscales.ts:50`. Con 2026 en −20.500 € y 2027 en +30.000 €, TabIS diría 4.500 € de IS y la liasse 1.425 €. No afecta a 2026.

### Liasse y cierre
- **L1. El bilan ignora cuentas que usan las propias plantillas de cierre** — confirmado. `useComptaFrancia.ts:71-96`, `calculos.ts:288-327`. La OD de obras en curso (335/7133) sube el résultat y el pasivo pero no el activo: descuadre por el importe. Igual con 486, 444 deudor, 418, 408, 487, 16x. Es el asiento que hará falta en el cierre de 2026.
- **L2. Se puede aprobar y cerrar el ejercicio en curso, sin vuelta atrás desde la interfaz** — confirmado. `TabCierreEjercicio.tsx:57,91-141`. Pulsarlo hoy con 2026 seleccionado bloquearía hasta el 31/12/2026: ninguna factura, gasto ni cobro del resto del año. Deshacerlo exige SQL.
- **L3. El inmovilizado del bilan sale del registro y no del libro** — confirmado. `useComptaFrancia.ts:85-88`. Si la dotación no se genera (es un botón por activo), el bilan resta una amortización que no está en el résultat. Un «Nuevo activo» a mano no crea asiento. Editar un activo no rectifica las dotaciones ya registradas.
- **L4. La aprobación no exige el IS registrado, y después ya no se puede registrar** — confirmado. `TabCierreEjercicio.tsx:99-141`. El report à nouveau del año siguiente quedaría inflado en el importe del IS.

## Medio

### TVA
- **T4.** Segunda rectificativa sobre la misma factura: `fraccion_tva_exigible` ignora las anteriores (`FacturaForm.tsx:407-414`). Confirmado en código; no hay rectificativas en producción.
- **T5.** Desmarcar un mes antiguo desbloquea los posteriores y no se vuelven a bloquear (`AsistenteIvaPage.tsx:305-306`). Confirmado.
- **T6.** Si una de las tres consultas falla, la CA3 sale a ceros y se puede marcar como declarada (`AsistenteIvaPage.tsx:400-402,591,715-723`). Confirmado.
- **T7.** Importaciones en la línea 08 en vez de I1. Sospecha: contrastar con la notice 3310-CA3. Hoy no hay ninguna importación.
- **T8.** Todo lo intracomunitario va a B2 y línea 17 (bienes); A3 siempre 0. En septiembre hay 7.887,44 € de base intracomunitaria; si alguna es un servicio, va en otra casilla. Mismo impuesto.

### IS y cotizaciones
- **I3.** La proyección de TabIS extrapola la remuneración de un mes como si fuese la media (`TabIS.tsx:41-45`). Confirmado.
- **I4.** El mes en curso cuenta como mes entero en las proyecciones (`calculos.ts:25-31`). El día 1 proyecta un 25 % de menos. Confirmado.
- **I5.** Tarjeta «Cotisations URSSAF» del Dashboard: etiqueta y división equivocadas (`DashboardFiscal.tsx:222-223`). Muestra 166 €/mes cuando son 998,50 €/mes. Confirmado.
- **I6.** Un pago pequeño en 646 sustituye a toda la estimación de cotizaciones (`useEjercicioFiscal.ts:32-33`). Confirmado en código.
- **I7.** El Simulador en «Ejercicio en curso (6 meses)» calcula con los meses transcurridos (`TabSimulador.tsx:121`); ya se corrigió en «Salario vs Dividendos» pero no aquí. Confirmado.
- **I8.** Carrera en la precarga del Simulador: ingresos y gastos pueden quedarse en 0 (`TabSimulador.tsx:103-114`). Confirmado en código.
- **I9.** Asistente de renta: usa cotizaciones teóricas, no las pagadas, y las casillas DSCA/DSEA podrían ser de la 2042-C-PRO. Sospecha: contrastar con impots.gouv o la URSSAF.
- **I10.** El gráfico de carga fiscal mensual calcula el IS mes a mes sin compensar pérdidas (`DashboardFiscal.tsx:164-165`). Confirmado.

### Liasse y cierre
- **L5.** La reserva legal se cuenta dos veces en el bilan del ejercicio aprobado, y el acta regenerada sale con dotación 0 (`TabCierreEjercicio.tsx:148-161`, `useLiasse.ts:44-52`). Confirmado.
- **L6.** La dotación a reserva puede registrarse dos veces si falla el registro de la decisión (`TabCierreEjercicio.tsx:86-95,113-134`). Confirmado.
- **L7.** El botón de aprobación no espera a que carguen los datos (`TabCierreEjercicio.tsx:232`). Confirmado.
- **L8.** Baja de un activo con la dotación del año ya generada: se amortiza de más y queda saldo en 28xx (`TabInmovilizado.tsx:199-212`). Confirmado.
- **L9.** Créances clients con saldo acreedor desaparecen del bilan (`useComptaFrancia.ts:73`); igual 455 y 4191 deudores. Confirmado.
- **L10.** El FEC de 2027 en adelante no lleva asientos de apertura (`fec.ts:85`). No afecta a 2026. Confirmado.
- **L11.** La línea de IS de la liasse no coincide con el résultat net cuando el IS está registrado (`TabLiasseFiscale.tsx:139`). Confirmado.
- **L12.** Activos dados de baja siguen sumando valor neto en la pestaña y en el PDF (`TabInmovilizado.tsx:232`). Confirmado.

## Bajo

- **TVA:** céntimos entre libro y asistente (4452); céntimos en 44574 con cobros parciales; `.neq('facturas.tipo','rectificativa')` descarta `tipo` NULL; tipos de IVA que no son TVA_20/TVA_10/EXENTO desaparecen sin aviso; `baseFactura` falla si `lineas` es NULL; inmovilizado intracomunitario deduce por la línea 20 y no la 19; upsert de la declaración y bloqueo no son atómicos; se puede marcar un mes sin el anterior; límite fijo «día 19»; filtro de gastos distinto entre panel y asistente.
- **IS y renta:** textos que contradicen el cálculo (`TabCotisations.tsx:173-175,321`, FAQ del Dashboard y del Calendario); décote y plafonnement solo para pareja; fechas sin ajuste a fin de semana o festivo (cae del lado prudente); CA3 de enero a junio de 2026 generadas para una EURL que no existía; selector de ejercicio que ofrece 2025; dividendos por encima del 10 % sin abattement (sospecha); `gastos_km_ejercicio` cuenta gastos pendientes.
- **Liasse y cierre:** «Generar dotación» sin protección contra doble clic; si el asiento de baja falla no se puede reintentar; céntimo residual en el último año de amortización; anular una OD ya anulada no falla; una OD con tres decimales puede guardarse descuadrada en 0,01 €; el FEC sustituye «—» y «’» por «?»; Edifiscale no recorta cuentas de más de 6 dígitos; cuenta 675 para la baja frente al PCG reformado (sospecha); referencias desfasadas al botón del acta.

## Cifras fiscales fijas en el código

- **Coinciden con lo conocido, sin contraste externo en esta auditoría:** IS 15 % hasta 42.500 € y 25 % después (prorrateado a 21.250 € en 6 meses); PASS 2026 = 48.060 €; barème IR (11.600 / 29.579 / 84.577 / 181.917 €); demi-part 1.807 €; décote de pareja; abattement del 10 %; PFU 31,4 %; abattement TNS del 26 %.
- **Sin contrastar, hay que verificarlas:** tipo global TNS del 45 %; CSG/CRDS no deducible del 2,9 %; día 21 para la CA3 de este SIREN; 4 de junio para la renta; forfait de primer año; fechas de cobro del saldo del IR.
- **Desfase estructural:** las claves de configuración no llevan año. Las rentas de 2026 y todo 2027 se calcularán con el barème y el PASS actuales sin aviso.

## Revisado y correcto

- TVA: periodo y zona horaria; cobros (pagos anulados, estructura anterior, papelera y rectificativas excluidos); cobros parciales, acomptes y factura final sin doble base; autoliquidación intracomunitaria sin doble deducción; bloqueo de periodo coherente; sin riesgo de 1.000 filas; queryKeys propias.
- IS y renta: prorrateo del plafond; IS con pérdidas; exención de acomptes del primer ejercicio; fecha de la liasse 2027; convergencia de `calcularTNS`; quotient familial y décote del caso real; reserva legal; fechas en hora local; sin NaN ni divisiones por cero.
- Liasse: clasificación PCG por prefijo y saldo neto; corte de ejercicio; pasivo desde el libro; tres variantes del acta; rectificación por saldo neto; cuenta de amortización por activo; FEC (18 columnas, numeración, lotes cuadrados); export Edifiscale con saldos; paginación.

## No revisado

- La pantalla en el navegador; la notice oficial 3310-CA3; el importador real de Edifiscale y un validador de FEC; `banco-sync` y la conciliación automática; los triggers de numeración y de protección de facturas; `generarPdfLivreInventaire.ts`; la deducibilidad de fondo de cada gasto; amortizaciones, bajas y cierre con datos reales (no hay).

## Orden de arreglo propuesto

1. Antes de usar el cierre o declarar nada más: L2 (impedir cerrar el ejercicio en curso), L7, T6.
2. Decisión de Gabriel y arreglo de C1 (remuneración neta o bruta), con sus tests.
3. Para el cierre de 2026: L1, L3, L4, L5, L6, L9.
4. Para 2027: I1, I2, L10, y las claves fiscales con año.
5. TVA: T2, T3, T4, T5.
6. El resto de medios y bajos.

## Estado de los arreglos (9 de octubre de 2026, tarde)

**Corregido y publicado:** C1 (rémunération neta), T1, T2, T3, T4, T5, T6, I1, I2, I5, I7, I8, L1, L2, L3, L4, L5, L6, L7, L9.

**Pendiente:**
- Medios: I3 e I4 (proyecciones de TabIS con la remuneración de un solo mes y con el mes en curso entero), I6 (un pago pequeño en 646 sustituye toda la estimación), I9 (asistente de renta: cotisations pagadas y casillas DSCA/DSEA, hay que contrastarlo), I10 (gráfico de carga fiscal mensual), L8 (baja de un activo con la dotación ya generada), L10 (asientos de apertura en el FEC, hace falta para 2027), L11 (línea de IS de la liasse cuando el IS está registrado), L12 (activos dados de baja en la pestaña y en el PDF), T7 y T8 (casillas de importaciones y de servicios intracomunitarios, hay que contrastarlo con la notice 3310-CA3).
- Todos los bajos.
- Cifras sin contrastar con fuente oficial y claves fiscales sin año.
