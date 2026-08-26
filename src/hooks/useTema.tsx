import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type ColorTema = 'verde' | 'azul' | 'granate' | 'grafito';
// 'auto' es la PREFERENCIA guardada, nunca se escribe tal cual en el atributo data-modo del
// <html> (globals.css solo tiene reglas para [data-modo='oscuro'], no para 'auto') — para eso
// está `modoEfectivo` más abajo, que resuelve 'auto' a 'claro'/'oscuro' según la hora.
export type Modo = 'claro' | 'oscuro' | 'auto';

const CLAVE_TEMA = 'crm_tema';
const CLAVE_MODO = 'crm_modo';
const CLAVE_ZONA_HORARIA = 'crm_modo_ubicacion';

// Ubicaciones para calcular la salida/puesta de sol real del modo Automático — Hendaya es la
// base habitual de la empresa; Quito se añadió a petición de Gabriel para cuando está allí de
// forma excepcional. Mismas coordenadas de Hendaya que ya usa `notificar-visita` (OFICINA_FR).
export type ZonaHorariaAuto = 'hendaya' | 'quito';
export const ZONAS_HORARIAS_AUTO: Record<ZonaHorariaAuto, { label: string; lat: number; lng: number }> = {
  hendaya: { label: 'Hendaya (base habitual)', lat: 43.3546525, lng: -1.7747975 },
  quito: { label: 'Quito, Ecuador (excepcional)', lat: -0.1807, lng: -78.4678 },
};

// Salida/puesta de sol reales — fórmula solar estándar (NOAA/Meeus simplificada), sin llamar a
// ninguna API externa. Se ajusta sola por estación (día del año) y por ubicación (latitud/
// longitud), a diferencia de la franja horaria fija que había antes. Devuelve minutos UTC desde
// medianoche. zenith = 90.833° incluye la refracción atmosférica estándar y el radio aparente del
// sol — es el ángulo que se usa siempre para "salida/puesta" visual (no el paso por el horizonte
// geométrico).
function salidaPuestaSolUtcMin(lat: number, lng: number, fecha: Date): { salida: number; puesta: number } {
  const rad = Math.PI / 180;
  const inicioAnio = Date.UTC(fecha.getUTCFullYear(), 0, 1);
  const diaDelAnio = Math.floor((Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate()) - inicioAnio) / 86400000) + 1;

  const fracAnio = ((2 * Math.PI) / 365) * (diaDelAnio - 1 + (fecha.getUTCHours() - 12) / 24);
  const eqTiempo =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(fracAnio) -
      0.032077 * Math.sin(fracAnio) -
      0.014615 * Math.cos(2 * fracAnio) -
      0.040849 * Math.sin(2 * fracAnio));
  const declinacion =
    0.006918 -
    0.399912 * Math.cos(fracAnio) +
    0.070257 * Math.sin(fracAnio) -
    0.006758 * Math.cos(2 * fracAnio) +
    0.000907 * Math.sin(2 * fracAnio) -
    0.002697 * Math.cos(3 * fracAnio) +
    0.00148 * Math.sin(3 * fracAnio);

  const zenith = 90.833 * rad;
  const latRad = lat * rad;
  const cosHa = Math.cos(zenith) / (Math.cos(latRad) * Math.cos(declinacion)) - Math.tan(latRad) * Math.tan(declinacion);
  // Fuera de [-1, 1] = sol de medianoche o noche polar — no aplica en Hendaya/Quito, pero se
  // acota igualmente para no devolver NaN si algún día se añade otra ubicación.
  const anguloHorario = Math.acos(Math.min(1, Math.max(-1, cosHa))) / rad;

  const medioDiaSolarMin = 720 - 4 * lng - eqTiempo;
  return { salida: medioDiaSolarMin - 4 * anguloHorario, puesta: medioDiaSolarMin + 4 * anguloHorario };
}

function modoPorSol(ubicacion: ZonaHorariaAuto): 'claro' | 'oscuro' {
  const { lat, lng } = ZONAS_HORARIAS_AUTO[ubicacion];
  const ahora = new Date();
  const { salida, puesta } = salidaPuestaSolUtcMin(lat, lng, ahora);
  const minutoUtcActual = ahora.getUTCHours() * 60 + ahora.getUTCMinutes();
  return minutoUtcActual >= salida && minutoUtcActual < puesta ? 'claro' : 'oscuro';
}

export const TEMAS: { id: ColorTema; label: string; swatch: string }[] = [
  { id: 'verde', label: 'Verde', swatch: '#1a5c38' },
  { id: 'azul', label: 'Azul', swatch: '#1e4d78' },
  { id: 'granate', label: 'Granate', swatch: '#7a2331' },
  { id: 'grafito', label: 'Grafito', swatch: '#3a4148' },
];

type TemaContextValue = {
  tema: ColorTema;
  modo: Modo;
  // 'claro' | 'oscuro' real que se está aplicando ahora mismo — igual que `modo` salvo cuando
  // `modo === 'auto'`, que se resuelve según la salida/puesta de sol de `zonaHorariaAuto`. Úsalo
  // para decidir qué icono/estado mostrar.
  modoEfectivo: 'claro' | 'oscuro';
  // Solo importa cuando `modo === 'auto'` — qué coordenadas usar para calcular el sol.
  zonaHorariaAuto: ZonaHorariaAuto;
  setTema: (t: ColorTema) => void;
  setModo: (m: Modo) => void;
  setZonaHorariaAuto: (u: ZonaHorariaAuto) => void;
  alternarModo: () => void;
};

const TemaContext = createContext<TemaContextValue | null>(null);

function leerInicial<T extends string>(clave: string, valido: readonly T[], porDefecto: T): T {
  const guardado = localStorage.getItem(clave);
  return (valido as readonly string[]).includes(guardado ?? '') ? (guardado as T) : porDefecto;
}

export function TemaProvider({ children }: { children: ReactNode }) {
  const [tema, setTema] = useState<ColorTema>(() =>
    leerInicial(CLAVE_TEMA, ['verde', 'azul', 'granate', 'grafito'], 'verde'),
  );
  const [modo, setModo] = useState<Modo>(() => leerInicial(CLAVE_MODO, ['claro', 'oscuro', 'auto'], 'claro'));
  const [zonaHorariaAuto, setZonaHorariaAuto] = useState<ZonaHorariaAuto>(() =>
    leerInicial(CLAVE_ZONA_HORARIA, ['hendaya', 'quito'], 'hendaya'),
  );
  const [modoAutoActual, setModoAutoActual] = useState<'claro' | 'oscuro'>(() => modoPorSol(zonaHorariaAuto));

  useEffect(() => {
    document.documentElement.setAttribute('data-tema', tema);
    localStorage.setItem(CLAVE_TEMA, tema);
  }, [tema]);

  useEffect(() => {
    localStorage.setItem(CLAVE_ZONA_HORARIA, zonaHorariaAuto);
  }, [zonaHorariaAuto]);

  // Reevalúa la salida/puesta de sol cada 5 minutos mientras el modo sea "auto" (o cambie la
  // ubicación), para que pase de claro a oscuro (o al revés) sin recargar la página.
  useEffect(() => {
    if (modo !== 'auto') return;
    setModoAutoActual(modoPorSol(zonaHorariaAuto));
    const intervalo = setInterval(() => setModoAutoActual(modoPorSol(zonaHorariaAuto)), 5 * 60 * 1000);
    return () => clearInterval(intervalo);
  }, [modo, zonaHorariaAuto]);

  const modoEfectivo: 'claro' | 'oscuro' = modo === 'auto' ? modoAutoActual : modo;

  useEffect(() => {
    document.documentElement.setAttribute('data-modo', modoEfectivo);
    localStorage.setItem(CLAVE_MODO, modo);
  }, [modo, modoEfectivo]);

  const value: TemaContextValue = {
    tema,
    modo,
    modoEfectivo,
    zonaHorariaAuto,
    setTema,
    setModo,
    setZonaHorariaAuto,
    // Desde el toggle rápido de la Topbar siempre pasa a manual (nunca deja "auto" puesto) —
    // alterna sobre lo que se está viendo ahora mismo, sea cual sea el origen (auto o manual).
    alternarModo: () => setModo(modoEfectivo === 'claro' ? 'oscuro' : 'claro'),
  };

  return <TemaContext.Provider value={value}>{children}</TemaContext.Provider>;
}

export function useTema() {
  const ctx = useContext(TemaContext);
  if (!ctx) throw new Error('useTema debe usarse dentro de TemaProvider');
  return ctx;
}
