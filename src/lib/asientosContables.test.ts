import { describe, it, expect } from 'vitest';
import {
  construirAsientosGasto,
  construirAsientosFacturaEmision,
  construirAsientosFacturaCobro,
  construirAsientosRectificacion,
  type NuevoAsiento,
} from './asientosContables';
import type { Linea } from '../modules/finanzas/lineas';

function sumaDebe(asientos: NuevoAsiento[]) {
  return asientos.reduce((s, a) => s + a.debe, 0);
}
function sumaHaber(asientos: NuevoAsiento[]) {
  return asientos.reduce((s, a) => s + a.haber, 0);
}

describe('construirAsientosGasto', () => {
  it('gasto normal con IVA: debe cuenta+IVA deducible, haber banco, cuadrado', () => {
    const asientos = construirAsientosGasto({
      id: 'g1',
      fecha: '2026-03-10',
      descripcion: 'Material',
      proveedor: 'Ferretería X',
      cuenta_contable: '606',
      importe_base: 100,
      importe_iva: 20,
    });
    expect(sumaDebe(asientos)).toBeCloseTo(sumaHaber(asientos));
    expect(asientos.find((a) => a.cuenta === '606')?.debe).toBe(100);
    expect(asientos.find((a) => a.cuenta === '44566')?.debe).toBe(20);
    expect(asientos.find((a) => a.cuenta === '512')?.haber).toBe(120);
  });

  it('gasto sin cuenta_contable va a la cuenta de espera 471', () => {
    const asientos = construirAsientosGasto({
      id: 'g2',
      fecha: '2026-03-10',
      descripcion: null,
      proveedor: null,
      cuenta_contable: null,
      importe_base: 50,
      importe_iva: 0,
    });
    expect(asientos.some((a) => a.cuenta === '471' && a.debe === 50)).toBe(true);
    // sin IVA (0), no debe generar apunte de IVA deducible
    expect(asientos.some((a) => a.cuenta === '44566')).toBe(false);
  });

  it('gasto de amortización (cuenta 68x) va contra amortissements acumulados, no contra banco', () => {
    const asientos = construirAsientosGasto({
      id: 'g3',
      fecha: '2026-12-31',
      descripcion: 'Dotación',
      proveedor: null,
      cuenta_contable: '681',
      importe_base: 400,
      importe_iva: 0,
    });
    expect(asientos.some((a) => a.cuenta === '512')).toBe(false);
    expect(asientos.find((a) => a.cuenta === '2801')?.haber).toBe(400);
    expect(sumaDebe(asientos)).toBeCloseTo(sumaHaber(asientos));
  });
});

describe('construirAsientosFacturaEmision', () => {
  const lineaBase: Linea = {
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

  it('factura con IVA: debe clientes (con IVA), haber ventas (sin IVA) + IVA colectada, cuadrado', () => {
    const asientos = construirAsientosFacturaEmision({
      id: 'f1',
      numero: 'F-2026-0001',
      cliente_nombre: 'Cliente X',
      fecha_factura: '2026-05-01',
      lineas: [lineaBase],
    });
    expect(sumaDebe(asientos)).toBeCloseTo(sumaHaber(asientos));
    expect(asientos.find((a) => a.cuenta === '411')?.debe).toBeCloseTo(1100);
    expect(asientos.find((a) => a.cuenta === '706')?.haber).toBeCloseTo(1000);
    expect(asientos.find((a) => a.cuenta === '44571')?.haber).toBeCloseTo(100);
  });

  it('factura sin IVA no genera apunte de TVA collectée', () => {
    const lineaSinIva: Linea = { ...lineaBase, total_sin_iva: 1000, total_con_iva: 1000 };
    const asientos = construirAsientosFacturaEmision({
      id: 'f2',
      numero: 'F-2026-0002',
      cliente_nombre: 'Cliente Y',
      fecha_factura: '2026-05-01',
      lineas: [lineaSinIva],
    });
    expect(asientos.some((a) => a.cuenta === '44571')).toBe(false);
    expect(sumaDebe(asientos)).toBeCloseTo(sumaHaber(asientos));
  });
});

describe('construirAsientosFacturaCobro', () => {
  it('cobro: debe banco, haber clientes, por el monto cobrado', () => {
    const asientos = construirAsientosFacturaCobro({ id: 'f1', numero: 'F-2026-0001', cliente_nombre: 'Cliente X' }, 550, '2026-06-01');
    expect(sumaDebe(asientos)).toBeCloseTo(sumaHaber(asientos));
    expect(asientos.find((a) => a.cuenta === '512')?.debe).toBe(550);
    expect(asientos.find((a) => a.cuenta === '411')?.haber).toBe(550);
  });
});

describe('construirAsientosRectificacion', () => {
  it('invierte debe/haber de cada apunte previo y marca el concepto como rectificación', () => {
    const previos = [
      { cuenta: '606', debe: 100, haber: 0, concepto: 'Material' },
      { cuenta: '512', debe: 0, haber: 100, concepto: 'Material' },
    ];
    const asientos = construirAsientosRectificacion(previos, 'gasto', 'g1', 'creacion', '2026-07-01');
    expect(asientos).toHaveLength(2);
    expect(asientos[0]).toMatchObject({ cuenta: '606', debe: 0, haber: 100, concepto: 'Material (rectificación)' });
    expect(asientos[1]).toMatchObject({ cuenta: '512', debe: 100, haber: 0, concepto: 'Material (rectificación)' });
  });

  it('regresión: original + reversa + corregido dejan el saldo neto de cada cuenta correcto (no duplicado)', () => {
    // Gasto contabilizado con importe erróneo (100), luego rectificado a su valor correcto (150).
    const original = construirAsientosGasto({
      id: 'g1',
      fecha: '2026-07-01',
      descripcion: 'Material',
      proveedor: null,
      cuenta_contable: '606',
      importe_base: 100,
      importe_iva: 0,
    });
    const reversa = construirAsientosRectificacion(
      original.map((a) => ({ cuenta: a.cuenta, debe: a.debe, haber: a.haber, concepto: a.concepto })),
      'gasto',
      'g1',
      'creacion',
      '2026-07-02',
    );
    const corregido = construirAsientosGasto({
      id: 'g1',
      fecha: '2026-07-02',
      descripcion: 'Material',
      proveedor: null,
      cuenta_contable: '606',
      importe_base: 150,
      importe_iva: 0,
    });

    const todos = [...original, ...reversa, ...corregido];
    const saldoNeto = (cuenta: string) => todos.filter((a) => a.cuenta === cuenta).reduce((s, a) => s + (a.debe - a.haber), 0);
    // El saldo final debe reflejar únicamente el importe corregido (150), no 100+150 ni 0.
    expect(saldoNeto('606')).toBeCloseTo(150);
    expect(saldoNeto('512')).toBeCloseTo(-150);
  });
});
