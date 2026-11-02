import { useLayoutEffect, useRef } from 'react';
import type { TextareaHTMLAttributes } from 'react';

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string;
  error?: string;
  hint?: string;
  // Alto mínimo en líneas; el cuadro crece solo con el contenido (sin barra de scroll interna).
  rows?: number;
};

// Cuadro de texto largo del CRM (2026-11-02, petición de Gabriel): hasta ahora cada pantalla
// pintaba su propio <textarea> a mano, con alturas distintas, sin aviso en rojo y sin crecer con
// el texto. Mismo aspecto que Input y mismo contrato (`error` pinta border-red-400, que es lo que
// busca enfocarPrimerError para llevar la vista al dato que falta). Para texto con formato
// (negrita, viñetas) que vaya a un PDF se usa EditorTexto, no este componente.
export function Textarea({ label, error, hint, rows = 3, className = '', value, onChange, ...props }: TextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <div>
      {label && (
        <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
          {label}
          {props.required && <span className="text-red-500"> *</span>}
        </label>
      )}
      <textarea
        ref={ref}
        rows={rows}
        value={value}
        onChange={onChange}
        className={`w-full border border-gray-200 rounded-sm px-2.5 py-1.5 text-sm leading-6 resize-none overflow-hidden focus:border-brand focus:outline-none disabled:bg-gray-50 disabled:text-gray-500 ${
          error ? 'border-red-400' : ''
        } ${className}`}
        {...props}
      />
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
      {hint && !error && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}
