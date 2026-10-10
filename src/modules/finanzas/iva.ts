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
  if (tipo === 'IVA_10') return 'Tasa de IVA reducida, artículo 91.Uno.2.10º de la Ley 37/1992 del IVA';
  if (tipo === 'TVA_10') return 'Taux de TVA réduit, article 279-0 bis du Code Général des Impôts';
  return null;
}

// Las declaraciones fiscales francesas solo admiten euros enteros (el formulario en línea de la CA3
// no deja teclear decimales). Regla legal (CGI art. 1649 undecies): redondeo al euro más próximo, y
// 0,50 cuenta como 1. Se pasa antes por céntimos para que un 12,4999999 de coma flotante no se
// quede en 12.
export function euroEntero(n: number): number {
  return Math.round(Math.round(n * 100) / 100);
}

// Una compra a un proveedor no establecido en Francia es un SERVICIO (CA3 línea A3, sin línea 17) o
// un BIEN (línea B2 + línea 17). El gasto no guarda ese dato: se deduce de su cuenta PCG — 61x y 62x
// (services extérieurs) y 604 (prestations de services) son servicios; el resto (60x, clase 2) bienes.
// Notice 3310-CA3 2026: B2 es solo para «biens meubles corporels» y la 17 solo para lo declarado en B2.
export function esServicioSegunCuenta(cuenta: string | null | undefined): boolean {
  if (!cuenta) return false;
  return cuenta.startsWith('61') || cuenta.startsWith('62') || cuenta.startsWith('604');
}
