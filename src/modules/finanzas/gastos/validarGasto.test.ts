import { describe, expect, it } from 'vitest';
import { validarGasto, type DatosValidacionGasto } from './validarGasto';

const completo: DatosValidacionGasto = {
  fecha: '2026-09-29',
  importe_base: 500,
  importe_iva: 100,
  tipo_iva: 'TVA_20',
  cuenta_contable: '6063',
  proveedor: 'Leroy Merlin',
  num_factura_proveedor: 'F-123',
  adjunto_url: 'gastos/x.jpg',
  km: null,
  proveedorIdentificador: 'FR12345678901',
};

describe('validarGasto', () => {
  it('acepta un gasto completo', () => {
    expect(validarGasto(completo)).toEqual([]);
  });

  it('exige justificante, proveedor, cuenta e importe', () => {
    const faltan = validarGasto({ ...completo, adjunto_url: null, proveedor: '', cuenta_contable: null, importe_base: 0, importe_iva: 0 });
    expect(faltan).toEqual(['la categoría contable', 'el importe', 'el proveedor', 'el justificante (foto o PDF)']);
  });

  it('un ticket ≤ 150 € HT no necesita nº de factura ni identificador fiscal', () => {
    expect(validarGasto({ ...completo, importe_base: 150, importe_iva: 30, num_factura_proveedor: null, proveedorIdentificador: null })).toEqual([]);
  });

  it('por encima de 150 € HT exige nº de factura e identificador fiscal', () => {
    const faltan = validarGasto({ ...completo, importe_base: 150.01, num_factura_proveedor: '', proveedorIdentificador: null });
    expect(faltan).toHaveLength(2);
  });

  it('intracomunitario pequeño también exige nº de factura e identificador', () => {
    expect(validarGasto({ ...completo, tipo_iva: 'INTRACOM', importe_base: 40, importe_iva: 0, num_factura_proveedor: null })).toEqual([
      'el nº de factura del proveedor',
    ]);
  });

  it('kilometraje y amortización no piden proveedor ni justificante', () => {
    const km = { ...completo, km: 63, proveedor: null, adjunto_url: null, cuenta_contable: '6251', num_factura_proveedor: null };
    expect(validarGasto(km)).toEqual([]);
    const amort = { ...completo, cuenta_contable: '681', proveedor: null, adjunto_url: null, importe_iva: 0 };
    expect(validarGasto(amort)).toEqual([]);
  });
});
