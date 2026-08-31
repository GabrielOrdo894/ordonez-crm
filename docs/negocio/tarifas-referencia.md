# Tarifas de referencia — Reformas Ordoñez

Precios propios de la empresa (posicionamiento medio-alto), calibrados por el agente `calibrador-tarifas` a partir
de `docs/precios-mercado.md` (precios de mercado de zona + margen de posicionamiento propio) y aprobados por
Gabriel el 2026-07-25. Todos los precios son **sin IVA/TVA** (base imponible), igual que `Linea.precio_unit`.

**Esto es un punto de partida, no una lista cerrada.** A partir de ahora se va completando y corrigiendo con el uso
real: cuando el revisor detecte una partida sin referencia, o cuando un presupuesto real confirme que un precio
está desajustado, se relanza `vigia-precios-mercado` (si hace falta más dato de mercado) y/o `calibrador-tarifas`
(para recalibrar) y se actualiza esta tabla. Ver `docs/precios-mercado.md` § "Próxima actualización recomendada"
para lo que ya se sabe que falta.

**Corrección de política de márgenes (Gabriel, 2026-08-31):** el sistema de calibración por margen
(`calibrador-tarifas`, mínimo 30% exigido) se aplica **solo a mano de obra**. Los **materiales se facturan a
precio real** (lo que paga Reformas Ordoñez a su proveedor, principalmente Alkain), sin margen añadido por el
CRM — el ingreso de la empresa en un presupuesto viene de la mano de obra y de los servicios propios (ej. gestión
de pedido/recepción/transporte de material), no de revender material con margen. Motivo real: el presupuesto
P-2026-0046 (Oihana, Donostia) tenía material de baño con precios de gama alta/a medida etiquetados como gama
media — el coste de referencia usado hasta ahora (PVP catálogo Gamma) estaba muy por encima del coste real de
compra en Alkain. Las filas de **Carpintería/mobiliario** y **Sanitarios y mampara** de abajo están siendo
recalibradas una a una con costes reales conforme se van confirmando (las corregidas el 2026-08-31 llevan esa
fecha en la nota); las que no llevan fecha de corrección siguen con el cálculo antiguo por margen y deben tratarse
como desactualizadas hasta que se confirme su coste real.

## Demolición y albañilería

| Partida | Unidad | País | Precio referencia | Notas |
|---|---|---|---|---|
| Demolición tabique pladur | m² | España | 9,50 € | |
| Démolition cloison | m² | Francia | 8,30 € | |
| Demolición partición fábrica revestida (ladrillo hueco) | m² | España | 7,40 € | |
| Demolición partición fábrica vista (ladrillo perforado) | m² | España | 13,50 € | |
| Demolición de alicatado (con base soporte) | m² | España | 15,20 € | |
| Retirada de escombros con vertido autorizado | forfait | — | Incluido / Inclus | servicio implícito, no fila aparte — integrar en la descripción de la línea principal |

## Fontanería

| Partida | Unidad | País | Precio referencia | Notas |
|---|---|---|---|---|
| Punto de agua | ud | España | 300 € | |
| Tarifa hora fontanero | h | España | 62 € | referencia interna de coste de mano de obra, no necesariamente línea facturable directa |
| Tarif horaire plombier | h | Francia | 83 € | |

## Electricidad

| Partida | Unidad | País | Precio referencia | Notas |
|---|---|---|---|---|
| Punto de luz | ud | España | 76 € | |
| Tableau électrique (cuadro eléctrico) | ud | Francia | 2.280 € | |

## Alicatado y solado

Recalibrado el 2026-08-28 a partir de las 13 filas nuevas de la familia `ALI` en `docs/negocio/precios-mercado.md`
(CYPE ALTA + preciom2 MEDIA, España) — la antigua fila combinada "Colocación cerámico (material + mano de obra):
21 €/m²" quedó confirmada desfasada por abajo en la revisión del presupuesto P-2026-0045 (precios reales de zona,
Gipuzkoa, muy por encima) y se retira, sustituida por mano de obra y material en filas separadas (política nueva de
presupuestos: material y mano de obra siempre en líneas distintas cuando hay material identificable, ver
`.claude/agents/creador-presupuestos.md`). Se distingue formato estándar de gran formato (30x90cm pared / 23x120cm
suelo, los formatos reales más usados en los presupuestos de la empresa). Mano de obra: medio nacional × ajuste de
zona Gipuzkoa (+20%) × margen de posicionamiento (+15% estándar / +25% gran formato, más técnico/menos
estandarizado). Material: coste nacional CYPE (componente de material del precio descompuesto, no un precio de
venta) × ajuste de zona (+20%) × markup +30% (estándar) / +45% (gran formato) — mismo criterio que la familia SAN,
verificando que el margen sobre el coste nacional sin zonificar supera siempre el 30% mínimo exigido en
`docs/tecnico/esquema-presupuestos.md`. No se ha usado como base la fila ⚠ outlier de precios-mercado.md (202,42
€/m², gres "técnico" gran formato) — se cita solo como techo si el cliente elige esa gama premium. Aprobado por
Gabriel el 2026-08-28.

**Aviso sobre el material estándar (~28 €/m²):** sigue siendo una referencia de precio de mercado general (CYPE,
precio nacional del componente de material), no necesariamente lo que paga Reformas Ordoñez a través de Alkain, su
proveedor real de confianza, que puede salir bastante más barato por precio de proveedor. No hay todavía un
catálogo de precios de azulejo/porcelánico de Alkain indexado en el CRM — los catálogos Gamma/Roca que sí están
indexados (familia SAN) no cubren azulejo, comprobado el 2026-08-28. Esta comparación queda abierta como aviso, no
resuelta.

**Corrección del mismo día — material gran formato, de 104 € a 36 €/m²:** la cifra de 104 € (CYPE, coste nacional
del componente de material × zona × markup) quedó confirmada sobrevalorada 2,2–6,7 veces frente al PVP público real
de las marcas de catálogo general que distribuye Alkain (Keraben, STN Cerámica, Durstone, Cerdomus — ver bloque de
precio de marca real añadido el 2026-08-28 a la familia `ALI` de `precios-mercado.md`). Recalibrado a partir del
medio de esas 4 marcas en formato 30x90/23x120 (≈29,70 €/m², rango real 13,89–46,20 €/m²) + margen de posicionamiento
+20% (extremo superior del habitual +10-20%, por la dispersión real entre marca/formato). Aprobado explícitamente
por Gabriel el 2026-08-29. Porcelanosa y Apavisa (marca premium, 54–107 €/m² real) quedan fuera de esta base — se
citan aparte, solo si el cliente elige esa gama explícitamente. Sigue sin verificar el margen real sobre el coste
que paga Reformas Ordoñez a Alkain como cliente habitual (estas 4 cifras son PVP de tienda online al público, no el
precio negociado por Alkain) — es muy probable que el margen real sea mayor, nunca menor, pero es un supuesto
razonable, no un cálculo confirmado.

| Partida | Unidad | País | Precio referencia | Notas |
|---|---|---|---|---|
| Alicatado pared, mano de obra sola, formato estándar (≤30x30cm/20x40cm) | m² | España | 21 € | zona Gipuzkoa +20% sobre medio nacional (15,20 €, CYPE+preciom2) + margen +15%; confianza MEDIA (ajuste de zona propio, sin dato directo de zona) |
| Alicatado pared, mano de obra sola, gran formato (30x90cm) | m² | España | 30 € | zona +20% sobre medio nacional (20 €, preciom2 tramo 30x60cm+) + margen +25% (partida más técnica); confianza MEDIA-BAJA (fuente base ya MEDIA + ajuste de zona propio) |
| Solado, mano de obra sola, formato estándar (≤25x25cm) | m² | España | 17,50 € | zona +20% sobre medio nacional (12,63 €, CYPE) + margen +15%; confianza MEDIA |
| Solado, mano de obra sola, gran formato (23x120cm) | m² | España | 25 € | zona +20% sobre medio nacional (16,52 €, CYPE, componente mano de obra de la fila RSG150 — no la fila outlier, esa es solo el material) + margen +25%; confianza MEDIA |
| Material cerámico/gres, formato estándar (pared y suelo) | m² | España | 28 € | ⚠ pendiente de recalibrar a precio real (cifra antigua por margen) — ver aviso Alkain arriba |
| Material gres porcelánico, gran formato pared (30x90) | m² | España | 19 € | **corregido 2026-08-31** — precio real Alkain confirmado por Gabriel en P-2026-0045 (Irún), sin margen; sustituye la cifra anterior de 36 € (PVP de marca general, no precio real de compra) |
| Material gres porcelánico, gran formato suelo (23x120) | m² | España | 23 € | **corregido 2026-08-31** — precio real Alkain confirmado por Gabriel en P-2026-0045 (Irún), sin margen; sustituye la cifra anterior de 36 € |
| Pose carrelage, fourniture + pose | m² | Francia | 172 € | sin cambios en esta ronda — no llegó dato nuevo de mercado para Francia |

## Suelos

| Partida | Unidad | País | Precio referencia | Notas |
|---|---|---|---|---|
| Suelo laminado, instalado | m² | España | 41 € | |
| Parquet madera, instalado (material + mano) | m² | España | 97 € | |
| Parquet stratifié, pose comprise | m² | Francia | 44 € | |

## Fachadas / SATE / ITE

| Partida | Unidad | País | Precio referencia | Notas |
|---|---|---|---|---|
| SATE, material + mano | m² | España | 130 € | |
| ITE (sous enduit), pose comprise | m² | Francia | 245 € | |
| Ravalement de façade (zona Bayonne/Anglet) | m² | Francia | 86 € | dato de zona directo, no solo ajuste nacional |

## Techos y cubiertas

| Partida | Unidad | País | Precio referencia | Notas |
|---|---|---|---|---|
| Falso techo pladur, registrable | m² | España | 35 € | |
| Cubierta completa de tejas | m² | España | 240 € | |
| Impermeabilización cubierta plana | m² | España | 50 € | |
| Toiture tuiles, rénovation complète | m² | Francia | 120 € | fuente única en mercado (MEDIA) — revisar cuando haya segunda fuente |
| Toiture zinc | m² | Francia | *(sin fijar)* | dispersión de mercado demasiado alta (90–310 €/m² según alcance) — presupuestar caso a caso hasta tener mejor dato |

## Pintura

| Partida | Unidad | País | Precio referencia | Notas |
|---|---|---|---|---|
| Pintura interior estándar | m² | España | 15 € | |
| Peinture intérieure, support à reboucher | m² | Francia | 40 € | |
| Pintura fachada exterior | m² | España | 18 € | |

## Carpintería / mobiliario

Calibrado el 2026-08-02 a partir de la familia `SAN` de `docs/precios-mercado.md` (PVP proveedor Alkain,
catálogo Gamma 2024-2025 — Roca no trae precio explícito en el texto del catálogo). **Precio de material
suelto, sin instalación**: la mano de obra ya está en las familias de Fontanería/Alicatado, no la dupliques.
Aprobado por Gabriel el 2026-08-02.

| Partida | Unidad | País | Precio referencia | Notas |
|---|---|---|---|---|
| Mueble de baño con lavabo, gama económica/estándar | ud | España | 825 € | ⚠ pendiente de recalibrar a precio real — cifra antigua por margen (coste ~550 € + 50%), no confirmada |
| Mueble de baño con lavabo, gama media | ud | España | 650–1.100 € | **corregido 2026-08-31** — precio real Alkain, sin margen (coste real ~350–700 €); sustituye la cifra anterior de 2.050 €, que era PVP de catálogo Gamma muy por encima del coste real de compra |
| Mueble de baño con lavabo, gama alta/diseño | ud | España | 4.800 € | ⚠ pendiente de recalibrar a precio real — cifra antigua por margen (coste ~3.000 € + 60%), no confirmada |
| *(resto de carpintería general — puertas, armarios empotrados, mobiliario de cocina...)* | | | | sin datos de mercado todavía — lanzar `vigia-precios-mercado` cuando haga falta |

## Revestimientos ligeros (PVC / vinílico, sobre soporte existente sin retirar)

Añadido 2026-08-31 a partir de precio real Alkain (Gabriel) — categoría que faltaba en esta tabla, usada cuando el
cliente no quiere picar el alicatado/suelo existente. Precio real de material, sin margen (ver política de arriba);
la mano de obra de colocación va en línea aparte.

| Partida | Unidad | País | Precio referencia | Notas |
|---|---|---|---|---|
| Revestimiento mural PVC hidrófugo, material | m² | España | 26–34 € | precio real Alkain, sin margen (coste real ~12–22 €) |
| Suelo vinílico apto húmedo, material | m² | España | 28–38 € | precio real Alkain, sin margen (coste real ~15–25 €); confirmado ya correcto por Gabriel, ajustado solo el techo (antes 42 €) |

## Sanitarios y mampara

Calibrado el 2026-08-02 a partir de la familia `SAN` de `docs/precios-mercado.md` (PVP proveedor Alkain,
catálogo Gamma 2024-2025 — Roca no trae precio explícito en el texto del catálogo). **Precio de material
suelto, sin instalación**: la mano de obra ya está en las familias de Fontanería/Alicatado, no la dupliques.
Margen calibrado sobre coste (no sobre precio de mercado de competencia como el resto de esta tabla) para
garantizar el margen bruto mínimo del 30% de `docs/esquema-presupuestos.md`. Aprobado por Gabriel el 2026-08-02.

| Partida | Unidad | País | Precio referencia | Notas |
|---|---|---|---|---|
| Lavabo suelto (sobre encimera o mural) | ud | España | 290 € | ⚠ pendiente de recalibrar a precio real (cifra antigua por margen) |
| Grifería de lavabo monomando, gama básica | ud | España | 150 € | ⚠ pendiente de recalibrar a precio real (cifra antigua por margen) |
| Grifería de lavabo monomando, gama media | ud | España | 120–240 € | **corregido 2026-08-31** — precio real Alkain, sin margen (coste real ~60–150 €); sustituye la cifra anterior de 400 € |
| Grifería de lavabo monomando, gama diseño/PVD | ud | España | 990 € | ⚠ pendiente de recalibrar a precio real (cifra antigua por margen) |
| Termostato de ducha, válvula sola (sin conjunto) | ud | España | 400 € | ⚠ pendiente de recalibrar a precio real (cifra antigua por margen) |
| Conjunto de ducha empotrado (termostático/monomando + teleducha) | ud | España | 1.490 € | ⚠ pendiente de recalibrar a precio real (cifra antigua por margen); rango de catálogo muy amplio (429–2.125 €) |
| Inodoro suspendido, gama estándar/media (sin cisterna/bastidor) | ud | España | 500 € | ⚠ pendiente de recalibrar a precio real (cifra antigua por margen) |
| Inodoro suspendido inteligente / Smart Toilet, gama alta | ud | España | 4.635 € | ⚠ pendiente de recalibrar a precio real (cifra antigua por margen) |
| Sistema de instalación / cisterna empotrada (bastidor + placa) | ud | España | 600 € | ⚠ pendiente de recalibrar a precio real (cifra antigua por margen) |
| Inodoro o sanitario compacto/a suelo | ud | España | 240–380 € | **corregido 2026-08-31** — precio real Alkain, sin margen (coste real ~130–250 €); sustituye la cifra anterior de 620 € |
| Bidé (suspendido o a suelo) | ud | España | 360 € | ⚠ pendiente de recalibrar a precio real (cifra antigua por margen) |
| Mampara de ducha | ud | España | 450–780 € | **corregido 2026-08-31** — precio real Alkain, sin margen (coste real ~250–500 €); sustituye la cifra anterior de 740 € |
| Mampara de bañera | ud | España | 360 € | ⚠ pendiente de recalibrar a precio real (cifra antigua por margen) |
| Plato de ducha | ud | España | 380–620 € | **confirmado 2026-08-31** por Gabriel como ya correcto (coste real ~200–400 €); prácticamente sin cambio respecto a la cifra anterior (545 €) |
| Bañera, gama estándar (acrílico) | ud | España | 1.010 € | ⚠ pendiente de recalibrar a precio real (cifra antigua por margen) |
| Bañera, gama alta/diseño (Solid Surface, porcelana o color) | ud | España | 4.860 € | ⚠ pendiente de recalibrar a precio real (cifra antigua por margen) |
| Espejo de baño con luz LED | ud | España | 170–320 € | **corregido 2026-08-31** — precio real Alkain, sin margen (coste real ~90–200 €); sustituye la cifra anterior de 435 € |
| Radiador toallero, gama estándar (agua o eléctrico) | ud | España | 560 € | coste ~350 € + margen +60%; dispersión muy alta dentro de la gama (103–722 €, mezcla toalleros pequeños con radiadores de agua grandes) — valorar presupuestar por tramos según potencia/tamaño |
| Radiador toallero, gama alta/diseño (cromado premium, gran potencia) | ud | España | 1.815 € | coste ~1.100 € + margen +65% |
| Columna/equipo de ducha exterior (visible, no empotrado) | ud | España | 480 € | coste ~300 € + margen +60%; dispersión alta dentro de la gama (121–756 €) |
| Percha / colgador, pieza suelta | ud | España | 35 € | coste ~23 € + margen +52% |
| Portarrollos, toallero aro/anilla/argolla | ud | España | 75 € | coste ~47 € + margen +60% |
| Toallero de barra y escobillero | ud | España | 100 € | coste ~62 € + margen +65%; dispersión alta (mezcla barras cortas ~19€ con piezas premium ~189€) — valorar presupuestar por tramos cuando la pieza elegida sea claramente premium |

## Otros / mano de obra general

| Partida | Unidad | País | Precio referencia | Notas |
|---|---|---|---|---|
| Limpieza final de obra | forfait | — | Incluido / Inclus (precio 0, siempre fila fija) | |
| Gestión de pedido, recepción y transporte de material (Alkain) | forfait | España | Incluido (precio 0, siempre fila fija) | añadido 2026-08-31, marcado incluido el mismo día por Gabriel — igual que la limpieza final, va como fila propia con precio 0, no como línea facturable; incluir siempre que el material del presupuesto se compre en Alkain, ver [[project_proveedor_alkain_recomendacion]] |
| Impermeabilización puntual de suelo bajo plato de ducha (zona modificada, sin retirar alicatado) | forfait | España | 60 € material | añadido 2026-08-31 — partida que se detectó olvidada en un presupuesto real (P-2026-0046) al ampliar una ducha; precio de material (SPEC o similar, sin margen), aplicación incluida en la mano de obra de fontanería; primera estimación, no confirmada con proveedor |

## Referencia de proyecto completo (orientativa, no partidas individuales)

Para el pre-análisis rápido de presupuestos orientativos grandes — no son precios de línea, son bandas de precio
por m² o totales de proyecto, calibradas igual (mercado de zona + margen):

| Tipo de proyecto | Unidad | País | Banda propia orientativa | Notas |
|---|---|---|---|---|
| Reforma integral, calidad media | €/m² | España (Gipuzkoa) | 610–710 € | sobre 530 €/m² medio de zona + margen |
| Reforma integral, calidad media | €/m² HT | Francia (Pays Basque) | 1.090–1.380 € | sobre banda nacional ajustada a zona + margen, sin dato de zona propio fiable |
| Baño completo, gama media | €/m² | España (Gipuzkoa/Donostia) | 1.780–2.010 € | sobre 1.550–1.750 €/m² de zona calculado por el vigía |
| Baño completo, gama media | €/m² HT | Francia (Côte Basque) | 1.840–2.010 € | sobre 1.600–1.750 €/m² HT de zona |
| Cocina completa, gama media | €/m² | España (Gipuzkoa) | 1.265–1.425 € | sobre 1.100–1.240 €/m² de zona |
| Cocina completa, gama media | €/m² HT | Francia | provisional, sin dato de zona propio | usar +15-25% sobre banda nacional francesa hasta tener mejor dato |
