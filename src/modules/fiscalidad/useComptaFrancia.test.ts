import { describe, it, expect } from 'vitest';
import { saldoNetoCuentas, calcularCompteResultat, calcularBilanActivo, type AsientoContable } from './useComptaFrancia';
import type { ActivoInmovilizado } from '../../lib/inmovilizado';

describe('saldoNetoCuentas', () => {
  it('suma debe - haber de las cuentas que empiecen por los prefijos dados', () => {
    const asientos: AsientoContable[] = [
      { cuenta: '606', debe: 100, haber: 0 },
      { cuenta: '512', debe: 0, haber: 100 },
      { cuenta: '706', debe: 0, haber: 500 },
    ];
    expect(saldoNetoCuentas(asientos, ['606'])).toBe(100);
    expect(saldoNetoCuentas(asientos, ['70'])).toBe(-500);
  });

  it('regresión: una rectificación (reversa en la misma cuenta) no debe duplicar ni anular el saldo', () => {
    // Gasto de 100 en 606, contabilizado, luego rectificado (reversa) y vuelto a contabilizar en 150.
    const asientos: AsientoContable[] = [
      { cuenta: '606', debe: 100, haber: 0 }, // original
      { cuenta: '606', debe: 0, haber: 100 }, // reversa de la rectificación
      { cuenta: '606', debe: 150, haber: 0 }, // valor corregido
    ];
    // Sumar solo "debe" daría 250 (doble conteo); sumar solo "haber" ignoraría la reversa. El
    // saldo neto debe reflejar únicamente el importe final correcto: 150.
    expect(saldoNetoCuentas(asientos, ['606'])).toBe(150);
  });
});

describe('calcularCompteResultat', () => {
  it('ventas (70x) en positivo, cargas (60-65x, 681) en positivo, resultado = ventas - cargas', () => {
    const asientos: AsientoContable[] = [
      { cuenta: '706', debe: 0, haber: 1000 },
      { cuenta: '606', debe: 300, haber: 0 },
      { cuenta: '681', debe: 100, haber: 0 },
    ];
    const r = calcularCompteResultat(asientos);
    expect(r.ventas).toBe(1000);
    expect(r.cargasExplotacion).toBe(400);
    expect(r.resultadoExplotacion).toBe(600);
    expect(r.resultadoAntesIS).toBe(600);
  });

  it('regresión: 686 (dotations financières) va a cargasFinancieras, no a cargasExplotacion (bug real corregido 2026-08-31)', () => {
    const asientos: AsientoContable[] = [
      { cuenta: '706', debe: 0, haber: 1000 },
      { cuenta: '681', debe: 100, haber: 0 },
      { cuenta: '686', debe: 50, haber: 0 },
    ];
    const r = calcularCompteResultat(asientos);
    expect(r.cargasExplotacion).toBe(100);
    expect(r.cargasFinancieras).toBe(50);
    expect(r.resultadoAntesIS).toBe(850);
  });

  it('sin movimientos financieros ni excepcionales, esos resultados quedan a 0', () => {
    const r = calcularCompteResultat([]);
    expect(r.resultadoFinanciero).toBeCloseTo(0);
    expect(r.resultadoExcepcional).toBeCloseTo(0);
    expect(r.resultadoAntesIS).toBeCloseTo(0);
  });
});

describe('calcularBilanActivo', () => {

  const activo: ActivoInmovilizado = {
    id: 'a1',
    descripcion: 'Furgoneta',
    cuenta_pcg: '2182',
    fecha_adquisicion: '2025-01-01',
    valor_adquisicion: 12000,
    duracion_anios: 5,
    dado_de_baja_en: null,
  };

  it('trésorerie es el saldo neto de la cuenta 512', () => {
    const asientos: AsientoContable[] = [{ cuenta: '512', debe: 500, haber: 200 }];
    const r = calcularBilanActivo(asientos, [], 2026);
    expect(r.tresoreria).toBe(300);
  });

  it('créances clients es el saldo deudor de la 411, nunca negativo', () => {
    expect(calcularBilanActivo([{ cuenta: '411', debe: 1100, haber: 100 }], [], 2026).creancesClients).toBe(1000);
    expect(calcularBilanActivo([{ cuenta: '411', debe: 0, haber: 50 }], [], 2026).creancesClients).toBe(0);
  });

  it('un saldo deudor de TVA (445xx) es crédito de TVA en el activo', () => {
    const r = calcularBilanActivo([{ cuenta: '44566', debe: 80, haber: 0 }, { cuenta: '44571', debe: 0, haber: 30 }], [], 2026);
    expect(r.creditoTva).toBe(50);
  });

  it('inmovilizado neto usa el valor neto contable de cada activo en el año dado', () => {
    // 12000 / 5 = 2400/año; a 2026 (2 años completos: 2025, 2026) amortizado 4800 -> VNC 7200
    const r = calcularBilanActivo([], [activo], 2026);
    expect(r.inmovilizadoNeto).toBeCloseTo(7200);
  });

  it('total es la suma de los componentes', () => {
    const asientos: AsientoContable[] = [{ cuenta: '512', debe: 300, haber: 0 }, { cuenta: '411', debe: 1100, haber: 0 }];
    const r = calcularBilanActivo(asientos, [activo], 2026);
    expect(r.total).toBeCloseTo(r.tresoreria + r.creancesClients + r.creditoTva + r.capitalPorLiberar + r.inmovilizadoNeto);
  });
});

describe('auditoría 2026-10-01 — liasse con las clases 6 y 7 completas', () => {
  it('incluye obras en curso (7133), reprises (781) y cargas excepcionales (687), sin el IS (695)', () => {
    const asientos = [
      { cuenta: '706', debe: 0, haber: 10000 },
      { cuenta: '7133', debe: 0, haber: 2000 },
      { cuenta: '781', debe: 0, haber: 100 },
      { cuenta: '606', debe: 4000, haber: 0 },
      { cuenta: '687', debe: 300, haber: 0 },
      { cuenta: '695', debe: 900, haber: 0 },
    ];
    const r = calcularCompteResultat(asientos);
    expect(r.otrosProductosExplotacion).toBeCloseTo(2100);
    expect(r.resultadoExcepcional).toBeCloseTo(-300);
    expect(r.resultadoAntesIS).toBeCloseTo(10000 + 2100 - 4000 - 300);
    expect(r.isRegistrado).toBeCloseTo(900);
    // Misma cifra que useResultadoEjercicio: clase 7 menos clase 6 sin el 695.
    const clase7 = -asientos.filter((a) => a.cuenta.startsWith('7')).reduce((s, a) => s + a.debe - a.haber, 0);
    const clase6SinIs = asientos.filter((a) => a.cuenta.startsWith('6') && !a.cuenta.startsWith('695')).reduce((s, a) => s + a.debe - a.haber, 0);
    expect(r.resultadoAntesIS).toBeCloseTo(clase7 - clase6SinIs);
  });
});
