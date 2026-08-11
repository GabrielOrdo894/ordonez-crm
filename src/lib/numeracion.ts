import { supabase } from './supabase';

const PREFIJOS = {
  seq_presupuesto: 'P',
  seq_factura: 'F',
  seq_factura_acompte: 'AC',
  seq_factura_rectificativa: 'R',
} as const;

export async function siguienteNumero(campo: keyof typeof PREFIJOS): Promise<string> {
  const { data, error } = await supabase.from('empresa_config').select(campo).eq('id', 1).single();
  if (error) throw error;

  const siguiente = ((data as Record<string, number>)[campo] ?? 0) + 1;
  const { error: errorUpdate } = await supabase.from('empresa_config').update({ [campo]: siguiente }).eq('id', 1);
  if (errorUpdate) throw errorUpdate;

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
