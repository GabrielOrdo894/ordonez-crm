# Contexto acumulado — Décision de rémunération del gérant

Documento vivo que actualiza el agente `decision-remuneracion-gerant` cada vez que hay una décision nueva o se
confirma/corrige algo con Gabriel. No es una fuente legal en sí misma — recoge decisiones y hechos ya
confirmados para no tener que volver a preguntarlos cada año.

## Ejercicio social

- EURL constituida 2026-06-24, inmatriculada RCS Bayonne 2026-07-07 (`docs/negocio/empresa.md`).
- Ejercicio 2026 (primer ejercicio, parcial): **2026-07-01 a 2026-12-31** — ya reflejado en `limitesEjercicio()`
  de `src/modules/fiscalidad/calculos.ts`. No tocar esa función sin un motivo real y verificado.
- Julio 2026: arranque comercial (visitas, presupuestos). Septiembre 2026: arranque de la ejecución física de
  obras. **Ninguna de las dos fechas cambia el ejercicio legal**, que ya está fijado por la inmatriculación RCS
  — confirmado explícitamente con Gabriel el 2026-08-16 tras una duda inicial sobre si el ejercicio empezaba en
  septiembre.
- La factura AC-2026-0020 (20/04/2026, 14.279,63 € HT, cliente Bea Vangheluwe) se cobró como autónomo antes de
  la cesación de esa actividad — cae fuera del ejercicio 2026 de la société por fecha (anterior al 1 de julio),
  así que ya se excluye sola en cualquier cálculo que use `limitesEjercicio`, sin necesidad de exclusión manual.

## Situación familiar

Confirmada sin cambios el 2026-08-16, coincide con `gerant_config`: casado, 1 hijo a cargo, cónyuge con
ingresos ~18.000 €/año.

## Política de remuneración con ingresos irregulares

Objetivo de fondo (decidido en el Simulador de Fiscalidad): a cierre de ejercicio, toda la margen neta se
convierte en remuneración del gérant, sin repartir dividendos. Con ingresos muy variables mes a mes (Gabriel
espera ~15.000 € en septiembre 2026, pero no sabe cuánto en el resto de meses), no tiene sentido intentar
adivinar una cifra mensual "perfecta" de antemano. Mecanismo acordado con Gabriel el 2026-08-16, práctica
estándar en Francia para este caso:

1. Fijar una **base mensual modesta y fija** por décision, vigente hasta nueva décision.
2. Cuando lleguen meses fuertes o al cierre del ejercicio, aprobar una **décision de "complément de
   rémunération"** que sube el importe — puede ser retroactiva dentro del mismo ejercicio (recupera meses
   anteriores pagados de menos). Práctica habitual y legalmente válida, no hace falta esperar a fin de año para
   corregir.
3. Así el total anual sí termina coincidiendo con el margen neto real, sin necesidad de acertar la cifra mes a
   mes desde el principio.

## Histórico de décisions

- **2026-08-16** — primera décision de rémunération del gérant: base mensual **2.000 € brutos/mes**, a partir
  de **septiembre de 2026**. Pago mensual dentro de los últimos días de cada mes, sin día fijo (según
  tesorería disponible) — redactado así a propósito para no autoimponerse una fecha rígida con ingresos
  irregulares. Confirmado explícitamente que puede completarse más adelante (incluso con efecto retroactivo
  dentro del mismo ejercicio) con una décision de "complément de rémunération" cuando lleguen meses fuertes
  (ej. Gabriel espera ~15.000 € en septiembre 2026) o al cierre del ejercicio, para que el total anual sí
  termine coincidiendo con el margen neto real. Documento redactado y guardado en
  `negocio/documentos legales/decisions-remuneration/decision-remuneration-2026.md` (fuera de git). Pendiente:
  imprimir/firmar de verdad y, una vez firmado, actualizar `gerant_config` en el CRM para que el simulador
  quede sincronizado.
