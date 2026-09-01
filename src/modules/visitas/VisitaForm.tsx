import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Star, User, MapPin, Hammer, CalendarClock, UserPlus, Camera, FileText, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { notaSistema } from '../../lib/notaSistema';
import { registrarEventoFunnel } from '../../lib/funnelTracking';
import { sincronizarPipelineCliente } from '../../lib/pipelineSync';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { useConfirmar } from '../../hooks/useConfirm';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Button } from '../../components/ui/Button';
import { EditorTexto } from '../../components/ui/EditorTexto';
import { MapsAutocomplete } from '../google/MapsAutocomplete';
import { CalendarPicker } from '../google/CalendarPicker';
import { crearEventoVisita, actualizarEventoVisita } from '../../lib/googleCalendar';
import { crearGastoKilometricoPendiente } from '../../lib/gastoKilometrico';
import { sumarMinutos, minutosEntre } from '../../lib/horas';
import { SelectorClienteInline } from '../clientes/SelectorClienteInline';
import { usePotencialesCliente } from '../clientes/usePotencialesCliente';
import { agruparClientes, normalizarTelefono, type Cliente, type ClientePotencial } from '../clientes/types';
import { useCatalogosVisitas } from './useCatalogosVisitas';
import type { CatalogosVisitas } from './catalogos';
import { esSabado, DURACIONES_MIN, etiquetaDuracion, OTRO_HORARIO } from './horarioVisita';
import type { Visita, NuevaVisita, EstadoVisita, PrefillVisita, ArchivoPrevio } from './types';

function Seccion({
  numero,
  titulo,
  icono: Icono,
  children,
}: {
  numero: number;
  titulo: string;
  icono: typeof User;
  children: ReactNode;
}) {
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

const ESTADOS: EstadoVisita[] = ['Pendiente', 'Realizada', 'Cancelada'];

type FormState = {
  nombre: string;
  apellidos: string;
  telefono: string;
  email: string;
  idioma: string;
  contacto: string;
  direccion: string;
  direccion_extra: string;
  lat: number | null;
  lng: number | null;
  pais: string;
  zona: string;
  tipo: string;
  descripcion: string;
  fecha_visita: string;
  hora_visita: string;
  hora_fin_visita: string;
  empleado: string;
  estado: EstadoVisita;
  notas: string;
};

const EMPTY: FormState = {
  nombre: '',
  apellidos: '',
  telefono: '',
  email: '',
  idioma: 'Español',
  contacto: 'Llamada',
  direccion: '',
  direccion_extra: '',
  lat: null,
  lng: null,
  pais: 'España',
  zona: 'Irún',
  tipo: 'Baño',
  descripcion: '',
  fecha_visita: '',
  hora_visita: '12:00',
  hora_fin_visita: '13:00',
  empleado: '',
  estado: 'Pendiente',
  notas: '',
};

function estadoFiscal(pais: string) {
  if (pais === 'España') return 'Régimen fiscal: IVA 21%';
  if (pais === 'Francia') return 'Régimen fiscal: TVA 10%';
  return '';
}

function zonaDefault(pais: string) {
  return pais === 'España' ? 'Irún' : pais === 'Francia' ? 'Hendaye' : '';
}

function normalizarTexto(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Auto-detecta la zona a partir de la ciudad que devuelve MapsAutocomplete — antes solo se
// reseteaba a la zona por defecto del país (Irún/Hendaye) al cambiar de país, así que elegir una
// dirección de otra zona conocida (Ciboure, Bera...) dejaba la zona equivocada hasta que el
// usuario se acordaba de corregirla a mano (mejora real, 2026-09-01). Compara con includes() en
// ambos sentidos para que "San Sebastián" case con "Donostia/San Sebastián" o "Bera" con "Bera de
// Bidasoa" sin necesitar coincidencia exacta.
function zonaDesdeCiudad(ciudad: string | null, pais: string, catalogos: CatalogosVisitas): string | null {
  if (!ciudad) return null;
  const zonas = pais === 'España' ? catalogos.zonasEs : pais === 'Francia' ? catalogos.zonasFr : [];
  const ciudadNorm = normalizarTexto(ciudad);
  if (!ciudadNorm) return null;
  return (
    zonas.find((z) => {
      const zNorm = normalizarTexto(z);
      return !!zNorm && (ciudadNorm.includes(zNorm) || zNorm.includes(ciudadNorm));
    }) ?? null
  );
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
    hora_fin_visita:
      visita.hora_fin_visita?.slice(0, 5) ??
      sumarMinutos(visita.hora_visita?.slice(0, 5) ?? '12:00', 60),
    empleado: visita.empleado ?? '',
    estado: visita.estado ?? 'Pendiente',
    notas: visita.notas ?? '',
  };
}

type VisitaFormProps = {
  onClose: () => void;
  visita?: Visita | null;
  prefill?: PrefillVisita;
};

export function VisitaForm({ onClose, visita, prefill }: VisitaFormProps) {
  const { user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const nombreUsuarioActual = (user?.user_metadata?.nombre as string) || user?.email || 'Sistema';
  const catalogos = useCatalogosVisitas();
  const [form, setForm] = useState<FormState>(() => {
    if (visita) return formDesdeVisita(visita);
    const pais = prefill?.pais ?? EMPTY.pais;
    return {
      ...EMPTY,
      fecha_visita: prefill?.fecha ?? '',
      nombre: prefill?.nombre ?? EMPTY.nombre,
      telefono: prefill?.telefono ?? EMPTY.telefono,
      email: prefill?.email ?? EMPTY.email,
      idioma: prefill?.idioma ?? EMPTY.idioma,
      contacto: prefill?.contacto ?? EMPTY.contacto,
      tipo: prefill?.tipo ?? EMPTY.tipo,
      descripcion: prefill?.descripcion ?? EMPTY.descripcion,
      direccion: prefill?.direccion ?? EMPTY.direccion,
      direccion_extra: prefill?.direccionExtra ?? EMPTY.direccion_extra,
      pais,
      zona: pais !== EMPTY.pais ? zonaDefault(pais) : EMPTY.zona,
      empleado: empleadoDefault(pais),
    };
  });
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [clienteRepetidor, setClienteRepetidor] = useState<{
    id: string;
    nombre: string;
    totalObras: number;
  } | null>(null);
  // Mismo patrón que IniciarPresupuestoPage.tsx (2026-08-26, a petición de Gabriel): buscar primero
  // en vez de rellenar celdas directamente al elegir un cliente/potencial — mientras no se elige
  // nada se muestra el buscador, al elegir se muestra un recuadro (con botón "Cambiar"), y "crear
  // cliente nuevo" pasa a los campos de texto libre de siempre. Si ya viene de un prefill con
  // nombre (Solicitud/Planning) o se está editando una visita ya existente, se salta el buscador —
  // el contacto ya se conoce, no hace falta buscarlo. Elegir aquí NUNCA registra un cliente real
  // (no existe tabla `clientes` propia — ver [[project_cliente_confirmado_solo_aceptado]]): solo
  // cuenta como "confirmado" cuando se acepta un presupuesto, esta pantalla no cambia eso.
  const [estadoCliente, setEstadoCliente] = useState<'buscar' | 'manual' | 'cliente' | 'potencial'>(
    () => (visita || prefill?.nombre ? 'manual' : 'buscar'),
  );
  const [clienteElegido, setClienteElegido] = useState<Cliente | null>(null);
  const [potencialElegido, setPotencialElegido] = useState<ClientePotencial | null>(null);
  const confirmar = useConfirmar();

  // Fotos y PDFs del estado preliminar que el cliente manda antes de la visita (WhatsApp/email) —
  // se suben a mano al bucket privado `fotos-visita` y se enlazan luego, numerados ("Imagen 1",
  // "Documento 1"...), en el email de confirmación y en la descripción del evento de Calendar
  // (2026-08-28, ampliado a PDF 2026-09-01 — antes solo se distinguía por el nombre de archivo
  // real en el enlace, imposible de leer en Calendar con varios seguidos). Mismo patrón que el
  // adjunto de GastoForm.tsx: se sube al elegir el archivo, no al guardar el formulario.
  const [fotos, setFotos] = useState<ArchivoPrevio[]>(visita?.fotos_previas ?? []);
  const [fotoUrls, setFotoUrls] = useState<Record<string, string>>({});
  const [subiendoFoto, setSubiendoFoto] = useState(false);

  useEffect(() => {
    const faltantes = fotos.filter((a) => !fotoUrls[a.path]);
    if (faltantes.length === 0) return;
    Promise.all(
      faltantes.map((a) => supabase.storage.from('fotos-visita').createSignedUrl(a.path, 3600)),
    ).then((resultados) => {
      setFotoUrls((prev) => {
        const next = { ...prev };
        resultados.forEach(({ data }, i) => {
          if (data) next[faltantes[i].path] = data.signedUrl;
        });
        return next;
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fotos]);

  const TAMANO_MAX_FOTO = 10 * 1024 * 1024; // 10 MB, mismo límite que justificantes de gastos

  const handleSubirFotos = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setSubiendoFoto(true);
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
        toast.error(`"${file.name}" no es una imagen ni un PDF`);
        continue;
      }
      if (file.size > TAMANO_MAX_FOTO) {
        toast.error(`"${file.name}" pesa demasiado (máximo 10 MB)`);
        continue;
      }
      const extension = file.name.split('.').pop() ?? 'jpg';
      const path = `visitas/${crypto.randomUUID()}.${extension}`;
      const { error } = await supabase.storage.from('fotos-visita').upload(path, file, { contentType: file.type });
      if (error) {
        toast.error(error.message);
        continue;
      }
      setFotos((f) => [...f, { path, etiqueta: null }]);
    }
    setSubiendoFoto(false);
  };

  const handleRenombrarFoto = (path: string, etiqueta: string) => {
    setFotos((f) => f.map((a) => (a.path === path ? { ...a, etiqueta: etiqueta || null } : a)));
  };

  const { data: visitasParaClientes } = useQuery({
    queryKey: ['visitas'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('visitas')
        .select('*')
        .is('eliminado_en', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Visita[];
    },
    enabled: !visita,
  });
  const clientesExistentes = useMemo(
    () => agruparClientes(visitasParaClientes ?? []),
    [visitasParaClientes],
  );
  const potenciales = usePotencialesCliente(clientesExistentes, !visita);

  const handleSeleccionarCliente = (cliente: Cliente) => {
    const ultima = cliente.visitas[0];
    setForm((f) => ({
      ...f,
      nombre: cliente.nombre,
      apellidos: cliente.apellidos,
      telefono: cliente.telefono,
      email: cliente.email ?? '',
      idioma: ultima?.idioma ?? f.idioma,
      direccion: ultima?.direccion ?? f.direccion,
      direccion_extra: ultima?.direccion_extra ?? f.direccion_extra,
      lat: ultima?.lat ?? f.lat,
      lng: ultima?.lng ?? f.lng,
      pais: ultima?.pais ?? f.pais,
      zona: ultima?.zona ?? f.zona,
    }));
    setClienteElegido(cliente);
    setEstadoCliente('cliente');
    setClienteRepetidor(null);
  };

  // Un "potencial" (solicitud/orientativo/visita previa sin cliente real) nunca trae apellidos —
  // ClientePotencial no tiene ese campo, siempre hay que rellenarlo a mano — y muchas veces
  // tampoco nombre real ni email — agruparPotenciales() rellena el nombre con el email (o "Sin
  // nombre") cuando no lo tiene. Por eso "datos obligatorios" aquí se refiere solo a lo que un
  // potencial SÍ podría traer completo (nombre real, teléfono, email) — si falta algo de eso se
  // avisa con un pop up en vez de abrir directamente el formulario (corrección de Gabriel
  // 2026-09-01: el primer intento abría siempre el formulario completo, que no le parecía
  // intuitivo); si está completo se muestra el recuadro resumen de siempre, igual que al elegir un
  // cliente real.
  const datosPotencialCompletos = (potencial: ClientePotencial) => {
    const nombreReal = !!potencial.nombre && potencial.nombre !== potencial.email && potencial.nombre !== 'Sin nombre';
    return nombreReal && !!potencial.telefono && !!potencial.email;
  };

  const aplicarPotencial = (potencial: ClientePotencial) => {
    const nombreReal = potencial.nombre && potencial.nombre !== potencial.email && potencial.nombre !== 'Sin nombre';
    setForm((f) => ({
      ...f,
      nombre: nombreReal ? potencial.nombre : '',
      telefono: potencial.telefono,
      email: potencial.email ?? f.email,
      idioma: potencial.idioma === 'Français' ? 'Français' : f.idioma,
      contacto: potencial.origen === 'solicitud' ? 'Web' : f.contacto,
    }));
    setClienteElegido(null);
    setClienteRepetidor(null);
  };

  const handleSeleccionarPotencial = async (potencial: ClientePotencial) => {
    if (datosPotencialCompletos(potencial)) {
      aplicarPotencial(potencial);
      setPotencialElegido(potencial);
      setEstadoCliente('potencial');
      return;
    }
    const completar = await confirmar({
      titulo: 'Faltan datos por rellenar',
      mensaje: `A "${potencial.nombre || potencial.telefono || potencial.email}" le faltan datos obligatorios (nombre, teléfono o email) para poder guardar la visita. ¿Completar los datos a mano?`,
      textoConfirmar: 'Completar datos',
      textoCancelar: 'Cancelar',
      peligroso: false,
    });
    if (!completar) return;
    aplicarPotencial(potencial);
    setEstadoCliente('manual');
  };

  const handleCambiarCliente = () => {
    setClienteElegido(null);
    setPotencialElegido(null);
    setClienteRepetidor(null);
    setEstadoCliente('buscar');
    setForm((f) => ({ ...f, nombre: '', apellidos: '', telefono: '', email: '' }));
  };

  const handleCrearNuevo = () => {
    setClienteElegido(null);
    setPotencialElegido(null);
    setEstadoCliente('manual');
  };

  const fechaMinima = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  const horasDisponibles = esSabado(form.fecha_visita)
    ? catalogos.horasSabado
    : catalogos.horasHabituales;

  // Cambiar la hora de inicio mantiene la duración ya elegida (desplaza hora_fin_visita en vez de
  // dejarla fija) — si no, cambiar la hora de inicio podría dejar una duración negativa o absurda.
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

    let previas: { nombre: string; apellidos: string; telefono: string; email: string | null }[] =
      [];
    if (telefono) {
      const { data, error } = await supabase
        .from('visitas')
        .select('nombre, apellidos, telefono, email')
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
        .select('nombre, apellidos, telefono, email')
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
      // Misma clave que agruparClientes() en types.ts, para poder enlazar directamente a la ficha
      // ya existente en vez de solo avisar de que existe (mejora real, auditoría de Clientes
      // 2026-08-18 — igual que ya tenía ClienteForm.tsx).
      const primera = previas[0];
      const clave =
        (primera.telefono ? normalizarTelefono(primera.telefono) : '') || primera.email || '';
      if (clave) {
        setClienteRepetidor({
          id: clave,
          nombre: `${primera.nombre} ${primera.apellidos}`,
          totalObras: previas.length,
        });
      } else {
        setClienteRepetidor(null);
      }
    } else {
      setClienteRepetidor(null);
    }
  };

  const validar = (): boolean => {
    const nuevosErrores: Partial<Record<keyof FormState, string>> = {};
    if (!form.nombre) nuevosErrores.nombre = 'Obligatorio';
    if (!form.apellidos) nuevosErrores.apellidos = 'Obligatorio';
    if (!form.telefono) nuevosErrores.telefono = 'Obligatorio';
    if (!form.email) nuevosErrores.email = 'Obligatorio';
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
        fotos_previas: fotos,
        google_event_id: null,
        estado_pipeline: 'Contacto',
        pipeline_etapa_maxima: 'Contacto',
        estado: 'Pendiente',
        proyecto_id: prefill?.proyectoId ?? null,
      };
      const { data, error } = await supabase.from('visitas').insert(nueva).select().single();
      if (error) throw error;
      return data as Visita;
    },
    onSuccess: async (data) => {
      crearEventoVisita(data)
        .then(async (eventId) => {
          if (!eventId) return;
          const { error: errorGuardarEventId } = await supabase
            .from('visitas')
            .update({ google_event_id: eventId })
            .eq('id', data.id);
          if (errorGuardarEventId) {
            toast.warning(
              `Evento creado en Google Calendar, pero no se pudo guardar su ID en la visita: ${errorGuardarEventId.message}`,
            );
          }
          const { data: r, error } = await supabase.functions.invoke('notificar-visita', {
            body: { visitaId: data.id },
          });
          if (error || r?.ok === false)
            toast.warning(
              `No se pudo enviar el email de confirmación de la visita: ${error?.message ?? r?.error}`,
            );
        })
        .catch((error) =>
          toast.warning(
            `Visita guardada, pero no se sincronizó con Google Calendar: ${error.message}`,
          ),
        );
      await notaSistema(data.id, `Visita registrada por ${nombreUsuarioActual}`);
      // Si la visita viene de "Crear visita desde esta solicitud", enlaza de vuelta
      // solicitudes.visita_id y registra el evento de funnel — permite medir cuánto tarda una
      // solicitud en convertirse en visita agendada (2026-08-26). Best-effort, no bloqueante,
      // igual que sincronizarPipelineCliente: un fallo aquí no debe tumbar la visita ya creada.
      if (prefill?.solicitudId) {
        const { error: errorEnlace } = await supabase
          .from('solicitudes')
          .update({ visita_id: data.id })
          .eq('id', prefill.solicitudId);
        if (errorEnlace) console.warn('No se pudo enlazar la solicitud con la visita:', errorEnlace.message);
        await registrarEventoFunnel('visita_agendada', { solicitudId: prefill.solicitudId });
        queryClient.invalidateQueries({ queryKey: ['solicitudes'] });
      }
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
          fotos_previas: fotos,
        })
        .eq('id', visita.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      if (visita && !visita.google_event_id) {
        crearEventoVisita({ ...visita, ...form, fotos_previas: fotos })
          .then(async (eventId) => {
            if (!eventId) return;
            const { error: errorGuardarEventId } = await supabase
              .from('visitas')
              .update({ google_event_id: eventId })
              .eq('id', visita.id);
            if (errorGuardarEventId) {
              toast.warning(
                `Evento creado en Google Calendar, pero no se pudo guardar su ID en la visita: ${errorGuardarEventId.message}`,
              );
            }
            const { data: r, error } = await supabase.functions.invoke('notificar-visita', {
              body: { visitaId: visita.id },
            });
            if (error || r?.ok === false)
              toast.warning(
                `No se pudo enviar el email de confirmación de la visita: ${error?.message ?? r?.error}`,
              );
          })
          .catch((error) =>
            toast.warning(
              `Visita actualizada, pero no se sincronizó con Google Calendar: ${error.message}`,
            ),
          );
      } else if (visita && visita.google_event_id) {
        // Antes solo se creaba el evento la primera vez — reprogramar (fecha, hora o dirección
        // distintas) dejaba el Calendar con los datos viejos, sin ningún aviso (mejora real,
        // auditoría de Visitas 2026-08-18).
        actualizarEventoVisita(visita.google_event_id, { ...visita, ...form, fotos_previas: fotos }).catch((error) =>
          toast.warning(
            `Visita actualizada, pero no se sincronizó el cambio con Google Calendar: ${error.message}`,
          ),
        );
      }
      if (visita) await notaSistema(visita.id, `Visita modificada por ${nombreUsuarioActual}`);
      if (visita && visita.estado !== 'Realizada' && form.estado === 'Realizada') {
        try {
          await crearGastoKilometricoPendiente({ ...visita, ...form });
          queryClient.invalidateQueries({ queryKey: ['gastos'] });
        } catch (error) {
          toast.warning(`No se pudo generar el gasto de kilometraje: ${(error as Error).message}`);
        }
      }
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
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800"
        >
          <ArrowLeft size={15} />
          Volver a visitas
        </button>
        <Button onClick={handleGuardar} disabled={guardando}>
          {guardando ? 'Guardando...' : 'Guardar'}
        </Button>
      </div>

      <h1 className="text-xl font-bold text-gray-900 mb-1">
        {visita ? 'Editar visita' : 'Nueva visita técnica'}
      </h1>
      <p className="text-sm text-gray-500 mb-6">
        {visita
          ? 'Modifica los datos de la visita.'
          : 'Registra los datos del cliente y programa la visita técnica.'}
      </p>

      <div className="flex flex-col gap-4">
        <Seccion numero={1} titulo="Cliente" icono={User}>
          {estadoCliente === 'buscar' && (
            <div>
              <SelectorClienteInline
                clientes={clientesExistentes}
                potenciales={potenciales}
                onSeleccionarCliente={handleSeleccionarCliente}
                onSeleccionarPotencial={handleSeleccionarPotencial}
                onCrearNuevo={handleCrearNuevo}
                placeholder="Buscar cliente o potencial por nombre o teléfono..."
              />
              <button
                type="button"
                onClick={handleCrearNuevo}
                className="text-xs text-brand hover:underline mt-1.5 flex items-center gap-1"
              >
                <UserPlus size={12} />
                O crea un cliente nuevo directamente
              </button>
            </div>
          )}

          {estadoCliente === 'cliente' && clienteElegido && (
            <div className="flex items-center justify-between border border-gray-200 rounded-sm px-3 py-2.5 bg-brand-light">
              <div>
                <p className="text-sm font-medium text-gray-900">
                  {clienteElegido.nombre} {clienteElegido.apellidos}
                </p>
                <p className="text-xs text-gray-500">{clienteElegido.telefono}</p>
              </div>
              <button type="button" onClick={handleCambiarCliente} className="text-xs text-gray-500 hover:text-red-600">
                Cambiar
              </button>
            </div>
          )}

          {estadoCliente === 'potencial' && potencialElegido && (
            <div className="border border-gray-200 rounded-sm px-3 py-2.5 bg-brand-light">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">{potencialElegido.nombre}</p>
                  <p className="text-xs text-gray-500">{potencialElegido.telefono} · {potencialElegido.email}</p>
                </div>
                <button type="button" onClick={handleCambiarCliente} className="text-xs text-gray-500 hover:text-red-600">
                  Cambiar
                </button>
              </div>
              {/* Un potencial nunca trae apellidos (no existe ese campo en ClientePotencial) —
                  se pide aquí mismo, sin abrir el formulario completo por un único dato. */}
              <div className="mt-2">
                <Input
                  label="Apellidos"
                  required
                  value={form.apellidos}
                  error={errors.apellidos}
                  onChange={(e) => setForm((f) => ({ ...f, apellidos: e.target.value }))}
                />
              </div>
            </div>
          )}

          {(estadoCliente === 'manual' || !!visita) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {!visita && (
                <button
                  type="button"
                  onClick={handleCambiarCliente}
                  className="col-span-2 text-xs text-gray-500 hover:text-brand text-left -mb-1"
                >
                  ← Buscar cliente o potencial en vez de escribir a mano
                </button>
              )}
              <Input
                label="Nombre"
                required
                value={form.nombre}
                error={errors.nombre}
                onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
              />
              <Input
                label="Apellidos"
                required
                value={form.apellidos}
                error={errors.apellidos}
                onChange={(e) => setForm((f) => ({ ...f, apellidos: e.target.value }))}
              />
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
                required
                value={form.email}
                error={errors.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                onBlur={verificarClienteRepetidor}
              />
              {clienteRepetidor && (
                <div className="col-span-2 bg-brand-light border border-gray-200 rounded-sm px-3 py-2 flex items-center gap-2 text-xs text-brand">
                  <Star size={14} className="shrink-0" />
                  <span>
                    Cliente conocido — {clienteRepetidor.nombre} ya tiene{' '}
                    {clienteRepetidor.totalObras} obra(s) registrada(s). Podrás aplicar un descuento
                    de fidelidad al crear su presupuesto.
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      navigate(`/clientes/${encodeURIComponent(clienteRepetidor.id)}`);
                    }}
                    className="ml-auto font-semibold underline hover:no-underline shrink-0"
                  >
                    Ver ficha existente
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
            <Select
              label="Idioma"
              options={[
                { value: 'Español', label: 'Español' },
                { value: 'Français', label: 'Français' },
              ]}
              value={form.idioma}
              onChange={(e) => setForm((f) => ({ ...f, idioma: e.target.value }))}
            />
            <Select
              label="Cómo nos contactó"
              options={['Llamada', 'WhatsApp', 'Web', 'Email', 'Recomendación', 'Otro'].map((v) => ({
                value: v,
                label: v,
              }))}
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
                  setForm((f) => {
                    const pais = lugar.pais || f.pais;
                    const cambioPais = !!lugar.pais && lugar.pais !== f.pais;
                    const zonaCiudad = zonaDesdeCiudad(lugar.ciudad, pais, catalogos);
                    return {
                      ...f,
                      direccion: lugar.direccion,
                      lat: lugar.lat,
                      lng: lugar.lng,
                      pais,
                      zona: zonaCiudad ?? (cambioPais ? zonaDefault(pais) : f.zona),
                      empleado: cambioPais ? empleadoDefault(pais) : f.empleado,
                    };
                  })
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
              options={[
                { value: 'España', label: 'España' },
                { value: 'Francia', label: 'Francia' },
              ]}
              value={form.pais}
              onChange={(e) => handlePaisChange(e.target.value)}
            />
            <Select
              label="Zona"
              options={(form.pais === 'España' ? catalogos.zonasEs : catalogos.zonasFr).map(
                (v) => ({ value: v, label: v }),
              )}
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
              options={catalogos.tiposReforma.map((v) => ({ value: v, label: v }))}
              value={form.tipo}
              onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value }))}
            />
            <div>
              <EditorTexto
                label="Descripción del trabajo"
                rows={4}
                value={form.descripcion}
                onChange={(valor) => setForm((f) => ({ ...f, descripcion: valor }))}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
                Fotos y PDFs previos del cliente (opcional)
              </label>
              <p className="text-xs text-gray-400 mb-1.5">
                Ponle un nombre a cada uno (ej. "Estado del baño", "Planos de la reforma") — así aparece en el
                email al equipo y en Google Calendar en vez de "Imagen 1"/"Documento 1".
              </p>
              <div className="flex flex-wrap gap-2">
                {(() => {
                  let numImagen = 0;
                  let numDocumento = 0;
                  return fotos.map((a) => {
                    const esPdf = a.path.toLowerCase().endsWith('.pdf');
                    const etiquetaDefecto = esPdf ? `Documento ${++numDocumento}` : `Imagen ${++numImagen}`;
                    return (
                      <div key={a.path} className="relative w-20 shrink-0">
                        {esPdf ? (
                          <a
                            href={fotoUrls[a.path] ?? undefined}
                            target="_blank"
                            rel="noreferrer"
                            className="w-20 h-16 flex flex-col items-center justify-center gap-0.5 rounded-sm border border-gray-200 bg-gray-50 text-gray-500 hover:border-brand hover:text-brand"
                          >
                            <FileText size={20} />
                            <span className="text-[9px]">PDF</span>
                          </a>
                        ) : fotoUrls[a.path] ? (
                          <img
                            src={fotoUrls[a.path]}
                            alt={a.etiqueta ?? etiquetaDefecto}
                            className="w-20 h-16 object-cover rounded-sm border border-gray-200"
                          />
                        ) : (
                          <div className="w-20 h-16 rounded-sm border border-gray-200 bg-gray-50 animate-pulse" />
                        )}
                        <input
                          value={a.etiqueta ?? ''}
                          placeholder={etiquetaDefecto}
                          onChange={(e) => handleRenombrarFoto(a.path, e.target.value)}
                          className="w-20 mt-0.5 text-[9px] text-center border border-gray-200 rounded-sm px-0.5 py-0.5 focus:border-brand focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => setFotos((f) => f.filter((x) => x.path !== a.path))}
                          className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-white border border-gray-300 text-gray-500 hover:text-red-600 flex items-center justify-center"
                          title="Quitar"
                        >
                          <X size={10} />
                        </button>
                      </div>
                    );
                  });
                })()}
                <label
                  className={`w-20 h-16 shrink-0 flex flex-col items-center justify-center gap-0.5 border border-dashed rounded-sm cursor-pointer text-gray-400 hover:border-brand hover:text-brand ${subiendoFoto ? 'opacity-50' : ''}`}
                >
                  <Camera size={16} />
                  <span className="text-[10px]">{subiendoFoto ? '...' : 'Añadir'}</span>
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    multiple
                    disabled={subiendoFoto}
                    onChange={(e) => {
                      handleSubirFotos(e.target.files);
                      e.target.value = '';
                    }}
                    className="hidden"
                  />
                </label>
              </div>
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
                value={
                  horasDisponibles.includes(form.hora_visita) ? form.hora_visita : OTRO_HORARIO
                }
                onChange={(e) =>
                  cambiarHoraInicio(e.target.value === OTRO_HORARIO ? '' : e.target.value)
                }
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
              options={opcionesDuracion.map((min) => ({
                value: String(min),
                label: etiquetaDuracion(min),
              }))}
              value={String(duracionActual)}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  hora_fin_visita: sumarMinutos(f.hora_visita, Number(e.target.value)),
                }))
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
            {visita && (
              <Select
                label="Estado"
                options={ESTADOS.map((v) => ({ value: v, label: v }))}
                value={form.estado}
                onChange={(e) => setForm((f) => ({ ...f, estado: e.target.value as EstadoVisita }))}
              />
            )}
            <div className="col-span-2">
              <EditorTexto
                label="Notas internas"
                rows={3}
                value={form.notas}
                onChange={(valor) => setForm((f) => ({ ...f, notas: valor }))}
              />
              <p className="text-xs text-gray-400 mt-1">Estas notas también salen en el email de aviso al equipo.</p>
            </div>
          </div>
        </Seccion>
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap mt-5">
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800"
        >
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
