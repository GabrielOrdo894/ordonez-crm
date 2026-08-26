# Precios de mercado — referencia externa para el revisor de presupuestos

**Última actualización general:** 2026-08-05 (investigación inicial + ampliación de tejados/cubiertas + familia CAR
nueva de carpintería general, agente `vigia-precios-mercado`).

**Resumen de lo cubierto:** reforma integral de vivienda, demolición/albañilería, reforma de baño, reforma de
cocina, alicatado/solado, suelos (parquet/laminado), fachadas (SATE/ITE), techos (falso techo/cubiertas), pintura
(interior/fachada), carpintería general (puertas, armarios, mobiliario de cocina), fontanería y electricidad — en
España (zona Gipuzkoa/Costa Vasca: Irún, Hondarribia, Donostia-San Sebastián, Rentería, Bera de Bidasoa) y en
Francia (zona Pays Basque/Côte Basque: Hendaye, Urrugne, Saint-Jean-de-Luz, Bayonne).

**Lagunas conocidas (sin dato de zona fiable, solo nacional o con menos fuentes de las deseables):** tejados/cubiertas
tiene ya buen dato **nacional** en ambos países (CYPE en España, ALTA; prix-pose.com en Francia, ALTA — segunda
fuente añadida 2026-08-05) y dato de zona directo para tres localidades (Donostia, Irún, Bayonne, MEDIA), pero la
segunda fuente francesa **amplió la dispersión en vez de resolverla**: zinc, tuiles y ardoise muestran ahora
discrepancias altas entre fuentes ALTA y MEDIA — ver nota de la familia TEC. Carpintería general (CAR) sigue sin
ningún dato de zona, solo nacional con ajuste porcentual. Punto de agua/electricidad con desglose muy fino por tipo
de punto en Francia (se documentó con rango amplio), y para Irún/Hondarídabia específicamente hay menos datos
publicados que para Donostia/Bayonne — se usa el dato de Donostia/Bayonne como techo de zona y el nacional+ajuste
como base para esas poblaciones más pequeñas.

**Ajuste de zona aplicado:** cuando la fuente da solo media nacional, se aplica una horquilla de ajuste de zona:
- **España (Gipuzkoa/Costa Vasca):** +15% a +30% sobre la media nacional para Irún/Hondarribia/Rentería/Bera de
  Bidasoa (zona cara pero no capital), y hasta +80-100% específicamente en Donostia-San Sebastián centro (dato
  encontrado directamente, no extrapolado — ver family REF).
- **Francia (Pays Basque/Côte Basque):** +15% a +25% sobre la media nacional (zona con precios inmobiliarios entre
  los más altos de Francia, coherente con el ±15% de ajuste regional que ya aplican varias fuentes francesas para
  Île-de-France, aquí en sentido más moderado).

Todas las cifras se registran **sin IVA/HT** (base imponible) salvo que se indique lo contrario en la columna Notas
de cada fila; cuando la fuente original no aclaraba si el precio incluía impuestos, se ha asumido que es el precio
"de mercado" tal cual publicado y se anota la duda.

---

## REF — Reforma integral / vivienda completa

| Partida | Unidad | Mín | Medio | Máx | País/Zona | Fuente | Fecha | Fiabilidad |
|---|---|---|---|---|---|---|---|---|
| Reforma integral, calidad media (nacional) | €/m² | 450 | 575 | 700 | España, nacional | [CYPE / arquality.es](https://arquality.es/guia-de-precios-de-reformas-integrales-en-espana-2026/) | 2026-07-25 | ALTA |
| Reforma integral, calidad alta/premium (nacional) | €/m² | 700 | 800 | 900+ | España, nacional | [arquality.es](https://arquality.es/guia-de-precios-de-reformas-integrales-en-espana-2026/) | 2026-07-25 | ALTA |
| Reforma integral, rango amplio todas calidades (nacional) | €/m² | 500 | — | 1.500 | España, nacional | [preciom2.com](https://preciom2.com/guias/reformas-presupuesto/) | 2026-07-25 | MEDIA |
| Reforma integral Gipuzkoa (Irún/zona, no capital) | €/m² | 448 | 530 | 617 | España, Gipuzkoa (zona, no Donostia centro) | [planreforma.com / cronoshare.com Gipuzkoa](https://planreforma.com/reformas-integrales-guipuzcoa-irun/) | 2026-07-25 | MEDIA |
| Reforma integral Donostia-San Sebastián centro | €/m² | 950 | 1.125 | 1.300 | España, Donostia centro | [eisenmanndesign.com](https://eisenmanndesign.com/cuanto-cuesta-una-reforma-de-media-en-donostia-san-sebastian/) | 2026-07-25 | MEDIA |
| Rénovation "rafraîchissement" (pintura/suelos ligero) | €/m² HT | 200 | 325 | 450 | Francia, nacional | [renovation-artisan.com](https://www.renovation-artisan.com/prix-dune-renovation-au-m2/) | 2026-07-25 | ALTA |
| Rénovation moyenne (baños/electricidad incluidos) | €/m² HT | 700 | 950 | 1.200 | Francia, nacional (FFB observatoire) | [FFB / renovation-artisan.com](https://www.renovation-artisan.com/prix-dune-renovation-au-m2/) | 2026-07-25 | ALTA |
| Rénovation complète, tous corps d'état | €/m² HT | 1.200 | 1.600 | 2.000 | Francia, nacional | [adora-economie.fr](https://adora-economie.fr/prix-renovation-m2-2026.html) | 2026-07-25 | MEDIA |
| Rénovation Pays Basque — rafraîchissement simple | €/m² HT | 120 | 220 | 320 | Francia, Hendaye/Côte Basque | [cout-renovation-interieure.fr](https://www.cout-renovation-interieure.fr/renovation-interieure/hendaye-64700) | 2026-07-25 | MEDIA — ⚠ dato bajo respecto a la media nacional de rafraîchissement, posible alcance de obra distinto entre fuentes |
| Rénovation globale (excl. cuisine/SdB) | €/m² HT | — | — | 600 (máx) | Francia, Hendaye/Côte Basque | [cout-renovation-interieure.fr](https://www.cout-renovation-interieure.fr/renovation-interieure/hendaye-64700) | 2026-07-25 | MEDIA |

**Nota de zona REF:** el dato de zona en Francia es más flojo que el de Donostia en España (solo una fuente, con
alcance de obra ambiguo) — al calibrar tarifas conviene apoyarse más en el ajuste porcentual (+15-25%) sobre la
media nacional francesa que en esta cifra concreta.

## DEM — Demolición y albañilería

| Partida | Unidad | Mín | Medio | Máx | País/Zona | Fuente | Fecha | Fiabilidad |
|---|---|---|---|---|---|---|---|---|
| Demolición tabique placas yeso laminado (pladur) | €/m² | 6,89 | 6,89 | 6,89 | España, nacional (CYPE) | [generadordeprecios.info](https://generadordeprecios.info/obra_nueva/Demoliciones/Particiones/DPS_Tabiqueria_de_entramado_autopo/DPS010_Demolicion_de_tabique_de_placas_de_.html) | 2026-07-25 | ALTA |
| Demolición partición fábrica revestida (ladrillo hueco) | €/m² | 5,38 | 5,38 | 5,38 | España, nacional (CYPE) | [generadordeprecios.info](https://www.generadordeprecios.info/obra_nueva/Demoliciones/Particiones/Tabiqueria_de_fabrica/DPT020_Demolicion_de_particion_interior_de.html) | 2026-07-25 | ALTA |
| Demolición partición fábrica vista (ladrillo perforado) | €/m² | 9,82 | 9,82 | 9,82 | España, nacional (CYPE) | [generadordeprecios.info](https://www.generadordeprecios.info/obra_nueva/Demoliciones/Particiones/Tabiqueria_de_fabrica/DPT010_Demolicion_de_particion_interior_de.html) | 2026-07-25 | ALTA |
| Demolición de alicatado (con base soporte) | €/m² | 9 | 11 | 12 | España, nacional | [carm.generadordeprecios.info](http://carm.generadordeprecios.info/obra_nueva/Demoliciones/Revestimientos/Alicatados/Demolicion_de_alicatado.html) | 2026-07-25 | ALTA |
| Démolition cloison | €/m² HT | 3 | 6 | 11 | Francia, nacional | [travaux-maconnerie.fr](https://www.travaux-maconnerie.fr/demolition/prix-demolition-cloison-au-m2) | 2026-07-25 | MEDIA |
| — con ajuste de zona Gipuzkoa (+20%) | €/m² | 6,5 | 8,3 | 14,4 | España, Irún/Hondarribia/Donostia (estimado) | ajuste sobre filas CYPE de arriba | 2026-07-25 | MEDIA (ajuste propio, no fuente directa) |
| — con ajuste de zona Pays Basque (+20%) | €/m² HT | 3,6 | 7,2 | 13,2 | Francia, Hendaye/Bayonne (estimado) | ajuste sobre travaux-maconnerie.fr | 2026-07-25 | MEDIA (ajuste propio) |

## BAN — Reforma de baño

| Partida | Unidad | Mín | Medio | Máx | País/Zona | Fuente | Fecha | Fiabilidad |
|---|---|---|---|---|---|---|---|---|
| Reforma baño completo, gama media (nacional) | €/m² | 900 | 1.350 | 1.800 | España, nacional | [guiareformas.es](https://guiareformas.es/reformas/bano/precio-m2/) | 2026-07-25 | ALTA |
| Reforma baño completo, rango amplio (nacional) | €/m² | 700 | — | 2.900 | España, nacional | [verto5.com](https://verto5.com/presupuestos/costos-de-renovacion-de-banos-precios-actualizados-para-2026/) | 2026-07-25 | MEDIA |
| Baño estándar 4-6 m², total (nacional) | € total | 5.000 | 6.500 | 8.500 | España, nacional | [lebenproyectos.es](https://www.lebenproyectos.es/presupuestos/cuanto-cuesta-reformar-un-bano-2026/) | 2026-07-25 | ALTA |
| Baño en Gipuzkoa (Irún/Hondarribia/Donostia), 3-10 m² | € total | 2.000 | — | 8.000 | España, Gipuzkoa | [ordonezrenov.com / eraiteksoluciones.com — vía búsqueda de zona](https://eraiteksoluciones.com/reforma-integral-banos-gipuzkoa/) | 2026-07-25 | BAJA — rango muy amplio, poco desglosado por fuente de zona |
| Rénovation SdB complète, pose incluse | €/m² HT | 900 | 1.400 | 2.000 | Francia, nacional | [needhelp.com](https://www.needhelp.com/content/article/prix-renovation-salle-de-bain) | 2026-07-25 | ALTA |
| SdB 5 m², total, milieu de gamme | € total HT | 6.000 | 7.000 | 8.000 | Francia, nacional | [architecteo.com](https://architecteo.com/prix-renovation-salle-de-bains.html) | 2026-07-25 | ALTA |
| SdB petite (<4 m²), total | € total HT | 3.500 | — | 8.000 | Francia, nacional | [lecoinrenov.fr](https://lecoinrenov.fr/guide-prix/prix-renovation-salle-de-bain) | 2026-07-25 | MEDIA |
| Main d'œuvre plomberie/SdB (tarif horaire) | €/h HT | 45 | 62 | 80 | Francia, nacional (+20-30% en zone chère) | [france-accessoires-piscines.fr](https://www.france-accessoires-piscines.fr/prix-renov-sdb/) | 2026-07-25 | ALTA |

**Nota BAN:** aplicar el ajuste de zona (+15-30% España / +15-25% Francia) sobre las filas nacionales "ALTA" da un
rango de zona más fiable que el dato directo de Gipuzkoa encontrado (BAJA, poco desglosado): baño completo gama
media en Irún/Hondarribia/Donostia ≈ **1.550–1.750 €/m²**; en Hendaye/Côte Basque ≈ **1.600–1.750 €/m² HT**.

## COC — Reforma de cocina

| Partida | Unidad | Mín | Medio | Máx | País/Zona | Fuente | Fecha | Fiabilidad |
|---|---|---|---|---|---|---|---|---|
| Reforma cocina, calidad media (nacional) | €/m² | 800 | 950 | 1.100 | España, nacional | [gelsecocinas.com / eggo.es](https://eggo.es/inspiracion/guia-completa-cuanto-cuesta-reformar-una-cocina/) | 2026-07-25 | ALTA |
| Reforma cocina, calidad alta (nacional) | €/m² | 1.200 | 1.500 | 1.800 | España, nacional | [eggo.es](https://eggo.es/inspiracion/guia-completa-cuanto-cuesta-reformar-una-cocina/) | 2026-07-25 | ALTA |
| Cocina 10 m² completa, total (nacional) | € total | 6.500 | 8.500 | 12.000 | España, nacional | [motordepresupuestos.com](https://motordepresupuestos.com/reforma/cocina) | 2026-07-25 | ALTA |
| Cocina Madrid/Barcelona (+15-20% vs nacional) | €/m² | 920 | 1.100 | 1.320 | España, grandes ciudades (referencia de ajuste urbano) | [stanireformas.com](https://stanireformas.com/reformas/cocinas/cuanto-cuesta-reformar-cocina-madrid/) | 2026-07-25 | MEDIA |
| Cuisine équipée, pose incluse | €/m² HT | 350 | — | 2.000 | Francia, nacional | [btobjob.com](https://btobjob.com/blog/prix-cuisine-equipee-2026-350-a-2-000-m2-pose-incluse) | 2026-07-25 | MEDIA |
| Cuisine standard 8-12 m², total | € total HT | 5.500 | 10.000 | 15.000 | Francia, nacional | [co-building.fr](https://www.co-building.fr/renovation-cuisine-prix-etapes-duree-2026) | 2026-07-25 | ALTA |
| Cuisine, budget moyen toutes gammes | € total HT | — | 9.400 | — | Francia, nacional | [zenoa.fr](https://zenoa.fr/renovation-travaux/renovation-cuisine-prix-2026/) | 2026-07-25 | ALTA |
| Cuisine Donostia (zona, referencia) | € total | 2.000 | — | 15.000 | España, Donostia | [búsqueda de zona Gipuzkoa](https://www.vipreformas.es/reformas/reforma-de-bano/guipuzcoa/) | 2026-07-25 | BAJA — rango muy amplio, poco desglosado |

**Nota COC:** igual que en baños, para calibrar tarifas de zona es más fiable partir de la media nacional ALTA y
aplicar el ajuste de zona que el dato directo de zona (BAJA aquí). Cocina completa gama media en Irún/Hondarribia/
Donostia ≈ **1.100–1.240 €/m²**; en Hendaye/Côte Basque, sin dato de zona específico, usar +15-25% sobre el
rango nacional francés como estimación provisional.

## ALI — Alicatado y solado (colocación de baldosa/azulejo)

| Partida | Unidad | Mín | Medio | Máx | País/Zona | Fuente | Fecha | Fiabilidad |
|---|---|---|---|---|---|---|---|---|
| Suelo/pared cerámico, material | €/m² | 7 | 15 | 20 | España, nacional | [cronoshare.com](https://www.cronoshare.com/cuanto-cuesta/cambiar-suelo-casa) | 2026-07-25 | MEDIA |
| Suelo cerámico, material (rango amplio) | €/m² | 15 | — | 60 | España, nacional | [cronoshare.com](https://www.cronoshare.com/cuanto-cuesta/cambiar-suelo-casa) | 2026-07-25 | BAJA |
| Pose carrelage, main d'œuvre sola | €/m² HT | 25 | 42 | 60 | Francia, nacional | [hemea.com](https://www.hemea.com/fr/renovation/revetement-sol/carrelage/prix) | 2026-07-25 | ALTA |
| Pose carrelage, fourniture + pose | €/m² HT | 60 | 125 | 190 | Francia, nacional | [hemea.com](https://www.hemea.com/fr/renovation/revetement-sol/carrelage/prix) | 2026-07-25 | ALTA |
| Pose carrelage 60x60, posé | €/m² HT | 60 | 95 | 130 | Francia, nacional | [angelino-carrelages.com](https://angelino-carrelages.com/pose-et-technique/tarif-pose-carrelage-m2/) | 2026-07-25 | MEDIA |

## SOL — Suelos (parquet / laminado)

| Partida | Unidad | Mín | Medio | Máx | País/Zona | Fuente | Fecha | Fiabilidad |
|---|---|---|---|---|---|---|---|---|
| Suelo laminado, instalado (material+mano) | €/m² | 20 | 30 | 40 | España, nacional | [cronoshare.com](https://www.cronoshare.com/cuanto-cuesta/suelo-laminado) | 2026-07-25 | ALTA |
| Suelo laminado, mano de obra sola | €/m² | 5 | 10 | 15 | España, nacional | [cronoshare.com](https://www.cronoshare.com/cuanto-cuesta/suelo-laminado) | 2026-07-25 | MEDIA |
| Parquet madera, material | €/m² | 30 | 55 | 80 | España, nacional | [pavidisseny.com](https://pavidisseny.com/blog/cuanto-cuesta-poner-parquet-precio-m2) | 2026-07-25 | ALTA |
| Parquet, instalación | €/m² | 10 | 15 | 50 | España, nacional | [pavidisseny.com](https://pavidisseny.com/blog/cuanto-cuesta-poner-parquet-precio-m2) | 2026-07-25 | MEDIA |
| Parquet laminado (sintético), instalado | €/m² | 35 | 42 | 50 | España, nacional | [cambiamostusuelo.es](https://cambiamostusuelo.es/precio-poner-parquet/) | 2026-07-25 | MEDIA |
| Parquet stratifié, pose comprise (économique) | €/m² HT | 20 | 32 | 45 | Francia, nacional | [monsieurpeinture.com](https://www.monsieurpeinture.com/parquet-stratifie-pose-cout/) | 2026-07-25 | ALTA |
| Parquet massif, fourniture + pose | €/m² HT | 30 | 90 | 150 | Francia, nacional | [prix-travaux-m2.com](https://www.prix-travaux-m2.com/prix-parquet.php) | 2026-07-25 | MEDIA |
| Pose parquet, main d'œuvre sola | €/m² HT | 20 | 37 | 55 | Francia, nacional | [hemea.com](https://www.hemea.com/fr/renovation/revetement-sol/parquet/prix) | 2026-07-25 | ALTA |

## FAC — Fachadas / SATE / ITE

| Partida | Unidad | Mín | Medio | Máx | País/Zona | Fuente | Fecha | Fiabilidad |
|---|---|---|---|---|---|---|---|---|
| SATE (EPS 4cm a lana mineral), material+mano | €/m² | 60 | 90 | 150 | España, nacional | [humedades.com](https://humedades.com/guia-precios/aislamiento/sate-precio-m2/) | 2026-07-25 | ALTA |
| SATE, rango amplio con andamios | €/m² | 65 | — | 220 | España, nacional | [humedades.com](https://humedades.com/guia-precios/aislamiento/aislamiento-fachada/) | 2026-07-25 | MEDIA |
| ITE (sous enduit), pose comprise | €/m² HT | 120 | 170 | 220 | Francia, nacional | [laprimeenergie.fr](https://www.laprimeenergie.fr/les-travaux/lisolation-des-murs-par-lexterieur/prix) | 2026-07-25 | ALTA |
| ITE (sous bardage), pose comprise | €/m² HT | 180 | 225 | 270 | Francia, nacional | [laprimeenergie.fr](https://www.laprimeenergie.fr/les-travaux/lisolation-des-murs-par-lexterieur/prix) | 2026-07-25 | ALTA |
| ITE, media todos los materiales | €/m² HT | — | 190 | — | Francia, nacional | [dsdrenov.com](https://www.dsdrenov.com/ravalement-de-facade/isolation-thermique-exterieur/prix-isolation-exterieur/) | 2026-07-25 | ALTA |
| Ravalement façade Bayonne/Anglet | €/m² TTC | 45 | 72 | 100 | Francia, Bayonne/Anglet (zona) | [façades-basques.vertikal.fr](https://facades-basques.vertikal.fr/dossiers-expert/budget-ravalement-facade-pays-basque-2026/) | 2026-07-25 | MEDIA |
| Ravalement façade Biarritz | €/m² TTC | 35 | 67 | 100 | Francia, Biarritz (zona) | [façades-basques.vertikal.fr](https://facades-basques.vertikal.fr/dossiers-expert/budget-ravalement-facade-pays-basque-2026/) | 2026-07-25 | MEDIA |

## TEC — Techos (falso techo / cubiertas)

| Partida | Unidad | Mín | Medio | Máx | País/Zona | Fuente | Fecha | Fiabilidad |
|---|---|---|---|---|---|---|---|---|
| Falso techo pladur, registrable 60x60 | €/m² | 20 | 30 | 45 | España, nacional | [preciom2.com](https://preciom2.com/guias/pladur/falso-techo-pladur/) | 2026-07-25 | ALTA |
| Falso techo pladur, continuo con aislamiento | €/m² | 30 | 45 | 90 | España, nacional (curvos/LED indirecto hasta 90) | [preciom2.com](https://preciom2.com/guias/pladur/falso-techo-pladur/) | 2026-07-25 | ALTA |
| Cubierta inclinada de tejas cerámicas, completa (estructura+cobertura) | €/m² | 166,91 | 166,91 | 166,91 | España, nacional (CYPE) | [generadordeprecios.info](https://www.generadordeprecios.info/obra_nueva/Cubiertas/Inclinadas/Tejados/Cubierta_inclinada_de_tejas.html) | 2026-07-25 | ALTA |
| Cobertura de tejas cerámicas (solo cobertura, sin estructura) | €/m² | 55,20 | 55,20 | 55,20 | España, nacional (CYPE) | [generadordeprecios.info](https://www.generadordeprecios.info/obra_nueva/Cubiertas/QU_Componentes_de_cubiertas_incli/De_tejas_ceramicas/Cobertura_de_tejas_ceramicas.html) | 2026-07-25 | ALTA |
| — con ajuste de zona Gipuzkoa (+20%), cubierta completa de tejas | €/m² | 200 | 200 | 200 | España, Irún/Hondarribia/Donostia (estimado) | ajuste sobre fila CYPE de arriba | 2026-07-25 | MEDIA (ajuste propio, no fuente directa) |
| Impermeabilización cubierta plana | €/m² | 15 | 35 | 90 | España, nacional | [humedades.com](https://humedades.com/guia-precios/impermeabilizacion/impermeabilizar-cubierta/) | 2026-07-25 | ALTA |
| Impermeabilización cubierta inclinada, bajo teja (técnicamente correcta, durable 20-50 años) | €/m² | 30 | 40 | 65 | España, nacional | [humedades.com](https://humedades.com/guia-precios/tejados/impermeabilizar-tejado/) | 2026-07-25 | ALTA |
| Impermeabilización cubierta inclinada, sobre teja (temporal, 5-10 años) | €/m² | 15 | 25 | 45 | España, nacional | [humedades.com](https://humedades.com/guia-precios/tejados/impermeabilizar-tejado/) | 2026-07-25 | ALTA |
| Lámina asfáltica bajo teja, solo componente material+colocación (CYPE) | €/m² | 13,69 | 13,69 | 13,69 | España, nacional (CYPE) | [generadordeprecios.info](https://www.generadordeprecios.info/obra_nueva/Aislamientos_e_impermeabilizaciones/Impermeabilizaciones/Cubiertas_inclinadas/NIN010_Impermeabilizacion_de_cubiertas_inc.html) | 2026-07-25 | ALTA |
| Faux plafond placo standard, fourniture+pose | €/m² HT | 30 | 45 | 60 | Francia, nacional | [travaux.com](https://www.travaux.com/platre/guide-des-prix/prix-dun-faux-plafond-au-m2) | 2026-07-25 | ALTA |
| Faux plafond tendu | €/m² HT | 50 | 70 | 90 | Francia, nacional | [abctravaux.org](https://abctravaux.org/prix-pose-faux-plafond/) | 2026-07-25 | MEDIA |
| Faux plafond acoustique | €/m² HT | 60 | 90 | 120 | Francia, nacional | [abctravaux.org](https://abctravaux.org/prix-pose-faux-plafond/) | 2026-07-25 | MEDIA |
| Tuile canal (matériau dominant en Pays Basque, confirmado por couvreurs de zona), pose neuve, matériau seul | €/m² HT | 35 | 35 | 35 | Francia, nacional | [helloartisan.com](https://www.helloartisan.com/guide-prix-travaux/tarif-toiture-m2) | 2026-07-25 | MEDIA |
| Toiture tuiles plates, pose neuve, matériau seul | €/m² HT | 65 | 70 | 75 | Francia, nacional | [helloartisan.com](https://www.helloartisan.com/guide-prix-travaux/tarif-toiture-m2) | 2026-07-25 | MEDIA |
| Toiture tuiles, rénovation légère (remplacement tuiles) | €/m² HT | 30 | 50 | 70 | Francia, nacional | [helloartisan.com](https://www.helloartisan.com/guide-prix-travaux/tarif-toiture-m2) | 2026-07-25 | MEDIA |
| Toiture tuiles, rénovation complète | €/m² HT | 70 | 100 | 130 | Francia, nacional | [helloartisan.com](https://www.helloartisan.com/guide-prix-travaux/tarif-toiture-m2) | 2026-07-25 | MEDIA |
| Toiture traditionnelle complète avec charpente (structure+couverture) | €/m² HT | 180 | 215 | 250 | Francia, nacional | [helloartisan.com](https://www.helloartisan.com/guide-prix-travaux/tarif-toiture-m2) | 2026-07-25 | MEDIA |
| Couverture seule (sans charpente) | €/m² HT | 55 | 60 | 65 | Francia, nacional | [helloartisan.com](https://www.helloartisan.com/guide-prix-travaux/tarif-toiture-m2) | 2026-07-25 | MEDIA |
| Ardoise synthétique, pose neuve | €/m² HT | 50 | 65 | 80 | Francia, nacional | [helloartisan.com](https://www.helloartisan.com/guide-prix-travaux/tarif-toiture-m2) | 2026-07-25 | MEDIA |
| Ardoise naturelle, pose neuve | €/m² HT | 100 | 125 | 150 | Francia, nacional | [helloartisan.com](https://www.helloartisan.com/guide-prix-travaux/tarif-toiture-m2) | 2026-07-25 | MEDIA |
| ⚠ Toiture zinc, pose seule hors matériau (DISPERSIÓN ALTA — fuentes van de 60 a 120€/m² pose, y de 260 a 360€/m² todo incluido) | €/m² | 60 | 90 | 120 | Francia, nacional | [renovationettravaux.fr](https://www.renovationettravaux.fr/prix-toiture-zinc-m2-tarifs-devis) | 2026-07-25 | MEDIA — ⚠ dispersión alta entre fuentes, ver nota TEC |
| Toiture zinc, rénovation complète tous frais compris | €/m² | 260 | 310 | 360 | Francia, nacional | [renovationettravaux.fr](https://www.renovationettravaux.fr/prix-toiture-zinc-m2-tarifs-devis) | 2026-07-25 | MEDIA |
| Étanchéité toit terrasse (impermeabilización plana), promedio todos sistemas | €/m² TTC | 37 | 49 | 80 | Francia, nacional | [prix-pose.com](https://www.prix-pose.com/etancheite-toit-terrasse) | 2026-07-25 | ALTA |
| Toiture zinc, joint debout, fourniture+pose | €/m² TTC | 155 | 217 | 280 | Francia, nacional | [prix-pose.com](https://www.prix-pose.com/toiture-zinc) | 2026-08-05 | ALTA |
| Toiture zinc, sur tasseaux, fourniture+pose | €/m² TTC | 170 | 237 | 305 | Francia, nacional | [prix-pose.com](https://www.prix-pose.com/toiture-zinc) | 2026-08-05 | ALTA |
| Toiture zinc, en gradins, fourniture+pose | €/m² TTC | 185 | 257 | 330 | Francia, nacional | [prix-pose.com](https://www.prix-pose.com/toiture-zinc) | 2026-08-05 | ALTA |
| Toiture zinc, pose seule según técnica (rango combinado) | €/m² TTC | 80 | — | 210 | Francia, nacional | [prix-pose.com](https://www.prix-pose.com/toiture-zinc) | 2026-08-05 | ALTA |
| ⚠ Toiture tuile canal, fourniture+pose (DISPERSIÓN ALTA vs. guide-toiture.com y helloartisan, ver nota) | €/m² TTC | 120 | 160 | 200 | Francia, nacional | [prix-pose.com](https://www.prix-pose.com/toiture-tuiles) | 2026-08-05 | ALTA |
| Toiture tuile romane, fourniture+pose | €/m² TTC | 120 | 165 | 210 | Francia, nacional | [prix-pose.com](https://www.prix-pose.com/toiture-tuiles) | 2026-08-05 | ALTA |
| Toiture tuile plate, fourniture+pose | €/m² TTC | 175 | 280 | 385 | Francia, nacional | [prix-pose.com](https://www.prix-pose.com/toiture-tuiles) | 2026-08-05 | ALTA |
| ⚠ Toiture ardoise naturelle, fourniture+pose (DISPERSIÓN ALTA vs. helloartisan, ver nota) | €/m² TTC | 190 | 230 | 270 | Francia, nacional | [prix-pose.com](https://www.prix-pose.com/toiture-ardoise) | 2026-08-05 | ALTA |
| Toiture ardoise synthétique, fourniture+pose | €/m² TTC | 140 | 170 | 200 | Francia, nacional | [prix-pose.com](https://www.prix-pose.com/toiture-ardoise) | 2026-08-05 | ALTA |
| Tuile/ardoise/zinc, segunda fuente de contraste (sin metodología citada — tuile terre cuite 40-70-100, ardoise nat. 80-130-180, ardoise synt. 35-57-80, zinc 70-110-150) | €/m² TTC | — | — | — | Francia, nacional | [guide-toiture.com](https://www.guide-toiture.com/prix-couverture-toiture/) | 2026-08-05 | MEDIA |
| Cubierta inclinada, zona Donostia (competidor directo) — ⚠ contradice el ajuste nacional+zona de arriba, ver nota | €/m² | 80 | 100 | 120 | España, Donostia (zona) | [tejadosansebastian.com](https://www.tejadosansebastian.com/construccion-de-tejados-y-cubiertas) | 2026-08-05 | MEDIA |
| Cubierta plana, zona Donostia (competidor directo) | €/m² | 50 | 63 | 80 | España, Donostia (zona) | [tejadosansebastian.com](https://www.tejadosansebastian.com/construccion-de-tejados-y-cubiertas) | 2026-08-05 | MEDIA |
| Retejado/proyectos de tejado, zona Irún (totales de proyecto, sin desglose €/m² útil) | € total | 4.000 | — | 20.000 | España, Irún (zona) | [tejadosirun.com](https://www.tejadosirun.com/construccion-de-cubiertas-y-tejados) | 2026-08-05 | BAJA |
| Toiture neuve (charpente existente + couverture tuile/ardoise + zinguerie), zona Bayonne (competidor directo) | €/m² TTC | 80 | 115 | 150 | Francia, Bayonne/Pays Basque (zona) | [couvreur-bayonne.fr](https://couvreur-bayonne.fr/) | 2026-08-05 | MEDIA |

**Nota TEC — tejados/cubiertas:** en España, CYPE da precios nacionales sólidos (ALTA) tanto para cubierta completa
de tejas como para impermeabilización, plana e inclinada — con ajuste de zona (+15-30%), cubierta completa de tejas
en Irún/Hondarribia/Donostia ≈ **190-220 €/m²**. Ampliación 2026-08-05: se encontró dato de zona directo de
competidores en Donostia, Irún y Bayonne (MEDIA, ver filas de arriba) — el de Donostia (80-120€/m² cubierta
inclinada) es **más bajo** que el ajuste nacional+zona ya calculado (190-220€/m²), probablemente por ser precio de
escaparate sin desglosar alcance; tratarlo como banda mínima adicional a vigilar, no como sustituto del ajuste
nacional. En Francia, se buscó una segunda fuente ALTA para toiture/tuiles/ardoise (prix-pose.com) para confirmar o
desmentir la dispersión ya detectada en zinc — el resultado es que **la dispersión no se resolvió, se amplió**:
ahora tuiles y ardoise también muestran dispersión alta entre fuentes (prix-pose.com ALTA da cifras bastante más
altas que helloartisan.com y guide-toiture.com, ambas MEDIA), no solo zinc. La tuile canal sigue confirmada como
material dominante de la zona (couvreurs de Bayonne/Côte Basque la mencionan explícitamente), pero con el precio
en disputa entre fuentes. El zinc sigue en `docs/tarifas-referencia.md` como "sin fijar / presupuestar caso a caso"
— con esta ampliación hay aún más motivo para no fijar un precio único ahí, y lo mismo aplicaría a tuiles/ardoise
si se calibra esa partida en el futuro.

## PIN — Pintura

| Partida | Unidad | Mín | Medio | Máx | País/Zona | Fuente | Fecha | Fiabilidad |
|---|---|---|---|---|---|---|---|---|
| Pintura interior estándar | €/m² | 6 | 13 | 20 | España, nacional | [pintorgo.es](https://pintorgo.es/blog/tabla-de-precios-de-trabajos-de-pintura-2026-guia-completa-de-tarifas-en-espana) | 2026-07-25 | ALTA |
| Pintura interior (piso completo) | €/m² | 5 | 10 | 15 | España, nacional | [reformatch.es](https://reformatch.es/presupuestos/pintar-piso/) | 2026-07-25 | MEDIA |
| Pintura fachada exterior | €/m² | 8 | 15 | 35 | España, nacional (según tipo pintura y andamio) | [humedades.com](https://humedades.com/guia-precios/pintores/precio-pintar-fachada/) | 2026-07-25 | ALTA |
| Coste andamio (adicional, no incluido arriba) | €/semana | 150 | 325 | 500 | España, nacional | [humedades.com](https://humedades.com/guia-precios/pintores/precio-pintar-fachada/) | 2026-07-25 | MEDIA |
| Peinture intérieure, mur en bon état | €/m² HT | 20 | 20 | 20 | Francia, nacional (mínimo, lessivage) | [lamaisonsaintgobain.fr](https://www.lamaisonsaintgobain.fr/guides-travaux/amenagement-interieur/prix-peinture-au-m2) | 2026-07-25 | ALTA |
| Peinture intérieure, support à reboucher | €/m² HT | 20 | 35 | 50 | Francia, nacional | [lamaisonsaintgobain.fr](https://www.lamaisonsaintgobain.fr/guides-travaux/amenagement-interieur/prix-peinture-au-m2) | 2026-07-25 | ALTA |
| Peinture façade, simple mise en peinture | €/m² TTC | 15 | 20 | 25 | Francia, nacional | [espace-construction.net](https://www.espace-construction.net/prix-dun-ravalement-de-facade-au-m%C2%B2-en-2026-vrais-tarifs-exemples-et-aides/) | 2026-07-25 | ALTA |
| Peinture façade + préparation support | €/m² TTC | 30 | 65 | 100 | Francia, nacional | [espace-construction.net](https://www.espace-construction.net/prix-dun-ravalement-de-facade-au-m%C2%B2-en-2026-vrais-tarifs-exemples-et-aides/) | 2026-07-25 | ALTA |
| Peinture/ravalement complet, tout compris | €/m² TTC | 90 | 100 | 130 | Francia, nacional | [espace-construction.net](https://www.espace-construction.net/prix-dun-ravalement-de-facade-au-m%C2%B2-en-2026-vrais-tarifs-exemples-et-aides/) | 2026-07-25 | ALTA |

## CAR — Carpintería general (puertas, armarios, mobiliario de cocina)

| Partida | Unidad | Mín | Medio | Máx | País/Zona | Fuente | Fecha | Fiabilidad |
|---|---|---|---|---|---|---|---|---|
| Puerta interior abatible de madera, instalada (material+mano) | €/ud | 252,54 | 252,54 | 252,54 | España, nacional (CYPE) | [generadordeprecios.info](https://generadordeprecios.info/obra_nueva/L_Carpinteria__cerrajeria__vidrios_y_/Puertas_interiores/De_madera/Puerta_interior_abatible__de_madera.html) | 2026-08-05 | ALTA |
| Puerta interior corredera de madera, instalada | €/ud | 254,05 | 254,05 | 254,05 | España, nacional (CYPE) | [generadordeprecios.info](https://generadordeprecios.info/obra_nueva/L_Carpinteria__cerrajeria__vidrios_y_/Puertas_interiores/De_madera/Puerta_interior_corredera__de_madera.html) | 2026-08-05 | ALTA |
| Puerta interior de entrada a vivienda (acceso principal), instalada | €/ud | 457,11 | 457,11 | 457,11 | España, nacional (CYPE) | [generadordeprecios.info](https://generadordeprecios.info/obra_nueva/L_Carpinteria__cerrajeria__vidrios_y_/Puertas_de_entrada_a_vivienda/De_madera/LEM010_Puerta_interior_de_entrada_a_vivien.html) | 2026-08-05 | ALTA |
| Puerta interior, solo mano de obra de instalación (oficial 1ª + ayudante, descompuesto CYPE) | €/ud | 44,12 | 44,12 | 44,12 | España, nacional (CYPE) | mismo desglose que fila anterior | 2026-08-05 | ALTA |
| Armario modular prefabricado para empotrar (2 puertas, 250x70x60cm, melamina) | €/ud | 344,23 | 344,23 | 344,23 | España, nacional (CYPE) | [generadordeprecios.info](https://www.generadordeprecios.info/obra_nueva/L_Carpinteria__cerrajeria__vidrios_y_/Armarios/Modulares__de_madera/LAF010_Armario_modular_prefabricado__para_.html) | 2026-08-05 | ALTA |
| Forrado interior de armario empotrado (aglomerado+melamina, sin puertas) | €/m² | 28,98 | 28,98 | 28,98 | España, nacional (CYPE) | [generadordeprecios.info](https://www.generadordeprecios.info/obra_nueva/L_Carpinteria__cerrajeria__vidrios_y_/Armarios/Forrados_interiores/LAR010_Forrado_interior_de_armario_empotra.html) | 2026-08-05 | ALTA |
| Armario empotrado a medida, completo (total proyecto) | € total | 700 | 1.400 | 2.200 | España, nacional | [cronoshare.com](https://www.cronoshare.com/cuanto-cuesta/armarios-empotrados-medida) / [habitissimo.es](https://www.habitissimo.es/presupuestos/hacer-armario-empotrado-interior) | 2026-08-05 | BAJA — portal de leads, usar solo como suelo del rango |
| Armario empotrado a medida (competidor directo, 250x150x60cm) | € total | 999 | 999 | 999 | España, Madrid (fuera de zona, referencia de escaparate) | [armariosalcala.com](https://armariosalcala.com/precio-armario-a-medida-empotrado-2026-999eur-250x150x60cm/) | 2026-08-05 | MEDIA — competidor directo, no lead portal, pero fuera de zona |
| Mobiliario completo cocina, gama económica (frente laminado, 7ml: 3,5 bajos+3,5 altos), material+montaje | €/ud | 1.197,34 | 1.197,34 | 1.197,34 | España, nacional (CYPE) | [generadordeprecios.info](https://generadordeprecios.info/rehabilitacion/Senalizacion_y_equipamiento/Cocinas_galerias/Muebles/SCM020_Mobiliario_completo_en_cocina_con_f.html) | 2026-08-05 | ALTA |
| Mobiliario completo cocina, gama media/lacada (mismos 7ml), material+montaje | €/ud | 4.097,80 | 4.097,80 | 4.097,80 | España, nacional (CYPE) | [generadordeprecios.info](https://generadordeprecios.info/rehabilitacion/Senalizacion_y_equipamiento/Cocinas_galerias/Muebles/SCM022_Mobiliario_completo_en_cocina_con_f.html) | 2026-08-05 | ALTA — dentro, mano de obra sola ≈335,45€ (≈48€/ml) |
| Montaje de mueble de cocina, mano de obra sola | €/ml | 60 | 65 | 70 | España, nacional | [bricomontaje.es](https://bricomontaje.es/blog/social/cuanto-cuesta-instalar-cocina/) (corroborado por cronoshare/habitissimo, BAJA, como suelo) | 2026-08-05 | MEDIA |
| Pose porte intérieure, main d'œuvre seule | €/ud | 60 | 155 | 300 | Francia, nacional | travaux.com / tarifartisan.fr / acompli.fr (agregado, fetch directo de travaux.com bloqueado) | 2026-08-05 | MEDIA |
| Bloc-porte standard, fourniture+pose | €/ud | 250 | 525 | 800 | Francia, nacional | mismas fuentes que fila anterior | 2026-08-05 | MEDIA |
| Placard sur mesure, mélaminé coulissant, fourniture+pose | €/ml | 400 | 550 | 700 | Francia, nacional | [renovbox.fr](https://renovbox.fr/prix/menuiserie/placards-dressing/) | 2026-08-05 | MEDIA |
| Placard sur mesure, MDF laqué/battant, fourniture+pose | €/ml | 600 | 800 | 1.000 | Francia, nacional | [renovbox.fr](https://renovbox.fr/prix/menuiserie/placards-dressing/) | 2026-08-05 | MEDIA |
| Dressing ouvert, fourniture+pose | €/ml | 600 | 900 | 1.200 | Francia, nacional | [renovbox.fr](https://renovbox.fr/prix/menuiserie/placards-dressing/) | 2026-08-05 | MEDIA |
| Dressing fermé avec façades, fourniture+pose | €/ml | 1.200 | 1.850 | 2.500 | Francia, nacional | [renovbox.fr](https://renovbox.fr/prix/menuiserie/placards-dressing/) | 2026-08-05 | MEDIA |
| Pose de placard/dressing, main d'œuvre seule (kit) | €/ml | 150 | 275 | 400 | Francia, nacional | [renovbox.fr](https://renovbox.fr/prix/menuiserie/placards-dressing/) | 2026-08-05 | MEDIA |
| Montage cuisine, main d'œuvre seule | €/h HT | 30 | 35 | 40 | Francia, nacional | [renovationettravaux.fr](https://www.renovationettravaux.fr/prix-montage-cuisine) | 2026-08-05 | MEDIA |
| Pose meuble haut/bas cuisine, à l'unité | €/ud | 30 | 50 | 70 | Francia, nacional | [renovationettravaux.fr](https://www.renovationettravaux.fr/prix-montage-cuisine) | 2026-08-05 | MEDIA |
| Pose cuisine complète, installation seule (hors achat cuisine) | € total | 300 | 650 | 1.000 | Francia, nacional | [renovationettravaux.fr](https://www.renovationettravaux.fr/prix-montage-cuisine) | 2026-08-05 | MEDIA |

**Nota CAR:** sin dato de zona (Gipuzkoa/Pays Basque) para ninguna partida — aplicar el ajuste porcentual estándar
del documento (+15-30% España / +15-25% Francia) hasta que aparezca un dato directo de competidor de zona.

## FON — Fontanería

| Partida | Unidad | Mín | Medio | Máx | País/Zona | Fuente | Fecha | Fiabilidad |
|---|---|---|---|---|---|---|---|---|
| Punto de agua | € | 160 | 220 | 280 | España, nacional | [fontanerocunit.org](https://fontanerocunit.org/cuanto-cobra-un-fontanero-por-punto-de-agua/) | 2026-07-25 | MEDIA |
| Instalación fontanería completa vivienda | € total | 3.000 | 5.500 | 9.000+ | España, nacional | [cronoshare.com](https://www.cronoshare.com/cuanto-cuesta/instalacion-fontaneria-casa) | 2026-07-25 | ALTA |
| Tarifa hora fontanero | €/h | 38 | 45 | 52 | España, nacional | [motordepresupuestos.com](https://motordepresupuestos.com/cuanto-cobra/fontaneros) | 2026-07-25 | ALTA |
| Tarif horaire plombier | €/h HT | 45 | 60 | 75 | Francia, nacional | [needhelp.com](https://www.needhelp.com/content/article/prix-plombier-2026) | 2026-07-25 | ALTA |
| Tarif horaire plombier Île-de-France (referencia de ajuste urbano, no zona propia) | €/h HT | 65 | 72 | 80 | Francia, Île-de-France | [needhelp.com](https://www.needhelp.com/content/article/prix-plombier-2026) | 2026-07-25 | MEDIA |
| Plomberie SdB complète | € total HT | 1.500 | 3.250 | 5.000 | Francia, nacional | [needhelp.com](https://www.needhelp.com/content/article/prix-renovation-salle-de-bain) | 2026-07-25 | ALTA |
| Plomberie cuisine complète | € total HT | 800 | 1.650 | 2.500 | Francia, nacional | [needhelp.com](https://www.needhelp.com/content/article/prix-renovation-salle-de-bain) | 2026-07-25 | ALTA |

## SAN — Sanitarios, mueble y mampara de baño (PVP proveedor Alkain — catálogos Gamma/Roca)

**Naturaleza distinta al resto del documento:** esta familia no es precio de mercado/competencia — es **PVP de
fabricante** tal cual aparece en los catálogos de dos marcas (Gamma y Roca) que distribuye Alkain, el proveedor
de materiales de baño de Reformas Ordoñez. Gabriel ha confirmado que la empresa compra en Alkain a PVP o casi,
así que esta cifra es una base de coste de material razonable, no una estimación. Por eso la columna Fiabilidad
usa una redacción distinta a la del resto de familias (ver más abajo).

Se ha revisado el catálogo Roca "Todo en Baños" 2026 completo además del de Gamma, pero **el texto de Roca no trae
precio explícito en ninguna ficha de producto** (solo color/acabado/medidas — "consultar en Alkain"). Por eso todas
las filas de esta familia usan datos de Gamma; Roca se menciona solo como referencia de nombre de colección donde
aporta contexto de gama (p. ej. Tura, Meridian, Beyond, The Gap, Victoria-N), sin inventar una cifra que el
catálogo no da.

| Partida | Unidad | Mín | Medio | Máx | País/Zona | Fuente | Fecha | Fiabilidad |
|---|---|---|---|---|---|---|---|---|
| Mueble de baño con lavabo, gama económica/estándar | €/ud | 336 | 550 | 950 | España — PVP proveedor Alkain | Catálogo Gamma 2024-2025 (proveedor Alkain) | 2026-08-02 | ALTA (PVP fabricante directo, confirmado por Gabriel que se compra ~a PVP en Alkain) |
| Mueble de baño con lavabo, gama media | €/ud | 900 | 1.350 | 2.000 | España — PVP proveedor Alkain | Catálogo Gamma 2024-2025 (proveedor Alkain) | 2026-08-02 | ALTA (PVP fabricante directo, confirmado por Gabriel que se compra ~a PVP en Alkain) |
| Mueble de baño con lavabo, gama alta/diseño (composiciones tipo Logika/Spirit/Renoir/Geo; ref. cualitativa Roca Tura/Meridian/Beyond, sin precio en catálogo) | €/ud | 2.000 | 3.000 | 4.400 | España — PVP proveedor Alkain | Catálogo Gamma 2024-2025 (proveedor Alkain) | 2026-08-02 | ALTA (PVP fabricante directo, confirmado por Gabriel que se compra ~a PVP en Alkain) |
| Lavabo suelto (sobre encimera o mural, sin mueble) | €/ud | 67 | 180 | 420 | España — PVP proveedor Alkain | Catálogo Gamma 2024-2025 (proveedor Alkain) | 2026-08-02 | ALTA (PVP fabricante directo, confirmado por Gabriel que se compra ~a PVP en Alkain) |
| Grifería de lavabo monomando, gama básica (cromo estándar) | €/ud | 56 | 100 | 190 | España — PVP proveedor Alkain | Catálogo Gamma 2024-2025 (proveedor Alkain) | 2026-08-02 | ALTA (PVP fabricante directo, confirmado por Gabriel que se compra ~a PVP en Alkain) |
| Grifería de lavabo monomando, gama media | €/ud | 150 | 260 | 400 | España — PVP proveedor Alkain | Catálogo Gamma 2024-2025 (proveedor Alkain) | 2026-08-02 | ALTA (PVP fabricante directo, confirmado por Gabriel que se compra ~a PVP en Alkain) |
| Grifería de lavabo monomando, gama diseño/PVD (oro, níquel, grafito o cobre cepillado) | €/ud | 400 | 600 | 900 | España — PVP proveedor Alkain | Catálogo Gamma 2024-2025 (proveedor Alkain) | 2026-08-02 | ALTA (PVP fabricante directo, confirmado por Gabriel que se compra ~a PVP en Alkain) |
| Termostato de ducha, válvula sola (sin conjunto) | €/ud | 119 | 250 | 402 | España — PVP proveedor Alkain | Catálogo Gamma 2024-2025 (proveedor Alkain) | 2026-08-02 | ALTA (PVP fabricante directo, confirmado por Gabriel que se compra ~a PVP en Alkain) |
| Conjunto de ducha empotrado (termostático o monomando, mural + teleducha) | €/ud | 429 | 900 | 2.125 | España — PVP proveedor Alkain | Catálogo Gamma 2024-2025 (proveedor Alkain) | 2026-08-02 | ALTA (PVP fabricante directo, confirmado por Gabriel que se compra ~a PVP en Alkain) |
| Inodoro suspendido, gama estándar/media (sin cisterna/bastidor) | €/ud | 206 | 340 | 473 | España — PVP proveedor Alkain | Catálogo Gamma 2024-2025 (proveedor Alkain) | 2026-08-02 | ALTA (PVP fabricante directo, confirmado por Gabriel que se compra ~a PVP en Alkain) |
| Inodoro suspendido inteligente / Smart Toilet, gama alta (ref. cualitativa Roca In-Wash® Insignia/Vorea/Ona, sin precio en catálogo) | €/ud | 2.977 | 3.089 | 3.202 | España — PVP proveedor Alkain | Catálogo Gamma 2024-2025 (proveedor Alkain) | 2026-08-02 | ALTA (PVP fabricante directo, confirmado por Gabriel que se compra ~a PVP en Alkain) |
| Sistema de instalación / cisterna empotrada (bastidor + placa pulsador, kit completo) | €/ud | 398 | 414 | 430 | España — PVP proveedor Alkain | Catálogo Gamma 2024-2025 (proveedor Alkain) | 2026-08-02 | ALTA (PVP fabricante directo, confirmado por Gabriel que se compra ~a PVP en Alkain) |
| Inodoro o sanitario compacto/a suelo | €/ud | 206 | 400 | 673 | España — PVP proveedor Alkain | Catálogo Gamma 2024-2025 (proveedor Alkain) | 2026-08-02 | ALTA (PVP fabricante directo, confirmado por Gabriel que se compra ~a PVP en Alkain) |
| Bidé (suspendido o a suelo) | €/ud | 83 | 230 | 356 | España — PVP proveedor Alkain | Catálogo Gamma 2024-2025 (proveedor Alkain) | 2026-08-02 | ALTA (PVP fabricante directo, confirmado por Gabriel que se compra ~a PVP en Alkain) |
| Mampara de ducha | €/ud | 242 | 460 | 961 | España — PVP proveedor Alkain | Catálogo Gamma 2024-2025 (proveedor Alkain) | 2026-08-02 | ALTA (PVP fabricante directo, confirmado por Gabriel que se compra ~a PVP en Alkain) |
| Mampara de bañera | €/ud | 120 | 230 | 363 | España — PVP proveedor Alkain | Catálogo Gamma 2024-2025 (proveedor Alkain) | 2026-08-02 | ALTA (PVP fabricante directo, confirmado por Gabriel que se compra ~a PVP en Alkain) |
| Plato de ducha | €/ud | 133 | 350 | 600 | España — PVP proveedor Alkain | Catálogo Gamma 2024-2025 (proveedor Alkain) | 2026-08-02 | ALTA (PVP fabricante directo, confirmado por Gabriel que se compra ~a PVP en Alkain) |
| Bañera, gama estándar (acrílico) | €/ud | 354 | 650 | 1.329 | España — PVP proveedor Alkain | Catálogo Gamma 2024-2025 (proveedor Alkain) | 2026-08-02 | ALTA (PVP fabricante directo, confirmado por Gabriel que se compra ~a PVP en Alkain) |
| Bañera, gama alta/diseño (Solid Surface, porcelana o color) | €/ud | 1.754 | 3.000 | 4.628 | España — PVP proveedor Alkain | Catálogo Gamma 2024-2025 (proveedor Alkain) | 2026-08-02 | ALTA (PVP fabricante directo, confirmado por Gabriel que se compra ~a PVP en Alkain) |
| Espejo de baño con luz LED | €/ud | 163 | 280 | 436 | España — PVP proveedor Alkain | Catálogo Gamma 2024-2025 (proveedor Alkain) | 2026-08-02 | ALTA (PVP fabricante directo, confirmado por Gabriel que se compra ~a PVP en Alkain) |
| Radiador toallero, gama estándar (agua o eléctrico) | €/ud | 103 | 350 | 722 | España — PVP proveedor Alkain | Catálogo Gamma 2024-2025 (proveedor Alkain) | 2026-08-02 | ALTA (PVP fabricante directo, confirmado por Gabriel que se compra ~a PVP en Alkain) |
| Radiador toallero, gama alta/diseño (cromado premium, gran potencia) | €/ud | 744 | 1.100 | 1.632 | España — PVP proveedor Alkain | Catálogo Gamma 2024-2025 (proveedor Alkain) | 2026-08-02 | ALTA (PVP fabricante directo, confirmado por Gabriel que se compra ~a PVP en Alkain) |
| Columna/equipo de ducha exterior (visible, no empotrado) | €/ud | 121 | 300 | 756 | España — PVP proveedor Alkain | Catálogo Gamma 2024-2025 (proveedor Alkain) | 2026-08-02 | ALTA (PVP fabricante directo, confirmado por Gabriel que se compra ~a PVP en Alkain) |
| Accesorios de baño, pieza suelta gama estándar (toallero, portarrollos, escobillero, percha) | €/ud | 7 | 45 | 130 | España — PVP proveedor Alkain | Catálogo Gamma 2024-2025 (proveedor Alkain) | 2026-08-02 | ALTA (PVP fabricante directo, confirmado por Gabriel que se compra ~a PVP en Alkain) |

**Outliers no incluidos como fila propia (para no distorsionar el Máx de su categoría):** columna de ducha
monomando exterior de jardín/terraza (uso exterior real, no "visible vs. empotrada") 1.747-1.879€; grifería de
lavabo tipo columna alta (Kuatro Columna, Drako Base columna) 1.048-1.717€; sistemas de mampara modulares a medida
(Konvert Solution) desde 1.887€; sanitarios reforzados de accesibilidad (Sanibold) 703-1.081€; minipiscina/spa de
exterior (Spa A400 Ebro) desde 10.325€ — es un producto de spa, no una bañera de reforma de baño estándar.

**Nota SAN — alcance y uso:** estas cifras son **coste de material suelto (PVP proveedor), sin instalación ni mano
de obra** — la mano de obra de fontanería/alicatado para el baño ya está recogida en las familias FON y ALI de
este mismo documento; no la dupliques al presupuestar. Es PVP de fabricante, no precio de venta al cliente: sirve
de **base de coste** para que `calibrador-tarifas` proponga el precio de venta con el margen de posicionamiento
medio-alto de Reformas Ordoñez — no uses estas cifras directamente como precio de presupuesto sin pasar por ese
margen.

## ELE — Electricidad

| Partida | Unidad | Mín | Medio | Máx | País/Zona | Fuente | Fecha | Fiabilidad |
|---|---|---|---|---|---|---|---|---|
| Punto de luz, básico | € | 40 | 55 | 70 | España, nacional | [fincavolt.es](https://fincavolt.es/blog/precio-punto-luz-vivienda/) | 2026-07-25 | MEDIA |
| Punto de luz, según tipo de trabajo | € | 60 | — | 350 | España, nacional | [fincavolt.es](https://fincavolt.es/blog/precio-punto-luz-vivienda/) | 2026-07-25 | ALTA |
| Reforma eléctrica completa vivienda 90m² | € total | 1.500 | 3.250 | 6.000+ | España, nacional | [elcorteelectrico.com](https://elcorteelectrico.com/reforma-electrica-completa-precio-medio/) | 2026-07-25 | ALTA |
| Installation électrique neuve, complète | €/m² HT | 80 | 110 | 150 | Francia, nacional | [ootravaux.fr](https://www.ootravaux.fr/installation-entretien/electricite/installation-electrique/cout-installation-electrique-neuve.html) | 2026-07-25 | ALTA |
| Rénovation électrique (según estado previo) | €/m² HT | 50 | 85 | 120 | Francia, nacional | [renovbox.fr](https://renovbox.fr/prix/electricite/renovation-electrique/) | 2026-07-25 | MEDIA |
| Instalación eléctrica casa 120m² | € total HT | 9.600 | — | 18.000 | Francia, nacional | [drozelec.com](https://drozelec.com/formation/prix-installation-electrique-maison-120m2/) | 2026-07-25 | MEDIA |
| Tableau électrique | € | 800 | 1.650 | 2.500 | Francia, nacional | [ootravaux.fr](https://www.ootravaux.fr/installation-entretien/electricite/installation-electrique/cout-installation-electrique-neuve.html) | 2026-07-25 | ALTA |

---

## Fuentes principales usadas (por tipo)

- **ALTA (España):** generadordeprecios.info (CYPE), y agregadores con metodología clara y cifras consistentes entre
  sí (guiareformas.es, humedades.com, motordepresupuestos.com).
- **ALTA (Francia):** hemea.com, needhelp.com, renovation-artisan.com, travaux.com, lamaisonsaintgobain.fr — todas
  citan rangos por gama/nivel de trabajo, coherentes entre fuentes.
- **MEDIA (zona):** eisenmanndesign.com y planreforma.com/cronoshare.com para Gipuzkoa; façades-basques.vertikal.fr,
  cout-renovation-interieure.fr y los directorios de empresas (socorebat-france.fr, illico-travaux.com,
  home-renov40-64.fr) para Pays Basque francés — confirman que hay empresas activas en la zona pero dan menos
  desglose de precio por partida que las fuentes nacionales.
- **BAJA:** cronoshare.com/habitissimo.es en los puntos donde solo daban un rango muy amplio sin desglose (usados
  como suelo, nunca como media, según la regla del vigía).
- **Excluida a propósito:** ordonezrenov.com apareció en varias búsquedas de zona (también en la de tejados de
  Hendaye) porque es la propia web de Reformas Ordoñez — no se ha usado como fuente de precio de mercado por ser
  circular (sería citar el precio propio de la empresa como si fuera precio de la competencia).
- **Tejados/cubiertas (ampliación 2026-07-25):** generadordeprecios.info (CYPE, España — ALTA) para cubierta
  completa de tejas e impermeabilización; humedades.com (España — ALTA) para impermeabilización bajo/sobre teja;
  helloartisan.com (Francia — MEDIA, fuente única) para tuiles/ardoise/charpente; prix-pose.com (Francia — ALTA)
  para étanchéité toit terrasse; renovationettravaux.fr (Francia — MEDIA) para zinc, con dispersión alta señalada.

## Próxima actualización recomendada

- **Resolver la dispersión de TEC en Francia (ampliada 2026-08-05):** ahora zinc, tuiles y ardoise tienen fuentes
  ALTA (prix-pose.com) y MEDIA (helloartisan.com, guide-toiture.com) que discrepan bastante entre sí. Buscar una
  tercera fuente de desempate, o aceptar la dispersión como característica real del mercado francés de cubiertas
  y presupuestar siempre caso a caso en vez de fijar un precio único para estas tres partidas.
- **Verificar la contradicción del dato de zona de Donostia** (cubierta inclinada 80-120€/m² vs. ajuste
  nacional+zona de 190-220€/m²) — confirmar si el precio del competidor incluye estructura completa o solo
  cobertura, para saber si es un dato comparable o de alcance distinto.
- Buscar más fuentes de precio de zona específicas de Irún/Hondarribia (hoy solo hay un dato agregado de Gipuzkoa
  poco desglosado) y de Hendaye/Urrugne/Saint-Jean-de-Luz (hoy solo ravalement de façade tiene dato de zona sólido).
- **Buscar dato de zona para CAR** (carpintería general) en Gipuzkoa y Pays Basque — hoy solo hay precio nacional
  con ajuste porcentual, ninguna fuente de competidor local para puertas/armarios/montaje de cocina.
- Revisar en 3 meses o cuando la empresa entre en un tipo de obra nuevo no cubierto aquí.
- Cuando lleguen los catálogos nuevos de Alkain (Gamma/Roca u otra marca que empiecen a distribuir), actualizar la
  familia SAN con los precios vigentes — y si en ese momento el catálogo Roca sí trae PVP explícito por producto,
  completar ahí las categorías de gama alta/diseño que hoy solo tienen referencia cualitativa de colección (mueble,
  inodoro inteligente) sin cifra propia.
