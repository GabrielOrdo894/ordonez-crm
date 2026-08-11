import { Calendar, MapPin } from 'lucide-react';
import { Badge, estadoToVariant } from '../../components/ui/Badge';
import { RutaPreview } from '../google/RutaPreview';
import { fechaVisitaLarga } from '../../lib/fechas';
import type { Visita } from './types';

export function urlGoogleMaps(v: Visita) {
  if (v.lat != null && v.lng != null) return `https://www.google.com/maps/search/?api=1&query=${v.lat},${v.lng}`;
  if (v.direccion) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(v.direccion)}`;
  return null;
}

export function VisitaDetalleContenido({ visita }: { visita: Visita }) {
  const urlMaps = urlGoogleMaps(visita);

  return (
    <div className="flex flex-col gap-4 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <span className="w-9 h-9 rounded-sm bg-brand-light flex items-center justify-center shrink-0 text-brand">
            <Calendar size={17} />
          </span>
          <div className="min-w-0">
            <p className="text-base font-bold text-gray-900 capitalize">
              {fechaVisitaLarga(visita.fecha_visita, visita.hora_visita)}
            </p>
            {urlMaps && visita.direccion ? (
              <a
                href={urlMaps}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-1 text-sm text-brand hover:underline mt-0.5"
              >
                <MapPin size={13} className="shrink-0 mt-0.5" />
                <span>{visita.direccion}</span>
              </a>
            ) : (
              visita.direccion && <p className="text-sm text-gray-600 mt-0.5">{visita.direccion}</p>
            )}
            {visita.direccion_extra && <p className="text-xs text-gray-500 mt-0.5 ml-[21px]">{visita.direccion_extra}</p>}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Badge variant={estadoToVariant(visita.estado)}>{visita.estado}</Badge>
          <Badge variant="default">{visita.estado_pipeline}</Badge>
        </div>
      </div>

      {visita.direccion && <RutaPreview direccion={visita.direccion} lat={visita.lat} lng={visita.lng} />}

      <div className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <p className="text-gray-400 uppercase tracking-wide">Teléfono</p>
          <p className="text-gray-800">{visita.telefono}</p>
        </div>
        <div>
          <p className="text-gray-400 uppercase tracking-wide">Email</p>
          <p className="text-gray-800">{visita.email || '—'}</p>
        </div>
        <div>
          <p className="text-gray-400 uppercase tracking-wide">Idioma</p>
          <p className="text-gray-800">{visita.idioma || '—'}</p>
        </div>
        <div>
          <p className="text-gray-400 uppercase tracking-wide">Origen del contacto</p>
          <p className="text-gray-800">{visita.contacto || '—'}</p>
        </div>
        <div>
          <p className="text-gray-400 uppercase tracking-wide">Tipo de reforma</p>
          <p className="text-gray-800">{visita.tipo || '—'}</p>
        </div>
        <div>
          <p className="text-gray-400 uppercase tracking-wide">Empleado</p>
          <p className="text-gray-800">{visita.empleado || '—'}</p>
        </div>
        {visita.es_empresa && (
          <>
            <div>
              <p className="text-gray-400 uppercase tracking-wide">Empresa</p>
              <p className="text-gray-800">{visita.empresa_nombre || '—'}</p>
            </div>
            <div>
              <p className="text-gray-400 uppercase tracking-wide">CIF</p>
              <p className="text-gray-800">{visita.empresa_cif || '—'}</p>
            </div>
          </>
        )}
      </div>

      {visita.descripcion && (
        <div>
          <p className="text-gray-400 uppercase tracking-wide text-xs mb-1">Descripción</p>
          <p className="text-gray-700">{visita.descripcion}</p>
        </div>
      )}

      {visita.notas && (
        <div>
          <p className="text-gray-400 uppercase tracking-wide text-xs mb-1">Notas</p>
          <p className="text-gray-700">{visita.notas}</p>
        </div>
      )}
    </div>
  );
}
