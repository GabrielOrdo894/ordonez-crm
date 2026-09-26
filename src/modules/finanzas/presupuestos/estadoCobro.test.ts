import { describe, it, expect } from 'vitest';
import { estadoCobroPresupuesto, type FacturaParaCobro } from './estadoCobro';
import type { Linea } from '../lineas';

const presupuesto = (estado = 'Aceptado') => ({
  id: 'p1',
  estado,
  lineas: [{ total_con_iva: 10340, es_incluido: false } as Linea],
});
const f = (
  tipo: string,
  estado_cobro: string,
  monto_pagado: number | null,
  presupuesto_id = 'p1',
): FacturaParaCobro => ({
  presupuesto_id,
  tipo,
  estado_cobro,
  monto_pagado,
});

describe('estadoCobroPresupuesto', () => {
  it('solo aplica a presupuestos aceptados', () => {
    expect(estadoCobroPresupuesto(presupuesto('Pendiente'), [])).toBeNull();
  });
  it('Aceptado mientras no hay ningún cobro', () => {
    expect(estadoCobroPresupuesto(presupuesto(), [f('acompte', 'Pendiente', null)])).toBe(
      'Aceptado',
    );
  });
  it('Primer pago recibido con el acompte cobrado', () => {
    expect(estadoCobroPresupuesto(presupuesto(), [f('acompte', 'Cobrada', 5170)])).toBe(
      'Primer pago recibido',
    );
  });
  it('Pagado cuando se cobra el total', () => {
    expect(
      estadoCobroPresupuesto(presupuesto(), [
        f('acompte', 'Cobrada', 5170),
        f('normal', 'Cobrada', 5170),
      ]),
    ).toBe('Pagado');
  });
  it('Pagado con factura final cobrada aunque el total cambiase (avenant)', () => {
    expect(
      estadoCobroPresupuesto(presupuesto(), [
        f('acompte', 'Cobrada', 5170),
        f('normal', 'Cobrada', 4000),
      ]),
    ).toBe('Pagado');
  });
  it('no cuenta facturas de otros presupuestos ni rectificativas', () => {
    expect(
      estadoCobroPresupuesto(presupuesto(), [
        f('normal', 'Cobrada', 10340, 'otro'),
        f('rectificativa', 'Cobrada', 10340),
      ]),
    ).toBe('Aceptado');
  });
});
