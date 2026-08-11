import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type ColorTema = 'verde' | 'azul' | 'granate' | 'grafito';
export type Modo = 'claro' | 'oscuro';

const CLAVE_TEMA = 'crm_tema';
const CLAVE_MODO = 'crm_modo';

export const TEMAS: { id: ColorTema; label: string; swatch: string }[] = [
  { id: 'verde', label: 'Verde', swatch: '#1a5c38' },
  { id: 'azul', label: 'Azul', swatch: '#1e4d78' },
  { id: 'granate', label: 'Granate', swatch: '#7a2331' },
  { id: 'grafito', label: 'Grafito', swatch: '#3a4148' },
];

type TemaContextValue = {
  tema: ColorTema;
  modo: Modo;
  setTema: (t: ColorTema) => void;
  setModo: (m: Modo) => void;
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
  const [modo, setModo] = useState<Modo>(() => leerInicial(CLAVE_MODO, ['claro', 'oscuro'], 'claro'));

  useEffect(() => {
    document.documentElement.setAttribute('data-tema', tema);
    localStorage.setItem(CLAVE_TEMA, tema);
  }, [tema]);

  useEffect(() => {
    document.documentElement.setAttribute('data-modo', modo);
    localStorage.setItem(CLAVE_MODO, modo);
  }, [modo]);

  const value: TemaContextValue = {
    tema,
    modo,
    setTema,
    setModo,
    alternarModo: () => setModo((m) => (m === 'claro' ? 'oscuro' : 'claro')),
  };

  return <TemaContext.Provider value={value}>{children}</TemaContext.Provider>;
}

export function useTema() {
  const ctx = useContext(TemaContext);
  if (!ctx) throw new Error('useTema debe usarse dentro de TemaProvider');
  return ctx;
}
