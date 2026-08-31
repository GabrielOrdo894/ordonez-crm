import { supabase } from './supabase';

const PREFIJOS = {
  seq_presupuesto: 'P',
  seq_factura: 'F',
  seq_factura_acompte: 'AC',
  seq_factura_rectificativa: 'R',
} as const;

// El incremento se hace en un solo UPDATE...RETURNING atómico dentro de Postgres (función
// siguiente_numero_atomico, migración 20260812080049) — no en el cliente. Dos creaciones casi
// simultáneas ya no pueden leer el mismo contador y generar el mismo número dos veces.
export async function siguienteNumero(campo: keyof typeof PREFIJOS): Promise<string> {
  const { data: siguiente, error } = await supabase.rpc('siguiente_numero_atomico', { p_campo: campo });
  if (error) throw error;

  const año = new Date().getFullYear();
  return `${PREFIJOS[campo]}-${año}-${String(siguiente).padStart(4, '0')}`;
}

// Rango de desempate cuando dos secuencias independientes (facturas normales F, acomptes AC,
// rectificativas R) comparten año+número — cada una tiene su propio contador en Postgres, así que
// eso sí puede pasar. P (presupuestos) no convive con las de factura, se deja en el mismo rango
// que F por simplicidad.
const RANGO_PREFIJO: Record<string, number> = { F: 0, P: 0, AC: 1, R: 2 };

// Para ordenar por número en las tablas — "P-2026-0015" → año+secuencia+prefijo (ordena
// cronológicamente incluso al cambiar de año, y desempata entre secuencias distintas del mismo
// año+número). Si no sigue el formato, cae a 0.
export function numeroOrdenable(numero: string | null | undefined): number {
  if (!numero) return 0;
  const match = numero.match(/^([A-Z]+)-(\d{4})-(\d+)$/);
  if (!match) return Number(numero) || 0;
  const [, prefijo, año, seq] = match;
  const rango = RANGO_PREFIJO[prefijo] ?? 9;
  return Number(año) * 1000000 + Number(seq) * 10 + rango;
}
