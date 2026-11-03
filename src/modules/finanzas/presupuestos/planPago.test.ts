import { describe, expect, it } from 'vitest';
import { estadoPlazos, plazoQueTocaFacturar } from './planPago';
import type { PlazoPago } from './types';

const plan: PlazoPago[] = [
  { concepto: 'Acompte à la signature', porcentaje: 25.82, importe: 5170 },
  {
    concepto: 'Paiement intermédiaire',
    porcentaje: 19.98,
    importe: 4000,
    fecha_prevista: '2026-10-16',
  },
  { concepto: 'Solde à la livraison', porcentaje: 54.2, importe: 10850 },
];

describe('estadoPlazos', () => {
  it('cubre los plazos por orden con los acomptes y el último con la factura final', () => {
    const e = estadoPlazos(
      plan,
      [{ tipo: 'acompte', numero: 'AC-2026-0005', fecha_factura: '2026-09-25' }],
      '2026-11-03',
    );
    expect(e.map((x) => x.factura?.numero ?? null)).toEqual(['AC-2026-0005', null, null]);
    expect(e[1].vencido).toBe(true);
    expect(e[2].vencido).toBe(false);
    const cerrado = estadoPlazos(
      plan,
      [
        { tipo: 'acompte', numero: 'A' },
        { tipo: 'acompte', numero: 'B' },
        { tipo: 'normal', numero: 'F' },
      ],
      '2026-11-03',
    );
    expect(cerrado.every((x) => x.factura)).toBe(true);
  });
});

describe('plazoQueTocaFacturar', () => {
  it('el plazo inicial toca en cuanto se acepta el presupuesto', () => {
    expect(plazoQueTocaFacturar(plan, [], '2026-09-25')).toMatchObject({
      indice: 0,
      motivo: 'inicio',
    });
  });
  it('un plazo intermedio toca cuando llega su fecha prevista (caso Laetitia)', () => {
    const facturas = [{ tipo: 'acompte', numero: 'AC-2026-0005' }];
    expect(plazoQueTocaFacturar(plan, facturas, '2026-10-15')).toBeNull();
    expect(plazoQueTocaFacturar(plan, facturas, '2026-10-16')).toMatchObject({
      indice: 1,
      motivo: 'fecha',
    });
  });
  it('sin fecha prevista no avisa, y con factura final nunca', () => {
    const sinFecha = plan.map((p) => ({ ...p, fecha_prevista: null }));
    expect(
      plazoQueTocaFacturar(sinFecha, [{ tipo: 'acompte', numero: 'A' }], '2026-12-01'),
    ).toBeNull();
    expect(plazoQueTocaFacturar(plan, [{ tipo: 'normal', numero: 'F' }], '2026-12-01')).toBeNull();
  });
});
