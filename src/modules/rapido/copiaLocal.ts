import { useEffect, useMemo } from 'react';

// Última copia descargada de una lista, guardada en el móvil para verla sin cobertura (mismo criterio
// que los datos legales de RapidoPage.tsx). Se usa solo cuando la consulta no trae datos: sin red,
// Tanstack Query deja la consulta en pausa (o en error), nunca devuelve nada.

type Copia<T> = { datos: T; guardado: string };

export function useCopiaLocal<T>(clave: string, datos: T | undefined): { datos: T | undefined; copiaDe: string | null } {
  useEffect(() => {
    if (datos === undefined) return;
    try {
      localStorage.setItem(clave, JSON.stringify({ datos, guardado: new Date().toISOString() } satisfies Copia<T>));
    } catch {
      // sin almacenamiento disponible — se sigue mostrando lo que llegó de Supabase
    }
  }, [clave, datos]);

  return useMemo(() => {
    if (datos !== undefined) return { datos, copiaDe: null };
    try {
      const guardado = localStorage.getItem(clave);
      if (!guardado) return { datos: undefined, copiaDe: null };
      const copia = JSON.parse(guardado) as Copia<T>;
      return { datos: copia.datos, copiaDe: copia.guardado };
    } catch {
      return { datos: undefined, copiaDe: null };
    }
  }, [clave, datos]);
}

export function textoCopia(iso: string): string {
  const d = new Date(iso);
  const hora = d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
  const esHoy = d.toDateString() === new Date().toDateString();
  return `Sin conexión — datos guardados ${esHoy ? 'hoy' : d.toLocaleDateString('es', { day: '2-digit', month: 'short' })} a las ${hora}`;
}
