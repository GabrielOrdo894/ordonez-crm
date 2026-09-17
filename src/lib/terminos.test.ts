import { describe, expect, it } from 'vitest';
import { renderizarTC } from './terminos';

describe('renderizarTC', () => {
  it('sustituye las fechas y los días de validez del presupuesto', () => {
    const texto = renderizarTC(
      'Emitido: {FECHA_EMISION}. Válido hasta: {FECHA_VALIDEZ} ({DIAS_VALIDEZ} días).',
      [],
      'es',
      { fechaEmision: '2026-09-17', fechaValidez: '2026-10-01', diasValidez: 14 },
    );

    expect(texto).toBe('Emitido: 2026-09-17. Válido hasta: 2026-10-01 (14 días).');
  });

  it('actualiza el plazo fijo de las plantillas históricas', () => {
    const texto = renderizarTC('Art. 1 — Validez: presupuesto válido 30 días naturales desde la fecha de emisión.', [], 'es', {
      diasValidez: 14,
    });

    expect(texto).toContain('presupuesto válido 14 días naturales desde la fecha de emisión');
  });

  it('actualiza el plazo fijo francés sin cambiar el idioma del documento', () => {
    const texto = renderizarTC("Le devis reste valable 30 jours à compter de sa date d'émission.", [], 'fr', {
      diasValidez: 14,
    });

    expect(texto).toContain("devis reste valable 14 jours à compter de sa date d'émission");
  });
});
