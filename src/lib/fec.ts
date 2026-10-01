import { etiquetaCuenta } from './asientosContables';

// Fichier des Écritures Comptables (FEC, art. L47 A-I y A47 A-1 del LPF): obligatorio si la
// contabilidad se lleva con un programa — lo es desde que el CRM es la contabilidad oficial de la
// EURL (confirmado por Gabriel, auditoría contable 2026-09-29). 18 columnas separadas por
// tabulador, fechas AAAAMMJJ, importes con coma decimal, codificación ISO 8859-15.

export type AsientoFec = {
  id: string;
  fecha: string;
  cuenta: string;
  debe: number;
  haber: number;
  concepto: string;
  documento_tipo: string;
  documento_id: string;
  tipo_evento: string;
  pago_id: string | null;
  created_at: string;
};

const CABECERA = [
  'JournalCode',
  'JournalLib',
  'EcritureNum',
  'EcritureDate',
  'CompteNum',
  'CompteLib',
  'CompAuxNum',
  'CompAuxLib',
  'PieceRef',
  'PieceDate',
  'EcritureLib',
  'Debit',
  'Credit',
  'EcritureLet',
  'DateLet',
  'ValidDate',
  'Montantdevise',
  'Idevise',
];

// Diario de cada apunte: ventas (emisión de facturas), banco (cobros), compras (gastos) y
// operaciones diversas (bajas de inmovilizado, kilometraje contra la cuenta del asociado...).
function diario(a: AsientoFec): { codigo: string; nombre: string } {
  if (a.documento_tipo === 'factura') {
    return a.tipo_evento === 'cobro' ? { codigo: 'BQ', nombre: 'Banque' } : { codigo: 'VE', nombre: 'Ventes' };
  }
  if (a.documento_tipo === 'gasto') return { codigo: 'AC', nombre: 'Achats' };
  return { codigo: 'OD', nombre: 'Opérations diverses' };
}

function fechaFec(iso: string): string {
  return iso.slice(0, 10).replace(/-/g, '');
}

function importeFec(n: number): string {
  return n.toFixed(2).replace('.', ',');
}

// El FEC no admite tabuladores ni saltos de línea dentro de un campo.
function limpio(texto: string): string {
  return texto.replace(/[\t\r\n]+/g, ' ').trim();
}

// Fecha (AAAAMMJJ) de un instante en hora de París — ValidDate es la fecha de validación de la
// escritura en la contabilidad, no la fecha UTC del servidor.
function fechaParisFec(instante: string): string {
  const partes = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date(instante));
  return partes.replace(/-/g, '');
}

// Cada escritura (EcritureNum) es un lote insertado a la vez para un documento, una fecha y un
// pago — siempre cuadrado. Numeración correlativa por diario dentro del ejercicio en ORDEN DE
// VALIDACIÓN (created_at), como pide el art. A47 A-1 LPF: así es irreversible — una escritura nueva
// siempre recibe el número siguiente, aunque lleve una fecha anterior. Antes se numeraba por
// EcritureDate y una corrección con fecha atrasada renumeraba todas las posteriores entre una
// exportación y otra (auditoría 2026-10-01).
export function construirFec(
  asientos: AsientoFec[],
  ejercicio: { inicio: string; fin: string },
  referencias: Map<string, string>,
): string {
  const delEjercicio = asientos.filter((a) => a.fecha >= ejercicio.inicio && a.fecha <= ejercicio.fin);
  const lotes = new Map<string, AsientoFec[]>();
  for (const a of delEjercicio) {
    const clave = [a.documento_tipo, a.documento_id, a.tipo_evento, a.pago_id ?? '', a.fecha, a.created_at].join('|');
    const lote = lotes.get(clave);
    if (lote) lote.push(a);
    else lotes.set(clave, [a]);
  }
  const ordenados = Array.from(lotes.values()).sort(
    (x, y) => x[0].created_at.localeCompare(y[0].created_at) || x[0].fecha.localeCompare(y[0].fecha),
  );

  const contadores = new Map<string, number>();
  const lineas = [CABECERA.join('\t')];
  for (const lote of ordenados) {
    const { codigo, nombre } = diario(lote[0]);
    const numero = (contadores.get(codigo) ?? 0) + 1;
    contadores.set(codigo, numero);
    const pieza = referencias.get(lote[0].documento_id) ?? lote[0].documento_id.slice(0, 8);
    for (const a of lote) {
      lineas.push(
        [
          codigo,
          nombre,
          `${codigo}${String(numero).padStart(5, '0')}`,
          fechaFec(a.fecha),
          a.cuenta,
          limpio(etiquetaCuenta(a.cuenta).replace(/^[^·]+·\s*/, '')),
          '',
          '',
          limpio(pieza),
          fechaFec(a.fecha),
          limpio(a.concepto),
          importeFec(a.debe),
          importeFec(a.haber),
          '',
          '',
          fechaParisFec(a.created_at),
          '',
          '',
        ].join('\t'),
      );
    }
  }
  return lineas.join('\r\n') + '\r\n';
}

// ISO 8859-15: igual que Latin-1 salvo 8 posiciones (€, Š, š, Ž, ž, Œ, œ, Ÿ).
const LATIN9: Record<string, number> = { '€': 0xa4, Š: 0xa6, š: 0xa8, Ž: 0xb4, ž: 0xb8, Œ: 0xbc, œ: 0xbd, Ÿ: 0xbe };

export function codificarLatin9(texto: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(texto.length);
  let i = 0;
  for (const caracter of texto) {
    const especial = LATIN9[caracter];
    const codigo = caracter.codePointAt(0) ?? 63;
    bytes[i++] = especial ?? (codigo < 256 && ![0xa4, 0xa6, 0xa8, 0xb4, 0xb8, 0xbc, 0xbd, 0xbe].includes(codigo) ? codigo : 63);
  }
  return bytes.slice(0, i);
}

export function nombreFicheroFec(siren: string, finEjercicio: string): string {
  return `${siren.replace(/\D/g, '')}FEC${fechaFec(finEjercicio)}.txt`;
}
