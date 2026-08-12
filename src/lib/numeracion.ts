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

// Para ordenar por número en las tablas — "P-2026-0015" → 20260015 (año+secuencia, ordena
// cronológicamente incluso al cambiar de año). Si no sigue el formato, cae a 0.
export function numeroOrdenable(numero: string | null | undefined): number {
  if (!numero) return 0;
  const match = numero.match(/(\d{4})-(\d+)$/);
  if (!match) return Number(numero) || 0;
  return Number(match[1]) * 100000 + Number(match[2]);
}
