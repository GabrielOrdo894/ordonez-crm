import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarClock } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { notaSistema } from '../../lib/notaSistema';
import { sincronizarGoogleCalendarVisita } from '../../lib/googleCalendar';
import { sumarMinutos, minutosEntre } from '../../lib/horas';
import { fechaVisitaLarga } from '../../lib/fechas';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { Select } from '../../components/ui/Select';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { CalendarPicker } from '../google/CalendarPicker';
import { VisitaDetalleContenido } from './VisitaDetalleContenido';
import { useCatalogosVisitas } from './useCatalogosVisitas';
import { esSabado, DURACIONES_MIN, etiquetaDuracion, OTRO_HORARIO } from './horarioVisita';
import type { Visita } from './types';

type ReprogramarState = {
  fecha_visita: string;
  hora_visita: string;
  hora_fin_visita: string;
  empleado: string;
};

function ReprogramarForm({ visita }: { visita: Visita }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const catalogos = useCatalogosVisitas();
  const nombreUsuarioActual = (user?.user_metadata?.nombre as string) || user?.email || 'Sistema';

  const [form, setForm] = useState<ReprogramarState>({
    fecha_visita: visita.fecha_visita ?? '',
    hora_visita: visita.hora_visita?.slice(0, 5) ?? '12:00',
    hora_fin_visita:
      visita.hora_fin_visita?.slice(0, 5) ??
      sumarMinutos(visita.hora_visita?.slice(0, 5) ?? '12:00', 60),
    empleado: visita.empleado ?? '',
  });

  const horasDisponibles = esSabado(form.fecha_visita) ? catalogos.horasSabado : catalogos.horasHabituales;

  // Mismo comportamiento que VisitaForm: cambiar la hora de inicio desplaza hora_fin_visita para
  // mantener la duración ya elegida, en vez de dejarla fija (evitaría una duración negativa).
  const cambiarHoraInicio = (nuevaHora: string) =>
    setForm((f) =>
      // nuevaHora vacía = el usuario acaba de elegir "Otro horario…" y aún no ha escrito una hora
      // real en el <Input type="time"> que aparece debajo — no hay nada que desplazar todavía
      // (bug real corregido 2026-08-31: sumarMinutos('', ...) generaba "NaN:NaN").
      nuevaHora
        ? { ...f, hora_visita: nuevaHora, hora_fin_visita: sumarMinutos(nuevaHora, minutosEntre(f.hora_visita, f.hora_fin_visita)) }
        : { ...f, hora_visita: nuevaHora },
    );

  const duracionActual = minutosEntre(form.hora_visita, form.hora_fin_visita);
  const opcionesDuracion = DURACIONES_MIN.includes(duracionActual)
    ? DURACIONES_MIN
    : [...DURACIONES_MIN, duracionActual].sort((a, b) => a - b);

  const reprogramarMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('visitas').update(form).eq('id', visita.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      const antes = fechaVisitaLarga(visita.fecha_visita, visita.hora_visita);
      const despues = fechaVisitaLarga(form.fecha_visita, form.hora_visita);
      await notaSistema(visita.id, `Visita reprogramada por ${nombreUsuarioActual}: ${antes} → ${despues}`);

      const visitaActualizada = { ...visita, ...form };
      const avisos = await sincronizarGoogleCalendarVisita({
        visitaId: visita.id,
        googleEventId: visita.google_event_id,
        visita: visitaActualizada,
        notificar: true,
        motivoNotificacion: 'reprogramacion',
      });
      avisos.forEach((aviso) => toast.warning(`Visita reprogramada, pero ${aviso.charAt(0).toLowerCase()}${aviso.slice(1)}`));

      queryClient.invalidateQueries({ queryKey: ['visitas'] });
      toast.success('Visita reprogramada correctamente');
      navigate(`/visitas/${visita.id}`);
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <div className="max-w-3xl mx-auto">
      <button
        onClick={() => navigate(`/visitas/${visita.id}`)}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-4"
      >
        <ArrowLeft size={15} />
        Volver a la visita
      </button>

      <h1 className="text-lg font-semibold text-gray-900 mb-1">
        Reprogramar visita — {visita.nombre} {visita.apellidos}
      </h1>
      <p className="text-sm text-gray-500 mb-5">
        Resumen de la visita a modo informativo. Solo la fecha, hora, duración y empleado asignado
        de más abajo se pueden modificar aquí.
      </p>

      <div className="bg-surface border border-gray-200 rounded-sm p-5 mb-4">
        <VisitaDetalleContenido visita={visita} />
      </div>

      <div className="bg-surface border border-gray-200 rounded-sm p-4">
        <div className="flex items-center gap-2 border-b border-gray-200 pb-2.5 mb-4">
          <CalendarClock size={14} className="text-brand" />
          <p className="text-sm font-semibold text-gray-900">Nueva fecha y hora</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="col-span-2">
            <CalendarPicker
              label="Fecha"
              value={form.fecha_visita}
              onChange={(fecha_visita) => setForm((f) => ({ ...f, fecha_visita }))}
            />
          </div>
          <div>
            <Select
              label="Hora"
              options={[
                ...horasDisponibles.map((h) => ({ value: h, label: h })),
                { value: OTRO_HORARIO, label: 'Otro horario…' },
              ]}
              value={horasDisponibles.includes(form.hora_visita) ? form.hora_visita : OTRO_HORARIO}
              onChange={(e) => cambiarHoraInicio(e.target.value === OTRO_HORARIO ? '' : e.target.value)}
            />
            {!horasDisponibles.includes(form.hora_visita) && (
              <Input
                type="time"
                value={form.hora_visita}
                onChange={(e) => cambiarHoraInicio(e.target.value)}
                className="mt-1.5"
              />
            )}
          </div>
          <Select
            label="Duración"
            options={opcionesDuracion.map((min) => ({ value: String(min), label: etiquetaDuracion(min) }))}
            value={String(duracionActual)}
            onChange={(e) =>
              setForm((f) => ({ ...f, hora_fin_visita: sumarMinutos(f.hora_visita, Number(e.target.value)) }))
            }
          />
          <Select
            label="Empleado asignado"
            options={[
              { value: '', label: '— Seleccionar —' },
              ...catalogos.empleados.map((v) => ({ value: v, label: v })),
            ]}
            value={form.empleado}
            onChange={(e) => setForm((f) => ({ ...f, empleado: e.target.value }))}
          />
        </div>
      </div>

      <div className="flex justify-end mt-4">
        <Button onClick={() => reprogramarMutation.mutate()} disabled={reprogramarMutation.isPending}>
          {reprogramarMutation.isPending ? 'Guardando...' : 'Guardar reprogramación'}
        </Button>
      </div>
    </div>
  );
}

export default function VisitaReprogramarPage() {
  const { id } = useParams<{ id: string }>();

  const { data: visita, isLoading } = useQuery({
    queryKey: ['visitas', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from('visitas').select('*').eq('id', id).single();
      if (error) throw error;
      return data as Visita;
    },
  });

  if (isLoading) {
    return <div className="h-96 bg-surface border border-gray-200 rounded-sm animate-pulse" />;
  }

  if (!visita) {
    return <p className="text-sm text-gray-400">Visita no encontrada.</p>;
  }

  return <ReprogramarForm visita={visita} />;
}
