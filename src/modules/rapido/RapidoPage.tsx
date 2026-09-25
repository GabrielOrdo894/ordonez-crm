import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Car, Check, ChevronLeft, Copy, ExternalLink, FileText, LayoutDashboard, MapPin, Phone, Wrench } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { marcarCrmCompletoEnMovil } from '../../lib/crmCompletoMovil';
import { useToast } from '../../hooks/useToast';
import { cargarConfigCompleta } from '../../lib/pdfEmpresa';
import { calcularKmIdaYVuelta } from '../../lib/calcularKmIdaYVuelta';
import { CV_VEHICULO_DEFECTO, insertarGastoKilometricoPendiente } from '../../lib/gastoKilometrico';
import { calcularIndemnizacionKm } from '../finanzas/gastos/baremoKilometrico';
import { formatearTelefonoVisual } from '../clientes/types';
import { fechaVisitaCorta } from '../../lib/fechas';
import type { Visita } from '../visitas/types';

// Pantalla de acciones rápidas para el móvil (2026-09-25, petición de Gabriel): es la que abre la
// app instalada (start_url del manifest) y la que enlazan sus accesos directos (?accion=km|visitas|
// legal). Tres cosas del día a día y nada más: datos legales para copiar, kilometraje desde la
// ubicación actual y visitas pendientes. Todo reutiliza lo que ya existe en el CRM — misma sesión,
// mismas tablas, mismo cálculo de km (calcularKmIdaYVuelta) y mismo gasto "pendiente de revisar"
// que genera el cierre automático de visitas (gastoKilometrico.ts).

type Seccion = 'legal' | 'km' | 'visitas';

const SECCIONES: { id: Seccion; titulo: string; descripcion: string; icon: typeof Car }[] = [
  { id: 'km', titulo: 'Registrar kilometraje', descripcion: 'Usa tu ubicación para calcular los km desde el taller', icon: Car },
  { id: 'visitas', titulo: 'Visitas pendientes', descripcion: 'Hoy y próximas, con mapa y teléfono', icon: Wrench },
  { id: 'legal', titulo: 'Datos legales', descripcion: 'SIRET, SIREN, TVA, IBAN… para copiar', icon: FileText },
];

function esSeccion(valor: string | null): valor is Seccion {
  return valor === 'legal' || valor === 'km' || valor === 'visitas';
}

function hoyLocalIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function urlMaps(direccion: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(direccion)}`;
}

// Distancia en metros entre dos coordenadas (Haversine) — para saber si la ubicación actual es una
// visita de hoy y enlazar el gasto de km a ella. Misma fórmula que el fallback de kilometraje.
function distanciaMetros(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const RADIO_VISITA_METROS = 300;
const CLAVE_CACHE_LEGAL = 'rapido_datos_legales';

type DatosEntidad = {
  razon_social?: string;
  direccion?: string;
  siren?: string;
  identificador?: string;
  identificador_extra?: string;
  iban?: string;
  bic?: string;
  banco?: string;
  nombre_titular?: string;
  telefono?: string;
  email?: string;
  num_attestation?: string;
  seguro?: string;
};

type GoogleGeocodingWindow = {
  google?: {
    maps?: {
      importLibrary: (libreria: string) => Promise<{
        Geocoder: new () => {
          geocode: (peticion: { location: { lat: number; lng: number } }) => Promise<{ results: { formatted_address: string }[] }>;
        };
      }>;
    };
  };
};

async function direccionDesdeCoordenadas(lat: number, lng: number): Promise<string | null> {
  const google = (window as unknown as GoogleGeocodingWindow).google;
  if (!google?.maps?.importLibrary) return null;
  try {
    const { Geocoder } = await google.maps.importLibrary('geocoding');
    const { results } = await new Geocoder().geocode({ location: { lat, lng } });
    return results[0]?.formatted_address ?? null;
  } catch {
    return null;
  }
}

function obtenerUbicacion(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Este dispositivo no permite obtener la ubicación'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) =>
        reject(
          new Error(
            err.code === err.PERMISSION_DENIED
              ? 'Sin permiso de ubicación — actívalo para este sitio en los ajustes del móvil'
              : 'No se pudo obtener la ubicación, inténtalo de nuevo',
          ),
        ),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  });
}

export default function RapidoPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const accion = params.get('accion');
  const seccion: Seccion | null = esSeccion(accion) ? accion : null;
  const irA = (s: Seccion | null) => setParams(s ? { accion: s } : {}, { replace: true });

  // Al entrar aquí se borra la marca de "CRM completo": la próxima vez que se abra "/" en el móvil
  // vuelve a esta pantalla (ver InicioSegunDispositivo en App.tsx).
  useEffect(() => {
    marcarCrmCompletoEnMovil(false);
  }, []);

  const irAlCrmCompleto = () => {
    marcarCrmCompletoEnMovil(true);
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-[#f4f4f2] flex flex-col">
      <header className="bg-brand-dark text-white px-4 py-3 flex items-center gap-3">
        <img src={`${import.meta.env.BASE_URL}icons/icon-192.png`} alt="" className="w-8 h-8 rounded-sm" />
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wide text-white/65">Reformas Ordoñez</p>
          <p className="text-sm font-semibold leading-tight">Acciones rápidas</p>
        </div>
      </header>

      <div className="flex-1 w-full max-w-md mx-auto px-4 py-4 flex flex-col gap-4">
        {seccion === null ? (
          <div className="flex flex-col gap-3">
            {SECCIONES.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => irA(s.id)}
                className="flex items-center gap-4 bg-white border border-gray-200 rounded-sm p-4 text-left hover:bg-brand-light"
              >
                <span className="w-11 h-11 rounded-sm bg-brand-light text-brand flex items-center justify-center shrink-0">
                  <s.icon size={22} />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-gray-900">{s.titulo}</span>
                  <span className="block text-xs text-gray-500">{s.descripcion}</span>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <>
            <button type="button" onClick={() => irA(null)} className="flex items-center gap-1 text-sm text-gray-600 self-start">
              <ChevronLeft size={16} />
              Acciones rápidas
            </button>
            {seccion === 'legal' && <SeccionLegal />}
            {seccion === 'km' && <SeccionKilometraje />}
            {seccion === 'visitas' && <SeccionVisitas onRegistrarKm={() => irA('km')} />}
          </>
        )}
      </div>

      <footer className="w-full max-w-md mx-auto px-4 pb-6 pt-2">
        <button
          type="button"
          onClick={irAlCrmCompleto}
          className="w-full bg-white border border-gray-200 text-gray-700 px-3 py-2.5 rounded-sm text-sm flex items-center justify-center gap-2"
        >
          <LayoutDashboard size={16} />
          Ir al CRM completo
        </button>
      </footer>
    </div>
  );
}

// ---- Datos legales -----------------------------------------------------------------------------

function SeccionLegal() {
  const { data: config, isError } = useQuery({ queryKey: ['empresa_config', 'completa'], queryFn: cargarConfigCompleta });

  // Copia local para poder consultarlos sin cobertura (la app instalada cachea la pantalla, pero
  // no la respuesta de Supabase). Solo son datos públicos de la empresa, nada de clientes.
  const datos = useMemo(() => {
    const d = (config?.datos ?? null) as { fr?: DatosEntidad; es?: DatosEntidad } | null;
    if (d) {
      try {
        localStorage.setItem(CLAVE_CACHE_LEGAL, JSON.stringify({ fr: d.fr, es: d.es }));
      } catch {
        // sin almacenamiento disponible — se sigue mostrando lo que llegó de Supabase
      }
      return d;
    }
    try {
      const guardado = localStorage.getItem(CLAVE_CACHE_LEGAL);
      return guardado ? (JSON.parse(guardado) as { fr?: DatosEntidad; es?: DatosEntidad }) : null;
    } catch {
      return null;
    }
  }, [config]);

  if (!datos) {
    return <p className="text-sm text-gray-500">{isError ? 'Sin conexión y sin copia guardada de los datos.' : 'Cargando…'}</p>;
  }

  const fr = datos.fr ?? {};
  const es = datos.es ?? {};
  return (
    <div className="flex flex-col gap-4">
      <BloqueDatos
        titulo="Francia · EURL"
        filas={[
          ['Razón social', fr.razon_social],
          ['SIREN', fr.siren],
          ['SIRET', fr.identificador],
          ['TVA intracomunitaria', fr.identificador_extra],
          ['Dirección', fr.direccion],
          ['Teléfono', fr.telefono],
          ['Email', fr.email],
          ['IBAN', fr.iban],
          ['BIC', fr.bic],
          ['Banco', fr.banco],
          ['Titular', fr.nombre_titular],
          ['Seguro', [fr.seguro, fr.num_attestation].filter(Boolean).join(' · ')],
        ]}
      />
      <BloqueDatos
        titulo="España"
        filas={[
          ['Razón social', es.razon_social],
          ['NIF', es.identificador],
          ['Dirección', es.direccion],
          ['Teléfono', es.telefono],
          ['Email', es.email],
          ['IBAN', es.iban],
          ['Banco', es.banco],
          ['Titular', es.nombre_titular],
        ]}
      />
    </div>
  );
}

function BloqueDatos({ titulo, filas }: { titulo: string; filas: [string, string | undefined][] }) {
  const visibles = filas.filter(([, v]) => !!v && v.trim() !== '');
  if (visibles.length === 0) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-sm">
      <p className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-brand border-b border-gray-200">{titulo}</p>
      <div className="divide-y divide-gray-100">
        {visibles.map(([etiqueta, valor]) => (
          <FilaCopiable key={etiqueta} etiqueta={etiqueta} valor={valor!} />
        ))}
      </div>
    </div>
  );
}

function FilaCopiable({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  const toast = useToast();
  const [copiado, setCopiado] = useState(false);
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(valor);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch {
      toast.error('No se pudo copiar');
    }
  };
  return (
    <button type="button" onClick={copiar} className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-brand-light">
      <span className="min-w-0 flex-1">
        <span className="block text-xs uppercase tracking-wide text-gray-400">{etiqueta}</span>
        <span className="block text-sm text-gray-900 break-words">{valor}</span>
      </span>
      <span className="text-gray-400 shrink-0">{copiado ? <Check size={16} className="text-brand" /> : <Copy size={16} />}</span>
    </button>
  );
}

// ---- Visitas pendientes ------------------------------------------------------------------------

function useVisitasPendientes() {
  const hoy = hoyLocalIso();
  return useQuery({
    queryKey: ['visitas', 'rapido-pendientes', hoy],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('visitas')
        .select('*')
        .is('eliminado_en', null)
        .eq('estado', 'Pendiente')
        .gte('fecha_visita', hoy)
        .order('fecha_visita')
        .order('hora_visita');
      if (error) throw error;
      return data as Visita[];
    },
  });
}

function SeccionVisitas({ onRegistrarKm }: { onRegistrarKm: () => void }) {
  const { data: visitas, isLoading, isError, error } = useVisitasPendientes();
  const hoy = hoyLocalIso();
  const deHoy = (visitas ?? []).filter((v) => v.fecha_visita === hoy);
  const proximas = (visitas ?? []).filter((v) => v.fecha_visita !== hoy);

  if (isLoading) return <p className="text-sm text-gray-500">Cargando…</p>;
  if (isError) return <p className="text-sm text-red-600">{error instanceof Error ? error.message : 'No se pudieron cargar las visitas'}</p>;

  return (
    <div className="flex flex-col gap-4">
      <ListaVisitas titulo="Hoy" visitas={deHoy} vacio="Sin visitas hoy" onRegistrarKm={onRegistrarKm} />
      <ListaVisitas titulo="Próximas" visitas={proximas} vacio="Sin visitas programadas" />
    </div>
  );
}

function ListaVisitas({
  titulo,
  visitas,
  vacio,
  onRegistrarKm,
}: {
  titulo: string;
  visitas: Visita[];
  vacio: string;
  onRegistrarKm?: () => void;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-sm">
      <p className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-brand border-b border-gray-200">{titulo}</p>
      {visitas.length === 0 && <p className="px-4 py-3 text-sm text-gray-500">{vacio}</p>}
      <div className="divide-y divide-gray-100">
        {visitas.map((v) => {
          const direccion = [v.direccion, v.direccion_extra].filter(Boolean).join(' — ');
          return (
            <div key={v.id} className="px-4 py-3 flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-semibold text-gray-900">
                  {v.nombre} {v.apellidos}
                </p>
                <p className="text-xs text-gray-600 shrink-0">
                  {fechaVisitaCorta(v.fecha_visita)} · {(v.hora_visita ?? '').slice(0, 5)}
                </p>
              </div>
              {v.tipo && <p className="text-xs text-gray-500">{v.tipo}</p>}
              {direccion && (
                <a href={urlMaps(direccion)} target="_blank" rel="noreferrer" className="flex items-start gap-1.5 text-xs text-gray-700">
                  <MapPin size={14} className="shrink-0 mt-0.5 text-brand" />
                  <span className="underline">{direccion}</span>
                  <ExternalLink size={12} className="shrink-0 mt-0.5 text-gray-400" />
                </a>
              )}
              {v.telefono && (
                <a href={`tel:${v.telefono.replace(/[^\d+]/g, '')}`} className="flex items-center gap-1.5 text-xs text-gray-700">
                  <Phone size={14} className="shrink-0 text-brand" />
                  <span className="underline">{formatearTelefonoVisual(v.telefono)}</span>
                </a>
              )}
              <div className="flex gap-2 mt-1">
                <Link to={`/visitas/${v.id}`} className="bg-white border border-gray-200 text-gray-700 px-3 py-1.5 rounded-sm text-xs">
                  Ver ficha
                </Link>
                {onRegistrarKm && (
                  <button type="button" onClick={onRegistrarKm} className="bg-brand text-white px-3 py-1.5 rounded-sm text-xs">
                    Registrar km
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---- Kilometraje desde la ubicación actual -----------------------------------------------------

type Propuesta = {
  lat: number;
  lng: number;
  direccion: string;
  km: number | null;
  visita: Visita | null;
};

function SeccionKilometraje() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data: visitas } = useVisitasPendientes();
  const [buscando, setBuscando] = useState(false);
  const [propuesta, setPropuesta] = useState<Propuesta | null>(null);
  const [kmTexto, setKmTexto] = useState('');
  const hoy = hoyLocalIso();

  useEffect(() => {
    setKmTexto(propuesta?.km != null ? String(propuesta.km) : '');
  }, [propuesta]);

  const localizar = async () => {
    setBuscando(true);
    try {
      const { lat, lng } = await obtenerUbicacion();
      const [direccion, km] = await Promise.all([direccionDesdeCoordenadas(lat, lng), calcularKmIdaYVuelta({ lat, lng })]);
      const visita =
        (visitas ?? []).find(
          (v) => v.fecha_visita === hoy && v.lat != null && v.lng != null && distanciaMetros({ lat, lng }, { lat: v.lat, lng: v.lng }) <= RADIO_VISITA_METROS,
        ) ?? null;
      setPropuesta({ lat, lng, direccion: direccion ?? `${lat.toFixed(5)}, ${lng.toFixed(5)}`, km, visita });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo obtener la ubicación');
    } finally {
      setBuscando(false);
    }
  };

  const guardarMutation = useMutation({
    mutationFn: async () => {
      if (!propuesta) throw new Error('Primero obtén la ubicación');
      const km = kmTexto.trim() === '' ? null : Number(kmTexto);
      if (km != null && (!Number.isFinite(km) || km <= 0)) throw new Error('Los km tienen que ser un número mayor que 0');
      if (propuesta.visita) {
        const { data: existente, error } = await supabase.from('gastos').select('id').eq('visita_id', propuesta.visita.id).limit(1);
        if (error) throw error;
        if (existente && existente.length > 0) throw new Error('Esta visita ya tiene un gasto de kilometraje registrado');
      }
      await insertarGastoKilometricoPendiente({
        fecha: hoy,
        etiqueta: propuesta.visita ? `visita ${propuesta.visita.nombre} ${propuesta.visita.apellidos}` : propuesta.direccion,
        km,
        visitaId: propuesta.visita?.id ?? null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gastos'] });
      toast.success('Kilometraje registrado — queda pendiente de revisar en Gastos');
      setPropuesta(null);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'No se pudo registrar el gasto'),
  });

  const kmNumero = kmTexto.trim() === '' ? null : Number(kmTexto);
  const importe = kmNumero != null && Number.isFinite(kmNumero) ? calcularIndemnizacionKm(kmNumero, CV_VEHICULO_DEFECTO) : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-white border border-gray-200 rounded-sm p-4 flex flex-col gap-3">
        <p className="text-sm text-gray-700">
          Calcula los km de ida y vuelta desde el taller (4 Avenue des Allées, Hendaye) hasta donde estás ahora y registra el gasto.
        </p>
        <button
          type="button"
          onClick={localizar}
          disabled={buscando}
          className="bg-brand text-white px-3 py-2.5 rounded-sm text-sm flex items-center justify-center gap-2 disabled:opacity-60"
        >
          <MapPin size={16} />
          {buscando ? 'Localizando…' : propuesta ? 'Volver a localizar' : 'Usar mi ubicación'}
        </button>
      </div>

      {propuesta && (
        <div className="bg-white border border-gray-200 rounded-sm p-4 flex flex-col gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-400">Estás en</p>
            <p className="text-sm text-gray-900">{propuesta.direccion}</p>
          </div>
          {propuesta.visita ? (
            <div className="bg-brand-light rounded-sm px-3 py-2 text-xs text-gray-800">
              Coincide con la visita de hoy de <span className="font-semibold">{propuesta.visita.nombre} {propuesta.visita.apellidos}</span> — el
              gasto quedará enlazado a ella.
            </div>
          ) : (
            <p className="text-xs text-gray-500">No coincide con ninguna visita de hoy: se registra como desplazamiento a esta dirección.</p>
          )}
          <label className="block">
            <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Km ida y vuelta</span>
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              min="0"
              value={kmTexto}
              onChange={(e) => setKmTexto(e.target.value)}
              placeholder={propuesta.km == null ? 'Sin ruta calculada — escríbelos a mano' : ''}
              className="w-full border border-gray-200 rounded-sm px-3 py-2 text-sm focus:border-brand focus:outline-none"
            />
          </label>
          <p className="text-xs text-gray-500">
            {importe != null
              ? `Barème ${CV_VEHICULO_DEFECTO} CV: ${importe.toFixed(2)} € — se guarda pendiente de revisar en Gastos, sin asiento contable hasta confirmarlo.`
              : 'Puedes guardarlo sin km y completarlos después desde Gastos.'}
          </p>
          <button
            type="button"
            onClick={() => guardarMutation.mutate()}
            disabled={guardarMutation.isPending}
            className="bg-brand text-white px-3 py-2.5 rounded-sm text-sm disabled:opacity-60"
          >
            {guardarMutation.isPending ? 'Guardando…' : 'Registrar gasto de kilometraje'}
          </button>
        </div>
      )}
    </div>
  );
}
