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

  it('actualiza el plazo fijo del texto real de empresa_config.tc_es (Artículo 2)', () => {
    // Texto real de producción (no un fixture inventado) — la regex anterior nunca coincidía
    // con esta redacción exacta ("presupuesto es válido durante" + "desde su fecha de
    // emisión"), bug crítico corregido 2026-09-21.
    const texto = renderizarTC(
      'El presupuesto es válido durante 7 días naturales desde su fecha de emisión, transcurridos los cuales el prestador podrá revisar precios.',
      [],
      'es',
      { diasValidez: 14 },
    );

    expect(texto).toContain('El presupuesto es válido durante 14 días naturales desde su fecha de emisión');
  });

  it('actualiza el plazo fijo del texto real de empresa_config.tc_fr (Article 2)', () => {
    // Texto real de producción — la regex anterior exigía "devis" pegado a "valable", pero en
    // el texto real hay una frase entera entre medias.
    const texto = renderizarTC(
      "Il est établi gratuitement et reste valable 7 jours à compter de sa date d'émission. Passé ce délai, l'entreprise se réserve la possibilité de revoir les prix.",
      [],
      'fr',
      { diasValidez: 14 },
    );

    expect(texto).toContain("reste valable 14 jours à compter de sa date d'émission");
  });
});
