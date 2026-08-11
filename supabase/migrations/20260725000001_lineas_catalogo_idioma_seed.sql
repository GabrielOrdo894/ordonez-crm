-- Idioma de la línea preestablecida ('es' | 'fr') — determina en qué documentos se sugiere
-- (presupuestos/facturas en español solo ven líneas 'es', y en francés solo 'fr').
alter table lineas_catalogo add column if not exists idioma text default 'es';

-- Líneas de ejemplo en español, cubriendo las tareas más habituales de una reforma.
insert into lineas_catalogo (designacion, referencia, descripcion, unidad, tipo_servicio, precio_unit, idioma) values
('Demolición de tabique', 'DEM-01', 'Demolición y retirada de tabique de ladrillo o pladur, incluyendo carga y transporte de escombros a vertedero autorizado.', 'm2', 'Travaux', 35, 'es'),
('Instalación de fontanería - baño completo', 'FON-01', 'Renovación completa de la instalación de fontanería: tuberías de agua fría/caliente, desagües y llaves de paso.', 'ud', 'Prestations de services BIC', 1200, 'es'),
('Sustitución de cuadro eléctrico', 'ELE-01', 'Sustitución de cuadro eléctrico con diferenciales y magnetotérmicos según normativa vigente.', 'ud', 'Prestations de services BIC', 650, 'es'),
('Punto de luz nuevo', 'ELE-02', 'Instalación de punto de luz nuevo con mecanismo y cableado.', 'ud', 'Main d''œuvre', 85, 'es'),
('Alicatado de baño', 'ALI-01', 'Suministro y colocación de azulejo cerámico en paredes de baño, incluye adhesivo y rejuntado.', 'm2', 'Travaux', 45, 'es'),
('Solado cerámico', 'SOL-01', 'Suministro y colocación de pavimento cerámico o porcelánico, incluye nivelación de base.', 'm2', 'Travaux', 40, 'es'),
('Pintura interior', 'PIN-01', 'Pintura plástica lisa en paredes y techos, dos manos, incluye plastecido de grietas.', 'm2', 'Main d''œuvre', 12, 'es'),
('Tabiquería de pladur', 'PLA-01', 'Montaje de tabique de pladur con estructura metálica, aislamiento acústico y doble placa.', 'm2', 'Travaux', 38, 'es'),
('Aislamiento térmico', 'AIS-01', 'Instalación de aislamiento térmico con lana mineral o poliestireno extruido.', 'm2', 'Fournitures', 22, 'es'),
('Sustitución de ventana', 'VEN-01', 'Suministro e instalación de ventana de aluminio con rotura de puente térmico y doble acristalamiento.', 'ud', 'Fournitures', 450, 'es'),
('Puerta de entrada blindada', 'PUE-01', 'Suministro e instalación de puerta de entrada blindada.', 'ud', 'Fournitures', 850, 'es'),
('Muebles de cocina a medida', 'COC-01', 'Suministro y montaje de mobiliario de cocina a medida.', 'ml', 'Fournitures', 380, 'es'),
('Encimera de cuarzo', 'COC-02', 'Suministro e instalación de encimera de cuarzo compacto.', 'ml', 'Fournitures', 220, 'es'),
('Radiador de aluminio', 'CAL-01', 'Suministro e instalación de radiador de aluminio con válvulas termostáticas.', 'ud', 'Fournitures', 180, 'es'),
('Renovación de saneamiento', 'SAN-01', 'Renovación de red de saneamiento horizontal en PVC.', 'ml', 'Travaux', 28, 'es'),
('Falso techo de pladur', 'TEC-01', 'Instalación de falso techo de pladur con aislamiento.', 'm2', 'Travaux', 32, 'es'),
('Impermeabilización de terraza', 'TER-01', 'Impermeabilización de terraza con lámina asfáltica y protección mecánica.', 'm2', 'Travaux', 55, 'es'),
('Moldura de escayola', 'MOL-01', 'Colocación de moldura de escayola perimetral.', 'ml', 'Main d''œuvre', 8, 'es'),
('Plato de ducha extraplano', 'BAN-01', 'Retirada de bañera e instalación de plato de ducha extraplano con mampara.', 'ud', 'Prestations de services BIC', 950, 'es'),
('Limpieza final de obra', 'LIM-01', 'Limpieza general de la obra al finalizar los trabajos.', 'forfait', 'Main d''œuvre', 150, 'es'),
('Instalación de aire acondicionado', 'CLI-01', 'Suministro e instalación de equipo de aire acondicionado tipo split.', 'ud', 'Fournitures', 900, 'es'),
('Pintura de fachada', 'FAC-01', 'Pintura exterior de fachada con pintura elastomérica transpirable.', 'm2', 'Travaux', 18, 'es'),
('Sustitución de tejado', 'TEJ-01', 'Sustitución de teja y refuerzo de impermeabilización de cubierta inclinada.', 'm2', 'Travaux', 65, 'es'),
('Armario empotrado a medida', 'ARM-01', 'Fabricación e instalación de armario empotrado con puertas correderas.', 'ml', 'Fournitures', 320, 'es'),
('Persiana motorizada', 'PER-01', 'Suministro e instalación de persiana enrollable motorizada.', 'ud', 'Fournitures', 280, 'es');

-- Mêmes catégories, lignes en français (documents émis en France).
insert into lineas_catalogo (designacion, referencia, descripcion, unidad, tipo_servicio, precio_unit, idioma) values
('Démolition de cloison', 'DEM-01F', 'Démolition et évacuation de cloison en brique ou placo, y compris chargement et transport des gravats en décharge agréée.', 'm2', 'Travaux', 35, 'fr'),
('Installation plomberie - salle de bain complète', 'PLO-01', 'Rénovation complète de l''installation de plomberie : tuyauterie eau froide/chaude, évacuations et robinets d''arrêt.', 'ud', 'Prestations de services BIC', 1200, 'fr'),
('Remplacement tableau électrique', 'ELEC-01', 'Remplacement du tableau électrique avec disjoncteurs différentiels et magnétothermiques selon la norme NF C 15-100.', 'ud', 'Prestations de services BIC', 650, 'fr'),
('Point lumineux neuf', 'ELEC-02', 'Installation d''un point lumineux neuf avec mécanisme et câblage.', 'ud', 'Main d''œuvre', 85, 'fr'),
('Faïence salle de bain', 'FAI-01', 'Fourniture et pose de faïence murale en salle de bain, colle et joints compris.', 'm2', 'Travaux', 45, 'fr'),
('Carrelage sol', 'CAR-01', 'Fourniture et pose de carrelage grès cérame, ragréage du support compris.', 'm2', 'Travaux', 40, 'fr'),
('Peinture intérieure', 'PEI-01', 'Peinture acrylique lisse murs et plafonds, deux couches, rebouchage des fissures compris.', 'm2', 'Main d''œuvre', 12, 'fr'),
('Cloison en placo', 'PLA-01F', 'Montage de cloison placo avec ossature métallique, isolation phonique et double plaque.', 'm2', 'Travaux', 38, 'fr'),
('Isolation thermique', 'ISO-01', 'Pose d''isolation thermique en laine minérale ou polystyrène extrudé.', 'm2', 'Fournitures', 22, 'fr'),
('Remplacement de fenêtre', 'FEN-01', 'Fourniture et pose de fenêtre aluminium à rupture de pont thermique, double vitrage.', 'ud', 'Fournitures', 450, 'fr'),
('Porte d''entrée blindée', 'POR-01', 'Fourniture et pose de porte d''entrée blindée.', 'ud', 'Fournitures', 850, 'fr'),
('Meubles de cuisine sur mesure', 'CUI-01', 'Fourniture et pose de mobilier de cuisine sur mesure.', 'ml', 'Fournitures', 380, 'fr'),
('Plan de travail quartz', 'CUI-02', 'Fourniture et pose de plan de travail en quartz compact.', 'ml', 'Fournitures', 220, 'fr'),
('Radiateur aluminium', 'CHA-01', 'Fourniture et pose de radiateur en aluminium avec vannes thermostatiques.', 'ud', 'Fournitures', 180, 'fr'),
('Rénovation assainissement', 'ASS-01', 'Rénovation du réseau d''assainissement horizontal en PVC.', 'ml', 'Travaux', 28, 'fr'),
('Faux plafond placo', 'PLAF-01', 'Pose de faux plafond en placo avec isolation.', 'm2', 'Travaux', 32, 'fr'),
('Étanchéité terrasse', 'TERR-01', 'Étanchéité de terrasse avec membrane bitumineuse et protection mécanique.', 'm2', 'Travaux', 55, 'fr'),
('Moulure en staff', 'MOUL-01', 'Pose de moulure en staff périphérique.', 'ml', 'Main d''œuvre', 8, 'fr'),
('Receveur de douche extra-plat', 'BAI-01', 'Dépose de baignoire et pose de receveur de douche extra-plat avec paroi.', 'ud', 'Prestations de services BIC', 950, 'fr'),
('Nettoyage fin de chantier', 'NET-01', 'Nettoyage général du chantier à la fin des travaux.', 'forfait', 'Main d''œuvre', 150, 'fr'),
('Installation climatisation', 'CLI-01', 'Fourniture et pose d''un climatiseur de type split.', 'ud', 'Fournitures', 900, 'fr'),
('Peinture de façade', 'FAC-01', 'Peinture extérieure de façade avec peinture élastomère respirante.', 'm2', 'Travaux', 18, 'fr'),
('Réfection de toiture', 'TOI-01', 'Remplacement de tuiles et renforcement de l''étanchéité de la toiture en pente.', 'm2', 'Travaux', 65, 'fr'),
('Armoire encastrée sur mesure', 'ARM-01', 'Fabrication et pose d''armoire encastrée avec portes coulissantes.', 'ml', 'Fournitures', 320, 'fr'),
('Volet roulant motorisé', 'VOL-01', 'Fourniture et pose de volet roulant motorisé.', 'ud', 'Fournitures', 280, 'fr');
