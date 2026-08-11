import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Star, User, MapPin, Hammer, CalendarClock } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { notaSistema } from '../../lib/notaSistema';
import { sincronizarPipelineCliente } from '../../lib/pipelineSync';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Button } from '../../components/ui/Button';
import { MapsAutocomplete } from '../google/MapsAutocomplete';
import { CalendarPicker } from '../google/CalendarPicker';
import { crearEventoVisita } from '../../lib/googleCalendar';
import type { Visita, NuevaVisita, EstadoVisita } from './types';

function Seccion({ numero, titulo, icono: Icono, children }: { numero: number; titulo: string; icono: typeof User; children: ReactNode }) {
  return (
    <section className="bg-surface border border-gray-200 rounded-sm p-4">
      <div className="flex items-center gap-2 border-b border-gray-200 pb-2.5 mb-4">
        <span className="w-6 h-6 rounded-full bg-brand text-white text-xs font-bold flex items-center justify-center shrink-0">
          {numero}
        </span>
        <Icono size={14} className="text-brand" />
        <p className="text-sm font-semibold text-gray-900">{titulo}</p>
      </div>
      {children}
    </section>
  );
}

const ZONAS_ES = ['Irún', 'Hondarribia', 'Donostia/San Sebastián', 'Rentería', 'Bera de Bidasoa', 'Otro ES'];
const ZONAS_FR = ['Hendaye', 'Urrugne', 'Saint-Jean-de-Luz', 'Bayonne', 'Autre FR'];
const TIPOS_REFORMA = ['Baño', 'Cocina', 'Reforma integral', 'Pintura', 'Suelos', 'Fachada', 'Fontanería', 'Electricidad', 'Otro'];
const EMPLEADOS = ['Ricardo Ordoñez', 'Ricardo Ordoñez y Gabriel', 'Ricardo Ordoñez y Santiago', 'Gabriel Ordoñez'];
const ESTADOS: EstadoVisita[] = ['Pendiente', 'Realizada', 'Cancelada'];
const HORAS_HABITUALES = ['12:00', '12:30', '13:00', '17:00', '17:30', '18:00'];
const HORAS_SABADO = ['12:00', '12:30', '13:00'];
const OTRO_HORARIO = 'otro';

function esSabado(fecha: string) {
  if (!fecha) return false;
  return new Date(`${fecha}T00:00:00`).getDay() === 6;
}

type FormState = {
  nombre: string; apellidos: string; telefono: string; email: string; idioma: string; contacto: string;
  direccion: string; direccion_extra: string; lat: number | null; lng: number | null; pais: string; zona: string;
  tipo: string; descripcion: string;
  fecha_visita: string; hora_visita: string; empleado: string; estado: EstadoVisita; notas: string;
};

const EMPTY: FormState = {
  nombre: '', apellidos: '', telefono: '', email: '', idioma: 'Español', contacto: 'Llamada',
  direccion: '', direccion_extra: '', lat: null, lng: null, pais: 'España', zona: 'Irún',
  tipo: 'Baño', descripcion: '',
  fecha_visita: '', hora_visita: '12:00', empleado: '', estado: 'Pendiente', notas: '',
};

function estadoFiscal(pais: string) {
  if (pais === 'España') return 'Régimen fiscal: IVA 21%';
  if (pais === 'Francia') return 'Régimen fiscal: TVA 10%';
  return '';
}

function zonaDefault(pais: string) {
  return pais === 'España' ? 'Irún' : pais === 'Francia' ? 'Hendaye' : '';
}

function empleadoDefault(pais: string) {
  return pais === 'Francia' ? 'Ricardo Ordoñez y Gabriel' : 'Ricardo Ordoñez';
}

function formDesdeVisita(visita: Visita): FormState {
  return {
    nombre: visita.nombre,
    apellidos: visita.apellidos,
    telefono: visita.telefono,
    email: visita.email ?? '',
    idioma: visita.idioma ?? 'Español',
    contacto: visita.contacto ?? 'Llamada',
    direccion: visita.direccion ?? '',
    direccion_extra: visita.direccion_extra ?? '',
    lat: visita.lat,
    lng: visita.lng,
    pais: visita.pais ?? 'España',
    zona: visita.zona ?? '',
    tipo: visita.tipo ?? 'Baño',
    descripcion: visita.descripcion ?? '',
    fecha_visita: visita.fecha_visita ?? '',
    hora_visita: visita.hora_visita?.slice(0, 5) ?? '12:00',
    empleado: visita.empleado ?? '',
    estado: visita.estado ?? 'Pendiente',
    notas: visita.notas ?? '',
  };
}

type VisitaFormProps = {
  onClose: () => void;
  visita?: Visita | null;
  fechaPrefill?: string;
};

export function VisitaForm({ onClose, visita, fechaPrefill }: VisitaFormProps) {
  const { user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const nombreUsuarioActual = (user?.user_metadata?.nombre as string) || user?.email || 'Sistema';
  const [form, setForm] = useState<FormState>(() => {
    if (visita) return formDesdeVisita(visita);
    return { ...EMPTY, fecha_visita: fechaPrefill ?? '', empleado: empleadoDefault(EMPTY.pais) };
  });
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [clienteRepetidor, setClienteRepetidor] = useState<{ nombre: string; totalObras: number } | null>(null);

  const fechaMinima = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  const horasDisponibles = esSabado(form.fecha_visita) ? HORAS_SABADO : HORAS_HABITUALES;

  const handlePaisChange = (pais: string) => {
    setForm((f) => ({ ...f, pais, zona: zonaDefault(pais), empleado: empleadoDefault(pais) }));
  };

  const verificarClienteRepetidor = async () => {
    if (visita) return;
    const telefono = form.telefono.trim();
    const email = form.email.trim();
    if (!telefono && !email) {
      setClienteRepetidor(null);
      return;
    }

    let previas: { nombre: string; apellidos: string }[] = [];
    if (telefono) {
      const { data, error } = await supabase
        .from('visitas')
        .select('nombre, apellidos')
        .eq('telefono', telefono)
        .is('eliminado_en', null)
        .order('created_at', { ascending: true });
      if (error) {
        toast.error(error.message);
        return;
      }
      previas = data ?? [];
    }
    if (previas.length === 0 && email) {
      const { data, error } = await supabase
        .from('visitas')
        .select('nombre, apellidos')
        .eq('email', email)
        .is('eliminado_en', null)
        .order('created_at', { ascending: true });
      if (error) {
        toast.error(error.message);
        return;
      }
      previas = data ?? [];
    }

    if (previas.length > 0) {
      setClienteRepetidor({ nombre: `${previas[0].nombre} ${previas[0].apellidos}`, totalObras: previas.length });
    } else {
      setClienteRepetidor(null);
    }
  };

  const validar = (): boolean => {
    const nuevosErrores: Partial<Record<keyof FormState, string>> = {};
    if (!form.nombre) nuevosErrores.nombre = 'Obligatorio';
    if (!form.apellidos) nuevosErrores.apellidos = 'Obligatorio';
    if (!form.telefono) nuevosErrores.telefono = 'Obligatorio';
    if (!form.direccion) nuevosErrores.direccion = 'Obligatorio';
    if (!form.fecha_visita) nuevosErrores.fecha_visita = 'Obligatorio';
    setErrors(nuevosErrores);
    return Object.keys(nuevosErrores).length === 0;
  };

  const crearMutation = useMutation({
    mutationFn: async () => {
      const nueva: NuevaVisita = {
        ...form,
        email: form.email || null,
        direccion_extra: form.direccion_extra || null,
        descripcion: form.descripcion || null,
        notas: form.notas || null,
        google_event_id: null,
        estado_pipeline: 'Contacto',
        estado: 'Pendiente',
      };
      const { data, error } = await supabase.from('visitas').insert(nueva).select().single();
      if (error) throw error;
      return data as Visita;
    },
    onSuccess: async (data) => {
      crearEventoVisita(data)
        .then(async (eventId) => {
          if (!eventId) return;
          const { error: errorGuardarEventId } = await supabase.from('visitas').update({ google_event_id: eventId }).eq('id', data.id);
          if (errorGuardarEventId) {
            toast.warning(`Evento creado en Google Calendar, pero no se pudo guardar su ID en la visita: ${errorGuardarEventId.message}`);
          }
          const { data: r, error } = await supabase.functions.invoke('notificar-visita', { body: { visitaId: data.id } });
          if (error || r?.ok === false) toast.warning(`No se pudo enviar el email de confirmación de la visita: ${error?.message ?? r?.error}`);
        })
        .catch((error) => toast.warning(`Visita guardada, pero no se sincronizó con Google Calendar: ${error.message}`));
      await notaSistema(data.id, `Visita registrada por ${nombreUsuarioActual}`);
      queryClient.invalidateQueries({ queryKey: ['visitas'] });
      toast.success('Visita registrada correctamente');
      onClose();
    },
    onError: (error) => toast.error(error.message),
  });

  const editarMutation = useMutation({
    mutationFn: async () => {
      if (!visita) throw new Error('Visita no encontrada');
      const { error } = await supabase
        .from('visitas')
        .update({
          ...form,
          email: form.email || null,
          direccion_extra: form.direccion_extra || null,
          descripcion: form.descripcion || null,
          notas: form.notas || null,
        })
        .eq('id', visita.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      if (visita && !visita.google_event_id) {
        crearEventoVisita({ ...visita, ...form })
          .then(async (eventId) => {
            if (!eventId) return;
            const { error: errorGuardarEventId } = await supabase.from('visitas').update({ google_event_id: eventId }).eq('id', visita.id);
            if (errorGuardarEventId) {
              toast.warning(`Evento creado en Google Calendar, pero no se pudo guardar su ID en la visita: ${errorGuardarEventId.message}`);
            }
            const { data: r, error } = await supabase.functions.invoke('notificar-visita', { body: { visitaId: visita.id } });
            if (error || r?.ok === false) toast.warning(`No se pudo enviar el email de confirmación de la visita: ${error?.message ?? r?.error}`);
          })
          .catch((error) => toast.warning(`Visita actualizada, pero no se sincronizó con Google Calendar: ${error.message}`));
      }
      if (visita) await notaSistema(visita.id, `Visita modificada por ${nombreUsuarioActual}`);
      await sincronizarPipelineCliente(form.telefono);
      queryClient.invalidateQueries({ queryKey: ['visitas'] });
      toast.success('Visita actualizada correctamente');
      onClose();
    },
    onError: (error) => toast.error(error.message),
  });

  const guardando = crearMutation.isPending || editarMutation.isPending;

  const handleGuardar = () => {
    if (!validar()) return;
    if (visita) editarMutation.mutate();
    else crearMutation.mutate();
  };

  return (
    <div className="max-w-3xl mx-auto animate-[scale-in_180ms_ease-out]">
      <div className="flex items-center justify-between gap-2 flex-wrap mb-5">
        <button onClick={onClose} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
          <ArrowLeft size={15} />
          Volver a visitas
        </button>
        <Button onClick={handleGuardar} disabled={guardando}>
          {guardando ? 'Guardando...' : 'Guardar'}
        </Button>
      </div>

      <h1 className="text-xl font-bold text-gray-900 mb-1">{visita ? 'Editar visita' : 'Nueva visita técnica'}</h1>
      <p className="text-sm text-gray-500 mb-6">
        {visita ? 'Modifica los datos de la visita.' : 'Registra los datos del cliente y programa la visita técnica.'}
      </p>

      <div className="flex flex-col gap-4">
        <Seccion numero={1} titulo="Cliente" icono={User}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Nombre" required value={form.nombre} error={errors.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} />
            <Input label="Apellidos" required value={form.apellidos} error={errors.apellidos} onChange={(e) => setForm((f) => ({ ...f, apellidos: e.target.value }))} />
            <Input
              label="Teléfono"
              type="tel"
              required
              value={form.telefono}
              error={errors.telefono}
              onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))}
              onBlur={verificarClienteRepetidor}
            />
            <Input
              label="Email"
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              onBlur={verificarClienteRepetidor}
            />
            {clienteRepetidor && (
              <div className="col-span-2 bg-brand-light border border-gray-200 rounded-sm px-3 py-2 flex items-center gap-2 text-xs text-brand">
                <Star size={14} className="shrink-0" />
                <span>
                  Cliente conocido — {clienteRepetidor.nombre} ya tiene {clienteRepetidor.totalObras} obra(s) registrada(s).
                  Podrás aplicar un descuento de fidelidad al crear su presupuesto.
                </span>
              </div>
            )}
            <Select
              label="Idioma"
              options={[{ value: 'Español', label: 'Español' }, { value: 'Français', label: 'Français' }]}
              value={form.idioma}
              onChange={(e) => setForm((f) => ({ ...f, idioma: e.target.value }))}
            />
            <Select
              label="Cómo nos contactó"
              options={['Llamada', 'WhatsApp', 'Web', 'Recomendación', 'Otro'].map((v) => ({ value: v, label: v }))}
              value={form.contacto}
              onChange={(e) => setForm((f) => ({ ...f, contacto: e.target.value }))}
            />
          </div>
        </Seccion>

        <Seccion numero={2} titulo="Dirección de la obra" icono={MapPin}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="col-span-2">
              <MapsAutocomplete
                label="Dirección completa"
                value={form.direccion}
                error={errors.direccion}
                onChange={(direccion) => setForm((f) => ({ ...f, direccion }))}
                onSelect={(lugar) =>
                  setForm((f) => ({
                    ...f,
                    direccion: lugar.direccion,
                    lat: lugar.lat,
                    lng: lugar.lng,
                    pais: lugar.pais || f.pais,
                    zona: lugar.pais && lugar.pais !== f.pais ? zonaDefault(lugar.pais) : f.zona,
                    empleado: lugar.pais && lugar.pais !== f.pais ? empleadoDefault(lugar.pais) : f.empleado,
                  }))
                }
              />
            </div>
            <div className="col-span-2">
              <Input
                label="Piso / puerta / referencia (opcional)"
                hint="Ej.: 2º piso, puerta B — étage 4, porte gauche"
                value={form.direccion_extra}
                onChange={(e) => setForm((f) => ({ ...f, direccion_extra: e.target.value }))}
              />
            </div>
            <Select
              label="País"
              required
              options={[{ value: 'España', label: 'España' }, { value: 'Francia', label: 'Francia' }]}
              value={form.pais}
              onChange={(e) => handlePaisChange(e.target.value)}
            />
            <Select
              label="Zona"
              options={(form.pais === 'España' ? ZONAS_ES : ZONAS_FR).map((v) => ({ value: v, label: v }))}
              value={form.zona}
              onChange={(e) => setForm((f) => ({ ...f, zona: e.target.value }))}
            />
            <div className="col-span-2">
              <p className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-sm px-2.5 py-1.5">
                {estadoFiscal(form.pais)}
              </p>
            </div>
          </div>
        </Seccion>

        <Seccion numero={3} titulo="Tipo de trabajo" icono={Hammer}>
          <div className="space-y-3">
            <Select
              label="Tipo de reforma"
              required
              options={TIPOS_REFORMA.map((v) => ({ value: v, label: v }))}
              value={form.tipo}
              onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value }))}
            />
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
                Descripción del trabajo
              </label>
              <textarea
                className="w-full border border-gray-200 rounded-sm px-2.5 py-1.5 text-sm min-h-[80px] focus:border-brand focus:outline-none"
                value={form.descripcion}
                onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
              />
            </div>
          </div>
        </Seccion>

        <Seccion numero={4} titulo="Visita técnica" icono={CalendarClock}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="col-span-2">
              <CalendarPicker
                label="Fecha"
                value={form.fecha_visita}
                error={errors.fecha_visita}
                min={fechaMinima}
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
                onChange={(e) =>
                  setForm((f) => ({ ...f, hora_visita: e.target.value === OTRO_HORARIO ? '' : e.target.value }))
                }
              />
              {!horasDisponibles.includes(form.hora_visita) && (
                <Input
                  type="time"
                  value={form.hora_visita}
                  onChange={(e) => setForm((f) => ({ ...f, hora_visita: e.target.value }))}
                  className="mt-1.5"
                />
              )}
            </div>
            <Select
              label="Empleado asignado"
              options={[{ value: '', label: '— Seleccionar —' }, ...EMPLEADOS.map((v) => ({ value: v, label: v }))]}
              value={form.empleado}
              onChange={(e) => setForm((f) => ({ ...f, empleado: e.target.value }))}
            />
            {visita && (
              <Select
                label="Estado"
                options={ESTADOS.map((v) => ({ value: v, label: v }))}
                value={form.estado}
                onChange={(e) => setForm((f) => ({ ...f, estado: e.target.value as EstadoVisita }))}
              />
            )}
            <div className="col-span-2">
              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
                Notas internas
              </label>
              <textarea
                className="w-full border border-gray-200 rounded-sm px-2.5 py-1.5 text-sm min-h-[60px] focus:border-brand focus:outline-none"
                value={form.notas}
                onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))}
              />
            </div>
          </div>
        </Seccion>
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap mt-5">
        <button onClick={onClose} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
          <ArrowLeft size={15} />
          Volver a visitas
        </button>
        <Button onClick={handleGuardar} disabled={guardando}>
          {guardando ? 'Guardando...' : 'Guardar'}
        </Button>
      </div>
    </div>
  );
}
