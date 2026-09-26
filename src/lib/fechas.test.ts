import { describe, it, expect } from 'vitest';
import { sumarDiasIso, diasEntreIso, opcionesPlazoConActual } from './fechas';

describe('sumarDiasIso / diasEntreIso', () => {
  it('suma exactamente los días pedidos, también el mismo día', () => {
    expect(sumarDiasIso('2026-09-26', 7)).toBe('2026-10-03');
    expect(sumarDiasIso('2026-09-26', 0)).toBe('2026-09-26');
    expect(sumarDiasIso('2026-12-30', 3)).toBe('2027-01-02');
  });

  it('cruza el cambio de hora de octubre sin perder un día', () => {
    expect(sumarDiasIso('2026-10-20', 14)).toBe('2026-11-03');
    expect(diasEntreIso('2026-10-20', '2026-11-03')).toBe(14);
  });

  it('diasEntreIso es la inversa de sumarDiasIso', () => {
    for (const n of [0, 1, 7, 15, 30])
      expect(diasEntreIso('2026-09-26', sumarDiasIso('2026-09-26', n))).toBe(n);
  });
});

describe('opcionesPlazoConActual', () => {
  const base = [
    { value: '0', label: 'El mismo día' },
    { value: '7', label: '7 días' },
  ];
  it('no añade nada si el valor ya es una opción', () => {
    expect(opcionesPlazoConActual(base, 7)).toBe(base);
  });
  it('añade el plazo actual ordenado si no existe', () => {
    expect(opcionesPlazoConActual(base, 6).map((o) => o.value)).toEqual(['0', '6', '7']);
    expect(opcionesPlazoConActual(base, 6)[1].label).toBe('6 días');
  });
});
