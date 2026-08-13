import { describe, it, expect, vi } from 'vitest';

// numeracion.ts importa el cliente real de Supabase (createClient), que revienta en test/CI sin
// VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY reales — numeroOrdenable no lo necesita, es pura.
vi.mock('./supabase', () => ({ supabase: {} }));

const { numeroOrdenable } = await import('./numeracion');

describe('numeroOrdenable', () => {
  it('combina año y secuencia para que ordene cronológicamente', () => {
    expect(numeroOrdenable('P-2026-0015')).toBe(202600015);
  });

  it('un número de secuencia mayor del mismo año ordena por delante', () => {
    expect(numeroOrdenable('F-2026-0002')).toBeLessThan(numeroOrdenable('F-2026-0010'));
  });

  it('un año posterior ordena por delante aunque la secuencia sea menor', () => {
    expect(numeroOrdenable('F-2026-0099')).toBeLessThan(numeroOrdenable('F-2027-0001'));
  });

  it('funciona con prefijos de más de una letra (acomptes, rectificativas)', () => {
    expect(numeroOrdenable('AC-2026-0003')).toBe(202600003);
    expect(numeroOrdenable('R-2026-0001')).toBe(202600001);
  });

  it('sin formato reconocible, cae al número tal cual o a 0', () => {
    expect(numeroOrdenable('abc')).toBe(0);
    expect(numeroOrdenable('42')).toBe(42);
  });

  it('null o undefined devuelve 0', () => {
    expect(numeroOrdenable(null)).toBe(0);
    expect(numeroOrdenable(undefined)).toBe(0);
  });
});
