import { describe, it, expect } from 'vitest';
import { porcentajeIva, paisDesdeTipoIva, tiposIvaPorPais, tipoIvaPorDefecto, etiquetaCortaIva } from './iva';

describe('porcentajeIva', () => {
  it('devuelve el porcentaje correcto para cada tipo conocido', () => {
    expect(porcentajeIva('IVA_21')).toBe(21);
    expect(porcentajeIva('IVA_10')).toBe(10);
    expect(porcentajeIva('TVA_10')).toBe(10);
    expect(porcentajeIva('TVA_20')).toBe(20);
    expect(porcentajeIva('EXENTO')).toBe(0);
  });

  it('devuelve 0 para un tipo desconocido o null', () => {
    expect(porcentajeIva(null)).toBe(0);
    expect(porcentajeIva('LO_QUE_SEA')).toBe(0);
  });
});

describe('paisDesdeTipoIva', () => {
  it('mapea los tipos IVA_* a España y TVA_* a Francia', () => {
    expect(paisDesdeTipoIva('IVA_21')).toBe('España');
    expect(paisDesdeTipoIva('IVA_10')).toBe('España');
    expect(paisDesdeTipoIva('TVA_10')).toBe('Francia');
    expect(paisDesdeTipoIva('TVA_20')).toBe('Francia');
  });

  it('EXENTO o desconocido no determina país', () => {
    expect(paisDesdeTipoIva('EXENTO')).toBeNull();
    expect(paisDesdeTipoIva(null)).toBeNull();
  });
});

describe('tiposIvaPorPais', () => {
  it('Francia solo ofrece TVA_* + EXENTO, nunca tipos IVA_*', () => {
    const tipos = tiposIvaPorPais('Francia').map((t) => t.value);
    expect(tipos).toContain('TVA_10');
    expect(tipos).toContain('TVA_20');
    expect(tipos).toContain('EXENTO');
    expect(tipos.some((v) => v.startsWith('IVA'))).toBe(false);
  });

  it('España solo ofrece IVA_* + EXENTO, nunca tipos TVA_*', () => {
    const tipos = tiposIvaPorPais('España').map((t) => t.value);
    expect(tipos).toContain('IVA_21');
    expect(tipos).toContain('IVA_10');
    expect(tipos).toContain('EXENTO');
    expect(tipos.some((v) => v.startsWith('TVA'))).toBe(false);
  });
});

describe('tipoIvaPorDefecto', () => {
  it('Francia -> TVA_10, cualquier otro -> IVA_21', () => {
    expect(tipoIvaPorDefecto('Francia')).toBe('TVA_10');
    expect(tipoIvaPorDefecto('España')).toBe('IVA_21');
  });
});

describe('etiquetaCortaIva', () => {
  it('formatea tipo + porcentaje, EXENTO como caso especial', () => {
    expect(etiquetaCortaIva('IVA_21')).toBe('IVA 21%');
    expect(etiquetaCortaIva('TVA_10')).toBe('TVA 10%');
    expect(etiquetaCortaIva('EXENTO')).toBe('Exento');
  });

  it('tipo desconocido o null devuelve cadena vacía', () => {
    expect(etiquetaCortaIva(null)).toBe('');
    expect(etiquetaCortaIva('X')).toBe('');
  });
});
