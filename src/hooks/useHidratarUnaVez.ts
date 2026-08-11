import { useEffect, useRef } from 'react';

// Ejecuta `hidratar(dato)` solo la primera vez que `dato` deja de ser null/undefined — usado en
// pantallas de Configuración que hacen polling de 'empresa_config': sin este guard, cada refetch
// de fondo pisaría lo que el usuario esté escribiendo ahora mismo en el formulario.
export function useHidratarUnaVez<T>(dato: T | null | undefined, hidratar: (dato: T) => void) {
  const hidratadoRef = useRef(false);
  useEffect(() => {
    if (!dato || hidratadoRef.current) return;
    hidratadoRef.current = true;
    hidratar(dato);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dato]);
}
