export const TIPOS_IVA = [
  { value: 'IVA_21', label: 'IVA 21% (ES · obra nueva)', porcentaje: 21 },
  { value: 'IVA_10', label: 'IVA 10% (ES · reforma >2 años)', porcentaje: 10 },
  { value: 'TVA_10', label: 'TVA 10% (FR · travaux rénovation)', porcentaje: 10 },
  { value: 'TVA_20', label: 'TVA 20% (FR · taux normal)', porcentaje: 20 },
  { value: 'EXENTO', label: 'Exento', porcentaje: 0 },
] as const;

export function porcentajeIva(tipo: string | null): number {
  return TIPOS_IVA.find((t) => t.value === tipo)?.porcentaje ?? 0;
}

export function paisDesdeTipoIva(tipo: string | null): 'España' | 'Francia' | null {
  if (tipo === 'IVA_21' || tipo === 'IVA_10') return 'España';
  if (tipo === 'TVA_10' || tipo === 'TVA_20') return 'Francia';
  return null;
}

export function tiposIvaPorPais(pais: string) {
  return TIPOS_IVA.filter((t) => {
    if (t.value === 'EXENTO') return true;
    return pais === 'Francia' ? t.value.startsWith('TVA') : t.value.startsWith('IVA');
  });
}

export function tipoIvaPorDefecto(pais: string): string {
  return pais === 'Francia' ? 'TVA_10' : 'IVA_21';
}

export function etiquetaCortaIva(tipo: string | null): string {
  const t = TIPOS_IVA.find((x) => x.value === tipo);
  if (!t) return '';
  if (t.value === 'EXENTO') return 'Exento';
  return `${t.value.split('_')[0]} ${t.porcentaje}%`;
}

export function mencionIvaReducida(tipo: string | null): string | null {
  if (tipo === 'IVA_10') return 'Tasa de IVA reducida, artículo 279-0 bis del Código Fiscal Español';
  if (tipo === 'TVA_10') return 'Taux de TVA réduit, article 279-0 bis du Code Général des Impôts';
  return null;
}
