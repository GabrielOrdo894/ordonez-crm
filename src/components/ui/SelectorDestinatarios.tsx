import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

type Persona = { id: string; nombre: string };

type SelectorDestinatariosProps = {
  label?: string;
  personas: Persona[];
  seleccionados: string[];
  onChange: (ids: string[]) => void;
};

export function SelectorDestinatarios({ label = 'Para', personas, seleccionados, onChange }: SelectorDestinatariosProps) {
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const handleClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [abierto]);

  const disponibles = personas.filter(
    (p) => !seleccionados.includes(p.id) && p.nombre.toLowerCase().includes(busqueda.toLowerCase()),
  );
  const todosSeleccionados = personas.length > 0 && seleccionados.length === personas.length;

  const agregar = (id: string) => {
    onChange([...seleccionados, id]);
    setBusqueda('');
  };
  const quitar = (id: string) => onChange(seleccionados.filter((s) => s !== id));

  return (
    <div ref={ref} className="relative">
      <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">{label}</label>
      <div
        onClick={() => setAbierto(true)}
        className="w-full min-h-[34px] border border-gray-200 rounded-sm px-2 py-1 flex flex-wrap items-center gap-1.5 focus-within:border-brand cursor-text"
      >
        {seleccionados.length === 0 && !abierto && (
          <span className="text-sm text-gray-400 px-1">Todo el equipo</span>
        )}
        {seleccionados.map((id) => {
          const p = personas.find((x) => x.id === id);
          if (!p) return null;
          return (
            <span key={id} className="flex items-center gap-1 bg-brand-light text-brand text-xs px-2 py-0.5 rounded-full">
              {p.nombre}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  quitar(id);
                }}
                className="hover:text-brand-dark"
              >
                <X size={11} />
              </button>
            </span>
          );
        })}
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          onFocus={() => setAbierto(true)}
          placeholder={seleccionados.length === 0 ? 'Añadir destinatario...' : ''}
          className="flex-1 min-w-[100px] text-sm outline-none py-0.5"
        />
      </div>

      {abierto && (
        <div className="absolute z-20 mt-1 w-full bg-surface border border-gray-200 rounded-sm shadow-sm py-1 max-h-56 overflow-y-auto animate-[scale-in_120ms_ease-out]">
          {!todosSeleccionados && (
            <button
              type="button"
              onClick={() => {
                onChange(personas.map((p) => p.id));
                setBusqueda('');
              }}
              className="w-full text-left px-3 py-1.5 text-sm font-medium text-brand hover:bg-brand-light"
            >
              Todo el equipo ({personas.length})
            </button>
          )}
          {disponibles.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => agregar(p.id)}
              className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              {p.nombre}
            </button>
          ))}
          {disponibles.length === 0 && todosSeleccionados && (
            <p className="px-3 py-1.5 text-xs text-gray-400">Ya están todos añadidos</p>
          )}
        </div>
      )}
    </div>
  );
}
