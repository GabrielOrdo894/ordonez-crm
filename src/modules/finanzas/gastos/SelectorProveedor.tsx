import { useEffect, useMemo, useRef, useState } from 'react';
import { Building2, Check, ChevronDown, Plus, Search } from 'lucide-react';
import type { Proveedor } from '../proveedores/types';

// Selector de proveedor del formulario de gasto (2026-11-04, petición de Gabriel): más grande que el
// Select genérico, con buscador por nombre, NIF/SIRET o ciudad, y el identificador fiscal y el país a
// la vista para no confundir proveedores con nombres parecidos (Alkain / Alcain).

const sinAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

type Props = {
  proveedores: Proveedor[];
  value: string | null;
  // Texto libre del proveedor cuando el gasto no está enlazado a ninguno (p. ej. creado desde el banco).
  nombreLibre?: string;
  onChange: (id: string | null) => void;
  onNuevo: () => void;
};

export function SelectorProveedor({ proveedores, value, nombreLibre, onChange, onNuevo }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const raiz = useRef<HTMLDivElement>(null);
  const buscador = useRef<HTMLInputElement>(null);
  const actual = proveedores.find((p) => p.id === value) ?? null;

  useEffect(() => {
    if (!abierto) return;
    buscador.current?.focus();
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

  const filtrados = useMemo(() => {
    const q = sinAcentos(busqueda.trim());
    if (!q) return proveedores;
    return proveedores.filter((p) =>
      sinAcentos(
        `${p.razon_social ?? ''} ${p.identificador ?? ''} ${p.identificador_extra ?? ''} ${p.direccion ?? ''}`,
      ).includes(q),
    );
  }, [proveedores, busqueda]);

  const elegir = (id: string | null) => {
    onChange(id);
    setAbierto(false);
    setBusqueda('');
  };

  return (
    <div ref={raiz} className="relative">
      <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
        Proveedor
      </label>
      <button
        type="button"
        onClick={() => setAbierto((a) => !a)}
        className={`w-full flex items-center justify-between gap-3 border rounded-sm px-3 py-2.5 text-left bg-surface transition-colors ${
          abierto ? 'border-brand' : 'border-gray-200 hover:border-gray-300'
        }`}
      >
        <span className="flex items-center gap-2.5 min-w-0">
          <Building2 size={18} className="shrink-0 text-gray-400" />
          {actual ? (
            <span className="min-w-0">
              <span className="block text-base font-medium text-gray-900 truncate">
                {actual.razon_social}
              </span>
              <span className="block text-xs text-gray-500 truncate">
                {[actual.identificador, actual.pais].filter(Boolean).join(' · ')}
              </span>
            </span>
          ) : (
            <span className="text-base text-gray-400 truncate">
              {nombreLibre ? `${nombreLibre} (sin enlazar a un proveedor)` : 'Elegir proveedor'}
            </span>
          )}
        </span>
        <ChevronDown
          size={16}
          className={`shrink-0 text-gray-400 transition-transform ${abierto ? 'rotate-180' : ''}`}
        />
      </button>

      {abierto && (
        <div className="absolute z-30 mt-1 w-full bg-surface border border-gray-200 rounded-sm shadow-sm">
          <div className="p-2 border-b border-gray-100">
            <div className="relative">
              <Search
                size={15}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                ref={buscador}
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por nombre, NIF/SIRET o ciudad"
                className="w-full border border-gray-200 rounded-sm pl-8 pr-2.5 py-2 text-sm focus:border-brand focus:outline-none"
              />
            </div>
          </div>
          <div className="max-h-[26rem] overflow-y-auto py-1">
            {filtrados.length === 0 && (
              <p className="px-3 py-3 text-sm text-gray-400">
                Ningún proveedor coincide con la búsqueda.
              </p>
            )}
            {filtrados.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => elegir(p.id)}
                className={`w-full flex items-center justify-between gap-3 text-left px-3 py-2.5 ${
                  p.id === value ? 'bg-brand-light/60' : 'hover:bg-brand-light'
                }`}
              >
                <span className="min-w-0">
                  <span
                    className={`block text-sm truncate ${p.id === value ? 'text-brand font-semibold' : 'text-gray-900 font-medium'}`}
                  >
                    {p.razon_social}
                  </span>
                  <span className="block text-xs text-gray-500 truncate">
                    {[p.identificador, p.pais, p.direccion].filter(Boolean).join(' · ')}
                  </span>
                </span>
                {p.id === value && <Check size={15} className="shrink-0 text-brand" />}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-gray-100 p-2">
            <button
              type="button"
              onClick={() => elegir(null)}
              className="text-xs text-gray-500 hover:text-gray-800 px-2 py-1.5"
            >
              Sin proveedor
            </button>
            <button
              type="button"
              onClick={() => {
                setAbierto(false);
                onNuevo();
              }}
              className="flex items-center gap-1.5 text-sm font-medium text-brand hover:underline px-2 py-1.5"
            >
              <Plus size={15} />
              Añadir proveedor
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
