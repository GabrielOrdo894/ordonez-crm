import { describe, it, expect } from 'vitest';
import { diasEntreFechas, diasInclusive } from './planningCronograma';

describe('diasEntreFechas', () => {
  it('devuelve la diferencia simple entre dos fechas (para offsets/proporciones del Gantt)', () => {
    expect(diasEntreFechas('2026-09-07', '2026-09-07')).toBe(0);
    expect(diasEntreFechas('2026-09-07', '2026-09-10')).toBe(3);
  });
});

describe('diasInclusive', () => {
  it('cuenta el primer y el último día — de lunes a jueves son 4 días, no 3', () => {
    // 2026-09-07 es lunes, 2026-09-10 es jueves.
    expect(diasInclusive('2026-09-07', '2026-09-10')).toBe(4);
  });

  it('un solo día cuenta como 1', () => {
    expect(diasInclusive('2026-09-07', '2026-09-07')).toBe(1);
  });
});
