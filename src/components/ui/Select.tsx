import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

type Option = { value: string; label: string };

type SelectProps = {
  label?: string;
  error?: string;
  hint?: string;
  options: Option[];
  value?: string;
  onChange?: (e: { target: { value: string } }) => void;
  className?: string;
  disabled?: boolean;
  required?: boolean;
};

// Listbox propio en vez de <select> nativo: el <select> nativo solo permite personalizar la caja
// cerrada — el desplegable de opciones lo dibuja el sistema operativo y no admite estilos CSS en
// ningún navegador. Se mantiene la misma forma de evento (e.target.value) que un <select> real
// para no tener que tocar los ~28 sitios que usan este componente.
export function Select({ label, error, hint, options, value, onChange, className = '', disabled, required }: SelectProps) {
  const [abierto, setAbierto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const actual = options.find((o) => o.value === value);

  useEffect(() => {
    if (!abierto) return;
    const alClicar = (e: MouseEvent) => {
      if (raiz.current && !raiz.current.contains(e.target as Node)) setAbierto(false);
    };
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAbierto(false);
    };
    document.addEventListener('mousedown', alClicar);
    document.addEventListener('keydown', alTeclear);
    return () => {
      document.removeEventListener('mousedown', alClicar);
      document.removeEventListener('keydown', alTeclear);
    };
  }, [abierto]);

  const elegir = (v: string) => {
    setAbierto(false);
    onChange?.({ target: { value: v } });
  };

  return (
    <div ref={raiz}>
      {label && (
        <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
          {label}
          {required && <span className="text-red-500"> *</span>}
        </label>
      )}
      <div className="relative">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setAbierto((a) => !a)}
          className={`w-full flex items-center justify-between gap-2 border rounded-sm pl-2.5 pr-2.5 py-1.5 text-sm bg-surface text-left transition-colors ${
            disabled
              ? 'opacity-60 cursor-not-allowed'
              : 'cursor-pointer hover:border-gray-300'
          } ${abierto ? 'border-brand' : error ? 'border-red-400' : 'border-gray-200'} ${className}`}
        >
          <span className="truncate">{actual?.label ?? '—'}</span>
          <ChevronDown size={14} className={`shrink-0 text-gray-400 transition-transform ${abierto ? 'rotate-180' : ''}`} />
        </button>
        {abierto && (
          <div className="absolute z-20 mt-1 w-full min-w-max bg-surface border border-gray-200 rounded-sm shadow-sm max-h-64 overflow-y-auto py-1">
            {options.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => elegir(o.value)}
                className={`w-full flex items-center justify-between gap-2 text-left px-2.5 py-1.5 text-sm ${
                  o.value === value ? 'text-brand font-medium bg-brand-light/60' : 'text-gray-700 hover:bg-brand-light'
                }`}
              >
                <span className="truncate">{o.label}</span>
                {o.value === value && <Check size={13} className="shrink-0" />}
              </button>
            ))}
          </div>
        )}
      </div>
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
      {hint && !error && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}
