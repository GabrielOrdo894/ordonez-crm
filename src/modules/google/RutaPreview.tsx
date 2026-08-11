import { useEffect, useState } from 'react';
import { Clock, Navigation } from 'lucide-react';

const ORIGEN_TALLER = '4 Avenue des Allées, 64700 Hendaye, France';
const GMAPS_KEY = import.meta.env.VITE_GMAPS_API_KEY;

type RutaPreviewProps = {
  direccion: string;
  lat: number | null;
  lng: number | null;
};

type Estado = 'cargando' | 'ok' | 'error';

// Tipos mínimos de la Distance Matrix API que usamos aquí.
type DistanceMatrixElement = {
  status: string;
  duration?: { text: string };
  distance?: { text: string };
};

type DistanceMatrixResponse = {
  rows?: Array<{ elements?: DistanceMatrixElement[] }>;
};

type DistanceMatrixService = {
  getDistanceMatrix: (
    peticion: {
      origins: string[];
      destinations: Array<string | { lat: number; lng: number }>;
      travelMode: string;
    },
    callback: (respuesta: DistanceMatrixResponse | null, status: string) => void,
  ) => void;
};

type GoogleRoutesWindow = {
  google?: {
    maps?: {
      importLibrary: (
        libreria: string,
      ) => Promise<{ DistanceMatrixService: new () => DistanceMatrixService }>;
      TravelMode: { DRIVING: string };
    };
  };
};

export function RutaPreview({ direccion, lat, lng }: RutaPreviewProps) {
  const [estado, setEstado] = useState<Estado>('cargando');
  const [duracion, setDuracion] = useState<string | null>(null);
  const [distancia, setDistancia] = useState<string | null>(null);

  const tieneCoordenadas = lat != null && lng != null;
  const destinoTexto = tieneCoordenadas ? `${lat},${lng}` : direccion;

  useEffect(() => {
    let cancelado = false;
    setEstado('cargando');
    setDuracion(null);
    setDistancia(null);

    async function calcular() {
      const google = (window as unknown as GoogleRoutesWindow).google;
      if (!google?.maps?.importLibrary) {
        console.error('RutaPreview: Google Maps JS no está cargado (revisa VITE_GMAPS_API_KEY).');
        if (!cancelado) setEstado('error');
        return;
      }
      try {
        const { DistanceMatrixService } = await google.maps.importLibrary('routes');
        const servicio = new DistanceMatrixService();
        // Coordenadas como literal {lat,lng} — pasar "lat,lng" como string puede fallar
        // el geocodificado inverso de la API para algunas direcciones.
        const destino = tieneCoordenadas ? { lat: lat as number, lng: lng as number } : direccion;
        servicio.getDistanceMatrix(
          {
            origins: [ORIGEN_TALLER],
            destinations: [destino],
            travelMode: google.maps.TravelMode.DRIVING,
          },
          (respuesta, status) => {
            if (cancelado) return;
            const elemento = respuesta?.rows?.[0]?.elements?.[0];
            if (status !== 'OK' || !elemento || elemento.status !== 'OK') {
              console.error('RutaPreview: Distance Matrix no devolvió resultado', { status, elemento });
              setEstado('error');
              return;
            }
            setDuracion(elemento.duration?.text ?? null);
            setDistancia(elemento.distance?.text ?? null);
            setEstado('ok');
          },
        );
      } catch (err) {
        console.error('RutaPreview: error calculando la ruta', err);
        if (!cancelado) setEstado('error');
      }
    }

    calcular();
    return () => {
      cancelado = true;
    };
  }, [destinoTexto, tieneCoordenadas, direccion, lat, lng]);

  if (!direccion) return null;

  return (
    <div className="border border-gray-200 rounded-sm overflow-hidden">
      <div className="px-3 py-2.5 bg-brand-light flex items-center gap-2.5">
        <span className="w-8 h-8 rounded-sm bg-surface flex items-center justify-center shrink-0 text-brand">
          <Navigation size={15} />
        </span>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Desde el taller (Hendaye)</p>
          {estado === 'ok' && duracion && (
            <p className="text-base font-bold text-brand flex items-center gap-1.5">
              <Clock size={15} className="shrink-0" />
              {duracion}
              {distancia && <span className="text-sm font-medium text-gray-500">· {distancia}</span>}
            </p>
          )}
          {estado === 'cargando' && <p className="text-sm text-gray-400">Calculando tiempo de llegada...</p>}
          {estado === 'error' && <p className="text-sm text-gray-400">Tiempo de llegada no disponible</p>}
        </div>
      </div>
      {GMAPS_KEY && (
        <iframe
          title="Vista de la calle hacia la dirección"
          width="100%"
          height="220"
          style={{ border: 0, display: 'block' }}
          loading="lazy"
          src={`https://www.google.com/maps/embed/v1/streetview?key=${GMAPS_KEY}&location=${encodeURIComponent(destinoTexto)}`}
        />
      )}
    </div>
  );
}
