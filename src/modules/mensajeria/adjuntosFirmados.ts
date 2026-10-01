import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';

// El bucket mensajes_adjuntos es privado desde 2026-10-01 (antes era público: los adjuntos de la
// mensajería interna se podían abrir sin iniciar sesión). Los mensajes guardan la URL con formato
// público, así que de ella se saca la ruta y se pide una URL firmada de corta duración.
const MARCA = '/mensajes_adjuntos/';

function rutaDesdeUrl(url: string): string | null {
  const i = url.indexOf(MARCA);
  return i === -1 ? null : decodeURIComponent(url.slice(i + MARCA.length).split('?')[0]);
}

export function useUrlsFirmadas(urls: string[]) {
  return useQuery({
    queryKey: ['mensajes_adjuntos', 'firmadas', urls],
    enabled: urls.length > 0,
    staleTime: 30 * 60 * 1000,
    queryFn: async () => {
      const rutas = urls.map(rutaDesdeUrl);
      const validas = rutas.filter((r): r is string => !!r);
      const firmadas = new Map<string, string>();
      if (validas.length === 0) return firmadas;
      const { data, error } = await supabase.storage.from('mensajes_adjuntos').createSignedUrls(validas, 60 * 60);
      if (error) throw error;
      for (const d of data ?? []) if (d.path && d.signedUrl) firmadas.set(d.path, d.signedUrl);
      const resultado = new Map<string, string>();
      urls.forEach((u, i) => {
        const ruta = rutas[i];
        const firmada = ruta ? firmadas.get(ruta) : undefined;
        if (firmada) resultado.set(u, firmada);
      });
      return resultado;
    },
  });
}
