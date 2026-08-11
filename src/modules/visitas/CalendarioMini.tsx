import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Visita } from './types';

const DIAS_SEMANA = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

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

export type EventoExtra = { fecha: string; titulo: string };

type CalendarioMiniProps = {
  visitas: Visita[];
  onVer: (visita: Visita) => void;
  onEditar: (visita: Visita) => void;
  ocultarPanelInferior?: boolean;
  onSeleccionarDia?: (dia: string | null) => void;
  eventosExtra?: EventoExtra[];
};

export function CalendarioMini({ visitas, onVer, onEditar, ocultarPanelInferior, onSeleccionarDia, eventosExtra }: CalendarioMiniProps) {
  const [mesActual, setMesActual] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [diaSeleccionado, setDiaSeleccionadoState] = useState<string | null>(null);

  const setDiaSeleccionado = (dia: string | null) => {
    setDiaSeleccionadoState(dia);
    onSeleccionarDia?.(dia);
  };

  const hoyISO = toISODate(new Date());

  const visitasPorDia = useMemo(() => {
    const map: Record<string, Visita[]> = {};
    for (const v of visitas) {
      if (!v.fecha_visita) continue;
      (map[v.fecha_visita] ??= []).push(v);
    }
    return map;
  }, [visitas]);

  const eventosExtraPorDia = useMemo(() => {
    const map: Record<string, EventoExtra[]> = {};
    for (const e of eventosExtra ?? []) {
      (map[e.fecha] ??= []).push(e);
    }
    return map;
  }, [eventosExtra]);

  const grid = useMemo(() => buildGrid(mesActual), [mesActual]);

  const visitasDelDia = diaSeleccionado ? visitasPorDia[diaSeleccionado] ?? [] : [];

  return (
    <div className="bg-surface border border-gray-200 rounded-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => setMesActual(new Date(mesActual.getFullYear(), mesActual.getMonth() - 1, 1))}
          className="text-gray-400 hover:text-gray-700"
        >
          <ChevronLeft size={16} />
        </button>
        <p className="text-sm font-semibold text-gray-900">
          {MESES[mesActual.getMonth()]} {mesActual.getFullYear()}
        </p>
        <button
          onClick={() => setMesActual(new Date(mesActual.getFullYear(), mesActual.getMonth() + 1, 1))}
          className="text-gray-400 hover:text-gray-700"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {DIAS_SEMANA.map((d) => (
          <div key={d} className="text-xs text-gray-400 font-semibold py-1">
            {d}
          </div>
        ))}

        {grid.map((d) => {
          const iso = toISODate(d);
          const delMes = d.getMonth() === mesActual.getMonth();
          const dia = visitasPorDia[iso] ?? [];
          const tieneRealizada = dia.some((v) => v.estado === 'Realizada');
          const tienePendiente = dia.some((v) => v.estado === 'Pendiente');
          const tieneEventoExtra = (eventosExtraPorDia[iso] ?? []).length > 0;
          const esHoy = iso === hoyISO;
          const seleccionado = iso === diaSeleccionado;

          return (
            <button
              key={iso}
              onClick={() => setDiaSeleccionado(seleccionado ? null : iso)}
              className={`aspect-square flex flex-col items-center justify-center rounded-sm text-xs ${
                !delMes ? 'text-gray-300' : 'text-gray-700'
              } ${esHoy ? 'ring-1 ring-brand bg-brand-light font-semibold text-brand' : ''} ${
                seleccionado && !esHoy ? 'bg-brand-hover' : ''
              } hover:bg-gray-50`}
            >
              <span>{d.getDate()}</span>
              {(tieneRealizada || tienePendiente || tieneEventoExtra) && (
                <span className="flex items-center gap-0.5 mt-0.5">
                  {(tieneRealizada || tienePendiente) && (
                    <span className={`w-1.5 h-1.5 rounded-full ${tieneRealizada ? 'bg-blue-600' : 'bg-amber-500'}`} />
                  )}
                  {tieneEventoExtra && <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-600" /> Realizada
        </span>
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Pendiente
        </span>
        {eventosExtra && eventosExtra.length > 0 && (
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-500" /> Evento importante
          </span>
        )}
      </div>

      {!ocultarPanelInferior && diaSeleccionado && (
        <div className="mt-4 pt-3 border-t border-gray-200">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">
            Visitas — {diaSeleccionado}
          </p>
          {visitasDelDia.length === 0 && <p className="text-sm text-gray-400">Sin visitas ese día</p>}
          <div className="flex flex-col gap-2">
            {visitasDelDia.map((v) => (
              <div key={v.id} className="flex items-center justify-between gap-2 flex-wrap text-sm border border-gray-200 rounded-sm px-3 py-2">
                <div>
                  <p className="font-medium text-gray-900">
                    {v.hora_visita?.slice(0, 5)} · {v.nombre} {v.apellidos}
                  </p>
                  <p className="text-xs text-gray-500">
                    {v.tipo} · {v.zona} · {v.empleado}
                  </p>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <button
                    onClick={() => onVer(v)}
                    className="bg-surface border border-gray-200 text-gray-700 px-2.5 py-1 rounded-sm text-xs hover:bg-gray-50"
                  >
                    Ver
                  </button>
                  <button
                    onClick={() => onEditar(v)}
                    className="bg-brand text-white px-2.5 py-1 rounded-sm text-xs hover:bg-brand-dark"
                  >
                    Editar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
