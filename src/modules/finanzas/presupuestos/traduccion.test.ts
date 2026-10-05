import { describe, expect, it } from 'vitest';
import type { Linea } from '../lineas';
import type { Presupuesto, TraduccionPresupuesto } from './types';
import { fuenteTraduccion, mismoTextoTraducible, traduccionDesactualizada } from './traduccion';

const linea = (designacion: string, precio = 100, descripcion = 'detalle'): Linea => ({
  designacion,
  referencia: 'REF-01',
  descripcion,
  unidad: 'forfait',
  tipo_servicio: 'Travaux',
  cantidad: 1,
  precio_unit: precio,
  total_sin_iva: precio,
  total_con_iva: precio * 1.1,
  es_incluido: false,
});

type Base = Pick<Presupuesto, 'lineas' | 'nota' | 'plan_pago' | 'traduccion'>;

const original: Base = {
  lineas: [linea('Dépose du sol'), linea('Peinture', 450)],
  nota: null,
  plan_pago: [{ concepto: 'Acompte à la signature', porcentaje: 100, importe: 550 }],
};

const traducir = (p: Base, conFuente = true): TraduccionPresupuesto => ({
  idioma: 'Español',
  lineas: p.lineas.map((l) => ({ ...l, designacion: `ES ${l.designacion}` })),
  nota: null,
  plan_pago: p.plan_pago.map((pl) => ({ ...pl, concepto: 'Pago a la firma' })),
  generado_en: '2026-10-05T00:00:00Z',
  ...(conFuente ? { fuente: fuenteTraduccion(p) } : {}),
});

describe('traduccionDesactualizada', () => {
  it('sin traducción no hay nada desactualizado', () => {
    expect(traduccionDesactualizada(original)).toBe(false);
  });

  it('recién generada está al día', () => {
    expect(traduccionDesactualizada({ ...original, traduccion: traducir(original) })).toBe(false);
  });

  it('detecta una línea añadida', () => {
    const p = { ...original, traduccion: traducir(original) };
    expect(traduccionDesactualizada({ ...p, lineas: [...p.lineas, linea('Électricité')] })).toBe(true);
  });

  it('detecta un cambio de texto con el mismo número de líneas', () => {
    const p = { ...original, traduccion: traducir(original) };
    const lineas = [linea('Dépose du sol', 100, 'pose linéaire'), p.lineas[1]];
    expect(traduccionDesactualizada({ ...p, lineas })).toBe(true);
  });

  it('detecta un cambio de precio o de importe del plan de pago aunque no guarde la fuente', () => {
    const p = { ...original, traduccion: traducir(original, false) };
    expect(traduccionDesactualizada({ ...p, lineas: [linea('Dépose du sol', 200), p.lineas[1]] })).toBe(true);
    expect(traduccionDesactualizada({ ...p, plan_pago: [{ ...p.plan_pago[0], importe: 600 }] })).toBe(true);
  });

  it('sin fuente guardada no puede detectar un cambio solo de texto', () => {
    const p = { ...original, traduccion: traducir(original, false) };
    expect(traduccionDesactualizada({ ...p, nota: 'Nouvelle note' })).toBe(false);
  });

  it('nota vacía y nota null son lo mismo, y no depende del orden de claves de la fuente', () => {
    const traduccion = traducir(original);
    traduccion.fuente = {
      plan_pago: traduccion.fuente!.plan_pago,
      nota: '',
      lineas: traduccion.fuente!.lineas.map((l) => ({ descripcion: l.descripcion, designacion: l.designacion })),
    };
    expect(traduccionDesactualizada({ ...original, traduccion })).toBe(false);
  });
});

describe('mismoTextoTraducible', () => {
  it('ignora cambios que no son texto traducible', () => {
    expect(mismoTextoTraducible(original, { ...original, lineas: [linea('Dépose du sol', 999), original.lineas[1]] })).toBe(true);
    expect(mismoTextoTraducible(original, { ...original, nota: 'Nouvelle note' })).toBe(false);
  });
});
