import { supabase } from './supabase';

export type TipoDocumentoEvento = 'presupuesto' | 'factura';

export type DocumentoEvento = {
  id: string;
  documento_tipo: TipoDocumentoEvento;
  documento_id: string;
  evento: string;
  created_at: string;
};

// No lanza si falla el insert — es un registro secundario para la línea de tiempo, no debe
// tumbar la acción principal (que ya tiene su propio toast de éxito/error).
export async function registrarEvento(tipo: TipoDocumentoEvento, documentoId: string, evento: string) {
  const { error } = await supabase.from('documento_eventos').insert({ documento_tipo: tipo, documento_id: documentoId, evento });
  if (error) console.warn('No se pudo registrar el evento:', error.message);
}

export async function cargarEventos(tipo: TipoDocumentoEvento, documentoId: string): Promise<DocumentoEvento[]> {
  const { data, error } = await supabase
    .from('documento_eventos')
    .select('*')
    .eq('documento_tipo', tipo)
    .eq('documento_id', documentoId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data as DocumentoEvento[];
}
