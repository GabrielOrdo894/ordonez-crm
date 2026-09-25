import { describe, it, expect } from 'vitest';
import { facturaUnicaParaCobro, pendienteDeCobro } from './conciliacionBancaria';
import type { Linea } from '../modules/finanzas/lineas';
import type { TipoFactura } from '../modules/finanzas/facturas/types';

function factura(
  id: string,
  totalConIva: number,
  montoPagado: number | null = null,
  tipo: TipoFactura = 'normal',
) {
  return {
    id,
    tipo,
    monto_pagado: montoPagado,
    lineas: [{ total_con_iva: totalConIva, es_incluido: false } as Linea],
  };
}

describe('pendienteDeCobro', () => {
  it('resta lo ya cobrado del total con IVA', () => {
    expect(pendienteDeCobro(factura('a', 10340, 5170))).toBe(5170);
    expect(pendienteDeCobro(factura('a', 10340))).toBe(10340);
  });
});

describe('facturaUnicaParaCobro', () => {
  it('devuelve la factura cuando el importe pendiente coincide al céntimo', () => {
    const f = [factura('a', 1200), factura('b', 5170)];
    expect(facturaUnicaParaCobro(5170, f)?.id).toBe('b');
  });

  it('usa el pendiente, no el total, para un segundo pago', () => {
    const f = [factura('a', 10340, 5170)];
    expect(facturaUnicaParaCobro(5170, f)?.id).toBe('a');
    expect(facturaUnicaParaCobro(10340, f)).toBeNull();
  });

  it('no adivina si hay dos facturas con el mismo pendiente', () => {
    const f = [factura('a', 5170), factura('b', 5170)];
    expect(facturaUnicaParaCobro(5170, f)).toBeNull();
  });

  it('no concilia con importes aproximados', () => {
    expect(facturaUnicaParaCobro(5169.9, [factura('a', 5170)])).toBeNull();
  });

  it('ignora rectificativas y cargos (importe negativo)', () => {
    expect(facturaUnicaParaCobro(500, [factura('r', 500, null, 'rectificativa')])).toBeNull();
    expect(facturaUnicaParaCobro(-500, [factura('a', 500)])).toBeNull();
  });
});
