import { describe, expect, it } from 'vitest';
import {
  combinacionExacta,
  comercioDeMovimiento,
  numerosFacturaEnTexto,
  reglaQueAplica,
  sugerenciaAutomatica,
  sugerirParaCobro,
  sugerirParaPago,
  type GastoLibre,
  type PagoLibre,
  type ReglaBanco,
} from './sugerenciasConciliacion';

const regla = (r: Partial<ReglaBanco>): ReglaBanco => ({
  id: r.patron ?? 'r',
  patron: 'x',
  sentido: 'pago',
  accion: 'gasto',
  proveedor_id: null,
  cuenta_contable: null,
  tipo_iva: null,
  descripcion: null,
  contrapartida: null,
  veces_aplicada: 0,
  ...r,
});

describe('comercioDeMovimiento', () => {
  it('quita prefijos de tarjeta, transferencia y la fecha final', () => {
    expect(
      comercioDeMovimiento('X7868 EASY GAS HONDARRIBIA 08/10 — Paiement par carte X7868 EASY GAS'),
    ).toBe('EASY GAS HONDARRIBIA');
    expect(comercioDeMovimiento('VIR INST vers JUAN ALCAIN JAUREG — Virement émis')).toBe(
      'JUAN ALCAIN JAUREG',
    );
    expect(comercioDeMovimiento('VIR INST de MR LAMOURET DOMINIQU — Virement')).toBe(
      'MR LAMOURET DOMINIQU',
    );
    expect(comercioDeMovimiento('B2B DIRECTION GENERALE DES FINAN — Prélèvement')).toBe(
      'DIRECTION GENERALE DES FINAN',
    );
    expect(comercioDeMovimiento('MME UZCUDUN PASCALE Virt en fav — Virement')).toBe(
      'MME UZCUDUN PASCALE',
    );
    expect(comercioDeMovimiento('HENDAYE PORT 1       08/10 10H37 — Retrait')).toBe(
      'HENDAYE PORT 1',
    );
  });
});

describe('numerosFacturaEnTexto', () => {
  it('encuentra números de factura con guiones o espacios', () => {
    expect(numerosFacturaEnTexto('VIR DUROUDIER F-2026-0006 Pose de cloisons')).toEqual([
      'F-2026-0006',
    ]);
    expect(numerosFacturaEnTexto('acompte AC 2026 0011 et ace-2026-0001')).toEqual([
      'AC-2026-0011',
      'ACE-2026-0001',
    ]);
    expect(numerosFacturaEnTexto('sin número')).toEqual([]);
  });
});

describe('reglaQueAplica', () => {
  it('elige la regla del mismo sentido con el patrón más largo, sin distinguir acentos', () => {
    const reglas = [
      regla({ patron: 'ASF' }),
      regla({ patron: 'asf biriatou' }),
      regla({ patron: 'ASF', sentido: 'cobro', id: 'c' }),
    ];
    expect(
      reglaQueAplica(
        { fecha: '2026-10-22', importe: -3.1, descripcion: 'X7868 ASF BIRIATOU VEDENE 21/10' },
        reglas,
      )?.patron,
    ).toBe('asf biriatou');
    expect(
      reglaQueAplica(
        { fecha: '2026-10-22', importe: -2, descripcion: 'X7868 ASF BIARRITZ' },
        reglas,
      )?.patron,
    ).toBe('ASF');
    expect(
      reglaQueAplica({ fecha: '2026-10-22', importe: -2, descripcion: 'MR BRICOLAGE' }, reglas),
    ).toBeNull();
  });
});

describe('combinacionExacta', () => {
  it('encuentra la combinación de menos elementos que suma exacto', () => {
    const r = combinacionExacta([907.5, 247.5, 330, 1292.5, 100], 2777.5, (x) => x);
    expect(r?.sort()).toEqual([1292.5, 247.5, 330, 907.5].sort());
    expect(combinacionExacta([10, 20], 25, (x) => x)).toBeNull();
  });
});

const pago = (p: Partial<PagoLibre>): PagoLibre => ({
  id: p.numero ?? 'p',
  factura_id: 'f',
  fecha: '2026-10-13',
  monto: 0,
  numero: null,
  cliente_nombre: null,
  ...p,
});

describe('sugerirParaCobro', () => {
  it('propone el cobro ya registrado a mano del mismo importe (caso Lamouret)', () => {
    const s = sugerirParaCobro(
      { fecha: '2026-10-29', importe: 687.5, descripcion: 'VIR INST de MR LAMOURET' },
      [pago({ numero: 'AC-2026-0011', fecha: '2026-10-30', monto: 687.5 })],
      [],
    );
    expect(s[0]).toMatchObject({ tipo: 'pagos', exacta: true });
    expect(sugerenciaAutomatica(s)?.tipo).toBe('pagos');
  });

  it('propone varios cobros del mismo día que suman el ingreso (caso Uzcudun 2 777,50)', () => {
    const pagos = [
      pago({ numero: 'F-2026-0008', monto: 907.5 }),
      pago({ numero: 'F-2026-0009', monto: 247.5 }),
      pago({ numero: 'F-2026-0010', monto: 330 }),
      pago({ numero: 'F-2026-0011', monto: 1292.5 }),
      pago({ numero: 'AC-2026-0010', fecha: '2026-10-09', monto: 1292.5 }),
    ];
    const s = sugerirParaCobro(
      { fecha: '2026-10-13', importe: 2777.5, descripcion: 'MME UZCUDUN PASCALE' },
      pagos,
      [],
    );
    const combinada = s.find((x) => x.tipo === 'pagos');
    expect(combinada?.tipo === 'pagos' && combinada.pagos.map((p) => p.numero).sort()).toEqual([
      'F-2026-0008',
      'F-2026-0009',
      'F-2026-0010',
      'F-2026-0011',
    ]);
    expect(combinada?.exacta).toBe(true);
  });

  it('usa el número de factura del concepto (caso Duroudier → F-2026-0006)', () => {
    const s = sugerirParaCobro(
      {
        fecha: '2026-10-15',
        importe: 4400,
        descripcion: 'VIR INST de M J DUROUDIER MARTIN F-2026-0006 Pose de cloisons',
      },
      [],
      [{ id: 'f6', numero: 'F-2026-0006', cliente_nombre: 'Irene Etxeberria', pendiente: 4400 }],
    );
    expect(s[0]).toMatchObject({ tipo: 'factura', exacta: true });
  });

  it('no propone nada si no hay coincidencias', () => {
    expect(
      sugerirParaCobro({ fecha: '2026-10-12', importe: 4000, descripcion: 'MR MURUAGA' }, [], []),
    ).toEqual([]);
  });
});

const gasto = (g: Partial<GastoLibre>): GastoLibre => ({
  id: g.descripcion ?? 'g',
  fecha: '2026-10-08',
  total: 0,
  proveedor: null,
  proveedor_id: null,
  descripcion: null,
  ...g,
});

describe('sugerirParaPago', () => {
  it('propone el gasto del mismo importe en la ventana de fechas (caso tarjeta Alcain)', () => {
    const s = sugerirParaPago(
      { fecha: '2026-10-09', importe: -432.31, descripcion: 'X7868 JUAN ALCAIN JAUREGUI 08/10' },
      [gasto({ total: 432.31, proveedor: 'ALKAIN' })],
    );
    expect(s[0]).toMatchObject({ tipo: 'gastos', exacta: true });
  });

  it('no propone un gasto fuera de la ventana', () => {
    expect(
      sugerirParaPago({ fecha: '2026-10-30', importe: -50, descripcion: 'x' }, [
        gasto({ total: 50, fecha: '2026-10-01' }),
      ]),
    ).toEqual([]);
  });

  it('con una regla de proveedor busca combinaciones de sus gastos de 60 días', () => {
    const r = regla({ patron: 'ALCAIN', proveedor_id: 'alkain' });
    const s = sugerirParaPago(
      { fecha: '2026-10-12', importe: -300, descripcion: 'VIR INST vers JUAN ALCAIN' },
      [
        gasto({ descripcion: 'a', total: 100, proveedor_id: 'alkain', fecha: '2026-09-20' }),
        gasto({ descripcion: 'b', total: 200, proveedor_id: 'alkain', fecha: '2026-10-01' }),
        gasto({ descripcion: 'c', total: 200, proveedor_id: 'otro', fecha: '2026-10-01' }),
      ],
      [r],
    );
    expect(s.find((x) => x.tipo === 'gastos')).toMatchObject({ exacta: false });
    expect(s[s.length - 1]).toMatchObject({ tipo: 'regla' });
    expect(sugerenciaAutomatica(s)).toBeNull();
  });
});
