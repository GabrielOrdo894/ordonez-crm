// Mismo origen fijo que ya usa RutaPreview.tsx para "tiempo desde el taller" — el domicilio/siège
// social de Reformas Ordoñez, punto de partida real de cualquier visita técnica.
export const ORIGEN_TALLER = '4 Avenue des Allées, 64700 Hendaye, France';

// Tipos mínimos de la Distance Matrix API que ya usa RutaPreview.tsx — se repiten aquí porque esa
// API no expone `distance.value` (metros) a través de los tipos usados allí, que solo leen `.text`.
type DistanceMatrixElement = {
  status: string;
  distance?: { value: number };
};

type DistanceMatrixResponse = {
  rows?: Array<{ elements?: DistanceMatrixElement[] }>;
};

type DistanceMatrixService = {
  getDistanceMatrix: (
    peticion: { origins: string[]; destinations: Array<string | { lat: number; lng: number }>; travelMode: string },
    callback: (respuesta: DistanceMatrixResponse | null, status: string) => void,
  ) => void;
};

type GoogleRoutesWindow = {
  google?: {
    maps?: {
      importLibrary: (libreria: string) => Promise<{ DistanceMatrixService: new () => DistanceMatrixService }>;
      TravelMode: { DRIVING: string };
    };
  };
};

/** Km ida y vuelta en coche por carretera desde el taller (Hendaye) hasta `destino`, redondeado a 1
 * decimal — para precargar el campo "Kilómetros recorridos" de la indemnité kilométrique en Gastos.
 * Devuelve null si Google Maps no está disponible (sin VITE_GMAPS_API_KEY) o la ruta no se pudo
 * calcular — en ese caso el km se sigue pudiendo escribir a mano, este cálculo es solo una ayuda. */
export async function calcularKmIdaYVuelta(destino: string | { lat: number; lng: number }): Promise<number | null> {
  const google = (window as unknown as GoogleRoutesWindow).google;
  if (!google?.maps?.importLibrary) return null;
  try {
    const { DistanceMatrixService } = await google.maps.importLibrary('routes');
    const servicio = new DistanceMatrixService();
    return await new Promise((resolve) => {
      servicio.getDistanceMatrix(
        { origins: [ORIGEN_TALLER], destinations: [destino], travelMode: google.maps!.TravelMode.DRIVING },
        (respuesta, status) => {
          const elemento = respuesta?.rows?.[0]?.elements?.[0];
          if (status !== 'OK' || !elemento || elemento.status !== 'OK' || !elemento.distance) {
            resolve(null);
            return;
          }
          const kmIda = elemento.distance.value / 1000;
          resolve(Math.round(kmIda * 2 * 10) / 10);
        },
      );
    });
  } catch {
    return null;
  }
}
