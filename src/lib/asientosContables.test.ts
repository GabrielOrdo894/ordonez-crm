import { describe, it, expect } from 'vitest';
import {
  construirAsientosGasto,
  construirAsientosFacturaEmision,
  construirAsientosFacturaCobro,
  construirAsientosRectificacion,
  construirAsientosRectificacionNeta,
  cuentaAmortizacionDe,
  tvaDeCobro,
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

  it('gasto de amortización (cuenta 681) va contra amortissements acumulados, no contra banco', () => {
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

  it('gasto de dotations financières (cuenta 686) NO es amortización — sí sale del banco (bug real corregido 2026-08-31)', () => {
    const asientos = construirAsientosGasto({
      id: 'g3b',
      fecha: '2026-12-31',
      descripcion: 'Dotation financière',
      proveedor: null,
      cuenta_contable: '686',
      importe_base: 120,
      importe_iva: 0,
    });
    expect(asientos.find((a) => a.cuenta === '512')?.haber).toBe(120);
    expect(asientos.some((a) => a.cuenta === '2801')).toBe(false);
    expect(sumaDebe(asientos)).toBeCloseTo(sumaHaber(asientos));
  });

  it('gasto intracomunitario: sin IVA soportado, pero autoliquida TVA due/déductible intracom, cuadrado', () => {
    const asientos = construirAsientosGasto({
      id: 'g4',
      fecha: '2026-03-10',
      descripcion: 'Material UE',
      proveedor: 'Proveedor Francia',
      cuenta_contable: '606',
      importe_base: 100,
      importe_iva: 0,
      tipo_iva: 'INTRACOM',
    });
    expect(asientos.some((a) => a.cuenta === '44566')).toBe(false);
    expect(asientos.find((a) => a.cuenta === '445662')?.debe).toBe(20);
    expect(asientos.find((a) => a.cuenta === '4452')?.haber).toBe(20);
    expect(sumaDebe(asientos)).toBeCloseTo(sumaHaber(asientos));
  });

  it('gasto de importación (fuera de UE): autoliquida TVA due/déductible sobre importaciones, cuadrado', () => {
    const asientos = construirAsientosGasto({
      id: 'g5',
      fecha: '2026-03-10',
      descripcion: 'Material fuera de UE',
      proveedor: 'Proveedor China',
      cuenta_contable: '606',
      importe_base: 100,
      importe_iva: 0,
      tipo_iva: 'IMPORTACION',
    });
    expect(asientos.some((a) => a.cuenta === '44566')).toBe(false);
    expect(asientos.find((a) => a.cuenta === '445661')?.debe).toBe(20);
    expect(asientos.find((a) => a.cuenta === '4452')?.haber).toBe(20);
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
    // TVA sur encaissements: en espera (44574) hasta el cobro.
    expect(asientos.find((a) => a.cuenta === '44574')?.haber).toBeCloseTo(100);
    expect(asientos.some((a) => a.cuenta === '44571')).toBe(false);
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
    expect(asientos.some((a) => a.cuenta === '44571' || a.cuenta === '44574')).toBe(false);
    expect(sumaDebe(asientos)).toBeCloseTo(sumaHaber(asientos));
  });

  it('factura rectificativa con IVA (totales negativos): apunte de TVA collectée invertido y cuadrado (bug real corregido 2026-09-08)', () => {
    const lineaNegativa: Linea = { ...lineaBase, cantidad: -1, total_sin_iva: -1000, total_con_iva: -1100 };
    const asientos = construirAsientosFacturaEmision({
      id: 'f3',
      numero: 'R-2026-0001',
      cliente_nombre: 'Cliente Z',
      fecha_factura: '2026-05-01',
      lineas: [lineaNegativa],
      tipo: 'rectificativa',
    });
    // Nunca un debe/haber negativo — el lado se invierte, el importe siempre en positivo.
    expect(asientos.every((a) => a.debe >= 0 && a.haber >= 0)).toBe(true);
    expect(asientos.find((a) => a.cuenta === '411')?.haber).toBeCloseTo(1100);
    expect(asientos.find((a) => a.cuenta === '706')?.debe).toBeCloseTo(1000);
    expect(asientos.find((a) => a.cuenta === '44571')?.debe).toBeCloseTo(100);
    expect(sumaDebe(asientos)).toBeCloseTo(sumaHaber(asientos));
  });
});

describe('acomptes y factura final (4191)', () => {
  const linea = (base: number, ref = 'OBR-001'): Linea => ({
    designacion: 'Obra',
    referencia: ref,
    descripcion: '',
    unidad: 'ud',
    tipo_servicio: 'Travaux',
    cantidad: 1,
    precio_unit: base,
    total_sin_iva: base,
    total_con_iva: base * 1.1,
    es_incluido: false,
  });

  it('una factura de acompte abona 4191, no 706', () => {
    const asientos = construirAsientosFacturaEmision({
      id: 'a1',
      numero: 'AC-1',
      cliente_nombre: 'X',
      fecha_factura: '2026-09-01',
      lineas: [linea(3000)],
      tipo: 'acompte',
    });
    expect(asientos.find((a) => a.cuenta === '4191')?.haber).toBeCloseTo(3000);
    expect(asientos.some((a) => a.cuenta === '706')).toBe(false);
    expect(sumaDebe(asientos)).toBeCloseTo(sumaHaber(asientos));
  });

  it('la factura final vende el total de la obra en 706 y salda el acompte de 4191', () => {
    const asientos = construirAsientosFacturaEmision({
      id: 'f9',
      numero: 'F-9',
      cliente_nombre: 'X',
      fecha_factura: '2026-10-01',
      lineas: [linea(10000), linea(-3000, 'ACOMPTE')],
      tipo: 'normal',
    });
    expect(asientos.find((a) => a.cuenta === '706')?.haber).toBeCloseTo(10000);
    expect(asientos.find((a) => a.cuenta === '4191')?.debe).toBeCloseTo(3000);
    expect(asientos.find((a) => a.cuenta === '411')?.debe).toBeCloseTo(7700);
    expect(sumaDebe(asientos)).toBeCloseTo(sumaHaber(asientos));
  });
});

describe('construirAsientosFacturaCobro — TVA sur encaissements', () => {
  it('el cobro traspasa su TVA de 44574 a 44571', () => {
    const asientos = construirAsientosFacturaCobro({ id: 'f1', numero: 'F-1', cliente_nombre: 'X', tipo_iva: 'TVA_10' }, 1100, '2026-09-10', 'p1');
    expect(asientos.find((a) => a.cuenta === '44574')?.debe).toBeCloseTo(100);
    expect(asientos.find((a) => a.cuenta === '44571')?.haber).toBeCloseTo(100);
    expect(sumaDebe(asientos)).toBeCloseTo(sumaHaber(asientos));
  });

  it('tvaDeCobro redondea a céntimos', () => {
    expect(tvaDeCobro(1000, 'TVA_20')).toBe(166.67);
    expect(tvaDeCobro(500, 'EXENTO')).toBe(0);
  });
});

describe('kilometraje y amortizaciones', () => {
  it('un gasto de kilometraje se abona a la cuenta corriente del asociado (455), no al banco', () => {
    const asientos = construirAsientosGasto({
      id: 'k1',
      fecha: '2026-09-09',
      descripcion: 'Indemnité kilométrique',
      proveedor: null,
      cuenta_contable: '6251',
      importe_base: 42.03,
      importe_iva: 0,
      km: 63,
    });
    expect(asientos.find((a) => a.cuenta === '455')?.haber).toBeCloseTo(42.03);
    expect(asientos.some((a) => a.cuenta === '512')).toBe(false);
  });

  it('cuentaAmortizacionDe da la 28xx del activo', () => {
    expect(cuentaAmortizacionDe('2154')).toBe('28154');
    expect(cuentaAmortizacionDe('2183')).toBe('28183');
    expect(cuentaAmortizacionDe('201')).toBe('2801');
    expect(cuentaAmortizacionDe(null)).toBe('2801');
  });
});

describe('construirAsientosRectificacionNeta', () => {
  const fila = (cuenta: string, debe: number, haber: number, concepto = 'AC-2026-0020 — Bea') => ({
    cuenta,
    debe,
    haber,
    concepto,
    fecha: '2026-04-20',
    pago_id: null,
  });

  it('un documento ya anulado (neto cero) no genera ninguna reversa — caso real AC-2026-0020', () => {
    const historico = [
      fila('411', 15707.59, 0),
      fila('706', 0, 14279.63),
      fila('44571', 0, 1427.96),
      fila('411', 0, 15707.59, 'AC-2026-0020 — Bea (rectificación)'),
      fila('706', 14279.63, 0, 'AC-2026-0020 — Bea (rectificación)'),
      fila('44571', 1427.96, 0, 'AC-2026-0020 — Bea (rectificación)'),
    ];
    expect(construirAsientosRectificacionNeta(historico, 'factura', 'x', 'creacion')).toEqual([]);
  });

  it('un lote duplicado se anula entero (no solo el último)', () => {
    const historico = [fila('6251', 10, 0), fila('512', 0, 10), fila('6251', 10, 0), fila('512', 0, 10)];
    const reversa = construirAsientosRectificacionNeta(historico, 'gasto', 'g', 'creacion');
    expect(reversa.find((a) => a.cuenta === '6251')?.haber).toBeCloseTo(20);
    expect(reversa.find((a) => a.cuenta === '512')?.debe).toBeCloseTo(20);
    expect(reversa.every((a) => a.concepto === 'AC-2026-0020 — Bea (rectificación)')).toBe(true);
  });
});

describe('construirAsientosFacturaCobro', () => {
  it('cobro: debe banco, haber clientes, por el monto cobrado', () => {
    const asientos = construirAsientosFacturaCobro({ id: 'f1', numero: 'F-2026-0001', cliente_nombre: 'Cliente X', tipo_iva: null }, 550, '2026-06-01');
    expect(sumaDebe(asientos)).toBeCloseTo(sumaHaber(asientos));
    expect(asientos.find((a) => a.cuenta === '512')?.debe).toBe(550);
    expect(asientos.find((a) => a.cuenta === '411')?.haber).toBe(550);
  });
});

describe('construirAsientosRectificacion', () => {
  it('invierte debe/haber de cada apunte previo, conserva su fecha original y marca el concepto como rectificación', () => {
    const previos = [
      { cuenta: '606', debe: 100, haber: 0, concepto: 'Material', fecha: '2026-07-01' },
      { cuenta: '512', debe: 0, haber: 100, concepto: 'Material', fecha: '2026-07-01' },
    ];
    const asientos = construirAsientosRectificacion(previos, 'gasto', 'g1', 'creacion');
    expect(asientos).toHaveLength(2);
    expect(asientos[0]).toMatchObject({ cuenta: '606', debe: 0, haber: 100, concepto: 'Material (rectificación)', fecha: '2026-07-01' });
    expect(asientos[1]).toMatchObject({ cuenta: '512', debe: 100, haber: 0, concepto: 'Material (rectificación)', fecha: '2026-07-01' });
  });

  it('reversa dos apuntes de cobro en fechas distintas: cada línea conserva SU fecha, no una común (bug real corregido 2026-09-08)', () => {
    const cobro1 = construirAsientosFacturaCobro({ id: 'f1', numero: 'F-1', cliente_nombre: 'X', tipo_iva: null }, 500, '2026-03-15', 'pago-1');
    const cobro2 = construirAsientosFacturaCobro({ id: 'f1', numero: 'F-1', cliente_nombre: 'X', tipo_iva: null }, 300, '2026-04-20', 'pago-2');
    const reversa = construirAsientosRectificacion(
      [...cobro1, ...cobro2].map((a) => ({ cuenta: a.cuenta, debe: a.debe, haber: a.haber, concepto: a.concepto, fecha: a.fecha })),
      'factura',
      'f1',
      'cobro',
    );
    expect(reversa.filter((a) => a.fecha === '2026-03-15')).toHaveLength(2);
    expect(reversa.filter((a) => a.fecha === '2026-04-20')).toHaveLength(2);
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
      original.map((a) => ({ cuenta: a.cuenta, debe: a.debe, haber: a.haber, concepto: a.concepto, fecha: a.fecha })),
      'gasto',
      'g1',
      'creacion',
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

describe('auditoría 2026-10-01 — acomptes de la estructura anterior, rectificativas y reembolsos', () => {
  const linea = (base: number, ref = 'OBR-001'): Linea => ({
    designacion: 'Obra',
    referencia: ref,
    descripcion: '',
    unidad: 'ud',
    tipo_servicio: 'Travaux',
    cantidad: 1,
    precio_unit: base,
    total_sin_iva: base,
    total_con_iva: base * 1.1,
    es_incluido: false,
  });

  it('el acompte de la estructura anterior (ACOMPTE_ANT) reduce la venta y no toca 4191', () => {
    // Caso Bea Vangheluwe: obra de 30.000 €, 5.000 € facturados por la estructura anterior y 10.000 € por la EURL.
    const asientos = construirAsientosFacturaEmision({
      id: 'f10',
      numero: 'F-10',
      cliente_nombre: 'X',
      fecha_factura: '2026-10-01',
      lineas: [linea(30000), linea(-10000, 'ACOMPTE'), linea(-5000, 'ACOMPTE_ANT')],
      tipo: 'normal',
    });
    expect(asientos.find((a) => a.cuenta === '706')?.haber).toBeCloseTo(25000);
    expect(asientos.find((a) => a.cuenta === '4191')?.debe).toBeCloseTo(10000);
    expect(sumaDebe(asientos)).toBeCloseTo(sumaHaber(asientos));
  });

  it('rectificativa de una factura no cobrada: toda su TVA sale de 44574, nada a 44571', () => {
    const asientos = construirAsientosFacturaEmision({
      id: 'r1',
      numero: 'R-1',
      cliente_nombre: 'X',
      fecha_factura: '2026-10-01',
      lineas: [linea(-1000)],
      tipo: 'rectificativa',
      tipo_original: 'normal',
      fraccion_tva_exigible: 0,
    });
    expect(asientos.some((a) => a.cuenta === '44571')).toBe(false);
    expect(asientos.find((a) => a.cuenta === '44574')?.debe).toBeCloseTo(100);
    expect(asientos.find((a) => a.cuenta === '706')?.debe).toBeCloseTo(1000);
    expect(sumaDebe(asientos)).toBeCloseTo(sumaHaber(asientos));
  });

  it('rectificativa de una factura cobrada a medias: reparte la TVA entre 44571 y 44574', () => {
    const asientos = construirAsientosFacturaEmision({
      id: 'r2',
      numero: 'R-2',
      cliente_nombre: 'X',
      fecha_factura: '2026-10-01',
      lineas: [linea(-1000)],
      tipo: 'rectificativa',
      fraccion_tva_exigible: 0.5,
    });
    expect(asientos.find((a) => a.cuenta === '44571')?.debe).toBeCloseTo(50);
    expect(asientos.find((a) => a.cuenta === '44574')?.debe).toBeCloseTo(50);
    expect(sumaDebe(asientos)).toBeCloseTo(sumaHaber(asientos));
  });

  it('rectificativa de un acompte: anula anticipo en 4191, no venta', () => {
    const asientos = construirAsientosFacturaEmision({
      id: 'r3',
      numero: 'R-3',
      cliente_nombre: 'X',
      fecha_factura: '2026-10-01',
      lineas: [linea(-3000)],
      tipo: 'rectificativa',
      tipo_original: 'acompte',
    });
    expect(asientos.find((a) => a.cuenta === '4191')?.debe).toBeCloseTo(3000);
    expect(asientos.some((a) => a.cuenta === '706')).toBe(false);
  });

  it('reembolso de una rectificativa (pago negativo): 411 al debe, 512 al haber, sin TVA', () => {
    const asientos = construirAsientosFacturaCobro(
      { id: 'r1', numero: 'R-1', cliente_nombre: 'X', tipo_iva: 'TVA_10', tipo: 'rectificativa' },
      -1100,
      '2026-10-05',
      'p9',
    );
    expect(asientos).toHaveLength(2);
    expect(asientos.find((a) => a.cuenta === '411')?.debe).toBeCloseTo(1100);
    expect(asientos.find((a) => a.cuenta === '512')?.haber).toBeCloseTo(1100);
    expect(asientos.every((a) => a.pago_id === 'p9' && a.debe >= 0 && a.haber >= 0)).toBe(true);
  });
});
