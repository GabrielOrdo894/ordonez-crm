import { useEffect, useRef, useState } from 'react';
import { tiposIvaPorPais, etiquetaCortaIva } from './iva';

type SelectorIvaProps = {
  pais: string;
  value: string;
  onChange: (value: string) => void;
};

export function SelectorIva({ pais, value, onChange }: SelectorIvaProps) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [abierto]);

  const opciones = tiposIvaPorPais(pais);

  return (
    <div ref={ref} className="relative">
      <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
        {pais === 'Francia' ? 'Tipo de TVA' : 'Tipo de IVA'}
      </label>
      <button
        type="button"
        onClick={() => setAbierto((a) => !a)}
        className="w-full border border-gray-200 rounded-sm px-2.5 py-1.5 text-sm text-left bg-surface focus:border-brand focus:outline-none"
      >
        {etiquetaCortaIva(value)}
      </button>
      {abierto && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-surface border border-gray-200 rounded-sm shadow-sm z-20 py-1">
          {opciones.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => {
                onChange(o.value);
                setAbierto(false);
              }}
              className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 ${
                o.value === value ? 'text-brand font-medium' : 'text-gray-700'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
