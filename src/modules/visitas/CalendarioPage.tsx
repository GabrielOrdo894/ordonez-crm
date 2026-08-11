import { useMemo, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { MapPin } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Badge, estadoToVariant } from '../../components/ui/Badge';
import { CalendarioMini } from './CalendarioMini';
import { fechaVisitaCorta } from '../../lib/fechas';
import type { Visita } from './types';
import type { VisitaModalContext } from '../../components/layout/AppLayout';

function bandera(pais: string | null) {
  if (pais === 'España') return '🇪🇸';
  if (pais === 'Francia') return '🇫🇷';
  return '';
}

function urlGoogleMaps(v: Visita) {
  if (v.lat != null && v.lng != null) return `https://www.google.com/maps/search/?api=1&query=${v.lat},${v.lng}`;
  if (v.direccion) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(v.direccion)}`;
  return null;
}

export default function CalendarioPage() {
  const { abrirEditarVisita } = useOutletContext<VisitaModalContext>();
  const navigate = useNavigate();
  const [diaSeleccionado, setDiaSeleccionado] = useState<string | null>(null);

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

  const visitasMostradas = useMemo(() => {
    if (!visitas) return [];
    if (diaSeleccionado) {
      return visitas
        .filter((v) => v.fecha_visita === diaSeleccionado)
        .sort((a, b) => (a.hora_visita ?? '').localeCompare(b.hora_visita ?? ''));
    }
    return visitas
      .filter((v) => v.fecha_visita && v.fecha_visita >= hoyISO && v.estado !== 'Cancelada')
      .sort((a, b) => (a.fecha_visita ?? '').localeCompare(b.fecha_visita ?? '') || (a.hora_visita ?? '').localeCompare(b.hora_visita ?? ''));
  }, [visitas, diaSeleccionado, hoyISO]);

  if (isLoading) {
    return <div className="h-96 bg-surface border border-gray-200 rounded-sm animate-pulse" />;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4 items-start">
      <CalendarioMini
        visitas={visitas ?? []}
        onVer={() => {}}
        onEditar={abrirEditarVisita}
        ocultarPanelInferior
        onSeleccionarDia={setDiaSeleccionado}
      />

      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 border-b border-gray-200 pb-2 mb-3">
          {diaSeleccionado ? `Visitas — ${fechaVisitaCorta(diaSeleccionado)}` : 'Próximas visitas'}
        </p>

        {visitasMostradas.length === 0 && <p className="text-sm text-gray-400">Sin visitas</p>}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {visitasMostradas.map((v) => {
            const urlMaps = urlGoogleMaps(v);
            return (
              <div
                key={v.id}
                onClick={() => navigate(`/visitas/${v.id}`)}
                className="bg-surface border border-gray-200 rounded-sm p-3 cursor-pointer hover:border-brand flex flex-col gap-2"
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-gray-900">
                    {v.fecha_visita && fechaVisitaCorta(v.fecha_visita)} · {v.hora_visita?.slice(0, 5)}
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

                {v.descripcion && <p className="text-xs text-gray-600 line-clamp-2">{v.descripcion}</p>}

                <p className="text-xs text-gray-400">
                  {v.tipo} · {v.zona} {bandera(v.pais)}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
