import type { NuevaEcheance } from './types';

export type ConfigFn = (clave: string, porDefecto: number) => number;

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function iso(anio: number, mes1: number, dia: number) {
  return `${anio}-${String(mes1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

export function limitesEjercicio(anio: number) {
  if (anio === 2026) return { inicio: '2026-07-01', fin: '2026-12-31', meses: 6 };
  return { inicio: iso(anio, 1, 1), fin: iso(anio, 12, 31), meses: 12 };
}

// Meses transcurridos del ejercicio hasta hoy (o hasta el cierre, si el ejercicio ya terminó) —
// para prorratear gastos de "todo el ejercicio" (rémunération anual, cotisations) a la misma
// escala que `useResultadoEjercicio`, que solo suma facturas/gastos hasta hoy, no del ejercicio
// completo. Sin este prorrateo, "beneficio neto" resta un coste de ejercicio completo a un
// beneficio parcial y sale en 0 € casi todo el año, saltando de golpe cerca del cierre (bug real
// corregido 2026-08-11 en TabIS.tsx/DashboardFiscal.tsx/useAlertasFiscales.ts).
export function mesesTranscurridosEjercicio(ejercicio: { inicio: string; fin: string; meses: number }, hoy: Date = new Date()) {
  const inicio = new Date(`${ejercicio.inicio}T00:00:00`);
  const fin = new Date(`${ejercicio.fin}T00:00:00`);
  const referencia = hoy < fin ? hoy : fin;
  const meses = (referencia.getFullYear() - inicio.getFullYear()) * 12 + (referencia.getMonth() - inicio.getMonth()) + 1;
  return Math.min(ejercicio.meses, Math.max(1, meses));
}

// Meses del ejercicio en los que ya se cobra la rémunération (desde `desde`, o desde el inicio del
// ejercicio si es null), contados hasta hoy o hasta el cierre — mismo criterio que
// mesesTranscurridosEjercicio. 0 si todavía no ha empezado.
export function mesesRemuneradosEjercicio(
  ejercicio: { inicio: string; fin: string; meses: number },
  desde: string | null,
  hoy: Date = new Date(),
) {
  const inicio = desde && desde > ejercicio.inicio ? desde : ejercicio.inicio;
  if (inicio > ejercicio.fin) return 0;
  const transcurridos = mesesTranscurridosEjercicio(ejercicio, hoy);
  const d = new Date(`${inicio}T00:00:00`);
  const e = new Date(`${ejercicio.inicio}T00:00:00`);
  const mesesAntes = (d.getFullYear() - e.getFullYear()) * 12 + (d.getMonth() - e.getMonth());
  return Math.max(0, transcurridos - mesesAntes);
}

export function calcularIS(beneficio: number, meses: number, config: ConfigFn) {
  const tasaReducida = config('is_taux_reduit', 0.15);
  const tasaNormal = config('is_taux_normal', 0.25);
  const plafondReducido = config('is_plafond_reduit', 42500) * (meses / 12);
  const baseReducida = Math.max(0, Math.min(beneficio, plafondReducido));
  const baseNormal = Math.max(0, beneficio - plafondReducido);
  const isReducido = baseReducida * tasaReducida;
  const isNormal = baseNormal * tasaNormal;
  return { plafondReducido, baseReducida, baseNormal, isReducido, isNormal, total: isReducido + isNormal };
}

// Convención única en todo el módulo (decisión de Gabriel 2026-10-09): la «rémunération» es NETA, lo
// que le llega al banco al gérant. Las cotisations TNS las paga la société aparte, encima de ese
// importe. Antes unas funciones la trataban como neta y otras como bruta, y las cotisations se
// restaban dos veces (auditoría fiscal 2026-10-09, hallazgo C1).
// Cotisations de un artisan/commerçant sobre su assiette (ya con el abattement del 26 %), con el baremo
// de la URSSAF para 2026 (urssaf.fr «Taux de cotisations des artisans, commerçants», contrastado
// 2026-10-09). Hasta esa fecha se aplicaba un tipo global único del 45 %, que para una rémunération de
// 24.000 € daba unos 980 € de más al año: el tipo real ronda el 41 % de la assiette.
// Los tipos «progresivos» de la maladie y las allocations familiales suben en línea recta entre los dos
// extremos de cada tramo y se aplican a toda la assiette.
export function cotisacionesSobreAssiette(assiette: number, config: ConfigFn) {
  const pass = config('pass_2026', 48060);
  const lineal = (x: number, x0: number, x1: number, t0: number, t1: number) => t0 + ((t1 - t0) * (x - x0)) / (x1 - x0);
  let tauxMaladie = 0;
  if (assiette < 0.2 * pass) tauxMaladie = 0;
  else if (assiette < 0.4 * pass) tauxMaladie = lineal(assiette, 0.2 * pass, 0.4 * pass, 0, 0.015);
  else if (assiette < 0.6 * pass) tauxMaladie = lineal(assiette, 0.4 * pass, 0.6 * pass, 0.015, 0.04);
  else if (assiette < 1.1 * pass) tauxMaladie = lineal(assiette, 0.6 * pass, 1.1 * pass, 0.04, 0.065);
  else if (assiette < 2 * pass) tauxMaladie = lineal(assiette, 1.1 * pass, 2 * pass, 0.065, 0.077);
  else if (assiette < 3 * pass) tauxMaladie = lineal(assiette, 2 * pass, 3 * pass, 0.077, 0.085);
  const maladie = assiette < 3 * pass ? assiette * tauxMaladie : 3 * pass * 0.085 + (assiette - 3 * pass) * 0.065;
  // Mínimos anuales: IJ sobre el 40 % del PASS, retraite de base sobre 450 Smic horarios (5.409 €) e
  // invalidité-décès sobre el 11,5 % del PASS.
  const indemnites = Math.min(Math.max(assiette, 0.4 * pass), 5 * pass) * 0.005;
  const retraiteBase = Math.max(Math.min(assiette, pass) * 0.1787 + Math.max(0, assiette - pass) * 0.0072, config('tns_retraite_base_min', 967));
  const retraiteComplementaire = Math.min(assiette, pass) * 0.081 + Math.max(0, Math.min(assiette, 4 * pass) - pass) * 0.091;
  const invaliditeDeces = Math.min(Math.max(assiette, 0.115 * pass), pass) * 0.013;
  let tauxAf = 0;
  if (assiette >= 1.4 * pass) tauxAf = 0.031;
  else if (assiette > 1.1 * pass) tauxAf = lineal(assiette, 1.1 * pass, 1.4 * pass, 0, 0.031);
  const allocationsFamiliales = assiette * tauxAf;
  const csgCrds = assiette * 0.097;
  // Contribution à la formation professionnelle de un artisan: 0,29 % del PASS, fija.
  const formation = pass * config('tns_cfp_pct', 0.0029);
  const total = maladie + indemnites + retraiteBase + retraiteComplementaire + invaliditeDeces + allocationsFamiliales + csgCrds + formation;
  return { maladie, indemnites, retraiteBase, retraiteComplementaire, invaliditeDeces, allocationsFamiliales, csgCrds, formation, total };
}

export function calcularTNS(remuneracionAnual: number, config: ConfigFn) {
  const abattementPct = config('tns_abattement', 0.26);
  const pass = config('pass_2026', 48060);
  // Assiette única (reforma URSSAF, revenus desde 2025): se parte del revenu BRUTO = rémunération
  // + las propias cotisations pagadas por la société, y se le resta un abattement del 26 % acotado
  // entre el 1,76 % y el 130 % del PASS (el tope se aplica al abattement, no a la rémunération). Como
  // las cotisations dependen de sí mismas, se resuelve por iteración (converge en pocas vueltas).
  let total = 0;
  let assiette = 0;
  let desglose = cotisacionesSobreAssiette(0, config);
  for (let i = 0; i < 80; i++) {
    const bruto = remuneracionAnual + total;
    const abattement = Math.min(Math.max(bruto * abattementPct, pass * 0.0176), pass * 1.3);
    assiette = Math.max(0, bruto - abattement);
    desglose = cotisacionesSobreAssiette(assiette, config);
    const siguiente = desglose.total;
    if (Math.abs(siguiente - total) < 0.005) {
      total = siguiente;
      break;
    }
    total = siguiente;
  }
  if (remuneracionAnual <= 0) {
    total = 0;
    assiette = 0;
    desglose = { maladie: 0, indemnites: 0, retraiteBase: 0, retraiteComplementaire: 0, invaliditeDeces: 0, allocationsFamiliales: 0, csgCrds: 0, formation: 0, total: 0 };
  }
  // CSG/CRDS no deducible (2,9 de los 9,7 puntos; los otros 6,8 sí son deducibles): se suma a la
  // rémunération neta para obtener la casilla 1GB de la 2042 (art. 62 CGI, BOI-RSA-GER-20 §110).
  const csgNoDeducible = assiette * config('csg_no_deducible_pct', 0.029);
  // Revenu brut social: lo que se declara en el volet social de la 2042 (rúbrica DSEC desde la campaña
  // 2026) — neto percibido + todas las cotisations pagadas por la société, sin restar nada.
  const brutoSocial = remuneracionAnual > 0 ? remuneracionAnual + total : 0;
  return { assiette, total, mensual: total / 12, csgNoDeducible, desglose, brutoSocial, tauxEfectivo: assiette > 0 ? total / assiette : 0 };
}

// Article 18 des statuts (verificado contra los estatutos reales, auditoría 2026-08-12): del
// beneficio de cada ejercicio se detrae un 5% para la reserva legal ANTES de que el resto quede a
// disposición del associé unique para repartir como dividendos, hasta que esa reserva alcance el
// 10% del capital social. Con capitalSocial = 1000 € el tope son solo 100 €, pero es una detracción
// obligatoria que el simulador de dividendos no aplicaba antes de esta corrección. reservaAcumuladaPrevia
// se guarda en fiscal_config (clave reserva_legal_acumulada) y hay que actualizarla a mano cada
// ejercicio con lo ya dotado — el CRM no lleva la cuenta automáticamente entre ejercicios.
// `reservaEnLibro`: reserva ya registrada en la cuenta 106 (si se pasa, manda sobre la configuración).
// `reportANouveauNegativo`: pérdidas anteriores pendientes — el art. L232-11 Code de commerce obliga a
// absorberlas antes de dotar la reserva legal con el beneficio del ejercicio.
export function calcularReservaLegal(
  beneficioTrasIS: number,
  capitalSocial: number,
  config: ConfigFn,
  reservaEnLibro?: number,
  reportANouveauNegativo = 0,
) {
  const pct = config('reserva_legal_pct', 0.05);
  const topePct = config('reserva_legal_tope_pct', 0.1);
  const reservaAcumuladaPrevia = reservaEnLibro ?? config('reserva_legal_acumulada', 0);
  const tope = capitalSocial * topePct;
  const margenDisponible = Math.max(0, tope - reservaAcumuladaPrevia);
  const beneficioDistribuible = Math.max(0, beneficioTrasIS - Math.max(0, reportANouveauNegativo));
  const dotacion = Math.min(beneficioDistribuible * pct, margenDisponible);
  return { pct, tope, reservaAcumuladaPrevia, margenDisponible, dotacion };
}

export function calcularDividendos(
  dividendos: number,
  capitalSocial: number,
  compteCourantMedio: number,
  config: ConfigFn,
) {
  const seuilPct = config('dividendes_seuil_capital', 0.1);
  const pfuTotal = config('pfu_total', 0.314);
  const tauxTNS = config('tns_taux_global', 0.45);
  const umbralLibre = Math.max(0, (capitalSocial + compteCourantMedio) * seuilPct);
  const libre = Math.min(dividendos, umbralLibre);
  const exceso = Math.max(0, dividendos - umbralLibre);
  const pfuLibre = libre * pfuTotal;
  const irExceso = exceso * 0.128;
  // Los dividendos por encima del umbral entran en la assiette social con el mismo abattement del 26 %
  // (notice 2041-DRI): el tipo se aplica sobre el 74 % del exceso, no sobre el exceso entero.
  const tnsExceso = exceso * (1 - config('tns_abattement', 0.26)) * tauxTNS;
  return { umbralLibre, libre, exceso, pfuLibre, irExceso, tnsExceso, total: pfuLibre + irExceso + tnsExceso, superaSeuil: exceso > 0 };
}

// Encadena las 4 fórmulas de arriba en el orden real en que se aplican sobre el beneficio de un
// ejercicio: primero se paga el gérant (rémunération + sus cotisations TNS, gasto deducible antes
// del IS), luego la société paga el IS sobre lo que queda, luego se detrae la reserva legal
// obligatoria (Artículo 18 de los estatutos) y por último se reparte el resto como dividendos —
// con la parte que supera el umbral libre (10% capital + compte courant) tributando como
// "rémunération encubierta" (TNS) en vez de al PFU. Usado tanto por "Salario vs Dividendos" (con
// el beneficio REAL del ejercicio en curso) como por el "Simulador" (con ingresos/gastos
// hipotéticos) — una sola fuente de verdad para no mantener la cadena duplicada.
export function simularEjercicio(
  remuneracion: number,
  pctDividendos: number,
  beneficioAntesDeGastosPersonal: number,
  capitalSocial: number,
  compteCourantMedio: number,
  meses: number,
  config: ConfigFn,
) {
  const tns = calcularTNS(remuneracion, config);
  const beneficioTrasSalario = Math.max(0, beneficioAntesDeGastosPersonal - remuneracion - tns.total);
  const is = calcularIS(beneficioTrasSalario, meses, config);
  const beneficioTrasIS = Math.max(0, beneficioTrasSalario - is.total);
  const reservaLegal = calcularReservaLegal(beneficioTrasIS, capitalSocial, config);
  const beneficioDistribuible = Math.max(0, beneficioTrasIS - reservaLegal.dotacion);
  const dividendos = beneficioDistribuible * (pctDividendos / 100);
  const divCalc = calcularDividendos(dividendos, capitalSocial, compteCourantMedio, config);
  const totalPrelevements = tns.total + is.total + divCalc.total;
  // La rémunération ya es neta: las cotisations las ha pagado la société (restadas arriba del beneficio).
  const netoDisponible = remuneracion + dividendos - divCalc.total;
  return { tns, is, beneficioTrasSalario, reservaLegal, beneficioDistribuible, dividendos, divCalc, totalPrelevements, netoDisponible };
}

// Rémunération neta máxima que la société puede pagar con un coste total dado (neta + sus
// cotisations = coste). Se resuelve por bisección porque las cotisations dependen de la propia
// rémunération. La usa el Simulador para llevar todo el margen a rémunération sin dejar déficit.
export function remuneracionNetaParaCoste(costeTotal: number, config: ConfigFn) {
  if (costeTotal <= 0) return 0;
  let bajo = 0;
  let alto = costeTotal;
  for (let i = 0; i < 60; i++) {
    const medio = (bajo + alto) / 2;
    if (medio + calcularTNS(medio, config).total > costeTotal) alto = medio;
    else bajo = medio;
  }
  return Math.round(bajo * 100) / 100;
}

// Número de parts del quotient familial del foyer fiscal del gérant — 2 partes de base para un
// matrimonio (1 si soltero) + 0,5 por cada uno de los dos primeros hijos a cargo + 1 por cada hijo
// a partir del tercero (art. 194 CGI). No modela otras situaciones (familia monoparental, hijo en
// garde alternée a 0,25, etc.) — solo el caso real de Reformas Ordoñez, editable en gerant_config.
export function calcularQuotientFamiliar(casado: boolean, hijosACargo: number, config: ConfigFn) {
  const partsBase = casado ? config('ir_parts_base_casado', 2) : 1;
  const primerosHijos = Math.min(hijosACargo, 2);
  const hijosAdicionales = Math.max(0, hijosACargo - 2);
  return partsBase + primerosHijos * 0.5 + hijosAdicionales * 1;
}

// Abattement forfaitario del 10% para frais professionnels sobre "traitements et salaires" (así
// tributa la rémunération del gérant majoritaire, art. 62 CGI) — con suelo y techo fijados cada año.
export function calcularAbattementProfesional(revenuAntesAbattement: number, config: ConfigFn) {
  const pct = config('ir_abattement_pct', 0.1);
  const minimo = config('ir_abattement_min', 509);
  const maximo = config('ir_abattement_max', 14555);
  const base = Math.max(0, revenuAntesAbattement);
  return Math.min(maximo, Math.max(base > 0 ? minimo : 0, base * pct));
}

function impuestoPorTramos(revenuParPart: number, config: ConfigFn) {
  const t1 = config('ir_tramo1_hasta', 11600);
  const t2 = config('ir_tramo2_hasta', 29579);
  const t3 = config('ir_tramo3_hasta', 84577);
  const t4 = config('ir_tramo4_hasta', 181917);
  const r2 = config('ir_tramo2_tasa', 0.11);
  const r3 = config('ir_tramo3_tasa', 0.3);
  const r4 = config('ir_tramo4_tasa', 0.41);
  const r5 = config('ir_tramo5_tasa', 0.45);
  let impuesto = 0;
  if (revenuParPart > t1) impuesto += (Math.min(revenuParPart, t2) - t1) * r2;
  if (revenuParPart > t2) impuesto += (Math.min(revenuParPart, t3) - t2) * r3;
  if (revenuParPart > t3) impuesto += (Math.min(revenuParPart, t4) - t3) * r4;
  if (revenuParPart > t4) impuesto += (revenuParPart - t4) * r5;
  return impuesto;
}

// Impôt sur le revenu personal del foyer fiscal, con quotient familial (barème progresivo por
// parte × número de partes), plafonnement de l'avantage fiscal de las medias partes extra por
// hijos (art. 197 CGI) y décote para rentas bajas. Todos los umbrales vienen de fiscal_config
// (barème 2026 sobre revenus 2025, publicado — cargado desde service-public.gouv.fr/particuliers/
// actualites/A18045, confirmado 2026-08-16). No incluye los dividendos del PFU: por defecto el PFU es una
// imposición separada que NO entra en el quotient familial (solo entraría si se opta por el
// barème en vez del PFU, algo que rara vez conviene con estos importes — ver FAQ del Simulador).
export function calcularIRPersonal(revenuNetImposableFoyer: number, parts: number, config: ConfigFn) {
  const revenu = Math.max(0, revenuNetImposableFoyer);
  const revenuParPart = parts > 0 ? revenu / parts : revenu;
  const impotSinPlafon = impuestoPorTramos(revenuParPart, config) * parts;

  const partsBase = config('ir_parts_base_casado', 2);
  const revenuParPartBase = partsBase > 0 ? revenu / partsBase : revenu;
  const impotConPartsBase = impuestoPorTramos(revenuParPartBase, config) * partsBase;

  const demiPartsExtra = Math.max(0, (parts - partsBase) * 2);
  const plafonDemiPart = config('ir_plafond_demi_part', 1807);
  const ahorroMaximo = demiPartsExtra * plafonDemiPart;
  const impotBruto = Math.max(impotSinPlafon, impotConPartsBase - ahorroMaximo);

  const decoteUmbral = config('ir_decote_umbral_couple', 3277);
  const decoteMontantBase = config('ir_decote_montant_couple', 1483);
  const decoteTasa = config('ir_decote_tasa', 0.4525);
  const decote = impotBruto > 0 && impotBruto <= decoteUmbral ? Math.max(0, decoteMontantBase - decoteTasa * impotBruto) : 0;

  const impotFinal = Math.max(0, impotBruto - decote);
  return { revenuParPart, impotSinPlafon, impotConPartsBase, ahorroMaximo, impotBruto, decote, impotFinal };
}

// Encadena abattement + quotient familial + barème para calcular el IR del foyer fiscal completo:
// la base imponible del gérant antes del abattement (montante1GB — rémunération neta + CSG/CRDS no
// deducible, ver calcularTNS) MÁS los ingresos propios del cónyuge si los tiene (en una déclaration
// commune de casados, Hacienda francesa suma TODOS los salaires del hogar en una sola declaración —
// no se declara cada uno "por su cuenta", ver FAQ). Cada declarante tiene su propio abattement del
// 10% (art. 83 CGI, con el mismo tope aplicado a CADA uno por separado, no al total combinado)
// antes de sumar ambas bases imponibles.
// Verificado 2026-08 contra el simulador oficial de la DGFiP (simulateur-ir-ifi.impots.gouv.fr):
// con 40.020 € + 18.000 € y 2,5 partes, la Administración da exactamente 2.554 € de droits simples,
// 327 € de décote y 2.227 € de impôt net — esta función reproduce esas tres cifras al euro (esa
// verificación usó `csgNoDeducible = 0`, es decir, revenu net imposable ya conocido de antemano —
// no depende de cómo se calcule montante1GB, solo del tramo del IR).
// No incluye los dividendos (PFU aparte, ver calcularIRPersonal).
export function calcularIRGerante(
  remuneracion: number,
  ingresosConyuge: number,
  casado: boolean,
  hijosACargo: number,
  config: ConfigFn,
  // Opcional (por defecto 0, retrocompatible con llamadas existentes) — CSG/CRDS no deducible que
  // hay que sumar de vuelta a la rémunération neta antes del abattement, ver calcularTNS().
  // TabDeclaracionRenta.tsx la pasa siempre; TabSimulador.tsx igual desde 2026-08-26.
  csgNoDeducible: number = 0,
) {
  const remuneracionNeta = Math.max(0, remuneracion);
  // montante1GB es el importe real que va en la casilla 1GB del 2042 — remuneracionNeta se queda
  // como el "neto en mano" para mostrar aparte (ver TabCotisations/TabSalarioDividendos), pero la
  // base fiscal antes del abattement del 10% es siempre montante1GB (confirmado 2026-08-26).
  const montante1GB = remuneracionNeta + csgNoDeducible;
  const abattement = calcularAbattementProfesional(montante1GB, config);
  const abattementConyuge = calcularAbattementProfesional(ingresosConyuge, config);
  const revenuNetImposable =
    Math.max(0, montante1GB - abattement) + Math.max(0, ingresosConyuge - abattementConyuge);
  const parts = calcularQuotientFamiliar(casado, hijosACargo, config);
  const ir = calcularIRPersonal(revenuNetImposable, parts, config);
  return { remuneracionNeta, montante1GB, abattement, ingresosConyuge, abattementConyuge, revenuNetImposable, parts, ...ir };
}

// Cuentas de balance (clases 1 a 5) que el bilan no nombra línea a línea. Todo lo demás (335 obras en
// curso, 486 gastos anticipados, 164 préstamos, 401, 421...) va a «otros»: al activo si su saldo es
// deudor y al pasivo si es acreedor. Antes esas cuentas no estaban en ningún lado y la OD de cierre
// de obras en curso (335/7133) descuadraba el bilan por su importe (auditoría fiscal 2026-10-09).
const CUENTAS_NOMBRADAS_BILAN = ['101', '106', '11', '12', '2', '411', '445', '467', '4191', '455', '444', '457', '512'];
export function otrosSaldosBalance(asientos: { cuenta: string; debe: number; haber: number }[]) {
  const porGrupo = new Map<string, number>();
  for (const a of asientos) {
    if (!/^[1-5]/.test(a.cuenta) || CUENTAS_NOMBRADAS_BILAN.some((p) => a.cuenta.startsWith(p))) continue;
    const grupo = a.cuenta.slice(0, 3);
    porGrupo.set(grupo, (porGrupo.get(grupo) ?? 0) + a.debe - a.haber);
  }
  let deudor = 0;
  let acreedor = 0;
  for (const saldo of porGrupo.values()) {
    if (saldo > 0) deudor += saldo;
    else acreedor -= saldo;
  }
  return { deudor, acreedor };
}

// Bilan (pasivo) del ejercicio desde el libro diario (auditoría 2026-10-01). El libro no lleva asientos
// de cierre, así que el resultado de los ejercicios anteriores (sus cuentas 6 y 7) entra como report
// à nouveau, junto con lo que se haya movido a mano a 110/119 (reparto del resultado). Capital (101) y
// reservas (106) salen también del libro; si todavía no hay reserva registrada se usa la de la
// configuración (reserva_legal_acumulada). El IS: el registrado en el libro (OD 695/444) o, si
// todavía no se ha registrado, el calculado. "Dettes fournisseurs" siempre a 0 (los Gastos se
// registran ya pagados, ver CLAUDE.md §10).
export function calcularBilanPasivo(
  resultadoNeto: number,
  reservaLegal: ReturnType<typeof calcularReservaLegal>,
  isPendienteDeRegistrar: number,
  capitalSocial: number,
  // Saldos del libro diario hasta el cierre (ver useComptaFrancia.asientosBalance).
  asientosBalance: { cuenta: string; debe: number; haber: number; fecha?: string }[] = [],
  inicioEjercicio = '0000-01-01',
) {
  const saldo = (prefijos: string[], filtro: (a: { fecha?: string }) => boolean = () => true) =>
    asientosBalance
      .filter((a) => prefijos.some((p) => a.cuenta.startsWith(p)) && filtro(a))
      .reduce((s, a) => s + a.debe - a.haber, 0);
  const acreedor = (prefijos: string[]) => Math.max(0, -saldo(prefijos));
  const capital = acreedor(['101']) || capitalSocial;
  // Solo las reservas ya constituidas: la dotación del ejercicio se decide al aprobar las cuentas en
  // N+1 y ya está dentro del résultat (auditoría 2026-09-29).
  const reservas = acreedor(['106']) || reservaLegal.reservaAcumuladaPrevia;
  const resultadosAnteriores = -saldo(['6', '7'], (a) => !!a.fecha && a.fecha < inicioEjercicio);
  const reportANouveau = resultadosAnteriores - saldo(['11']);
  const deudaTva = acreedor(['445']);
  const avancesRecibidas = acreedor(['4191']);
  const compteCourantAssocie = acreedor(['455']);
  const dettesFiscales = acreedor(['444']) + isPendienteDeRegistrar;
  const dividendosAPagar = acreedor(['457']);
  // Saldos al revés de lo habitual (cliente con saldo a su favor, descubierto en banco, depósito de
  // capital acreedor) y el resto de cuentas de balance con saldo acreedor.
  const otrasDeudas = otrosSaldosBalance(asientosBalance).acreedor + acreedor(['411']) + acreedor(['467']) + acreedor(['512']);
  const capitauxPropres = capital + reservas + reportANouveau + resultadoNeto;
  return {
    capitalSocial: capital,
    reservas,
    reportANouveau,
    resultadoEjercicio: resultadoNeto,
    capitauxPropres,
    dettesFiscales,
    deudaTva,
    avancesRecibidas,
    compteCourantAssocie,
    dividendosAPagar,
    otrasDeudas,
    dettesFournisseurs: 0,
    total: capitauxPropres + dettesFiscales + deudaTva + avancesRecibidas + compteCourantAssocie + dividendosAPagar + otrasDeudas,
  };
}

// Report en avant des déficits (art. 209-I CGI): el déficit de un ejercicio se imputa a los
// beneficios de los siguientes, sin límite de tiempo, hasta 1 M€ + 50 % de lo que exceda. Devuelve
// el déficit pendiente al empezar el ejercicio, recorriendo los resultados de los anteriores en orden.
export function deficitArrastrable(resultadosAnteriores: number[]): number {
  let pendiente = 0;
  for (const r of resultadosAnteriores) {
    if (r < 0) pendiente += -r;
    else if (r > 0 && pendiente > 0) pendiente -= Math.min(pendiente, imputacionMaximaDeficit(r));
  }
  return Math.round(pendiente * 100) / 100;
}

export function imputacionMaximaDeficit(beneficio: number): number {
  if (beneficio <= 0) return 0;
  return beneficio <= 1_000_000 ? beneficio : 1_000_000 + (beneficio - 1_000_000) * 0.5;
}

// Art. L223-42 Code de commerce: si los capitaux propres caen por debajo de la mitad del capital,
// el associé unique debe decidir en los 4 meses siguientes a la aprobación de las cuentas si
// continúa la société (y publicarlo); y regularizarlo antes del cierre del 2.º ejercicio siguiente.
export function capitauxPropresInferioresMitadCapital(capitauxPropres: number, capital: number): boolean {
  return capital > 0 && capitauxPropres < capital / 2;
}

// Liasse del régimen réel normal transmitida por EDI: segundo día hábil siguiente al 1 de mayo,
// más 15 días de plazo adicional por la transmisión EDI (auditoría fiscal 2026-09-29 — antes se
// fijaba el 31 de mayo, fuera de plazo).
export function fechaLimiteLiasse(anioPresentacion: number): string {
  const festivos = new Set([`${anioPresentacion}-05-01`, `${anioPresentacion}-05-08`]);
  const d = new Date(anioPresentacion, 4, 1);
  let habiles = 0;
  while (habiles < 2) {
    d.setDate(d.getDate() + 1);
    const clave = iso(d.getFullYear(), d.getMonth() + 1, d.getDate());
    if (d.getDay() !== 0 && d.getDay() !== 6 && !festivos.has(clave)) habiles++;
  }
  d.setDate(d.getDate() + 15);
  return iso(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

export function generarEcheances(anio: number, config: ConfigFn): NuevaEcheance[] {
  const tvaDeadlineDia = config('tva_deadline_dia', 21);
  const acompteIsDia = config('acompte_is_dia', 15);
  const cfeDia = config('cfe_dia', 15);
  const soldeIsMes = config('solde_is_mes', 5);
  const soldeIsDia = config('solde_is_dia', 15);
  const echeances: NuevaEcheance[] = [];

  for (let mes = 1; mes <= 12; mes++) {
    const anioLimite = mes === 12 ? anio + 1 : anio;
    const mesLimite = mes === 12 ? 1 : mes + 1;
    echeances.push({
      tipo: 'CA3',
      titulo: `CA3 — TVA de ${MESES[mes - 1]} ${anio}`,
      fecha_limite: iso(anioLimite, mesLimite, tvaDeadlineDia),
      organismo: 'DGFiP',
      url_oficial: 'https://www.impots.gouv.fr',
      importe_estimado: null,
      notas: null,
    });
  }

  if (anio === 2026) {
    echeances.push({
      tipo: 'OTRO',
      titulo: 'Exento de acomptes IS — primer ejercicio (sin ejercicio anterior)',
      fecha_limite: iso(2026, 12, 15),
      organismo: 'DGFiP',
      url_oficial: null,
      importe_estimado: null,
      notas: 'Primer pago de IS: solde el 15/05/2027',
    });
    echeances.push({
      tipo: 'OTRO',
      titulo: 'Declaración inicial CFE (1447-C) — exonerada el año de creación',
      fecha_limite: iso(2026, 12, 31),
      organismo: 'DGFiP',
      url_oficial: 'https://www.impots.gouv.fr',
      importe_estimado: null,
      notas: 'Primera CFE a pagar: diciembre 2027',
    });
  } else {
    for (const mesAcompte of [3, 6, 9, 12]) {
      echeances.push({
        tipo: 'ACOMPTE_IS',
        titulo: `Acompte IS — ${MESES[mesAcompte - 1]} ${anio}`,
        fecha_limite: iso(anio, mesAcompte, acompteIsDia),
        organismo: 'DGFiP',
        url_oficial: 'https://www.impots.gouv.fr',
        importe_estimado: null,
        // Condiciones reales (auditoría 2026-10-01): sin ellas el calendario pedía 4 acomptes siempre.
        notas:
          'Solo si el IS del último ejercicio cerrado supera 3.000 € (si hubo pérdidas o menos de 3.000 €, no hay acomptes). ' +
          (anio === 2027 && mesAcompte === 3
            ? 'En 2027, segundo ejercicio, el de marzo no se paga todavía: se regulariza con el de junio, ya con la liasse de 2026 presentada (y la base del primer ejercicio de 6 meses llevada a 12).'
            : 'Cada acompte es el 25 % del IS de referencia.'),
      });
    }
    echeances.push({
      tipo: 'CFE',
      titulo: `CFE ${anio}`,
      fecha_limite: iso(anio, 12, cfeDia),
      organismo: 'DGFiP',
      url_oficial: 'https://www.impots.gouv.fr',
      importe_estimado: null,
      notas: null,
    });
  }

  echeances.push({
    tipo: 'SOLDE_IS',
    titulo: `Declaración anual de sociedades (Solde IS) — ejercicio ${anio}`,
    fecha_limite: iso(anio + 1, soldeIsMes, soldeIsDia),
    organismo: 'DGFiP',
    url_oficial: 'https://www.impots.gouv.fr',
    importe_estimado: null,
    notas: null,
  });
  echeances.push({
    tipo: 'LIASSE',
    titulo: `Liasse fiscale (2065) — ejercicio ${anio}`,
    fecha_limite: fechaLimiteLiasse(anio + 1),
    organismo: 'DGFiP',
    url_oficial: 'https://www.impots.gouv.fr',
    importe_estimado: null,
    notas: 'Segundo día hábil tras el 1 de mayo + 15 días por transmitirse por EDI (Edifiscale). Presentarla tarde supone un recargo del 10 % (art. 1728 CGI).',
  });
  echeances.push({
    tipo: 'DEPOT_COMPTES',
    titulo: `Dépôt des comptes annuels au greffe — ejercicio ${anio}`,
    fecha_limite: iso(anio + 1, 7, 31),
    organismo: 'Greffe',
    url_oficial: null,
    importe_estimado: null,
    notas: null,
  });
  echeances.push({
    tipo: 'ASAMBLEA',
    titulo: `Décision de l'associé unique — aprobación de cuentas del ejercicio ${anio}`,
    fecha_limite: iso(anio + 1, config('asamblea_mes', 6), config('asamblea_dia', 30)),
    organismo: 'Interno',
    url_oficial: null,
    importe_estimado: null,
    notas: 'Paso previo obligatorio al dépôt des comptes — dentro de los 6 meses tras el cierre del ejercicio.',
  });
  // Fecha estimada — la periodicidad real de pago (mensual o trimestral) depende del régimen
  // elegido en la URSSAF al darse de alta, no está confirmada. Se usa un recordatorio anual
  // agrupado en vez de inventar varias fechas trimestrales con falsa precisión (auditoría 2026-08-12).
  echeances.push({
    tipo: 'COTISATIONS_TNS',
    titulo: `Régularisation cotisations TNS del gérant — ejercicio ${anio}`,
    fecha_limite: iso(anio + 1, config('tns_regularisation_mes', 9), config('tns_regularisation_dia', 30)),
    organismo: 'URSSAF (SSI)',
    url_oficial: 'https://www.urssaf.fr',
    importe_estimado: null,
    notas: 'Fecha estimada — confirmar con la URSSAF la periodicidad real de pago (mensual o trimestral) de las cotisations provisionales, además de esta régularisation anual.',
  });
  echeances.push({
    tipo: 'DECLARACION_IR_GERANT',
    // Corregido 2026-08-26 (investigación con 4 fuentes independientes): es el formulario 2042
    // (casillas 1GB/1HB, "traitements et salaires" art. 62 CGI) — NO el 2042-C-PRO, que es para
    // autónomos con ingresos BIC/BNC y no aplica a un gérant majoritaire. Ver TabDeclaracionRenta.tsx.
    titulo: `Déclaration de revenus de Mario (formulaire 2042, casillas 1GB/1HB) — ingresos ${anio}`,
    // Pyrénées-Atlantiques (64) está en la zona 3 de la declaración en línea, la última — no en la
    // zona 1 (auditoría 2026-09-29). Fecha aproximada: la DGFiP la publica cada año.
    fecha_limite: iso(anio + 1, config('declaracion_ir_mes', 6), config('declaracion_ir_dia', 4)),
    organismo: 'DGFiP (IR personal)',
    url_oficial: 'https://www.impots.gouv.fr',
    importe_estimado: null,
    notas: 'Es la declaración personal de Mario, no de la société — pero incluye la rémunération TNS y los dividendos del ejercicio. La DGFiP fija la fecha exacta cada año por decreto, confirmar antes de mayo. Detalle completo en Fiscalidad → Impôt sur les Sociétés → Renta del gérant (IR).',
  });

  return echeances.sort((a, b) => a.fecha_limite.localeCompare(b.fecha_limite));
}
