import { useEffect, useRef } from 'react';
import { useToast } from '../hooks/useToast';
import { EVENTO_ERROR_CONSULTA } from '../lib/queryClient';

// Muestra como toast los errores de lectura que avisa el QueryCache (queryClient.ts). El mismo
// mensaje no se repite en 15 s (varias pantallas suelen pedir lo mismo a la vez).
export function AvisoErroresConsulta() {
  const toast = useToast();
  const ultimos = useRef(new Map<string, number>());

  useEffect(() => {
    const alError = (evento: Event) => {
      const mensaje = String((evento as CustomEvent<string>).detail ?? 'Error desconocido');
      const ahora = Date.now();
      if ((ultimos.current.get(mensaje) ?? 0) > ahora - 15_000) return;
      ultimos.current.set(mensaje, ahora);
      toast.error(`No se pudieron cargar algunos datos: ${mensaje}`);
    };
    window.addEventListener(EVENTO_ERROR_CONSULTA, alError);
    return () => window.removeEventListener(EVENTO_ERROR_CONSULTA, alError);
    // toast se excluye a propósito: ToastContext recrea su valor en cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
