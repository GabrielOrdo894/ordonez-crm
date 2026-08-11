# Directrices de respuesta a clientes — situaciones concretas

Documento vivo mantenido por Gabriel. Aquí se recogen las reglas de negocio para
situaciones concretas que se repiten cuando un cliente responde a un presupuesto
(sobre todo orientativos) y que no se pueden deducir del tono general de la marca.

Los agentes que redactan mensajes a clientes (`seguimiento-presupuestos`,
`envio-presupuestos`) deben leer este fichero antes de proponer una respuesta.
Si la situación del cliente coincide con una entrada de aquí, la directriz de
aquí manda sobre el criterio genérico del agente. Si no hay ninguna entrada que
encaje, el agente sigue su criterio normal y lo dice explícitamente ("no hay
directriz específica para este caso, propongo esto por defecto").

Formato de cada entrada:

```
## [Situación]
Directriz: ...
```

---

## Presupuesto orientativo → cliente pide visita técnica / rendez-vous

Directriz: Disponibilidad real para visitas técnicas indicada por Gabriel el
2026-07-28: **a partir de principios de septiembre**. Actualiza esta fecha en
cuanto cambie — si el agente la usa y han pasado más de unas semanas desde la
fecha de referencia de arriba, que pregunte a Gabriel si sigue vigente en vez
de darla por buena.

- Agradece el interés y confirma que la visita técnica es gratuita y sirve
  para afinar el presupuesto orientativo en uno cerrado.
- No prometas un precio cerrado en este mensaje.
- **Nunca preguntes al cliente qué día/franja le viene bien.** Aplica el
  algoritmo de "Horario por defecto para ofrecer visitas técnicas" de abajo,
  empezando la búsqueda en la primera fecha disponible según la disponibilidad
  vigente de arriba, y ofrece siempre **3 opciones concretas** de día y hora
  (nunca una sola), para que el cliente elija la que mejor le venga (ej. "¿le
  viene bien alguna de estas opciones: martes 8 de septiembre a las 18:00,
  miércoles 9 a las 18:00 o sábado 12 a las 12:00?"). Si ninguna de esas 3
  opciones le encaja al cliente, en la siguiente respuesta ofrece las 3
  siguientes que toquen según el mismo algoritmo — sigue sin preguntar "¿qué
  día prefiere?".

---

## Primer contacto → solicitud de presupuesto entrante (formulario web / Landbot)

Directriz (Gabriel, 2026-07-28): quien escribe por primera vez a través de un
formulario de la web (o directamente) quiere saber ante todo **cuándo puede
ser la visita, o si no se puede todavía**. Las solicitudes llegan por cuatro
canales distintos (ver `docs/bloque6-solicitudes-seguimiento.md` y buscar en
Gmail con `from:8c3d549c-46cd-4773-9027-31b23bc30704@landbot.email OR
from:noreply@ordonezrenov.com`, más los autoenvíos de Gabriel y los emails
directos de clientes, que no se detectan por remitente):

- **Landbot** (`8c3d549c-...@landbot.email`) — asunto "Solicitud de
  Presupuesto de Reforma de [tipo]". No suele traer el nombre del cliente.
- **noreply@ordonezrenov.com** (formulario nativo de la web) — asunto "Nueva
  Solicitud de Presupuesto #N de [tipo]". Sí trae nombre, teléfono, email,
  tipo de reforma, descripción y la página de origen — más completo, pedir
  menos datos de más en este caso.
- **reformasordonezeus@gmail.com** — Gabriel reenviándose a sí mismo una
  solicitud recibida por otro canal (WhatsApp, llamada...). No tiene formato
  fijo, leer el contenido tal cual.
- **Clientes que escriben directo por email** — sin pasar por ningún
  formulario. Remitente y asunto son impredecibles, solo se detecta leyendo
  el contenido.

El mensaje de respuesta sigue siempre este orden, no el orden "pedir datos
primero":

1. **Arriba del todo, el tema de la visita.** Si hay disponibilidad, ofrece
   siempre **3 opciones concretas** de día y hora con el algoritmo de más
   abajo (nunca una sola, nunca preguntes qué día prefiere). Si todavía no hay
   disponibilidad (ej. hasta septiembre), dilo claro y con una fecha/semana
   concreta de cuándo sí la habrá.
2. **Justo después, ofrece el presupuesto orientativo** como alternativa
   mientras tanto: se puede dar una horquilla de precio con los datos que
   facilite, sin necesidad de visita, apoyándote en que Reformas Ordoñez tiene
   más de 25 años de experiencia en reformas. El objetivo de poner esto en
   segundo lugar pero pronto en el mensaje es no perder al cliente mientras
   esperamos a que llegue la fecha de visita disponible.
3. **Si el mensaje del cliente es muy genérico** (no dice qué reforma exacta
   quiere, faltan datos de contacto/obra), pide la información que falte
   después de lo anterior: nombre completo, dirección de la obra, alcance
   exacto del trabajo, fotos/medidas si puede.
4. **Si es necesario** (el cliente pide ideas, diseño, "cómo quedaría
   mejor"...) aclara que Reformas Ordoñez es una empresa de reformas, no de
   diseño ni interiorismo — trabajamos a partir de una idea que el cliente ya
   tiene, no la creamos nosotros. No hace falta incluir esta aclaración si el
   cliente ya sabe lo que quiere y no la pide.

**Dónde guardar la respuesta:** en `solicitudes-presupuesto/<fecha> - <nombre
o email del cliente>/`, carpeta en la raíz del repo, separada de
`equipo-presupuestos/` (esa es solo para presupuestos ya creados en el CRM).
Generar el PDF con `scripts/generar-pdf-solicitud.mjs`.

---

## Cliente sin claridad de materiales (paredes, suelo, azulejos, cerámica) → recomendar visita a Alkain

Directriz (Gabriel, 2026-08-02): hay dos tipos de cliente respecto a materiales — el que ya
tiene claro qué quiere (color, tipo de azulejo/cerámica, acabado...) y el que todavía no lo
sabe. Este segundo caso está **un paso más atrás** que el primero: antes de poder cerrar el
presupuesto o avanzar con la obra, necesita decidir el material. Identifica en qué paso está
cada cliente por lo que dice (si pregunta "qué proponéis" para paredes/suelo, si no menciona
color/modelo, si duda entre opciones) y trátalo según corresponda.

- Si el cliente no tiene claro el material, color o diseño de paredes, suelo, azulejos o
  cerámica, recomiéndale **siempre** visitar a nuestro proveedor, **Alkain**:
  **Amutalde Kalea, 21, 20280 Hondarribia (Gipuzkoa)** — a la entrada de Hondarribia, toda la
  calle.
- Puede decir que va de parte de Reformas Ordoñez si quiere. Allí le harán un *roomtour* por
  toda la exposición de baños, para que vea y elija con calma lo que más le gusta — tienen
  precios de todo tipo, así que se puede ajustar a lo que busque.
- Explica la ventaja de este proveedor frente a una superficie de bricolaje (Leroy Merlin,
  Bricodepot...): es material de buena calidad, un proveedor de confianza con el que ya
  trabajamos, no es bricolaje.
- El presupuesto orientativo que le demos mientras tanto está basado en precios medios de
  Alkain — nuestro catálogo propio está desactualizado, así que no se entrega hasta que
  llegue el nuevo (ver `catalogos/` en la raíz del repo: catálogos de Gamma y Roca, dos de
  las marcas que Alkain distribuye, útiles de referencia interna pero no para enviar al
  cliente).
- Recomiéndale llevar las medidas en metros cuadrados de la estancia a Alkain, para que
  puedan calcular mejor con él.
- Si el cliente elige materiales con Alkain y trae su presupuesto de materiales (debe llevar
  el nombre de Reformas Ordoñez), aclara que a partir de ahí **nosotros continuamos**: nos
  encargamos del pedido, la recepción y el traslado de los materiales hasta la obra — el
  cliente no gestiona nada de eso. En la visita técnica, con ese presupuesto de materiales ya
  en mano, solo nos queda tomar medidas y demás detalles de la obra.

---

## Cliente con obra fuera de la zona de operación

Directriz (Gabriel, 2026-08-02): la zona de trabajo real tiene un límite concreto — lado francés hasta
**Biarritz** (pasando por Hendaya, Urrugne, Biriatu, Saint-Jean-de-Luz, Bayonne), lado español hasta
**Donostia/San Sebastián**. Ver tabla completa en `docs/empresa.md` § "Zona de operación".

- Si la dirección de la obra que da el cliente está claramente fuera de ese límite, no ofrezcas visita técnica ni
  presupuesto orientativo — dilo con claridad y cortesía: que la obra queda fuera de la zona en la que trabajamos
  actualmente.
- No inventes una red de partners o derivación a otra empresa salvo que Gabriel lo indique expresamente.
- Si la dirección está en el límite o es ambigua (ej. a pocos km del límite, o no se menciona la localidad
  exacta), pide la dirección exacta antes de descartar el caso — no asumas que está fuera solo por la distancia
  aproximada que dé el cliente.

---

## Horario por defecto para ofrecer visitas técnicas (algoritmo)

Regla permanente de Gabriel (2026-07-28): los agentes nunca le preguntan al
cliente qué día/hora prefiere. Siempre comprueban el CRM (tabla `visitas` en
Supabase — columnas `fecha_visita`, `hora_visita`, `estado`; ignorar visitas
`Cancelada`) y ofrecen ellos mismos un día y hora concretos, ya libres.

**Horarios que existen:**
- Lunes a viernes: `12:00` o `18:00`
- Sábado: solo `12:00`
- Domingo: cerrado, nunca se ofrece

**Cómo elegir cuál ofrecer**, partiendo del primer día disponible que aplique
al caso (ej. la fecha de "a partir de principios de septiembre" de la entrada
de arriba, o el próximo día hábil si no hay ninguna restricción vigente):

1. **Pasada 1 — prioriza siempre `18:00`, avanzando en el tiempo:** comprueba
   lunes 18:00. Si está libre en `visitas`, ofrece ese. Si está ocupado,
   comprueba martes 18:00; si también está ocupado, miércoles 18:00; y así
   hasta el viernes 18:00 (el sábado no tiene slot de 18:00, se salta en esta
   pasada).
2. **Pasada 2 — si toda la semana tiene el 18:00 ocupado, cambia a `12:00` y
   ve hacia atrás en el tiempo, empezando por el sábado:** sábado 12:00 → si
   ocupado, viernes 12:00 → jueves 12:00 → miércoles 12:00 → martes 12:00 →
   lunes 12:00. Domingo nunca se ofrece.
3. Si toda la semana (ambas pasadas) está completa, repite el mismo algoritmo
   sobre la semana siguiente.

Esto reparte las visitas a lo largo de la semana en vez de amontonar el 12:00
y el 18:00 en los mismos días: el 18:00 se va llenando desde principio de
semana hacia el final, y el 12:00 se va llenando desde el final de semana
hacia el principio.

Aplica este algoritmo en cualquier situación donde toque ofrecer una visita
técnica a un cliente (presupuestos orientativos, seguimientos, primeros
contactos), no solo en la entrada de arriba.

**Siempre 3 opciones, no 1** (Gabriel, 2026-07-29): cuando toque ofrecer
visita, no se da un solo slot — se repite este mismo algoritmo 3 veces,
marcando cada slot ya ofrecido como ocupado antes de buscar el siguiente, y
se ofrecen las 3 opciones juntas en el mismo mensaje.
