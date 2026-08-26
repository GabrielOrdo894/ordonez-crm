import { useMemo, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { MapPin, Plus, Route } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Button } from '../../components/ui/Button';
import { Badge, estadoToVariant } from '../../components/ui/Badge';
import { CalendarioMini } from './CalendarioMini';
import { VistaSemanal } from './VistaSemanal';
import { fechaVisitaCorta } from '../../lib/fechas';
import { useEcheances } from '../fiscalidad/useEcheances';
import { ordenarPorProximidad, urlRutaGoogleMaps } from '../../lib/rutaDelDia';
import type { Visita } from './types';
import type { VisitaModalContext } from '../../components/layout/AppLayout';

function bandera(pais: string | null) {
  if (pais === 'España') return '🇪🇸';
  if (pais === 'Francia') return '🇫🇷';
  return '';
}

function urlGoogleMaps(v: Visita) {
  if (v.lat != null && v.lng != null)
    return `https://www.google.com/maps/search/?api=1&query=${v.lat},${v.lng}`;
  if (v.direccion)
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(v.direccion)}`;
  return null;
}

export default function CalendarioPage() {
  const { abrirEditarVisita, abrirNuevaVisita } = useOutletContext<VisitaModalContext>();
  const navigate = useNavigate();
  const [diaSeleccionado, setDiaSeleccionado] = useState<string | null>(null);
  // Vista semanal tipo agenda — la rejilla mensual no permite ver huecos libres en un día concreto
  // ni detectar visitas muy juntas en hora, algo necesario para repartir visitas entre 2-3 personas
  // (mejora real, auditoría de Calendario 2026-08-18).
  const [vista, setVista] = useState<'mes' | 'semana'>('mes');
  const { echeances } = useEcheances();

  // Mismas échéances fiscales que combina InicioPage.tsx en su minicalendario — antes esta página
  // (destino del enlace "Ver el resto en el calendario →" de Inicio) mostraba MENOS información
  // que el origen, sin ningún evento fiscal (mejora real, auditoría de Calendario 2026-08-18).
  const eventosCalendario = useMemo(
    () =>
      echeances
        .filter((e) => !e.completada)
        .map((e) => ({ fecha: e.fecha_limite, titulo: e.titulo })),
    [echeances],
  );

  const { data: visitas, isLoading } = useQuery({
    queryKey: ['visitas'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('visitas')
        .select('*')
        .is('eliminado_en', null)
        .order('fecha_visita', { ascending: true });
      if (error) throw error;
      return data as Visita[];
    },
  });

  const hoyISO = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  // "Ruta del día": con 2+ visitas activas el mismo día, se reordenan por proximidad geográfica
  // desde el taller (heurística del vecino más cercano) en vez de por hora, y se ofrece un enlace
  // a Google Maps con todas las paradas como waypoints optimizados — antes no había ninguna ayuda
  // para planificar el orden de varias visitas el mismo día (mejora real, auditoría de Visitas
  // 2026-08-18). Las canceladas se muestran aparte, sin numerar, al final.
  const { visitasMostradas, rutaActiva, urlRuta } = useMemo(() => {
    if (!visitas)
      return {
        visitasMostradas: [] as Visita[],
        rutaActiva: false,
        urlRuta: null as string | null,
      };
    if (diaSeleccionado) {
      const delDia = visitas.filter((v) => v.fecha_visita === diaSeleccionado);
      const activas = delDia.filter((v) => v.estado !== 'Cancelada');
      const canceladas = delDia.filter((v) => v.estado === 'Cancelada');
      const esRuta = activas.length >= 2;
      const ordenadas = esRuta
        ? ordenarPorProximidad(activas)
        : activas.sort((a, b) => (a.hora_visita ?? '').localeCompare(b.hora_visita ?? ''));
      return {
        visitasMostradas: [...ordenadas, ...canceladas],
        rutaActiva: esRuta,
        urlRuta: esRuta ? urlRutaGoogleMaps(activas) : null,
      };
    }
    return {
      visitasMostradas: visitas
        .filter((v) => v.fecha_visita && v.fecha_visita >= hoyISO && v.estado !== 'Cancelada')
        .sort(
          (a, b) =>
            (a.fecha_visita ?? '').localeCompare(b.fecha_visita ?? '') ||
            (a.hora_visita ?? '').localeCompare(b.hora_visita ?? ''),
        ),
      rutaActiva: false,
      urlRuta: null,
    };
  }, [visitas, diaSeleccionado, hoyISO]);

  if (isLoading) {
    return <div className="h-96 bg-surface border border-gray-200 rounded-sm animate-pulse" />;
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Button
          size="sm"
          variant={vista === 'mes' ? 'primary' : 'secondary'}
          onClick={() => setVista('mes')}
        >
          Mes
        </Button>
        <Button
          size="sm"
          variant={vista === 'semana' ? 'primary' : 'secondary'}
          onClick={() => setVista('semana')}
        >
          Semana
        </Button>
      </div>

      {vista === 'semana' ? (
        <VistaSemanal visitas={visitas ?? []} onVer={(v) => navigate(`/visitas/${v.id}`)} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4 items-start">
          <CalendarioMini
            visitas={visitas ?? []}
            onVer={() => {}}
            onEditar={abrirEditarVisita}
            ocultarPanelInferior
            onSeleccionarDia={setDiaSeleccionado}
            eventosExtra={eventosCalendario}
          />

          <div>
            <div className="flex items-center justify-between border-b border-gray-200 pb-2 mb-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                {diaSeleccionado
                  ? `Visitas — ${fechaVisitaCorta(diaSeleccionado)}`
                  : 'Próximas visitas'}
              </p>
              <div className="flex items-center gap-2">
                {urlRuta && (
                  <a href={urlRuta} target="_blank" rel="noopener noreferrer">
                    <Button size="sm" variant="secondary">
                      <span className="flex items-center gap-1">
                        <Route size={14} />
                        Ver ruta del día
                      </span>
                    </Button>
                  </a>
                )}
                <Button
                  size="sm"
                  onClick={() =>
                    abrirNuevaVisita(diaSeleccionado ? { fecha: diaSeleccionado } : undefined)
                  }
                >
                  <span className="flex items-center gap-1">
                    <Plus size={14} />
                    Nueva visita
                  </span>
                </Button>
              </div>
            </div>

            {rutaActiva && (
              <p className="text-xs text-gray-400 mb-3">
                Orden sugerido por proximidad al taller — "Ver ruta del día" abre Google Maps con el
                orden realmente óptimo.
              </p>
            )}

            {visitasMostradas.length === 0 && <p className="text-sm text-gray-400">Sin visitas</p>}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {visitasMostradas.map((v, i) => {
                const urlMaps = urlGoogleMaps(v);
                const numeroRuta = rutaActiva && v.estado !== 'Cancelada' ? i + 1 : null;
                return (
                  <div
                    key={v.id}
                    onClick={() => navigate(`/visitas/${v.id}`)}
                    className="bg-surface border border-gray-200 rounded-sm p-3 cursor-pointer hover:border-brand flex flex-col gap-2"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                        {numeroRuta && (
                          <span className="w-4 h-4 rounded-full bg-brand text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                            {numeroRuta}
                          </span>
                        )}
                        {v.fecha_visita && fechaVisitaCorta(v.fecha_visita)} ·{' '}
                        {v.hora_visita?.slice(0, 5)}
                      </p>
                      <Badge variant={estadoToVariant(v.estado)}>{v.estado}</Badge>
                    </div>

                    <p className="text-sm text-gray-700">
                      {v.nombre} {v.apellidos}
                    </p>

                    {urlMaps && v.direccion && (
                      <a
                        href={urlMaps}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-start gap-1 text-xs font-medium text-brand hover:underline"
                      >
                        <MapPin size={13} className="shrink-0 mt-0.5" />
                        <span>{v.direccion}</span>
                      </a>
                    )}

                    {v.descripcion && (
                      <p className="text-xs text-gray-600 line-clamp-2">{v.descripcion}</p>
                    )}

                    <p className="text-xs text-gray-400">
                      {v.tipo} · {v.zona} {bandera(v.pais)}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
