import { describe, expect, it } from 'vitest';
import { horasDelDia, siguientesHuecos } from '../huecos-visita/huecos';

describe('huecos de visita', () => {
  it('España: lunes a viernes 18:00, sábado 12:00, domingo nada', () => {
    expect(horasDelDia(1)).toEqual(['18:00']);
    expect(horasDelDia(5)).toEqual(['18:00']);
    expect(horasDelDia(6)).toEqual(['12:00']);
    expect(horasDelDia(0)).toEqual([]);
  });

  it('Francia: miércoles a viernes 18:00, sábado 12:00, nada lunes, martes ni domingo', () => {
    expect(horasDelDia(1, 'fr')).toEqual([]);
    expect(horasDelDia(2, 'fr')).toEqual([]);
    expect(horasDelDia(3, 'fr')).toEqual(['18:00']);
    expect(horasDelDia(6, 'fr')).toEqual(['12:00']);
    expect(horasDelDia(0, 'fr')).toEqual([]);
  });

  it('empieza mañana y salta los huecos ocupados', () => {
    // 2026-11-18 es miércoles
    const ocupados = new Set(['2026-11-19 18:00']);
    expect(siguientesHuecos('2026-11-18', ocupados, 7, 4)).toEqual([
      { fecha: '2026-11-20', hora: '18:00' },
      { fecha: '2026-11-21', hora: '12:00' },
      { fecha: '2026-11-23', hora: '18:00' },
      { fecha: '2026-11-24', hora: '18:00' },
    ]);
    expect(siguientesHuecos('2026-11-18', ocupados, 7, 4, 'fr')).toEqual([
      { fecha: '2026-11-20', hora: '18:00' },
      { fecha: '2026-11-21', hora: '12:00' },
      { fecha: '2026-11-25', hora: '18:00' },
    ]);
  });
});
