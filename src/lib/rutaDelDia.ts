import { ORIGEN_TALLER } from './calcularKmIdaYVuelta';

// Mismas coordenadas del taller de Hendaye que ya usan las Edge Functions
// (notificar-visita/automatizaciones-crm, OFICINA_FR) — aquí solo para ordenar por proximidad,
// el texto de ORIGEN_TALLER es lo que se manda de verdad a la URL de Google Maps.
const ORIGEN_COORDS = { lat: 43.3546525, lng: -1.7747975 };

type VisitaConCoords = { id: string; lat: number | null; lng: number | null; direccion: string | null };

function distanciaHaversine(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

// Heurística del vecino más cercano desde el taller — no es la ruta óptima real (eso lo calcula
// Google al abrir el enlace con waypoints optimizados), solo un orden razonable para mostrar en
// la lista sin tener que llamar a ninguna API. Las visitas sin coordenadas van al final, en el
// orden en que ya estuvieran (no se puede estimar su distancia).
export function ordenarPorProximidad<T extends VisitaConCoords>(visitas: T[]): T[] {
  const conCoords = visitas.filter((v) => v.lat != null && v.lng != null);
  const sinCoords = visitas.filter((v) => v.lat == null || v.lng == null);

  const restantes = [...conCoords];
  const ordenadas: T[] = [];
  let actual = ORIGEN_COORDS;
  while (restantes.length > 0) {
    let mejorIdx = 0;
    let mejorDist = Infinity;
    for (let i = 0; i < restantes.length; i++) {
      const d = distanciaHaversine(actual, { lat: restantes[i].lat!, lng: restantes[i].lng! });
      if (d < mejorDist) {
        mejorDist = d;
        mejorIdx = i;
      }
    }
    const [siguiente] = restantes.splice(mejorIdx, 1);
    ordenadas.push(siguiente);
    actual = { lat: siguiente.lat!, lng: siguiente.lng! };
  }
  return [...ordenadas, ...sinCoords];
}

// URL de Google Maps con todas las paradas del día como waypoints y optimize:true — es Google
// quien calcula la ruta realmente óptima al abrirla, esto solo evita tener que ir pegando
// direcciones una a una. Ida y vuelta desde/hacia el taller, igual que hace un día de visitas real.
export function urlRutaGoogleMaps(visitas: VisitaConCoords[]): string | null {
  const paradas = visitas
    .map((v) => (v.lat != null && v.lng != null ? `${v.lat},${v.lng}` : v.direccion))
    .filter((p): p is string => !!p);
  if (paradas.length === 0) return null;

  const params = new URLSearchParams({
    api: '1',
    origin: ORIGEN_TALLER,
    destination: ORIGEN_TALLER,
    travelmode: 'driving',
    waypoints: `optimize:true|${paradas.join('|')}`,
  });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
