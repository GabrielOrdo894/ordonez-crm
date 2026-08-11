import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical } from 'lucide-react';

export type AccionMenu = {
  label: string;
  onClick: () => void;
  destructivo?: boolean;
  oculto?: boolean;
};

type DropdownMenuProps = {
  acciones: AccionMenu[];
};

export function DropdownMenu({ acciones }: DropdownMenuProps) {
  const [abierto, setAbierto] = useState(false);
  const [posicion, setPosicion] = useState({ top: 0, left: 0, maxHeight: 400 });
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

    document.addEventListener('mousedown', handleClick);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [abierto]);

  const visibles = acciones.filter((a) => !a.oculto);

  const handleAbrir = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!abierto && botonRef.current) {
      const rect = botonRef.current.getBoundingClientRect();
      const margen = 8;
      const alturaEstimada = visibles.length * 32 + 8;
      const espacioAbajo = window.innerHeight - rect.bottom - margen;
      const espacioArriba = rect.top - margen;
      if (alturaEstimada > espacioAbajo && espacioArriba > espacioAbajo) {
        setPosicion({
          top: Math.max(margen, rect.top - Math.min(alturaEstimada, espacioArriba) - 4),
          left: rect.right - 176,
          maxHeight: Math.min(alturaEstimada, espacioArriba),
        });
      } else {
        setPosicion({ top: rect.bottom + 4, left: rect.right - 176, maxHeight: Math.min(alturaEstimada, espacioAbajo) });
      }
    }
    setAbierto((a) => !a);
  };

  return (
    <>
      <button ref={botonRef} onClick={handleAbrir} className="text-gray-400 hover:text-gray-700 p-1">
        <MoreVertical size={16} />
      </button>
      {abierto &&
        createPortal(
          <div
            ref={panelRef}
            onClick={(e) => e.stopPropagation()}
            style={{ top: posicion.top, left: posicion.left, maxHeight: posicion.maxHeight }}
            className="fixed w-44 bg-surface border border-gray-200 rounded-sm shadow-sm z-50 py-1 overflow-y-auto animate-[scale-in_120ms_ease-out]"
          >
            {visibles.map((accion) => (
              <button
                key={accion.label}
                onClick={() => {
                  setAbierto(false);
                  accion.onClick();
                }}
                className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 ${
                  accion.destructivo ? 'text-red-700' : 'text-gray-700'
                }`}
              >
                {accion.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
