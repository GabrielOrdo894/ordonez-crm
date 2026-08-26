import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../hooks/useToast';
import type { ChecklistItem } from './types';

// Captura estructurada simple durante la visita (comprobaciones, medidas...) — antes solo había
// texto libre en descripción/notas, sin nada que marcar como hecho de un vistazo (mejora real,
// auditoría de Visitas 2026-08-18).
export function VisitaChecklist({ visitaId, checklist }: { visitaId: string; checklist: ChecklistItem[] | null | undefined }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [nuevoItem, setNuevoItem] = useState('');
  const items = checklist ?? [];

  const guardarMutation = useMutation({
    mutationFn: async (nuevaLista: ChecklistItem[]) => {
      const { error } = await supabase.from('visitas').update({ checklist: nuevaLista }).eq('id', visitaId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['visitas'] }),
    onError: (error) => toast.error(error.message),
  });

  const anadir = () => {
    const texto = nuevoItem.trim();
    if (!texto) return;
    guardarMutation.mutate([...items, { texto, hecho: false }]);
    setNuevoItem('');
  };
  const alternar = (i: number) => guardarMutation.mutate(items.map((it, idx) => (idx === i ? { ...it, hecho: !it.hecho } : it)));
  const quitar = (i: number) => guardarMutation.mutate(items.filter((_, idx) => idx !== i));

  return (
    <div>
      <p className="text-gray-400 uppercase tracking-wide text-xs mb-1.5">Checklist de la visita</p>
      {items.length === 0 && <p className="text-xs text-gray-400 mb-2">Sin items — añade lo que haya que comprobar o medir.</p>}
      {items.length > 0 && (
        <div className="flex flex-col gap-1 mb-2">
          {items.map((item, i) => (
            <label key={i} className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={item.hecho} onChange={() => alternar(i)} className="shrink-0" />
              <span className={`flex-1 ${item.hecho ? 'line-through text-gray-400' : ''}`}>{item.texto}</span>
              <button onClick={() => quitar(i)} className="text-gray-300 hover:text-red-600 shrink-0">
                <X size={12} />
              </button>
            </label>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <input
          value={nuevoItem}
          onChange={(e) => setNuevoItem(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && anadir()}
          placeholder="Añadir item (ej.: medir ancho del hueco)"
          className="flex-1 border border-gray-200 rounded-sm px-2 py-1 text-xs focus:border-brand focus:outline-none"
        />
        <button onClick={anadir} className="text-brand hover:text-brand-dark shrink-0">
          <Plus size={16} />
        </button>
      </div>
    </div>
  );
}
