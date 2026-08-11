import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Image as ImageIcon,
  LayoutTemplate,
  Building2,
  Landmark,
  FileText,
  Wallet,
  Heart,
  Percent,
  Star,
  Sliders,
  CalendarClock,
  Receipt,
  CalendarRange,
  FileImage,
  Palette,
  Check,
  Sun,
  Moon,
  BookOpen,
  Bell,
  ChevronDown,
  Sparkles,
  CalendarCheck,
  Ban,
  Banknote,
} from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../hooks/useToast';
import { useAuth } from '../../hooks/useAuth';
import { useTema, TEMAS } from '../../hooks/useTema';
import { Input } from '../../components/ui/Input';
import { EditorTexto } from '../../components/ui/EditorTexto';
import { Select } from '../../components/ui/Select';
import { Button } from '../../components/ui/Button';
import { PlantillasSection } from './PlantillasSection';
import { CatalogoLineasSection } from './CatalogoLineasSection';
import { DirectricesSection } from './DirectricesSection';
import { CondicionesPagoEditor } from '../finanzas/CondicionesPagoEditor';
import { iniciarConexionGoogleCalendar, iniciarConexionGmail } from '../../lib/googleCalendar';
import { useFiscalConfig } from '../fiscalidad/useFiscalConfig';
import { notificarCambioConfig } from '../../lib/notificaciones';
import { guardarConfigDatos } from '../../lib/empresaConfig';
import { useHidratarUnaVez } from '../../hooks/useHidratarUnaVez';
import type { LucideIcon } from 'lucide-react';

type BloqueNav = { id: string; label: string; icon: LucideIcon };
type GrupoNav = { id: string; label: string; icon: LucideIcon; items: BloqueNav[] };

// Los 13(+1) bloques de siempre, agrupados en categorías grandes para que la navegación no
// sea una lista plana interminable — cada grupo se despliega en el acordeón mostrando sus
// secciones. Ningún bloque cambia de comportamiento, solo se reorganiza cómo se llega a él.
const GRUPOS_NAV: GrupoNav[] = [
  {
    id: 'grupo-apariencia',
    label: 'Apariencia y marca',
    icon: Palette,
    items: [
      { id: 'bloque-apariencia', label: 'Apariencia', icon: Palette },
      { id: 'bloque-logo', label: 'Logo', icon: ImageIcon },
      { id: 'bloque-plantillas', label: 'Plantillas', icon: LayoutTemplate },
    ],
  },
  {
    id: 'grupo-empresa',
    label: 'Datos de la empresa',
    icon: Building2,
    items: [
      { id: 'bloque-espana', label: 'España', icon: Building2 },
      { id: 'bloque-francia', label: 'Francia', icon: Landmark },
      { id: 'bloque-fiscal', label: 'Fechas fiscales', icon: Receipt },
    ],
  },
  {
    id: 'grupo-documentos',
    label: 'Documentos',
    icon: FileText,
    items: [
      { id: 'bloque-condiciones-pago', label: 'Condiciones de pago', icon: Wallet },
      { id: 'bloque-catalogo-lineas', label: 'Catálogo de líneas', icon: BookOpen },
      { id: 'bloque-tc', label: 'Términos y condiciones', icon: FileText },
      { id: 'bloque-gracias', label: 'Mensaje de agradecimiento', icon: Heart },
    ],
  },
  {
    id: 'grupo-comercial',
    label: 'Comercial',
    icon: Percent,
    items: [
      { id: 'bloque-fidelidad', label: 'Descuento por fidelidad', icon: Percent },
      { id: 'bloque-resenas', label: 'Recordatorio de reseña', icon: Star },
    ],
  },
  {
    id: 'grupo-integraciones',
    label: 'Integraciones y notificaciones',
    icon: CalendarClock,
    items: [
      { id: 'bloque-gcal', label: 'Google Calendar', icon: CalendarClock },
      { id: 'bloque-notificaciones', label: 'Notificaciones de visitas', icon: Bell },
      { id: 'bloque-banco', label: 'Sincronización bancaria', icon: Banknote },
    ],
  },
  {
    id: 'grupo-ia',
    label: 'IA y mensajes de clientes',
    icon: Sparkles,
    items: [
      { id: 'bloque-directrices', label: 'Directrices para la IA', icon: Sparkles },
      { id: 'bloque-disponibilidad', label: 'Disponibilidad de visitas', icon: CalendarCheck },
      { id: 'bloque-lista-negra', label: 'Lista negra de emails', icon: Ban },
    ],
  },
];

const BLOQUES_NAV: BloqueNav[] = GRUPOS_NAV.flatMap((g) => g.items);
const GRUPO_DE_BLOQUE: Record<string, string> = Object.fromEntries(
  GRUPOS_NAV.flatMap((g) => g.items.map((item) => [item.id, g.id])),
);

const MESES_FISCAL = [
  { value: '1', label: 'Enero' }, { value: '2', label: 'Febrero' }, { value: '3', label: 'Marzo' },
  { value: '4', label: 'Abril' }, { value: '5', label: 'Mayo' }, { value: '6', label: 'Junio' },
  { value: '7', label: 'Julio' }, { value: '8', label: 'Agosto' }, { value: '9', label: 'Septiembre' },
  { value: '10', label: 'Octubre' }, { value: '11', label: 'Noviembre' }, { value: '12', label: 'Diciembre' },
];

type EntidadPais = {
  razon_social: string;
  nombre_titular: string;
  identificador: string;
  identificador_extra: string;
  direccion: string;
  telefono: string;
  email: string;
  web: string;
  banco: string;
  iban: string;
  bic: string;
  seguro: string;
  num_attestation: string;
};

const ENTIDAD_VACIA: EntidadPais = {
  razon_social: '',
  nombre_titular: '',
  identificador: '',
  identificador_extra: '',
  direccion: '',
  telefono: '',
  email: '',
  web: '',
  banco: '',
  iban: '',
  bic: '',
  seguro: '',
  num_attestation: '',
};

const MODOS_TC = [
  { value: 'bilingue', label: 'Bilingüe (ES/FR según idioma del documento)' },
  { value: 'solo_es', label: 'Solo Español' },
  { value: 'solo_fr', label: 'Solo Français' },
];

const TAMANOS_TC = [
  { value: 'normal', label: 'Normal' },
  { value: 'grande', label: 'Grande' },
  { value: 'muy_grande', label: 'Muy grande' },
];

type BloquePaisProps = {
  titulo: string;
  datos: EntidadPais;
  onChange: (cambios: Partial<EntidadPais>) => void;
  labelIdentificador: string;
  labelIdentificadorExtra: string;
  onGuardar: () => void;
  guardando: boolean;
};

function BloquePais({ titulo, datos, onChange, labelIdentificador, labelIdentificadorExtra, onGuardar, guardando }: BloquePaisProps) {
  return (
    <section className="bg-surface border border-gray-200 rounded-sm p-4">
      <div className="flex items-center justify-between border-b border-gray-200 pb-2 mb-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-brand">{titulo}</p>
        <Button size="sm" onClick={onGuardar} disabled={guardando}>
          {guardando ? 'Guardando...' : 'Guardar'}
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input label="Razón social" value={datos.razon_social} onChange={(e) => onChange({ razon_social: e.target.value })} />
        <Input label="Nombre del titular" value={datos.nombre_titular} onChange={(e) => onChange({ nombre_titular: e.target.value })} />
        <Input label={labelIdentificador} value={datos.identificador} onChange={(e) => onChange({ identificador: e.target.value })} />
        <Input label={labelIdentificadorExtra} value={datos.identificador_extra} onChange={(e) => onChange({ identificador_extra: e.target.value })} />
        <div className="col-span-2">
          <Input label="Dirección" value={datos.direccion} onChange={(e) => onChange({ direccion: e.target.value })} />
        </div>
        <Input label="Teléfono" value={datos.telefono} onChange={(e) => onChange({ telefono: e.target.value })} />
        <Input label="Email" value={datos.email} onChange={(e) => onChange({ email: e.target.value })} />
        <Input label="Web" value={datos.web} onChange={(e) => onChange({ web: e.target.value })} />
      </div>

      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mt-4 mb-2 border-t border-gray-200 pt-3">
        Datos bancarios
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input label="Banco" value={datos.banco} onChange={(e) => onChange({ banco: e.target.value })} />
        <Input label="BIC / SWIFT" value={datos.bic} onChange={(e) => onChange({ bic: e.target.value })} />
        <div className="col-span-2">
          <Input label="IBAN" value={datos.iban} onChange={(e) => onChange({ iban: e.target.value })} />
        </div>
      </div>

      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mt-4 mb-2 border-t border-gray-200 pt-3">
        Seguro
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input label="Aseguradora / seguro" value={datos.seguro} onChange={(e) => onChange({ seguro: e.target.value })} />
        <Input label="Nº de attestation / póliza" value={datos.num_attestation} onChange={(e) => onChange({ num_attestation: e.target.value })} />
      </div>
    </section>
  );
}

export default function ConfiguracionPage() {
  const toast = useToast();
  const { user } = useAuth();
  const { tema, modo, setTema, setModo } = useTema();
  const queryClient = useQueryClient();
  const [bloqueActivo, setBloqueActivo] = useState(BLOQUES_NAV[0].id);
  const [grupoAbierto, setGrupoAbierto] = useState(GRUPOS_NAV[0].id);
  const [emailsNotificacion, setEmailsNotificacion] = useState<string[]>([]);
  const [emailsExcluidos, setEmailsExcluidos] = useState<string[]>([]);
  const [logoUrl, setLogoUrl] = useState('');
  const [datosEs, setDatosEs] = useState<EntidadPais>(ENTIDAD_VACIA);
  const [datosFr, setDatosFr] = useState<EntidadPais>(ENTIDAD_VACIA);
  const [tcEs, setTcEs] = useState('');
  const [tcFr, setTcFr] = useState('');
  const [tcEsOrientativo, setTcEsOrientativo] = useState('');
  const [tcFrOrientativo, setTcFrOrientativo] = useState('');
  const [tcModo, setTcModo] = useState('bilingue');
  const [tcTamano, setTcTamano] = useState('normal');
  const [graciasEs, setGraciasEs] = useState('');
  const [graciasFr, setGraciasFr] = useState('');
  const [condPagoDelaiEs, setCondPagoDelaiEs] = useState('');
  const [condPagoDelaiFr, setCondPagoDelaiFr] = useState('');
  const [condPagoPenalizacionEs, setCondPagoPenalizacionEs] = useState('');
  const [condPagoPenalizacionFr, setCondPagoPenalizacionFr] = useState('');
  const [condPagoMedioEs, setCondPagoMedioEs] = useState('');
  const [condPagoMedioFr, setCondPagoMedioFr] = useState('');
  const [subiendoLogo, setSubiendoLogo] = useState(false);
  const [fidelidadUmbral, setFidelidadUmbral] = useState(10000);
  const [fidelidadPorcentaje, setFidelidadPorcentaje] = useState(10);
  const [fidelidadImporteFijo, setFidelidadImporteFijo] = useState(150);
  const [resenaActiva, setResenaActiva] = useState(false);
  const [resenaDiasEspera, setResenaDiasEspera] = useState(3);
  const [resenaEnlace, setResenaEnlace] = useState('');
  const [visitasDesde, setVisitasDesde] = useState('');
  const [bancoSyncProveedor, setBancoSyncProveedor] = useState('');
  const [bancoSyncIban, setBancoSyncIban] = useState('');
  const [bancoSyncNotas, setBancoSyncNotas] = useState('');

  const { config: fiscalConfig, cargando: cargandoFiscal, guardar: guardarFiscal, guardando: guardandoFiscal } = useFiscalConfig();
  const [tvaDeadlineDia, setTvaDeadlineDia] = useState(21);
  const [acompteIsDia, setAcompteIsDia] = useState(15);
  const [cfeDia, setCfeDia] = useState(15);
  const [soldeIsMes, setSoldeIsMes] = useState(5);
  const [soldeIsDia, setSoldeIsDia] = useState(15);

  const { data: config, isLoading } = useQuery({
    queryKey: ['empresa_config'],
    queryFn: async () => {
      const { data, error } = await supabase.from('empresa_config').select('*').eq('id', 1).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: googleConfig, refetch: refetchGoogleConfig } = useQuery({
    queryKey: ['google_config'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('google_config')
        .select('refresh_token, refresh_token_gmail, updated_at')
        .eq('id', 1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const gcal = params.get('gcal');
    if (!gcal) return;
    const purpose = params.get('purpose');
    const nombre = purpose === 'gmail' ? 'Gmail' : 'Google Calendar';
    if (gcal === 'connected') {
      toast.success(`${nombre} conectado — ya no hará falta volver a iniciar sesión`);
      refetchGoogleConfig();
    } else {
      toast.error(`No se pudo conectar ${nombre}. Revisa las credenciales en Supabase.`);
    }
    params.delete('gcal');
    params.delete('purpose');
    window.history.replaceState({}, '', `${window.location.pathname}${params.toString() ? `?${params}` : ''}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (cargandoFiscal) return;
    setTvaDeadlineDia(fiscalConfig('tva_deadline_dia', 21));
    setAcompteIsDia(fiscalConfig('acompte_is_dia', 15));
    setCfeDia(fiscalConfig('cfe_dia', 15));
    setSoldeIsMes(fiscalConfig('solde_is_mes', 5));
    setSoldeIsDia(fiscalConfig('solde_is_dia', 15));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cargandoFiscal]);

  const guardarFechasFiscales = () => {
    guardarFiscal(
      [
        { clave: 'tva_deadline_dia', valor: tvaDeadlineDia, descripcion: 'Día del mes deadline CA3 (ajustar según SIREN)' },
        { clave: 'acompte_is_dia', valor: acompteIsDia, descripcion: 'Día del mes deadline de los acomptes IS trimestrales' },
        { clave: 'cfe_dia', valor: cfeDia, descripcion: 'Día del mes deadline de la CFE' },
        { clave: 'solde_is_mes', valor: soldeIsMes, descripcion: 'Mes de la declaración anual de sociedades (Solde IS)' },
        { clave: 'solde_is_dia', valor: soldeIsDia, descripcion: 'Día del mes de la declaración anual de sociedades (Solde IS)' },
      ],
      {
        onSuccess: () => {
          toast.success('Fechas fiscales guardadas');
          notificarCambioConfig(user, 'actualizó las fechas fiscales en Configuración.');
        },
        onError: (error: Error) => toast.error(error.message),
      },
    );
  };

  // Solo se hidrata una vez con los datos del servidor. Con el polling de 'empresa_config' (para
  // que los cambios de otros usuarios lleguen sin recargar), sin esta guarda cada refetch de fondo
  // pisaría lo que el usuario esté escribiendo ahora mismo en estos formularios.
  useHidratarUnaVez(config, (config) => {
    const datos = (config.datos ?? {}) as {
      logo_url?: string;
      es?: Partial<EntidadPais>;
      fr?: Partial<EntidadPais>;
      fidelidad?: { umbral?: number; porcentaje?: number; importeFijo?: number };
      resenas?: { activo?: boolean; diasEspera?: number; enlace?: string };
      condicionesPago?: {
        delaiEs?: string;
        delaiFr?: string;
        penalizacionEs?: string;
        penalizacionFr?: string;
        medioEs?: string;
        medioFr?: string;
      };
      notificaciones_visita_emails_extra?: string[];
      solicitudes_emails_excluidos?: string[];
      sincronizacionBanco?: { proveedor?: string; iban?: string; notas?: string };
    };
    setLogoUrl(datos.logo_url ?? '');
    setDatosEs({ ...ENTIDAD_VACIA, ...(datos.es ?? {}) });
    setDatosFr({ ...ENTIDAD_VACIA, ...(datos.fr ?? {}) });
    setTcEs(config.tc_es ?? '');
    setTcFr(config.tc_fr ?? '');
    setTcEsOrientativo(config.tc_es_orientativo ?? '');
    setTcFrOrientativo(config.tc_fr_orientativo ?? '');
    setTcModo(config.tc_modo ?? 'bilingue');
    setTcTamano(config.tc_tamano ?? 'normal');
    setGraciasEs(config.mensaje_gracias_es ?? '');
    setGraciasFr(config.mensaje_gracias_fr ?? '');
    setCondPagoDelaiEs(datos.condicionesPago?.delaiEs ?? '');
    setCondPagoDelaiFr(datos.condicionesPago?.delaiFr ?? '');
    setCondPagoPenalizacionEs(datos.condicionesPago?.penalizacionEs ?? '');
    setCondPagoPenalizacionFr(datos.condicionesPago?.penalizacionFr ?? '');
    setCondPagoMedioEs(datos.condicionesPago?.medioEs ?? '');
    setCondPagoMedioFr(datos.condicionesPago?.medioFr ?? '');
    setFidelidadUmbral(datos.fidelidad?.umbral ?? 10000);
    setFidelidadPorcentaje(datos.fidelidad?.porcentaje ?? 10);
    setFidelidadImporteFijo(datos.fidelidad?.importeFijo ?? 150);
    setResenaActiva(datos.resenas?.activo ?? false);
    setResenaDiasEspera(datos.resenas?.diasEspera ?? 3);
    setResenaEnlace(datos.resenas?.enlace ?? '');
    setEmailsNotificacion(datos.notificaciones_visita_emails_extra ?? []);
    setEmailsExcluidos(datos.solicitudes_emails_excluidos ?? []);
    setVisitasDesde(config.visitas_disponibles_desde ?? '');
    setBancoSyncProveedor(datos.sincronizacionBanco?.proveedor ?? '');
    setBancoSyncIban(datos.sincronizacionBanco?.iban ?? '');
    setBancoSyncNotas(datos.sincronizacionBanco?.notas ?? '');
  });

  const guardarDatos = guardarConfigDatos;

  const alGuardar = (mensajeToast: string, mensajeNotificacion: string) => ({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['empresa_config'] });
      toast.success(mensajeToast);
      notificarCambioConfig(user, mensajeNotificacion);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const guardarLogoMutation = useMutation({
    mutationFn: () => guardarDatos({ logo_url: logoUrl }),
    ...alGuardar('Logo guardado', 'actualizó el logo del CRM en Configuración.'),
  });

  const guardarEsMutation = useMutation({
    mutationFn: () => guardarDatos({ es: datosEs }),
    ...alGuardar('Datos de España guardados', 'actualizó los datos de España (incluye cuenta bancaria) en Configuración.'),
  });

  const guardarFrMutation = useMutation({
    mutationFn: () => guardarDatos({ fr: datosFr }),
    ...alGuardar('Datos de Francia guardados', 'actualizó los datos de Francia (incluye cuenta bancaria) en Configuración.'),
  });

  const guardarTcMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('empresa_config')
        .update({
          tc_es: tcEs,
          tc_fr: tcFr,
          tc_es_orientativo: tcEsOrientativo,
          tc_fr_orientativo: tcFrOrientativo,
          tc_modo: tcModo,
          tc_tamano: tcTamano,
        })
        .eq('id', 1);
      if (error) throw error;
    },
    ...alGuardar('Términos y condiciones guardados', 'actualizó los términos y condiciones en Configuración.'),
  });

  const guardarGraciasMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('empresa_config')
        .update({ mensaje_gracias_es: graciasEs, mensaje_gracias_fr: graciasFr })
        .eq('id', 1);
      if (error) throw error;
    },
    ...alGuardar('Mensaje de agradecimiento guardado', 'actualizó el mensaje de agradecimiento en Configuración.'),
  });

  const guardarCondicionesPagoMutation = useMutation({
    mutationFn: () =>
      guardarDatos({
        condicionesPago: {
          delaiEs: condPagoDelaiEs,
          delaiFr: condPagoDelaiFr,
          penalizacionEs: condPagoPenalizacionEs,
          penalizacionFr: condPagoPenalizacionFr,
          medioEs: condPagoMedioEs,
          medioFr: condPagoMedioFr,
        },
      }),
    ...alGuardar('Condiciones de pago guardadas', 'actualizó las condiciones de pago en Configuración.'),
  });

  const guardarFidelidadMutation = useMutation({
    mutationFn: () =>
      guardarDatos({ fidelidad: { umbral: fidelidadUmbral, porcentaje: fidelidadPorcentaje, importeFijo: fidelidadImporteFijo } }),
    ...alGuardar('Descuento por fidelidad guardado', 'actualizó el descuento por fidelidad en Configuración.'),
  });

  const guardarResenasMutation = useMutation({
    mutationFn: () => guardarDatos({ resenas: { activo: resenaActiva, diasEspera: resenaDiasEspera, enlace: resenaEnlace } }),
    ...alGuardar('Recordatorio de reseña guardado', 'actualizó el recordatorio de reseña en Configuración.'),
  });

  const guardarBancoSyncMutation = useMutation({
    mutationFn: () =>
      guardarDatos({ sincronizacionBanco: { proveedor: bancoSyncProveedor, iban: bancoSyncIban, notas: bancoSyncNotas } }),
    ...alGuardar('Datos de sincronización bancaria guardados', 'actualizó los datos de sincronización bancaria en Configuración.'),
  });

  const guardarVisitasDesdeMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('empresa_config')
        .update({ visitas_disponibles_desde: visitasDesde || null })
        .eq('id', 1);
      if (error) throw error;
    },
    ...alGuardar('Disponibilidad de visitas guardada', 'actualizó la fecha desde la que se ofrecen visitas en Configuración.'),
  });

  const guardarNotificacionesMutation = useMutation({
    mutationFn: () =>
      guardarDatos({ notificaciones_visita_emails_extra: emailsNotificacion.map((e) => e.trim()).filter(Boolean) }),
    ...alGuardar('Emails de notificación guardados', 'actualizó los emails de notificación de visitas en Configuración.'),
  });

  const guardarListaNegraMutation = useMutation({
    mutationFn: () =>
      guardarDatos({ solicitudes_emails_excluidos: emailsExcluidos.map((e) => e.trim().toLowerCase()).filter(Boolean) }),
    ...alGuardar('Lista negra guardada', 'actualizó la lista negra de emails de Solicitudes en Configuración.'),
  });

  const handleSubirLogo = async (file: File) => {
    setSubiendoLogo(true);
    const extension = file.name.split('.').pop() ?? 'png';
    const path = `logo_${Date.now()}.${extension}`;
    const { error } = await supabase.storage.from('empresa').upload(path, file, {
      contentType: file.type,
      upsert: true,
    });
    setSubiendoLogo(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    const { data } = supabase.storage.from('empresa').getPublicUrl(path);
    setLogoUrl(data.publicUrl);
    toast.success('Logo subido — pulsa Guardar para confirmar');
  };

  if (isLoading) {
    return <div className="h-96 bg-surface border border-gray-200 rounded-sm animate-pulse" />;
  }

  const irA = (id: string) => {
    setBloqueActivo(id);
    setGrupoAbierto(GRUPO_DE_BLOQUE[id]);
  };

  const enlacesConstructores = (
    <>
      <NavLink
        to="/configuracion/plantillas"
        className="flex items-center gap-2 px-2.5 py-1.5 text-sm text-brand font-medium rounded-sm hover:bg-brand-light"
      >
        <Sliders size={14} className="shrink-0" />
        Constructor de plantillas
      </NavLink>
      <NavLink
        to="/configuracion/planning"
        className="flex items-center gap-2 px-2.5 py-1.5 text-sm text-brand font-medium rounded-sm hover:bg-brand-light"
      >
        <CalendarRange size={14} className="shrink-0" />
        Constructor de planning
      </NavLink>
      <NavLink
        to="/configuracion/portada"
        className="flex items-center gap-2 px-2.5 py-1.5 text-sm text-brand font-medium rounded-sm hover:bg-brand-light"
      >
        <FileImage size={14} className="shrink-0" />
        Constructor de portadas
      </NavLink>
    </>
  );

  return (
    <div className="flex flex-col md:flex-row gap-5 items-start">
      {/* Móvil: dos selectores (categoría → sección) en vez de la barra lateral, que no cabe */}
      <div className="flex md:hidden flex-col gap-2 w-full mb-1">
        <Select
          label="Categoría"
          options={GRUPOS_NAV.map((g) => ({ value: g.id, label: g.label }))}
          value={grupoAbierto}
          onChange={(e) => {
            const grupo = GRUPOS_NAV.find((g) => g.id === e.target.value);
            setGrupoAbierto(e.target.value);
            if (grupo) setBloqueActivo(grupo.items[0].id);
          }}
        />
        <Select
          label="Sección"
          options={(GRUPOS_NAV.find((g) => g.id === grupoAbierto)?.items ?? []).map((b) => ({ value: b.id, label: b.label }))}
          value={bloqueActivo}
          onChange={(e) => setBloqueActivo(e.target.value)}
        />
        <div className="flex flex-col gap-0.5 bg-surface border border-gray-200 rounded-sm p-2 mt-1">{enlacesConstructores}</div>
      </div>

      {/* Escritorio: acordeón por categorías */}
      <nav className="hidden md:flex flex-col gap-0.5 w-56 shrink-0 sticky top-4 self-start bg-surface border border-gray-200 rounded-sm p-2">
        {GRUPOS_NAV.map((g) => {
          const GrupoIcon = g.icon;
          const abierto = grupoAbierto === g.id;
          return (
            <div key={g.id}>
              <button
                onClick={() => setGrupoAbierto(abierto ? '' : g.id)}
                className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 text-sm rounded-sm text-left ${
                  abierto ? 'text-brand font-medium' : 'text-gray-600 hover:bg-brand-light hover:text-brand'
                }`}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <GrupoIcon size={14} className="shrink-0" />
                  <span className="truncate">{g.label}</span>
                </span>
                <ChevronDown size={13} className={`shrink-0 transition-transform ${abierto ? 'rotate-180' : ''}`} />
              </button>
              <div className="grid transition-[grid-template-rows] duration-150 ease-out" style={{ gridTemplateRows: abierto ? '1fr' : '0fr' }}>
                <div className="overflow-hidden">
                  <div className="pl-3 flex flex-col gap-0.5 py-0.5">
                    {g.items.map((b) => {
                      const Icon = b.icon;
                      const activo = bloqueActivo === b.id;
                      return (
                        <button
                          key={b.id}
                          onClick={() => irA(b.id)}
                          className={`flex items-center gap-2 px-2.5 py-1.5 text-sm rounded-sm text-left ${
                            activo ? 'bg-brand-light text-brand font-medium' : 'text-gray-500 hover:bg-brand-light hover:text-brand'
                          }`}
                        >
                          <Icon size={13} className="shrink-0" />
                          <span className="truncate">{b.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        <div className="border-t border-gray-100 my-1.5" />
        {enlacesConstructores}
      </nav>

      <div className="flex-1 min-w-0 max-w-3xl flex flex-col gap-4">
      <section
        id="bloque-apariencia"
        className="bg-surface border border-gray-200 rounded-sm p-4"
        style={{ display: bloqueActivo === 'bloque-apariencia' ? undefined : 'none' }}
      >
        <div className="border-b border-gray-200 pb-2 mb-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Apariencia</p>
        </div>
        <p className="text-xs text-gray-400 mb-3">
          Preferencia personal de este navegador — cada usuario puede elegir la suya sin afectar a los demás. Se aplica
          al momento, sin necesidad de guardar.
        </p>

        <p className="text-xs font-semibold text-gray-700 mb-2">Modo</p>
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setModo('claro')}
            className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded-sm border ${
              modo === 'claro' ? 'border-brand text-brand bg-brand-light' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Sun size={14} />
            Claro
          </button>
          <button
            onClick={() => setModo('oscuro')}
            className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded-sm border ${
              modo === 'oscuro' ? 'border-brand text-brand bg-brand-light' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Moon size={14} />
            Oscuro
          </button>
        </div>

        <p className="text-xs font-semibold text-gray-700 mb-2">Color</p>
        <div className="flex flex-wrap gap-3">
          {TEMAS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTema(t.id)}
              title={t.label}
              className="flex flex-col items-center gap-1.5"
            >
              <span
                className="w-9 h-9 rounded-full flex items-center justify-center border-2"
                style={{
                  backgroundColor: t.swatch,
                  borderColor: tema === t.id ? t.swatch : 'transparent',
                  boxShadow: tema === t.id ? `0 0 0 2px rgb(var(--color-surface)), 0 0 0 4px ${t.swatch}` : undefined,
                }}
              >
                {tema === t.id && <Check size={15} className="text-white" />}
              </span>
              <span className="text-xs text-gray-600">{t.label}</span>
            </button>
          ))}
        </div>
      </section>

      <section
        id="bloque-logo"
        className="bg-surface border border-gray-200 rounded-sm p-4"
        style={{ display: bloqueActivo === 'bloque-logo' ? undefined : 'none' }}
      >
        <div className="flex items-center justify-between border-b border-gray-200 pb-2 mb-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Logo</p>
          <Button size="sm" onClick={() => guardarLogoMutation.mutate()} disabled={guardarLogoMutation.isPending}>
            {guardarLogoMutation.isPending ? 'Guardando...' : 'Guardar'}
          </Button>
        </div>
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 border border-gray-200 rounded-sm flex items-center justify-center bg-gray-50 shrink-0 overflow-hidden">
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" className="max-w-full max-h-full object-contain" />
            ) : (
              <ImageIcon size={22} className="text-gray-300" />
            )}
          </div>
          <div>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => e.target.files?.[0] && handleSubirLogo(e.target.files[0])}
              disabled={subiendoLogo}
              className="text-sm"
            />
            <p className="text-xs text-gray-400 mt-1">
              Solo se usa dentro del CRM (barra lateral) — no aparece en presupuestos, facturas ni plannings. Para el
              logo de esos documentos, ve a Constructor de portadas.
            </p>
          </div>
        </div>
      </section>

      <div id="bloque-plantillas" style={{ display: bloqueActivo === 'bloque-plantillas' ? undefined : 'none' }}>
        <PlantillasSection config={config} />
      </div>

      <div
        className="flex flex-col gap-4"
        style={{ display: bloqueActivo === 'bloque-espana' || bloqueActivo === 'bloque-francia' ? undefined : 'none' }}
      >
        <p className="text-xs text-gray-400 -mb-2">
          Los datos de cada bloque se usan según el país del cliente (dirección de la visita/presupuesto).
        </p>

        <div id="bloque-espana" style={{ display: bloqueActivo === 'bloque-espana' ? undefined : 'none' }}>
          <BloquePais
            titulo="España"
            datos={datosEs}
            onChange={(c) => setDatosEs((d) => ({ ...d, ...c }))}
            labelIdentificador="CIF"
            labelIdentificadorExtra="Identificador adicional (opcional)"
            onGuardar={() => guardarEsMutation.mutate()}
            guardando={guardarEsMutation.isPending}
          />
        </div>

        <div id="bloque-francia" style={{ display: bloqueActivo === 'bloque-francia' ? undefined : 'none' }}>
          <BloquePais
            titulo="Francia"
            datos={datosFr}
            onChange={(c) => setDatosFr((d) => ({ ...d, ...c }))}
            labelIdentificador="SIRET"
            labelIdentificadorExtra="TVA"
            onGuardar={() => guardarFrMutation.mutate()}
            guardando={guardarFrMutation.isPending}
          />
        </div>
      </div>

      <section
        id="bloque-condiciones-pago"
        className="bg-surface border border-gray-200 rounded-sm p-4"
        style={{ display: bloqueActivo === 'bloque-condiciones-pago' ? undefined : 'none' }}
      >
        <div className="flex items-center justify-between border-b border-gray-200 pb-2 mb-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Condiciones de pago</p>
          <Button size="sm" onClick={() => guardarCondicionesPagoMutation.mutate()} disabled={guardarCondicionesPagoMutation.isPending}>
            {guardarCondicionesPagoMutation.isPending ? 'Guardando...' : 'Guardar'}
          </Button>
        </div>
        <p className="text-xs text-gray-400 mb-3">
          Valor por defecto de empresa — aparece en presupuestos y facturas, encima del bloque de seguro/garantía décennale,
          según el idioma del documento. Se puede anular para un presupuesto concreto desde su propio formulario.
        </p>
        <CondicionesPagoEditor
          valor={{
            delaiEs: condPagoDelaiEs,
            delaiFr: condPagoDelaiFr,
            penalizacionEs: condPagoPenalizacionEs,
            penalizacionFr: condPagoPenalizacionFr,
            medioEs: condPagoMedioEs,
            medioFr: condPagoMedioFr,
          }}
          onChange={(v) => {
            setCondPagoDelaiEs(v.delaiEs);
            setCondPagoDelaiFr(v.delaiFr);
            setCondPagoPenalizacionEs(v.penalizacionEs);
            setCondPagoPenalizacionFr(v.penalizacionFr);
            setCondPagoMedioEs(v.medioEs);
            setCondPagoMedioFr(v.medioFr);
          }}
        />
      </section>

      <section
        id="bloque-tc"
        className="bg-surface border border-gray-200 rounded-sm p-4"
        style={{ display: bloqueActivo === 'bloque-tc' ? undefined : 'none' }}
      >
        <div className="flex items-center justify-between border-b border-gray-200 pb-2 mb-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Términos y condiciones</p>
          <Button size="sm" onClick={() => guardarTcMutation.mutate()} disabled={guardarTcMutation.isPending}>
            {guardarTcMutation.isPending ? 'Guardando...' : 'Guardar'}
          </Button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <Select label="Modo" options={MODOS_TC} value={tcModo} onChange={(e) => setTcModo(e.target.value)} />
          <Select
            label="Tamaño de letra"
            options={TAMANOS_TC}
            value={tcTamano}
            onChange={(e) => setTcTamano(e.target.value)}
          />
        </div>
        <p className="text-xs text-gray-400 mb-3">
          Escribe <code className="bg-gray-100 px-1 rounded-sm">{'{PLAN_PAGO}'}</code> donde quieras que aparezca el plan de
          pago del presupuesto (se sustituye automáticamente por "50% al inicio, 50% al finalizar", etc. según cada caso).
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <EditorTexto label="Español" value={tcEs} onChange={setTcEs} rows={8} />
          <EditorTexto label="Français" value={tcFr} onChange={setTcFr} rows={8} />
        </div>

        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mt-4 mb-2 border-t border-gray-200 pt-3">
          Presupuestos orientativos — T&C específicos
        </p>
        <p className="text-xs text-gray-400 mb-3">
          Si se dejan vacíos, los presupuestos orientativos usarán los T&C generales de arriba.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <EditorTexto label="Español" value={tcEsOrientativo} onChange={setTcEsOrientativo} rows={6} />
          <EditorTexto label="Français" value={tcFrOrientativo} onChange={setTcFrOrientativo} rows={6} />
        </div>
      </section>

      <section
        id="bloque-gracias"
        className="bg-surface border border-gray-200 rounded-sm p-4"
        style={{ display: bloqueActivo === 'bloque-gracias' ? undefined : 'none' }}
      >
        <div className="flex items-center justify-between border-b border-gray-200 pb-2 mb-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Mensaje de agradecimiento</p>
          <Button size="sm" onClick={() => guardarGraciasMutation.mutate()} disabled={guardarGraciasMutation.isPending}>
            {guardarGraciasMutation.isPending ? 'Guardando...' : 'Guardar'}
          </Button>
        </div>
        <p className="text-xs text-gray-400 mb-3">Aparece al final de presupuestos y facturas, según el idioma del documento.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Español</label>
            <textarea
              value={graciasEs}
              onChange={(e) => setGraciasEs(e.target.value)}
              placeholder="Gracias por confiar en Reformas Ordoñez."
              className="w-full border border-gray-200 rounded-sm px-2.5 py-1.5 text-sm min-h-[70px] focus:border-brand focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Français</label>
            <textarea
              value={graciasFr}
              onChange={(e) => setGraciasFr(e.target.value)}
              placeholder="Merci de votre confiance envers Reformas Ordoñez."
              className="w-full border border-gray-200 rounded-sm px-2.5 py-1.5 text-sm min-h-[70px] focus:border-brand focus:outline-none"
            />
          </div>
        </div>
      </section>

      <section
        id="bloque-catalogo-lineas"
        className="bg-surface border border-gray-200 rounded-sm p-4"
        style={{ display: bloqueActivo === 'bloque-catalogo-lineas' ? undefined : 'none' }}
      >
        <CatalogoLineasSection />
      </section>

      <section
        id="bloque-fidelidad"
        className="bg-surface border border-gray-200 rounded-sm p-4"
        style={{ display: bloqueActivo === 'bloque-fidelidad' ? undefined : 'none' }}
      >
        <div className="flex items-center justify-between border-b border-gray-200 pb-2 mb-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Descuento por fidelidad</p>
          <Button size="sm" onClick={() => guardarFidelidadMutation.mutate()} disabled={guardarFidelidadMutation.isPending}>
            {guardarFidelidadMutation.isPending ? 'Guardando...' : 'Guardar'}
          </Button>
        </div>
        <p className="text-xs text-gray-400 mb-3">
          Se propone automáticamente al crear un presupuesto para un cliente con más de una obra registrada.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Input
            label="Umbral (€)"
            type="number"
            value={fidelidadUmbral}
            onChange={(e) => setFidelidadUmbral(Number(e.target.value))}
            hint="Si el presupuesto supera este importe..."
          />
          <Input
            label="Descuento (%)"
            type="number"
            value={fidelidadPorcentaje}
            onChange={(e) => setFidelidadPorcentaje(Number(e.target.value))}
            hint="...se propone este % de descuento"
          />
          <Input
            label="Descuento fijo (€)"
            type="number"
            value={fidelidadImporteFijo}
            onChange={(e) => setFidelidadImporteFijo(Number(e.target.value))}
            hint="Si no supera el umbral, este importe fijo"
          />
        </div>
      </section>

      <section
        id="bloque-resenas"
        className="bg-surface border border-gray-200 rounded-sm p-4"
        style={{ display: bloqueActivo === 'bloque-resenas' ? undefined : 'none' }}
      >
        <div className="flex items-center justify-between border-b border-gray-200 pb-2 mb-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Recordatorio de reseña Google</p>
          <Button size="sm" onClick={() => guardarResenasMutation.mutate()} disabled={guardarResenasMutation.isPending}>
            {guardarResenasMutation.isPending ? 'Guardando...' : 'Guardar'}
          </Button>
        </div>
        <p className="text-xs text-gray-400 mb-3">
          Cuando una factura se marca como Cobrada (trabajo acabado y pagado), se propone enviar un recordatorio de reseña
          pasados los días configurados.
        </p>
        <label className="flex items-center gap-2 text-sm text-gray-700 mb-3">
          <input type="checkbox" checked={resenaActiva} onChange={(e) => setResenaActiva(e.target.checked)} />
          Activar recordatorios de reseña
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            label="Días de espera"
            type="number"
            value={resenaDiasEspera}
            onChange={(e) => setResenaDiasEspera(Number(e.target.value))}
            hint="Días desde que la factura se marca Cobrada"
          />
          <Input
            label="Enlace a Google Reviews"
            value={resenaEnlace}
            onChange={(e) => setResenaEnlace(e.target.value)}
            placeholder="https://g.page/r/..."
          />
        </div>
      </section>

      <section
        id="bloque-gcal"
        className="bg-surface border border-gray-200 rounded-sm p-4"
        style={{ display: bloqueActivo === 'bloque-gcal' ? undefined : 'none' }}
      >
        <div className="flex items-center justify-between border-b border-gray-200 pb-2 mb-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Google Calendar y Gmail</p>
        </div>
        <p className="text-xs text-gray-400 mb-3">
          Desde el 2026-08-05, Calendar y Gmail se conectan por separado (antes era una sola conexión combinada) —
          así el navegador nunca recibe un token con permiso de leer/enviar Gmail solo por crear un evento de
          Calendar. Conexión compartida por los 3 usuarios, sincroniza en segundo plano sin pedir volver a iniciar
          sesión.
        </p>

        <p className="text-xs font-semibold text-gray-600 mb-1.5">Calendar (agendar visitas)</p>
        {googleConfig?.refresh_token ? (
          <div className="flex items-center gap-2 text-sm text-brand mb-4">
            <span className="w-2 h-2 rounded-full bg-brand" />
            Conectado
            {googleConfig.updated_at && (
              <span className="text-xs text-gray-400">
                (desde el{' '}
                {new Date(googleConfig.updated_at).toLocaleDateString('es', { day: '2-digit', month: 'short', year: '2-digit' })})
              </span>
            )}
            <Button size="sm" variant="secondary" onClick={() => iniciarConexionGoogleCalendar('/configuracion')} className="ml-auto">
              Reconectar (recomendado, para pasar al scope reducido)
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-3 mb-4">
            <span className="flex items-center gap-2 text-sm text-gray-500">
              <span className="w-2 h-2 rounded-full bg-gray-300" />
              No conectado
            </span>
            <Button size="sm" onClick={() => iniciarConexionGoogleCalendar('/configuracion')}>
              Conectar Google Calendar
            </Button>
          </div>
        )}

        <p className="text-xs font-semibold text-gray-600 mb-1.5">Gmail (Solicitudes y notificaciones)</p>
        {googleConfig?.refresh_token_gmail ? (
          <div className="flex items-center gap-2 text-sm text-brand">
            <span className="w-2 h-2 rounded-full bg-brand" />
            Conectado
            <Button size="sm" variant="secondary" onClick={() => iniciarConexionGmail('/configuracion')} className="ml-auto">
              Reconectar
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-2 text-sm text-gray-500">
              <span className="w-2 h-2 rounded-full bg-gray-300" />
              {googleConfig?.refresh_token
                ? 'No conectado por separado — usando de momento la conexión combinada antigua de Calendar'
                : 'No conectado'}
            </span>
            <Button size="sm" onClick={() => iniciarConexionGmail('/configuracion')}>
              Conectar Gmail
            </Button>
          </div>
        )}
        {googleConfig?.refresh_token && !googleConfig?.refresh_token_gmail && (
          <p className="text-xs text-gray-400 mt-2">
            Nada se rompe si no conectas esto ahora — Solicitudes y las notificaciones de visita seguirán
            funcionando con la conexión antigua. Para cerrar del todo el exceso de permiso, conecta Gmail aquí y
            después pulsa "Reconectar" en Calendar arriba.
          </p>
        )}
      </section>

      <section
        id="bloque-notificaciones"
        className="bg-surface border border-gray-200 rounded-sm p-4"
        style={{ display: bloqueActivo === 'bloque-notificaciones' ? undefined : 'none' }}
      >
        <div className="flex items-center justify-between border-b border-gray-200 pb-2 mb-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Notificaciones de visitas</p>
          <Button size="sm" onClick={() => guardarNotificacionesMutation.mutate()} disabled={guardarNotificacionesMutation.isPending}>
            {guardarNotificacionesMutation.isPending ? 'Guardando...' : 'Guardar'}
          </Button>
        </div>
        <p className="text-xs text-gray-400 mb-3">
          Cuando se agenda una visita (fecha y hora), se manda un email de confirmación con los datos de la visita a{' '}
          <span className="font-medium text-gray-600">reformasordonezeus@gmail.com</span> y a estos emails adicionales.
        </p>
        <div className="space-y-2 mb-3">
          {emailsNotificacion.length === 0 && <p className="text-xs text-gray-400">No hay emails adicionales configurados.</p>}
          {emailsNotificacion.map((email, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                value={email}
                onChange={(e) =>
                  setEmailsNotificacion((arr) => arr.map((v, idx) => (idx === i ? e.target.value : v)))
                }
                placeholder="nombre@ejemplo.com"
                className="flex-1"
              />
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setEmailsNotificacion((arr) => arr.filter((_, idx) => idx !== i))}
              >
                Quitar
              </Button>
            </div>
          ))}
        </div>
        <Button size="sm" variant="secondary" onClick={() => setEmailsNotificacion((arr) => [...arr, ''])}>
          + Añadir email
        </Button>
      </section>

      <section
        id="bloque-banco"
        className="bg-surface border border-gray-200 rounded-sm p-4"
        style={{ display: bloqueActivo === 'bloque-banco' ? undefined : 'none' }}
      >
        <div className="flex items-center justify-between border-b border-gray-200 pb-2 mb-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Sincronización bancaria</p>
          <Button size="sm" onClick={() => guardarBancoSyncMutation.mutate()} disabled={guardarBancoSyncMutation.isPending}>
            {guardarBancoSyncMutation.isPending ? 'Guardando...' : 'Guardar'}
          </Button>
        </div>
        <p className="text-xs text-gray-400 mb-3">
          De momento no hay ninguna conexión automática — investigado el 2026-08: ningún agregador bancario (Powens,
          Bridge, Tink) ofrece self-service barato para una sola cuenta, todos piden contrato comercial. Mientras
          tanto, ya se puede importar el extracto exportado en formato OFX desde la banca online en{' '}
          <NavLink to="/contabilidad/banco" className="text-brand underline">
            Contabilidad → Movimientos bancarios
          </NavLink>{' '}
          (gratis, manual). Cuando esté abierta la cuenta en Crédit Agricole, probar primero{' '}
          <span className="font-medium text-gray-600">Enable Banking</span> (único con tier gratuito para conectar
          solo la cuenta propia, pero sin confirmar que cubra banca profesional de Crédit Agricole) — si no cubre,
          la alternativa de pago con cobertura confirmada de Crédit Agricole Pro es{' '}
          <span className="font-medium text-gray-600">Bridge</span> (bridgeapi.io).
        </p>
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-3">
          <span className="w-2 h-2 rounded-full bg-gray-300" />
          No conectado — usando importación manual OFX
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <Input
            label="Banco / proveedor de sincronización previsto"
            value={bancoSyncProveedor}
            onChange={(e) => setBancoSyncProveedor(e.target.value)}
            placeholder="Ej. Qonto, Bridge, N26..."
          />
          <Input
            label="IBAN de la cuenta profesional"
            value={bancoSyncIban}
            onChange={(e) => setBancoSyncIban(e.target.value)}
            placeholder="Cuando esté abierta la cuenta"
          />
        </div>
        <Input
          label="Notas"
          value={bancoSyncNotas}
          onChange={(e) => setBancoSyncNotas(e.target.value)}
          placeholder="Cualquier detalle a recordar sobre la futura conexión"
        />
      </section>

      <section
        id="bloque-fiscal"
        className="bg-surface border border-gray-200 rounded-sm p-4"
        style={{ display: bloqueActivo === 'bloque-fiscal' ? undefined : 'none' }}
      >
        <div className="flex items-center justify-between border-b border-gray-200 pb-2 mb-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Fechas fiscales</p>
          <Button size="sm" onClick={guardarFechasFiscales} disabled={guardandoFiscal}>
            {guardandoFiscal ? 'Guardando...' : 'Guardar'}
          </Button>
        </div>
        <p className="text-xs text-gray-400 mb-3">
          Días y fecha exacta de los principales vencimientos fiscales — se usan al generar el calendario fiscal
          (pestaña Fiscalidad → Calendario) y aparecen también en el calendario de Inicio.
        </p>

        <div className="mb-4 pb-4 border-b border-gray-100">
          <p className="text-xs font-semibold text-gray-700 mb-2">Declaración anual de sociedades (Solde IS)</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select
              label="Mes"
              options={MESES_FISCAL}
              value={String(soldeIsMes)}
              onChange={(e) => setSoldeIsMes(Number(e.target.value))}
            />
            <Input
              label="Día"
              type="number"
              min={1}
              max={31}
              value={soldeIsDia}
              onChange={(e) => setSoldeIsDia(Number(e.target.value))}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Input
            label="TVA — día límite mensual"
            type="number"
            min={1}
            max={31}
            value={tvaDeadlineDia}
            onChange={(e) => setTvaDeadlineDia(Number(e.target.value))}
          />
          <Input
            label="Acomptes IS — día límite"
            type="number"
            min={1}
            max={31}
            value={acompteIsDia}
            onChange={(e) => setAcompteIsDia(Number(e.target.value))}
          />
          <Input
            label="CFE — día límite"
            type="number"
            min={1}
            max={31}
            value={cfeDia}
            onChange={(e) => setCfeDia(Number(e.target.value))}
          />
        </div>
      </section>

      <div id="bloque-directrices" style={{ display: bloqueActivo === 'bloque-directrices' ? undefined : 'none' }}>
        <DirectricesSection />
      </div>

      <section
        id="bloque-disponibilidad"
        className="bg-surface border border-gray-200 rounded-sm p-4"
        style={{ display: bloqueActivo === 'bloque-disponibilidad' ? undefined : 'none' }}
      >
        <div className="flex items-center justify-between border-b border-gray-200 pb-2 mb-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Disponibilidad de visitas</p>
          <Button size="sm" onClick={() => guardarVisitasDesdeMutation.mutate()} disabled={guardarVisitasDesdeMutation.isPending}>
            {guardarVisitasDesdeMutation.isPending ? 'Guardando...' : 'Guardar'}
          </Button>
        </div>
        <p className="text-xs text-gray-400 mb-3">
          La IA nunca ofrece una visita técnica antes de esta fecha al redactar mensajes a clientes (cierres de
          temporada, vacaciones, etc.). Déjalo vacío para no aplicar ningún límite.
        </p>
        <Input
          label="No ofrecer visitas antes de"
          type="date"
          value={visitasDesde}
          onChange={(e) => setVisitasDesde(e.target.value)}
          className="w-52"
        />
      </section>

      <section
        id="bloque-lista-negra"
        className="bg-surface border border-gray-200 rounded-sm p-4"
        style={{ display: bloqueActivo === 'bloque-lista-negra' ? undefined : 'none' }}
      >
        <div className="flex items-center justify-between border-b border-gray-200 pb-2 mb-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Lista negra de emails</p>
          <Button size="sm" onClick={() => guardarListaNegraMutation.mutate()} disabled={guardarListaNegraMutation.isPending}>
            {guardarListaNegraMutation.isPending ? 'Guardando...' : 'Guardar'}
          </Button>
        </div>
        <p className="text-xs text-gray-400 mb-3">
          Al comprobar Gmail, el CRM detecta como solicitud nueva cualquier hilo donde escribiste y la otra persona
          respondió. Añade aquí emails que no son clientes (aseguradora, proveedores, gestoría, etc.) para que esas
          conversaciones se ignoren. Puedes poner un email completo (<span className="font-mono">contacto@aseguradora.com</span>)
          o un dominio entero empezando por arroba (<span className="font-mono">@aseguradora.com</span>).
        </p>
        <div className="space-y-2 mb-3">
          {emailsExcluidos.length === 0 && <p className="text-xs text-gray-400">No hay emails excluidos configurados.</p>}
          {emailsExcluidos.map((email, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                value={email}
                onChange={(e) => setEmailsExcluidos((arr) => arr.map((v, idx) => (idx === i ? e.target.value : v)))}
                placeholder="contacto@aseguradora.com o @aseguradora.com"
                className="flex-1"
              />
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setEmailsExcluidos((arr) => arr.filter((_, idx) => idx !== i))}
              >
                Quitar
              </Button>
            </div>
          ))}
        </div>
        <Button size="sm" variant="secondary" onClick={() => setEmailsExcluidos((arr) => [...arr, ''])}>
          + Añadir email
        </Button>
      </section>
      </div>
    </div>
  );
}
