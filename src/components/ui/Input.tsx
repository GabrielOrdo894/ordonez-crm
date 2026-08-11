import type { InputHTMLAttributes } from 'react';

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  error?: string;
  hint?: string;
};

export function Input({ label, error, hint, className = '', ...props }: InputProps) {
  return (
    <div>
      {label && (
        <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
          {label}
        </label>
      )}
      <input
        className={`w-full border border-gray-200 rounded-sm px-2.5 py-1.5 text-sm focus:border-brand focus:outline-none ${
          error ? 'border-red-400' : ''
        } ${className}`}
        {...props}
      />
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
      {hint && !error && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}
