import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Info } from 'lucide-react';

type InfoTooltipProps = {
  children: ReactNode;
  label?: string;
};

const ANCHO_PANEL = 288;
const MARGEN = 8;

// Icono ⓘ junto a un título/sección que, al pulsarlo, abre un recuadro flotante con el texto
// explicativo — para no dejar el párrafo largo siempre visible debajo del título (petición de
// Gabriel 2026-09-11: demasiados subtítulos largos por todo el CRM, sobre todo en Fiscalidad).
// Mismo patrón de portal + posición calculada + cierre con click fuera/Escape que DropdownMenu.tsx.
export function InfoTooltip({ children, label = 'Más información' }: InfoTooltipProps) {
  const [abierto, setAbierto] = useState(false);
  const [posicion, setPosicion] = useState<{ left: number; top?: number; bottom?: number }>({ left: 0 });
  const botonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;

    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (botonRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setAbierto(false);
    };
    const handleScroll = (e: Event) => {
      if (panelRef.current?.contains(e.target as Node)) return;
      setAbierto(false);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setAbierto(false);
      botonRef.current?.focus();
    };

    document.addEventListener('mousedown', handleClick);
    window.addEventListener('scroll', handleScroll, true);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      window.removeEventListener('scroll', handleScroll, true);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [abierto]);

  const handleAbrir = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!abierto && botonRef.current) {
      const rect = botonRef.current.getBoundingClientRect();
      const left = Math.min(Math.max(MARGEN, rect.left), window.innerWidth - ANCHO_PANEL - MARGEN);
      const espacioAbajo = window.innerHeight - rect.bottom;
      // Sin medir la altura real del panel (el texto varía mucho de largo): si hay poco sitio
      // abajo y más arriba, se ancla por `bottom` en vez de `top` — evita adivinar la altura.
      if (espacioAbajo < 140 && rect.top > espacioAbajo) {
        setPosicion({ left, bottom: window.innerHeight - rect.top + 6 });
      } else {
        setPosicion({ left, top: rect.bottom + 6 });
      }
    }
    setAbierto((a) => !a);
  };

  return (
    <>
      <button
        ref={botonRef}
        type="button"
        onClick={handleAbrir}
        title={label}
        aria-label={label}
        className="inline-flex items-center justify-center w-5 h-5 rounded-full text-gray-400 hover:text-brand hover:bg-brand-light shrink-0 align-middle"
      >
        <Info size={13} />
      </button>
      {abierto &&
        createPortal(
          <div
            ref={panelRef}
            onClick={(e) => e.stopPropagation()}
            style={{ left: posicion.left, top: posicion.top, bottom: posicion.bottom, width: ANCHO_PANEL }}
            className="fixed bg-surface border border-gray-200 rounded-sm shadow-sm z-50 p-3 text-xs text-gray-600 leading-relaxed animate-[scale-in_120ms_ease-out]"
          >
            {children}
          </div>,
          document.body,
        )}
    </>
  );
}
