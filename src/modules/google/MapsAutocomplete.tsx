import { useEffect, useRef, useState } from 'react';
import { Input } from '../../components/ui/Input';
import { useTema } from '../../hooks/useTema';

export type LugarSeleccionado = {
  direccion: string;
  lat: number | null;
  lng: number | null;
  pais: string;
};

type MapsAutocompleteProps = {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  onSelect: (lugar: LugarSeleccionado) => void;
  error?: string;
};

// Tipos mínimos de la Places API (Extended Component Library) que usamos aquí —
// @types/google.maps no cubre todavía PlaceAutocompleteElement de forma estable.
type PlaceResult = {
  fetchFields: (opciones: { fields: string[] }) => Promise<void>;
  formattedAddress?: string;
  addressComponents?: Array<{ types: string[]; shortText: string }>;
  location?: { lat: () => number; lng: () => number };
};

type GmpSelectEvent = {
  placePrediction: { toPlace: () => PlaceResult };
};

type PlaceAutocompleteElement = HTMLElement & {
  value: string;
  addEventListener(tipo: 'input', listener: () => void): void;
  addEventListener(tipo: 'gmp-select', listener: (evento: GmpSelectEvent) => void): void;
};

type GoogleMapsWindow = {
  google?: {
    maps?: {
      importLibrary: (
        libreria: string,
      ) => Promise<{ PlaceAutocompleteElement: new (opciones: { includedRegionCodes: string[] }) => PlaceAutocompleteElement }>;
    };
  };
};

export function MapsAutocomplete({ label, value, onChange, onSelect, error }: MapsAutocompleteProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [disponible, setDisponible] = useState<boolean | null>(null);
  const { modo } = useTema();

  // El widget de Google es un web component con su propio shadow DOM: solo respeta colorScheme /
  // color-primary si se los pasamos explícitamente, no hereda el tema del resto del CRM.
  useEffect(() => {
    const elemento = containerRef.current?.firstElementChild as HTMLElement | undefined;
    if (elemento) elemento.style.colorScheme = modo === 'oscuro' ? 'dark' : 'light';
  }, [modo]);

  useEffect(() => {
    let cancelado = false;

    async function montar() {
      const google = (window as unknown as GoogleMapsWindow).google;
      if (!google?.maps?.importLibrary) {
        setDisponible(false);
        return;
      }
      try {
        const { PlaceAutocompleteElement } = await google.maps.importLibrary('places');
        if (cancelado || !containerRef.current) return;

        const elemento = new PlaceAutocompleteElement({ includedRegionCodes: ['es', 'fr'] });
        elemento.style.width = '100%';
        elemento.style.colorScheme = modo === 'oscuro' ? 'dark' : 'light';
        elemento.style.setProperty('--gmp-mat-color-primary', '#1a5c38');
        elemento.value = value;
        containerRef.current.innerHTML = '';
        containerRef.current.appendChild(elemento);

        elemento.addEventListener('input', () => {
          onChange(elemento.value ?? '');
        });

        elemento.addEventListener('gmp-select', async (evento: GmpSelectEvent) => {
          const place = evento.placePrediction.toPlace();
          await place.fetchFields({ fields: ['formattedAddress', 'addressComponents', 'location'] });
          const country = place.addressComponents?.find((c) => c.types.includes('country'))?.shortText;
          // formattedAddress devuelve el nombre del país en el idioma del navegador (ej. "Francia"
          // en vez de "France") — el idioma de la sesión de Maps es el mismo para todos los países,
          // así que Google no puede darnos cada uno en su propio idioma. Se sustituye el último
          // tramo (el país, siempre al final en formattedAddress) por su nombre nativo.
          const paisNativo = country === 'FR' ? 'France' : country === 'ES' ? 'España' : null;
          let direccion = place.formattedAddress ?? '';
          if (paisNativo) {
            const partes = direccion.split(', ');
            partes[partes.length - 1] = paisNativo;
            direccion = partes.join(', ');
          }
          onChange(direccion);
          onSelect({
            direccion,
            lat: place.location?.lat() ?? null,
            lng: place.location?.lng() ?? null,
            pais: country === 'ES' ? 'España' : country === 'FR' ? 'Francia' : '',
          });
        });

        setDisponible(true);
      } catch {
        if (!cancelado) setDisponible(false);
      }
    }

    montar();
    return () => {
      cancelado = true;
    };
    // Se monta una sola vez a propósito: el elemento nativo de Google Maps se crea aquí y los
    // listeners capturan value/onChange/onSelect/modo de ese momento. Incluirlos en las deps
    // recrearía el elemento (y perdería el foco) en cada tecleo, ya que onChange/onSelect suelen
    // ser funciones inline inestables en el formulario padre.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (disponible === false) {
    return <Input label={label} required value={value} error={error} onChange={(e) => onChange(e.target.value)} />;
  }

  return (
    <div>
      {label && <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">{label}</label>}
      <div
        ref={containerRef}
        className={`w-full border rounded-sm ${error ? 'border-red-400' : 'border-gray-200'} ${
          disponible === null ? 'h-[34px] bg-gray-50 animate-pulse' : ''
        }`}
      />
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
      {disponible && !!value && <p className="text-xs text-gray-400 mt-1">Actual: {value}</p>}
    </div>
  );
}
