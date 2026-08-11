export { TIPOS_IVA, porcentajeIva, tiposIvaPorPais, tipoIvaPorDefecto, etiquetaCortaIva } from '../iva';

export type Gasto = {
  id: string;
  created_at: string;
  fecha: string | null;
  descripcion: string | null;
  categoria: string | null;
  proveedor: string | null;
  proveedor_id: string | null;
  importe_base: number | null;
  tipo_iva: string | null;
  importe_iva: number | null;
  pais: string | null;
  cuenta_contable: string | null;
  visita_id: string | null;
  adjunto_url: string | null;
  adjunto_nombre: string | null;
  adjunto_tipo: string | null;
  num_factura_proveedor: string | null;
};

export type NuevoGasto = Omit<Gasto, 'id' | 'created_at'>;

export const CUENTAS_FR = [
  // 60 — Achats
  { value: '601', label: '601 · Achats de matières premières' },
  { value: '602', label: '602 · Achats d’autres approvisionnements' },
  { value: '604', label: '604 · Achats d’études et prestations de services' },
  { value: '605', label: '605 · Achats de matériel, équipements et travaux' },
  { value: '6061', label: '6061 · Fournitures non stockables (eau, énergie)' },
  { value: '6063', label: '6063 · Fournitures d’entretien et de petit équipement' },
  { value: '6064', label: '6064 · Fournitures administratives' },
  { value: '6068', label: '6068 · Autres matières et fournitures' },
  { value: '607', label: '607 · Achats de marchandises' },

  // 61 — Services extérieurs (sous-traitance, locaux, entretien, assurances)
  { value: '611', label: '611 · Sous-traitance générale' },
  { value: '612', label: '612 · Redevances de crédit-bail' },
  { value: '6132', label: '6132 · Locations immobilières' },
  { value: '6135', label: '6135 · Locations mobilières' },
  { value: '614', label: '614 · Charges locatives et de copropriété' },
  { value: '6152', label: '6152 · Entretien et réparations (biens immobiliers)' },
  { value: '6155', label: '6155 · Entretien et réparations (biens mobiliers)' },
  { value: '6156', label: '6156 · Maintenance' },
  { value: '616', label: '616 · Primes d’assurances' },
  { value: '617', label: '617 · Études et recherches' },
  { value: '618', label: '618 · Divers (documentation, colloques…)' },

  // 62 — Autres services extérieurs (personnel externo, honorarios, transporte, comunicación)
  { value: '621', label: '621 · Personnel extérieur à l’entreprise' },
  { value: '6226', label: '6226 · Honoraires' },
  { value: '6227', label: '6227 · Frais d’actes et de contentieux' },
  { value: '622', label: '622 · Rémunérations d’intermédiaires et honoraires' },
  { value: '623', label: '623 · Publicité, publications, relations publiques' },
  { value: '624', label: '624 · Transports de biens et transports collectifs du personnel' },
  { value: '6251', label: '6251 · Voyages et déplacements' },
  { value: '6256', label: '6256 · Missions' },
  { value: '6257', label: '6257 · Réceptions' },
  { value: '626', label: '626 · Frais postaux et de télécommunications' },
  { value: '627', label: '627 · Services bancaires et assimilés' },
  { value: '628', label: '628 · Divers (services extérieurs)' },

  // 63 / 69 — Impôts, taxes et versements assimilés
  { value: '631', label: '631 · Impôts, taxes sur rémunérations (administrations fiscales)' },
  { value: '6351', label: '6351 · Impôts directs (sauf impôts sur les bénéfices)' },
  { value: '6354', label: '6354 · Droits d’enregistrement et de timbre' },
  { value: '635', label: '635 · Autres impôts, taxes (administrations des impôts)' },
  { value: '637', label: '637 · Autres impôts, taxes (autres organismes)' },
  { value: '695', label: '695 · Impôts sur les bénéfices' },

  // 64 — Charges de personnel
  { value: '641', label: '641 · Rémunérations du personnel' },
  { value: '644', label: '644 · Rémunération du travail de l’exploitant' },
  { value: '645', label: '645 · Charges de sécurité sociale et de prévoyance' },
  { value: '647', label: '647 · Autres charges sociales' },
  { value: '648', label: '648 · Autres charges de personnel' },

  // 20/21/23 — Immobilisations (inversiones/activo, no gasto directo)
  { value: '205', label: '205 · Concessions, brevets, licences, marques' },
  { value: '213', label: '213 · Constructions' },
  { value: '2154', label: '2154 · Matériel industriel' },
  { value: '2182', label: '2182 · Matériel de transport' },
  { value: '2183', label: '2183 · Matériel de bureau et informatique' },
  { value: '2184', label: '2184 · Mobilier' },
  { value: '2188', label: '2188 · Autres immobilisations corporelles' },
  { value: '231', label: '231 · Immobilisations corporelles en cours' },

  // 66 — Charges financières
  { value: '661', label: '661 · Charges d’intérêts' },
  { value: '666', label: '666 · Pertes de change' },
  { value: '668', label: '668 · Autres charges financières' },

  // 67 — Charges exceptionnelles
  { value: '671', label: '671 · Charges exceptionnelles sur opérations de gestion' },
  { value: '675', label: '675 · Valeurs comptables des éléments d’actif cédés' },
  { value: '678', label: '678 · Autres charges exceptionnelles' },

  // 68 — Dotations aux amortissements, dépréciations et provisions
  { value: '681', label: '681 · Dotations aux amortissements (exploitation)' },
  { value: '686', label: '686 · Dotations aux amortissements (charges financières)' },
];
