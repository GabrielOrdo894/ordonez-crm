---
name: landing-ordonezrenov
description: Skill para crear landing pages SEO completas para ordonezrenov.com (Reformas Ordoñez), tanto en español como en francés. Úsala SIEMPRE que se pida crear, redactar, generar o estructurar una landing page, página de servicio, página de zona o cualquier página de aterrizaje para este negocio — en cualquier idioma. También actívala cuando el usuario diga "crea una landing", "hazme la página de X servicio", "quiero una página para X ciudad", "nueva landing para X", "crée une page pour X", "landing en français", "page de rénovation à Hendaye/Biarritz/Bayonne", o cuando pegue un estudio de palabras clave (en español o francés) y pida organizar la estrategia SEO de una página. Esta skill es DISTINTA a la de blog posts — las landings tienen estructura fija de 13 secciones, estrategia de keywords propia, y entregan además slug, meta title, meta description, e instrucciones de imágenes completas. No la saltes aunque la landing parezca sencilla.
---

# Skill: Landing Pages SEO — Reformas Ordoñez

## DETECCIÓN DE IDIOMA — PASO PREVIO OBLIGATORIO

Antes de cualquier otra cosa, detecta el idioma de la landing:

**¿Cómo saberlo?**
- El usuario lo indica explícitamente: *"en francés"*, *"pour la France"*, *"en français"*, *"pour Hendaye/Biarritz/Bayonne"*
- El estudio de KW contiene términos en francés: *rénovation, salle de bain, cuisine, devis, travaux, artisan...*
- La ciudad objetivo es francesa: Hendaye, Biarritz, Bayonne, Anglet, Saint-Jean-de-Luz, Urrugne, Biriatu

**Resultado:**

| Idioma detectado | Modo de redacción |
|---|---|
| 🇪🇸 Español | Redactar toda la landing en español. Aplicar normas estándar |
| 🇫🇷 Francés | Activar **MODO FRANÇAIS** — ver tabla de adaptaciones al final de este documento |

Si hay duda, preguntar al usuario antes de continuar.

---

## DETECCIÓN DE TIPO DE LANDING — PASO PREVIO OBLIGATORIO

Antes de redactar, detecta también qué tipo de landing es (auditoría 2026-08-23 sobre la landing real de Hendaye):

| Tipo | Cómo saberlo | Estructura |
|---|---|---|
| Hub genérico (sin ciudad) | El slug/KW principal no lleva ciudad (ej. "rénovation salle de bain", "colocación de suelo") | 13 secciones — Hero → Servicios → ... (estándar de este documento) |
| Hub local de ciudad | El slug/KW principal es la ciudad en sí, landing principal de esa ciudad (ej. "rénovation intégrale à Hendaye") | 14 secciones — Hero → **Présentation de l'entreprise** (Sección 01bis) → Servicios → ... el resto igual que el hub genérico |
| Servicio local (bajo una ciudad) | El slug cuelga de una landing de ciudad y es un servicio concreto dentro de ella (ej. "rénovation de salle de bain à Hendaye", bajo `/renovation-integrale-hendaye/`) | 14 secciones — igual que el hub genérico (sin Présentation de l'entreprise, ya está en la página madre) + **Sección 14 · Otros Servicios Locales** al final (auditoría 2026-08-23) |
| Subservicio local (bajo un servicio local) | El slug cuelga de una landing de servicio local y es aún más específico (ej. "carrelage" bajo `/renovation-de-salle-de-bain-a-hendaye/`) | 15 secciones — combina las dos capas de arriba: añade **Sección 01bis · Expertise du Sous-Service** tras el Hero (versión más específica de la Présentation de l'entreprise, sin foto de equipo) Y la **Sección 14 · Otros Servicios Locales** al final (auditoría 2026-08-23) |

Todos los tipos comparten: metodología de 9 pasos fijos (Sección 07), lista de zonas fija (Sección 10) y, en landings locales (hub o servicio), testimonios con nombre + barrio/calle en vez de repetir la ciudad (Sección 08).

Si hay duda, preguntar al usuario antes de continuar.

---

## FLUJO DE TRABAJO OBLIGATORIO

Sigue estos pasos en orden. No saltes ninguno.

### PASO 1 — Investigar el dolor real del buyer persona

Antes de mirar una sola keyword, investiga qué le preocupa de verdad a quien busca este servicio. El objetivo es encuadrar cada servicio como la solución a un miedo o frustración concreta, no como una lista de tareas técnicas.

1. **Consulta primero el `BANCO DE DOLORES POR SERVICIO`** (al final de este documento). Si el servicio de la landing ya tiene entrada allí, úsala como punto de partida — no investigues desde cero cada vez.
2. **Investiga en la web** (WebSearch/WebFetch) para confirmar o matizar ese punto de partida, o para construirlo si es un servicio sin entrada todavía:
   - Quejas y dudas reales antes de contratar este tipo de obra (foros, reseñas de empresas del sector, comprendrechoisir/forum-btp en francés, preguntas frecuentes de competidores)
   - Matices propios de la zona (clima húmedo de la costa vasca, edificios antiguos con instalaciones viejas, segunda residencia con obra que no puede eternizarse en época de vacaciones...)
3. **Extrae 2-4 puntos de dolor concretos** — nunca genéricos tipo "quiero calidad". Deben ser específicos del servicio: humedades y moho en juntas, bañera resbaladiza para mayores, obra que te deja semanas sin ducha, presupuesto que se dispara a mitad de obra...
4. **Para cada dolor, anota qué diferenciador real de Reformas Ordoñez lo resuelve** (presupuesto cerrado, gestión llave en mano, equipo propio, garantía de ejecución, +25 años...). Esto convierte una feature en una solución reconocible para el lector.

Este análisis no se presenta solo — se combina con la clasificación de keywords del Paso 2 en un único bloque de confirmación.

---

### PASO 2 — Recibir y analizar el estudio de palabras clave

El usuario te pasará un estudio de KW (puede ser tabla, texto, Excel exportado o lista). Antes de escribir nada debes:

1. **Leer todo el estudio** y extraer todas las keywords
2. **Clasificarlas** en esta estructura:

```
KW PRINCIPAL (1 sola)
→ Mayor volumen + intención transaccional + más específica al servicio
→ Irá en: H1, meta title, meta description, slug, párrafo hero, alt imagen destacada

KWS SECUNDARIAS (2-4)
→ Volumen medio + intención informacional o transaccional
→ Irán en: H2 de sección, párrafos de diferenciadores, descripción de proyectos

VARIACIONES SEMÁNTICAS / LONG TAIL (todas las demás)
→ Sinónimos, variaciones geográficas, preguntas, materiales
→ Irán en: párrafos de texto corrido, listas de servicios, FAQs, testimonios, zonas
```

3. **Presentar al usuario, en un único bloque, la clasificación de keywords Y el dolor/solución del Paso 1** antes de continuar, con este formato:

---
**KW PRINCIPAL:** [keyword] — [volumen] búsquedas/mes
**KWS SECUNDARIAS:**
- [keyword] — [volumen]
- [keyword] — [volumen]
**LONG TAIL / SEMÁNTICAS:**
- [keyword], [keyword], [keyword]...

**BUYER PERSONA:** [perfil breve — quién es, situación]
**DOLOR PRINCIPAL detectado:**
- [dolor 1] → cómo lo resolvemos: [diferenciador real]
- [dolor 2] → cómo lo resolvemos: [diferenciador real]
- [dolor 3] → cómo lo resolvemos: [diferenciador real]

¿Confirmas esta distribución y el enfoque de dolor/solución antes de continuar?
---

⚠️ Esperar confirmación del usuario antes de pasar al Paso 3.

**Tras la confirmación, registra el estudio en `negocio/equipo-marketing/landings-estudios-kw.md`:** añade una entrada nueva (nunca sobrescribas las anteriores) con el estudio en bruto tal como lo pegó el usuario, la clasificación confirmada (KW principal/secundarias/long tail/fuera de alcance) y el dolor/solución. Esto permite auditorías futuras sobre qué landings genéricas adicionales (subservicios sin ciudad) tiene sentido crear, sin depender del historial de la conversación.

⚠️ **Regla de convivencia SEO/dolor:** el dolor emocional matiza el TONO en las secciones de texto libre (ver tabla en el Paso 4). Nunca sustituye una keyword obligatoria en H1/H2/meta/slug — si hay conflicto, gana siempre el SEO.

---

### PASO 3 — Generar metadatos SEO

Una vez confirmada la clasificación de keywords (el dolor/solución no interviene aquí — estos campos siguen siendo 100% SEO), genera:

**SLUG**
- Formato: `/servicio-ciudad/` o `/servicio/` si es genérico
- Solo minúsculas, guiones, sin tildes ni caracteres especiales
- Máximo 5 palabras
- Debe contener la KW principal

**META TITLE**
- Máximo 60 caracteres (contar con espacios)
- ⚠️ NO incluir el nombre de marca (Reformas Ordoñez) — ocupa caracteres valiosos y no aporta diferenciación
- Debe ser distinto del H1 — no repetir la misma frase
- Ser original y diferenciador: destacar un valor único de la empresa (precio cerrado, 25 años, sin sorpresas, llave en mano, bilingüe...) en lugar de limitarse a KW + ciudad
- Formato orientativo: `[KW principal] · [Diferenciador único] en [Ciudad]`
- Ejemplos buenos: `Reforma de Baño en Irún · Precio Cerrado Garantizado` / `Rénovation Salle de Bain à Hendaye · Devis Fixe Sans Surprises`
- Ejemplos a evitar: `Reforma de Baño en Irún | Reformas Ordoñez` (genérico + marca innecesaria)

**META DESCRIPTION**
- Entre 140-155 caracteres
- Incluir KW principal + KW secundaria si cabe
- Llamada a la acción al final
- No repetir el meta title literalmente

**IMAGEN DESTACADA (la que aparece en Google / Open Graph)**
- Nombre de archivo: `[kw-principal-con-guiones].jpg` (sin tildes)
- Título de imagen (WordPress): Frase descriptiva con KW principal, capitalizada
- Alt text: Descripción de la imagen + KW principal + ciudad si aplica. Máximo 125 caracteres.

---

### PASO 4 — Redactar la landing completa

Redacta las 13 secciones en orden. Para cada sección, aplica las keywords según la tabla de distribución del Paso 2 y el dolor/solución según la tabla de abajo.

#### REGLAS GLOBALES DE HEADINGS

| Tag | Cantidad | Regla |
|---|---|---|
| H1 | 1 solo | KW principal exacta o muy cercana. Hero únicamente |
| H2 | 1 por sección | Al menos 2 H2 llevan KW local (ciudad/zona) |
| H3 | Varios | KWs secundarias y long tail. En servicios → enlace interno |
| `<p>` eyebrow | Antes de cada H2 | Nunca es H2 ni H3 — siempre `<p>` estilizado |
| `<strong>` | En párrafos | Solo diferenciadores y datos de peso — nunca por ser keyword |

#### REGLAS DE NEGRITAS `<strong>`

Las negritas **no son una herramienta SEO de keywords** — se ven forzadas y artificiales. Usarlas solo cuando el contenido lo justifica visualmente:

✅ **Úsalas para:**
- Diferenciadores de marca importantes que el lector debe retener: *precio cerrado*, *llave en mano*, *sin coste adicional*, *prix fixe garanti*
- Datos concretos de peso: *+25 años*, *más de 700 obras*, *3 a 5 días hábiles*
- Compromisos escritos o garantías: *Política de Precio Fijo*, *Garantía de Ejecución*
- Ciudad o zona geográfica cuando es el núcleo de la frase (no en cada mención)

❌ **Nunca para:**
- Keywords por el simple hecho de ser keywords
- Palabras decorativas o de relleno
- Más de 1-2 negritas por párrafo
- En títulos (H1/H2/H3) — ya tienen peso propio

#### DÓNDE APLICAR EL DOLOR/SOLUCIÓN (copy emocional, no SEO)

Usa el dolor y la solución identificados en el Paso 1 para matizar el tono en estas zonas de texto libre — nunca para desplazar una keyword de su posición obligatoria (H1/H2 fijos, meta, slug):

| Sección | Cómo aplicarlo |
|---|---|
| 01 · Hero | El subtítulo puede nombrar el dolor de pasada antes de la promesa de solución |
| 04 · Diferenciadores | El párrafo de cada bloque conecta el diferenciador con el dolor concreto que resuelve |
| 05 · Galería | Una pincelada breve del "antes" (el problema) en la descripción del proyecto |
| 08 · Testimonios | Priorizar testimonios que mencionen haber superado ese dolor concreto |
| 09 · CTA lateral | La pregunta del eyebrow puede formularse como el dolor mismo |
| 11 · Validación | El acordeón puede abrir nombrando el dolor antes de la prueba social |
| 12 · FAQ | Al menos 2-3 preguntas nacen directamente de un dolor detectado en el Paso 1 |

⚠️ Si aplicar el dolor obliga a tocar un H1/H2 fijo o una keyword obligatoria, gana siempre el SEO — el dolor se queda en el texto libre.

#### TONO: EL CLIENTE ES EL PROTAGONISTA, NO LA EMPRESA

Error clásico de copy de reformas: llenar la página de "somos", "nuestra empresa", "nuestro equipo", "llevamos X años" como sujeto de la frase. El lector no busca conocer a la empresa, busca resolver su problema — la empresa es quien lo resuelve, no el tema de la conversación.

**Regla por defecto:** en todo el copy libre (subtítulos, párrafos de Diferenciadores, Galería, Testimonios, CTA, FAQ, Validación), el sujeto de la frase es el cliente, su problema o el resultado que consigue — nunca Reformas Ordoñez/"nuestro equipo"/"nosotros". Los datos de la empresa (+25 años, +700 obras, presupuesto cerrado...) se usan como respaldo de una frase centrada en el cliente, no como el titular de esa frase.

- ❌ `Contamos con 25 años de experiencia reformando baños en la zona.`
- ✅ `Tu baño, renovado por un equipo que ya ha resuelto este mismo problema cientos de veces.`

**Excepción — solo en los slots SEO obligatorios puede ganar el lenguaje de empresa:** el H1 (únicamente si la keyword principal exacta contiene literalmente "empresa/entreprise/artisan..."), el meta title/description, el slug, y el H2 de la sección Diferenciadores que exige mencionar "empresa de [servicio] en [ciudad]". Fuera de esos sitios puntuales, no hay excusa SEO para hablar de nosotros en vez de del cliente.

---

### SECCIÓN 01 · HERO (Above the Fold)

**Instrucciones de redacción:**
- H1: KW principal + gancho emocional. 2 líneas máximo. Fraseo centrado en el cliente salvo que la KW exacta obligue a nombrar "empresa/artisan/entreprise" (ver regla de tono arriba). Ej: `Reforma de Baños en Irún, Sin Sorpresas en el Presupuesto` (preferido) — `Empresa de Reformas de Baños en Irún` (solo si la KW principal es literalmente esa)
- ⚠️ **Antes de usar un sustantivo de oficio como KW principal** (maçon, couvreur, carreleur, électricien, plombier...) — verificar que la página vende UN SOLO oficio con ese peso. Si la página vende materiales/oficios genuinamente distintos con volumen real similar (ej. una landing de "revêtements de sol" que vende carrelage Y parquet — carreleur y poseur de parquet son oficios distintos), el H1 debe nombrar todos los materiales/oficios reales, no apropiarse de uno solo (hallazgo real 2026-08-23: `Carreleur à Hendaye` como principal de una página que también vendía parquet con el mismo peso generaba ambigüedad — corregido a `Carrelage et Parquet à Hendaye`)
- Subtítulo `<p>`: 1-2 líneas. Integrar KW de forma natural en la frase. Diferenciadores: calidad, plazos, confianza
- 3 microbenefits `<p>`: Elegir 3 de: Visita 100% Gratuita / Respuesta en menos de 24h / Presupuestos Cerrados / Precio Fijo / Bilingüe ES-FR
- CTA botón rojo: "Solicita Presupuesto Gratuito" o "Pide tu Presupuesto Gratis"

**Imagen sección:**
- Nombre archivo: `reforma-[servicio]-[ciudad]-hero.jpg`
- Título: `Reforma de [servicio] en [ciudad] — Reformas Ordoñez`
- Alt: `[KW principal] — empresa especializada en [ciudad] y alrededores`

---

### SECCIÓN 01bis · PRÉSENTATION DE L'ENTREPRISE (solo landings locales de ciudad)

Únicamente en landings locales de ciudad (ver DETECCIÓN DE TIPO DE LANDING) — nunca en landings hub genéricas. Va inmediatamente después del Hero y antes de Servicios; en el resto, la numeración de secciones no cambia.

**Instrucciones de redacción:**
- Eyebrow `<p>`: `Qui sommes-nous ?`
- H2: evocador, menciona la ciudad. Ej: `Expertise et proximité : l'art de rénover avec exigence à Hendaye.`
- 2 párrafos: el primero sobre experiencia (+25 años, ver DATOS FIJOS DE EMPRESA) y diferenciación real (equipo bilingüe ES/FR, doble cultura normativa a ambos lados de la frontera); el segundo sobre la filosofía de trabajo (acompañamiento, transparencia). Esta es una de las pocas secciones donde SÍ puede predominar el lenguaje de empresa — es literalmente su función, igual que Validación (Sección 11) — pero sin superlativos sin respaldo ("la mejor", "líder") y sin inventar cifras
- Foto del equipo real junto al texto

**Imagen:**
- Nombre: `equipe-reformas-ordonez-[ciudad].jpg`
- Título: `L'équipe Reformas Ordoñez à [Ciudad]`
- Alt: `équipe Reformas Ordoñez, entreprise de rénovation à [ciudad]`

⚠️ **No repetir la misma cifra de credibilidad en varias secciones** (hallazgo real de la auditoría 2026-08-23 sobre Hendaye: "+25 años/+700 obras" aparecía casi igual en Empresa, en el primer bloque de Diferenciadores y en el primer ítem de Validación). Cada sección aporta un ángulo distinto:
- Esta sección (01bis) = quiénes sois, con foto de equipo real
- Diferenciadores (04) = por qué elegiros frente a otra opción — el primer bloque puede tocar la experiencia pero centrado en qué le resuelve al cliente, no en repetir la cifra
- Validación (11) = prueba social/cifras, es el sitio natural para "+700/+950/+25" como titular

---

### SECCIÓN 01ter · EXPERTISE DU SOUS-SERVICE (solo landings de subservicio local)

Únicamente en landings de subservicio local (ver DETECCIÓN DE TIPO DE LANDING, ej. "carrelage" bajo una landing de salle de bain de ciudad) — versión más específica y sin foto de equipo de la Sección 01bis. Va inmediatamente después del Hero y antes de Servicios.

**Instrucciones de redacción:**
- Eyebrow `<p>`: `La meilleure expertise en [sous-service] à [Ciudad]`
- H2: pregunta o afirmación evocadora. Ej: `Pourquoi Sommes-Nous votre Partenaire Idéal pour le Carrelage de votre Salle de Bain ?`
- 3 bloques alternos imagen/texto (mismo patrón que Diferenciadores pero centrados en el subservicio concreto, no en la empresa en general):
  1. Experiencia específica en ESE subservicio (años + qué habéis perfeccionado con la práctica)
  2. Devis claro + garantía (Décennale en Francia) para ese subservicio concreto
  3. Gestión completa de ese subservicio (de principio a fin, sin que el cliente coordine nada)
- Misma regla de tono que 01bis: puede predominar el lenguaje de empresa aquí, pero sin superlativos sin respaldo

**Imágenes (×3 bloques):** mismo patrón que Diferenciadores, nombradas `[subservicio]-[aspecto]-[ciudad].jpg`

---

### SECCIÓN 02 · SERVICIOS

**Instrucciones de redacción:**
- Eyebrow `<p>`: `¿Qué Hacemos?` o variación temática
- H2: Título evocador de transformación. KW secundaria si encaja
- Párrafo descripción: 2 líneas centradas en la transformación que consigue el cliente — los años de experiencia y la zona geográfica se mencionan como respaldo breve, no como sujeto de la frase
- 4 cards con H3: Adaptar al servicio principal de la landing. Los H3 SIEMPRE enlazan a página interna
  - Usar interlinks del cluster correspondiente (ver tabla al final)
- Lista subservicios: 4-5 ítems con › por card. Long tail keywords aquí — pero cada ítem lleva la keyword técnica + un matiz de resultado, no solo el nombre de la tarea (evita el listado tipo ficha técnica)
  - ❌ `Alicatado` / `Fontanería` / `Electricidad`
  - ✅ `Alicatado sin juntas que ennegrecen` / `Fontanería sin fugas ni sorpresas` / `Instalación eléctrica al día con la normativa`

**Imágenes (×4 cards):**
- Nombre: `[servicio-especifico]-[ciudad-o-zona].jpg`
- Título: `[Nombre del servicio] en [zona] — Reformas Ordoñez`
- Alt: `[descripción del servicio] en [ciudad/zona]`

---

### SECCIÓN 03 · TRUST BAR

**Instrucciones de redacción:**
- Sin headings — todo `<p>` / `<span>`
- 3 estadísticas fijas de la empresa:
  - `+700` · Reformas Realizadas
  - `+950` · Clientes Satisfechos  
  - `+25` · Años de Experiencia en Obras y Reformas
- Fondo: #1a5c38 (verde oscuro marca)
- ⚠️ No cambiar los números sin confirmación del usuario
- **En landings de servicio local o subservicio local** (ej. salle de bain en Hendaye, o carrelage de salle de bain en Hendaye), el primer dato puede sustituirse por un conteo específico en vez del +700 general (ej. `+500 Rénovations de Salle de Bain`, `+375 Projets de Carrelage SDB`) — solo si Gabriel confirma que es una cifra real, nunca inventarla. `+950 Clients Satisfaits` y `+25 Années d'Expérience` se mantienen siempre iguales, nunca varían entre landings.
- ⚠️ **Usa la misma cifra específica en toda la página, nunca la repitas con un número distinto en otra sección** (auditoría 2026-08-23: una landing tenía "+20 ans" en la trust bar vs "+25 ans" en Diferenciadores; otra tenía "+375 projets" en la trust bar vs "+300 projets" en Validación — mismo bug repetido dos veces, siempre revisar coherencia antes de entregar)

---

### SECCIÓN 04 · DIFERENCIADORES

**Instrucciones de redacción:**
- Eyebrow `<p>`: Mencionar ciudades principales de la zona. Ej: `La mejor empresa de [servicio] en Irún, Hendaya y alrededores`
- H2: Pregunta con KW + ciudad. Ej: `¿Por Qué Reformas Ordoñez Es tu Opción Ideal para [Servicio] en [Ciudad]?`
- 3 bloques alternos imagen/texto:
  1. **25 Años de Experiencia a tu Servicio** → trayectoria + equipo bilingüe ES/FR
  2. **Presupuesto Cerrado Sin Sorpresas** → precio fijo + transparencia + limpieza diaria
  3. **Un Solo Responsable, Cero Complicaciones para Ti** → coordinación de gremios + calidad, contado como el alivio que gana el cliente (no como proceso interno nuestro)
- CTA texto enlace al final de cada bloque → siempre hacia `/contacto/`

**Imágenes (×3 bloques):**
- Nombre: `experiencia-reformas-[ciudad].jpg` / `presupuesto-cerrado-reformas.jpg` / `gestion-obra-[servicio].jpg`
- Título: descriptivo del diferenciador + ciudad
- Alt: descripción de la imagen + diferenciador clave

---

### SECCIÓN 05 · GALERÍA DE PROYECTOS

**Instrucciones de redacción:**
- Eyebrow `<p>`: `Reformas de Nuestra Empresa en [Zona]` o similar
- H2: Ej: `Espacios transformados con calidad` — no llevar KW principal aquí
- 3 cards con fondo verde oscuro:
  - H3: `[Tipo de reforma] en [Ciudad real del PV]` — ciudad diferente en cada card si posible
  - `<p>`: 2-3 líneas. Material o estilo en `<strong>`. Ej: `**suelo de madera**`, `**azulejo hidráulico**`
- CTA botón rojo centrado bajo el grid

**Imágenes (×3 cards):**
- Nombre: `proyecto-[tipo]-[ciudad]-[número].jpg`
- Título: `Proyecto de [tipo de reforma] en [ciudad] — Reformas Ordoñez`
- Alt: `resultado reforma [tipo] en [ciudad] — [detalle material o estilo]`

**Variante opcional para landings de servicio local:** en vez de 3 cards simples, puede usarse un formato más denso — 1 bloque destacado (proyecto + texto) seguido de una cuadrícula de 6-9 fotos del mismo servicio en esa ciudad. Útil cuando hay banco de fotos real suficiente; si no lo hay, usar el formato estándar de 3 cards.

---

### SECCIÓN 06 · FORMULARIO MID-PAGE

**Instrucciones de redacción:**
- Fondo: verde oscuro marca
- H2: Urgencia + KW secundaria en `<strong>`. Ej: `¡Consigue tu **Presupuesto Gratis** en menos de 1 minuto!`
- Párrafo: `Solicita una visita técnica profesional a domicilio para obtener una valoración exacta de tu proyecto de [servicio].`
- Formulario multi-paso: ⚠️ COMPONENTE FIJO — no editar texto interno
- 3 microbenefits bajo formulario: Visita 100% Gratuita / Respuesta en menos de 24h / Asesoramiento Personal
- 2 botones outline: 📞 Llamar ahora + ✉ Enviar email

---

### SECCIÓN 07 · METODOLOGÍA

**Instrucciones de redacción:**
- Eyebrow `<p>`: `Nuestro Método` o `Nuestro Proceso`
- H2: Evocador. Ej: `Lo que pasa cuando nos confías tus llaves`
- 9 pasos fijos (usar siempre estos, no inventar otros):
  1. Solicitud y Agendamiento
  2. Inspección Técnica In Situ (Gratuita)
  3. Presupuesto Cerrado: Garantía Financiera
  4. Tramitación Administrativa Integral
  5. Jefatura de Obra y Comunicación
  6. Protocolo de Higiene y Protección
  7. Verificación Técnica y Remates
  8. Entrega «Llave en Mano»
  9. Garantía de Ejecución
- Los párrafos de cada paso pueden adaptarse ligeramente al servicio de la landing
- Negritas en: `**Política de Precio Fijo**`, `**llave en mano**`, `**evitar tiempos muertos**`
- CTA botón rojo final: `Contrate un Presupuesto Cerrado`

---

### SECCIÓN 08 · TESTIMONIOS

**Instrucciones de redacción:**
- Fondo: foto ambiente con overlay oscuro
- Eyebrow `<p>`: `Testimonios`
- H2: `Lo que dicen Nuestros Clientes`
- 5 testimonios en carrusel (2 visibles). Estructura cada uno:
  - Texto reseña en cursiva entre «guillemets» — menciona servicio específico relacionado con la landing
  - Nombre inicial + ciudad del PV/Lapurdi en negrita. Ej: `Íñigo L., Rentería`
  - ★★★★★ siempre 5 estrellas en dorado
- ⚠️ Ciudades siempre reales del País Vasco / Lapurdi: Irún, Hondarribia, Rentería, Donostia, Hendaya, Biarritz, Urrugne, Saint-Jean-de-Luz, Bayona

**En landings locales de ciudad** (ver DETECCIÓN DE TIPO DE LANDING): la ciudad ya está fijada por toda la página, así que repetirla 5 veces en los testimonios es redundante. Usar en su lugar **nombre + barrio/calle real de esa ciudad** (ej. `Jean-Pierre L., Avenue des Cyprès` en una landing de Hendaye) — se siente más auténtico y evita la repetición. En landings hub genéricas (sin ciudad) se mantiene el patrón nombre + ciudad de arriba, porque ahí la variedad de ciudades es lo que aporta cobertura de zona.

---

### SECCIÓN 09 · CTA LATERAL

**Instrucciones de redacción:**
- Imagen izquierda: foto corporativa con logo Reformas Ordoñez visible
- Eyebrow `<p>`: pregunta directa. Ej: `¿Tienes dudas sobre tu [servicio]?`
- H2: KW transaccional. Ej: `Solicita tu presupuesto gratis y sin compromiso`
- Párrafo 1: canales de contacto (teléfono, WhatsApp, email)
- Párrafo 2: promesa de valor + servicio específico
- 3 microbenefits con icono app real: 📞 teléfono / 💬 WhatsApp / ✉ email
- CTA botón rojo ancho completo MAYÚSCULAS: `SOLICITA TU PRESUPUESTO GRATIS`

**Imagen:**
- Nombre: `contacto-reformas-ordonez-[ciudad].jpg`
- Título: `Contacta con Reformas Ordoñez en [ciudad]`
- Alt: `especialista de Reformas Ordoñez atendiendo consulta de cliente en [ciudad]`

---

### SECCIÓN 10 · ZONAS DE ACTUACIÓN

**Instrucciones de redacción:**
- Fondo: verde oscuro marca
- H2: `Nuestras Zonas de Acción` (fijo — no cambiar)
- Columna izquierda:
  - `<p>` negrita gancho: `De Hendaya a toda la comarca, sin fronteras.`
  - `<p>` descripción: mencionar **Hendaya** en `<strong>` como sede
  - CTA botón rojo: `Consultar Disponibilidad en mi Zona`
  - `<p>` nota: `¿Tu localidad no aparece en la lista? Si estás cerca de estas zonas...`
- Columna derecha — 2 listas:
  - H3 `España`: Irún, Hondarribia, Rentería, San Sebastián, Bera de Bidasoa
  - H3 `Francia`: Hendaya, Biriatu, Urrugne, Saint-Jean-de-Luz, Biarritz
- ⚠️ Las ciudades de las listas son fijas — no cambiar sin confirmación del usuario. Aplica igual en landings locales de ciudad: nunca añadir Bidart ni Bayonne (fuera del radio real de trabajo, decisión de Gabriel 2026-08-22) ni improvisar una lista de una sola columna "Pays Basque" — siempre la división España/Francia de arriba

---

### SECCIÓN 11 · VALIDACIÓN CON ACORDEÓN

**Instrucciones de redacción:**
- Imagen izquierda: foto ambiente reformado + efecto cuadrado verde detrás
- H2: KW principal en color verde + complemento en negro. Ej: `**La experiencia** que buscas en una empresa de [servicio].`
- Acordeón 3 ítems (primero abierto por defecto):
  1. `Más 900 proyectos y clientes satisfechos` → párrafo desarrollado
  2. `Gestión «Llave en Mano» integral` → cerrado
  3. `Selección de materiales de alta gama` → cerrado
- Los H3 del acordeón pueden adaptarse al servicio específico manteniendo la estructura

**Imagen:**
- Nombre: `reforma-[servicio]-resultado-[ciudad].jpg`
- Título: `Resultado de reforma de [servicio] en [ciudad] — Reformas Ordoñez`
- Alt: `espacio renovado tras reforma de [servicio] en [ciudad]`

---

### SECCIÓN 12 · FAQ

**Instrucciones de redacción:**
- H2: `Preguntas Frecuentes` (fijo)
- **9-11 preguntas en acordeón** (antes eran 7 — se amplía para cubrir más objeciones reales y mejorar featured snippets/voice search). Adaptar todas al servicio específico de la landing, nunca dejarlas genéricas.

**Banco de temas base** (elegir y adaptar — mínimo 9 de estos 11, no hace falta agotarlos todos):
  1. Tiempo/duración de la obra
  2. Permisos y trámites necesarios
  3. Coste orientativo / qué incluye el presupuesto cerrado
  4. Se puede vivir en casa durante la obra
  5. Garantías post-obra
  6. Diseño y elección de materiales
  7. Fecha de inicio / disponibilidad
  8. **Qué pasa si aparece un imprevisto durante la obra** (humedades, tuberías/instalaciones viejas, estructura) → la respuesta debe reforzar que el presupuesto cerrado cubre esto sin sorpresas
  9. **Diferencia con contratar gremios sueltos por separado** → refuerza gestión centralizada/llave en mano
  10. Financiación o forma de pago (si aplica al servicio)
  11. Servicio postventa / qué pasa si algo falla después de entregada la obra

- **Al menos 2-3 preguntas deben nacer directamente de un dolor detectado en el Paso 1**, formuladas tal como lo preguntaría el cliente real (lenguaje de búsqueda natural). Ej. si el dolor es "obra que se eterniza y te deja sin ducha", la pregunta puede ser: `¿Cuánto tiempo estaré sin poder usar el baño durante la reforma?`
- Las respuestas ahora son **más ricas (4-6 líneas, antes 2-4)**: resuelven la duda con precisión, mencionan el diferenciador real que aplica (presupuesto cerrado, llave en mano, garantía de ejecución...) y tejen keywords long tail de forma natural — dar cifras o compromisos concretos siempre que existan (ej. "3 a 5 días hábiles", "presupuesto cerrado por escrito"), no responder en abstracto
- ⚠️ Schema FAQPage ya viene integrado en el tema — no añadir JSON-LD manualmente

---

### SECCIÓN 13 · CONTACTO FINAL

**Instrucciones de redacción:**
- Columna izquierda:
  - Google Maps embed con pin en Hendaye (dirección fija: 4 Av des Allées 2ème Étage, 64700 Hendaye)
  - Barra verde: `Teléfono` + el número según idioma (ver DATOS FIJOS DE EMPRESA — ES: `+34 697 29 41 38` / FR: `+33 7 44 50 11 73`), con su `tel:` correspondiente
  - Barra roja: `Email` + `ReformasOrdonezeus@gmail.com` (enlace `mailto:`)
- Columna derecha (fondo verde oscuro):
  - H2 blanco: `Contáctanos Ahora`
  - `<p>`: `Desde el primer momento, un especialista en [servicio] analizará tu solicitud y se pondrá en contacto contigo para asesorarte.`
  - Formulario: ⚠️ COMPONENTE FIJO — no editar
  - CTA botón rojo: `Solicite su Presupuesto`

---

### SECCIÓN 14 · OTROS SERVICIOS LOCALES (solo landings de servicio local, bajo una ciudad)

Cierre exclusivo de las landings de servicio local (ver DETECCIÓN DE TIPO DE LANDING) — no existe en hub genérico ni en hub local de ciudad. Es un grid de venta cruzada hacia las landings hermanas de la misma ciudad, clave para el interlinking entre el nivel 3 y sus hermanos.

**Instrucciones de redacción:**
- H2: `Besoin d'un autre projet à [Ciudad] ?` (o equivalente ES)
- `<p>` subtítulo breve: variación de "más allá de [este servicio], hacemos también..."
- 4 cards pequeñas, cada una con: icono/foto, nombre del otro servicio + `<p class="location-tag">[Ciudad] et alentours</p>`, descripción de 1 línea, CTA texto (`Voir projets` / `En savoir plus` / `Voir matériaux` / `Consulter`)
- Cada card enlaza a la landing de servicio local correspondiente de la misma ciudad si existe, o a la landing hub genérica si esa sub-página local todavía no se ha creado

**Imágenes (×4 cards):**
- Nombre: `[otro-servicio]-[ciudad].jpg`
- Alt: `[otro servicio] en [ciudad] — Reformas Ordoñez`

---

## PASO 5 — Entregar instrucciones de imágenes consolidadas

Al final de la landing, entrega siempre esta tabla resumen con TODAS las imágenes de la página:

```
## INSTRUCCIONES DE IMÁGENES — [Nombre de la landing]

| # | Sección | Nombre de archivo | Título de imagen | Alt text |
|---|---|---|---|---|
| 1 | Imagen destacada | ... | ... | ... |
| 2 | Hero fondo | ... | ... | ... |
| 3 | Servicios card 1 | ... | ... | ... |
| 4 | Servicios card 2 | ... | ... | ... |
| 5 | Servicios card 3 | ... | ... | ... |
| 6 | Servicios card 4 | ... | ... | ... |
| 7 | Diferenciadores bloque 1 | ... | ... | ... |
| 8 | Diferenciadores bloque 2 | ... | ... | ... |
| 9 | Diferenciadores bloque 3 | ... | ... | ... |
| 10 | Galería proyecto 1 | ... | ... | ... |
| 11 | Galería proyecto 2 | ... | ... | ... |
| 12 | Galería proyecto 3 | ... | ... | ... |
| 13 | CTA lateral | ... | ... | ... |
| 14 | Validación acordeón | ... | ... | ... |
```

**Reglas para nombres de archivo:**
- Solo minúsculas y guiones — sin tildes, sin espacios, sin caracteres especiales
- Formato: `[descripcion]-[ciudad-o-zona].jpg`
- Máximo 60 caracteres

**Reglas para alt text:**
- Máximo 125 caracteres
- Descriptivo + keyword relevante + ciudad cuando aplique
- No empezar por "imagen de" ni "foto de"
- No repetir el mismo alt en dos imágenes distintas

---

## PASO 6 — Generar el Schema.org JSON-LD (rich snippets, solo Francia)

Solo aplica a landings en francés (ver MODO FRANÇAIS). Se entrega como bloque `<script type="application/ld+json">` adicional al final del HTML, tras la tabla de imágenes. Patrón confirmado por Gabriel el 2026-08-23 a partir del schema ya publicado en el sitio.

**¿Lleva schema esta landing?**

| Tipo de landing | ¿Schema? |
|---|---|
| Hub genérico (sin ciudad) | **No** — nunca añadir aquí, una landing sin ciudad no puede llevar `areaServed`/dirección coherente |
| Hub local de ciudad / Servicio local / Subservicio local | Sí, siempre |

**Datos fijos (nunca cambiar sin confirmación):**
```
"@context": "https://schema.org"
"@type": "HomeAndConstructionBusiness"
"image": "https://ordonezrenov.com/wp-content/uploads/2026/03/Logo-de-la-empresa-renov.png"
"telephone": "+33 7 44 50 11 73"  ⚠️ NUNCA "+33 44 50 11 73" (le falta el 7 inicial — error real encontrado el 2026-08-23 en el schema que Gabriel ya tenía publicado, pendiente de corregir también en la web)
"address": {
  "@type": "PostalAddress",
  "streetAddress": "4 Avenue des Allées",
  "addressLocality": "Hendaye",
  "addressRegion": "Nouvelle-Aquitaine",
  "postalCode": "64700",
  "addressCountry": "FR"
}
"aggregateRating": { "@type": "AggregateRating", "ratingValue": "4.9", "reviewCount": "190", "bestRating": "5", "worstRating": "1" }
"priceRange": "€€"
```
⚠️ `aggregateRating` es una cifra real de reseñas de Google que cambia con el tiempo — si ha pasado mucho desde la última landing, confirmar con Gabriel que sigue siendo correcta antes de reutilizarla a ciegas.

**Variables según el tipo (todas menos la Home llevan `mainEntityOfPage`, que la Home no tiene):**

- **Hub local de ciudad** (ej. `/renovation-integrale-hendaye/`): `name`: `Entreprise de Rénovation de Bâtiment à [Ciudad]` · `description`: 1 frase con el servicio genérico + especialidades destacadas de esa página · `areaServed`: `{ "@type": "City", "name": "[Ciudad]" }` (una sola ciudad, no el array de la Home) · `hasOfferCatalog` con **2 Offers genéricas** (ej. "Rénovation d'appartements", "Rénovation de cuisines et salles de bain")
- **Servicio local** (ej. `.../renovation-de-salle-de-bain-a-hendaye/`): `name`: `[Servicio] [Ciudad] - Reformas Ordoñez` · `description`: 1 frase centrada en ese servicio · `hasOfferCatalog` con **1 Offer** específica de ese servicio
- **Subservicio local** (ej. `.../carrelage/`): `name`: `[Oficio] Spécialiste [Servicio] [Ciudad] - Reformas Ordoñez` · `description`: 1 frase muy específica del subservicio · `hasOfferCatalog` con **2 Offers** específicas de ese subservicio

`@id`, `url` y `mainEntityOfPage` son siempre la URL completa de esa landing + `#business` para el `@id`.

⚠️ La Home (`/fr/`) tiene su propio schema ya existente, con `openingHoursSpecification`, `knowsLanguage` y `areaServed` como array de TODAS las ciudades — no se regenera con la skill, es un caso único.

---

## TABLA DE INTERLINKS POR CLUSTER

Usar siempre estos enlaces internos en los H3 de servicios y CTAs de texto:

| Servicio | URL interna principal | URL secundaria |
|---|---|---|
| Baño | `/empresa-de-reformas-de-banos/` | `/irun/reformas-de-bano/` |
| Cocina | `/precio-reforma-cocina/` | — |
| Integral | `/empresa-de-reforma-integral/` | `/precio-reforma-integral/` |
| Fachada | `/rehabilitacion-de-fachadas/` | `/precio-reforma-fachada/` |
| Suelo | `/colocacion-de-suelo/` | — |
| Contacto | `/contacto/` | `/calculadora-presupuesto-reforma/` |

---

## BANCO DE DOLORES POR SERVICIO (referencia rápida)

Punto de partida para el Paso 1 — confirmar o matizar con investigación real antes de cada landing (zona, tipo de vivienda, novedades del sector), no usar a ciegas si ha pasado tiempo. Es un documento vivo: añade filas nuevas cuando la investigación de una landing descubra un matiz que merezca quedar aquí.

| Servicio | Buyer persona típico | Dolor principal | Cómo lo resolvemos |
|---|---|---|---|
| Reforma de baño | Familia con niños o pareja mayor, vivienda de +15-20 años | Humedades/moho en juntas, bañera resbaladiza, miedo a quedarse semanas sin ducha | Presupuesto cerrado + plazos garantizados + antideslizante/accesibilidad opcional |
| Reforma de cocina | Propietario que cocina a diario, cocina obsoleta o mal distribuida | Obra que invade toda la casa, polvo/ruido prolongado, cocina inutilizable semanas | Gestión llave en mano + limpieza diaria + fases planificadas para minimizar días sin cocina |
| Reforma integral | Comprador de vivienda antigua o segunda residencia | Presupuesto que se dispara al abrir paredes, no saber en qué gremio confiar, obra eterna en vacaciones | Presupuesto cerrado por escrito + jefe de obra único + calendario cerrado antes de empezar |
| Rehabilitación de fachada | Comunidad de vecinos o propietario con fachada degradada | Humedad que entra en las paredes interiores, aspecto que devalúa la vivienda, obra en altura que preocupa por seguridad | Equipo propio certificado + garantía de ejecución + gestión de permisos/andamios incluida |
| Colocación de suelo | Propietario con suelo antiguo, roto o peligroso | Miedo a caídas por baldosas sueltas, ruido de pisadas con vecinos debajo, casa inhabitable varios días | Técnica sin retirar el pavimento existente cuando es posible (ahorra 2-3 días) + limpieza diaria |
| Reforma de tejado/toiture | Propietario con goteras o tejado antiguo | Infiltraciones de agua, daños que empeoran con cada lluvia, no saber la gravedad real hasta que es tarde | Inspección técnica gratuita + presupuesto cerrado + prioridad en casos de urgencia |

---

## DATOS FIJOS DE EMPRESA (no modificar nunca)

```
Nombre:     Reformas Ordoñez
Teléfono ES: +34 697 29 41 38  (usar en landings en español)
Teléfono FR: +33 7 44 50 11 73  (usar en landings en francés — número francés dedicado, no es un error)
Email:      ReformasOrdonezeus@gmail.com
Dirección:  4 Av des Allées 2ème Étage, 64700 Hendaye, Francia
Web:        ordonezrenov.com
Experiencia: +25 años
Proyectos:  +700 reformas realizadas
Clientes:   +950 clientes satisfechos
Idiomas:    Español y Francés (bilingüe)
```

---

## FORMATO DE ENTREGA

La landing se entrega en **HTML listo para pegar en WordPress** (editor de bloques o HTML personalizado), siguiendo estas convenciones:

- Comentarios HTML `<!-- SECCIÓN XX: nombre -->` al inicio de cada sección
- Clases CSS descriptivas coherentes con el tema actual del sitio
- CTAs con clase `.btn-primary` (rojo) y `.btn-secondary` (outline)
- Negritas solo con `<strong>` — nunca `<b>`
- Imágenes con placeholder `[IMAGEN: nombre-archivo.jpg]` donde el usuario subirá la foto real
- Formularios con comentario `[INSERTAR COMPONENTE: nombre-del-formulario]`

**Dónde guardar el archivo** (nunca pegar el HTML en el chat — solo confirmar entrega + ruta + qué falta): `negocio/equipo-marketing/landings/`, en la subcarpeta según el nivel de jerarquía (cada nivel tiene su propia plantilla, organizado 2026-08-23):
- `01-principales-genericas/[slug].html` — hub sin ciudad, 13 secciones
- `02-principales-locales/[slug].html` — hub de ciudad, 14 secciones (con Sección 01bis)
- `03-servicios-locales/[ciudad]/[slug].html` — landing de un servicio dentro de una ciudad
- `04-subservicios-locales/[ciudad]/[servicio]/[slug].html` — sub-página bajo un servicio local

---

---

## MODO FRANÇAIS 🇫🇷 — ADAPTACIONES COMPLETAS

Cuando la landing es en francés, aplicar TODAS estas adaptaciones sin excepción.

### Idioma y tono

- Todo el contenido redactado en **français correct y profesional**
- Tutoyement → **vouvoiement** (vous, votre, vos) — el mercado francés es más formal
- Tono: experto, rigoureux, rassurant — evitar exclamaciones excesivas
- Guillemets franceses: « » (no españoles ni anglosajones)

### Adaptaciones por sección

| Sección | Cambio en versión FR |
|---|---|
| **Hero** | CTA: *"Demandez votre Devis Gratuit"* o *"Obtenez un Devis Gratuit"* |
| **Servicios** | Eyebrow: *"Nos Prestations"* / H2: *"Nous transformons votre espace"* |
| **Trust Bar** | Etiquetas: *"Rénovations Réalisées"* / *"Clients Satisfaits"* / *"Années d'Expérience"* |
| **Diferenciadores** | Eyebrow: *"Le meilleur artisan rénovation à Hendaye et alentours"* / H2 con pregunta en FR |
| **Galería** | H3: *"[Type de rénovation] à [Ville française]"* — ciudades del Lapurdi/Côte Basque |
| **Formulario mid-page** | H2: *"Obtenez votre Devis Gratuit en moins d'1 minute !"* / microbenefits en FR |
| **Metodología** | H2: *"Ce qui se passe quand vous nous confiez vos clés"* / nombres de pasos en FR |
| **Testimonios** | H2: *"Ce que disent nos Clients"* / ciudades: Hendaye, Biarritz, Bayonne, Saint-Jean-de-Luz, Anglet |
| **CTA lateral** | Eyebrow: *"Des questions sur vos travaux ?"* / CTA: *"DEMANDEZ VOTRE DEVIS GRATUIT"* |
| **Zonas** | H2: *"Nos Zones d'Intervention"* / gancho: *"D'Hendaye à tout le Pays Basque, sans frontières."* / H3: *"Espagne"* y *"France"* |
| **Validación** | H2: *"**L'expérience** que vous recherchez en entreprise de rénovation."* |
| **FAQ** | H2: *"Questions Fréquentes"* / reformular las 9-11 preguntas en FR, misma regla de dolor/solución |
| **Contacto** | H2: *"Contactez-nous Maintenant"* / párrafo intro en FR / CTA: *"Demandez votre Devis"* |

### Nombres de los 9 pasos en francés

| Paso | Nombre FR |
|---|---|
| 1 | Demande et Prise de Rendez-vous |
| 2 | Inspection Technique sur Site (Gratuite) |
| 3 | Devis Fermé : Garantie Financière |
| 4 | Gestion Administrative Intégrale |
| 5 | Conduite de Chantier et Communication |
| 6 | Protocole d'Hygiène et de Protection |
| 7 | Vérification Technique et Finitions |
| 8 | Livraison «Clé en Main» |
| 9 | Garantie d'Exécution |

Negritas en FR: `**devis fermé**`, `**clé en main**`, `**prix fixe garanti**`

### Metadatos SEO en francés

**SLUG**
- Sin accents — solo minúsculas y guiones
- Ej: `/renovation-salle-de-bain-hendaye/` — nunca usar caracteres especiales

**META TITLE en francés**
- Mismas reglas que en español: máximo 60 caracteres, sin nombre de marca, original y diferenciador
- Formato orientativo: `[KW principale] · [Différenciateur] à [Ville]`
- Ejemplo: `Rénovation Salle de Bain à Hendaye · Devis Fixe Garanti`

**META DESCRIPTION**
- En francés. CTA final: *"Devis gratuit et sans engagement."*

### TVA et réglementation française

Cuando aplique (presupuestos, precios, FAQ), mencionar:
- **TVA à taux réduit 5,5%** pour travaux de rénovation énergétique en résidence principale
- **TVA 10%** pour autres travaux de rénovation
- Rappel: Reformas Ordoñez est enregistré en France (SIRET 994 426 286 00013, Hendaye)

### Ciudades de referencia para versión FR

**Ciudades principales (Lapurdi / Côte Basque):**
Hendaye · Biarritz · Bayonne · Saint-Jean-de-Luz · Anglet · Urrugne · Biriatu · Ciboure · Guéthary · Bidart

**En testimonios:** usar solo ciudades reales del Pays Basque français — nunca ciudades españolas en versión FR

### Microbenefits en francés

Elegir 3 de:
- ✓ Visite 100% Gratuite
- ⚡ Réponse en moins de 24h
- 🛡 Devis Fermé Sans Surprises
- 📞 Accompagnement Bilingue FR-ES
- 🏗 Prix Fixe Garanti

---

## CHECKLIST FINAL ANTES DE ENTREGAR

Antes de dar por terminada la landing, verificar:

**General (ES y FR):**
- [ ] Tipo de landing detectado (hub genérico / hub local / servicio local / subservicio local — ver DETECCIÓN DE TIPO DE LANDING)
- [ ] Si es FR y no es hub genérico: schema.org JSON-LD incluido (Paso 6), con el teléfono correcto `+33 7 44 50 11 73` (nunca sin el 7 inicial)
- [ ] Idioma detectado y aplicado de forma consistente en toda la landing
- [ ] Solo 1 H1 en toda la página
- [ ] KW principal en H1, meta title, meta description, slug y alt imagen destacada
- [ ] Al menos 2 H2 con keyword geográfica (ciudad/zona)
- [ ] Todos los H3 de servicios tienen enlace interno
- [ ] Negritas `<strong>` solo en keywords — no decorativas
- [ ] Eyebrows son `<p>` — nunca headings
- [ ] Tabla de imágenes completa con los 14 registros
- [ ] Datos de empresa correctos (teléfono, email, dirección) — el teléfono es el que corresponde al idioma (ES/FR), nunca el mismo número en ambas versiones
- [ ] Ninguna cifra de credibilidad (+25 años, +700 obras...) se repite como titular en más de una sección
- [ ] Si hay una cifra específica de servicio/subservicio (ej. +500 salle de bain, +375 carrelage), es la misma en todas las secciones donde aparece — nunca dos números distintos en la misma página
- [ ] Si esta landing no tiene dato de KW propio (zona pequeña sin señal ni siquiera genérica), tiene un ángulo diferenciador real frente a otras landings sin dato del cluster — nunca clonar FAQ/testimonios/diferenciadores de la zona vecina cambiando solo el nombre de la ciudad (riesgo de contenido duplicado, hallazgo real 2026-08-23)
- [ ] Formularios marcados como componentes fijos no editables
- [ ] FAQs adaptadas al servicio específico de la landing, mínimo 9 preguntas, respuestas de 4-6 líneas
- [ ] Al menos 2-3 FAQs nacen directamente de un dolor detectado en el Paso 1
- [ ] El copy conecta el dolor real del buyer persona con un diferenciador/solución concreta, sin desplazar keywords de sus posiciones obligatorias
- [ ] El copy libre habla del cliente/su problema/resultado, no de la empresa como sujeto — salvo en los slots SEO obligatorios (H1 si la KW lo exige, meta, slug, H2 de Diferenciadores)

**Solo versión FR:**
- [ ] Todo el texto en francés — sin mezcla de idiomas en el contenido
- [ ] Vouvoiement aplicado de forma consistente (vous/votre/vos)
- [ ] Ciudades de testimonios del Pays Basque français
- [ ] TVA francesa mencionada si la landing toca precios o presupuestos
- [ ] Slug sin acentos ni caracteres especiales
- [ ] Nombre de marca *Reformas Ordoñez* conservado en español
