import { describe, it, expect } from 'vitest';
import { calcularDotacionAnual, amortizacionAcumulada, valorNetoContable, type ActivoInmovilizado } from './inmovilizado';

const activo: ActivoInmovilizado = {
  id: 'a1',
  descripcion: 'Furgoneta',
  cuenta_pcg: '2182',
  fecha_adquisicion: '2026-04-01',
  valor_adquisicion: 24000,
  duracion_anios: 5,
  dado_de_baja_en: null,
};

describe('calcularDotacionAnual', () => {
  it('año de adquisición: prorratea por meses completos desde el mes de compra', () => {
    // 24000 / 5 / 12 = 400€/mes; de abril a diciembre = 9 meses
    expect(calcularDotacionAnual(activo, 2026)).toBeCloseTo(3600);
  });

  it('año intermedio completo: 12 meses de dotación', () => {
    expect(calcularDotacionAnual(activo, 2027)).toBeCloseTo(4800);
  });

  it('año posterior al fin de la vida útil: 0', () => {
    expect(calcularDotacionAnual(activo, 2032)).toBe(0);
  });

  it('año anterior a la adquisición: 0', () => {
    expect(calcularDotacionAnual(activo, 2025)).toBe(0);
  });

  it('activo dado de baja a mitad de año: prorratea hasta el mes de baja inclusive', () => {
    const activoBaja: ActivoInmovilizado = { ...activo, dado_de_baja_en: '2027-03-15' };
    // 2027 completo sería 12 meses, pero se da de baja en marzo -> enero, febrero, marzo = 3 meses
    expect(calcularDotacionAnual(activoBaja, 2027)).toBeCloseTo(1200);
    expect(calcularDotacionAnual(activoBaja, 2028)).toBe(0);
  });
});

describe('amortizacionAcumulada', () => {
  it('suma las dotaciones desde el año de adquisición hasta el año pedido, inclusive', () => {
    // 2026: 3600, 2027: 4800, 2028: 4800 -> 13200
    expect(amortizacionAcumulada(activo, 2028)).toBeCloseTo(13200);
  });

  it('en el propio año de adquisición es igual a la dotación de ese año', () => {
    expect(amortizacionAcumulada(activo, 2026)).toBeCloseTo(3600);
  });

  it('nunca supera el valor de adquisición una vez agotada la vida útil', () => {
    expect(amortizacionAcumulada(activo, 2040)).toBeCloseTo(24000);
  });
});

describe('valorNetoContable', () => {
  it('al final de la vida útil el valor neto contable es 0', () => {
    expect(valorNetoContable(activo, 2040)).toBe(0);
  });

  it('a mitad de vida útil es el valor de adquisición menos lo amortizado', () => {
    expect(valorNetoContable(activo, 2028)).toBeCloseTo(24000 - 13200);
  });

  it('en el año de adquisición, antes de amortizar nada, es el valor íntegro', () => {
    expect(valorNetoContable(activo, 2025)).toBe(24000);
  });
});
