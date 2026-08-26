import { describe, it, expect } from 'vitest';
import {
  limitesEjercicio,
  calcularIS,
  calcularTNS,
  calcularDividendos,
  calcularReservaLegal,
  calcularBilanPasivo,
  simularEjercicio,
  generarEcheances,
  mesesTranscurridosEjercicio,
  calcularQuotientFamiliar,
  calcularAbattementProfesional,
  calcularIRPersonal,
  calcularIRGerante,
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
    const topeAbatido = 48060 * 1.3;
    const r = calcularTNS(80000, cfgPorDefecto);
    const parteAbatida = topeAbatido * 0.74;
    const parteExceso = 80000 - topeAbatido;
    expect(r.assiette).toBeCloseTo(parteAbatida + parteExceso);
    expect(r.total).toBeCloseTo((parteAbatida + parteExceso) * 0.45);
  });
});

describe('calcularReservaLegal', () => {
  it('detrae el 5% del beneficio, sin superar el tope del 10% del capital social (Artículo 18 de los estatutos)', () => {
    const r = calcularReservaLegal(8508.5, 1000, cfgPorDefecto);
    expect(r.tope).toBe(100);
    expect(r.reservaAcumuladaPrevia).toBe(0);
    expect(r.margenDisponible).toBe(100);
    // 5% de 8508,50 = 425,425 €, pero el margen disponible hasta el tope es solo 100 €.
    expect(r.dotacion).toBeCloseTo(100);
  });

  it('sin superar el tope, detrae el 5% completo', () => {
    const r = calcularReservaLegal(1000, 1000, cfgPorDefecto);
    expect(r.dotacion).toBeCloseTo(50);
  });

  it('con la reserva ya completa (reserva_legal_acumulada = tope), no detrae nada más', () => {
    const cfg: ConfigFn = (clave, porDefecto) => (clave === 'reserva_legal_acumulada' ? 100 : porDefecto);
    const r = calcularReservaLegal(8508.5, 1000, cfg);
    expect(r.margenDisponible).toBe(0);
    expect(r.dotacion).toBe(0);
  });

  it('beneficio 0 o negativo no detrae nada', () => {
    const r = calcularReservaLegal(-500, 1000, cfgPorDefecto);
    expect(r.dotacion).toBe(0);
  });
});

describe('calcularDividendos', () => {
  it('dividendos por debajo del umbral libre (10% capital + compte courant) tributan solo al PFU', () => {
    const r = calcularDividendos(50, 1000, 0, cfgPorDefecto);
    expect(r.umbralLibre).toBe(100);
    expect(r.libre).toBe(50);
    expect(r.exceso).toBe(0);
    expect(r.pfuLibre).toBeCloseTo(15.7);
    expect(r.irExceso).toBe(0);
    expect(r.tnsExceso).toBe(0);
    expect(r.superaSeuil).toBe(false);
  });

  it('dividendos por encima del umbral reparten entre PFU (parte libre) e IR+TNS (exceso)', () => {
    const r = calcularDividendos(500, 1000, 0, cfgPorDefecto);
    expect(r.umbralLibre).toBe(100);
    expect(r.libre).toBe(100);
    expect(r.exceso).toBe(400);
    expect(r.pfuLibre).toBeCloseTo(31.4);
    expect(r.irExceso).toBeCloseTo(400 * 0.128);
    expect(r.tnsExceso).toBeCloseTo(400 * 0.45);
    expect(r.total).toBeCloseTo(31.4 + 400 * 0.128 + 400 * 0.45);
    expect(r.superaSeuil).toBe(true);
  });

  it('el compte courant medio también cuenta para el umbral libre', () => {
    const r = calcularDividendos(300, 1000, 2000, cfgPorDefecto);
    expect(r.umbralLibre).toBe(300);
    expect(r.exceso).toBe(0);
    expect(r.superaSeuil).toBe(false);
  });
});

describe('simularEjercicio', () => {
  it('encadena TNS → IS → reserva legal → dividendos igual que el ejemplo del FAQ de Salario vs Dividendos', () => {
    // Beneficio 50.000 €, rémunération 30.000 €, 50% del resto como dividendos, ejercicio de 6 meses,
    // capital social 1.000 €, sin compte courant — mismos números que el ejemplo documentado en
    // TabSalarioDividendos.tsx (regresión: si esto cambia de valor sin querer, el texto del FAQ deja
    // de ser correcto).
    const r = simularEjercicio(30000, 50, 50000, 1000, 0, 6, cfgPorDefecto);
    expect(r.tns.total).toBeCloseTo(9990, 0);
    expect(r.beneficioTrasSalario).toBeCloseTo(10010, 0);
    expect(r.is.total).toBeCloseTo(1501.5, 1);
    expect(r.reservaLegal.dotacion).toBeCloseTo(100, 0);
    expect(r.dividendos).toBeCloseTo(4204.25, 1);
    expect(r.divCalc.total).toBeCloseTo(2403.66, 1);
    expect(r.totalPrelevements).toBeCloseTo(13895.16, 1);
    expect(r.netoDisponible).toBeCloseTo(21810.59, 1);
  });

  it('sin beneficio (0), no hay IS ni dividendos, solo las cotisations TNS mínimas sobre la rémunération', () => {
    const r = simularEjercicio(20000, 100, 0, 1000, 0, 12, cfgPorDefecto);
    expect(r.beneficioTrasSalario).toBe(0);
    expect(r.is.total).toBe(0);
    expect(r.dividendos).toBe(0);
    expect(r.netoDisponible).toBeCloseTo(20000 - r.tns.total, 1);
  });
});

describe('calcularBilanPasivo', () => {
  it('suma capital social, reservas (previas + dotación), resultado del ejercicio y deuda fiscal por IS', () => {
    const is = calcularIS(30000, 6, cfgPorDefecto);
    const reservaLegal = calcularReservaLegal(8508.5, 1000, cfgPorDefecto);
    const r = calcularBilanPasivo(8508.5, reservaLegal, is, 1000);
    expect(r.capitalSocial).toBe(1000);
    expect(r.reservas).toBeCloseTo(reservaLegal.reservaAcumuladaPrevia + reservaLegal.dotacion);
    expect(r.resultadoEjercicio).toBe(8508.5);
    expect(r.dettesFiscales).toBeCloseTo(is.total);
    expect(r.dettesFournisseurs).toBe(0);
    expect(r.total).toBeCloseTo(1000 + r.reservas + 8508.5 + is.total);
  });
});

describe('calcularQuotientFamiliar', () => {
  it('soltero sin hijos: 1 parte', () => {
    expect(calcularQuotientFamiliar(false, 0, cfgPorDefecto)).toBe(1);
  });

  it('casado sin hijos: 2 partes (base del matrimonio)', () => {
    expect(calcularQuotientFamiliar(true, 0, cfgPorDefecto)).toBe(2);
  });

  it('casado con 1 hijo a cargo: 2,5 partes (situación real de Reformas Ordoñez)', () => {
    expect(calcularQuotientFamiliar(true, 1, cfgPorDefecto)).toBe(2.5);
  });

  it('casado con 3 hijos: 2 (base) + 0,5×2 (primeros dos) + 1 (tercero) = 4 partes', () => {
    expect(calcularQuotientFamiliar(true, 3, cfgPorDefecto)).toBe(4);
  });
});

describe('calcularAbattementProfesional', () => {
  it('aplica el 10% dentro de los topes', () => {
    expect(calcularAbattementProfesional(42000, cfgPorDefecto)).toBeCloseTo(4200);
  });

  it('sin ingresos, sin abattement', () => {
    expect(calcularAbattementProfesional(0, cfgPorDefecto)).toBe(0);
  });

  it('respeta el mínimo (495 €) para ingresos bajos', () => {
    expect(calcularAbattementProfesional(2000, cfgPorDefecto)).toBeCloseTo(495);
  });

  it('respeta el máximo (14.171 €) para ingresos altos', () => {
    expect(calcularAbattementProfesional(200000, cfgPorDefecto)).toBeCloseTo(14171);
  });
});

describe('calcularIRPersonal', () => {
  it('familia casada con 1 hijo (2,5 partes), 40.000 € de revenu imposable — quotient + décote aplicados', () => {
    // revenuParPart = 16.000 € → tramo 11%: (16.000-11.600)×11% = 484 € por parte → 1.210 € sin plafonar.
    // Comprobación del plafonnement (no debería activarse aquí): con solo 2 partes (matrimonio sin
    // hijo) el impôt sería 1.848 €, el ahorro real de la media parte extra es 638 €, muy por debajo
    // del tope de 1.807 € — por eso el resultado final usa el cálculo con las 2,5 partes reales.
    const r = calcularIRPersonal(40000, 2.5, cfgPorDefecto);
    expect(r.impotSinPlafon).toBeCloseTo(1210, 0);
    expect(r.impotConPartsBase).toBeCloseTo(1848, 0);
    expect(r.impotBruto).toBeCloseTo(1210, 0);
    // Décote (matrimonio): 1.483 − 45,25%×1.210 ≈ 935,48 €.
    expect(r.decote).toBeCloseTo(935.5, 0);
    expect(r.impotFinal).toBeCloseTo(274.5, 1);
  });

  it('revenu por debajo del primer tramo (por parte): impôt 0', () => {
    const r = calcularIRPersonal(20000, 2.5, cfgPorDefecto);
    expect(r.impotFinal).toBe(0);
  });

  it('el plafonnement del quotient familial limita el ahorro de las medias partes extra en rentas altas', () => {
    // Con un revenu alto, el ahorro fiscal real de pasar de 2 a 2,5 partes supera el tope de 1.807 €
    // por media parte — el impôt final debe quedar en impotConPartsBase − ahorroMaximo, no en el
    // cálculo directo con 2,5 partes (que sería más bajo de lo permitido).
    const r = calcularIRPersonal(200000, 2.5, cfgPorDefecto);
    expect(r.impotBruto).toBeCloseTo(r.impotConPartsBase - r.ahorroMaximo, 0);
    expect(r.impotBruto).toBeGreaterThan(r.impotSinPlafon);
  });
});

describe('calcularIRGerante', () => {
  it('sin ingresos del cónyuge: encadena abattement + quotient familial sobre la rémunération neta del gérant', () => {
    // Mismos 30.000 € de rémunération y 9.990 € de cotisations TNS que el ejemplo de simularEjercicio.
    const r = calcularIRGerante(30000, 9990, 0, true, 1, cfgPorDefecto);
    expect(r.remuneracionNeta).toBeCloseTo(20010);
    expect(r.abattement).toBeCloseTo(2001);
    expect(r.revenuNetImposable).toBeCloseTo(18009);
    expect(r.parts).toBe(2.5);
    // 18.009 € entre 2,5 partes = 7.203,6 €/parte, por debajo del primer tramo (11.600 €) → sin IR.
    expect(r.impotFinal).toBe(0);
  });

  it('con ingresos del cónyuge: reproduce el resultado real del simulador oficial de la DGFiP', () => {
    // Verificado a mano en simulateur-ir-ifi.impots.gouv.fr (2026-08): rémunération neta 40.020 €
    // (declarante 1) + 18.000 € del cónyuge (declarante 2), casado + 1 hijo (2,5 partes) → la
    // Administración da exactamente droits simples 2.554 €, décote 327 € e impôt net 2.227 €.
    // remuneracion/tnsTotal se pasan ya restados (40.020 = remuneración neta directamente, con
    // tnsTotal=0) porque lo que se está verificando aquí es el tramo del IR, no el cálculo de TNS.
    const r = calcularIRGerante(40020, 0, 18000, true, 1, cfgPorDefecto);
    expect(r.remuneracionNeta).toBeCloseTo(40020, 0);
    expect(r.abattement).toBeCloseTo(4002, 0);
    expect(r.abattementConyuge).toBeCloseTo(1800, 0);
    expect(r.revenuNetImposable).toBeCloseTo(52218, 0);
    expect(r.parts).toBe(2.5);
    expect(r.impotSinPlafon).toBeCloseTo(2554, 0);
    expect(r.decote).toBeCloseTo(327, 0);
    expect(r.impotFinal).toBeCloseTo(2227, 0);
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
    // Asamblea, régularisation TNS y declaración de renta del gérant aplican desde el primer ejercicio.
    expect(echeances.filter((e) => e.tipo === 'ASAMBLEA')).toHaveLength(1);
    expect(echeances.filter((e) => e.tipo === 'COTISATIONS_TNS')).toHaveLength(1);
    expect(echeances.filter((e) => e.tipo === 'DECLARACION_IR_GERANT')).toHaveLength(1);
    expect(echeances).toHaveLength(20);
  });

  it('un ejercicio completo tiene 4 ACOMPTE_IS y CFE normal, sin las excepciones de primer año', () => {
    const echeances = generarEcheances(2027, cfgPorDefecto);
    expect(echeances.filter((e) => e.tipo === 'ACOMPTE_IS')).toHaveLength(4);
    expect(echeances.filter((e) => e.tipo === 'CFE')).toHaveLength(1);
    expect(echeances.filter((e) => e.tipo === 'OTRO')).toHaveLength(0);
    expect(echeances.filter((e) => e.tipo === 'ASAMBLEA')).toHaveLength(1);
    expect(echeances.filter((e) => e.tipo === 'COTISATIONS_TNS')).toHaveLength(1);
    expect(echeances.filter((e) => e.tipo === 'DECLARACION_IR_GERANT')).toHaveLength(1);
    expect(echeances).toHaveLength(23);
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
