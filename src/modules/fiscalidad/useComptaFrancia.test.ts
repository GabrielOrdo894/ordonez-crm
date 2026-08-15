import { describe, it, expect } from 'vitest';
import { saldoNetoCuentas, calcularCompteResultat, calcularBilanActivo, type AsientoContable, type FacturaPendiente } from './useComptaFrancia';
import type { ActivoInmovilizado } from '../../lib/inmovilizado';
import type { Linea } from '../finanzas/lineas';

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
  it('ventas (70x) en positivo, cargas (60-65x, 68x) en positivo, resultado = ventas - cargas', () => {
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

  it('sin movimientos financieros ni excepcionales, esos resultados quedan a 0', () => {
    const r = calcularCompteResultat([]);
    expect(r.resultadoFinanciero).toBeCloseTo(0);
    expect(r.resultadoExcepcional).toBeCloseTo(0);
    expect(r.resultadoAntesIS).toBeCloseTo(0);
  });
});

describe('calcularBilanActivo', () => {
  const linea: Linea = {
    designacion: 'Obra',
    referencia: 'OBR-001',
    descripcion: '',
    unidad: 'ud',
    tipo_servicio: 'Travaux',
    cantidad: 1,
    precio_unit: 1000,
    total_sin_iva: 1000,
    total_con_iva: 1100,
    es_incluido: false,
  };
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
    const r = calcularBilanActivo(asientos, [], [], 2026);
    expect(r.tresoreria).toBe(300);
  });

  it('créances clients suma el pendiente de cobro (total con IVA - pagado), nunca negativo', () => {
    const facturas: FacturaPendiente[] = [
      { lineas: [linea], monto_pagado: 100 }, // pendiente: 1000
      { lineas: [linea], monto_pagado: 1100 }, // ya pagada de más, no debe restar del total
    ];
    const r = calcularBilanActivo([], facturas, [], 2026);
    expect(r.creancesClients).toBe(1000);
  });

  it('inmovilizado neto usa el valor neto contable de cada activo en el año dado', () => {
    // 12000 / 5 = 2400/año; a 2026 (2 años completos: 2025, 2026) amortizado 4800 -> VNC 7200
    const r = calcularBilanActivo([], [], [activo], 2026);
    expect(r.inmovilizadoNeto).toBeCloseTo(7200);
  });

  it('total es la suma de los tres componentes', () => {
    const asientos: AsientoContable[] = [{ cuenta: '512', debe: 300, haber: 0 }];
    const facturas: FacturaPendiente[] = [{ lineas: [linea], monto_pagado: 0 }];
    const r = calcularBilanActivo(asientos, facturas, [activo], 2026);
    expect(r.total).toBeCloseTo(r.tresoreria + r.creancesClients + r.inmovilizadoNeto);
  });
});
