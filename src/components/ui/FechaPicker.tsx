import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { fechaVisitaCorta } from '../../lib/fechas';

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];
const DIAS_SEMANA = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

function toISODate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function buildGrid(monthDate: Date) {
  const first = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7;
  const start = new Date(first);
  start.setDate(first.getDate() - offset);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

type FechaPickerProps = {
  label?: string;
  value: string;
  onChange: (fecha: string) => void;
  placeholder?: string;
  min?: string;
  className?: string;
};

export function FechaPicker({ label, value, onChange, placeholder = 'Sin fecha', min, className = '' }: FechaPickerProps) {
  const [abierto, setAbierto] = useState(false);
  const [posicion, setPosicion] = useState({ top: 0, left: 0 });
  const [mesActual, setMesActual] = useState(() => {
    const base = value ? new Date(`${value}T00:00:00`) : new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });
  const botonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (botonRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setAbierto(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [abierto]);

  const grid = useMemo(() => buildGrid(mesActual), [mesActual]);
  const hoyISO = toISODate(new Date());

  const handleAbrir = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!abierto && botonRef.current) {
      const rect = botonRef.current.getBoundingClientRect();
      setPosicion({ top: rect.bottom + 4, left: rect.left });
      setMesActual(() => {
        const base = value ? new Date(`${value}T00:00:00`) : new Date();
        return new Date(base.getFullYear(), base.getMonth(), 1);
      });
    }
    setAbierto((a) => !a);
  };

  return (
    <div className={className}>
      {label && <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">{label}</label>}
      <button
        ref={botonRef}
        type="button"
        onClick={handleAbrir}
        className="w-full flex items-center gap-2 border border-gray-200 rounded-sm px-2.5 py-1.5 text-sm hover:border-brand focus:border-brand focus:outline-none bg-surface"
      >
        <Calendar size={14} className="text-gray-400 shrink-0" />
        <span className={value ? 'text-gray-900' : 'text-gray-400'}>{value ? fechaVisitaCorta(value) : placeholder}</span>
      </button>

      {abierto &&
        createPortal(
          <div
            ref={panelRef}
            onClick={(e) => e.stopPropagation()}
            style={{ top: posicion.top, left: posicion.left }}
            className="fixed z-50 bg-surface border border-gray-200 rounded-sm shadow-sm p-3 w-[260px] animate-[scale-in_120ms_ease-out]"
          >
            <div className="flex items-center justify-between mb-2">
              <button
                type="button"
                onClick={() => setMesActual(new Date(mesActual.getFullYear(), mesActual.getMonth() - 1, 1))}
                className="text-gray-400 hover:text-gray-700"
              >
                <ChevronLeft size={15} />
              </button>
              <p className="text-sm font-semibold text-gray-900">
                {MESES[mesActual.getMonth()]} {mesActual.getFullYear()}
              </p>
              <button
                type="button"
                onClick={() => setMesActual(new Date(mesActual.getFullYear(), mesActual.getMonth() + 1, 1))}
                className="text-gray-400 hover:text-gray-700"
              >
                <ChevronRight size={15} />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center">
              {DIAS_SEMANA.map((d) => (
                <div key={d} className="text-[10px] text-gray-400 font-semibold py-0.5">
                  {d}
                </div>
              ))}
              {grid.map((d) => {
                const iso = toISODate(d);
                const delMes = d.getMonth() === mesActual.getMonth();
                const seleccionado = iso === value;
                const esHoy = iso === hoyISO;
                const deshabilitado = !!min && iso < min;
                return (
                  <button
                    type="button"
                    key={iso}
                    disabled={deshabilitado}
                    onClick={() => {
                      onChange(iso);
                      setAbierto(false);
                    }}
                    className={`h-8 w-8 flex items-center justify-center rounded-sm text-xs border ${
                      seleccionado
                        ? 'bg-brand text-white border-brand font-semibold'
                        : deshabilitado
                          ? 'text-gray-200 cursor-not-allowed border-transparent'
                          : `${!delMes ? 'text-gray-300' : 'text-gray-700'} ${esHoy ? 'border-brand' : 'border-transparent'} hover:border-brand`
                    }`}
                  >
                    {d.getDate()}
                  </button>
                );
              })}
            </div>

            {value && (
              <button
                type="button"
                onClick={() => {
                  onChange('');
                  setAbierto(false);
                }}
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-600 mt-2 pt-2 border-t border-gray-100 w-full"
              >
                <X size={12} />
                Quitar fecha
              </button>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
