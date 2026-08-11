import { useEffect, useState } from 'react';

// Devuelve `valor` con un retraso — útil para no disparar una búsqueda/guardado en cada tecla.
export function useDebounced<T>(valor: T, ms: number): T {
  const [debounced, setDebounced] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(valor), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);
  return debounced;
}
