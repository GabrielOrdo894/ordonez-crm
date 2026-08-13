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

export function calcularTNS(remuneracionAnual: number, config: ConfigFn) {
  const abattement = config('tns_abattement', 0.26);
  const tauxGlobal = config('tns_taux_global', 0.45);
  const pass = config('pass_2026', 47100);
  const topeAbatido = pass * 1.3;
  const parteAbatida = Math.min(remuneracionAnual, topeAbatido) * (1 - abattement);
  const parteExceso = Math.max(0, remuneracionAnual - topeAbatido);
  const assiette = parteAbatida + parteExceso;
  const total = assiette * tauxGlobal;
  return { assiette, total, mensual: total / 12 };
}

// Article 18 des statuts (verificado contra los estatutos reales, auditoría 2026-08-12): del
// beneficio de cada ejercicio se detrae un 5% para la reserva legal ANTES de que el resto quede a
// disposición del associé unique para repartir como dividendos, hasta que esa reserva alcance el
// 10% del capital social. Con capitalSocial = 1000 € el tope son solo 100 €, pero es una detracción
// obligatoria que el simulador de dividendos no aplicaba antes de esta corrección. reservaAcumuladaPrevia
// se guarda en fiscal_config (clave reserva_legal_acumulada) y hay que actualizarla a mano cada
// ejercicio con lo ya dotado — el CRM no lleva la cuenta automáticamente entre ejercicios.
export function calcularReservaLegal(beneficioTrasIS: number, capitalSocial: number, config: ConfigFn) {
  const pct = config('reserva_legal_pct', 0.05);
  const topePct = config('reserva_legal_tope_pct', 0.1);
  const reservaAcumuladaPrevia = config('reserva_legal_acumulada', 0);
  const tope = capitalSocial * topePct;
  const margenDisponible = Math.max(0, tope - reservaAcumuladaPrevia);
  const dotacion = Math.min(Math.max(0, beneficioTrasIS) * pct, margenDisponible);
  return { pct, tope, reservaAcumuladaPrevia, margenDisponible, dotacion };
}

export function calcularDividendos(
  dividendos: number,
  capitalSocial: number,
  compteCourantMedio: number,
  config: ConfigFn,
) {
  const seuilPct = config('dividendes_seuil_capital', 0.1);
  const pfuTotal = config('pfu_total', 0.3);
  const tauxTNS = config('tns_taux_global', 0.45);
  const umbralLibre = Math.max(0, (capitalSocial + compteCourantMedio) * seuilPct);
  const libre = Math.min(dividendos, umbralLibre);
  const exceso = Math.max(0, dividendos - umbralLibre);
  const pfuLibre = libre * pfuTotal;
  const irExceso = exceso * 0.128;
  const tnsExceso = exceso * tauxTNS;
  return { umbralLibre, libre, exceso, pfuLibre, irExceso, tnsExceso, total: pfuLibre + irExceso + tnsExceso, superaSeuil: exceso > 0 };
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
        notas: null,
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
    fecha_limite: iso(anio + 1, config('liasse_mes', 5), config('liasse_dia', 31)),
    organismo: 'DGFiP',
    url_oficial: 'https://www.impots.gouv.fr',
    importe_estimado: null,
    notas: null,
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
    titulo: `Déclaration de revenus de Mario (2042-C-PRO) — ingresos ${anio}`,
    fecha_limite: iso(anio + 1, config('declaracion_ir_mes', 5), config('declaracion_ir_dia', 25)),
    organismo: 'DGFiP (IR personal)',
    url_oficial: 'https://www.impots.gouv.fr',
    importe_estimado: null,
    notas: 'Es la declaración personal de Mario, no de la société — pero incluye la rémunération TNS y los dividendos del ejercicio. La DGFiP fija la fecha exacta cada año por decreto, confirmar antes de mayo.',
  });

  return echeances.sort((a, b) => a.fecha_limite.localeCompare(b.fecha_limite));
}
