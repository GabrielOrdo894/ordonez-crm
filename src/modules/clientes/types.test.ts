import { describe, it, expect } from 'vitest';
import { formatearTelefonoVisual, normalizarNombre, normalizarTelefono, tieneCodigoPais } from './types';

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

describe('formatearTelefonoVisual / tieneCodigoPais (formato internacional, 2026-09-25)', () => {
  it('formatea un número español con prefijo en +34 XXX XX XX XX', () => {
    expect(formatearTelefonoVisual('+34659884706')).toBe('+34 659 88 47 06');
    expect(formatearTelefonoVisual('+34 659 88 47 06')).toBe('+34 659 88 47 06');
    expect(formatearTelefonoVisual('0034659884706')).toBe('+34 659 88 47 06');
    expect(formatearTelefonoVisual('34659884706')).toBe('+34 659 88 47 06');
  });

  it('formatea un número francés (prefijo o 0 nacional) en +33 X XX XX XX XX', () => {
    expect(formatearTelefonoVisual('+33687524012')).toBe('+33 6 87 52 40 12');
    expect(formatearTelefonoVisual('0033687524012')).toBe('+33 6 87 52 40 12');
    expect(formatearTelefonoVisual('0687524012')).toBe('+33 6 87 52 40 12');
    expect(formatearTelefonoVisual('06 87 52 40 12')).toBe('+33 6 87 52 40 12');
  });

  it('deja tal cual un número ambiguo de 9 dígitos sin prefijo — nunca adivina el país', () => {
    expect(formatearTelefonoVisual('689456552')).toBe('689456552');
    expect(formatearTelefonoVisual('618949480')).toBe('618949480');
    expect(tieneCodigoPais('689456552')).toBe(false);
    expect(tieneCodigoPais('+34 689456552')).toBe(true);
    expect(tieneCodigoPais('0689456552')).toBe(true);
  });

  it('no rompe la deduplicación: el formateado normaliza igual que el bruto', () => {
    expect(normalizarTelefono(formatearTelefonoVisual('+33687524012'))).toBe(normalizarTelefono('0687524012'));
    expect(normalizarTelefono(formatearTelefonoVisual('+34659884706'))).toBe(normalizarTelefono('659884706'));
  });
});
