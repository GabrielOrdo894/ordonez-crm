import { describe, expect, it } from 'vitest';
import { horasDelDia, siguientesHuecos } from '../huecos-visita/huecos';

describe('huecos de visita', () => {
  it('lunes a viernes 12:00 y 18:00, sábado solo 12:00, domingo nada', () => {
    expect(horasDelDia(1)).toEqual(['12:00', '18:00']);
    expect(horasDelDia(6)).toEqual(['12:00']);
    expect(horasDelDia(0)).toEqual([]);
  });

  it('empieza mañana y salta los huecos ocupados', () => {
    // 2026-11-18 es miércoles
    const ocupados = new Set(['2026-11-19 18:00', '2026-11-20 18:00']);
    const h = siguientesHuecos('2026-11-18', ocupados, 7, 5);
    expect(h).toEqual([
      { fecha: '2026-11-19', hora: '12:00' },
      { fecha: '2026-11-20', hora: '12:00' },
      { fecha: '2026-11-21', hora: '12:00' },
      { fecha: '2026-11-23', hora: '12:00' },
      { fecha: '2026-11-23', hora: '18:00' },
    ]);
  });
});
