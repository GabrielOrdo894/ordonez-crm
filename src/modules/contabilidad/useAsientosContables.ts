import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';

export type AsientoContable = {
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

const COLUMNAS = 'id, fecha, cuenta, debe, haber, concepto, documento_tipo, documento_id, tipo_evento, pago_id, created_at';
const PAGINA = 1000;

// Todo el libro diario, por páginas: PostgREST devuelve como mucho 1.000 filas por consulta y el libro
// iba a superarlas antes del cierre del ejercicio — el libro mayor, la liasse y el CSV de Edifiscale
// se habrían calculado con datos cortados (auditoría contable 2026-09-29).
export async function cargarTodosLosAsientos(): Promise<AsientoContable[]> {
  const todos: AsientoContable[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await supabase
      .from('asientos_contables')
      .select(COLUMNAS)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(desde, desde + PAGINA - 1);
    if (error) throw error;
    const filas = (data ?? []) as AsientoContable[];
    todos.push(...filas.map((a) => ({ ...a, debe: Number(a.debe), haber: Number(a.haber) })));
    if (filas.length < PAGINA) return todos;
  }
}

// Única consulta de ['asientos_contables'] — la comparten Libro diario, Libro mayor y la liasse
// (useComptaFrancia). Mismo select y sin filtros para que ninguna pantalla deje a otra con datos
// cortados (regla de queryKey compartida, ver CLAUDE.md).
export function useAsientosContables() {
  return useQuery({ queryKey: ['asientos_contables'], queryFn: cargarTodosLosAsientos });
}
