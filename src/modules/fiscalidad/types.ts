export type FiscalConfig = {
  id: string;
  clave: string;
  valor: number;
  descripcion: string | null;
  fuente: string | null;
  vigente_desde: string;
  updated_at: string;
};

export type EcheanceFiscal = {
  id: string;
  tipo: 'CA3' | 'ACOMPTE_IS' | 'SOLDE_IS' | 'CFE' | 'LIASSE' | 'DEPOT_COMPTES' | 'OTRO';
  titulo: string;
  fecha_limite: string;
  organismo: string | null;
  url_oficial: string | null;
  importe_estimado: number | null;
  completada: boolean;
  completada_at: string | null;
  notas: string | null;
};

export type NuevaEcheance = Omit<EcheanceFiscal, 'id' | 'completada' | 'completada_at'>;

export type GerantConfig = {
  id: number;
  remuneracion_anual: number;
  capital_social: number;
  compte_courant_medio: number;
  updated_at: string;
};
