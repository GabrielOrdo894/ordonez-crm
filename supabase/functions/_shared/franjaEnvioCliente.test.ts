import { describe, expect, it } from 'vitest';
import { calcularEnvioProgramado, instanteVisita, localParisAUtc } from './franjaEnvioCliente.ts';

// Noviembre: Francia en UTC+1. Julio: UTC+2.
const paris = (iso: string) => {
  const [f, h] = iso.split(' ');
  const [y, m, d] = f.split('-').map(Number);
  const [hh, mm] = h.split(':').map(Number);
  return localParisAUtc(y, m, d, hh, mm);
};

describe('localParisAUtc', () => {
  it('convierte hora de Francia a UTC en invierno y en verano', () => {
    expect(localParisAUtc(2026, 11, 3, 8, 0).toISOString()).toBe('2026-11-03T07:00:00.000Z');
    expect(localParisAUtc(2026, 7, 15, 8, 0).toISOString()).toBe('2026-07-15T06:00:00.000Z');
  });
});

describe('calcularEnvioProgramado', () => {
  it('dentro de la franja (08:00–18:30) se envía al momento', () => {
    expect(calcularEnvioProgramado(paris('2026-11-03 08:00'), '2026-11-10', '10:00')).toBeNull();
    expect(calcularEnvioProgramado(paris('2026-11-03 12:15'), '2026-11-10', '10:00')).toBeNull();
    expect(calcularEnvioProgramado(paris('2026-11-03 18:30'), '2026-11-10', '10:00')).toBeNull();
  });

  it('después de las 18:30 se programa para mañana a las 08:00', () => {
    expect(
      calcularEnvioProgramado(paris('2026-11-03 18:31'), '2026-11-10', '10:00')?.toISOString(),
    ).toBe('2026-11-04T07:00:00.000Z');
    expect(
      calcularEnvioProgramado(paris('2026-11-03 23:59'), '2026-11-10', '10:00')?.toISOString(),
    ).toBe('2026-11-04T07:00:00.000Z');
  });

  it('de madrugada se programa para hoy a las 08:00', () => {
    expect(
      calcularEnvioProgramado(paris('2026-11-04 00:10'), '2026-11-10', '10:00')?.toISOString(),
    ).toBe('2026-11-04T07:00:00.000Z');
    expect(
      calcularEnvioProgramado(paris('2026-11-04 07:59'), '2026-11-10', '10:00')?.toISOString(),
    ).toBe('2026-11-04T07:00:00.000Z');
  });

  it('los fines de semana se envía igual (sábado noche → domingo 08:00)', () => {
    // 2026-11-07 es sábado.
    expect(
      calcularEnvioProgramado(paris('2026-11-07 22:00'), '2026-11-12', '10:00')?.toISOString(),
    ).toBe('2026-11-08T07:00:00.000Z');
  });

  it('si la visita es menos de 3 h después de la hora programada, se envía al momento', () => {
    // Creada a las 23:00 para mañana a las 09:00 → esperar a las 08:00 dejaría solo 1 h.
    expect(calcularEnvioProgramado(paris('2026-11-03 23:00'), '2026-11-04', '09:00')).toBeNull();
    // Mañana a las 11:00 sí da margen (3 h justas).
    expect(
      calcularEnvioProgramado(paris('2026-11-03 23:00'), '2026-11-04', '11:00')?.toISOString(),
    ).toBe('2026-11-04T07:00:00.000Z');
  });

  it('el cambio de hora no desplaza las 08:00 (último domingo de octubre)', () => {
    // 2026-10-24 sábado 23:00 (UTC+2) → domingo 25 a las 08:00, ya en UTC+1.
    expect(
      calcularEnvioProgramado(paris('2026-10-24 23:00'), '2026-10-30', '10:00')?.toISOString(),
    ).toBe('2026-10-25T07:00:00.000Z');
  });
});

describe('instanteVisita', () => {
  it('interpreta la fecha y hora de la visita en hora de Francia', () => {
    expect(instanteVisita('2026-11-10', '10:00').toISOString()).toBe('2026-11-10T09:00:00.000Z');
  });
});
