import { describe, expect, it } from 'vitest';
import {
  construirRecordatorio,
  pasoAProgramar,
  pasoQueToca,
  totalLineas,
} from './recordatorioPago.ts';

describe('pasoQueToca', () => {
  it('reparte los pasos a +3, +10 y +20 días', () => {
    expect(pasoQueToca(2)).toBe(0);
    expect(pasoQueToca(3)).toBe(1);
    expect(pasoQueToca(9)).toBe(1);
    expect(pasoQueToca(10)).toBe(2);
    expect(pasoQueToca(20)).toBe(3);
    expect(pasoQueToca(60)).toBe(3);
  });
});

describe('pasoAProgramar', () => {
  it('programa el paso que toca si no se ha hecho', () => {
    expect(pasoAProgramar(4, [])).toBe(1);
    expect(pasoAProgramar(12, [{ paso: 1, estado: 'enviado' }])).toBe(2);
  });
  it('no repite ni retrocede, y espera si ya hay uno programado', () => {
    expect(pasoAProgramar(5, [{ paso: 1, estado: 'enviado' }])).toBe(0);
    expect(pasoAProgramar(5, [{ paso: 1, estado: 'cancelado' }])).toBe(0);
    expect(pasoAProgramar(12, [{ paso: 1, estado: 'programado' }])).toBe(0);
    expect(pasoAProgramar(25, [{ paso: 1, estado: 'cancelado' }])).toBe(3);
  });
  it('una factura con mucho retraso empieza directamente por el paso que le toca', () => {
    expect(pasoAProgramar(28, [])).toBe(3);
  });
});

describe('totalLineas', () => {
  it('suma el total con IVA sin las líneas incluidas', () => {
    expect(totalLineas([{ total_con_iva: 4400 }, { total_con_iva: 300, es_incluido: true }])).toBe(
      4400,
    );
  });
});

describe('construirRecordatorio', () => {
  const base = {
    nombreCliente: 'Irene Etxeberria',
    numero: 'F-2026-0006',
    pendiente: 4400,
    fechaVence: '2026-10-13',
    iban: 'FR76 0000',
    bic: 'AGRIFRPP',
    titular: 'Reformas Ordoñez',
    telefono: '+33 6 00 00 00 00',
    emailContacto: 'reformasordonezeus@gmail.com',
  };
  it('en francés, con importe, fecha y datos bancarios', () => {
    const r = construirRecordatorio({ ...base, paso: 1, fr: true });
    expect(r.asunto).toBe('Rappel de paiement — facture F-2026-0006');
    expect(r.html).toContain('4 400,00 €');
    expect(r.html).toContain('13/10/2026');
    expect(r.html).toContain('IBAN : FR76 0000');
    expect(r.html).toContain('Bonjour Irene');
  });
  it('el tercer paso avisa de la reclamación formal, en español', () => {
    const r = construirRecordatorio({ ...base, paso: 3, fr: false });
    expect(r.asunto).toContain('Último aviso');
    expect(r.html).toContain('ocho días');
    expect(r.html).toContain('4.400,00 €');
  });
});
