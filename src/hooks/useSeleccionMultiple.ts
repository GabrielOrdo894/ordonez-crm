import { useState } from 'react';

export function useSeleccionMultiple() {
  const [seleccion, setSeleccion] = useState<Set<string | number>>(new Set());

  const toggleFila = (id: string | number) => {
    setSeleccion((actual) => {
      const siguiente = new Set(actual);
      if (siguiente.has(id)) siguiente.delete(id);
      else siguiente.add(id);
      return siguiente;
    });
  };

  const toggleTodas = (ids: (string | number)[]) => {
    setSeleccion((actual) => {
      const todasSeleccionadas = ids.length > 0 && ids.every((id) => actual.has(id));
      return todasSeleccionadas ? new Set() : new Set(ids);
    });
  };

  const limpiar = () => setSeleccion(new Set());

  return { seleccion, toggleFila, toggleTodas, limpiar };
}
