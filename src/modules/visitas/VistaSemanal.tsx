import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { notaSistema } from '../../lib/notaSistema';
import { actualizarEventoVisita } from '../../lib/googleCalendar';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { sumarMinutos, minutosEntre, minutosDesdeMedianoche } from '../../lib/horas';
import type { Visita } from './types';

const DIAS_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const HORA_INICIO = 8;
const HORA_FIN = 20;
const PX_HORA = 56;
const ALTURA_GRID = (HORA_FIN - HORA_INICIO) * PX_HORA;
const DURACION_DEFECTO_MIN = 60;

function toISODate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function inicioDeSemana(d: Date) {
  const copia = new Date(d);
  copia.setDate(copia.getDate() - ((copia.getDay() + 6) % 7));
  copia.setHours(0, 0, 0, 0);
  return copia;
}

type BloqueVisita = {
  visita: Visita;
  inicioMin: number;
  finMin: number;
  carril: number;
  totalCarriles: number;
};

// Asigna cada visita del día a un "carril" (columna) para que dos visitas que se solapan en hora se
// vean lado a lado en vez de una encima de otra — antes ninguna vista permitía detectar visitas
// demasiado juntas en hora (mejora real, auditoría de Calendario 2026-08-18).
function asignarCarriles(visitasDia: Visita[]): BloqueVisita[] {
  const conTiempo = visitasDia
    .filter((v) => v.hora_visita)
    .map((v) => {
      const inicioMin = minutosDesdeMedianoche(v.hora_visita as string);
      const finMin = v.hora_fin_visita
        ? minutosDesdeMedianoche(v.hora_fin_visita)
        : inicioMin + DURACION_DEFECTO_MIN;
      return { visita: v, inicioMin, finMin: Math.max(finMin, inicioMin + 15) };
    })
    .sort((a, b) => a.inicioMin - b.inicioMin);

  const finCarriles: number[] = [];
  const asignadas = conTiempo.map((v) => {
    let carril = finCarriles.findIndex((fin) => fin <= v.inicioMin);
    if (carril === -1) {
      carril = finCarriles.length;
      finCarriles.push(v.finMin);
    } else {
      finCarriles[carril] = v.finMin;
    }
    return { ...v, carril };
  });
  const totalCarriles = finCarriles.length || 1;
  return asignadas.map((v) => ({ ...v, totalCarriles }));
}

function claseEstado(estado: string | null) {
  if (estado === 'Realizada') return 'bg-blue-50 border-blue-500 text-blue-800';
  return 'bg-amber-50 border-amber-500 text-amber-800';
}

type VistaSemanalProps = {
  visitas: Visita[];
  onVer: (visita: Visita) => void;
};

export function VistaSemanal({ visitas, onVer }: VistaSemanalProps) {
  const { user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const nombreUsuarioActual = (user?.user_metadata?.nombre as string) || user?.email || 'Sistema';

  const [semana, setSemana] = useState(() => inicioDeSemana(new Date()));
  const hoyISO = toISODate(new Date());

  const dias = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date(semana);
        d.setDate(semana.getDate() + i);
        return d;
      }),
    [semana],
  );

  const visitasPorDia = useMemo(() => {
    const map: Record<string, Visita[]> = {};
    for (const v of visitas) {
      if (!v.fecha_visita || v.estado === 'Cancelada') continue;
      (map[v.fecha_visita] ??= []).push(v);
    }
    return map;
  }, [visitas]);

  const canceladasPorDia = useMemo(() => {
    const map: Record<string, number> = {};
    for (const v of visitas) {
      if (!v.fecha_visita || v.estado !== 'Cancelada') continue;
      map[v.fecha_visita] = (map[v.fecha_visita] ?? 0) + 1;
    }
    return map;
  }, [visitas]);

  // Arrastrar una visita a otro día/hora la reprograma de verdad — mismo patrón que reprogramar
  // desde el formulario (fecha/hora + sincronización con Google Calendar si ya tenía evento), pero
  // sin abrir el formulario completo (mejora real, auditoría de Calendario 2026-08-18). La duración
  // ya elegida se mantiene, solo se desplaza el inicio.
  const reprogramarMutation = useMutation({
    mutationFn: async ({
      visita,
      fecha,
      hora,
    }: {
      visita: Visita;
      fecha: string;
      hora: string;
    }) => {
      const duracion = visita.hora_fin_visita
        ? minutosEntre(visita.hora_visita ?? hora, visita.hora_fin_visita)
        : DURACION_DEFECTO_MIN;
      const horaFin = sumarMinutos(hora, duracion);
      const { error } = await supabase
        .from('visitas')
        .update({ fecha_visita: fecha, hora_visita: hora, hora_fin_visita: horaFin })
        .eq('id', visita.id);
      if (error) throw error;
      return { fecha, hora };
    },
    onSuccess: async ({ fecha, hora }, { visita }) => {
      if (visita.google_event_id) {
        actualizarEventoVisita(visita.google_event_id, {
          ...visita,
          fecha_visita: fecha,
          hora_visita: hora,
        }).catch((error) =>
          toast.warning(
            `Visita movida, pero no se sincronizó con Google Calendar: ${error.message}`,
          ),
        );
      }
      await notaSistema(
        visita.id,
        `Visita reprogramada a ${fecha} ${hora} (arrastrada en el calendario) por ${nombreUsuarioActual}`,
      );
      queryClient.invalidateQueries({ queryKey: ['visitas'] });
      toast.success('Visita reprogramada');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const handleDrop = (e: React.DragEvent<HTMLDivElement>, fecha: string) => {
    e.preventDefault();
    const visitaId = e.dataTransfer.getData('text/plain');
    const visita = visitas.find((v) => v.id === visitaId);
    if (!visita) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const minutosOffset = ((e.clientY - rect.top) / PX_HORA) * 60;
    let minutosAbsolutos = HORA_INICIO * 60 + minutosOffset;
    minutosAbsolutos = Math.round(minutosAbsolutos / 15) * 15;
    minutosAbsolutos = Math.min(Math.max(minutosAbsolutos, HORA_INICIO * 60), HORA_FIN * 60 - 15);
    const hora = `${String(Math.floor(minutosAbsolutos / 60)).padStart(2, '0')}:${String(minutosAbsolutos % 60).padStart(2, '0')}`;
    if (visita.fecha_visita === fecha && visita.hora_visita?.slice(0, 5) === hora) return;
    reprogramarMutation.mutate({ visita, fecha, hora });
  };

  const horas = Array.from({ length: HORA_FIN - HORA_INICIO }, (_, i) => HORA_INICIO + i);

  return (
    <div className="bg-surface border border-gray-200 rounded-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() =>
            setSemana((s) => {
              const d = new Date(s);
              d.setDate(d.getDate() - 7);
              return d;
            })
          }
          className="text-gray-400 hover:text-gray-700"
        >
          <ChevronLeft size={16} />
        </button>
        <button
          onClick={() => setSemana(inicioDeSemana(new Date()))}
          className="text-sm font-semibold text-gray-900 hover:text-brand"
          title="Ir a la semana actual"
        >
          Semana del {dias[0].getDate()} al {dias[6].getDate()} de{' '}
          {dias[6].toLocaleDateString('es', { month: 'long', year: 'numeric' })}
        </button>
        <button
          onClick={() =>
            setSemana((s) => {
              const d = new Date(s);
              d.setDate(d.getDate() + 7);
              return d;
            })
          }
          className="text-gray-400 hover:text-gray-700"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      <p className="text-xs text-gray-400 mb-3">
        Arrastra una visita para reprogramarla a otro día u hora.
      </p>

      <div className="overflow-x-auto">
        <div
          className="grid gap-px bg-gray-100 min-w-[880px]"
          style={{ gridTemplateColumns: '48px repeat(7, 1fr)' }}
        >
          <div className="bg-surface" />
          {dias.map((d) => {
            const iso = toISODate(d);
            const esHoy = iso === hoyISO;
            return (
              <div
                key={iso}
                className={`bg-surface text-center py-1.5 ${esHoy ? 'text-brand' : 'text-gray-700'}`}
              >
                <p className="text-xs font-semibold uppercase tracking-wide">
                  {DIAS_SEMANA[(d.getDay() + 6) % 7].slice(0, 3)}
                </p>
                <p className={`text-sm font-bold ${esHoy ? 'text-brand' : ''}`}>{d.getDate()}</p>
                {canceladasPorDia[iso] > 0 && (
                  <p className="text-[10px] text-gray-400">
                    {canceladasPorDia[iso]} cancelada{canceladasPorDia[iso] > 1 ? 's' : ''}
                  </p>
                )}
              </div>
            );
          })}

          <div className="bg-surface relative" style={{ height: ALTURA_GRID }}>
            {horas.map((h) => (
              <div
                key={h}
                className="absolute right-1 text-[10px] text-gray-400"
                style={{ top: (h - HORA_INICIO) * PX_HORA - 6 }}
              >
                {h}:00
              </div>
            ))}
          </div>

          {dias.map((d) => {
            const iso = toISODate(d);
            const bloques = asignarCarriles(visitasPorDia[iso] ?? []);
            return (
              <div
                key={iso}
                className="bg-surface relative"
                style={{ height: ALTURA_GRID }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => handleDrop(e, iso)}
              >
                {horas.map((h) => (
                  <div
                    key={h}
                    className="absolute left-0 right-0 border-t border-gray-100"
                    style={{ top: (h - HORA_INICIO) * PX_HORA }}
                  />
                ))}
                {bloques.map(({ visita, inicioMin, finMin, carril, totalCarriles }) => {
                  const top = Math.min(
                    Math.max(((inicioMin - HORA_INICIO * 60) / 60) * PX_HORA, 0),
                    ALTURA_GRID - 18,
                  );
                  const alto = Math.max(((finMin - inicioMin) / 60) * PX_HORA - 2, 18);
                  return (
                    <div
                      key={visita.id}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData('text/plain', visita.id)}
                      onClick={() => onVer(visita)}
                      title={`${visita.hora_visita?.slice(0, 5)}–${visita.hora_fin_visita?.slice(0, 5) ?? ''} · ${visita.nombre} ${visita.apellidos}`}
                      className={`absolute rounded-sm border-l-2 px-1.5 py-0.5 text-[11px] leading-tight cursor-grab active:cursor-grabbing overflow-hidden hover:z-10 hover:shadow-sm ${claseEstado(visita.estado)}`}
                      style={{
                        top,
                        height: alto,
                        left: `${(carril / totalCarriles) * 100}%`,
                        width: `${100 / totalCarriles}%`,
                      }}
                    >
                      <p className="font-semibold truncate">
                        {visita.hora_visita?.slice(0, 5)} {visita.nombre}
                      </p>
                      <p className="truncate opacity-80">{visita.tipo}</p>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
