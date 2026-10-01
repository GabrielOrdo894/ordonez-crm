import { describe, expect, it } from 'vitest';
import { codificarLatin9, construirFec, nombreFicheroFec, type AsientoFec } from './fec';

const base = { documento_tipo: 'factura', tipo_evento: 'creacion', pago_id: null, created_at: '2026-09-24T10:00:00Z', concepto: 'F-1 — Cliente' };
const asientos: AsientoFec[] = [
  { ...base, id: '1', fecha: '2026-09-24', cuenta: '411', debe: 605, haber: 0, documento_id: 'f1' },
  { ...base, id: '2', fecha: '2026-09-24', cuenta: '706', debe: 0, haber: 550, documento_id: 'f1' },
  { ...base, id: '3', fecha: '2026-09-24', cuenta: '44574', debe: 0, haber: 55, documento_id: 'f1' },
  { ...base, id: '4', fecha: '2026-09-25', cuenta: '512', debe: 605, haber: 0, documento_id: 'f1', tipo_evento: 'cobro', pago_id: 'p1' },
  { ...base, id: '5', fecha: '2026-09-25', cuenta: '411', debe: 0, haber: 605, documento_id: 'f1', tipo_evento: 'cobro', pago_id: 'p1' },
  { ...base, id: '6', fecha: '2026-04-20', cuenta: '411', debe: 10, haber: 0, documento_id: 'fuera' },
];

describe('construirFec', () => {
  const fec = construirFec(asientos, { inicio: '2026-07-01', fin: '2026-12-31' }, new Map([['f1', 'F-2026-0001']]));
  const filas = fec.split('\r\n').filter(Boolean).map((l) => l.split('\t'));

  it('cabecera de 18 columnas y solo apuntes del ejercicio', () => {
    expect(filas[0]).toHaveLength(18);
    expect(filas).toHaveLength(6);
    expect(filas.every((f) => f.length === 18)).toBe(true);
  });

  it('un número de escritura por lote y diario, con fechas AAAAMMJJ y coma decimal', () => {
    expect(filas[1].slice(0, 5)).toEqual(['VE', 'Ventes', 'VE00001', '20260924', '411']);
    expect(filas[4].slice(0, 3)).toEqual(['BQ', 'Banque', 'BQ00001']);
    expect(filas[1][8]).toBe('F-2026-0001');
    expect(filas[1][11]).toBe('605,00');
    expect(filas[2][12]).toBe('550,00');
  });

  it('cada escritura cuadra', () => {
    const porEscritura = new Map<string, number>();
    for (const f of filas.slice(1)) {
      const d = Number(f[11].replace(',', '.')) - Number(f[12].replace(',', '.'));
      porEscritura.set(f[2], (porEscritura.get(f[2]) ?? 0) + d);
    }
    expect([...porEscritura.values()].every((v) => Math.abs(v) < 0.001)).toBe(true);
  });
});

describe('utilidades FEC', () => {
  it('nombre del fichero: SIREN + FEC + fecha de cierre', () => {
    expect(nombreFicheroFec('123 456 789', '2026-12-31')).toBe('123456789FEC20261231.txt');
  });

  it('codifica en ISO 8859-15 (€ en 0xA4, acentos en Latin-1)', () => {
    expect(Array.from(codificarLatin9('é€'))).toEqual([0xe9, 0xa4]);
  });
});

describe('FEC — numeración estable (auditoría 2026-10-01)', () => {
  it('una escritura nueva con fecha atrasada recibe el número siguiente y no renumera las anteriores', () => {
    const tardia: AsientoFec[] = [
      { ...base, id: '7', fecha: '2026-09-01', cuenta: '411', debe: 0, haber: 10, documento_id: 'f2', created_at: '2026-10-01T09:00:00Z' },
      { ...base, id: '8', fecha: '2026-09-01', cuenta: '706', debe: 10, haber: 0, documento_id: 'f2', created_at: '2026-10-01T09:00:00Z' },
    ];
    const filas = construirFec([...asientos, ...tardia], { inicio: '2026-07-01', fin: '2026-12-31' }, new Map())
      .split('\r\n')
      .filter(Boolean)
      .map((l) => l.split('\t'));
    expect(filas.find((f) => f[3] === '20260924')?.[2]).toBe('VE00001');
    expect(filas.find((f) => f[3] === '20260901')?.[2]).toBe('VE00002');
  });

  it('ValidDate en hora de París', () => {
    const tarde: AsientoFec[] = [
      { ...base, id: '9', fecha: '2026-09-30', cuenta: '411', debe: 1, haber: 0, documento_id: 'f3', created_at: '2026-09-30T23:30:00Z' },
    ];
    const fila = construirFec(tarde, { inicio: '2026-07-01', fin: '2026-12-31' }, new Map()).split('\r\n')[1].split('\t');
    expect(fila[15]).toBe('20261001');
  });
});
