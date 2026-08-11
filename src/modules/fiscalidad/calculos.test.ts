import { describe, it, expect } from 'vitest';
import {
  limitesEjercicio,
  calcularIS,
  calcularTNS,
  calcularDividendos,
  generarEcheances,
  mesesTranscurridosEjercicio,
  type ConfigFn,
} from './calculos';

// Config que siempre devuelve el valor por defecto — para probar la fórmula con las tasas reales.
const cfgPorDefecto: ConfigFn = (_clave, porDefecto) => porDefecto;

describe('limitesEjercicio', () => {
  it('2026 es un ejercicio parcial de 6 meses (creación de la sociedad en julio)', () => {
    expect(limitesEjercicio(2026)).toEqual({ inicio: '2026-07-01', fin: '2026-12-31', meses: 6 });
  });

  it('cualquier otro año es un ejercicio completo de 12 meses', () => {
    expect(limitesEjercicio(2027)).toEqual({ inicio: '2027-01-01', fin: '2027-12-31', meses: 12 });
  });
});

describe('mesesTranscurridosEjercicio', () => {
  const ejercicio2026 = limitesEjercicio(2026); // { inicio: '2026-07-01', fin: '2026-12-31', meses: 6 }

  it('el primer día del ejercicio cuenta como 1 mes transcurrido', () => {
    expect(mesesTranscurridosEjercicio(ejercicio2026, new Date('2026-07-01T12:00:00'))).toBe(1);
  });

  it('a mitad de ejercicio cuenta los meses naturales transcurridos', () => {
    expect(mesesTranscurridosEjercicio(ejercicio2026, new Date('2026-09-15T12:00:00'))).toBe(3);
  });

  it('el último mes del ejercicio cuenta como el total de meses del ejercicio', () => {
    expect(mesesTranscurridosEjercicio(ejercicio2026, new Date('2026-12-20T12:00:00'))).toBe(6);
  });

  it('una fecha posterior al cierre del ejercicio no supera el total de meses', () => {
    expect(mesesTranscurridosEjercicio(ejercicio2026, new Date('2027-03-01T12:00:00'))).toBe(6);
  });

  it('un ejercicio completo (12 meses) cuenta igual', () => {
    const ejercicio2027 = limitesEjercicio(2027);
    expect(mesesTranscurridosEjercicio(ejercicio2027, new Date('2027-04-10T12:00:00'))).toBe(4);
  });
});

describe('calcularIS', () => {
  it('beneficio por debajo del plafond reducido tributa entero al 15%', () => {
    const r = calcularIS(30000, 12, cfgPorDefecto);
    expect(r.plafondReducido).toBe(42500);
    expect(r.baseReducida).toBe(30000);
    expect(r.baseNormal).toBe(0);
    expect(r.isReducido).toBeCloseTo(4500);
    expect(r.isNormal).toBe(0);
    expect(r.total).toBeCloseTo(4500);
  });

  it('beneficio por encima del plafond reparte entre tasa reducida (15%) y normal (25%)', () => {
    const r = calcularIS(50000, 12, cfgPorDefecto);
    expect(r.baseReducida).toBe(42500);
    expect(r.baseNormal).toBe(7500);
    expect(r.isReducido).toBeCloseTo(6375);
    expect(r.isNormal).toBeCloseTo(1875);
    expect(r.total).toBeCloseTo(8250);
  });

  it('el plafond reducido se prorratea por los meses del ejercicio (2026, ejercicio de 6 meses)', () => {
    const r = calcularIS(30000, 6, cfgPorDefecto);
    expect(r.plafondReducido).toBe(21250);
    expect(r.baseReducida).toBe(21250);
    expect(r.baseNormal).toBe(8750);
    expect(r.total).toBeCloseTo(21250 * 0.15 + 8750 * 0.25);
  });

  it('beneficio 0 o negativo no genera IS negativo', () => {
    const r = calcularIS(0, 12, cfgPorDefecto);
    expect(r.baseReducida).toBe(0);
    expect(r.baseNormal).toBe(0);
    expect(r.total).toBe(0);
  });

  it('usa las tasas de la config en vez de las de por defecto', () => {
    const cfg: ConfigFn = (clave) => (clave === 'is_taux_reduit' ? 0.2 : clave === 'is_plafond_reduit' ? 10000 : 0.25);
    const r = calcularIS(15000, 12, cfg);
    expect(r.plafondReducido).toBe(10000);
    expect(r.baseReducida).toBe(10000);
    expect(r.baseNormal).toBe(5000);
    expect(r.isReducido).toBeCloseTo(2000);
    expect(r.isNormal).toBeCloseTo(1250);
  });
});

describe('calcularTNS', () => {
  it('remuneración por debajo del tope abatido (PASS x 1.3) aplica el abattement entero', () => {
    const r = calcularTNS(40000, cfgPorDefecto);
    expect(r.assiette).toBeCloseTo(40000 * 0.74);
    expect(r.total).toBeCloseTo(40000 * 0.74 * 0.45);
    expect(r.mensual).toBeCloseTo(r.total / 12);
  });

  it('remuneración por encima del tope abatido tributa el exceso sin abattement', () => {
    const topeAbatido = 47100 * 1.3;
    const r = calcularTNS(80000, cfgPorDefecto);
    const parteAbatida = topeAbatido * 0.74;
    const parteExceso = 80000 - topeAbatido;
    expect(r.assiette).toBeCloseTo(parteAbatida + parteExceso);
    expect(r.total).toBeCloseTo((parteAbatida + parteExceso) * 0.45);
  });
});

describe('calcularDividendos', () => {
  it('dividendos por debajo del umbral libre (10% capital + compte courant) tributan solo al PFU', () => {
    const r = calcularDividendos(50, 1000, 0, cfgPorDefecto);
    expect(r.umbralLibre).toBe(100);
    expect(r.libre).toBe(50);
    expect(r.exceso).toBe(0);
    expect(r.pfuLibre).toBeCloseTo(15);
    expect(r.irExceso).toBe(0);
    expect(r.tnsExceso).toBe(0);
    expect(r.superaSeuil).toBe(false);
  });

  it('dividendos por encima del umbral reparten entre PFU (parte libre) e IR+TNS (exceso)', () => {
    const r = calcularDividendos(500, 1000, 0, cfgPorDefecto);
    expect(r.umbralLibre).toBe(100);
    expect(r.libre).toBe(100);
    expect(r.exceso).toBe(400);
    expect(r.pfuLibre).toBeCloseTo(30);
    expect(r.irExceso).toBeCloseTo(400 * 0.128);
    expect(r.tnsExceso).toBeCloseTo(400 * 0.45);
    expect(r.total).toBeCloseTo(30 + 400 * 0.128 + 400 * 0.45);
    expect(r.superaSeuil).toBe(true);
  });

  it('el compte courant medio también cuenta para el umbral libre', () => {
    const r = calcularDividendos(300, 1000, 2000, cfgPorDefecto);
    expect(r.umbralLibre).toBe(300);
    expect(r.exceso).toBe(0);
    expect(r.superaSeuil).toBe(false);
  });
});

describe('generarEcheances', () => {
  it('2026 (primer ejercicio): 12 CA3 + exención de acomptes + CFE inicial + solde/liasse/dépôt, sin ACOMPTE_IS', () => {
    const echeances = generarEcheances(2026, cfgPorDefecto);
    expect(echeances.filter((e) => e.tipo === 'CA3')).toHaveLength(12);
    expect(echeances.filter((e) => e.tipo === 'ACOMPTE_IS')).toHaveLength(0);
    expect(echeances.filter((e) => e.tipo === 'CFE')).toHaveLength(0);
    expect(echeances.filter((e) => e.tipo === 'OTRO')).toHaveLength(2);
    expect(echeances.filter((e) => e.tipo === 'SOLDE_IS')).toHaveLength(1);
    expect(echeances.filter((e) => e.tipo === 'LIASSE')).toHaveLength(1);
    expect(echeances.filter((e) => e.tipo === 'DEPOT_COMPTES')).toHaveLength(1);
    expect(echeances).toHaveLength(17);
  });

  it('un ejercicio completo tiene 4 ACOMPTE_IS y CFE normal, sin las excepciones de primer año', () => {
    const echeances = generarEcheances(2027, cfgPorDefecto);
    expect(echeances.filter((e) => e.tipo === 'ACOMPTE_IS')).toHaveLength(4);
    expect(echeances.filter((e) => e.tipo === 'CFE')).toHaveLength(1);
    expect(echeances.filter((e) => e.tipo === 'OTRO')).toHaveLength(0);
    expect(echeances).toHaveLength(20);
  });

  it('el CA3 de diciembre vence en enero del año siguiente', () => {
    const echeances = generarEcheances(2027, cfgPorDefecto);
    const ca3Diciembre = echeances.find((e) => e.tipo === 'CA3' && e.titulo.includes('Diciembre 2027'));
    expect(ca3Diciembre?.fecha_limite).toBe('2028-01-21');
  });

  it('las fechas límite salen ordenadas de más próxima a más lejana', () => {
    const echeances = generarEcheances(2027, cfgPorDefecto);
    const fechas = echeances.map((e) => e.fecha_limite);
    const ordenadas = [...fechas].sort((a, b) => a.localeCompare(b));
    expect(fechas).toEqual(ordenadas);
  });
});
