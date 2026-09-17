import { describe, it, expect } from 'vitest';
import { normalizarNombre, normalizarTelefono } from './types';

describe('normalizarTelefono', () => {
  it('cruza formato nacional francés y formato internacional del mismo número', () => {
    expect(normalizarTelefono('0612345678')).toBe(normalizarTelefono('+33612345678'));
    expect(normalizarTelefono('0612345678')).toBe(normalizarTelefono('33612345678'));
  });

  it('cruza formato español simple y con prefijo internacional', () => {
    expect(normalizarTelefono('612345678')).toBe(normalizarTelefono('+34612345678'));
  });

  it('ignora espacios, puntos y guiones', () => {
    expect(normalizarTelefono('06 12 34 56 78')).toBe(normalizarTelefono('0612345678'));
    expect(normalizarTelefono('+33 6.12.34.56.78')).toBe(normalizarTelefono('0612345678'));
  });

  it('un teléfono sin dígitos normaliza a cadena vacía', () => {
    expect(normalizarTelefono('N/A')).toBe('');
    expect(normalizarTelefono('sin whatsapp')).toBe('');
  });
});

describe('normalizarNombre', () => {
  it('ignora mayúsculas, acentos y espacios superfluos del nombre completo', () => {
    expect(normalizarNombre('  José   García López  ')).toBe('jose garcia lopez');
    expect(normalizarNombre('JOSE GARCIA LOPEZ')).toBe('jose garcia lopez');
  });
});
