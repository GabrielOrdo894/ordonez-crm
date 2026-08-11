import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, ChevronLeft, ChevronRight } from 'lucide-react';
import { Input } from '../../components/ui/Input';
import { listarEventosDelMes, type EventoDelDia } from '../../lib/googleCalendar';

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

type CalendarPickerProps = {
  label?: string;
  value: string;
  onChange: (fecha: string) => void;
  error?: string;
  min?: string;
};

export function CalendarPicker({ label, value, onChange, error, min }: CalendarPickerProps) {
  const [mesActual, setMesActual] = useState(() => {
    const base = value ? new Date(`${value}T00:00:00`) : new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });
  const [eventosPorDia, setEventosPorDia] = useState<Record<string, EventoDelDia[]>>({});
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    const desde = new Date(mesActual.getFullYear(), mesActual.getMonth(), 1);
    const hasta = new Date(mesActual.getFullYear(), mesActual.getMonth() + 2, 1);

    listarEventosDelMes(desde, hasta)
      .then((detalle) => {
        if (cancelado) return;
        setEventosPorDia(detalle);
        setAviso(null);
      })
      .catch((err) => {
        if (cancelado) return;
        setAviso(err.message ?? 'No se pudo consultar Google Calendar');
      });

    return () => {
      cancelado = true;
    };
  }, [mesActual]);

  const grid = useMemo(() => buildGrid(mesActual), [mesActual]);

  if (aviso) {
    return (
      <div>
        <Input
          label={label}
          type="date"
          required
          value={value}
          error={error}
          min={min}
          onChange={(e) => onChange(e.target.value)}
        />
        <p className="text-xs text-gray-400 mt-1">{aviso}</p>
      </div>
    );
  }

  const eventosDelDiaSeleccionado = value ? (eventosPorDia[value] ?? []) : null;

  return (
    <div>
      {label && <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">{label}</label>}
      <div className="flex items-start gap-3">
        <div className={`border rounded-sm p-3 w-[316px] shrink-0 ${error ? 'border-red-400' : 'border-gray-200'}`}>
          <div className="flex items-center justify-between mb-2.5">
            <button
              type="button"
              onClick={() => setMesActual(new Date(mesActual.getFullYear(), mesActual.getMonth() - 1, 1))}
              className="text-gray-400 hover:text-gray-700"
            >
              <ChevronLeft size={16} />
            </button>
            <p className="text-sm font-semibold text-gray-900">
              {MESES[mesActual.getMonth()]} {mesActual.getFullYear()}
            </p>
            <button
              type="button"
              onClick={() => setMesActual(new Date(mesActual.getFullYear(), mesActual.getMonth() + 1, 1))}
              className="text-gray-400 hover:text-gray-700"
            >
              <ChevronRight size={16} />
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
              const numEventos = (eventosPorDia[iso] ?? []).length;
              const seleccionado = iso === value;
              const esDomingo = d.getDay() === 0;
              const deshabilitado = (!!min && iso < min) || esDomingo;

              const colorFondo = seleccionado
                ? 'bg-brand-light border-brand'
                : numEventos >= 3
                  ? 'bg-red-50 border-red-300'
                  : numEventos >= 1
                    ? 'bg-amber-50 border-amber-300'
                    : 'bg-surface border-transparent';

              return (
                <button
                  type="button"
                  key={iso}
                  disabled={deshabilitado}
                  title={esDomingo ? 'No se trabaja los domingos' : undefined}
                  onClick={() => onChange(iso)}
                  className={`h-10 w-10 flex items-center justify-center rounded-sm text-xs border ${colorFondo} ${
                    deshabilitado
                      ? 'text-gray-200 cursor-not-allowed hover:border-transparent'
                      : `${!delMes ? 'text-gray-300' : 'text-gray-700'} hover:border-brand`
                  }`}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 mt-2.5 pt-2 border-t border-gray-200 text-[10px] text-gray-500">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-sm bg-amber-50 border border-amber-300" /> 1–2
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-sm bg-red-50 border border-red-300" /> 3+
            </span>
          </div>
        </div>

        <div className="flex-1 min-w-0 border border-gray-200 rounded-sm p-2.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2 flex items-center gap-1.5">
            <CalendarClock size={13} className="text-brand shrink-0" />
            {value
              ? `Ocupación — ${new Date(`${value}T00:00:00`).toLocaleDateString('es', { day: '2-digit', month: 'short' })}`
              : 'Ocupación del día'}
          </p>
          {!eventosDelDiaSeleccionado ? (
            <p className="text-xs text-gray-400">Selecciona un día en el calendario.</p>
          ) : eventosDelDiaSeleccionado.length === 0 ? (
            <p className="text-xs text-gray-400">Sin visitas — día libre.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {eventosDelDiaSeleccionado.map((ev, i) => (
                <div key={i} className="bg-surface border border-gray-200 rounded-sm px-2.5 py-1.5">
                  <p className="text-xs font-semibold text-gray-900">
                    {ev.inicio}
                    {ev.fin && ` – ${ev.fin}`}
                  </p>
                  <p className="text-xs text-gray-500 truncate">{ev.titulo}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}
