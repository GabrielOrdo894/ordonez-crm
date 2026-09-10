import { useEffect, useRef } from 'react';

const SELECTOR_FOCUSABLE = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

// Cierre con Escape + trampa de Tab dentro de un panel modal/drawer, y devolución del foco al
// elemento que lo abrió al cerrarse. Extraído de Modal.tsx (2026-09-10) para que cualquier otro
// panel a pantalla completa (como el drawer de NotificacionesBell, que no usa <Modal> por ser
// lateral en vez de centrado) tenga las mismas garantías de accesibilidad sin duplicar la lógica —
// antes NotificacionesBell reimplementaba su propio overlay a mano sin ninguna de las dos (bug
// real, corregido 2026-09-10).
export function useFocoAtrapado(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);

  // Foco al abrir y devolverlo al elemento que abrió el panel al cerrar — separado del efecto de
  // Escape/Tab de abajo para que no se robe el foco de un input en cada re-render (onClose suele
  // ser una arrow function inline, con identidad distinta en cada render del padre).
  useEffect(() => {
    if (!open) return;
    const previo = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    return () => previo?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const focables = ref.current?.querySelectorAll<HTMLElement>(SELECTOR_FOCUSABLE);
      if (!focables || focables.length === 0) return;
      const primero = focables[0];
      const ultimo = focables[focables.length - 1];
      if (e.shiftKey && document.activeElement === primero) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primero.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  return ref;
}
