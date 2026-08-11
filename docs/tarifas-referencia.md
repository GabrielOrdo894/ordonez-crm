# Tarifas de referencia — Reformas Ordoñez

Precios propios de la empresa (posicionamiento medio-alto), calibrados por el agente `calibrador-tarifas` a partir
de `docs/precios-mercado.md` (precios de mercado de zona + margen de posicionamiento propio) y aprobados por
Gabriel el 2026-07-25. Todos los precios son **sin IVA/TVA** (base imponible), igual que `Linea.precio_unit`.

**Esto es un punto de partida, no una lista cerrada.** A partir de ahora se va completando y corrigiendo con el uso
real: cuando el revisor detecte una partida sin referencia, o cuando un presupuesto real confirme que un precio
está desajustado, se relanza `vigia-precios-mercado` (si hace falta más dato de mercado) y/o `calibrador-tarifas`
(para recalibrar) y se actualiza esta tabla. Ver `docs/precios-mercado.md` § "Próxima actualización recomendada"
para lo que ya se sabe que falta.

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

| Partida | Unidad | País | Precio referencia | Notas |
|---|---|---|---|---|
| Colocación cerámico (material + mano de obra) | m² | España | 21 € | rango de origen amplio, revisar en cuanto haya más dato de zona |
| Pose carrelage, fourniture + pose | m² | Francia | 172 € | |

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
| Mueble de baño con lavabo, gama económica/estándar | ud | España | 825 € | coste ~550 € (PVP Alkain) + margen +50% |
| Mueble de baño con lavabo, gama media | ud | España | 2.050 € | coste ~1.350 € + margen +52% |
| Mueble de baño con lavabo, gama alta/diseño | ud | España | 4.800 € | coste ~3.000 € + margen +60%; ref. cualitativa Roca (Tura/Meridian/Beyond) sin precio propio en catálogo |
| *(resto de carpintería general — puertas, armarios empotrados, mobiliario de cocina...)* | | | | sin datos de mercado todavía — lanzar `vigia-precios-mercado` cuando haga falta |

## Sanitarios y mampara

Calibrado el 2026-08-02 a partir de la familia `SAN` de `docs/precios-mercado.md` (PVP proveedor Alkain,
catálogo Gamma 2024-2025 — Roca no trae precio explícito en el texto del catálogo). **Precio de material
suelto, sin instalación**: la mano de obra ya está en las familias de Fontanería/Alicatado, no la dupliques.
Margen calibrado sobre coste (no sobre precio de mercado de competencia como el resto de esta tabla) para
garantizar el margen bruto mínimo del 30% de `docs/esquema-presupuestos.md`. Aprobado por Gabriel el 2026-08-02.

| Partida | Unidad | País | Precio referencia | Notas |
|---|---|---|---|---|
| Lavabo suelto (sobre encimera o mural) | ud | España | 290 € | coste ~180 € + margen +60% |
| Grifería de lavabo monomando, gama básica | ud | España | 150 € | coste ~100 € + margen +50% |
| Grifería de lavabo monomando, gama media | ud | España | 400 € | coste ~260 € + margen +55% |
| Grifería de lavabo monomando, gama diseño/PVD | ud | España | 990 € | coste ~600 € + margen +65% |
| Termostato de ducha, válvula sola (sin conjunto) | ud | España | 400 € | coste ~250 € + margen +60% |
| Conjunto de ducha empotrado (termostático/monomando + teleducha) | ud | España | 1.490 € | coste ~900 € + margen +65%; rango de catálogo muy amplio (429–2.125 €) — valorar presupuestar por tramos según gama elegida en vez de precio único |
| Inodoro suspendido, gama estándar/media (sin cisterna/bastidor) | ud | España | 500 € | coste ~340 € + margen +48% |
| Inodoro suspendido inteligente / Smart Toilet, gama alta | ud | España | 4.635 € | coste ~3.089 € + margen +50%; catálogo con solo un SKU real (rango casi nulo), margen fijado por posicionamiento, no por dispersión de mercado |
| Sistema de instalación / cisterna empotrada (bastidor + placa) | ud | España | 600 € | coste ~414 € + margen +45% (mínimo aplicado, partida muy estandarizada) |
| Inodoro o sanitario compacto/a suelo | ud | España | 620 € | coste ~400 € + margen +55% |
| Bidé (suspendido o a suelo) | ud | España | 360 € | coste ~230 € + margen +55% |
| Mampara de ducha | ud | España | 740 € | coste ~460 € + margen +60% |
| Mampara de bañera | ud | España | 360 € | coste ~230 € + margen +55% |
| Plato de ducha | ud | España | 545 € | coste ~350 € + margen +55% |
| Bañera, gama estándar (acrílico) | ud | España | 1.010 € | coste ~650 € + margen +55% |
| Bañera, gama alta/diseño (Solid Surface, porcelana o color) | ud | España | 4.860 € | coste ~3.000 € + margen +62% |
| Espejo de baño con luz LED | ud | España | 435 € | coste ~280 € + margen +55% |
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
