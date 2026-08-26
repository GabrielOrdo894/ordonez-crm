import { describe, it, expect } from 'vitest';
import { calcularIndemnizacionKm, tarifaPorCv } from './baremoKilometrico';

describe('tarifaPorCv', () => {
  it('devuelve la tarifa oficial 2026 por potencia fiscal', () => {
    expect(tarifaPorCv(3)).toBe(0.529);
    expect(tarifaPorCv(5)).toBe(0.636);
    expect(tarifaPorCv(7)).toBe(0.697);
  });

  it('usa la tarifa de 7 CV para potencias no listadas (7+ CV)', () => {
    expect(tarifaPorCv(9)).toBe(0.697);
  });
});

describe('calcularIndemnizacionKm', () => {
  it('calcula km × tarifa según la potencia fiscal', () => {
    expect(calcularIndemnizacionKm(100, 5)).toBe(63.6);
  });

  it('devuelve 0 si no hay km', () => {
    expect(calcularIndemnizacionKm(0, 5)).toBe(0);
  });
});
